"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { User, Shield, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function AdminDebugPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string>(new Date().toISOString());

  useEffect(() => {
    setCheckedAt(new Date().toISOString());
  }, [isAdmin, user?.id]);

  const refreshAdminStatus = async () => {
    setLoading(true);
    setCheckedAt(new Date().toISOString());
    setLoading(false);
  };

  if (!user || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Autentikasi Diperlukan</CardTitle>
            <CardDescription>Silakan masuk terlebih dahulu untuk mengakses halaman debug</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <Link href="/login">
                <User className="h-4 w-4 mr-2" />
                Login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Debug</h1>
              <p className="text-gray-600 dark:text-gray-300">Status role dibaca langsung dari kolom profiles.role.</p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/">
                <User className="h-4 w-4 mr-2" />
                Kembali
              </Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Status Role
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div>
                  <p className="font-medium">Akses Admin</p>
                  <p className="text-sm text-gray-500">Hasil pembacaan role saat ini</p>
                </div>
                {isAdmin ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Admin
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                    <XCircle className="h-4 w-4 mr-1" />
                    Student
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">User ID</Label>
                  <p className="font-mono text-xs break-all mt-1">{user.id}</p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Role</Label>
                  <p className="font-medium mt-1">{user.role}</p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Email</Label>
                  <p className="font-medium mt-1">{user.email || "-"}</p>
                </div>
                <div>
                  <Label className="text-gray-600 dark:text-gray-400">Checked At</Label>
                  <p className="font-medium mt-1">{new Date(checkedAt).toLocaleString("id-ID")}</p>
                </div>
              </div>

              <Button onClick={refreshAdminStatus} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh Status
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
