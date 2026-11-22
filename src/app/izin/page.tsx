"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { ListCardSkeleton, PageHeroSkeleton, StatsGridSkeleton } from "@/components/ui/page-skeletons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Filter,
  Loader2,
} from "lucide-react";
import {
  createLeaveRequest,
  getLeaveRequests,
} from "@/lib/supabase-attendance";
import type { LeaveRequestRecord, LeaveRequestType } from "@/lib/supabase-attendance";

type SubmitStatus = "idle" | "success" | "error";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Terjadi kesalahan saat mengirim permintaan.";
}

export default function IzinPage() {
  const { user, signOut, isAuthReady } = useAuth();
  const router = useRouter();

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRecord[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitErrorMessage, setSubmitErrorMessage] = useState("Data belum lengkap atau terjadi kesalahan saat mengirim.");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [formData, setFormData] = useState({
    type: "",
    reason: "",
    date: "",
  });

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!user) {
      router.push("/login");
      return;
    }

    const loadLeaveRequests = async () => {
      try {
        setLoadingData(true);
        const requests = await getLeaveRequests(user.id);
        setLeaveRequests(requests);
      } catch (error) {
        console.error("Error loading leave requests:", error);
        setLeaveRequests([]);
      } finally {
        setLoadingData(false);
      }
    };

    loadLeaveRequests();
  }, [isAuthReady, user, router]);

  const resetForm = () => {
    setFormData({
      type: "",
      reason: "",
      date: "",
    });
  };

  const refreshLeaveRequests = async () => {
    if (!user?.id) {
      return;
    }

    setIsRefreshingList(true);

    try {
      const requests = await getLeaveRequests(user.id);
      setLeaveRequests(requests);
    } catch (error) {
      console.error("Error refreshing leave requests:", error);
    } finally {
      setIsRefreshingList(false);
    }
  };

  const handleInputChange = (field: "type" | "reason" | "date", value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id || !formData.type || !formData.reason.trim() || !formData.date) {
      setSubmitErrorMessage("Data belum lengkap. Mohon isi jenis, tanggal, dan alasan.");
      setSubmitStatus("error");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitStatus("idle");
      setSubmitErrorMessage("");

      await createLeaveRequest({
        profile_id: user.id,
        type: formData.type as LeaveRequestType,
        reason: formData.reason.trim(),
        date: formData.date,
      });

      resetForm();
      setIsCreateDialogOpen(false);
      setSubmitStatus("success");
      void refreshLeaveRequests();
      setTimeout(() => setSubmitStatus("idle"), 2500);
    } catch (error) {
      console.error("Error creating leave request:", error);
      setSubmitErrorMessage(getErrorMessage(error));
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredRequests = useMemo(() => {
    return leaveRequests.filter((request) => {
      const matchesStatus = filterStatus === "all" || request.status === filterStatus;
      const matchesType = filterType === "all" || request.type === filterType;
      return matchesStatus && matchesType;
    });
  }, [leaveRequests, filterStatus, filterType]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            Disetujui
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
            Ditolak
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            Menunggu
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    return <Badge variant={type === "izin" ? "default" : "secondary"}>{type === "izin" ? "Izin" : "Sakit"}</Badge>;
  };

  if (isAuthReady && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Autentikasi Diperlukan</CardTitle>
            <CardDescription>Silakan masuk terlebih dahulu untuk mengelola izin</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <Link href="/login">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Ke Halaman Login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showPageSkeleton = !isAuthReady || !user || loadingData;

  return (
    <AppShell
      title="Pengajuan Izin"
      eyebrow="Leave management"
      description={`NIM ${user?.nim || '-'} | Anda hanya dapat melihat dan mengelola izin milik sendiri.`}
      userName={user?.name}
      userNim={user?.nim}
      userEmail={user?.email}
      onSignOut={signOut}
    >
      <ActionLoadingOverlay
        open={isSubmitting}
        title="Sedang mengirim izin..."
        description="Permintaan Anda sedang diproses dan divalidasi. Mohon tunggu sebentar."
      />
      {showPageSkeleton ? (
        <div className="space-y-6">
          <PageHeroSkeleton />
          <StatsGridSkeleton />
          <ListCardSkeleton />
        </div>
      ) : (
      <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Pengajuan Izin - {user.name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Kelola pengajuan izin/sakit Anda.</p>
            </div>

            <div className="flex gap-2">
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Mengirim...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Ajukan Izin
                      </>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Ajukan Permintaan Izin</DialogTitle>
                    <DialogDescription>Isi form berikut untuk mengajukan izin/sakit.</DialogDescription>
                  </DialogHeader>

                  {submitStatus === "success" && (
                    <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800 dark:text-green-200">Permintaan izin berhasil diajukan.</AlertDescription>
                    </Alert>
                  )}

                  {submitStatus === "error" && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{submitErrorMessage}</AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="type">Jenis</Label>
                      <Select value={formData.type} onValueChange={(value) => handleInputChange("type", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih jenis izin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="izin">Izin</SelectItem>
                          <SelectItem value="sakit">Sakit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="date">Tanggal</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => handleInputChange("date", e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reason">Alasan</Label>
                      <Textarea
                        id="reason"
                        placeholder="Jelaskan alasan izin Anda..."
                        value={formData.reason}
                        onChange={(e) => handleInputChange("reason", e.target.value)}
                        required
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Batal
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Mengirim...
                          </>
                        ) : (
                          "Kirim"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total</p>
                    <p className="text-2xl font-bold">{leaveRequests.length}</p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Menunggu</p>
                    <p className="text-2xl font-bold text-yellow-600">{leaveRequests.filter((r) => r.status === "pending").length}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Disetujui</p>
                    <p className="text-2xl font-bold text-green-600">{leaveRequests.filter((r) => r.status === "approved").length}</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Ditolak</p>
                    <p className="text-2xl font-bold text-red-600">{leaveRequests.filter((r) => r.status === "rejected").length}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">Filter:</span>
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="approved">Disetujui</SelectItem>
                    <SelectItem value="rejected">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    <SelectItem value="izin">Izin</SelectItem>
                    <SelectItem value="sakit">Sakit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Riwayat Permintaan Izin</CardTitle>
              <CardDescription>Hanya data izin milik akun Anda yang ditampilkan.</CardDescription>
              {isRefreshingList && !loadingData && (
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyinkronkan data terbaru...
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">Belum ada permintaan izin.</p>
                    </div>
                  ) : (
                    filteredRequests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {getTypeBadge(request.type)}
                            {getStatusBadge(request.status)}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">Tanggal:</span>
                            <span>
                              {new Date(request.date).toLocaleDateString("id-ID", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </span>
                          </div>

                          <div className="text-sm">
                            <span className="font-medium">Alasan:</span>
                            <p className="text-gray-600 dark:text-gray-300 mt-1">{request.reason}</p>
                          </div>

                          {request.status === "rejected" && request.reject_reason && (
                            <div className="text-sm text-red-700 dark:text-red-300">
                              <span className="font-medium">Alasan Ditolak:</span> {request.reject_reason}
                            </div>
                          )}

                          {request.reviewed_at && (
                            <div className="text-xs text-gray-500">
                              Direview pada: {new Date(request.reviewed_at).toLocaleString("id-ID")}
                            </div>
                          )}

                          <div className="text-xs text-gray-500 pt-2 border-t">Diajukan pada: {new Date(request.created_at).toLocaleString("id-ID")}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center">
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali ke Dashboard
              </Link>
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
