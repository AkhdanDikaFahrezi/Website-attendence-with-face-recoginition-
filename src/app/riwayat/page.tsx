// This is a temporary redirect page to handle the old /riwayat route
// It redirects to the new /reports page

import { redirect } from 'next/navigation';

export default function RiwayatRedirect() {
  redirect('/reports');
}