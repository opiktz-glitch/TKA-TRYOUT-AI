import json
import random

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import OLLAMA_BASE_URL, GEMINI_BASE_URL
from routers.settings import (
    get_active_ollama_model,
    get_active_provider,
    get_gemini_api_key,
    get_active_gemini_model,
)
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
    AIPromptPreviewResponse
)
from dependencies import require_role


router = APIRouter(
    prefix="/api/questions",
    tags=["Questions"]
)


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
    "D",
    "E"
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

    if len(question_data.options) != 5:
        raise HTTPException(
            status_code=400,
            detail="Soal pilihan ganda harus memiliki 5 pilihan"
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
            detail="Pilihan harus terdiri dari A, B, C, D, dan E"
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
- Pilihan Jawaban: Kelima pilihan (A-E) harus berisi teks yang BERBEDA satu sama lain, jangan ada dua pilihan dengan isi yang sama persis atau hanya beda kata sedikit tapi maknanya identik.
{instruction_line}

Soal harus memiliki tepat 5 pilihan jawaban dengan kode A, B, C, D, E, dan hanya SATU pilihan yang benar. Sertakan juga pembahasan singkat yang menjelaskan kenapa jawaban itu benar.

Jawab HANYA dengan JSON valid, tanpa teks lain, tanpa markdown, dengan format persis seperti ini:
{{
  "question_text": "teks soal di sini",
  "options": [
    {{"option_code": "A", "option_text": "...", "is_correct": false}},
    {{"option_code": "B", "option_text": "...", "is_correct": false}},
    {{"option_code": "C", "option_text": "...", "is_correct": true}},
    {{"option_code": "D", "option_text": "...", "is_correct": false}},
    {{"option_code": "E", "option_text": "...", "is_correct": false}}
  ],
  "explanation": "pembahasan singkat di sini"
}}"""


async def call_ollama(prompt: str, model: str) -> dict:

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "format": "json",
        "stream": False,
        # Ollama otomatis melepas model dari memori setelah idle
        # (default 5 menit). Kalau itu terjadi, request berikutnya
        # harus load ulang model dari disk dulu sebelum bisa mulai
        # generate — ini sering jadi penyebab "kadang cepat, kadang
        # lambat banget" yang tidak konsisten. keep_alive membuat
        # model tetap di memori lebih lama supaya generate berikutnya
        # langsung mulai tanpa nunggu load ulang.
        "keep_alive": "30m",
        "options": {
            # Batas keras jumlah token yang boleh di-generate. Prompt
            # cuma "meminta" ringkas, tapi model tetap bisa menulis
            # lebih panjang dari itu. num_predict memaksa Ollama
            # berhenti setelah token ini habis, apa pun isinya —
            # soal + 5 opsi + penjelasan singkat harusnya cukup
            # dengan batas ini, jadi waktu generate jadi jauh lebih
            # terprediksi dan tidak bisa "kabur" jadi sangat lama.
            "num_predict": 600,
            # Prompt kita pendek dan outputnya dibatasi 600 token,
            # jadi context sebesar itu tidak perlu. Tanpa ini, Ollama
            # bisa pakai context window default yang jauh lebih besar
            # dari kebutuhan sebenarnya, yang berarti alokasi memori
            # & komputasi ekstra yang sia-sia (terutama kalau jalan
            # di CPU tanpa GPU).
            "num_ctx": 2048,
        },
    }

    try:

        async with httpx.AsyncClient(timeout=120.0) as client:

            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=payload
            )

        response.raise_for_status()

    except httpx.ConnectError:

        raise HTTPException(
            status_code=503,
            detail=(
                f"Tidak dapat terhubung ke Ollama di {OLLAMA_BASE_URL}. "
                "Pastikan Ollama sudah berjalan di laptop Anda (buka "
                "aplikasi Ollama atau jalankan 'ollama serve'), dan "
                f"model '{model}' sudah di-pull "
                f"('ollama pull {model}')."
            )
        )

    except httpx.TimeoutException:

        raise HTTPException(
            status_code=504,
            detail=(
                "AI terlalu lama merespons (lebih dari 2 menit). "
                "Coba lagi, atau gunakan model Ollama yang lebih ringan."
            )
        )

    except httpx.HTTPStatusError as exc:

        raise HTTPException(
            status_code=502,
            detail=(
                "Ollama mengembalikan error: "
                + exc.response.text[:200]
            )
        )

    data = response.json()

    content = data.get("message", {}).get("content", "")

    try:

        parsed = json.loads(content)

    except (json.JSONDecodeError, TypeError):

        raise HTTPException(
            status_code=502,
            detail=(
                "Hasil AI tidak berupa JSON yang valid. "
                "Coba generate ulang."
            )
        )

    return parsed


async def call_gemini(prompt: str, api_key: str, model: str) -> dict:
    """
    Sama seperti call_ollama, tapi memanggil Google Gemini API.
    Dipakai kalau provider AI aktif = GEMINI (dipilih admin di
    Pengaturan). API key diambil dari database (t_app_setting),
    bukan dari .env, supaya admin bisa gonta-ganti key kapan saja
    tanpa restart server.
    """

    payload = {
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            # Setara dengan num_predict di Ollama — batas token
            # keluaran supaya soal + 5 opsi + pembahasan singkat
            # tetap ringkas & waktu respons terprediksi.
            "maxOutputTokens": 800,
        },
    }

    try:

        async with httpx.AsyncClient(timeout=60.0) as client:

            response = await client.post(
                f"{GEMINI_BASE_URL}/models/{model}:generateContent",
                params={"key": api_key},
                json=payload,
            )

        response.raise_for_status()

    except httpx.ConnectError:

        raise HTTPException(
            status_code=503,
            detail=(
                "Tidak dapat terhubung ke Gemini. Periksa koneksi internet "
                "server, atau hubungi admin untuk memeriksa Pengaturan AI."
            )
        )

    except httpx.TimeoutException:

        raise HTTPException(
            status_code=504,
            detail="Gemini terlalu lama merespons. Coba lagi beberapa saat lagi."
        )

    except httpx.HTTPStatusError as exc:

        if exc.response.status_code in (400, 401, 403):

            raise HTTPException(
                status_code=502,
                detail=(
                    "Gemini menolak permintaan (API key tidak valid/expired "
                    "atau kuota habis). Hubungi admin untuk memeriksa API key "
                    "Gemini di halaman Pengaturan."
                )
            )

        raise HTTPException(
            status_code=502,
            detail="Gemini mengembalikan error: " + exc.response.text[:200]
        )

    data = response.json()

    candidates = data.get("candidates") or []

    if not candidates:

        # Bisa terjadi kalau konten diblokir filter keamanan Gemini
        # (finishReason "SAFETY") — guru perlu diberi tahu supaya
        # tidak bingung kenapa hasilnya kosong.
        raise HTTPException(
            status_code=502,
            detail=(
                "Gemini tidak menghasilkan jawaban (kemungkinan konten "
                "ditolak filter keamanan). Coba ubah materi/instruksi lalu "
                "generate ulang."
            )
        )

    parts = candidates[0].get("content", {}).get("parts", [])

    content = "".join(
        part.get("text", "") for part in parts if isinstance(part, dict)
    )

    try:

        parsed = json.loads(content)

    except (json.JSONDecodeError, TypeError):

        raise HTTPException(
            status_code=502,
            detail=(
                "Hasil AI tidak berupa JSON yang valid. "
                "Coba generate ulang."
            )
        )

    return parsed


async def call_ai(prompt: str, db: Session) -> dict:
    """
    Dispatcher: arahkan pemanggilan ke provider AI yang sedang
    aktif (diatur admin lewat halaman Pengaturan > Model AI).
    Baik endpoint preview maupun generate memakai fungsi ini
    supaya logika pemilihan provider hanya ada di satu tempat.
    """

    active_provider = get_active_provider(db)

    if active_provider == "GEMINI":

        api_key = get_gemini_api_key(db)

        if not api_key:

            raise HTTPException(
                status_code=503,
                detail=(
                    "API key Gemini belum diatur. Hubungi admin untuk "
                    "mengisinya di halaman Pengaturan > Model AI."
                )
            )

        model = get_active_gemini_model(db)

        return await call_gemini(prompt, api_key, model)

    active_model = get_active_ollama_model(db)

    return await call_ollama(prompt, active_model)


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

    ai_result = await call_ai(prompt, db)

    # -----------------------------------------------------
    # Validasi bentuk hasil AI. Guru tetap akan memeriksa &
    # bisa mengedit semuanya di form sebelum menyimpan, tapi
    # kita pastikan dulu strukturnya (5 opsi A-E) benar supaya
    # tidak ditolak lagi saat disimpan lewat endpoint biasa.
    # -----------------------------------------------------

    question_text = str(
        ai_result.get("question_text", "")
    ).strip()

    if not question_text:

        raise HTTPException(
            status_code=502,
            detail="AI tidak menghasilkan teks soal. Coba generate ulang."
        )

    raw_options = ai_result.get("options", [])

    if not isinstance(raw_options, list) or len(raw_options) != 5:

        raise HTTPException(
            status_code=502,
            detail=(
                "AI tidak menghasilkan 5 pilihan jawaban. "
                "Coba generate ulang."
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

        text = str(
            raw_option.get("option_text", "")
        ).strip()

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
                "Pilihan jawaban dari AI tidak lengkap (harus A-E). "
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
    # Acak urutan opsi & tulis ulang kode A-E berdasarkan urutan
    # baru itu. Tanpa ini, posisi jawaban benar mengikuti apa
    # adanya keluaran AI, yang cenderung bias ke posisi tertentu
    # (mis. sering di C) — siswa bisa menebak pola tanpa paham
    # materi. random.shuffle() menjamin distribusi yang jauh
    # lebih adil dibanding mengandalkan variasi dari model AI.
    # -----------------------------------------------------

    random.shuffle(options)

    for index, option in enumerate(options):
        option["option_code"] = ALLOWED_OPTIONS[index]

    explanation = str(
        ai_result.get("explanation", "")
    ).strip() or None

    return AIQuestionGenerateResponse(
        subject_id=subject.id,
        question_text=question_text,
        question_type="MULTIPLE_CHOICE",
        difficulty=request_data.difficulty,
        explanation=explanation,
        points=1,
        options=options,
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
