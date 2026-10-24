# WhatsConnect Security Specification (Payload-First Security TDD)

## 1. Data Invariants & Master Source of Truth

1. **Verified Identity Invariant**: All read and write operations require `request.auth != null` and `request.auth.token.email_verified == true`. Unverified tokens and anonymous sessions are rejected across every collection.
2. **PII Split-Collection Isolation**: User email addresses reside exclusively in `/users/{userId}/private/info` and are strictly readable (`get`) only when `request.auth.uid == userId`. Public profiles (`/users/{userId}/public/profile`), `/handles/{handleId}`, and `/lookupHashes/{hashId}` never contain plaintext emails or phone numbers, and `list` is forbidden (`allow list: if false;`) to prevent user scraping.
3. **Atomic Registration Invariant**: Creating `/handles/{handleId}` requires `getAfter(/databases/$(database)/documents/users/$(request.auth.uid)/public/profile).data.handle == handleId`. Creating `/lookupHashes/{hashId}` requires `getAfter(/databases/$(database)/documents/users/$(request.auth.uid)/private/info).data.emailHash == hashId`.
4. **Master Gate for Messages**: A message in `/chats/{chatId}/messages/{messageId}` cannot be created unless `/chats/{chatId}` exists, `request.auth.uid` is one of `{userOneId, userTwoId}`, `recipientId` is the exact partner UID on that parent chat, and the parent chat summary (`lastSenderId`, `updatedAt`) is atomically updated in the same batch (`getAfter`).
5. **Query Enforcer Without Cost Explosion**: `allow list` on `/chats` and `/chats/{chatId}/messages` and `/users/{userId}/contacts` explicitly checks `resource.data` against `request.auth.uid` with zero `get()` or `exists()` lookups inside `list` blocks.
6. **Terminal State Locking**: Once `ChatMessage.deliveryStatus` transitions from `'sent'` to `'read'` (performed exclusively by `recipientId`), it cannot be reverted to `'sent'`.
7. **Temporal & Immutable Field Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on updates; `updatedAt` must equal `request.time` on all writes. Ownership and relational keys (`uid`, `ownerId`, `userOneId`, `userTwoId`, `createdBy`, `chatId`, `senderId`, `recipientId`) are strictly immutable after creation.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Shadow Field Injection on PublicProfile (`isVerifiedAdmin: true`)**:
   ```json
   {
     "uid": "user_alice",
     "displayName": "Alice",
     "handle": "alice_01",
     "about": "Available",
     "avatarColor": "#00A884",
     "isVerifiedAdmin": true,
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (blocked by `hasOnly` in `isValidPublicProfile`).

2. **Payload 2 — Unverified Email Spoof on Profile Creation**:
   Auth context `{ uid: "user_alice", email: "alice@example.com", email_verified: false }` writing `/users/user_alice/public/profile`.
   *Expected*: `PERMISSION_DENIED` (blocked by `isVerified()`).

3. **Payload 3 — Cross-User PII Read on `/users/user_alice/private/info`**:
   Auth context `{ uid: "user_mallory", email_verified: true }` performing `get` on `/users/user_alice/private/info`.
   *Expected*: `PERMISSION_DENIED` (strictly restricted to `request.auth.uid == userId`).

4. **Payload 4 — Handle Enumeration Attack (`list` on `/handles`)**:
   Auth context `{ uid: "user_mallory", email_verified: true }` querying `collection(db, 'handles')`.
   *Expected*: `PERMISSION_DENIED` (`list` is explicitly disallowed on `/handles` and `/lookupHashes`).

5. **Payload 5 — Orphaned Handle Squatting Without Matching Public Profile**:
   Writing `/handles/ceo_official` with `uid: "user_mallory"` while `/users/user_mallory/public/profile` has `handle: "mallory_99"`.
   *Expected*: `PERMISSION_DENIED` (blocked by `getAfter` atomic handle check).

6. **Payload 6 — Identity Spoofing on `ChatMessage` (`senderId` != `request.auth.uid`)**:
   ```json
   {
     "chatId": "user_alice__user_bob",
     "senderId": "user_alice",
     "recipientId": "user_bob",
     "senderName": "Alice",
     "kind": "text",
     "text": "Wire funds immediately",
     "deliveryStatus": "sent",
     "starredBySender": false,
     "starredByRecipient": false,
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   Sent by `user_bob`. *Expected*: `PERMISSION_DENIED` (`incoming().senderId == request.auth.uid` fails).

7. **Payload 7 — Orphaned Message Creation Without Parent `/chats/{chatId}`**:
   Creating `/chats/user_alice__user_mallory/messages/msg_1` when `/chats/user_alice__user_mallory` does not exist.
   *Expected*: `PERMISSION_DENIED` (Master Gate `get()` on parent chat fails).

8. **Payload 8 — Terminal State Rollback (`deliveryStatus: 'read' -> 'sent'`)**:
   Recipient updating `/chats/user_alice__user_bob/messages/msg_1` from `deliveryStatus: "read"` back to `"sent"`.
   *Expected*: `PERMISSION_DENIED` (Terminal State Locking enforces `existing().deliveryStatus == 'sent' && incoming().deliveryStatus == 'read'`).

9. **Payload 9 — Message Body Tampering After Send (Anti-Update-Gap)**:
   Sender attempting to `update` `text` on an existing message `/chats/user_alice__user_bob/messages/msg_1`.
   *Expected*: `PERMISSION_DENIED` (`text` is excluded from all `affectedKeys().hasOnly(...)` action branches).

10. **Payload 10 — Resource Exhaustion / Oversized Text Payload (`text.size() > 4000`)**:
    Sending a 50,000-character `text` string in `/chats/user_alice__user_bob/messages/msg_big`.
    *Expected*: `PERMISSION_DENIED` (`data.text.size() <= 4000` fails before any DB read).

11. **Payload 11 — Unfiltered `list` Scraping on `/chats`**:
    Querying `collection(db, 'chats')` without `where('userOneId', '==', uid)` or `where('userTwoId', '==', uid)`.
    *Expected*: `PERMISSION_DENIED` (`allow list` enforces `resource.data.userOneId == request.auth.uid || resource.data.userTwoId == request.auth.uid`).

12. **Payload 12 — Client Timestamp Forgery (`createdAt` set to past year)**:
    Creating a chat or message with `createdAt: Timestamp(2020, 1, 1)` instead of `serverTimestamp()`.
    *Expected*: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).
