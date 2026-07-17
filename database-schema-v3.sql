-- RFQ Marketplace System - PostgreSQL Schema v3
-- Fresh schema for new Neon database
-- Execute this ONCE on your new Neon database

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. USERS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password      VARCHAR(255),                              -- NULL for Google-only users
  role          VARCHAR(20)   NOT NULL DEFAULT 'user'
                CHECK (role IN ('admin', 'user')),
  auth_provider VARCHAR(20)   NOT NULL DEFAULT 'local'
                CHECK (auth_provider IN ('local', 'google')),
  google_id     VARCHAR(255)  UNIQUE,                      -- Google OAuth sub ID
  avatar_url    TEXT,                                       -- Profile picture URL (from Google or uploaded)
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_google_id   ON users(google_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. CATEGORIES TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon        VARCHAR(50),                                  -- emoji or icon class name
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default categories
INSERT INTO categories (name, description, icon) VALUES
  ('Freight & Logistics', 'Shipping, transport, and freight services', 'freight'),
  ('IT & Software', 'Software development, IT support, cloud services', 'it'),
  ('Construction', 'Building, renovation, and construction services', 'construction'),
  ('Cleaning', 'Commercial and residential cleaning services', 'cleaning'),
  ('Electrical', 'Electrical installation, repair, and maintenance', 'electrical'),
  ('Plumbing', 'Plumbing installation and repair services', 'plumbing'),
  ('Catering', 'Food catering and event meal services', 'catering'),
  ('Security', 'Security personnel and surveillance services', 'security'),
  ('Marketing', 'Digital marketing, advertising, and branding', 'marketing'),
  ('Consulting', 'Business consulting and advisory services', 'consulting'),
  ('Other', 'Services that do not fit other categories', 'other')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. RFQ TABLE (Service Auctions) — now with created_by and category_id
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rfq (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,                                  -- NEW: detailed description of the service needed
  category_id         INTEGER REFERENCES categories(id),     -- NEW: FK to categories
  created_by          INTEGER NOT NULL REFERENCES users(id), -- NEW: the user who posted this auction
  bid_start_time      TIMESTAMPTZ NOT NULL,
  bid_close_time      TIMESTAMPTZ NOT NULL,
  forced_close_time   TIMESTAMPTZ NOT NULL,
  service_date        TIMESTAMP NOT NULL,
  trigger_window      INTEGER DEFAULT 10,
  extension_duration  INTEGER DEFAULT 5,
  trigger_type        VARCHAR(50) DEFAULT 'ANY_BID'
                      CHECK (trigger_type IN ('ANY_BID', 'ANY_RANK_CHANGE', 'L1_CHANGE')),
  status              VARCHAR(20) DEFAULT 'upcoming'
                      CHECK (status IN ('upcoming', 'active', 'closed', 'force_closed', 'completed')),
  created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rfq_created_by       ON rfq(created_by);
CREATE INDEX IF NOT EXISTS idx_rfq_category_id      ON rfq(category_id);
CREATE INDEX IF NOT EXISTS idx_rfq_status           ON rfq(status);
CREATE INDEX IF NOT EXISTS idx_rfq_bid_close_time   ON rfq(bid_close_time);
CREATE INDEX IF NOT EXISTS idx_rfq_bid_start_time   ON rfq(bid_start_time);
CREATE INDEX IF NOT EXISTS idx_rfq_created_at       ON rfq(created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. BIDS TABLE — now with user_id to track who placed the bid
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bids (
  id                    SERIAL PRIMARY KEY,
  rfq_id                INTEGER NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  user_id               INTEGER NOT NULL REFERENCES users(id),  -- NEW: the user who placed this bid
  bid_amount            DECIMAL(12, 2) NOT NULL,
  carrier_name          VARCHAR(255),
  freight_charges       DECIMAL(12, 2) DEFAULT 0,
  origin_charges        DECIMAL(12, 2) DEFAULT 0,
  destination_charges   DECIMAL(12, 2) DEFAULT 0,
  transit_time          VARCHAR(100),
  validity              VARCHAR(100),
  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bids_rfq_id     ON bids(rfq_id);
CREATE INDEX IF NOT EXISTS idx_bids_user_id    ON bids(user_id);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at);
CREATE INDEX IF NOT EXISTS idx_bids_amount     ON bids(bid_amount);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. AUDIT LOG TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rfq_audit (
  id                  SERIAL PRIMARY KEY,
  rfq_id              INTEGER NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  action              VARCHAR(255),
  old_bid_close_time  TIMESTAMPTZ,
  new_bid_close_time  TIMESTAMPTZ,
  changed_by          VARCHAR(100) DEFAULT 'system',
  changed_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rfq_audit_rfq_id     ON rfq_audit(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_audit_changed_at ON rfq_audit(changed_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. MESSAGES TABLE (Post-Auction Chat)
--    Only between the auction poster and the winning bidder (L1)
--    Only accessible after auction is closed/force_closed
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS messages (
  id          SERIAL PRIMARY KEY,
  rfq_id      INTEGER NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_rfq_id      ON messages(rfq_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id    ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id  ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at   ON messages(created_at);
