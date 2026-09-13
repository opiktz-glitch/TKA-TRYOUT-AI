import base64
import hashlib
import json
import logging

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_BASE_URL,
    AI_PROVIDER,
)
from models import AppSetting
from schemas import ProviderStatus
import auth


logger = logging.getLogger(__name__)


# =========================================================
# REGISTRY PROVIDER AI — GENERIK
#
# Titik pusat semua provider AI (Ollama, Gemini, dst) dipakai
# aplikasi. Tujuannya supaya menambah provider AI baru TIDAK perlu
# mengubah routers/settings.py, routers/questions.py,
# routers/system.py, ATAUPUN frontend — cukup 3 langkah di file
# ini:
#
#   1. Tulis fungsi adapter async:
#        async def call_xxx_provider(prompt: str, db: Session) -> dict
#      Memanggil API provider tsb & mengembalikan dict hasil parse
#      JSON (bentuknya harus sama seperti hasil Ollama/Gemini:
#      {"question_text": ..., "options": [...], "explanation": ...}).
#      Ini SATU-SATUNYA bagian yang wajib ditulis manual, karena
#      setiap provider AI punya format request/response API yang
#      berbeda — tidak ada cara membuatnya otomatis/generik.
#
#   2. Tulis fungsi status async:
#        async def status_xxx_provider(db: Session) -> ProviderStatus
#      Mengecek apakah provider tsb online & terkonfigurasi.
#
#   3. Daftarkan keduanya lewat register_provider(...) di bagian
#      "DAFTARKAN PROVIDER BAWAAN" di bawah.
#
# Setelah didaftarkan, provider baru itu OTOMATIS:
#   - muncul di GET /api/settings/ai-providers
#   - bisa dipilih lewat PUT /api/settings/ai-provider
#   - bisa disimpan API key/model-nya lewat
#     PUT /api/settings/providers/{key}/config
#   - tercek oleh GET /api/settings/ai-status (dipakai frontend
#     untuk trap error di tombol "Tambah Soal AI")
#   - muncul di kartu pilihan provider halaman Pengaturan (karena
#     frontend me-render list ini secara dinamis, bukan hardcode
#     nama provider satu-satu)
# =========================================================


class ProviderDefinition:
    """
    Definisi satu provider AI. `call_fn` dan `status_fn` WAJIB
    fungsi async dengan signature (prompt, db, larger_output=False)
    -> dict dan (db) -> ProviderStatus. `larger_output` diminta
    caller (lihat routers/questions.py -> extract_questions_from_
    document) saat butuh jatah token keluaran lebih besar dari
    generate 1 soal biasa — dipakai fitur "Impor Soal dari
    Dokumen" karena satu chunk bisa berisi BEBERAPA soal sekaligus
    (JSON hasilnya jauh lebih panjang dari generate 1 soal), tidak
    seperti generate_question_ai() yang outputnya selalu 1 soal.

    `extract_chunk_chars` = ukuran potongan teks (karakter) yang
    OPTIMAL untuk provider ini saat memproses dokumen panjang di
    fitur impor soal (lihat ai_providers.get_extract_chunk_chars).
    Provider dengan context window kecil (Ollama lokal) butuh
    potongan kecil supaya tidak melebihi num_ctx; provider dengan
    context window besar (Gemini cloud) sengaja diberi potongan
    BESAR justru untuk MENGURANGI jumlah panggilan API (lebih
    murah & lebih kecil peluang kena rate limit / gagal jaringan
    di tengah proses), bukan karena butuh dibatasi.
    """

    def __init__(
        self,
        key: str,
        label: str,
        requires_api_key: bool,
        call_fn,
        status_fn,
        extract_chunk_chars: int,
    ):
        self.key = key
        self.label = label
        self.requires_api_key = requires_api_key
        self.extract_chunk_chars = extract_chunk_chars
        self.call_fn = call_fn
        self.status_fn = status_fn


# Dict biasa (bukan list) supaya lookup by key O(1) & urutan
# pendaftaran tetap terjaga (Python dict mempertahankan urutan
# insert, jadi urutan tampil di UI = urutan register_provider()
# dipanggil di bawah).
PROVIDERS: dict[str, ProviderDefinition] = {}


def register_provider(definition: ProviderDefinition) -> None:
    PROVIDERS[definition.key] = definition


# =========================================================
# HELPER PENYIMPANAN SETTING PER-PROVIDER (generik)
#
# Semua setting (API key, model, provider aktif) disimpan di tabel
# t_app_setting yang sudah ada, dengan skema key
# "ai_provider:{PROVIDER_KEY}:{field}". Skema ini generik — provider
# baru otomatis dapat "ruang" penyimpanan sendiri tanpa perlu bikin
# kolom/tabel baru atau konstanta key baru.
# =========================================================

