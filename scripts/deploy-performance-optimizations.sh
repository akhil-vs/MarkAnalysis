#!/bin/bash
# Vercel Deployment Helper Script
# Helps apply database migrations for performance optimizations

set -e  # Exit on error

echo "🚀 Vercel Performance Optimization Deployment Helper"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    echo ""
    echo "Please set it:"
    echo "  export DATABASE_URL='postgresql://user:pass@host:5432/database'"
    echo ""
    echo "Or pull from Vercel:"
    echo "  vercel env pull .env.local"
    echo "  source .env.local"
    exit 1
fi

echo -e "${GREEN}✓${NC} DATABASE_URL is set"
echo ""

# Check database connectivity
echo "Testing database connection..."
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Database connection successful"
else
    echo -e "${RED}✗${NC} Cannot connect to database"
    echo "Please check your DATABASE_URL"
    exit 1
fi
echo ""

# Function to check if index exists
check_index() {
    local index_name=$1
    psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_indexes WHERE indexname = '$index_name'" 2>/dev/null
}

# Function to create index
create_index() {
    local index_sql=$1
    local index_name=$2
    
    if [ "$(check_index "$index_name")" = "1" ]; then
        echo -e "${YELLOW}⊙${NC} Index $index_name already exists"
    else
        echo "Creating index $index_name..."
        if psql "$DATABASE_URL" -c "$index_sql" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Created index $index_name"
        else
            echo -e "${RED}✗${NC} Failed to create index $index_name"
        fi
    fi
}

# Apply performance optimization indexes
echo "Applying performance optimization indexes..."
echo "============================================"
echo ""

# Mark table indexes
echo "Mark table indexes:"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_examId_status_studentId_idx" ON "Mark"("examId", "status", "studentId")' "Mark_examId_status_studentId_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_examId_subjectId_status_idx" ON "Mark"("examId", "subjectId", "status")' "Mark_examId_subjectId_status_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_studentId_examId_idx" ON "Mark"("studentId", "examId")' "Mark_studentId_examId_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_status_examId_subjectId_studentId_idx" ON "Mark"("status", "examId", "subjectId", "studentId")' "Mark_status_examId_subjectId_studentId_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_enteredById_status_examId_idx" ON "Mark"("enteredById", "status", "examId")' "Mark_enteredById_status_examId_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Mark_subjectId_examId_status_idx" ON "Mark"("subjectId", "examId", "status")' "Mark_subjectId_examId_status_idx"
echo ""

# Student table indexes
echo "Student table indexes:"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Student_classSectionId_status_idx" ON "Student"("classSectionId", "status")' "Student_classSectionId_status_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Student_status_academicYear_idx" ON "Student"("status", "academicYear")' "Student_status_academicYear_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Student_tenantId_status_idx" ON "Student"("tenantId", "status")' "Student_tenantId_status_idx"
echo ""

# TeacherAssignment table indexes
echo "TeacherAssignment table indexes:"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TeacherAssignment_userId_classSectionId_idx" ON "TeacherAssignment"("userId", "classSectionId")' "TeacherAssignment_userId_classSectionId_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TeacherAssignment_classSectionId_subjectId_idx" ON "TeacherAssignment"("classSectionId", "subjectId")' "TeacherAssignment_classSectionId_subjectId_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "TeacherAssignment_tenantId_userId_idx" ON "TeacherAssignment"("tenantId", "userId")' "TeacherAssignment_tenantId_userId_idx"
echo ""

# MarkAudit table indexes
echo "MarkAudit table indexes:"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarkAudit_timestamp_idx" ON "MarkAudit"("timestamp")' "MarkAudit_timestamp_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarkAudit_changedById_timestamp_idx" ON "MarkAudit"("changedById", "timestamp")' "MarkAudit_changedById_timestamp_idx"
create_index 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarkAudit_tenantId_timestamp_idx" ON "MarkAudit"("tenantId", "timestamp")' "MarkAudit_tenantId_timestamp_idx"
echo ""

# Analyze tables to update statistics
echo "Updating table statistics..."
psql "$DATABASE_URL" -c "ANALYZE \"Mark\", \"Student\", \"TeacherAssignment\", \"MarkAudit\";" > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Table statistics updated"
echo ""

# Check materialized views
echo "Checking for materialized views..."
if [ -f "server/sql/materialized-views.sql" ]; then
    read -p "Do you want to initialize materialized views? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Initializing materialized views..."
        if psql "$DATABASE_URL" < server/sql/materialized-views.sql > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Materialized views initialized"
        else
            echo -e "${RED}✗${NC} Failed to initialize materialized views"
            echo "You can do this manually later: psql \$DATABASE_URL < server/sql/materialized-views.sql"
        fi
    else
        echo "Skipping materialized views (you can initialize them later)"
    fi
else
    echo -e "${YELLOW}⊙${NC} Materialized views SQL file not found"
fi
echo ""

# Summary
echo "============================================"
echo -e "${GREEN}Deployment preparation complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Deploy to Vercel: git push origin main"
echo "2. Verify deployment:"
echo "   - Check compression: curl -I https://your-app.vercel.app/api/analytics/school | grep Content-Encoding"
echo "   - Check performance: time curl -b \"token=...\" https://your-app.vercel.app/api/analytics/school"
echo "3. Monitor performance in Vercel dashboard"
echo ""
echo "For detailed instructions, see VERCEL_DEPLOYMENT.md"
