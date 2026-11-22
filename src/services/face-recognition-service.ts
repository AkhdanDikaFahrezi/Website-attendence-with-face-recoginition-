// services/face-recognition-service.ts
import { getSupabaseWithAuth } from '@/lib/supabase-attendance';

const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001';

function formatEnrollmentError(result: unknown) {
  if (!result || typeof result !== 'object') {
    return 'Face enrollment failed';
  }

  const payload = result as {
    error?: unknown;
    details?: {
      rejected_reasons?: Record<string, number>;
      processed_images?: number;
      submitted_images?: number;
    };
  };

  const baseMessage = typeof payload.error === 'string' ? payload.error : 'Face enrollment failed';
  const rejectedReasons = payload.details?.rejected_reasons;

  if (!rejectedReasons || Object.keys(rejectedReasons).length === 0) {
    return baseMessage;
  }

  const reasonSummary = Object.entries(rejectedReasons)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(', ');

  return `${baseMessage}. Foto ditolak: ${reasonSummary}`;
}

// Function to register a student with face data using the new enrollment flow
export async function enrollFace(profileId: string, faceImages: string[]) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/register/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: profileId,
        face_images: faceImages, // Array of base64 images
        validate_liveness: true
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(formatEnrollmentError(result));
    }

    return result;
  } catch (error) {
    console.error('Error enrolling face:', error);
    throw error;
  }
}

// Function to verify face using the new endpoint with liveness detection
export async function verifyFaceWithLiveness(faceImage: string, performLiveness: boolean = true) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/verify/face`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        face_image: faceImage,
        perform_liveness: performLiveness
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Face verification failed');
    }

    return result;
  } catch (error) {
    console.error('Error verifying face:', error);
    throw error;
  }
}

// Function to verify face and record attendance in one call with liveness detection
export async function verifyFaceAndRecordAttendance(faceImage: string, type: 'masuk' | 'pulang') {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/verify/face`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        face_image: faceImage,
        type,
        perform_liveness: true
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Face verification and attendance recording failed');
    }

    return result;
  } catch (error) {
    console.error('Error verifying face and recording attendance:', error);
    throw error;
  }
}

// Function to perform liveness detection challenge
export async function performLivenessChallenge(framesSequence: string[]) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/verify/liveness-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        frames_sequence: framesSequence
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Liveness challenge failed');
    }

    return result;
  } catch (error) {
    console.error('Error performing liveness challenge:', error);
    throw error;
  }
}

// Function to get enrollment status for a profile
export async function getEnrollmentStatus(profileId: string) {
  try {
    const supabase = getSupabaseWithAuth();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('enrollment_status')
      .eq('id', profileId)
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  } catch (error) {
    console.error('Error getting enrollment status:', error);
    throw error;
  }
}

// Function to get face recognition statistics
export async function getFaceRecognitionStats() {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/stats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to fetch stats');
    }

    return result;
  } catch (error) {
    console.error('Error fetching face recognition stats:', error);
    throw error;
  }
}
