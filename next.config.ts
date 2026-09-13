import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Block J: catalog import accepts files up to 10MB (matching МойСклад's
  // own cap) — Server Actions otherwise cap the request body at 1MB, which
  // would reject the upload before parseImportFile ever runs.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
