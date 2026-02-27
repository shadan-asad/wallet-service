// ============================================================
// Type Definitions for the Wallet Service
// ============================================================

export interface AssetType {
    id: number;
    name: string;
    symbol: string;
    created_at: Date;
}

export interface Wallet {
    id: string;
    owner_type: 'user' | 'system';
    owner_id: string;
    asset_type_id: number;
    balance: string; // DECIMAL comes back as string from pg
    created_at: Date;
    updated_at: Date;
}

export interface Transaction {
    id: string;
    idempotency_key: string;
    type: 'topup' | 'bonus' | 'spend';
    amount: string;
    description: string | null;
    status: 'completed' | 'failed';
    wallet_id: string;
    created_at: Date;
}

export interface LedgerEntry {
    id: string;
    transaction_id: string;
    wallet_id: string;
    entry_type: 'debit' | 'credit';
    amount: string;
    created_at: Date;
}

// Request body types
export interface TransactionRequest {
    amount: number;
    asset_type_id?: number; // optional — inferred from wallet
    idempotency_key: string;
    description?: string;
}

// API response types
export interface BalanceResponse {
    wallet_id: string;
    owner_id: string;
    asset_type: string;
    balance: string;
}

export interface TransactionResponse {
    transaction_id: string;
    idempotency_key: string;
    type: string;
    amount: string;
    status: string;
    description: string | null;
    created_at: Date;
    ledger_entries: LedgerEntryResponse[];
}

export interface LedgerEntryResponse {
    wallet_id: string;
    entry_type: string;
    amount: string;
}

export interface PaginationQuery {
    page?: number;
    limit?: number;
}
