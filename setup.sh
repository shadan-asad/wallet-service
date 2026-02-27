#!/bin/bash
# ============================================================
# setup.sh — One-command database setup
# ============================================================
# Usage:
#   ./setup.sh                  # Uses default DATABASE_URL
#   DATABASE_URL=... ./setup.sh # Uses custom DATABASE_URL
# ============================================================

set -e

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/wallet_service}"

echo "🔄 Running migrations..."
psql "$DB_URL" -f migrations/001_init.sql
echo "✅ Migrations complete."

echo ""
echo "🌱 Running seed..."
psql "$DB_URL" -f seed.sql
echo "✅ Seed complete."

echo ""
echo "📋 Verifying seeded wallets..."
psql "$DB_URL" -c "SELECT w.id, w.owner_type, w.owner_id, at.name as asset_type, w.balance FROM wallets w JOIN asset_types at ON w.asset_type_id = at.id ORDER BY w.owner_type DESC, w.owner_id, at.name;"

echo ""
echo "🎉 Setup complete! Start the server with: npm run dev"
