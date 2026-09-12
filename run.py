import subprocess
import sys
import time

def run_services():
    try:
        # MODE DEVELOP — cuma bisa diakses dari laptop ini sendiri
        # (localhost). Tidak pakai --host, jadi uvicorn & Vite default
        # bind ke 127.0.0.1 saja. Aman dipakai sehari-hari tanpa
        # sengaja "membuka" aplikasi ke jaringan WiFi.
        #
        # Mau bisa diakses laptop/HP lain di WiFi? Pakai run_server.py.

        print("Menjalankan FastAPI backend (mode develop, localhost saja)...")
        backend_process = subprocess.Popen(
            [r"backend\venv\Scripts\python", "-m", "uvicorn", "main:app", "--reload"],
            cwd="backend"
        )

        # Beri jeda 2 detik
        time.sleep(2)

        print("Menjalankan React frontend (mode develop, localhost saja)...")
        frontend_process = subprocess.Popen(
            ["npm", "run", "dev"],
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
