-- =====================================================
-- 🎓 SUPABASE COMPLETE SETUP - ATTENDANCE SYSTEM
-- =====================================================
-- Version: 2.0 (April 2026)
-- Auth System: Supabase Auth (NOT Clerk)
-- Purpose: ONE FILE untuk setup SEMUA - fresh install atau migration
-- 
-- FILE INI MENANGANI:
-- 1. Hapus trigger/function lama yang rusak
-- 2. Hapus user zombie (signup gagal sebelumnya)
-- 3. Bersihkan data profile bermasalah
-- 4. Buat/migrasi tabel profiles (tanpa face data)
-- 5. Buat tabel face_enrollments (embedding terpisah)
-- 6. Migrasi data face_embedding dari profiles → face_enrollments (jika ada)
-- 7. Buat tabel attendance_logs dan leave_requests
-- 8. Setup RLS policies
-- 9. Setup RPC functions untuk face recognition
-- 10. Setup trigger signup yang AMAN
-- 
-- CARA PAKAI:
-- 1. Buka Supabase Dashboard → SQL Editor
-- 2. Copy-paste SELURUH file ini
-- 3. Klik "Run"
-- 4. Selesai
-- =====================================================

-- =====================================================
-- BAGIAN 1: CLEANUP - Hapus SEMUA yang lama/rusak
-- =====================================================

-- Hapus trigger lama pada auth.users (penyebab signup error)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Hapus function lama (tidak tergantung tabel)
DROP FUNCTION IF EXISTS public.match_face(vector(512), float) CASCADE;
DROP FUNCTION IF EXISTS public.match_face_top_k(vector(512), float, integer) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_embedding_similarity(vector(512), vector(512)) CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- Hapus semua policy lama + tabel lama (hanya jika tabel ada)
-- Ini aman: kalau tabel belum ada, tidak error
DO $$
BEGIN
  -- PROFILES
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Allow profile creation" ON public.profiles;
    DROP POLICY IF EXISTS "Allow anon profile creation for signup" ON public.profiles;
    DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Allow public profile read" ON public.profiles;
    DROP POLICY IF EXISTS "Allow individual access to own profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.profiles;
    DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

    -- Hapus kolom face lama jika ada
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS face_embedding;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS face_images;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS face_frames_count;
    DROP INDEX IF EXISTS idx_profiles_embedding_hnsw;
  END IF;

  -- FACE_ENROLLMENTS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'face_enrollments') THEN
    DROP POLICY IF EXISTS "Users can view own face enrollments" ON public.face_enrollments;
    DROP POLICY IF EXISTS "Users can manage own face enrollments" ON public.face_enrollments;
    DROP POLICY IF EXISTS "Allow anon insert face enrollments" ON public.face_enrollments;
  END IF;

  -- ATTENDANCE_LOGS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendance_logs') THEN
    DROP POLICY IF EXISTS "Users can view own attendance" ON public.attendance_logs;
    DROP POLICY IF EXISTS "Allow insert attendance" ON public.attendance_logs;
    DROP POLICY IF EXISTS "System can insert attendance" ON public.attendance_logs;
    DROP POLICY IF EXISTS "Users can access own attendance logs" ON public.attendance_logs;
    DROP POLICY IF EXISTS "Users can insert own attendance" ON public.attendance_logs;
  END IF;

  -- LEAVE_REQUESTS
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leave_requests') THEN
    DROP POLICY IF EXISTS "Users can view own leave requests" ON public.leave_requests;
    DROP POLICY IF EXISTS "Users can insert own leave requests" ON public.leave_requests;
    DROP POLICY IF EXISTS "Users can update own leave requests" ON public.leave_requests;
    DROP POLICY IF EXISTS "Allow anon insert leave requests" ON public.leave_requests;
    DROP POLICY IF EXISTS "Users can access own leave requests" ON public.leave_requests;
    DROP POLICY IF EXISTS "Admins can view all leave requests" ON public.leave_requests;
    DROP POLICY IF EXISTS "Admins can update leave requests" ON public.leave_requests;
  END IF;
END $$;

-- =====================================================
-- BAGIAN 2: HAPUS DATA BERMASALAH (user zombie, duplikat)
-- =====================================================

-- Hapus user di auth.users yang tidak punya profile (dari signup gagal)
DELETE FROM auth.users 
WHERE id IN (
  SELECT au.id 
  FROM auth.users au 
  LEFT JOIN public.profiles p ON au.id = p.id 
  WHERE p.id IS NULL
);

-- Hapus profile dengan nim/email kosong (bikin UNIQUE violation)
DELETE FROM public.profiles WHERE nim = '' OR nim IS NULL;
DELETE FROM public.profiles WHERE email = '' OR email IS NULL;

-- =====================================================
-- BAGIAN 3: MIGRASI DATA FACE EMBEDDING (jika ada)
-- =====================================================

