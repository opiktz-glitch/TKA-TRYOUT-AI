import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconClock, IconCheck } from "../components/Icons";

import {
  getStudentAttempt,
  saveStudentAnswer,
  submitStudentAttempt,
} from "../services/api";


// =====================================================
// HELPER — format detik jadi mm:ss
// =====================================================

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


// =====================================================
// HELPER — parse timestamp dari backend sebagai UTC
//
// Backend selalu menyimpan waktu pakai datetime.utcnow()
// (naive, UTC), tapi ketika di-serialize ke JSON string-nya
// TIDAK punya suffix "Z"/offset (contoh: "2026-09-08T03:15:30").
// Kalau string seperti ini langsung dilempar ke `new Date()`,
// browser akan menganggapnya sebagai WAKTU LOKAL, bukan UTC.
// Di Jakarta (UTC+7) ini bikin waktu mulai "mundur" 7 jam,
// sehingga sisa waktu tryout langsung dianggap habis begitu
// halaman dibuka. Fungsi ini memaksa string tanpa info zona
// waktu untuk diperlakukan sebagai UTC.
// =====================================================

function parseUtcDate(value) {
  if (!value) return null;

  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;

  return new Date(normalized);
}


function StudentTryoutAttempt() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  // =====================================================
  // DATA
  // =====================================================

  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  // =====================================================
  // UI STATE
  // =====================================================

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savingQuestionId, setSavingQuestionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [alreadyDone, setAlreadyDone] = useState(false);

  // =====================================================
  // TIMER
  // =====================================================

  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const hasAutoSubmitted = useRef(false);

  // =====================================================
  // LOAD ATTEMPT
  // =====================================================

  useEffect(() => {
    loadAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function loadAttempt() {
    try {
      setLoading(true);
      setError("");

      const data = await getStudentAttempt(attemptId);

      if (data.status !== "IN_PROGRESS") {
        setAlreadyDone(true);
        setAttempt(data);
        return;
      }

      setAttempt(data);
      setQuestions(data.questions || []);

      const initialAnswers = {};

      (data.questions || []).forEach((q) => {
        initialAnswers[q.question_id] = q.selected_option || null;
      });

      setAnswers(initialAnswers);

      // -------------------------------------------------
      // HITUNG SISA WAKTU
      // -------------------------------------------------

      const startedAt = parseUtcDate(data.started_at).getTime();
      const durationMs = (data.duration_minutes || 0) * 60 * 1000;
      const deadline = startedAt + durationMs;

      const secondsLeft = Math.floor((deadline - Date.now()) / 1000);

      setRemainingSeconds(secondsLeft);
    } catch (err) {
      console.error("LOAD ATTEMPT ERROR:", err);
      setError(err.message || "Gagal memuat soal tryout");
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // COUNTDOWN
  // =====================================================

  useEffect(() => {
    if (remainingSeconds === null || alreadyDone || result) {
      return;
    }

    if (remainingSeconds <= 0) {
      if (!hasAutoSubmitted.current) {
        hasAutoSubmitted.current = true;
        handleSubmit(true);
      }
      return;
    }

    const timer = setTimeout(() => {
      setRemainingSeconds((prev) => (prev !== null ? prev - 1 : prev));
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, alreadyDone, result]);

  // =====================================================
  // JUMLAH TERJAWAB
  // =====================================================

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(Boolean).length;
  }, [answers]);

  // =====================================================
  // PILIH JAWABAN
  // =====================================================

  async function handleSelectOption(questionId, optionCode) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionCode,
    }));

    try {
      setSavingQuestionId(questionId);

      await saveStudentAnswer(attemptId, questionId, optionCode);
    } catch (err) {
      console.error("SAVE ANSWER ERROR:", err);
      setError(err.message || "Gagal menyimpan jawaban, coba lagi.");
    } finally {
      setSavingQuestionId(null);
    }
  }

  // =====================================================
  // SUBMIT
  // =====================================================

  async function handleSubmit(isAutoSubmit = false) {
    if (!isAutoSubmit) {
      const unanswered = questions.length - answeredCount;

      const confirmMessage =
        unanswered > 0
          ? `Masih ada ${unanswered} soal yang belum dijawab. Yakin ingin mengirim jawaban sekarang?`
          : "Yakin ingin mengirim jawaban Anda sekarang?";

      const confirmed = window.confirm(confirmMessage);

      if (!confirmed) {
        return;
      }
    }

    try {
      setSubmitting(true);
      setError("");

      const data = await submitStudentAttempt(attemptId);

      setResult(data);
    } catch (err) {
      console.error("SUBMIT ERROR:", err);
      setError(err.message || "Gagal mengirim tryout");
    } finally {
      setSubmitting(false);
    }
  }

  // =====================================================
  // RENDER — LOADING
  // =====================================================

  if (loading) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Header />
          <div className="content">
            <div className="loading-message">Memuat soal tryout...</div>
          </div>
        </main>
      </div>
    );
  }

  // =====================================================
  // RENDER — ERROR FATAL (attempt tidak ditemukan dll)
  // =====================================================

  if (error && !attempt) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Header />
          <div className="content">
            <div className="error-message">{error}</div>
            <button
              className="secondary-button"
              style={{ marginTop: 12 }}
              onClick={() => navigate("/student/tryouts")}
            >
              Kembali ke Daftar Tryout
            </button>
          </div>
        </main>
      </div>
    );
  }

  // =====================================================
  // RENDER — SUDAH PERNAH DIKERJAKAN (bukan hasil submit
  // di sesi ini, tapi status attempt memang sudah selesai)
  // =====================================================

  if (alreadyDone && !result) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Header />
          <div className="content">
            <div className="dashboard-card" style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0 }}>{attempt?.title}</h3>
              <p style={{ color: "#6b7280" }}>
                Tryout ini sudah pernah Anda selesaikan sebelumnya.
              </p>
              <button
                className="primary-button"
                onClick={() => navigate("/student/tryouts")}
              >
                Kembali ke Daftar Tryout
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =====================================================
  // RENDER — HASIL SETELAH SUBMIT
  // =====================================================

  if (result) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Header />
          <div className="content">
            <div
              className="dashboard-card"
              style={{ padding: 32, textAlign: "center", maxWidth: 480, margin: "0 auto" }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: result.passed ? "var(--accent-soft)" : "#fee2e2",
                  color: result.passed ? "var(--accent)" : "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 26,
                  fontFamily: "var(--font-voice)",
                  fontWeight: 600,
                }}
              >
                {Math.round(result.percentage)}%
              </div>

              <h3 style={{ margin: "0 0 4px" }}>
                {result.passed ? "Selamat, Anda lulus!" : "Tryout selesai"}
              </h3>

              <p style={{ color: "#6b7280", marginBottom: 20 }}>
                Skor Anda: <strong>{result.score}</strong>
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 24,
                  marginBottom: 24,
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "var(--success, #3F7D58)" }}>
                    {result.correct_count}
                  </div>
                  <div style={{ color: "#9ca3af" }}>Benar</div>
                </div>

                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#dc2626" }}>
                    {result.wrong_count}
                  </div>
                  <div style={{ color: "#9ca3af" }}>Salah</div>
                </div>

                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: "#9ca3af" }}>
                    {result.unanswered_count}
                  </div>
                  <div style={{ color: "#9ca3af" }}>Kosong</div>
                </div>
              </div>

              <button
                className="primary-button"
                onClick={() => navigate("/student/tryouts")}
              >
                Kembali ke Daftar Tryout
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =====================================================
  // RENDER — HALAMAN PENGERJAAN
  // =====================================================

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isTimeCritical = remainingSeconds !== null && remainingSeconds <= 300;

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Header />

        <div className="content">
          {/* =================================================
              HEADER TRYOUT + TIMER
          ================================================= */}

          <div
            className="dashboard-card"
            style={{
              padding: "14px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>{attempt?.title}</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>
                {answeredCount} dari {questions.length} soal terjawab
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 8,
                background: isTimeCritical ? "#fee2e2" : "var(--accent-soft)",
                color: isTimeCritical ? "#dc2626" : "var(--accent)",
                fontFamily: "var(--font-voice)",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              <IconClock size={17} />
              {remainingSeconds !== null ? formatTime(remainingSeconds) : "--:--"}
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 220px",
              gap: 14,
              alignItems: "start",
            }}
          >
            {/* =================================================
                SOAL
            ================================================= */}

            <div className="dashboard-card" style={{ padding: 22 }}>
              {currentQuestion ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      Soal {currentQuestion.question_number} dari {questions.length}
                    </span>

                    <span
                      className={`difficulty-badge ${(currentQuestion.difficulty || "").toLowerCase()}`}
                    >
                      {currentQuestion.difficulty}
                    </span>
                  </div>

                  <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
                    {currentQuestion.question_text}
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {currentQuestion.options.map((option) => {
                      const isSelected =
                        answers[currentQuestion.question_id] === option.code;

                      return (
                        <button
                          key={option.code}
                          onClick={() =>
                            handleSelectOption(
                              currentQuestion.question_id,
                              option.code
                            )
                          }
                          disabled={
                            savingQuestionId === currentQuestion.question_id
                          }
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            textAlign: "left",
                            padding: "12px 16px",
                            borderRadius: 8,
                            border: isSelected
                              ? "1.5px solid var(--accent)"
                              : "1px solid #e5e7eb",
                            background: isSelected
                              ? "var(--accent-soft)"
                              : "white",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              flexShrink: 0,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 600,
                              background: isSelected ? "var(--accent)" : "#f3f4f6",
                              color: isSelected ? "white" : "#6b7280",
                            }}
                          >
                            {option.code}
                          </span>

                          {option.text}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 24,
                    }}
                  >
                    <button
                      className="secondary-button"
                      onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                      disabled={currentIndex === 0}
                    >
                      Sebelumnya
                    </button>

                    {isLastQuestion ? (
                      <button
                        className="primary-button"
                        onClick={() => handleSubmit(false)}
                        disabled={submitting}
                      >
                        {submitting ? "Mengirim..." : "Kumpulkan Jawaban"}
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={() =>
                          setCurrentIndex((i) =>
                            Math.min(questions.length - 1, i + 1)
                          )
                        }
                      >
                        Selanjutnya
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-message">Tidak ada soal pada tryout ini.</div>
              )}
            </div>

            {/* =================================================
                NAVIGASI NOMOR SOAL
            ================================================= */}

            <div className="dashboard-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 12px" }}>
                Navigasi Soal
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {questions.map((q, index) => {
                  const isAnswered = Boolean(answers[q.question_id]);
                  const isActive = index === currentIndex;

                  return (
                    <button
                      key={q.question_id}
                      onClick={() => setCurrentIndex(index)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: isActive
                          ? "1.5px solid var(--accent)"
                          : "1px solid #e5e7eb",
                        background: isAnswered
                          ? "var(--accent-soft)"
                          : "white",
                        color: isAnswered ? "var(--accent)" : "#6b7280",
                      }}
                    >
                      {q.question_number}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <IconCheck size={13} />
                {answeredCount} terjawab, {questions.length - answeredCount} kosong
              </div>

              <button
                className="primary-button"
                style={{ width: "100%" }}
                onClick={() => handleSubmit(false)}
                disabled={submitting}
              >
                {submitting ? "Mengirim..." : "Kumpulkan Jawaban"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default StudentTryoutAttempt;
