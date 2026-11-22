-- Performance logging table for register/checkin/checkout evaluation
-- Date: 2026-04-16

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.performance_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('register', 'checkin', 'checkout')),
  result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failed')),

  total_ms NUMERIC(12, 2) NOT NULL CHECK (total_ms >= 0),
  warmup_ms NUMERIC(12, 2),
  capture_ms NUMERIC(12, 2),
  verify_api_ms NUMERIC(12, 2),
  enrollment_ms NUMERIC(12, 2),

  similarity_score DOUBLE PRECISION,
  sharpness_score DOUBLE PRECISION,
  valid_frames INTEGER,
  lighting_condition DOUBLE PRECISION,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_logs_profile_id ON public.performance_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_performance_logs_action_type ON public.performance_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_performance_logs_result ON public.performance_logs(result);
CREATE INDEX IF NOT EXISTS idx_performance_logs_created_at ON public.performance_logs(created_at DESC);

ALTER TABLE public.performance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own performance logs" ON public.performance_logs;
CREATE POLICY "Users can view own performance logs" ON public.performance_logs
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own performance logs" ON public.performance_logs;
CREATE POLICY "Users can insert own performance logs" ON public.performance_logs
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid() OR profile_id IS NULL);

COMMIT;
