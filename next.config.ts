import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Playwright never runs inside route handlers (PRODUCTION_PLAN §4), so no
  // browser-related config belongs here.
};

export default nextConfig;
