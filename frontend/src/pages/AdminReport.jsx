import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import StatCard from "../components/StatCard";
import {
  IconGraduationCap,
  IconUser,
  IconClipboard,
  IconTarget,
  IconTrendingUp,
} from "../components/Icons";

import { getAdminReportOverview } from "../services/api";


// =====================================================
// HELPER — format "8 Sep" dari tanggal ISO "2026-09-08"
// =====================================================

function formatShortDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}


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


function AdminReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    loadReport();
  }, []);


  async function loadReport() {
    try {
      setLoading(true);
      setError("");

      const data = await getAdminReportOverview();

      setReport(data);
    } catch (err) {
      console.error("LOAD ADMIN REPORT ERROR:", err);
      setError(err.message || "Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }


  const maxSubjectAverage = report
    ? Math.max(1, ...report.average_score_per_subject.map((s) => s.average_score))
    : 1;

  const maxTrendCount = report
    ? Math.max(1, ...report.attempts_trend.map((d) => d.count))
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
              <p>Ringkasan analitik seluruh sistem: mata pelajaran, guru, dan soal tersulit</p>
            </div>
          </div>

          {loading && (
            <div className="loading-message">Memuat laporan...</div>
          )}

          {error && <div className="error-message">{error}</div>}

          {!loading && report && (
            <>

              {/* RINGKASAN */}

              <div className="stat-grid">
                <StatCard
                  icon={<IconGraduationCap />}
                  title="Total Siswa"
                  value={report.total_students}
                  description="Terdaftar di sistem"
                />

                <StatCard
                  icon={<IconUser />}
                  title="Total Guru"
                  value={report.total_teachers}
                  description="Terdaftar di sistem"
                />

                <StatCard
                  icon={<IconClipboard />}
                  title="Total Tryout"
                  value={report.total_tryouts}
                  description={`${report.total_attempts} attempt selesai`}
                />

                <StatCard
                  icon={<IconTarget />}
                  title="Rata-rata Skor Sistem"
                  value={report.average_score_overall ?? "-"}
                  description="Dari semua tryout"
                />
              </div>

              {/* RATA-RATA SKOR PER MAPEL */}

              <div className="dashboard-card" style={{ marginBottom: 14 }}>

                <div className="card-header">
                  <div>
                    <h3>Rata-rata Skor per Mata Pelajaran</h3>
                    <p>Dihitung dari seluruh tryout yang sudah diselesaikan siswa</p>
                  </div>
                </div>

                <div style={{ padding: "6px 18px 18px" }}>

                  {report.average_score_per_subject.length === 0 && (
                    <div className="empty-message">
                      Belum ada attempt yang selesai.
                    </div>
                  )}

                  {report.average_score_per_subject.map((subject) => (
                    <div className="dist-bar-row" key={subject.subject_id}>

                      <div className="subject-bar-label">{subject.subject_name}</div>

                      <div className="dist-bar-track">
                        <div
                          className="dist-bar-fill"
                          style={{
                            width: `${(subject.average_score / maxSubjectAverage) * 100}%`,
                          }}
                        />
                      </div>

                      <div className="dist-bar-count">{subject.average_score}</div>

                    </div>
                  ))}

                </div>

              </div>

              {/* TREN JUMLAH ATTEMPT */}

              <div className="dashboard-card" style={{ marginBottom: 14 }}>

                <div className="card-header">
                  <div>
                    <h3>Tren Jumlah Attempt</h3>
                    <p>Jumlah tryout yang diselesaikan siswa, 14 hari terakhir</p>
                  </div>
                </div>

                <div className="trend-chart">

                  {report.attempts_trend.map((day) => (
                    <div className="trend-bar-col" key={day.date}>

                      <div
                        className="trend-bar"
                        style={{
                          height: `${(day.count / maxTrendCount) * 100}%`,
                        }}
                        title={`${formatShortDate(day.date)}: ${day.count} attempt`}
                      />

                      <div className="trend-bar-date">
                        {formatShortDate(day.date)}
                      </div>

                    </div>
                  ))}

                </div>

              </div>

              {/* GURU PALING AKTIF */}

              <div className="dashboard-card" style={{ marginBottom: 14 }}>

                <div className="card-header">
                  <div>
                    <h3>Guru Paling Aktif</h3>
                    <p>Berdasarkan jumlah attempt siswa pada tryout yang dibuat</p>
                  </div>
                </div>

                <div className="table-container">
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>Guru</th>
                        <th>Jumlah Tryout</th>
                        <th>Jumlah Attempt</th>
                        <th>Jangkauan Siswa</th>
                      </tr>
                    </thead>

                    <tbody>
                      {report.top_teachers.map((t, index) => (
                        <tr key={t.teacher_id}>
                          <td>
                            <span className="teacher-rank-badge">{index + 1}</span>
                            <strong>{t.teacher_name}</strong>
                          </td>
                          <td>{t.tryout_count}</td>
                          <td>{t.total_attempts}</td>
                          <td>{t.student_reach}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {report.top_teachers.length === 0 && (
                    <div className="empty-message">
                      Belum ada guru yang membuat tryout.
                    </div>
                  )}
                </div>

              </div>

              {/* SOAL PALING SERING SALAH (GLOBAL) */}

              <div className="dashboard-card">

                <div className="card-header">
                  <div>
                    <h3>Soal Paling Sering Salah</h3>
                    <p>10 soal dengan persentase jawaban salah tertinggi di seluruh sistem</p>
                  </div>

                  <span className="menu-icon" style={{ color: "var(--accent)" }}>
                    <IconTrendingUp size={20} />
                  </span>
                </div>

                <div style={{ padding: "4px 18px 10px" }}>

                  {report.hardest_questions.length === 0 && (
                    <div className="empty-message">
                      Belum cukup data jawaban untuk ditampilkan.
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
                            {q.subject_name} &middot; dijawab {q.total_answered} kali
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

export default AdminReport;
