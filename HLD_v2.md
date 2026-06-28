# High-Level Design (HLD) — British Auction RFQ System v2
# (Updated: JWT Authentication + Role-Based Access Control)

> **Version 2** — Added JWT-based authentication, database-backed user management, and role-based access control (RBAC). See `HLD.md` for the original pre-auth version.

---

## 1. System Overview

A full-stack RFQ (Request for Quotation) system implementing British Auction–style competitive bidding, now secured with JWT authentication and role-based access control. Users must log in before accessing any part of the system. Admins can create auctions and manage users; regular users can monitor auctions and place bids.

---

## 2. Architecture Diagram (v2 — with Auth Layer)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                               │
│                                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  Login Page │  │ Auction List │  │ Auction Detail │  │ User Mgmt     │  │
│  │             │  │ Page         │  │ Page           │  │ Page (Admin)  │  │
│  │ • email     │  │ (all users)  │  │ • Rankings     │  │ • List Users  │  │
│  │ • password  │  │              │  │ • Bid Form     │  │ • Create User │  │
│  └──────┬──────┘  └──────────────┘  │   (users only) │  │ • Edit/Delete │  │
│         │                           └────────────────┘  └───────────────┘  │
│         │ POST /api/auth/login                                              │
│         │ ← token (JWT) + user object                                       │
│         │                                                                   │
│  ┌──────▼────────────────────────────────────────────────────────────────┐  │
│  │                         AuthContext (React Context API)               │  │
│  │  • Stores: token, user { id, name, email, role }                     │  │
│  │  • Persists to localStorage (rfq_token, rfq_user)                    │  │
│  │  • Exposes: login(), logout(), isAdmin, isUser                        │  │
│  └──────────────────────────────┬─────────────────────────────────────────┘  │
│                                 │                                             │
│                    ┌────────────▼────────────┐                               │
│                    │   API Service Layer      │ ← Axios with                  │
│                    │   (services/api.js)      │   Authorization: Bearer       │
│                    └────────────┬────────────┘   header injected             │
└────────────────────────────────┼──────────────────────────────────────────────┘
                                 │ HTTP/JSON (REST)
                                 │ Port 5173 → 5000
                                 ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js + Express)                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Express Middleware                              │ │
│  │            CORS · JSON Parser · Error Handler                           │ │
│  └─────────────────────────────┬───────────────────────────────────────────┘ │
│                                │                                             │
│  ┌─────────────────────────────▼───────────────────────────────────────────┐ │
│  │                       Auth Middleware Layer (NEW)                       │ │
│  │                                                                         │ │
│  │  authenticate()                         requireAdmin()                  │ │
│  │  • Reads Authorization header           • Checks req.user.role         │ │
│  │  • Verifies JWT with JWT_SECRET         • Returns 403 if not admin     │ │
│  │  • Attaches req.user = {id, email,      • Used on admin-only routes    │ │
│  │    role, name}                                                          │ │
│  └─────────────────────────────┬───────────────────────────────────────────┘ │
│                                │                                             │
│  ┌─────────────────────────────▼───────────────────────────────────────────┐ │
│  │                            Routes                                       │ │
│  │                                                                         │ │
│  │  PUBLIC (no auth)          AUTHENTICATED             ADMIN ONLY         │ │
│  │  POST /api/auth/login      GET /api/auth/me          GET /api/users     │ │
│  │  GET  /api/health          GET /api/rfqs             POST /api/users    │ │
│  │                            GET /api/rfq/:id          PUT /api/users/:id │ │
│  │                            POST /api/rfq             DEL /api/users/:id │ │
│  │                            POST /api/bid                                │ │
│  └────────┬──────────────┬────────────────┬───────────────────┬────────────┘ │
│           │              │                │                   │              │
│  ┌────────▼──────────────▼────────────────▼───────────────────▼────────────┐ │
│  │                         Controllers                                     │ │
│  │                                                                         │ │
│  │  authController.js          rfqController.js    bidController.js        │ │
│  │  ├─ login()                 ├─ createRFQ()      └─ placeBid()           │ │
│  │  ├─ getMe()                 ├─ getRFQs()            • 12-step logic     │ │
│  │  ├─ getAllUsers()           └─ getRFQById()          • Extension engine  │ │
│  │  ├─ createUser()                                    • Audit trail       │ │
│  │  ├─ updateUser()                                                        │ │
│  │  └─ deleteUser()                                                        │ │
│  └────────────────────────────┬────────────────────────────────────────────┘ │
│                               │ SQL (Parameterized Queries)                  │
│                               │                                              │
│  ┌────────────────────────────▼────────────────────────────────────────────┐ │
│  │                   Database Connection Pool                              │ │
│  │                   config/db.js (pg + SSL)                               │ │
│  └────────────────────────────┬────────────────────────────────────────────┘ │
└───────────────────────────────┼──────────────────────────────────────────────┘
                                │ TCP/SSL
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                     DATABASE (PostgreSQL — Neon Cloud)                        │
│                                                                              │
│  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌─────────────┐  │
│  │     users (NEW) │ │      rfq         │ │    bids      │ │  rfq_audit  │  │
│  │                 │ │                  │ │              │ │             │  │
│  │ id (PK)        │ │ id (PK)         │ │ id (PK)      │ │ id (PK)     │  │
│  │ name           │ │ name            │ │ rfq_id (FK)  │ │ rfq_id (FK) │  │
│  │ email (UNIQUE) │ │ bid_start_time  │ │ bid_amount   │ │ action      │  │
│  │ password (hash)│ │ bid_close_time  │ │ carrier_name │ │ old_close   │  │
│  │ role           │ │ forced_close    │ │ charges...   │ │ new_close   │  │
│  │ is_active      │ │ trigger_window  │ │              │ │ changed_by  │  │
│  │ created_at     │ │ extension_dur   │ └──────────────┘ │ changed_at  │  │
│  │ updated_at     │ │ trigger_type    │                  └─────────────┘  │
│  └─────────────────┘ └──────────────────┘                                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Flow (NEW)

