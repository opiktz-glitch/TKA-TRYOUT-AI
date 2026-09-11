from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_user
from schemas import StudentProfileUpdate
from models import (
    User,
    Student,
    Subject,
    Tryout,
    TryoutQuestion,
    Question,
    QuestionOption,
    Attempt,
    Answer,
    Result,
)


router = APIRouter(
    prefix="/api/student",
    tags=["Student"],
)

class AnswerRequest(BaseModel):
    question_id: int
    selected_option: str | None = None

# ============================================================
# HELPER
# ============================================================

def get_student(
    current_user: User,
    db: Session,
):
    """
    Mengambil data t_student berdasarkan user yang sedang login.

    Catatan: tidak ada tempat lain (mis. saat admin membuat user
    dengan role SISWA) yang otomatis membuat baris di t_student.
    Supaya alur tryout tetap bisa dipakai, profil siswa dibuat
    otomatis di sini pada saat pertama kali dibutuhkan, alih-alih
    mengembalikan 404 "Data siswa belum ditemukan".
    """

    if current_user.role != "SISWA":
        raise HTTPException(
            status_code=403,
            detail="Endpoint ini hanya untuk siswa",
        )

    student = (
        db.query(Student)
        .filter(Student.user_id == current_user.id)
        .first()
    )

    if student:
        return student

    # -----------------------------------------------------
    # Buat profil siswa otomatis
    #
    # student_code di sini cuma placeholder (bukan NIS asli),
    # jadi dikasih prefix "AUTO-" yang jelas beda dari format
    # NIS sekolah manapun, supaya tidak diam-diam bentrok
    # dengan kode yang diketik manual oleh admin lewat menu
    # "Tambah Siswa". Prefix "S0007" polos (tanpa penanda)
    # pernah collide dengan NIS asli berformat sama.
    #
    # Tetap dicek + di-retry sebelum insert (bukan cuma andal
    # ke prefix-nya), karena admin toh bebas mengetik kode
    # apa saja termasuk yang kebetulan berformat "AUTO-...".
    # Kalau tetap gagal setelah beberapa percobaan, lempar
    # error yang jelas alih-alih 500 mentah dari database.
    # -----------------------------------------------------

    base_code = f"AUTO-{current_user.id:06d}"
    student_code = base_code

    attempt_suffix = 1

    while (
        db.query(Student)
        .filter(Student.student_code == student_code)
        .first()
    ):
        attempt_suffix += 1
        student_code = f"{base_code}-{attempt_suffix}"

        if attempt_suffix > 20:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Gagal membuat profil siswa otomatis "
                    "(kode siswa terus bentrok). Hubungi admin "
                    "untuk membuat profil siswa secara manual."
                ),
            )

    student = Student(
        user_id=current_user.id,
        student_code=student_code,
        full_name=current_user.full_name or current_user.username,
    )

    db.add(student)

    try:
        db.commit()

    except IntegrityError:

        # Race condition: request lain berhasil insert duluan
        # di antara pengecekan di atas dan commit ini (jarang,
        # tapi mungkin kalau siswa yang sama buka 2 tab
        # sekaligus). Ambil ulang baris yang sudah ada alih-alih
        # menampilkan 500 ke user.

        db.rollback()

        student = (
            db.query(Student)
            .filter(Student.user_id == current_user.id)
            .first()
        )

        if not student:
            raise HTTPException(
                status_code=500,
                detail="Gagal membuat profil siswa otomatis. Coba lagi.",
            )

        return student

    db.refresh(student)

    return student


def get_attempt_deadline(
    attempt: Attempt,
    tryout: Tryout,
):
    """
    Menghitung batas waktu (deadline) sebuah attempt berdasarkan
    started_at + duration_minutes milik tryout.

    Dipakai di beberapa endpoint (ongoing, save_answer, submit)
    supaya perhitungan deadline konsisten dan tidak hanya
    mengandalkan timer di sisi frontend.
    """

    return attempt.started_at + timedelta(
        minutes=tryout.duration_minutes or 0
    )


