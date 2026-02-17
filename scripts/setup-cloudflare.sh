#!/bin/bash
# ============================================================================
# ScanFactory - Cloudflare Infrastructure Setup
# ============================================================================
# This script creates all necessary Cloudflare resources for the project.
# Run this once to set up the infrastructure, then update wrangler.toml
# with the generated IDs.
#
# Prerequisites:
#   - Cloudflare account with Workers paid plan (for Queues)
#   - wrangler CLI installed and authenticated (npx wrangler login)
#   - Domain configured in Cloudflare DNS
#
# Usage:
#   ./scripts/setup-cloudflare.sh [staging|production]
# ============================================================================

set -e

ENV=${1:-staging}
echo "🚀 Setting up Cloudflare infrastructure for: $ENV"
echo ""

# ============================================================================
# Configuration
# ============================================================================
if [ "$ENV" = "production" ]; then
  DB_NAME="scanfactory-db"
  KV_NAME="scanfactory-cache"
  R2_SCANS="scanfactory-scans"
  R2_EXPORTS="scanfactory-exports"
  QUEUE_NAME="scanfactory-doc-queue"
  DLQ_NAME="scanfactory-doc-dlq"
else
  DB_NAME="scanfactory-db-staging"
  KV_NAME="scanfactory-cache-staging"
  R2_SCANS="scanfactory-scans-staging"
  R2_EXPORTS="scanfactory-exports-staging"
  QUEUE_NAME="scanfactory-doc-queue-staging"
  DLQ_NAME=""
fi

# ============================================================================
# Create D1 Database
# ============================================================================
echo "📦 Creating D1 Database: $DB_NAME"
DB_OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1) || true

if echo "$DB_OUTPUT" | grep -q "already exists"; then
  echo "   Database already exists, fetching info..."
  DB_ID=$(npx wrangler d1 info "$DB_NAME" --json | jq -r '.uuid')
else
  DB_ID=$(echo "$DB_OUTPUT" | grep -oP 'database_id = "\K[^"]+')
fi

echo "   ✅ D1 Database ID: $DB_ID"
echo ""

# ============================================================================
# Create KV Namespace
# ============================================================================
echo "📦 Creating KV Namespace: $KV_NAME"
KV_OUTPUT=$(npx wrangler kv:namespace create "$KV_NAME" 2>&1) || true

if echo "$KV_OUTPUT" | grep -q "already exists"; then
  echo "   KV namespace already exists, fetching info..."
  KV_ID=$(npx wrangler kv:namespace list --json | jq -r ".[] | select(.title==\"$KV_NAME\") | .id")
else
  KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+')
fi

echo "   ✅ KV Namespace ID: $KV_ID"
echo ""

# ============================================================================
# Create R2 Buckets
# ============================================================================
echo "📦 Creating R2 Bucket: $R2_SCANS"
npx wrangler r2 bucket create "$R2_SCANS" 2>&1 || echo "   Bucket may already exist"
echo "   ✅ R2 Bucket created: $R2_SCANS"

echo "📦 Creating R2 Bucket: $R2_EXPORTS"
npx wrangler r2 bucket create "$R2_EXPORTS" 2>&1 || echo "   Bucket may already exist"
echo "   ✅ R2 Bucket created: $R2_EXPORTS"
echo ""

# ============================================================================
# Create Queues (requires Workers Paid plan)
# ============================================================================
echo "📦 Creating Queue: $QUEUE_NAME"
npx wrangler queues create "$QUEUE_NAME" 2>&1 || echo "   Queue may already exist"
echo "   ✅ Queue created: $QUEUE_NAME"

if [ -n "$DLQ_NAME" ]; then
  echo "📦 Creating Dead Letter Queue: $DLQ_NAME"
  npx wrangler queues create "$DLQ_NAME" 2>&1 || echo "   DLQ may already exist"
  echo "   ✅ DLQ created: $DLQ_NAME"
fi
echo ""

# ============================================================================
# Initialize Database Schema
# ============================================================================
echo "📦 Initializing database schema..."
cd packages/api

if [ -f "src/db/schema.sql" ]; then
  npx wrangler d1 execute "$DB_NAME" --file=src/db/schema.sql --remote
  echo "   ✅ Schema initialized"
fi

if [ -f "src/db/migrations/002_constraints_and_soft_delete.sql" ]; then
  npx wrangler d1 execute "$DB_NAME" --file=src/db/migrations/002_constraints_and_soft_delete.sql --remote
  echo "   ✅ Migrations applied"
fi

cd ../..
echo ""

# ============================================================================
# Output Configuration
# ============================================================================
echo "============================================================================"
echo "✅ Cloudflare infrastructure created successfully!"
echo "============================================================================"
echo ""
echo "Update your wrangler.toml with these IDs:"
echo ""
echo "  [[d1_databases]]"
echo "  database_id = \"$DB_ID\""
echo ""
echo "  [[kv_namespaces]]"
echo "  id = \"$KV_ID\""
echo ""
echo "============================================================================"
echo "Next steps:"
echo "============================================================================"
echo ""
echo "1. Update packages/api/wrangler.toml with the IDs above"
echo ""
echo "2. Set required secrets:"
echo "   npx wrangler secret put JWT_SECRET --env $ENV"
echo "   npx wrangler secret put OCR_API_KEY --env $ENV"
echo "   npx wrangler secret put TWILIO_ACCOUNT_SID --env $ENV"
echo "   npx wrangler secret put TWILIO_AUTH_TOKEN --env $ENV"
echo "   npx wrangler secret put TWILIO_PHONE_NUMBER --env $ENV"
echo ""
echo "3. Deploy the API:"
echo "   cd packages/api && npx wrangler deploy --env $ENV"
echo ""
echo "4. Deploy the web app (Cloudflare Pages):"
echo "   cd packages/web && npm run build"
echo "   npx wrangler pages deploy dist --project-name=scanfactory-web"
echo ""
