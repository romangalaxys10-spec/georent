import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for self-hosting (workspace start script). Vercel
  // builds its own output — keep it off there via the VERCEL env flag.
  output: process.env.VERCEL ? undefined : "standalone",
  // Overridable so a second dev instance (e.g. NEXT_PUBLIC_DEMO_MODE=1 demo
  // testing on another port) can use its own build directory — Next 16 locks
  // .next/dev per project.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
