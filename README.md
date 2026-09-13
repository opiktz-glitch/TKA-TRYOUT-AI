# TKA-AI (TKA Tryout)

Platform ujian/tryout online berbasis sekolah dengan dukungan tiga peran pengguna (Admin, Guru, Siswa), pembuatan soal berbantuan AI, dan penegakan waktu pengerjaan di sisi server.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Tech Stack](#tech-stack)
- [Struktur Folder](#struktur-folder)
- [Persiapan Awal](#persiapan-awal)
- [Instalasi & Menjalankan (Lokal)](#instalasi--menjalankan-lokal)
- [Menjalankan dengan Docker](#menjalankan-dengan-docker)
- [Peran Pengguna](#peran-pengguna)
- [Dokumentasi API](#dokumentasi-api)
- [Backup Database](#backup-database)
- [Skema Database](#skema-database)
- [Catatan Keamanan](#catatan-keamanan)

## Fitur Utama

- **Manajemen ujian/tryout**: pembuatan paket soal, penjadwalan, dan pengelolaan bank soal per mata pelajaran.
- **Generate soal dengan AI**: mendukung banyak provider (Ollama untuk lokal, Gemini untuk produksi), termasuk pembuatan soal tunggal (dengan pratinjau prompt) dan pembuatan massal dari dokumen (PDF/DOCX/TXT).
- **Verifikasi kunci jawaban dua tahap**: tahap 1 (gratis, cross-check berbasis prompt) dan tahap 2 (berbayar, re-derivasi independen — hanya dipicu jika hasil tahap 1 mencurigakan) untuk menyeimbangkan akurasi dan biaya API.
- **Penegakan waktu di server**: batas waktu pengerjaan tryout dihitung dan divalidasi di server (bukan hanya di frontend), mencegah kecurangan lewat manipulasi waktu di client.
- **Role-based access control**: Admin, Guru, dan Siswa masing-masing punya akses dan tampilan berbeda.
- **Pengaturan dinamis lewat UI Admin**: ganti provider AI aktif, kelola API key (terenkripsi), rotasi `SECRET_KEY` aplikasi — semua tanpa edit `.env` atau restart server.
- **Backup otomatis & manual**: backup database SQLite terjadwal tiap 24 jam (Docker) atau manual lewat tombol di halaman Pengaturan, dengan retensi otomatis.
- **Akses jaringan lokal (LAN)**: mode demo yang bisa diakses dari perangkat lain di WiFi yang sama tanpa konfigurasi CORS manual.

## Tech Stack

**Backend**
- FastAPI + SQLAlchemy (ORM)
- SQLite (dev), dengan skrip migrasi ke PostgreSQL/MySQL untuk produksi
- `bcrypt` (hashing password, dipanggil langsung tanpa `passlib`)
- `python-jose` (JWT)
- `cryptography` (Fernet, enkripsi API key AI)
- `pypdf`, `python-docx` (ekstraksi teks dari dokumen soal)

**Frontend**
- React 19 + Vite
- React Router v7

**Infrastruktur**
- Docker & Docker Compose (backend, frontend, service backup terpisah)

## Struktur Folder

```
├── backend/
│   ├── ai_providers.py       # Registry & logika multi-provider AI (Ollama, Gemini)
│   ├── auth.py                # Autentikasi, JWT, manajemen SECRET_KEY dinamis
│   ├── backup_service.py      # Logika inti backup SQLite (dipakai CLI & endpoint API)
│   ├── config.py               # Konfigurasi environment (.env)
│   ├── database.py             # Setup koneksi SQLAlchemy
│   ├── document_parser.py     # Ekstraksi teks dari PDF/DOCX/TXT untuk impor soal
│   ├── main.py                  # Entry point FastAPI, registrasi router & middleware
│   ├── models.py                # Model SQLAlchemy (12 tabel)
│   ├── schemas.py               # Skema Pydantic (request/response)
│   ├── routers/                 # Endpoint API per domain (auth, users, questions, tryouts, dst.)
│   ├── scripts/backup_db.py    # Wrapper CLI untuk backup manual/cron
│   └── database/                # Lokasi file database SQLite (project_tz.db)
├── frontend/
│   ├── src/
│   │   ├── pages/                # Halaman per role (Admin, Guru, Siswa)
│   │   ├── components/           # Komponen bersama (Sidebar, Header, modal, dll.)
│   │   ├── auth/                  # Context autentikasi
│   │   └── services/api.js      # Wrapper pemanggilan API backend
│   └── vite.config.js
├── docker-compose.yml
├── run.py                        # Jalankan mode develop (localhost saja)
└── run_server.py                # Jalankan mode server (bisa diakses via LAN/WiFi)
```

## Persiapan Awal

- Python 3.12+
- Node.js 18+ dan npm
- (Opsional) [Ollama](https://ollama.com) terpasang secara lokal jika ingin generate soal AI tanpa provider cloud

## Instalasi & Menjalankan (Lokal)

### 1. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt

# Salin file environment lalu isi nilainya
copy .env.example .env      # Windows
cp .env.example .env         # Mac/Linux
```

Isi minimal yang **wajib** diisi di `backend/.env`:

```env
SECRET_KEY=<hasil dari: python -c "import secrets; print(secrets.token_urlsafe(64))">
```

Nilai lain (`DATABASE_URL`, `CORS_ORIGINS`, `FRONTEND_PORT`, `BACKEND_PORT`) opsional saat pengembangan lokal — akan otomatis fallback ke default yang aman (lihat komentar di `.env.example`).

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. Jalankan Keduanya Sekaligus

Dari root project:

```bash
# Mode develop — hanya bisa diakses dari laptop sendiri (localhost)
python run.py

# ATAU mode server — bisa diakses dari HP/laptop lain di WiFi yang sama (untuk demo)
python run_server.py
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Dokumentasi API (Swagger): `http://localhost:8000/docs`

> Catatan: `run.py` dan `run_server.py` mengasumsikan virtual environment backend berada di `backend/venv` (path Windows). Sesuaikan path Python di kedua skrip tersebut jika environment berbeda.

## Menjalankan dengan Docker

```bash
docker compose up -d --build
```

Ini akan menjalankan tiga service:
- `backend` — API FastAPI di port `8000`
- `frontend` — aplikasi React (di-build & disajikan lewat Nginx) di port `5173`
- `backup` — service backup otomatis (jalan tiap 24 jam, retensi default 14 hari, bisa diatur lewat `BACKUP_RETENTION_DAYS`)

Database SQLite dan folder backup di-*bind mount* ke host (`./backend/backups`) supaya data tetap aman meski container di-rebuild.

Untuk produksi, sesuaikan minimal:
- `backend/.env` → isi `CORS_ORIGINS` dengan domain asli
- `docker-compose.yml` → `VITE_API_URL` di build args frontend, sesuaikan domain backend

## Peran Pengguna

| Peran  | Kode DB   | Akses Utama |
|--------|-----------|-------------|
| Admin  | `ADMIN`   | Kelola user, mata pelajaran, pengaturan AI, keamanan (`SECRET_KEY`), backup, laporan nilai seluruh sekolah |
| Guru   | `GURU`    | Kelola bank soal (manual & AI), buat & kelola tryout, lihat laporan nilai siswa binaannya |
| Siswa  | `SISWA`   | Mengerjakan tryout, melihat riwayat & hasil ujian sendiri |

## Dokumentasi API

Dokumentasi interaktif otomatis tersedia selama `APP_MODE` bukan `production`:

- Swagger UI: `/docs`
- ReDoc: `/redoc`
- Skema mentah: `/openapi.json`

Ketiganya **dinonaktifkan otomatis** saat `APP_MODE=production` (mis. lewat Docker) untuk mencegah kebocoran struktur API ke publik.

## Backup Database

- **Otomatis**: aktif sendiri tiap 24 jam lewat service `backup` di `docker-compose.yml`.
- **Manual**: tombol "Backup Sekarang" di halaman *Pengaturan Admin*.
- **CLI**: `python backend/scripts/backup_db.py`

Semua jalur di atas memakai logika yang sama di `backend/backup_service.py`, memanfaatkan *online backup API* SQLite (`sqlite3.Connection.backup()`) sehingga aman dijalankan meski database sedang aktif dipakai.

## Skema Database

12 tabel utama (lihat detail lengkap di dokumen skema database terpisah):

`t_user`, `t_student`, `t_teacher`, `t_subject`, `t_question`, `t_question_option`, `t_tryout`, `t_tryout_question`, `t_attempt`, `t_answer`, `t_result`, `t_app_setting`

## Catatan Keamanan

- File `.env` **tidak boleh** pernah di-commit atau diikutkan dalam ZIP upload (sudah masuk `.gitignore`).
- Setelah deploy pertama kali, segera jalankan "Rotasi Otomatis" `SECRET_KEY` dari Pengaturan > Keamanan untuk menginvalidasi kunci lama.
- API key provider AI (mis. Gemini) disimpan **terenkripsi** (Fernet) di tabel `t_app_setting`, bukan plain-text.
- `CORS_ORIGINS` di `.env` wajib diisi domain asli saat produksi — jangan mengandalkan fallback development.
