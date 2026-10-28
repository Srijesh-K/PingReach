import React, { useState } from 'react';
import { Check, Loader2, Search, Users, X } from 'lucide-react';
import { AVATAR_PALETTE, ContactEntry, DirectoryEntry, PublicProfile, VALIDATION_RULES } from '../types/chat';
import { createGroupChat } from '../services/chatService';

interface NewGroupModalProps {
  me: PublicProfile;
  contacts: ContactEntry[];
  directory: DirectoryEntry[];
  onClose: () => void;
  onGroupCreated: (groupId: string) => void;
}

export function NewGroupModal({
  me,
  contacts,
  directory,
  onClose,
  onGroupCreated,
}: NewGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_PALETTE[0]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combine available contacts & directory entries excluding self
  const candidatesMap = new Map<string, { uid: string; displayName: string; handle: string; avatarColor?: string }>();
  
  contacts.forEach((c) => {
    if (c.contactUid !== me.uid) {
      candidatesMap.set(c.contactUid, {
        uid: c.contactUid,
        displayName: c.contactName,
        handle: c.contactHandle,
        avatarColor: c.avatarColor,
      });
    }
  });

  directory.forEach((d) => {
    if (d.uid !== me.uid && !candidatesMap.has(d.uid)) {
      candidatesMap.set(d.uid, {
        uid: d.uid,
        displayName: d.displayName,
        handle: d.handle,
        avatarColor: d.avatarColor,
      });
    }
  });

  const allCandidates = Array.from(candidatesMap.values());
  const filteredCandidates = allCandidates.filter(
    (c) =>
      c.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.handle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleMember = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim().slice(0, VALIDATION_RULES.GROUP_NAME_MAX);
    if (!cleanName) {
      setError('Please provide a group name.');
      return;
    }

    if (selectedUids.size === 0) {
      setError('Please select at least 1 friend or contact to add to the group.');
      return;
    }

    const selectedMembers = Array.from(selectedUids)
      .map((uid) => candidatesMap.get(uid))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

    setCreating(true);
    try {
      const groupId = await createGroupChat({
        name: cleanName,
        description: description.trim(),
        avatarColor,
        members: selectedMembers,
        me,
      });
      onGroupCreated(groupId);
      onClose();
    } catch (err) {
      console.error('Group creation failed:', err);
      const isPerm = err instanceof Error && err.message.includes('Missing or insufficient permissions');
      setError(
        isPerm
          ? 'Firestore Permission Denied: Please publish the updated firestore.rules in your Firebase Console so the groups collection is allowed.'
          : err instanceof Error
            ? err.message
            : 'Failed to create group. Please try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ backgroundColor: avatarColor }}
            >
              {name.trim() ? name.trim().charAt(0).toUpperCase() : <Users className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111B21]">Create New Group</h2>
              <p className="text-xs text-neutral-500">
                {selectedUids.size} member{selectedUids.size === 1 ? '' : 's'} selected
              </p>
            </div>
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

        {/* Content Form */}
        <form onSubmit={handleCreate} className="p-6 space-y-4 overflow-y-auto grow">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          {/* Group Name & Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Group Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Project Team, College Friends, Family"
                maxLength={VALIDATION_RULES.GROUP_NAME_MAX}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069] focus:ring-1 focus:ring-[#008069]"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Description / Purpose (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief group topic or guidelines"
                maxLength={VALIDATION_RULES.GROUP_DESC_MAX}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069] focus:ring-1 focus:ring-[#008069]"
              />
            </div>

            {/* Avatar Color Palette */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                Group Avatar Color
              </label>
              <div className="flex items-center gap-2">
                {AVATAR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAvatarColor(color)}
                    className="w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: color,
                      borderColor: avatarColor === color ? '#111B21' : 'transparent',
                      transform: avatarColor === color ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    {avatarColor === color && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-neutral-700">
                Add Participants ({allCandidates.length} available)
              </label>
              {selectedUids.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedUids(new Set())}
                  className="text-xs text-neutral-500 hover:text-red-600 cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Selected Chips */}
            {selectedUids.size > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-1.5 bg-[#F0F2F5] rounded-lg">
                {Array.from(selectedUids).map((uid) => {
                  const candidate = candidatesMap.get(uid);
                  if (!candidate) return null;
                  return (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-white text-[#111B21] border border-neutral-200 shadow-xs"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full inline-block"
                        style={{ backgroundColor: candidate.avatarColor || '#008069' }}
                      />
                      <span>{candidate.displayName}</span>
                      <button
                        type="button"
                        onClick={() => toggleMember(uid)}
                        className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Candidate Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search friends by name or handle..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
              />
            </div>

            {/* Candidates List */}
            <div className="border border-neutral-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-neutral-100">
              {filteredCandidates.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500">
                  {allCandidates.length === 0
                    ? 'No friends found yet. Add contacts first to invite them to groups.'
                    : 'No matches found.'}
                </div>
              ) : (
                filteredCandidates.map((candidate) => {
                  const isSelected = selectedUids.has(candidate.uid);
                  return (
                    <div
                      key={candidate.uid}
                      onClick={() => toggleMember(candidate.uid)}
                      className={`px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-50/60' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                          style={{ backgroundColor: candidate.avatarColor || '#008069' }}
                        >
                          {candidate.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-semibold text-[#111B21] truncate">
                            {candidate.displayName}
                          </p>
                          <p className="text-[11px] text-neutral-500 truncate">
                            @{candidate.handle}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-[#008069] border-[#008069] text-white'
                            : 'border-neutral-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim() || selectedUids.size === 0}
              className="px-5 py-2 text-xs font-medium text-white bg-[#008069] hover:bg-[#006e59] rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating group...</span>
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  <span>Create Group ({selectedUids.size + 1})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
