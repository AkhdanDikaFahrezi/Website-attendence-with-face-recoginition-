// Service for fetching recent activities
import { supabase } from '@/lib/supabase';

export type ActivityItem = {
  id: string;
  type: 'attendance' | 'leave';
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'pending' | 'rejected';
};

// Function to get recent activities for a user
export const getRecentActivities = async (userId: string): Promise<ActivityItem[]> => {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return [];
  }

  // Fetch recent attendance logs
  const { data: attendanceLogs, error: attendanceError } = await supabase
    .from('attendance_logs')
    .select('id, type, timestamp')
    .eq('profile_id', userId)
    .order('timestamp', { ascending: false })
    .limit(3);

  if (attendanceError) {
    console.error('Error fetching attendance logs:', attendanceError);
  }

  // Fetch recent leave requests
  const { data: leaveRequests, error: leaveError } = await supabase
    .from('leave_requests')
    .select('id, type, reason, date, status, created_at')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(3);

  if (leaveError) {
    console.error('Error fetching leave requests:', leaveError);
  }

  // Combine and sort activities by timestamp
  const activities: ActivityItem[] = [];

  if (attendanceLogs) {
    attendanceLogs.forEach(log => {
      activities.push({
        id: log.id,
        type: 'attendance',
        title: log.type === 'masuk' ? 'Presensi Masuk' : 'Presensi Pulang',
        description: `Jam ${new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        timestamp: log.timestamp,
        status: 'success'
      });
    });
  }

  if (leaveRequests) {
    leaveRequests.forEach(request => {
      let statusColor = 'pending';
      if (request.status === 'approved') statusColor = 'success';
      else if (request.status === 'rejected') statusColor = 'rejected';

      activities.push({
        id: request.id,
        type: 'leave',
        title: `Pengajuan ${request.type === 'izin' ? 'Izin' : 'Sakit'}`,
        description: `${request.reason.substring(0, 30)}${request.reason.length > 30 ? '...' : ''}`,
        timestamp: request.created_at,
        status: statusColor as 'success' | 'pending' | 'rejected'
      });
    });
  }

  // Sort by timestamp (most recent first)
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Return only the 5 most recent activities
  return activities.slice(0, 5);
};