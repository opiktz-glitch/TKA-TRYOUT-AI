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

import json
import os
import re
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text as sa_text

import models
from config import DATABASE_URL
from database import IS_LIBSQL, engine


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


@dataclass
class RestoreResult:
    restored_from: str
    safety_backup_filename: str
    restored_at: datetime


# 16 byte pertama SETIAP file SQLite valid selalu persis string ini
# (diakhiri null byte) — cara paling murah & cepat untuk menolak file
# yang jelas-jelas bukan database SQLite SEBELUM mencoba membukanya
# sungguhan (mis. admin salah pilih file .txt/.jpg secara tidak
# sengaja).
_SQLITE_HEADER = b"SQLite format 3\x00"


def validate_sqlite_file(path: Path) -> None:
    """
    Validasi bahwa file di `path` benar-benar file database SQLite
    yang sehat, SEBELUM dipakai untuk menimpa database aplikasi yang
    sedang berjalan. Melempar ValueError (pesan Bahasa Indonesia,
    aman ditampilkan langsung ke admin) kalau tidak valid.

    Dua lapis pengecekan:
    1. Header 16 byte pertama — menolak file yang jelas bukan SQLite
       tanpa perlu membuka koneksi sama sekali (cepat, murah).
    2. "PRAGMA integrity_check" — membuka file sungguhan dan meminta
       SQLite memeriksa struktur internalnya. Ini menangkap kasus
       file rusak/truncated yang kebetulan masih punya header yang
       benar (mis. upload terputus di tengah jalan).
    """

    try:
        with open(path, "rb") as f:
            header = f.read(len(_SQLITE_HEADER))
    except OSError as exc:
        raise ValueError(f"Gagal membaca file: {exc}") from exc

    if header != _SQLITE_HEADER:
        raise ValueError(
            "File yang dipilih bukan database SQLite yang valid "
            "(header file tidak cocok)."
        )

    try:
        conn = sqlite3.connect(str(path))
        try:
            result = conn.execute("PRAGMA integrity_check").fetchone()
        finally:
            conn.close()
    except sqlite3.DatabaseError as exc:
        raise ValueError(
            f"File database ini rusak/tidak bisa dibaca SQLite: {exc}"
        ) from exc

    if not result or result[0] != "ok":
        raise ValueError(
            "File database ini gagal pemeriksaan integritas SQLite "
            "(kemungkinan rusak atau tidak lengkap). Restore dibatalkan "
            "untuk keamanan — database aplikasi TIDAK diubah."
        )


def restore_database(source_path: Path) -> RestoreResult:
    """
    Timpa database aplikasi yang sedang aktif dengan isi file di
    `source_path` (yang HARUS sudah lolos validate_sqlite_file()
    sebelum fungsi ini dipanggil — fungsi ini sendiri tidak validasi
    ulang, supaya caller bisa menampilkan pesan error yang lebih
    spesifik lebih dulu ke admin).

    Langkah-langkah demi keamanan:
    1. Backup database yang SEDANG AKTIF dulu (pakai backup_database()
       yang sudah ada) SEBELUM ditimpa — supaya restore yang salah
       pilih file tetap bisa "dibatalkan" lewat backup ini.
    2. Tutup semua koneksi database yang sedang dipegang aplikasi
       (engine.dispose()) — supaya file tidak dalam keadaan terkunci
       saat ditimpa, terutama penting di Windows.
    3. Timpa file database secara atomic (tulis ke file sementara di
       folder yang sama dulu, baru os.replace() — supaya kalau proses
       copy gagal di tengah jalan, database asli tidak ikut rusak).
    4. Hapus sidecar WAL/SHM lama (project_tz.db-wal/-shm) yang mungkin
       masih menunjuk ke isi database SEBELUM restore — kalau
       dibiarkan, SQLite bisa "menggabungkan" isi WAL lama yang sudah
       tidak relevan ke database yang baru saja di-restore.

    Melempar ValueError kalau DATABASE_URL bukan SQLite lokal (restore
    manual seperti ini belum didukung untuk Turso/Postgres — lihat
    catatan yang sama di backup_database()).
    """

    target_path = _resolve_sqlite_path(DATABASE_URL)

    if not target_path.exists():
        raise FileNotFoundError(f"Database tidak ditemukan di: {target_path}")

    # 1. Backup pengaman dari kondisi SEBELUM restore.
    safety_backup = backup_database()

    # 2. Lepas semua koneksi yang sedang dipegang connection pool.
    engine.dispose()

    # 3. Timpa secara atomic.
    tmp_path = target_path.with_suffix(target_path.suffix + ".restoring")
    try:
        shutil.copyfile(source_path, tmp_path)
        os.replace(tmp_path, target_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)

    # 4. Bersihkan sidecar WAL/SHM lama supaya tidak "mencemari"
    # database yang baru saja di-restore.
    for suffix in ("-wal", "-shm"):
        sidecar = target_path.with_name(target_path.name + suffix)
        sidecar.unlink(missing_ok=True)

    return RestoreResult(
        restored_from=source_path.name,
        safety_backup_filename=safety_backup.filename,
        restored_at=datetime.now(),
    )


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


