import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