def finalize_attempt(
    db: Session,
    attempt: Attempt,
    tryout: Tryout,
    finished_at: datetime | None = None,
):
    """
    Melakukan penilaian otomatis & menutup sebuah attempt
    (status -> SUBMITTED, hitung score, buat/update t_result).

    Dipisah dari endpoint submit_attempt supaya logic yang sama
    bisa dipanggil ulang saat server mendeteksi attempt sudah
    melewati deadline (auto-expire) di endpoint save_answer,
    tanpa menduplikasi logic penilaian.

    finished_at: waktu yang dicatat sebagai selesai. Kalau tidak
    diisi, pakai waktu sekarang. Untuk kasus expired, isi dengan
    waktu deadline (bukan waktu request diterima) supaya siswa
    tidak bisa "memperpanjang" waktu pengerjaan dengan menunda
    request ke server.
    """

    tryout_questions = (
        db.query(TryoutQuestion)
        .filter(
            TryoutQuestion.tryout_id
            == tryout.id
        )
        .order_by(
            TryoutQuestion.question_number
        )
        .all()
    )

    total_questions = len(tryout_questions)

    correct_count = 0
    wrong_count = 0
    unanswered_count = 0

    total_points = 0

    for tq in tryout_questions:

        answer = (
            db.query(Answer)
            .filter(
                Answer.attempt_id == attempt.id,
                Answer.question_id == tq.question_id,
            )
            .first()
        )

        if (
            not answer
            or not answer.selected_option
        ):

            unanswered_count += 1

            if answer:
                answer.is_correct = False
                answer.points_earned = 0

            continue

        correct_option = (
            db.query(QuestionOption)
            .filter(
                QuestionOption.question_id
                == tq.question_id,

                QuestionOption.is_correct == True,
            )
            .first()
        )

        if not correct_option:

            wrong_count += 1

            answer.is_correct = False
            answer.points_earned = 0

            continue

        if (
            answer.selected_option
            == correct_option.option_code
        ):

            correct_count += 1

            answer.is_correct = True

            answer.points_earned = tq.points

            total_points += tq.points

        else:

            wrong_count += 1

            answer.is_correct = False

            answer.points_earned = 0

    if total_questions > 0:

        percentage = (
            correct_count
            / total_questions
        ) * 100

    else:

        percentage = 0

    effective_max_score = tryout.max_score or 100

    if total_questions > 0 and sum(tq.points for tq in tryout_questions) > 0:

        score = (
            total_points
            / sum(
                tq.points
                for tq in tryout_questions
            )
            * effective_max_score
        )

    else:

        score = 0

    attempt.status = "SUBMITTED"

    attempt.finished_at = finished_at or datetime.utcnow()

    attempt.score = round(score, 2)

    attempt.correct_count = correct_count

    attempt.wrong_count = wrong_count

    attempt.unanswered_count = unanswered_count

    passed = score >= (
        effective_max_score * 0.70
    )

    result = (
        db.query(Result)
        .filter(
            Result.attempt_id == attempt.id
        )
        .first()
    )

    if result:

        result.total_questions = total_questions

        result.correct_count = correct_count

        result.wrong_count = wrong_count

        result.unanswered_count = (
            unanswered_count
        )

        result.score = round(score, 2)

        result.percentage = round(
            percentage,
            2
        )

        result.passed = passed

        result.completed_at = (
            attempt.finished_at
        )

    else:

        result = Result(
            attempt_id=attempt.id,

            total_questions=total_questions,

            correct_count=correct_count,

            wrong_count=wrong_count,

            unanswered_count=unanswered_count,

            score=round(score, 2),

            percentage=round(
                percentage,
                2
            ),

            passed=passed,

            completed_at=attempt.finished_at,
        )

        db.add(result)

    db.commit()

    db.refresh(result)

    return {
        "success": True,

        "attempt_id": attempt.id,

        "status": attempt.status,

        "total_questions": total_questions,

        "correct_count": correct_count,

        "wrong_count": wrong_count,

        "unanswered_count": unanswered_count,

        "score": round(score, 2),

        "percentage": round(
            percentage,
            2
        ),

        "passed": passed,

        "completed_at": result.completed_at,
    }


