import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cloudflare Images is not used (keeps hosting free); images are served as-is.
  images: { unoptimized: true },
  // Development only: allow opening `npm run dev` through an ngrok tunnel
  // (e.g. to test on a phone). Without this, Next.js blocks its browser code
  // for other addresses and pages load without working buttons.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  // CSV member import sends the file through a Server Action (default limit 1 MB).
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings / .dev.vars like production does.
initOpenNextCloudflareForDev();
