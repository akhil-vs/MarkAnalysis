#!/bin/bash
# Complete Vercel Deployment Workflow
# This script guides you through the entire deployment process

set -e

echo "🚀 Vercel Deployment Workflow - Performance Optimizations"
echo "=========================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Check Vercel CLI
echo -e "${BLUE}Step 1: Checking Vercel CLI...${NC}"
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}✗${NC} Vercel CLI not installed"
    echo "Installing Vercel CLI..."
    npm install -g vercel
    echo -e "${GREEN}✓${NC} Vercel CLI installed"
else
    echo -e "${GREEN}✓${NC} Vercel CLI is installed"
fi
echo ""

# Step 2: Vercel Authentication
echo -e "${BLUE}Step 2: Vercel Authentication${NC}"
echo "You need to authenticate with Vercel..."
echo "This will open a browser window for login."
echo ""
read -p "Press Enter to authenticate with Vercel..."
vercel login

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Successfully authenticated with Vercel"
else
    echo -e "${RED}✗${NC} Authentication failed"
    exit 1
fi
echo ""

# Step 3: Link Project
echo -e "${BLUE}Step 3: Linking to Vercel Project${NC}"
if [ ! -d ".vercel" ]; then
    echo "Linking to your Vercel project..."
    vercel link
    echo -e "${GREEN}✓${NC} Project linked"
else
    echo -e "${GREEN}✓${NC} Project already linked"
fi
echo ""

# Step 4: Pull Environment Variables
echo -e "${BLUE}Step 4: Pulling Environment Variables${NC}"
echo "Fetching environment variables from Vercel..."
vercel env pull .env.local

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Environment variables pulled to .env.local"
    
    # Load environment variables
    if [ -f .env.local ]; then
        export $(cat .env.local | grep -v '^#' | xargs)
        echo -e "${GREEN}✓${NC} Environment variables loaded"
    fi
else
    echo -e "${RED}✗${NC} Failed to pull environment variables"
    echo ""
    echo "Please ensure your Vercel project has DATABASE_URL configured:"
    echo "1. Go to your Vercel project dashboard"
    echo "2. Navigate to Settings > Environment Variables"
    echo "3. Add DATABASE_URL with your PostgreSQL connection string"
    exit 1
fi
echo ""

# Step 5: Verify DATABASE_URL
echo -e "${BLUE}Step 5: Verifying Database Connection${NC}"
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗${NC} DATABASE_URL not found in environment variables"
    echo ""
    echo "Please add DATABASE_URL to your Vercel project:"
    echo "1. Go to https://vercel.com/your-team/your-project/settings/environment-variables"
    echo "2. Add DATABASE_URL with your production PostgreSQL connection string"
    echo "3. Run this script again"
    exit 1
fi

echo "Testing database connection..."
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Database connection successful"
else
    echo -e "${RED}✗${NC} Cannot connect to database"
    echo "Please verify your DATABASE_URL is correct"
    exit 1
fi
echo ""

# Step 6: Apply Database Migrations
echo -e "${BLUE}Step 6: Applying Database Migrations${NC}"
echo "This will create performance optimization indexes..."
echo ""
read -p "Continue with database migrations? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Run the migration helper
    if [ -f "./deploy-vercel.sh" ]; then
        chmod +x ./deploy-vercel.sh
        ./deploy-vercel.sh
    else
        echo -e "${YELLOW}⊙${NC} deploy-vercel.sh not found, applying migrations manually..."
        
        # Create indexes
        echo "Creating performance indexes..."
        psql "$DATABASE_URL" << 'EOF'
-- Mark table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_examId_status_studentId_idx" ON "Mark"("examId", "status", "studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_examId_subjectId_status_idx" ON "Mark"("examId", "subjectId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_studentId_examId_idx" ON "Mark"("studentId", "examId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_status_examId_subjectId_studentId_idx" ON "Mark"("status", "examId", "subjectId", "studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_enteredById_status_examId_idx" ON "Mark"("enteredById", "status", "examId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_subjectId_examId_status_idx" ON "Mark"("subjectId", "examId", "status");

-- Student table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Student_classSectionId_status_idx" ON "Student"("classSectionId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Student_status_academicYear_idx" ON "Student"("status", "academicYear");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Student_tenantId_status_idx" ON "Student"("tenantId", "status");

-- TeacherAssignment table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TeacherAssignment_userId_classSectionId_idx" ON "TeacherAssignment"("userId", "classSectionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TeacherAssignment_classSectionId_subjectId_idx" ON "TeacherAssignment"("classSectionId", "subjectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TeacherAssignment_tenantId_userId_idx" ON "TeacherAssignment"("tenantId", "userId");

-- MarkAudit table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarkAudit_timestamp_idx" ON "MarkAudit"("timestamp");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarkAudit_changedById_timestamp_idx" ON "MarkAudit"("changedById", "timestamp");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarkAudit_tenantId_timestamp_idx" ON "MarkAudit"("tenantId", "timestamp");

-- Update statistics
ANALYZE "Mark", "Student", "TeacherAssignment", "MarkAudit";
EOF
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓${NC} Database migrations applied successfully"
        else
            echo -e "${RED}✗${NC} Database migrations failed"
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}⊙${NC} Skipping database migrations"
fi
echo ""

# Step 7: Deploy to Vercel
echo -e "${BLUE}Step 7: Deploying to Vercel${NC}"
echo ""
echo "Choose deployment type:"
echo "1. Preview deployment (from current branch)"
echo "2. Production deployment (merge to main first)"
echo ""
read -p "Enter your choice (1 or 2): " -n 1 -r
echo ""

if [[ $REPLY == "1" ]]; then
    echo "Deploying preview from current branch..."
    vercel
elif [[ $REPLY == "2" ]]; then
    CURRENT_BRANCH=$(git branch --show-current)
    
    if [ "$CURRENT_BRANCH" != "main" ]; then
        echo -e "${YELLOW}⊙${NC} You're on branch: $CURRENT_BRANCH"
        echo ""
        echo "For production deployment, you need to:"
        echo "1. Merge your PR to main"
        echo "2. Switch to main branch"
        echo "3. Run: vercel --prod"
        echo ""
        read -p "Do you want to create a preview deployment instead? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Creating preview deployment..."
            vercel
        else
            echo "Deployment cancelled. Please merge to main first."
            exit 0
        fi
    else
        echo "Deploying to production..."
        vercel --prod
    fi
else
    echo "Invalid choice. Exiting."
    exit 1
fi

echo ""
echo "=========================================================="
echo -e "${GREEN}✓ Deployment process complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Check your deployment at the URL shown above"
echo "2. Verify compression: curl -I https://your-app.vercel.app/api/analytics/school | grep Content-Encoding"
echo "3. Check performance: time curl -b \"token=...\" https://your-app.vercel.app/api/analytics/school"
echo "4. Monitor at: https://your-app.vercel.app/api/monitoring/health"
echo ""
echo "For detailed verification steps, see VERCEL_DEPLOYMENT.md"
