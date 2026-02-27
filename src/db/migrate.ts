import fs from 'fs';
import path from 'path';
import pool from './pool';

/**
 * Runs all SQL migration files in order.
 */
async function migrate(): Promise<void> {
    const migrationsDir = path.join(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    console.log('🔄 Running migrations...');

    for (const file of files) {
        if (!file.endsWith('.sql')) continue;
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        console.log(`  ▶ ${file}`);
        await pool.query(sql);
    }

    console.log('✅ Migrations complete.');
}

// Run if executed directly
if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
}

export default migrate;
