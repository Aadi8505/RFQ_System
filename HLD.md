# High-Level Design (HLD) — British Auction RFQ System

## 1. System Overview

A full-stack RFQ (Request for Quotation) system implementing British Auction–style competitive bidding. Buyers create auctions where suppliers submit quotes; the system automatically extends the auction deadline when bidding activity occurs near the close time, ensuring fair competition and preventing last-second manipulation.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                               │
│                                                                             │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────────┐   │
│  │ Create RFQ   │    │ Auction Listing  │    │ Auction Detail Page     │   │
│  │ Page         │    │ Page             │    │ ┌────────┬─────────────┐│   │
│  │              │    │                  │    │ │Rankings│ Submit Quote ││   │
│  │ • Name       │    │ • All Auctions   │    │ │Activity│ Form        ││   │
│  │ • Timing     │    │ • Status Filter  │    │ │Config  │             ││   │
│  │ • Config     │    │ • Auto-refresh   │    │ └────────┴─────────────┘│   │
│  └──────┬───────┘    └────────┬─────────┘    └──────────┬─────────────┘   │
│         │                     │                          │                  │
│         └─────────────────────┼──────────────────────────┘                  │
│                               │                                             │
│                    ┌──────────▼──────────┐                                  │
│                    │   API Service Layer  │ ← Axios HTTP Client             │
│                    │   (services/api.js)  │                                  │
│                    └──────────┬──────────┘                                  │
└───────────────────────────────┼──────────────────────────────────────────────┘
                                │ HTTP/JSON (REST)
                                │ Port 5173 → 5000
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js + Express)                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Express Middleware                              │ │
│  │                    CORS · JSON Parser · Error Handler                   │ │
│  └─────────────────────────────┬───────────────────────────────────────────┘ │
│                                │                                             │
│  ┌─────────────────────────────▼───────────────────────────────────────────┐ │
│  │                            Routes                                       │ │
│  │  POST /api/rfq    GET /api/rfqs    GET /api/rfq/:id    POST /api/bid   │ │
│  └────────┬──────────────┬────────────────┬───────────────────┬────────────┘ │
│           │              │                │                   │              │
│  ┌────────▼──────────────▼────────────────▼───────────────────▼────────────┐ │
│  │                         Controllers                                     │ │
│  │                                                                         │ │
│  │  rfqController.js                    bidController.js                   │ │
│  │  ├─ createRFQ()                      └─ placeBid()                     │ │
│  │  │  • Validate fields & timing          • 12-step auction logic        │ │
│  │  │  • Support both time formats         • Trigger window calculation   │ │
│  │  ├─ getRFQs()                           • Extension decision engine    │ │
│  │  │  • Join with bids for lowest bid     • Audit trail logging          │ │
│  │  │  • Compute status dynamically        • Rank tracking (L1/L2/L3)    │ │
│  │  └─ getRFQById()                        • Forced close enforcement     │ │
│  │     • Rankings with quote details                                      │ │
│  │     • Audit log (activity trail)                                       │ │
│  │     • Auction config                                                   │ │
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
│  ┌────────────────┐   ┌──────────────────┐   ┌──────────────────────────┐   │
│  │      rfq       │   │      bids        │   │      rfq_audit           │   │
│  │                │   │                  │   │                          │   │
│  │ id (PK)       │◄──│ rfq_id (FK)      │   │ id (PK)                 │   │
│  │ name          │   │ id (PK)          │   │ rfq_id (FK)        ◄────┤   │
│  │ bid_start_time│   │ bid_amount       │   │ action                  │   │
│  │ bid_close_time│   │ carrier_name     │   │ old_bid_close_time      │   │
│  │ forced_close  │   │ freight_charges  │   │ new_bid_close_time      │   │
│  │ service_date  │   │ origin_charges   │   │ changed_by              │   │
│  │ trigger_window│   │ destination_chg  │   │ changed_at              │   │
│  │ extension_dur │   │ transit_time     │   │                          │   │
│  │ trigger_type  │   │ validity         │   │ Tracks:                  │   │
│  │ created_at    │   │ created_at       │   │ • Bid submissions        │   │
│  │ updated_at    │   │                  │   │ • Time extensions        │   │
│  └────────────────┘   └──────────────────┘   └──────────────────────────┘   │
│                                                                              │
│  Indexes: rfq_id, bid_amount, bid_close_time, created_at, changed_at        │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow — Bid Placement (Core Logic)

