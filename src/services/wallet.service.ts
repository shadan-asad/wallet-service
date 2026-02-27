import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/pool';
import {
    TransactionRequest,
    TransactionResponse,
    LedgerEntryResponse,
    BalanceResponse,
    Wallet,
    Transaction,
} from '../types';

// ============================================================
// System wallet owner IDs
// ============================================================
const TREASURY_OWNER = 'treasury';
const REVENUE_OWNER = 'revenue';

// ============================================================
// Helper: find system wallet for a given asset type
// ============================================================
async function getSystemWallet(
    client: PoolClient,
    ownerLabel: string,
    assetTypeId: number
): Promise<Wallet> {
    const result = await client.query<Wallet>(
        `SELECT * FROM wallets WHERE owner_type = 'system' AND owner_id = $1 AND asset_type_id = $2`,
        [ownerLabel, assetTypeId]
    );
    if (result.rows.length === 0) {
        throw new Error(`System wallet "${ownerLabel}" not found for asset type ${assetTypeId}`);
    }
    return result.rows[0];
}

// ============================================================
// Helper: lock wallets in consistent order (deadlock avoidance)
// ============================================================
async function lockWalletsInOrder(
    client: PoolClient,
    walletIds: string[]
): Promise<Wallet[]> {
    // Sort UUIDs to always acquire locks in the same order → prevents deadlocks
    const sorted = [...walletIds].sort();
    const wallets: Wallet[] = [];

    for (const wid of sorted) {
        const res = await client.query<Wallet>(
            `SELECT * FROM wallets WHERE id = $1 FOR UPDATE`,
            [wid]
        );
        if (res.rows.length === 0) {
            throw new Error(`Wallet ${wid} not found`);
        }
        wallets.push(res.rows[0]);
    }

    return wallets;
}

// ============================================================
// Helper: check idempotency
// ============================================================
async function checkIdempotency(
    client: PoolClient,
    idempotencyKey: string
): Promise<TransactionResponse | null> {
    const res = await client.query<Transaction>(
        `SELECT * FROM transactions WHERE idempotency_key = $1`,
        [idempotencyKey]
    );

    if (res.rows.length === 0) return null;

    const txn = res.rows[0];
    const ledgerRes = await client.query(
        `SELECT wallet_id, entry_type, amount FROM ledger_entries WHERE transaction_id = $1`,
        [txn.id]
    );

    return {
        transaction_id: txn.id,
        idempotency_key: txn.idempotency_key,
        type: txn.type,
        amount: txn.amount,
        status: txn.status,
        description: txn.description,
        created_at: txn.created_at,
        ledger_entries: ledgerRes.rows as LedgerEntryResponse[],
    };
}

