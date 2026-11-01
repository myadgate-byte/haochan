# Security Specification (`security_spec.md`) — 하오찬 (Haochan) Reservation System

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every path not explicitly matched is strictly denied (`allow read, write: if false;`).
2. **Verified Identity**: All authenticated writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Admin Authentication Invariant**: Admin privileges (`isAdmin()`) require `request.auth != null && request.auth.token.email_verified == true && request.auth.token.email == 'myadgate@gmail.com'`. No client-side role field or unverified email can grant admin access.
4. **PII Isolation Invariant**:
   - `/users/{userId}` contains customer PII (`name`, `email`, `phone`) and is strictly readable (`get`) only by `request.auth.uid == userId || isAdmin()`. Listing `/users` is restricted to `isAdmin()`.
   - `/reservations/{reservationId}` contains customer PII (`customerName`, `customerPhone`, `customerEmail`) and is readable (`get`, `list`) strictly when `resource.data.userId == request.auth.uid || isAdmin()`.
5. **Strict Schema & Key Whitelisting**: Every `create` and `update` operation validates exact allowed keys via `hasAll` and `hasOnly`, string length bounds, regex patterns, numeric ranges, and server timestamps (`request.time`).
6. **Terminal State Locking**: Once a reservation reaches a terminal state (`'cancelled'`, `'completed'`, `'noshow'`), non-admin users cannot modify it.
7. **Immutable Ownership & Creation Time**: `userId` and `createdAt` on `/reservations/{reservationId}` and `uid` and `createdAt` on `/users/{userId}` can never be modified after creation.

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on Reservation Create)**: Authenticated User A attempts to create a reservation with `userId: "user_B"`. -> `PERMISSION_DENIED`
2. **Payload 2 (Shadow Field Injection on Reservation Create)**: Authenticated User A includes an undeclared field `isVip: true` in `/reservations/{id}`. -> `PERMISSION_DENIED`
3. **Payload 3 (Unverified Admin Email Spoofing)**: Attacker with `email: "myadgate@gmail.com"` and `email_verified: false` attempts to `list` all reservations or update `storeSettings/main`. -> `PERMISSION_DENIED`
4. **Payload 4 (PII Blanket Read on Users)**: Authenticated User A attempts to `get` `/users/user_B`. -> `PERMISSION_DENIED`
5. **Payload 5 (Unauthorized Query Scraping on Reservations)**: Authenticated User A attempts to `list` `/reservations` without filtering by `userId == request.auth.uid`. -> `PERMISSION_DENIED`
6. **Payload 6 (State Shortcutting by Customer)**: Customer attempts to create a reservation directly with `status: "confirmed"` or update their own reservation from `pending` to `confirmed`. -> `PERMISSION_DENIED`
7. **Payload 7 (Terminal State Re-opening)**: Customer attempts to update a reservation whose existing `status` is `'cancelled'` back to `'pending'`. -> `PERMISSION_DENIED`
8. **Payload 8 (Value Poisoning on Whitelisted Update Key)**: Customer attempts to update `notes` on a pending reservation with a 5,000-character string or a boolean value. -> `PERMISSION_DENIED`
9. **Payload 9 (Timestamp Forgery)**: Customer attempts to create or update a reservation with a past or future client-supplied `createdAt` or `updatedAt` instead of `request.time`. -> `PERMISSION_DENIED`
10. **Payload 10 (Immutable Field Mutation)**: Customer attempts to change `userId`, `date`, or `partySize` during a cancellation update. -> `PERMISSION_DENIED`
11. **Payload 11 (Store Settings Tampering)**: Non-admin verified user attempts to update `/storeSettings/main` to increase `maxSeatsPerSlot`. -> `PERMISSION_DENIED`
12. **Payload 12 (ID Poisoning Attack)**: User attempts to create a document with an invalid ID containing special characters or exceeding 128 chars. -> `PERMISSION_DENIED`
