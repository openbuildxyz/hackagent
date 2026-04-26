import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/skills/:path*.sh',
        headers: [
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
          { key: 'Content-Disposition', value: 'inline' },
        ],
      },
    ]
  },
  async rewrites() {
    // Alias /api/v1/api-keys under the v1 namespace so the route naming is
    // consistent with the rest of the v1 API (events, skill.md, ...).
    // The canonical handler still lives at /api/api-keys to avoid touching
    // dashboard code that fetches it directly.
    return [
      { source: '/api/v1/api-keys', destination: '/api/api-keys' },
      { source: '/api/v1/api-keys/:id', destination: '/api/api-keys/:id' },
    ]
  },
};

export default nextConfig;
