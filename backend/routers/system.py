import socket
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from config import DATABASE_URL, OLLAMA_BASE_URL, GEMINI_BASE_URL, FRONTEND_PORT, BACKEND_PORT
from models import User
from schemas import NetworkInfoResponse, NetworkAddress
import ai_providers


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


# =========================================================
# HELPER — cari IP address laptop ini di jaringan lokal
# (WiFi/LAN), supaya admin tidak perlu buka Command Prompt dan
# ketik "ipconfig" manual untuk memberi tahu laptop lain cara
# terhubung.
# =========================================================

def _is_private_ipv4(ip: str) -> bool:

    parts = ip.split(".")

    if len(parts) != 4 or not all(p.isdigit() for p in parts):
        return False

    a, b = int(parts[0]), int(parts[1])

    return (
        a == 10
        or (a == 172 and 16 <= b <= 31)
        or (a == 192 and b == 168)
    )


def get_local_network_ips() -> list[str]:

    ips: set[str] = set()

    # Cara 1: semua alamat yang terdaftar untuk hostname laptop ini.
    # Bisa menemukan lebih dari satu kalau ada beberapa adapter
    # jaringan (mis. WiFi + Ethernet virtual VPN/Docker).
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass

    # Cara 2 (fallback/pelengkap): trik "connect" UDP ke alamat
    # publik untuk membaca IP outbound utama OS. TIDAK benar-benar
    # mengirim data (UDP connect cuma menentukan rute), jadi aman
    # dipakai walau tidak ada internet — cuma perlu jaringan lokal.
    # Ini biasanya cara PALING akurat menemukan IP WiFi yang aktif
    # saat laptop punya banyak adapter.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(0.5)
            s.connect(("8.8.8.8", 80))
            ips.add(s.getsockname()[0])
    except OSError:
        pass

    private_ips = sorted(ip for ip in ips if _is_private_ipv4(ip))

    return private_ips or sorted(ips)


@router.get("/network-info", response_model=NetworkInfoResponse)
def get_network_info(
    current_user: User = Depends(require_role("ADMIN")),
):
    """
    Info untuk tab "Jaringan" di halaman Pengaturan Admin: IP
    address laptop ini di WiFi/LAN yang sedang aktif, plus URL
    lengkap yang tinggal disalin & dibuka di laptop/HP lain yang
    terhubung ke jaringan WiFi yang SAMA.

    Kalau endpoint ini berhasil terjawab, itu sendiri sudah bukti
    backend sedang berjalan (backend_online selalu True di sini).
    """

    hostname = socket.gethostname()
    ips = get_local_network_ips()

    addresses = [
        NetworkAddress(
            interface="WiFi / LAN",
            ip=ip,
            frontend_url=f"http://{ip}:{FRONTEND_PORT}",
            backend_url=f"http://{ip}:{BACKEND_PORT}",
        )
        for ip in ips
    ]

    return NetworkInfoResponse(
        hostname=hostname,
        frontend_port=FRONTEND_PORT,
        backend_port=BACKEND_PORT,
        addresses=addresses,
        backend_online=True,
    )


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

    # --- AI (PROVIDER AKTIF, PROVIDER APAPUN YANG TERDAFTAR) ---
    # Provider yang ditampilkan mengikuti pilihan admin di halaman
    # Pengaturan > AI (tersimpan di t_app_setting) lewat registry
    # generik ai_providers.py — kartu ini otomatis akurat untuk
    # provider baru mana pun tanpa perlu diubah.
    active_provider = ai_providers.get_active_provider(db)

    provider_status = await ai_providers.get_provider_status(db, active_provider)

    # "host"/"base_url" cuma info kosmetik tambahan untuk 2 provider
    # bawaan (Ollama = alamat lokal, Gemini = endpoint cloud). Untuk
    # provider baru yang belum dikenal di sini, cukup tampilkan
    # labelnya saja — tidak memengaruhi status online/offline di atas.
    if active_provider == "OLLAMA":
        host = parse_ai_host(OLLAMA_BASE_URL)
        base_url = OLLAMA_BASE_URL
    elif active_provider == "GEMINI":
        host = "Google Gemini (cloud)"
        base_url = GEMINI_BASE_URL
    else:
        host = provider_status.label
        base_url = "-"

    ai_status = {
        "online": provider_status.online,
        "provider": provider_status.label,
        "model": provider_status.model,
        "model_ready": provider_status.online and provider_status.configured,
        "host": host,
        "base_url": base_url,
        "detail": provider_status.detail,
    }

    return {
        "api": api_status,
        "database": database_status,
        "auth": auth_status,
        "ai": ai_status,
    }