```
User visits app (no token)
        │
        ▼
   ┌────────────┐    Redirected by ProtectedRoute
   │ Login Page │◄────────────────────────────────
   └─────┬──────┘
         │ POST /api/auth/login
         │ { email, password }
         ▼
   ┌─────────────────────────────────────────────────────┐
   │ Backend: authController.login()                     │
   │                                                     │
   │ 1. Validate email + password present                │
   │ 2. SELECT user FROM users WHERE email = $1          │
   │    AND is_active = TRUE                             │
   │ 3. bcrypt.compare(password, user.password_hash)     │
   │ 4. Sign JWT: { id, email, role, name }              │
   │    → Expires in 8h (configurable via env)           │
   │ 5. Return { token, user }                           │
   └─────────────────────────────┬───────────────────────┘
                                 │
         ┌───────────────────────┘
         ▼
   ┌─────────────────────────────────────────────────────┐
   │ Frontend: AuthContext stores token + user           │
   │                                                     │
   │ • localStorage.setItem('rfq_token', token)          │
   │ • localStorage.setItem('rfq_user', JSON.stringify)  │
   │ • Axios adds: Authorization: Bearer <token>          │
   │   on every subsequent request                       │
   └─────────────────────────────┬───────────────────────┘
                                 │
         ┌───────────────────────┘
         ▼
   ┌─────────────────────────────────────────────────────┐
   │ Backend: authenticate() middleware                  │
   │                                                     │
   │ 1. Read Authorization header                        │
   │ 2. Split "Bearer <token>"                           │
   │ 3. jwt.verify(token, JWT_SECRET)                    │
   │ 4. If valid → attach req.user, call next()          │
   │ 5. If invalid/expired → 401 Unauthorized            │
   └─────────────────────────────────────────────────────┘
```

---

## 4. Role-Based Access Control (RBAC)

| Action | Admin | User |
|--------|-------|------|
| Login | ✅ | ✅ |
| View auction list | ✅ | ✅ |
| View auction detail | ✅ | ✅ |
| Create auction (POST /api/rfq) | ✅ | ❌ |
| Place bid (POST /api/bid) | ❌ | ✅ |
| Manage users (GET/POST/PUT/DELETE /api/users) | ✅ | ❌ |
| View own profile (GET /api/auth/me) | ✅ | ✅ |

> **Frontend enforcement:** Admin-only UI elements (Create RFQ button, User Management nav) are conditionally rendered based on `isAdmin` from AuthContext.
> **Backend enforcement:** `authenticate` + `requireAdmin` middleware on protected routes.

---

## 5. Data Flow — Bid Placement (Updated with Auth)

```
Supplier submits bid (authenticated user with role="user")
        │
        ├─ Token in Authorization header
        │
        ▼
   authenticate() middleware
   • Verifies JWT
   • Attaches req.user = { id, email, role: "user", name }
        │
        ▼
   [Original 12-step bid logic unchanged]
   1. Validate input         7. Insert bid into DB
   2. Check bid > 0          8. Log bid in audit trail
   3. Fetch RFQ              9. Check if in trigger window
   4. Get DB time (NOW())   10. Check trigger type match
   5. Check timing           11. Extend if triggered (cap at forced close)
   6. Get existing rankings  12. Return rank + extension info
```

---

## 6. Component Breakdown (v2)

### Frontend (React + Vite)

| Component | File | Purpose | Auth Requirement |
|-----------|------|---------|------------------|
| AuthContext | `context/AuthContext.jsx` | Global auth state + login/logout | — |
| LoginPage | `pages/LoginPage.jsx` | Email/password login form | Public |
| Navbar | `components/Navbar.jsx` | Navigation + logout + role display | Any logged-in user |
| StatusBadge | `components/StatusBadge.jsx` | Colored status indicator | Any logged-in user |
| AuctionListPage | `pages/AuctionListPage.jsx` | List all auctions with filtering | Any logged-in user |
| AuctionDetailPage | `pages/AuctionDetailPage.jsx` | Rankings, activity log, bid form | Any (bid form: user only) |
| CreateRFQPage | `pages/CreateRFQPage.jsx` | RFQ creation with config preview | Admin only |
| UserManagementPage | `pages/UserManagementPage.jsx` | CRUD interface for managing users | Admin only |
| API Service | `services/api.js` | Axios client with auth token header | — |

