'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionLoadingOverlay } from '@/components/ui/action-loading-overlay';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, CameraOff, Clock, UserCheck, UserX, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getApprovedLeaveOnDate } from '@/lib/supabase-attendance';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { logPerformanceSafe } from '@/services/performance-service';

/**
 * Halaman Absensi dengan Face Recognition
 * 
 * Flow:
 * 1. User login dulu (sudah dihandle oleh AuthContext)
 * 2. User buka kamera
 * 3. User klik Check In atau Check Out
 * 4. Sistem capture 1 frame dari video
 * 5. Frame dikirim ke /api/verify → Next.js validasi session → forward ke Flask
 * 6. Flask verifikasi: bandingkan wajah dengan face_enrollments milik user ini
 * 7. Hasil: verified (similarity score) + attendance recorded
 */

type VerificationState = 'idle' | 'verifying' | 'success' | 'failed';

type AttendanceRecord = {
  id: string;
  type: 'masuk' | 'pulang';
  timestamp: string;
};

type AttendanceLogRow = {
  id: string;
  type: string;
  timestamp: string;
};

type VerifyPerformancePayload = {
  stage_ms?: Record<string, number>;
  precheck?: {
    brightness?: number;
    sharpness?: number;
    face_count?: number;
    face_box_ratio?: number | null;
    distance_category?: DistanceCategory | null;
    reason?: string;
    is_valid?: boolean;
  };
  liveness_confidence?: number;
  server_total_ms?: number;
  lookup_strategy?: string;
  payload_size_kb?: number | null;
  face_image_payload_kb?: number | null;
  flask_request_body_parse_ms?: number;
  flask_decode_ms?: number;
  flask_response_serialize_ms?: number;
  lookup_diagnostics?: Record<string, unknown>;
  attendance_insert?: Record<string, unknown>;
};

type ProxyPerformancePayload = {
  stage_ms?: Record<string, number>;
  flask_status?: number;
  upstream_ok?: boolean;
  auth_method?: string;
  jwt_alg?: string | null;
  jwt_has_kid?: boolean | null;
  claims_local_attempted?: boolean;
  claims_local_verified?: boolean;
  claims_fallback_to_getUser?: boolean | null;
  claims_fallback_reason?: string | null;
  payload_size_kb?: number | null;
  request_content_length_kb?: number | null;
  face_image_payload_kb?: number | null;
  flask_payload_kb?: number | null;
};

type LightingCategory = 'Gelap' | 'Cukup' | 'Terang' | 'Sangat terang';
type DistanceCategory = 'Terlalu dekat' | 'Ideal' | 'Terlalu jauh';

type LiveFaceFeedback = {
  brightnessScore: number | null;
  lightingCategory: LightingCategory | null;
};

type VerificationSummary = {
  actionType: 'masuk' | 'pulang';
  result: 'success' | 'failed';
  lightingCategory: LightingCategory | null;
  brightnessScore: number | null;
  distanceCategory: DistanceCategory | null;
  faceBoxRatio: number | null;
  sharpnessScore: number | null;
  captureTimestamp: string | null;
  captureMs: number | null;
  verifyApiMs: number | null;
  totalMs: number | null;
};

const INITIAL_LIVE_FACE_FEEDBACK: LiveFaceFeedback = {
  brightnessScore: null,
  lightingCategory: null,
};

const VERIFY_WARMUP_MIN_MS = 300;
const VERIFY_WARMUP_MAX_MS = 900;
const VERIFY_WARMUP_SAMPLE_INTERVAL_MS = 150;
const VERIFY_CAPTURE_FRAME_TARGET = 3;
const VERIFY_CAPTURE_FRAME_DELAY_MS = 120;
const LOCAL_MIN_SHARPNESS = 45;
const LOCAL_TARGET_SHARPNESS = 120;
const LOCAL_MIN_BRIGHTNESS = 35;
const LOCAL_TARGET_MIN_BRIGHTNESS = 45;
const LOCAL_MAX_BRIGHTNESS = 235;
const LOCAL_TARGET_MAX_BRIGHTNESS = 220;
const SLOW_EMBEDDING_ALERT_MS = 2500;
const SLOW_FLASK_FETCH_ALERT_MS = 4000;
const PROXY_BACKEND_GAP_ALERT_MS = 800;
const LIVE_ANALYSIS_INTERVAL_MS = 500;
const LIVE_ANALYSIS_FRAME_WIDTH = 224;
const LIVE_BRIGHTNESS_EMA_ALPHA = 0.35;
const DISTANCE_RATIO_TOO_CLOSE = 0.32;
const DISTANCE_RATIO_TOO_FAR = 0.12;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Terjadi kesalahan';
}

function formatAttendanceDuration(startTimestamp: string, endTimestamp: string): string | null {
  const startMs = new Date(startTimestamp).getTime();
  const endMs = new Date(endTimestamp).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const diffMinutes = Math.floor((endMs - startMs) / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  return `${hours}j ${minutes}m`;
}

function roundMetric(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(2));
}

function getStageMetric(
  payload: VerifyPerformancePayload | ProxyPerformancePayload | null,
  key: string
): number | null {
  const rawValue = payload?.stage_ms?.[key];
  return typeof rawValue === 'number' && Number.isFinite(rawValue)
    ? Number(rawValue.toFixed(2))
    : null;
}

function getLightingCategory(brightness: number): LightingCategory {
  if (brightness < 70) {
    return 'Gelap';
  }
  if (brightness < 140) {
    return 'Cukup';
  }
  if (brightness < 200) {
    return 'Terang';
  }
  return 'Sangat terang';
}

function getDistanceCategoryFromRatio(faceBoxRatio: number): DistanceCategory {
  if (faceBoxRatio >= DISTANCE_RATIO_TOO_CLOSE) {
    return 'Terlalu dekat';
  }

  if (faceBoxRatio <= DISTANCE_RATIO_TOO_FAR) {
    return 'Terlalu jauh';
  }

  return 'Ideal';
}

function getSimilarityLabel(similarity: number): 'Sangat cocok' | 'Cocok' | 'Batas bawah' | 'Di bawah threshold' {
  if (similarity >= 0.85) {
    return 'Sangat cocok';
  }
  if (similarity >= 0.8) {
    return 'Cocok';
  }
  if (similarity >= 0.75) {
    return 'Batas bawah';
  }
  return 'Di bawah threshold';
}

function formatMetricMs(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }
  return `${value.toFixed(2)} ms`;
}

function formatCaptureClock(timestamp: string | null): string {
  if (!timestamp) {
    return '-';
  }

  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return '-';
  }

  return format(date, 'HH:mm:ss', { locale: id });
}

