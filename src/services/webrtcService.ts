import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  type Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type {
  CallRecord,
  CallType,
  CallStatus,
  CallEndReason,
  ActiveCallState,
} from '../types/call';
import { soundService } from './soundService';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

type CallStateChangeHandler = (state: ActiveCallState | null) => void;

class WebRtcService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private activeCallDocUnsub: Unsubscribe | null = null;
  private activeCandidatesUnsub: Unsubscribe | null = null;
  private stateChangeListeners: Set<CallStateChangeHandler> = new Set();
  private durationTimer: number | null = null;
  private currentState: ActiveCallState | null = null;
  private callStartTimestamp: number | null = null;

  public subscribeCallState(handler: CallStateChangeHandler): () => void {
    this.stateChangeListeners.add(handler);
    handler(this.currentState);
    return () => {
      this.stateChangeListeners.delete(handler);
    };
  }

  private notifyState(state: ActiveCallState | null) {
    this.currentState = state;
    for (const handler of this.stateChangeListeners) {
      try {
        handler(state);
      } catch (err) {
        console.error('Error in call state subscriber:', err);
      }
    }
  }

  public getCurrentState(): ActiveCallState | null {
    return this.currentState;
  }

  /**
   * Request media stream from camera/microphone
   */
  private async getMediaStream(callType: CallType): Promise<MediaStream> {
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    if (callType === 'video') {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'user',
          },
        });
      } catch (videoError) {
        console.warn('Video device request failed, falling back to audio only:', videoError);
        return await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
      }
    }

    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: false,
    });
  }

  /**
   * Start an outgoing audio or video call
   */
  public async startCall(params: {
    receiverId: string;
    receiverName: string;
    receiverHandle: string;
    receiverAvatarColor: string;
    callType: CallType;
    chatId?: string;
  }): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be signed in to make a call.');
    }

    if (this.currentState) {
      throw new Error('Another call is already in progress.');
    }

    // Stop previous sounds
    soundService.stopAll();

    // 1. Acquire media stream
    const localStream = await this.getMediaStream(params.callType);
    this.localStream = localStream;
    this.remoteStream = new MediaStream();

    // 2. Create RTCPeerConnection
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnection = pc;

    // Attach local tracks
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Handle remote tracks
    pc.ontrack = (event) => {
      if (this.remoteStream && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!this.remoteStream?.getTracks().some((t) => t.id === track.id)) {
            this.remoteStream?.addTrack(track);
          }
        });
        if (this.currentState) {
          this.notifyState({
            ...this.currentState,
            remoteStream: this.remoteStream,
          });
        }
      }
    };

    // 3. Create Call Document Reference
    const callRef = doc(collection(db, 'calls'));
    const callId = callRef.id;

    // Set initial active call state
    this.notifyState({
      callId,
      chatId: params.chatId,
      role: 'caller',
      callType: params.callType,
      status: 'ringing',
      remoteParticipant: {
        uid: params.receiverId,
        name: params.receiverName,
        handle: params.receiverHandle,
        avatarColor: params.receiverAvatarColor,
      },
      localStream,
      remoteStream: this.remoteStream,
      isAudioMuted: false,
      isVideoMuted: params.callType === 'audio',
      isSpeakerOn: true,
      isMinimized: false,
      durationSeconds: 0,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      hasVideoInputDevices: params.callType === 'video',
    });

    // Play outgoing ringtone
    soundService.playOutgoingRing();

    // 4. Gather ICE candidates (buffer candidates until call doc is created in Firestore)
    const callerCandidatesCol = collection(db, 'calls', callId, 'callerCandidates');
    const pendingCallerCandidates: RTCIceCandidate[] = [];
    let isCallDocCreated = false;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (!isCallDocCreated) {
          pendingCallerCandidates.push(event.candidate);
          return;
        }
        addDoc(callerCandidatesCol, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          createdAt: serverTimestamp(),
        }).catch((err) => console.error('Failed to add caller ICE candidate:', err));
      }
    };

    // Connection state listeners
    this.setupConnectionMonitoring(pc, callId);

    // 5. Create SDP Offer
    const offerDescription = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: params.callType === 'video',
    });
    await pc.setLocalDescription(offerDescription);

    const callerProfileDoc = await getDoc(
      doc(db, 'users', currentUser.uid, 'public', 'profile')
    ).catch(() => null);
    const callerProfile = callerProfileDoc?.exists()
      ? callerProfileDoc.data()
      : null;

    const callPayload = {
      id: callId,
      chatId: params.chatId || null,
      callerId: currentUser.uid,
      callerName: callerProfile?.displayName || currentUser.displayName || 'User',
      callerHandle: callerProfile?.handle || 'user',
      callerAvatarColor: callerProfile?.avatarColor || '#008069',
      receiverId: params.receiverId,
      receiverName: params.receiverName,
      receiverHandle: params.receiverHandle,
      receiverAvatarColor: params.receiverAvatarColor,
      callType: params.callType,
      status: 'ringing' as CallStatus,
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(callRef, callPayload);
      isCallDocCreated = true;

      // Flush queued ICE candidates
      if (pendingCallerCandidates.length > 0) {
        for (const cand of pendingCallerCandidates) {
          addDoc(callerCandidatesCol, {
            candidate: cand.candidate,
            sdpMid: cand.sdpMid,
            sdpMLineIndex: cand.sdpMLineIndex,
            createdAt: serverTimestamp(),
          }).catch((err) => console.error('Failed to add queued caller ICE candidate:', err));
        }
        pendingCallerCandidates.length = 0;
      }
    } catch (createErr) {
      this.cleanup('failed');
      throw createErr;
    }

    // 6. Listen for answer and status changes on call doc
    this.activeCallDocUnsub = onSnapshot(callRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.status === 'declined' || data.status === 'ended' || data.status === 'busy') {
        soundService.stopAll();
        soundService.playHangupTone();
        this.cleanup('user_declined');
        return;
      }

      if (data.status === 'connected' && pc.signalingState !== 'stable') {
        if (data.answer && !pc.currentRemoteDescription) {
          soundService.stopAll();
          soundService.playConnectedChime();
          const answerDesc = new RTCSessionDescription(data.answer);
          await pc.setRemoteDescription(answerDesc);
          this.startCallDurationTimer();

          if (this.currentState) {
            this.notifyState({
              ...this.currentState,
              status: 'connected',
            });
          }
        }
      }
    }, (error) => {
      console.warn('Caller call doc listener error:', error);
    });

    // 7. Listen for receiver's ICE candidates
    const receiverCandidatesCol = collection(db, 'calls', callId, 'receiverCandidates');
    this.activeCandidatesUnsub = onSnapshot(receiverCandidatesCol, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const candidateData = change.doc.data();
          try {
            if (pc.remoteDescription) {
              const candidate = new RTCIceCandidate({
                candidate: candidateData.candidate,
                sdpMid: candidateData.sdpMid,
                sdpMLineIndex: candidateData.sdpMLineIndex,
              });
              await pc.addIceCandidate(candidate);
            }
          } catch (err) {
            console.error('Error adding receiver ICE candidate:', err);
          }
        }
      });
    }, (error) => {
      console.warn('Receiver candidates listener error:', error);
    });

    return callId;
  }

  /**
   * Accept an incoming call
   */
  public async acceptCall(callRecord: CallRecord): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('You must be signed in.');

    soundService.stopAll();

    const callId = callRecord.id;
    const callRef = doc(db, 'calls', callId);

    // 1. Acquire media stream
    const localStream = await this.getMediaStream(callRecord.callType);
    this.localStream = localStream;
    this.remoteStream = new MediaStream();

    // 2. Create RTCPeerConnection
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnection = pc;

    // Attach local tracks
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Handle remote tracks
    pc.ontrack = (event) => {
      if (this.remoteStream && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!this.remoteStream?.getTracks().some((t) => t.id === track.id)) {
            this.remoteStream?.addTrack(track);
          }
        });
        if (this.currentState) {
          this.notifyState({
            ...this.currentState,
            remoteStream: this.remoteStream,
          });
        }
      }
    };

    // Update active call state
    this.notifyState({
      callId,
      chatId: callRecord.chatId,
      role: 'receiver',
      callType: callRecord.callType,
      status: 'connected',
      remoteParticipant: {
        uid: callRecord.callerId,
        name: callRecord.callerName,
        handle: callRecord.callerHandle,
        avatarColor: callRecord.callerAvatarColor,
      },
      localStream,
      remoteStream: this.remoteStream,
      isAudioMuted: false,
      isVideoMuted: callRecord.callType === 'audio',
      isSpeakerOn: true,
      isMinimized: false,
      durationSeconds: 0,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      hasVideoInputDevices: callRecord.callType === 'video',
    });

    soundService.playConnectedChime();
    this.startCallDurationTimer();

    // 3. Gather ICE candidates (buffer candidates until answer is saved)
    const receiverCandidatesCol = collection(db, 'calls', callId, 'receiverCandidates');
    const pendingReceiverCandidates: RTCIceCandidate[] = [];
    let isAnswerSaved = false;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (!isAnswerSaved) {
          pendingReceiverCandidates.push(event.candidate);
          return;
        }
        addDoc(receiverCandidatesCol, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          createdAt: serverTimestamp(),
        }).catch((err) => console.error('Failed to add receiver ICE candidate:', err));
      }
    };

    this.setupConnectionMonitoring(pc, callId);

    // 4. Set Remote Description from Caller's Offer
    if (!callRecord.offer) {
      throw new Error('Call offer payload is missing.');
    }
    await pc.setRemoteDescription(new RTCSessionDescription(callRecord.offer));

    // 5. Create SDP Answer
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    // 6. Update Call Document in Firestore
    try {
      await updateDoc(callRef, {
        answer: {
          type: answerDescription.type,
          sdp: answerDescription.sdp,
        },
        status: 'connected' as CallStatus,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      isAnswerSaved = true;

      // Flush queued candidates
      if (pendingReceiverCandidates.length > 0) {
        for (const cand of pendingReceiverCandidates) {
          addDoc(receiverCandidatesCol, {
            candidate: cand.candidate,
            sdpMid: cand.sdpMid,
            sdpMLineIndex: cand.sdpMLineIndex,
            createdAt: serverTimestamp(),
          }).catch((err) => console.error('Failed to add queued receiver ICE candidate:', err));
        }
        pendingReceiverCandidates.length = 0;
      }
    } catch (updateErr) {
      this.cleanup('failed');
      throw updateErr;
    }

    // 7. Listen for caller candidates
    const callerCandidatesCol = collection(db, 'calls', callId, 'callerCandidates');
    this.activeCandidatesUnsub = onSnapshot(callerCandidatesCol, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const candidateData = change.doc.data();
          try {
            const candidate = new RTCIceCandidate({
              candidate: candidateData.candidate,
              sdpMid: candidateData.sdpMid,
              sdpMLineIndex: candidateData.sdpMLineIndex,
            });
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.error('Error adding caller ICE candidate:', err);
          }
        }
      });
    }, (error) => {
      console.warn('Caller candidates snapshot error:', error);
    });
    this.activeCallDocUnsub = onSnapshot(callRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.status === 'ended' || data.status === 'declined') {
        soundService.stopAll();
        soundService.playHangupTone();
        this.cleanup('user_hungup');
      }
    }, (error) => {
      console.warn('Active call doc snapshot error:', error);
    });
  }

  /**
   * Decline an incoming call
   */
  public async declineCall(callId: string, reason: CallEndReason = 'user_declined'): Promise<void> {
    soundService.stopAll();
    try {
      const callRef = doc(db, 'calls', callId);
      await updateDoc(callRef, {
        status: 'declined' as CallStatus,
        endReason: reason,
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Failed to update call status to declined:', err);
    } finally {
      this.cleanup(reason);
    }
  }

  /**
   * End an active or outgoing call
   */
  public async endCall(reason: CallEndReason = 'user_hungup'): Promise<void> {
    soundService.stopAll();
    soundService.playHangupTone();

    const callId = this.currentState?.callId;
    if (callId) {
      try {
        const callRef = doc(db, 'calls', callId);
        await updateDoc(callRef, {
          status: 'ended' as CallStatus,
          endReason: reason,
          durationSeconds: this.currentState?.durationSeconds || 0,
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Failed to update call to ended in Firestore:', err);
      }
    }

    this.cleanup(reason);
  }

  /**
   * Toggle local audio mute/unmute
   */
  public toggleMicrophone(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const isMuted = !audioTrack.enabled;
      if (this.currentState) {
        this.notifyState({
          ...this.currentState,
          isAudioMuted: isMuted,
        });
      }
      return !isMuted;
    }
    return false;
  }

  /**
   * Toggle local video camera on/off
   */
  public toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const isVideoMuted = !videoTrack.enabled;
      if (this.currentState) {
        this.notifyState({
          ...this.currentState,
          isVideoMuted,
        });
      }
      return !isVideoMuted;
    }
    return false;
  }

  /**
   * Toggle minimized floating call bubble mode
   */
  public toggleMinimized(): void {
    if (this.currentState) {
      this.notifyState({
        ...this.currentState,
        isMinimized: !this.currentState.isMinimized,
      });
    }
  }

  /**
   * Switch between front and back camera (mobile/responsive)
   */
  public async switchCamera(): Promise<void> {
    if (!this.localStream || !this.peerConnection) return;
    const currentTrack = this.localStream.getVideoTracks()[0];
    if (!currentTrack) return;

    try {
      const currentFacing = currentTrack.getSettings().facingMode;
      const newFacing = currentFacing === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
      });
      const newTrack = newStream.getVideoTracks()[0];

      const sender = this.peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');

      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
        currentTrack.stop();
        this.localStream.removeTrack(currentTrack);
        this.localStream.addTrack(newTrack);

        if (this.currentState) {
          this.notifyState({
            ...this.currentState,
            localStream: this.localStream,
          });
        }
      }
    } catch (err) {
      console.warn('Switch camera failed:', err);
    }
  }

  /**
   * Setup connection state monitoring
   */
  private setupConnectionMonitoring(pc: RTCPeerConnection, _callId: string) {
    pc.onconnectionstatechange = () => {
      if (this.currentState) {
        this.notifyState({
          ...this.currentState,
          connectionState: pc.connectionState,
        });
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn('WebRTC peer connection:', pc.connectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (this.currentState) {
        this.notifyState({
          ...this.currentState,
          iceConnectionState: pc.iceConnectionState,
        });
      }
    };
  }

  /**
   * Start call elapsed timer
   */
  private startCallDurationTimer() {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.callStartTimestamp = Date.now();
    this.durationTimer = window.setInterval(() => {
      if (this.currentState && this.callStartTimestamp) {
        const elapsed = Math.floor((Date.now() - this.callStartTimestamp) / 1000);
        this.notifyState({
          ...this.currentState,
          durationSeconds: elapsed,
        });
      }
    }, 1000);
  }

  /**
   * Full cleanup of WebRTC streams, peer connection, and listeners
   */
  private cleanup(_reason?: CallEndReason) {
    soundService.stopAll();

    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
    this.callStartTimestamp = null;

    if (this.activeCallDocUnsub) {
      this.activeCallDocUnsub();
      this.activeCallDocUnsub = null;
    }

    if (this.activeCandidatesUnsub) {
      this.activeCandidatesUnsub();
      this.activeCandidatesUnsub = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.remoteStream = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }

    this.notifyState(null);
  }

  /**
   * Listen for incoming calls targeted to the authenticated user
   */
  public listenForIncomingCalls(
    userId: string,
    onIncoming: (call: CallRecord) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', userId),
      where('status', '==', 'ringing')
    );

    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as CallRecord;
          data.id = change.doc.id;

          // Ignore stale calls (older than 90 seconds)
          if (data.createdAt && typeof data.createdAt.toMillis === 'function') {
            const ageMs = Date.now() - data.createdAt.toMillis();
            if (ageMs > 90000) return;
          }

          onIncoming(data);
        }
      });
    }, (error) => {
      console.warn('Incoming calls listener error:', error);
    });
  }
}

export const webrtcService = new WebRtcService();
