import type { Metadata } from 'next'
import './globals.css'
import '../styles/fonts.css'; // Import fonts separately for Turbopack compatibility
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: 'Sistem Presensi & Izin Mahasiswa',
  description: 'Aplikasi presensi dan pengajuan izin mahasiswa',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}