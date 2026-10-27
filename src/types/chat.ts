import { Timestamp } from 'firebase/firestore';

/**
 * Verbatim validation constants synchronized with firebase-blueprint.json
 * and firestore.rules.
 */
export const VALIDATION_RULES = {
  ID_MAX_LENGTH: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  HANDLE_MIN_LENGTH: 3,
  HANDLE_MAX_LENGTH: 40,
  HANDLE_PATTERN: /^[a-z0-9_]+$/,
  SHA256_PATTERN: /^[a-f0-9]{64}$/,
  HEX_COLOR_PATTERN: /^#[0-9A-Fa-f]{6}$/,
  DISPLAY_NAME_MAX: 60,
  ABOUT_MAX: 160,
  EMAIL_MAX: 254,
  NICKNAME_MAX: 60,
  CHAT_PREVIEW_MAX: 240,
  MESSAGE_TEXT_MAX: 4000,
  REPLY_PREVIEW_MAX: 240,
  PACKET_TITLE_MAX: 120,
  PACKET_CATEGORY_MAX: 40,
  PACKET_LABEL_MAX: 60,
  PACKET_VALUE_MAX: 500,
  PACKET_CODE_LANG_MAX: 30,
  PACKET_FILENAME_MAX: 120,
  PACKET_MIMETYPE_MAX: 80,
  PACKET_PAYLOAD_MAX: 3500,
  GROUP_NAME_MAX: 60,
  GROUP_DESC_MAX: 200,
  GROUP_MEMBERS_MAX: 100,
} as const;

export const AVATAR_PALETTE = [
  '#008069',
  '#0F766E',
  '#1D4ED8',
  '#4338CA',
  '#0369A1',
  '#B45309',
  '#BE123C',
  '#374151',
] as const;

export type MessageKind = 'text' | 'data_record' | 'code_snippet' | 'file_packet';
export type ChatSummaryKind = 'none' | MessageKind;
export type DeliveryStatus = 'sent' | 'read';

export interface PublicProfile {
  uid: string;
  displayName: string;
  handle: string;
  about: string;
  avatarColor: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PrivateUserInfo {
  uid: string;
  email: string;
  emailHash: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface DirectoryEntry {
  uid: string;
  handle: string;
  displayName: string;
  about: string;
  avatarColor: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ContactEntry {
  ownerId: string;
  contactUid: string;
  contactHandle: string;
  contactName: string;
  nickname: string;
  avatarColor: string;
  about: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface DirectChat {
  chatId: string;
  userOneId: string;
  userTwoId: string;
  userOneName: string;
  userTwoName: string;
  userOneHandle: string;
  userTwoHandle: string;
  userOneColor: string;
  userTwoColor: string;
  createdBy: string;
  lastMessagePreview: string;
  lastMessageKind: ChatSummaryKind;
  lastSenderId: string;
  unreadForUserOne: number;
  unreadForUserTwo: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface DataPacket {
  title: string;
  category: string;
  fieldOneLabel?: string;
  fieldOneValue?: string;
  fieldTwoLabel?: string;
  fieldTwoValue?: string;
  fieldThreeLabel?: string;
  fieldThreeValue?: string;
  codeLanguage?: string;
  fileName?: string;
  fileMimeType?: string;
  payloadBody?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  kind: MessageKind;
  text: string;
  deliveryStatus: DeliveryStatus;
  starredBySender: boolean;
  starredByRecipient: boolean;
  replyToText?: string;
  replyToSender?: string;
  dataPacket?: DataPacket;
  reactions?: Record<string, string>;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface GroupChat {
  groupId: string;
  name: string;
  description: string;
  avatarColor: string;
  createdBy: string;
  createdByName: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  memberHandles: Record<string, string>;
  memberColors: Record<string, string>;
  lastMessagePreview: string;
  lastMessageKind: ChatSummaryKind;
  lastSenderId: string;
  lastSenderName: string;
  unreadCounts: Record<string, number>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  kind: MessageKind;
  text: string;
  replyToText?: string;
  replyToSender?: string;
  dataPacket?: DataPacket;
  reactions?: Record<string, string>;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}
