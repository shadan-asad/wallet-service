import { Pool } from 'pg';
import { config } from '../config';

const pool = new Pool({
    connectionString: config.database.connectionString,
    max: config.database.poolSize,
});

// Log pool errors (don't crash)
pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
});

export default pool;
