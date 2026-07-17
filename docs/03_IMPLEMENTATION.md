# LazyList — Implementation Details

This document explains the technical approach for each major feature — the "how" behind every system decision.

---

## 1. WebSocket Real-Time Bidding

### Problem
The desktop version polled the backend every 5 seconds via `setInterval(fetchData, 5000)`. This meant:
- 12 HTTP requests/minute per user viewing an auction
- Status updates were delayed by up to 5 seconds
- Server load scaled linearly with user count

### Solution: Socket.io Room-Based Architecture

**Backend** (`config/socket.js`):
```js
io.on("connection", (socket) => {
  socket.on("join-room", (roomName) => socket.join(roomName));
  socket.on("leave-room", (roomName) => socket.leave(roomName));
});
```

**Bid placement** (`controllers/bidController.js`):
```js
// After inserting the bid and computing rankings:
const io = getIO();
io.to(`rfq-${rfq_id}`).emit("bid-updated", {
  rfq_id, bid, extension, rfq, rankings
});
```

**Frontend** (`AuctionDetailPage.jsx`):
```js
socket.on('bid-updated', (updatedData) => {
  setData(prev => ({
    ...prev,
    rfq: { ...prev.rfq, bid_close_time: updatedData.rfq.bid_close_time },
    rankings: updatedData.rankings
  }));
});
```

### Why This Works
- Only 1 persistent TCP connection per user (vs 12 HTTP requests/min)
- Updates are push-based: 0ms delay after a bid is placed
- Server only sends data when something actually changes

---

## 2. Google OAuth 2.0 Integration

### Flow
```
User clicks "Sign in with Google"
  → Google Identity Services (GIS) SDK opens popup
  → User selects Google account
  → GIS returns an ID Token (JWT signed by Google)
  → Frontend sends token to POST /api/auth/google
  → Backend verifies token using google-auth-library
  → Backend extracts: email, name, picture, Google ID
  → Upsert user (create if new, update if existing)
  → Backend issues our own JWT token
  → Frontend stores JWT, redirects to home
```

### Backend Verification
```js
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ticket = await client.verifyIdToken({
  idToken: token,
  audience: process.env.GOOGLE_CLIENT_ID,
});
const { email, name, picture, sub: googleId } = ticket.getPayload();
```

### Security Decisions
- We verify the token server-side (never trust the client)
- `audience` check ensures the token was issued for our app
- Google users have `auth_provider = 'google'` and `password_hash = NULL`
- They cannot use the password login flow

---

## 3. Optimistic UI for Chat Messages

### Problem
Network round-trip (user → backend → database → backend → user) takes 100–500ms. Users perceive this as lag.

### Solution
Render the message **immediately** in the local state before the server confirms it.

```js
const tempId = `temp-${Date.now()}`
const optimisticMessage = {
  id: tempId,
  content: text,
  sender_id: user.id,
  sender_name: user.name,
  created_at: new Date().toISOString(),
  sending: true  // Shows "sending..." badge
}

// 1. Render immediately
setMessages(prev => [...prev, optimisticMessage])

// 2. Send to server
const data = await sendMessage(rfqId, text)

// 3. Replace temp with confirmed message
if (data.success) {
  setMessages(prev =>
    prev.map(m => m.id === tempId ? data.data : m)
  )
}
```

### Deduplication
When the Socket.io broadcast arrives (from the server), we check:
```js
socket.on('message-received', (msg) => {
  setMessages(prev => {
    // Skip if already exists (by real ID)
    if (prev.some(m => m.id === msg.id)) return prev
    // Replace temp message with real one (by matching content)
    const tempIndex = prev.findIndex(m =>
      m.id.toString().startsWith('temp-') && m.content === msg.content
    )
    if (tempIndex !== -1) {
      const updated = [...prev]
      updated[tempIndex] = msg
      return updated
    }
    return [...prev, msg]
  })
})
```

---

## 4. Auto-Extension Logic (Bid Timer Extension)

### Problem
In a reverse auction, last-second bids ("sniping") are unfair because other bidders don't have time to respond.

### Solution: Configurable Trigger-Based Extensions

When creating an RFQ, the poster configures:
- `trigger_window` (e.g., 10 minutes) — the danger zone before close
- `extension_duration` (e.g., 5 minutes) — how much time to add
- `trigger_type` — what triggers the extension:
  - `ANY_BID` — any bid placed in the window
  - `ANY_RANK_CHANGE` — a bid that changes any bidder's rank
  - `L1_CHANGE` — a bid that changes the lowest bidder

```js
if (isInTriggerWindow) {
  switch (rfq.trigger_type) {
    case "ANY_BID":
      shouldExtend = true;
      break;
    case "ANY_RANK_CHANGE":
      if (anyRankChange) shouldExtend = true;
      break;
    case "L1_CHANGE":
      if (isNewL1) shouldExtend = true;
      break;
  }
}
```

The extension never exceeds `forced_close_time` (hard deadline).

---

## 5. Live Status Transitions (1-Second Tick)

### Problem
`useMemo` only recomputes when dependencies change. Time passing doesn't trigger React re-renders. So the status badge stayed "Active" even after `bid_close_time` passed.

### Solution: Tick Counter
```js
const [tick, setTick] = useState(0)
useEffect(() => {
  const interval = setInterval(() => setTick(t => t + 1), 1000)
  return () => clearInterval(interval)
}, [])

// Re-computed on every tick (fresh Date.now())
const liveStatus = (() => {
  if (!data?.rfq) return 'Upcoming'
  const now = Date.now()
  if (now >= forcedClose) return 'Force Closed'
  if (now >= bidClose) return 'Closed'
  if (now >= bidStart) return 'Active'
  return 'Upcoming'
})()
```

This is the same approach as the desktop version's polling but without any network requests — just a local clock check every second.

---

## 6. Chat Read/Write Separation

### Problem
When chat expired or was closed by the poster, `validateChatAccess()` returned `403 Forbidden`, blocking both reading and writing. The entire chat history disappeared.

### Solution: `isWrite` Parameter
```js
const validateChatAccess = async (rfqId, userId, isWrite = false) => {
  // ... validation logic ...
  if (rfq.chat_closed_by_poster) {
    if (isWrite) return { allowed: false, reason: "..." }
    // Allow read access — return messages + closed flag
    return { allowed: true, chatClosed: true, reason: "..." }
  }
}
```

- **GET** calls with `isWrite = false` → allowed, returns messages + `chat_closed: true`
- **POST** calls with `isWrite = true` → blocked with 403

Frontend reads the flag and locks the input:
```js
{error ? (
  <div className="chat-closed-banner">🔒 {error}</div>
) : (
  <form onSubmit={handleSend}>...</form>
)}
```

---

## 7. Database Query Optimization

### Before (3 sequential round-trips for chat validation):
```sql
-- Query 1
SELECT * FROM rfq WHERE id = $1;
-- Query 2
SELECT user_id FROM bids WHERE rfq_id = $1 ORDER BY bid_amount ASC LIMIT 1;
-- Query 3
SELECT NOW() as now;
```

### After (1 single query):
```sql
SELECT
  r.*,
  NOW() as db_now,
  (SELECT user_id FROM bids
   WHERE rfq_id = r.id
   ORDER BY bid_amount ASC, created_at ASC
   LIMIT 1) as winner_id
FROM rfq r
WHERE r.id = $1;
```

Same optimization applied to `getRFQs` and `getRFQById` — `NOW()` is inlined into the main JOIN query instead of a separate round-trip.
