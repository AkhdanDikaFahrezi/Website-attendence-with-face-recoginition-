'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireCompleteProfile?: boolean; // Whether to require a complete profile
}

export default function ProtectedRoute({ children, requireCompleteProfile = true }: ProtectedRouteProps) {
  const { user, loading, isProfileComplete } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // If user is not logged in, redirect to login
      if (!user) {
        router.push('/login');
        return;
      }

      // If profile completeness is required and profile is not complete, redirect to profile completion
      if (requireCompleteProfile && !isProfileComplete) {
        router.push('/lengkapi-profil');
      }
    }
  }, [user, loading, isProfileComplete, requireCompleteProfile, router]);

  // Show loading state while checking authentication status
  if (loading || (user && requireCompleteProfile && !isProfileComplete)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">Memeriksa status profil...</p>
        </div>
      </div>
    );
  }

  // Only render children if user is authenticated and profile is complete (if required)
  return <>{children}</>;
}