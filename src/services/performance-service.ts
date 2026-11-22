const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001';

export type PerformanceActionType = 'register' | 'checkin' | 'checkout';
export type PerformanceResult = 'success' | 'failed';

export interface PerformanceLogPayload {
  profile_id?: string | null;
  action_type: PerformanceActionType;
  result: PerformanceResult;
  total_ms: number;
  warmup_ms?: number | null;
  capture_ms?: number | null;
  verify_api_ms?: number | null;
  enrollment_ms?: number | null;
  similarity_score?: number | null;
  sharpness_score?: number | null;
  valid_frames?: number | null;
  lighting_condition?: number | null;
  brightness_score?: number | null;
  lighting_category?: 'Gelap' | 'Cukup' | 'Terang' | 'Sangat terang' | null;
  face_box_ratio?: number | null;
  distance_category?: 'Terlalu dekat' | 'Ideal' | 'Terlalu jauh' | null;
  experiment_note?: string | null;
  failure_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logPerformance(payload: PerformanceLogPayload) {
  const response = await fetch(`${FLASK_API_URL}/api/performance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody?.error || 'Failed to log performance');
  }

  return responseBody;
}

export async function logPerformanceSafe(payload: PerformanceLogPayload) {
  try {
    await logPerformance(payload);
  } catch (error) {
    console.warn('[PERF] Failed to persist performance log:', error);
  }
}
