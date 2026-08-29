import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  turbopack: {
    root: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  },
  async redirects() {
    return [
      {
        source: "/clients",
        destination: "/crm/clients",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
