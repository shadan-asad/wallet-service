import fs from 'fs';
import path from 'path';
import pool from './pool';

/**
 * Runs the seed.sql file to populate initial data.
 */
async function seed(): Promise<void> {
    const seedPath = path.join(__dirname, '../../seed.sql');
    const sql = fs.readFileSync(seedPath, 'utf-8');

    console.log('🌱 Seeding database...');
    await pool.query(sql);
    console.log('✅ Seed complete.');

    // Print seeded wallets for reference
    const result = await pool.query(`
    SELECT w.id, w.owner_type, w.owner_id, at.name as asset_type, w.balance
    FROM wallets w
    JOIN asset_types at ON w.asset_type_id = at.id
    ORDER BY w.owner_type DESC, w.owner_id, at.name
  `);
    console.log('\n📋 Seeded Wallets:');
    console.table(result.rows);
}

// Run if executed directly
if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('❌ Seed failed:', err);
            process.exit(1);
        });
}

export default seed;
