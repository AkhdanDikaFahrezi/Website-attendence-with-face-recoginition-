'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Clock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface SidebarProps {
  userName?: string;
  userNim?: string;
  userEmail?: string;
  onSignOut?: () => void | Promise<void>;
}

export function Sidebar({ userName, userNim, userEmail, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin, user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const resolvedName = userName || user?.name || 'User';
  const resolvedNim = userNim || user?.nim || userEmail || user?.email || 'Akun aktif';

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Absen', href: '/absen', icon: Clock },
    { name: 'Laporan', href: '/reports', icon: FileText },
    { name: 'Izin', href: '/izin', icon: Calendar },
    { name: 'Profil', href: '/profil', icon: User },
    { name: 'Pengaturan', href: '/settings', icon: Settings },
    ...(isAdmin
      ? [
          { name: 'Admin', href: '/admin', icon: ShieldCheck },
          { name: 'Approval Izin', href: '/admin/izin', icon: ShieldCheck },
        ]
      : []),
  ];

  const handleSignOut = async () => {
    if (onSignOut) {
      await onSignOut();
    } else {
      await signOut();
    }
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col border-r border-slate-200/80 bg-white/95 px-4 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(15,23,42,0.16)]">
            PM
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-950">Presensi Mahasiswa</p>
            <p className="text-xs text-slate-500">Attendance Workspace</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(false)}
          className="md:hidden"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-6 rounded-[1.35rem] border border-slate-200/80 bg-slate-50/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 rounded-2xl">
            <AvatarImage src="/avatar.png" alt={resolvedName} />
            <AvatarFallback className="rounded-2xl bg-slate-200 text-slate-700">
              {resolvedName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{resolvedName}</p>
            <p className="truncate text-xs text-slate-500">{resolvedNim}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 px-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Navigation
        </p>
      </div>

      <nav className="mt-3 flex-1 space-y-1.5">
        {navigation.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-slate-950 text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                  isActive
                    ? 'bg-white/12 text-white'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-white',
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-slate-200/80 pt-4">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="w-full justify-start border-red-200/80 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/35 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72">{sidebarContent}</div>
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 hidden w-72 md:flex">{sidebarContent}</aside>
    </>
  );
}
