import json
import logging
import random
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

import ai_providers
import document_parser
from database import get_db
from models import (
    Question,
    QuestionOption,
    Subject,
    Tryout,
    TryoutQuestion,
    Answer,
    User
)
from schemas import (
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    AIQuestionGenerateRequest,
    AIQuestionGenerateResponse,
    AIPromptPreviewResponse,
    AIExtractedQuestion,
    AIDocumentChunk,
    AIDocumentPrepareResponse,
    AIChunkProcessRequest,
    AIChunkProcessResponse
)
from dependencies import require_role


router = APIRouter(
    prefix="/api/questions",
    tags=["Questions"]
)

logger = logging.getLogger(__name__)


ALLOWED_TYPES = [
    "MULTIPLE_CHOICE"
]

ALLOWED_DIFFICULTIES = [
    "EASY",
    "MEDIUM",
    "HARD"
]

ALLOWED_OPTIONS = [
    "A",
    "B",
    "C",
    "D"
]


# =========================================================
# VALIDATE QUESTION
# =========================================================

def validate_question_data(question_data):

    if question_data.question_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Tipe soal tidak valid"
        )

    if question_data.difficulty not in ALLOWED_DIFFICULTIES:
        raise HTTPException(
            status_code=400,
            detail="Tingkat kesulitan tidak valid"
        )

    if not question_data.question_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Pertanyaan wajib diisi"
        )

    if question_data.points <= 0:
        raise HTTPException(
            status_code=400,
            detail="Bobot soal harus lebih besar dari 0"
        )

    if len(question_data.options) != len(ALLOWED_OPTIONS):
        raise HTTPException(
            status_code=400,
            detail=(
                "Soal pilihan ganda harus memiliki "
                f"{len(ALLOWED_OPTIONS)} pilihan"
            )
        )

    option_codes = []

    correct_count = 0

    for option in question_data.options:

        code = option.option_code.strip().upper()

        if code not in ALLOWED_OPTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Pilihan {code} tidak valid"
            )

        if code in option_codes:
            raise HTTPException(
                status_code=400,
                detail=f"Pilihan {code} duplikat"
            )

        if not option.option_text.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Teks pilihan {code} wajib diisi"
            )

        option_codes.append(code)

        if option.is_correct:
            correct_count += 1

    if set(option_codes) != set(ALLOWED_OPTIONS):
        raise HTTPException(
            status_code=400,
            detail="Pilihan harus terdiri dari A, B, C, dan D"
        )

    if correct_count != 1:
        raise HTTPException(
            status_code=400,
            detail="Harus ada tepat satu jawaban benar"
        )


# =========================================================
# CEK PEMAKAIAN SOAL DI TRYOUT
#
# Dipakai sebelum menghapus atau menonaktifkan soal, supaya
# soal yang sudah dipasang di sebuah tryout tidak bisa hilang
# begitu saja. Kalau ini dibiarkan, siswa yang mengerjakan
# tryout akan melihat soal lebih sedikit dari total_questions
# aslinya (soal nonaktif/terhapus di-skip di endpoint siswa),
# padahal saat penilaian soal itu tetap dihitung sebagai salah
# — hasilnya nilai siswa jadi tidak akurat.
# =========================================================

def get_tryout_titles_using_question(
    db: Session,
    question_id: int
) -> list[str]:

    rows = (
        db.query(Tryout.title)
        .join(
            TryoutQuestion,
            TryoutQuestion.tryout_id == Tryout.id
        )
        .filter(
            TryoutQuestion.question_id == question_id
        )
        .distinct()
        .all()
    )

    return [row[0] for row in rows]


# =========================================================
# GET QUESTIONS
# =========================================================

