# LazyList — Changes from Desktop to AWS Version

This document describes every change made when migrating LazyList from the desktop-only RFQ system to the cloud-deployed AWS version.

---

## 1. Brand Identity
- **Renamed** from generic "RFQ System" to **LazyList**
- Removed all emoji usage across admin and user-facing pages to maintain a professional enterprise appearance

---

## 2. Authentication — Google OAuth 2.0
**What changed**: Added Google Sign-In as a third-party authentication option alongside existing email/password login.

**New files & changes**:
- `backend/controllers/authController.js` — Added `googleLogin` handler that verifies Google ID tokens using `google-auth-library`
- `backend/routes/authRoutes.js` — Added `POST /api/auth/google` endpoint
- `frontend/src/pages/LoginPage.jsx` — Added Google Sign-In button with GIS SDK integration
- `frontend/src/context/AuthContext.jsx` — Updated to handle Google-authenticated sessions

**Behavior**:
- First-time Google users are auto-registered with their Google name, email, and avatar
- Google-authenticated users cannot change their password (no password exists)
- The `users` table gained `auth_provider` (enum: `local` | `google`) and `google_id` columns

---

## 3. Real-Time WebSocket Architecture (Replacing HTTP Polling)
**What changed**: The desktop version used `setInterval(fetchData, 5000)` to poll the backend every 5 seconds. The AWS version uses **Socket.io WebSockets** for instant, push-based updates.

**New files**:
- `backend/config/socket.js` — Socket.io server initialization and room management

**How it works**:
- **Bid updates**: When a bid is placed, the backend emits a `bid-updated` event to the room `rfq-${id}`. All connected clients receive the updated rankings instantly
- **Chat messages**: Post-auction messages are broadcast via `message-received` events on room `rfq-${id}-chat`
- **Chat closure**: The `chat-closed` event disconnects participants when a poster manually closes the chat

**Frontend integration**:
- `AuctionDetailPage.jsx` — Connects to socket on mount, joins the RFQ room, updates rankings on `bid-updated`
- `ChatSection.jsx` — Connects to chat room, renders messages in real-time

---

## 4. Post-Auction Chat System
**What changed**: Added a real-time chat between the auction poster and the winning bidder (L1) after the auction closes.

**New files**:
- `backend/controllers/messageController.js` — GET/POST message endpoints with access validation
- `backend/routes/messageRoutes.js` — `/api/messages/:rfqId` routes
- `frontend/src/components/ChatSection.jsx` — Chat UI component
- `frontend/src/components/ChatSection.css` — Chat styling

**Rules**:
- Chat is only visible after the auction closes
- Only the poster and L1 (winning) bidder can participate
- **Auto-close**: Chat expires 30 minutes after auction end
- **Manual close**: The poster can permanently close the chat
- After closure, message history remains visible but the input is locked with a red banner

---

## 5. Optimistic UI Updates for Chat
**What changed**: Messages appear instantly (0ms perceived latency) instead of waiting for server confirmation.

**How it works**:
1. User clicks Send → message rendered locally with `sending...` status and a temporary ID
2. HTTP POST fires in the background
3. On success: temporary message is replaced with the server-confirmed version (real ID + timestamp)
4. On failure: status changes to `failed`
5. Socket broadcast from other users is deduplicated against existing messages

---

## 6. Chat Auto-Close Timer (30-Minute Expiry)
**What changed**: A countdown timer in the chat header shows time remaining. After 30 minutes post-auction, the chat locks automatically.

**Implementation**:
- Frontend: `useEffect` with `setInterval` computing remaining time from `bid_close_time` or `forced_close_time`
- Backend: `validateChatAccess()` checks elapsed time on every API call, blocks writes after 30 minutes but allows reads (historical access)
- When timer expires or poster clicks "Close Chat", the timer clears and input is replaced with a lock banner

---

## 7. Terms & Conditions (T&C) Field
**What changed**: Added a `tnc_extra_charges TEXT` column to the `bids` table.

- Bidders can describe terms, conditions, or potential extra charges when submitting a quote
- Visible in the expandable bid details in the rankings table

---

## 8. Carrier Name Auto-Binding
**What changed**: The carrier name is no longer a manual input field. It is automatically set to the logged-in user's name from their profile.

- Prevents impersonation and ensures bid attribution accuracy
- Self-bidding prevention: users cannot bid on their own posted auctions

---

## 9. Admin — Delete Auctions
**What changed**: Admins can permanently delete any service request from the detail page.

- Added `DELETE /api/rfqs/:id` endpoint in `rfqController.js`
- Added a red "Delete Request" button visible only to admin users on `AuctionDetailPage.jsx`

---

## 10. Live Status Transitions (No Refresh Required)
**What changed**: The desktop version required a page refresh to see status changes (Active → Closed). The AWS version transitions automatically.

**Implementation**:
- A 1-second `setInterval` tick counter forces React to re-render
- On each render, `liveStatus` is computed from `Date.now()` vs the live `bid_close_time` and `forced_close_time` timestamps
- The status badge, bid form visibility, and chat section appearance all react to this computed value instantly

---

## 11. Database Query Optimization
**What changed**: Eliminated redundant sequential database round-trips.

- `getRFQs`: Removed separate `SELECT NOW()` query — inlined `NOW() as db_now` into the main JOIN query
- `getRFQById`: Same optimization
- `validateChatAccess`: Merged 3 sequential queries (fetch RFQ, fetch winner, fetch NOW) into a single SQL query with a subquery

---

## 12. Neon Database Keep-Alive
**What changed**: Added a `SELECT 1` ping that runs every 4 minutes in `backend/index.js` to prevent Neon's free-tier cold-start delay (3–5 seconds on first query after idle).
