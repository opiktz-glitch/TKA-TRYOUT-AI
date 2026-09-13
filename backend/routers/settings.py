from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models import User, AppSetting
from schemas import (
    AIProvidersResponse,
    AIProviderUpdate,
    ProviderConfigUpdate,
    AIStatusResponse,
    SecretKeyStatusResponse,
    SecretKeyUpdateRequest,
    SecretKeyActionResponse,
    BackupFileResponse,
    BackupListResponse,
    BackupActionResponse,
)
from dependencies import require_role

import ai_providers
import auth
import backup_service


router = APIRouter(
    prefix="/api/settings",
    tags=["Settings"]
)


# =========================================================
# MULTI-PROVIDER AI — GENERIK
#
# Router ini SENGAJA tidak tahu apa-apa soal "Ollama" atau
# "Gemini" secara spesifik — semua logika per-provider ada di
# backend/ai_providers.py (registry). Router di sini cuma
# membungkusnya jadi endpoint HTTP. Efeknya: kalau ada provider
# baru didaftarkan di ai_providers.py, endpoint-endpoint di bawah
# ini OTOMATIS ikut melayani provider tsb tanpa perlu diubah.
# =========================================================

async def _providers_response(db: Session) -> AIProvidersResponse:

    return AIProvidersResponse(
        active_provider=ai_providers.get_active_provider(db),
        providers=await ai_providers.list_provider_statuses(db),
    )


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
    Ringkasan untuk halaman Pengaturan: provider AI mana yang
    sedang aktif, plus status SEMUA provider yang terdaftar di
    ai_providers.py (bukan cuma 2 yang ada sekarang) — supaya kalau
    admin nambah provider baru, kartu status & pilihannya otomatis
    ikut muncul di UI tanpa perlu ubah endpoint ini.
    """

    return await _providers_response(db)


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
    (mis. isi API key) sebelum benar-benar dipakai; status
    online/offline tetap ditampilkan di response supaya admin
    sadar kondisinya.
    """

    provider_key = setting_data.provider.strip().upper()

    if provider_key not in ai_providers.PROVIDERS:

        valid_keys = ", ".join(ai_providers.PROVIDERS.keys())

        raise HTTPException(
            status_code=400,
            detail=f"Provider tidak dikenal. Pilih salah satu: {valid_keys}."
        )

    ai_providers.set_active_provider(db, provider_key)

    db.commit()

    return await _providers_response(db)


@router.put(
    "/providers/{provider_key}/config",
    response_model=AIProvidersResponse
)
async def update_provider_config(
    provider_key: str,
    setting_data: ProviderConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    """
    Simpan/ganti API key & model milik SATU provider — endpoint ini
    generik, dipakai untuk provider mana pun yang sudah terdaftar
    di ai_providers.py (bukan cuma Gemini). Key TIDAK pernah
    hardcode di .env — disimpan di t_app_setting supaya admin bisa
    menggantinya kapan saja lewat halaman ini (mis. key lama
    expired/dicabut, atau pindah akun).

    - api_key diisi non-kosong, dan providernya butuh API key
      (requires_api_key) -> divalidasi dulu ke provider tsb kalau
      provider menyediakan fungsi validasi (saat ini: Gemini).
      Kalau provider secara eksplisit menolak key (401/403), TOLAK
      simpan supaya admin tidak baru sadar saat guru generate soal.
      Kalau cuma gagal terhubung (timeout/offline), tetap diizinkan
      tersimpan — internet mungkin sedang bermasalah, bukan berarti
      key-nya salah.
    - api_key dikirim string kosong "" -> sengaja menghapus key.
    - api_key None (tidak dikirim) -> key lama tidak diubah.
    - model: sama polanya (None = tidak diubah, "" = hapus override).
    """

    provider_key = provider_key.strip().upper()

    definition = ai_providers.PROVIDERS.get(provider_key)

    if not definition:

        valid_keys = ", ".join(ai_providers.PROVIDERS.keys())

        raise HTTPException(
            status_code=400,
            detail=f"Provider tidak dikenal. Pilih salah satu: {valid_keys}."
        )

    if setting_data.api_key is not None:

        new_key = setting_data.api_key.strip()

        if new_key:

            if not definition.requires_api_key:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Provider '{definition.label}' tidak memerlukan "
                        "API key."
                    )
                )

            # Validasi khusus Gemini (satu-satunya provider dengan
            # fungsi cek key saat ini). Provider baru yang juga
            # butuh API key bisa menambahkan validasi serupa di
            # ai_providers.py kalau perlu.
            if provider_key == "GEMINI":

                online, detail = await ai_providers.check_gemini_key(new_key)

                if not online and detail == "API key Gemini tidak valid atau ditolak Google":

                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "API key ditolak oleh provider. Periksa kembali "
                            "key yang dimasukkan."
                        )
                    )

            ai_providers.set_provider_config(
                db, provider_key, "api_key", new_key, encrypted=True
            )

        else:

            ai_providers.delete_provider_config(db, provider_key, "api_key")

    if setting_data.model is not None:

        new_model = setting_data.model.strip()

        if new_model:
            ai_providers.set_provider_config(db, provider_key, "model", new_model)
        else:
            ai_providers.delete_provider_config(db, provider_key, "model")

    db.commit()

    return await _providers_response(db)


