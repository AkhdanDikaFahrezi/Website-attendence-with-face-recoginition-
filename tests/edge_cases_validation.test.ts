import { test, expect, describe } from '@playwright/test';

describe('Edge Cases Tests', () => {
  test('Test duplicate attendance attempts', async ({ request, page }) => {
    // Login first
    await page.goto('/');
    
    // Simulate multiple attendance requests in quick succession
    // This would require backend validation to prevent duplicates
    
    // First attendance request
    const response1 = await request.post('/api/attendance', {
      data: {
        profile_id: 'test_profile_id',
        type: 'masuk'
      }
    });
    
    // Second attendance request (should potentially be rejected or handled appropriately)
    const response2 = await request.post('/api/attendance', {
      data: {
        profile_id: 'test_profile_id',
        type: 'masuk'
      }
    });
    
    // Check how the system handles duplicate requests
    console.log('Duplicate attendance attempts test completed');
  });

  test('Test invalid face recognition', async ({ request }) => {
    // Test with invalid or malformed image data
    const response = await request.post('/api/verify', {
      data: {
        face_image: 'invalid_base64_string'
      }
    });
    
    expect(response.status()).toBeGreaterThanOrEqual(400);
    console.log('Invalid face recognition test completed');
  });

  test('Test multiple faces detection', async ({ request }) => {
    // Test with image containing multiple faces
    const response = await request.post('/api/verify', {
      data: {
        face_image: 'base64_image_with_multiple_faces'
      }
    });
    
    const result = await response.json();
    expect(result.message).toContain('Multiple faces detected');
    console.log('Multiple faces detection test completed');
  });

  test('Test spoofing detection', async ({ request }) => {
    // Test with image that might be a spoof (photo, screen, etc.)
    const response = await request.post('/api/verify', {
      data: {
        face_image: 'base64_image_that_might_be_spoof'
      }
    });
    
    const result = await response.json();
    expect(result.message).toContain('Spoofing detected');
    console.log('Spoofing detection test completed');
  });

  test('Test invalid date formats in leave requests', async ({ request }) => {
    // Test submitting leave request with invalid date format
    const response = await request.post('/api/leave', {
      data: {
        profile_id: 'test_profile_id',
        type: 'izin',
        reason: 'Testing invalid date',
        date: 'invalid-date-format'
      }
    });
    
    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.error).toContain('Invalid date format');
    console.log('Invalid date format test completed');
  });

  test('Test invalid leave type in requests', async ({ request }) => {
    // Test submitting leave request with invalid type
    const response = await request.post('/api/leave', {
      data: {
        profile_id: 'test_profile_id',
        type: 'invalid_type',
        reason: 'Testing invalid type',
        date: '2025-01-01'
      }
    });
    
    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.error).toContain('valid leave type');
    console.log('Invalid leave type test completed');
  });

  test('Test missing required fields in leave requests', async ({ request }) => {
    // Test submitting leave request with missing required fields
    const response = await request.post('/api/leave', {
      data: {
        // Missing required fields
        type: 'izin',
        reason: 'Testing missing fields'
        // Missing profile_id and date
      }
    });
    
    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.error).toContain('required');
    console.log('Missing required fields test completed');
  });
});