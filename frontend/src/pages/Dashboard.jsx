import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import StatCard from "../components/StatCard";
import {
  IconUsers,
  IconGraduationCap,
  IconUser,
  IconShield,
  IconNotebook,
  IconClipboard,
  IconBarChart,
  IconTarget,
  IconTrophy,
  IconTrendingUp,
  IconClock,
  IconRefresh,
  IconCpu,
} from "../components/Icons";

import {
  getUsers,
  getStudentProfiles,
  getTeacherProfiles,
  getQuestions,
  getTryouts,
  getTeacherScores,
  getStudentTryouts,
  getAttemptHistory,
  getSystemStatus,
} from "../services/api";


// =====================================================
// HELPER — ambil item dengan id terbesar.
//
// Dipakai sebagai proxy "paling baru dibuat" untuk data
// user/tryout/soal, karena endpoint-endpoint tersebut tidak
// mengembalikan field created_at ke frontend (hanya id yang
// auto-increment dan pasti urut sesuai waktu pembuatan).
// =====================================================

function getLatestById(items) {
  if (!items || items.length === 0) {
    return null;
  }

  return items.reduce(
    (latest, item) => (item.id > latest.id ? item : latest),
    items[0]
  );
}


// =====================================================
// HELPER — potong teks panjang untuk preview singkat
// =====================================================

function truncateText(text, maxLength = 70) {
  if (!text) {
    return "";
  }

  return text.length > maxLength
    ? `${text.slice(0, maxLength)}…`
    : text;
}


// =====================================================
// HELPER — format tanggal jadi relatif ("2 jam lalu", dst)
// =====================================================

function timeAgo(dateString) {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Baru saja";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} menit lalu`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} jam lalu`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays} hari lalu`;
  }

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}