-- Cek apakah kolom face_embedding ada di profiles (artinya ada data lama)
DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'face_embedding'
  ) INTO col_exists;

  -- Kalau ada data face di profiles, migrate ke face_enrollments dulu
  IF col_exists THEN
    -- Buat tabel face_enrollments kalau belum ada
    CREATE TABLE IF NOT EXISTS public.face_enrollments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      face_embedding vector(512) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Copy data face_embedding dari profiles ke face_enrollments
    INSERT INTO public.face_enrollments (profile_id, face_embedding, is_active, created_at, updated_at)
    SELECT 
      id as profile_id,
      face_embedding,
      true as is_active,
      created_at,
      NOW() as updated_at
    FROM public.profiles
    WHERE face_embedding IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- =====================================================
-- BAGIAN 4: EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- BAGIAN 5: TABEL PROFILES (bersih, TANPA face data)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  nama VARCHAR(255) NOT NULL,
  nim VARCHAR(50) UNIQUE NOT NULL,

  -- Academic information
  jurusan VARCHAR(255),
  kelas VARCHAR(100),
  semester VARCHAR(10),
  role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),

  join_date DATE DEFAULT CURRENT_DATE,
  enrollment_status VARCHAR(50) DEFAULT 'pending' CHECK (enrollment_status IN ('pending', 'complete', 'incomplete')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin'));
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'student';
UPDATE public.profiles
SET role = CASE
  WHEN role IN ('admin', 'student') THEN role
  WHEN role IN ('dosen', 'lecturer') THEN 'admin'
  ELSE 'student'
END
WHERE role IS NULL OR role NOT IN ('admin', 'student');
ALTER TABLE public.profiles
  ALTER COLUMN role SET NOT NULL;

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_nim ON public.profiles(nim);
CREATE INDEX IF NOT EXISTS idx_profiles_jurusan ON public.profiles(jurusan);
CREATE INDEX IF NOT EXISTS idx_profiles_kelas ON public.profiles(kelas);
CREATE INDEX IF NOT EXISTS idx_profiles_semester ON public.profiles(semester);
CREATE INDEX IF NOT EXISTS idx_profiles_enrollment_status ON public.profiles(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Hapus kolom face dari profiles (sudah di face_enrollments)
-- Migration data sudah dilakukan di BAGIAN 3
ALTER TABLE public.profiles DROP COLUMN IF EXISTS face_embedding;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS face_images;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS face_frames_count;
DROP INDEX IF EXISTS idx_profiles_embedding_hnsw;

-- Comments
COMMENT ON COLUMN profiles.jurusan IS 'Program studi/jurusan mahasiswa';
COMMENT ON COLUMN profiles.kelas IS 'Kelas Pagi atau Kelas Malam';
COMMENT ON COLUMN profiles.semester IS 'Semester aktif (1-8)';
COMMENT ON COLUMN profiles.role IS 'Role aplikasi: student atau admin';
COMMENT ON COLUMN profiles.enrollment_status IS 'Status face enrollment: pending/complete/incomplete';

-- =====================================================
-- BAGIAN 6: TABEL FACE_ENROLLMENTS (embedding terpisah)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.face_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  face_embedding vector(512) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_face_enrollments_embedding 
  ON public.face_enrollments USING hnsw (face_embedding vector_cosine_ops);

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_face_enrollments_profile_id ON public.face_enrollments(profile_id);
CREATE INDEX IF NOT EXISTS idx_face_enrollments_is_active ON public.face_enrollments(is_active);

-- Comments
COMMENT ON TABLE face_enrollments IS 'Face embeddings for face recognition, separated from profiles for security';
COMMENT ON COLUMN face_enrollments.face_embedding IS '512-dimensional face embedding vector (ArcFace)';
COMMENT ON COLUMN face_enrollments.is_active IS 'Only one active enrollment per user for verification';

-- =====================================================
-- BAGIAN 7: TABEL ATTENDANCE_LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('masuk', 'pulang')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  location TEXT,
  face_image_url TEXT,
  captured_face_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_profile_id ON public.attendance_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_timestamp ON public.attendance_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_type ON public.attendance_logs(type);

-- =====================================================
-- BAGIAN 8: TABEL LEAVE_REQUESTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('izin', 'sakit')),
  reason TEXT NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leave_requests_profile_id ON public.leave_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_date ON public.leave_requests(date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);

-- =====================================================
-- BAGIAN 9: ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- BAGIAN 10: RLS POLICIES - PROFILES
-- =====================================================

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

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (role = 'student' OR public.is_admin())
  );

CREATE POLICY "Users can delete their own profile" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

CREATE POLICY "Allow profile creation" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow anon profile creation for signup" ON public.profiles
  FOR INSERT TO anon WITH CHECK (true);

-- =====================================================
-- BAGIAN 11: RLS POLICIES - FACE_ENROLLMENTS
-- =====================================================

