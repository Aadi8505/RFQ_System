-- RFQ Auction System - PostgreSQL Schema
-- Execute this on your Neon database

-- Create rfq table
CREATE TABLE IF NOT EXISTS rfq (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  bid_start_time TIMESTAMPTZ NOT NULL,
  bid_close_time TIMESTAMPTZ NOT NULL,
  forced_close_time TIMESTAMPTZ NOT NULL,
  service_date TIMESTAMP NOT NULL,
  trigger_window INTEGER DEFAULT 10,          -- X minutes: monitor activity this many minutes before close
  extension_duration INTEGER DEFAULT 5,       -- Y minutes: how much time to add when triggered
  trigger_type VARCHAR(50) DEFAULT 'ANY_BID' CHECK (trigger_type IN ('ANY_BID', 'ANY_RANK_CHANGE', 'L1_CHANGE')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create bids table (quote submission)
CREATE TABLE IF NOT EXISTS bids (
  id SERIAL PRIMARY KEY,
  rfq_id INTEGER NOT NULL,
  bid_amount DECIMAL(12, 2) NOT NULL,
  carrier_name VARCHAR(255),                  -- Supplier / carrier name
  freight_charges DECIMAL(12, 2) DEFAULT 0,   -- Freight charges component
  origin_charges DECIMAL(12, 2) DEFAULT 0,    -- Origin charges component
  destination_charges DECIMAL(12, 2) DEFAULT 0,-- Destination charges component
  transit_time VARCHAR(100),                   -- e.g., "3 days"
  validity VARCHAR(100),                       -- Quote validity period, e.g., "7 days"
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bids_rfq_id ON bids(rfq_id);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at);
CREATE INDEX IF NOT EXISTS idx_bids_amount ON bids(bid_amount);
CREATE INDEX IF NOT EXISTS idx_rfq_bid_close_time ON rfq(bid_close_time);

-- Activity log / audit table for tracking bid submissions and time extensions
CREATE TABLE IF NOT EXISTS rfq_audit (
  id SERIAL PRIMARY KEY,
  rfq_id INTEGER NOT NULL,
  action VARCHAR(255),                         -- Description of what happened
  old_bid_close_time TIMESTAMPTZ,              -- NULL for bid submissions, set for extensions
  new_bid_close_time TIMESTAMPTZ,              -- NULL for bid submissions, set for extensions
  changed_by VARCHAR(100) DEFAULT 'system',
  changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rfq_id) REFERENCES rfq(id) ON DELETE CASCADE
);

-- Create indexes for rfq table
CREATE INDEX IF NOT EXISTS idx_rfq_created_at ON rfq(created_at);
CREATE INDEX IF NOT EXISTS idx_rfq_bid_start_time ON rfq(bid_start_time);
CREATE INDEX IF NOT EXISTS idx_rfq_audit_rfq_id ON rfq_audit(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_audit_changed_at ON rfq_audit(changed_at);
