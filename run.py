import subprocess
import sys
import time

def run_services():
    try:
        # Jalankan Backend FastAPI
        print("Menjalankan FastAPI backend...")
        backend_process = subprocess.Popen(
            [r"backend\venv\Scripts\python", "-m", "uvicorn", "main:app", "--reload"],
            cwd="backend"
        )

        # Beri jeda 2 detik
        time.sleep(2)

        # Jalankan Frontend React (Vite)
        print("Menjalankan React frontend...")
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