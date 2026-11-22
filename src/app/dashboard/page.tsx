'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ListCardSkeleton, PageHeroSkeleton, SectionCardSkeleton, StatsGridSkeleton } from '@/components/ui/page-skeletons';
import { supabase } from '@/lib/supabase';

type AttendanceLog = {
  type: 'masuk' | 'pulang';
  timestamp: string;
};

type DailyAttendanceSummary = {
  dateKey: string;
  firstMasuk: AttendanceLog | null;
  lastPulang: AttendanceLog | null;
  isComplete: boolean;
};

interface AttendanceStats {
  totalHadir: number;
  totalIzin: number;
  totalSakit: number;
  weeklyData: Array<{ day: string; hadir: number }>;
  attendanceRate: number;
  attendedWorkdays: number;
  totalWorkdays: number;
  weeklyHoursData: Array<{ day: string; hours: number }>;
  weeklyTotalHours: number;
  weeklyTargetHours: number;
  enrollmentStatus: string | null;
}

const EMPTY_ATTENDANCE_STATS: AttendanceStats = {
  totalHadir: 0,
  totalIzin: 0,
  totalSakit: 0,
  weeklyData: [],
  attendanceRate: 0,
  attendedWorkdays: 0,
  totalWorkdays: 0,
  weeklyHoursData: [],
  weeklyTotalHours: 0,
  weeklyTargetHours: 30,
  enrollmentStatus: null,
};

const SILENT_REFRESH_DEBOUNCE_MS = 250;
const SILENT_REFRESH_MIN_INTERVAL_MS = 15000;

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStartMonday(baseDate: Date): Date {
  const start = new Date(baseDate);
  const currentDay = start.getDay();
  const offset = currentDay === 0 ? -6 : 1 - currentDay;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function countWeekdaysInMonth(referenceDate: Date): number {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let weekdays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdays += 1;
    }
  }

  return weekdays;
}

