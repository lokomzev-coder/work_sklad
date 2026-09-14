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
  // Security fix (external review, 2026-09-13): tells the browser to
  // never MIME-sniff a response's declared Content-Type — closes a
  // secondary path to the same stored-XSS class fixed at
  // /api/files/[id] (lib/upload-allowlist.ts): even if a response's
  // Content-Type were ever wrong, this stops a browser from guessing
  // "this looks like HTML" and rendering it anyway. Applied to every
  // response, not just the files route, since it has no downside for any
  // other route in this app.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
