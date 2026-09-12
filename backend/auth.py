import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException
from jose import jwt
from sqlalchemy.orm import Session

import config
from config import (
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from models import AppSetting


# ==========================================
# SECRET_KEY DINAMIS (disimpan di database)
#
# SECRET_KEY dipakai untuk menandatangani JWT (login) DAN
# menurunkan kunci enkripsi setting sensitif lain (lihat
# ai_providers.py). Supaya admin bisa menggantinya kapan saja
# dari halaman Pengaturan tanpa edit file .env / restart server,
# nilai yang benar-benar dipakai runtime disimpan di tabel
# t_app_setting, bukan dibaca sekali saat proses start seperti
# konstanta biasa.
#
# KONSEKUENSI PENTING (disengaja, bukan bug):
# Mengganti/merotasi SECRET_KEY membuat SEMUA token JWT yang
# sudah terbit (siapa pun yang sedang login, termasuk admin yang
# melakukan penggantian) langsung tidak valid lagi. Ini perilaku
# yang benar untuk operasi keamanan seperti ini — bukan diam-diam
# dibiarkan lolos.
# ==========================================

SECRET_KEY_SETTING_KEY = "auth:secret_key"
SECRET_KEY_CHANGED_BY_SETTING_KEY = "auth:secret_key:changed_by"

MIN_SECRET_KEY_LENGTH = 32


def generate_secret_key() -> str:
    """Key acak yang aman secara kriptografis untuk tombol 'Rotasi'."""
    return secrets.token_urlsafe(64)


def get_active_secret_key(db: Session) -> str:
    """
    Mengambil SECRET_KEY yang SEDANG aktif dipakai aplikasi.

    Urutan prioritas:
    1. Nilai tersimpan di t_app_setting (sumber kebenaran utama
       setelah bootstrap_secret_key() pernah berjalan).
    2. Fallback ke config.SECRET_KEY (.env) — seharusnya cuma
       kepakai sesaat sebelum bootstrap sempat jalan.
    """

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == SECRET_KEY_SETTING_KEY)
        .first()
    )

    if setting and setting.value.strip():
        return setting.value.strip()

    if config.SECRET_KEY:
        return config.SECRET_KEY

    raise RuntimeError(
        "SECRET_KEY belum tersedia sama sekali (bootstrap belum "
        "berjalan). Ini seharusnya tidak terjadi — restart server."
    )


def bootstrap_secret_key(db: Session) -> None:
    """
    Dipanggil SEKALI saat aplikasi start (lihat main.py) untuk
    memastikan selalu ada SECRET_KEY tersimpan di database, supaya
    instalasi baru tidak wajib mengisi .env sama sekali.

    - Sudah ada di database -> tidak melakukan apa-apa (nilai di
      .env, kalau ada, diabaikan sepenuhnya).
    - Belum ada tapi .env berisi SECRET_KEY -> dipindahkan
      (migrasi) apa adanya ke database, supaya upgrade dari versi
      lama tidak mendadak membuat semua akun ter-logout.
    - Keduanya kosong (instalasi baru) -> generate key acak baru.
    """

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == SECRET_KEY_SETTING_KEY)
        .first()
    )

    if setting and setting.value.strip():
        return

    value = config.SECRET_KEY or generate_secret_key()

    if setting:
        setting.value = value
    else:
        db.add(AppSetting(key=SECRET_KEY_SETTING_KEY, value=value))

    db.commit()


def set_secret_key(
    db: Session,
    new_value: str,
    changed_by: str | None = None,
) -> None:
    """
    Mengganti SECRET_KEY aktif (dipakai endpoint 'Simpan' & 'Rotasi'
    di Pengaturan > Keamanan). Menyimpan juga siapa & kapan terakhir
    diganti untuk ditampilkan di UI (kapan diambil dari
    AppSetting.updated_at, otomatis ter-update lewat onupdate).

    Tidak melakukan commit — caller (endpoint) yang bertanggung
    jawab commit, supaya bisa digabung dalam satu transaksi kalau
    perlu.
    """

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == SECRET_KEY_SETTING_KEY)
        .first()
    )

    if setting:
        setting.value = new_value
    else:
        db.add(AppSetting(key=SECRET_KEY_SETTING_KEY, value=new_value))

    changed_by_setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == SECRET_KEY_CHANGED_BY_SETTING_KEY)
        .first()
    )

    label = changed_by or "-"

    if changed_by_setting:
        changed_by_setting.value = label
    else:
        db.add(
            AppSetting(
                key=SECRET_KEY_CHANGED_BY_SETTING_KEY,
                value=label,
            )
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
    db: Session,
    expires_delta: timedelta | None = None
):
    """
    db WAJIB diisi karena SECRET_KEY sekarang dibaca dinamis dari
    database (lihat get_active_secret_key()), bukan konstanta yang
    di-load sekali saat proses start.
    """

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
        get_active_secret_key(db),
        algorithm=ALGORITHM
    )