@router.get("", response_model=list[QuestionResponse])
def get_questions(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    questions = (
        db.query(Question)
        .order_by(Question.id.desc())
        .all()
    )

    result = []

    for question in questions:

        options = (
            db.query(QuestionOption)
            .filter(
                QuestionOption.question_id ==
                question.id
            )
            .order_by(
                QuestionOption.option_code
            )
            .all()
        )

        question.options = options

        result.append(question)

    return result


# =========================================================
# GET QUESTION
# =========================================================

@router.get(
    "/{question_id}",
    response_model=QuestionResponse
)
def get_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    question = (
        db.query(Question)
        .filter(
            Question.id == question_id
        )
        .first()
    )

    if not question:

        raise HTTPException(
            status_code=404,
            detail="Soal tidak ditemukan"
        )

    options = (
        db.query(QuestionOption)
        .filter(
            QuestionOption.question_id ==
            question.id
        )
        .order_by(
            QuestionOption.option_code
        )
        .all()
    )

    question.options = options

    return question


# =========================================================
# GENERATE SOAL DENGAN AI (OLLAMA)
#
# Endpoint ini TIDAK menyimpan apapun ke database. Ia hanya
# mengembalikan draft soal (bentuknya sama dengan QuestionCreate)
# supaya guru bisa memeriksa & mengedit di form biasa sebelum
# benar-benar disimpan lewat endpoint POST /api/questions yang
# sudah ada. Dengan begitu validasi & aturan bisnis tetap satu
# jalur, tidak ada jalur simpan baru yang terpisah.
# =========================================================

DIFFICULTY_LABELS = {
    "EASY": "mudah",
    "MEDIUM": "sedang",
    "HARD": "sulit",
}


def build_ai_prompt(
    subject_name: str,
    difficulty: str,
    materi: str,
    additional_instruction: str | None
) -> str:

    difficulty_label = DIFFICULTY_LABELS.get(
        difficulty, difficulty.lower()
    )

    instruction_line = ""

    if additional_instruction and additional_instruction.strip():

        instruction_line = (
            "Instruksi tambahan dari guru: "
            + additional_instruction.strip()
        )

    return f"""Anda adalah seorang guru mata pelajaran {subject_name} yang sedang menyusun soal ujian tryout TKA untuk siswa kelas 6 SD.

Buatkan SATU soal pilihan ganda dengan ketentuan berikut:
- Tingkat kesulitan: {difficulty_label}
- Materi / lingkup soal: {materi.strip()}
- Format Teks: Buatlah sebuah teks bacaan nonfiksi atau fiksi pendek yang utuh (MAKSIMAL 2 kalimat, jangan lebih) di dalam question_text, diikuti dengan kalimat tanya yang jelas di bagian akhir teks. Hindari kalimat pembuka yang kaku seperti "Baca teks berikut:".
- Kualitas Bahasa: Menggunakan bahasa Indonesia baku, logis, dan ramah anak.
- Notasi Matematika: JANGAN gunakan notasi LaTeX sama sekali (tanda $, \\frac{{a}}{{b}}, \\times, \\div, \\sqrt, \\^, dan sejenisnya) di question_text maupun options, karena teks ini ditampilkan APA ADANYA ke siswa tanpa ada yang merender LaTeX. Tulis pecahan dan operasi hitung dalam bentuk teks biasa yang mudah dibaca siswa SD, misalnya "2 1/4 bagian" (bukan "$2 \\frac{{1}}{{4}}$"), "3 x 4" (bukan "3 \\times 4"), "12 : 3" (bukan "12 \\div 3"). Untuk kuadrat/pangkat, pakai simbol superscript langsung seperti "5\u00b2" atau eja "5 pangkat 2" / "5 kuadrat" (bukan "5^2" atau "$5^2$").
- Pilihan Jawaban: Keempat pilihan (A-D) harus berisi teks yang BERBEDA satu sama lain, jangan ada dua pilihan dengan isi yang sama persis atau hanya beda kata sedikit tapi maknanya identik.
{instruction_line}

Soal harus memiliki tepat 4 pilihan jawaban dengan kode A, B, C, D, dan hanya SATU pilihan yang benar. Sertakan juga pembahasan singkat yang menjelaskan kenapa jawaban itu benar.

PENTING - urutan berpikir: Tentukan dan HITUNG dulu jawaban yang benar secara matematis/logis SEBELUM menuliskan seluruh pilihan (A-D). Setelah itu, isi "correct_answer_text" dengan teks jawaban benar itu (harus SAMA PERSIS, kata demi kata, dengan salah satu "option_text" di bawah) — field ini dipakai sistem untuk pengecekan konsistensi otomatis, jadi wajib identik.

Jawab HANYA dengan JSON valid, tanpa teks lain, tanpa markdown, dengan format persis seperti ini:
{{
  "question_text": "teks soal di sini",
  "correct_answer_text": "isi jawaban yang benar, sama persis dengan salah satu option_text di bawah",
  "options": [
    {{"option_code": "A", "option_text": "...", "is_correct": false}},
    {{"option_code": "B", "option_text": "...", "is_correct": false}},
    {{"option_code": "C", "option_text": "...", "is_correct": true}},
    {{"option_code": "D", "option_text": "...", "is_correct": false}}
  ],
  "explanation": "pembahasan singkat di sini"
}}"""


# Pemanggilan AI (Ollama/Gemini/dst) sekarang generik lewat
# ai_providers.call_active_provider() — lihat backend/ai_providers.py.
# Router ini tidak perlu tahu provider mana yang aktif atau
# bagaimana cara memanggilnya.


# =========================================================
# BERSIHKAN NOTASI LATEX DARI HASIL AI
#
# build_ai_prompt() di atas sudah eksplisit meminta AI tidak
# memakai LaTeX, tapi ini TIDAK dijamin selalu dipatuhi — model
# lokal (Ollama) sudah pernah terbukti tidak konsisten mengikuti
# instruksi format (lihat catatan JSON di call_ollama_provider),
# dan model manapun cenderung "reflex" memakai LaTeX untuk soal
# pecahan/hitungan karena itu pola paling umum di data latihnya.
#
# Aplikasi ini TIDAK punya renderer LaTeX di mana pun (form Bank
# Soal cuma <textarea> biasa, halaman siswa mengerjakan tryout
# juga menampilkan question_text apa adanya) — jadi kalau notasi
# LaTeX lolos sampai tersimpan, siswa SD akan melihat teks mentah
# seperti "$2 \\frac{1}{4}$" alih-alih pecahan yang bisa dibaca.
#
# Fungsi ini jadi lapisan pertahanan kedua: menyapu pola LaTeX
# paling umum untuk materi SD (pecahan, akar, kali, bagi, persen,
# delimiter $...$) jadi teks biasa, dijalankan otomatis pada
# question_text, tiap option_text, dan explanation sebelum
# dikembalikan sebagai draft ke guru.
# =========================================================

# \frac{a}{b} DAN varian gaya LaTeX lain yang sering dipakai model AI
# secara bergantian untuk hal yang sama: \dfrac (display style, pecahan
# ditampilkan lebih besar) dan \tfrac (text style, lebih kecil). Ketiganya
# secara visual sama-sama berarti "a per b" untuk kebutuhan aplikasi ini.
_LATEX_FRAC_PATTERN = re.compile(
    r"\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}"
)
_LATEX_SQRT_PATTERN = re.compile(r"\\sqrt\s*\{([^{}]*)\}")
_LATEX_TEXT_PATTERN = re.compile(r"\\text\s*\{([^{}]*)\}")

# Eksponen gaya LaTeX: x^2 atau x^{12} -> ditangkap bagian "2"/"12"-nya
# saja (grup 1), lalu diubah ke superscript unicode oleh
# _to_superscript() di bawah. Tanda "^" itu sendiri (di luar grup)
# otomatis hilang karena diganti oleh hasil sub().
_LATEX_EXPONENT_PATTERN = re.compile(r"\^\{?(-?\d+)\}?")

# Peta digit biasa -> karakter superscript Unicode (bukan markup,
# jadi tampil benar di textarea/HTML/PDF mana pun tanpa renderer).
_SUPERSCRIPT_MAP = str.maketrans(
    "0123456789-",
    "\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u207b",
)


def _to_superscript(match: re.Match) -> str:
    return match.group(1).translate(_SUPERSCRIPT_MAP)


def _clean_ai_math_notation(text: str) -> str:

    if not text:
        return text

    # \frac{1}{4} -> 1/4  (termasuk "2 \frac{1}{4}" -> "2 1/4")
    text = _LATEX_FRAC_PATTERN.sub(r"\1/\2", text)

    # x^2 atau x^{2} -> x²
    text = _LATEX_EXPONENT_PATTERN.sub(_to_superscript, text)

    # \sqrt{9} -> akar(9)
    text = _LATEX_SQRT_PATTERN.sub(r"akar(\1)", text)

    # \text{sisa} -> sisa
    text = _LATEX_TEXT_PATTERN.sub(r"\1", text)

    # Simbol operasi hitung umum
    text = text.replace("\\times", "x")
    text = text.replace("\\cdot", "x")
    text = text.replace("\\div", ":")
    text = text.replace("\\%", "%")

    # Delimiter mode matematika LaTeX ($...$, $$...$$, \(...\), \[...\])
    text = text.replace("$$", "").replace("$", "")
    text = text.replace("\\(", "").replace("\\)", "")
    text = text.replace("\\[", "").replace("\\]", "")

    # Rapikan spasi ganda yang mungkin muncul akibat penghapusan di atas
    text = re.sub(r"[ \t]{2,}", " ", text)

    return text.strip()


# =========================================================
# VERIFIKASI KONSISTENSI JAWABAN (lapisan pertahanan tambahan)
#
# LATAR BELAKANG: correct_count != 1 (di bawah) cuma memastikan
# AI menandai TEPAT SATU opsi sebagai `is_correct: true` — itu
# validasi STRUKTUR. Tapi AI (LLM manapun, Ollama atau Gemini)
# kadang menghasilkan pembahasan ("explanation") yang perhitungan-
# nya benar, namun secara tidak sengaja menandai opsi yang SALAH
# sebagai is_correct=true (inkonsistensi/halusinasi internal model
# itu sendiri) — jadi lolos validasi struktur tapi kunci jawabannya
# tetap salah. Guru yang tidak sempat menghitung ulang manual bisa
# tidak sadar sampai siswa mengerjakan.
#
# STRATEGI (2 TAHAP, supaya tidak selalu menambah biaya/latensi
# panggilan AI ekstra di SETIAP generate soal):
#
#   TAHAP 1 (_check_self_consistency, GRATIS, tanpa panggilan AI
#   tambahan): build_ai_prompt() di atas sudah meminta AI menulis
#   field "correct_answer_text" — jawaban benar versi AI itu sendiri
#   — SEBELUM menyusun daftar opsi. Kita tinggal cocokkan teks itu
#   dengan teks opsi yang ditandai is_correct=true, dari RESPONS
#   YANG SAMA, tanpa network call tambahan. Kalau cocok -> dianggap
#   konsisten, SELESAI (tidak lanjut ke tahap 2). Kalau tidak cocok
#   (atau field-nya kosong) -> baru dianggap "mencurigakan".
#   Catatan jujur: karena masih dari satu forward-pass yang sama,
#   deteksi ini lebih lemah dari verifikasi independen — kalau
#   model konsisten salah di kedua bagian, tidak akan ketangkap.
#
#   TAHAP 2 (_verify_answer_consistency, BERBAYAR, cuma dijalankan
#   kalau tahap 1 mencurigakan): panggil ulang provider AI dengan
#   prompt terpisah yang HANYA berisi teks soal + pilihan (tanpa
#   info opsi mana yang benar), minta dihitung ulang dari awal.
#   Ini yang menghasilkan warning final yang ditampilkan ke guru.
#
# Dengan pola ini, panggilan AI ekstra (tahap 2) hanya terjadi pada
# generate yang memang terindikasi bermasalah, bukan di setiap kali
# tombol "Generate Soal" ditekan.
#
# Di kedua tahap, kalau prosesnya sendiri gagal (timeout, JSON tidak
# valid, dsb), verifikasi DILEWATI SAJA (bukan menggagalkan generate
# soal utama) — ini cuma lapisan tambahan, bukan syarat wajib.
# =========================================================

def _normalize_answer_text(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _check_self_consistency(
    ai_result: dict,
    options: list[dict],
) -> bool:
    """
    TAHAP 1 (gratis). Mengembalikan True kalau ADA indikasi
    mencurigakan (correct_answer_text tidak cocok / kosong) —
    artinya tahap 2 (panggilan AI ekstra) perlu dijalankan.
    Mengembalikan False kalau correct_answer_text sudah cocok
    persis dengan opsi yang ditandai benar (tahap 2 dilewati).
    """

    correct_answer_text = _clean_ai_math_notation(
        str(ai_result.get("correct_answer_text", "")).strip()
    )

    if not correct_answer_text:
        # AI tidak mengisi field ini -> tidak ada dasar untuk
        # memastikan konsisten, anggap mencurigakan supaya lanjut
        # ke tahap 2 (lebih aman daripada diam-diam dilewati).
        return True

    flagged_option = next(
        (option for option in options if option["is_correct"]),
        None,
    )

    if not flagged_option:
        return True

    return _normalize_answer_text(correct_answer_text) != (
        _normalize_answer_text(flagged_option["option_text"])
    )


def _build_verification_prompt(
    question_text: str,
    options: list[dict],
) -> str:

    options_text = "\n".join(
        f"{option['option_code']}. {option['option_text']}"
        for option in options
    )

    return f"""Anda adalah pemeriksa soal yang teliti. Berikut sebuah soal pilihan ganda beserta pilihan jawabannya (TANPA diberi tahu mana yang benar). Hitung/analisis sendiri dari awal, lalu tentukan SATU huruf pilihan yang paling benar.

Soal:
{question_text}

Pilihan:
{options_text}

Jawab HANYA dengan JSON valid, tanpa teks lain, format persis:
{{"correct_option_code": "A"}}"""


async def _verify_answer_consistency(
    db: Session,
    question_text: str,
    options: list[dict],
    flagged_code: str,
) -> str | None:
    """
    TAHAP 2 (panggilan AI ekstra). Mengembalikan pesan warning (str)
    kalau verifikasi ulang tidak sepakat dengan opsi yang sudah
    ditandai benar, atau None kalau sepakat / verifikasi tidak bisa
    dijalankan.
    """

    verification_prompt = _build_verification_prompt(
        question_text, options
    )

    try:

        verification_result = await ai_providers.call_active_provider(
            verification_prompt, db
        )

        verified_code = str(
            verification_result.get("correct_option_code", "")
        ).strip().upper()

    except Exception:

        # Verifikasi cuma lapisan tambahan — kalau gagal (provider
        # error/timeout/JSON tidak valid), jangan gagalkan proses
        # generate soal utama yang sudah berhasil.
        logger.warning(
            "Verifikasi konsistensi jawaban AI (tahap 2) gagal "
            "dijalankan, dilewati.",
            exc_info=True,
        )

        return None

    if verified_code not in ALLOWED_OPTIONS:
        # Verifier tidak menjawab format yang diminta -> tidak
        # cukup andal untuk dijadikan dasar warning, lewati saja.
        return None

    if verified_code == flagged_code:
        return None

    return (
        "Verifikasi otomatis mendeteksi kemungkinan pembahasan "
        f"TIDAK konsisten dengan kunci jawaban: opsi yang ditandai "
        f"benar adalah {flagged_code}, tapi pengecekan ulang oleh AI "
        f"mengarah ke opsi {verified_code}. Mohon hitung/periksa "
        "ulang manual sebelum menyimpan soal ini."
    )


@router.post(
    "/ai-generate/prompt",
    response_model=AIPromptPreviewResponse
)
async def preview_ai_prompt(
    request_data: AIQuestionGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):
    """
    Menyusun teks prompt dari form (mata pelajaran, kesulitan,
    materi, instruksi tambahan) TANPA memanggil Ollama. Dipakai
    frontend untuk menampilkan prompt ke guru supaya bisa
    diperiksa/diedit dulu sebelum tombol "Generate Soal" yang
    sebenarnya ditekan.
    """

    if request_data.difficulty not in ALLOWED_DIFFICULTIES:

        raise HTTPException(
            status_code=400,
            detail="Tingkat kesulitan tidak valid"
        )

    if not request_data.materi.strip():

        raise HTTPException(
            status_code=400,
            detail="Materi / lingkup soal wajib diisi"
        )

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == request_data.subject_id
        )
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

    prompt = build_ai_prompt(
        subject_name=subject.name,
        difficulty=request_data.difficulty,
        materi=request_data.materi,
        additional_instruction=request_data.additional_instruction,
    )

    return AIPromptPreviewResponse(prompt=prompt)


@router.post(
    "/ai-generate",
    response_model=AIQuestionGenerateResponse
)
async def generate_question_ai(
    request_data: AIQuestionGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    if request_data.difficulty not in ALLOWED_DIFFICULTIES:

        raise HTTPException(
            status_code=400,
            detail="Tingkat kesulitan tidak valid"
        )

    if not request_data.materi.strip():

        raise HTTPException(
            status_code=400,
            detail="Materi / lingkup soal wajib diisi"
        )

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == request_data.subject_id
        )
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

    # Kalau guru sudah memeriksa/mengedit prompt di langkah
    # preview, pakai teks itu apa adanya. Kalau tidak (mis. guru
    # skip langsung generate tanpa buka preview), tetap susun
    # otomatis seperti sebelumnya supaya endpoint ini tidak
    # bergantung mutlak pada langkah preview.
    if request_data.prompt and request_data.prompt.strip():

        prompt = request_data.prompt.strip()

    else:

        prompt = build_ai_prompt(
            subject_name=subject.name,
            difficulty=request_data.difficulty,
            materi=request_data.materi,
            additional_instruction=request_data.additional_instruction,
        )

    ai_result = await ai_providers.call_active_provider(prompt, db)

    # -----------------------------------------------------
    # Validasi bentuk hasil AI. Guru tetap akan memeriksa &
    # bisa mengedit semuanya di form sebelum menyimpan, tapi
    # kita pastikan dulu strukturnya (4 opsi A-D) benar supaya
    # tidak ditolak lagi saat disimpan lewat endpoint biasa.
    # -----------------------------------------------------

    question_text = _clean_ai_math_notation(
        str(ai_result.get("question_text", "")).strip()
    )

    if not question_text:

        raise HTTPException(
            status_code=502,
            detail="AI tidak menghasilkan teks soal. Coba generate ulang."
        )

    raw_options = ai_result.get("options", [])

    if (
        not isinstance(raw_options, list)
        or len(raw_options) != len(ALLOWED_OPTIONS)
    ):

        raise HTTPException(
            status_code=502,
            detail=(
                f"AI tidak menghasilkan {len(ALLOWED_OPTIONS)} pilihan "
                "jawaban. Coba generate ulang."
            )
        )

    options = []
    seen_codes = set()
    seen_texts = set()
    correct_count = 0

    for raw_option in raw_options:

        if not isinstance(raw_option, dict):

            raise HTTPException(
                status_code=502,
                detail=(
                    "Format pilihan jawaban dari AI tidak valid. "
                    "Coba generate ulang."
                )
            )

        code = str(
            raw_option.get("option_code", "")
        ).strip().upper()

        text = _clean_ai_math_notation(
            str(raw_option.get("option_text", "")).strip()
        )

        is_correct = bool(
            raw_option.get("is_correct", False)
        )

        if (
            code not in ALLOWED_OPTIONS
            or code in seen_codes
            or not text
        ):

            raise HTTPException(
                status_code=502,
                detail=(
                    "Format pilihan jawaban dari AI tidak valid. "
                    "Coba generate ulang."
                )
            )

        # Normalisasi teks (huruf kecil semua, spasi berlebih
        # dirapikan) sebelum dibandingkan, supaya "Matahari" dan
        # "matahari " tetap terdeteksi sebagai jawaban yang sama.
        normalized_text = " ".join(text.lower().split())

        if normalized_text in seen_texts:

            raise HTTPException(
                status_code=502,
                detail=(
                    "AI menghasilkan dua pilihan jawaban dengan teks "
                    "yang sama. Coba generate ulang."
                )
            )

        seen_texts.add(normalized_text)

        seen_codes.add(code)

        if is_correct:
            correct_count += 1

        options.append({
            "option_code": code,
            "option_text": text,
            "is_correct": is_correct,
        })

    if seen_codes != set(ALLOWED_OPTIONS):

        raise HTTPException(
            status_code=502,
            detail=(
                "Pilihan jawaban dari AI tidak lengkap (harus A-D). "
                "Coba generate ulang."
            )
        )

    # -----------------------------------------------------
    # Pastikan AI menandai TEPAT SATU jawaban benar. Kalau
    # dibiarkan lolos (0 atau lebih dari 1 is_correct=True),
    # guru baru akan tahu masalahnya nanti saat coba simpan
    # lewat POST /api/questions dan ditolak validate_question_data
    # — pesan errornya jadi kurang jelas asalnya dari mana. Di
    # sini kita tolak lebih awal dengan pesan yang eksplisit.
    # -----------------------------------------------------

    if correct_count != 1:

        raise HTTPException(
            status_code=502,
            detail=(
                "AI menghasilkan jumlah jawaban benar yang tidak valid "
                f"({correct_count} opsi ditandai benar, seharusnya tepat "
                "1). Coba generate ulang."
            )
        )

    # -----------------------------------------------------
    # Acak urutan opsi & tulis ulang kode A-D berdasarkan urutan
    # baru itu. Tanpa ini, posisi jawaban benar mengikuti apa
    # adanya keluaran AI, yang cenderung bias ke posisi tertentu
    # (mis. sering di C) — siswa bisa menebak pola tanpa paham
    # materi. random.shuffle() menjamin distribusi yang jauh
    # lebih adil dibanding mengandalkan variasi dari model AI.
    # -----------------------------------------------------

    random.shuffle(options)

    for index, option in enumerate(options):
        option["option_code"] = ALLOWED_OPTIONS[index]

    explanation = _clean_ai_math_notation(
        str(ai_result.get("explanation", "")).strip()
    ) or None

    # -----------------------------------------------------
    # Verifikasi konsistensi jawaban, 2 tahap (lihat penjelasan
    # lengkap di komentar _check_self_consistency /
    # _verify_answer_consistency di atas):
    #   Tahap 1 (gratis) dulu -> tahap 2 (panggilan AI ekstra)
    #   HANYA kalau tahap 1 mencurigakan. Tidak memblokir — cuma
    #   menambahkan warning ke draft yang dikembalikan.
    # -----------------------------------------------------

    flagged_code = next(
        option["option_code"]
        for option in options
        if option["is_correct"]
    )

    if _check_self_consistency(ai_result, options):

        consistency_warning = await _verify_answer_consistency(
            db, question_text, options, flagged_code,
        )

    else:

        consistency_warning = None

    return AIQuestionGenerateResponse(
        subject_id=subject.id,
        question_text=question_text,
        question_type="MULTIPLE_CHOICE",
        difficulty=request_data.difficulty,
        explanation=explanation,
        points=1,
        options=options,
        consistency_warning=consistency_warning,
    )


# =========================================================
# IMPOR SOAL DARI DOKUMEN (PDF/DOCX/TXT)
#
# BEDA dari generate_question_ai() di atas: di sini AI TIDAK
# diminta membuat soal baru, hanya membaca ulang teks yang
# diupload guru dan menstrukturkannya. Dipecah jadi beberapa
# chunk (lihat document_parser.py) supaya dokumen berisi banyak
# soal tidak melebihi batas konteks provider AI (terutama Ollama
# lokal, num_ctx-nya kecil) dalam satu panggilan.
#
# Pendekatan di sini SENGAJA lebih longgar (lenient) dibanding
# generate_question_ai(): kalau satu soal hasil ekstraksi kurang
# lengkap (mis. opsi jawaban kurang dari 5, atau jawaban benar
# tidak terdeteksi jelas dari dokumen aslinya), soal itu TETAP
# dikembalikan dengan field `warning` terisi — bukan langsung
# ditolak — karena kualitas dokumen sumber sepenuhnya di luar
# kendali sistem. Guru tetap memeriksa/melengkapi tiap soal di
# layar review sebelum benar-benar disimpan lewat endpoint
# POST /api/questions biasa (yang validasinya tetap ketat).
# =========================================================

def _get_active_subject_or_404(db: Session, subject_id: int) -> Subject:
    """
    Dipakai KEDUA endpoint baru di bawah (prepare & process-chunk)
    supaya validasi mata pelajaran konsisten di keduanya —
    process_document_chunk() tidak bisa mengandalkan hasil validasi
    dari prepare_document_extraction() karena keduanya request
    HTTP terpisah (stateless), jadi validasinya perlu diulang.
    """

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == subject_id
        )
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

    return subject