ACTIVE_PROVIDER_SETTING_KEY = "ai_provider:active"


def _config_key(provider_key: str, field: str) -> str:
    return f"ai_provider:{provider_key}:{field}"


# =========================================================
# ENKRIPSI NILAI SENSITIF (API KEY)
#
# API key provider AI (mis. Gemini) sebelumnya disimpan
# apa adanya (plain-text) di tabel t_app_setting. Kalau
# database bocor/dicuri, semua API key ikut bocor. Field
# yang sensitif sekarang dienkripsi dulu (Fernet, AES
# simetris) sebelum disimpan, dan didekripsi saat dibaca.
#
# Key enkripsi DITURUNKAN dari SECRET_KEY yang aktif (lihat
# auth.get_active_secret_key(), sekarang disimpan di database,
# bisa diganti admin dari Pengaturan > Keamanan) lewat SHA-256 ->
# base64 urlsafe, supaya TIDAK perlu key enkripsi terpisah / setup
# tambahan.
#
# SENGAJA TIDAK di-cache secara global (beda dari versi
# sebelumnya) — karena SECRET_KEY sekarang bisa berubah kapan saja
# saat aplikasi berjalan (admin klik "Simpan"/"Rotasi"), cache
# global akan diam-diam memakai key yang sudah usang sampai server
# di-restart. Overhead menurunkan ulang key setiap panggilan bisa
# diabaikan (jarang dipanggil, hanya saat baca/tulis setting AI).
#
# Konsekuensinya: kalau SECRET_KEY berganti, semua API key yang
# sudah tersimpan tidak akan bisa didekripsi lagi dan admin harus
# memasukkan ulang lewat halaman Pengaturan — ini trade-off yang
# wajar dibanding menyimpan API key plain-text.
# =========================================================


def _get_fernet(db: Session) -> Fernet:

    derived_key = base64.urlsafe_b64encode(
        hashlib.sha256(
            auth.get_active_secret_key(db).encode()
        ).digest()
    )

    return Fernet(derived_key)


def _encrypt(value: str, db: Session) -> str:

    if not value:
        return value

    return _get_fernet(db).encrypt(value.encode()).decode()


def _decrypt(value: str, db: Session) -> str:

    if not value:
        return value

    try:

        return _get_fernet(db).decrypt(value.encode()).decode()

    except InvalidToken:

        # Data lama yang tersimpan SEBELUM enkripsi ditambahkan
        # (masih plain-text), atau SECRET_KEY sudah berganti.
        # Dikembalikan apa adanya supaya key lama tetap terpakai
        # alih-alih membuat aplikasi error total; kalau memang
        # SECRET_KEY berganti, provider akan gagal saat dipakai
        # (401/403 dari Gemini) dan admin akan tahu perlu mengisi
        # ulang API key-nya.
        logger.warning(
            "Gagal mendekripsi setting (kemungkinan data lama "
            "plain-text atau SECRET_KEY berubah) — dipakai apa adanya."
        )

        return value


def get_provider_config(
    db: Session,
    provider_key: str,
    field: str,
    default: str = "",
    encrypted: bool = False,
) -> str:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == _config_key(provider_key, field))
        .first()
    )

    if setting and setting.value.strip():

        value = setting.value.strip()

        return _decrypt(value, db) if encrypted else value

    return default


def set_provider_config(
    db: Session,
    provider_key: str,
    field: str,
    value: str,
    encrypted: bool = False,
) -> None:

    key = _config_key(provider_key, field)

    stored_value = _encrypt(value, db) if encrypted else value

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )

    if setting:
        setting.value = stored_value
    else:
        db.add(AppSetting(key=key, value=stored_value))


def delete_provider_config(db: Session, provider_key: str, field: str) -> None:

    db.query(AppSetting).filter(
        AppSetting.key == _config_key(provider_key, field)
    ).delete(synchronize_session=False)


def delete_all_provider_config(db: Session, provider_key: str) -> None:
    """Hapus semua setting milik satu provider (dipakai saat admin
    'Hapus API Key' dari UI)."""

    prefix = f"ai_provider:{provider_key}:"

    db.query(AppSetting).filter(
        AppSetting.key.like(f"{prefix}%")
    ).delete(synchronize_session=False)


def get_active_provider(db: Session) -> str:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == ACTIVE_PROVIDER_SETTING_KEY)
        .first()
    )

    if setting and setting.value.strip().upper() in PROVIDERS:
        return setting.value.strip().upper()

    if AI_PROVIDER in PROVIDERS:
        return AI_PROVIDER

    # Fallback terakhir: provider pertama yang terdaftar, supaya
    # aplikasi tetap punya provider aktif walau .env salah ketik.
    return next(iter(PROVIDERS))


def set_active_provider(db: Session, provider_key: str) -> None:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == ACTIVE_PROVIDER_SETTING_KEY)
        .first()
    )

    if setting:
        setting.value = provider_key
    else:
        db.add(AppSetting(key=ACTIVE_PROVIDER_SETTING_KEY, value=provider_key))


def mask_api_key(api_key: str) -> str:
    """Jangan pernah kirim API key penuh balik ke frontend — cukup
    beberapa karakter terakhir supaya admin bisa mengenali key mana
    yang sedang aktif."""

    if not api_key:
        return ""

    if len(api_key) <= 4:
        return "•" * len(api_key)

    return "•" * (len(api_key) - 4) + api_key[-4:]


# =========================================================
# ADAPTER: OLLAMA (lokal, tidak butuh API key)
# =========================================================

async def _fetch_ollama_models() -> tuple[list[str], bool]:

    try:

        async with httpx.AsyncClient(timeout=5.0) as client:

            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")

        response.raise_for_status()

        data = response.json()

        models = [
            item.get("name", "")
            for item in data.get("models", [])
            if item.get("name")
        ]

        return models, True

    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):

        return [], False


async def call_ollama_provider(
    prompt: str, db: Session, larger_output: bool = False
) -> dict:

    model = get_provider_config(
        db, "OLLAMA", "model", default=OLLAMA_MODEL
    ) or OLLAMA_MODEL

    # `larger_output=True` dipakai fitur impor soal dari dokumen:
    # satu chunk teks bisa menghasilkan BEBERAPA soal sekaligus,
    # jadi butuh jatah num_predict (token keluaran) yang jauh lebih
    # besar dari generate 1 soal biasa. num_ctx (total jatah token,
    # input+output digabung) ikut dinaikkan proporsional — kalau
    # cuma num_predict yang dinaikkan tanpa num_ctx, jatah untuk
    # TEKS INPUT justru makin sempit.
    num_predict = 1200 if larger_output else 600
    num_ctx = 4096 if larger_output else 2048

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "format": "json",
        "stream": False,
        # Ollama otomatis melepas model dari memori setelah idle
        # (default 5 menit). keep_alive membuat model tetap di
        # memori lebih lama supaya generate berikutnya tidak perlu
        # nunggu load ulang dari disk.
        "keep_alive": "30m",
        "options": {
            # Batas keras jumlah token keluaran, supaya waktu
            # generate lebih terprediksi.
            "num_predict": num_predict,
            "num_ctx": num_ctx,
        },
    }

    # num_ctx yang lebih besar butuh lebih banyak waktu komputasi
    # (terutama di laptop tanpa GPU khusus), jadi timeout HTTP ikut
    # dilonggarkan supaya panggilan larger_output tidak keburu
    # dianggap timeout padahal Ollama masih memproses secara wajar.
    request_timeout = 240.0 if larger_output else 120.0

    try:

        async with httpx.AsyncClient(timeout=request_timeout) as client:

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
                "Pastikan Ollama sudah berjalan (buka aplikasi Ollama "
                f"atau jalankan 'ollama serve'), dan model '{model}' "
                f"sudah di-pull ('ollama pull {model}')."
            )
        )

    except httpx.TimeoutException:

        raise HTTPException(
            status_code=504,
            detail=(
                "AI (Ollama) terlalu lama merespons (lebih dari "
                f"{int(request_timeout // 60)} menit). Coba lagi, atau "
                "gunakan model Ollama yang lebih ringan."
            )
        )

    except httpx.HTTPStatusError as exc:

        raise HTTPException(
            status_code=502,
            detail="Ollama mengembalikan error: " + exc.response.text[:200]
        )

    data = response.json()

    content = data.get("message", {}).get("content", "")

    try:

        return json.loads(content)

    except (json.JSONDecodeError, TypeError):

        raise HTTPException(
            status_code=502,
            detail=(
                "Hasil AI (Ollama) tidak berupa JSON yang valid. "
                "Coba generate ulang."
            )
        )


