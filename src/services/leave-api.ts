// services/leave-api.ts

const FLASK_API_URL = process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001';

// Function to submit a leave request
export async function submitLeaveRequest(data: {
  profile_id: string;
  type: 'izin' | 'sakit';
  reason: string;
  date: string;
}) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to submit leave request');
    }

    return result;
  } catch (error) {
    console.error('Error submitting leave request:', error);
    throw error;
  }
}

// Function to get leave requests for a user
export async function getLeaveRequests(profileId: string) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/leave/${profileId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to fetch leave requests');
    }

    return result.leave_requests;
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    throw error;
  }
}

// Function to update a leave request status
export async function updateLeaveRequestStatus(
  requestId: string,
  status: 'approved' | 'rejected' | 'pending',
  reviewerId?: string
) {
  try {
    const response = await fetch(`${FLASK_API_URL}/api/leave/${requestId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        reviewerId
          ? { status, reviewer_id: reviewerId }
          : { status }
      ),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update leave request status');
    }

    return result.request;
  } catch (error) {
    console.error('Error updating leave request status:', error);
    throw error;
  }
}

// Function to update leave request details (type, reason, date, status)
export async function updateLeaveStatusFromAPI(
  requestId: string, 
  type: 'izin' | 'sakit', 
  reason: string,
  date?: string
) {
  try {
    const updateData: {
      type: 'izin' | 'sakit';
      reason: string;
      date?: string;
    } = { type, reason };
    if (date) updateData.date = date;
    
    const response = await fetch(`${FLASK_API_URL}/api/leave/${requestId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update leave request');
    }

    return result.request;
  } catch (error) {
    console.error('Error updating leave request:', error);
    throw error;
  }
}

// Function to delete a leave request - marking as cancelled instead of actual deletion
export async function deleteLeaveRequest(requestId: string) {
  try {
    // Instead of deleting, we'll update the status to cancelled
    const response = await fetch(`${FLASK_API_URL}/api/leave/${requestId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        status: 'rejected',
        reason: 'Permintaan dibatalkan'
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to cancel leave request');
    }

    return { success: true, request: result.request };
  } catch (error) {
    console.error('Error cancelling leave request:', error);
    throw error;
  }
}
