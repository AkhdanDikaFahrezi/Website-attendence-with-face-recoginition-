"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  FileText,
  Clock,
  Search,
  ArrowLeft,
  Eye,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRightCircle,
} from "lucide-react";
import Link from "next/link";

type Student = {
  id: string;
  nim: string | null;
  name: string | null;
  kelas: string | null;
  semester: string | null;
  email: string | null;
  created_at: string;
};

type AttendanceRecord = {
  id: string;
  profile_id: string;
  type: 'masuk' | 'pulang';
  timestamp: string;
  created_at: string;
};

type LeaveRequest = {
  id: string;
  profile_id: string;
  type: 'izin' | 'sakit';
  reason: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  reject_reason?: string;
};

type AttendanceDay = {
  date: string;
  day: string;
  masuk: { time: string } | null;
  pulang: { time: string } | null;
  status: 'complete' | 'incomplete' | 'leave' | 'alfa';
};

function safe(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading, isAdmin, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'students' | 'attendance' | 'leave'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentAttendance, setStudentAttendance] = useState<AttendanceDay[]>([]);
  const [studentLeaveRequests, setStudentLeaveRequests] = useState<LeaveRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading]);

  // Load students data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'students') return;

    const loadStudents = async () => {
      try {
        setLoading(true);

        // In a real implementation, you'd have an API endpoint to get all students
        // For now, let's simulate with a placeholder
        const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/admin/students`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const result = await response.json();
          setStudents(result.students || []);
        } else {
          // If endpoint doesn't exist, return empty array
          setStudents([]);
        }
      } catch (error) {
        console.error("Error loading students:", error);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [isAdmin, activeTab]);

  // Load student attendance
  const loadStudentAttendance = async (profileId: string) => {
    try {
      setLoading(true);

      const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/attendance/${profileId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        const records: AttendanceRecord[] = result.attendance || [];

        // Process records to group by date
        const grouped: { [date: string]: AttendanceRecord[] } = {};
        records.forEach(record => {
          const date = new Date(record.timestamp).toISOString().split('T')[0];
          if (!grouped[date]) {
            grouped[date] = [];
          }
          grouped[date].push(record);
        });

        const processedData: AttendanceDay[] = Object.entries(grouped).map(([date, dayRecords]) => {
          // Sort records by time
          dayRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          // Get the first 'masuk' and last 'pulang' for the day
          const masukRecord = dayRecords.find(r => r.type === 'masuk');
          const pulangRecord = dayRecords.find(r => r.type === 'pulang');

          // Determine status
          let status: 'complete' | 'incomplete' | 'leave' | 'alfa' = 'alfa';
          if (masukRecord && pulangRecord) {
            status = 'complete';
          } else if (masukRecord || pulangRecord) {
            status = 'incomplete';
          } else {
            status = 'alfa';
          }

          // Get day name
          const dayName = new Date(date).toLocaleDateString('id-ID', { weekday: 'long' });

          return {
            date,
            day: dayName,
            masuk: masukRecord ? {
              time: new Date(masukRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            } : null,
            pulang: pulangRecord ? {
              time: new Date(pulangRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            } : null,
            status
          };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date descending

        setStudentAttendance(processedData);
      } else {
        setStudentAttendance([]);
      }
    } catch (error) {
      console.error("Error loading student attendance:", error);
      setStudentAttendance([]);
    } finally {
      setLoading(false);
    }
  };

  // Load student leave requests
  const loadStudentLeaveRequests = async (profileId: string) => {
    try {
      setLoading(true);

      const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/leave/${profileId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        setStudentLeaveRequests(result.leave_requests || []);
      } else {
        setStudentLeaveRequests([]);
      }
    } catch (error) {
      console.error("Error loading student leave requests:", error);
      setStudentLeaveRequests([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle student selection
  const handleSelectStudent = async (student: Student) => {
    setSelectedStudent(student);
    await loadStudentAttendance(student.id);
    await loadStudentLeaveRequests(student.id);
  };

  // Filter students based on search term
  const filteredStudents = students.filter((student) => {
    const keyword = safe(searchTerm);
    return (
      safe(student.name).includes(keyword) ||
      safe(student.nim).includes(keyword)
    );
  });

  // Filter leave requests based on status
  const filteredLeaveRequests = studentLeaveRequests.filter(request =>
    filterStatus === 'all' || request.status === filterStatus
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center space-x-2">
          <Clock className="h-8 w-8 animate-spin text-blue-500" />
          <span className="text-lg">Memuat data...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Autentikasi Diperlukan</CardTitle>
            <CardDescription>
              Silakan masuk terlebih dahulu untuk mengakses halaman admin
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali ke Halaman Utama
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Akses Ditolak</CardTitle>
            <CardDescription>
              Anda tidak memiliki izin untuk mengakses halaman ini
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali ke Halaman Utama
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AppShell
      title="Dashboard Admin"
      eyebrow="Admin workspace"
      description="Kelola data mahasiswa, tinjau riwayat absensi, dan navigasikan approval izin dari shell admin yang seragam."
      userName={user.name}
      userNim={user.nim}
      userEmail={user.email}
      onSignOut={signOut}
    >
      <div className="space-y-8">
        <div className="app-hero">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950 mb-2">
                Dashboard Admin
              </h2>
              <p className="text-sm leading-6 text-slate-500">
                Kelola data mahasiswa, absensi, dan permohonan izin
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild>
                <Link href="/admin/izin">
                  <ArrowRightCircle className="h-4 w-4 mr-2" />
                  Buka Approval Izin
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Kembali
                </Link>
              </Button>
            </div>
          </div>
        </div>

          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <button
              className={`rounded-xl px-5 py-3 font-medium text-sm transition-colors ${
                activeTab === 'students'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
              }`}
              onClick={() => setActiveTab('students')}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Daftar Mahasiswa
              </div>
            </button>
            <button
              className={`rounded-xl px-5 py-3 font-medium text-sm transition-colors ${
                activeTab === 'attendance'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
              }`}
              onClick={() => setActiveTab('attendance')}
              disabled={!selectedStudent}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Absensi Mahasiswa
              </div>
            </button>
            <button
              className={`rounded-xl px-5 py-3 font-medium text-sm transition-colors ${
                activeTab === 'leave'
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
              }`}
              onClick={() => setActiveTab('leave')}
              disabled={!selectedStudent}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Izin Mahasiswa
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Daftar Mahasiswa
                  </CardTitle>
                  <CardDescription>
                    Pilih mahasiswa untuk melihat detail
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                          placeholder="Cari mahasiswa..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {filteredStudents.length === 0 ? (
                        <div className="text-center py-8">
                          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-500 dark:text-gray-400">
                            Tidak ada mahasiswa ditemukan
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredStudents.map((student) => (
                            <div
                              key={student.id}
                              className={`p-3 rounded-lg cursor-pointer border ${
                                selectedStudent?.id === student.id
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                              }`}
                              onClick={() => handleSelectStudent(student)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full">
                                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{student.name}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">{student.nim}</p>
                                </div>
                                <Eye className="h-4 w-4 text-gray-400" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              {selectedStudent ? (
                <>
                  <Card className="mb-6">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {selectedStudent.name}
                          </h2>
                          <p className="text-gray-600 dark:text-gray-400">
                            NIM: {selectedStudent.nim} | Kelas: {selectedStudent.kelas}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {selectedStudent.semester}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {activeTab === 'attendance' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Clock className="h-5 w-5" />
                          Riwayat Absensi
                        </CardTitle>
                        <CardDescription>
                          Detail absensi harian mahasiswa
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {loading ? (
                          <div className="flex justify-center py-12">
                            <Clock className="h-8 w-8 animate-spin text-blue-500" />
                          </div>
                        ) : studentAttendance.length === 0 ? (
                          <div className="text-center py-12">
                            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500 dark:text-gray-400">
                              Tidak ada data absensi untuk mahasiswa ini
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Hari</TableHead>
                                  <TableHead>Tanggal</TableHead>
                                  <TableHead>Absen Masuk</TableHead>
                                  <TableHead>Absen Pulang</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {studentAttendance.map((day) => (
                                  <TableRow key={day.date}>
                                    <TableCell className="font-medium">{day.day}</TableCell>
                                    <TableCell>{day.date}</TableCell>
                                    <TableCell>
                                      {day.masuk ? day.masuk.time : '-'}
                                    </TableCell>
                                    <TableCell>
                                      {day.pulang ? day.pulang.time : '-'}
                                    </TableCell>
                                    <TableCell>
                                      {day.status === 'complete' && (
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                          Hadir
                                        </Badge>
                                      )}
                                      {day.status === 'incomplete' && (
                                        <Badge variant="secondary">
                                          Tidak Lengkap
                                        </Badge>
                                      )}
                                      {day.status === 'alfa' && (
                                        <Badge variant="destructive">
                                          Alfa
                                        </Badge>
                                      )}
                                      {day.status === 'leave' && (
                                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                                          Izin
                                        </Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {activeTab === 'leave' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Permohonan Izin
                        </CardTitle>
                        <CardDescription>
                          Riwayat permohonan izin dan sakit
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex gap-2">
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Semua</SelectItem>
                                <SelectItem value="pending">Menunggu</SelectItem>
                                <SelectItem value="approved">Disetujui</SelectItem>
                                <SelectItem value="rejected">Ditolak</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {loading ? (
                          <div className="flex justify-center py-12">
                            <Clock className="h-8 w-8 animate-spin text-blue-500" />
                          </div>
                        ) : filteredLeaveRequests.length === 0 ? (
                          <div className="text-center py-12">
                            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500 dark:text-gray-400">
                              Tidak ada permohonan izin untuk mahasiswa ini
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Tanggal</TableHead>
                                  <TableHead>Jenis</TableHead>
                                  <TableHead>Alasan</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Diajukan</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredLeaveRequests.map((request) => (
                                  <TableRow key={request.id}>
                                    <TableCell className="font-medium">
                                      {new Date(request.date).toLocaleDateString('id-ID')}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={request.type === 'izin' ? 'default' : 'secondary'}>
                                        {request.type === 'izin' ? 'Izin' : 'Sakit'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-xs">
                                      <div className="truncate" title={request.reason}>
                                        {request.reason}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {request.status === 'approved' && (
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                                          <CheckCircle2 className="h-3 w-3 mr-1" />
                                          Disetujui
                                        </Badge>
                                      )}
                                      {request.status === 'rejected' && (
                                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                                          <XCircle className="h-3 w-3 mr-1" />
                                          Ditolak
                                        </Badge>
                                      )}
                                      {request.status === 'pending' && (
                                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                                          <AlertCircle className="h-3 w-3 mr-1" />
                                          Menunggu
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {new Date(request.created_at).toLocaleDateString('id-ID', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                      })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {activeTab === 'students' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Informasi Mahasiswa
                        </CardTitle>
                        <CardDescription>
                          Detail informasi mahasiswa yang dipilih
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-white mb-2">Informasi Dasar</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Nama:</span>
                                <span className="font-medium">{selectedStudent.name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">NIM:</span>
                                <span className="font-medium">{selectedStudent.nim}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Email:</span>
                                <span className="font-medium">{selectedStudent.email}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-white mb-2">Kelas & Semester</h3>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Jadwal Kelas:</span>
                                <span className="font-medium">{selectedStudent.kelas}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Semester:</span>
                                <span className="font-medium">{selectedStudent.semester}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Tanggal Daftar:</span>
                                <span className="font-medium">
                                  {new Date(selectedStudent.created_at).toLocaleDateString('id-ID')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Pilih Mahasiswa
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      Pilih salah satu mahasiswa dari daftar di samping untuk melihat detail absensi dan izin mereka.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
      </div>
    </AppShell>
  );
}
