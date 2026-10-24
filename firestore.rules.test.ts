/**
 * Firestore Security Rules Test Suite — Dirty Dozen Verification
 * Verifies that all 12 adversarial payloads defined in security_spec.md
 * return PERMISSION_DENIED against firestore.rules.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on PublicProfile',
    auth: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    operation: 'create',
    path: 'users/user_alice/public/profile',
    payload: {
      uid: 'user_alice',
      displayName: 'Alice',
      handle: 'alice_01',
      about: 'Available',
      avatarColor: '#00A884',
      isVerifiedAdmin: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof on Profile Creation',
    auth: { uid: 'user_alice', email: 'alice@example.com', email_verified: false },
    operation: 'create',
    path: 'users/user_alice/public/profile',
    payload: {
      uid: 'user_alice',
      displayName: 'Alice',
      handle: 'alice_01',
      about: 'Available',
      avatarColor: '#00A884',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User PII Read on /users/user_alice/private/info',
    auth: { uid: 'user_mallory', email: 'mallory@example.com', email_verified: true },
    operation: 'get',
    path: 'users/user_alice/private/info',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Handle Enumeration Attack (list on /handles)',
    auth: { uid: 'user_mallory', email: 'mallory@example.com', email_verified: true },
    operation: 'list',
    path: 'handles',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned Handle Squatting Without Matching Public Profile',
    auth: { uid: 'user_mallory', email: 'mallory@example.com', email_verified: true },
    operation: 'create',
    path: 'handles/ceo_official',
    payload: {
      uid: 'user_mallory',
      handle: 'ceo_official',
      displayName: 'Mallory',
      about: 'Available',
      avatarColor: '#00A884',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Identity Spoofing on ChatMessage (senderId != auth.uid)',
    auth: { uid: 'user_bob', email: 'bob@example.com', email_verified: true },
    operation: 'create',
    path: 'chats/user_alice__user_bob/messages/msg_spoof',
    payload: {
      chatId: 'user_alice__user_bob',
      senderId: 'user_alice',
      recipientId: 'user_bob',
      senderName: 'Alice',
      kind: 'text',
      text: 'Wire funds immediately',
      deliveryStatus: 'sent',
      starredBySender: false,
      starredByRecipient: false,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Message Creation Without Parent Chat',
    auth: { uid: 'user_mallory', email: 'mallory@example.com', email_verified: true },
    operation: 'create',
    path: 'chats/user_alice__user_mallory/messages/msg_orphan',
    payload: {
      chatId: 'user_alice__user_mallory',
      senderId: 'user_mallory',
      recipientId: 'user_alice',
      senderName: 'Mallory',
      kind: 'text',
      text: 'Unsolicited orphan write',
      deliveryStatus: 'sent',
      starredBySender: false,
      starredByRecipient: false,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Terminal State Rollback (deliveryStatus read -> sent)',
    auth: { uid: 'user_bob', email: 'bob@example.com', email_verified: true },
    operation: 'update',
    path: 'chats/user_alice__user_bob/messages/msg_1',
    payload: {
      deliveryStatus: 'sent',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Message Body Tampering After Send',
    auth: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    operation: 'update',
    path: 'chats/user_alice__user_bob/messages/msg_1',
    payload: {
      text: 'Altered historical record',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Resource Exhaustion Oversized Text Payload (> 4000 chars)',
    auth: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    operation: 'create',
    path: 'chats/user_alice__user_bob/messages/msg_oversized',
    payload: {
      chatId: 'user_alice__user_bob',
      senderId: 'user_alice',
      recipientId: 'user_bob',
      senderName: 'Alice',
      kind: 'text',
      text: 'x'.repeat(5000),
      deliveryStatus: 'sent',
      starredBySender: false,
      starredByRecipient: false,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unfiltered list Scraping on /chats',
    auth: { uid: 'user_mallory', email: 'mallory@example.com', email_verified: true },
    operation: 'list',
    path: 'chats',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Client Timestamp Forgery on Chat Creation',
    auth: { uid: 'user_alice', email: 'alice@example.com', email_verified: true },
    operation: 'create',
    path: 'chats/user_alice__user_bob',
    payload: {
      chatId: 'user_alice__user_bob',
      userOneId: 'user_alice',
      userTwoId: 'user_bob',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
