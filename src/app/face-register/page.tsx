'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LegacyFaceRegisterPage() {
  const { user, isAuthReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    router.replace(user ? '/dashboard' : '/register');
  }, [isAuthReady, router, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Flow Enrollment Lama Dimatikan</CardTitle>
          <CardDescription>
            Route `/face-register` sudah tidak menjadi flow resmi. Sistem akan mengarahkan Anda ke jalur yang aktif.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Mengarahkan...
        </CardContent>
      </Card>
    </div>
  );
}
