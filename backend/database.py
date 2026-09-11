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
# AKTIFKAN FOREIGN KEY ENFORCEMENT DI SQLITE
#
# SQLite tidak mengaktifkan pengecekan foreign key secara
# default meskipun model sudah mendefinisikan ForeignKey.
# Tanpa PRAGMA ini, SQLite akan tetap mengizinkan insert/
# update yang menunjuk ke baris induk yang tidak ada, dan
# tidak mencegah data yatim (orphan) saat baris induk
# dihapus di luar jalur yang sudah divalidasi aplikasi.
#
# PRAGMA ini harus di-set ulang setiap kali koneksi baru
# dibuka (bukan sekali saat engine dibuat), karena berlaku
# per-connection, bukan per-database.
# =========================================================

@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
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