function logVerifyPerformanceBreakdown(
  actionType: 'checkin' | 'checkout',
  verifyApiMs: number | null,
  backendPerformance: VerifyPerformancePayload | null,
  proxyPerformance: ProxyPerformancePayload | null
) {
  const proxyTable = {
    auth_method: proxyPerformance?.auth_method ?? null,
    jwt_alg: proxyPerformance?.jwt_alg ?? null,
    jwt_has_kid: proxyPerformance?.jwt_has_kid ?? null,
    claims_local_attempted: proxyPerformance?.claims_local_attempted ?? null,
    claims_local_verified: proxyPerformance?.claims_local_verified ?? null,
    claims_fallback_to_getUser: proxyPerformance?.claims_fallback_to_getUser ?? null,
    claims_fallback_reason: proxyPerformance?.claims_fallback_reason ?? null,
    auth_verify_ms: getStageMetric(proxyPerformance, 'auth_verify_ms'),
    flask_fetch_ms: getStageMetric(proxyPerformance, 'flask_fetch_ms'),
    proxy_total_ms: getStageMetric(proxyPerformance, 'proxy_total_ms'),
    auth_header_parse_ms: getStageMetric(proxyPerformance, 'auth_header_parse_ms'),
    request_body_parse_ms: getStageMetric(proxyPerformance, 'request_body_parse_ms'),
    flask_read_body_ms: getStageMetric(proxyPerformance, 'flask_read_body_ms'),
    flask_json_parse_ms: getStageMetric(proxyPerformance, 'flask_json_parse_ms'),
    payload_size_kb: roundMetric(proxyPerformance?.payload_size_kb),
    request_content_length_kb: roundMetric(proxyPerformance?.request_content_length_kb),
    face_image_payload_kb: roundMetric(proxyPerformance?.face_image_payload_kb),
    flask_payload_kb: roundMetric(proxyPerformance?.flask_payload_kb),
  };

  const backendTable = {
    decode_ms: getStageMetric(backendPerformance, 'decode_ms'),
    quality_ms: getStageMetric(backendPerformance, 'quality_ms'),
    liveness_ms: getStageMetric(backendPerformance, 'liveness_ms'),
    embedding_ms: getStageMetric(backendPerformance, 'embedding_ms'),
    verify_lookup_ms: getStageMetric(backendPerformance, 'verify_lookup_ms'),
    db_fetch_ms: getStageMetric(backendPerformance, 'db_fetch_ms'),
    lookup_rpc_ms: getStageMetric(backendPerformance, 'lookup_rpc_ms'),
    lookup_fallback_join_ms: getStageMetric(backendPerformance, 'lookup_fallback_join_ms'),
    response_normalize_ms: getStageMetric(backendPerformance, 'response_normalize_ms'),
    input_embedding_normalize_ms: getStageMetric(backendPerformance, 'input_embedding_normalize_ms'),
    stored_embedding_normalize_ms: getStageMetric(backendPerformance, 'stored_embedding_normalize_ms'),
    similarity_compute_ms: getStageMetric(backendPerformance, 'similarity_compute_ms'),
    similarity_ms: getStageMetric(backendPerformance, 'similarity_ms'),
    attendance_insert_ms: getStageMetric(backendPerformance, 'attendance_insert_ms'),
    payload_size_kb: roundMetric(backendPerformance?.payload_size_kb),
    face_image_payload_kb: roundMetric(backendPerformance?.face_image_payload_kb),
    flask_request_body_parse_ms: roundMetric(backendPerformance?.flask_request_body_parse_ms),
    flask_decode_ms: roundMetric(backendPerformance?.flask_decode_ms),
    flask_response_serialize_ms: roundMetric(backendPerformance?.flask_response_serialize_ms),
    server_total_ms: roundMetric(backendPerformance?.server_total_ms),
  };

  const flaskFetchMs = proxyTable.flask_fetch_ms;
  const serverTotalMs = backendTable.server_total_ms;
  const embeddingMs = backendTable.embedding_ms;
  const proxyGapMs =
    flaskFetchMs !== null && serverTotalMs !== null
      ? Number((flaskFetchMs - serverTotalMs).toFixed(2))
      : null;

  console.groupCollapsed(`[VERIFY][PERF] ${actionType.toUpperCase()} stage breakdown`);
  console.log('Summary:', {
    verify_api_ms: roundMetric(verifyApiMs),
    flask_status: proxyPerformance?.flask_status ?? null,
    upstream_ok: proxyPerformance?.upstream_ok ?? null,
    lookup_strategy: backendPerformance?.lookup_strategy ?? null,
    auth_method: proxyPerformance?.auth_method ?? null,
    jwt_alg: proxyPerformance?.jwt_alg ?? null,
    jwt_has_kid: proxyPerformance?.jwt_has_kid ?? null,
    proxy_backend_gap_ms: proxyGapMs,
  });
  console.table(proxyTable);
  console.table(backendTable);
  if (backendPerformance?.lookup_diagnostics) {
    console.table(backendPerformance.lookup_diagnostics);
  }

  if (embeddingMs !== null && embeddingMs >= SLOW_EMBEDDING_ALERT_MS) {
    console.warn(`[VERIFY][PERF] ${actionType} slow embedding stage`, {
      embedding_ms: embeddingMs,
      threshold_ms: SLOW_EMBEDDING_ALERT_MS,
    });
  }

  if (flaskFetchMs !== null && flaskFetchMs >= SLOW_FLASK_FETCH_ALERT_MS) {
    console.warn(`[VERIFY][PERF] ${actionType} slow Flask fetch`, {
      flask_fetch_ms: flaskFetchMs,
      threshold_ms: SLOW_FLASK_FETCH_ALERT_MS,
    });
  }

  if (proxyGapMs !== null && proxyGapMs >= PROXY_BACKEND_GAP_ALERT_MS) {
    console.warn(`[VERIFY][PERF] ${actionType} proxy/backend gap looks high`, {
      proxy_backend_gap_ms: proxyGapMs,
      threshold_ms: PROXY_BACKEND_GAP_ALERT_MS,
      flask_fetch_ms: flaskFetchMs,
      server_total_ms: serverTotalMs,
    });
  }

  console.groupEnd();
}