def build_document_extract_prompt(subject_name: str, chunk_text: str) -> str:

    return f"""Anda sedang membantu seorang guru mata pelajaran {subject_name} memindahkan soal-soal PILIHAN GANDA yang SUDAH ADA di sebuah dokumen lama ke sistem baru.

PENTING: Anda TIDAK membuat soal baru. Tugas Anda HANYA membaca teks di bawah ini dan menyalin ulang setiap soal pilihan ganda yang benar-benar ADA di dalamnya, apa adanya, ke dalam format JSON. Jangan mengarang, mengubah, atau menambah isi soal/opsi/pembahasan.

Teks dokumen (satu potongan, mungkin berisi beberapa soal):
---
{chunk_text}
---

Untuk SETIAP soal pilihan ganda yang Anda temukan di teks di atas (bisa 0 kalau memang tidak ada soal valid di potongan ini):
- Salin teks soalnya persis seperti di dokumen ke "question_text".
- Salin SEMUA pilihan jawaban yang ada (boleh kurang dari 4 kalau memang begitu di dokumen aslinya) ke "options", masing-masing dengan "option_code" (huruf sesuai dokumen, atau A/B/C/D berurutan kalau dokumen tidak memberi huruf) dan "option_text".
- Kalau dokumen menyertakan kunci jawaban (mis. tertulis "Jawaban: C" atau huruf yang ditandai tebal/khusus), tandai opsi itu dengan "is_correct": true. Kalau TIDAK ada info kunci jawaban yang jelas di teks, biarkan SEMUA opsi "is_correct": false — jangan menebak.
- Kalau ada pembahasan/kunci penjelasan di dokumen, salin ke "explanation". Kalau tidak ada, isi string kosong.

Jawab HANYA dengan JSON valid, tanpa teks lain, tanpa markdown, format persis seperti ini:
{{
  "questions": [
    {{
      "question_text": "...",
      "options": [
        {{"option_code": "A", "option_text": "...", "is_correct": false}}
      ],
      "explanation": ""
    }}
  ]
}}"""


