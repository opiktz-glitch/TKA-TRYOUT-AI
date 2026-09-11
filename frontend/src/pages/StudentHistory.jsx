import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconBarChart, IconCheck, IconTrophy } from "../components/Icons";

import {
  getAttemptHistory,
  getAttemptResultDetail,
} from "../services/api";


// =====================================================
// HELPER — format tanggal "8 Sep 2026, 14:30"
// =====================================================

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  const isoString = hasTimezone ? value : `${value}Z`;

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function StudentHistory() {

  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);


  useEffect(() => {
    loadHistory();
  }, []);


  async function loadHistory() {
    try {
      setLoading(true);
      setError("");

      const data = await getAttemptHistory();

      setAttempts(data);
    } catch (err) {
      console.error("LOAD HISTORY ERROR:", err);
      setError(err.message || "Gagal memuat riwayat tryout");
    } finally {
      setLoading(false);
    }
  }


  async function openDetail(attempt) {
    setDetail({ attempt_id: attempt.attempt_id });
    setDetailError("");
    setDetailLoading(true);
    setQuestionIndex(0);

    try {
      const data = await getAttemptResultDetail(attempt.attempt_id);
      setDetail(data);
    } catch (err) {
      console.error("LOAD DETAIL ERROR:", err);
      setDetailError(err.message || "Gagal memuat detail hasil");
    } finally {
      setDetailLoading(false);
    }
  }


  function closeDetail() {
    setDetail(null);
    setDetailError("");
    setQuestionIndex(0);
  }


  function goToPrevQuestion() {
    setQuestionIndex((i) => Math.max(0, i - 1));
  }


  function goToNextQuestion() {
    setQuestionIndex((i) =>
      Math.min((detail?.questions?.length || 1) - 1, i + 1)
    );
  }


  const filteredAttempts = attempts.filter((item) => {
    const keyword = search.toLowerCase();

    return (
      item.title?.toLowerCase().includes(keyword) ||
      item.subject_name?.toLowerCase().includes(keyword)
    );
  });


  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Header />

        <div className="content">

          {/* HEADER */}

          <div className="page-header">
            <div>
              <h1>Riwayat &amp; Hasil Tryout</h1>
              <p>Semua tryout yang sudah kamu selesaikan, lengkap dengan skornya</p>
            </div>
          </div>

          <div className="dashboard-card">

            <div className="user-toolbar">
              <input
                type="text"
                placeholder="Cari judul tryout / mata pelajaran..."
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading && (
              <div className="loading-message">Memuat riwayat tryout...</div>
            )}

            {error && <div className="error-message">{error}</div>}

            {!loading && !error && (
              <div className="table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Judul Tryout</th>
                      <th>Mata Pelajaran</th>
                      <th>Selesai</th>
                      <th>Skor</th>
                      <th>Benar / Salah / Kosong</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAttempts.map((item) => (
                      <tr key={item.attempt_id}>
                        <td>
                          <strong>{item.title}</strong>
                        </td>

                        <td>{item.subject_name || "-"}</td>

                        <td>{formatDate(item.finished_at)}</td>

                        <td>
                          <strong>
                            {item.score !== null && item.score !== undefined
                              ? Math.round(item.score * 100) / 100
                              : "-"}
                          </strong>
                          {item.max_score ? ` / ${item.max_score}` : ""}
                        </td>

                        <td>
                          <span style={{ color: "var(--success, #3F7D58)" }}>
                            {item.correct_count ?? 0}
                          </span>
                          {" / "}
                          <span style={{ color: "#dc2626" }}>
                            {item.wrong_count ?? 0}
                          </span>
                          {" / "}
                          <span style={{ color: "#9ca3af" }}>
                            {item.unanswered_count ?? 0}
                          </span>
                        </td>

                        <td>
                          {item.passed === true && (
                            <span className="status-active">
                              <IconCheck size={13} style={{ verticalAlign: "-2px" }} /> Lulus
                            </span>
                          )}

                          {item.passed === false && (
                            <span className="status-inactive">
                              Tidak Lulus
                            </span>
                          )}

                          {item.passed === null && (
                            <span className="status-inactive">
                              {item.status}
                            </span>
                          )}
                        </td>

                        <td>
                          <button
                            className="secondary-button"
                            onClick={() => openDetail(item)}
                          >
                            <IconBarChart size={15} />
                            Lihat Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredAttempts.length === 0 && (
                  <div className="empty-message">
                    {search
                      ? "Riwayat tidak ditemukan."
                      : "Belum ada tryout yang kamu selesaikan."}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </main>


      {/* =========================================================
          MODAL DETAIL HASIL
      ========================================================= */}

      {detail && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640 }}>

            <div className="modal-header">
              <div>
                <h2>{detail.title || "Detail Hasil"}</h2>
                <p>{detail.subject_name}</p>
              </div>

              <button className="modal-close" onClick={closeDetail}>
                ×
              </button>
            </div>

            {detailLoading && (
              <div className="loading-message">Memuat detail hasil...</div>
            )}

            {detailError && (
              <div className="error-message">{detailError}</div>
            )}

            {!detailLoading && !detailError && detail.questions && (
              <div>

                {/* RINGKASAN */}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 16px",
                    borderRadius: 8,
                    background: "var(--accent-soft)",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: detail.passed ? "var(--accent)" : "#dc2626",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconTrophy size={22} />
                  </div>

                  <div>
                    <strong style={{ fontSize: 18 }}>
                      {detail.score} {detail.max_score ? `/ ${detail.max_score}` : ""}
                    </strong>

                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {detail.correct_count} benar, {detail.wrong_count} salah,{" "}
                      {detail.unanswered_count} kosong
                      {detail.percentage !== null && detail.percentage !== undefined
                        ? ` · ${Math.round(detail.percentage)}%`
                        : ""}
                    </div>
                  </div>
                </div>

                {/* PEMBAHASAN PER SOAL — satu soal per tampilan,
                    dengan tombol Sebelumnya / Selanjutnya */}

                {detail.questions.length > 0 && (() => {
                  const q = detail.questions[questionIndex];
                  const isFirst = questionIndex === 0;
                  const isLast = questionIndex === detail.questions.length - 1;

                  return (
                    <div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                          Soal {q.question_number} dari {detail.questions.length}
                        </span>

                        {q.is_correct ? (
                          <span style={{ color: "var(--success, #3F7D58)", fontSize: 12 }}>
                            <IconCheck size={12} style={{ verticalAlign: "-1px" }} /> Benar
                          </span>
                        ) : (
                          <span style={{ color: "#dc2626", fontSize: 12 }}>
                            {q.selected_option ? "Salah" : "Tidak dijawab"}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: 14,
                          minHeight: 220,
                        }}
                      >
                        <p style={{ fontSize: 14, marginBottom: 10 }}>
                          {q.question_text}
                        </p>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {q.options.map((option) => {
                            const isSelected = option.code === q.selected_option;
                            const isCorrectOption = option.code === q.correct_option;

                            let background = "white";
                            let border = "1px solid #e5e7eb";

                            if (isCorrectOption) {
                              background = "#ecfdf5";
                              border = "1px solid #3F7D58";
                            } else if (isSelected && !q.is_correct) {
                              background = "#fef2f2";
                              border = "1px solid #dc2626";
                            }

                            return (
                              <div
                                key={option.code}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "8px 12px",
                                  borderRadius: 6,
                                  border,
                                  background,
                                  fontSize: 13,
                                }}
                              >
                                <span style={{ fontWeight: 600 }}>{option.code}.</span>
                                <span>{option.text}</span>

                                {isCorrectOption && (
                                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--success, #3F7D58)" }}>
                                    Kunci Jawaban
                                  </span>
                                )}

                                {isSelected && !isCorrectOption && (
                                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#dc2626" }}>
                                    Jawabanmu
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div
                            style={{
                              marginTop: 10,
                              fontSize: 12,
                              color: "#6b7280",
                              background: "#f9fafb",
                              padding: 10,
                              borderRadius: 6,
                            }}
                          >
                            <strong>Pembahasan:</strong> {q.explanation}
                          </div>
                        )}
                      </div>

                      {/* NAVIGASI SOAL */}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 14,
                        }}
                      >
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={goToPrevQuestion}
                          disabled={isFirst}
                          style={isFirst ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                        >
                          ← Sebelumnya
                        </button>

                        <div style={{ display: "flex", gap: 4 }}>
                          {detail.questions.map((_, idx) => (
                            <span
                              key={idx}
                              onClick={() => setQuestionIndex(idx)}
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                cursor: "pointer",
                                background:
                                  idx === questionIndex
                                    ? "var(--accent)"
                                    : "#d1d5db",
                              }}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          className="primary-button"
                          onClick={goToNextQuestion}
                          disabled={isLast}
                          style={isLast ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                        >
                          Selanjutnya →
                        </button>
                      </div>

                    </div>
                  );
                })()}

              </div>
            )}

            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="secondary-button" onClick={closeDetail}>
                Tutup
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default StudentHistory;