@router.delete(
    "/providers/{provider_key}/config",
    response_model=AIProvidersResponse
)
async def clear_provider_config(
    provider_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("ADMIN")
    )
):
    """
    Hapus semua setting (API key & override model) milik satu
    provider. Kalau provider tsb sedang aktif, otomatis dipindah ke
    provider lain yang tidak butuh API key (kalau ada) supaya
    aplikasi tidak "menggantung" mengacu ke provider yang baru saja
    dikosongkan kredensialnya.
    """

    provider_key = provider_key.strip().upper()

    if provider_key not in ai_providers.PROVIDERS:

        valid_keys = ", ".join(ai_providers.PROVIDERS.keys())

        raise HTTPException(
            status_code=400,
            detail=f"Provider tidak dikenal. Pilih salah satu: {valid_keys}."
        )

    ai_providers.delete_all_provider_config(db, provider_key)

    if ai_providers.get_active_provider(db) == provider_key:

        fallback_key = next(
            (
                key for key, definition in ai_providers.PROVIDERS.items()
                if not definition.requires_api_key
            ),
            next(iter(ai_providers.PROVIDERS)),
        )

        ai_providers.set_active_provider(db, fallback_key)

    db.commit()

    return await _providers_response(db)


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

    active_provider = ai_providers.get_active_provider(db)

    status = await ai_providers.get_provider_status(db, active_provider)

    if status.online:
        return AIStatusResponse(
            active_provider=active_provider,
            online=True,
        )

    reason = status.detail or f"{status.label} sedang tidak dapat dihubungi"

    return AIStatusResponse(
        active_provider=active_provider,
        online=False,
        reason=(
            f"Tidak ada AI yang online. Provider aktif saat ini "
            f"({status.label}): {reason}. Hubungi admin untuk memeriksa "
            "Pengaturan AI, atau coba lagi nanti."
        ),
    )


# =========================================================
# SECRET_KEY (Pengaturan > Keamanan)
#
# SECRET_KEY dipakai untuk menandatangani JWT (semua sesi login)
# DAN menurunkan kunci enkripsi API key provider AI di atas.
# Endpoint-endpoint ini SENGAJA dibatasi ADMIN saja (bukan GURU),
# beda dengan konfigurasi AI di atas — ini kredensial keamanan
# inti aplikasi, bukan sekadar setting fitur.
# =========================================================

@router.get(
    "/secret-key",
    response_model=SecretKeyStatusResponse,
)
def get_secret_key_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
):
    """
    Status SECRET_KEY untuk kartu "Keamanan" di halaman Pengaturan.
    Nilai aslinya TIDAK PERNAH dikirim — cukup versi masking-nya
    (sama pola dengan masked_key API key provider AI) supaya admin
    tahu ada key tersimpan tanpa mengekspos isinya lewat network
    tab / log frontend.
    """

    setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == auth.SECRET_KEY_SETTING_KEY)
        .first()
    )

    if not setting or not setting.value.strip():
        return SecretKeyStatusResponse(is_configured=False)

    changed_by_setting = (
        db.query(AppSetting)
        .filter(AppSetting.key == auth.SECRET_KEY_CHANGED_BY_SETTING_KEY)
        .first()
    )

    return SecretKeyStatusResponse(
        is_configured=True,
        masked_key=ai_providers.mask_api_key(setting.value),
        updated_at=setting.updated_at,
        changed_by=(
            changed_by_setting.value
            if changed_by_setting and changed_by_setting.value != "-"
            else None
        ),
    )