# ============================================================
# GET PROFIL SISWA (SELF-SERVICE)
# ============================================================

@router.get("/profile")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mengambil data profil siswa yang sedang login, untuk
    menu "Profil". Kalau baris t_student belum ada, akan
    otomatis dibuatkan (lihat get_student()).
    """

    student = get_student(current_user, db)

    return {
        "student_id": student.id,
        "student_code": student.student_code,
        "full_name": student.full_name,
        "school_name": student.school_name,
        "grade": student.grade,
        "class_name": student.class_name,

        "username": current_user.username,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
    }


# ============================================================
# UPDATE PROFIL SISWA (SELF-SERVICE)
# ============================================================

@router.put("/profile")
def update_my_profile(
    profile_data: StudentProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Siswa mengubah data profilnya sendiri.

    Catatan: NIS (student_code) sengaja TIDAK bisa diubah dari sini
    karena itu identitas resmi yang dikelola admin lewat menu
    Data Siswa, bukan oleh siswa sendiri.
    """

    student = get_student(current_user, db)

    student.full_name = profile_data.full_name
    student.school_name = profile_data.school_name
    student.grade = profile_data.grade
    student.class_name = profile_data.class_name

    db.commit()
    db.refresh(student)

    return {
        "success": True,
        "message": "Profil berhasil diperbarui",
        "data": {
            "student_id": student.id,
            "student_code": student.student_code,
            "full_name": student.full_name,
            "school_name": student.school_name,
            "grade": student.grade,
            "class_name": student.class_name,
        },
    }


# ============================================================
# GET DAFTAR TRYOUT SISWA
# ============================================================

@router.get("/tryouts")
def get_student_tryouts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mengambil daftar tryout aktif yang tersedia untuk siswa.
    """

    student = get_student(current_user, db)

    tryouts = (
        db.query(Tryout)
        .filter(Tryout.is_active == True)
        .order_by(Tryout.created_at.desc())
        .all()
    )

    result = []

    for tryout in tryouts:

        # Jumlah soal sebenarnya di paket
        question_count = (
            db.query(TryoutQuestion)
            .filter(
                TryoutQuestion.tryout_id == tryout.id
            )
            .count()
        )

        # Cari mata pelajaran
        subject = (
            db.query(Subject)
            .filter(
                Subject.id == tryout.subject_id
            )
            .first()
        )

        # Cari attempt siswa untuk tryout ini
        latest_attempt = (
            db.query(Attempt)
            .filter(
                Attempt.tryout_id == tryout.id,
                Attempt.student_id == student.id,
            )
            .order_by(
                Attempt.created_at.desc()
            )
            .first()
        )

        result.append({
            "id": tryout.id,
            "title": tryout.title,
            "description": tryout.description,

            "subject_id": tryout.subject_id,
            "subject_name": (
                subject.name
                if subject
                else None
            ),

            "grade": tryout.grade,

            "duration_minutes": (
                tryout.duration_minutes
            ),

            "total_questions": question_count,

            "max_score": tryout.max_score,

            "difficulty": tryout.difficulty,

            "is_active": tryout.is_active,

            # Informasi pengerjaan siswa
            "attempt_id": (
                latest_attempt.id
                if latest_attempt
                else None
            ),

            "attempt_status": (
                latest_attempt.status
                if latest_attempt
                else None
            ),

            "score": (
                latest_attempt.score
                if latest_attempt
                else None
            ),
        })

    return result


# ============================================================
# DETAIL TRYOUT
# ============================================================

@router.get("/tryouts/{tryout_id}")
def get_student_tryout_detail(
    tryout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mengambil detail sebuah tryout untuk siswa.
    """

    student = get_student(current_user, db)

    tryout = (
        db.query(Tryout)
        .filter(
            Tryout.id == tryout_id,
            Tryout.is_active == True,
        )
        .first()
    )

    if not tryout:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan atau tidak aktif",
        )

    # Mata pelajaran
    subject = (
        db.query(Subject)
        .filter(
            Subject.id == tryout.subject_id
        )
        .first()
    )

    # Soal dalam tryout
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

    # Attempt terakhir siswa
    latest_attempt = (
        db.query(Attempt)
        .filter(
            Attempt.tryout_id == tryout.id,
            Attempt.student_id == student.id,
        )
        .order_by(
            Attempt.created_at.desc()
        )
        .first()
    )

    return {
        "id": tryout.id,

        "title": tryout.title,

        "description": tryout.description,

        "subject_id": tryout.subject_id,

        "subject_name": (
            subject.name
            if subject
            else None
        ),

        "grade": tryout.grade,

        "duration_minutes": (
            tryout.duration_minutes
        ),

        "total_questions": len(questions),

        "max_score": tryout.max_score,

        "difficulty": tryout.difficulty,

        "is_active": tryout.is_active,

        "attempt_id": (
            latest_attempt.id
            if latest_attempt
            else None
        ),

        "attempt_status": (
            latest_attempt.status
            if latest_attempt
            else None
        ),

        "score": (
            latest_attempt.score
            if latest_attempt
            else None
        ),
    }


