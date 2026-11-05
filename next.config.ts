import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the Tailwind entry needs this loader. CSS Modules use native Next.js CSS handling.
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
