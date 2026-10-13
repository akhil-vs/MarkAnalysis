# Manual Deployment Steps for Vercel

## Prerequisites Checklist
- [ ] Vercel CLI installed (✓ Already done)
- [ ] Vercel account access
- [ ] Database URL for production
- [ ] PR #186 reviewed and ready

## Step-by-Step Deployment

### Step 1: Authenticate with Vercel
```bash
vercel login
```
This will open your browser for authentication. Follow the prompts.

### Step 2: Link to Your Vercel Project
```bash
cd /workspace
vercel link
```
Select your project from the list.

### Step 3: Pull Environment Variables
```bash
vercel env pull .env.local
```
This downloads your production DATABASE_URL and other env vars.

### Step 4: Load Environment Variables
```bash
source .env.local
```

### Step 5: Verify Database Connection
```bash
echo $DATABASE_URL
# Should show your PostgreSQL connection string

# Test connection
psql "$DATABASE_URL" -c "SELECT 1"
```

### Step 6: Run the Deployment Helper Script
```bash
chmod +x deploy-vercel.sh
./deploy-vercel.sh
```

This script will:
- ✓ Verify database connectivity
- ✓ Create 15 performance indexes (non-blocking with CONCURRENTLY)
- ✓ Update table statistics
- ✓ Optionally initialize materialized views
- ✓ Show progress with colored output

### Step 7: Deploy to Vercel

**For Preview Deployment (test first):**
```bash
vercel
```

**For Production Deployment:**
```bash
# If on main branch:
vercel --prod

# If on feature branch, merge first:
gh pr merge 186 --merge
git checkout main
git pull origin main
vercel --prod
```

## Alternative: Quick Deploy Without Helper Script

If you want to skip the helper script:

```bash
# 1. Authenticate and link
vercel login
vercel link

# 2. Just deploy - indexes will be handled by Prisma migrations
vercel --prod
```

The Prisma contract emit during build will handle schema updates.

## Verification After Deployment

```bash
# 1. Check compression
curl -I https://your-app.vercel.app/api/analytics/school | grep "Content-Encoding"

# 2. Check cache headers
curl -I https://your-app.vercel.app/api/analytics/school | grep "Cache-Control"

# 3. Test performance
time curl -b "token=YOUR_TOKEN" https://your-app.vercel.app/api/analytics/school

# 4. Check monitoring (platform admin)
curl -b "token=ADMIN_TOKEN" https://your-app.vercel.app/api/monitoring/health
```

## Troubleshooting

### "Cannot connect to database"
- Verify DATABASE_URL in Vercel dashboard
- Check database firewall allows Vercel IPs
- Test: `psql $DATABASE_URL -c "SELECT 1"`

### "Vercel login failed"
- Clear cache: `rm -rf ~/.vercel`
- Try again: `vercel login`

### "Build failed"
- Check Vercel build logs in dashboard
- Verify all dependencies in package.json
- Check Prisma contract emit succeeds locally

## Need Help?

See detailed documentation:
- `VERCEL_DEPLOYMENT.md` - Complete guide
- `PERFORMANCE_OPTIMIZATIONS.md` - Technical details
