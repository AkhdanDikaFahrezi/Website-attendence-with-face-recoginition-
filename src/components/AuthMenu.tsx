'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { LogOut, User, History, Camera, Shield, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function AuthMenu() {
  const { user, signOut, loading, isAdmin } = useAuth();
  const router = useRouter();

  if (loading || !user) {
    return (
      <div className="flex items-center space-x-4">
        <Button asChild variant="outline">
          <Link href="/login">Login</Link>
        </Button>
        <Button asChild>
          <Link href="/register">Daftar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <div className="relative w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              {user.name?.charAt(0)?.toUpperCase() || user.nim?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <div className="flex items-center p-2">
            <div className="ml-2 space-y-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.nim}</p>
            </div>
          </div>
          <div className="p-1">
            <DropdownMenuItem asChild>
              <Link href="/profil">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/absen">
                <Camera className="mr-2 h-4 w-4" />
                <span>Attendance</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/riwayat">
                <History className="mr-2 h-4 w-4" />
                <span>History</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/izin">
                <FileText className="mr-2 h-4 w-4" />
                <span>Izin/Sakit</span>
              </Link>
            </DropdownMenuItem>
          </div>
          {/* Admin section */}
          {isAdmin && (
            <div className="p-1 border-t">
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <Shield className="mr-2 h-4 w-4" />
                  <span>Admin Dashboard</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin/izin">
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Kelola Izin</span>
                </Link>
              </DropdownMenuItem>
            </div>
          )}
          <div className="p-1">
            <DropdownMenuItem
              onClick={() => {
                signOut();
                router.push('/');
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Logout button as a separate element for better visibility */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          signOut();
          router.push('/');
        }}
        className="hidden md:flex items-center space-x-1"
      >
        <LogOut className="h-4 w-4 mr-1" />
        <span>Logout</span>
      </Button>
    </div>
  );
}

export function AuthenticatedPage({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    // Redirect to login page
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <h2 className="text-xl font-semibold mb-4">Please login to continue</h2>
        <Button asChild>
          <Link href="/login">Login</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
