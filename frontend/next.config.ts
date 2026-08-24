import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
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
