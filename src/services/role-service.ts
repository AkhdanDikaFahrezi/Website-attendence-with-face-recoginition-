import { supabase } from '@/lib/supabase';

// Define user roles
export type UserRole = 'student' | 'admin';

function normalizeRole(role: string | null | undefined): UserRole {
  if (role === 'admin' || role === 'dosen' || role === 'lecturer') {
    return 'admin';
  }

  return 'student';
}

// Function to get user role based on Supabase user ID
export async function getUserRole(userId: string | null): Promise<UserRole | null> {
  if (!userId) {
    return null;
  }

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    if (!profile) {
      console.log('No profile found for user ID:', userId);
      return null;
    }

    return normalizeRole(profile.role);
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

// Function to check if user has admin privileges
export async function isAdmin(userId: string | null): Promise<boolean> {
  try {
    const role = await getUserRole(userId);
    return role === 'admin';
  } catch (error) {
    console.error('Error checking if user is admin:', error);
    return false;
  }
}

// Function to check if user has student privileges
export async function isStudent(userId: string | null): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === 'student';
}
