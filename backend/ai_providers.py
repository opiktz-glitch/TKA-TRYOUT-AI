import json

import httpx
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
    fungsi async dengan signature (prompt, db) -> dict dan
    (db) -> ProviderStatus.
    """

    def __init__(
        self,
        key: str,
        label: str,
        requires_api_key: bool,
        call_fn,
        status_fn,
    ):
        self.key = key
        self.label = label
        self.requires_api_key = requires_api_key
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


def get_provider_config(
    db: Session,
    provider_key: str,
    field: str,
    default: str = ""
) -> str:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == _config_key(provider_key, field))
        .first()
    )

    if setting and setting.value.strip():
        return setting.value.strip()

    return default


def set_provider_config(
    db: Session,
    provider_key: str,
    field: str,
    value: str
) -> None:

    key = _config_key(provider_key, field)

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == key)
        .first()
    )

    if setting:
        setting.value = value
    else:
        db.add(AppSetting(key=key, value=value))


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


async def call_ollama_provider(prompt: str, db: Session) -> dict:

    model = get_provider_config(
        db, "OLLAMA", "model", default=OLLAMA_MODEL
    ) or OLLAMA_MODEL

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
            "num_predict": 600,
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
                "Pastikan Ollama sudah berjalan (buka aplikasi Ollama "
                f"atau jalankan 'ollama serve'), dan model '{model}' "
                f"sudah di-pull ('ollama pull {model}')."
            )
        )

    except httpx.TimeoutException:

        raise HTTPException(
            status_code=504,
            detail=(
                "AI (Ollama) terlalu lama merespons (lebih dari 2 menit). "
                "Coba lagi, atau gunakan model Ollama yang lebih ringan."
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
    elif installed_models and not any(
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
                params={"key": api_key},
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
        return False, "Gagal menghubungi Gemini"


async def call_gemini_provider(prompt: str, db: Session) -> dict:

    api_key = get_provider_config(
        db, "GEMINI", "api_key", default=GEMINI_API_KEY
    )

    model = get_provider_config(
        db, "GEMINI", "model", default=GEMINI_MODEL
    ) or "gemini-2.5-flash"

    if not api_key:

        raise HTTPException(
            status_code=503,
            detail=(
                "API key Gemini belum diatur. Hubungi admin untuk "
                "mengisinya di halaman Pengaturan > AI."
            )
        )

    payload = {
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
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
        db, "GEMINI", "api_key", default=GEMINI_API_KEY
    )

    model = get_provider_config(
        db, "GEMINI", "model", default=GEMINI_MODEL
    ) or "gemini-2.5-flash"

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
))

register_provider(ProviderDefinition(
    key="GEMINI",
    label="Google Gemini (cloud)",
    requires_api_key=True,
    call_fn=call_gemini_provider,
    status_fn=status_gemini_provider,
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


async def call_active_provider(prompt: str, db: Session) -> dict:

    active_key = get_active_provider(db)

    definition = PROVIDERS.get(active_key)

    if not definition:

        raise HTTPException(
            status_code=503,
            detail="Tidak ada provider AI yang terdaftar/aktif."
        )

    return await definition.call_fn(prompt, db)
