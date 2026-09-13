"""
Logika inti backup database SQLite — SATU-SATUNYA tempat logika ini
ditulis. Dipakai oleh dua "pintu masuk" berbeda:

1. scripts/backup_db.py   -> dipanggil dari CLI/cron/service Docker
                             "backup" di docker-compose.yml (jadwal
                             otomatis tiap 24 jam).
2. routers/settings.py    -> dipanggil dari tombol "Backup Sekarang"
                             di halaman Pengaturan Admin (manual,
                             kapan saja admin mau).

Menaruh logikanya di sini (bukan ditulis dua kali) supaya kedua jalur
itu selalu konsisten — sama-sama pakai online-backup API SQLite yang
sama, sama-sama nulis ke folder yang sama, sama-sama kena retention
yang sama.

KENAPA TIDAK CUKUP SEKADAR COPY FILE .db
------------------------------------------
Kalau aplikasi sedang menulis ke database (mis. siswa sedang submit
jawaban tryout) tepat saat file di-copy mentah-mentah, hasil copy-nya
BISA CORRUPT. sqlite3.Connection.backup() dipakai di sini karena itu
API resmi bawaan SQLite untuk "online backup": aman dipanggil SAAT
database sedang aktif dipakai proses lain, hasilnya selalu berupa
snapshot yang konsisten di satu titik waktu.

KONFIGURASI (opsional, lewat environment variable)
----------------------------------------------------
BACKUP_DIR              Folder tujuan backup.
                         Default: <folder backend ini>/backups
BACKUP_RETENTION_DAYS   Backup lebih tua dari sekian hari otomatis
                         dihapus. Default: 14.
"""

import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from config import DATABASE_URL


BASE_DIR = Path(__file__).resolve().parent

BACKUP_DIR = Path(
    os.getenv("BACKUP_DIR") or (BASE_DIR / "backups")
).resolve()

RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "14"))

# Nama file backup SELALU mengikuti pola ini (lihat backup_database()
# di bawah) — dipakai juga oleh resolve_backup_path() untuk memvalidasi
# nama file yang diminta di-download lewat endpoint API, supaya tidak
# bisa dipakai untuk path traversal (mis. "../../../../etc/passwd").
FILENAME_PATTERN = re.compile(r"^project_tz_\d{8}_\d{6}\.db$")


@dataclass
class BackupFile:
    filename: str
    size_bytes: int
    created_at: datetime


def _resolve_sqlite_path(database_url: str) -> Path:
    """
    Ambil path file .db sebenarnya dari DATABASE_URL (mengikuti
    config.py — jadi otomatis benar baik untuk lokasi default
    backend/database/project_tz.db maupun DATABASE_URL kustom yang
    diisi manual di .env).
    """

    if not database_url.startswith("sqlite:///"):
        raise ValueError(
            "Backup otomatis ini cuma mendukung SQLite. "
            f"DATABASE_URL saat ini: {database_url}"
        )

    raw_path = database_url.split("sqlite:///", 1)[1]

    return Path(raw_path).resolve()


def backup_database() -> BackupFile:
    """Buat satu file backup baru. Melempar ValueError/OSError kalau
    gagal — caller (script CLI maupun endpoint API) yang menentukan
    cara menampilkan errornya ke user."""

    source_path = _resolve_sqlite_path(DATABASE_URL)

    if not source_path.exists():
        raise FileNotFoundError(f"Database tidak ditemukan di: {source_path}")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_path = BACKUP_DIR / f"project_tz_{timestamp}.db"

    source_conn = sqlite3.connect(str(source_path))
    dest_conn = sqlite3.connect(str(dest_path))

    try:
        # Online backup API SQLite — snapshot konsisten walau ada
        # koneksi lain (uvicorn/aplikasi) sedang membaca/menulis
        # database ini secara bersamaan.
        with dest_conn:
            source_conn.backup(dest_conn)
    finally:
        source_conn.close()
        dest_conn.close()

    return BackupFile(
        filename=dest_path.name,
        size_bytes=dest_path.stat().st_size,
        created_at=datetime.fromtimestamp(dest_path.stat().st_mtime),
    )


def cleanup_old_backups() -> int:
    """Hapus backup lebih tua dari RETENTION_DAYS. Mengembalikan
    jumlah file yang dihapus."""

    if not BACKUP_DIR.exists():
        return 0

    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    removed = 0

    for file in BACKUP_DIR.glob("project_tz_*.db"):

        try:
            modified = datetime.fromtimestamp(file.stat().st_mtime)
        except OSError:
            continue

        if modified < cutoff:
            file.unlink(missing_ok=True)
            removed += 1

    return removed


def list_backups() -> list[BackupFile]:
    """Daftar semua backup yang ada, terbaru dulu. Dipakai kartu
    "Backup Database" di halaman Pengaturan supaya admin bisa lihat
    riwayat & download salah satunya."""

    if not BACKUP_DIR.exists():
        return []

    files = [
        BackupFile(
            filename=file.name,
            size_bytes=file.stat().st_size,
            created_at=datetime.fromtimestamp(file.stat().st_mtime),
        )
        for file in BACKUP_DIR.glob("project_tz_*.db")
    ]

    files.sort(key=lambda f: f.created_at, reverse=True)

    return files


def resolve_backup_path(filename: str) -> Path:
    """
    Validasi nama file yang diminta untuk di-download lewat endpoint
    API. WAJIB dipanggil sebelum membuka file apa pun berdasarkan
    input dari user — mencegah path traversal (mis. filename berisi
    "../" untuk keluar dari BACKUP_DIR dan membaca file sistem lain).

    Melempar ValueError kalau nama file tidak sesuai pola backup yang
    valid, atau FileNotFoundError kalau filenya memang tidak ada.
    """

    if not FILENAME_PATTERN.match(filename):
        raise ValueError("Nama file backup tidak valid.")

    path = (BACKUP_DIR / filename).resolve()

    # Jaga-jaga tambahan: pastikan hasil resolve() beneran masih di
    # dalam BACKUP_DIR (seharusnya sudah pasti benar kalau regex di
    # atas lolos, tapi ini lapisan pertahanan kedua yang murah).
    if BACKUP_DIR not in path.parents and path != BACKUP_DIR:
        raise ValueError("Nama file backup tidak valid.")

    if not path.is_file():
        raise FileNotFoundError("File backup tidak ditemukan.")

    return path
