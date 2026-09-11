from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException
from jose import jwt

from config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES
)


# ==========================================
# PASSWORD
#
# Pakai library "bcrypt" langsung, TANPA passlib.
#
# Alasan: passlib (rilis terakhir 1.7.4, tahun 2020, sudah
# tidak di-maintain) melakukan deteksi versi backend lewat
# atribut bcrypt.__about__ yang sudah dihapus di bcrypt>=5.0.
# Ini bikin proses login CRASH (500 error) dengan pesan
# error yang menyesatkan ("password cannot be longer than
# 72 bytes") padahal akar masalahnya bukan soal panjang
# password sama sekali. Memanggil bcrypt langsung
# menghilangkan lapisan passlib itu sepenuhnya, sehingga
# bebas dari kelas bug ini untuk versi bcrypt berapa pun ke
# depannya.
#
# Hash yang sudah tersimpan di database TETAP KOMPATIBEL —
# passlib dulu juga memakai bcrypt di baliknya dan
# menghasilkan hash berformat bcrypt standar ($2b$...), jadi
# tidak perlu migrasi data / reset password user manapun.
# ==========================================

# Batas keras bcrypt: hanya 72 byte pertama dari password
# yang benar-benar dipakai untuk hashing. Divalidasi secara
# eksplisit di sini (bukan dibiarkan terpotong diam-diam)
# supaya user dapat pesan error yang jelas, bukan perilaku
# yang membingungkan seperti kasus ProtonMail yang pernah
# jadi kontroversi karena diam-diam memotong password.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:

    password_bytes = password.encode("utf-8")

    if len(password_bytes) > MAX_PASSWORD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Password terlalu panjang "
                f"(maksimal {MAX_PASSWORD_BYTES} karakter)"
            )
        )

    hashed = bcrypt.hashpw(
        password_bytes,
        bcrypt.gensalt()
    )

    return hashed.decode("utf-8")


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:

    password_bytes = plain_password.encode("utf-8")

    # Password lebih dari 72 byte otomatis dianggap tidak
    # cocok (bukan error) — supaya alur login tetap membalas
    # "salah" seperti biasa, bukan crash.
    if len(password_bytes) > MAX_PASSWORD_BYTES:
        return False

    return bcrypt.checkpw(
        password_bytes,
        hashed_password.encode("utf-8")
    )


# ==========================================
# JWT
# ==========================================

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None
):

    to_encode = data.copy()


    if expires_delta:

        expire = (
            datetime.now(timezone.utc)
            + expires_delta
        )

    else:

        expire = (
            datetime.now(timezone.utc)
            + timedelta(
                minutes=ACCESS_TOKEN_EXPIRE_MINUTES
            )
        )


    to_encode.update({
        "exp": expire
    })


    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )