"""
Script migrasi SEKALI JALAN untuk database yang sudah ada.

Menambahkan index unik parsial di t_attempt supaya cuma boleh ada
SATU attempt berstatus IN_PROGRESS per (student_id, tryout_id) --
mencegah race condition saat siswa memulai tryout (lihat komentar
di models.py pada class Attempt untuk detail lengkapnya).

Aman dijalankan berkali-kali: kalau index sudah ada, script ini
cuma memberi tahu dan tidak melakukan apa-apa lagi.

Cara pakai (dari folder backend/):
    python scripts/create_attempt_index.py
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "database" / "project_tz.db"

INDEX_NAME = "uq_attempt_active_per_student_tryout"

CREATE_INDEX_SQL = f"""
CREATE UNIQUE INDEX {INDEX_NAME}
ON t_attempt (student_id, tryout_id)
WHERE status = 'IN_PROGRESS'
"""


def main():
    if not DB_PATH.exists():
        print(f"Database tidak ditemukan di: {DB_PATH}")
        print("Pastikan script ini dijalankan dari folder backend/.")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))

    try:
        existing = conn.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='index' AND name=?",
            (INDEX_NAME,),
        ).fetchone()

        if existing:
            print(f"Index '{INDEX_NAME}' sudah ada, tidak perlu dibuat ulang.")
            return

        conn.execute(CREATE_INDEX_SQL)
        conn.commit()
        print(f"Berhasil membuat index '{INDEX_NAME}' di {DB_PATH}")

    except sqlite3.IntegrityError as e:
        # Ini seharusnya jarang terjadi -- kalau muncul, artinya
        # database SUDAH TERLANJUR punya lebih dari satu attempt
        # IN_PROGRESS untuk siswa+tryout yang sama (data lama
        # peninggalan race condition sebelum fix ini ada). Index
        # tidak bisa dibuat sebelum data yang bentrok itu
        # dibereskan manual dulu.
        print("GAGAL membuat index karena data yang sudah ada bentrok:")
        print(f"  {e}")
        print(
            "\nKemungkinan ada data lama: lebih dari satu attempt "
            "IN_PROGRESS untuk siswa+tryout yang sama. Cek dulu dengan "
            "query ini sebelum lanjut:\n"
            "  SELECT student_id, tryout_id, COUNT(*) "
            "FROM t_attempt WHERE status='IN_PROGRESS' "
            "GROUP BY student_id, tryout_id HAVING COUNT(*) > 1;"
        )
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
