import { supabase } from './supabase';

// Function to store user profile in Supabase when they log in
export async function storeUserProfile(nim: string, name: string, userId?: string) {
  // Check if Supabase is configured
  if (!supabase) {
    console.warn("Supabase not configured. Cannot store user profile.");
    return { success: false, user: null, error: 'Database not configured' };
  }

  try {
    // If userId is not provided, we'll need to get it from the current session
    if (!userId) {
      console.error('User ID is required for storing profile');
      throw new Error('User ID is required');
    }

    // Check if user already exists by NIM (get the most recent one if there are duplicates)
    // Use select() without single() to avoid the "multiple rows" error
    const { data: existingUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('nim', nim)
      .order('created_at', { ascending: false }); // Order by creation date descending to get the most recent first

    if (fetchError) {
      console.error('Error checking existing user:', fetchError);
      throw new Error(fetchError.message);
    }

    // Get the first item from the array (most recent if multiple exist)
    const user = Array.isArray(existingUsers) && existingUsers.length > 0 ? existingUsers[0] : null;

    if (user) {
      // User already exists, just update the nama if it's different
      const { data: updatedData, error: updateError } = await supabase
        .from('profiles')
        .update({
          nama: name, // Fixed: was using 'nama' instead of 'name' parameter
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id) // Update using the specific ID to avoid ambiguity
        .select()
        .single();

      if (updateError) {
        console.error('Error updating user:', updateError);
        throw new Error(updateError.message);
      }

      return { success: true, user: updatedData };
    } else {
      // User doesn't exist, create new profile
      const { data, error: insertError } = await supabase
        .from('profiles')
        .insert([{
          id: userId, // Use the Supabase user ID as the profile ID
          nim,
          nama: name,
          join_date: new Date().toISOString(),
          enrollment_status: 'pending' // Default status
        }])
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user profile:', insertError);
        throw new Error(insertError.message);
      }

      return { success: true, user: data };
    }
  } catch (error) {
    console.error('Error in storeUserProfile:', error);
    throw error;
  }
}

// Function to fetch user profile by NIM with better error handling
export async function fetchUserProfile(nim: string) {
  // Check if Supabase is configured
  if (!supabase) {
    console.warn("Supabase not configured. Returning fallback data.");
    return { nim, nama: 'User', jurusan: '', kelas: '', semester: '', email: '' };
  }

  try {
    // Use select() without single() to avoid the "multiple rows" error
    // Fetch all records with the NIM and take the most recent one
    const { data: allRecords, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('nim', nim)
      .order('created_at', { ascending: false }); // Order by creation date descending to get the most recent first

    if (error) {
      console.error('Error fetching user profile:', error?.message || error);

      // Handle specific error codes
      if (error?.code === '42P01') { // Undefined table
        console.error('Profiles table does not exist in Supabase');
        return null;
      }

      // For other errors, return a fallback object
      console.warn('Supabase fetch failed, returning fallback data');
      return { nim, nama: 'User', jurusan: '', kelas: '', semester: '', email: '' };
    }

    // Handle the case where we get multiple records - take the first (most recent) one
    if (Array.isArray(allRecords) && allRecords.length > 0) {
      return allRecords[0]; // Return the most recent record
    }

    // If data is null or empty array, it means no user was found, which is not an error
    console.log(`User profile for NIM ${nim} not found`);
    return null;
  } catch (error: any) {
    console.error('Error in fetchUserProfile:', error?.message || error);

    // Check if this is a network error
    if (error?.name === 'TypeError' || error?.message?.includes('fetch')) {
      console.warn('Network error occurred, returning fallback data');
      return { nim, nama: 'User', jurusan: '', kelas: '', semester: '', email: '' };
    }

    // For other errors, return a fallback object
    return { nim, nama: 'User', jurusan: '', kelas: '', semester: '', email: '' };
  }
}

// Function to update user profile in Supabase
export async function updateUserProfile(nim: string, profileData: Partial<{ name: string; jurusan: string; kelas: string; semester: string; email: string }>) {
  // Check if Supabase is configured
  if (!supabase) {
    console.warn("Supabase not configured. Cannot update user profile in database, but will continue with operation.");
    // Instead of throwing an error, we'll return a success-like response
    // since the app can still function without database persistence
    return {
      nim,
      ...profileData,
      updated_at: new Date().toISOString()
    };
  }

  try {
    // First, get the existing profile to update
    // Use select() without single() to avoid the "multiple rows" error
    const { data: allProfiles, error: fetchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('nim', nim)
      .order('created_at', { ascending: false }); // Order by creation date descending to get the most recent first

    if (fetchError) {
      console.error('Error fetching existing profile for update:', fetchError);
      throw new Error(fetchError.message);
    }

    // Get the first item from the array (most recent if multiple exist)
    const profile = Array.isArray(allProfiles) && allProfiles.length > 0 ? allProfiles[0] : null;

    // Map the 'name' field to 'nama' to match the database schema
    const { name, ...otherProfileData } = profileData;
    const updateData: any = {
      ...otherProfileData,
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) {
      updateData.nama = name;
    }

    // If we found an existing profile, update it using the specific ID to avoid ambiguity
    if (profile) {
      const { data, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profile.id) // Update using the specific ID to avoid ambiguity
        .select()
        .single();

      if (error) {
        console.error('Error updating user profile:', error);
        throw new Error(error.message);
      }

      return data;
    } else {
      // If no existing profile found, we can't update anything
      console.warn(`No profile found for NIM ${nim} to update`);
      return null;
    }
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    throw error;
  }
}

// Function to get the profiles table schema
// This is the schema we're expecting:
/*
  id: string (primary key, auto-generated)
  nim: string (unique)
  name: string
  kelas: string (optional)
  semester: string (optional)
  email: string (optional)
  join_date: string (timestamp)
  total_attendance: number (optional)
  this_month_attendance: number (optional)
  attendance_rate: number (optional)
  created_at: string (timestamp)
  updated_at: string (timestamp)
*/