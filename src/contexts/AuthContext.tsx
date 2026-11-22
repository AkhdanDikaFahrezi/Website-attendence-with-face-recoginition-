'use client';

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase-client';
import { enrollFace } from '@/services/face-recognition-service';
import { logPerformanceSafe } from '@/services/performance-service';

export type UserRole = 'student' | 'admin';

interface User {
  id: string;
  email?: string;
  name?: string;
  nim?: string;
  jurusan?: string;
  kelas?: string;
  semester?: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthReady: boolean;
  isAdmin: boolean;
  isProfileComplete: boolean;
  signIn: (email: string, password: string) => Promise<unknown>;
  signUp: (input: SignUpInput) => Promise<unknown>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<unknown>;
}

interface SignUpInput {
  email: string;
  password: string;
  name: string;
  nim: string;
  jurusan: string;
  kelas: string;
  semester: string;
  faceImages?: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Unknown error');
  }

  return 'Unknown error';
}

function normalizeRole(rawRole: string | null | undefined): UserRole {
  if (rawRole === 'admin' || rawRole === 'dosen' || rawRole === 'lecturer') {
    return 'admin';
  }
  return 'student';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateUserFromSession = async (sessionUser: { id: string; email?: string | null }) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, nim, nama, jurusan, kelas, semester, role')
        .eq('id', sessionUser.id)
        .maybeSingle();

      if (error) {
        console.warn('Profile not found or not accessible:', error.message);
      }

      setUser({
        id: sessionUser.id,
        email: sessionUser.email || undefined,
        name: profile?.nama || undefined,
        nim: profile?.nim || undefined,
        jurusan: profile?.jurusan || undefined,
        kelas: profile?.kelas || undefined,
        semester: profile?.semester || undefined,
        role: normalizeRole(profile?.role),
      });
    } catch (profileError: unknown) {
      console.warn('Error fetching profile (user still authenticated):', getErrorMessage(profileError));
      setUser({
        id: sessionUser.id,
        email: sessionUser.email || undefined,
        role: 'student',
      });
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          await hydrateUserFromSession({
            id: session.user.id,
            email: session.user.email,
          });
        } else {
          setUser(null);
        }
      } catch (sessionError: unknown) {
        console.warn('Session check error:', getErrorMessage(sessionError));
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await hydrateUserFromSession({
          id: session.user.id,
          email: session.user.email,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    return result;
  };

  const signUp = async ({
    email,
    password,
    name,
    nim,
    jurusan,
    kelas,
    semester,
    faceImages = [],
  }: SignUpInput) => {
    const registerStartMs = performance.now();
    let performanceLogged = false;
    let profileIdForLog: string | null = null;
    let enrollmentMs: number | null = null;
    let validFrames: number | null = null;
    let failureReason: string | null = null;
    let enrollmentErrorForLog: string | null = null;

    const persistRegisterPerformance = async (result: 'success' | 'failed') => {
      if (performanceLogged) {
        return;
      }
      performanceLogged = true;

      const totalMs = performance.now() - registerStartMs;
      await logPerformanceSafe({
        profile_id: profileIdForLog,
        action_type: 'register',
        result,
        total_ms: Number(totalMs.toFixed(2)),
        enrollment_ms: enrollmentMs !== null ? Number(enrollmentMs.toFixed(2)) : null,
        valid_frames: validFrames,
        failure_reason: failureReason,
        metadata: {
          submitted_frames: faceImages.length,
          enrollment_error: enrollmentErrorForLog,
        },
      });
    };

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            nim,
            jurusan,
            kelas,
            semester,
          },
        },
      });

      if (error) {
        console.error('Sign up error:', JSON.stringify(error, null, 2));
        failureReason = getErrorMessage(error);
        await persistRegisterPerformance('failed');
        throw error;
      }

      if (data.user) {
        profileIdForLog = data.user.id;

        try {
          await new Promise((resolve) => setTimeout(resolve, 500));

          const { data: existingProfile, error: selectError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', data.user.id)
            .maybeSingle();

          if (selectError) {
            console.error('Error checking existing profile:', JSON.stringify(selectError, null, 2));
            throw selectError;
          }

          const profilePayload = {
            email,
            nama: name,
            nim,
            jurusan,
            kelas,
            semester,
            enrollment_status: 'pending',
            role: 'student' as const,
          };

          if (existingProfile) {
            const { error: updateError } = await supabase
              .from('profiles')
              .update(profilePayload)
              .eq('id', data.user.id);

            if (updateError) {
              console.error('Error updating profile:', JSON.stringify(updateError, null, 2));
              throw updateError;
            }
          } else {
            const { error: profileError } = await supabase
              .from('profiles')
              .insert([
                {
                  id: data.user.id,
                  ...profilePayload,
                },
              ]);

            if (profileError) {
              console.error('Error creating profile:', JSON.stringify(profileError, null, 2));
              throw profileError;
            }
          }

          let enrollmentError: string | undefined;

          if (faceImages.length >= 3) {
            const enrollmentStartMs = performance.now();
            try {
              const enrollmentResult = await enrollFace(data.user.id, faceImages);
              enrollmentMs = performance.now() - enrollmentStartMs;

              if (
                enrollmentResult &&
                typeof enrollmentResult === 'object' &&
                'processed_images' in enrollmentResult
              ) {
                const processedImages = (enrollmentResult as { processed_images?: unknown }).processed_images;
                if (typeof processedImages === 'number') {
                  validFrames = processedImages;
                }
              }
            } catch (enrollError: unknown) {
              enrollmentMs = performance.now() - enrollmentStartMs;
              console.error('Error enrolling face:', enrollError);
              enrollmentError = getErrorMessage(enrollError) || 'Pendaftaran wajah gagal diproses.';
              enrollmentErrorForLog = enrollmentError;
            }
          }

          if (enrollmentError) {
            failureReason = enrollmentError;
            await persistRegisterPerformance('failed');
          } else {
            await persistRegisterPerformance('success');
          }

          return {
            ...data,
            enrollmentError,
          };
        } catch (profileError: unknown) {
          console.error('Error handling profile:', profileError);
          failureReason = `Error handling profile: ${getErrorMessage(profileError)}`;
          await persistRegisterPerformance('failed');
          throw new Error(failureReason);
        }
      }

      await persistRegisterPerformance('success');
      return data;
    } catch (error: unknown) {
      if (!failureReason) {
        failureReason = getErrorMessage(error);
      }
      await persistRegisterPerformance('failed');
      throw error;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);

    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };

  const forgotPassword = async (email: string) => {
    const result = await supabase.auth.resetPasswordForEmail(email);
    return result;
  };

  const isAdmin = user?.role === 'admin';
  const isProfileComplete = !!(user?.nim && user?.name && user?.kelas && user?.semester);
  const isAuthReady = !loading;

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthReady,
      isAdmin,
      isProfileComplete,
      signIn,
      signUp,
      signOut,
      forgotPassword,
    }),
    [user, loading, isAuthReady, isAdmin, isProfileComplete]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
