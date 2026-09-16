from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from config import DATABASE_URL


# =========================================================
# DETEKSI JENIS DATABASE DARI DATABASE_URL
#
# Project ini sekarang bisa jalan di atas 2 jenis koneksi:
#
# 1. SQLite FILE LOKAL (dev/lama):
#      sqlite:///backend/database/project_tz.db
#    Driver: pysqlite (bawaan Python, akses file langsung).
#
# 2. Turso / libSQL REMOTE (online, di luar container):
#      sqlite+libsql://nama-db-org.turso.io?authToken=xxx&secure=true
#    Driver: sqlalchemy-libsql, komunikasi lewat HTTP/WebSocket ke
#    server Turso — BUKAN akses file lokal.
#
# Dua-duanya sama-sama "dialect sqlite" di SQLAlchemy, tapi
# perilakunya beda jauh di level koneksi (lihat penjelasan di
# masing-masing blok di bawah), makanya perlu dibedakan di sini
# alih-alih pakai satu konfigurasi sama untuk semua.
# =========================================================

_url = make_url(DATABASE_URL)

IS_LOCAL_SQLITE = (
    _url.drivername == "sqlite"
)

IS_LIBSQL = (
    _url.drivername.startswith("sqlite+libsql")
)


# =========================================================
# connect_args PER JENIS DATABASE
#
# check_same_thread=False HANYA relevan untuk file SQLite lokal
# yang diakses lewat modul sqlite3 bawaan Python (yang secara
# default melarang 1 koneksi dipakai lintas thread). Driver
# libSQL/Turso dan Postgres punya penanganan koneksi sendiri —
# argumen ini tidak dikenali dan akan error kalau tetap dikirim.
#
# UNTUK LIBSQL/TURSO: auth token JUSTRU TIDAK DIBACA sama sekali
# kalau cuma diselipkan di query string URL (?authToken=...) —
# driver sqlalchemy-libsql mengabaikannya begitu saja, dan server
# Turso akan menolak koneksi sebagai "empty JWT token". Sesuai
# dokumentasi resminya, token WAJIB dikirim lewat connect_args
# (key "auth_token", huruf kecil + underscore — beda dari nama
# parameter di URL "authToken"). Supaya DATABASE_URL yang diisi di
# .env/Back4App tetap bisa memakai format yang sama seperti sebelum
# ini (authToken diselipkan di URL, satu variabel saja), token itu
# di-"pindahkan" di sini: dibaca dari query string, lalu dihapus
# dari URL dan dimasukkan ke connect_args yang benar.
# =========================================================

_engine_url = _url

if IS_LOCAL_SQLITE:
    _connect_args = {"check_same_thread": False}

elif IS_LIBSQL:
    _query = dict(_url.query)
    _auth_token = _query.pop("authToken", None) or _query.pop("auth_token", None)

    # GAGAL CEPAT dengan pesan jelas kalau token kosong/tidak ada —
    # daripada diam-diam connect tanpa token, yang nanti baru
    # ketahuan lewat error dari Turso sendiri ("empty JWT token")
    # yang kurang jelas asal-usulnya kalau dilihat orang lain.
    if not _auth_token:
        raise ValueError(
            "DATABASE_URL mengarah ke libSQL/Turso tapi parameter "
            "'authToken' tidak ditemukan atau kosong di URL-nya. "
            "Formatnya harus: "
            "sqlite+libsql://<host>?authToken=<TOKEN>&secure=true"
        )

    _connect_args = {"auth_token": _auth_token}

    # URL yang dipakai create_engine() TANPA authToken/auth_token lagi
    # (parameter lain seperti "secure=true" tetap dipertahankan).
    _engine_url = _url.set(query=_query)

else:
    _connect_args = {}


