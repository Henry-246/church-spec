import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cloudflare Images is not used (keeps hosting free); images are served as-is.
  images: { unoptimized: true },
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