def _normalize_extracted_options(
    raw_options,
) -> tuple[list[dict], str | None]:
    """
    Versi LONGGAR dari validasi opsi di generate_question_ai(): tidak
    pernah melempar exception, selalu mengembalikan tepat
    len(ALLOWED_OPTIONS) slot opsi A-D (dilengkapi placeholder kosong
    kalau dokumen sumber kurang dari itu) beserta pesan `warning`
    kalau ada yang perlu diperiksa manual oleh guru.
    """

    warnings: list[str] = []

    options_by_code: dict[str, dict] = {}

    if isinstance(raw_options, list):

        for raw_option in raw_options:

            if not isinstance(raw_option, dict):
                continue

            code = str(
                raw_option.get("option_code", "")
            ).strip().upper()

            text = _clean_ai_math_notation(
                str(raw_option.get("option_text", "")).strip()
            )

            if (
                code not in ALLOWED_OPTIONS
                or not text
                or code in options_by_code
            ):
                continue

            options_by_code[code] = {
                "option_code": code,
                "option_text": text,
                "is_correct": bool(raw_option.get("is_correct", False)),
            }

    missing_codes = [
        code for code in ALLOWED_OPTIONS if code not in options_by_code
    ]

    if missing_codes:

        warnings.append(
            "Pilihan "
            + ", ".join(missing_codes)
            + " tidak ditemukan di dokumen, lengkapi manual."
        )

    correct_count = sum(
        1 for option in options_by_code.values() if option["is_correct"]
    )

    if correct_count != 1:

        # Jangan menebak jawaban benar kalau dokumen tidak
        # memberikan info yang jelas / ambigu (lebih dari satu opsi
        # ditandai benar). Semua opsi dikembalikan is_correct=False
        # supaya guru WAJIB menandai manual, alih-alih diam-diam
        # memakai tebakan yang bisa salah.
        for option in options_by_code.values():
            option["is_correct"] = False

        warnings.append(
            "Jawaban benar tidak terdeteksi dengan pasti dari "
            "dokumen, tandai manual sebelum menyimpan."
        )

    ordered_options = [
        options_by_code.get(
            code,
            {"option_code": code, "option_text": "", "is_correct": False},
        )
        for code in ALLOWED_OPTIONS
    ]

    warning_text = " ".join(warnings) if warnings else None

    return ordered_options, warning_text


