-- Restore captured face image URL column used by attendance inserts
-- Date: 2026-06-27

BEGIN;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS captured_face_image_url TEXT;

COMMENT ON COLUMN public.attendance_logs.captured_face_image_url
  IS 'Captured face image URL saved during attendance verification.';

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

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
