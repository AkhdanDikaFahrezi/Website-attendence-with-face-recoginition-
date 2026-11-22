// Attendance + Leave operations using authenticated Supabase client

import { supabase } from '@/lib/supabase-client';

export type LeaveRequestType = 'izin' | 'sakit';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected';

type LeaveRequestProfile = {
  nim?: string | null;
  nama?: string | null;
} | null;

export type LeaveRequestRecord = {
  id: string;
  profile_id: string;
  type: LeaveRequestType;
  reason: string;
  date: string;
  status: LeaveRequestStatus;
  reject_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  profiles?: LeaveRequestProfile;
  name?: string;
  nim?: string;
};

type RawLeaveRequest = LeaveRequestRecord & {
  profiles?: {
    nim?: string | null;
    nama?: string | null;
  } | null;
};

type AttendanceSummaryRow = {
  timestamp?: string;
  type?: string;
};

function getLocalDayBounds(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Format tanggal tidak valid');
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function getSupabaseWithAuth() {
  return supabase;
}

// Attendance Operations
export async function recordAttendance(profileId: string, type: 'masuk' | 'pulang') {
  try {
    const { data, error } = await supabase.from('attendance_logs').insert([
      {
        profile_id: profileId,
        type,
        timestamp: new Date().toISOString(),
      },
    ]);

    if (error) {
      throw new Error(error.message || 'Error recording attendance');
    }

    return data;
  } catch (error) {
    console.error('Error recording attendance:', error);
    throw error;
  }
}

export async function getAttendanceHistory(profileId: string) {
  try {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('profile_id', profileId)
      .order('timestamp', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Error fetching attendance history');
    }

    return data;
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    throw error;
  }
}

// Leave Request Operations - Student
export async function createLeaveRequest(leaveData: {
  profile_id: string;
  type: LeaveRequestType;
  reason: string;
  date: string;
}) {
  try {
    const attendanceExists = await hasAttendanceOnDate(leaveData.profile_id, leaveData.date);

    if (attendanceExists) {
      throw new Error('Tidak dapat mengajukan izin pada tanggal ini karena absensi sudah tercatat.');
    }

    const { data, error } = await supabase.from('leave_requests').insert([
      {
        profile_id: leaveData.profile_id,
        type: leaveData.type,
        reason: leaveData.reason,
        date: leaveData.date,
        status: 'pending',
      },
    ]);

    if (error) {
      throw new Error(error.message || 'Error creating leave request');
    }

    return data;
  } catch (error) {
    console.error('Error creating leave request:', error);
    throw error;
  }
}

export async function hasAttendanceOnDate(profileId: string, date: string): Promise<boolean> {
  try {
    const { startIso, endIso } = getLocalDayBounds(date);

    const { data, error } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('profile_id', profileId)
      .gte('timestamp', startIso)
      .lte('timestamp', endIso)
      .limit(1);

    if (error) {
      throw new Error(error.message || 'Error checking attendance conflict');
    }

    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error('Error checking attendance conflict:', error);
    throw error;
  }
}

export async function getApprovedLeaveOnDate(
  profileId: string,
  date: string
): Promise<LeaveRequestRecord | null> {
  try {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('profile_id', profileId)
      .eq('date', date)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || 'Error checking approved leave request');
    }

    return (data as LeaveRequestRecord | null) ?? null;
  } catch (error) {
    console.error('Error checking approved leave request:', error);
    throw error;
  }
}

export async function getLeaveRequests(profileId: string): Promise<LeaveRequestRecord[]> {
  try {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Error fetching leave requests');
    }

    return (data || []) as LeaveRequestRecord[];
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    throw error;
  }
}

// Leave Request Operations - Admin
export async function getAllLeaveRequests(
  status: LeaveRequestStatus | 'all' = 'all'
): Promise<LeaveRequestRecord[]> {
  try {
    let query = supabase
      .from('leave_requests')
      .select('*, profiles:profiles!leave_requests_profile_id_fkey(nim, nama)')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message || 'Error fetching all leave requests');
    }

    const normalized = (data || []).map((request) => {
      const typedRequest = request as RawLeaveRequest;
      return {
        ...typedRequest,
        name: typedRequest.profiles?.nama || '',
        nim: typedRequest.profiles?.nim || '',
      };
    });

    return normalized as LeaveRequestRecord[];
  } catch (error) {
    console.error('Error fetching all leave requests:', error);
    throw error;
  }
}

export async function reviewLeaveRequest(params: {
  requestId: string;
  status: 'approved' | 'rejected';
  reviewedBy: string;
  rejectReason?: string;
}) {
  const { requestId, status, reviewedBy, rejectReason } = params;

  try {
    if (status === 'approved') {
      const { data: requestData, error: requestError } = await supabase
        .from('leave_requests')
        .select('id, profile_id, date')
        .eq('id', requestId)
        .maybeSingle();

      if (requestError) {
        throw new Error(requestError.message || 'Error loading leave request');
      }

      if (!requestData?.profile_id || !requestData.date) {
        throw new Error('Data izin tidak lengkap untuk proses approval.');
      }

      const attendanceExists = await hasAttendanceOnDate(requestData.profile_id, requestData.date);

      if (attendanceExists) {
        throw new Error('Tidak dapat menyetujui izin karena absensi pada tanggal tersebut sudah tercatat.');
      }
    }

    const updateData = {
      status,
      reject_reason: status === 'rejected' ? rejectReason || null : null,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('leave_requests')
      .update(updateData)
      .eq('id', requestId)
      .select('*, profiles:profiles!leave_requests_profile_id_fkey(nim, nama)')
      .single();

    if (error) {
      throw new Error(error.message || 'Error reviewing leave request');
    }

    return data as LeaveRequestRecord;
  } catch (error) {
    console.error('Error reviewing leave request:', error);
    throw error;
  }
}

// Backward-compatible wrappers
export async function updateLeaveRequestApproval(
  requestId: string,
  status: 'pending' | 'approved' | 'rejected',
  reviewedBy: string,
  rejectReason?: string
) {
  if (status === 'pending') {
    throw new Error('Status pending is not valid for approval action');
  }

  return reviewLeaveRequest({
    requestId,
    status,
    reviewedBy,
    rejectReason,
  });
}

export async function getPendingLeaveRequests() {
  return getAllLeaveRequests('pending');
}

// General utility functions
export async function getStudentAttendanceSummary(profileId: string) {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);

    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('profile_id', profileId)
      .order('timestamp', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Error fetching attendance summary');
    }

    const attendanceRecords = (data || []) as AttendanceSummaryRow[];
    const currentMonthRecords = attendanceRecords.filter((record) =>
      (record.timestamp || '').startsWith(currentMonth)
    );

    const totalRecords = currentMonthRecords.length;
    const clockIns = currentMonthRecords.filter((record) => record.type === 'masuk').length;
    const clockOuts = currentMonthRecords.filter((record) => record.type === 'pulang').length;

    return {
      totalRecords,
      clockIns,
      clockOuts,
      records: currentMonthRecords,
    };
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    throw error;
  }
}
