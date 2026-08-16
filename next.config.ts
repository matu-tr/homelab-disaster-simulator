import type { NextConfig } from "next";

// Yerel LAN üzerinden farklı bir IP/hostname'den erişiyorsan (ör. dev sunucuyu telefonundan
// ya da başka bir cihazdan açıyorsan), ALLOWED_DEV_ORIGIN env değişkenini o adrese ayarla —
// aksi halde Next.js dev sunucusu cross-origin chunk isteklerini güvenlik gereği engeller.
const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGIN ? [process.env.ALLOWED_DEV_ORIGIN] : undefined,
};

export default nextConfig;
