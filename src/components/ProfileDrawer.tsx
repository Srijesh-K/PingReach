import React, { useState } from 'react';
import { Check, Copy, LogOut, Save, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { updateMyProfile } from '../services/chatService';
import {
  AVATAR_PALETTE,
  DirectChat,
  PrivateUserInfo,
  PublicProfile,
  VALIDATION_RULES,
} from '../types/chat';

interface ProfileDrawerProps {
  profile: PublicProfile;
  privateInfo: PrivateUserInfo;
  activeChats: DirectChat[];
  onProfileUpdated: (next: PublicProfile) => void;
  onClose: () => void;
}

export function ProfileDrawer({
  profile,
  privateInfo,
  activeChats,
  onProfileUpdated,
  onClose,
}: ProfileDrawerProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [about, setAbout] = useState(profile.about);
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSavedNotice(false);

    try {
      await updateMyProfile({
        uid: profile.uid,
        handle: profile.handle,
        emailHash: privateInfo.emailHash,
        displayName,
        about,
        avatarColor,
        activeChats,
      });

      onProfileUpdated({
        ...profile,
        displayName: displayName.trim().slice(0, VALIDATION_RULES.DISPLAY_NAME_MAX),
        about: about.trim().slice(0, VALIDATION_RULES.ABOUT_MAX),
        avatarColor,
      });
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyHandle = async () => {
    try {
      await navigator.clipboard.writeText(`@${profile.handle}`);
      setCopiedHandle(true);
      window.setTimeout(() => setCopiedHandle(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex justify-end">
      <div className="bg-white w-full max-w-md h-full border-l border-neutral-200 flex flex-col justify-between overflow-y-auto">
        <div>
          <div className="px-6 py-4 bg-[#008069] text-white flex items-center justify-between">
            <h2 className="text-base font-bold">Profile & Account</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile panel"
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full text-white text-xl font-bold flex items-center justify-center shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {(displayName || profile.displayName).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#111B21] truncate">{profile.displayName}</p>
                <p className="text-xs text-neutral-500 truncate">{privateInfo.email}</p>
                <button
                  type="button"
                  onClick={handleCopyHandle}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#008069] hover:underline cursor-pointer"
                >
                  {copiedHandle ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied @{profile.handle}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>@{profile.handle}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Avatar Color
              </label>
              <div className="flex items-center gap-2.5 flex-wrap">
                {AVATAR_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setAvatarColor(hex)}
                    aria-label={`Select color ${hex}`}
                    className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                      avatarColor === hex ? 'ring-2 ring-offset-2 ring-[#111B21] scale-105' : ''
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                required
                maxLength={VALIDATION_RULES.DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                About / Status
              </label>
              <input
                type="text"
                maxLength={VALIDATION_RULES.ABOUT_MAX}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Available on WhatsConnect"
                className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
              />
            </div>

            {errorMessage && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !displayName.trim()}
              className="w-full py-2.5 px-4 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {savedNotice ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Profile Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="p-6 border-t border-neutral-200">
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full py-2.5 px-4 bg-neutral-100 hover:bg-red-50 text-neutral-800 hover:text-red-700 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
