import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Izinkan akses dari subdomain trycloudflare.com (Cloudflare Quick Tunnel).
    // Titik di depan ".trycloudflare.com" artinya semua subdomain diizinkan,
    // jadi tidak perlu diedit ulang tiap kali dapat URL tunnel baru.
    allowedHosts: [".trycloudflare.com"],
  },
})