```
Supplier submits bid
        │
        ▼
  ┌─────────────┐     ┌───────────────┐     ┌──────────────────┐
  │ 1. Validate  │────▶│ 2. Fetch RFQ  │────▶│ 3. Get DB Time   │
  │    Input     │     │    by ID      │     │    (SELECT NOW()) │
  └─────────────┘     └───────────────┘     └────────┬─────────┘
                                                      │
        ┌─────────────────────────────────────────────┘
        ▼
  ┌─────────────────┐     ┌──────────────────┐     ┌───────────────┐
  │ 4. Check Timing  │────▶│ 5. Get Current   │────▶│ 6. Determine  │
  │ • Not started?   │     │    Rankings      │     │    if L1       │
  │ • Force-closed?  │     │    (lowest bid)  │     │    (1st/lower) │
  │ • Normal closed? │     └──────────────────┘     └───────┬───────┘
  └─────────────────┘                                       │
                                                            ▼
  ┌───────────────────┐     ┌───────────────────┐     ┌─────────────┐
  │ 7. Insert Bid     │────▶│ 7.5 Log Bid in   │────▶│ 8. Calculate │
  │    into DB        │     │     Audit Trail   │     │ Trigger      │
  └───────────────────┘     └───────────────────┘     │ Window       │
                                                      └──────┬──────┘
        ┌─────────────────────────────────────────────────────┘
        ▼
  ┌───────────────────────────────────────────────┐
  │ 9. Extension Decision (within trigger window?) │
  │                                                │
  │  ANY_BID ──────▶ Always extend                 │
  │  ANY_RANK_CHANGE ▶ Extend if rankings changed  │
  │  L1_CHANGE ────▶ Extend if new L1              │
  └────────────────────┬──────────────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
  ┌──────────────────┐   ┌──────────────────┐
  │ 10. Extend:      │   │ 10. No extend:   │
  │ • new_close =    │   │ • Return bid     │
  │   close + Y min  │   │   result         │
  │ • Cap at forced  │   └──────────────────┘
  │ • Log extension  │
  │   in audit trail │
  └────────┬─────────┘
           ▼
  ┌──────────────────────────────────────┐
  │ 11. Return Response                   │
  │ • Bid rank (L1/L2/…)                 │
  │ • Extension info (reason, new time)  │
  │ • Updated rankings                    │
  └──────────────────────────────────────┘
```

---

## 4. Component Breakdown

### Frontend (React + Vite)

| Component | File | Purpose |
|-----------|------|---------|
| Navbar | `components/Navbar.jsx` | Top navigation bar |
| StatusBadge | `components/StatusBadge.jsx` | Colored status indicator |
| AuctionListPage | `pages/AuctionListPage.jsx` | List all auctions with filtering |
| AuctionDetailPage | `pages/AuctionDetailPage.jsx` | Rankings, activity log, bid form |
| CreateRFQPage | `pages/CreateRFQPage.jsx` | RFQ creation with config preview |
| API Service | `services/api.js` | Axios client for backend calls |

### Backend (Node.js + Express)

| Module | File | Purpose |
|--------|------|---------|
| Server | `index.js` | Express setup, middleware, error handling |
| DB Config | `config/db.js` | PostgreSQL connection pool (Neon + SSL) |
| RFQ Controller | `controllers/rfqController.js` | Create/list/detail RFQ endpoints |
| Bid Controller | `controllers/bidController.js` | 12-step bid placement with auction logic |
| Routes | `routes/*.js` | REST endpoint definitions |

---

## 5. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Database time sync (`SELECT NOW()`) | Avoids timezone drift between JS runtime and PostgreSQL |
| Dual time input (minutes-from-now + ISO) | Minutes-from-now is simpler for UI; ISO supports API clients |
| Extension capped at forced_close_time | Hard requirement — auction must stop by forced close |
| Audit trail for both bids and extensions | Complete activity history for transparency |
| Polling (5s/10s) over WebSockets | Simpler to implement; sufficient for assignment scope |
| Rank change detection before bid insert | Captures pre-insert state for accurate trigger decisions |

---

## 6. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + Vite | Fast HMR, modern tooling |
| HTTP Client | Axios | Promise-based, interceptors |
| Routing | React Router v6 | Declarative client routing |
| Backend | Express.js | Minimal, flexible Node.js framework |
| Database | PostgreSQL (Neon) | Relational, ACID, serverless hosting |
| DB Driver | node-postgres (pg) | Native PostgreSQL driver with pooling |

---

## 7. API Contract

| Endpoint | Method | Purpose | Key Response Fields |
|----------|--------|---------|---------------------|
| `/api/rfq` | POST | Create RFQ | `success`, `data` (created RFQ) |
| `/api/rfqs` | GET | List all RFQs | `data[]` with status, lowest_bid |
| `/api/rfq/:id` | GET | RFQ details | `rfq`, `rankings`, `activity_log`, `auction_config` |
| `/api/bid` | POST | Place bid | `bid` (rank, is_l1), `extension`, `rankings` |
| `/api/health` | GET | Health check | `message` |
