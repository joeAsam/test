import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: path.resolve(__dirname) },
  transpilePackages: ["three"],
};

export default nextConfig;