# ============================================================
# START TRYOUT
# ============================================================

@router.post("/tryouts/{tryout_id}/start")
def start_tryout(
    tryout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Memulai tryout dan membuat record t_attempt.
    """

    student = get_student(current_user, db)

    # --------------------------------------------------------
    # Pastikan tryout ada dan aktif
    # --------------------------------------------------------

    tryout = (
        db.query(Tryout)
        .filter(
            Tryout.id == tryout_id,
            Tryout.is_active == True,
        )
        .first()
    )

    if not tryout:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan atau tidak aktif",
        )

    # --------------------------------------------------------
    # Pastikan tryout memiliki soal
    # --------------------------------------------------------

    question_count = (
        db.query(TryoutQuestion)
        .filter(
            TryoutQuestion.tryout_id == tryout.id
        )
        .count()
    )

    if question_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Tryout belum memiliki soal",
        )

    # --------------------------------------------------------
    # Cek attempt yang masih berjalan
    # --------------------------------------------------------

    existing_attempt = (
        db.query(Attempt)
        .filter(
            Attempt.tryout_id == tryout.id,
            Attempt.student_id == student.id,
            Attempt.status == "IN_PROGRESS",
        )
        .order_by(
            Attempt.created_at.desc()
        )
        .first()
    )

    if existing_attempt:

        return {
            "success": True,
            "message": "Tryout masih dalam proses",

            "attempt_id": existing_attempt.id,

            "tryout_id": existing_attempt.tryout_id,

            "student_id": existing_attempt.student_id,

            "started_at": existing_attempt.started_at,

            "finished_at": existing_attempt.finished_at,

            "status": existing_attempt.status,

            "score": existing_attempt.score,

            "duration_minutes": (
                tryout.duration_minutes
            ),

            "total_questions": question_count,
        }

    # --------------------------------------------------------
    # Buat attempt baru
    # --------------------------------------------------------

    now = datetime.utcnow()

    attempt = Attempt(
        student_id=student.id,
        tryout_id=tryout.id,

        started_at=now,

        finished_at=None,

        status="IN_PROGRESS",

        score=None,

        correct_count=0,

        wrong_count=0,

        unanswered_count=question_count,
    )

    db.add(attempt)

    db.commit()

    db.refresh(attempt)

    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return {
        "success": True,

        "message": "Tryout berhasil dimulai",

        "attempt_id": attempt.id,

        "tryout_id": attempt.tryout_id,

        "student_id": attempt.student_id,

        "started_at": attempt.started_at,

        "finished_at": attempt.finished_at,

        "status": attempt.status,

        "score": attempt.score,

        "duration_minutes": (
            tryout.duration_minutes
        ),

        "total_questions": question_count,
    }


# ============================================================
# GET TRYOUT SAYA — DAFTAR ATTEMPT YANG SEDANG BERJALAN
# ============================================================

@router.get("/attempts/ongoing")
def get_ongoing_attempts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mengambil semua attempt milik siswa yang berstatus IN_PROGRESS,
    supaya bisa dilanjutkan pengerjaannya lewat menu "Tryout Saya".

    Sisa waktu dihitung di server (bukan di frontend) supaya tidak
    tergantung zona waktu browser siswa.
    """

    student = get_student(current_user, db)

    attempts = (
        db.query(Attempt)
        .filter(
            Attempt.student_id == student.id,
            Attempt.status == "IN_PROGRESS",
        )
        .order_by(
            Attempt.started_at.desc()
        )
        .all()
    )

    now = datetime.utcnow()

    result = []

    for attempt in attempts:

        tryout = (
            db.query(Tryout)
            .filter(Tryout.id == attempt.tryout_id)
            .first()
        )

        if not tryout:
            continue

        subject = (
            db.query(Subject)
            .filter(Subject.id == tryout.subject_id)
            .first()
        )

        question_count = (
            db.query(TryoutQuestion)
            .filter(TryoutQuestion.tryout_id == tryout.id)
            .count()
        )

        answered_count = (
            db.query(Answer)
            .filter(
                Answer.attempt_id == attempt.id,
                Answer.selected_option.isnot(None),
            )
            .count()
        )

        deadline = attempt.started_at + timedelta(
            minutes=tryout.duration_minutes or 0
        )

        remaining_seconds = int(
            (deadline - now).total_seconds()
        )

        result.append({
            "attempt_id": attempt.id,
            "tryout_id": tryout.id,

            "title": tryout.title,
            "subject_name": subject.name if subject else None,

            "duration_minutes": tryout.duration_minutes,

            "total_questions": question_count,
            "answered_count": answered_count,

            "started_at": attempt.started_at,

            "remaining_seconds": max(0, remaining_seconds),
            "time_expired": remaining_seconds <= 0,
        })

    return result


# ============================================================
# GET RIWAYAT — DAFTAR ATTEMPT YANG SUDAH SELESAI
# ============================================================

@router.get("/attempts/history")
def get_attempt_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mengambil semua attempt milik siswa yang SUDAH selesai
    (status != IN_PROGRESS), lengkap dengan skor & hasilnya,
    untuk menu "Riwayat" / "Hasil Tryout".
    """

    student = get_student(current_user, db)

    attempts = (
        db.query(Attempt)
        .filter(
            Attempt.student_id == student.id,
            Attempt.status != "IN_PROGRESS",
        )
        .order_by(
            Attempt.finished_at.desc(),
            Attempt.created_at.desc(),
        )
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

        subject = (
            db.query(Subject)
            .filter(Subject.id == tryout.subject_id)
            .first()
        )

        attempt_result = (
            db.query(Result)
            .filter(Result.attempt_id == attempt.id)
            .first()
        )

        result.append({
            "attempt_id": attempt.id,
            "tryout_id": tryout.id,

            "title": tryout.title,
            "subject_name": subject.name if subject else None,

            "started_at": attempt.started_at,
            "finished_at": attempt.finished_at,

            "status": attempt.status,

            "total_questions": (
                attempt_result.total_questions
                if attempt_result
                else None
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

            "score": (
                attempt_result.score
                if attempt_result
                else attempt.score
            ),

            "max_score": tryout.max_score,

            "percentage": (
                attempt_result.percentage
                if attempt_result
                else None
            ),

            "passed": (
                attempt_result.passed
                if attempt_result
                else None
            ),
        })

    return result


# ============================================================
# GET DETAIL HASIL — SATU ATTEMPT (untuk halaman detail hasil)
# ============================================================

@router.get("/attempts/{attempt_id}/result")
def get_attempt_result_detail(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mengambil detail hasil satu attempt yang sudah selesai,
    termasuk pembahasan tiap soal (jawaban siswa vs kunci).
    """

    student = get_student(current_user, db)

    attempt = (
        db.query(Attempt)
        .filter(
            Attempt.id == attempt_id,
            Attempt.student_id == student.id,
        )
        .first()
    )

    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Attempt tidak ditemukan",
        )

    if attempt.status == "IN_PROGRESS":
        raise HTTPException(
            status_code=400,
            detail="Tryout ini belum selesai dikerjakan",
        )

    tryout = (
        db.query(Tryout)
        .filter(Tryout.id == attempt.tryout_id)
        .first()
    )

    subject = (
        db.query(Subject)
        .filter(Subject.id == tryout.subject_id)
        .first()
        if tryout
        else None
    )

    attempt_result = (
        db.query(Result)
        .filter(Result.attempt_id == attempt.id)
        .first()
    )

    tryout_questions = (
        db.query(TryoutQuestion)
        .filter(TryoutQuestion.tryout_id == attempt.tryout_id)
        .order_by(TryoutQuestion.question_number)
        .all()
    )

    questions = []

    for tq in tryout_questions:

        question = (
            db.query(Question)
            .filter(Question.id == tq.question_id)
            .first()
        )

        if not question:
            continue

        options = (
            db.query(QuestionOption)
            .filter(QuestionOption.question_id == question.id)
            .order_by(QuestionOption.option_code)
            .all()
        )

        answer = (
            db.query(Answer)
            .filter(
                Answer.attempt_id == attempt.id,
                Answer.question_id == question.id,
            )
            .first()
        )

        correct_option = next(
            (opt for opt in options if opt.is_correct),
            None,
        )

        questions.append({
            "question_number": tq.question_number,
            "question_text": question.question_text,
            "explanation": question.explanation,

            "options": [
                {
                    "code": opt.option_code,
                    "text": opt.option_text,
                }
                for opt in options
            ],

            "selected_option": (
                answer.selected_option if answer else None
            ),

            "correct_option": (
                correct_option.option_code if correct_option else None
            ),

            "is_correct": (
                answer.is_correct if answer else False
            ),
        })

    return {
        "attempt_id": attempt.id,

        "title": tryout.title if tryout else None,
        "subject_name": subject.name if subject else None,

        "started_at": attempt.started_at,
        "finished_at": attempt.finished_at,

        "status": attempt.status,

        "score": (
            attempt_result.score if attempt_result else attempt.score
        ),

        "max_score": tryout.max_score if tryout else None,

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

        "questions": questions,
    }


