import socket
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from config import DATABASE_URL, OLLAMA_BASE_URL, GEMINI_BASE_URL
from models import User
from routers.settings import get_active_provider, get_provider_status


router = APIRouter(
    prefix="/api/system",
    tags=["System"]
)


# =========================================================
# HELPER — pecah DATABASE_URL (sqlite:///...) jadi info
# direktori & nama file database, supaya frontend bisa
# menampilkan lokasi database yang SEBENARNYA dipakai
# (mengikuti .env / config.py), bukan teks statis.
# =========================================================

def parse_sqlite_info(database_url: str) -> dict:

    if not database_url.startswith("sqlite"):

        return {
            "engine": "Database Lain",
            "name": database_url,
            "directory": "-",
        }

    # Contoh nilai yang mungkin muncul:
    #   sqlite:///database/project_tz.db          (relatif)
    #   sqlite:////home/user/app/db/project_tz.db (absolut, unix)
    #   sqlite:///C:/Projects/TKA-TryOut/backend/database/project_tz.db
    raw_path = database_url.split("sqlite:///", 1)[-1]
    raw_path = raw_path.replace("\\", "/")

    if "/" in raw_path:
        directory, name = raw_path.rsplit("/", 1)
    else:
        directory, name = ".", raw_path

    return {
        "engine": "SQLite",
        "name": name or "project_tz.db",
        "directory": directory or "/",
    }


# =========================================================
# HELPER — ambil host:port dari OLLAMA_BASE_URL untuk
# ditampilkan sebagai "IP Server AI" di frontend.
# =========================================================

def parse_ai_host(base_url: str) -> str:

    try:

        parsed = urlparse(base_url)
        host = parsed.hostname or "-"
        port = parsed.port

        if host == "localhost":

            try:
                host = socket.gethostbyname("localhost")
            except OSError:
                host = "127.0.0.1"

            host = f"{host} (lokal)"

        return f"{host}:{port}" if port else host

    except Exception:

        return base_url


@router.get("/status")
async def get_system_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Status sistem real-time untuk kartu "Informasi Sistem" di
    Dashboard. Setiap bagian benar-benar dicek (bukan hardcode):

    - database : jalankan query ringan ke SQLite
    - ai       : ping endpoint /api/tags milik Ollama
    """

    # --- API ---
    # Kalau endpoint ini terjawab, berarti API server hidup.
    api_status = {
        "online": True,
        "framework": "FastAPI",
    }

    # --- DATABASE ---
    db_info = parse_sqlite_info(DATABASE_URL)

    try:
        db.execute(text("SELECT 1"))
        db_online = True
    except Exception:
        db_online = False

    database_status = {
        "online": db_online,
        "engine": db_info["engine"],
        "name": db_info["name"],
        "directory": db_info["directory"],
    }

    # --- AUTH ---
    auth_status = {
        "online": True,
        "label": "JWT aktif",
    }

    # --- AI (PROVIDER AKTIF: OLLAMA ATAU GEMINI) ---
    # Provider yang ditampilkan mengikuti pilihan admin di halaman
    # Pengaturan > Model AI (tersimpan di t_app_setting), bukan
    # hardcode ke Ollama — supaya kartu ini tetap akurat kalau
    # admin sudah pindah ke Gemini.
    active_provider = get_active_provider(db)

    provider_status = await get_provider_status(db, active_provider)

    ai_status = {
        "online": provider_status.online,
        "provider": provider_status.label,
        "model": provider_status.model,
        "model_ready": provider_status.online and provider_status.configured,
        "host": (
            parse_ai_host(OLLAMA_BASE_URL)
            if active_provider == "OLLAMA"
            else "Google Gemini (cloud)"
        ),
        "base_url": (
            OLLAMA_BASE_URL if active_provider == "OLLAMA" else GEMINI_BASE_URL
        ),
        "detail": provider_status.detail,
    }

    return {
        "api": api_status,
        "database": database_status,
        "auth": auth_status,
        "ai": ai_status,
    }
