import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_PUBLIC_FLASK_API_URL: process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5001',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5001',
      },
      {
        protocol: 'https',
        hostname: 'mfroemuhojipolbawctq.supabase.co',
      },
    ],
  },
};

export default nextConfig;
