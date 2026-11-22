-- Add explicit quality + experiment columns on performance_logs
-- Date: 2026-04-25

BEGIN;

ALTER TABLE public.performance_logs
  ADD COLUMN IF NOT EXISTS brightness_score NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS lighting_category TEXT,
  ADD COLUMN IF NOT EXISTS face_box_ratio NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS distance_category TEXT,
  ADD COLUMN IF NOT EXISTS experiment_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'performance_logs_distance_category_check'
  ) THEN
    ALTER TABLE public.performance_logs
      ADD CONSTRAINT performance_logs_distance_category_check
      CHECK (
        distance_category IS NULL
        OR distance_category IN ('Terlalu dekat', 'Ideal', 'Terlalu jauh')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'performance_logs_lighting_category_check'
  ) THEN
    ALTER TABLE public.performance_logs
      ADD CONSTRAINT performance_logs_lighting_category_check
      CHECK (
        lighting_category IS NULL
        OR lighting_category IN ('Gelap', 'Cukup', 'Terang', 'Sangat terang')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_performance_logs_lighting_category
  ON public.performance_logs(lighting_category);
CREATE INDEX IF NOT EXISTS idx_performance_logs_distance_category
  ON public.performance_logs(distance_category);

-- Backfill explicit columns from existing metadata JSONB when possible.
UPDATE public.performance_logs
SET
  brightness_score = COALESCE(
    brightness_score,
    CASE
      WHEN metadata ? 'brightness_score'
        AND (metadata->>'brightness_score') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (metadata->>'brightness_score')::NUMERIC(12, 2)
      ELSE NULL
    END
  ),
  lighting_category = COALESCE(
    lighting_category,
    CASE
      WHEN metadata ? 'lighting_category'
        AND (metadata->>'lighting_category') IN ('Gelap', 'Cukup', 'Terang', 'Sangat terang')
      THEN metadata->>'lighting_category'
      ELSE NULL
    END
  ),
  face_box_ratio = COALESCE(
    face_box_ratio,
    CASE
      WHEN metadata ? 'face_box_ratio'
        AND (metadata->>'face_box_ratio') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN (metadata->>'face_box_ratio')::NUMERIC(12, 6)
      ELSE NULL
    END
  ),
  distance_category = COALESCE(
    distance_category,
    CASE
      WHEN metadata ? 'distance_category'
        AND (metadata->>'distance_category') IN ('Terlalu dekat', 'Ideal', 'Terlalu jauh')
      THEN metadata->>'distance_category'
      ELSE NULL
    END
  ),
  experiment_note = COALESCE(
    experiment_note,
    NULLIF(metadata->>'experiment_note', '')
  );

COMMIT;
