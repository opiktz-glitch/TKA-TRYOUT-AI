from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, Student, Attempt
from schemas import StudentCreate, StudentUpdate
from dependencies import require_role


router = APIRouter(
    prefix="/api/students",
    tags=["Students"]
)


# =========================================================
# HELPER — bentuk response dict (gabungan Student + User)
# =========================================================

def serialize_student(student: Student, user: User | None):
    return {
        "id": student.id,
        "user_id": student.user_id,
        "student_code": student.student_code,
        "full_name": student.full_name,
        "school_name": student.school_name,
        "grade": student.grade,
        "class_name": student.class_name,
        "created_at": student.created_at,

        "username": user.username if user else None,
        "is_active": user.is_active if user else None,
    }


# =========================================================
# GET USER YANG BELUM PUNYA PROFIL SISWA
#
# Dipakai untuk dropdown di form "Tambah Siswa" — hanya
# user ber-role SISWA yang belum memiliki baris t_student
# yang boleh dipilih (karena t_student.user_id unik).
# =========================================================

@router.get("/available-users")
def get_available_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    linked_user_ids = [
        row.user_id
        for row in db.query(Student.user_id).all()
    ]

    query = db.query(User).filter(User.role == "SISWA")

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
# GET ALL STUDENTS
# =========================================================

@router.get("")
def get_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN", "GURU"))
):
    students = (
        db.query(Student)
        .order_by(Student.id.desc())
        .all()
    )

    result = []

    for student in students:
        user = db.query(User).filter(User.id == student.user_id).first()
        result.append(serialize_student(student, user))

    return result


# =========================================================
# CREATE STUDENT
# =========================================================

@router.post("")
def create_student(
    student_data: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    # -----------------------------------------------------
    # Pastikan user ada dan ber-role SISWA
    # -----------------------------------------------------

    user = db.query(User).filter(User.id == student_data.user_id).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User tidak ditemukan"
        )

    if user.role != "SISWA":
        raise HTTPException(
            status_code=400,
            detail="User yang dipilih bukan SISWA"
        )

    # -----------------------------------------------------
    # Pastikan user belum punya profil siswa
    # -----------------------------------------------------

    existing = db.query(Student).filter(
        Student.user_id == student_data.user_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="User ini sudah memiliki profil siswa"
        )

    # -----------------------------------------------------
    # Pastikan student_code belum dipakai
    # -----------------------------------------------------

    existing_code = db.query(Student).filter(
        Student.student_code == student_data.student_code
    ).first()

    if existing_code:
        raise HTTPException(
            status_code=400,
            detail="Kode siswa (NIS) sudah digunakan"
        )

    new_student = Student(
        user_id=student_data.user_id,
        student_code=student_data.student_code,
        full_name=student_data.full_name,
        school_name=student_data.school_name,
        grade=student_data.grade,
        class_name=student_data.class_name,
    )

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    return {
        "success": True,
        "message": "Data siswa berhasil ditambahkan",
        "data": serialize_student(new_student, user),
    }


# =========================================================
# UPDATE STUDENT
# =========================================================

@router.put("/{student_id}")
def update_student(
    student_id: int,
    student_data: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Data siswa tidak ditemukan"
        )

    if student.student_code != student_data.student_code:

        existing_code = db.query(Student).filter(
            Student.student_code == student_data.student_code
        ).first()

        if existing_code:
            raise HTTPException(
                status_code=400,
                detail="Kode siswa (NIS) sudah digunakan"
            )

    student.student_code = student_data.student_code
    student.full_name = student_data.full_name
    student.school_name = student_data.school_name
    student.grade = student_data.grade
    student.class_name = student_data.class_name

    db.commit()
    db.refresh(student)

    user = db.query(User).filter(User.id == student.user_id).first()

    return {
        "success": True,
        "message": "Data siswa berhasil diperbarui",
        "data": serialize_student(student, user),
    }


# =========================================================
# DELETE STUDENT
#
# Catatan: hanya menghapus PROFIL siswa (t_student).
# Akun login (t_user) tetap ada dan tidak ikut terhapus.
# =========================================================

@router.delete("/{student_id}")
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Data siswa tidak ditemukan"
        )

    # -----------------------------------------------------
    # Cegah menghapus siswa yang masih punya attempt
    # (t_attempt.student_id akan jadi yatim kalau
    # data siswa dihapus)
    # -----------------------------------------------------

    attempt_count = (
        db.query(Attempt)
        .filter(Attempt.student_id == student.id)
        .count()
    )

    if attempt_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Data siswa tidak dapat dihapus karena masih memiliki "
                f"{attempt_count} riwayat pengerjaan tryout (attempt)."
            )
        )

    db.delete(student)
    db.commit()

    return {
        "success": True,
        "message": "Data siswa berhasil dihapus"
    }
