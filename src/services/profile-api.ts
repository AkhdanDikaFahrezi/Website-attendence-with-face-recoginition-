import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client only if environment variables are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Client-side service for profile operations using Supabase directly
// This works with our NIM-based authentication system

export async function getSupabaseProfileByNim(nim: string | null) {
  if (!nim || !supabase) {
    return null;
  }

  try {
    // Query the profiles table to find a profile with the provided NIM
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('nim', nim)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Record not found
        console.warn(`Profile not found for NIM: ${nim}`);
        return null;
      }
      console.error('Error fetching profile by NIM:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching profile by NIM:', error);
    return null;
  }
}

// Function to create a new profile if it doesn't exist
export async function createProfileForNim(nim: string, name: string) {
  if (!supabase) {
    console.warn("Supabase not configured. Cannot create profile.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        nim,
        nama: name, // Changed from full_name to nama to match db schema
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error creating profile:', error);
    return null;
  }
}

// Alternative implementation that gets or creates a profile based on NIM
export async function getOrCreateProfileByNim(nim: string, name: string) {
  if (!nim || !name) {
    return null;
  }

  try {
    // First, try to get existing profile
    let profile = await getSupabaseProfileByNim(nim);

    if (!profile) {
      // If profile doesn't exist, create it
      profile = await createProfileForNim(nim, name);
    }

    return profile;
  } catch (error) {
    console.error('Error getting or creating profile by NIM:', error);
    return null;
  }
}