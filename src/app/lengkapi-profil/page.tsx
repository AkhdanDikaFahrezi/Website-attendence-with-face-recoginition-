'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { updateUserProfile } from '@/lib/supabase-user';

export default function LengkapiProfilPage() {
  const { user, loading, isProfileComplete } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    nama: user?.name || '',
    kelas: user?.kelas || '',
    semester: user?.semester || '',
    email: user?.email || '',
    nim: user?.nim || ''
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Redirect if profile is already complete
  useEffect(() => {
    if (!loading && isProfileComplete) {
      router.push('/'); // Redirect to home if profile is complete
    }
  }, [isProfileComplete, loading, router]);

  // If still loading, show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">Memeriksa data profil...</p>
        </div>
      </div>
    );
  }

  // If user is not logged in, redirect to login
  if (!user) {
    router.push('/login');
    return null;
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setError(null);
    setSaveStatus('idle');

    // Validate required fields
    if (!formData.nama.trim()) {
      setError('Nama lengkap wajib diisi');
      return;
    }

    if (!formData.kelas.trim()) {
      setError('Kelas wajib dipilih');
      return;
    }

    if (!formData.semester.trim()) {
      setError('Semester wajib dipilih');
      return;
    }

    if (!formData.email.trim()) {
      setError('Email wajib diisi');
      return;
    }

    try {
      // Update the profile
      await updateUserProfile(formData.nim, {
        name: formData.nama,
        kelas: formData.kelas,
        semester: formData.semester,
        email: formData.email
      });

      setSaveStatus('success');

      // Update the local user context
      // We'll wait a bit before redirecting to show success message
      setTimeout(() => {
        router.push('/'); // Redirect to home after successful update
      }, 1500);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Gagal memperbarui profil. Silakan coba lagi.');
      setSaveStatus('error');
    }
  };

  if (isProfileComplete) {
    return null; // This should not happen due to the useEffect redirect, but just in case
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl">
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto p-3 bg-blue-100 rounded-full">
                <User className="h-8 w-8 text-blue-600" />
              </div>
              <CardTitle className="text-2xl font-bold">Lengkapi Profil</CardTitle>
              <CardDescription>
                Mohon lengkapi informasi profil Anda untuk melanjutkan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert className="bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 dark:text-red-200">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {saveStatus === 'success' && (
                <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    Profil berhasil dilengkapi! Anda akan diarahkan...
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nim">NIM</Label>
                  <Input
                    id="nim"
                    value={formData.nim}
                    disabled
                    className="bg-gray-100 dark:bg-gray-800"
                  />
                  <p className="text-xs text-gray-500">NIM tidak dapat diubah</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nama">Nama Lengkap</Label>
                  <Input
                    id="nama"
                    value={formData.nama}
                    onChange={(e) => handleInputChange('nama', e.target.value)}
                    placeholder="Masukkan nama lengkap Anda"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kelas">Kelas</Label>
                  <Select value={formData.kelas} onValueChange={(value) => handleInputChange('kelas', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pagi">Kelas Pagi</SelectItem>
                      <SelectItem value="malam">Kelas Malam</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="semester">Semester</Label>
                  <Select value={formData.semester} onValueChange={(value) => handleInputChange('semester', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih semester" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Semester 1</SelectItem>
                      <SelectItem value="2">Semester 2</SelectItem>
                      <SelectItem value="3">Semester 3</SelectItem>
                      <SelectItem value="4">Semester 4</SelectItem>
                      <SelectItem value="5">Semester 5</SelectItem>
                      <SelectItem value="6">Semester 6</SelectItem>
                      <SelectItem value="7">Semester 7</SelectItem>
                      <SelectItem value="8">Semester 8</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Masukkan email aktif Anda"
                  />
                  <p className="text-xs text-gray-500">
                    Gunakan email dengan akhiran "@admin" atau "@dosen" untuk akses admin
                  </p>
                </div>
              </div>

              <Button
                className="w-full mt-6"
                onClick={handleSave}
                disabled={saveStatus === 'success'}
              >
                {saveStatus === 'success' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Profil Lengkap!
                  </>
                ) : (
                  <>
                    {saveStatus === 'idle' ? 'Lengkapi Profil' : 'Memproses...'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}