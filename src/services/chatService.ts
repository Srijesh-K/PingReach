import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AVATAR_PALETTE,
  ChatMessage,
  ContactEntry,
  DataPacket,
  DirectChat,
  DirectoryEntry,
  MessageKind,
  PrivateUserInfo,
  PublicProfile,
  VALIDATION_RULES,
} from '../types/chat';

export async function sha256Hex(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function deriveBaseHandle(displayName: string, email: string, uid: string): string {
  const source = (email.split('@')[0] || displayName || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const uidSuffix = uid
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 4);

  const core = source.length >= 3 ? source.slice(0, 30) : `member_${uidSuffix || '01'}`;
  return core.slice(0, VALIDATION_RULES.HANDLE_MAX_LENGTH);
}

function pickColorForUid(uid: string): string {
  let sum = 0;
  for (let i = 0; i < uid.length; i += 1) {
    sum = (sum + uid.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[sum];
}

export function buildCanonicalChatId(uidA: string, uidB: string): {
  chatId: string;
  userOneId: string;
  userTwoId: string;
} {
  // Standard ASCII code-point '<' matches Firestore CEL string '<'
  const userOneId = uidA < uidB ? uidA : uidB;
  const userTwoId = uidA < uidB ? uidB : uidA;
  return {
    chatId: `${userOneId}__${userTwoId}`,
    userOneId,
    userTwoId,
  };
}

export async function ensureUserAccount(user: User): Promise<{
  profile: PublicProfile | null;
  privateInfo: PrivateUserInfo | null;
  needsVerification: boolean;
}> {
  if (!user.emailVerified || !user.email) {
    return {
      profile: null,
      privateInfo: null,
      needsVerification: true,
    };
  }

  const publicPath = `users/${user.uid}/public/profile`;
  const privatePath = `users/${user.uid}/private/info`;

  let publicSnap;
  let privateSnap;
  try {
    [publicSnap, privateSnap] = await Promise.all([
      getDoc(doc(db, 'users', user.uid, 'public', 'profile')),
      getDoc(doc(db, 'users', user.uid, 'private', 'info')),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }

  if (publicSnap.exists() && privateSnap.exists()) {
    return {
      profile: publicSnap.data() as PublicProfile,
      privateInfo: privateSnap.data() as PrivateUserInfo,
      needsVerification: false,
    };
  }

  const emailHash = await sha256Hex(user.email);
  const publicData = publicSnap.exists() ? (publicSnap.data() as PublicProfile) : null;
  const privateData = privateSnap.exists() ? (privateSnap.data() as PrivateUserInfo) : null;

  const rawName = user.displayName || user.email.split('@')[0] || 'WhatsConnect User';
  const displayName = publicData?.displayName || clampString(rawName, VALIDATION_RULES.DISPLAY_NAME_MAX) || 'User';
  const avatarColor = publicData?.avatarColor || pickColorForUid(user.uid);
  const about = publicData?.about || 'Available on WhatsConnect';

  // Ensure handle uniqueness via exact getDoc check
  let candidateHandle = publicData?.handle || deriveBaseHandle(displayName, user.email, user.uid);
  let existingHandleSnap;
  try {
    existingHandleSnap = await getDoc(doc(db, 'handles', candidateHandle));
    if (existingHandleSnap.exists() && existingHandleSnap.data()?.uid !== user.uid) {
      const suffix = user.uid
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 6);
      candidateHandle = `${candidateHandle.slice(0, 30)}_${suffix || '1'}`;
      existingHandleSnap = await getDoc(doc(db, 'handles', candidateHandle));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `handles/${candidateHandle}`);
  }

  let existingLookupSnap;
  try {
    existingLookupSnap = await getDoc(doc(db, 'lookupHashes', emailHash));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `lookupHashes/${emailHash}`);
  }

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    let writeCount = 0;

    if (!publicSnap.exists()) {
      batch.set(doc(db, 'users', user.uid, 'public', 'profile'), {
        uid: user.uid,
        displayName,
        handle: candidateHandle,
        about,
        avatarColor,
        createdAt: now,
        updatedAt: now,
      });
      writeCount += 1;
    }

    if (!privateSnap.exists()) {
      batch.set(doc(db, 'users', user.uid, 'private', 'info'), {
        uid: user.uid,
        email: user.email.slice(0, VALIDATION_RULES.EMAIL_MAX),
        emailHash,
        createdAt: now,
        updatedAt: now,
      });
      writeCount += 1;
    }

    if (!existingHandleSnap?.exists()) {
      batch.set(doc(db, 'handles', candidateHandle), {
        uid: user.uid,
        handle: candidateHandle,
        displayName,
        about,
        avatarColor,
        createdAt: now,
        updatedAt: now,
      });
      writeCount += 1;
    }

    if (!existingLookupSnap?.exists()) {
      batch.set(doc(db, 'lookupHashes', emailHash), {
        uid: user.uid,
        handle: candidateHandle,
        displayName,
        about,
        avatarColor,
        createdAt: now,
        updatedAt: now,
      });
      writeCount += 1;
    }

    if (writeCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, privatePath);
  }

  const nowTs = Timestamp.now();
  return {
    profile: {
      uid: user.uid,
      displayName,
      handle: candidateHandle,
      about,
      avatarColor,
      createdAt: publicData?.createdAt || nowTs,
      updatedAt: nowTs,
    },
    privateInfo: {
      uid: user.uid,
      email: user.email,
      emailHash,
      createdAt: privateData?.createdAt || nowTs,
      updatedAt: nowTs,
    },
    needsVerification: false,
  };
}

export async function updateMyProfile(params: {
  uid: string;
  handle: string;
  emailHash: string;
  displayName: string;
  about: string;
  avatarColor: string;
  activeChats: DirectChat[];
}): Promise<void> {
  const cleanName = clampString(params.displayName, VALIDATION_RULES.DISPLAY_NAME_MAX);
  const cleanAbout = params.about.trim().slice(0, VALIDATION_RULES.ABOUT_MAX);
  const cleanColor = VALIDATION_RULES.HEX_COLOR_PATTERN.test(params.avatarColor)
    ? params.avatarColor
    : AVATAR_PALETTE[0];

  if (!cleanName) {
    throw new Error('Display name cannot be empty.');
  }

  const path = `users/${params.uid}/public/profile`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.update(doc(db, 'users', params.uid, 'public', 'profile'), {
      displayName: cleanName,
      about: cleanAbout,
      avatarColor: cleanColor,
      updatedAt: now,
    });

    batch.update(doc(db, 'handles', params.handle), {
      displayName: cleanName,
      about: cleanAbout,
      avatarColor: cleanColor,
      updatedAt: now,
    });

    batch.update(doc(db, 'lookupHashes', params.emailHash), {
      displayName: cleanName,
      about: cleanAbout,
      avatarColor: cleanColor,
      updatedAt: now,
    });

    // Sync display name and avatar color in up to 25 recent direct chats
    params.activeChats.slice(0, 25).forEach((chat) => {
      const chatRef = doc(db, 'chats', chat.chatId);
      if (chat.userOneId === params.uid) {
        batch.update(chatRef, {
          userOneName: cleanName,
          userOneColor: cleanColor,
          updatedAt: now,
        });
      } else if (chat.userTwoId === params.uid) {
        batch.update(chatRef, {
          userTwoName: cleanName,
          userTwoColor: cleanColor,
          updatedAt: now,
        });
      }
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function lookupPersonByIdentifier(
  rawIdentifier: string
): Promise<DirectoryEntry | null> {
  const trimmed = rawIdentifier.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.includes('@') && trimmed.indexOf('@') > 0) {
    // Email lookup via privacy-preserving SHA-256 hash
    const emailHash = await sha256Hex(trimmed);
    const path = `lookupHashes/${emailHash}`;
    try {
      const snap = await getDoc(doc(db, 'lookupHashes', emailHash));
      return snap.exists() ? (snap.data() as DirectoryEntry) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  // Handle lookup (@handle or handle)
  const cleanHandle = trimmed.replace(/^@/, '');
  if (!VALIDATION_RULES.HANDLE_PATTERN.test(cleanHandle)) {
    return null;
  }

  const path = `handles/${cleanHandle}`;
  try {
    const snap = await getDoc(doc(db, 'handles', cleanHandle));
    return snap.exists() ? (snap.data() as DirectoryEntry) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function savePersonToContacts(params: {
  ownerId: string;
  person: DirectoryEntry;
  nickname: string;
}): Promise<void> {
  if (params.ownerId === params.person.uid) {
    throw new Error('You cannot add yourself as an external contact.');
  }

  const path = `users/${params.ownerId}/contacts/${params.person.uid}`;
  const cleanNickname = clampString(params.nickname, VALIDATION_RULES.NICKNAME_MAX);

  try {
    const existingSnap = await getDoc(
      doc(db, 'users', params.ownerId, 'contacts', params.person.uid)
    );
    const now = serverTimestamp();

    if (existingSnap.exists()) {
      await updateDoc(doc(db, 'users', params.ownerId, 'contacts', params.person.uid), {
        contactName: clampString(params.person.displayName, VALIDATION_RULES.DISPLAY_NAME_MAX),
        nickname: cleanNickname,
        avatarColor: params.person.avatarColor,
        about: params.person.about.slice(0, VALIDATION_RULES.ABOUT_MAX),
        updatedAt: now,
      });
    } else {
      await setDoc(doc(db, 'users', params.ownerId, 'contacts', params.person.uid), {
        ownerId: params.ownerId,
        contactUid: params.person.uid,
        contactHandle: params.person.handle,
        contactName: clampString(params.person.displayName, VALIDATION_RULES.DISPLAY_NAME_MAX),
        nickname: cleanNickname,
        avatarColor: params.person.avatarColor,
        about: params.person.about.slice(0, VALIDATION_RULES.ABOUT_MAX),
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSavedContact(ownerId: string, contactUid: string): Promise<void> {
  const path = `users/${ownerId}/contacts/${contactUid}`;
  try {
    await deleteDoc(doc(db, 'users', ownerId, 'contacts', contactUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToContacts(
  ownerId: string,
  onContacts: (contacts: ContactEntry[]) => void
): () => void {
  const path = `users/${ownerId}/contacts`;
  const q = query(collection(db, 'users', ownerId, 'contacts'), where('ownerId', '==', ownerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as ContactEntry);
      list.sort((a, b) =>
        (a.nickname || a.contactName).localeCompare(b.nickname || b.contactName)
      );
      onContacts(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function ensureDirectChat(
  me: PublicProfile,
  partner: {
    uid: string;
    handle: string;
    displayName: string;
    avatarColor: string;
  }
): Promise<DirectChat> {
  if (me.uid === partner.uid) {
    throw new Error('Select another person to start a conversation.');
  }

  const { chatId, userOneId, userTwoId } = buildCanonicalChatId(me.uid, partner.uid);
  const path = `chats/${chatId}`;
  const chatRef = doc(db, 'chats', chatId);

  try {
    const existingSnap = await getDoc(chatRef);
    if (existingSnap.exists()) {
      return existingSnap.data() as DirectChat;
    }

    const isMeOne = me.uid === userOneId;
    const now = serverTimestamp();

    const payload = {
      chatId,
      userOneId,
      userTwoId,
      userOneName: clampString(
        isMeOne ? me.displayName : partner.displayName,
        VALIDATION_RULES.DISPLAY_NAME_MAX
      ),
      userTwoName: clampString(
        isMeOne ? partner.displayName : me.displayName,
        VALIDATION_RULES.DISPLAY_NAME_MAX
      ),
      userOneHandle: isMeOne ? me.handle : partner.handle,
      userTwoHandle: isMeOne ? partner.handle : me.handle,
      userOneColor: isMeOne ? me.avatarColor : partner.avatarColor,
      userTwoColor: isMeOne ? partner.avatarColor : me.avatarColor,
      createdBy: me.uid,
      lastMessagePreview: '',
      lastMessageKind: 'none' as const,
      lastSenderId: me.uid,
      unreadForUserOne: 0,
      unreadForUserTwo: 0,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(chatRef, payload);

    const nowTs = Timestamp.now();
    return {
      ...payload,
      createdAt: nowTs,
      updatedAt: nowTs,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToMyChats(
  uid: string,
  onChats: (chats: DirectChat[]) => void
): () => void {
  const path = 'chats';
  const mapOne = new Map<string, DirectChat>();
  const mapTwo = new Map<string, DirectChat>();

  const emitMerged = () => {
    const merged = new Map<string, DirectChat>([...mapOne, ...mapTwo]);
    const list = Array.from(merged.values());
    list.sort((a, b) => {
      const aTime = a.updatedAt?.toMillis?.() ?? 0;
      const bTime = b.updatedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    onChats(list);
  };

  const qOne = query(collection(db, 'chats'), where('userOneId', '==', uid));
  const qTwo = query(collection(db, 'chats'), where('userTwoId', '==', uid));

  const unsubOne = onSnapshot(
    qOne,
    (snap) => {
      mapOne.clear();
      snap.docs.forEach((d) => {
        const data = d.data() as DirectChat;
        mapOne.set(data.chatId, data);
      });
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );

  const unsubTwo = onSnapshot(
    qTwo,
    (snap) => {
      mapTwo.clear();
      snap.docs.forEach((d) => {
        const data = d.data() as DirectChat;
        mapTwo.set(data.chatId, data);
      });
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );

  return () => {
    unsubOne();
    unsubTwo();
  };
}

export function subscribeToChatMessages(
  chatId: string,
  uid: string,
  onMessages: (messages: ChatMessage[]) => void
): () => void {
  const path = `chats/${chatId}/messages`;
  const sentMap = new Map<string, ChatMessage>();
  const receivedMap = new Map<string, ChatMessage>();

  const emitMerged = () => {
    const merged = new Map<string, ChatMessage>([...sentMap, ...receivedMap]);
    const list = Array.from(merged.values());
    list.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
    onMessages(list);
  };

  const qSent = query(
    collection(db, 'chats', chatId, 'messages'),
    where('senderId', '==', uid)
  );
  const qReceived = query(
    collection(db, 'chats', chatId, 'messages'),
    where('recipientId', '==', uid)
  );

  const unsubSent = onSnapshot(
    qSent,
    (snap) => {
      sentMap.clear();
      snap.docs.forEach((d) => {
        sentMap.set(d.id, {
          id: d.id,
          ...(d.data() as Omit<ChatMessage, 'id'>),
        });
      });
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );

  const unsubReceived = onSnapshot(
    qReceived,
    (snap) => {
      receivedMap.clear();
      snap.docs.forEach((d) => {
        receivedMap.set(d.id, {
          id: d.id,
          ...(d.data() as Omit<ChatMessage, 'id'>),
        });
      });
      emitMerged();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );

  return () => {
    unsubSent();
    unsubReceived();
  };
}

function buildSanitizedDataPacket(raw?: DataPacket): DataPacket | undefined {
  if (!raw) return undefined;
  const title = clampString(raw.title, VALIDATION_RULES.PACKET_TITLE_MAX) || 'Data Packet';
  const category = clampString(raw.category, VALIDATION_RULES.PACKET_CATEGORY_MAX) || 'General';

  const clean: DataPacket = {
    title,
    category,
  };

  if (raw.fieldOneLabel !== undefined) {
    clean.fieldOneLabel = clampString(raw.fieldOneLabel, VALIDATION_RULES.PACKET_LABEL_MAX);
  }
  if (raw.fieldOneValue !== undefined) {
    clean.fieldOneValue = clampString(raw.fieldOneValue, VALIDATION_RULES.PACKET_VALUE_MAX);
  }
  if (raw.fieldTwoLabel !== undefined) {
    clean.fieldTwoLabel = clampString(raw.fieldTwoLabel, VALIDATION_RULES.PACKET_LABEL_MAX);
  }
  if (raw.fieldTwoValue !== undefined) {
    clean.fieldTwoValue = clampString(raw.fieldTwoValue, VALIDATION_RULES.PACKET_VALUE_MAX);
  }
  if (raw.fieldThreeLabel !== undefined) {
    clean.fieldThreeLabel = clampString(raw.fieldThreeLabel, VALIDATION_RULES.PACKET_LABEL_MAX);
  }
  if (raw.fieldThreeValue !== undefined) {
    clean.fieldThreeValue = clampString(raw.fieldThreeValue, VALIDATION_RULES.PACKET_VALUE_MAX);
  }
  if (raw.codeLanguage !== undefined) {
    clean.codeLanguage = clampString(raw.codeLanguage, VALIDATION_RULES.PACKET_CODE_LANG_MAX);
  }
  if (raw.fileName !== undefined) {
    clean.fileName = clampString(raw.fileName, VALIDATION_RULES.PACKET_FILENAME_MAX);
  }
  if (raw.fileMimeType !== undefined) {
    clean.fileMimeType = clampString(raw.fileMimeType, VALIDATION_RULES.PACKET_MIMETYPE_MAX);
  }
  if (raw.payloadBody !== undefined) {
    clean.payloadBody = raw.payloadBody.slice(0, VALIDATION_RULES.PACKET_PAYLOAD_MAX);
  }

  return clean;
}

export async function sendChatMessage(params: {
  chat: DirectChat;
  me: PublicProfile;
  kind: MessageKind;
  text: string;
  replyTo?: { text: string; senderName: string } | null;
  dataPacket?: DataPacket;
}): Promise<void> {
  const { chat, me, kind } = params;
  const recipientId = chat.userOneId === me.uid ? chat.userTwoId : chat.userOneId;
  const cleanText = clampString(params.text, VALIDATION_RULES.MESSAGE_TEXT_MAX);

  if (!cleanText) {
    throw new Error('Message cannot be empty.');
  }

  const messagesCol = collection(db, 'chats', chat.chatId, 'messages');
  const messageRef = doc(messagesCol);
  const path = `chats/${chat.chatId}/messages/${messageRef.id}`;

  const now = serverTimestamp();
  const messagePayload: Record<string, unknown> = {
    chatId: chat.chatId,
    senderId: me.uid,
    recipientId,
    senderName: clampString(me.displayName, VALIDATION_RULES.DISPLAY_NAME_MAX) || 'User',
    kind,
    text: cleanText,
    deliveryStatus: 'sent',
    starredBySender: false,
    starredByRecipient: false,
    createdAt: now,
    updatedAt: now,
  };

  if (params.replyTo && params.replyTo.text.trim()) {
    messagePayload.replyToText = clampString(
      params.replyTo.text,
      VALIDATION_RULES.REPLY_PREVIEW_MAX
    );
    messagePayload.replyToSender =
      clampString(params.replyTo.senderName, VALIDATION_RULES.DISPLAY_NAME_MAX) || 'User';
  }

  const sanitizedPacket = buildSanitizedDataPacket(params.dataPacket);
  if (sanitizedPacket) {
    messagePayload.dataPacket = sanitizedPacket;
  }

  const isMeUserOne = me.uid === chat.userOneId;
  const nextUnreadOne = isMeUserOne
    ? chat.unreadForUserOne
    : Math.min(9999, (chat.unreadForUserOne || 0) + 1);
  const nextUnreadTwo = isMeUserOne
    ? Math.min(9999, (chat.unreadForUserTwo || 0) + 1)
    : chat.unreadForUserTwo;

  const previewPrefix =
    kind === 'data_record'
      ? `[Record] ${sanitizedPacket?.title || cleanText}`
      : kind === 'code_snippet'
        ? `[Code] ${sanitizedPacket?.title || cleanText}`
        : kind === 'file_packet'
          ? `[File] ${sanitizedPacket?.fileName || sanitizedPacket?.title || cleanText}`
          : cleanText;

  try {
    const batch = writeBatch(db);
    batch.set(messageRef, messagePayload);
    batch.update(doc(db, 'chats', chat.chatId), {
      lastMessagePreview: clampString(previewPrefix, VALIDATION_RULES.CHAT_PREVIEW_MAX),
      lastMessageKind: kind,
      lastSenderId: me.uid,
      unreadForUserOne: nextUnreadOne,
      unreadForUserTwo: nextUnreadTwo,
      updatedAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

const markingReadMessagesInFlight = new Set<string>();
let markingChatReadInFlight = new Set<string>();

export async function markChatAndMessagesRead(
  chat: DirectChat,
  messages: ChatMessage[],
  uid: string
): Promise<void> {
  const isUserOne = chat.userOneId === uid;
  const myUnreadCount = isUserOne ? chat.unreadForUserOne : chat.unreadForUserTwo;
  const shouldResetChatUnread =
    myUnreadCount > 0 && !markingChatReadInFlight.has(chat.chatId);

  const unreadIncoming = messages.filter(
    (m) =>
      m.recipientId === uid &&
      m.deliveryStatus === 'sent' &&
      !markingReadMessagesInFlight.has(m.id)
  );

  if (!shouldResetChatUnread && unreadIncoming.length === 0) {
    return;
  }

  const targetMessages = unreadIncoming.slice(0, 50);
  if (shouldResetChatUnread) {
    markingChatReadInFlight.add(chat.chatId);
  }
  targetMessages.forEach((m) => markingReadMessagesInFlight.add(m.id));

  const path = `chats/${chat.chatId}`;
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    if (shouldResetChatUnread) {
      if (isUserOne) {
        batch.update(doc(db, 'chats', chat.chatId), {
          unreadForUserOne: 0,
          updatedAt: now,
        });
      } else {
        batch.update(doc(db, 'chats', chat.chatId), {
          unreadForUserTwo: 0,
          updatedAt: now,
        });
      }
    }

    targetMessages.forEach((m) => {
      batch.update(doc(db, 'chats', chat.chatId, 'messages', m.id), {
        deliveryStatus: 'read',
        updatedAt: now,
      });
    });

    await batch.commit();
  } catch (error) {
    targetMessages.forEach((m) => markingReadMessagesInFlight.delete(m.id));
    handleFirestoreError(error, OperationType.UPDATE, path);
  } finally {
    markingChatReadInFlight.delete(chat.chatId);
  }
}

export async function toggleMessageStar(
  chatId: string,
  message: ChatMessage,
  uid: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${message.id}`;
  try {
    const now = serverTimestamp();
    if (message.senderId === uid) {
      await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
        starredBySender: !message.starredBySender,
        updatedAt: now,
      });
    } else if (message.recipientId === uid) {
      await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
        starredByRecipient: !message.starredByRecipient,
        updatedAt: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleMessageReaction(
  chatId: string,
  message: ChatMessage,
  uid: string,
  emoji: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${message.id}`;
  const currentReactions: Record<string, string> = { ...(message.reactions || {}) };
  if (currentReactions[uid] === emoji) {
    delete currentReactions[uid];
  } else {
    currentReactions[uid] = emoji;
  }
  try {
    const now = serverTimestamp();
    await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
      reactions: currentReactions,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMessageForMe(
  chatId: string,
  message: ChatMessage,
  uid: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${message.id}`;
  const existing = message.deletedFor || [];
  if (!existing.includes(uid)) {
    const updated = [...existing, uid];
    try {
      const now = serverTimestamp();
      await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
        deletedFor: updated,
        updatedAt: now,
      });
    } catch (error) {
      console.warn('Failed updating deletedFor in Firestore:', error);
    }
  }
}

export async function deleteMessageForEveryone(
  chatId: string,
  message: ChatMessage,
  uid: string
): Promise<void> {
  if (message.senderId !== uid) {
    throw new Error('You can only delete your own messages for everyone.');
  }
  const path = `chats/${chatId}/messages/${message.id}`;
  const now = serverTimestamp();
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', message.id), {
      isDeletedForEveryone: true,
      text: 'This message was deleted',
      reactions: {},
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
