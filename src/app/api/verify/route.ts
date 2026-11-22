import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

type ProxyStageMap = Record<string, number>;

type JwtDiagnostics = {
  auth_method: 'none' | 'getUser';
  jwt_alg: string | null;
  jwt_has_kid: boolean | null;
  claims_local_attempted: boolean;
  claims_local_verified: boolean;
  claims_fallback_to_getUser: boolean | null;
  claims_fallback_reason: string | null;
  jwt_parse_error?: string;
};

function roundTiming(value: number): number {
  return Number(value.toFixed(2));
}

function buildProxyPerformance(stageMs: ProxyStageMap, extra: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
    stage_ms: Object.fromEntries(
      Object.entries(stageMs).map(([key, value]) => [key, roundTiming(value)])
    ),
  };

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null) {
      continue;
    }
    payload[key] = typeof value === 'number' ? roundTiming(value) : value;
  }

  return payload;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return 'UnknownError';
}

function getErrorCauseCode(error: unknown): string {
  if (
    error instanceof Error &&
    'cause' in error &&
    error.cause &&
    typeof error.cause === 'object' &&
    'code' in error.cause &&
    typeof error.cause.code === 'string'
  ) {
    return error.cause.code;
  }

  return 'N/A';
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(segment.length / 4) * 4,
    '='
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

function inspectJwtForClaimsFeasibility(token: string): JwtDiagnostics {
  const diagnostics: JwtDiagnostics = {
    auth_method: 'getUser',
    jwt_alg: null,
    jwt_has_kid: null,
    claims_local_attempted: false,
    claims_local_verified: false,
    claims_fallback_to_getUser: null,
    claims_fallback_reason: null,
  };

  try {
    const [rawHeader] = token.split('.');
    if (!rawHeader) {
      throw new Error('JWT header missing');
    }

    const header = decodeBase64UrlJson(rawHeader);
    const alg = typeof header.alg === 'string' ? header.alg : null;
    const kid = typeof header.kid === 'string' && header.kid.length > 0 ? header.kid : null;
    const hasWebCrypto = typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle;

    diagnostics.jwt_alg = alg;
    diagnostics.jwt_has_kid = !!kid;

    if (!alg) {
      diagnostics.claims_fallback_to_getUser = true;
      diagnostics.claims_fallback_reason = 'missing_alg';
    } else if (alg.startsWith('HS')) {
      diagnostics.claims_fallback_to_getUser = true;
      diagnostics.claims_fallback_reason = 'symmetric_signing_key';
    } else if (!kid) {
      diagnostics.claims_fallback_to_getUser = true;
      diagnostics.claims_fallback_reason = 'missing_kid';
    } else if (!hasWebCrypto) {
      diagnostics.claims_fallback_to_getUser = true;
      diagnostics.claims_fallback_reason = 'webcrypto_unavailable';
    } else {
      diagnostics.claims_fallback_to_getUser = false;
      diagnostics.claims_fallback_reason = null;
    }
  } catch (error) {
    diagnostics.claims_fallback_to_getUser = true;
    diagnostics.claims_fallback_reason = 'jwt_parse_failed';
    diagnostics.jwt_parse_error = getErrorMessage(error);
  }

  return diagnostics;
}

export async function POST(req: NextRequest) {
  const proxyStart = performance.now();
  let authDiagnostics: JwtDiagnostics = {
    auth_method: 'none',
    jwt_alg: null,
    jwt_has_kid: null,
    claims_local_attempted: false,
    claims_local_verified: false,
    claims_fallback_to_getUser: null,
    claims_fallback_reason: null,
  };
  const payloadDiagnostics: Record<string, unknown> = {};
  const stageMs: ProxyStageMap = {
    auth_header_parse_ms: 0,
    auth_verify_ms: 0,
    request_body_parse_ms: 0,
    flask_fetch_ms: 0,
    flask_read_body_ms: 0,
    flask_json_parse_ms: 0,
    proxy_total_ms: 0,
  };

  const respond = (
    payload: Record<string, unknown>,
    status: number,
    extra: Record<string, unknown> = {}
  ) => {
    stageMs.proxy_total_ms = performance.now() - proxyStart;
    return NextResponse.json(
      {
        ...payload,
        proxy_performance: buildProxyPerformance(stageMs, {
          ...authDiagnostics,
          ...payloadDiagnostics,
          ...extra,
        }),
      },
      { status }
    );
  };

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabase) {
      console.error('[VERIFY] Missing environment variables:', {
        hasUrl: !!SUPABASE_URL,
        hasAnonKey: !!SUPABASE_ANON_KEY,
      });
      return respond(
        { error: 'Server configuration error: missing Supabase credentials' },
        500,
        { upstream_ok: false }
      );
    }

    const authHeaderStart = performance.now();
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');

    console.log('[VERIFY] Auth header check:', {
      hasAuthHeader: !!authHeader,
      headerPrefix: authHeader ? authHeader.substring(0, 15) + '...' : 'none',
    });

    if (!authHeader) {
      stageMs.auth_header_parse_ms = performance.now() - authHeaderStart;
      console.warn('[VERIFY] Missing Authorization header');
      return respond(
        { error: 'Authorization header diperlukan. Kirim sebagai Bearer token.' },
        401,
        { upstream_ok: false }
      );
    }

    if (!authHeader.startsWith('Bearer ')) {
      stageMs.auth_header_parse_ms = performance.now() - authHeaderStart;
      console.warn('[VERIFY] Invalid auth header format:', authHeader.substring(0, 20));
      return respond(
        { error: 'Format header salah. Gunakan: Authorization: Bearer <token>' },
        401,
        { upstream_ok: false }
      );
    }

    const token = authHeader.slice(7);
    stageMs.auth_header_parse_ms = performance.now() - authHeaderStart;
    authDiagnostics = inspectJwtForClaimsFeasibility(token);

    if (!token || token.length < 10) {
      console.warn('[VERIFY] Token too short or empty');
      return respond(
        { error: 'Token tidak valid' },
        401,
        { upstream_ok: false }
      );
    }

    console.log('[VERIFY] Bearer token extracted:', {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + '...',
      jwtAlg: authDiagnostics.jwt_alg,
      jwtHasKid: authDiagnostics.jwt_has_kid,
      claimsFallbackReason: authDiagnostics.claims_fallback_reason,
    });

    const authVerifyStart = performance.now();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    stageMs.auth_verify_ms = performance.now() - authVerifyStart;

    if (authError || !user) {
      console.warn('[VERIFY] Token verification failed:', {
        error: authError?.message || 'unknown',
        errorCode: authError?.status || 'N/A',
        tokenLength: token.length,
      });
      return respond(
        { error: authError?.message || 'Token tidak valid atau kadaluarsa' },
        401,
        { upstream_ok: false }
      );
    }

    const userId = user.id;
    console.log('[VERIFY] User authenticated via Bearer token:', {
      userId,
      email: user.email,
      createdAt: user.created_at,
    });

    let body: Record<string, unknown>;
    const requestBodyStart = performance.now();
    try {
      body = await req.json();
      stageMs.request_body_parse_ms = performance.now() - requestBodyStart;
    } catch (parseError) {
      stageMs.request_body_parse_ms = performance.now() - requestBodyStart;
      console.error('[VERIFY] Request body parse error:', parseError);
      return respond(
        { error: 'Invalid JSON in request body' },
        400,
        { upstream_ok: false }
      );
    }

    const faceImage = typeof body.face_image === 'string' ? body.face_image : '';
    const attendanceType = body.type;
    const requestContentLengthKb = (() => {
      const contentLength = req.headers.get('content-length');
      const parsed = contentLength ? Number(contentLength) : NaN;
      return Number.isFinite(parsed) ? parsed / 1024 : null;
    })();
    payloadDiagnostics.payload_size_kb = requestContentLengthKb;
    payloadDiagnostics.request_content_length_kb = requestContentLengthKb;
    payloadDiagnostics.face_image_payload_kb = faceImage ? faceImage.length / 1024 : null;

    if (!faceImage) {
      console.warn('[VERIFY] Missing face_image in request body');
      return respond(
        { error: 'face_image diperlukan' },
        400,
        { upstream_ok: false }
      );
    }

    if (attendanceType !== 'masuk' && attendanceType !== 'pulang') {
      console.warn('[VERIFY] Invalid type value:', attendanceType);
      return respond(
        { error: 'type harus "masuk" atau "pulang"' },
        400,
        { upstream_ok: false }
      );
    }

    console.log('[VERIFY] Request body valid, preparing Flask call:', {
      userId,
      type: attendanceType,
      imageSize: `${(faceImage.length / 1024).toFixed(1)}KB`,
      flaskUrl: `${FLASK_API_URL}/api/verify/face`,
    });

    const flaskPayload = {
      face_image: faceImage,
      user_id: userId,
      type: attendanceType,
    };
    const flaskPayloadString = JSON.stringify(flaskPayload);
    payloadDiagnostics.flask_payload_kb = flaskPayloadString.length / 1024;

    console.log('[VERIFY] Calling Flask endpoint...', {
      method: 'POST',
      url: `${FLASK_API_URL}/api/verify/face`,
      payloadSize: `${(flaskPayloadString.length / 1024).toFixed(1)}KB`,
    });

    let flaskResponse: Response;
    const flaskFetchStart = performance.now();
    try {
      flaskResponse = await fetch(`${FLASK_API_URL}/api/verify/face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: flaskPayloadString,
        signal: AbortSignal.timeout(30000),
      });
      stageMs.flask_fetch_ms = performance.now() - flaskFetchStart;
    } catch (fetchError: unknown) {
      stageMs.flask_fetch_ms = performance.now() - flaskFetchStart;
      const fetchErrorMessage = getErrorMessage(fetchError);
      const fetchErrorName = getErrorName(fetchError);
      console.error('[VERIFY] Flask connection error:', {
        message: fetchErrorMessage,
        name: fetchErrorName,
        code: getErrorCauseCode(fetchError),
        flaskUrl: `${FLASK_API_URL}/api/verify/face`,
      });

      if (fetchErrorName === 'TimeoutError') {
        return respond(
          { error: 'Verifikasi timeout. Server mungkin sedang sibuk.' },
          504,
          { upstream_ok: false }
        );
      }

      if (fetchErrorMessage.includes('fetch failed') || fetchErrorMessage.includes('ECONNREFUSED')) {
        return respond(
          { error: `Tidak dapat terhubung ke server verifikasi. Pastikan Flask backend berjalan di ${FLASK_API_URL}` },
          503,
          { upstream_ok: false }
        );
      }

      return respond(
        { error: `Tidak dapat terhubung ke server verifikasi: ${fetchErrorMessage}` },
        503,
        { upstream_ok: false }
      );
    }

    let rawBody = '';
    const readBodyStart = performance.now();
    try {
      rawBody = await flaskResponse.text();
      stageMs.flask_read_body_ms = performance.now() - readBodyStart;
    } catch (readError) {
      stageMs.flask_read_body_ms = performance.now() - readBodyStart;
      console.error('[VERIFY] Failed to read Flask response body:', readError);
      return respond(
        { error: 'Gagal membaca response dari server verifikasi' },
        502,
        { upstream_ok: false, flask_status: flaskResponse.status }
      );
    }

    console.log('[VERIFY] Flask raw response:', {
      httpStatus: flaskResponse.status,
      contentType: flaskResponse.headers.get('content-type') || 'unknown',
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 200),
    });

    let flaskResult: Record<string, unknown>;
    const parseJsonStart = performance.now();
    try {
      flaskResult = rawBody ? JSON.parse(rawBody) : {};
      stageMs.flask_json_parse_ms = performance.now() - parseJsonStart;
    } catch {
      stageMs.flask_json_parse_ms = performance.now() - parseJsonStart;
      console.error('[VERIFY] Flask response invalid JSON:', {
        status: flaskResponse.status,
        rawBody: rawBody.substring(0, 500),
      });
      return respond(
        { error: 'Server verifikasi mengembalikan response tidak valid' },
        502,
        { upstream_ok: false, flask_status: flaskResponse.status }
      );
    }

    console.log('[VERIFY] Flask response parsed:', {
      verified: flaskResult?.verified,
      hasProfile: !!flaskResult?.profile,
      hasAttendance: !!flaskResult?.attendance,
      error: flaskResult?.error || null,
    });

    if (!flaskResponse.ok) {
      console.error('[VERIFY] Flask returned error status:', {
        status: flaskResponse.status,
        error: flaskResult?.error || 'No error message',
        result: flaskResult,
      });
      return respond(
        {
          ...flaskResult,
          error:
            typeof flaskResult.error === 'string'
              ? flaskResult.error
              : 'Verifikasi gagal di server',
        },
        flaskResponse.status,
        { upstream_ok: false, flask_status: flaskResponse.status }
      );
    }

    console.log('[VERIFY] Verification successful, returning to client');
    return respond(
      flaskResult,
      200,
      { upstream_ok: true, flask_status: flaskResponse.status }
    );
  } catch (error: unknown) {
    console.error('[VERIFY] UNEXPECTED ERROR:', {
      message: getErrorMessage(error),
      name: getErrorName(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') || 'No stack' : 'No stack',
    });
    return respond(
      { error: `Terjadi kesalahan tak terduga: ${getErrorMessage(error)}` },
      500,
      { upstream_ok: false }
    );
  }
}
