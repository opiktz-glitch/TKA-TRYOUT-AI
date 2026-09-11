from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Subject, User, Question, Tryout
from schemas import (
    SubjectCreate,
    SubjectUpdate,
    SubjectResponse
)
from dependencies import require_role


router = APIRouter(
    prefix="/api/subjects",
    tags=["Subjects"]
)


# =========================================================
# GET ALL SUBJECTS
# =========================================================

@router.get("", response_model=list[SubjectResponse])
def get_subjects(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU", "SISWA")
    )
):
    return (
        db.query(Subject)
        .order_by(Subject.id.desc())
        .all()
    )


# =========================================================
# GET SUBJECT BY ID
# =========================================================

@router.get("/{subject_id}", response_model=SubjectResponse)
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):
    subject = (
        db.query(Subject)
        .filter(Subject.id == subject_id)
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Mata pelajaran tidak ditemukan"
        )

    return subject


# =========================================================
# CREATE SUBJECT
# =========================================================

@router.post("", response_model=SubjectResponse)
def create_subject(
    subject_data: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    code = subject_data.code.strip().upper()
    name = subject_data.name.strip()

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Kode mata pelajaran wajib diisi"
        )

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Nama mata pelajaran wajib diisi"
        )

    existing_subject = (
        db.query(Subject)
        .filter(Subject.code == code)
        .first()
    )

    if existing_subject:
        raise HTTPException(
            status_code=400,
            detail="Kode mata pelajaran sudah digunakan"
        )

    subject = Subject(
        code=code,
        name=name,
        description=subject_data.description,
        is_active=subject_data.is_active
    )

    db.add(subject)
    db.commit()
    db.refresh(subject)

    return subject


# =========================================================
# UPDATE SUBJECT
# =========================================================

@router.put(
    "/{subject_id}",
    response_model=SubjectResponse
)
def update_subject(
    subject_id: int,
    subject_data: SubjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    subject = (
        db.query(Subject)
        .filter(Subject.id == subject_id)
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Mata pelajaran tidak ditemukan"
        )

    code = subject_data.code.strip().upper()
    name = subject_data.name.strip()

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Kode mata pelajaran wajib diisi"
        )

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Nama mata pelajaran wajib diisi"
        )

    existing_subject = (
        db.query(Subject)
        .filter(
            Subject.code == code,
            Subject.id != subject_id
        )
        .first()
    )

    if existing_subject:
        raise HTTPException(
            status_code=400,
            detail="Kode mata pelajaran sudah digunakan"
        )

    subject.code = code
    subject.name = name
    subject.description = subject_data.description
    subject.is_active = subject_data.is_active

    db.commit()
    db.refresh(subject)

    return subject


# =========================================================
# DELETE SUBJECT
# =========================================================

@router.delete("/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    subject = (
        db.query(Subject)
        .filter(Subject.id == subject_id)
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Mata pelajaran tidak ditemukan"
        )

    # -----------------------------------------------------
    # Cegah menghapus subject yang masih dipakai soal
    # -----------------------------------------------------

    question_count = (
        db.query(Question)
        .filter(Question.subject_id == subject.id)
        .count()
    )

    if question_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Mata pelajaran tidak dapat dihapus karena masih "
                f"memiliki {question_count} soal. Hapus atau pindahkan "
                "soal tersebut terlebih dahulu."
            )
        )

    # -----------------------------------------------------
    # Cegah menghapus subject yang masih dipakai tryout
    # -----------------------------------------------------

    tryout_count = (
        db.query(Tryout)
        .filter(Tryout.subject_id == subject.id)
        .count()
    )

    if tryout_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Mata pelajaran tidak dapat dihapus karena masih "
                f"digunakan oleh {tryout_count} tryout. Hapus tryout "
                "tersebut terlebih dahulu."
            )
        )

    db.delete(subject)
    db.commit()

    return {
        "success": True,
        "message": "Mata pelajaran berhasil dihapus"
    }