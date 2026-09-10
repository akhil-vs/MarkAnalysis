-- Speed up nav badge queries that filter by status alone.
CREATE INDEX IF NOT EXISTS "Mark_status_idx" ON "Mark"("status");
CREATE INDEX IF NOT EXISTS "MarkEntryAccessRequest_status_requestedAt_idx" ON "MarkEntryAccessRequest"("status", "requestedAt");
