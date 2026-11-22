"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";
import { ActionLoadingOverlay } from "@/components/ui/action-loading-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  getAllLeaveRequests,
  updateLeaveRequestApproval,
} from "@/lib/supabase-attendance";
import type { LeaveRequestRecord, LeaveRequestStatus } from "@/lib/supabase-attendance";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Terjadi kesalahan saat memproses permintaan.";
}

export default function AdminIzinPage() {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveRequestStatus>("pending");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionLoadingText, setActionLoadingText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (authLoading || !isAdmin) {
      return;
    }

    const loadRequests = async () => {
      try {
        setLoadingData(true);
        const requests = await getAllLeaveRequests("all");
        setLeaveRequests(requests);
      } catch (error) {
        console.error("Error loading leave requests:", error);
        setFeedback({ type: "error", message: "Gagal memuat data izin." });
      } finally {
        setLoadingData(false);
      }
    };

    loadRequests();
  }, [authLoading, isAdmin]);

  const refreshRequests = async () => {
    const requests = await getAllLeaveRequests("all");
    setLeaveRequests(requests);
  };

  const handleApprove = async (requestId: string) => {
    if (!user?.id) {
      return;
    }

    try {
      setActionLoadingId(requestId);
      setActionLoadingText("Sedang menyetujui izin...");
      setFeedback(null);
      await updateLeaveRequestApproval(requestId, "approved", user.id);
      await refreshRequests();
      setFeedback({ type: "success", message: "Permintaan berhasil disetujui." });
    } catch (error) {
      console.error("Error approving request:", error);
      setFeedback({ type: "error", message: getErrorMessage(error) });
    } finally {
      setActionLoadingId(null);
      setActionLoadingText(null);
    }
  };

  const openRejectDialog = (requestId: string) => {
    setCurrentRequestId(requestId);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!currentRequestId || !user?.id) {
      return;
    }

    try {
      setActionLoadingId(currentRequestId);
      setActionLoadingText("Sedang menolak izin...");
      setFeedback(null);
      await updateLeaveRequestApproval(
        currentRequestId,
        "rejected",
        user.id,
        rejectReason.trim() || undefined
      );
      await refreshRequests();
      setFeedback({ type: "success", message: "Permintaan berhasil ditolak." });
      setRejectDialogOpen(false);
      setCurrentRequestId(null);
      setRejectReason("");
    } catch (error) {
      console.error("Error rejecting request:", error);
      setFeedback({ type: "error", message: getErrorMessage(error) });
    } finally {
      setActionLoadingId(null);
      setActionLoadingText(null);
    }
  };

  const filteredRequests = useMemo(() => {
    if (statusFilter === "all") {
      return leaveRequests;
    }
    return leaveRequests.filter((request) => request.status === statusFilter);
  }, [leaveRequests, statusFilter]);

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
    return (
      <Badge variant={type === "izin" ? "default" : "secondary"}>{type === "izin" ? "Izin" : "Sakit"}</Badge>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Akses Ditolak</h2>
          <p className="text-gray-600">Silakan login terlebih dahulu</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Akses Ditolak</h2>
          <p className="text-gray-600 mb-4">Hanya admin yang dapat mengakses halaman approval izin.</p>
          <div className="text-sm bg-gray-100 p-3 rounded">
            <p>
              <strong>User:</strong> {user.email || user.nim || user.id}
            </p>
            <p>
              <strong>Role:</strong> {user.role}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="Approval Permintaan Izin"
      eyebrow="Admin approval"
      description="Tinjau request izin mahasiswa dengan layout yang lebih ringkas, lapang, dan fokus pada keputusan."
      userName={user.name}
      userNim={user.nim}
      userEmail={user.email}
      onSignOut={signOut}
    >
      <ActionLoadingOverlay
        open={!!actionLoadingId}
        title={actionLoadingText || "Sedang memproses izin..."}
        description="Perubahan status izin sedang disimpan. Mohon tunggu sebentar."
      />
      <div className="space-y-6">
          <div className="app-hero flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Approval Permintaan Izin</h2>
              <p className="text-sm leading-6 text-slate-500">Admin dapat melihat semua request dan melakukan approve atau reject.</p>
            </div>
            <div className="w-full sm:w-52">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | LeaveRequestStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending</p>
                  <p className="text-2xl font-bold">{leaveRequests.filter((r) => r.status === "pending").length}</p>
                </div>
                <Clock className="h-6 w-6 text-yellow-500" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Approved</p>
                  <p className="text-2xl font-bold">{leaveRequests.filter((r) => r.status === "approved").length}</p>
                </div>
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Rejected</p>
                  <p className="text-2xl font-bold">{leaveRequests.filter((r) => r.status === "rejected").length}</p>
                </div>
                <XCircle className="h-6 w-6 text-red-500" />
              </CardContent>
            </Card>
          </div>

          {feedback && (
            <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Daftar Permintaan Izin</CardTitle>
              <CardDescription>Menampilkan data real-time dari tabel leave_requests.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Tidak ada data request pada filter ini.</div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map((request) => {
                    const isActionLoading = actionLoadingId === request.id;
                    const isPending = request.status === "pending";

                    return (
                      <div key={request.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            {getTypeBadge(request.type)}
                            {getStatusBadge(request.status)}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!isPending || isActionLoading}
                              onClick={() => handleApprove(request.id)}
                            >
                              {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-500 hover:bg-red-600 text-white"
                              disabled={!isPending || isActionLoading}
                              onClick={() => openRejectDialog(request.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-1 text-sm">
                          <p>
                            <span className="font-semibold">Nama:</span> {request.name || request.profiles?.nama || "-"}
                          </p>
                          <p>
                            <span className="font-semibold">NIM:</span> {request.nim || request.profiles?.nim || "-"}
                          </p>
                          <p>
                            <span className="font-semibold">Tanggal:</span>{" "}
                            {new Date(request.date).toLocaleDateString("id-ID", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                          <p>
                            <span className="font-semibold">Alasan:</span> {request.reason}
                          </p>
                          {request.reject_reason && (
                            <p className="text-red-700 dark:text-red-300">
                              <span className="font-semibold">Alasan Reject:</span> {request.reject_reason}
                            </p>
                          )}
                          {request.reviewed_at && (
                            <p className="text-xs text-gray-500">
                              Direview: {new Date(request.reviewed_at).toLocaleString("id-ID")}
                            </p>
                          )}
                          <p className="text-xs text-gray-500">Diajukan: {new Date(request.created_at).toLocaleString("id-ID")}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak Permintaan Izin</DialogTitle>
            <DialogDescription>
              Isi alasan penolakan jika diperlukan. Boleh dikosongkan bila tidak ingin menambahkan catatan.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Contoh: dokumen pendukung belum lengkap"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="mt-2"
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setCurrentRequestId(null);
                setRejectReason("");
              }}
            >
              Batal
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={handleReject}
              disabled={actionLoadingId === currentRequestId}
            >
              {actionLoadingId === currentRequestId ? "Memproses..." : "Tolak Permintaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
