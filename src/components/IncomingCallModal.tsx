import React, { useEffect } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import type { CallRecord } from '../types/call';
import { soundService } from '../services/soundService';

interface IncomingCallModalProps {
  incomingCall: CallRecord;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  incomingCall,
  onAccept,
  onDecline,
}) => {
  useEffect(() => {
    // Play incoming chime ringtone
    soundService.playIncomingRing();

    // Auto-decline if unanswered after 45 seconds
    const timeout = setTimeout(() => {
      onDecline();
    }, 45000);

    return () => {
      clearTimeout(timeout);
      soundService.stopAll();
    };
  }, [onDecline]);

  const isVideo = incomingCall.callType === 'video';
  const initial = (incomingCall.callerName || 'U').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-center flex flex-col items-center">
        {/* Pulsing Avatar Container */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute w-28 h-28 rounded-full bg-emerald-500/20 animate-ping" />
          <div className="absolute w-24 h-24 rounded-full bg-emerald-500/30 animate-pulse" />
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg z-10"
            style={{ backgroundColor: incomingCall.callerAvatarColor || '#008069' }}
          >
            {initial}
          </div>
        </div>

        {/* Caller Info */}
        <h3 className="text-xl font-bold text-white tracking-tight mt-2">
          {incomingCall.callerName}
        </h3>
        <p className="text-xs text-neutral-400 mt-0.5">@{incomingCall.callerHandle}</p>

        {/* Call Type Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-3 rounded-full bg-neutral-800/80 border border-neutral-700/60 text-xs text-neutral-300 font-medium">
          {isVideo ? (
            <>
              <Video className="w-3.5 h-3.5 text-blue-400" />
              <span>Incoming Video Call</span>
            </>
          ) : (
            <>
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Incoming Voice Call</span>
            </>
          )}
        </div>

        <p className="text-xs text-neutral-500 mt-2">Ringing through Internet...</p>

        {/* Call Actions */}
        <div className="flex items-center justify-center gap-8 mt-8 w-full">
          {/* Decline */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onDecline}
              aria-label="Decline Call"
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-400"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <span className="text-[11px] font-medium text-neutral-400">Decline</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onAccept}
              aria-label="Accept Call"
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 animate-bounce"
            >
              {isVideo ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </button>
            <span className="text-[11px] font-medium text-emerald-400">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
};
