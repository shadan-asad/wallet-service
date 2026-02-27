import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

/**
 * Validates the transaction request body.
 * Required fields: amount (positive number), idempotency_key (non-empty string)
 */
export function validateTransactionRequest(
    req: Request,
    _res: Response,
    next: NextFunction
): void {
    const { amount, idempotency_key } = req.body;

    if (amount === undefined || amount === null) {
        return next(new AppError('amount is required', 400));
    }

    if (typeof amount !== 'number' || amount <= 0) {
        return next(new AppError('amount must be a positive number', 400));
    }

    if (!Number.isFinite(amount)) {
        return next(new AppError('amount must be a finite number', 400));
    }

    if (!idempotency_key || typeof idempotency_key !== 'string' || idempotency_key.trim() === '') {
        return next(new AppError('idempotency_key is required and must be a non-empty string', 400));
    }

    next();
}

/**
 * Validates the walletId UUID format in route params.
 */
export function validateWalletId(
    req: Request,
    _res: Response,
    next: NextFunction
): void {
    const walletId = req.params.walletId as string;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(walletId)) {
        return next(new AppError('Invalid wallet ID format', 400));
    }

    next();
}
