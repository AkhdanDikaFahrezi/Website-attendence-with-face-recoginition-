'use client';

import { useState } from 'react';
import { ActionLoadingOverlay } from '@/components/ui/action-loading-overlay';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { FaceCapture } from '@/components/FaceCapture';

const REQUIRED_FACE_IMAGES = 5;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [nim, setNim] = useState('');
  const [jurusan, setJurusan] = useState('');
  const [kelas, setKelas] = useState('');
  const [semester, setSemester] = useState('');
  const [faceImages, setFaceImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1); // Step 1: Data, Step 2: Face
  const router = useRouter();
  const { signUp } = useAuth();

  const handleSubmitStep1 = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name || !nim || !jurusan || !kelas || !semester || !email || !password) {
      toast.error('Semua field harus diisi');
      return;
    }

    if (password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    // Move to face capture step
    setStep(2);
  };

  const handleSubmitFinal = async () => {
    if (faceImages.length < REQUIRED_FACE_IMAGES) {
      toast.error(
        `Harap ambil semua ${REQUIRED_FACE_IMAGES} foto wajah (baru ${faceImages.length}/${REQUIRED_FACE_IMAGES})`
      );
      return;
    }

    setLoading(true);

    try {
      const result = await signUp({
        email,
        password,
        name,
        nim,
        jurusan,
        kelas,
        semester,
        faceImages,
      });

      if (result.enrollmentError) {
        toast.warning(`Akun berhasil dibuat, tetapi pendaftaran wajah belum selesai: ${result.enrollmentError}`);
      } else {
        toast.success('Akun berhasil dibuat! Silakan cek email Anda dan klik tautan konfirmasi untuk dapat login.');
      }

      router.push('/login');
    } catch (error: unknown) {
      console.error('Sign up error:', error);
      console.error('Full error object:', serializeError(error));

      let errorMessage = 'Terjadi kesalahan';
      if (error && typeof error === 'object' && 'message' in error && error.message) {
        errorMessage = String(error.message);
      } else if (
        error &&
        typeof error === 'object' &&
        'error_description' in error &&
        error.error_description
      ) {
        errorMessage = String(error.error_description);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Handle specific errors
      if (
        error &&
        typeof error === 'object' &&
        (
          ('message' in error && String(error.message ?? '').includes('User already registered')) ||
          ('error_description' in error && String(error.error_description ?? '').includes('User already registered'))
        )
      ) {
        toast.error('Email sudah terdaftar. Silakan gunakan email lain atau coba login.');
      } else if (
        error &&
        typeof error === 'object' &&
        (
          ('message' in error && (
            String(error.message ?? '').includes('email rate limit exceeded') ||
            String(error.message ?? '').includes('rate limit') ||
            String(error.message ?? '').includes('Too many requests')
          )) ||
          ('error_description' in error && String(error.error_description ?? '').includes('email rate limit exceeded'))
        )
      ) {
        toast.error('Too many attempts. Please try again in a few minutes.');
      } else if (
        error &&
        typeof error === 'object' &&
        (
          ('message' in error && String(error.message ?? '').includes('Error creating profile')) ||
          ('error_description' in error && String(error.error_description ?? '').includes('Error creating profile'))
        )
      ) {
        toast.error('Akun berhasil dibuat tetapi terjadi masalah saat menyimpan profil. Silakan lengkapi profil Anda setelah login.');
        router.push('/login');
      } else if (
        error &&
        typeof error === 'object' &&
        (
          ('message' in error && String(error.message ?? '').includes('duplicate key value violates unique constraint')) ||
          ('error_description' in error && String(error.error_description ?? '').includes('duplicate key value violates unique constraint'))
        )
      ) {
        if (
          ('message' in (error as object) && String((error as { message?: unknown }).message ?? '').includes('profiles_email_key')) ||
          ('error_description' in (error as object) && String((error as { error_description?: unknown }).error_description ?? '').includes('profiles_email_key'))
        ) {
          toast.error('Email sudah digunakan oleh akun lain. Silakan gunakan email lain.');
        } else if (
          ('message' in (error as object) && String((error as { message?: unknown }).message ?? '').includes('profiles_nim_key')) ||
          ('error_description' in (error as object) && String((error as { error_description?: unknown }).error_description ?? '').includes('profiles_nim_key'))
        ) {
          toast.error('NIM sudah digunakan oleh akun lain. Silakan gunakan NIM lain.');
        } else {
          toast.error(`Pendaftaran gagal: ${errorMessage}`);
        }
      } else if (
        error &&
        typeof error === 'object' &&
        (
          ('message' in error && String(error.message ?? '').includes('permission denied')) ||
          ('error_description' in error && String(error.error_description ?? '').includes('permission denied'))
        )
      ) {
        toast.error('Tidak memiliki izin untuk membuat profil. Silakan hubungi administrator.');
      } else if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        String(error.message ?? '').includes('Akun berhasil dibuat')
      ) {
        toast.error(errorMessage);
        router.push('/login');
      } else {
        toast.error(`Pendaftaran gagal: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <ActionLoadingOverlay
        open={loading}
        title="Sedang membuat akun..."
        description="Kami sedang menyimpan akun dan memproses data wajah Anda. Mohon tunggu sebentar."
      />
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {step === 1 ? 'Daftar Akun Baru' : `Verifikasi Wajah (${REQUIRED_FACE_IMAGES} Foto)`}
          </CardTitle>
          <CardDescription>
            {step === 1
              ? 'Buat akun untuk mengakses sistem presensi'
              : `Ambil ${REQUIRED_FACE_IMAGES} foto wajah yang jelas untuk pendaftaran cepat dan stabil`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              step === 1 ? 'bg-purple-600 text-white' : 'bg-green-600 text-white'
            }`}>
              1
            </div>
            <div className={`w-16 h-1 ${step === 2 ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-700'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              step === 2 ? 'bg-purple-600 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              2
            </div>
          </div>

          {step === 1 ? (
            /* Step 1: User Data */
            <form onSubmit={handleSubmitStep1} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Lengkap</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap Anda"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nim">NIM</Label>
                <Input
                  id="nim"
                  type="text"
                  value={nim}
                  onChange={(e) => setNim(e.target.value)}
                  placeholder="Nomor Induk Mahasiswa"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="jurusan">Program Studi / Jurusan</Label>
                <Select value={jurusan} onValueChange={setJurusan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih program studi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="te">Teknik Elektronika Manufaktur</SelectItem>
                    <SelectItem value="tre">Sarjana Terapan Teknologi Rekayasa Elektronika</SelectItem>
                    <SelectItem value="ti">Teknik Instrumentasi</SelectItem>
                    <SelectItem value="tm">Teknik Mekatronika</SelectItem>
                    <SelectItem value="trpe">Teknologi Rekayasa Pembangkit Energi</SelectItem>
                    <SelectItem value="trr">Teknologi Rekayasa Robotika</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="kelas">Kelas</Label>
                  <Select value={kelas} onValueChange={setKelas}>
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
                  <Select value={semester} onValueChange={setSemester}>
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dhikafahrezi111@gmail.com"
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
                  placeholder="Minimal 6 karakter"
                  required
                  minLength={6}
                />
              </div>

              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 rounded-lg">
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  ℹ️ <strong>Info:</strong> Ambil <strong>{REQUIRED_FACE_IMAGES} foto wajah</strong> yang jelas dengan pose ringan berbeda agar enrollment tetap cepat tanpa mengorbankan stabilitas.
                </p>
              </div>

              <Button type="submit" className="w-full">
                Lanjut ke Verifikasi Wajah →
              </Button>
            </form>
          ) : (
            /* Step 2: Face Capture (5 Photos) */
            <div className="space-y-4">
              <FaceCapture onCaptureComplete={setFaceImages} capturedImages={faceImages} />

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  ← Kembali
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmitFinal}
                  disabled={faceImages.length < REQUIRED_FACE_IMAGES || loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'Memproses...' : `Daftar Sekarang (${faceImages.length}/${REQUIRED_FACE_IMAGES})`}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Sudah punya akun?{' '}
            <Link href="/login" className="font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:underline">
              Login di sini
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
