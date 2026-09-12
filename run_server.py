import subprocess
import sys
import time

def run_services():
    try:
        # MODE SERVER — bisa diakses dari laptop/HP lain di WiFi yang
        # SAMA dengan laptop ini. Backend & frontend sengaja dibuka ke
        # semua network interface (0.0.0.0), bukan cuma localhost.
        #
        # Pakai ini kalau mau demo/presentasi ke orang lain lewat WiFi.
        # Untuk kerja sehari-hari sendirian, pakai run.py biasa supaya
        # laptop tidak "kebuka" ke jaringan tanpa perlu.

        print("Menjalankan FastAPI backend (MODE SERVER - bisa diakses dari WiFi)...")
        backend_process = subprocess.Popen(
            [r"backend\venv\Scripts\python", "-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
            cwd="backend"
        )

        # Beri jeda 2 detik
        time.sleep(2)

        print("Menjalankan React frontend (MODE SERVER - bisa diakses dari WiFi)...")
        frontend_process = subprocess.Popen(
            ["npm", "run", "dev:lan"],
            cwd="frontend",
            shell=True
        )

        # Menjaga proses tetap berjalan
        backend_process.wait()
        frontend_process.wait()

    except KeyboardInterrupt:
        print("\nMenutup semua server...")
        backend_process.terminate()
        frontend_process.terminate()

if __name__ == "__main__":
    run_services()
