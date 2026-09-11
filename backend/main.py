
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

import models

from database import Base, engine
from config import ALLOWED_ORIGINS

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


Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TZ Login API",

    description=(
        "React + FastAPI + SQLite "
        "Authentication System"
    ),

    version="2.0.0"
)


# ==========================================
# CORS
# ==========================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=ALLOWED_ORIGINS,

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