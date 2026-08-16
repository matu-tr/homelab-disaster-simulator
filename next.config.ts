import type { NextConfig } from "next";

// If you reach the dev server from a different IP/hostname over the local LAN (e.g. opening it
// from your phone or another device), set the ALLOWED_DEV_ORIGIN env variable to that address —
// otherwise the Next.js dev server blocks cross-origin chunk requests for security reasons.
const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGIN ? [process.env.ALLOWED_DEV_ORIGIN] : undefined,
  // dockerode's optional SSH transport dependency (ssh2) ships native/non-ESM assets that
  // Turbopack cannot bundle for server routes. We always talk to Docker over a local socket/TCP,
  // so the SSH transport is never used — mark these packages "external" so they are required
  // directly at runtime instead of being bundled.
  serverExternalPackages: ["dockerode", "ssh2", "docker-modem", "better-sqlite3"],
  devIndicators: false,
};

export default nextConfig;
