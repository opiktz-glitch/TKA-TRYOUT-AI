import io
import logging
import re

from docx import Document as DocxDocument
from fastapi import HTTPException, UploadFile
from pypdf import PdfReader


logger = logging.getLogger(__name__)


# =========================================================
# EKSTRAKSI TEKS DARI DOKUMEN (PDF/DOCX/TXT)
#
# Dipakai fitur "Impor Soal dari Dokumen" (routers/questions.py,
# endpoint POST /ai-extract-document). Guru upload dokumen yang
# ISINYA SUDAH BERISI SOAL JADI (bukan bahan ajar mentah) — modul
# ini HANYA bertugas menarik teks mentahnya keluar dari file,
# TIDAK melakukan parsing/pemahaman soal. Pemahaman "mana teks
# soal, mana opsi A-E" dilakukan AI lewat prompt di questions.py,
# bukan di sini — supaya modul ini tetap sederhana & tidak
# tergantung format dokumen tertentu.
# =========================================================

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB, cukup longgar untuk dokumen soal teks biasa

ALLOWED_EXTENSIONS = (".pdf", ".docx", ".txt")

# Batas jumlah karakter teks yang diambil dari SATU dokumen, supaya
# dokumen yang kelewat panjang (mis. salah upload buku pelajaran
# utuh, bukan kumpulan soal) tidak menghasilkan puluhan chunk yang
# masing-masing memanggil AI (lambat & boros kuota/biaya). Guru akan
# melihat pesan jelas kalau batas ini kepotong (lihat
# extract_text_from_upload).
MAX_TOTAL_CHARS = 60_000


def _get_extension(filename: str | None) -> str:

    if not filename or "." not in filename:
        return ""

    return "." + filename.rsplit(".", 1)[-1].lower()


def _extract_pdf_text(raw_bytes: bytes) -> str:

    try:

        reader = PdfReader(io.BytesIO(raw_bytes))

        pages_text = [
            (page.extract_text() or "")
            for page in reader.pages
        ]

    except Exception:

        logger.warning(
            "Gagal membaca file PDF (kemungkinan rusak/terenkripsi/"
            "hasil scan tanpa teks)",
            exc_info=True,
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Gagal membaca file PDF. Pastikan file tidak rusak, "
                "tidak dikunci password, dan bukan hasil scan gambar "
                "tanpa lapisan teks (perlu OCR dulu)."
            )
        )

    return "\n\n".join(text for text in pages_text if text.strip())


def _extract_docx_text(raw_bytes: bytes) -> str:

    try:

        document = DocxDocument(io.BytesIO(raw_bytes))

        # Ambil teks dari paragraf BIASA maupun dari isi tabel — banyak
        # soal ditulis dalam bentuk tabel (mis. kolom "Soal" / "Opsi").
        paragraph_texts = [
            paragraph.text
            for paragraph in document.paragraphs
            if paragraph.text.strip()
        ]

        table_texts = [
            cell.text
            for table in document.tables
            for row in table.rows
            for cell in row.cells
            if cell.text.strip()
        ]

    except Exception:

        logger.warning(
            "Gagal membaca file DOCX (kemungkinan rusak atau bukan "
            "format .docx yang valid)",
            exc_info=True,
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Gagal membaca file Word (.docx). Pastikan file tidak "
                "rusak dan benar-benar berformat .docx (bukan .doc lama)."
            )
        )

    return "\n\n".join(paragraph_texts + table_texts)


def _extract_txt_text(raw_bytes: bytes) -> str:

    try:

        return raw_bytes.decode("utf-8")

    except UnicodeDecodeError:

        # File .txt yang disimpan dengan encoding selain UTF-8 (mis.
        # Notepad Windows lama pakai cp1252). Dicoba sekali lagi
        # dengan mode "ignore" daripada langsung gagal total.
        logger.warning(
            "File TXT bukan UTF-8, dibaca ulang dengan errors='ignore'"
        )

        return raw_bytes.decode("utf-8", errors="ignore")


async def extract_text_from_upload(file: UploadFile) -> str:
    """
    Titik masuk utama modul ini. Menentukan cara ekstraksi dari
    ekstensi file, lalu mengembalikan teks mentah (sudah dipotong ke
    MAX_TOTAL_CHARS kalau perlu). Melempar HTTPException(400) untuk
    semua kondisi gagal yang sudah diantisipasi (format tidak
    didukung, file kosong, file rusak, dst).
    """

    extension = _get_extension(file.filename)

    if extension not in ALLOWED_EXTENSIONS:

        raise HTTPException(
            status_code=400,
            detail=(
                "Format file tidak didukung. Gunakan file "
                ".pdf, .docx, atau .txt."
            )
        )

    raw_bytes = await file.read()

    if not raw_bytes:

        raise HTTPException(
            status_code=400,
            detail="File kosong."
        )

    if len(raw_bytes) > MAX_FILE_SIZE_BYTES:

        raise HTTPException(
            status_code=400,
            detail=(
                "Ukuran file terlalu besar (maksimal "
                f"{MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB)."
            )
        )

    if extension == ".pdf":
        text = _extract_pdf_text(raw_bytes)
    elif extension == ".docx":
        text = _extract_docx_text(raw_bytes)
    else:
        text = _extract_txt_text(raw_bytes)

    text = text.strip()

    if not text:

        raise HTTPException(
            status_code=400,
            detail=(
                "Tidak ada teks yang bisa dibaca dari file ini. Kalau "
                "file PDF hasil scan gambar, perlu di-OCR dulu sebelum "
                "diupload."
            )
        )

    if len(text) > MAX_TOTAL_CHARS:

        text = text[:MAX_TOTAL_CHARS]

        logger.info(
            "Teks dokumen dipotong ke %d karakter (batas MAX_TOTAL_CHARS)",
            MAX_TOTAL_CHARS,
        )

    return text


