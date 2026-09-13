"""
Script CLI backup database SQLite (project_tz.db) — TKA Tryout.

Logika inti (bagaimana backup dibuat & dibersihkan) ada di
backend/backup_service.py — dipakai bersama oleh script ini DAN
tombol "Backup Sekarang" di halaman Pengaturan Admin, supaya kedua
jalur selalu konsisten. File ini cuma wrapper tipis untuk dipanggil
lewat command line / cron / service Docker.

CARA PAKAI
----------
Lokal (venv), dari folder backend/:
    venv\\Scripts\\python scripts\\backup_db.py        (Windows)
    venv/bin/python scripts/backup_db.py               (Mac/Linux)

Docker (service "backend" atau "backup" di docker-compose.yml):
    docker compose exec backend python scripts/backup_db.py

JADWAL OTOMATIS
----------------
- Docker: sudah otomatis — lihat service "backup" di docker-compose.yml,
  jalan sendiri tiap 24 jam begitu "docker compose up" dijalankan.
- Manual dari UI: tombol "Backup Sekarang" di Pengaturan > Backup
  (memanggil endpoint API, bukan script ini — tapi hasilnya sama
  persis karena logikanya sama-sama dari backup_service.py).
- Jalan manual/lokal (bukan Docker, bukan lewat UI): jadwalkan lewat
  Windows Task Scheduler atau cron, panggil perintah "Lokal" di atas
  tiap hari.
"""

import sys
from pathlib import Path

# Supaya "import backup_service" (backend/backup_service.py) berhasil
# walau script ini dipanggil dari folder mana pun (bukan cuma saat
# cwd = folder backend/).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backup_service import backup_database, cleanup_old_backups  # noqa: E402


if __name__ == "__main__":

    try:
        backup = backup_database()
        print(f"[OK] Backup dibuat: {backup.filename} ({backup.size_bytes} bytes)")

        removed = cleanup_old_backups()
        if removed:
            print(f"[INFO] {removed} backup lama dihapus.")

    except Exception as exc:
        print(f"[GAGAL] Backup database gagal: {exc}", file=sys.stderr)
        sys.exit(1)
