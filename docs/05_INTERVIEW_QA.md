# LazyList — Interview Questions & Answers

This document contains the most probable technical interview questions an interviewer might ask about this project, with detailed answers.

---

## Section 1: System Design & Architecture

### Q1: Why did you choose WebSockets over HTTP polling for real-time updates?
**Answer**: HTTP polling (`setInterval(fetchData, 5000)`) creates 12 unnecessary HTTP requests per minute per user, even when nothing has changed. Each request carries full HTTP headers, requires a new TCP handshake, and hits the database. WebSockets maintain a single persistent TCP connection where the server pushes data only when it changes. For a bidding system where updates are bursty (concentrated during active auctions), this is far more efficient — O(events) instead of O(time × users).

### Q2: How does your WebSocket room system work?
**Answer**: Socket.io provides a "room" abstraction. When a user opens an auction detail page, the frontend emits `join-room` with `rfq-{id}`. The socket server adds that client to the room. When a bid is placed, the backend calls `io.to('rfq-{id}').emit('bid-updated', data)`, which broadcasts only to clients in that room. Chat uses a separate room `rfq-{id}-chat`. This scoping prevents users from receiving irrelevant updates from other auctions.

### Q3: What happens if the WebSocket connection drops mid-auction?
**Answer**: Socket.io has built-in reconnection logic. The client automatically attempts to reconnect with exponential backoff. On reconnect, it re-emits `join-room` to rejoin the auction room. However, any events missed during disconnection are lost. For critical consistency, the frontend loads the full current state from the REST API on mount, so a page refresh always gives the correct state. For production scale, you'd add a Redis adapter to persist missed events.

### Q4: Why not use Server-Sent Events (SSE) instead of WebSockets?
**Answer**: SSE is unidirectional (server → client). Our chat feature requires bidirectional communication (client → server for sending messages). WebSockets natively support both directions. Additionally, Socket.io provides room-based broadcasting, automatic reconnection, and fallback to HTTP long-polling — features we'd have to build manually with SSE.

### Q5: How would you scale this system to 10,000 concurrent users?
**Answer**: 
1. **Horizontal scaling**: Run multiple Node.js instances behind a load balancer with sticky sessions (required for Socket.io handshake)
2. **Redis adapter**: Use `@socket.io/redis-adapter` to sync WebSocket events across instances
3. **Redis caching**: Cache active auction data in Redis instead of querying PostgreSQL on every bid
4. **CDN for frontend**: Serve the Vite build from CloudFront/S3 to eliminate frontend load from the backend
5. **Database connection pooling**: Use PgBouncer or Neon's built-in pooler to prevent connection exhaustion

---

## Section 2: Authentication & Security

### Q6: How does your Google OAuth flow work? Why verify the token server-side?
**Answer**: The frontend uses Google Identity Services (GIS) SDK to get an ID Token. This token is a JWT signed by Google. The backend verifies it using `google-auth-library`'s `verifyIdToken()`, which checks the signature against Google's public keys, validates the audience (our client ID), and extracts the payload (email, name, picture). We verify server-side because the client can be compromised — any token sent from the frontend must be treated as untrusted input until cryptographically verified.

### Q7: How do you prevent users from bidding on their own auctions?
**Answer**: In `bidController.js`, before processing a bid, we compare `req.user.id` (from the JWT) with `rfq.created_by` (from the database). If they match, the request is rejected with a 403 error. The frontend also hides the bid form for the auction poster, but the backend check is the authoritative security boundary.

### Q8: How do you handle JWT expiration?
**Answer**: JWTs are issued with `expiresIn: '8h'`. The frontend stores the token in memory (AuthContext). When the token expires, API calls return 401. The frontend catches this and redirects to the login page. We don't use refresh tokens in this version — the 8-hour window matches a typical workday session.

### Q9: Can a user escalate their role to admin?
**Answer**: No. The role is set at registration time (default: `user`). Admin role can only be assigned via direct database modification. The JWT payload includes the role, but even if someone modifies the client-side token, the `authMiddleware` re-verifies the JWT signature with the server's `JWT_SECRET`, which would detect tampering.

---

## Section 3: Database & Performance

