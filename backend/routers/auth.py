from datetime import timedelta, datetime

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from database import get_db

from models import User

from schemas import (
    LoginRequest,
    LoginResponse,
    UserResponse,
    ChangePassword,
    MyProfileUpdate
)

from auth import (
    verify_password,
    create_access_token,
    hash_password
)

from dependencies import get_current_user

from config import ACCESS_TOKEN_EXPIRE_MINUTES


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


# ==========================================
# RATE LIMITING LOGIN (sederhana, in-memory)
#
# Catatan: penyimpanan di memori proses, jadi
# akan reset kalau server di-restart dan tidak
# terbagi antar banyak instance server. Untuk
# skala produksi yang lebih besar, pertimbangkan
# slowapi + Redis.
# ==========================================

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

_failed_attempts: dict[str, list[datetime]] = {}


def _get_recent_failures(key: str) -> list[datetime]:
    cutoff = datetime.utcnow() - timedelta(minutes=LOCKOUT_MINUTES)
    attempts = _failed_attempts.get(key, [])
    attempts = [t for t in attempts if t > cutoff]
    _failed_attempts[key] = attempts
    return attempts


def _register_failure(key: str):
    _failed_attempts.setdefault(key, []).append(datetime.utcnow())


def _reset_failures(key: str):
    _failed_attempts.pop(key, None)


# ==========================================
# LOGIN
# ==========================================

@router.post(
    "/login",
    response_model=LoginResponse
)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):

    limiter_key = login_data.username.lower()

    recent_failures = _get_recent_failures(limiter_key)

    if len(recent_failures) >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Terlalu banyak percobaan login gagal. "
                f"Coba lagi dalam {LOCKOUT_MINUTES} menit."
            )
        )

    user = (
        db.query(User)
        .filter(
            User.username
            == login_data.username
        )
        .first()
    )


    if not user:

        _register_failure(limiter_key)

        return LoginResponse(
            success=False,
            message="salah"
        )


    if not user.is_active:

        return LoginResponse(
            success=False,
            message="User tidak aktif"
        )


    if not verify_password(
        login_data.password,
        user.password_hash
    ):

        _register_failure(limiter_key)

        return LoginResponse(
            success=False,
            message="salah"
        )


    _reset_failures(limiter_key)

    expires = timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )


    token = create_access_token(
    data={
        "sub": user.username,
        "role": user.role
    },
        expires_delta=expires
    )


    return LoginResponse(
        success=True,
        message="Login berhasil",
        access_token=token,
        token_type="bearer"
    )


# ==========================================
# CURRENT USER
# ==========================================

@router.get(
    "/me",
    response_model=UserResponse
)
def me(
    current_user: User = Depends(
        get_current_user
    )
):

    return current_user


# =========================================================
# UPDATE PROFIL AKUN SENDIRI (NAMA TAMPILAN)
#
# Berlaku untuk semua role (ADMIN, GURU, SISWA) — hanya
# mengubah t_user.full_name milik akun yang sedang login.
# =========================================================

@router.put("/profile", response_model=UserResponse)
def update_my_account_profile(
    profile_data: MyProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.full_name = profile_data.full_name.strip()

    db.commit()
    db.refresh(current_user)

    return current_user


# =========================================================
# CHANGE PASSWORD USER SENDIRI
# =========================================================

@router.put("/change-password")
def change_password(
    password_data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # -----------------------------------------------------
    # Validasi password baru
    # -----------------------------------------------------

    if len(password_data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password baru minimal 8 karakter"
        )

    # -----------------------------------------------------
    # Verifikasi password lama
    # -----------------------------------------------------

    if not verify_password(
        password_data.current_password,
        current_user.password_hash
    ):
        raise HTTPException(
            status_code=400,
            detail="Password lama tidak benar"
        )

    # -----------------------------------------------------
    # Pastikan password baru berbeda
    # -----------------------------------------------------

    if verify_password(
        password_data.new_password,
        current_user.password_hash
    ):
        raise HTTPException(
            status_code=400,
            detail="Password baru harus berbeda dengan password lama"
        )

    # -----------------------------------------------------
    # Hash password baru
    # -----------------------------------------------------

    current_user.password_hash = hash_password(
        password_data.new_password
    )

    db.commit()

    return {
        "success": True,
        "message": "Password berhasil diubah"
    }