# =========================================================
# CHUNKING
#
# Dipecah per BLOK SOAL, bukan per jumlah karakter kaku, supaya
# satu soal beserta seluruh opsinya tidak pernah terpotong di
# tengah antara dua chunk yang berbeda (kalau itu terjadi, chunk
# pertama akan kehilangan sebagian opsi jawaban dan AI bisa salah
# menyimpulkan). Deteksi batas antar-blok memakai heuristik
# sederhana: baris yang diawali penomoran ("1.", "2)", "Soal 3",
# dst) dianggap awal soal baru.
# =========================================================

_QUESTION_START_PATTERN = re.compile(
    r"^\s*(?:soal\s*)?\d{1,3}[.\)]\s+",
    re.IGNORECASE,
)


def split_into_question_blocks(text: str) -> list[str]:
    """
    Membagi teks jadi blok-blok per soal berdasarkan baris yang
    terlihat seperti awal penomoran soal. Kalau tidak ada pola
    penomoran yang terdeteksi sama sekali (mis. dokumen tidak diberi
    nomor), seluruh teks dikembalikan sebagai SATU blok saja — AI
    tetap akan mencoba mem-parsing-nya sekaligus di chunk_blocks().
    """

    lines = text.splitlines()

    blocks: list[list[str]] = []

    for line in lines:

        if _QUESTION_START_PATTERN.match(line) or not blocks:
            blocks.append([line])
        else:
            blocks[-1].append(line)

    return [
        "\n".join(block_lines).strip()
        for block_lines in blocks
        if "\n".join(block_lines).strip()
    ]


def chunk_blocks(
    blocks: list[str], max_chars_per_chunk: int = 2200
) -> list[list[str]]:
    """
    Mengelompokkan blok-blok soal (dari split_into_question_blocks)
    jadi beberapa grup, tiap grup maksimal ~max_chars_per_chunk
    karakter, TANPA pernah memotong isi satu blok. Kalau satu blok
    saja sudah melebihi batas (soal dengan bacaan sangat panjang),
    blok itu tetap jadi grup tersendiri — lebih baik satu grup agak
    besar daripada soal terpotong.

    Default 2200 karakter (BUKAN 6000) SENGAJA dibuat kecil supaya
    aman dipakai provider Ollama lokal, yang di ai_providers.py
    (call_ollama_provider) memakai num_ctx=2048 token — jatah itu
    dipakai BERSAMA oleh: instruksi prompt ekstraksi (~400-500
    token), isi chunk ini, DAN ruang untuk output JSON (num_predict
    =600 token). Kalau chunk terlalu besar, bagian tertentu bisa
    "terpotong" dari sudut pandang model atau outputnya kehabisan
    jatah token di tengah JSON (menyebabkan chunk itu gagal
    di-parse & masuk skipped_count). Perkiraan kasar 1 token Indonesia
    ~ 3 karakter, jadi 2200 karakter ~ 730 token, sisa jatah lebih
    dari cukup untuk prompt + output.

    Konsekuensinya: chunk lebih kecil -> lebih banyak potongan ->
    lebih banyak panggilan AI (lebih lambat, dan kalau pakai Gemini
    jadi sedikit lebih banyak request), tapi jauh lebih aman untuk
    Ollama. Gemini sendiri context window-nya sangat besar (jutaan
    token) jadi tidak terpengaruh oleh batas kecil ini — cuma jadi
    sedikit kurang efisien dibanding kalau nilainya dibuat besar
    khusus Gemini.

    Sengaja mengembalikan list[list[str]] (grup blok, BELUM
    digabung jadi satu string) supaya pemanggil (routers/questions.py)
    tahu berapa blok soal yang "dijanjikan" tiap grup — dipakai untuk
    menghitung `skipped_count` yang akurat kalau AI gagal
    mem-parsing satu grup sekaligus.
    """

    groups: list[list[str]] = []

    current_group: list[str] = []
    current_length = 0

    for block in blocks:

        block_length = len(block) + 2  # +2 untuk pemisah "\n\n"

        if current_group and current_length + block_length > max_chars_per_chunk:

            groups.append(current_group)

            current_group = []
            current_length = 0

        current_group.append(block)
        current_length += block_length

    if current_group:
        groups.append(current_group)

    return groups