### Q10: Why did you choose Neon PostgreSQL over AWS RDS?
**Answer**: Neon offers a serverless PostgreSQL with a generous free tier, automatic scaling, and branching. For a project of this scale, it eliminates the operational overhead of managing an RDS instance (patching, backups, scaling). The tradeoff is cold-start latency on the free tier, which we mitigate with a keep-alive ping.

### Q11: How did you optimize database query performance?
**Answer**: Three specific optimizations:
1. **Eliminated separate `SELECT NOW()` calls** — inlined `NOW()` directly into the main JOIN query, cutting round-trips in half for list and detail pages
2. **Merged 3 validation queries into 1** — the chat validation function used to make 3 sequential queries (fetch RFQ, fetch winner, fetch NOW). Now it's a single query with a subquery
3. **Connection keep-alive** — a `SELECT 1` ping every 4 minutes prevents Neon's cold-start delay

### Q12: Why not add database indexes?
**Answer**: We tested PostgreSQL indexes (`CREATE INDEX` on messages, bids, rfq tables). For our current data volume, the indexes added overhead to write operations without meaningful read improvement, and caused unexpected latency spikes during the index creation phase on the serverless database. At larger data volumes (thousands of RFQs, millions of bids), indexes would become essential.

### Q13: How does the auto-extension mechanism prevent race conditions?
**Answer**: The bid placement logic runs in a single Node.js process (single-threaded event loop), and the extension check + update happens in sequential `await` calls within the same request handler. PostgreSQL's `UPDATE ... RETURNING *` is atomic. For multi-server scaling, you'd wrap the bid placement in a database transaction with row-level locking (`SELECT ... FOR UPDATE`).

---

## Section 4: Frontend & React

### Q14: Explain the optimistic UI pattern you used for chat.
**Answer**: When the user sends a message, we immediately append it to the local `messages` state with a temporary ID and `sending: true` flag. The UI renders it instantly. The actual HTTP POST happens in the background. On success, we replace the temp message with the server-confirmed version. On failure, we set `failed: true` and show a retry indicator. When the Socket.io broadcast arrives from the server, we deduplicate by checking if a temp message with matching content exists.

### Q15: Why does your live status use a 1-second interval instead of `useMemo`?
**Answer**: `useMemo` recomputes only when its dependencies change. But the auction status depends on `Date.now()` — time passes without changing any React state. A `useMemo([data])` would only recompute when `data` changes (from a socket event), not when the clock ticks past `bid_close_time`. The 1-second interval forces a re-render by updating a `tick` state variable, and the status is recomputed with a fresh `Date.now()` on each render.

### Q16: What was the React Rules of Hooks error you encountered?
**Answer**: I placed a `useMemo` after conditional early returns (`if (loading) return <Skeleton />`). When `loading` was `true`, `useMemo` was skipped. When `loading` became `false`, it was called — React detected a different number of hooks between renders. The fix was moving all hooks above the early returns, with a `null` guard inside the hook body.

### Q17: How do you handle component cleanup for WebSocket connections?
**Answer**: The `useEffect` return function handles cleanup:
```js
return () => {
  socket.emit('leave-room', `rfq-${id}`)
  socket.disconnect()
}
```
This fires on component unmount (navigation away) and on dependency changes (navigating to a different auction). It ensures no orphaned socket connections or memory leaks.

---

## Section 5: Real-Time Chat System

### Q18: How does the 30-minute auto-close work?
**Answer**: The backend computes elapsed time on every API call: `Date.now() - actualCloseTime`. If > 30 minutes, writes are blocked (403), but reads return messages with `chat_closed: true`. The frontend shows a countdown timer using a `useEffect` interval. When the timer expires or the `error` state is set, the timer clears and the input is replaced with a lock banner.

### Q19: Why did you separate read and write validation for chat?
**Answer**: Originally, both GET and POST used the same `validateChatAccess()` which returned `403` for expired chats. This blocked message history access, which is a poor UX — users couldn't review what was discussed. By adding an `isWrite` parameter, reads are always allowed for participants (returning a `chat_closed` flag instead of an error), while writes are strictly blocked.

