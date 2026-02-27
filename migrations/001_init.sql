-- ============================================================
-- Wallet Service Schema — Double-Entry Ledger
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Asset Types (Gold Coins, Diamonds, etc.)
-- ============================================================
CREATE TABLE asset_types (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    symbol      VARCHAR(20)  NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. Wallets (one per user per asset type)
-- ============================================================
CREATE TABLE wallets (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_type    VARCHAR(20)  NOT NULL CHECK (owner_type IN ('user', 'system')),
    owner_id      VARCHAR(100) NOT NULL,
    asset_type_id INTEGER      NOT NULL REFERENCES asset_types(id),
    balance       DECIMAL(20, 4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Each owner can have only one wallet per asset type
    UNIQUE (owner_type, owner_id, asset_type_id)
);

CREATE INDEX idx_wallets_owner ON wallets(owner_type, owner_id);

-- ============================================================
-- 3. Transactions (master record for each operation)
-- ============================================================
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    type            VARCHAR(20)  NOT NULL CHECK (type IN ('topup', 'bonus', 'spend')),
    amount          DECIMAL(20, 4) NOT NULL CHECK (amount > 0),
    description     TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
    wallet_id       UUID         NOT NULL REFERENCES wallets(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet ON transactions(wallet_id, created_at DESC);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);

-- ============================================================
-- 4. Ledger Entries (double-entry: every txn has debit + credit)
-- ============================================================
CREATE TABLE ledger_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID         NOT NULL REFERENCES transactions(id),
    wallet_id       UUID         NOT NULL REFERENCES wallets(id),
    entry_type      VARCHAR(10)  NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount          DECIMAL(20, 4) NOT NULL CHECK (amount > 0),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_wallet ON ledger_entries(wallet_id, created_at DESC);

-- ============================================================
-- 5. Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
