import { Timestamp } from 'firebase/firestore';

export type CallType = 'audio' | 'video';

export type CallStatus =
  | 'initiating'
  | 'ringing'
  | 'connected'
  | 'declined'
  | 'ended'
  | 'busy'
  | 'missed'
  | 'failed';

export type CallEndReason =
  | 'user_hungup'
  | 'user_declined'
  | 'busy'
  | 'timeout'
  | 'network_disconnected'
  | 'permission_denied'
  | 'failed';

export interface SdpPayload {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp: string;
}

export interface IceCandidateData {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
  createdAt?: Timestamp | null;
}

export interface CallRecord {
  id: string;
  chatId?: string;
  callerId: string;
  callerName: string;
  callerHandle: string;
  callerAvatarColor: string;
  receiverId: string;
  receiverName: string;
  receiverHandle: string;
  receiverAvatarColor: string;
  callType: CallType;
  status: CallStatus;
  offer?: SdpPayload | null;
  answer?: SdpPayload | null;
  endReason?: CallEndReason | null;
  startedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  durationSeconds?: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ActiveCallState {
  callId: string;
  chatId?: string;
  role: 'caller' | 'receiver';
  callType: CallType;
  status: CallStatus;
  remoteParticipant: {
    uid: string;
    name: string;
    handle: string;
    avatarColor: string;
  };
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isSpeakerOn: boolean;
  isMinimized: boolean;
  durationSeconds: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  hasVideoInputDevices?: boolean;
}
