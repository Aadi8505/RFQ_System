# LazyList — Challenges Faced & Solutions

This document describes the major technical challenges encountered during development and how each was resolved.

---

## Challenge 1: CORS Handshake Failures with Socket.io

### Problem
When both Express API and Socket.io were configured with strict CORS whitelists, Socket.io's default behavior is to attempt an HTTP long-polling handshake before upgrading to WebSockets. If the browser accessed the frontend via `127.0.0.1` but the CORS whitelist only had `localhost`, the polling handshake was rejected, causing continuous retry loops that froze the page.

### Solution
Allowed the Socket.io connection to use its default transport strategy (polling fallback → WebSocket upgrade) and ensured the CORS whitelist in both Express and Socket.io covered all localhost variants. In production, this isn't an issue because the origin is a single known domain.

### Lesson Learned
Never restrict Socket.io to `transports: ['websocket']` in development — the default fallback mechanism is designed to handle edge cases gracefully.

---

## Challenge 2: React Rules of Hooks Violation

### Problem
After adding a `useMemo` to compute live auction status, placing it after the `if (loading) return` and `if (error) return` early returns caused this error:
```
Rendered more hooks than during the previous render.
```

React requires hooks to be called in the same order on every render. When `loading = true`, the early return skipped `useMemo`, but when `loading = false`, it was called — violating hook ordering.

### Solution
Moved the hook **before** all conditional early returns, with a null guard:
```js
const [tick, setTick] = useState(0)
useEffect(() => { ... }, [])
const liveStatus = (() => {
  if (!data?.rfq) return 'Upcoming'
  // ... compute from timestamps
})()

if (loading) return <Skeleton />  // Safe — hooks already called above
```

### Lesson Learned
All React hooks must be placed at the top of the component, before any conditional returns. This is a strict invariant.

---

## Challenge 3: Stale Closure in setTimeout

### Problem
An attempt to auto-transition auction status used `setTimeout` to fire at the exact `bid_close_time`. But the callback captured a stale reference to `computeStatus()` from when the effect was created. When the timer fired, `Date.now()` was evaluated from the old closure, not the current time.

### Solution
Replaced the `setTimeout` approach with a simple 1-second `setInterval` tick counter that forces React to re-render, computing status from a fresh `Date.now()` every second. Same proven approach as the desktop version's 5-second polling but without any network requests.

### Lesson Learned
`setTimeout` inside `useEffect` captures the closure at creation time. For time-dependent computations, either use a ref for mutable state or use a periodic re-render trigger.

---

## Challenge 4: Neon PostgreSQL Cold Start Latency

### Problem
Neon's free tier scales databases to zero compute after ~5 minutes of inactivity. The first query after idle takes 3–5 seconds to wake the database, causing the homepage to show a loading skeleton for an unacceptable duration.

### Solution
Added a keep-alive ping in `backend/index.js`:
```js
const warmupDb = async () => {
  try { await pool.query("SELECT 1"); } catch (e) { /* silent */ }
};
warmupDb(); // immediate on server start
setInterval(warmupDb, 4 * 60 * 1000); // every 4 minutes
```

### Lesson Learned
Serverless databases trade cost for latency. For production apps, either keep the connection warm or upgrade to an always-on plan.

---

## Challenge 5: Chat Disappearing After Closure

### Problem
When the 30-minute chat window expired or the poster closed the chat, the backend returned `403 Forbidden` on the GET messages endpoint. The frontend caught this as an error and unmounted the entire chat component, erasing all visible message history.

### Solution
Introduced a read/write distinction in `validateChatAccess()`:
- **Reads (GET)**: Always allowed for participants — returns messages + `chat_closed: true` flag
- **Writes (POST)**: Blocked after expiry with 403

The frontend checks the flag and replaces the input form with a lock banner while keeping the conversation visible.

### Lesson Learned
Error states should preserve user data. Blanking the UI on an expected state change (expiry) is a poor UX pattern.

---

## Challenge 6: Multiple Sequential Database Round-Trips

### Problem
Three areas had sequential `await pool.query()` calls:
1. `getRFQs`: `SELECT NOW()` then `SELECT ... FROM rfq JOIN ...` (2 round-trips)
2. `getRFQById`: Same pattern (2 round-trips)
3. `validateChatAccess`: `SELECT rfq`, `SELECT bids`, `SELECT NOW()` (3 round-trips)

Each Neon round-trip takes 50–200ms over the network. Three sequential calls meant 150–600ms per chat load.

### Solution
Merged queries using inline `NOW()` and subqueries:
```sql
SELECT r.*, NOW() as db_now,
  (SELECT user_id FROM bids WHERE rfq_id = r.id
   ORDER BY bid_amount ASC LIMIT 1) as winner_id
FROM rfq r WHERE r.id = $1;
```

### Lesson Learned
With cloud-hosted databases, network latency per query matters far more than query execution time. Minimize round-trips, not query complexity.

---

## Challenge 7: Status Not Updating Without Page Refresh

### Problem
After removing HTTP polling in favor of WebSockets, the auction status badge stopped updating when `bid_close_time` passed. The `useMemo` that computed status only re-ran when `data` changed (from a socket event), but time passing didn't change `data`.

### Solution
A 1-second tick counter forces a re-render, and the status is computed as an immediately-invoked function expression (IIFE) that reads `Date.now()` fresh on every render cycle.

### Lesson Learned
Time-based UI transitions require an explicit render trigger. WebSockets solve data-change notifications, but not clock-based transitions.
