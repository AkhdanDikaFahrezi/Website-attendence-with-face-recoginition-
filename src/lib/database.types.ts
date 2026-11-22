// src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          nama: string;
          nim: string;
          kelas: string;
          semester: string;
          enrollment_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          nama: string;
          nim: string;
          kelas: string;
          semester: string;
          enrollment_status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          nama?: string;
          nim?: string;
          kelas?: string;
          semester?: string;
          enrollment_status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};