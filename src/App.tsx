/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, signOut, User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Database,
  LogOut,
  MailCheck,
  MessageSquare,
  MessageSquarePlus,
  Info,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  Smartphone,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { auth } from './firebase';
import { AdminPage } from './components/AdminPage';
import { AuthScreen } from './components/AuthScreen';
import { DataComposerModal } from './components/DataComposerModal';
import { DataPacketCard } from './components/DataPacketCard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NewChatModal } from './components/NewChatModal';
import { ProfileDrawer } from './components/ProfileDrawer';
import {
  deleteSavedContact,
  ensureDirectChat,
  ensureUserAccount,
  markChatAndMessagesRead,
  savePersonToContacts,
  sendChatMessage,
  subscribeToChatMessages,
  subscribeToContacts,
  subscribeToMyChats,
  toggleMessageStar,
  updateMyProfile,
} from './services/chatService';
import {
  AVATAR_PALETTE,
  ChatMessage,
  ContactEntry,
  DirectChat,
  PrivateUserInfo,
  PublicProfile,
  VALIDATION_RULES,
} from './types/chat';
import emptyChatImg from './assets/images/empty_chat_workspace_1792852724615.jpg';
import { uploadChatFile, formatFileSize } from './services/fileUploadService';

function formatShortTime(ts: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const date = ts.toDate();
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatBubbleTime(ts: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getPartnerFromChat(chat: DirectChat, myUid: string, contacts: ContactEntry[]) {
  const isMeOne = chat.userOneId === myUid;
  const partnerUid = isMeOne ? chat.userTwoId : chat.userOneId;
  const rawName = isMeOne ? chat.userTwoName : chat.userOneName;
  const partnerHandle = isMeOne ? chat.userTwoHandle : chat.userOneHandle;
  const partnerColor = isMeOne ? chat.userTwoColor : chat.userOneColor;
  const unreadCount = isMeOne ? chat.unreadForUserOne : chat.unreadForUserTwo;

  const saved = contacts.find((c) => c.contactUid === partnerUid);
  return {
    uid: partnerUid,
    displayName: saved?.nickname || rawName,
    rawName,
    handle: partnerHandle,
    avatarColor: partnerColor,
    unreadCount,
    isSavedContact: Boolean(saved),
  };
}

function getRoute(): string {
  if (typeof window === 'undefined') return '/';
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = new URLSearchParams(window.location.search);
  if (
    path === '/admin' ||
    path.startsWith('/admin') ||
    hash === '#/admin' ||
    hash === '#admin' ||
    search.get('page') === 'admin' ||
    search.get('route') === 'admin' ||
    search.get('admin') !== null
  ) {
    return '/admin';
  }
  return '/';
}

function WorkspaceApp() {
  const [currentRoute, setCurrentRoute] = useState<string>(getRoute);
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<PrivateUserInfo | null>(null);
  const [bootError, setBootError] = useState<Error | null>(null);

  const [activeAnnouncement, setActiveAnnouncement] = useState<{
    title: string;
    message: string;
    level: 'info' | 'warning' | 'critical';
  } | null>(() => {
    try {
      const stored = localStorage.getItem('pingreach_system_announcement');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentRoute(path);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getRoute());
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const [chats, setChats] = useState<DirectChat[]>([]);
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Sidebar & Search controls
  const [sidebarTab, setSidebarTab] = useState<'all' | 'unread' | 'contacts' | 'settings'>('all');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatQuery, setInChatQuery] = useState('');
  const [starredOnlyInChat, setStarredOnlyInChat] = useState(false);

  // Embedded Settings Tab State
  const [settingsName, setSettingsName] = useState('');
  const [settingsAbout, setSettingsAbout] = useState('');
  const [settingsColor, setSettingsColor] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Composer & Modals
  const [draftText, setDraftText] = useState('');
  const [replyTo, setReplyTo] = useState<{ text: string; senderName: string } | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showDataComposer, setShowDataComposer] = useState(false);
  const [copiedOwnId, setCopiedOwnId] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [emptyImgBroken, setEmptyImgBroken] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Track Firebase Auth state & provision split profile on login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setPrivateInfo(null);
        setNeedsVerification(false);
        setChats([]);
        setContacts([]);
        setSelectedChatId(null);
        setMessages([]);
        setAuthReady(true);
        return;
      }

      try {
        const res = await ensureUserAccount(user);
        setNeedsVerification(res.needsVerification);
        setProfile(res.profile);
        setPrivateInfo(res.privateInfo);
      } catch (err) {
        setBootError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  // 2. Attach real-time chats & contacts listeners once authenticated & verified
  useEffect(() => {
    if (!authReady || !profile || needsVerification) return;

    let unsubChats = () => {};
    let unsubContacts = () => {};

    try {
      unsubChats = subscribeToMyChats(profile.uid, (nextChats) => {
        setChats(nextChats);
      });
      unsubContacts = subscribeToContacts(profile.uid, (nextContacts) => {
        setContacts(nextContacts);
      });
    } catch (err) {
      setBootError(err instanceof Error ? err : new Error(String(err)));
    }

    return () => {
      unsubChats();
      unsubContacts();
    };
  }, [authReady, profile?.uid, needsVerification]);

  // 3. Attach real-time messages listener for the active conversation
  useEffect(() => {
    if (!selectedChatId || !profile || needsVerification) {
      setMessages([]);
      return;
    }

    const unsubMessages = subscribeToChatMessages(selectedChatId, profile.uid, (nextMessages) => {
      setMessages(nextMessages);
    });

    return () => unsubMessages();
  }, [selectedChatId, profile?.uid, needsVerification]);

  const activeChat = useMemo(
    () => chats.find((c) => c.chatId === selectedChatId) || null,
    [chats, selectedChatId]
  );

  // 4. Mark unread incoming messages as read when viewing activeChat
  useEffect(() => {
    if (!activeChat || !profile) return;
    markChatAndMessagesRead(activeChat, messages, profile.uid).catch((err) => {
      console.error('Failed marking read:', err);
    });
  }, [activeChat, messages, profile?.uid]);

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedChatId]);

  const filteredChats = useMemo(() => {
    if (!profile) return [];
    const q = sidebarSearch.trim().toLowerCase();

    return chats.filter((chat) => {
      const partner = getPartnerFromChat(chat, profile.uid, contacts);
      if (sidebarTab === 'unread' && partner.unreadCount === 0) {
        return false;
      }
      if (!q) return true;
      return (
        partner.displayName.toLowerCase().includes(q) ||
        partner.handle.toLowerCase().includes(q) ||
        chat.lastMessagePreview.toLowerCase().includes(q)
      );
    });
  }, [chats, contacts, profile, sidebarSearch, sidebarTab]);

  const filteredContacts = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        (c.nickname || c.contactName).toLowerCase().includes(q) ||
        c.contactHandle.toLowerCase().includes(q)
    );
  }, [contacts, sidebarSearch]);

  const visibleMessages = useMemo(() => {
    if (!profile) return [];
    const q = inChatQuery.trim().toLowerCase();

    return messages.filter((m) => {
      const isStarred =
        m.senderId === profile.uid ? m.starredBySender : m.starredByRecipient;
      if (starredOnlyInChat && !isStarred) return false;
      if (!q) return true;
      return (
        m.text.toLowerCase().includes(q) ||
        (m.dataPacket?.title.toLowerCase().includes(q) ?? false) ||
        (m.dataPacket?.payloadBody?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [messages, inChatQuery, starredOnlyInChat, profile]);

  const handleStartChatWithPerson = async (person: {
    uid: string;
    handle: string;
    displayName: string;
    avatarColor: string;
  }) => {
    if (!profile) return;
    const chat = await ensureDirectChat(profile, person);
    setSelectedChatId(chat.chatId);
    setSidebarTab('all');
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeChat || !profile || !draftText.trim() || sendingMessage) return;

    const textToSend = draftText;
    const replySnapshot = replyTo;
    setDraftText('');
    setReplyTo(null);
    setSendingMessage(true);

    // Keep mobile keyboard open & focused immediately without dismissing
    chatInputRef.current?.focus();

    try {
      await sendChatMessage({
        chat: activeChat,
        me: profile,
        kind: 'text',
        text: textToSend,
        replyTo: replySnapshot,
      });
    } finally {
      setSendingMessage(false);
      // Ensure focus remains intact after async completion
      chatInputRef.current?.focus();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !profile) return;
    e.target.value = '';

    setUploadingFile(true);
    try {
      const downloadUrl = await uploadChatFile(file, activeChat.chatId);
      const mime = file.type || '';
      const fname = file.name.toLowerCase();
      const isImg = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(fname);
      const isVid = mime.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(fname);
      const isAud = mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(fname);
      const category = isImg ? 'Image' : isVid ? 'Video' : isAud ? 'Audio' : 'File';

      await sendChatMessage({
        chat: activeChat,
        me: profile,
        kind: 'file_packet',
        text: `[${category}] ${file.name}`,
        dataPacket: {
          title: file.name.slice(0, VALIDATION_RULES.PACKET_TITLE_MAX),
          category,
          fileName: file.name.slice(0, VALIDATION_RULES.PACKET_FILENAME_MAX),
          fileMimeType: (file.type || 'application/octet-stream').slice(
            0,
            VALIDATION_RULES.PACKET_MIMETYPE_MAX
          ),
          fieldOneLabel: 'File URL',
          fieldOneValue: downloadUrl.slice(0, VALIDATION_RULES.PACKET_VALUE_MAX),
          fieldTwoLabel: 'Size',
          fieldTwoValue: formatFileSize(file.size),
        },
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'File upload failed. Please try again.');
    } finally {
      setUploadingFile(false);
      chatInputRef.current?.focus();
    }
  };

  const handleCopyConnectCard = async () => {
    if (!profile || !privateInfo) return;
    try {
      await navigator.clipboard.writeText(
        `Message me on WhatsConnect: @${profile.handle} or ${privateInfo.email}`
      );
      setCopiedOwnId(true);
      window.setTimeout(() => setCopiedOwnId(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  useEffect(() => {
    if (profile) {
      setSettingsName(profile.displayName);
      setSettingsAbout(profile.about);
      setSettingsColor(profile.avatarColor);
    }
  }, [profile]);

  const handleSaveSidebarSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !privateInfo || !settingsName.trim() || settingsSaving) return;
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsNotice(false);

    const cleanColor = settingsColor || profile.avatarColor;
    try {
      await updateMyProfile({
        uid: profile.uid,
        handle: profile.handle,
        emailHash: privateInfo.emailHash,
        displayName: settingsName,
        about: settingsAbout,
        avatarColor: cleanColor,
        activeChats: chats,
      });

      setProfile({
        ...profile,
        displayName: settingsName.trim().slice(0, VALIDATION_RULES.DISPLAY_NAME_MAX),
        about: settingsAbout.trim().slice(0, VALIDATION_RULES.ABOUT_MAX),
        avatarColor: cleanColor,
      });
      setSettingsNotice(true);
      window.setTimeout(() => setSettingsNotice(false), 2500);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleQuickSavePartner = async () => {
    if (!activeChat || !profile) return;
    const partner = getPartnerFromChat(activeChat, profile.uid, contacts);
    await savePersonToContacts({
      ownerId: profile.uid,
      person: {
        uid: partner.uid,
        handle: partner.handle,
        displayName: partner.rawName,
        about: 'Connected on WhatsConnect',
        avatarColor: partner.avatarColor,
        createdAt: null,
        updatedAt: null,
      },
      nickname: '',
    });
  };

  // Priority Route: /admin (accessible with passcode admin@123)
  if (currentRoute === '/admin') {
    return (
      <AdminPage
        onNavigateHome={() => navigateTo('/')}
        currentUser={profile}
        onSelectUserForChat={async (user) => {
          navigateTo('/');
          if (profile) {
            await handleStartChatWithPerson(user);
          }
        }}
      />
    );
  }

  // Rethrow fatal Firestore errors inside render for main workspace
  if (bootError) {
    throw bootError;
  }

  // Loading Skeleton State
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-xl p-8 space-y-4">
          <div className="h-5 w-40 bg-neutral-200 rounded animate-pulse" />
          <div className="h-3.5 w-64 bg-neutral-100 rounded animate-pulse" />
          <div className="pt-2 space-y-2.5">
            <div className="h-11 bg-neutral-100 rounded-lg animate-pulse" />
            <div className="h-11 bg-neutral-100 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated -> Google / Account Creation Screen
  if (!firebaseUser) {
    return <AuthScreen onOpenAdmin={() => navigateTo('/admin')} />;
  }

  // Email verification required (if user signed up via Email/Password instead of Google)
  if (needsVerification) {
    return (
      <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl p-8 space-y-5">
          <div className="w-11 h-11 rounded-lg bg-[#E6F3F0] text-[#008069] flex items-center justify-center">
            <MailCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-[#111B21]">Verify your email address</h1>
            <p className="text-sm text-neutral-600 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-semibold text-[#111B21]">{firebaseUser.email}</span>. Click the
              link in your inbox, then refresh below—or sign in with Google for instant verified
              access.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={async () => {
                await firebaseUser.reload();
                if (auth.currentUser?.emailVerified) {
                  const res = await ensureUserAccount(auth.currentUser);
                  setNeedsVerification(res.needsVerification);
                  setProfile(res.profile);
                  setPrivateInfo(res.privateInfo);
                }
              }}
              className="w-full py-2.5 px-4 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>I Have Verified — Continue</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await sendEmailVerification(firebaseUser);
                setVerificationSent(true);
              }}
              className="w-full py-2.5 px-4 bg-neutral-100 hover:bg-neutral-200 text-[#111B21] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {verificationSent ? 'Verification Email Sent' : 'Resend Verification Email'}
            </button>

            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full py-2 px-4 text-xs font-medium text-neutral-600 hover:text-red-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out and use Google instead</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile || !privateInfo) {
    return null;
  }

  const activePartner = activeChat
    ? getPartnerFromChat(activeChat, profile.uid, contacts)
    : null;

  const totalUnreadChats = chats.reduce((acc, chat) => {
    const count =
      chat.userOneId === profile.uid ? chat.unreadForUserOne : chat.unreadForUserTwo;
    return acc + (count > 0 ? 1 : 0);
  }, 0);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#EAE6DF] flex flex-col">
      {/* Top Emerald Accent Strip (WhatsApp Web signature framing) */}
      <div className="h-3 bg-[#008069] shrink-0 hidden lg:block" />

      {/* Global Broadcast Announcement (if published by Admin) */}
      {activeAnnouncement && (
        <div
          className={`shrink-0 px-4 py-2 text-xs flex items-center justify-between border-b ${
            activeAnnouncement.level === 'warning'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-900'
              : activeAnnouncement.level === 'critical'
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-900'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Info className="w-4 h-4 shrink-0 text-[#008069]" />
            <span className="font-semibold shrink-0">{activeAnnouncement.title}:</span>
            <span className="truncate">{activeAnnouncement.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveAnnouncement(null)}
            className="text-neutral-500 hover:text-neutral-800 p-1 cursor-pointer ml-2 shrink-0"
            title="Dismiss announcement"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 w-full max-w-[1560px] mx-auto bg-white lg:border-x lg:border-neutral-200 flex overflow-hidden">
        {/* LEFT PANE: Conversations & Contacts Sidebar */}
        <aside
          className={`w-full md:w-[370px] lg:w-[400px] shrink-0 border-r border-neutral-200 bg-white flex flex-col ${
            activeChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Sidebar Header */}
          <div className="px-4 py-3 bg-[#F0F2F5] border-b border-neutral-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSidebarTab(sidebarTab === 'settings' ? 'all' : 'settings')}
              className="flex items-center gap-3 min-w-0 text-left hover:opacity-90 transition-opacity cursor-pointer"
            >
              <div
                className="w-10 h-10 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                style={{ backgroundColor: profile.avatarColor }}
              >
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#111B21] truncate">{profile.displayName}</p>
                <p className="text-[11px] text-neutral-500 truncate">@{profile.handle}</p>
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowNewChatModal(true)}
                title="Start New Chat"
                className="px-3 py-2 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>New Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab(sidebarTab === 'settings' ? 'all' : 'settings')}
                title="Profile & Settings"
                aria-label="Profile and Settings"
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  sidebarTab === 'settings'
                    ? 'text-[#008069] bg-[#008069]/10'
                    : 'text-neutral-600 hover:text-[#111B21] hover:bg-neutral-200/70'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/admin')}
                title="Admin Portal (/admin)"
                aria-label="Admin Portal"
                className="p-2 text-neutral-600 hover:text-[#008069] hover:bg-neutral-200/70 rounded-lg transition-colors cursor-pointer"
              >
                <Shield className="w-4 h-4" />
              </button>
              <a
                href="https://github.com/Srijesh-K/PingReach/releases/tag/app-latest"
                target="_blank"
                rel="noopener noreferrer"
                title="Download Android App (APK)"
                aria-label="Download Android App (APK)"
                className="p-2 text-neutral-600 hover:text-[#008069] hover:bg-neutral-200/70 rounded-lg transition-colors cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Search & Interactive Segmented Filter */}
          <div className="p-3 border-b border-neutral-200 space-y-2.5 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search chats, @handles, or messages..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-[#F0F2F5] rounded-lg focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#008069]"
              />
              {sidebarSearch && (
                <button
                  type="button"
                  onClick={() => setSidebarSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 bg-[#F0F2F5] rounded-lg">
              <button
                type="button"
                onClick={() => setSidebarTab('all')}
                className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer text-center ${
                  sidebarTab === 'all'
                    ? 'bg-white text-[#111B21] shadow-xs'
                    : 'text-neutral-600 hover:text-[#111B21]'
                }`}
              >
                Chats ({chats.length})
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('unread')}
                className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap tabular-nums cursor-pointer text-center ${
                  sidebarTab === 'unread'
                    ? 'bg-white text-[#111B21] shadow-xs'
                    : 'text-neutral-600 hover:text-[#111B21]'
                }`}
              >
                Unread ({totalUnreadChats})
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('contacts')}
                className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap tabular-nums cursor-pointer text-center ${
                  sidebarTab === 'contacts'
                    ? 'bg-white text-[#111B21] shadow-xs'
                    : 'text-neutral-600 hover:text-[#111B21]'
                }`}
              >
                Contacts ({contacts.length})
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('settings')}
                className={`py-1.5 px-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer text-center ${
                  sidebarTab === 'settings'
                    ? 'bg-white text-[#111B21] shadow-xs'
                    : 'text-neutral-600 hover:text-[#111B21]'
                }`}
              >
                Settings
              </button>
            </div>
          </div>

          {/* Conversation, Contact List, or Settings Panel */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {sidebarTab === 'settings' ? (
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3.5 pb-3 border-b border-neutral-100">
                  <div
                    className="w-14 h-14 rounded-full text-white text-lg font-bold flex items-center justify-center shrink-0 shadow-sm"
                    style={{ backgroundColor: settingsColor || profile.avatarColor }}
                  >
                    {(settingsName || profile.displayName).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#111B21] truncate">{profile.displayName}</p>
                    <p className="text-xs text-neutral-500 truncate">{privateInfo.email}</p>
                    <button
                      type="button"
                      onClick={handleCopyConnectCard}
                      className="mt-1 text-xs font-semibold text-[#008069] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedOwnId ? <Check className="w-3 h-3 text-[#008069]" /> : <Copy className="w-3 h-3" />}
                      <span>@{profile.handle}</span>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSaveSidebarSettings} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Avatar Color
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {AVATAR_PALETTE.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setSettingsColor(hex)}
                          aria-label={`Select color ${hex}`}
                          className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                            (settingsColor || profile.avatarColor) === hex
                              ? 'ring-2 ring-offset-2 ring-[#008069] scale-110'
                              : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={VALIDATION_RULES.DISPLAY_NAME_MAX}
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      About / Status
                    </label>
                    <input
                      type="text"
                      maxLength={VALIDATION_RULES.ABOUT_MAX}
                      value={settingsAbout}
                      onChange={(e) => setSettingsAbout(e.target.value)}
                      placeholder="Available on PingReach"
                      className="w-full px-3 py-2 text-xs bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
                    />
                  </div>

                  {settingsError && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                      {settingsError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={settingsSaving || !settingsName.trim()}
                    className="w-full py-2.5 px-4 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60 shadow-xs"
                  >
                    {settingsNotice ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Changes Saved</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>{settingsSaving ? 'Saving...' : 'Save Profile Changes'}</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="pt-3 border-t border-neutral-200 space-y-2">
                  <button
                    type="button"
                    onClick={() => navigateTo('/admin')}
                    className="w-full py-2 px-3 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-xs font-medium rounded-lg border border-neutral-200 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5 text-[#008069]" />
                    <span>Open Admin Portal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="w-full py-2 px-3 bg-neutral-50 hover:bg-red-50 text-neutral-700 hover:text-red-700 text-xs font-medium rounded-lg border border-neutral-200 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : sidebarTab === 'contacts' ? (
              filteredContacts.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#111B21]">No saved contacts yet</p>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Add friends or teammates by their Google email address or @handle to message
                    them anytime.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewChatModal(true)}
                    className="px-4 py-2 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Find & Save Contact
                  </button>
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.contactUid}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-[#F5F6F6] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleStartChatWithPerson({
                          uid: contact.contactUid,
                          handle: contact.contactHandle,
                          displayName: contact.nickname || contact.contactName,
                          avatarColor: contact.avatarColor,
                        })
                      }
                      className="flex-1 flex items-center gap-3 min-w-0 text-left cursor-pointer"
                    >
                      <div
                        className="w-11 h-11 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                        style={{ backgroundColor: contact.avatarColor }}
                      >
                        {(contact.nickname || contact.contactName).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#111B21] truncate">
                          {contact.nickname || contact.contactName}
                        </p>
                        <p className="text-xs text-neutral-500 truncate">
                          @{contact.contactHandle} · {contact.about || 'Available'}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedContact(profile.uid, contact.contactUid)}
                      title="Remove contact"
                      aria-label="Remove contact"
                      className="p-2 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )
            ) : filteredChats.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-[#111B21]">
                  {sidebarTab === 'unread' ? 'All caught up' : 'No conversations yet'}
                </p>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {sidebarTab === 'unread'
                    ? 'You have zero unread messages across your conversations.'
                    : 'Start a 1-to-1 chat using another person’s Google email or @handle to send messages and data.'}
                </p>
                {sidebarTab !== 'unread' && (
                  <button
                    type="button"
                    onClick={() => setShowNewChatModal(true)}
                    className="px-4 py-2 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Start First Chat
                  </button>
                )}
              </div>
            ) : (
              filteredChats.map((chat) => {
                const partner = getPartnerFromChat(chat, profile.uid, contacts);
                const isSelected = chat.chatId === selectedChatId;
                const isLastFromMe = chat.lastSenderId === profile.uid;

                return (
                  <button
                    key={chat.chatId}
                    type="button"
                    onClick={() => {
                      setSelectedChatId(chat.chatId);
                      setReplyTo(null);
                      setInChatSearchOpen(false);
                      setInChatQuery('');
                    }}
                    className={`w-full px-4 py-3.5 flex items-center gap-3.5 text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#F0F2F5]' : 'hover:bg-[#F8F9FA]'
                    }`}
                  >
                    <div
                      className="w-11 h-11 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: partner.avatarColor }}
                    >
                      {partner.displayName.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-[#111B21] truncate">
                          {partner.displayName}
                        </p>
                        <span
                          className={`text-[11px] tabular-nums shrink-0 ${
                            partner.unreadCount > 0
                              ? 'text-[#008069] font-semibold'
                              : 'text-neutral-500'
                          }`}
                        >
                          {formatShortTime(chat.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-neutral-500 truncate">
                          {chat.lastMessagePreview
                            ? `${isLastFromMe ? 'You: ' : ''}${chat.lastMessagePreview}`
                            : `Connected with @${partner.handle}`}
                        </p>

                        {partner.unreadCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#00A884] text-white text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0">
                            {partner.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Compact Connect ID Footer */}
          <div className="px-4 py-3 bg-[#F8FAF9] border-t border-neutral-200 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-neutral-500 truncate">
                Your ID: <span className="font-mono text-[#111B21]">@{profile.handle}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyConnectCard}
              className="text-xs font-semibold text-[#008069] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedOwnId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedOwnId ? 'Copied' : 'Share ID'}</span>
            </button>
          </div>
        </aside>

        {/* RIGHT PANE: Active Conversation or Welcome Canvas */}
        <main
          className={`flex-1 flex flex-col bg-[#EFEAE2] min-w-0 ${
            activeChat ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!activeChat || !activePartner ? (
            /* Empty Workspace State - clicking anywhere directs directly to messages */
            <div
              onClick={() => {
                if (chats.length > 0) {
                  setSelectedChatId(chats[0].chatId);
                } else {
                  setShowNewChatModal(true);
                }
              }}
              title="Click anywhere to open your messages"
              className="flex-1 bg-[#F8FAF9] flex flex-col items-center justify-center p-8 text-center cursor-pointer select-none group"
            >
              <div
                className="max-w-md w-full space-y-6"
                onClick={(e) => {
                  // Keep child actions functioning while allowing empty card click
                }}
              >
                <div className="w-40 h-40 mx-auto rounded-2xl overflow-hidden border border-neutral-200 bg-white group-hover:shadow-md transition-all group-hover:scale-[1.02]">
                  {!emptyImgBroken ? (
                    <img
                      src={emptyChatImg}
                      alt="Minimalist linen correspondence card and matte green pen"
                      referrerPolicy="no-referrer"
                      onError={() => setEmptyImgBroken(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#E6F3F0] flex items-center justify-center">
                      <MessageSquarePlus className="w-10 h-10 text-[#008069]" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h2
                    className="text-2xl font-bold text-[#111B21] group-hover:text-[#008069] transition-colors"
                    style={{ textWrap: 'balance' } as React.CSSProperties}
                  >
                    PingReach Web
                  </h2>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {chats.length > 0
                      ? 'Click anywhere to jump directly into your latest conversation.'
                      : 'Send and receive real-time messages, media, and files between accounts.'}
                  </p>
                  <div className="pt-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#008069]/10 text-[#008069] group-hover:bg-[#008069] group-hover:text-white transition-all">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>
                        {chats.length > 0
                          ? `Open Messages (${chats.length} chat${chats.length === 1 ? '' : 's'})`
                          : 'Start Messaging'}
                      </span>
                    </span>
                  </div>
                </div>

                <div
                  className="p-4 rounded-xl bg-white border border-neutral-200 text-left space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs font-semibold text-[#111B21]">
                    How another person can message you:
                  </p>
                  <p className="text-xs text-neutral-600">
                    Share your handle{' '}
                    <span className="font-mono font-semibold text-[#008069]">
                      @{profile.handle}
                    </span>{' '}
                    or your Google email{' '}
                    <span className="font-mono text-[#111B21]">{privateInfo.email}</span>.
                  </p>
                </div>

                <div
                  className="flex items-center justify-center gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (chats.length > 0) {
                        setSelectedChatId(chats[0].chatId);
                      } else {
                        setShowNewChatModal(true);
                      }
                    }}
                    className="px-5 py-2.5 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-sm"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    <span>{chats.length > 0 ? 'Go to Messages' : 'Start New Chat'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyConnectCard}
                    className="px-4 py-2.5 bg-white border border-neutral-300 hover:border-[#008069] text-[#111B21] text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    {copiedOwnId ? (
                      <Check className="w-4 h-4 text-[#008069]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>{copiedOwnId ? 'Copied Connect ID' : 'Copy My Connect ID'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Active Chat Window */
            <>
              {/* Active Chat Header */}
              <div className="px-4 sm:px-6 py-3 bg-[#F0F2F5] border-b border-neutral-200 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedChatId(null)}
                    aria-label="Back to chat list"
                    className="md:hidden p-2 -ml-2 text-neutral-700 hover:bg-neutral-200 rounded-lg cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div
                    className="w-10 h-10 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                    style={{ backgroundColor: activePartner.avatarColor }}
                  >
                    {activePartner.displayName.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-[#111B21] truncate">
                      {activePartner.displayName}
                    </h2>
                    <p className="text-xs text-neutral-500 truncate">
                      @{activePartner.handle} · Direct Conversation
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!activePartner.isSavedContact && (
                    <button
                      type="button"
                      onClick={handleQuickSavePartner}
                      className="px-3 py-1.5 bg-white border border-neutral-300 hover:border-[#008069] text-xs font-semibold text-[#111B21] rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#008069]" />
                      <span className="hidden sm:inline">Save Contact</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setStarredOnlyInChat((prev) => !prev)}
                    title="Filter starred messages"
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                      starredOnlyInChat
                        ? 'bg-amber-100 text-amber-900'
                        : 'text-neutral-600 hover:bg-neutral-200/70'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Starred</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInChatSearchOpen((prev) => !prev);
                      if (inChatSearchOpen) setInChatQuery('');
                    }}
                    title="Search in conversation"
                    aria-label="Search in conversation"
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      inChatSearchOpen
                        ? 'bg-[#008069] text-white'
                        : 'text-neutral-600 hover:bg-neutral-200/70'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Optional In-Chat Search Bar */}
              {inChatSearchOpen && (
                <div className="px-4 sm:px-6 py-2.5 bg-white border-b border-neutral-200 flex items-center gap-2 shrink-0">
                  <Search className="w-4 h-4 text-neutral-400 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={inChatQuery}
                    onChange={(e) => setInChatQuery(e.target.value)}
                    placeholder="Filter messages or data packets in this chat..."
                    className="flex-1 text-xs bg-transparent focus:outline-none"
                  />
                  {inChatQuery && (
                    <button
                      type="button"
                      onClick={() => setInChatQuery('')}
                      className="text-xs text-neutral-500 hover:text-neutral-800 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-3">
                {visibleMessages.length === 0 ? (
                  <div className="max-w-md mx-auto my-12 p-5 rounded-xl bg-white/90 border border-neutral-200 text-center space-y-2">
                    <p className="text-xs font-semibold text-[#111B21]">
                      {inChatQuery || starredOnlyInChat
                        ? 'No matching messages in this conversation'
                        : `Start messaging ${activePartner.displayName}`}
                    </p>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      {inChatQuery || starredOnlyInChat
                        ? 'Try clearing your active filter above.'
                        : 'Type a message below or click Send Data to transfer structured records, JSON/code, or downloadable files.'}
                    </p>
                  </div>
                ) : (
                  visibleMessages.map((msg) => {
                    const isMine = msg.senderId === profile.uid;
                    const isStarred = isMine ? msg.starredBySender : msg.starredByRecipient;

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'} group`}
                      >
                        <div
                          className={`relative max-w-[88%] sm:max-w-[72%] rounded-xl px-3.5 py-2.5 border ${
                            isMine
                              ? 'bg-[#D9FDD3] border-[#B9EAB0] text-[#111B21]'
                              : 'bg-white border-neutral-200/90 text-[#111B21]'
                          }`}
                        >
                          {/* Quoted Reply Box (clean all-around border, zero thick left stripe) */}
                          {msg.replyToText && (
                            <div className="mb-2 px-2.5 py-1.5 rounded-md bg-black/5 border border-black/10 text-xs">
                              <p className="font-semibold text-[#008069] truncate">
                                {msg.replyToSender || 'Quoted Message'}
                              </p>
                              <p className="text-neutral-600 truncate">{msg.replyToText}</p>
                            </div>
                          )}

                          {/* Primary Text */}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {msg.text}
                          </p>

                          {/* Structured Data Packet Card */}
                          {msg.dataPacket && msg.kind !== 'text' && (
                            <DataPacketCard kind={msg.kind} packet={msg.dataPacket} />
                          )}

                          {/* Bubble Footer: Actions, Timestamp & Read Receipt */}
                          <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-neutral-500">
                            <button
                              type="button"
                              onClick={() =>
                                setReplyTo({
                                  text: msg.text,
                                  senderName: isMine ? 'You' : activePartner.displayName,
                                })
                              }
                              title="Reply"
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-[#111B21] inline-flex items-center gap-0.5 cursor-pointer"
                            >
                              <Reply className="w-3 h-3" />
                              <span>Reply</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleMessageStar(activeChat.chatId, msg, profile.uid)}
                              title={isStarred ? 'Unstar message' : 'Star message'}
                              className={`transition-opacity cursor-pointer ${
                                isStarred
                                  ? 'text-amber-600 opacity-100'
                                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber-600'
                              }`}
                            >
                              <Star className="w-3 h-3 fill-current" />
                            </button>

                            <span className="tabular-nums">{formatBubbleTime(msg.createdAt)}</span>

                            {isMine && (
                              <span
                                className="inline-flex items-center gap-0.5"
                                title={msg.deliveryStatus === 'read' ? 'Read' : 'Sent'}
                              >
                                {msg.deliveryStatus === 'read' ? (
                                  <>
                                    <CheckCheck className="w-3.5 h-3.5 text-[#0284C7]" />
                                    <span className="text-[10px] font-medium text-[#0284C7]">
                                      Read
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-neutral-500" />
                                    <span className="text-[10px]">Sent</span>
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Context Banner */}
              {replyTo && (
                <div className="px-4 sm:px-6 py-2 bg-[#F8FAF9] border-t border-neutral-200 flex items-center justify-between gap-3 shrink-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#008069]">
                      Replying to {replyTo.senderName}
                    </p>
                    <p className="text-xs text-neutral-600 truncate">{replyTo.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    aria-label="Cancel reply"
                    className="p-1 text-neutral-500 hover:text-neutral-900 rounded cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Message & Data Packet Composer Bar */}
              <form
                onSubmit={handleSendText}
                className="px-3 sm:px-5 py-3 bg-[#F0F2F5] border-t border-neutral-200 flex items-end gap-2.5 shrink-0"
              >
                {/* Hidden file input for all media and document types */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  onChange={handleFileSelected}
                  className="hidden"
                />

                {/* Attach Any File Button */}
                <button
                  type="button"
                  disabled={uploadingFile || sendingMessage}
                  onClick={() => fileInputRef.current?.click()}
                  title="Send any file (images, videos, audio, documents)"
                  className="p-2.5 bg-white border border-neutral-300 hover:border-[#008069] text-neutral-600 hover:text-[#008069] rounded-lg transition-colors inline-flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {uploadingFile ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#008069]" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDataComposer(true)}
                  title="Send structured data packet or file"
                  className="px-3 py-2.5 bg-white border border-neutral-300 hover:border-[#008069] text-[#111B21] text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Database className="w-4 h-4 text-[#008069]" />
                  <span className="hidden sm:inline">Send Data</span>
                  <Plus className="w-3.5 h-3.5 sm:hidden" />
                </button>

                <textarea
                  ref={chatInputRef}
                  rows={1}
                  maxLength={VALIDATION_RULES.MESSAGE_TEXT_MAX}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (draftText.trim()) {
                        handleSendText(e);
                      }
                    }
                  }}
                  placeholder={`Message ${activePartner.displayName}...`}
                  className="flex-1 max-h-32 px-4 py-2.5 text-sm bg-white border border-neutral-300 rounded-lg resize-none focus:outline-none focus:border-[#008069]"
                />

                <button
                  type="submit"
                  disabled={!draftText.trim() || sendingMessage}
                  onMouseDown={(e) => {
                    // Prevent button click from taking focus away from textarea
                    e.preventDefault();
                  }}
                  onTouchStart={(e) => {
                    // Prevent mobile keyboard from closing when tapping Send
                    e.preventDefault();
                    if (draftText.trim() && !sendingMessage) {
                      handleSendText();
                    }
                  }}
                  className="px-4 py-2.5 bg-[#008069] hover:bg-[#006D59] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            </>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      {showNewChatModal && (
        <NewChatModal
          me={profile}
          myEmail={privateInfo.email}
          contacts={contacts}
          onClose={() => setShowNewChatModal(false)}
          onStartChatWithPerson={handleStartChatWithPerson}
        />
      )}

      {showProfileDrawer && (
        <ProfileDrawer
          profile={profile}
          privateInfo={privateInfo}
          activeChats={chats}
          onProfileUpdated={(next) => setProfile(next)}
          onClose={() => setShowProfileDrawer(false)}
        />
      )}

      {showDataComposer && activeChat && activePartner && (
        <DataComposerModal
          partnerName={activePartner.displayName}
          onClose={() => setShowDataComposer(false)}
          onSendPacket={async ({ kind, text, dataPacket }) => {
            await sendChatMessage({
              chat: activeChat,
              me: profile,
              kind,
              text,
              replyTo,
              dataPacket,
            });
            setReplyTo(null);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceApp />
    </ErrorBoundary>
  );
}