// ============================================================
// Helper: create transaction + ledger entries + update balances
// ============================================================
async function executeTransaction(
    client: PoolClient,
    params: {
        walletId: string;
        type: 'topup' | 'bonus' | 'spend';
        amount: number;
        idempotencyKey: string;
        description?: string;
        debitWalletId: string;
        creditWalletId: string;
    }
): Promise<TransactionResponse> {
    const txnId = uuidv4();

    // 1. Insert transaction record
    await client.query(
        `INSERT INTO transactions (id, idempotency_key, type, amount, description, wallet_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'completed')`,
        [txnId, params.idempotencyKey, params.type, params.amount, params.description || null, params.walletId]
    );

    // 2. Insert ledger entries (double-entry)
    await client.query(
        `INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount) VALUES ($1, $2, 'debit', $3)`,
        [txnId, params.debitWalletId, params.amount]
    );
    await client.query(
        `INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount) VALUES ($1, $2, 'credit', $3)`,
        [txnId, params.creditWalletId, params.amount]
    );

    // 3. Update balances
    //    Debit wallet: reduce balance
    await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE id = $2`,
        [params.amount, params.debitWalletId]
    );
    //    Credit wallet: increase balance
    await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
        [params.amount, params.creditWalletId]
    );

    return {
        transaction_id: txnId,
        idempotency_key: params.idempotencyKey,
        type: params.type,
        amount: params.amount.toFixed(4),
        status: 'completed',
        description: params.description || null,
        created_at: new Date(),
        ledger_entries: [
            { wallet_id: params.debitWalletId, entry_type: 'debit', amount: params.amount.toFixed(4) },
            { wallet_id: params.creditWalletId, entry_type: 'credit', amount: params.amount.toFixed(4) },
        ],
    };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Top-up: User purchases credits with real money.
 * Flow: Treasury (debit) → User Wallet (credit)
 */
export async function topUp(
    walletId: string,
    req: TransactionRequest
): Promise<TransactionResponse> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Idempotency check
        const existing = await checkIdempotency(client, req.idempotency_key);
        if (existing) {
            await client.query('COMMIT');
            return existing;
        }

        // Get user wallet to determine asset_type_id
        const userWalletRes = await client.query<Wallet>(
            `SELECT * FROM wallets WHERE id = $1`,
            [walletId]
        );
        if (userWalletRes.rows.length === 0) {
            throw new Error('Wallet not found');
        }
        const userWallet = userWalletRes.rows[0];
        const assetTypeId = req.asset_type_id || userWallet.asset_type_id;

        // Get system treasury wallet
        const treasury = await getSystemWallet(client, TREASURY_OWNER, assetTypeId);

        // Lock both wallets (sorted order for deadlock avoidance)
        await lockWalletsInOrder(client, [treasury.id, walletId]);

        // Execute: debit Treasury, credit User
        const result = await executeTransaction(client, {
            walletId,
            type: 'topup',
            amount: req.amount,
            idempotencyKey: req.idempotency_key,
            description: req.description,
            debitWalletId: treasury.id,
            creditWalletId: walletId,
        });

        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Bonus/Incentive: System issues free credits to user.
 * Flow: Treasury (debit) → User Wallet (credit)
 */
export async function bonus(
    walletId: string,
    req: TransactionRequest
): Promise<TransactionResponse> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await checkIdempotency(client, req.idempotency_key);
        if (existing) {
            await client.query('COMMIT');
            return existing;
        }

        const userWalletRes = await client.query<Wallet>(
            `SELECT * FROM wallets WHERE id = $1`,
            [walletId]
        );
        if (userWalletRes.rows.length === 0) {
            throw new Error('Wallet not found');
        }
        const userWallet = userWalletRes.rows[0];
        const assetTypeId = req.asset_type_id || userWallet.asset_type_id;

        const treasury = await getSystemWallet(client, TREASURY_OWNER, assetTypeId);

        await lockWalletsInOrder(client, [treasury.id, walletId]);

        const result = await executeTransaction(client, {
            walletId,
            type: 'bonus',
            amount: req.amount,
            idempotencyKey: req.idempotency_key,
            description: req.description || 'Bonus/incentive credit',
            debitWalletId: treasury.id,
            creditWalletId: walletId,
        });

        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Spend: User spends credits on an in-app service.
 * Flow: User Wallet (debit) → Revenue (credit)
 */
export async function spend(
    walletId: string,
    req: TransactionRequest
): Promise<TransactionResponse> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await checkIdempotency(client, req.idempotency_key);
        if (existing) {
            await client.query('COMMIT');
            return existing;
        }

        const userWalletRes = await client.query<Wallet>(
            `SELECT * FROM wallets WHERE id = $1`,
            [walletId]
        );
        if (userWalletRes.rows.length === 0) {
            throw new Error('Wallet not found');
        }
        const userWallet = userWalletRes.rows[0];
        const assetTypeId = req.asset_type_id || userWallet.asset_type_id;

        // Check sufficient balance before locking
        if (parseFloat(userWallet.balance) < req.amount) {
            throw new Error('Insufficient balance');
        }

        const revenue = await getSystemWallet(client, REVENUE_OWNER, assetTypeId);

        // Lock wallets (sorted order)
        await lockWalletsInOrder(client, [walletId, revenue.id]);

        // Re-check balance after acquiring lock (might have changed)
        const lockedWalletRes = await client.query<Wallet>(
            `SELECT balance FROM wallets WHERE id = $1`,
            [walletId]
        );
        if (parseFloat(lockedWalletRes.rows[0].balance) < req.amount) {
            throw new Error('Insufficient balance');
        }

        const result = await executeTransaction(client, {
            walletId,
            type: 'spend',
            amount: req.amount,
            idempotencyKey: req.idempotency_key,
            description: req.description,
            debitWalletId: walletId,
            creditWalletId: revenue.id,
        });

        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get wallet balance(s)
 */
export async function getBalance(walletId: string): Promise<BalanceResponse> {
    const result = await pool.query(
        `SELECT w.id as wallet_id, w.owner_id, at.name as asset_type, w.balance
     FROM wallets w
     JOIN asset_types at ON w.asset_type_id = at.id
     WHERE w.id = $1`,
        [walletId]
    );

    if (result.rows.length === 0) {
        throw new Error('Wallet not found');
    }

    return result.rows[0] as BalanceResponse;
}

/**
 * Get transaction history for a wallet (paginated)
 */
export async function getTransactions(
    walletId: string,
    page: number = 1,
    limit: number = 20
): Promise<{ transactions: TransactionResponse[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    // Count total
    const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM transactions WHERE wallet_id = $1`,
        [walletId]
    );
    const total = parseInt(countRes.rows[0].total, 10);

    // Get transactions
    const txnRes = await pool.query(
        `SELECT * FROM transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [walletId, limit, offset]
    );

    // Get ledger entries for each transaction
    const transactions: TransactionResponse[] = [];
    for (const txn of txnRes.rows) {
        const ledgerRes = await pool.query(
            `SELECT wallet_id, entry_type, amount FROM ledger_entries WHERE transaction_id = $1`,
            [txn.id]
        );
        transactions.push({
            transaction_id: txn.id,
            idempotency_key: txn.idempotency_key,
            type: txn.type,
            amount: txn.amount,
            status: txn.status,
            description: txn.description,
            created_at: txn.created_at,
            ledger_entries: ledgerRes.rows as LedgerEntryResponse[],
        });
    }

    return { transactions, total, page, limit };
}
