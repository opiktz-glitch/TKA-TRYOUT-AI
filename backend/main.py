
import os
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

import models

from database import Base, engine, SessionLocal
from config import ALLOWED_ORIGINS, CORS_ORIGIN_REGEX, APP_MODE

# Modul auth.py (bukan routers/auth.py) — dipakai HANYA untuk
# bootstrap_secret_key() di bawah. Diberi alias "core_auth" supaya
# tidak bentrok dengan "from routers import auth" (routers.auth)
# yang sudah dipakai di seluruh file ini untuk app.include_router().
import auth as core_auth

from routers import auth
from routers import users
from routers import admin
from routers import subjects
from routers import questions
from routers import tryouts
from routers import student
from routers import students
from routers import teachers
from routers import teacher
from routers import system
from routers import settings


# ==========================================
# LOGGING
#
# Tanpa basicConfig, pesan logging.exception()/logger.error()
# dari modul lain (mis. ai_providers.py) tetap tercetak ke
# stderr lewat "handler of last resort" bawaan Python, tapi
# tanpa timestamp/nama modul sehingga sulit ditelusuri. Ini
# memberi format yang jelas dan level minimum INFO supaya
# error tak terduga (exception saat memanggil provider AI,
# dll) selalu tercatat.
# ==========================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


Base.metadata.create_all(bind=engine)


# ==========================================
# BOOTSTRAP SECRET_KEY (SEKALI SAAT STARTUP)
#
# Memastikan SECRET_KEY sudah tersimpan di tabel t_app_setting
# SEBELUM request pertama masuk — bukan menunggu admin membuka
# halaman Pengaturan > Keamanan dan klik "Simpan"/"Rotasi" secara
# manual. Tanpa panggilan ini, aplikasi tetap jalan (ada fallback
# ke config.SECRET_KEY di auth.get_active_secret_key()), tapi
# fitur SECRET_KEY dinamis yang sudah dibangun (termasuk enkripsi
# API key provider AI di ai_providers.py) baru benar-benar "aktif"
# secara database setelah aksi manual itu — bukan sejak awal
# instalasi seperti yang dimaksud.
#
# Pakai SessionLocal() langsung (bukan Depends(get_db)) karena ini
# dijalankan di luar siklus request FastAPI, saat modul ini
# pertama kali di-import oleh uvicorn.
# ==========================================

def _bootstrap_secret_key_on_startup() -> None:

    db = SessionLocal()

    try:

        core_auth.bootstrap_secret_key(db)

    except Exception:

        # Jangan sampai proses startup server gagal total hanya
        # karena bootstrap SECRET_KEY error (mis. database belum
        # siap sepersekian detik). Dicatat ke log supaya tetap
        # ketahuan, tapi fallback ke config.SECRET_KEY tetap
        # membuat aplikasi bisa jalan (lihat auth.py).
        logging.getLogger(__name__).exception(
            "Gagal bootstrap SECRET_KEY ke database saat startup"
        )

    finally:

        db.close()


_bootstrap_secret_key_on_startup()


# ==========================================
# BOOTSTRAP ADMIN DEFAULT (SEKALI SAAT STARTUP, HANYA KALAU
# TABEL t_user MASIH BENAR-BENAR KOSONG)
#
# Kenapa ini perlu: endpoint POST /api/users (bikin user baru)
# mewajibkan role ADMIN yang sudah login (lihat dependencies.py
# require_role("ADMIN")) — jadi kalau database masih kosong total
# (mis. deploy pertama kali ke hosting dengan filesystem ephemeral
# yang reset tiap redeploy, seperti Back4App/Koyeb/Render free
# tier), TIDAK ADA CARA membuat admin pertama lewat API biasa:
# butuh admin buat login, tapi butuh login buat bikin admin.
#
# Fungsi ini memutus lingkaran itu: HANYA jalan kalau db.query(User)
# benar-benar 0 baris (jadi TIDAK PERNAH menimpa/mengubah data user
# yang sudah ada di deployment normal/lokal) — begitu ada minimal
# 1 user (siapa pun perannya), fungsi ini tidak melakukan apa-apa
# lagi selama-lamanya sampai tabel user kosong lagi.
#
# Kredensial diambil dari environment variable DEFAULT_ADMIN_USERNAME
# / DEFAULT_ADMIN_PASSWORD kalau diisi (WAJIB diisi sendiri di
# Back4App/Render/dst demi keamanan) — kalau tidak diisi, fallback
# ke "admin"/"admin123" supaya tetap bisa dipakai untuk testing
# cepat, TAPI harus segera diganti manual lewat halaman Ubah
# Password begitu berhasil login pertama kali.
# ==========================================

def _bootstrap_default_admin_on_startup() -> None:

    db = SessionLocal()

    try:

        user_count = db.query(models.User).count()

        if user_count > 0:
            return

        default_username = (
            os.getenv("DEFAULT_ADMIN_USERNAME", "admin").strip() or "admin"
        )
        default_password = (
            os.getenv("DEFAULT_ADMIN_PASSWORD", "123456").strip()
            or "123456"
        )

        admin_user = models.User(
            username=default_username,
            password_hash=core_auth.hash_password(default_password),
            full_name="Administrator",
            role="ADMIN",
            is_active=True,
        )

        db.add(admin_user)
        db.commit()

        logging.getLogger(__name__).warning(
            "Tabel t_user kosong — akun admin default '%s' "
            "otomatis dibuat. SEGERA login dan ganti password lewat "
            "halaman Ubah Password (jangan dibiarkan pakai kredensial "
            "default, terutama kalau DEFAULT_ADMIN_PASSWORD tidak "
            "pernah di-set manual di environment variable hosting).",
            default_username,
        )

    except Exception:

        # Sama seperti bootstrap SECRET_KEY di atas — jangan sampai
        # startup server gagal total hanya karena ini error.
        logging.getLogger(__name__).exception(
            "Gagal bootstrap akun admin default saat startup"
        )

    finally:

        db.close()


