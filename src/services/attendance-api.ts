// services/attendance-api.ts
import { getSupabaseWithAuth } from '@/lib/supabase-attendance';

const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001';

// Function to register a student with face data
export async function registerStudentWithFace(data: {
  nim: string;
  name: string;
  class_schedule?: string;
  semester?: string;
  face_image: string; // base64 encoded image
}) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Registration failed');
    }

    return result;
  } catch (error) {
    console.error('Error registering student:', error);
    throw error;
  }
}

// Function to verify face using Flask backend
export async function verifyFace(faceImage: string) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ face_image: faceImage }),
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

// Function to verify face and record attendance in one call
// DEPRECATED: Use verifyFaceAndRecordAttendance from face-recognition-service instead
export async function verifyFaceAndRecordAttendance(faceImage: string, type: 'masuk' | 'pulang') {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        face_image: faceImage,
        type
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

// Function to record attendance in Supabase after face verification
export async function recordAttendance(profileId: string, type: 'masuk' | 'pulang') {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: profileId,
        type,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Attendance recording failed');
    }

    return result;
  } catch (error) {
    console.error('Error recording attendance:', error);
    throw error;
  }
}

// Function to get attendance history
export async function getAttendanceHistory(profileId: string) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/attendance/${profileId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to fetch attendance history');
    }

    return result;
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    throw error;
  }
}