import React, { useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Minimize2,
  Maximize2,
  SwitchCamera,
  Signal,
} from 'lucide-react';
import type { ActiveCallState } from '../types/call';
import { webrtcService } from '../services/webrtcService';

interface ActiveCallOverlayProps {
  callState: ActiveCallState;
  onEndCall: () => void;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({
  callState,
  onEndCall,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Attach local stream to local video element
  useEffect(() => {
    if (localVideoRef.current && callState.localStream) {
      localVideoRef.current.srcObject = callState.localStream;
    }
  }, [callState.localStream, callState.isVideoMuted]);

  // Attach remote stream to remote video & audio elements
  useEffect(() => {
    if (remoteVideoRef.current && callState.remoteStream) {
      remoteVideoRef.current.srcObject = callState.remoteStream;
    }
    if (remoteAudioRef.current && callState.remoteStream) {
      remoteAudioRef.current.srcObject = callState.remoteStream;
    }
  }, [callState.remoteStream]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isVideoCall = callState.callType === 'video';
  const isConnected = callState.status === 'connected';
  const initial = (callState.remoteParticipant.name || 'U').charAt(0).toUpperCase();

  // Hidden remote audio element to ensure audio always plays
  const audioPlayback = (
    <audio
      ref={remoteAudioRef}
      autoPlay
      playsInline
      className="hidden"
    />
  );

  // Minimized floating pill mode
  if (callState.isMinimized) {
    return (
      <div className="fixed bottom-20 right-6 z-50 flex items-center gap-3 p-3 bg-neutral-900/95 backdrop-blur-md border border-neutral-700/80 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5">
        {audioPlayback}

        {/* Remote Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow"
          style={{ backgroundColor: callState.remoteParticipant.avatarColor || '#008069' }}
        >
          {initial}
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold text-white max-w-[120px] truncate">
            {callState.remoteParticipant.name}
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">
            {isConnected ? formatDuration(callState.durationSeconds) : 'Ringing...'}
          </span>
        </div>

        {/* Quick controls */}
        <div className="flex items-center gap-1.5 ml-2">
          <button
            onClick={() => webrtcService.toggleMicrophone()}
            className={`p-2 rounded-full cursor-pointer transition ${
              callState.isAudioMuted
                ? 'bg-rose-500/20 text-rose-400'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
            title={callState.isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {callState.isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={() => webrtcService.toggleMinimized()}
            className="p-2 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 cursor-pointer transition"
            title="Maximize call"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={onEndCall}
            className="p-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition shadow-md shadow-rose-600/30"
            title="End call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Full Screen / Expanded View
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white select-none animate-in fade-in duration-200">
      {audioPlayback}

      {/* Top Header Bar */}
      <div className="flex items-center justify-between p-4 md:p-6 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow"
            style={{ backgroundColor: callState.remoteParticipant.avatarColor || '#008069' }}
          >
            {initial}
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">
              {callState.remoteParticipant.name}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-neutral-400">
              <Signal className="w-3 h-3 text-emerald-400" />
              <span>
                {isConnected
                  ? formatDuration(callState.durationSeconds)
                  : callState.status === 'ringing'
                  ? 'Calling through Internet...'
                  : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => webrtcService.toggleMinimized()}
            className="p-2.5 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer backdrop-blur"
            title="Minimize call"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Main Stage */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {isVideoCall ? (
          <div className="relative w-full h-full flex items-center justify-center bg-neutral-900">
            {/* Remote Video Stream */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover md:object-contain"
            />

            {/* Fallback if remote video is not streaming yet or audio only */}
            {(!isConnected || !callState.remoteStream?.getVideoTracks().length) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/90 z-10">
                <div className="relative flex items-center justify-center mb-4">
                  <div className="w-24 h-24 rounded-full bg-emerald-500/20 animate-ping absolute" />
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-xl z-10"
                    style={{ backgroundColor: callState.remoteParticipant.avatarColor || '#008069' }}
                  >
                    {initial}
                  </div>
                </div>
                <h3 className="text-lg font-semibold">{callState.remoteParticipant.name}</h3>
                <p className="text-sm text-neutral-400 mt-1">
                  {isConnected ? 'Video paused or audio only' : 'Connecting video feed...'}
                </p>
              </div>
            )}

            {/* Local Video Pip Preview */}
            <div className="absolute top-4 right-4 md:top-6 md:right-6 w-32 h-44 sm:w-40 sm:h-56 rounded-2xl overflow-hidden border-2 border-neutral-700/80 shadow-2xl bg-black z-20">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] ${
                  callState.isVideoMuted ? 'hidden' : 'block'
                }`}
              />
              {callState.isVideoMuted && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-800 text-neutral-400 p-2 text-center">
                  <VideoOff className="w-6 h-6 mb-1 text-neutral-500" />
                  <span className="text-[10px]">Camera Off</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Audio Call Presentation */
          <div className="flex flex-col items-center justify-center text-center p-6 max-w-sm">
            <div className="relative my-8 flex items-center justify-center">
              {isConnected && (
                <>
                  <div className="w-44 h-44 rounded-full bg-emerald-500/10 animate-ping absolute" />
                  <div className="w-36 h-36 rounded-full bg-emerald-500/20 animate-pulse absolute" />
                </>
              )}
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center text-white font-bold text-4xl shadow-2xl z-10 border-4 border-neutral-800"
                style={{ backgroundColor: callState.remoteParticipant.avatarColor || '#008069' }}
              >
                {initial}
              </div>
            </div>

            <h3 className="text-2xl font-bold tracking-tight text-white mt-2">
              {callState.remoteParticipant.name}
            </h3>
            <p className="text-sm text-neutral-400 mt-1">@{callState.remoteParticipant.handle}</p>

            <div className="mt-4 px-4 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-emerald-400 font-mono tracking-wider">
              {isConnected ? formatDuration(callState.durationSeconds) : 'Calling over Internet...'}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Control Bar */}
      <div className="p-6 pb-8 flex items-center justify-center gap-4 md:gap-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20">
        {/* Toggle Audio Mute */}
        <button
          onClick={() => webrtcService.toggleMicrophone()}
          aria-label={callState.isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={`w-13 h-13 rounded-full flex items-center justify-center cursor-pointer transition shadow-lg ${
            callState.isAudioMuted
              ? 'bg-rose-600/90 hover:bg-rose-600 text-white'
              : 'bg-neutral-800 hover:bg-neutral-700 text-white'
          }`}
          title={callState.isAudioMuted ? 'Unmute mic' : 'Mute mic'}
        >
          {callState.isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Video On/Off */}
        <button
          onClick={() => webrtcService.toggleCamera()}
          aria-label={callState.isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
          className={`w-13 h-13 rounded-full flex items-center justify-center cursor-pointer transition shadow-lg ${
            callState.isVideoMuted
              ? 'bg-rose-600/90 hover:bg-rose-600 text-white'
              : 'bg-neutral-800 hover:bg-neutral-700 text-white'
          }`}
          title={callState.isVideoMuted ? 'Turn on video' : 'Turn off video'}
        >
          {callState.isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Switch Front/Rear Camera (if video active) */}
        {isVideoCall && !callState.isVideoMuted && (
          <button
            onClick={() => webrtcService.switchCamera()}
            aria-label="Switch camera"
            className="w-13 h-13 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center cursor-pointer transition shadow-lg"
            title="Switch camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        )}

        {/* End Call Button */}
        <button
          onClick={onEndCall}
          aria-label="End call"
          className="w-15 h-15 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center cursor-pointer transition shadow-xl shadow-rose-600/40"
          title="End call"
        >
          <PhoneOff className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
};
