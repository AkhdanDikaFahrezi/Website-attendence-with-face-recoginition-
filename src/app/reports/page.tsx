'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { CheckCircle2, Clock, UserX } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeroSkeleton, TableCardSkeleton } from '@/components/ui/page-skeletons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';

type AttendanceLogRow = {
  id: string;
  type: 'masuk' | 'pulang';
  timestamp: string;
};

type DailyReportRow = {
  id: string;
  dateKey: string;
  timeIn: string | null;
  timeOut: string | null;
  status: 'complete' | 'incomplete';
  duration: string | null;
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDuration(startTimestamp: string, endTimestamp: string): string | null {
  const startMs = new Date(startTimestamp).getTime();
  const endMs = new Date(endTimestamp).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const totalMinutes = Math.floor((endMs - startMs) / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}j ${minutes}m`;
}

function buildDailyReports(logs: AttendanceLogRow[]): DailyReportRow[] {
  const grouped = new Map<string, AttendanceLogRow[]>();

  logs.forEach((log) => {
    const dateKey = toDateKey(new Date(log.timestamp));
    const bucket = grouped.get(dateKey) ?? [];
    bucket.push(log);
    grouped.set(dateKey, bucket);
  });

  return Array.from(grouped.entries())
    .map(([dateKey, dayLogs]) => {
      const sorted = [...dayLogs].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const firstMasuk = sorted.find((item) => item.type === 'masuk') ?? null;
      const lastPulang = [...sorted].reverse().find((item) => item.type === 'pulang') ?? null;
      const isComplete = Boolean(
        firstMasuk &&
        lastPulang &&
        new Date(lastPulang.timestamp).getTime() > new Date(firstMasuk.timestamp).getTime(),
      );

      return {
        id: `${dateKey}-${sorted[0]?.id ?? 'day'}`,
        dateKey,
        timeIn: firstMasuk ? format(new Date(firstMasuk.timestamp), 'HH:mm') : null,
        timeOut: lastPulang ? format(new Date(lastPulang.timestamp), 'HH:mm') : null,
        status: (isComplete ? 'complete' : 'incomplete') as DailyReportRow['status'],
        duration: isComplete && firstMasuk && lastPulang
          ? formatDuration(firstMasuk.timestamp, lastPulang.timestamp)
          : null,
      };
    })
    .sort((a, b) => parseDateKey(b.dateKey).getTime() - parseDateKey(a.dateKey).getTime());
}

export default function ReportsPage() {
  const { user, signOut, isAuthReady } = useAuth();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [attendanceData, setAttendanceData] = useState<DailyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) {
      setLoading(true);
      return;
    }

    const loadAttendanceReports = async () => {
      if (!user?.id) {
        setAttendanceData([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const { data, error } = await supabase
          .from('attendance_logs')
          .select('id, type, timestamp')
          .eq('profile_id', user.id)
          .order('timestamp', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        const logs = ((data ?? []) as Array<{ id: string; type: string; timestamp: string }>)
          .filter((item) => item.type === 'masuk' || item.type === 'pulang')
          .map((item) => ({
            id: item.id,
            type: item.type as 'masuk' | 'pulang',
            timestamp: item.timestamp,
          }));

        setAttendanceData(buildDailyReports(logs));
      } catch (error) {
        console.error('Failed to fetch attendance reports:', error);
        setErrorMessage('Gagal memuat data laporan absensi.');
        setAttendanceData([]);
      } finally {
        setLoading(false);
      }
    };

    loadAttendanceReports();
  }, [isAuthReady, user?.id]);

  useEffect(() => {
    if (isAuthReady && !user) {
      router.replace('/login');
    }
  }, [isAuthReady, user, router]);

  const filteredByRange = useMemo(() => {
    const today = new Date();
    const todayKey = toDateKey(today);

    if (timeRange === 'daily') {
      return attendanceData.filter((row) => row.dateKey === todayKey);
    }

    if (timeRange === 'weekly') {
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      weekStart.setDate(weekStart.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      return attendanceData.filter((row) => parseDateKey(row.dateKey).getTime() >= weekStart.getTime());
    }

    return attendanceData.filter((row) => {
      const rowDate = parseDateKey(row.dateKey);
      return rowDate.getMonth() === today.getMonth() && rowDate.getFullYear() === today.getFullYear();
    });
  }, [attendanceData, timeRange]);

  const filteredData = useMemo(() => {
    if (statusFilter === 'all') {
      return filteredByRange;
    }

    return filteredByRange.filter((row) => row.status === statusFilter);
  }, [filteredByRange, statusFilter]);

  if (isAuthReady && !user) {
    return null;
  }

  const showPageSkeleton = !isAuthReady || !user || loading;
  const completeCount = filteredByRange.filter((row) => row.status === 'complete').length;
  const incompleteCount = filteredByRange.filter((row) => row.status === 'incomplete').length;

  return (
    <AppShell
      title="Laporan Kehadiran"
      eyebrow="Reports"
      description="Riwayat kehadiran harian Anda dalam tampilan tabel yang lebih rapi, lapang, dan mudah dipindai."
      userName={user?.name}
      userNim={user?.nim}
      userEmail={user?.email}
      onSignOut={signOut}
    >
      {showPageSkeleton ? (
        <div className="space-y-8">
          <PageHeroSkeleton />
          <TableCardSkeleton />
        </div>
      ) : (
      <div className="space-y-8">
        <section className="app-hero">
          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div>
              <p className="text-sm font-medium text-slate-500">Snapshot laporan</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Laporan kehadiran yang lebih mudah dibaca</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Filter harian, mingguan, atau bulanan tersedia tanpa mengubah data utama Anda. Setiap entri disusun
                berdasarkan first masuk dan last pulang per hari.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                  {format(new Date(), 'EEEE, dd MMMM yyyy', { locale: id })}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                  NIM {user.nim || '-'}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">Total Entri</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{loading ? '-' : filteredByRange.length}</p>
              </div>
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">Lengkap</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-green-600">{loading ? '-' : completeCount}</p>
              </div>
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-500">Parsial</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-600">{loading ? '-' : incompleteCount}</p>
              </div>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="app-section-title">Attendance Reports</CardTitle>
                <CardDescription className="app-section-description">
                  Riwayat kehadiran Anda, difilter berdasarkan rentang waktu dan kelengkapan sesi.
                </CardDescription>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Select value={timeRange} onValueChange={(value: 'daily' | 'weekly' | 'monthly') => setTimeRange(value)}>
                  <SelectTrigger className="w-full sm:w-[170px]">
                    <SelectValue placeholder="Pilih rentang" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Hari ini</SelectItem>
                    <SelectItem value="weekly">7 hari</SelectItem>
                    <SelectItem value="monthly">Bulan ini</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={(value: 'all' | 'complete' | 'incomplete') => setStatusFilter(value)}>
                  <SelectTrigger className="w-full sm:w-[190px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="complete">Lengkap</SelectItem>
                    <SelectItem value="incomplete">Parsial / Belum checkout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="app-table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Tanggal</TableHead>
                    <TableHead>Hari</TableHead>
                    <TableHead>Masuk</TableHead>
                    <TableHead>Pulang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Durasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                        Memuat data laporan...
                      </TableCell>
                    </TableRow>
                  ) : filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                        Belum ada data absensi pada filter ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((record) => {
                      const dateValue = parseDateKey(record.dateKey);

                      return (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium text-slate-950">{format(dateValue, 'dd MMM yyyy')}</TableCell>
                          <TableCell>{format(dateValue, 'EEE', { locale: id })}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-slate-400" />
                              {record.timeIn || '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-slate-400" />
                              {record.timeOut || '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {record.status === 'complete' ? (
                              <Badge className="bg-green-50 text-green-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Lengkap
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-50 text-amber-700">
                                <UserX className="h-3 w-3" />
                                Parsial / Belum checkout
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{record.duration || '-'}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      )}
    </AppShell>
  );
}
