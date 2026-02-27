import { Request, Response, NextFunction } from 'express';
import * as walletService from '../services/wallet.service';

/**
 * POST /api/wallets/:walletId/topup
 */
export async function topUp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const walletId = req.params.walletId as string;
        const result = await walletService.topUp(walletId, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/wallets/:walletId/bonus
 */
export async function bonus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const walletId = req.params.walletId as string;
        const result = await walletService.bonus(walletId, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/wallets/:walletId/spend
 */
export async function spend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const walletId = req.params.walletId as string;
        const result = await walletService.spend(walletId, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/wallets/:walletId/balance
 */
export async function getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const walletId = req.params.walletId as string;
        const result = await walletService.getBalance(walletId);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/wallets/:walletId/transactions
 */
export async function getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const walletId = req.params.walletId as string;
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
        const result = await walletService.getTransactions(walletId, page, limit);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}
