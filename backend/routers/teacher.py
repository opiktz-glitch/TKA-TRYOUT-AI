from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_role
from models import (
    User,
    Attempt,
    Student,
    Tryout,
    Subject,
    Result,
    Answer,
    Question,
    TryoutQuestion,
)


router = APIRouter(
    prefix="/api/teacher",
    tags=["Teacher"],
)


# ============================================================
# GET REKAP NILAI
#
# Untuk GURU: hanya menampilkan hasil dari tryout yang dia
# buat sendiri (Tryout.created_by == current_user.id).
# Untuk ADMIN: menampilkan semua tryout, dengan dukungan
# filter tambahan (mata pelajaran & guru pembuat) supaya
# endpoint ini juga bisa dipakai halaman Nilai milik admin.
# ============================================================

@router.get("/scores")
def get_teacher_scores(
    tryout_id: int | None = None,
    subject_id: int | None = None,
    teacher_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN", "GURU")),
):
    query = (
        db.query(Attempt)
        .join(Tryout, Tryout.id == Attempt.tryout_id)
        .filter(Attempt.status != "IN_PROGRESS")
    )

    if current_user.role == "GURU":
        query = query.filter(Tryout.created_by == current_user.id)

    if tryout_id:
        query = query.filter(Attempt.tryout_id == tryout_id)

    if subject_id:
        query = query.filter(Tryout.subject_id == subject_id)

    if teacher_id:
        query = query.filter(Tryout.created_by == teacher_id)

    attempts = (
        query
        .order_by(Attempt.finished_at.desc())
        .all()
    )

    result = []

    for attempt in attempts:

        tryout = (
            db.query(Tryout)
            .filter(Tryout.id == attempt.tryout_id)
            .first()
        )

        if not tryout:
            continue

        student = (
            db.query(Student)
            .filter(Student.id == attempt.student_id)
            .first()
        )

        subject = (
            db.query(Subject)
            .filter(Subject.id == tryout.subject_id)
            .first()
        )

        creator = (
            db.query(User)
            .filter(User.id == tryout.created_by)
            .first()
        )

        attempt_result = (
            db.query(Result)
            .filter(Result.attempt_id == attempt.id)
            .first()
        )

        result.append({
            "attempt_id": attempt.id,

            "student_id": student.id if student else None,
            "student_code": student.student_code if student else None,
            "student_name": student.full_name if student else None,

            "tryout_id": tryout.id,
            "tryout_title": tryout.title,
            "subject_name": subject.name if subject else None,

            "teacher_id": tryout.created_by,
            "teacher_name": creator.full_name if creator else None,

            "finished_at": attempt.finished_at,

            "score": (
                attempt_result.score if attempt_result else attempt.score
            ),
            "max_score": tryout.max_score,
            "percentage": (
                attempt_result.percentage if attempt_result else None
            ),
            "passed": (
                attempt_result.passed if attempt_result else None
            ),

            "correct_count": (
                attempt_result.correct_count
                if attempt_result
                else attempt.correct_count
            ),
            "wrong_count": (
                attempt_result.wrong_count
                if attempt_result
                else attempt.wrong_count
            ),
            "unanswered_count": (
                attempt_result.unanswered_count
                if attempt_result
                else attempt.unanswered_count
            ),
        })

    return result


# ============================================================
# GET DAFTAR PEMBUAT TRYOUT (UNTUK FILTER "GURU PEMBUAT")
#
# Hanya ADMIN yang butuh filter lintas guru, jadi endpoint
# ini dibatasi untuk ADMIN saja.
# ============================================================

@router.get("/creators")
def get_score_creators(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
):
    creators = (
        db.query(User.id, User.full_name)
        .join(Tryout, Tryout.created_by == User.id)
        .distinct()
        .order_by(User.full_name)
        .all()
    )

    return [
        {"id": c.id, "full_name": c.full_name}
        for c in creators
    ]


# ============================================================
# GET LAPORAN ANALITIK PER TRYOUT
#
# Menampilkan: rata-rata skor, skor tertinggi/terendah,
# tingkat lulus, distribusi nilai, dan soal yang paling
# sering dijawab salah — untuk satu tryout tertentu.
#
# Untuk GURU: hanya boleh melihat laporan tryout miliknya
# sendiri (Tryout.created_by == current_user.id).
# Untuk ADMIN: boleh melihat laporan tryout siapa pun.
# ============================================================

DISTRIBUTION_BUCKETS = [
    ("0-20", 0, 20),
    ("21-40", 21, 40),
    ("41-60", 41, 60),
    ("61-80", 61, 80),
    ("81-100", 81, 100),
]


