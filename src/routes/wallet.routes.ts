import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller';
import { validateTransactionRequest, validateWalletId } from '../middleware/validate';

const router = Router();

// All routes require a valid wallet UUID
router.use('/:walletId', validateWalletId);

// ---- Mutation endpoints ----
router.post('/:walletId/topup', validateTransactionRequest, walletController.topUp);
router.post('/:walletId/bonus', validateTransactionRequest, walletController.bonus);
router.post('/:walletId/spend', validateTransactionRequest, walletController.spend);

// ---- Query endpoints ----
router.get('/:walletId/balance', walletController.getBalance);
router.get('/:walletId/transactions', walletController.getTransactions);

export default router;
