-- Minimal role + leave approval migration
-- Date: 2026-04-15

BEGIN;

-- 1) Profiles role (student/admin)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role VARCHAR(20);

UPDATE public.profiles
SET role = CASE
  WHEN role IN ('admin', 'student') THEN role
  WHEN role IN ('dosen', 'lecturer') THEN 'admin'
  ELSE 'student'
END
WHERE role IS NULL OR role NOT IN ('admin', 'student');

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'student';

ALTER TABLE public.profiles
  ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('student', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2) Leave review metadata
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leave_requests_reviewed_by_fkey'
      AND conrelid = 'public.leave_requests'::regclass
  ) THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT leave_requests_reviewed_by_fkey
      FOREIGN KEY (reviewed_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3) RLS hardening for leave approval
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

DROP POLICY IF EXISTS "Users can update own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Allow anon insert leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can view all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can update leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (role = 'student' OR public.is_admin())
  );

CREATE POLICY "Admins can view all leave requests" ON public.leave_requests
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can update leave requests" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;
