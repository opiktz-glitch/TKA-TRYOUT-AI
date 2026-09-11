import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()


# ==========================================
# PATH DATABASE
# ==========================================
# BASE_DIR = folder backend/ ini sendiri (tempat config.py
# berada). Folder "database" sekarang ada DI DALAM backend/,
# bukan lagi sejajar dengan backend/ dan frontend/.
#
#   login/
#   ├── backend/
#   │   ├── config.py      <- file ini
#   │   └── database/      <- file .db dipindahkan ke sini
#   └── frontend/
#
BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "database"

# Pastikan foldernya ada (aman dipanggil berkali-kali)
DATABASE_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DATABASE_PATH = DATABASE_DIR / "project_tz.db"

# Kalau DATABASE_URL diisi manual di file .env, nilai itu
# yang dipakai. Kalau tidak diisi, dihapus dari .env, ATAU
# dibiarkan kosong (baris "DATABASE_URL=" tanpa nilai — ini
# yang dipakai di .env.example), otomatis fallback ke lokasi
# backend/database/project_tz.db di atas.
#
# Dipakai "os.getenv(...) or default", BUKAN
# "os.getenv(..., default)", karena os.getenv dengan argumen
# kedua hanya fallback saat variabelnya benar-benar tidak ada
# di environment. Kalau python-dotenv sudah men-set
# DATABASE_URL="" (string kosong, bukan absen), argumen kedua
# itu tidak pernah kepakai dan DATABASE_URL akan diam-diam jadi
# string kosong -> SQLAlchemy gagal connect dengan error yang
# membingungkan.
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DEFAULT_DATABASE_PATH}"


SECRET_KEY = os.getenv(
    "SECRET_KEY"
)


ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256"
)


ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        "60"
    )
)


# ==========================================
# CORS ORIGINS
# ==========================================
# Diambil dari .env, dipisah koma, mis:
#   CORS_ORIGINS=https://tryout.sekolahku.id,https://admin.sekolahku.id
#
# Kalau tidak diisi di .env, fallback ke origin dev lokal
# (Vite default: localhost:5173) supaya `npm run dev` tetap
# jalan tanpa setup tambahan. Saat deploy ke domain asli,
# WAJIB set CORS_ORIGINS di .env server, jangan andalkan
# fallback ini.
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in CORS_ORIGINS.split(",")
    if origin.strip()
]


if not SECRET_KEY:

    raise ValueError(
        "SECRET_KEY belum diatur di .env"
    )


# ==========================================
# OLLAMA (GENERATE SOAL DENGAN AI)
# ==========================================
# Ollama dijalankan lokal di laptop guru/admin.
# Kalau OLLAMA_BASE_URL / OLLAMA_MODEL tidak diisi di .env,
# fallback ke default di bawah ini.
OLLAMA_BASE_URL = os.getenv(
    "OLLAMA_BASE_URL",
    "http://localhost:11434"
)

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "llama3.2:3b"
)


# ==========================================
# GEMINI (GENERATE SOAL DENGAN AI - CLOUD)
# ==========================================
# Provider AI kedua selain Ollama. Berbeda dengan Ollama, key &
# model Gemini yang SEBENARNYA dipakai aplikasi disimpan di
# database (tabel t_app_setting, lihat routers/settings.py) supaya
# admin bisa ganti-ganti API key dari halaman Pengaturan tanpa
# edit .env atau restart server. Nilai di .env di bawah ini HANYA
# dipakai sebagai fallback kalau admin belum pernah mengisi lewat
# UI sama sekali (mis. saat instalasi awal).
GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY",
    ""
)

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
)

GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta"
)

# Provider AI yang aktif secara default ("OLLAMA" atau "GEMINI").
# Sama seperti di atas, ini cuma fallback awal — nilai yang
# sebenarnya dipakai runtime disimpan di t_app_setting supaya bisa
# diganti admin dari UI Pengaturan.
AI_PROVIDER = os.getenv(
    "AI_PROVIDER",
    "OLLAMA"
).strip().upper()

if AI_PROVIDER not in ("OLLAMA", "GEMINI"):
    AI_PROVIDER = "OLLAMA"