function isWeekday(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function buildDailyAttendanceSummaries(attendance: AttendanceLog[]): DailyAttendanceSummary[] {
  const grouped = new Map<string, AttendanceLog[]>();

  attendance.forEach((log) => {
    const logDate = new Date(log.timestamp);
    if (Number.isNaN(logDate.getTime())) {
      return;
    }

    const dateKey = toDateKey(logDate);
    const bucket = grouped.get(dateKey) ?? [];
    bucket.push(log);
    grouped.set(dateKey, bucket);
  });

  return Array.from(grouped.entries())
    .map(([dateKey, records]) => {
      const sortedRecords = [...records].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const firstMasuk = sortedRecords.find((record) => record.type === 'masuk') ?? null;
      const lastPulang = [...sortedRecords].reverse().find((record) => record.type === 'pulang') ?? null;

      const isComplete = Boolean(
        firstMasuk &&
        lastPulang &&
        new Date(lastPulang.timestamp).getTime() > new Date(firstMasuk.timestamp).getTime(),
      );

      return {
        dateKey,
        firstMasuk,
        lastPulang,
        isComplete,
      };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export default function DashboardPage() {
  const { user, signOut, isAuthReady } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const lastFetchAttemptAtRef = useRef(0);
  const silentRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isAuthReady && !user) {
      router.replace('/login');
    }
  }, [isAuthReady, user, router]);

  const generateWeeklyData = useCallback((attendance: AttendanceLog[]) => {
    const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const today = new Date();
    const summariesByDate = new Map(
      buildDailyAttendanceSummaries(attendance).map((summary) => [summary.dateKey, summary]),
    );
    const data = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayName = days[date.getDay() === 0 ? 6 : date.getDay() - 1];

      data.push({
        day: dayName,
        hadir: summariesByDate.get(toDateKey(date))?.isComplete ? 1 : 0,
      });
    }

    return data;
  }, []);

  const calculateMonthlyAttendanceRate = useCallback((attendance: AttendanceLog[]) => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const hadirDates = new Set<string>();

    buildDailyAttendanceSummaries(attendance).forEach((summary) => {
      if (!summary.isComplete || !summary.firstMasuk) {
        return;
      }

      const timestamp = new Date(summary.firstMasuk.timestamp);
      if (
        Number.isNaN(timestamp.getTime()) ||
        timestamp < monthStart ||
        timestamp >= nextMonthStart ||
        !isWeekday(timestamp)
      ) {
        return;
      }

      hadirDates.add(summary.dateKey);
    });

    const totalWorkdays = countWeekdaysInMonth(today);
    const attendanceRate = totalWorkdays > 0 ? (hadirDates.size / totalWorkdays) * 100 : 0;

    return {
      attendanceRate,
      attendedWorkdays: hadirDates.size,
      totalWorkdays,
    };
  }, []);

  const generateWeeklyHoursData = useCallback((attendance: AttendanceLog[]) => {
    const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
    const weekStart = getWeekStartMonday(new Date());
    const summariesByDate = new Map(
      buildDailyAttendanceSummaries(attendance).map((summary) => [summary.dateKey, summary]),
    );

    return labels.map((dayLabel, index) => {
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + index);
      const summary = summariesByDate.get(toDateKey(currentDate));
      const firstMasuk = summary?.isComplete ? summary.firstMasuk : null;
      const lastPulang = summary?.isComplete ? summary.lastPulang : null;

      let totalHours = 0;
      if (firstMasuk && lastPulang) {
        const startMs = new Date(firstMasuk.timestamp).getTime();
        const endMs = new Date(lastPulang.timestamp).getTime();
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
          totalHours = (endMs - startMs) / (1000 * 60 * 60);
        }
      }

      return {
        day: dayLabel,
        hours: Number(totalHours.toFixed(2)),
      };
    });
  }, []);

  const fetchAttendanceStats = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (isFetchingRef.current) {
      return;
    }

    const now = Date.now();
    if (silent && now - lastFetchAttemptAtRef.current < SILENT_REFRESH_MIN_INTERVAL_MS) {
      return;
    }

    isFetchingRef.current = true;
    lastFetchAttemptAtRef.current = now;

    try {
      if (!silent && !stats) {
        setLoading(true);
      }
      setStatsError(null);

      if (!user?.id) {
        setStats(EMPTY_ATTENDANCE_STATS);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, enrollment_status')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(`Gagal memuat profil: ${profileError.message}`);
      }

      if (!profile) {
        setStats({
          ...EMPTY_ATTENDANCE_STATS,
          enrollmentStatus: null,
        });
        setStatsError('Profil pengguna tidak ditemukan.');
        return;
      }

      const [
        { data: attendance, error: attendanceError },
        { data: leaveRequests, error: leaveError },
      ] = await Promise.all([
        supabase
          .from('attendance_logs')
          .select('type, timestamp')
          .eq('profile_id', profile.id)
          .order('timestamp', { ascending: false }),
        supabase
          .from('leave_requests')
          .select('type')
          .eq('profile_id', profile.id),
      ]);

      if (attendanceError) {
        throw new Error(`Gagal memuat attendance: ${attendanceError.message}`);
      }

      if (leaveError) {
        throw new Error(`Gagal memuat data izin: ${leaveError.message}`);
      }

      const attendanceLogs: AttendanceLog[] = (attendance ?? [])
        .filter(
          (item: { type: string; timestamp: string }) =>
            (item.type === 'masuk' || item.type === 'pulang') && !!item.timestamp,
        )
        .map((item: { type: string; timestamp: string }) => ({
          type: item.type as 'masuk' | 'pulang',
          timestamp: item.timestamp,
        }));

      const completedAttendanceDays = buildDailyAttendanceSummaries(attendanceLogs).filter(
        (summary) => summary.isComplete,
      );
      const totalHadir = completedAttendanceDays.length;
      const weeklyData = generateWeeklyData(attendanceLogs);
      const { attendanceRate, attendedWorkdays, totalWorkdays } = calculateMonthlyAttendanceRate(attendanceLogs);
      const weeklyHoursData = generateWeeklyHoursData(attendanceLogs);
      const weeklyTotalHours = Number(weeklyHoursData.reduce((sum, item) => sum + item.hours, 0).toFixed(2));
      const weeklyTargetHours = 30;

      setStats({
        totalHadir,
        totalIzin: leaveRequests?.filter((item) => item.type === 'izin').length || 0,
        totalSakit: leaveRequests?.filter((item) => item.type === 'sakit').length || 0,
        weeklyData,
        attendanceRate,
        attendedWorkdays,
        totalWorkdays,
        weeklyHoursData,
        weeklyTotalHours,
        weeklyTargetHours,
        enrollmentStatus: profile.enrollment_status || null,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      const message = error instanceof Error ? error.message : 'Gagal memuat data dashboard';
      setStats(prev => prev ?? EMPTY_ATTENDANCE_STATS);
      setStatsError(message);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [calculateMonthlyAttendanceRate, generateWeeklyData, generateWeeklyHoursData, stats, user?.id]);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (user) {
      fetchAttendanceStats();
    }
  }, [fetchAttendanceStats, isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !user) {
      return;
    }

    const scheduleSilentRefresh = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      if (silentRefreshTimerRef.current !== null) {
        window.clearTimeout(silentRefreshTimerRef.current);
      }

      silentRefreshTimerRef.current = window.setTimeout(() => {
        silentRefreshTimerRef.current = null;
        void fetchAttendanceStats({ silent: true });
      }, SILENT_REFRESH_DEBOUNCE_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleSilentRefresh();
      }
    };

    window.addEventListener('focus', scheduleSilentRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (silentRefreshTimerRef.current !== null) {
        window.clearTimeout(silentRefreshTimerRef.current);
        silentRefreshTimerRef.current = null;
      }

      window.removeEventListener('focus', scheduleSilentRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchAttendanceStats, isAuthReady, user]);

  const handleSignOut = async () => {
    await signOut();
  };

  if (isAuthReady && !user) {
    return null;
  }

  const showPageSkeleton = !isAuthReady || !user || (!stats && loading);
  const weeklyProgress = stats
    ? Math.min((stats.weeklyTotalHours / stats.weeklyTargetHours) * 100, 100)
    : 0;

  return (
    <AppShell
      title="Dashboard"
      eyebrow={user?.role === 'admin' ? 'Admin workspace' : 'Student workspace'}
      description="Pantau kehadiran, progres mingguan, dan akses cepat ke alur presensi dalam dashboard yang lebih clean dan mudah dipindai."
      userName={user?.name}
      userNim={user?.nim}
      userEmail={user?.email}
      onSignOut={handleSignOut}
    >
      {showPageSkeleton ? (
        <div className="space-y-8">
          <PageHeroSkeleton />
          <StatsGridSkeleton />
          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <SectionCardSkeleton height="h-[320px]" />
            <SectionCardSkeleton height="h-[220px]" />
          </div>
          <ListCardSkeleton count={3} />
        </div>
      ) : (
      <div className="space-y-8">
        {statsError ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Dashboard belum membaca data dengan sempurna.</p>
                <p className="mt-1">{statsError}</p>
              </div>
            </div>
          </div>
        ) : null}
        <section className="app-hero">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Selamat datang, {user.name?.split(' ')[0] || 'dika'}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-500">
                  Ringkasan ini mengambil data kehadiran, izin, dan jam hadir minggu berjalan secara real-time
                  agar Anda bisa memantau progres dengan cepat.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                  NIM {user.nim || '-'}
                </Badge>
                {user.email ? (
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                    {user.email}
                  </Badge>
                ) : null}
                {user.role === 'admin' ? (
                  <Badge className="bg-blue-50 text-blue-700">Admin Mode - Face Enrollment Tidak Wajib</Badge>
                ) : (
                  <Badge
                    className={
                      stats?.enrollmentStatus === 'complete'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }
                  >
                    {stats?.enrollmentStatus === 'complete'
                      ? 'Face Recognition Enrolled'
                      : 'Face Enrollment Belum Lengkap'}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:w-[26rem]">
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">Target Mingguan</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {loading ? '-' : `${(stats?.weeklyTotalHours || 0).toFixed(1)} / ${stats?.weeklyTargetHours || 30} jam`}
                </p>
                <p className="mt-1 text-xs text-slate-500">Diukur dari first masuk dan last pulang Senin-Jumat.</p>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">Hari Kerja Bulan Ini</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  {loading ? '-' : `${stats?.attendedWorkdays || 0} / ${stats?.totalWorkdays || 0}`}
                </p>
                <p className="mt-1 text-xs text-slate-500">Baseline Senin-Jumat tanpa pengurangan hari libur.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm font-medium text-slate-500">Total Hadir</CardTitle>
                <CardDescription>Hari dengan check-in dan check-out lengkap</CardDescription>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="app-stat-value">{loading ? '-' : stats?.totalHadir || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm font-medium text-slate-500">Total Izin</CardTitle>
                <CardDescription>Permintaan izin</CardDescription>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <Calendar className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="app-stat-value">{loading ? '-' : stats?.totalIzin || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm font-medium text-slate-500">Total Sakit</CardTitle>
                <CardDescription>Permintaan sakit</CardDescription>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <Clock className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="app-stat-value">{loading ? '-' : stats?.totalSakit || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm font-medium text-slate-500">Kehadiran</CardTitle>
                <CardDescription>Persentase bulan berjalan</CardDescription>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="app-stat-value">{loading ? '-' : `${(stats?.attendanceRate || 0).toFixed(1)}%`}</div>
              <p className="mt-2 text-xs text-slate-500">
                {loading
                  ? 'Menghitung dari data bulan berjalan'
                  : `${stats?.attendedWorkdays || 0} dari ${stats?.totalWorkdays || 0} hari kerja bulan ini`}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="app-section-title">Weekly Attendance Overview</CardTitle>
              <CardDescription className="app-section-description">
                Hari hadir lengkap dalam 7 hari terakhir, bukan sekadar check-in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.weeklyData || []} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(37, 99, 235, 0.05)' }}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '18px',
                        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                    <Bar dataKey="hadir" fill="#2563EB" radius={[10, 10, 4, 4]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-2">
              <CardTitle className="app-section-title">Jam Hadir Minggu Ini</CardTitle>
              <CardDescription className="app-section-description">
                Monitoring progres terhadap target minimum 30 jam per minggu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Progress</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                      {loading ? '-' : `${(stats?.weeklyTotalHours || 0).toFixed(1)} jam`}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500">Target {loading ? '-' : `${stats?.weeklyTargetHours || 30} jam`}</p>
                </div>
                <Progress value={loading ? 0 : weeklyProgress} className="mt-4" />
              </div>

              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.weeklyHoursData || []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number) => [`${Number(value).toFixed(2)} jam`, 'Durasi']}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '18px',
                        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                    <Bar dataKey="hours" fill="#94A3B8" radius={[10, 10, 4, 4]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <section className="space-y-3">
          <div>
            <h3 className="app-section-title">Quick Actions</h3>
            <p className="app-section-description">Akses alur yang paling sering dipakai tanpa berpindah terlalu jauh.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Card
              className="group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
              onClick={() => router.push('/absen')}
            >
              <CardContent className="flex h-full flex-col gap-6 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold tracking-tight text-slate-950">Presensi Sekarang</h4>
                  <p className="text-sm leading-6 text-slate-500">Lakukan check-in atau check-out dengan alur verifikasi wajah yang aktif saat ini.</p>
                </div>
                <div className="mt-auto flex items-center gap-2 text-sm font-medium text-slate-600 group-hover:text-slate-950">
                  Buka halaman
                  <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
              onClick={() => router.push('/izin')}
            >
              <CardContent className="flex h-full flex-col gap-6 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold tracking-tight text-slate-950">Ajukan Izin</h4>
                  <p className="text-sm leading-6 text-slate-500">Kelola izin dan sakit dengan form yang lebih rapih dan mudah ditinjau.</p>
                </div>
                <div className="mt-auto flex items-center gap-2 text-sm font-medium text-slate-600 group-hover:text-slate-950">
                  Buka halaman
                  <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
              onClick={() => router.push('/reports')}
            >
              <CardContent className="flex h-full flex-col gap-6 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold tracking-tight text-slate-950">Lihat Laporan</h4>
                  <p className="text-sm leading-6 text-slate-500">Tinjau riwayat presensi harian dalam tampilan tabel yang lebih clean.</p>
                </div>
                <div className="mt-auto flex items-center gap-2 text-sm font-medium text-slate-600 group-hover:text-slate-950">
                  Buka halaman
                  <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>

            {user.role === 'admin' && (
              <Card
                className="group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
                onClick={() => router.push('/admin/izin')}
              >
                <CardContent className="flex h-full flex-col gap-6 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold tracking-tight text-slate-950">Approval Izin</h4>
                    <p className="text-sm leading-6 text-slate-500">Masuk cepat ke halaman approve atau reject izin mahasiswa.</p>
                  </div>
                  <div className="mt-auto flex items-center gap-2 text-sm font-medium text-slate-600 group-hover:text-slate-950">
                    Buka halaman
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </div>
      )}
    </AppShell>
  );
}
