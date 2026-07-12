import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: { root: __dirname }, // pin workspace root — wrong inference made Tailwind resolve from the parent dir and every page hang
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  typescript: { ignoreBuildErrors: true }, // NOTE: Required — OOM on Windows without this
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // Security Headers
  async headers() {
    const commonHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ]
    return [
      {
        source: '/api/pdf/:path*',
        headers: [
          ...commonHeaders,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        source: '/((?!api/pdf).*)',
        headers: [
          ...commonHeaders,
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
};

export default nextConfig;