function deriveTodayAttendanceStatus(records: AttendanceRecord[]): {
  status: 'none' | 'in' | 'out';
  firstMasuk: AttendanceRecord | null;
  lastPulang: AttendanceRecord | null;
} {
  if (records.length === 0) {
    return {
      status: 'none',
      firstMasuk: null,
      lastPulang: null,
    };
  }

  const sortedRecords = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const firstMasuk = sortedRecords.find(record => record.type === 'masuk') ?? null;
  const lastPulang = [...sortedRecords].reverse().find(record => record.type === 'pulang') ?? null;
  const lastEvent = sortedRecords[sortedRecords.length - 1] ?? null;

  if (!firstMasuk) {
    return {
      status: 'none',
      firstMasuk: null,
      lastPulang,
    };
  }

  return {
    status: lastEvent?.type === 'pulang' ? 'out' : 'in',
    firstMasuk,
    lastPulang,
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type CapturedFrame = {
  image: string;
  sharpness: number;
  brightness: number;
  sizeKb: number;
  width: number;
  height: number;
};

type BestCapturedFrame = {
  image: string;
  sharpness: number;
  brightness: number;
  sizeKb: number;
  captureMs: number;
  frameCount: number;
  acceptedFrames: number;
  earlyStop: boolean;
};

function isFrameAcceptableForUpload(frame: Pick<CapturedFrame, 'sharpness' | 'brightness'>): boolean {
  return (
    frame.sharpness >= LOCAL_MIN_SHARPNESS &&
    frame.brightness >= LOCAL_MIN_BRIGHTNESS &&
    frame.brightness <= LOCAL_MAX_BRIGHTNESS
  );
}

function isFrameReadyForEarlyStop(frame: Pick<CapturedFrame, 'sharpness' | 'brightness'>): boolean {
  return (
    frame.sharpness >= LOCAL_TARGET_SHARPNESS &&
    frame.brightness >= LOCAL_TARGET_MIN_BRIGHTNESS &&
    frame.brightness <= LOCAL_TARGET_MAX_BRIGHTNESS
  );
}

export default function AttendancePage() {
  const { user, signOut, isAuthReady } = useAuth();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // State untuk UI
  const [isMounted, setIsMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<'none' | 'in' | 'out'>('none');
  const [todayAttendanceDuration, setTodayAttendanceDuration] = useState<string | null>(null);
  const [loadingTodayStatus, setLoadingTodayStatus] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // State untuk verifikasi
  const [verificationState, setVerificationState] = useState<VerificationState>('idle');
  const [verificationResult, setVerificationResult] = useState<{
    nama?: string;
    nim?: string;
    similarity?: number;
    attendance?: AttendanceRecord;
    message?: string | null;
  } | null>(null);
  const [, setLiveFaceFeedback] = useState<LiveFaceFeedback>(
    INITIAL_LIVE_FACE_FEEDBACK
  );
  const [lastVerificationSummary, setLastVerificationSummary] = useState<VerificationSummary | null>(null);
  const [experimentNote, setExperimentNote] = useState('');

  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveAnalysisBusyRef = useRef(false);
  const smoothedBrightnessRef = useRef<number | null>(null);

  const resetLiveFeedback = useCallback(() => {
    smoothedBrightnessRef.current = null;
    liveAnalysisBusyRef.current = false;
    setLiveFaceFeedback(INITIAL_LIVE_FACE_FEEDBACK);
  }, []);

  // Update waktu setiap detik
  useEffect(() => {
    setIsMounted(true);
    setCurrentTime(new Date());

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Cleanup kamera saat unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (isAuthReady && !user) {
      router.replace('/login');
    }
  }, [isAuthReady, user, router]);

  const loadTodayAttendanceStatus = useCallback(async () => {
    if (!isAuthReady) {
      return;
    }

    if (!user?.id) {
      setAttendanceStatus('none');
      setTodayAttendanceDuration(null);
      return;
    }

    setLoadingTodayStatus(true);

    try {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const { data, error } = await supabase
        .from('attendance_logs')
        .select('id, type, timestamp')
        .eq('profile_id', user.id)
        .gte('timestamp', dayStart.toISOString())
        .lte('timestamp', dayEnd.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      const rawRecords = (data ?? []) as AttendanceLogRow[];
      const records = rawRecords.reduce<AttendanceRecord[]>((acc, record) => {
        if (record.type === 'masuk' || record.type === 'pulang') {
          acc.push({
            id: String(record.id),
            type: record.type,
            timestamp: String(record.timestamp),
          });
        }
        return acc;
      }, []);

      const { status, firstMasuk, lastPulang } = deriveTodayAttendanceStatus(records);
      setAttendanceStatus(status);

      if (firstMasuk && lastPulang) {
        setTodayAttendanceDuration(
          formatAttendanceDuration(firstMasuk.timestamp, lastPulang.timestamp)
        );
      } else {
        setTodayAttendanceDuration(null);
      }
    } catch (error) {
      console.error('[ATTENDANCE] Failed to load today status:', error);
      toast.error('Gagal memuat status absensi hari ini');
    } finally {
      setLoadingTodayStatus(false);
    }
  }, [isAuthReady, user?.id]);

  useEffect(() => {
    loadTodayAttendanceStatus();
  }, [loadTodayAttendanceStatus]);

  /**
   * Capture 1 frame dari video element
   * Return base64 + metrik sharpness (Laplacian variance) untuk pemilihan frame terbaik
   */
  const captureFrame = useCallback((quality: number = 0.9): CapturedFrame | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      console.error('Video element not ready');
      return null;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Cannot get canvas context');
        return null;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Hitung ketajaman sederhana berbasis Laplacian variance di grayscale
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = new Float32Array(canvas.width * canvas.height);
      let graySum = 0;

      for (let i = 0, p = 0; i < imageData.data.length; i += 4, p++) {
        gray[p] =
          imageData.data[i] * 0.299 +
          imageData.data[i + 1] * 0.587 +
          imageData.data[i + 2] * 0.114;
        graySum += gray[p];
      }

      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
          const idx = y * canvas.width + x;
          const laplacian =
            gray[idx - canvas.width] +
            gray[idx - 1] -
            4 * gray[idx] +
            gray[idx + 1] +
            gray[idx + canvas.width];

          sum += laplacian;
          sumSq += laplacian * laplacian;
          count += 1;
        }
      }

      const mean = count > 0 ? sum / count : 0;
      const variance = count > 0 ? (sumSq / count) - (mean * mean) : 0;
      const sharpness = Number.isFinite(variance) ? variance : 0;
      const brightness = gray.length > 0 ? graySum / gray.length : 0;
      const image = canvas.toDataURL('image/jpeg', quality);

      return {
        image,
        sharpness,
        brightness,
        sizeKb: image.length / 1024,
        width: canvas.width,
        height: canvas.height,
      };
    } catch (error) {
      console.error('Frame capture error:', error);
      return null;
    }
  }, []);

  const analyzeLiveCameraFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }

    if (!liveCanvasRef.current) {
      liveCanvasRef.current = document.createElement('canvas');
    }

    const analysisCanvas = liveCanvasRef.current;
    const targetWidth = LIVE_ANALYSIS_FRAME_WIDTH;
    const targetHeight = Math.max(
      1,
      Math.round((video.videoHeight / video.videoWidth) * LIVE_ANALYSIS_FRAME_WIDTH)
    );

    if (analysisCanvas.width !== targetWidth || analysisCanvas.height !== targetHeight) {
      analysisCanvas.width = targetWidth;
      analysisCanvas.height = targetHeight;
    }

    const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
    const imageData = ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);

    let brightnessTotal = 0;
    const pixelCount = imageData.data.length / 4;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const gray =
        imageData.data[i] * 0.299 +
        imageData.data[i + 1] * 0.587 +
        imageData.data[i + 2] * 0.114;
      brightnessTotal += gray;
    }

    const frameBrightness = pixelCount > 0 ? brightnessTotal / pixelCount : 0;
    const previousBrightness = smoothedBrightnessRef.current;
    const smoothedBrightness =
      previousBrightness === null
        ? frameBrightness
        : previousBrightness * (1 - LIVE_BRIGHTNESS_EMA_ALPHA) +
          frameBrightness * LIVE_BRIGHTNESS_EMA_ALPHA;
    smoothedBrightnessRef.current = smoothedBrightness;

    setLiveFaceFeedback({
      brightnessScore: Number(smoothedBrightness.toFixed(2)),
      lightingCategory: getLightingCategory(smoothedBrightness),
    });
  }, []);

  useEffect(() => {
    if (!isCameraOn) {
      resetLiveFeedback();
      return;
    }

    if (verificationState === 'verifying') {
      return;
    }

    const runLiveAnalysis = async () => {
      if (liveAnalysisBusyRef.current) {
        return;
      }
      liveAnalysisBusyRef.current = true;
      try {
        await analyzeLiveCameraFrame();
      } finally {
        liveAnalysisBusyRef.current = false;
      }
    };

    void runLiveAnalysis();
    const intervalId = window.setInterval(() => {
      void runLiveAnalysis();
    }, LIVE_ANALYSIS_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      liveAnalysisBusyRef.current = false;
    };
  }, [analyzeLiveCameraFrame, isCameraOn, resetLiveFeedback, verificationState]);

  const waitForStableAutofocus = useCallback(async (): Promise<{
    warmupMs: number;
    stabilized: boolean;
    sample: CapturedFrame | null;
  }> => {
    const warmupStartMs = performance.now();
    let latestSample: CapturedFrame | null = null;

    await sleep(VERIFY_WARMUP_MIN_MS);

    while (true) {
      latestSample = captureFrame(0.85);
      const elapsedMs = performance.now() - warmupStartMs;

      if (latestSample) {
        console.log(
          `[WARMUP] Sample | sharpness=${latestSample.sharpness.toFixed(1)} | ` +
          `brightness=${latestSample.brightness.toFixed(1)} | elapsed=${elapsedMs.toFixed(1)}ms`
        );
      }

      if (latestSample && isFrameReadyForEarlyStop(latestSample)) {
        return {
          warmupMs: elapsedMs,
          stabilized: true,
          sample: latestSample,
        };
      }

      if (elapsedMs >= VERIFY_WARMUP_MAX_MS) {
        return {
          warmupMs: elapsedMs,
          stabilized: false,
          sample: latestSample,
        };
      }

      await sleep(VERIFY_WARMUP_SAMPLE_INTERVAL_MS);
    }
  }, [captureFrame]);

  /**
   * Capture multiple frames dengan delay kecil untuk memastikan auto-focus selesai
   * Return frame terbaik berdasarkan sharpness tertinggi
   */
  const captureBestFrame = useCallback(async (
    frameCount: number = VERIFY_CAPTURE_FRAME_TARGET,
    delayMs: number = VERIFY_CAPTURE_FRAME_DELAY_MS
  ): Promise<BestCapturedFrame | null> => {
    const captureStartMs = performance.now();
    let bestFrame: CapturedFrame | null = null;
    let bestAnyFrame: CapturedFrame | null = null;
    let bestSharpness = -1;
    let bestAnySharpness = -1;
    let attemptedFrames = 0;
    let acceptedFrames = 0;
    let earlyStop = false;

    for (let i = 0; i < frameCount; i++) {
      // Delay antar frame untuk beri waktu auto-focus
      if (i > 0) {
        await sleep(delayMs);
      }

      const captured = captureFrame(0.9);
      if (captured) {
        attemptedFrames += 1;
        const acceptedForUpload = isFrameAcceptableForUpload(captured);

        console.log(
          `[CAPTURE] Frame ${i + 1}/${frameCount} | ${captured.width}x${captured.height} | ` +
          `size=${captured.sizeKb.toFixed(1)}KB | sharpness=${captured.sharpness.toFixed(1)} | ` +
          `brightness=${captured.brightness.toFixed(1)} | upload=${acceptedForUpload ? 'yes' : 'skip'}`
        );

        if (captured.sharpness > bestAnySharpness) {
          bestAnyFrame = captured;
          bestAnySharpness = captured.sharpness;
        }

        if (!acceptedForUpload) {
          continue;
        }

        acceptedFrames += 1;
        if (captured.sharpness > bestSharpness) {
          bestFrame = captured;
          bestSharpness = captured.sharpness;
        }

        if (isFrameReadyForEarlyStop(captured)) {
          earlyStop = true;
          break;
        }
      }
    }

    if (bestFrame) {
      const captureMs = performance.now() - captureStartMs;
      console.log(
        `[CAPTURE] Best frame selected | sharpness=${bestSharpness.toFixed(1)} | ` +
        `size=${bestFrame.sizeKb.toFixed(1)}KB | brightness=${bestFrame.brightness.toFixed(1)} | ` +
        `captureMs=${captureMs.toFixed(1)} | attempted=${attemptedFrames} | accepted=${acceptedFrames} | earlyStop=${earlyStop}`
      );

      return {
        image: bestFrame.image,
        sharpness: bestFrame.sharpness,
        brightness: bestFrame.brightness,
        sizeKb: bestFrame.sizeKb,
        captureMs,
        frameCount: attemptedFrames,
        acceptedFrames,
        earlyStop,
      };
    }

    if (bestAnyFrame) {
      console.warn(
        `[CAPTURE] No locally acceptable frame found | bestSharpness=${bestAnyFrame.sharpness.toFixed(1)} | ` +
        `bestBrightness=${bestAnyFrame.brightness.toFixed(1)}`
      );
    }

    return null;
  }, [captureFrame]);

  /**
   * VERIFICATION MODE: Verifikasi wajah user yang sedang login
   * 
   * Flow:
   * 1. Capture 1 frame dari webcam
   * 2. Kirim ke /api/verify (Next.js API route)
   * 3. Next.js validasi session → dapat user_id
   * 4. Next.js forward ke Flask: { face_image, user_id, type }
   * 5. Flask verifikasi: bandingkan dengan face_enrollments user_id ini
   * 6. Return hasil: verified + similarity score + attendance data
   */
  const verifyAndAttend = useCallback(async (type: 'masuk' | 'pulang') => {
    if (verificationState === 'verifying') {
      return;
    }

    if (!user?.id) {
      toast.error('User tidak ditemukan. Silakan login ulang.');
      return;
    }

    const actionType = type === 'masuk' ? 'checkin' : 'checkout';
    const verificationStartMs = performance.now();
    let warmupMs: number | null = null;
    let captureMs: number | null = null;
    let verifyApiMs: number | null = null;
    let sharpnessScore: number | null = null;
    let lightingCondition: number | null = null;
    let similarityScore: number | null = null;
    let validFrames: number | null = null;
    let lightingCategory: LightingCategory | null = null;
    let brightnessScore: number | null = null;
    let distanceCategory: DistanceCategory | null = null;
    let faceBoxRatio: number | null = null;
    let captureTimestamp: string | null = null;
    let failureReason: string | null = null;
    let captureResult: BestCapturedFrame | null = null;

    const persistPerformance = async (result: 'success' | 'failed', metadata: Record<string, unknown> = {}) => {
      const normalizedExperimentNote = experimentNote.trim();
      const experimentNoteValue = normalizedExperimentNote.length > 0 ? normalizedExperimentNote : null;
      const totalMs = performance.now() - verificationStartMs;
      const roundedTotalMs = Number(totalMs.toFixed(2));
      const roundedWarmupMs = warmupMs !== null ? Number(warmupMs.toFixed(2)) : null;
      const roundedCaptureMs = captureMs !== null ? Number(captureMs.toFixed(2)) : null;
      const roundedVerifyApiMs = verifyApiMs !== null ? Number(verifyApiMs.toFixed(2)) : null;
      const roundedBrightnessScore = brightnessScore !== null ? Number(brightnessScore.toFixed(2)) : null;
      const roundedFaceBoxRatio = faceBoxRatio !== null ? Number(faceBoxRatio.toFixed(4)) : null;
      const roundedSharpnessScore = sharpnessScore !== null ? Number(sharpnessScore.toFixed(2)) : null;

      setLastVerificationSummary({
        actionType: type,
        result,
        lightingCategory,
        brightnessScore: roundedBrightnessScore,
        distanceCategory,
        faceBoxRatio: roundedFaceBoxRatio,
        sharpnessScore: roundedSharpnessScore,
        captureTimestamp,
        captureMs: roundedCaptureMs,
        verifyApiMs: roundedVerifyApiMs,
        totalMs: roundedTotalMs,
      });

      await logPerformanceSafe({
        profile_id: user?.id ?? null,
        action_type: actionType,
        result,
        total_ms: roundedTotalMs,
        warmup_ms: roundedWarmupMs,
        capture_ms: roundedCaptureMs,
        verify_api_ms: roundedVerifyApiMs,
        similarity_score: similarityScore,
        sharpness_score: roundedSharpnessScore,
        valid_frames: validFrames,
        lighting_condition: roundedBrightnessScore ?? lightingCondition,
        brightness_score: roundedBrightnessScore,
        lighting_category: lightingCategory,
        face_box_ratio: roundedFaceBoxRatio,
        distance_category: distanceCategory,
        experiment_note: experimentNoteValue,
        failure_reason: failureReason,
        metadata: {
          frame_count: captureResult?.frameCount ?? null,
          accepted_frames: captureResult?.acceptedFrames ?? null,
          early_stop: captureResult?.earlyStop ?? null,
          image_size_kb: captureResult ? Number(captureResult.sizeKb.toFixed(2)) : null,
          brightness_score: roundedBrightnessScore,
          lighting_category: lightingCategory,
          distance_category: distanceCategory,
          face_box_ratio: roundedFaceBoxRatio,
          sharpness_score: roundedSharpnessScore,
          capture_timestamp: captureTimestamp,
          capture_ms: roundedCaptureMs,
          verify_api_ms: roundedVerifyApiMs,
          total_ms: roundedTotalMs,
          experiment_note: experimentNoteValue,
          ...metadata,
        },
      });
    };

    try {
      const todayDate = format(new Date(), 'yyyy-MM-dd');
      let approvedLeave: Awaited<ReturnType<typeof getApprovedLeaveOnDate>> = null;

      try {
        approvedLeave = await getApprovedLeaveOnDate(user.id, todayDate);
      } catch (leaveError) {
        console.error('[VERIFY] Failed to check approved leave:', leaveError);
        toast.error('Gagal memeriksa status izin hari ini. Coba lagi.');
        return;
      }

      if (approvedLeave) {
        const leaveDateLabel = format(new Date(`${todayDate}T00:00:00`), 'dd MMMM yyyy', { locale: id });
        const leaveMessage = `Anda memiliki izin yang sudah disetujui untuk ${leaveDateLabel}. Absensi tidak dapat dilakukan pada tanggal yang sama.`;
        toast.error(leaveMessage);
        return;
      }

      setVerificationState('verifying');
      setVerificationResult(null);

      // 1. Warmup adaptif: stop lebih cepat jika fokus dan pencahayaan sudah cukup stabil.
      console.log('[VERIFY] Starting adaptive warmup before face verification...');
      const warmupResult = await waitForStableAutofocus();
      warmupMs = warmupResult.warmupMs;
      console.log(
        `[VERIFY] Warmup finished | warmupMs=${warmupMs.toFixed(1)} | stabilized=${warmupResult.stabilized}`
      );

      // 2. Capture multiple frames, pilih yang terbaik
      captureResult = await captureBestFrame();
      if (!captureResult) {
        const errorMessage = 'Frame terlalu blur atau pencahayaan belum stabil. Hadapkan wajah ke kamera dan coba lagi.';
        failureReason = errorMessage;
        toast.error(errorMessage);
        setVerificationState('failed');
        setVerificationResult({ message: errorMessage });
        void persistPerformance('failed', {
          warmup_sample: warmupResult.sample
            ? {
                sharpness: Number(warmupResult.sample.sharpness.toFixed(2)),
                brightness: Number(warmupResult.sample.brightness.toFixed(2)),
              }
            : null,
        });
        return;
      }

      captureMs = captureResult.captureMs;
      sharpnessScore = captureResult.sharpness;
      brightnessScore = captureResult.brightness;
      lightingCondition = captureResult.brightness;
      lightingCategory = getLightingCategory(captureResult.brightness);
      captureTimestamp = new Date().toISOString();
      validFrames = captureResult.acceptedFrames;

      console.log(
        '[VERIFY] Best capture selected:',
        `size=${captureResult.sizeKb.toFixed(1)}KB`,
        `sharpness=${captureResult.sharpness.toFixed(1)}`,
        `brightness=${captureResult.brightness.toFixed(1)}`,
        `captureMs=${captureResult.captureMs.toFixed(1)}`,
        `acceptedFrames=${captureResult.acceptedFrames}`,
        `earlyStop=${captureResult.earlyStop}`
      );

      // 3. Ambil access_token dari session Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.error('[VERIFY] No valid session:', sessionError?.message || 'No session found');
        failureReason = 'Session tidak ditemukan. Silakan login ulang.';
        toast.error(failureReason);
        setVerificationState('failed');
        setVerificationResult({ message: 'Session tidak ditemukan' });
        void persistPerformance('failed');
        return;
      }

      const accessToken = session.access_token;
      console.log('[VERIFY] Token acquired from session:', {
        hasToken: true,
        tokenPrefix: accessToken.substring(0, 20) + '...',
        userId: session.user.id,
        email: session.user.email,
      });

      console.log('[VERIFY] Sending verification request:', {
        type,
        imageLength: captureResult.image.length,
        hasAuthHeader: true,
      });

      // 5. Kirim ke Next.js API route DENGAN Authorization header
      const verifyApiStartMs = performance.now();
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          face_image: captureResult.image,
          type: type,
        }),
      });

      // Baca raw body dulu sebelum parse JSON
      const rawText = await response.text();
      verifyApiMs = performance.now() - verifyApiStartMs;

      console.log(
        '[VERIFY] Response status:',
        response.status,
        response.statusText,
        `verifyApiMs=${verifyApiMs.toFixed(1)}`
      );
      console.log('[VERIFY] Response body:', rawText.substring(0, 500));

      let result;
      try {
        result = rawText ? JSON.parse(rawText) : {};
      } catch {
        console.error('[VERIFY] Failed to parse JSON:', rawText.substring(0, 500));
        failureReason = 'Response dari server tidak valid';
        toast.error(failureReason);
        setVerificationState('failed');
        setVerificationResult({ message: failureReason || 'Verifikasi gagal' });
        void persistPerformance('failed', { http_status: response.status });
        return;
      }

      const backendPerformance =
        result?.performance && typeof result.performance === 'object'
          ? (result.performance as VerifyPerformancePayload)
          : null;
      const proxyPerformance =
        result?.proxy_performance && typeof result.proxy_performance === 'object'
          ? (result.proxy_performance as ProxyPerformancePayload)
          : null;
      const precheckPayload = backendPerformance?.precheck;
      if (precheckPayload) {
        const precheckFaceBoxRatio = precheckPayload.face_box_ratio;
        faceBoxRatio =
          typeof precheckFaceBoxRatio === 'number' && Number.isFinite(precheckFaceBoxRatio)
            ? precheckFaceBoxRatio
            : null;

        const precheckDistanceCategory = precheckPayload.distance_category;
        if (
          precheckDistanceCategory === 'Terlalu dekat' ||
          precheckDistanceCategory === 'Ideal' ||
          precheckDistanceCategory === 'Terlalu jauh'
        ) {
          distanceCategory = precheckDistanceCategory;
        } else {
          distanceCategory = null;
        }

        if (distanceCategory === null && faceBoxRatio !== null) {
          distanceCategory = getDistanceCategoryFromRatio(faceBoxRatio);
        }
      } else {
        console.warn('[VERIFY][DISTANCE] Missing performance.precheck in verify response');
      }

      if (distanceCategory === null || faceBoxRatio === null) {
        console.warn('[VERIFY][DISTANCE] Distance metrics unavailable in verify response', {
          precheck: precheckPayload ?? null,
          backend_performance: backendPerformance,
        });
      }

      logVerifyPerformanceBreakdown(actionType, verifyApiMs, backendPerformance, proxyPerformance);

      // 6. Handle error dari API
      if (!response.ok) {
        console.error('[VERIFY] API error:', {
          status: response.status,
          statusText: response.statusText,
          body: result,
        });

        let errorMessage = 'Verifikasi gagal';
        if (response.status === 401) {
          errorMessage = result?.error || 'Session tidak valid. Silakan login ulang.';
        } else if (response.status === 503) {
          errorMessage = 'Server verifikasi tidak tersedia. Pastikan Flask backend berjalan.';
        } else if (response.status === 504) {
          errorMessage = 'Verifikasi timeout. Coba lagi.';
        } else if (result?.error) {
          errorMessage = result.error;
        }

        failureReason = errorMessage;
        toast.error(errorMessage);
        setVerificationState('failed');
        setVerificationResult({ message: errorMessage });
        void persistPerformance('failed', {
          http_status: response.status,
          backend_performance: backendPerformance,
          proxy_performance: proxyPerformance,
        });
        return;
      }

      // 7. Success - tampilkan hasil
      console.log('[VERIFY] Success:', result);
      similarityScore = typeof result.profile?.similarity_score === 'number'
        ? result.profile.similarity_score
        : null;

      if (result.verified) {
        setVerificationState('success');
        if (type === 'masuk') {
          setAttendanceStatus('in');
          setTodayAttendanceDuration(null);
        } else {
          setAttendanceStatus('out');
        }
        void loadTodayAttendanceStatus();
        
        const similarityPercent = (result.profile?.similarity_score * 100).toFixed(1);
        const similarityLabel = getSimilarityLabel(result.profile?.similarity_score ?? 0);
        
        setVerificationResult({
          nama: result.profile?.nama,
          nim: result.profile?.nim,
          similarity: result.profile?.similarity_score,
          attendance: result.attendance,
          message: `Wajah terverifikasi! Similarity raw: ${similarityPercent}% (${similarityLabel})`,
        });

        toast.success(
          `Check ${type === 'masuk' ? 'In' : 'Out'} berhasil! (${similarityPercent}% - ${similarityLabel})`
        );
        void persistPerformance('success', {
          http_status: response.status,
          backend_performance: backendPerformance,
          proxy_performance: proxyPerformance,
        });
      } else {
        setVerificationState('failed');
        failureReason = result.message || 'Wajah tidak dikenali';
        setVerificationResult({
          message: failureReason,
        });

        toast.error(failureReason);
        void persistPerformance('failed', {
          http_status: response.status,
          backend_performance: backendPerformance,
          proxy_performance: proxyPerformance,
        });
      }

    } catch (error: unknown) {
      console.error('Verification error:', error);
      failureReason = getErrorMessage(error) || 'Terjadi kesalahan saat verifikasi';
      toast.error(failureReason);
      setVerificationState('failed');
      setVerificationResult({ message: failureReason || 'Terjadi kesalahan saat verifikasi' });
      void persistPerformance('failed');
    }
  }, [captureBestFrame, experimentNote, loadTodayAttendanceStatus, verificationState, user?.id, waitForStableAutofocus]);

  const handleCheckIn = useCallback(() => {
    if (verificationState === 'verifying') {
      return;
    }

    if (!isCameraOn) {
      toast.error('Aktifkan kamera terlebih dahulu');
      return;
    }
    if (attendanceStatus !== 'none') {
      toast.error('Anda sudah melakukan absensi hari ini');
      return;
    }
    verifyAndAttend('masuk');
  }, [isCameraOn, attendanceStatus, verifyAndAttend, verificationState]);

  const handleCheckOut = useCallback(() => {
    if (verificationState === 'verifying') {
      return;
    }

    if (!isCameraOn) {
      toast.error('Aktifkan kamera terlebih dahulu');
      return;
    }
    if (attendanceStatus !== 'in') {
      toast.error('Anda harus Check In terlebih dahulu');
      return;
    }
    verifyAndAttend('pulang');
  }, [isCameraOn, attendanceStatus, verifyAndAttend, verificationState]);

  const startCamera = useCallback(async () => {
    console.log('=== MEMBUKA KAMERA UNTUK PRESENSI ===');
    setCameraLoading(true);
    setCameraError(null);
    setVerificationState('idle');
    setVerificationResult(null);
    resetLiveFeedback();

    try {
      const isSecureContext = window.isSecureContext ||
                              window.location.hostname === 'localhost' ||
                              window.location.hostname === '127.0.0.1';

      if (!isSecureContext) {
        throw new Error('Kamera memerlukan koneksi HTTPS atau localhost');
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera');
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      console.log('Ditemukan', videoDevices.length, 'perangkat video');

      const iriunDevice = videoDevices.find(
        d => d.label.toLowerCase().includes('iriun')
      );

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      };

      if (iriunDevice) {
        console.log('[CAMERA] Iriun terdeteksi, verify tetap tanpa force deviceId:', iriunDevice.label);
        // Jangan force deviceId agar pipeline verify setara enrollment (facingMode user)
      } else {
        console.log('[CAMERA] Iriun tidak ditemukan, memakai kamera default (facingMode user)');
        videoConstraints.facingMode = 'user';
      }

      console.log('[CAMERA] Final constraints for verify pipeline:', videoConstraints);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      console.log('✅ Stream kamera diperoleh:', stream.getVideoTracks()[0]?.label);

      const primaryTrack = stream.getVideoTracks()[0];
      if (primaryTrack) {
        console.log('[CAMERA] Applied track settings:', primaryTrack.getSettings());
      }

      if (!stream.getVideoTracks().length) {
        throw new Error('Stream tidak memiliki track video');
      }

      streamRef.current = stream;
      await new Promise(resolve => setTimeout(resolve, 100));

      const videoElement = videoRef.current;
      if (!videoElement) {
        throw new Error('Element video tidak ditemukan di DOM');
      }

      videoElement.srcObject = stream;

      try {
        await videoElement.play();
        console.log('✅ Video berhasil di-play');
      } catch (playError: unknown) {
        console.error('❌ Video play error:', playError);
        throw new Error('Video playback memerlukan interaksi user');
      }

      setIsCameraOn(true);
      setCameraLoading(false);
      toast.success('Kamera berhasil diaktifkan');
      console.log('=== KAMERA BERHASIL DINYALAKAN ===');
    } catch (err: unknown) {
      console.error('❌ Error membuka kamera:', err);
      setCameraLoading(false);

      const errMessage = getErrorMessage(err);
      const errName = err instanceof Error ? err.name : '';
      let errorMessage = 'Gagal mengakses kamera';
      if (errName === 'NotAllowedError') {
        errorMessage = 'Akses kamera ditolak. Silakan izinkan akses kamera di browser Anda.';
      } else if (errName === 'NotFoundError') {
        errorMessage = 'Kamera tidak ditemukan pada perangkat ini.';
      } else if (errName === 'NotReadableError') {
        errorMessage = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi lain dan coba lagi.';
      } else if (errMessage) {
        errorMessage = errMessage;
      }

      setCameraError(errorMessage);
      toast.error(errorMessage);
    }
  }, [resetLiveFeedback]);

  const stopCamera = useCallback(() => {
    console.log('🛑 Menghentikan kamera...');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('  Track dihentikan:', track.label);
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
    setCameraLoading(false);
    setVerificationState('idle');
    setVerificationResult(null);
    resetLiveFeedback();
    toast.info('Kamera dimatikan');
  }, [resetLiveFeedback]);

  const resetVerification = useCallback(() => {
    setVerificationState('idle');
    setVerificationResult(null);
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppShell
      title="Presensi Wajah"
      eyebrow="Attendance"
      description={
        isMounted && currentTime
          ? `${format(currentTime, 'EEEE, dd MMMM yyyy', { locale: id })} • Gunakan kamera yang stabil untuk check-in dan check-out.`
          : 'Gunakan kamera yang stabil untuk check-in dan check-out.'
      }
      userName={user.name}
      userNim={user.nim}
      userEmail={user.email}
      onSignOut={signOut}
    >
      <ActionLoadingOverlay
        open={verificationState === 'verifying'}
        title='Sedang memverifikasi wajah...'
        description='Kami sedang menunggu fokus kamera stabil, memilih frame terbaik, dan memvalidasi wajah Anda.'
      />
      <div className="space-y-6">
        <section className="app-hero">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Status Hari Ini</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {attendanceStatus === 'none'
                  ? 'Belum Absen'
                  : attendanceStatus === 'in'
                  ? 'Sudah Check In'
                  : 'Sudah Check Out'}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Waktu Saat Ini</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {isMounted && currentTime ? format(currentTime, 'HH:mm:ss', { locale: id }) : '--:--:--'}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">Durasi Hari Ini</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {todayAttendanceDuration || '-'}
              </p>
            </div>
          </div>
        </section>

        <Card className="mx-auto max-w-5xl">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Clock className="h-6 w-6" />
                Waktu Saat Ini
              </CardTitle>
              <CardDescription>
                {isMounted && currentTime
                  ? format(currentTime, 'dd MMMM yyyy, HH:mm:ss', { locale: id })
                  : 'Memuat waktu...'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex flex-col items-center space-y-4">
                {/* Camera Preview */}
                <div className="relative w-full max-w-3xl aspect-video bg-gray-900 rounded-xl overflow-hidden border-2 border-gray-700">
                  {/* Camera Loading Overlay */}
                  {cameraLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
                      <div className="text-center text-white">
                        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-3" />
                        <p className="text-sm">Menginisialisasi kamera...</p>
                      </div>
                    </div>
                  )}

                  {/* Video Element */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      isCameraOn ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ display: 'block', zIndex: 10 }}
                  />

                  {/* Placeholder - saat kamera OFF */}
                  {!isCameraOn && !cameraLoading && (
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center text-gray-400"
                      style={{ zIndex: 5 }}
                    >
                      <CameraOff className="h-16 w-16 mb-3" />
                      <p className="text-lg font-medium">Kamera Tidak Aktif</p>
                      <p className="text-sm mt-1">Klik tombol di bawah untuk mengaktifkan</p>
                    </div>
                  )}

                  {/* Error Message */}
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/90 z-30">
                      <div className="text-center text-white p-6">
                        <CameraOff className="h-12 w-12 mx-auto mb-3" />
                        <p className="font-medium mb-2">Error Kamera</p>
                        <p className="text-sm">{cameraError}</p>
                      </div>
                    </div>
                  )}

                  {/* Camera Active Indicator */}
                  {isCameraOn && (
                    <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 z-20">
                      <div className="h-2 w-2 rounded-full bg-white animate-pulse"></div>
                      Kamera Aktif
                    </div>
                  )}
                </div>

                {/* Tombol Buka/Tutup Kamera */}
                <div className="w-full max-w-3xl">
                  {!isCameraOn ? (
                    <Button
                      onClick={startCamera}
                      disabled={cameraLoading}
                      className="h-14 w-full text-base"
                      size="lg"
                    >
                      {cameraLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Mengaktifkan Kamera...
                        </>
                      ) : (
                        <>
                          <Camera className="h-5 w-5 mr-2" />
                          Aktifkan Kamera
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="flex gap-3">
                      <Button
                        onClick={stopCamera}
                        variant="outline"
                        className="h-14 flex-1 border-red-200 bg-red-50 text-base text-red-600 hover:bg-red-100 hover:text-red-700"
                        size="lg"
                      >
                        <CameraOff className="h-5 w-5 mr-2" />
                        Matikan Kamera
                      </Button>
                      {verificationState !== 'idle' && (
                        <Button
                          onClick={resetVerification}
                          variant="outline"
                          className="h-14 text-base"
                          size="lg"
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Verification Result Display */}
                {verificationState === 'success' && verificationResult && (
                  <div className="w-full max-w-3xl p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-green-800 font-semibold text-lg">Verifikasi Berhasil!</p>
                        <p className="text-green-700 mt-1">{verificationResult.message}</p>
                        <div className="mt-2 space-y-1 text-sm text-green-700">
                          <p><span className="font-medium">Nama:</span> {verificationResult.nama}</p>
                          <p><span className="font-medium">NIM:</span> {verificationResult.nim}</p>
                          {verificationResult.attendance && (
                            <p>
                              <span className="font-medium">Waktu:</span>{' '}
                              {format(new Date(verificationResult.attendance.timestamp), 'HH:mm:ss')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {verificationState === 'failed' && verificationResult && (
                  <div className="w-full max-w-3xl p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-red-800 font-semibold text-lg">Verifikasi Gagal</p>
                        <p className="text-red-700 mt-1">{verificationResult.message}</p>
                        <div className="mt-3 space-y-1">
                          <p className="text-sm text-red-600">Kemungkinan penyebab:</p>
                          <ul className="text-sm text-red-600 list-disc list-inside">
                            <li>Wajah tidak terdeteksi dengan jelas</li>
                            <li>Pencahayaan kurang baik</li>
                            <li>Belum enroll wajah (hubungi admin)</li>
                            <li>Wajah berbeda dengan yang terdaftar</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 w-full max-w-3xl">
                  <Button
                    onClick={handleCheckIn}
                    disabled={!isCameraOn || loadingTodayStatus || attendanceStatus !== 'none' || verificationState === 'verifying'}
                    className={`flex-1 py-6 text-lg transition-all ${
                      !isCameraOn || loadingTodayStatus || verificationState === 'verifying'
                        ? 'opacity-40 cursor-not-allowed bg-gray-300 text-gray-500'
                        : attendanceStatus !== 'none'
                        ? 'opacity-50 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {verificationState === 'verifying' ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Memverifikasi...
                      </>
                    ) : loadingTodayStatus ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Memuat Status...
                      </>
                    ) : (
                      <>
                        <UserCheck className="mr-2 h-5 w-5" />
                        Check In
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleCheckOut}
                    disabled={!isCameraOn || loadingTodayStatus || attendanceStatus !== 'in' || verificationState === 'verifying'}
                    className={`flex-1 py-6 text-lg transition-all ${
                      !isCameraOn || loadingTodayStatus || attendanceStatus !== 'in' || verificationState === 'verifying'
                        ? 'opacity-40 cursor-not-allowed'
                        : 'bg-orange-600 hover:bg-orange-700'
                    }`}
                  >
                    <UserX className="mr-2 h-5 w-5" />
                    Check Out
                  </Button>
                </div>

                {/* Status Indicator */}
                {attendanceStatus === 'in' && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200 w-full max-w-3xl">
                    <div className="flex items-center">
                      <div className="mr-3 flex-shrink-0">
                        <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></div>
                      </div>
                      <p className="text-green-800 font-medium">Status: Sudah Check In</p>
                    </div>
                  </div>
                )}

                {attendanceStatus === 'out' && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 w-full max-w-3xl">
                    <div className="flex items-center">
                      <div className="mr-3 flex-shrink-0">
                        <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                      </div>
                      <div>
                        <p className="text-blue-800 font-medium">Status: Sudah Check Out</p>
                        {todayAttendanceDuration && (
                          <p className="text-blue-700 text-sm mt-1">
                            Durasi hadir hari ini: {todayAttendanceDuration}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
                <aside className="w-full space-y-4 lg:sticky lg:top-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Catatan Eksperimen (Opsional)
                    </p>
                    <Textarea
                      value={experimentNote}
                      onChange={event => setExperimentNote(event.target.value)}
                      maxLength={400}
                      placeholder="Contoh: Cahaya lampu kamar, kamera laptop, warm run, jarak ideal."
                      className="mt-2 min-h-28 bg-white"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Catatan ini akan ikut tersimpan ke performance log ({experimentNote.length}/400).
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      Isi sebelum atau sesudah absen. Panel ini tidak memengaruhi proses verifikasi.
                    </p>
                  </div>

                  {lastVerificationSummary && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-1">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Ringkasan Performa Verifikasi
                          </p>
                          <p className="text-xs text-slate-600">
                            {lastVerificationSummary.actionType === 'masuk' ? 'Check In' : 'Check Out'} -{' '}
                            {lastVerificationSummary.result === 'success' ? 'Berhasil' : 'Gagal'}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500">
                          Capture: {formatCaptureClock(lastVerificationSummary.captureTimestamp)}
                        </p>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-xs text-slate-500">Waktu Capture</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMetricMs(lastVerificationSummary.captureMs)}
                          </p>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-xs text-slate-500">Waktu Verify API</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMetricMs(lastVerificationSummary.verifyApiMs)}
                          </p>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-xs text-slate-500">Total Proses</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMetricMs(lastVerificationSummary.totalMs)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