@router.post(
    "/ai-extract-document/prepare",
    response_model=AIDocumentPrepareResponse
)
async def prepare_document_extraction(
    subject_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):
    """
    LANGKAH 1 dari 2 (lihat process_document_chunk di bawah untuk
    langkah 2). Endpoint ini HANYA membaca file & memecahnya jadi
    beberapa potongan teks — TIDAK memanggil AI sama sekali, jadi
    cepat dan tidak berisiko timeout. Guru upload file SEKALI di
    sini, lalu frontend memproses tiap potongan teks yang
    dikembalikan satu-per-satu lewat /ai-extract-document/process-chunk
    (JSON biasa, bukan upload file lagi).

    Dipecah jadi 2 endpoint (bukan 1 seperti sebelumnya) supaya
    kalau AI gagal/lambat di tengah proses, hasil dari potongan
    yang SUDAH selesai tidak ikut hilang — masing-masing potongan
    adalah request terpisah, hasilnya langsung diterima frontend
    begitu selesai.
    """

    subject = _get_active_subject_or_404(db, subject_id)

    raw_text = await document_parser.extract_text_from_upload(file)

    blocks = document_parser.split_into_question_blocks(raw_text)

    # Ukuran chunk MENYESUAIKAN provider AI yang sedang aktif (kecil
    # untuk Ollama lokal, besar untuk Gemini cloud) — lihat
    # ai_providers.get_extract_chunk_chars() untuk alasannya.
    chunk_chars = ai_providers.get_extract_chunk_chars(db)

    block_groups = document_parser.chunk_blocks(
        blocks, max_chars_per_chunk=chunk_chars
    )

    chunks = [
        AIDocumentChunk(
            chunk_text="\n\n".join(group),
            expected_count=len(group),
        )
        for group in block_groups
    ]

    return AIDocumentPrepareResponse(
        subject_id=subject.id,
        subject_name=subject.name,
        chunks=chunks,
    )


