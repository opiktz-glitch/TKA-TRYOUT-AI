# Panduan Deploy Server LAN

Panduan ini untuk menjalankan TKA TryOut AI dengan Docker pada satu komputer server di jaringan sekolah, lalu mengaksesnya dari HP atau laptop lain pada Wi-Fi/LAN yang sama.

> Contoh IP server pada panduan ini adalah `172.16.64.216`. Ganti dengan IPv4 komputer server Anda bila berbeda atau berubah.

## 1. Prasyarat

- Docker Desktop sudah berjalan di komputer server.
- Komputer server dan perangkat pengguna terhubung ke jaringan LAN/Wi-Fi yang sama.
- Port TCP `5173` dan `8000` diizinkan oleh Windows Firewall untuk jaringan privat.
- Folder proyek sudah tersedia pada komputer server.

Periksa IP komputer server dengan PowerShell:

```powershell
ipconfig
```

Gunakan nilai **IPv4 Address** pada adapter Wi-Fi atau Ethernet yang aktif. Sebaiknya buat DHCP reservation di router agar IP server tidak berubah.

## 2. Konfigurasi environment

### Root `.env` untuk frontend

Di root proyek, salin template lalu isi alamat API server:

```powershell
Copy-Item .env.example .env
```

Isi file `.env` sebagai berikut:

```env
VITE_API_URL=http://172.16.64.216:8000
```

`VITE_API_URL` dipakai browser pada HP/laptop pengguna. Jangan gunakan `localhost`, karena itu akan menunjuk ke perangkat pengguna, bukan komputer server.

### `backend/.env` untuk API

Jika belum tersedia, salin template backend:

```powershell
Copy-Item backend/.env.example backend/.env
```

Minimal isi `SECRET_KEY` dengan nilai acak yang kuat:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Tempel hasilnya pada `SECRET_KEY=` di `backend/.env`. Jangan membagikan atau memasukkan file `.env` ke Git.

Untuk akses LAN, backend telah mengizinkan origin IP privat melalui konfigurasi aplikasi. Jika nanti memakai domain publik, isi `CORS_ORIGINS` dengan domain frontend tersebut.

## 3. Migrasi database yang sudah ada

Jika database sudah pernah dipakai sebelum perbaikan race condition attempt, jalankan sekali:

```powershell
cd backend
python scripts/create_attempt_index.py
cd ..
```

Script ini membuat index unik agar seorang siswa tidak memiliki dua attempt `IN_PROGRESS` pada tryout yang sama.

## 4. Menjalankan aplikasi

Dari root proyek:

```powershell
docker compose up -d --build
docker compose ps
```

Gunakan `--build` setiap kali mengubah root `.env`, khususnya `VITE_API_URL`, karena nilai tersebut dibundel ke frontend saat build.

## 5. Akses aplikasi

Pada perangkat lain dalam jaringan yang sama, buka:

| Layanan | Alamat |
| --- | --- |
| Frontend | `http://172.16.64.216:5173` |
| API status | `http://172.16.64.216:8000/api/system/status` |

Dokumentasi API dinonaktifkan pada mode Docker/production.

## 6. Verifikasi setelah deploy

Lakukan uji dari perangkat selain komputer server:

1. Buka halaman frontend dan login.
2. Mulai tryout, simpan jawaban, lalu submit.
3. Pastikan hasil tryout dan riwayat tampil.
4. Jalankan backup manual dari Pengaturan Admin bila tersedia.
5. Periksa log jika ada masalah:

   ```powershell
   docker compose logs --tail=100
   ```

## 7. Backup dan pemulihan

- Database berjalan dalam Docker named volume.
- Hasil backup SQLite disimpan pada `backend/backups/` di komputer server.
- Salin folder backup secara berkala ke media atau cloud terpisah.
- Uji pemulihan backup secara berkala pada salinan lingkungan, bukan langsung pada database aktif.

## Operasi harian

```powershell
# Melihat status container
docker compose ps

# Melihat log berjalan
docker compose logs -f

# Menghentikan aplikasi tanpa menghapus data volume
docker compose down

# Memperbarui kode dan membangun ulang layanan
docker compose up -d --build
```

## Catatan keamanan

- Jangan membuka port `5173` dan `8000` ke internet publik untuk setup LAN ini.
- Jangan commit `.env`, database SQLite, atau folder backup.
- Gunakan password admin yang kuat dan simpan `SECRET_KEY` dengan aman.
- Untuk akses internet/public, gunakan domain HTTPS dan reverse proxy; konfigurasi LAN ini bukan pengganti setup tersebut.
