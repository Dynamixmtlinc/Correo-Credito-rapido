import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "graph.microsoft.com",
      },
    ],
  },
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
