from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Tryout,
    TryoutQuestion,
    Question,
    Subject,
    User,
    Attempt,
)
from schemas import TryoutCreate, TryoutUpdate
from dependencies import require_role


router = APIRouter(
    prefix="/api/tryouts",
    tags=["Tryouts"]
)


ALLOWED_DIFFICULTIES = [
    "EASY",
    "MEDIUM",
    "HARD"
]


# =========================================================
# VALIDASI DATA TRYOUT
# =========================================================

def validate_tryout_data(data):

    if not data.title or not data.title.strip():
        raise HTTPException(
            status_code=400,
            detail="Judul tryout wajib diisi"
        )

    if data.duration_minutes <= 0:
        raise HTTPException(
            status_code=400,
            detail="Durasi harus lebih dari 0 menit"
        )

    if data.max_score <= 0:
        raise HTTPException(
            status_code=400,
            detail="Nilai maksimal harus lebih dari 0"
        )

    if (
        data.difficulty is not None
        and data.difficulty not in ALLOWED_DIFFICULTIES
    ):
        raise HTTPException(
            status_code=400,
            detail="Difficulty harus EASY, MEDIUM, atau HARD"
        )

    question_ids = set()
    question_numbers = set()

    for item in data.questions:

        # Cek soal duplikat
        if item.question_id in question_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Soal ID {item.question_id} "
                    "dipilih lebih dari sekali"
                )
            )

        question_ids.add(item.question_id)

        # Cek nomor soal duplikat
        if item.question_number in question_numbers:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Nomor soal {item.question_number} "
                    "digunakan lebih dari sekali"
                )
            )

        question_numbers.add(item.question_number)

        if item.question_number <= 0:
            raise HTTPException(
                status_code=400,
                detail="Nomor soal harus lebih dari 0"
            )

        if item.points <= 0:
            raise HTTPException(
                status_code=400,
                detail="Point soal harus lebih dari 0"
            )


# =========================================================
# GET SEMUA TRYOUT
# =========================================================

@router.get("")
def get_tryouts(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    tryouts = (
        db.query(Tryout)
        .order_by(Tryout.id.desc())
        .all()
    )

    result = []

    for tryout in tryouts:

        questions = (
            db.query(TryoutQuestion)
            .filter(
                TryoutQuestion.tryout_id == tryout.id
            )
            .order_by(
                TryoutQuestion.question_number
            )
            .all()
        )

        result.append({
            "id": tryout.id,
            "title": tryout.title,
            "description": tryout.description,
            "subject_id": tryout.subject_id,
            "grade": tryout.grade,
            "duration_minutes": tryout.duration_minutes,
            "total_questions": tryout.total_questions,
            "max_score": tryout.max_score,
            "difficulty": tryout.difficulty,
            "created_by": tryout.created_by,
            "is_active": tryout.is_active,
            "questions": questions
        })

    return result


# =========================================================
# GET TRYOUT DETAIL
# =========================================================

@router.get("/{tryout_id}")
def get_tryout(
    tryout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    tryout = (
        db.query(Tryout)
        .filter(Tryout.id == tryout_id)
        .first()
    )

    if not tryout:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan"
        )

    questions = (
        db.query(TryoutQuestion)
        .filter(
            TryoutQuestion.tryout_id == tryout.id
        )
        .order_by(
            TryoutQuestion.question_number
        )
        .all()
    )

    return {
        "id": tryout.id,
        "title": tryout.title,
        "description": tryout.description,
        "subject_id": tryout.subject_id,
        "grade": tryout.grade,
        "duration_minutes": tryout.duration_minutes,
        "total_questions": tryout.total_questions,
        "max_score": tryout.max_score,
        "difficulty": tryout.difficulty,
        "created_by": tryout.created_by,
        "is_active": tryout.is_active,
        "questions": questions
    }


# =========================================================
# GET SOAL YANG TERSEDIA
# =========================================================
# ROUTE INI HARUS SEBELUM /{tryout_id}

@router.get("/available/questions")
def get_available_questions(
    subject_id: int,
    difficulty: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    query = (
        db.query(Question)
        .filter(
            Question.subject_id == subject_id,
            Question.is_active == True
        )
    )

    if difficulty:

        if difficulty not in ALLOWED_DIFFICULTIES:
            raise HTTPException(
                status_code=400,
                detail="Difficulty tidak valid"
            )

        query = query.filter(
            Question.difficulty == difficulty
        )

    return (
        query
        .order_by(Question.id.desc())
        .all()
    )


# =========================================================
# CREATE TRYOUT
# =========================================================

@router.post("")
def create_tryout(
    data: TryoutCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    validate_tryout_data(data)

    # -----------------------------------------------------
    # Cek subject
    # -----------------------------------------------------

    subject = (
        db.query(Subject)
        .filter(Subject.id == data.subject_id)
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Mata pelajaran tidak ditemukan"
        )

    if not subject.is_active:
        raise HTTPException(
            status_code=400,
            detail="Mata pelajaran tidak aktif"
        )

    # -----------------------------------------------------
    # Cek soal
    # -----------------------------------------------------

    question_ids = [
        item.question_id
        for item in data.questions
    ]

    if question_ids:

        questions = (
            db.query(Question)
            .filter(
                Question.id.in_(question_ids),
                Question.is_active == True
            )
            .all()
        )

        if len(questions) != len(question_ids):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Ada soal yang tidak ditemukan "
                    "atau tidak aktif"
                )
            )

        invalid_questions = [
            q.id
            for q in questions
            if q.subject_id != data.subject_id
        ]

        if invalid_questions:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Ada soal yang tidak sesuai "
                    "dengan mata pelajaran tryout: "
                    + str(invalid_questions)
                )
            )

    # -----------------------------------------------------
    # Buat TRYOUT
    # -----------------------------------------------------

    tryout = Tryout(
        title=data.title.strip(),
        description=data.description,
        subject_id=data.subject_id,
        grade=data.grade,
        duration_minutes=data.duration_minutes,
        total_questions=len(data.questions),
        max_score=data.max_score,
        difficulty=data.difficulty,
        created_by=current_user.id,
        is_active=data.is_active
    )

    db.add(tryout)
    db.flush()

    # -----------------------------------------------------
    # Tambahkan soal
    # -----------------------------------------------------

    for item in data.questions:

        tryout_question = TryoutQuestion(
            tryout_id=tryout.id,
            question_id=item.question_id,
            question_number=item.question_number,
            points=item.points
        )

        db.add(tryout_question)

    db.commit()
    db.refresh(tryout)

    return {
        "success": True,
        "message": "Tryout berhasil dibuat",
        "id": tryout.id
    }


