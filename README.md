# 🏦 Internal Wallet Service

A production-grade wallet service for managing application-specific virtual credits (e.g., Gold Coins, Diamonds, Loyalty Points). Built with a **double-entry ledger** architecture for full auditability, **concurrent-safe transactions**, and **idempotent API operations**.

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | Node.js + TypeScript | Strong type safety, large ecosystem, fast iteration |
| **Framework** | Express.js | Lightweight, battle-tested for REST APIs |
| **Database** | PostgreSQL 15 | Best-in-class ACID transactions, `SELECT … FOR UPDATE`, CHECK constraints |
| **DB Client** | node-postgres (pg) | Direct pool management, fine-grained transaction control |
| **Container** | Docker + Compose | One-command setup for reproducible environments |

---

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
docker-compose up --build
```

This automatically:
- Spins up PostgreSQL 15
- Runs the schema migration
- Seeds initial data (3 asset types, system wallets, 2 users)
- Starts the API server on `http://localhost:3000`

### Option 2: Manual Setup

**Prerequisites**: Node.js 20+, PostgreSQL 15+, `psql` CLI

```bash
# 1. Install dependencies
npm install

# 2. Create database
createdb wallet_service

# 3. Run migration + seed
chmod +x setup.sh
./setup.sh

# 4. Start dev server
npm run dev
```

---

## Seeded Data

| Wallet ID | Owner | Asset | Balance |
|-----------|-------|-------|---------|
| `b000...0001` | user_1 | Gold Coins | 500 |
| `b000...0002` | user_1 | Diamonds | 100 |
| `b000...0003` | user_2 | Gold Coins | 250 |
| `b000...0004` | user_2 | Loyalty Points | 1,000 |
| `a000...0001-0003` | system/treasury | All types | 1,000,000 each |
| `a000...0004-0006` | system/revenue | All types | 0 each |

> Full UUIDs: `b0000000-0000-0000-0000-000000000001` etc.

---

## API Reference

### Health Check

```
GET /health
```

### Wallet Top-up (Purchase)

Credits from treasury → user wallet.

```bash
POST /api/wallets/:walletId/topup

{
  "amount": 100,
  "idempotency_key": "topup-unique-001",
  "description": "Purchased 100 Gold Coins"   # optional
}
```

### Bonus / Incentive

Free credits from treasury → user wallet.

```bash
POST /api/wallets/:walletId/bonus

{
  "amount": 50,
  "idempotency_key": "bonus-referral-001",
  "description": "Referral bonus"
}
```

### Spend / Purchase

Debit user wallet → system revenue.

```bash
POST /api/wallets/:walletId/spend

{
  "amount": 30,
  "idempotency_key": "spend-item-001",
  "description": "Bought in-game sword"
}
```

### Get Balance

```bash
GET /api/wallets/:walletId/balance
```

### Transaction History

```bash
GET /api/wallets/:walletId/transactions?page=1&limit=20
```

---

## Architecture & Design Decisions

### Double-Entry Ledger

Instead of simply updating a `balance` column, every transaction creates **two ledger entries** — a debit on one wallet and a credit on another. This ensures:

- **Auditability**: Full trail of every credit movement
- **Consistency**: The sum of all debits always equals the sum of all credits
- **Reconciliation**: Easy to detect discrepancies

```
Top-up 100 GC:
  DEBIT  Treasury  -100 GC
  CREDIT User_1    +100 GC
```

### Concurrency Strategy

**Problem**: Under high traffic, two requests could read the same balance, both decide there are sufficient funds, and both proceed — leading to an incorrect final balance or a negative balance.

**Solution**: We use PostgreSQL's `SELECT ... FOR UPDATE` to acquire **row-level locks** on wallet rows at the start of each transaction. This serializes concurrent access to the same wallet:

```sql
-- Inside a BEGIN/COMMIT transaction block
SELECT * FROM wallets WHERE id = $1 FOR UPDATE;
-- Now this row is locked; other transactions wait here
UPDATE wallets SET balance = balance - $1 WHERE id = $2;
```

Additionally, the `CHECK (balance >= 0)` constraint on the `wallets` table acts as a **database-level safety net** — even if the application logic has a bug, PostgreSQL will reject any update that would make a balance negative.

### Deadlock Avoidance

When a transaction involves **two wallets** (e.g., treasury + user), deadlocks can occur if two concurrent transactions lock the wallets in opposite orders.

**Solution**: We always lock wallets in **ascending UUID order**, ensuring a consistent lock acquisition order. This eliminates the possibility of circular waits (the root cause of deadlocks).

```typescript
async function lockWalletsInOrder(client, walletIds) {
  const sorted = [...walletIds].sort(); // Consistent order
  for (const wid of sorted) {
    await client.query('SELECT * FROM wallets WHERE id = $1 FOR UPDATE', [wid]);
  }
}
```

### Idempotency

Every mutating request requires an `idempotency_key`. Before executing:

1. Check if a transaction with that key already exists
2. If yes → return the stored result (no re-execution)
3. If no → proceed and store the key atomically

This protects against network retries, duplicate submissions, and client-side bugs.

---

## Testing

```bash
# Run all tests (requires running Postgres with seed data)
npm test

# Watch mode
npm run test:watch
```

Tests cover:
- ✅ All 3 transaction flows (topup, bonus, spend)
- ✅ Input validation (missing fields, negative amounts)
- ✅ Idempotency (duplicate key returns same result, no double-credit)
- ✅ Concurrency (10 parallel top-ups, parallel overspend prevention)
- ✅ Balance constraints (reject overdraw)
- ✅ Transaction history pagination

---

## Project Structure

```
wallet-service/
├── src/
│   ├── index.ts                # Express app entry point
│   ├── config.ts               # Environment config
│   ├── types/index.ts          # TypeScript interfaces
│   ├── db/
│   │   ├── pool.ts             # PG connection pool
│   │   ├── migrate.ts          # Migration runner
│   │   └── seed.ts             # Seed runner
│   ├── services/
│   │   └── wallet.service.ts   # Core business logic
│   ├── controllers/
│   │   └── wallet.controller.ts
│   ├── routes/
│   │   └── wallet.routes.ts
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   └── validate.ts
│   └── __tests__/
│       └── wallet.test.ts      # Integration tests
├── migrations/
│   └── 001_init.sql            # Schema DDL
├── seed.sql                    # Pre-seed data
├── setup.sh                    # One-command DB setup
├── Dockerfile                  # Multi-stage build
├── docker-compose.yml          # App + Postgres
└── README.md
```
