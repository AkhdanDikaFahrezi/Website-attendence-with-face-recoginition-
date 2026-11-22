// Attendance and leave statistics service
// Note: This file doesn't actually use Supabase client, so no need to import it

// Define the stats types
export type AttendanceStats = {
  hadir: number;
  izin: number;
  sakit: number;
};

export type LeaveStats = {
  approved: number;
  pending: number;
  rejected: number;
};

// Mock data for now - in the future this would call actual API endpoints
export const getAttendanceStats = async (): Promise<AttendanceStats> => {
  // In a real application, this would fetch from the backend
  // For now, return mock data
  return {
    hadir: 24,
    izin: 3,
    sakit: 1
  };
};

export const getLeaveStats = async (): Promise<LeaveStats> => {
  // In a real application, this would fetch from the backend
  // For now, return mock data
  return {
    approved: 2,
    pending: 1,
    rejected: 0
  };
};

// Function to get detailed statistics for dashboard
export const getDashboardStats = async (): Promise<{
  attendance: AttendanceStats;
  leave: LeaveStats
}> => {
  const [attendanceStats, leaveStats] = await Promise.all([
    getAttendanceStats(),
    getLeaveStats()
  ]);

  return {
    attendance: attendanceStats,
    leave: leaveStats
  };
};