async def status_ollama_provider(db: Session) -> ProviderStatus:

    installed_models, reachable = await _fetch_ollama_models()

    model = get_provider_config(
        db, "OLLAMA", "model", default=OLLAMA_MODEL
    ) or OLLAMA_MODEL

    detail = None

    if not reachable:
        detail = "Ollama tidak terdeteksi berjalan di laptop ini"
    elif not installed_models:
        # Reachable tapi belum ada satupun model ter-pull. Beda
        # kasus dari "model tertentu belum di-pull" di bawah, jadi
        # pesannya dibuat lebih eksplisit supaya admin tahu daftar
        # model kosong, bukan cuma model yang diinginkan yang hilang.
        detail = (
            f"Belum ada model ter-pull di Ollama. Jalankan "
            f"'ollama pull {model}' terlebih dahulu."
        )
    elif not any(
        model in installed for installed in installed_models
    ):
        detail = f"Model '{model}' belum di-pull di Ollama"

    return ProviderStatus(
        provider="OLLAMA",
        label="Ollama (lokal)",
        requires_api_key=False,
        configured=True,  # Ollama selalu "terkonfigurasi" (lokal, tanpa key)
        online=reachable,
        model=model,
        detail=detail,
        masked_key=None,
    )


# =========================================================
# ADAPTER: GEMINI (cloud, butuh API key)
# =========================================================

async def check_gemini_key(api_key: str) -> tuple[bool, str | None]:
    """
    Validasi ringan: panggil endpoint ListModels Gemini. Dipakai
    baik untuk status dashboard maupun validasi saat admin
    menyimpan key baru lewat Pengaturan.
    """

    if not api_key:
        return False, "API key Gemini belum diisi"

    try:

        async with httpx.AsyncClient(timeout=8.0) as client:

            response = await client.get(
                f"{GEMINI_BASE_URL}/models",
                headers={"x-goog-api-key": api_key},
            )

        if response.status_code == 200:
            return True, None

        if response.status_code in (400, 401, 403):
            return False, "API key Gemini tidak valid atau ditolak Google"

        return False, f"Gemini membalas status {response.status_code}"

    except httpx.TimeoutException:
        return False, "Tidak dapat menghubungi Gemini (timeout)"

    except httpx.ConnectError:
        return False, "Tidak dapat menghubungi Gemini (periksa koneksi internet)"

    except Exception:
        # Exception tak terduga (bukan timeout/connect error yang
        # sudah ditangani di atas) — dicatat ke log server supaya
        # bisa didiagnosis, tapi pesan ke user tetap generik supaya
        # tidak membocorkan detail internal.
        logger.exception("Gagal memeriksa API key Gemini")
        return False, "Gagal menghubungi Gemini"


async def call_gemini_provider(
    prompt: str, db: Session, larger_output: bool = False
) -> dict:

    api_key = get_provider_config(
        db, "GEMINI", "api_key", default=GEMINI_API_KEY, encrypted=True
    )

    model = get_provider_config(
        db, "GEMINI", "model", default=GEMINI_MODEL
    ) or "gemini-3.5-flash-lite"

    if not api_key:

        raise HTTPException(
            status_code=503,
            detail=(
                "API key Gemini belum diatur. Hubungi admin untuk "
                "mengisinya di halaman Pengaturan > AI."
            )
        )

    # `larger_output=True` dipakai fitur impor soal dari dokumen —
    # satu chunk teks (chunk Gemini sengaja dibuat BESAR, lihat
    # extract_chunk_chars di register_provider() di bawah) bisa
    # menghasilkan cukup banyak soal sekaligus dalam satu respons
    # JSON, jauh lebih panjang dari generate 1 soal biasa. Context
    # window Gemini sendiri sangat besar jadi TIDAK perlu
    # dikhawatirkan seperti Ollama — di sini murni soal jatah
    # output saja.
    max_output_tokens = 4000 if larger_output else 800

    payload = {
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "maxOutputTokens": max_output_tokens,
        },
    }

    # Chunk besar (larger_output) wajar makan waktu lebih lama
    # diproses & jawabannya lebih panjang untuk dikirim balik,
    # jadi timeout HTTP ikut dilonggarkan.
    request_timeout = 150.0 if larger_output else 60.0

    try:

        async with httpx.AsyncClient(timeout=request_timeout) as client:

            response = await client.post(
                f"{GEMINI_BASE_URL}/models/{model}:generateContent",
                headers={"x-goog-api-key": api_key},
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
                    "atau kuota habis). Hubungi admin untuk memeriksa API "
                    "key Gemini di halaman Pengaturan."
                )
            )

        raise HTTPException(
            status_code=502,
            detail="Gemini mengembalikan error: " + exc.response.text[:200]
        )

    data = response.json()

    candidates = data.get("candidates") or []

    if not candidates:

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

        return json.loads(content)

    except (json.JSONDecodeError, TypeError):

        raise HTTPException(
            status_code=502,
            detail=(
                "Hasil AI (Gemini) tidak berupa JSON yang valid. "
                "Coba generate ulang."
            )
        )