# ============================================================
# GET SOAL ATTEMPT
# ============================================================

@router.get("/attempts/{attempt_id}")
def get_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mengambil data attempt dan soal-soal yang harus dikerjakan siswa.

    Penting:
    - Tidak mengirim is_correct dari QuestionOption.
    - Tidak mengirim explanation.
    """

    student = get_student(current_user, db)

    # --------------------------------------------------------
    # Cari attempt
    # --------------------------------------------------------

    attempt = (
        db.query(Attempt)
        .filter(
            Attempt.id == attempt_id,
            Attempt.student_id == student.id,
        )
        .first()
    )

    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Attempt tidak ditemukan",
        )

    # --------------------------------------------------------
    # Cari tryout
    # --------------------------------------------------------

    tryout = (
        db.query(Tryout)
        .filter(
            Tryout.id == attempt.tryout_id
        )
        .first()
    )

    if not tryout:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan",
        )

    # --------------------------------------------------------
    # Ambil soal berdasarkan nomor
    # --------------------------------------------------------

    tryout_questions = (
        db.query(TryoutQuestion)
        .filter(
            TryoutQuestion.tryout_id == tryout.id
        )
        .order_by(
            TryoutQuestion.question_number
        )
        .all()
    )

    questions = []

    for tq in tryout_questions:

        question = (
            db.query(Question)
            .filter(
                Question.id == tq.question_id,
                Question.is_active == True,
            )
            .first()
        )

        if not question:
            continue

        options = (
            db.query(QuestionOption)
            .filter(
                QuestionOption.question_id == question.id
            )
            .order_by(
                QuestionOption.option_code
            )
            .all()
        )

        # ----------------------------------------------------
        # Cari jawaban siswa jika sudah pernah menjawab
        # ----------------------------------------------------

        answer = (
            db.query(Answer)
            .filter(
                Answer.attempt_id == attempt.id,
                Answer.question_id == question.id,
            )
            .first()
        )

        questions.append({
            "question_number": tq.question_number,

            "question_id": question.id,

            "question_text": question.question_text,

            "question_type": question.question_type,

            "difficulty": question.difficulty,

            "points": tq.points,

            "options": [
                {
                    "code": option.option_code,
                    "text": option.option_text,
                }
                for option in options
            ],

            "selected_option": (
                answer.selected_option
                if answer
                else None
            ),
        })

    return {
        "attempt_id": attempt.id,

        "tryout_id": tryout.id,

        "title": tryout.title,

        "duration_minutes": tryout.duration_minutes,

        "started_at": attempt.started_at,

        "finished_at": attempt.finished_at,

        "status": attempt.status,

        "total_questions": len(questions),

        "questions": questions,
    }


# ============================================================
# SAVE / UPDATE JAWABAN
# ============================================================

@router.post("/attempts/{attempt_id}/answers")
def save_answer(
    attempt_id: int,
    data: AnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Menyimpan atau mengubah jawaban siswa.

    Backend TIDAK memberitahukan apakah jawaban benar.
    """

    student = get_student(current_user, db)

    # --------------------------------------------------------
    # Cari attempt milik siswa
    # --------------------------------------------------------

    attempt = (
        db.query(Attempt)
        .filter(
            Attempt.id == attempt_id,
            Attempt.student_id == student.id,
        )
        .first()
    )

    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Attempt tidak ditemukan",
        )

    # --------------------------------------------------------
    # Pastikan masih bisa menjawab
    # --------------------------------------------------------

    if attempt.status != "IN_PROGRESS":
        raise HTTPException(
            status_code=400,
            detail="Tryout sudah tidak dapat dikerjakan",
        )

    # --------------------------------------------------------
    # Pastikan waktu pengerjaan belum habis (dicek di SERVER,
    # bukan cuma mengandalkan timer di frontend)
    # --------------------------------------------------------

    tryout_for_deadline = (
        db.query(Tryout)
        .filter(Tryout.id == attempt.tryout_id)
        .first()
    )

    if not tryout_for_deadline:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan",
        )

    deadline = get_attempt_deadline(
        attempt, tryout_for_deadline
    )

    if datetime.utcnow() > deadline:

        # Waktu sudah habis: tutup attempt sekarang juga
        # (auto-submit di server) memakai waktu deadline,
        # supaya siswa tidak bisa memperpanjang waktu dengan
        # menunda request ke endpoint ini.
        finalize_attempt(
            db, attempt, tryout_for_deadline,
            finished_at=deadline,
        )

        raise HTTPException(
            status_code=400,
            detail="Waktu pengerjaan sudah habis. Tryout telah otomatis diselesaikan oleh sistem.",
        )

    # --------------------------------------------------------
    # Pastikan soal termasuk dalam tryout
    # --------------------------------------------------------

    tryout_question = (
        db.query(TryoutQuestion)
        .filter(
            TryoutQuestion.tryout_id == attempt.tryout_id,
            TryoutQuestion.question_id == data.question_id,
        )
        .first()
    )

    if not tryout_question:
        raise HTTPException(
            status_code=400,
            detail="Soal tidak termasuk dalam tryout ini",
        )

    # --------------------------------------------------------
    # Validasi pilihan jawaban
    # --------------------------------------------------------

    if data.selected_option is not None:

        option = (
            db.query(QuestionOption)
            .filter(
                QuestionOption.question_id
                == data.question_id,

                QuestionOption.option_code
                == data.selected_option,
            )
            .first()
        )

        if not option:
            raise HTTPException(
                status_code=400,
                detail="Pilihan jawaban tidak valid",
            )

    # --------------------------------------------------------
    # Cari jawaban lama
    # --------------------------------------------------------

    answer = (
        db.query(Answer)
        .filter(
            Answer.attempt_id == attempt.id,
            Answer.question_id == data.question_id,
        )
        .first()
    )

    # --------------------------------------------------------
    # UPDATE
    # --------------------------------------------------------

    if answer:

        answer.selected_option = (
            data.selected_option
        )

        answer.answered_at = datetime.utcnow()

    # --------------------------------------------------------
    # INSERT
    # --------------------------------------------------------

    else:

        answer = Answer(
            attempt_id=attempt.id,

            question_id=data.question_id,

            selected_option=data.selected_option,

            is_correct=None,

            points_earned=0,

            answered_at=datetime.utcnow(),
        )

        db.add(answer)

    db.commit()

    return {
        "success": True,
        "message": "Jawaban berhasil disimpan",
        "attempt_id": attempt.id,
        "question_id": data.question_id,
        "selected_option": data.selected_option,
    }


