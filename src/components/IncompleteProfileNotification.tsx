'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface IncompleteProfileNotificationProps {
  onClose?: () => void;
}

export default function IncompleteProfileNotification({ onClose }: IncompleteProfileNotificationProps) {
  const { user, isProfileComplete } = useAuth();
  const router = useRouter();
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Check if profile is incomplete and user exists
    if (user && !isProfileComplete) {
      setShowNotification(true);
    }
  }, [user, isProfileComplete]);

  const handleFillProfile = () => {
    router.push('/lengkapi-profil');
  };

  const handleClose = () => {
    setShowNotification(false);
    if (onClose) onClose();
  };

  if (!showNotification || !user) {
    return null;
  }

  // Determine which fields are missing
  const missingFields = [];
  if (!user.kelas) missingFields.push('kelas');
  if (!user.semester) missingFields.push('semester');
  if (!user.email) missingFields.push('email');

  return (
    <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 mb-4">
      <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <AlertTitle className="flex justify-between items-center">
        <span>Profil Belum Lengkap</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription className="text-yellow-800 dark:text-yellow-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-grow">
            Profil Anda belum lengkap. Mohon lengkapi informasi berikut:
            <span className="font-medium ml-1">
              {missingFields.map((field, index) => (
                <span key={field}>
                  {field === 'kelas' && 'Kelas'}
                  {field === 'semester' && 'Semester'}
                  {field === 'email' && 'Email'}
                  {index < missingFields.length - 1 && ', '}
                </span>
              ))}
              .
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFillProfile}
              className="border-yellow-500 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-300 dark:hover:bg-yellow-800"
            >
              Lengkapi Sekarang
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-yellow-700 hover:bg-yellow-100 dark:text-yellow-300 dark:hover:bg-yellow-800"
            >
              Nanti Saja
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}