# RFQ Auction System

A full-stack British Auction RFQ (Request for Quotation) system where buyers create auctions, suppliers compete by submitting price quotes, and the system automatically extends the auction deadline when bidding activity occurs near closing time — ensuring fair competition and preventing last-second bid sniping.

**Now with JWT Authentication & Role-Based Access Control.**

## Tech Stack

- **Frontend:** React 19, Vite 8, React Router 7, Axios
- **Backend:** Node.js, Express 4
- **Database:** PostgreSQL (Neon Cloud, serverless)
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **Architecture:** 3-Tier, Modular RESTful API

## User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Create RFQ auctions, manage users (create/edit/delete), view all auctions |
| **User** | View auctions, view rankings, place bids |

**Default admin credentials (seeded on first run):**
```
Email:    admin@rfq.com
Password: admin123
```
> ⚠️ Change these immediately in any non-local environment.

## Project Structure

```
RFQ_System/
├── backend/                    # Node.js + Express API Server
│   ├── index.js               # Express entry point — routes + middleware
│   ├── config/
│   │   └── db.js              # PostgreSQL connection pool (Neon + SSL)
│   ├── controllers/
│   │   ├── authController.js  # Login, user CRUD, table auto-seeding
│   │   ├── rfqController.js   # Create/List/Detail RFQ logic
│   │   └── bidController.js   # 12-step bid placement + auction logic
│   ├── middleware/
│   │   └── authMiddleware.js  # JWT verify (authenticate) + role guard (requireAdmin)
│   ├── routes/
│   │   ├── authRoutes.js      # /auth/login, /auth/me, /users CRUD
│   │   ├── rfqRoutes.js       # POST /api/rfq, GET /api/rfqs, GET /api/rfq/:id
│   │   ├── bidRoutes.js       # POST /api/bid
│   │   └── healthRoutes.js    # GET /api/health
│   ├── .env                   # Environment variables (see below)
│   ├── .env.example           # Template for env vars
│   └── package.json
│
├── frontend/                   # React + Vite SPA
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx           # React entry — BrowserRouter + AuthProvider
│       ├── App.jsx            # Root component — routes + ProtectedRoute
│       ├── index.css          # Global design system (dark theme)
│       ├── context/
│       │   └── AuthContext.jsx # Global auth state: token, user, login(), logout()
│       ├── components/
│       │   ├── Navbar.jsx     # Navigation + logout + role badge
│       │   └── StatusBadge.jsx # Colored auction status indicator
│       ├── pages/
│       │   ├── LoginPage.jsx        # Email/password login form
│       │   ├── AuctionListPage.jsx  # Home — all auctions with filters
│       │   ├── AuctionDetailPage.jsx # Rankings + bid form + activity log
│       │   ├── CreateRFQPage.jsx    # Create auction form (admin only)
│       │   └── UserManagementPage.jsx # Manage users (admin only)
│       └── services/
│           └── api.js         # Axios HTTP client (injects auth token)
│
├── HLD.md                     # High-Level Design (original, pre-auth)
├── HLD_v2.md                  # High-Level Design v2 (with JWT auth)
├── database-schema.sql        # PostgreSQL DDL — original 3 tables
├── database-schema-v2.sql     # PostgreSQL DDL v2 — all 4 tables (+ users)
├── docs/                      # Additional documentation
└── interview_prep/            # Interview preparation guides
```

## Quick Start

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) PostgreSQL database (free tier works)

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env

# Run development server (auto-reload via nodemon)
npm run dev
```

The backend runs on `http://localhost:5000`.

**First run:** The `users` table and a default admin are seeded automatically.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The frontend runs on `http://localhost:5173` and connects to the backend on `http://localhost:5000`.

## Environment Variables

Create `backend/.env` with the following:

```env
# Server
PORT=5000

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# JWT Authentication
JWT_SECRET=your_strong_random_secret_here
JWT_EXPIRES_IN=8h
```

> ⚠️ `JWT_SECRET` must be a long, random string in production. Never commit `.env` to version control.

## API Overview

### Public Endpoints (no auth required)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/login` | Login — returns JWT token |
| GET | `/api/health` | Server health check |

### Authenticated Endpoints (Bearer token required)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/auth/me` | Get current user profile |
| GET | `/api/rfqs` | List all auctions |
| GET | `/api/rfq/:id` | Get auction detail + rankings |
| POST | `/api/rfq` | Create new auction |
| POST | `/api/bid` | Place a bid |

### Admin-Only Endpoints (Bearer token + admin role)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create a new user |
| PUT | `/api/users/:id` | Update a user |
| DELETE | `/api/users/:id` | Delete a user |

## Development

Both frontend and backend support hot-reload during development. Start each in separate terminal sessions.

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

## Documentation

| File | Contents |
|------|----------|
| `HLD_v2.md` | Full architecture, auth flow, RBAC, API contract (latest) |
| `HLD.md` | Original architecture (pre-auth, for reference) |
| `database-schema-v2.sql` | All 4 tables including users (latest) |
| `database-schema.sql` | Original 3 tables (for reference) |
| `interview_prep/` | Modular interview preparation guides |