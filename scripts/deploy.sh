#!/bin/bash
# ============================================================================
# ScanFactory - Deployment Script
# ============================================================================
# Deploy API and Web to Cloudflare
#
# Usage:
#   ./scripts/deploy.sh [staging|production] [api|web|all]
#
# Examples:
#   ./scripts/deploy.sh staging all      # Deploy everything to staging
#   ./scripts/deploy.sh production api   # Deploy only API to production
#   ./scripts/deploy.sh staging web      # Deploy only web to staging
# ============================================================================

set -e

ENV=${1:-staging}
TARGET=${2:-all}

echo "🚀 Deploying ScanFactory to $ENV"
echo "   Target: $TARGET"
echo ""

# Validate environment
if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
  echo "❌ Invalid environment: $ENV"
  echo "   Use: staging or production"
  exit 1
fi

# ============================================================================
# Deploy API
# ============================================================================
deploy_api() {
  echo "📦 Deploying API to Cloudflare Workers..."
  cd packages/api

  # Build
  npm run build 2>/dev/null || echo "No build step"

  # Deploy
  npx wrangler deploy --env "$ENV"

  cd ../..
  echo "✅ API deployed"
  echo ""
}

# ============================================================================
# Deploy Web
# ============================================================================
deploy_web() {
  echo "📦 Deploying Web to Cloudflare Pages..."
  cd packages/web

  # Set environment
  if [ "$ENV" = "production" ]; then
    cp .env.production .env.local 2>/dev/null || true
    BRANCH="main"
  else
    cp .env.staging .env.local 2>/dev/null || true
    BRANCH="staging"
  fi

  # Build
  npm run build

  # Deploy
  npx wrangler pages deploy dist \
    --project-name=scanfactory-web \
    --branch="$BRANCH" \
    --commit-dirty=true

  cd ../..
  echo "✅ Web deployed"
  echo ""
}

# ============================================================================
# Execute deployment
# ============================================================================
case $TARGET in
  api)
    deploy_api
    ;;
  web)
    deploy_web
    ;;
  all)
    deploy_api
    deploy_web
    ;;
  *)
    echo "❌ Invalid target: $TARGET"
    echo "   Use: api, web, or all"
    exit 1
    ;;
esac

echo "============================================================================"
echo "✅ Deployment complete!"
echo "============================================================================"

if [ "$ENV" = "production" ]; then
  echo ""
  echo "Production URLs:"
  echo "  API: https://api.scanfactory.devfactory.tn"
  echo "  Web: https://scanfactory.devfactory.tn"
else
  echo ""
  echo "Staging URLs:"
  echo "  API: https://scanfactory-api-staging.<your-subdomain>.workers.dev"
  echo "  Web: https://staging.scanfactory-web.pages.dev"
fi
