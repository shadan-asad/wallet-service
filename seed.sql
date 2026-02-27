-- ============================================================
-- Seed Data for Wallet Service
-- ============================================================

-- 1. Asset Types
INSERT INTO asset_types (id, name, symbol) VALUES
    (1, 'Gold Coins', 'GC'),
    (2, 'Diamonds', 'DM'),
    (3, 'Loyalty Points', 'LP');

-- Reset the serial sequence after explicit ID inserts
SELECT setval('asset_types_id_seq', (SELECT MAX(id) FROM asset_types));

-- 2. System Wallets (Treasury — source for top-ups & bonuses)
--    Using deterministic UUIDs so they're easy to reference
INSERT INTO wallets (id, owner_type, owner_id, asset_type_id, balance) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'system', 'treasury', 1, 1000000.0000),
    ('a0000000-0000-0000-0000-000000000002', 'system', 'treasury', 2, 1000000.0000),
    ('a0000000-0000-0000-0000-000000000003', 'system', 'treasury', 3, 1000000.0000),
    ('a0000000-0000-0000-0000-000000000004', 'system', 'revenue',  1, 0.0000),
    ('a0000000-0000-0000-0000-000000000005', 'system', 'revenue',  2, 0.0000),
    ('a0000000-0000-0000-0000-000000000006', 'system', 'revenue',  3, 0.0000);

-- 3. User Wallets
INSERT INTO wallets (id, owner_type, owner_id, asset_type_id, balance) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'user', 'user_1', 1, 500.0000),
    ('b0000000-0000-0000-0000-000000000002', 'user', 'user_1', 2, 100.0000),
    ('b0000000-0000-0000-0000-000000000003', 'user', 'user_2', 1, 250.0000),
    ('b0000000-0000-0000-0000-000000000004', 'user', 'user_2', 3, 1000.0000);

-- 4. Record initial balances via ledger entries (from treasury → user)
--    This ensures the books balance from day one.
INSERT INTO transactions (id, idempotency_key, type, amount, description, wallet_id, status) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'seed-user1-gc', 'topup', 500.0000, 'Initial seed balance', 'b0000000-0000-0000-0000-000000000001', 'completed'),
    ('c0000000-0000-0000-0000-000000000002', 'seed-user1-dm', 'topup', 100.0000, 'Initial seed balance', 'b0000000-0000-0000-0000-000000000002', 'completed'),
    ('c0000000-0000-0000-0000-000000000003', 'seed-user2-gc', 'topup', 250.0000, 'Initial seed balance', 'b0000000-0000-0000-0000-000000000003', 'completed'),
    ('c0000000-0000-0000-0000-000000000004', 'seed-user2-lp', 'topup', 1000.0000, 'Initial seed balance', 'b0000000-0000-0000-0000-000000000004', 'completed');

INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount) VALUES
    -- User 1: 500 Gold Coins (debit treasury, credit user)
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'debit',  500.0000),
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'credit', 500.0000),
    -- User 1: 100 Diamonds
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'debit',  100.0000),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'credit', 100.0000),
    -- User 2: 250 Gold Coins
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'debit',  250.0000),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'credit', 250.0000),
    -- User 2: 1000 Loyalty Points
    ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'debit',  1000.0000),
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 'credit', 1000.0000);