# =========================================================
# NullPool — KHUSUS LIBSQL/TURSO
#
# SQLAlchemy connection pool, SECARA TERPISAH dari rollback di level
# Session, SELALU memanggil dbapi_connection.rollback() lagi setiap
# kali sebuah koneksi dikembalikan ke pool — ini yang mulanya bikin
# libsql-experimental panic (percobaan awal, sudah dilewati). Fix
# awal (pool_reset_on_return=None) ternyata belum cukup: ditemukan
# panic KEDUA di titik lain — pembuatan cursor baru dari koneksi yang
# diambil ULANG dari pool. Polanya acak/intermittent, konsisten
# muncul tepat di titik REUSE KONEKSI, dari request yang jalan di
# thread worker berbeda-beda (FastAPI/Starlette menjalankan setiap
# dependency sync, termasuk get_current_user, di thread pool).
#
# Dugaan kuat: binding Rust `libsql-experimental` tidak aman dipakai
# lintas-thread untuk SATU objek koneksi yang sama — persis pola
# yang biasanya diselesaikan connection pooling (against database
# biasa), tapi di sini malah jadi sumber masalah.
#
# Fix: NullPool artinya SQLAlchemy TIDAK MENYIMPAN/REUSE koneksi
# sama sekali — setiap kali sebuah Session butuh koneksi, dibikin
# BENAR-BENAR BARU dari nol, dipakai, lalu dibuang total (bukan
# dikembalikan ke pool untuk dipakai request lain). Ini menghapus
# akar masalah "koneksi lama dipakai dari thread yang beda", dengan
# konsekuensi: tiap request kena overhead bikin koneksi baru ke
# Turso (biasanya kecil karena Turso berbasis HTTP, bukan handshake
# TCP+TLS penuh dari nol tiap kali) — TERMASUK PRAGMA foreign_keys
# di bawah, yang karena ini jadi ikut jalan di SETIAP request juga
# (bukan cuma sesekali kayak waktu masih ada pool asli).
# =========================================================

_engine_kwargs = {"connect_args": _connect_args}

if IS_LIBSQL:
    _engine_kwargs["poolclass"] = NullPool


engine = create_engine(
    _engine_url,
    **_engine_kwargs,
)


# =========================================================
# PRAGMA SQLITE — DIJALANKAN SETIAP KONEKSI BARU DIBUKA
# (HANYA UNTUK SQLITE FILE LOKAL)
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
#    lock dilepas. WAL memisahkan penulisan ke file log terpisah
#    (project_tz.db-wal) sehingga READER TIDAK LAGI DIBLOKIR
#    OLEH WRITER (dan sebaliknya).
#
# 3. busy_timeout=5000
#    Pelengkap WAL: kalau tetap ada writer lain yang sedang
#    memegang lock tepat di momen yang sama, koneksi yang
#    menunggu akan RETRY OTOMATIS sampai 5 detik sebelum
#    melempar error "database is locked".
#
# KENAPA TIDAK DIPAKAI UNTUK TURSO/LIBSQL:
# journal_mode=WAL dan busy_timeout mengatur locking FILE SQLITE
# LOKAL di disk — tidak relevan untuk koneksi remote ke server
# Turso (yang menangani concurrency-nya sendiri di sisi server,
# termasuk mendukung concurrent writes secara native). Mengirim
# PRAGMA ini ke server remote bisa saja diabaikan atau error,
# jadi sengaja dilewati sama sekali untuk IS_LIBSQL — bukan cuma
# dibungkus try/except, supaya tidak ada perilaku diam-diam yang
# beda antara lokal dan remote.
#
# foreign_keys=ON MASIH dicoba untuk libSQL (didukung karena
# libSQL kompatibel SQLite), tapi dibungkus try/except supaya
# tidak menjatuhkan seluruh startup server kalau ternyata versi/
# mode koneksi Turso yang dipakai tidak mendukungnya.
# =========================================================

if IS_LOCAL_SQLITE:

    @event.listens_for(engine, "connect")
    def _configure_sqlite_connection(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

elif IS_LIBSQL:

    @event.listens_for(engine, "connect")
    def _configure_libsql_connection(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        except Exception:
            # Sengaja diam kalau PRAGMA ini tidak didukung di mode
            # koneksi Turso yang dipakai — jangan sampai gagal
            # connect/startup hanya karena ini.
            pass


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