# ==========================================
# BACKUP/RESTORE UNTUK MODE TURSO (libSQL)
# ==========================================
#
# Semua fungsi di atas (backup_database, restore_database, dst) cuma
# valid untuk SQLite FILE LOKAL -- caranya benar-benar COPY FILE .db
# lewat sqlite3.Connection.backup(), yang jelas tidak masuk akal
# kalau datanya sekarang ada di server Turso, bukan di disk sini.
#
# Untuk Turso, pendekatannya beda total: QUERY semua baris dari tiap
# tabel lewat koneksi SQLAlchemy yang SUDAH ADA (sama seperti yang
# dipakai aplikasi sehari-hari), lalu serialize ke JSON. Backup ini
# SENGAJA TIDAK PERNAH ditulis ke disk container -- langsung dikirim
# sebagai response download ke browser admin saat itu juga (lihat
# endpoint di routers/settings.py). Alasannya dua:
#   1. Filesystem container (Back4App dkk) ephemeral -- nyimpen file
#      backup di sana percuma, hilang pas redeploy.
#   2. Ini otomatis menjadikan hasil backup PASTI ada "di luar
#      server" (di komputer admin), tanpa perlu setup storage
#      eksternal tambahan (S3, dll) yang menambah kompleksitas.
#
# Urutan tabel dependency-safe (parent dulu baru child) diambil dari
# models.Base.metadata.sorted_tables -- SQLAlchemy sendiri yang
# menghitung urutan ini dari relasi ForeignKey antar tabel, jadi
# tidak perlu di-hardcode manual dan otomatis tetap benar kalau nanti
# ada tabel baru ditambahkan ke models.py.

TURSO_BACKUP_FORMAT_VERSION = 1


def is_turso_mode() -> bool:
    """True kalau backend sedang jalan pakai Turso/libSQL, bukan file
    SQLite lokal. Dipakai routers/settings.py untuk menentukan tombol
    mana yang ditampilkan ke admin di halaman Pengaturan."""

    return IS_LIBSQL


def _json_safe(value):
    """Ubah tipe data Python yang tidak dikenal json.dumps (datetime,
    date, Decimal, bytes) jadi bentuk yang aman disimpan & dibaca
    balik. Kalau tabel di masa depan menyimpan tipe lain di luar ini,
    tinggal tambah cabang baru di sini."""

    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, bytes):
        return value.hex()

    return str(value)


