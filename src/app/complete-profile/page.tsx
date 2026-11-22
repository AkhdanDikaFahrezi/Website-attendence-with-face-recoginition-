'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function CompleteProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [nim, setNim] = useState('');
  const [name, setName] = useState('');
  const [classSchedule, setClassSchedule] = useState('');
  const [semester, setSemester] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update the profile in Supabase
      const { error } = await supabase
        .from('profiles')
        .update({
          nim,
          nama: name,
          kelas: classSchedule,
          semester
        })
        .eq('id', user?.id);

      if (error) {
        throw error;
      }

      toast.success('Profil berhasil diperbarui!');
      router.push(user?.role === 'admin' ? '/admin' : '/register');
    } catch (error: unknown) {
      console.error('Error updating profile:', error);
      // Handle different types of errors
      let errorMessage = 'Terjadi kesalahan';
      const errorObject = typeof error === 'object' && error !== null
        ? (error as { message?: string; error_description?: string })
        : null;
      if (errorObject?.message) {
        errorMessage = errorObject.message;
      } else if (errorObject?.error_description) {
        errorMessage = errorObject.error_description;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Check for specific error types
      if (errorObject?.message?.includes('duplicate key value violates unique constraint') || errorObject?.error_description?.includes('duplicate key value violates unique constraint')) {
        if (errorObject?.message?.includes('profiles_nim_key') || errorObject?.error_description?.includes('profiles_nim_key')) {
          toast.error('NIM sudah digunakan oleh akun lain. Silakan gunakan NIM lain.');
        } else {
          toast.error(`Gagal memperbarui profil: ${errorMessage}`);
        }
      } else {
        toast.error(`Gagal memperbarui profil: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Lengkapi Profil</CardTitle>
          <CardDescription>Mohon lengkapi data diri Anda untuk melanjutkan</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nim">NIM</Label>
              <Input
                id="nim"
                type="text"
                value={nim}
                onChange={(e) => setNim(e.target.value)}
                placeholder="Masukkan NIM Anda"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masukkan nama lengkap Anda"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="classSchedule">Jadwal Kelas</Label>
              <Input
                id="classSchedule"
                type="text"
                value={classSchedule}
                onChange={(e) => setClassSchedule(e.target.value)}
                placeholder="Contoh: Senin 08:00-10:00"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="semester">Semester</Label>
              <Select value={semester} onValueChange={setSemester} required>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih semester" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <SelectItem key={sem} value={sem.toString()}>
                      Semester {sem}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Memproses...' : 'Simpan Profil'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
