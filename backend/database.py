from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from config import DATABASE_URL


engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False
    }
)


# =========================================================
# PRAGMA SQLITE — DIJALANKAN SETIAP KONEKSI BARU DIBUKA
#
# 1. foreign_keys=ON
#    SQLite tidak mengaktifkan pengecekan foreign key secara
#    default meskipun model sudah mendefinisikan ForeignKey.
#    Tanpa PRAGMA ini, SQLite akan tetap mengizinkan insert/
#    update yang menunjuk ke baris induk yang tidak ada, dan
#    tidak mencegah data yatim (orphan) saat baris induk
#    dihapus di luar jalur yang sudah divalidasi aplikasi.
#
# 2. journal_mode=WAL
#    Mode default SQLite (rollback journal) mengunci SELURUH
#    file database setiap kali ada satu koneksi yang menulis —
#    koneksi lain (baca maupun tulis) harus menunggu sampai
#    lock dilepas. Ini jadi masalah nyata di aplikasi ini:
#    banyak siswa mengerjakan tryout bersamaan memicu banyak
#    write kecil hampir bersamaan (autosave tiap kali memilih
#    jawaban di save_answer), ditambah admin/guru yang bisa
#    saja sedang membaca laporan di waktu yang sama.
#
#    WAL memisahkan penulisan ke file log terpisah
#    (project_tz.db-wal) sehingga READER TIDAK LAGI DIBLOKIR
#    OLEH WRITER (dan sebaliknya). Writer tetap serial (cuma
#    satu proses boleh menulis di satu waktu — WAL tidak
#    membuat SQLite multi-writer), tapi throughput baca-tulis
#    campuran seperti pola aplikasi ini jauh lebih baik.
#
#    Catatan: journal_mode tersimpan di file database itu
#    sendiri (bukan cuma pengaturan sesi), jadi PRAGMA ini
#    aman dipanggil berulang di setiap koneksi baru — hanya
#    benar-benar "menyalakan" WAL sekali di awal.
#
#    Backup (backup_service.py) SUDAH memakai online backup
#    API SQLite (Connection.backup()), bukan copy file mentah
#    — jadi tetap konsisten/aman dipakai bersama WAL tanpa
#    perlu diubah.
#
# 3. busy_timeout=5000
#    Pelengkap WAL: kalau tetap ada writer lain yang sedang
#    memegang lock tepat di momen yang sama, koneksi yang
#    menunggu akan RETRY OTOMATIS sampai 5 detik sebelum
#    melempar error "database is locked" — bukan langsung
#    gagal di percobaan pertama.
#
# Ketiga PRAGMA ini di-set ulang setiap kali koneksi baru
# dibuka (bukan sekali saat engine dibuat), karena PRAGMA
# connection-level (foreign_keys, busy_timeout) berlaku per-
# connection, bukan per-database.
# =========================================================

@event.listens_for(engine, "connect")
def _configure_sqlite_connection(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


Base = declarative_base()


def get_db():

    db = SessionLocal()

    try:

        yield db

    finally:

        db.close()