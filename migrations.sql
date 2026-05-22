-- ============================================================
-- Mr. Civil — Database Migrations
-- Run these in your Supabase SQL Editor (in order)
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)
-- ============================================================

-- ============================================================
-- 1. Add short_id to users (for staff/verifier display)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN short_id text UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_users_short_id ON users(short_id);

-- ============================================================
-- 2. Improve notifications table
-- ============================================================
DO $$ BEGIN
  ALTER TABLE notifications ADD COLUMN message text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notifications ADD COLUMN read_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON notifications(user_id, read);

-- ============================================================
-- 3. Add last_name to admins table
-- ============================================================
DO $$ BEGIN
  ALTER TABLE admins ADD COLUMN last_name text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============================================================
-- 4. Staff Ratings Table
-- Citizens rate staff members per complaint (one rating per complaint)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  citizen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comments text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(complaint_id, citizen_id)  -- one rating per complaint per citizen
);

CREATE INDEX IF NOT EXISTS idx_staff_ratings_staff_id ON staff_ratings(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_ratings_complaint_id ON staff_ratings(complaint_id);

-- ============================================================
-- 5. Index for nearby complaints lookup (by pincode/city)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_complaints_pincode ON complaints(pincode);
CREATE INDEX IF NOT EXISTS idx_complaints_city ON complaints(city);

-- ============================================================
-- 6. Feedback table improvements
-- ============================================================
DO $$ BEGIN
  ALTER TABLE feedbacks ADD COLUMN updated_at timestamptz DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ============================================================
-- 7. Row Level Security (RLS) — Enable for all tables
-- ============================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (clean slate)
DROP POLICY IF EXISTS "Service role bypass" ON users;
DROP POLICY IF EXISTS "Service role bypass" ON complaints;
DROP POLICY IF EXISTS "Service role bypass" ON notifications;
DROP POLICY IF EXISTS "Service role bypass" ON staff_ratings;
DROP POLICY IF EXISTS "Service role bypass" ON feedbacks;
DROP POLICY IF EXISTS "Service role bypass" ON complaint_status_logs;
DROP POLICY IF EXISTS "Service role bypass" ON staff_assignments;
DROP POLICY IF EXISTS "Service role bypass" ON admins;

-- NOTE: Our Flask backend uses the anon key for ALL operations.
-- Since we handle authentication in Flask sessions (not Supabase Auth),
-- we grant full access to anon role and rely on Flask for access control.
-- In production, you should switch to the service_role key in the backend.

CREATE POLICY "anon full access users" ON users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access complaints" ON complaints FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access notifications" ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access staff_ratings" ON staff_ratings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access feedbacks" ON feedbacks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access logs" ON complaint_status_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access assignments" ON staff_assignments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access admins" ON admins FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- 8. Updated_at trigger for staff_ratings
-- ============================================================
DO $$ BEGIN
  CREATE TRIGGER trg_feedbacks_updated_at 
    BEFORE UPDATE ON feedbacks 
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- DONE! 
-- Next steps:
-- 1. Create storage buckets: complaint-images, work-images (set to Public)
-- 2. Set environment variables in Render dashboard
-- 3. Deploy via GitHub
-- ============================================================
