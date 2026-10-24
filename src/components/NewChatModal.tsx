import React, { useState } from 'react';
import { Check, Copy, MessageSquarePlus, Search, UserPlus, X } from 'lucide-react';
import {
  lookupPersonByIdentifier,
  savePersonToContacts,
} from '../services/chatService';
import { ContactEntry, DirectoryEntry, PublicProfile } from '../types/chat';

interface NewChatModalProps {
  me: PublicProfile;
  myEmail: string;
  contacts: ContactEntry[];
  onClose: () => void;
  onStartChatWithPerson: (person: {
    uid: string;
    handle: string;
    displayName: string;
    avatarColor: string;
  }) => Promise<void>;
}

export function NewChatModal({
  me,
  myEmail,
  contacts,
  onClose,
  onStartChatWithPerson,
}: NewChatModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [nickname, setNickname] = useState('');
  const [saveContactChecked, setSaveContactChecked] = useState(true);
  const [foundPerson, setFoundPerson] = useState<DirectoryEntry | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setFoundPerson(null);

    const queryText = identifier.trim();
    if (!queryText) return;

    setSearching(true);
    try {
      const result = await lookupPersonByIdentifier(queryText);
      if (!result) {
        setLookupError(
          'No registered WhatsConnect account found for that Google email or @handle. Ask them to sign in once first.'
        );
      } else if (result.uid === me.uid) {
        setLookupError('That is your own account. Enter another person’s Google email or @handle.');
      } else {
        setFoundPerson(result);
      }
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to look up user.');
    } finally {
      setSearching(false);
    }
  };

  const handleOpenConversation = async () => {
    if (!foundPerson) return;
    setStarting(true);
    setLookupError(null);
    try {
      if (saveContactChecked) {
        await savePersonToContacts({
          ownerId: me.uid,
          person: foundPerson,
          nickname: nickname.trim(),
        });
      }
      await onStartChatWithPerson({
        uid: foundPerson.uid,
        handle: foundPerson.handle,
        displayName: nickname.trim() || foundPerson.displayName,
        avatarColor: foundPerson.avatarColor,
      });
      onClose();
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Failed to open chat.');
    } finally {
      setStarting(false);
    }
  };

  const handleCopyMyConnectCard = async () => {
    const shareText = `Connect with me on WhatsConnect — search @${me.handle} or ${myEmail}`;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedCard(true);
      window.setTimeout(() => setCopiedCard(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#111B21]">New Conversation</h2>
            <p className="text-xs text-neutral-500">
              Find anyone by their Google email address or @handle
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Your Shareable Identity Box */}
          <div className="p-3.5 rounded-lg bg-[#F4F6F5] border border-neutral-200 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-neutral-500">Your Connect ID</p>
              <p className="text-xs font-semibold text-[#111B21] truncate">
                @{me.handle} · {myEmail}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyMyConnectCard}
              className="px-3 py-1.5 bg-white border border-neutral-300 hover:border-[#008069] text-xs font-semibold text-[#111B21] rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedCard ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#008069]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy ID</span>
                </>
              )}
            </button>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-2.5">
            <label className="block text-xs font-medium text-neutral-700">
              Recipient Google Email or @Handle
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="friend@gmail.com or @username"
                className="flex-1 px-3.5 py-2.5 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
              />
              <button
                type="submit"
                disabled={searching || !identifier.trim()}
                className="px-4 py-2.5 bg-[#111B21] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{searching ? 'Searching...' : 'Find'}</span>
              </button>
            </div>
          </form>

          {lookupError && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              {lookupError}
            </div>
          )}

          {foundPerson && (
            <div className="p-4 rounded-xl bg-[#F8FAF9] border border-[#008069]/30 space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0"
                  style={{ backgroundColor: foundPerson.avatarColor }}
                >
                  {foundPerson.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#111B21] truncate">
                    {foundPerson.displayName}
                  </p>
                  <p className="text-xs text-neutral-500 truncate">
                    @{foundPerson.handle} · {foundPerson.about || 'Available'}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-neutral-200">
                <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveContactChecked}
                    onChange={(e) => setSaveContactChecked(e.target.checked)}
                    className="rounded border-neutral-300 text-[#008069] focus:ring-[#008069]"
                  />
                  <span>Save to my contacts list</span>
                </label>

                {saveContactChecked && (
                  <input
                    type="text"
                    maxLength={60}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Custom contact nickname (optional)"
                    className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
                  />
                )}

                <button
                  type="button"
                  onClick={handleOpenConversation}
                  disabled={starting}
                  className="w-full py-2.5 px-4 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  <span>{starting ? 'Opening Chat...' : `Message ${foundPerson.displayName}`}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Saved Contacts List */}
          {contacts.length > 0 && (
            <div className="pt-2 border-t border-neutral-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
                <UserPlus className="w-3.5 h-3.5 text-[#008069]" />
                <span>Saved Contacts ({contacts.length})</span>
              </div>
              <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg max-h-48 overflow-y-auto">
                {contacts.map((c) => (
                  <button
                    key={c.contactUid}
                    type="button"
                    onClick={async () => {
                      await onStartChatWithPerson({
                        uid: c.contactUid,
                        handle: c.contactHandle,
                        displayName: c.nickname || c.contactName,
                        avatarColor: c.avatarColor,
                      });
                      onClose();
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-3 hover:bg-[#F4F6F5] transition-colors text-left cursor-pointer"
                  >
                    <div
                      className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: c.avatarColor }}
                    >
                      {(c.nickname || c.contactName).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#111B21] truncate">
                        {c.nickname || c.contactName}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">@{c.contactHandle}</p>
                    </div>
                    <span className="text-xs font-medium text-[#008069] whitespace-nowrap">
                      Open Chat
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
