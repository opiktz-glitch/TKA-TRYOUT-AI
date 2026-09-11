from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    AIProvidersResponse,
    AIProviderUpdate,
    ProviderConfigUpdate,
    AIStatusResponse,
)
from dependencies import require_role

import ai_providers


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

            ai_providers.set_provider_config(db, provider_key, "api_key", new_key)

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