@router.get("/reports/{tryout_id}")
def get_teacher_report(
    tryout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN", "GURU")),
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

    if (
        current_user.role == "GURU"
        and tryout.created_by != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Tidak memiliki hak akses ke tryout ini"
        )

    subject = (
        db.query(Subject)
        .filter(Subject.id == tryout.subject_id)
        .first()
    )

    # --------------------------------------------------------
    # Attempt yang sudah selesai untuk tryout ini
    # --------------------------------------------------------

    attempts = (
        db.query(Attempt)
        .filter(
            Attempt.tryout_id == tryout.id,
            Attempt.status != "IN_PROGRESS",
        )
        .all()
    )

    total_attempts = len(attempts)

    attempt_ids = [a.id for a in attempts]

    results_by_attempt = {}

    if attempt_ids:
        results = (
            db.query(Result)
            .filter(Result.attempt_id.in_(attempt_ids))
            .all()
        )

        results_by_attempt = {r.attempt_id: r for r in results}

    # --------------------------------------------------------
    # Ringkasan skor
    # --------------------------------------------------------

    scores = []
    percentages = []
    passed_count = 0
    passed_known_count = 0

    for attempt in attempts:

        attempt_result = results_by_attempt.get(attempt.id)

        score = (
            attempt_result.score
            if attempt_result and attempt_result.score is not None
            else attempt.score
        )

        if score is not None:
            scores.append(score)

        max_score = tryout.max_score or 100

        percentage = (
            attempt_result.percentage
            if attempt_result and attempt_result.percentage is not None
            else (score / max_score * 100 if score is not None and max_score else None)
        )

        if percentage is not None:
            percentages.append(percentage)

        if attempt_result and attempt_result.passed is not None:
            passed_known_count += 1

            if attempt_result.passed:
                passed_count += 1

    average_score = (
        round(sum(scores) / len(scores), 1)
        if scores
        else None
    )

    highest_score = round(max(scores), 1) if scores else None
    lowest_score = round(min(scores), 1) if scores else None

    pass_rate = (
        round(passed_count / passed_known_count * 100)
        if passed_known_count > 0
        else None
    )

    # --------------------------------------------------------
    # Distribusi nilai (berdasarkan persentase skor)
    # --------------------------------------------------------

    score_distribution = []

    for label, low, high in DISTRIBUTION_BUCKETS:

        count = sum(
            1 for p in percentages if low <= p <= high
        )

        score_distribution.append({
            "range": label,
            "count": count,
        })

    # --------------------------------------------------------
    # Soal paling sering salah
    #
    # "Salah" mencakup jawaban yang salah maupun tidak dijawab
    # sama sekali, dihitung terhadap total peserta yang
    # menyelesaikan tryout ini.
    # --------------------------------------------------------

    hardest_questions = []

    if attempt_ids:

        correct_counts = dict(
            db.query(
                Answer.question_id,
                func.count(Answer.id),
            )
            .filter(
                Answer.attempt_id.in_(attempt_ids),
                Answer.is_correct == True,
            )
            .group_by(Answer.question_id)
            .all()
        )

        tryout_questions = (
            db.query(TryoutQuestion, Question)
            .join(Question, Question.id == TryoutQuestion.question_id)
            .filter(TryoutQuestion.tryout_id == tryout.id)
            .order_by(TryoutQuestion.question_number)
            .all()
        )

        for tq, question in tryout_questions:

            correct_count = correct_counts.get(question.id, 0)
            wrong_count = max(total_attempts - correct_count, 0)

            wrong_percentage = (
                round(wrong_count / total_attempts * 100, 1)
                if total_attempts > 0
                else 0
            )

            hardest_questions.append({
                "question_id": question.id,
                "question_number": tq.question_number,
                "question_text": question.question_text,
                "wrong_count": wrong_count,
                "correct_count": correct_count,
                "wrong_percentage": wrong_percentage,
            })

        hardest_questions.sort(
            key=lambda q: q["wrong_percentage"],
            reverse=True,
        )

        hardest_questions = hardest_questions[:10]

    return {
        "tryout_id": tryout.id,
        "tryout_title": tryout.title,
        "subject_name": subject.name if subject else None,
        "max_score": tryout.max_score,
        "total_attempts": total_attempts,
        "average_score": average_score,
        "highest_score": highest_score,
        "lowest_score": lowest_score,
        "pass_rate": pass_rate,
        "score_distribution": score_distribution,
        "hardest_questions": hardest_questions,
    }