### Q20: How do you prevent message duplication with optimistic UI + WebSockets?
**Answer**: Three-layer deduplication:
1. **By real ID**: `if (prev.some(m => m.id === msg.id)) return prev` — skip if the server-confirmed message already exists
2. **By temp match**: `prev.findIndex(m => m.id.startsWith('temp-') && m.content === msg.content)` — replace the optimistic placeholder
3. **Append**: If neither match, it's a message from the other user — append normally

---

## Section 6: DevOps & Deployment

### Q21: Explain your CI/CD pipeline.
**Answer**: GitHub Actions triggers on push to `main`. Two parallel jobs:
1. **Backend**: SSH into EC2 via `appleboy/ssh-action`, runs `git pull` and `docker compose up --build` to rebuild the container
2. **Frontend**: Checks out code, installs deps, runs `npm run build` with production env vars injected from GitHub Secrets, then SCPs the `dist/` folder to EC2 where Nginx serves it

### Q22: Why Docker for the backend?
**Answer**: Docker ensures the production environment is identical to development — same Node.js version, same dependency tree, no "works on my machine" issues. The multi-stage Dockerfile keeps the final image small by only including production dependencies. It also makes deployment idempotent — `docker compose up --build` always produces a clean, reproducible environment.

### Q23: How do you manage secrets in production?
**Answer**: Environment variables are stored in GitHub Secrets (for CI/CD) and in `.env` files on the EC2 instance (for runtime). The `.gitignore` excludes all `.env` files from version control. The `.env.example` files document required variables without exposing real values.

---

## Section 7: System Design Deep Dives

### Q24: How would you add email notifications?
**Answer**: Use Nodemailer with Gmail SMTP or AWS SES. Create a notification service that's called from the bid controller (new bid placed, outbid, auction closed). Queue emails asynchronously using a simple in-memory queue or Redis Bull queue to avoid blocking the API response.

### Q25: How would you implement pagination for the RFQ list?
**Answer**: Add `LIMIT $1 OFFSET $2` to the SQL query. Frontend sends `?page=1&limit=20`. Backend returns `{ data: [...], total: 150, page: 1, totalPages: 8 }`. For infinite scroll, use cursor-based pagination with `WHERE r.created_at < $lastTimestamp` for consistent ordering.

### Q26: What would change if you moved from Neon to AWS RDS?
**Answer**: 
- Remove the keep-alive ping (RDS is always-on)
- Change `DATABASE_URL` to the RDS endpoint
- Remove `ssl: { rejectUnauthorized: false }` if using VPC internal connections
- Place RDS in the same VPC/subnet as EC2 for < 2ms latency
- Add connection pooling via PgBouncer if scaling beyond a single server

### Q27: How would you add rate limiting?
**Answer**: Use `express-rate-limit` middleware. Configure per-route limits: 100 req/min for general API, 10 req/min for bid placement, 30 req/min for message sending. Store rate limit counters in Redis for multi-server consistency.

---

## Section 8: Behavioral / Decision Questions

### Q28: What was the hardest bug you encountered?
**Answer**: The stale closure bug in the status transition timer. A `setTimeout` was scheduled to fire when `bid_close_time` arrived, but the callback captured a stale `computeStatus()` function from when the effect was created. When the timer fired, `Date.now()` evaluated from the old closure, not the current time. Debugging this required understanding JavaScript closures, React's memoization model, and how `useCallback` dependencies affect captured values. The fix was replacing the complex timeout with a simple 1-second tick counter.

### Q29: If you could rebuild this project from scratch, what would you change?
**Answer**: 
1. Use TypeScript from the start for type safety across the full stack
2. Use Redis from day one for session management and real-time message caching
3. Implement cursor-based pagination early instead of loading all RFQs at once
4. Use a proper error boundary and toast notification system instead of alert/confirm dialogs
5. Add comprehensive integration tests with a test database

### Q30: Why did you choose this tech stack over alternatives?
**Answer**: React + Express + PostgreSQL is the most widely adopted full-stack combination for real-time web apps. Socket.io was chosen over raw WebSockets for its room abstraction, reconnection handling, and HTTP polling fallback. Neon was chosen over self-hosted PostgreSQL for zero operational overhead. This stack prioritizes developer velocity and ecosystem maturity over bleeding-edge performance.
