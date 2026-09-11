from datetime import datetime, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_role
from models import (
    User,
    Student,
    Teacher,
    Subject,
    Tryout,
    Attempt,
    Result,
    Answer,
    Question,
)


router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"]
)


@router.get("/dashboard")
def admin_dashboard(
    current_user: User = Depends(
        require_role("ADMIN")
    )
):

    return {

        "success": True,

        "message":
            "Selamat datang di Admin Dashboard",

        "username":
            current_user.username,

        "role":
            current_user.role

    }


# ============================================================
# GET LAPORAN ANALITIK SISTEM (ADMIN)
#
# Ringkasan lintas seluruh guru & tryout: rata-rata skor per
# mata pelajaran, tren jumlah attempt 14 hari terakhir, guru
# paling aktif, dan soal paling sering salah secara global.
# ============================================================

TREND_DAYS = 14
MIN_ANSWERS_FOR_HARDEST = 3
TOP_TEACHERS_LIMIT = 5
HARDEST_QUESTIONS_LIMIT = 10


@router.get("/reports/overview")
def get_admin_report_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
):

    # --------------------------------------------------------
    # Statistik dasar
    # --------------------------------------------------------

    total_students = db.query(Student).count()
    total_teachers = db.query(Teacher).count()
    total_tryouts = db.query(Tryout).count()

    tryouts_all = db.query(Tryout).all()
    tryout_map = {t.id: t for t in tryouts_all}

    completed_attempts = (
        db.query(Attempt)
        .filter(Attempt.status != "IN_PROGRESS")
        .all()
    )

    total_attempts = len(completed_attempts)

    attempt_ids = [a.id for a in completed_attempts]

    results_by_attempt = {}

    if attempt_ids:
        results = (
            db.query(Result)
            .filter(Result.attempt_id.in_(attempt_ids))
            .all()
        )

        results_by_attempt = {r.attempt_id: r for r in results}

    # --------------------------------------------------------
    # Cache nama mata pelajaran & guru (hindari query berulang)
    # --------------------------------------------------------

    subjects_by_id = {
        s.id: s for s in db.query(Subject).all()
    }

    users_by_id = {
        u.id: u for u in db.query(User).all()
    }

    # --------------------------------------------------------
    # Rata-rata skor keseluruhan & per mata pelajaran
    # --------------------------------------------------------

    all_scores = []

    subject_scores = defaultdict(list)

    for attempt in completed_attempts:

        tryout = tryout_map.get(attempt.tryout_id)

        if not tryout:
            continue

        attempt_result = results_by_attempt.get(attempt.id)

        score = (
            attempt_result.score
            if attempt_result and attempt_result.score is not None
            else attempt.score
        )

        if score is None:
            continue

        all_scores.append(score)
        subject_scores[tryout.subject_id].append(score)

    average_score_overall = (
        round(sum(all_scores) / len(all_scores), 1)
        if all_scores
        else None
    )

    average_score_per_subject = []

    for subject_id, scores in subject_scores.items():

        subject = subjects_by_id.get(subject_id)

        average_score_per_subject.append({
            "subject_id": subject_id,
            "subject_name": subject.name if subject else "-",
            "average_score": round(sum(scores) / len(scores), 1),
            "total_attempts": len(scores),
        })

    average_score_per_subject.sort(
        key=lambda s: s["average_score"],
        reverse=True,
    )

    # --------------------------------------------------------
    # Tren jumlah attempt (14 hari terakhir)
    # --------------------------------------------------------

    cutoff = datetime.utcnow() - timedelta(days=TREND_DAYS - 1)

    counts_by_date = defaultdict(int)

    for attempt in completed_attempts:

        if not attempt.finished_at:
            continue

        if attempt.finished_at < cutoff:
            continue

        day_key = attempt.finished_at.date().isoformat()

        counts_by_date[day_key] += 1

    attempts_trend = []

    for i in range(TREND_DAYS - 1, -1, -1):

        day = (datetime.utcnow() - timedelta(days=i)).date().isoformat()

        attempts_trend.append({
            "date": day,
            "count": counts_by_date.get(day, 0),
        })

    # --------------------------------------------------------
    # Guru paling aktif
    # --------------------------------------------------------

    teacher_tryout_count = defaultdict(int)

    for t in tryouts_all:
        teacher_tryout_count[t.created_by] += 1

    teacher_attempt_count = defaultdict(int)
    teacher_student_set = defaultdict(set)

    for attempt in completed_attempts:

        tryout = tryout_map.get(attempt.tryout_id)

        if not tryout:
            continue

        teacher_attempt_count[tryout.created_by] += 1
        teacher_student_set[tryout.created_by].add(attempt.student_id)

    top_teachers = []

    for teacher_id, tryout_count in teacher_tryout_count.items():

        creator = users_by_id.get(teacher_id)

        top_teachers.append({
            "teacher_id": teacher_id,
            "teacher_name": creator.full_name if creator else "-",
            "tryout_count": tryout_count,
            "total_attempts": teacher_attempt_count.get(teacher_id, 0),
            "student_reach": len(teacher_student_set.get(teacher_id, set())),
        })

    top_teachers.sort(
        key=lambda t: (t["total_attempts"], t["tryout_count"]),
        reverse=True,
    )

    top_teachers = top_teachers[:TOP_TEACHERS_LIMIT]

    # --------------------------------------------------------
    # Soal paling sering salah (global, dari soal yang dijawab)
    #
    # Dihitung dari jawaban yang benar-benar ada (t_answer),
    # sehingga soal dengan jumlah jawaban terlalu sedikit
    # (di bawah MIN_ANSWERS_FOR_HARDEST) diabaikan supaya
    # tidak bias oleh sampel yang terlalu kecil.
    # --------------------------------------------------------

    hardest_questions = []

    if attempt_ids:

        total_answer_counts = dict(
            db.query(
                Answer.question_id,
                func.count(Answer.id),
            )
            .filter(Answer.attempt_id.in_(attempt_ids))
            .group_by(Answer.question_id)
            .all()
        )

        correct_answer_counts = dict(
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

        question_ids = [
            qid
            for qid, total in total_answer_counts.items()
            if total >= MIN_ANSWERS_FOR_HARDEST
        ]

        if question_ids:

            questions_by_id = {
                q.id: q
                for q in db.query(Question)
                .filter(Question.id.in_(question_ids))
                .all()
            }

            for question_id in question_ids:

                question = questions_by_id.get(question_id)

                if not question:
                    continue

                total = total_answer_counts.get(question_id, 0)
                correct = correct_answer_counts.get(question_id, 0)
                wrong = max(total - correct, 0)

                wrong_percentage = (
                    round(wrong / total * 100, 1)
                    if total > 0
                    else 0
                )

                subject = subjects_by_id.get(question.subject_id)

                hardest_questions.append({
                    "question_id": question.id,
                    "question_text": question.question_text,
                    "subject_name": subject.name if subject else "-",
                    "total_answered": total,
                    "wrong_count": wrong,
                    "wrong_percentage": wrong_percentage,
                })

            hardest_questions.sort(
                key=lambda q: q["wrong_percentage"],
                reverse=True,
            )

            hardest_questions = hardest_questions[:HARDEST_QUESTIONS_LIMIT]

    return {
        "total_students": total_students,
        "total_teachers": total_teachers,
        "total_tryouts": total_tryouts,
        "total_attempts": total_attempts,
        "average_score_overall": average_score_overall,
        "average_score_per_subject": average_score_per_subject,
        "attempts_trend": attempts_trend,
        "top_teachers": top_teachers,
        "hardest_questions": hardest_questions,
    }