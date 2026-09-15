-- School-wide optional module visibility (Board ops, CPD). Default null ⇒ hidden.
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "optionalModules" JSONB;
