import express from 'express';
import { config } from './config';
import walletRoutes from './routes/wallet.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ---- Global Middleware ----
app.use(express.json());

// ---- Health Check ----
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'wallet-service', timestamp: new Date().toISOString() });
});

// ---- API Routes ----
app.use('/api/wallets', walletRoutes);

// ---- Error Handler (must be last) ----
app.use(errorHandler);

// ---- Start Server ----
if (require.main === module) {
    app.listen(config.port, () => {
        console.log(`🚀 Wallet Service running on http://localhost:${config.port}`);
        console.log(`   Environment: ${config.nodeEnv}`);
    });
}

// Export for testing
export default app;