@router.post(
    "/ai-extract-document/process-chunk",
    response_model=AIChunkProcessResponse
)
async def process_document_chunk(
    payload: AIChunkProcessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):
    """
    LANGKAH 2 dari 2. Memproses SATU potongan teks (hasil langkah 1
    di atas) lewat AI, mengembalikan soal-soal yang berhasil
    dikenali dari potongan itu saja. Stateless — endpoint ini tidak
    menyimpan progres apa pun di server, frontend yang bertanggung
    jawab memanggil endpoint ini berulang kali untuk tiap potongan
    dan menggabungkan hasilnya di layar.

    Endpoint ini sendiri TIDAK menyimpan soal ke database — sama
    seperti sebelumnya, guru tetap memeriksa & menekan simpan lewat
    POST /api/questions per soal di layar review.
    """

    subject = _get_active_subject_or_404(db, payload.subject_id)

    prompt = build_document_extract_prompt(
        subject_name=subject.name,
        chunk_text=payload.chunk_text,
    )

    try:

        # larger_output=True: satu chunk di sini bisa berisi
        # BEBERAPA soal sekaligus, beda dari generate_question_ai
        # yang outputnya selalu 1 soal — lihat penjelasan di
        # ai_providers.call_ollama_provider/call_gemini_provider.
        ai_result = await ai_providers.call_active_provider(
            prompt, db, larger_output=True
        )

        raw_questions = ai_result.get("questions", [])

        if not isinstance(raw_questions, list):
            raise ValueError("'questions' bukan berupa list")

    except HTTPException:

        # Provider AI melempar error eksplisit (mis. Ollama tidak
        # jalan, Gemini API key salah) — ini masalah konfigurasi,
        # bukan sekadar satu potongan dokumen yang sulit
        # di-parsing, jadi diteruskan apa adanya supaya guru tahu
        # akar masalahnya alih-alih melihat hasil kosong yang
        # membingungkan. Frontend berhenti memproses chunk
        # berikutnya kalau ini terjadi (lihat QuestionManagement.jsx)
        # karena kemungkinan besar chunk lain juga akan gagal
        # dengan alasan yang sama.
        raise

    except Exception:

        logger.warning(
            "Gagal mem-parsing hasil AI untuk satu potongan "
            "dokumen, potongan ini dilewati.",
            exc_info=True,
        )

        return AIChunkProcessResponse(
            questions=[],
            skipped_count=payload.expected_count,
        )

    extracted_questions: list[AIExtractedQuestion] = []

    produced_count = 0

    for raw_question in raw_questions:

        if not isinstance(raw_question, dict):
            continue

        question_text = _clean_ai_math_notation(
            str(raw_question.get("question_text", "")).strip()
        )

        if not question_text:
            continue

        options, options_warning = _normalize_extracted_options(
            raw_question.get("options", [])
        )

        explanation = _clean_ai_math_notation(
            str(raw_question.get("explanation", "")).strip()
        ) or None

        extracted_questions.append(
            AIExtractedQuestion(
                question_text=question_text,
                difficulty="MEDIUM",
                explanation=explanation,
                points=1,
                options=options,
                warning=options_warning,
            )
        )

        produced_count += 1

    # Perkiraan kasar: kalau AI menghasilkan soal lebih sedikit dari
    # jumlah blok yang "dijanjikan" chunk ini (expected_count, dari
    # langkah 1), anggap sisanya gagal terdeteksi (mis. blok itu
    # ternyata bukan soal PG, atau AI melewatkannya). Bukan angka
    # pasti, tapi cukup untuk memberi sinyal ke guru bahwa ada
    # bagian dokumen yang perlu dicek manual.
    skipped_count = max(0, payload.expected_count - produced_count)

    return AIChunkProcessResponse(
        questions=extracted_questions,
        skipped_count=skipped_count,
    )


