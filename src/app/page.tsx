'use client';

import { useAuth } from '@/contexts/AuthContext';
import { NeuralNetworkBackground } from '@/components/NeuralNetworkBackground';
import { FaceCarousel } from '@/components/FaceCarousel';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Camera, LayoutDashboard, LogIn, UserPlus } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();
  const primaryHref = user ? '/dashboard' : '/login';
  const secondaryHref = user ? '/absen' : '/register';
  const subtitle = user
    ? 'Session Anda masih aktif. Landing page tetap terbuka, dan Anda bisa masuk ke dashboard atau langsung ke halaman absensi saat diperlukan.'
    : 'Silakan login atau daftar untuk melanjutkan';
  const primaryLabel = user ? 'Buka Dashboard' : 'Login ke Akun Anda';
  const secondaryLabel = user ? 'Buka Halaman Absen' : 'Daftar Akun Baru';

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center p-4 md:p-8">
      <div className="relative w-full max-w-7xl h-[90vh] max-h-[900px] bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        <NeuralNetworkBackground />

        <div className="relative w-full md:w-1/2 h-[40vh] md:h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-b md:border-b-0 md:border-r border-purple-500/20">
          <FaceCarousel />
        </div>

        <div className="relative w-full md:w-1/2 h-[60vh] md:h-full bg-gray-900 overflow-y-auto">
          <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
            <div className="text-center space-y-3">
              <h1 className="text-4xl font-bold text-white">Sistem Absensi Wajah</h1>
              <p className="text-gray-400 text-lg">{subtitle}</p>
            </div>

            <Link href={primaryHref} className="w-full max-w-sm">
              <Button className="w-full h-14 text-base bg-purple-600 hover:bg-purple-700" size="lg">
                {user ? <LayoutDashboard className="h-5 w-5 mr-2" /> : <LogIn className="h-5 w-5 mr-2" />}
                {primaryLabel}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>

            <Link href={secondaryHref} className="w-full max-w-sm">
              <Button
                variant="outline"
                className="w-full h-14 text-base border-purple-500 text-purple-400 hover:bg-purple-900/20"
                size="lg"
              >
                {user ? <Camera className="h-5 w-5 mr-2" /> : <UserPlus className="h-5 w-5 mr-2" />}
                {secondaryLabel}
              </Button>
            </Link>

            <div className="max-w-sm space-y-2 text-sm text-gray-400 pt-6 border-t border-gray-700">
              <p className="font-medium text-center text-gray-300">Petunjuk:</p>
              <ul className="space-y-1">
                {user ? (
                  <>
                    <li>- Landing page tetap public dan tidak redirect otomatis.</li>
                    <li>- Klik <span className="text-purple-400 font-medium">Buka Dashboard</span> saat ingin melihat area privat.</li>
                    <li>- Klik <span className="text-purple-400 font-medium">Buka Halaman Absen</span> saat ingin langsung presensi.</li>
                  </>
                ) : (
                  <>
                    <li>- Jika sudah punya akun, klik <span className="text-purple-400 font-medium">Login</span></li>
                    <li>- Jika belum punya akun, klik <span className="text-purple-400 font-medium">Daftar</span></li>
                    <li>- Pastikan email sudah dikonfirmasi sebelum login</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
