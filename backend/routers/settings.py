import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_BASE_URL,
    AI_PROVIDER,
)
from database import get_db
from models import AppSetting, User
from schemas import (
    AIModelSettingResponse,
    AIModelSettingUpdate,
    AIProvidersResponse,
    AIProviderUpdate,
    GeminiSettingUpdate,
    ProviderStatus,
    AIStatusResponse,
)
from dependencies import require_role


router = APIRouter(
    prefix="/api/settings",
    tags=["Settings"]
)


# Key yang dipakai di tabel t_app_setting untuk menyimpan model
# Ollama aktif. Dipisah jadi konstanta supaya kalau nanti ada
# setting lain, tidak ada key yang bentrok/typo.
OLLAMA_MODEL_SETTING_KEY = "ollama_model"

# Key-key untuk multi-provider AI (Ollama + Gemini). Semua nilai
# ini disimpan di tabel t_app_setting (bukan .env), supaya admin
# bisa ganti provider aktif & API key Gemini kapan saja dari UI
# Pengaturan, tanpa perlu akses server / restart aplikasi.
AI_PROVIDER_SETTING_KEY = "ai_provider"
GEMINI_API_KEY_SETTING_KEY = "gemini_api_key"
GEMINI_MODEL_SETTING_KEY = "gemini_model"

PROVIDER_LABELS = {
    "OLLAMA": "Ollama (lokal)",
    "GEMINI": "Google Gemini (cloud)",
}


# =========================================================
# HELPER — ambil model Ollama yang aktif saat ini
#
# Dipakai oleh routers/questions.py (generate soal) dan
# routers/system.py (kartu status dashboard), supaya keduanya
# selalu mengacu ke sumber yang sama: database dulu, baru
# fallback ke .env kalau belum pernah di-override oleh admin.
# =========================================================

def get_active_ollama_model(db: Session) -> str:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == OLLAMA_MODEL_SETTING_KEY)
        .first()
    )

    if setting and setting.value.strip():
        return setting.value.strip()

    return OLLAMA_MODEL


async def _fetch_installed_models() -> tuple[list[str], bool]:
    """
    Ping /api/tags milik Ollama untuk daftar model yang sudah
    di-pull. Best-effort — kalau Ollama tidak jalan, jangan
    sampai bikin halaman Settings ikut error, cukup tandai
    ollama_reachable = False dan kembalikan list kosong.
    """

    try:

        async with httpx.AsyncClient(timeout=5.0) as client:

            response = await client.get(
                f"{OLLAMA_BASE_URL}/api/tags"
            )

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


# =========================================================
# HELPER — MULTI-PROVIDER (OLLAMA + GEMINI)
#
# Dipakai routers/questions.py (generate soal), routers/system.py
# (kartu status dashboard), dan endpoint /ai-status di bawah untuk
# menentukan provider mana yang aktif serta kredensial yang
# dipakai. Pola sama dengan get_active_ollama_model: database dulu,
# baru fallback ke .env kalau admin belum pernah override lewat UI.
# =========================================================

def get_active_provider(db: Session) -> str:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == AI_PROVIDER_SETTING_KEY)
        .first()
    )

    if setting and setting.value.strip().upper() in ("OLLAMA", "GEMINI"):
        return setting.value.strip().upper()

    return AI_PROVIDER


def get_gemini_api_key(db: Session) -> str:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == GEMINI_API_KEY_SETTING_KEY)
        .first()
    )

    if setting and setting.value.strip():
        return setting.value.strip()

    return GEMINI_API_KEY


def get_active_gemini_model(db: Session) -> str:

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == GEMINI_MODEL_SETTING_KEY)
        .first()
    )

    if setting and setting.value.strip():
        return setting.value.strip()

    return GEMINI_MODEL or "gemini-2.5-flash"


def mask_api_key(api_key: str) -> str:
    """
    Tampilkan API key secara aman di response (tidak pernah kirim
    key penuh balik ke frontend). Cukup tunjukkan beberapa
    karakter terakhir supaya admin bisa mengenali key mana yang
    sedang aktif tanpa membuka kembali key lengkapnya.
    """

    if not api_key:
        return ""

    if len(api_key) <= 4:
        return "•" * len(api_key)

    return "•" * (len(api_key) - 4) + api_key[-4:]