function Dashboard() {
  // Tambahkan 'loading' dari useAuth()
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState("");

  // ADMIN
  const [adminStats, setAdminStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalAdmins: 0,
  });

  const [adminActivity, setAdminActivity] = useState({
    latestUser: null,
    latestTryout: null,
    latestQuestion: null,
  });

  // GURU
  const [teacherStats, setTeacherStats] = useState({
    totalSoal: 0,
    totalTryout: 0,
    totalPeserta: 0,
    totalHasil: 0,
  });

  const [teacherActivity, setTeacherActivity] = useState({
    latestQuestion: null,
    latestTryout: null,
  });

  // SISWA
  const [studentStats, setStudentStats] = useState({
    tryoutTersedia: 0,
    tryoutDiikuti: 0,
    nilaiTerakhir: null,
    rataRata: null,
    lastAttemptDate: null,
  });

  const [studentTryoutsPreview, setStudentTryoutsPreview] = useState([]);

  // INFORMASI SISTEM (API, Database, Auth, AI/Ollama)
  const [systemStatus, setSystemStatus] = useState(null);
  const [systemLoading, setSystemLoading] = useState(true);
  const [systemError, setSystemError] = useState("");


  // =====================================================
  // LOAD DATA — sesuai role user yang sedang login
  // =====================================================

  useEffect(() => {
    if (!user) {
      return;
    }

    loadDashboardData(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


  // =====================================================
  // LOAD — Informasi Sistem
  //
  // Dicek langsung ke backend (bukan teks statis), termasuk
  // status koneksi ke server AI (Ollama). Hanya dicek saat
  // dashboard dibuka / di-refresh, atau lewat tombol
  // "Cek Ulang" manual — tidak ada auto-refresh berkala.
  // =====================================================

  useEffect(() => {
    if (!user) {
      return;
    }

    loadSystemStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadSystemStatus() {
    try {
      setSystemLoading(true);
      setSystemError("");

      const data = await getSystemStatus();
      setSystemStatus(data);
    } catch (err) {
      console.error("LOAD SYSTEM STATUS ERROR:", err);
      setSystemError(
        err.message || "Gagal memuat status sistem"
      );
    } finally {
      setSystemLoading(false);
    }
  }

  async function loadDashboardData(currentUser) {
    try {
      setDashLoading(true);
      setDashError("");

      if (currentUser.role === "ADMIN") {
        await loadAdminData();
      } else if (currentUser.role === "GURU") {
        await loadTeacherData(currentUser);
      } else if (currentUser.role === "SISWA") {
        await loadStudentData();
      }
    } catch (err) {
      console.error("LOAD DASHBOARD DATA ERROR:", err);
      setDashError(
        err.message || "Gagal memuat data dashboard"
      );
    } finally {
      setDashLoading(false);
    }
  }

  async function loadAdminData() {
    const [
      usersData,
      studentsData,
      teachersData,
      tryoutsData,
      questionsData,
    ] = await Promise.all([
      getUsers(),
      getStudentProfiles(),
      getTeacherProfiles(),
      getTryouts(),
      getQuestions(),
    ]);

    setAdminStats({
      totalUsers: usersData.length,
      totalStudents: studentsData.length,
      totalTeachers: teachersData.length,
      totalAdmins: usersData.filter(
        (u) => u.role === "ADMIN"
      ).length,
    });

    setAdminActivity({
      latestUser: getLatestById(usersData),
      latestTryout: getLatestById(tryoutsData),
      latestQuestion: getLatestById(questionsData),
    });
  }

  async function loadTeacherData(currentUser) {
    const [questionsData, tryoutsData, scoresData] = await Promise.all([
      getQuestions(),
      getTryouts(),
      getTeacherScores(),
    ]);

    const myQuestions = questionsData.filter(
      (q) => q.created_by === currentUser.id
    );

    const myTryouts = tryoutsData.filter(
      (t) => t.created_by === currentUser.id
    );

    // getTeacherScores() untuk role GURU sudah otomatis
    // difilter di backend, hanya berisi hasil dari tryout
    // miliknya sendiri.
    const uniqueStudents = new Set(
      scoresData.map((s) => s.student_id)
    );

    setTeacherStats({
      totalSoal: myQuestions.length,
      totalTryout: myTryouts.length,
      totalPeserta: uniqueStudents.size,
      totalHasil: scoresData.length,
    });

    setTeacherActivity({
      latestQuestion: getLatestById(myQuestions),
      latestTryout: getLatestById(myTryouts),
    });
  }

  async function loadStudentData() {
    const [tryoutsData, historyData] = await Promise.all([
      getStudentTryouts(),
      getAttemptHistory(),
    ]);

    // "Siap dikerjakan" = belum pernah submit (null / IN_PROGRESS)
    const belumSelesai = tryoutsData.filter(
      (t) => t.attempt_status !== "SUBMITTED"
    );

    const scores = historyData
      .map((h) => h.score)
      .filter((score) => score !== null && score !== undefined);

    const averageScore = scores.length
      ? Math.round(
          (scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10
        ) / 10
      : null;

    setStudentStats({
      tryoutTersedia: belumSelesai.length,
      tryoutDiikuti: historyData.length,
      nilaiTerakhir:
        historyData.length > 0 ? historyData[0].score : null,
      rataRata: averageScore,
      lastAttemptDate:
        historyData.length > 0 ? historyData[0].finished_at : null,
    });

    setStudentTryoutsPreview(tryoutsData.slice(0, 3));
  }


  // Jika masih proses memuat data user dari token
  if (loading) {
    return <div className="loading-screen">Memuat sesi...</div>;
  }

  // Jika tidak ada user setelah loading selesai
  if (!user) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Header />
          <div className="content">
            <div className="dashboard-card">
              <h2>Sesi tidak ditemukan. Silakan login ulang.</h2>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (

    <div className="app-layout">

      <Sidebar />


      <main className="main-content">

        <Header />


        <div className="content">

          {/* =========================================
              WELCOME
          ========================================= */}

          <div className="welcome-section">

            <div>

              <h1>
                Selamat datang,{" "}
                {user.full_name || user.username}
              </h1>

              <p>
                {user.role === "ADMIN" &&
                  "Kelola seluruh sistem TKA Tryout melalui Dashboard Admin."}

                {user.role === "GURU" &&
                  "Kelola soal, tryout, peserta, dan hasil belajar siswa."}

                {user.role === "SISWA" &&
                  "Ikuti tryout, lihat hasil, dan pantau perkembangan belajar Anda."}
              </p>

            </div>

          </div>


          {dashError && (
            <div className="dashboard-card" style={{ borderColor: "#fca5a5" }}>
              <p style={{ color: "#dc2626", margin: 0 }}>
                {dashError}
              </p>
            </div>
          )}


          {/* =========================================
              ADMIN DASHBOARD
          ========================================= */}

          {user.role === "ADMIN" && (

            <>

              <div className="stat-grid">

                <StatCard
                  icon={<IconUsers />}
                  title="Total User"
                  value={dashLoading ? "…" : adminStats.totalUsers}
                  description="User terdaftar"
                />

                <StatCard
                  icon={<IconGraduationCap />}
                  title="Siswa"
                  value={dashLoading ? "…" : adminStats.totalStudents}
                  description="Siswa terdaftar"
                />

                <StatCard
                  icon={<IconUser />}
                  title="Guru"
                  value={dashLoading ? "…" : adminStats.totalTeachers}
                  description="Guru terdaftar"
                />

                <StatCard
                  icon={<IconShield />}
                  title="Admin"
                  value={dashLoading ? "…" : adminStats.totalAdmins}
                  description="Administrator"
                />

              </div>


              <div className="dashboard-grid">

                <section className="dashboard-card">

                  <div className="card-header">

                    <div>

                      <h3>
                        Aktivitas Terbaru
                      </h3>

                      <p>
                        Aktivitas sistem terbaru
                      </p>

                    </div>

                  </div>


                  <div className="activity-list">

                    <div className="activity-item">

                      <div className="activity-icon">
                        <IconGraduationCap size={18} />
                      </div>

                      <div className="activity-content">

                        <strong>
                          User terbaru
                        </strong>

                        <span>
                          {adminActivity.latestUser
                            ? (adminActivity.latestUser.full_name ||
                               adminActivity.latestUser.username)
                            : "Belum ada user terdaftar"}
                        </span>

                      </div>

                    </div>


                    <div className="activity-item">

                      <div className="activity-icon">
                        <IconClipboard size={18} />
                      </div>

                      <div className="activity-content">

                        <strong>
                          Tryout terbaru
                        </strong>

                        <span>
                          {adminActivity.latestTryout
                            ? adminActivity.latestTryout.title
                            : "Belum ada tryout dibuat"}
                        </span>

                      </div>

                    </div>


                    <div className="activity-item">

                      <div className="activity-icon">
                        <IconNotebook size={18} />
                      </div>

                      <div className="activity-content">

                        <strong>
                          Soal terbaru
                        </strong>

                        <span>
                          {adminActivity.latestQuestion
                            ? truncateText(
                                adminActivity.latestQuestion.question_text,
                                60
                              )
                            : "Belum ada soal ditambahkan"}
                        </span>

                      </div>

                    </div>

                  </div>

                </section>


                <section className="dashboard-card">

                  <div className="card-header">

                    <div>

                      <h3>
                        Akses Cepat
                      </h3>

                      <p>
                        Administrasi sistem
                      </p>

                    </div>

                  </div>


                  <div className="quick-menu">

                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/users")}
                    >

                      <span>
                        <IconUsers size={20} />
                      </span>

                      <div>

                        <strong>
                          Kelola User
                        </strong>

                        <small>
                          Tambah dan kelola pengguna
                        </small>

                      </div>

                    </button>


                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/questions")}
                    >

                      <span>
                        <IconNotebook size={20} />
                      </span>

                      <div>

                        <strong>
                          Bank Soal
                        </strong>

                        <small>
                          Kelola bank soal
                        </small>

                      </div>

                    </button>


                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/tryouts")}
                    >

                      <span>
                        <IconClipboard size={20} />
                      </span>

                      <div>

                        <strong>
                          Paket Tryout
                        </strong>

                        <small>
                          Kelola paket tryout
                        </small>

                      </div>

                    </button>

                  </div>

                </section>

              </div>

            </>

          )}


          {/* =========================================
              GURU DASHBOARD
          ========================================= */}

          {user.role === "GURU" && (

            <>

              <div className="stat-grid">

                <StatCard
                  icon={<IconNotebook />}
                  title="Soal Saya"
                  value={dashLoading ? "…" : teacherStats.totalSoal}
                  description="Soal dibuat"
                />

                <StatCard
                  icon={<IconClipboard />}
                  title="Tryout Saya"
                  value={dashLoading ? "…" : teacherStats.totalTryout}
                  description="Paket tryout"
                />

                <StatCard
                  icon={<IconGraduationCap />}
                  title="Peserta"
                  value={dashLoading ? "…" : teacherStats.totalPeserta}
                  description="Peserta tryout"
                />

                <StatCard
                  icon={<IconBarChart />}
                  title="Hasil"
                  value={dashLoading ? "…" : teacherStats.totalHasil}
                  description="Hasil pengerjaan"
                />

              </div>


              <div className="dashboard-grid">

                <section className="dashboard-card">

                  <div className="card-header">

                    <div>

                      <h3>
                        Aktivitas Guru
                      </h3>

                      <p>
                        Aktivitas pengelolaan pembelajaran
                      </p>

                    </div>

                  </div>


                  <div className="activity-list">

                    <div className="activity-item">

                      <div className="activity-icon">
                        <IconNotebook size={18} />
                      </div>

                      <div className="activity-content">

                        <strong>
                          Bank Soal
                        </strong>

                        <span>
                          {teacherActivity.latestQuestion
                            ? truncateText(
                                teacherActivity.latestQuestion.question_text,
                                60
                              )
                            : "Belum ada soal yang Anda buat"}
                        </span>

                      </div>

                    </div>


                    <div className="activity-item">

                      <div className="activity-icon">
                        <IconClipboard size={18} />
                      </div>

                      <div className="activity-content">

                        <strong>
                          Tryout
                        </strong>

                        <span>
                          {teacherActivity.latestTryout
                            ? teacherActivity.latestTryout.title
                            : "Belum ada tryout yang Anda buat"}
                        </span>

                      </div>

                    </div>

                  </div>

                </section>


                <section className="dashboard-card">

                  <div className="card-header">

                    <div>

                      <h3>
                        Akses Cepat
                      </h3>

                      <p>
                        Menu guru
                      </p>

                    </div>

                  </div>


                  <div className="quick-menu">

                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/questions")}
                    >

                      <span>
                        <IconNotebook size={20} />
                      </span>

                      <div>

                        <strong>
                          Bank Soal
                        </strong>

                        <small>
                          Kelola soal
                        </small>

                      </div>

                    </button>


                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/tryouts")}
                    >

                      <span>
                        <IconClipboard size={20} />
                      </span>

                      <div>

                        <strong>
                          Buat Tryout
                        </strong>

                        <small>
                          Buat paket tryout
                        </small>

                      </div>

                    </button>


                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/teacher/scores")}
                    >

                      <span>
                        <IconBarChart size={20} />
                      </span>

                      <div>

                        <strong>
                          Hasil Peserta
                        </strong>

                        <small>
                          Lihat hasil tryout
                        </small>

                      </div>

                    </button>

                  </div>

                </section>

              </div>

            </>

          )}


          {/* =========================================
              SISWA DASHBOARD
          ========================================= */}

          {user.role === "SISWA" && (

            <>

              <div className="stat-grid">

                <StatCard
                  icon={<IconClipboard />}
                  title="Tryout Tersedia"
                  value={dashLoading ? "…" : studentStats.tryoutTersedia}
                  description="Siap dikerjakan"
                />

                <StatCard
                  icon={<IconTarget />}
                  title="Tryout Diikuti"
                  value={dashLoading ? "…" : studentStats.tryoutDiikuti}
                  description="Sudah dikerjakan"
                />

                <StatCard
                  icon={<IconTrophy />}
                  title="Nilai Terakhir"
                  value={
                    dashLoading
                      ? "…"
                      : (studentStats.nilaiTerakhir ?? "-")
                  }
                  description={
                    studentStats.lastAttemptDate
                      ? timeAgo(studentStats.lastAttemptDate)
                      : "Belum ada nilai"
                  }
                />

                <StatCard
                  icon={<IconTrendingUp />}
                  title="Rata-rata"
                  value={
                    dashLoading
                      ? "…"
                      : (studentStats.rataRata ?? "-")
                  }
                  description={
                    studentStats.tryoutDiikuti > 0
                      ? `Dari ${studentStats.tryoutDiikuti} tryout`
                      : "Belum ada data"
                  }
                />

              </div>


              <div className="dashboard-grid">

                <section className="dashboard-card">

                  <div className="card-header">

                    <div>

                      <h3>
                        Tryout Terbaru
                      </h3>

                      <p>
                        Tryout yang tersedia untuk Anda
                      </p>

                    </div>

                  </div>


                  <div className="activity-list">

                    {studentTryoutsPreview.length === 0 && (

                      <div className="activity-item">

                        <div className="activity-icon">
                          <IconClipboard size={18} />
                        </div>

                        <div className="activity-content">

                          <strong>
                            Belum ada tryout
                          </strong>

                          <span>
                            Tryout yang tersedia akan muncul di sini
                          </span>

                        </div>

                      </div>

                    )}

                    {studentTryoutsPreview.map((tryout) => (

                      <div className="activity-item" key={tryout.id}>

                        <div className="activity-icon">
                          <IconClipboard size={18} />
                        </div>

                        <div className="activity-content">

                          <strong>
                            {tryout.title}
                          </strong>

                          <span>
                            {tryout.subject_name || "-"}
                            {tryout.attempt_status === "SUBMITTED" &&
                              ` · Selesai (${tryout.score ?? "-"})`}
                            {tryout.attempt_status === "IN_PROGRESS" &&
                              " · Sedang dikerjakan"}
                            {!tryout.attempt_status &&
                              " · Belum dikerjakan"}
                          </span>

                        </div>

                      </div>

                    ))}

                  </div>

                </section>


                <section className="dashboard-card">

                  <div className="card-header">

                    <div>

                      <h3>
                        Akses Cepat
                      </h3>

                      <p>
                        Menu siswa
                      </p>

                    </div>

                  </div>


                  <div className="quick-menu">

                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/student/tryouts")}
                    >

                      <span>
                        <IconClipboard size={20} />
                      </span>

                      <div>

                        <strong>
                          Mulai Tryout
                        </strong>

                        <small>
                          Ikuti tryout tersedia
                        </small>

                      </div>

                    </button>


                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/student/history")}
                    >

                      <span>
                        <IconBarChart size={20} />
                      </span>

                      <div>

                        <strong>
                          Hasil Tryout
                        </strong>

                        <small>
                          Lihat hasil
                        </small>

                      </div>

                    </button>


                    <button
                      className="quick-menu-item"
                      onClick={() => navigate("/student/history")}
                    >

                      <span>
                        <IconClock size={20} />
                      </span>

                      <div>

                        <strong>
                          Riwayat
                        </strong>

                        <small>
                          Riwayat pengerjaan
                        </small>

                      </div>

                    </button>

                  </div>

                </section>

              </div>

            </>

          )}


          {/* =========================================
              SYSTEM INFORMATION (interaktif, real-time)
          ========================================= */}

          <section className="dashboard-card system-card">

            <div className="card-header">

              <div>

                <h3>
                  Informasi Sistem
                </h3>

                <p>
                  Status aplikasi TKA Tryout
                  {systemStatus && !systemLoading && (
                    <span className="system-updated">
                      {" "}· diperbarui baru saja
                    </span>
                  )}
                </p>

              </div>

              <button
                type="button"
                className={
                  "system-refresh-btn" +
                  (systemLoading ? " spinning" : "")
                }
                onClick={loadSystemStatus}
                disabled={systemLoading}
                title="Cek ulang status sistem"
              >
                <IconRefresh size={16} />
                {systemLoading ? "Memeriksa..." : "Cek Ulang"}
              </button>

            </div>


            {systemError && !systemLoading && (
              <div className="system-error-banner">
                Gagal memeriksa status sistem: {systemError}
              </div>
            )}


            <div className="system-status">

              {/* --- API SERVER --- */}
              <div className="status-item">

                <div className="status-item-title">
                  <span
                    className={
                      "status-dot" +
                      (systemLoading
                        ? " checking"
                        : systemStatus?.api?.online
                        ? ""
                        : " offline")
                    }
                  ></span>

                  <strong>API Server</strong>
                </div>

                <small>
                  {systemStatus?.api?.framework || "FastAPI"}
                </small>

                <small className="status-sub">
                  {systemLoading
                    ? "Memeriksa..."
                    : systemStatus?.api?.online
                    ? "Online"
                    : "Offline"}
                </small>
              </div>


              {/* --- DATABASE --- */}
              <div className="status-item">

                <div className="status-item-title">
                  <span
                    className={
                      "status-dot" +
                      (systemLoading
                        ? " checking"
                        : systemStatus?.database?.online
                        ? ""
                        : " offline")
                    }
                  ></span>

                  <strong>Database</strong>
                </div>

                <small>
                  {systemStatus?.database?.engine || "SQLite"}
                </small>

                <small
                  className="status-sub"
                  title={systemStatus?.database?.directory}
                >
                  {systemLoading
                    ? "Memeriksa..."
                    : systemStatus?.database?.online
                    ? "Online"
                    : "Offline"}
                </small>
              </div>


              {/* --- AUTHENTICATION --- */}
              <div className="status-item">

                <div className="status-item-title">
                  <span
                    className={
                      "status-dot" +
                      (systemLoading
                        ? " checking"
                        : systemStatus?.auth?.online
                        ? ""
                        : " offline")
                    }
                  ></span>

                  <strong>Authentication</strong>
                </div>

                <small>
                  {systemStatus?.auth?.label || "JWT aktif"}
                </small>

                <small className="status-sub">
                  {systemLoading
                    ? "Memeriksa..."
                    : systemStatus?.auth?.online
                    ? "Online"
                    : "Offline"}
                </small>
              </div>


              {/* --- AI (OLLAMA) --- */}
              <div className="status-item">

                <div className="status-item-title">
                  <span
                    className={
                      "status-dot" +
                      (systemLoading
                        ? " checking"
                        : systemStatus?.ai?.online
                        ? ""
                        : " offline")
                    }
                  ></span>

                  <strong>AI</strong>
                </div>

                <small>
                  {systemStatus?.ai?.provider || "Ollama"} -{" "}
                  {systemStatus?.ai?.model || "-"}
                </small>

                <small className="status-sub">
                  {systemLoading
                    ? "Memeriksa..."
                    : systemStatus?.ai?.online
                    ? `Online - IP ${systemStatus?.ai?.host || "-"}`
                    : "Offline"}
                </small>
              </div>

            </div>

          </section>

        </div>

      </main>

    </div>

  );

}


export default Dashboard;
