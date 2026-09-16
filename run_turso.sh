#!/bin/bash
# =========================================================
# JALANKAN BACKEND DI WSL/LINUX, TERSAMBUNG KE TURSO
#
# Setara run_turso.py, tapi:
# - Dipakai dari WSL/Linux (bash), bukan Windows (run_turso.py
#   ditulis pakai path gaya Windows: backend\venv\Scripts\python,
#   yang tidak akan jalan di Linux).
# - HANYA menjalankan backend. Frontend tetap dijalankan terpisah
#   di terminal Windows biasa (npm run dev), tidak perlu dipindah
#   ke WSL.
#
# VENV SENGAJA DI ~/venvs/tka-backend (BUKAN di dalam folder
# project ini) --- membuat venv di dalam /mnt/c/... (project ini)
# gagal karena keterbatasan WSL saat mount drive Windows (ensurepip
# error). Venv harus di filesystem Linux asli; source code project
# tetap boleh di /mnt/c seperti biasa, cuma venv-nya yang dipisah.
#
# CARA PAKAI (dari root project, di dalam terminal WSL):
#   bash run_turso.sh
#
# SYARAT SEBELUM PERTAMA KALI PAKAI:
#   mkdir -p ~/venvs
#   python3 -m venv ~/venvs/tka-backend
#   source ~/venvs/tka-backend/bin/activate
#   cd backend && pip install -r requirements.txt
# dan sudah mengisi TURSO_DATABASE_URL + TURSO_AUTH_TOKEN di
# backend/.env.
# =========================================================

set -e

VENV_DIR="$HOME/venvs/tka-backend"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

if [ ! -f ".env" ]; then
    echo "backend/.env tidak ditemukan. Salin dari .env.example dulu,"
    echo "lalu isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN."
    exit 1
fi

# Baca backend/.env ke environment variable shell ini (hanya untuk
# proses ini, tidak mengubah .env-nya sendiri).
set -a
source .env
set +a

if [ -z "$TURSO_DATABASE_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
    echo "TURSO_DATABASE_URL dan/atau TURSO_AUTH_TOKEN belum diisi di backend/.env."
    echo "Ambil dulu dengan:"
    echo "  turso db show --url <nama-database>"
    echo "  turso db tokens create <nama-database>"
    exit 1
fi

# Sama seperti di run_turso.py: lepas prefix "libsql://" kalau ada,
# supaya tempel apa adanya dari output CLI Turso tetap berfungsi.
HOST_PART="${TURSO_DATABASE_URL#libsql://}"

export DATABASE_URL="sqlite+libsql://${HOST_PART}?authToken=${TURSO_AUTH_TOKEN}&secure=true"
export APP_MODE=development

if [ ! -d "$VENV_DIR" ]; then
    echo "Venv belum ada di $VENV_DIR. Jalankan dulu (sekali saja):"
    echo "  mkdir -p ~/venvs"
    echo "  python3 -m venv ~/venvs/tka-backend"
    echo "  source ~/venvs/tka-backend/bin/activate"
    echo "  pip install -r requirements.txt   # (dari folder backend ini)"
    exit 1
fi

source "$VENV_DIR/bin/activate"

echo "Menjalankan FastAPI backend (mode develop, database: TURSO)..."
echo "Backend akan bisa diakses dari Windows di http://localhost:8000"

exec uvicorn main:app --reload --host 0.0.0.0 --port 8000
