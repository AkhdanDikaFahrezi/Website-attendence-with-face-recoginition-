import { NextRequest } from 'next/server';
import { fetchUserProfile, updateUserProfile } from '@/lib/supabase-user';

export async function GET(request: NextRequest) {
  // Extract NIM from query parameters
  const { searchParams } = new URL(request.url);
  const nim = searchParams.get('nim');

  if (!nim) {
    return Response.json({ error: 'NIM is required' }, { status: 400 });
  }

  try {
    const profile = await fetchUserProfile(nim);

    if (!profile) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    return Response.json({
      id: profile.id || null,
      user_id: profile.nim,
      nim: profile.nim,
      nama: profile.nama,
      jurusan: profile.jurusan || '',
      kelas: profile.kelas || '',
      semester: profile.semester || '',
      email: profile.email || '',
      join_date: profile.join_date || new Date().toISOString(),
      total_attendance: profile.total_attendance || 0,
      this_month_attendance: profile.this_month_attendance || 0,
      attendance_rate: profile.attendance_rate || 0
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { nama, jurusan, kelas, semester, email, nim } = body;

    if (!nim) {
      return Response.json({ error: 'NIM is required' }, { status: 400 });
    }

    const updatedProfile = await updateUserProfile(nim, {
      name: nama, // This will be mapped to 'nama' in the updateUserProfile function
      jurusan,
      kelas,
      semester,
      email
    });

    return Response.json({
      id: updatedProfile.id || null,
      user_id: updatedProfile.nim,
      nim: updatedProfile.nim,
      nama: updatedProfile.nama,
      jurusan: updatedProfile.jurusan || '',
      kelas: updatedProfile.kelas || '',
      semester: updatedProfile.semester || '',
      email: updatedProfile.email || '',
      join_date: updatedProfile.join_date || new Date().toISOString(),
      total_attendance: updatedProfile.total_attendance || 0,
      this_month_attendance: updatedProfile.this_month_attendance || 0,
      attendance_rate: updatedProfile.attendance_rate || 0
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    // Return more detailed error for debugging
    return Response.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}