async def status_gemini_provider(db: Session) -> ProviderStatus:

    api_key = get_provider_config(
        db, "GEMINI", "api_key", default=GEMINI_API_KEY, encrypted=True
    )

    model = get_provider_config(
        db, "GEMINI", "model", default=GEMINI_MODEL
    ) or "gemini-3.5-flash-lite"

    if not api_key:

        return ProviderStatus(
            provider="GEMINI",
            label="Google Gemini (cloud)",
            requires_api_key=True,
            configured=False,
            online=False,
            model=model,
            detail="API key Gemini belum diatur",
            masked_key=None,
        )

    online, detail = await check_gemini_key(api_key)

    return ProviderStatus(
        provider="GEMINI",
        label="Google Gemini (cloud)",
        requires_api_key=True,
        configured=True,
        online=online,
        model=model,
        detail=detail,
        masked_key=mask_api_key(api_key),
    )


# =========================================================
# DAFTARKAN PROVIDER BAWAAN
#
# Untuk nambah provider baru, salin pola di atas (adapter + status
# function), lalu tambahkan satu baris register_provider(...) lagi
# di sini. TIDAK ADA file lain yang perlu diubah.
# =========================================================

register_provider(ProviderDefinition(
    key="OLLAMA",
    label="Ollama (lokal)",
    requires_api_key=False,
    call_fn=call_ollama_provider,
    status_fn=status_ollama_provider,
    # Kecil karena context window Ollama lokal (num_ctx) terbatas
    # — lihat penjelasan lengkap di call_ollama_provider().
    extract_chunk_chars=4000,
))

register_provider(ProviderDefinition(
    key="GEMINI",
    label="Google Gemini (cloud)",
    requires_api_key=True,
    call_fn=call_gemini_provider,
    status_fn=status_gemini_provider,
    # SENGAJA besar (bukan kecil) — context window Gemini sangat
    # longgar, jadi potongan besar dipakai untuk MENGURANGI jumlah
    # panggilan API per dokumen: lebih murah (instruksi prompt
    # tidak diulang-ulang per potongan kecil) dan lebih kecil
    # peluang kena rate limit / gagal jaringan di tengah proses.
    extract_chunk_chars=20000,
))


# =========================================================
# FUNGSI PUBLIK — dipakai routers/settings.py, questions.py,
# system.py. Ini satu-satunya "pintu masuk" yang perlu di-import
# router lain, supaya logika multi-provider tetap terpusat di
# file ini.
# =========================================================

async def list_provider_statuses(db: Session) -> list[ProviderStatus]:
    return [
        await definition.status_fn(db)
        for definition in PROVIDERS.values()
    ]


async def get_provider_status(db: Session, provider_key: str) -> ProviderStatus:

    definition = PROVIDERS.get(provider_key)

    if not definition:
        raise HTTPException(
            status_code=400,
            detail=f"Provider AI '{provider_key}' tidak dikenal."
        )

    return await definition.status_fn(db)


async def call_active_provider(
    prompt: str, db: Session, larger_output: bool = False
) -> dict:

    active_key = get_active_provider(db)

    definition = PROVIDERS.get(active_key)

    if not definition:

        raise HTTPException(
            status_code=503,
            detail="Tidak ada provider AI yang terdaftar/aktif."
        )

    return await definition.call_fn(prompt, db, larger_output=larger_output)


# Dipakai kalau, karena suatu hal, tidak ada provider aktif yang
# valid terdeteksi (mestinya jarang terjadi karena
# extract_questions_from_document sudah mengecek status AI lebih
# dulu) — nilai konservatif ala Ollama, supaya tetap aman dipakai
# provider mana pun kalau sampai kejadian.
DEFAULT_EXTRACT_CHUNK_CHARS = 2200


def get_extract_chunk_chars(db: Session) -> int:
    """
    Ukuran potongan teks (karakter) yang OPTIMAL untuk provider AI
    yang SEDANG AKTIF, dipakai fitur "Impor Soal dari Dokumen"
    (routers/questions.py) saat memecah dokumen panjang jadi
    beberapa chunk. Lihat komentar `extract_chunk_chars` di
    ProviderDefinition untuk alasan tiap provider punya angka
    berbeda.
    """

    active_key = get_active_provider(db)

    definition = PROVIDERS.get(active_key)

    if not definition:
        return DEFAULT_EXTRACT_CHUNK_CHARS

    return definition.extract_chunk_chars
