import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wallet_service',
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    },
};
