# ==========================================
# Dockerfile - Backend FastAPI (TKA Tryout)
# ==========================================

FROM python:3.12-slim

WORKDIR /app

# Dependency sistem minimal (cryptography/bcrypt butuh build tools
# di beberapa base image; slim biasanya sudah cukup, tapi ini jaga-jaga)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements dulu supaya layer cache Docker optimal
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code backend
COPY . .

# Catatan: config.py otomatis membuat folder "database/" di
# dalam folder backend/ ini kalau belum ada. Karena isi folder
# backend di-copy ke /app, folder database akan dibuat di
# /app/database. Mount volume ke /app/database supaya data
# SQLite tidak hilang tiap kali container di-restart/redeploy
# (lihat docker-compose.yml).

EXPOSE 8000

# PORT bisa di-override oleh platform hosting (Render/Railway dsb)
ENV PORT=8000

# Server produksi/hosting — bukan development lokal maupun mode
# WiFi/LAN (run_server.py). Menentukan label yang ditampilkan di
# tab Jaringan (Pengaturan Admin) — dan menyembunyikan tab itu
# sepenuhnya, karena IP LAN tidak relevan di server cloud.
ENV APP_MODE=production

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
