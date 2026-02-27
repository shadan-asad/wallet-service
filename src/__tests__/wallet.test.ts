import request from 'supertest';
import { Pool } from 'pg';
import app from '../index';

// ============================================================
// Integration Tests for Wallet Service
// ============================================================

// Use the same DB as the app (tests require a running Postgres with seed data)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wallet_service',
});

// Well-known wallet IDs from seed.sql
const USER1_GC_WALLET = 'b0000000-0000-0000-0000-000000000001'; // User 1, Gold Coins, 500 initial
const USER2_GC_WALLET = 'b0000000-0000-0000-0000-000000000003'; // User 2, Gold Coins, 250 initial
const INVALID_WALLET = '00000000-0000-0000-0000-000000000000';

let idempotencyCounter = 0;
function uniqueKey(prefix: string): string {
    return `${prefix}-test-${Date.now()}-${++idempotencyCounter}`;
}

afterAll(async () => {
    await pool.end();
});

// ============================================================
// Health Check
// ============================================================
describe('GET /health', () => {
    it('should return ok status', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});

// ============================================================
// Balance Endpoint
// ============================================================
describe('GET /api/wallets/:walletId/balance', () => {
    it('should return the wallet balance', async () => {
        const res = await request(app)
            .get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.wallet_id).toBe(USER1_GC_WALLET);
        expect(parseFloat(res.body.data.balance)).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid wallet ID format', async () => {
        const res = await request(app)
            .get('/api/wallets/not-a-uuid/balance');
        expect(res.status).toBe(400);
    });

    it('should return error for non-existent wallet', async () => {
        const res = await request(app)
            .get(`/api/wallets/${INVALID_WALLET}/balance`);
        expect(res.status).toBe(500); // Wallet not found
    });
});

