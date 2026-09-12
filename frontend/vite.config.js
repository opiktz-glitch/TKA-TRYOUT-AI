import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // TIDAK di-set "host: true" di sini dengan sengaja — supaya
    // "npm run dev" biasa (mode develop) tetap cuma bisa diakses dari
    // laptop sendiri (localhost), tidak otomatis "kebuka" ke WiFi.
    //
    // Untuk mode SERVER (bisa diakses laptop/HP lain di WiFi), pakai:
    //   npm run dev:lan     (lihat package.json)
    // atau jalankan lewat run_server.py di root project.

    // Izinkan akses dari subdomain trycloudflare.com (Cloudflare Quick Tunnel).
    // Titik di depan ".trycloudflare.com" artinya semua subdomain diizinkan,
    // jadi tidak perlu diedit ulang tiap kali dapat URL tunnel baru.
    allowedHosts: [".trycloudflare.com"],
  },
})