### Backend (Node.js + Express)

| Module | File | Purpose |
|--------|------|---------|
| Server | `index.js` | Express setup, middleware, error handling |
| DB Config | `config/db.js` | PostgreSQL connection pool (Neon + SSL) |
| Auth Controller | `controllers/authController.js` | Login, user CRUD, table auto-seeding |
| Auth Middleware | `middleware/authMiddleware.js` | JWT verify + role guard |
| RFQ Controller | `controllers/rfqController.js` | Create/list/detail RFQ endpoints |
| Bid Controller | `controllers/bidController.js` | 12-step bid placement with auction logic |
| Auth Routes | `routes/authRoutes.js` | `/auth/*` and `/users/*` endpoint definitions |
| RFQ Routes | `routes/rfqRoutes.js` | `/rfq/*` and `/rfqs` endpoint definitions |
| Bid Routes | `routes/bidRoutes.js` | `/bid` endpoint definition |

---

## 7. Key Design Decisions (v2 additions)

| Decision | Rationale |
|----------|-----------| 
| JWT over sessions | Stateless — no server-side session store needed; scales horizontally |
| bcryptjs (cost=10) | Industry-standard password hashing; cost=10 balances security and speed |
| Role stored in JWT payload | Avoids DB lookup on every request; acceptable since roles rarely change |
| 8h token expiry | Matches a workday; users re-authenticate daily |
| `is_active` flag (soft disable) | Disable users without losing historical data |
| `ensureUsersTable()` auto-seeding | Bootstraps default admin on first run; no manual migration step needed |
| Self-deletion prevented | Stops admin from accidentally locking everyone out |
| `requireAdmin` as separate middleware | Composable — can be added to any route without duplicating logic |

| Decision (original, retained) | Rationale |
|----------|-----------| 
| Database time sync (`SELECT NOW()`) | Avoids timezone drift between JS runtime and PostgreSQL |
| Dual time input (minutes-from-now + ISO) | Minutes-from-now is simpler for UI; ISO supports API clients |
| Extension capped at forced_close_time | Hard requirement — auction must stop by forced close |
| Audit trail for both bids and extensions | Complete activity history for transparency |
| Polling (5s/10s) over WebSockets | Simpler to implement; sufficient for assignment scope |

---

## 8. Technology Stack (v2)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + Vite | Fast HMR, modern tooling |
| Auth State | React Context API | Lightweight; no Redux needed for this scope |
| HTTP Client | Axios | Promise-based, interceptors for auth header |
| Routing | React Router v6 | Declarative client routing |
| Backend | Express.js | Minimal, flexible Node.js framework |
| Auth | jsonwebtoken | Industry-standard JWT library |
| Password Hashing | bcryptjs | Secure, adaptive hashing |
| Database | PostgreSQL (Neon) | Relational, ACID, serverless hosting |
| DB Driver | node-postgres (pg) | Native PostgreSQL driver with pooling |

---

## 9. API Contract (v2 — Full)

### Authentication & User Management

| Endpoint | Method | Auth Required | Purpose | Key Response Fields |
|----------|--------|---------------|---------|---------------------|
| `/api/auth/login` | POST | ❌ Public | Login | `token`, `user {id, name, email, role}` |
| `/api/auth/me` | GET | ✅ Any user | Get own profile | `user` object |
| `/api/users` | GET | ✅ Admin only | List all users | `users[]` |
| `/api/users` | POST | ✅ Admin only | Create new user | `user` object |
| `/api/users/:id` | PUT | ✅ Admin only | Update user | `user` object |
| `/api/users/:id` | DELETE | ✅ Admin only | Delete user | `message` |

### RFQ & Bidding

| Endpoint | Method | Auth Required | Purpose | Key Response Fields |
|----------|--------|---------------|---------|---------------------|
| `/api/rfq` | POST | ✅ Any user | Create RFQ | `success`, `data` (created RFQ) |
| `/api/rfqs` | GET | ✅ Any user | List all RFQs | `data[]` with status, lowest_bid |
| `/api/rfq/:id` | GET | ✅ Any user | RFQ details | `rfq`, `rankings`, `activity_log`, `auction_config` |
| `/api/bid` | POST | ✅ Any user | Place bid | `bid` (rank, is_l1), `extension`, `rankings` |
| `/api/health` | GET | ❌ Public | Health check | `message` |

---

## 10. Environment Variables (v2)

```env
PORT=5000
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
JWT_SECRET=your_strong_random_secret
JWT_EXPIRES_IN=8h
```