# =========================================================
# UPDATE TRYOUT
# =========================================================

@router.put("/{tryout_id}")
def update_tryout(
    tryout_id: int,
    data: TryoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    validate_tryout_data(data)

    tryout = (
        db.query(Tryout)
        .filter(Tryout.id == tryout_id)
        .first()
    )

    if not tryout:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan"
        )

    # -----------------------------------------------------
    # Cek subject
    # -----------------------------------------------------

    subject = (
        db.query(Subject)
        .filter(Subject.id == data.subject_id)
        .first()
    )

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Mata pelajaran tidak ditemukan"
        )

    if not subject.is_active:
        raise HTTPException(
            status_code=400,
            detail="Mata pelajaran tidak aktif"
        )

    # -----------------------------------------------------
    # Cek soal
    # -----------------------------------------------------

    question_ids = [
        item.question_id
        for item in data.questions
    ]

    if question_ids:

        questions = (
            db.query(Question)
            .filter(
                Question.id.in_(question_ids),
                Question.is_active == True
            )
            .all()
        )

        if len(questions) != len(question_ids):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Ada soal yang tidak ditemukan "
                    "atau tidak aktif"
                )
            )

        invalid_questions = [
            q.id
            for q in questions
            if q.subject_id != data.subject_id
        ]

        if invalid_questions:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Ada soal yang tidak sesuai "
                    "dengan mata pelajaran tryout: "
                    + str(invalid_questions)
                )
            )

    # -----------------------------------------------------
    # Update data TRYOUT
    # -----------------------------------------------------

    tryout.title = data.title.strip()
    tryout.description = data.description
    tryout.subject_id = data.subject_id
    tryout.grade = data.grade
    tryout.duration_minutes = data.duration_minutes
    tryout.total_questions = len(data.questions)
    tryout.max_score = data.max_score
    tryout.difficulty = data.difficulty
    tryout.is_active = data.is_active

    # -----------------------------------------------------
    # Hapus soal lama
    # -----------------------------------------------------

    db.query(TryoutQuestion).filter(
        TryoutQuestion.tryout_id == tryout.id
    ).delete(
        synchronize_session=False
    )

    # -----------------------------------------------------
    # Masukkan soal baru
    # -----------------------------------------------------

    for item in data.questions:

        db.add(
            TryoutQuestion(
                tryout_id=tryout.id,
                question_id=item.question_id,
                question_number=item.question_number,
                points=item.points
            )
        )

    db.commit()

    return {
        "success": True,
        "message": "Tryout berhasil diperbarui"
    }


# =========================================================
# DELETE TRYOUT
# =========================================================

@router.delete("/{tryout_id}")
def delete_tryout(
    tryout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):

    tryout = (
        db.query(Tryout)
        .filter(Tryout.id == tryout_id)
        .first()
    )

    if not tryout:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan"
        )

    # -----------------------------------------------------
    # Jangan hapus tryout yang sudah dikerjakan siswa
    # -----------------------------------------------------

    attempt = (
        db.query(Attempt)
        .filter(
            Attempt.tryout_id == tryout.id
        )
        .first()
    )

    if attempt:

        raise HTTPException(
            status_code=400,
            detail=(
                "Tryout tidak dapat dihapus "
                "karena sudah pernah dikerjakan siswa"
            )
        )

    # -----------------------------------------------------
    # Hapus relasi soal
    # -----------------------------------------------------

    db.query(TryoutQuestion).filter(
        TryoutQuestion.tryout_id == tryout.id
    ).delete(
        synchronize_session=False
    )

    # -----------------------------------------------------
    # Hapus tryout
    # -----------------------------------------------------

    db.delete(tryout)
    db.commit()

    return {
        "success": True,
        "message": "Tryout berhasil dihapus"
    }