# =========================================================
# CREATE QUESTION
# =========================================================

@router.post(
    "",
    response_model=QuestionResponse
)
def create_question(
    question_data: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    validate_question_data(question_data)

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == question_data.subject_id
        )
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

    question = Question(
        subject_id=question_data.subject_id,
        question_text=question_data.question_text.strip(),
        question_type=question_data.question_type,
        difficulty=question_data.difficulty,
        explanation=question_data.explanation,
        points=question_data.points,
        is_active=question_data.is_active,
        created_by=current_user.id
    )

    db.add(question)
    db.flush()

    for option_data in question_data.options:

        option = QuestionOption(
            question_id=question.id,
            option_code=
                option_data.option_code.strip().upper(),
            option_text=
                option_data.option_text.strip(),
            is_correct=
                option_data.is_correct
        )

        db.add(option)

    db.commit()
    db.refresh(question)

    question.options = (
        db.query(QuestionOption)
        .filter(
            QuestionOption.question_id ==
            question.id
        )
        .order_by(
            QuestionOption.option_code
        )
        .all()
    )

    return question


# =========================================================
# UPDATE QUESTION
# =========================================================

@router.put(
    "/{question_id}",
    response_model=QuestionResponse
)
def update_question(
    question_id: int,
    question_data: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):

    validate_question_data(question_data)

    question = (
        db.query(Question)
        .filter(
            Question.id == question_id
        )
        .first()
    )

    if not question:

        raise HTTPException(
            status_code=404,
            detail="Soal tidak ditemukan"
        )

    subject = (
        db.query(Subject)
        .filter(
            Subject.id == question_data.subject_id
        )
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
    # Cegah menonaktifkan soal yang masih dipakai di tryout
    # -----------------------------------------------------

    if question.is_active and not question_data.is_active:

        tryout_titles = get_tryout_titles_using_question(
            db, question.id
        )

        if tryout_titles:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Soal ini tidak dapat dinonaktifkan karena masih "
                    "digunakan pada tryout: "
                    + ", ".join(f'"{title}"' for title in tryout_titles)
                    + ". Hapus soal ini dari tryout tersebut terlebih dahulu."
                )
            )

    question.subject_id = (
        question_data.subject_id
    )

    question.question_text = (
        question_data.question_text.strip()
    )

    question.question_type = (
        question_data.question_type
    )

    question.difficulty = (
        question_data.difficulty
    )

    question.explanation = (
        question_data.explanation
    )

    question.points = (
        question_data.points
    )

    question.is_active = (
        question_data.is_active
    )

    # Hapus pilihan lama
    db.query(QuestionOption).filter(
        QuestionOption.question_id ==
        question.id
    ).delete(
        synchronize_session=False
    )

    # Masukkan pilihan baru
    for option_data in question_data.options:

        option = QuestionOption(
            question_id=question.id,
            option_code=
                option_data.option_code.strip().upper(),
            option_text=
                option_data.option_text.strip(),
            is_correct=
                option_data.is_correct
        )

        db.add(option)

    db.commit()
    db.refresh(question)

    question.options = (
        db.query(QuestionOption)
        .filter(
            QuestionOption.question_id ==
            question.id
        )
        .order_by(
            QuestionOption.option_code
        )
        .all()
    )

    return question


