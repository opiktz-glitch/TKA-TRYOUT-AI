import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

import {
  getSubjects,
  getStudentTryouts,
  startStudentTryout,
} from "../services/api";

import { IconClipboard } from "../components/Icons";

// =====================================================
// DIFFICULTY
// =====================================================

const DIFFICULTIES = [
  {
    value: "EASY",
    label: "Mudah",
  },
  {
    value: "MEDIUM",
    label: "Sedang",
  },
  {
    value: "HARD",
    label: "Sulit",
  },
];

// =====================================================
// COMPONENT
// =====================================================

function StudentTryoutList() {
  const navigate = useNavigate();

  // =====================================================
  // DATA
  // =====================================================

  const [tryouts, setTryouts] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // =====================================================
  // UI STATE
  // =====================================================

  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);

  // =====================================================
  // FILTER
  // =====================================================

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");

  // =====================================================
  // MESSAGE
  // =====================================================

  const [error, setError] = useState("");

  // =====================================================
  // LOAD AWAL
  // =====================================================

  useEffect(() => {
    loadData();
  }, []);

  // =====================================================
  // LOAD DATA
  // =====================================================

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [tryoutData, subjectData] = await Promise.all([
        getStudentTryouts(),
        getSubjects(),
      ]);

      // -------------------------------------------------
      // TRYOUT
      // -------------------------------------------------

      if (Array.isArray(tryoutData)) {
        setTryouts(tryoutData);
      } else if (Array.isArray(tryoutData?.tryouts)) {
        setTryouts(tryoutData.tryouts);
      } else {
        setTryouts([]);
      }

      // -------------------------------------------------
      // SUBJECT
      // -------------------------------------------------

      if (Array.isArray(subjectData)) {
        setSubjects(subjectData);
      } else {
        setSubjects([]);
      }
    } catch (err) {
      console.error("LOAD STUDENT TRYOUT ERROR:", err);

      setError(
        err.message ||
          "Gagal mengambil daftar tryout"
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // GET SUBJECT NAME
  // =====================================================

  function getSubjectName(subjectId) {
    const subject = subjects.find(
      (item) =>
        Number(item.id) === Number(subjectId)
    );

    return subject
      ? subject.name
      : "-";
  }

  // =====================================================
  // GET DIFFICULTY LABEL
  // =====================================================

  function getDifficultyLabel(difficulty) {
    const item = DIFFICULTIES.find(
      (difficultyItem) =>
        difficultyItem.value === difficulty
    );

    return item
      ? item.label
      : difficulty || "-";
  }

  // =====================================================
  // FILTER TRYOUT
  // =====================================================

  const filteredTryouts = useMemo(() => {
    const keyword =
      search.trim().toLowerCase();

    return tryouts.filter((tryout) => {
      const subjectName =
        getSubjectName(
          tryout.subject_id
        ).toLowerCase();

      const title =
        (tryout.title || "").toLowerCase();

      const description =
        (tryout.description || "").toLowerCase();

      const matchesSearch =
        !keyword ||
        title.includes(keyword) ||
        description.includes(keyword) ||
        subjectName.includes(keyword);

      const matchesSubject =
        !subjectFilter ||
        String(tryout.subject_id) ===
          String(subjectFilter);

      const matchesDifficulty =
        !difficultyFilter ||
        tryout.difficulty ===
          difficultyFilter;

      return (
        matchesSearch &&
        matchesSubject &&
        matchesDifficulty
      );
    });
  }, [
    tryouts,
    subjects,
    search,
    subjectFilter,
    difficultyFilter,
  ]);

  // =====================================================
  // START TRYOUT
  // =====================================================

  async function handleStartTryout(tryout) {
    const confirmed = window.confirm(
      `Apakah Anda siap mengerjakan tryout "${tryout.title}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setStartingId(tryout.id);
      setError("");

      const result =
        await startStudentTryout(
          tryout.id
        );

      console.log(
        "START TRYOUT RESULT:",
        result
      );

      if (!result?.attempt_id) {
        throw new Error(
          "Server tidak mengembalikan attempt_id."
        );
      }

      // -------------------------------------------------
      // MASUK KE HALAMAN PENGERJAAN
      // -------------------------------------------------

      navigate(
        `/student/attempt/${result.attempt_id}`
      );
    } catch (err) {
      console.error(
        "START STUDENT TRYOUT ERROR:",
        err
      );

      setError(
        err.message ||
          "Gagal memulai tryout"
      );
    } finally {
      setStartingId(null);
    }
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="app-layout">

      {/* =================================================
          SIDEBAR
      ================================================= */}

      <Sidebar />

      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      <main className="main-content">

        {/* =================================================
            HEADER
        ================================================= */}

        <Header />

        <div className="content">

          {/* =================================================
              PAGE HEADER
          ================================================= */}

          <div className="page-header">
            <div>
              <h1>Daftar Tryout</h1>

              <p>
                Pilih paket tryout yang ingin Anda kerjakan.
              </p>
            </div>
          </div>

          {/* =================================================
              TABLE CARD & FILTER
          ================================================= */}

          <div className="dashboard-card">

            {/* =================================================
                FILTER
            ================================================= */}

            <div className="question-filter">

              {/* SEARCH */}

              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Cari judul tryout..."
                  className="search-input"
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                />
              </div>

              {/* SUBJECT */}

              <div className="filter-group">
                <select
                  value={subjectFilter}
                  onChange={(e) =>
                    setSubjectFilter(
                      e.target.value
                    )
                  }
                  className="search-input"
                >
                  <option value="">
                    Semua Mata Pelajaran
                  </option>

                  {subjects
                    .filter(
                      (subject) =>
                        subject.is_active
                    )
                    .map((subject) => (
                      <option
                        key={subject.id}
                        value={subject.id}
                      >
                        {subject.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* DIFFICULTY */}

              <div className="filter-group">
                <select
                  value={difficultyFilter}
                  onChange={(e) =>
                    setDifficultyFilter(
                      e.target.value
                    )
                  }
                  className="search-input"
                >
                  <option value="">
                    Semua Tingkat Kesulitan
                  </option>

                  {DIFFICULTIES.map(
                    (item) => (
                      <option
                        key={item.value}
                        value={item.value}
                      >
                        {item.label}
                      </option>
                    )
                  )}
                </select>
              </div>

            </div>

            {/* =================================================
                LOADING
            ================================================= */}

            {loading && (
              <div className="loading-message">
                Memuat daftar tryout...
              </div>
            )}

            {/* =================================================
                ERROR
            ================================================= */}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {/* =================================================
                TABLE
            ================================================= */}

            {!loading && !error && (
              <div className="table-container">

                <table className="user-table">

                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Judul Tryout</th>
                      <th>Mata Pelajaran</th>
                      <th>Kelas</th>
                      <th>Soal</th>
                      <th>Durasi</th>
                      <th>Difficulty</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>

                  <tbody>

                    {filteredTryouts.map(
                      (tryout) => (
                        <tr
                          key={tryout.id}
                        >

                          {/* ID */}

                          <td>
                            {tryout.id}
                          </td>

                          {/* JUDUL */}

                          <td>
                            <strong>
                              {tryout.title}
                            </strong>

                            {tryout.description && (
                              <div
                                style={{
                                  marginTop:
                                    "4px",
                                  fontSize:
                                    "12px",
                                  color:
                                    "#777",
                                }}
                              >
                                {
                                  tryout.description
                                }
                              </div>
                            )}
                          </td>

                          {/* SUBJECT */}

                          <td>
                            {getSubjectName(
                              tryout.subject_id
                            )}
                          </td>

                          {/* GRADE */}

                          <td>
                            {tryout.grade ||
                              "-"}
                          </td>

                          {/* QUESTIONS */}

                          <td>
                            {tryout.total_questions ??
                              0}
                          </td>

                          {/* DURATION */}

                          <td>
                            {tryout.duration_minutes ??
                              0}{" "}
                            menit
                          </td>

                          {/* DIFFICULTY */}

                          <td>
                            <span
                              className={`difficulty-badge ${(
                                tryout.difficulty ||
                                ""
                              ).toLowerCase()}`}
                            >
                              {getDifficultyLabel(
                                tryout.difficulty
                              )}
                            </span>
                          </td>

                          {/* STATUS */}

                          <td>
                            {tryout.is_active ? (
                              <span className="status-active">
                                Tersedia
                              </span>
                            ) : (
                              <span className="status-inactive">
                                Tidak tersedia
                              </span>
                            )}
                          </td>

                          {/* ACTION */}

                          <td>

                            <button
                              className="primary-button"
                              onClick={() =>
                                handleStartTryout(
                                  tryout
                                )
                              }
                              disabled={
                                !tryout.is_active ||
                                startingId ===
                                  tryout.id
                              }
                              title="Mulai Tryout"
                            >

                              {startingId ===
                              tryout.id ? (
                                "Menyiapkan..."
                              ) : (
                                <>
                                  <IconClipboard
                                    size={15}
                                  />
                                  Mulai
                                </>
                              )}

                            </button>

                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

                {/* =================================================
                    EMPTY
                ================================================= */}

                {filteredTryouts.length ===
                  0 && (
                  <div className="empty-message">
                    {search ||
                    subjectFilter ||
                    difficultyFilter
                      ? "Tryout tidak ditemukan."
                      : "Belum ada tryout yang tersedia."}
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

export default StudentTryoutList;