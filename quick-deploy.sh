#!/bin/bash
# Quick Deployment Script - Run after vercel login

set -e

echo "🚀 Quick Vercel Deployment"
echo "=========================="
echo ""

# Check if authenticated
if ! vercel whoami &> /dev/null; then
    echo "❌ Not authenticated with Vercel"
    echo ""
    echo "Please run first:"
    echo "  vercel login"
    echo ""
    exit 1
fi

echo "✓ Authenticated with Vercel"
echo ""

# Link project if needed
if [ ! -d ".vercel" ]; then
    echo "Linking to Vercel project..."
    vercel link
fi

# Pull environment variables
echo "Pulling environment variables..."
vercel env pull .env.local

# Load variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
    echo "✓ Environment variables loaded"
fi

# Apply database migrations if DATABASE_URL is set
if [ ! -z "$DATABASE_URL" ]; then
    echo ""
    echo "Applying database migrations..."
    
    # Run the helper script if it exists
    if [ -f ./deploy-vercel.sh ]; then
        chmod +x ./deploy-vercel.sh
        ./deploy-vercel.sh
    fi
fi

# Deploy
echo ""
echo "Deploying to Vercel..."
echo ""
echo "Choose deployment type:"
echo "1. Preview (current branch)"
echo "2. Production (requires main branch)"
read -p "Enter choice (1/2): " choice

if [ "$choice" == "1" ]; then
    vercel
elif [ "$choice" == "2" ]; then
    vercel --prod
else
    echo "Invalid choice"
    exit 1
fi

echo ""
echo "✅ Deployment complete!"