async def _check_gemini_reachable(
    api_key: str
) -> tuple[bool, str | None]:
    """
    Validasi ringan: panggil endpoint ListModels Gemini dengan API
    key yang diberikan. Ini TIDAK memicu biaya generate seperti
    generateContent, cukup untuk memastikan key valid & bisa
    terhubung ke Google. Best-effort — dipakai baik untuk status
    dashboard maupun validasi saat admin menyimpan key baru.
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


async def get_provider_status(db: Session, provider: str) -> ProviderStatus:
    """
    Cek status satu provider (dipakai untuk endpoint /ai-providers
    dan /ai-status). Mengembalikan ProviderStatus lengkap dengan
    info online/configured supaya frontend bisa menampilkan kartu
    status ATAU langsung menolak membuka modal generate soal kalau
    provider yang aktif sedang tidak bisa dipakai.
    """

    if provider == "GEMINI":

        api_key = get_gemini_api_key(db)
        model = get_active_gemini_model(db)
        configured = bool(api_key)

        if not configured:
            return ProviderStatus(
                provider="GEMINI",
                label=PROVIDER_LABELS["GEMINI"],
                configured=False,
                online=False,
                model=model,
                detail="API key Gemini belum diatur",
                masked_key=None,
            )

        online, detail = await _check_gemini_reachable(api_key)

        return ProviderStatus(
            provider="GEMINI",
            label=PROVIDER_LABELS["GEMINI"],
            configured=True,
            online=online,
            model=model,
            detail=detail,
            masked_key=mask_api_key(api_key),
        )

    # default / OLLAMA
    installed_models, ollama_reachable = await _fetch_installed_models()
    active_model = get_active_ollama_model(db)

    detail = None

    if not ollama_reachable:
        detail = "Ollama tidak terdeteksi berjalan di laptop ini"
    elif installed_models and not any(
        active_model in installed for installed in installed_models
    ):
        detail = f"Model '{active_model}' belum di-pull di Ollama"

    return ProviderStatus(
        provider="OLLAMA",
        label=PROVIDER_LABELS["OLLAMA"],
        configured=True,  # Ollama selalu "terkonfigurasi" (lokal, tanpa key)
        online=ollama_reachable,
        model=active_model,
        detail=detail,
    )


@router.get(
    "/ai-model",
    response_model=AIModelSettingResponse
)
async def get_ai_model_setting(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):

    active_model = get_active_ollama_model(db)

    installed_models, ollama_reachable = await _fetch_installed_models()

    return AIModelSettingResponse(
        active_model=active_model,
        default_model=OLLAMA_MODEL,
        is_override=(active_model != OLLAMA_MODEL),
        installed_models=installed_models,
        ollama_reachable=ollama_reachable,
    )


@router.put(
    "/ai-model",
    response_model=AIModelSettingResponse
)
async def update_ai_model_setting(
    setting_data: AIModelSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):

    new_model = setting_data.model.strip()

    if not new_model:

        raise HTTPException(
            status_code=400,
            detail="Nama model wajib diisi"
        )

    # -----------------------------------------------------
    # Validasi model benar-benar terpasang di Ollama sebelum
    # disimpan, supaya admin tidak salah ketik nama model dan
    # baru sadar saat guru mencoba generate soal.
    #
    # Kalau Ollama sedang tidak bisa dihubungi sama sekali,
    # validasi ini dilewati (tidak diblokir) — admin mungkin
    # sedang menyiapkan konfigurasi sebelum Ollama dinyalakan,
    # dan itu keputusan yang sah.
    # -----------------------------------------------------

    installed_models, ollama_reachable = await _fetch_installed_models()

    if ollama_reachable and new_model not in installed_models:

        raise HTTPException(
            status_code=400,
            detail=(
                f"Model '{new_model}' belum terpasang di Ollama. "
                f"Jalankan 'ollama pull {new_model}' terlebih dahulu, "
                "atau pilih dari daftar model yang sudah tersedia."
            )
        )

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == OLLAMA_MODEL_SETTING_KEY)
        .first()
    )

    if setting:

        setting.value = new_model

    else:

        setting = AppSetting(
            key=OLLAMA_MODEL_SETTING_KEY,
            value=new_model
        )

        db.add(setting)

    db.commit()

    return AIModelSettingResponse(
        active_model=new_model,
        default_model=OLLAMA_MODEL,
        is_override=(new_model != OLLAMA_MODEL),
        installed_models=installed_models,
        ollama_reachable=ollama_reachable,
    )


@router.delete(
    "/ai-model",
    response_model=AIModelSettingResponse
)
async def reset_ai_model_setting(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    """
    Hapus override dari database supaya kembali pakai default
    dari .env (OLLAMA_MODEL).
    """

    db.query(AppSetting).filter(
        AppSetting.key == OLLAMA_MODEL_SETTING_KEY
    ).delete(synchronize_session=False)

    db.commit()

    installed_models, ollama_reachable = await _fetch_installed_models()

    return AIModelSettingResponse(
        active_model=OLLAMA_MODEL,
        default_model=OLLAMA_MODEL,
        is_override=False,
        installed_models=installed_models,
        ollama_reachable=ollama_reachable,
    )


# =========================================================
# MULTI-PROVIDER AI — OLLAMA & GEMINI
# =========================================================

@router.get(
    "/ai-providers",
    response_model=AIProvidersResponse
)
async def get_ai_providers(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    """
    Ringkasan lengkap untuk halaman Pengaturan: provider mana yang
    aktif, serta status kedua provider (Ollama & Gemini) sekaligus,
    supaya admin bisa melihat & membandingkan sebelum memutuskan
    mau pindah provider atau tidak.
    """

    active_provider = get_active_provider(db)

    ollama_status = await get_provider_status(db, "OLLAMA")
    gemini_status = await get_provider_status(db, "GEMINI")

    # Jangan pernah bocorkan API key asli ke frontend — cukup info
    # "configured" + model yang sedang dipakai. (mask_api_key
    # disiapkan untuk dipakai di endpoint lain kalau suatu saat
    # perlu ditampilkan sebagian, lihat update_gemini_setting.)

    return AIProvidersResponse(
        active_provider=active_provider,
        ollama=ollama_status,
        gemini=gemini_status,
    )


@router.put(
    "/ai-provider",
    response_model=AIProvidersResponse
)
async def update_active_provider(
    setting_data: AIProviderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    """
    Ganti provider AI yang aktif dipakai fitur "Generate Soal AI"
    di seluruh aplikasi. Tidak diblokir walau provider tujuan
    sedang offline — admin boleh menyiapkan konfigurasi dulu
    (mis. isi API key Gemini) sebelum benar-benar dipakai; status
    online/offline tetap ditampilkan di response supaya admin
    sadar kondisinya.
    """

    provider = setting_data.provider.strip().upper()

    if provider not in ("OLLAMA", "GEMINI"):
        raise HTTPException(
            status_code=400,
            detail="Provider tidak dikenal. Pilih 'OLLAMA' atau 'GEMINI'."
        )

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == AI_PROVIDER_SETTING_KEY)
        .first()
    )

    if setting:
        setting.value = provider
    else:
        setting = AppSetting(key=AI_PROVIDER_SETTING_KEY, value=provider)
        db.add(setting)

    db.commit()

    ollama_status = await get_provider_status(db, "OLLAMA")
    gemini_status = await get_provider_status(db, "GEMINI")

    return AIProvidersResponse(
        active_provider=provider,
        ollama=ollama_status,
        gemini=gemini_status,
    )


@router.put(
    "/gemini",
    response_model=AIProvidersResponse
)
async def update_gemini_setting(
    setting_data: GeminiSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    """
    Simpan/ganti API key & model Gemini yang aktif. Key TIDAK
    pernah hardcode di .env — disimpan di t_app_setting supaya
    admin bisa mengganti kapan saja lewat halaman ini (mis. kalau
    key lama expired/dicabut, atau mau pindah akun Google Cloud).

    - api_key diisi non-kosong -> divalidasi ke Gemini dulu.
      Kalau Google secara eksplisit menolak (401/403, key salah),
      TOLAK simpan supaya admin tidak baru sadar saat guru mencoba
      generate soal. Kalau cuma gagal terhubung (timeout/offline),
      tetap diizinkan tersimpan — internet admin mungkin sedang
      bermasalah, bukan berarti key-nya salah.
    - api_key dikirim string kosong "" -> sengaja menghapus key
      (revert ke .env / kosong).
    - api_key None (tidak dikirim) -> key lama tidak diubah.
    """

    if setting_data.api_key is not None:

        new_key = setting_data.api_key.strip()

        if new_key:

            online, detail = await _check_gemini_reachable(new_key)

            if not online and detail == "API key Gemini tidak valid atau ditolak Google":
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "API key Gemini ditolak oleh Google. Periksa kembali "
                        "key yang dimasukkan (buat/ambil di Google AI Studio)."
                    )
                )

            key_setting = (
                db.query(AppSetting)
                .filter(AppSetting.key == GEMINI_API_KEY_SETTING_KEY)
                .first()
            )

            if key_setting:
                key_setting.value = new_key
            else:
                db.add(AppSetting(key=GEMINI_API_KEY_SETTING_KEY, value=new_key))

        else:

            db.query(AppSetting).filter(
                AppSetting.key == GEMINI_API_KEY_SETTING_KEY
            ).delete(synchronize_session=False)

    if setting_data.model is not None:

        new_model = setting_data.model.strip()

        if new_model:

            model_setting = (
                db.query(AppSetting)
                .filter(AppSetting.key == GEMINI_MODEL_SETTING_KEY)
                .first()
            )

            if model_setting:
                model_setting.value = new_model
            else:
                db.add(AppSetting(key=GEMINI_MODEL_SETTING_KEY, value=new_model))

        else:

            db.query(AppSetting).filter(
                AppSetting.key == GEMINI_MODEL_SETTING_KEY
            ).delete(synchronize_session=False)

    db.commit()

    active_provider = get_active_provider(db)
    ollama_status = await get_provider_status(db, "OLLAMA")
    gemini_status = await get_provider_status(db, "GEMINI")

    return AIProvidersResponse(
        active_provider=active_provider,
        ollama=ollama_status,
        gemini=gemini_status,
    )


@router.delete(
    "/gemini",
    response_model=AIProvidersResponse
)
async def clear_gemini_setting(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    """
    Hapus API key & override model Gemini dari database. Kalau
    provider aktif sedang GEMINI, otomatis dikembalikan ke OLLAMA
    supaya aplikasi tidak "menggantung" mengacu ke provider yang
    baru saja dikosongkan kredensialnya.
    """

    db.query(AppSetting).filter(
        AppSetting.key.in_([
            GEMINI_API_KEY_SETTING_KEY,
            GEMINI_MODEL_SETTING_KEY,
        ])
    ).delete(synchronize_session=False)

    if get_active_provider(db) == "GEMINI":

        provider_setting = (
            db.query(AppSetting)
            .filter(AppSetting.key == AI_PROVIDER_SETTING_KEY)
            .first()
        )

        if provider_setting:
            provider_setting.value = "OLLAMA"
        else:
            db.add(AppSetting(key=AI_PROVIDER_SETTING_KEY, value="OLLAMA"))

    db.commit()

    active_provider = get_active_provider(db)
    ollama_status = await get_provider_status(db, "OLLAMA")
    gemini_status = await get_provider_status(db, "GEMINI")

    return AIProvidersResponse(
        active_provider=active_provider,
        ollama=ollama_status,
        gemini=gemini_status,
    )


@router.get(
    "/ai-status",
    response_model=AIStatusResponse
)
async def get_ai_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN", "GURU")
    )
):
    """
    Endpoint RINGAN khusus untuk di-cek frontend SEBELUM membuka
    modal "Tambah Soal AI" (dipanggil oleh ADMIN & GURU, bukan
    cuma ADMIN, karena keduanya bisa generate soal AI). Kalau
    provider yang sedang aktif tidak online, frontend langsung
    menampilkan error saat tombol diklik, tanpa perlu membuka
    modal & mengisi form dulu baru gagal di akhir.
    """

    active_provider = get_active_provider(db)

    status = await get_provider_status(db, active_provider)

    if status.online:
        return AIStatusResponse(
            active_provider=active_provider,
            online=True,
        )

    if active_provider == "GEMINI":
        reason = status.detail or "Gemini sedang tidak dapat dihubungi"
    else:
        reason = status.detail or "Ollama sedang tidak dapat dihubungi"

    return AIStatusResponse(
        active_provider=active_provider,
        online=False,
        reason=(
            f"Tidak ada AI yang online. Provider aktif saat ini "
            f"({PROVIDER_LABELS.get(active_provider, active_provider)}): {reason}. "
            "Hubungi admin untuk memeriksa Pengaturan AI, atau coba lagi nanti."
        ),
    )
