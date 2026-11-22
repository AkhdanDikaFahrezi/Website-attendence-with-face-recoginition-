'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import { ActionLoadingOverlay } from '@/components/ui/action-loading-overlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeroSkeleton, SectionCardSkeleton, StatsGridSkeleton, TableCardSkeleton } from '@/components/ui/page-skeletons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  User,
  Clock,
  Calendar,
  MapPin,
  Edit,
  Save,
  X,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type ProfileData = {
  id: string;
  user_id: string;
  nim: string;
  nama: string;
  jurusan: string;
  kelas: string;
  semester: string;
  email: string;
  join_date: string;
  total_attendance: number;
  this_month_attendance: number;
  attendance_rate: number;
};

type ProfileFormData = {
  nama: string;
  jurusan: string;
  kelas: string;
  semester: string;
  nim: string;
  email: string;
};

type AttendanceRecord = {
  id: string;
  type: 'masuk' | 'pulang';
  timestamp: string;
  location: string;
};

type MonthlySummary = {
  key: string;
  month: string;
  hadir: number;
  izin: number;
  sakit: number;
  alfa: number;
};

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateAttendanceRate(attendanceLogs: AttendanceRecord[]): number {
  const groupedByDate = new Map<string, { hasMasuk: boolean; hasPulang: boolean }>();

  attendanceLogs.forEach((log) => {
    const dateKey = toDateKey(new Date(log.timestamp));
    const current = groupedByDate.get(dateKey) ?? { hasMasuk: false, hasPulang: false };

    if (log.type === 'masuk') {
      current.hasMasuk = true;
    }

    if (log.type === 'pulang') {
      current.hasPulang = true;
    }

    groupedByDate.set(dateKey, current);
  });

  let daysWithMasuk = 0;
  let completeDays = 0;

  groupedByDate.forEach((day) => {
    if (day.hasMasuk) {
      daysWithMasuk += 1;
      if (day.hasPulang) {
        completeDays += 1;
      }
    }
  });

  if (daysWithMasuk === 0) {
    return 0;
  }

  return Number(((completeDays / daysWithMasuk) * 100).toFixed(1));
}

function buildMonthlySummary(attendanceLogs: AttendanceRecord[]): MonthlySummary[] {
  const masukPerMonth = new Map<string, number>();

  attendanceLogs
    .filter((log) => log.type === 'masuk')
    .forEach((log) => {
      const date = new Date(log.timestamp);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      masukPerMonth.set(key, (masukPerMonth.get(key) ?? 0) + 1);
    });

  const now = new Date();
  const summary: MonthlySummary[] = [];

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    summary.push({
      key,
      month: monthDate.toLocaleDateString('id-ID', { month: 'long' }),
      hadir: masukPerMonth.get(key) ?? 0,
      izin: 0,
      sakit: 0,
      alfa: 0,
    });
  }

  return summary;
}

