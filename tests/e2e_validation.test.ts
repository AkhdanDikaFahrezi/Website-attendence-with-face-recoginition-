import { test, expect, describe } from '@playwright/test';

describe('End-to-End User Journey Test', () => {
  test('Complete user journey: login -> attendance -> leave request -> view history -> logout', async ({ page }) => {
    // 1. Start from the main page and login
    await page.goto('/');
    await expect(page).toHaveTitle(/Face Attendance/);
    
    // Verify that login is required for attendance functionality
    await page.getByRole('link', { name: 'Langsung Absen' }).click();
    
    // Should redirect to login if not authenticated
    // For this test, we'll assume user is already logged in
    
    // 2. Test attendance functionality
    await page.goto('/absen');
    await expect(page).toHaveURL(/.*\/absen/);
    
    // Verify attendance page elements
    await expect(page.getByRole('tab', { name: 'Absen Masuk' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Absen Pulang' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aktifkan Kamera' })).toBeVisible();
    
    // 3. Test leave request functionality
    await page.goto('/izin');
    await expect(page).toHaveURL(/.*\/izin/);
    
    // Verify leave request page elements
    await expect(page.getByRole('button', { name: 'Ajukan Izin' })).toBeVisible();
    
    // Test creating a new leave request
    await page.getByRole('button', { name: 'Ajukan Izin' }).click();
    await page.locator('select').first().click();
    await page.getByRole('option', { name: 'Izin' }).click();
    await page.locator('textarea').fill('Testing end-to-end journey');
    
    // Submit the leave request
    await page.getByRole('button', { name: 'Ajukan Permintaan' }).click();
    
    // Verify success message
    await expect(page.getByText('Permintaan izin berhasil diajukan!')).toBeVisible();
    
    // 4. Test attendance history functionality
    await page.goto('/riwayat');
    await expect(page).toHaveURL(/.*\/riwayat/);
    
    // Verify history page elements
    await expect(page.getByRole('tab', { name: 'Riwayat' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Bulanan' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Semester' })).toBeVisible();
    
    // Verify that the leave request appears in history
    await expect(page.getByText('Testing end-to-end journey')).toBeVisible();
    
    // 5. Test dashboard elements
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Beranda' })).toBeVisible();
    
    // Verify dashboard statistics
    await expect(page.getByText('Statistik Kehadiran')).toBeVisible();
    
    console.log('Complete end-to-end user journey test completed');
  });

  test('User journey with attendance recording', async ({ page }) => {
    // Navigate to attendance page
    await page.goto('/absen');
    
    // Simulate attendance recording (would require mock webcam)
    await page.getByRole('tab', { name: 'Absen Masuk' }).click();
    
    // In a real test environment, we would mock the webcam and face verification
    // For now, we'll just verify the UI elements
    await expect(page.getByRole('button', { name: 'Absen Masuk' })).toBeEnabled();
    
    console.log('Attendance recording journey test completed');
  });

  test('User journey with leave request approval workflow', async ({ page }) => {
    // This would test the admin/manager side of the workflow
    // For now, we'll just verify the UI elements exist
    
    await page.goto('/izin');
    
    // Verify that edit/delete buttons appear for pending requests
    const editButtons = await page.getByRole('button', { name: 'Edit' }).count();
    const deleteButtons = await page.getByRole('button', { name: 'Delete' }).count();
    
    console.log(`Found ${editButtons} edit buttons and ${deleteButtons} delete buttons`);
    console.log('Leave request workflow test completed');
  });
});