// src/lib/user-profile-check.ts
import { supabase } from '@/lib/supabase-client';

export type ProfileCheckResult = {
  profileFilled: boolean;
  enrollmentStatus: string | null;
  profileData: unknown;
};

/**
 * Checks if user profile is complete and face registration is done
 */
export async function checkUserProfileCompletion(userId: string): Promise<ProfileCheckResult> {
  try {
    // Query the profiles table using user id
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, nim, nama, kelas, semester, enrollment_status')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      // If no profile found, user needs to complete profile
      return {
        profileFilled: false,
        enrollmentStatus: null,
        profileData: null
      };
    }

    if (!profile) {
      // No profile exists, user needs to complete profile
      return {
        profileFilled: false,
        enrollmentStatus: null,
        profileData: null
      };
    }

    // Check if required fields are filled
    const isProfileComplete = profile.nim && profile.nama && profile.kelas && profile.semester;
    
    return {
      profileFilled: !!isProfileComplete,
      enrollmentStatus: profile.enrollment_status || null,
      profileData: profile
    };
  } catch (error) {
    console.error('Unexpected error in checkUserProfileCompletion:', error);
    return {
      profileFilled: false,
      enrollmentStatus: null,
      profileData: null
    };
  }
}