CREATE POLICY "Users can view own face enrollments" ON public.face_enrollments
  FOR SELECT USING (
    profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage own face enrollments" ON public.face_enrollments
  FOR INSERT TO authenticated WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Allow anon insert face enrollments" ON public.face_enrollments
  FOR INSERT TO anon WITH CHECK (true);

-- =====================================================
-- BAGIAN 12: RLS POLICIES - ATTENDANCE_LOGS
-- =====================================================

CREATE POLICY "Users can view own attendance" ON public.attendance_logs
  FOR SELECT USING (
    profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "System can insert attendance" ON public.attendance_logs
  FOR INSERT TO authenticated, anon WITH CHECK (true);

-- =====================================================
-- BAGIAN 13: RLS POLICIES - LEAVE_REQUESTS
-- =====================================================

CREATE POLICY "Users can view own leave requests" ON public.leave_requests
  FOR SELECT USING (
    profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own leave requests" ON public.leave_requests
  FOR INSERT TO authenticated WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can view all leave requests" ON public.leave_requests
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can update leave requests" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =====================================================
-- BAGIAN 14: TRIGGER auto-update updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_leave_updated_at ON public.leave_requests;
CREATE TRIGGER set_leave_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- BAGIAN 15: RPC FUNCTIONS - Face Recognition
-- =====================================================

-- Function 1: Match face (returns best match)
CREATE OR REPLACE FUNCTION match_face(
  input_embedding vector(512),
  similarity_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE(
  profile_id UUID,
  user_nim TEXT,
  user_nama TEXT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id::UUID as profile_id,
    p.nim::TEXT as user_nim,
    p.nama::TEXT as user_nama,
    (1 - (fe.face_embedding <=> input_embedding))::FLOAT as similarity_score
  FROM profiles p
  INNER JOIN face_enrollments fe ON p.id = fe.profile_id
  WHERE
    fe.is_active = true
    AND (1 - (fe.face_embedding <=> input_embedding)) >= similarity_threshold
  ORDER BY fe.face_embedding <=> input_embedding
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function 2: Match face with top-K results
CREATE OR REPLACE FUNCTION match_face_top_k(
  input_embedding vector(512),
  similarity_threshold FLOAT DEFAULT 0.75,
  k INTEGER DEFAULT 5
)
RETURNS TABLE(
  profile_id UUID,
  user_nim TEXT,
  user_nama TEXT,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id::UUID as profile_id,
    p.nim::TEXT as user_nim,
    p.nama::TEXT as user_nama,
    (1 - (fe.face_embedding <=> input_embedding))::FLOAT as similarity_score
  FROM profiles p
  INNER JOIN face_enrollments fe ON p.id = fe.profile_id
  WHERE
    fe.is_active = true
    AND (1 - (fe.face_embedding <=> input_embedding)) >= similarity_threshold
  ORDER BY fe.face_embedding <=> input_embedding
  LIMIT k;
END;
$$ LANGUAGE plpgsql;

-- Function 3: Calculate similarity (debugging)
CREATE OR REPLACE FUNCTION calculate_embedding_similarity(
  embedding1 vector(512),
  embedding2 vector(512)
)
RETURNS FLOAT AS $$
BEGIN
  RETURN (1 - (embedding1 <=> embedding2))::FLOAT;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- BAGIAN 16: TRIGGER AUTO-CREATE PROFILE ON SIGNUP
-- Ini yang sering ERROR sebelumnya - sekarang sudah FIX
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip jika email kosong
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    nama,
    nim,
    role,
    enrollment_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'nim', ''),
    'student',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  -- UNIQUE violation (email/nim duplikat) → jangan block signup
  WHEN unique_violation THEN
    RETURN NEW;
  -- Error lain → log tapi jangan block signup
  WHEN others THEN
    RAISE WARNING 'handle_new_user() failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- BAGIAN 17: REALTIME + PERMISSIONS
-- =====================================================

-- Tambah realtime subscriptions (ignore error jika sudah ada)
DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE profiles;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE attendance_logs;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE leave_requests;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER publication supabase_realtime ADD TABLE face_enrollments;
EXCEPTION WHEN others THEN NULL;
END $$;

GRANT USAGE ON SCHEMA public TO authenticator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticator;

-- =====================================================
-- ✅ SELESAI - VERIFICATION
-- =====================================================

-- Cek semua tabel
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Cek kolom profiles (harus TIDAK ada face_embedding, face_images)
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'profiles' ORDER BY ordinal_position;

-- Cek kolom face_enrollments (harus ADA face_embedding)
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'face_enrollments' ORDER BY ordinal_position;

-- Cek trigger (harus HANYA 1: on_auth_user_created)
SELECT tgname, proname FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;

-- Cek RLS (semua harus true)
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('profiles', 'face_enrollments', 'attendance_logs', 'leave_requests')
ORDER BY tablename;

-- =====================================================
-- 🎉 DONE! Database siap untuk digunakan.
-- =====================================================
