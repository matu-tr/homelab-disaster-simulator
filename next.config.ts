import type { NextConfig } from "next";

// Yerel LAN üzerinden farklı bir IP/hostname'den erişiyorsan (ör. dev sunucuyu telefonundan
// ya da başka bir cihazdan açıyorsan), ALLOWED_DEV_ORIGIN env değişkenini o adrese ayarla —
// aksi halde Next.js dev sunucusu cross-origin chunk isteklerini güvenlik gereği engeller.
const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGIN ? [process.env.ALLOWED_DEV_ORIGIN] : undefined,
  // dockerode'un opsiyonel SSH taşıma bağımlılığı (ssh2) native/non-ESM asset içeriyor ve
  // Turbopack bunu server route'ları için bundle edemiyor. Biz Docker'a hep local socket/TCP
  // üzerinden bağlandığımız için SSH taşıması hiç kullanılmıyor — bu paketleri bundle etmek
  // yerine çalışma anında doğrudan require etmesi için "external" işaretliyoruz.
  serverExternalPackages: ["dockerode", "ssh2", "docker-modem", "better-sqlite3"],
};

export default nextConfig;
