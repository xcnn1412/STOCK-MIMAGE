import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['isomorphic-dompurify'], // jsdom ไม่ต้อง bundle ฝั่ง server
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
    // CSP แบบ report-only (M14): ยังไม่บล็อกอะไร แค่แจ้ง violation ใน devtools — เงียบครบแล้วค่อยเปลี่ยนเป็นบังคับ
    // โฮสต์ภายนอกฝั่ง browser: Supabase (รูป/REST/realtime), twemoji บน jsDelivr · Gemini/Nominatim/Facebook เรียกจาก server
    const csp = (frameAncestors: string) => [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://cdn.jsdelivr.net",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      `frame-ancestors ${frameAncestors}`,
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
    const commonHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ]
    return [
      {
        source: '/api/pdf/:path*',
        headers: [
          ...commonHeaders,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy-Report-Only', value: csp("'self'") },
        ],
      },
      {
        source: '/((?!api/pdf).*)',
        headers: [
          ...commonHeaders,
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy-Report-Only', value: csp("'none'") },
        ],
      },
    ]
  },
};

export default nextConfig;
