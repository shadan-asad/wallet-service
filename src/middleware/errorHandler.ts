import { Request, Response, NextFunction } from 'express';

// ============================================================
// Custom error class with HTTP status codes
// ============================================================
export class AppError extends Error {
    public statusCode: number;

    constructor(message: string, statusCode: number = 400) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'AppError';
    }
}

// ============================================================
// Global error handler middleware
// ============================================================
export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    console.error(`[ERROR] ${err.message}`);

    // Known application errors
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            error: err.message,
        });
        return;
    }

    // PostgreSQL unique violation (idempotency key conflict race condition)
    if ((err as any).code === '23505') {
        res.status(409).json({
            success: false,
            error: 'Duplicate transaction. This request has already been processed.',
        });
        return;
    }

    // PostgreSQL check violation (e.g., balance went negative)
    if ((err as any).code === '23514') {
        res.status(400).json({
            success: false,
            error: 'Insufficient balance',
        });
        return;
    }

    // Unexpected errors
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
    });
}
