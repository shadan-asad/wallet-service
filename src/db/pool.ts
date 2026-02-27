import { Pool } from 'pg';
import { config } from '../config';

const pool = new Pool({
    connectionString: config.database.connectionString,
    max: config.database.poolSize,
    // Render (and most cloud providers) require SSL for PostgreSQL
    ...(config.nodeEnv === 'production' && {
        ssl: { rejectUnauthorized: false },
    }),
});

// Log pool errors (don't crash)
pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
});

export default pool;