_bootstrap_default_admin_on_startup()


# ==========================================
# SEMBUNYIKAN DOKUMENTASI API SAAT PRODUCTION
#
# Swagger UI (/docs), ReDoc (/redoc), dan skema mentah
# (/openapi.json) MEMBOCORKAN seluruh daftar endpoint, bentuk
# request/response, dan struktur data aplikasi ke siapa pun yang
# tahu URL-nya — tanpa perlu login. Untuk aplikasi internal/dev
# ini berguna, tapi untuk platform ujian yang sudah live di
# internet, sebaiknya tidak diekspos ke publik.
#
# Di mode "development" (run.py) & "server" (run_server.py, demo
# LAN) dokumentasi tetap aktif seperti biasa supaya masih bisa
# dipakai coba-coba endpoint. Hanya saat APP_MODE=production
# (Docker/Procfile) ketiganya dimatikan sekaligus dengan
# menyetel None — cara resmi FastAPI untuk menonaktifkannya.
# ==========================================

_docs_enabled = APP_MODE != "production"

app = FastAPI(
    title="TZ Login API",

    description=(
        "React + FastAPI + SQLite "
        "Authentication System"
    ),

    version="2.0.0",

    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)


# ==========================================
# CORS
# ==========================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=ALLOWED_ORIGINS,

    # Tambahan: izinkan juga origin manapun yang berasal dari IP
    # jaringan lokal (192.168.x.x / 10.x.x.x / 172.16-31.x.x), supaya
    # laptop/HP lain di WiFi yang sama otomatis bisa mengakses API
    # tanpa perlu admin menambahkan IP itu satu-satu ke CORS_ORIGINS
    # tiap kali ganti jaringan. Lihat config.py untuk detail regex-nya.
    allow_origin_regex=CORS_ORIGIN_REGEX,

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]
)


# ==========================================
# ROUTERS
# ==========================================

app.include_router(
    auth.router
)

app.include_router(
    users.router
)

app.include_router(
    admin.router
)

app.include_router(
    subjects.router
)

app.include_router(
    questions.router
)

app.include_router(
    tryouts.router 
) 

app.include_router(
    student.router                  
)

app.include_router(
    students.router
)

app.include_router(
    teachers.router
)

app.include_router(
    teacher.router
)

app.include_router(
    system.router
)

app.include_router(
    settings.router
)


# ==========================================
# TERJEMAHAN PESAN VALIDASI (PYDANTIC)
#
# Secara default, kalau data yang dikirim gagal validasi
# (field kosong, kepanjangan, tipe salah, dll), FastAPI/
# Pydantic membalas dengan pesan berbahasa Inggris seperti
# "field required" atau "String should have at least 1
# character". Handler ini menerjemahkannya ke Bahasa
# Indonesia supaya konsisten dengan pesan error lain di
# aplikasi, dan mengembalikan `detail` sebagai satu string
# (bukan array) supaya langsung terbaca oleh frontend.
# ==========================================

def _translate_validation_error(err: dict) -> str:

    # Nama field yang gagal validasi, mis. "username",
    # "full_name". Elemen "body"/"query"/"path" di awal
    # loc dilewati karena bukan nama field.
    loc = [
        str(part) for part in err.get("loc", [])
        if part not in ("body", "query", "path", "header")
    ]

    field = loc[-1] if loc else "Data"

    err_type = err.get("type", "")
    ctx = err.get("ctx", {})

    if "missing" in err_type:
        return f"{field} wajib diisi"

    if "too_short" in err_type or "min_length" in err_type:
        min_len = ctx.get("min_length") or ctx.get("limit_value")
        if min_len:
            return f"{field} minimal {min_len} karakter"
        return f"{field} terlalu pendek"

    if "too_long" in err_type or "max_length" in err_type:
        max_len = ctx.get("max_length") or ctx.get("limit_value")
        if max_len:
            return f"{field} maksimal {max_len} karakter"
        return f"{field} terlalu panjang"

    if "int_parsing" in err_type or "int_type" in err_type:
        return f"{field} harus berupa angka"

    if "float_parsing" in err_type or "float_type" in err_type:
        return f"{field} harus berupa angka"

    if "bool_parsing" in err_type or "bool_type" in err_type:
        return f"{field} harus bernilai benar/salah"

    if "enum" in err_type:
        return f"{field} berisi pilihan yang tidak valid"

    if "email" in err_type:
        return f"{field} harus berupa email yang valid"

    if "json_invalid" in err_type or "json_type" in err_type:
        return "Format data yang dikirim tidak valid"

    # Fallback: tetap tampilkan nama field supaya jelas
    # bagian mana yang bermasalah, meski pesan detailnya
    # dari Pydantic tidak dikenali secara spesifik di atas.
    return f"{field} tidak valid"


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
):

    messages = [
        _translate_validation_error(err)
        for err in exc.errors()
    ]

    # Hilangkan duplikat sambil tetap menjaga urutan.
    unique_messages = list(dict.fromkeys(messages))

    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(unique_messages)},
    )

# ==========================================
# ROOT
# ==========================================

@app.get("/")
def root():

    return {
        "message": "TZ Login API berjalan",
        "version": "2.0.0"
    }