# ============================================================
# SUBMIT TRYOUT + AUTO GRADING
# ============================================================

@router.post("/attempts/{attempt_id}/submit")
def submit_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit tryout dan melakukan penilaian otomatis.
    """

    student = get_student(current_user, db)

    # --------------------------------------------------------
    # Cari attempt
    # --------------------------------------------------------

    attempt = (
        db.query(Attempt)
        .filter(
            Attempt.id == attempt_id,
            Attempt.student_id == student.id,
        )
        .first()
    )

    if not attempt:
        raise HTTPException(
            status_code=404,
            detail="Attempt tidak ditemukan",
        )

    # --------------------------------------------------------
    # Jangan submit dua kali
    # --------------------------------------------------------

    if attempt.status != "IN_PROGRESS":
        raise HTTPException(
            status_code=400,
            detail="Tryout sudah diselesaikan",
        )

    # --------------------------------------------------------
    # Ambil tryout
    # --------------------------------------------------------

    tryout = (
        db.query(Tryout)
        .filter(
            Tryout.id == attempt.tryout_id
        )
        .first()
    )

    if not tryout:
        raise HTTPException(
            status_code=404,
            detail="Tryout tidak ditemukan",
        )

    # --------------------------------------------------------
    # Cek deadline (dicek di SERVER, bukan cuma timer frontend)
    # --------------------------------------------------------

    deadline = get_attempt_deadline(attempt, tryout)

    now = datetime.utcnow()

    # Kalau submit datang setelah deadline, catat waktu selesai
    # sebagai waktu deadline (bukan waktu request diterima),
    # supaya siswa tidak bisa memperpanjang waktu pengerjaan
    # dengan menunda pengiriman request submit.
    finished_at = min(now, deadline)

    # --------------------------------------------------------
    # Nilai & tutup attempt (logic penilaian dipakai bersama
    # dengan auto-expire di endpoint save_answer)
    # --------------------------------------------------------

    result_data = finalize_attempt(
        db, attempt, tryout, finished_at=finished_at,
    )

    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return {
        **result_data,
        "message": "Tryout berhasil diselesaikan",
    }
