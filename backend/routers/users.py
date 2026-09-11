from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Student, Teacher, Attempt, Tryout, Question
from schemas import (
    UserCreate,
    UserUpdate,
    UserResponse,
    PasswordReset
)
from auth import hash_password
from dependencies import require_role


router = APIRouter(
    prefix="/api/users",
    tags=["Users"]
)


# =========================================================
# CREATE USER
# =========================================================

@router.post("", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    allowed_roles = ["ADMIN", "GURU", "SISWA"]

    if user_data.role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail="Role tidak valid"
        )

    existing_user = db.query(User).filter(
        User.username == user_data.username
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username sudah digunakan"
        )

    new_user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
        is_active=user_data.is_active
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


# =========================================================
# GET ALL USERS
# =========================================================

@router.get("", response_model=list[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    return db.query(User).all()


# =========================================================
# GET USER BY ID
# =========================================================

@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User tidak ditemukan"
        )

    return user


# =========================================================
# RESET PASSWORD USER OLEH ADMIN
# =========================================================

@router.put("/{user_id}/password")
def reset_user_password(
    user_id: int,
    password_data: PasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    # -----------------------------------------------------
    # Cari user
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User tidak ditemukan"
        )

    # -----------------------------------------------------
    # Validasi password
    # -----------------------------------------------------

    if len(password_data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password minimal 8 karakter"
        )

    # -----------------------------------------------------
    # Hash password baru
    # -----------------------------------------------------

    user.password_hash = hash_password(
        password_data.new_password
    )

    db.commit()

    return {
        "success": True,
        "message": "Password berhasil diubah"
    }


# =========================================================
# UPDATE USER
# =========================================================

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    allowed_roles = ["ADMIN", "GURU", "SISWA"]

    if user_data.role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail="Role tidak valid"
        )

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User tidak ditemukan"
        )

    # -----------------------------------------------------
    # Cegah ADMIN menonaktifkan dirinya sendiri
    # -----------------------------------------------------

    if user.id == current_user.id and not user_data.is_active:
        raise HTTPException(
            status_code=400,
            detail="ADMIN tidak dapat menonaktifkan akun sendiri"
        )

    # -----------------------------------------------------
    # Cegah ADMIN mengubah dirinya menjadi non-ADMIN
    # jika dirinya adalah ADMIN terakhir
    # -----------------------------------------------------

    if user.id == current_user.id and user_data.role != "ADMIN":

        admin_count = db.query(User).filter(
            User.role == "ADMIN",
            User.is_active == True
        ).count()

        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Tidak dapat mengubah role ADMIN terakhir"
            )

    # -----------------------------------------------------
    # Cek username
    # -----------------------------------------------------

    if user.username != user_data.username:

        existing_user = db.query(User).filter(
            User.username == user_data.username
        ).first()

        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Username sudah digunakan"
            )

    # -----------------------------------------------------
    # Jika user adalah ADMIN terakhir,
    # jangan izinkan akun menjadi inactive
    # -----------------------------------------------------

    if user.role == "ADMIN" and user.is_active:

        if not user_data.is_active:

            admin_count = db.query(User).filter(
                User.role == "ADMIN",
                User.is_active == True
            ).count()

            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Tidak dapat menonaktifkan ADMIN terakhir"
                )

    # -----------------------------------------------------
    # Update
    # -----------------------------------------------------

    user.username = user_data.username
    user.full_name = user_data.full_name
    user.role = user_data.role
    user.is_active = user_data.is_active

    db.commit()
    db.refresh(user)

    return user


# =========================================================
# DELETE USER
# =========================================================

@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User tidak ditemukan"
        )

    # -----------------------------------------------------
    # Cegah ADMIN menghapus dirinya sendiri
    # -----------------------------------------------------

    if user.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="ADMIN tidak dapat menghapus akun sendiri"
        )

    # -----------------------------------------------------
    # Cegah menghapus ADMIN terakhir
    # -----------------------------------------------------

    if user.role == "ADMIN":

        admin_count = db.query(User).filter(
            User.role == "ADMIN",
            User.is_active == True
        ).count()

        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Tidak dapat menghapus ADMIN terakhir"
            )

    # -----------------------------------------------------
    # Cegah menghapus user yang masih punya profil siswa
    # Kalau profilnya masih ada, siswa masih bisa punya
    # attempt (t_student.user_id akan jadi yatim kalau
    # user-nya dihapus duluan)
    # -----------------------------------------------------

    student = (
        db.query(Student)
        .filter(Student.user_id == user.id)
        .first()
    )

    if student:

        attempt_count = (
            db.query(Attempt)
            .filter(Attempt.student_id == student.id)
            .count()
        )

        if attempt_count > 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    "User tidak dapat dihapus karena siswa "
                    f"\"{student.full_name}\" masih memiliki "
                    f"{attempt_count} riwayat pengerjaan tryout (attempt)."
                )
            )

        raise HTTPException(
            status_code=400,
            detail=(
                "User tidak dapat dihapus karena masih memiliki profil "
                f"siswa \"{student.full_name}\". Hapus data siswa "
                "tersebut terlebih dahulu."
            )
        )

    # -----------------------------------------------------
    # Cegah menghapus user yang masih punya profil guru
    # -----------------------------------------------------

    teacher = (
        db.query(Teacher)
        .filter(Teacher.user_id == user.id)
        .first()
    )

    if teacher:
        raise HTTPException(
            status_code=400,
            detail=(
                "User tidak dapat dihapus karena masih memiliki profil "
                f"guru \"{teacher.full_name}\". Hapus data guru "
                "tersebut terlebih dahulu."
            )
        )

    # -----------------------------------------------------
    # Cegah menghapus user yang masih tercatat sebagai
    # pembuat tryout (t_tryout.created_by Not Null)
    # -----------------------------------------------------

    tryout_count = (
        db.query(Tryout)
        .filter(Tryout.created_by == user.id)
        .count()
    )

    if tryout_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "User tidak dapat dihapus karena masih tercatat sebagai "
                f"pembuat {tryout_count} tryout."
            )
        )

    # -----------------------------------------------------
    # Cegah menghapus user yang masih tercatat sebagai
    # pembuat soal (t_question.created_by)
    # -----------------------------------------------------

    question_count = (
        db.query(Question)
        .filter(Question.created_by == user.id)
        .count()
    )

    if question_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "User tidak dapat dihapus karena masih tercatat sebagai "
                f"pembuat {question_count} soal."
            )
        )

    # -----------------------------------------------------
    # Delete
    # -----------------------------------------------------

    db.delete(user)
    db.commit()

    return {
        "success": True,
        "message": "User berhasil dihapus"
    }