def export_turso_snapshot() -> dict:
    """Query semua tabel aplikasi (urutan aman dari
    Base.metadata.sorted_tables) dan kembalikan sebagai dict yang
    siap di-JSON-kan:

        {
          "format_version": 1,
          "exported_at": "2026-09-16T10:00:00",
          "tables": {
            "t_user": [ {...baris1...}, {...baris2...} ],
            "t_student": [ ... ],
            ...
          }
        }

    Melempar Exception apa pun dari SQLAlchemy kalau query gagal --
    caller (endpoint API) yang menampilkan pesan errornya ke admin.
    """

    tables_data = {}

    with engine.connect() as conn:
        for table in models.Base.metadata.sorted_tables:
            rows = conn.execute(sa_text(f"SELECT * FROM {table.name}"))
            column_names = rows.keys()

            tables_data[table.name] = [
                {
                    col: _json_safe(value)
                    for col, value in zip(column_names, row)
                }
                for row in rows
            ]

    return {
        "format_version": TURSO_BACKUP_FORMAT_VERSION,
        "exported_at": datetime.now().isoformat(),
        "tables": tables_data,
    }


def validate_turso_snapshot(data: dict) -> None:
    """Validasi struktur file backup JSON sebelum dipakai restore.
    Melempar ValueError dengan pesan jelas kalau tidak valid, supaya
    endpoint bisa langsung balas 400 tanpa sempat menyentuh database
    sama sekali."""

    if not isinstance(data, dict):
        raise ValueError("File backup tidak valid: bukan objek JSON.")

    if data.get("format_version") != TURSO_BACKUP_FORMAT_VERSION:
        raise ValueError(
            "File backup tidak dikenali atau dari versi format yang "
            "tidak didukung."
        )

    tables = data.get("tables")

    if not isinstance(tables, dict):
        raise ValueError("File backup tidak valid: bagian 'tables' hilang.")

    known_table_names = {
        table.name for table in models.Base.metadata.sorted_tables
    }

    unknown = set(tables.keys()) - known_table_names

    if unknown:
        raise ValueError(
            "File backup berisi tabel yang tidak dikenali: "
            + ", ".join(sorted(unknown))
        )


@dataclass
class TursoRestoreResult:
    restored_from_exported_at: str
    tables_restored: int
    rows_restored: int


def restore_turso_snapshot(data: dict) -> TursoRestoreResult:
    """Timpa SELURUH isi database Turso dengan isi file backup JSON.

    DESTRUKTIF: semua baris yang ada sekarang di setiap tabel yang
    disebut di file backup akan DIHAPUS dulu sebelum diisi ulang.
    Endpoint pemanggil WAJIB mewajibkan admin mengonfirmasi secara
    eksplisit (lihat parameter confirm di routers/settings.py) dan
    SANGAT DISARANKAN admin download backup kondisi saat ini dulu
    (lewat export_turso_snapshot) sebelum restore, karena TIDAK ADA
    auto-safety-backup otomatis di sini seperti versi SQLite lokal --
    tidak ada tempat aman menyimpannya di server yang ephemeral.

    Dijalankan dalam SATU transaksi: kalau ada error di tengah jalan
    (mis. tabel tujuan sudah tidak dikenali oleh model saat ini),
    seluruh perubahan di-ROLLBACK, database kembali ke kondisi
    sebelum restore dicoba -- tidak akan berhenti di tengah dengan
    sebagian tabel sudah kosong.
    """

    validate_turso_snapshot(data)

    tables_by_name = {
        table.name: table for table in models.Base.metadata.sorted_tables
    }

    # Urutan HAPUS: child dulu baru parent (kebalikan sorted_tables),
    # supaya tidak melanggar constraint foreign key di tengah jalan.
    delete_order = list(reversed(models.Base.metadata.sorted_tables))

    # Urutan ISI ULANG: parent dulu baru child (urutan asli
    # sorted_tables), alasan yang sama.
    insert_order = list(models.Base.metadata.sorted_tables)

    tables_restored = 0
    rows_restored = 0

    with engine.begin() as conn:

        for table in delete_order:
            if table.name in data["tables"]:
                conn.execute(table.delete())

        for table in insert_order:
            rows = data["tables"].get(table.name)

            if not rows:
                continue

            conn.execute(table.insert(), rows)

            tables_restored += 1
            rows_restored += len(rows)

    return TursoRestoreResult(
        restored_from_exported_at=data.get("exported_at", "?"),
        tables_restored=tables_restored,
        rows_restored=rows_restored,
    )
