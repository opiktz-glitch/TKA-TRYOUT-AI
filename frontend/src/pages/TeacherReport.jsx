import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import StatCard from "../components/StatCard";
import {
  IconUsers,
  IconTarget,
  IconCheck,
  IconTrophy,
  IconTrendingUp,
} from "../components/Icons";

import { getTeacherReport, getTryouts } from "../services/api";
import { useAuth } from "../auth/AuthContext";


// =====================================================
// HELPER — warna badge berdasarkan tingkat kesalahan
// =====================================================

function wrongBadgeStyle(percentage) {
  if (percentage >= 60) {
    return { background: "#fef2f2", color: "#dc2626" };
  }

  if (percentage >= 30) {
    return { background: "#fffbeb", color: "#b45309" };
  }

  return { background: "var(--accent-soft, #E2F4F1)", color: "var(--success, #3F7D58)" };
}


function TeacherReport() {
  const { user } = useAuth();

  const [tryoutOptions, setTryoutOptions] = useState([]);
  const [selectedTryoutId, setSelectedTryoutId] = useState("");

  const [report, setReport] = useState(null);

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");


  useEffect(() => {
    loadTryoutOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTryoutId) {
      loadReport(selectedTryoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTryoutId]);


  async function loadTryoutOptions() {
    try {
      setLoadingOptions(true);
      setError("");

      const data = await getTryouts();

      // Hanya tryout milik guru yang sedang login yang
      // muncul di dropdown pemilihan laporan.
      const mine = user
        ? data.filter((t) => t.created_by === user.id)
        : data;

      setTryoutOptions(mine);

      if (mine.length > 0) {
        setSelectedTryoutId(String(mine[0].id));
      }
    } catch (err) {
      console.error("LOAD TRYOUT OPTIONS ERROR:", err);
      setError(err.message || "Gagal memuat daftar tryout");
    } finally {
      setLoadingOptions(false);
    }
  }


  async function loadReport(tryoutId) {
    try {
      setLoadingReport(true);
      setError("");

      const data = await getTeacherReport(tryoutId);

      setReport(data);
    } catch (err) {
      console.error("LOAD REPORT ERROR:", err);
      setError(err.message || "Gagal memuat laporan");
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  }


  const maxBucketCount = report
    ? Math.max(1, ...report.score_distribution.map((b) => b.count))
    : 1;


  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Header />

        <div className="content">

          {/* HEADER */}

          <div className="page-header">
            <div>
              <h1>Laporan</h1>
              <p>Analitik hasil tryout: rata-rata skor, distribusi nilai, dan soal tersulit</p>
            </div>
          </div>

          {/* PEMILIH TRYOUT */}

          <div className="dashboard-card" style={{ padding: "14px 18px", marginBottom: 14 }}>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>

              <label style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
                Pilih Tryout
              </label>

              <select
                className="report-select"
                value={selectedTryoutId}
                onChange={(e) => setSelectedTryoutId(e.target.value)}
                disabled={loadingOptions || tryoutOptions.length === 0}
              >
                {tryoutOptions.length === 0 && (
                  <option value="">Belum ada tryout</option>
                )}

                {tryoutOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>

            </div>

          </div>

          {loadingOptions && (
            <div className="loading-message">Memuat daftar tryout...</div>
          )}

          {error && <div className="error-message">{error}</div>}

          {!loadingOptions && tryoutOptions.length === 0 && !error && (
            <div className="empty-message">
              Kamu belum membuat tryout. Buat tryout terlebih dahulu untuk melihat laporan analitiknya.
            </div>
          )}

          {loadingReport && (
            <div className="loading-message">Memuat laporan...</div>
          )}

          {!loadingReport && report && (
            <>

              {/* RINGKASAN */}

              <div className="stat-grid">
                <StatCard
                  icon={<IconUsers />}
                  title="Total Peserta"
                  value={report.total_attempts}
                  description="Sudah menyelesaikan tryout"
                />

                <StatCard
                  icon={<IconTarget />}
                  title="Rata-rata Skor"
                  value={report.average_score ?? "-"}
                  description={report.max_score ? `Dari maksimal ${report.max_score}` : "Dari semua peserta"}
                />

                <StatCard
                  icon={<IconTrophy />}
                  title="Skor Tertinggi / Terendah"
                  value={
                    report.highest_score !== null
                      ? `${report.highest_score} / ${report.lowest_score}`
                      : "-"
                  }
                  description="Rentang perolehan skor"
                />

                <StatCard
                  icon={<IconCheck />}
                  title="Tingkat Lulus"
                  value={report.pass_rate !== null ? `${report.pass_rate}%` : "-"}
                  description="Dari peserta yang selesai"
                />
              </div>

              {/* DISTRIBUSI NILAI */}

              <div className="dashboard-card" style={{ marginBottom: 14 }}>

                <div className="card-header">
                  <div>
                    <h3>Distribusi Nilai</h3>
                    <p>Sebaran perolehan skor peserta (persentase dari skor maksimal)</p>
                  </div>
                </div>

                <div style={{ padding: "6px 18px 18px" }}>

                  {report.total_attempts === 0 && (
                    <div className="empty-message">
                      Belum ada peserta yang menyelesaikan tryout ini.
                    </div>
                  )}

                  {report.total_attempts > 0 && report.score_distribution.map((bucket) => (
                    <div className="dist-bar-row" key={bucket.range}>

                      <div className="dist-bar-label">{bucket.range}%</div>

                      <div className="dist-bar-track">
                        <div
                          className="dist-bar-fill"
                          style={{
                            width: `${(bucket.count / maxBucketCount) * 100}%`,
                          }}
                        />
                      </div>

                      <div className="dist-bar-count">{bucket.count}</div>

                    </div>
                  ))}

                </div>

              </div>

              {/* SOAL PALING SERING SALAH */}

              <div className="dashboard-card">

                <div className="card-header">
                  <div>
                    <h3>Soal Paling Sering Salah</h3>
                    <p>10 soal dengan persentase jawaban salah tertinggi</p>
                  </div>

                  <span className="menu-icon" style={{ color: "var(--accent)" }}>
                    <IconTrendingUp size={20} />
                  </span>
                </div>

                <div style={{ padding: "4px 18px 10px" }}>

                  {report.hardest_questions.length === 0 && (
                    <div className="empty-message">
                      Belum ada data jawaban untuk tryout ini.
                    </div>
                  )}

                  {report.hardest_questions.map((q, index) => (
                    <div className="hardest-question-item" key={q.question_id}>

                      <div className="hardest-question-body">

                        <div className="hardest-question-rank">
                          {index + 1}
                        </div>

                        <div>
                          <div className="hardest-question-text">
                            {q.question_text}
                          </div>

                          <div className="hardest-question-meta">
                            No. {q.question_number} &middot; {q.correct_count} dari {report.total_attempts} peserta menjawab benar
                          </div>
                        </div>

                      </div>

                      <span
                        className="wrong-badge"
                        style={wrongBadgeStyle(q.wrong_percentage)}
                      >
                        {q.wrong_percentage}% salah
                      </span>

                    </div>
                  ))}

                </div>

              </div>

            </>
          )}

        </div>

      </main>
    </div>
  );
}

export default TeacherReport;
