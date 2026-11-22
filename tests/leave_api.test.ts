import { test, expect, describe } from '@playwright/test';

describe('Leave Request API Tests', () => {
  test('Test leave request creation', async ({ request }) => {
    // Test creating a new leave request
    const response = await request.post('/api/leave', {
      data: {
        profile_id: 'test_profile_id',
        type: 'izin',
        reason: 'Testing leave request creation',
        date: '2025-01-01'
      }
    });
    
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.message).toBe('Leave request submitted successfully');
    expect(result.request_id).toBeDefined();
  });

  test('Test fetching leave requests', async ({ request }) => {
    // Test fetching leave requests for a profile
    const profileId = 'test_profile_id';
    const response = await request.get(`/api/leave/${profileId}`);
    
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.leave_requests).toBeDefined();
    expect(Array.isArray(result.leave_requests)).toBe(true);
  });

  test('Test updating leave request status', async ({ request }) => {
    // Test updating a leave request status
    const requestId = 'test_request_id';
    const response = await request.put(`/api/leave/${requestId}`, {
      data: {
        status: 'approved'
      }
    });
    
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.message).toBe('Leave request updated successfully');
    expect(result.request).toBeDefined();
  });
});