# =========================================================
# DELETE QUESTION
# =========================================================

@router.delete("/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):

    question = (
        db.query(Question)
        .filter(
            Question.id == question_id
        )
        .first()
    )

    if not question:

        raise HTTPException(
            status_code=404,
            detail="Soal tidak ditemukan"
        )

    # -----------------------------------------------------
    # Cegah menghapus soal yang masih dipakai di tryout
    # -----------------------------------------------------

    tryout_titles = get_tryout_titles_using_question(
        db, question.id
    )

    if tryout_titles:

        raise HTTPException(
            status_code=400,
            detail=(
                "Soal ini tidak dapat dihapus karena masih "
                "digunakan pada tryout: "
                + ", ".join(f'"{title}"' for title in tryout_titles)
                + ". Hapus soal ini dari tryout tersebut terlebih dahulu."
            )
        )

    # -----------------------------------------------------
    # Cegah menghapus soal yang sudah pernah dijawab siswa
    #
    # Soal bisa saja sudah dilepas dari semua tryout (lolos
    # pengecekan di atas) tapi t_answer masih menyimpan
    # jawaban siswa yang menunjuk ke soal ini. Kalau soal
    # tetap dihapus, baris t_answer tersebut jadi yatim dan
    # riwayat/nilai siswa yang bersangkutan jadi tidak valid.
    # -----------------------------------------------------

    answer_count = (
        db.query(Answer)
        .filter(Answer.question_id == question.id)
        .count()
    )

    if answer_count > 0:

        raise HTTPException(
            status_code=400,
            detail=(
                "Soal ini tidak dapat dihapus karena sudah pernah "
                f"dijawab siswa ({answer_count} jawaban tercatat). "
                "Nonaktifkan soal ini saja alih-alih menghapusnya."
            )
        )

    db.query(QuestionOption).filter(
        QuestionOption.question_id ==
        question.id
    ).delete(
        synchronize_session=False
    )

    db.delete(question)

    db.commit()

    return {
        "success": True,
        "message": "Soal berhasil dihapus"
    }
