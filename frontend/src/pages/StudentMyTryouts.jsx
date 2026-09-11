import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconTarget, IconClock } from "../components/Icons";

import { getOngoingAttempts } from "../services/api";


// =====================================================
// HELPER — format detik jadi mm:ss (atau h:mm:ss kalau > 1 jam)
// =====================================================

function formatRemaining(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


function StudentMyTryouts() {
  const navigate = useNavigate();

  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =====================================================
  // LOAD DATA
  // =====================================================

  useEffect(() => {
    loadAttempts();
  }, []);

  async function loadAttempts() {
    try {
      setLoading(true);
      setError("");

      const data = await getOngoingAttempts();

      setAttempts(data);
    } catch (err) {
      console.error("LOAD ONGOING ATTEMPTS ERROR:", err);
      setError(err.message || "Gagal memuat tryout yang sedang berjalan");
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // COUNTDOWN — tick semua baris tiap detik di sisi client,
  // dasarnya tetap remaining_seconds yang dihitung di server
  // ketika data pertama kali dimuat (bukan dihitung ulang
  // dari started_at di browser, supaya tidak kena masalah
  // zona waktu).
  // =====================================================

  useEffect(() => {
    if (attempts.length === 0) {
      return;
    }

    const timer = setInterval(() => {
      setAttempts((prev) =>
        prev.map((item) => ({
          ...item,
          remaining_seconds: Math.max(0, item.remaining_seconds - 1),
          time_expired: item.remaining_seconds - 1 <= 0,
        }))
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [attempts.length]);

  function handleContinue(attempt) {
    navigate(`/student/attempt/${attempt.attempt_id}`);
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Header />

        <div className="content">
          {/* HEADER */}

          <div className="page-header">
            <div>
              <h1>Tryout Saya</h1>
              <p>Tryout yang sedang kamu kerjakan dan belum dikumpulkan</p>
            </div>
          </div>

          <div className="dashboard-card">
            {loading && (
              <div className="loading-message">Memuat tryout kamu...</div>
            )}

            {error && <div className="error-message">{error}</div>}

            {!loading && !error && (
              <div className="table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Judul Tryout</th>
                      <th>Mata Pelajaran</th>
                      <th>Progres</th>
                      <th>Sisa Waktu</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>

                  <tbody>
                    {attempts.map((item) => {
                      const isCritical =
                        item.remaining_seconds <= 300 && !item.time_expired;

                      return (
                        <tr key={item.attempt_id}>
                          <td>
                            <strong>{item.title}</strong>
                          </td>

                          <td>{item.subject_name || "-"}</td>

                          <td>
                            {item.answered_count} / {item.total_questions} soal
                          </td>

                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontWeight: 600,
                                color: item.time_expired
                                  ? "#dc2626"
                                  : isCritical
                                  ? "#dc2626"
                                  : "inherit",
                              }}
                            >
                              <IconClock size={14} />
                              {item.time_expired
                                ? "Waktu habis"
                                : formatRemaining(item.remaining_seconds)}
                            </span>
                          </td>

                          <td>
                            <button
                              className="primary-button"
                              onClick={() => handleContinue(item)}
                            >
                              <IconTarget size={15} />
                              {item.time_expired ? "Lihat Hasil" : "Lanjutkan"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {attempts.length === 0 && (
                  <div className="empty-message">
                    Tidak ada tryout yang sedang kamu kerjakan saat ini.
                    Yuk mulai dari menu{" "}
                    <strong>Daftar Tryout</strong>.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default StudentMyTryouts;
