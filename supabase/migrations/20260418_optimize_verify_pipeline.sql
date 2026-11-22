BEGIN;

CREATE INDEX IF NOT EXISTS idx_face_enrollments_profile_active_true
  ON public.face_enrollments(profile_id)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.get_active_enrollment_for_verification(user_uuid UUID)
RETURNS TABLE(
  profile_id UUID,
  nim TEXT,
  nama TEXT,
  face_embedding vector(512)
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    fe.profile_id,
    p.nim::TEXT,
    p.nama::TEXT,
    fe.face_embedding
  FROM public.face_enrollments fe
  INNER JOIN public.profiles p ON p.id = fe.profile_id
  WHERE fe.profile_id = user_uuid
    AND fe.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_enrollment_for_verification(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_enrollment_for_verification(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_active_enrollment_for_verification(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_enrollment_for_verification(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.insert_attendance_log(
  attendance_id UUID,
  profile_uuid UUID,
  attendance_type VARCHAR(20),
  captured_image_url TEXT DEFAULT NULL,
  event_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.attendance_logs (
    id,
    profile_id,
    type,
    captured_face_image_url,
    timestamp
  )
  VALUES (
    attendance_id,
    profile_uuid,
    attendance_type,
    captured_image_url,
    event_timestamp
  );

  RETURN attendance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_attendance_log(UUID, UUID, VARCHAR, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_attendance_log(UUID, UUID, VARCHAR, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.insert_attendance_log(UUID, UUID, VARCHAR, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.insert_attendance_log(UUID, UUID, VARCHAR, TEXT, TIMESTAMPTZ) TO service_role;

COMMIT;
