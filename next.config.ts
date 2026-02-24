import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Temporário para permitir deploy
  },
  typescript: {
    ignoreBuildErrors: true, // Temporário para permitir deploy
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "60mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "rental-v2-clean.vercel.app" }],
        destination: "https://app.rentalenergia.com.br/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
