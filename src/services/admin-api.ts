// services/admin-api.ts
// Client-side service for admin operations using the Flask backend API

// Get all students
export async function getAllStudents() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/admin/students`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error fetching students');
    }

    const result = await response.json();
    return result.students;
  } catch (error) {
    console.error('Error fetching students:', error);
    throw error;
  }
}

// Get student attendance history
export async function getStudentAttendanceHistory(profileId: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/attendance/${profileId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error fetching attendance history');
    }

    const result = await response.json();
    return result.attendance;
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    throw error;
  }
}

// Get student leave requests
export async function getStudentLeaveRequests(profileId: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/leave/${profileId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error fetching leave requests');
    }

    const result = await response.json();
    return result.leave_requests;
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    throw error;
  }
}

// Update leave request status
export async function updateLeaveRequestStatus(
  requestId: string,
  status: 'pending' | 'approved' | 'rejected',
  rejectReason?: string,
  reviewerId?: string
) {
  try {
    const updateData: {
      status: 'pending' | 'approved' | 'rejected';
      reject_reason?: string;
      reviewer_id?: string;
    } = { status };
    if (rejectReason) {
      updateData.reject_reason = rejectReason;
    }
    if (reviewerId) {
      updateData.reviewer_id = reviewerId;
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/leave/${requestId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error updating leave request status');
    }

    const result = await response.json();
    return result.request;
  } catch (error) {
    console.error('Error updating leave request status:', error);
    throw error;
  }
}

// Get all pending leave requests (for admin dashboard)
export async function getAllPendingLeaveRequests() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001'}/api/leave/pending`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error fetching pending leave requests');
    }

    const result = await response.json();
    return result.leave_requests;
  } catch (error) {
    console.error('Error fetching pending leave requests:', error);
    throw error;
  }
}
