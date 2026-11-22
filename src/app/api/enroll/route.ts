import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API Proxy: Next.js → Flask Backend (Face Enrollment)
 * 
 * Flow:
 * 1. Browser kirim multiple face images ke endpoint ini
 * 2. Next.js validasi session Supabase (dapat user_id)
 * 3. Next.js forward request ke Flask dengan user_id
 * 4. Flask proses: validasi quality → extract embeddings → average → simpan ke face_enrollments
 * 5. Flask return hasil → Next.js forward ke browser
 * 
 * Konvensi flow aktif:
 * - minimum valid frame: 3
 * - target ideal frame: 5
 *
 * Kenapa enrollment terpisah dari absensi?
 * - Enrollment: multi-capture, proses lebih lama, buat master embedding
 * - Absensi: single-capture, verifikasi cepat, bandingkan dengan master embedding
 */

const FLASK_API_URL = process.env.FLASK_API_URL || 'http://localhost:5001';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function POST(req: NextRequest) {
  try {
    // ==========================================
    // STEP 1: Validasi session Supabase
    // ==========================================
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase environment variables not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login first.' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // ==========================================
    // STEP 2: Parse dan validasi request body
    // ==========================================
    const body = await req.json();
    const { face_images, validate_liveness } = body;

    if (!face_images || !Array.isArray(face_images) || face_images.length < 3) {
      return NextResponse.json(
        { error: 'Diperlukan minimal 3 foto wajah untuk enrollment' },
        { status: 400 }
      );
    }

    if (face_images.length > 10) {
      return NextResponse.json(
        { error: 'Maksimal 10 foto wajah untuk enrollment' },
        { status: 400 }
      );
    }

    // ==========================================
    // STEP 3: Forward ke Flask backend
    // ==========================================
    const flaskPayload = {
      profile_id: userId,
      face_images: face_images,
      validate_liveness: validate_liveness !== undefined ? validate_liveness : true,
    };

    let flaskResponse;
    try {
      flaskResponse = await fetch(`${FLASK_API_URL}/api/register/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(flaskPayload),
        // Timeout 60 detik (enrollment proses lebih lama: multi-capture + average)
        signal: AbortSignal.timeout(60000),
      });
    } catch (fetchError: unknown) {
      const fetchErrorMessage = getErrorMessage(fetchError);
      console.error('Flask connection error:', fetchErrorMessage);
      
      if (fetchError instanceof Error && fetchError.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Enrollment timeout. Server mungkin sedang sibuk.' },
          { status: 504 }
        );
      }

      return NextResponse.json(
        { error: 'Tidak dapat terhubung ke server enrollment. Pastikan Flask backend berjalan.' },
        { status: 503 }
      );
    }

    // ==========================================
    // STEP 4: Parse dan return hasil dari Flask
    // ==========================================
    const flaskResult = await flaskResponse.json();

    if (!flaskResponse.ok) {
      console.error('Flask enrollment error:', flaskResult);
      return NextResponse.json(
        { error: flaskResult.error || 'Enrollment gagal' },
        { status: flaskResponse.status }
      );
    }

    // Success - forward hasil Flask ke browser
    return NextResponse.json(flaskResult);

  } catch (error: unknown) {
    console.error('Enrollment proxy error:', getErrorMessage(error));
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat enrollment' },
      { status: 500 }
    );
  }
}