@router.put(
    "/secret-key",
    response_model=SecretKeyActionResponse,
)
def update_secret_key(
    data: SecretKeyUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
):
    """
    Admin menempelkan SECRET_KEY sendiri (mis. hasil generate manual,
    atau untuk menyamakan dengan environment lain). Panjang minimal
    sudah divalidasi di schema (32 karakter).

    PENTING: begitu berhasil, SEMUA token JWT yang sudah terbit
    (termasuk milik admin yang melakukan aksi ini) langsung tidak
    valid. Ini disengaja — response tetap 200 karena request ini
    sendiri sudah diautentikasi dengan key LAMA sebelum diganti,
    tapi frontend wajib langsung logout begitu menerima
    force_logout=True di response.
    """

    new_key = data.new_secret_key.strip()

    if len(new_key) < auth.MIN_SECRET_KEY_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                f"SECRET_KEY minimal {auth.MIN_SECRET_KEY_LENGTH} "
                "karakter demi keamanan."
            ),
        )

    auth.set_secret_key(db, new_key, changed_by=current_user.username)

    db.commit()

    return SecretKeyActionResponse(
        success=True,
        message=(
            "SECRET_KEY berhasil disimpan. Semua sesi login "
            "(termasuk sesi Anda saat ini) akan diminta login ulang."
        ),
    )


@router.post(
    "/secret-key/rotate",
    response_model=SecretKeyActionResponse,
)
def rotate_secret_key(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN")),
):
    """
    Generate SECRET_KEY acak baru secara otomatis (tanpa admin perlu
    mengetik apa pun) — cara yang direkomendasikan untuk rotasi rutin
    dibanding menempelkan key manual. Konsekuensi sama seperti
    update_secret_key(): semua sesi login langsung tidak valid.
    """

    new_key = auth.generate_secret_key()

    auth.set_secret_key(db, new_key, changed_by=current_user.username)

    db.commit()

    return SecretKeyActionResponse(
        success=True,
        message=(
            "SECRET_KEY berhasil dirotasi otomatis. Semua sesi login "
            "(termasuk sesi Anda saat ini) akan diminta login ulang."
        ),
    )


# =========================================================
# BACKUP DATABASE (Pengaturan > Backup)
#
# Logika sebenarnya (cara backup dibuat, dibersihkan, divalidasi)
# ada di backend/backup_service.py — dipakai bersama oleh endpoint
# di bawah ini DAN script scripts/backup_db.py (dipanggil otomatis
# tiap 24 jam oleh service "backup" di docker-compose.yml), supaya
# backup manual dari tombol di UI dan backup terjadwal otomatis
# selalu konsisten (folder sama, format nama file sama, retensi
# sama).
#
# Dibatasi ADMIN saja (bukan GURU) — backup berisi SELURUH data
# aplikasi (semua user, semua jawaban siswa), bukan sekadar setting
# fitur seperti AI provider.
# =========================================================

@router.get(
    "/backups",
    response_model=BackupListResponse,
)
def get_backups(
    current_user: User = Depends(require_role("ADMIN")),
):
    """Daftar backup yang sudah ada, terbaru dulu — untuk ditampilkan
    di kartu "Backup Database" halaman Pengaturan."""

    backups = backup_service.list_backups()

    return BackupListResponse(
        backups=[
            BackupFileResponse(
                filename=b.filename,
                size_bytes=b.size_bytes,
                created_at=b.created_at,
            )
            for b in backups
        ],
        retention_days=backup_service.RETENTION_DAYS,
    )


@router.post(
    "/backups",
    response_model=BackupActionResponse,
)
def create_backup_now(
    current_user: User = Depends(require_role("ADMIN")),
):
    """
    Tombol "Backup Sekarang" — membuat satu file backup baru di luar
    jadwal otomatis, mis. sebelum admin melakukan perubahan besar
    (rotasi SECRET_KEY, hapus data massal, dll). Sekaligus menjalankan
    cleanup backup lama seperti biasa, supaya folder backup tidak
    membengkak walau sering dipakai manual.
    """

    try:
        backup = backup_service.backup_database()

    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    except ValueError as exc:
        # DATABASE_URL bukan SQLite — seharusnya tidak pernah terjadi
        # di deployment ini, tapi ditangani supaya tidak 500 mentah.
        raise HTTPException(status_code=400, detail=str(exc))

    removed = backup_service.cleanup_old_backups()

    return BackupActionResponse(
        success=True,
        message=f"Backup berhasil dibuat: {backup.filename}",
        backup=BackupFileResponse(
            filename=backup.filename,
            size_bytes=backup.size_bytes,
            created_at=backup.created_at,
        ),
        removed_old_count=removed,
    )


@router.get("/backups/{filename}/download")
def download_backup(
    filename: str,
    current_user: User = Depends(require_role("ADMIN")),
):
    """
    Download satu file backup. filename divalidasi ketat lewat
    backup_service.resolve_backup_path() (hanya menerima pola nama
    file backup yang sah, mis. "project_tz_20260101_120000.db") —
    MENCEGAH path traversal (mis. mencoba mengakses "../../.env" atau
    file sistem lain lewat parameter ini).
    """

    try:
        path = backup_service.resolve_backup_path(filename)

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return FileResponse(
        path=path,
        filename=path.name,
        media_type="application/octet-stream",
    )