// ============================================================
// Top-up Flow
// ============================================================
describe('POST /api/wallets/:walletId/topup', () => {
    it('should top up the wallet and increase balance', async () => {
        // Get initial balance
        const before = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        const initialBalance = parseFloat(before.body.data.balance);

        const key = uniqueKey('topup');
        const res = await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
            .send({ amount: 100, idempotency_key: key, description: 'Test top-up' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.type).toBe('topup');
        expect(parseFloat(res.body.data.amount)).toBe(100);
        expect(res.body.data.ledger_entries).toHaveLength(2);

        // Verify balance increased
        const after = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        const finalBalance = parseFloat(after.body.data.balance);
        expect(finalBalance).toBe(initialBalance + 100);
    });

    it('should reject missing amount', async () => {
        const res = await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
            .send({ idempotency_key: uniqueKey('topup-no-amount') });
        expect(res.status).toBe(400);
    });

    it('should reject negative amount', async () => {
        const res = await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
            .send({ amount: -50, idempotency_key: uniqueKey('topup-neg') });
        expect(res.status).toBe(400);
    });

    it('should reject missing idempotency_key', async () => {
        const res = await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
            .send({ amount: 100 });
        expect(res.status).toBe(400);
    });
});

// ============================================================
// Bonus Flow
// ============================================================
describe('POST /api/wallets/:walletId/bonus', () => {
    it('should issue bonus credits and increase balance', async () => {
        const before = await request(app).get(`/api/wallets/${USER2_GC_WALLET}/balance`);
        const initialBalance = parseFloat(before.body.data.balance);

        const key = uniqueKey('bonus');
        const res = await request(app)
            .post(`/api/wallets/${USER2_GC_WALLET}/bonus`)
            .send({ amount: 50, idempotency_key: key, description: 'Referral bonus' });

        expect(res.status).toBe(200);
        expect(res.body.data.type).toBe('bonus');

        const after = await request(app).get(`/api/wallets/${USER2_GC_WALLET}/balance`);
        expect(parseFloat(after.body.data.balance)).toBe(initialBalance + 50);
    });
});

// ============================================================
// Spend Flow
// ============================================================
describe('POST /api/wallets/:walletId/spend', () => {
    it('should spend credits and decrease balance', async () => {
        // First top up to ensure we have funds
        await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
            .send({ amount: 200, idempotency_key: uniqueKey('topup-for-spend') });

        const before = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        const initialBalance = parseFloat(before.body.data.balance);

        const key = uniqueKey('spend');
        const res = await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/spend`)
            .send({ amount: 30, idempotency_key: key, description: 'Buy item' });

        expect(res.status).toBe(200);
        expect(res.body.data.type).toBe('spend');

        const after = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        expect(parseFloat(after.body.data.balance)).toBe(initialBalance - 30);
    });

    it('should reject spend when insufficient balance', async () => {
        const res = await request(app)
            .post(`/api/wallets/${USER2_GC_WALLET}/spend`)
            .send({ amount: 999999, idempotency_key: uniqueKey('spend-overdraw') });

        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});

// ============================================================
// Idempotency
// ============================================================
describe('Idempotency', () => {
    it('should return same result for duplicate idempotency key', async () => {
        const key = uniqueKey('idempotent');

        // First request
        const res1 = await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
            .send({ amount: 75, idempotency_key: key });
        expect(res1.status).toBe(200);

        // Get balance after first request
        const afterFirst = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        const balanceAfterFirst = parseFloat(afterFirst.body.data.balance);

        // Second request with SAME key — should NOT credit again
        const res2 = await request(app)
            .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
            .send({ amount: 75, idempotency_key: key });
        expect(res2.status).toBe(200);
        expect(res2.body.data.transaction_id).toBe(res1.body.data.transaction_id);

        // Balance should be unchanged
        const afterSecond = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        expect(parseFloat(afterSecond.body.data.balance)).toBe(balanceAfterFirst);
    });
});

// ============================================================
// Concurrency
// ============================================================
describe('Concurrency', () => {
    it('should handle parallel top-ups correctly (no lost updates)', async () => {
        const before = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        const initialBalance = parseFloat(before.body.data.balance);

        const numRequests = 10;
        const amountEach = 10;

        // Fire all requests in parallel
        const promises = Array.from({ length: numRequests }, (_, i) =>
            request(app)
                .post(`/api/wallets/${USER1_GC_WALLET}/topup`)
                .send({ amount: amountEach, idempotency_key: uniqueKey(`concurrent-topup-${i}`) })
        );

        const results = await Promise.all(promises);

        // All should succeed
        results.forEach((res) => {
            expect(res.status).toBe(200);
        });

        // Final balance should reflect ALL top-ups
        const after = await request(app).get(`/api/wallets/${USER1_GC_WALLET}/balance`);
        const finalBalance = parseFloat(after.body.data.balance);
        expect(finalBalance).toBe(initialBalance + numRequests * amountEach);
    });

    it('should prevent balance going negative under concurrent spends', async () => {
        // Top up a fresh amount
        await request(app)
            .post(`/api/wallets/${USER2_GC_WALLET}/topup`)
            .send({ amount: 100, idempotency_key: uniqueKey('topup-for-concurrent-spend') });

        const before = await request(app).get(`/api/wallets/${USER2_GC_WALLET}/balance`);
        const initialBalance = parseFloat(before.body.data.balance);

        // Try to spend more than available by firing many parallel requests
        const numRequests = 20;
        const amountEach = initialBalance; // Each tries to spend the FULL balance

        const promises = Array.from({ length: numRequests }, (_, i) =>
            request(app)
                .post(`/api/wallets/${USER2_GC_WALLET}/spend`)
                .send({ amount: amountEach, idempotency_key: uniqueKey(`concurrent-spend-${i}`) })
        );

        const results = await Promise.all(promises);

        // At most ONE should succeed (the rest should fail with insufficient balance)
        const successes = results.filter((r) => r.status === 200);
        const failures = results.filter((r) => r.status >= 400);

        expect(successes.length).toBeLessThanOrEqual(1);
        expect(failures.length).toBeGreaterThanOrEqual(numRequests - 1);

        // Balance should never be negative
        const after = await request(app).get(`/api/wallets/${USER2_GC_WALLET}/balance`);
        expect(parseFloat(after.body.data.balance)).toBeGreaterThanOrEqual(0);
    });
});

// ============================================================
// Transaction History
// ============================================================
describe('GET /api/wallets/:walletId/transactions', () => {
    it('should return paginated transaction history', async () => {
        const res = await request(app)
            .get(`/api/wallets/${USER1_GC_WALLET}/transactions?page=1&limit=5`);
        expect(res.status).toBe(200);
        expect(res.body.data.transactions).toBeDefined();
        expect(Array.isArray(res.body.data.transactions)).toBe(true);
        expect(res.body.data.page).toBe(1);
        expect(res.body.data.limit).toBe(5);
        expect(res.body.data.total).toBeGreaterThan(0);
    });
});
