from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Teacher
from schemas import TeacherCreate, TeacherUpdate
from dependencies import require_role


router = APIRouter(
    prefix="/api/teachers",
    tags=["Teachers"]
)


# =========================================================
# HELPER — bentuk response dict (gabungan Teacher + User)
# =========================================================

def serialize_teacher(teacher: Teacher, user: User | None):
    return {
        "id": teacher.id,
        "user_id": teacher.user_id,
        "teacher_code": teacher.teacher_code,
        "full_name": teacher.full_name,
        "school_name": teacher.school_name,
        "created_at": teacher.created_at,

        "username": user.username if user else None,
        "is_active": user.is_active if user else None,
    }


# =========================================================
# GET USER YANG BELUM PUNYA PROFIL GURU
#
# Dipakai untuk dropdown di form "Tambah Guru" — hanya
# user ber-role GURU yang belum memiliki baris t_teacher
# yang boleh dipilih (karena t_teacher.user_id unik).
# =========================================================

@router.get("/available-users")
def get_available_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    linked_user_ids = [
        row.user_id
        for row in db.query(Teacher.user_id).all()
    ]

    query = db.query(User).filter(User.role == "GURU")

    if linked_user_ids:
        query = query.filter(User.id.notin_(linked_user_ids))

    users = query.order_by(User.username).all()

    return [
        {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "is_active": user.is_active,
        }
        for user in users
    ]


# =========================================================
# GET ALL TEACHERS
# =========================================================

@router.get("")
def get_teachers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    teachers = (
        db.query(Teacher)
        .order_by(Teacher.id.desc())
        .all()
    )

    result = []

    for teacher in teachers:
        user = db.query(User).filter(User.id == teacher.user_id).first()
        result.append(serialize_teacher(teacher, user))

    return result


# =========================================================
# CREATE TEACHER
# =========================================================

@router.post("")
def create_teacher(
    teacher_data: TeacherCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    # -----------------------------------------------------
    # Pastikan user ada dan ber-role GURU
    # -----------------------------------------------------

    user = db.query(User).filter(User.id == teacher_data.user_id).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User tidak ditemukan"
        )

    if user.role != "GURU":
        raise HTTPException(
            status_code=400,
            detail="User yang dipilih bukan GURU"
        )

    # -----------------------------------------------------
    # Pastikan user belum punya profil guru
    # -----------------------------------------------------

    existing = db.query(Teacher).filter(
        Teacher.user_id == teacher_data.user_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="User ini sudah memiliki profil guru"
        )

    # -----------------------------------------------------
    # Pastikan teacher_code belum dipakai
    # -----------------------------------------------------

    existing_code = db.query(Teacher).filter(
        Teacher.teacher_code == teacher_data.teacher_code
    ).first()

    if existing_code:
        raise HTTPException(
            status_code=400,
            detail="Kode guru (NIP) sudah digunakan"
        )

    new_teacher = Teacher(
        user_id=teacher_data.user_id,
        teacher_code=teacher_data.teacher_code,
        full_name=teacher_data.full_name,
        school_name=teacher_data.school_name,
    )

    db.add(new_teacher)
    db.commit()
    db.refresh(new_teacher)

    return {
        "success": True,
        "message": "Data guru berhasil ditambahkan",
        "data": serialize_teacher(new_teacher, user),
    }


# =========================================================
# UPDATE TEACHER
# =========================================================

@router.put("/{teacher_id}")
def update_teacher(
    teacher_id: int,
    teacher_data: TeacherUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()

    if not teacher:
        raise HTTPException(
            status_code=404,
            detail="Data guru tidak ditemukan"
        )

    if teacher.teacher_code != teacher_data.teacher_code:

        existing_code = db.query(Teacher).filter(
            Teacher.teacher_code == teacher_data.teacher_code
        ).first()

        if existing_code:
            raise HTTPException(
                status_code=400,
                detail="Kode guru (NIP) sudah digunakan"
            )

    teacher.teacher_code = teacher_data.teacher_code
    teacher.full_name = teacher_data.full_name
    teacher.school_name = teacher_data.school_name

    db.commit()
    db.refresh(teacher)

    user = db.query(User).filter(User.id == teacher.user_id).first()

    return {
        "success": True,
        "message": "Data guru berhasil diperbarui",
        "data": serialize_teacher(teacher, user),
    }


# =========================================================
# DELETE TEACHER
#
# Catatan: hanya menghapus PROFIL guru (t_teacher).
# Akun login (t_user) tetap ada dan tidak ikut terhapus.
# =========================================================

@router.delete("/{teacher_id}")
def delete_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()

    if not teacher:
        raise HTTPException(
            status_code=404,
            detail="Data guru tidak ditemukan"
        )

    db.delete(teacher)
    db.commit()

    return {
        "success": True,
        "message": "Data guru berhasil dihapus"
    }
