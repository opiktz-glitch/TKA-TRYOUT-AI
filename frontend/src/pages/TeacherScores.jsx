import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import StatCard from "../components/StatCard";
import { IconBarChart, IconCheck, IconTarget, IconUsers } from "../components/Icons";

import { getTeacherScores, getTryouts } from "../services/api";
import { useAuth } from "../auth/AuthContext";


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


function TeacherScores() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [scores, setScores] = useState([]);
  const [tryoutOptions, setTryoutOptions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedTryoutId, setSelectedTryoutId] = useState("");


  useEffect(() => {
    loadTryoutOptions();
  }, []);

  useEffect(() => {
    loadScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTryoutId]);


  async function loadTryoutOptions() {
    try {
      const data = await getTryouts();

      // Hanya tryout yang dibuat oleh guru yang sedang login
      // yang muncul di dropdown filter.
      const mine = user
        ? data.filter((t) => t.created_by === user.id)
        : data;

      setTryoutOptions(mine);
    } catch (err) {
      console.error("LOAD TRYOUT OPTIONS ERROR:", err);
    }
  }


  async function loadScores() {
    try {
      setLoading(true);
      setError("");

      const data = await getTeacherScores(selectedTryoutId || undefined);

      setScores(data);
    } catch (err) {
      console.error("LOAD SCORES ERROR:", err);
      setError(err.message || "Gagal memuat rekap nilai");
    } finally {
      setLoading(false);
    }
  }


  const filteredScores = scores.filter((item) => {
    const keyword = search.toLowerCase();

    return (
      item.student_name?.toLowerCase().includes(keyword) ||
      item.student_code?.toLowerCase().includes(keyword) ||
      item.tryout_title?.toLowerCase().includes(keyword)
    );
  });


  const summary = useMemo(() => {
    if (scores.length === 0) {
      return {
        totalAttempts: 0,
        averageScore: 0,
        passRate: 0,
        totalTryouts: 0,
      };
    }

    const totalAttempts = scores.length;

    const validScores = scores.filter(
      (s) => s.score !== null && s.score !== undefined
    );

    const averageScore =
      validScores.length > 0
        ? validScores.reduce((sum, s) => sum + s.score, 0) / validScores.length
        : 0;

    const passedCount = scores.filter((s) => s.passed === true).length;
    const passRate = (passedCount / totalAttempts) * 100;

    const totalTryouts = new Set(scores.map((s) => s.tryout_id)).size;

    return {
      totalAttempts,
      averageScore: Math.round(averageScore * 10) / 10,
      passRate: Math.round(passRate),
      totalTryouts,
    };
  }, [scores]);


  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Header />

        <div className="content">

          {/* HEADER */}

          <div className="page-header">
            <div>
              <h1>Nilai</h1>
              <p>Rekap skor siswa dari tryout yang kamu buat</p>
            </div>
          </div>

          {/* RINGKASAN */}

          <div className="stat-grid">
            <StatCard
              icon={<IconUsers />}
              title="Total Peserta"
              value={summary.totalAttempts}
              description="Attempt selesai"
            />

            <StatCard
              icon={<IconTarget />}
              title="Rata-rata Skor"
              value={summary.averageScore}
              description="Dari semua peserta"
            />

            <StatCard
              icon={<IconCheck />}
              title="Tingkat Lulus"
              value={`${summary.passRate}%`}
              description="Dari peserta yang selesai"
            />

            <StatCard
              icon={<IconBarChart />}
              title="Paket Tryout"
              value={summary.totalTryouts}
              description="Sudah ada peserta"
            />
          </div>

          {/* TABLE */}

          <div className="dashboard-card">

            <div className="user-toolbar" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Cari nama siswa / NIS / judul tryout..."
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                value={selectedTryoutId}
                onChange={(e) => setSelectedTryoutId(e.target.value)}
                style={{
                  padding: "10px 13px",
                  border: "1px solid #d1d5db",
                  borderRadius: 7,
                  outline: "none",
                  fontSize: 13,
                }}
              >
                <option value="">Semua Tryout</option>

                {tryoutOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {loading && (
              <div className="loading-message">Memuat rekap nilai...</div>
            )}

            {error && <div className="error-message">{error}</div>}

            {!loading && !error && (
              <div className="table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>NIS</th>
                      <th>Nama Siswa</th>
                      <th>Tryout</th>
                      <th>Mapel</th>
                      <th>Skor</th>
                      <th>Benar / Salah / Kosong</th>
                      <th>Status</th>
                      <th>Selesai</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredScores.map((item) => (
                      <tr key={item.attempt_id}>
                        <td>{item.student_code || "-"}</td>
                        <td><strong>{item.student_name || "-"}</strong></td>
                        <td>{item.tryout_title}</td>
                        <td>{item.subject_name || "-"}</td>

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
                            <span className="status-active">Lulus</span>
                          )}

                          {item.passed === false && (
                            <span className="status-inactive">Tidak Lulus</span>
                          )}

                          {item.passed === null && (
                            <span className="status-inactive">-</span>
                          )}
                        </td>

                        <td>{formatDate(item.finished_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredScores.length === 0 && (
                  <div className="empty-message">
                    {search || selectedTryoutId
                      ? "Tidak ada hasil yang cocok."
                      : "Belum ada siswa yang menyelesaikan tryout kamu."}
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

export default TeacherScores;
