'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn, user } = useAuth();

  // Redirect if user is already logged in
  useEffect(() => {
    if (user) {
      router.replace(user.role === 'admin' ? '/admin' : '/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = (await signIn(email, password)) as
        | { error?: unknown }
        | undefined;

      if (result?.error) {
        throw result.error;
      }

      toast.success('Login berhasil!');
    } catch (error: unknown) {
      console.error('Login error:', error);
      // Handle different types of errors
      let errorMessage = 'Terjadi kesalahan';
      const errorObject = typeof error === 'object' && error !== null
        ? (error as { message?: string; error_description?: string })
        : null;

      if (errorObject?.message) {
        errorMessage = errorObject.message;
      } else if (errorObject?.error_description) {
        errorMessage = errorObject.error_description;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Check for specific error types
      if (errorObject?.message?.includes('Invalid login credentials') || errorObject?.error_description?.includes('Invalid login credentials')) {
        toast.error('Email atau password salah. Silakan coba lagi.');
      } else if (
        errorObject?.message?.includes('email rate limit exceeded') || 
        errorObject?.error_description?.includes('email rate limit exceeded') ||
        errorObject?.message?.includes('rate limit') ||
        errorObject?.message?.includes('Too many requests')
      ) {
        toast.error('Too many attempts. Please wait a few minutes.');
      } else if (errorObject?.message?.includes('Email not confirmed') || errorObject?.error_description?.includes('Email not confirmed')) {
        toast.error('Email belum dikonfirmasi. Silakan cek email Anda dan klik tautan konfirmasi sebelum login.');
      } else if (errorObject?.message?.includes('does not exist') || errorObject?.error_description?.includes('does not exist')) {
        toast.error('Akun tidak ditemukan. Silakan daftar terlebih dahulu.', {
          action: {
            label: 'Daftar',
            onClick: () => router.push('/register')
          }
        });
      } else {
        toast.error(`Login gagal: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Login</CardTitle>
          <CardDescription>Masuk ke akun Anda untuk melanjutkan</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="masukkan@email.com"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Memproses...' : 'Login'}
            </Button>
          </form>
          
          <div className="mt-4 text-center text-sm">
            Belum punya akun?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Daftar di sini
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