export default function ProfilPage() {
  const { user, signOut, isAuthReady } = useAuth();
  const router = useRouter();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    nama: '',
    jurusan: '',
    kelas: '',
    semester: '',
    nim: '',
    email: '',
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    const fetchProfileAndAttendance = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const { data: profileRow, error: profileError } = await supabase
          .from('profiles')
          .select('id, nim, nama, jurusan, kelas, semester, email, join_date, created_at')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error(profileError.message);
        }

        if (!profileRow) {
          throw new Error('Data profil tidak ditemukan untuk user ini.');
        }

        const { data: logsData, error: logsError } = await supabase
          .from('attendance_logs')
          .select('id, type, timestamp, location')
          .eq('profile_id', user.id)
          .order('timestamp', { ascending: false });

        if (logsError) {
          throw new Error(logsError.message);
        }

        const attendanceLogs = ((logsData ?? []) as Array<{
          id: string;
          type: string;
          timestamp: string;
          location: string | null;
        }>)
          .filter((log) => log.type === 'masuk' || log.type === 'pulang')
          .map((log) => ({
            id: log.id,
            type: log.type as 'masuk' | 'pulang',
            timestamp: log.timestamp,
            location: log.location || 'Tidak tersedia',
          }));

        const now = new Date();
        const totalAttendance = attendanceLogs.filter((log) => log.type === 'masuk').length;
        const thisMonthAttendance = attendanceLogs.filter((log) => {
          if (log.type !== 'masuk') {
            return false;
          }

          const logDate = new Date(log.timestamp);
          return logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
        }).length;

        const mappedProfile: ProfileData = {
          id: profileRow.id,
          user_id: profileRow.id,
          nim: profileRow.nim,
          nama: profileRow.nama,
          jurusan: profileRow.jurusan || '',
          kelas: profileRow.kelas || '',
          semester: profileRow.semester || '',
          email: profileRow.email || '',
          join_date: profileRow.join_date || profileRow.created_at || new Date().toISOString(),
          total_attendance: totalAttendance,
          this_month_attendance: thisMonthAttendance,
          attendance_rate: calculateAttendanceRate(attendanceLogs),
        };

        setProfileData(mappedProfile);
        setAttendanceHistory(attendanceLogs);
        setMonthlySummary(buildMonthlySummary(attendanceLogs));
        setFormData({
          nama: mappedProfile.nama,
          jurusan: mappedProfile.jurusan,
          kelas: mappedProfile.kelas,
          semester: mappedProfile.semester,
          nim: mappedProfile.nim,
          email: mappedProfile.email,
        });
      } catch (error) {
        console.error('Error fetching profile data:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Gagal memuat data profil.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfileAndAttendance();
  }, [isAuthReady, router, user]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user?.id) {
      return;
    }

    if (!formData.nama.trim() || !formData.nim.trim()) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return;
    }

    setSaveStatus('saving');

    try {
      const payload = {
        nama: formData.nama.trim(),
        jurusan: formData.jurusan.trim() || null,
        kelas: formData.kelas.trim() || null,
        semester: formData.semester.trim() || null,
        nim: formData.nim.trim(),
        email: formData.email.trim(),
        updated_at: new Date().toISOString(),
      };

      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)
        .select('id, nim, nama, jurusan, kelas, semester, email, join_date, created_at')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      setProfileData((prev) => {
        if (!prev) {
          return null;
        }

        return {
          ...prev,
          id: updatedProfile.id,
          user_id: updatedProfile.id,
          nim: updatedProfile.nim,
          nama: updatedProfile.nama,
          jurusan: updatedProfile.jurusan || '',
          kelas: updatedProfile.kelas || '',
          semester: updatedProfile.semester || '',
          email: updatedProfile.email || '',
          join_date: updatedProfile.join_date || updatedProfile.created_at || prev.join_date,
        };
      });

      setSaveStatus('success');
      setIsEditing(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleCancel = () => {
    if (profileData) {
      setFormData({
        nama: profileData.nama,
        jurusan: profileData.jurusan,
        kelas: profileData.kelas,
        semester: profileData.semester,
        nim: profileData.nim,
        email: profileData.email,
      });
    }
    setIsEditing(false);
  };

  if (!isAuthReady) {
    return (
      <AppShell title='Profil Mahasiswa' eyebrow='Profile' description='Memuat data profil dan statistik Anda...'>
        <div className='space-y-6'>
          <PageHeroSkeleton />
          <StatsGridSkeleton count={2} />
          <div className='grid gap-8 lg:grid-cols-2'>
            <SectionCardSkeleton height='h-[360px]' />
            <SectionCardSkeleton height='h-[360px]' />
          </div>
          <TableCardSkeleton columns={4} rows={4} />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900'>
        <Card className='w-full max-w-md'>
          <CardHeader className='text-center'>
            <CardTitle>Autentikasi Diperlukan</CardTitle>
            <CardDescription>Silakan masuk terlebih dahulu untuk melihat profil</CardDescription>
          </CardHeader>
          <CardContent className='text-center'>
            <Button asChild>
              <Link href='/login'>
                <ArrowLeft className='h-4 w-4 mr-2' />
                Kembali ke Halaman Login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <AppShell
        title='Profil Mahasiswa'
        eyebrow='Profile'
        description='Memuat data profil dan statistik kehadiran Anda...'
        userName={user.name}
        userNim={user.nim}
        userEmail={user.email}
        onSignOut={signOut}
      >
        <div className='space-y-6'>
          <PageHeroSkeleton />
          <StatsGridSkeleton count={2} />
          <div className='grid gap-8 lg:grid-cols-2'>
            <SectionCardSkeleton height='h-[360px]' />
            <SectionCardSkeleton height='h-[360px]' />
          </div>
          <TableCardSkeleton columns={4} rows={4} />
        </div>
      </AppShell>
    );
  }

  if (!profileData) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900'>
        <Card className='w-full max-w-xl'>
          <CardHeader>
            <CardTitle>Data Profil Tidak Ditemukan</CardTitle>
            <CardDescription>{errorMessage || 'Profil belum tersedia untuk akun ini.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant='outline' asChild>
              <Link href='/dashboard'>
                <ArrowLeft className='h-4 w-4 mr-2' />
                Kembali ke Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayData = profileData;

  return (
    <AppShell
      title='Profil Mahasiswa'
      eyebrow='Profile'
      description={`NIM ${displayData.nim} • Kelola informasi pribadi dan pantau statistik kehadiran Anda.`}
      userName={user.name}
      userNim={user.nim}
      userEmail={user.email}
      onSignOut={signOut}
    >
      <ActionLoadingOverlay
        open={saveStatus === 'saving'}
        title='Sedang menyimpan profil...'
        description='Perubahan profil Anda sedang disimpan ke sistem. Mohon tunggu sebentar.'
      />
      <div className='space-y-6'>
          <div className='flex flex-col gap-1'>
            <h1 className='text-2xl font-bold text-slate-900 dark:text-slate-100'>
              Profil Mahasiswa - {displayData.nama}
            </h1>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              Kelola informasi pribadi dan statistik kehadiran Anda.
            </p>
          </div>

          {errorMessage && (
            <Alert className='mb-6 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'>
              <AlertCircle className='h-4 w-4 text-red-600' />
              <AlertDescription className='text-red-800 dark:text-red-200'>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue='profile' className='space-y-8'>
            <div className='flex justify-center'>
              <TabsList className='grid w-full max-w-md grid-cols-3'>
                <TabsTrigger value='profile'>Profil</TabsTrigger>
                <TabsTrigger value='attendance'>Kehadiran</TabsTrigger>
                <TabsTrigger value='statistics'>Statistik</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value='profile' className='space-y-8'>
              <div className='grid lg:grid-cols-3 gap-8'>
                <Card className='lg:col-span-2'>
                  <CardHeader className='flex flex-row items-center justify-between'>
                    <div>
                      <CardTitle className='flex items-center gap-2'>
                        <User className='h-5 w-5' />
                        Informasi Pribadi
                      </CardTitle>
                      <CardDescription>Data diri Anda yang terdaftar dalam sistem</CardDescription>
                    </div>
                    <div className='flex gap-2'>
                      {!isEditing ? (
                        <Button onClick={() => setIsEditing(true)} variant='outline' size='sm'>
                          <Edit className='h-4 w-4 mr-2' />
                          Edit
                        </Button>
                      ) : (
                        <>
                          <Button onClick={handleSave} size='sm' disabled={saveStatus === 'saving'}>
                            {saveStatus === 'saving' ? (
                              <>
                                <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                                Memproses...
                              </>
                            ) : (
                              <>
                                <Save className='h-4 w-4 mr-2' />
                                Simpan
                              </>
                            )}
                          </Button>
                          <Button onClick={handleCancel} variant='outline' size='sm'>
                            <X className='h-4 w-4 mr-2' />
                            Batal
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    {saveStatus === 'success' && (
                      <Alert className='bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'>
                        <CheckCircle2 className='h-4 w-4 text-green-600' />
                        <AlertDescription className='text-green-800 dark:text-green-200'>
                          Profil berhasil diperbarui!
                        </AlertDescription>
                      </Alert>
                    )}

                    {saveStatus === 'error' && (
                      <Alert className='bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'>
                        <AlertCircle className='h-4 w-4 text-red-600' />
                        <AlertDescription className='text-red-800 dark:text-red-200'>
                          Gagal memperbarui profil. Silakan coba lagi.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className='grid md:grid-cols-2 gap-4'>
                      <div className='space-y-2'>
                        <Label>NIM</Label>
                        <Input
                          value={isEditing ? formData.nim : displayData.nim}
                          onChange={(e) => handleInputChange('nim', e.target.value)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className='space-y-2'>
                        <Label>Email</Label>
                        <Input
                          value={isEditing ? formData.email : displayData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className='space-y-2'>
                        <Label>Nama Lengkap</Label>
                        <Input
                          value={isEditing ? formData.nama : displayData.nama}
                          onChange={(e) => handleInputChange('nama', e.target.value)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className='space-y-2'>
                        <Label>Program Studi / Jurusan</Label>
                        <Select
                          value={isEditing ? (formData.jurusan || undefined) : (displayData.jurusan || undefined)}
                          onValueChange={(value) => handleInputChange('jurusan', value)}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder='Pilih program studi' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='te'>Teknik Elektronika Manufaktur</SelectItem>
                            <SelectItem value='tre'>Sarjana Terapan Teknologi Rekayasa Elektronika</SelectItem>
                            <SelectItem value='ti'>Teknik Instrumentasi</SelectItem>
                            <SelectItem value='tm'>Teknik Mekatronika</SelectItem>
                            <SelectItem value='trpe'>Teknologi Rekayasa Pembangkit Energi</SelectItem>
                            <SelectItem value='trr'>Teknologi Rekayasa Robotika</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className='space-y-2'>
                        <Label>Kelas</Label>
                        <Select
                          value={isEditing ? (formData.kelas || undefined) : (displayData.kelas || undefined)}
                          onValueChange={(value) => handleInputChange('kelas', value)}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder='Pilih kelas' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='pagi'>Kelas Pagi</SelectItem>
                            <SelectItem value='malam'>Kelas Malam</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className='space-y-2'>
                        <Label>Semester</Label>
                        <Select
                          value={isEditing ? (formData.semester || undefined) : (displayData.semester || undefined)}
                          onValueChange={(value) => handleInputChange('semester', value)}
                          disabled={!isEditing}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder='Pilih semester' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='1'>Semester 1</SelectItem>
                            <SelectItem value='2'>Semester 2</SelectItem>
                            <SelectItem value='3'>Semester 3</SelectItem>
                            <SelectItem value='4'>Semester 4</SelectItem>
                            <SelectItem value='5'>Semester 5</SelectItem>
                            <SelectItem value='6'>Semester 6</SelectItem>
                            <SelectItem value='7'>Semester 7</SelectItem>
                            <SelectItem value='8'>Semester 8</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className='space-y-2'>
                        <Label>Tanggal Bergabung</Label>
                        <Input value={new Date(displayData.join_date).toLocaleDateString('id-ID')} disabled />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className='space-y-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle className='text-lg'>Statistik Cepat</CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      <div className='text-center'>
                        <div className='text-3xl font-bold text-blue-600'>{displayData.attendance_rate}%</div>
                        <div className='text-sm text-gray-500'>Tingkat Kehadiran</div>
                      </div>
                      <div className='grid grid-cols-2 gap-4 text-center'>
                        <div>
                          <div className='text-2xl font-semibold'>{displayData.this_month_attendance}</div>
                          <div className='text-xs text-gray-500'>Bulan Ini</div>
                        </div>
                        <div>
                          <div className='text-2xl font-semibold'>{displayData.total_attendance}</div>
                          <div className='text-xs text-gray-500'>Total</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-lg'>Aksi Cepat</CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-2'>
                      <Button className='w-full' asChild>
                        <Link href='/absen'>
                          <Clock className='h-4 w-4 mr-2' />
                          Presensi Sekarang
                        </Link>
                      </Button>
                      <Button variant='outline' className='w-full' asChild>
                        <Link href='/reports'>
                          <Calendar className='h-4 w-4 mr-2' />
                          Lihat Laporan
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value='attendance'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Calendar className='h-5 w-5' />
                    Riwayat Kehadiran Terbaru
                  </CardTitle>
                  <CardDescription>Entri absensi Anda yang tercatat di database</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='space-y-4'>
                    {attendanceHistory.length === 0 ? (
                      <div className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                        Belum ada riwayat absensi.
                      </div>
                    ) : (
                      attendanceHistory.slice(0, 20).map((record) => (
                        <div key={record.id} className='flex items-center justify-between p-4 border rounded-lg'>
                          <div className='flex items-center gap-4'>
                            <div
                              className={`p-2 rounded-full ${
                                record.type === 'masuk'
                                  ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                                  : 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400'
                              }`}
                            >
                              <Clock className='h-4 w-4' />
                            </div>
                            <div>
                              <div className='font-medium'>
                                {record.type === 'masuk' ? 'Absen Masuk' : 'Absen Pulang'}
                              </div>
                              <div className='text-sm text-gray-500'>
                                {new Date(record.timestamp).toLocaleDateString('id-ID', {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </div>
                            </div>
                          </div>
                          <div className='text-right'>
                            <div className='font-medium'>
                              {new Date(record.timestamp).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <div className='text-sm text-gray-500 flex items-center gap-1'>
                              <MapPin className='h-3 w-3' />
                              {record.location}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='statistics'>
              <div className='grid lg:grid-cols-2 gap-8'>
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <BarChart3 className='h-5 w-5' />
                      Ringkasan Bulanan
                    </CardTitle>
                    <CardDescription>Statistik kehadiran per bulan (6 bulan terakhir)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-4'>
                      {monthlySummary.map((month) => {
                        const total = month.hadir + month.izin + month.sakit + month.alfa;
                        const progress = total > 0 ? (month.hadir / total) * 100 : 0;

                        return (
                          <div key={month.key} className='space-y-2'>
                            <div className='flex justify-between items-center'>
                              <span className='font-medium'>{month.month}</span>
                              <div className='flex gap-2'>
                                <Badge variant='secondary' className='text-xs'>
                                  Hadir: {month.hadir}
                                </Badge>
                                {month.izin > 0 && (
                                  <Badge variant='outline' className='text-xs'>
                                    Izin: {month.izin}
                                  </Badge>
                                )}
                                {month.sakit > 0 && (
                                  <Badge variant='outline' className='text-xs'>
                                    Sakit: {month.sakit}
                                  </Badge>
                                )}
                                {month.alfa > 0 && (
                                  <Badge variant='destructive' className='text-xs'>
                                    Alfa: {month.alfa}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Progress value={progress} className='h-2' />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Kinerja Kehadiran</CardTitle>
                    <CardDescription>Analisis performa kehadiran Anda</CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-6'>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg'>
                        <div className='text-2xl font-bold text-green-600 dark:text-green-400'>
                          {displayData.total_attendance}
                        </div>
                        <div className='text-sm text-gray-600 dark:text-gray-300'>Total Hadir</div>
                      </div>
                      <div className='text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg'>
                        <div className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                          {displayData.attendance_rate}%
                        </div>
                        <div className='text-sm text-gray-600 dark:text-gray-300'>Tingkat Hadir</div>
                      </div>
                    </div>

                    <div className='space-y-3'>
                      <h4 className='font-semibold'>Capaian Bulan Ini</h4>
                      <div className='space-y-2'>
                        <div className='flex justify-between text-sm'>
                          <span>Hadir</span>
                          <span className='font-medium text-green-600'>{displayData.this_month_attendance} hari</span>
                        </div>
                        <div className='flex justify-between text-sm'>
                          <span>Izin</span>
                          <span className='font-medium text-yellow-600'>0 hari</span>
                        </div>
                        <div className='flex justify-between text-sm'>
                          <span>Sakit</span>
                          <span className='font-medium text-red-600'>0 hari</span>
                        </div>
                        <div className='flex justify-between text-sm'>
                          <span>Alfa</span>
                          <span className='font-medium text-red-600'>0 hari</span>
                        </div>
                      </div>
                    </div>

                    <Alert>
                      <CheckCircle2 className='h-4 w-4' />
                      <AlertDescription>
                        Data statistik diambil langsung dari attendance_logs dan diperbarui otomatis.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          <div className='text-center'>
            <Button variant='outline' asChild>
              <Link href='/dashboard'>
                <ArrowLeft className='h-4 w-4 mr-2' />
                Kembali ke Dashboard
              </Link>
            </Button>
          </div>
      </div>
    </AppShell>
  );
}
