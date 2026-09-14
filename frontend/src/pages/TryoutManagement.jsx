import { useCallback, useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconEdit, IconTrash, IconCheck, IconEye } from "../components/Icons";
import {
  getSubjects,
  getTryouts,
  getTryout,
  getTryoutReview,
  getAvailableQuestions,
  createTryout,
  updateTryout,
  deleteTryout as deleteTryoutApi,
} from "../services/api";

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

const GRADES = ["4", "5", "6"];

function TryoutManagement() {
  // =====================================================
  // DATA
  // =====================================================

  const [tryouts, setTryouts] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [availableQuestions, setAvailableQuestions] = useState([]);
  const [bankSoalDifficultyFilter, setBankSoalDifficultyFilter] =
    useState("");

  // =====================================================
  // UI STATE
  // =====================================================

  const [loading, setLoading] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTryout, setEditingTryout] = useState(null);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewTab, setReviewTab] = useState("soal");

  // =====================================================
  // FILTER
  // =====================================================

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // =====================================================
  // PAGINATION (Paket Tryout)
  // =====================================================

  const TRYOUTS_PER_PAGE = 10;

  const [currentPage, setCurrentPage] = useState(1);

  // =====================================================
  // MESSAGE
  // =====================================================

  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // =====================================================
  // FORM
  // =====================================================

  function createEmptyForm() {
    return {
      title: "",
      description: "",
      subject_id: "",
      grade: "",
      duration_minutes: 60,
      max_score: 100,
      difficulty: "",
      is_active: true,
      questions: [],
    };
  }

  const [form, setForm] = useState(createEmptyForm());

  // =====================================================
  // LOAD SUBJECTS
  // =====================================================

  const loadSubjects = useCallback(async () => {
    try {
      const data = await getSubjects();

      setSubjects(data);
    } catch (err) {
      console.error("LOAD SUBJECT ERROR:", err);
      setLoadError(err.message || "Gagal mengambil mata pelajaran");
    }
  }, []);

  // =====================================================
  // LOAD TRYOUT
  // =====================================================

  const loadTryouts = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");

      const data = await getTryouts();

      setTryouts(data);
    } catch (err) {
      console.error("LOAD TRYOUT ERROR:", err);
      setLoadError(err.message || "Gagal mengambil data tryout");
    } finally {
      setLoading(false);
    }
  }, []);

  // =====================================================
  // LOAD AWAL
  // =====================================================

  useEffect(() => {
    loadSubjects();
    loadTryouts();
  }, [loadSubjects, loadTryouts]);

  // =====================================================
  // LOAD AVAILABLE QUESTIONS
  // =====================================================

  async function loadAvailableQuestions(subjectId) {
    if (!subjectId) {
      setAvailableQuestions([]);
      return;
    }

    try {
      setLoadingQuestions(true);

      const data = await getAvailableQuestions(subjectId);

      setAvailableQuestions(data);
    } catch (err) {
      console.error("LOAD QUESTIONS ERROR:", err);
      setFormError(err.message || "Gagal mengambil bank soal");
      setAvailableQuestions([]);
    } finally {
      setLoadingQuestions(false);
    }
  }

  // =====================================================
  // GET SUBJECT NAME
  // =====================================================

  function getSubjectName(subjectId) {
    const subject = subjects.find(
      (item) => Number(item.id) === Number(subjectId)
    );

    return subject ? subject.name : "-";
  }

  // =====================================================
  // GET DIFFICULTY LABEL
  // =====================================================

  function getDifficultyLabel(difficulty) {
    const item = DIFFICULTIES.find(
      (difficultyItem) => difficultyItem.value === difficulty
    );

    return item ? item.label : difficulty || "-";
  }

  // =====================================================
  // FORM CHANGE
  // =====================================================

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (name === "subject_id") {
      setForm((prev) => ({
        ...prev,
        subject_id: value,
        questions: [],
      }));

      setAvailableQuestions([]);
      setBankSoalDifficultyFilter("");

      if (value) {
        // Bank soal ditampilkan untuk SEMUA tingkat kesulitan
        // sekaligus (EASY/MEDIUM/HARD) selama mata pelajarannya
        // sama — tidak lagi difilter per tingkat kesulitan.
        loadAvailableQuestions(value);
      }

      return;
    }
  }

  // =====================================================
  // OPEN ADD MODAL
  // =====================================================

  function openModal() {
    setEditingTryout(null);
    setForm(createEmptyForm());
    setAvailableQuestions([]);
    setBankSoalDifficultyFilter("");
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  // =====================================================
  // OPEN EDIT MODAL
  // =====================================================

  async function openEditModal(tryout) {
    try {
      setLoadError("");
      setFormError("");
      setFormSuccess("");
      setEditingTryout(tryout);
      setBankSoalDifficultyFilter("");

      const detail = await getTryout(tryout.id);

      setForm({
        title: detail.title || "",
        description: detail.description || "",
        subject_id: String(detail.subject_id),
        grade: detail.grade || "",
        duration_minutes: detail.duration_minutes || 60,
        max_score: detail.max_score || 100,
        difficulty: detail.difficulty || "",
        is_active: detail.is_active !== false,
        questions: (detail.questions || []).map((item) => ({
          question_id: Number(item.question_id),
          question_number: Number(item.question_number),
          points: Number(item.points || 1),
        })),
      });

      setShowModal(true);

      await loadAvailableQuestions(detail.subject_id);
    } catch (err) {
      console.error("OPEN EDIT TRYOUT ERROR:", err);
      setEditingTryout(null);
      setLoadError(err.message || "Gagal mengambil detail tryout");
    }
  }

  // =====================================================
  // CLOSE MODAL
  // =====================================================

  function closeModal() {
    if (saving) {
      return;
    }

    setShowModal(false);
    setEditingTryout(null);
    setForm(createEmptyForm());
    setAvailableQuestions([]);
    setFormError("");
    setFormSuccess("");
  }

  // =====================================================
  // OPEN REVIEW MODAL (lihat soal & jawaban)
  // =====================================================

  async function openReviewModal(tryout) {
    try {
      setReviewError("");
      setReviewData(null);
      setReviewTab("soal");
      setShowReviewModal(true);
      setLoadingReview(true);

      const data = await getTryoutReview(tryout.id);

      setReviewData(data);
    } catch (err) {
      console.error("LOAD TRYOUT REVIEW ERROR:", err);
      setReviewError(err.message || "Gagal mengambil data review soal");
    } finally {
      setLoadingReview(false);
    }
  }

  // =====================================================
  // CLOSE REVIEW MODAL
  // =====================================================

  function closeReviewModal() {
    setShowReviewModal(false);
    setReviewData(null);
    setReviewError("");
    setReviewTab("soal");
  }

  // =====================================================
  // PRINT REVIEW
  // =====================================================

  function handlePrintReview() {
    window.print();
  }

  // =====================================================
  // TOGGLE QUESTION
  // =====================================================

  function toggleQuestion(question) {
    const questionId = Number(question.id);

    const exists = form.questions.some(
      (item) => Number(item.question_id) === questionId
    );

    if (exists) {
      setForm((prev) => {
        const remaining = prev.questions.filter(
          (item) => Number(item.question_id) !== questionId
        );

        return {
          ...prev,
          questions: remaining.map((item, index) => ({
            ...item,
            question_number: index + 1,
          })),
        };
      });

      return;
    }

    setForm((prev) => {
      const nextNumber = prev.questions.length + 1;

      return {
        ...prev,
        questions: [
          ...prev.questions,
          {
            question_id: questionId,
            question_number: nextNumber,
            points: 1,
          },
        ],
      };
    });
  }

  // =====================================================
  // CHECK QUESTION SELECTED
  // =====================================================

  function isQuestionSelected(questionId) {
    return form.questions.some(
      (item) => Number(item.question_id) === Number(questionId)
    );
  }

  // =====================================================
  // CHANGE QUESTION POINT
  // =====================================================

  function handleQuestionPointsChange(questionId, value) {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((item) => {
        if (Number(item.question_id) !== Number(questionId)) {
          return item;
        }

        return {
          ...item,
          points: value,
        };
      }),
    }));
  }

  // =====================================================
  // MOVE QUESTION UP
  // =====================================================

  function moveQuestionUp(questionId) {
    setForm((prev) => {
      const index = prev.questions.findIndex(
        (item) => Number(item.question_id) === Number(questionId)
      );

      if (index <= 0) {
        return prev;
      }

      const newQuestions = [...prev.questions];

      [newQuestions[index - 1], newQuestions[index]] = [
        newQuestions[index],
        newQuestions[index - 1],
      ];

      return {
        ...prev,
        questions: newQuestions.map((item, itemIndex) => ({
          ...item,
          question_number: itemIndex + 1,
        })),
      };
    });
  }

  // =====================================================
  // MOVE QUESTION DOWN
  // =====================================================

  function moveQuestionDown(questionId) {
    setForm((prev) => {
      const index = prev.questions.findIndex(
        (item) => Number(item.question_id) === Number(questionId)
      );

      if (index === -1 || index >= prev.questions.length - 1) {
        return prev;
      }

      const newQuestions = [...prev.questions];

      [newQuestions[index], newQuestions[index + 1]] = [
        newQuestions[index + 1],
        newQuestions[index],
      ];

      return {
        ...prev,
        questions: newQuestions.map((item, itemIndex) => ({
          ...item,
          question_number: itemIndex + 1,
        })),
      };
    });
  }

  // =====================================================
  // REMOVE SELECTED QUESTION
  // =====================================================

  function removeQuestion(questionId) {
    setForm((prev) => {
      const remaining = prev.questions.filter(
        (item) => Number(item.question_id) !== Number(questionId)
      );

      return {
        ...prev,
        questions: remaining.map((item, index) => ({
          ...item,
          question_number: index + 1,
        })),
      };
    });
  }

  // =====================================================
  // VALIDATE FORM
  // =====================================================

  function validateForm() {
    if (!form.title.trim()) {
      return "Judul tryout wajib diisi";
    }

    if (!form.subject_id) {
      return "Mata pelajaran wajib dipilih";
    }

    const duration = Number(form.duration_minutes);

    if (!Number.isFinite(duration) || duration <= 0) {
      return "Durasi harus lebih dari 0 menit";
    }

    const maxScore = Number(form.max_score);

    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      return "Nilai maksimal harus lebih dari 0";
    }

    if (form.questions.length === 0) {
      return "Minimal pilih satu soal untuk tryout";
    }

    for (let index = 0; index < form.questions.length; index++) {
      const question = form.questions[index];
      const points = Number(question.points);

      if (!Number.isFinite(points) || points <= 0) {
        return `Point soal nomor ${index + 1} harus lebih dari 0`;
      }
    }

    return null;
  }

  // =====================================================
  // SUBMIT
  // =====================================================

  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setFormSuccess("");

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setSaving(true);

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        subject_id: Number(form.subject_id),
        grade: form.grade || null,
        duration_minutes: Number(form.duration_minutes),
        max_score: Number(form.max_score),
        difficulty: form.difficulty.trim() || null,
        is_active: form.is_active,
        questions: form.questions.map((item) => ({
          question_id: Number(item.question_id),
          question_number: Number(item.question_number),
          points: Number(item.points),
        })),
      };

      const data = editingTryout
        ? await updateTryout(editingTryout.id, payload)
        : await createTryout(payload);

      setFormSuccess(
        data.message ||
          (editingTryout
            ? "Tryout berhasil diperbarui"
            : "Tryout berhasil dibuat")
      );

      await loadTryouts();

      /*
       * Tunggu sebentar supaya admin sempat melihat
       * pesan berhasil sebelum modal tertutup.
       */
      setTimeout(() => {
        setShowModal(false);
        setEditingTryout(null);
        setForm(createEmptyForm());
        setAvailableQuestions([]);
        setFormSuccess("");
      }, 900);
    } catch (err) {
      console.error("SAVE TRYOUT ERROR:", err);
      setFormError(err.message || "Gagal menyimpan tryout");
    } finally {
      setSaving(false);
    }
  }

  // =====================================================
  // DELETE
  // =====================================================

  async function handleDelete(tryout) {
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus tryout "${tryout.title}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(tryout.id);
      setActionError("");
      setActionSuccess("");

      const data = await deleteTryoutApi(tryout.id);

      setActionSuccess(data.message || `Tryout "${tryout.title}" berhasil dihapus`);

      await loadTryouts();

      setTimeout(() => {
        setActionSuccess("");
      }, 2500);
    } catch (err) {
      console.error("DELETE TRYOUT ERROR:", err);
      setActionError(err.message || "Gagal menghapus tryout");
    } finally {
      setDeletingId(null);
    }
  }

  // =====================================================
  // FILTER TRYOUT
  // =====================================================

  const filteredTryouts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return tryouts.filter((tryout) => {
      const subjectName = getSubjectName(tryout.subject_id).toLowerCase();
      const title = (tryout.title || "").toLowerCase();
      const description = (tryout.description || "").toLowerCase();

      const matchesSearch =
        !keyword ||
        title.includes(keyword) ||
        description.includes(keyword) ||
        subjectName.includes(keyword);

      const matchesSubject =
        !subjectFilter || String(tryout.subject_id) === String(subjectFilter);

      const matchesDifficulty =
        !difficultyFilter ||
        (tryout.difficulty || "")
          .toLowerCase()
          .includes(difficultyFilter.trim().toLowerCase());

      const matchesStatus =
        !statusFilter ||
        (statusFilter === "ACTIVE" ? tryout.is_active : !tryout.is_active);

      return (
        matchesSearch && matchesSubject && matchesDifficulty && matchesStatus
      );
    });
  }, [
    tryouts,
    subjects,
    search,
    subjectFilter,
    difficultyFilter,
    statusFilter,
  ]);

  // Reset ke halaman 1 setiap kali pencarian/filter berubah, supaya
  // tidak "nyangkut" di halaman yang sudah tidak relevan.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, subjectFilter, difficultyFilter, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTryouts.length / TRYOUTS_PER_PAGE)
  );

  // Kalau halaman aktif jadi lebih besar dari total halaman yang ada
  // (mis. setelah tryout terakhir di halaman itu dihapus), mundurkan
  // otomatis ke halaman terakhir yang valid.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedTryouts = useMemo(() => {
    const start = (currentPage - 1) * TRYOUTS_PER_PAGE;
    return filteredTryouts.slice(start, start + TRYOUTS_PER_PAGE);
  }, [filteredTryouts, currentPage]);

  // =====================================================
  // BANK SOAL — FILTER TINGKAT KESULITAN (di dalam modal)
  //
  // availableQuestions sendiri SUDAH berisi semua tingkat
  // kesulitan (tidak difilter saat fetch dari backend). Filter
  // di bawah ini murni tampilan di sisi frontend supaya guru
  // bisa mempersempit daftar kalau paket soalnya banyak, tanpa
  // membatasi soal mana yang boleh benar-benar dipilih.
  // =====================================================

  const filteredAvailableQuestions = useMemo(() => {
    if (!bankSoalDifficultyFilter) {
      return availableQuestions;
    }

    return availableQuestions.filter(
      (question) => question.difficulty === bankSoalDifficultyFilter
    );
  }, [availableQuestions, bankSoalDifficultyFilter]);

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Header />

        <div className="content">
          {/* =================================================
              PAGE HEADER
          ================================================= */}

          <div className="page-header">
            <div>
              <h1>Paket Tryout</h1>
              <p>Kelola paket tryout TKA</p>
            </div>

            <button className="primary-button" onClick={openModal}>
              + Tambah Tryout
            </button>
          </div>

          {/* =================================================
              TABLE CARD & FILTER
          ================================================= */}

          <div className="dashboard-card">
            <div className="question-filter">
              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Cari judul tryout..."
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="search-input"
                >
                  <option value="">Semua Mata Pelajaran</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Cari keterangan..."
                  className="search-input"
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="search-input"
                >
                  <option value="">Semua Status</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Nonaktif</option>
                </select>
              </div>
            </div>

            {loading && (
              <div className="loading-message">Memuat data tryout...</div>
            )}

            {loadError && !showModal && (
              <div className="error-message">{loadError}</div>
            )}

            {actionError && (
              <div className="form-error-message" style={{ marginBottom: "15px" }}>
                {actionError}
              </div>
            )}

            {actionSuccess && (
              <div className="success-message" style={{ marginBottom: "15px" }}>
                <IconCheck size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                {actionSuccess}
              </div>
            )}

            {!loading && (
              <div className="table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th className="align-center">No</th>
                      <th>ID</th>
                      <th>Judul Tryout</th>
                      <th>Mata Pelajaran</th>
                      <th>Kelas</th>
                      <th>Soal</th>
                      <th>Durasi</th>
                      <th>Keterangan</th>
                      <th>Status</th>
                      <th className="sticky-col">Aksi</th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedTryouts.map((tryout, index) => (
                      <tr key={tryout.id}>
                        <td className="align-center">
                          {(currentPage - 1) * TRYOUTS_PER_PAGE + index + 1}
                        </td>

                        <td>{tryout.id}</td>

                        <td>
                          <strong>{tryout.title}</strong>
                          {tryout.description && (
                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "12px",
                                color: "#777",
                              }}
                            >
                              {tryout.description}
                            </div>
                          )}
                        </td>

                        <td>{getSubjectName(tryout.subject_id)}</td>

                        <td>{tryout.grade || "-"}</td>

                        <td>{tryout.total_questions}</td>

                        <td>{tryout.duration_minutes} menit</td>

                        <td>{tryout.difficulty || "-"}</td>

                        <td>
                          {tryout.is_active ? (
                            <span className="status-active">Aktif</span>
                          ) : (
                            <span className="status-inactive">Nonaktif</span>
                          )}
                        </td>

                        <td className="sticky-col">
                          <div className="action-buttons">
                            <button
                              className="edit-button"
                              onClick={() => openEditModal(tryout)}
                              title="Edit"
                            >
                              <IconEdit size={16} />
                            </button>

                            <button
                              className="review-button"
                              onClick={() => openReviewModal(tryout)}
                              title="Review Soal"
                            >
                              <IconEye size={16} />
                            </button>

                            <button
                              className="delete-button"
                              onClick={() => handleDelete(tryout)}
                              disabled={deletingId === tryout.id}
                              title="Hapus"
                            >
                              <IconTrash size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredTryouts.length === 0 && (
                  <div className="empty-message">
                    {search ||
                    subjectFilter ||
                    difficultyFilter ||
                    statusFilter
                      ? "Paket tryout tidak ditemukan."
                      : "Belum ada paket tryout."}
                  </div>
                )}

                {filteredTryouts.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 12,
                      padding: "14px 4px 4px",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      Menampilkan{" "}
                      {(currentPage - 1) * TRYOUTS_PER_PAGE + 1}
                      {"–"}
                      {Math.min(
                        currentPage * TRYOUTS_PER_PAGE,
                        filteredTryouts.length
                      )}{" "}
                      dari {filteredTryouts.length} tryout
                    </span>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Sebelumnya
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        // Kalau halamannya banyak, cukup tampilkan halaman
                        // pertama, terakhir, dan beberapa di sekitar halaman
                        // aktif — sisanya diringkas jadi "…" supaya baris
                        // nomor halaman tidak melebar tak terbatas.
                        .filter((page) => {
                          if (totalPages <= 7) return true;
                          return (
                            page === 1 ||
                            page === totalPages ||
                            Math.abs(page - currentPage) <= 1
                          );
                        })
                        .reduce((acc, page, idx, arr) => {
                          if (idx > 0 && page - arr[idx - 1] > 1) {
                            acc.push("ellipsis-" + page);
                          }
                          acc.push(page);
                          return acc;
                        }, [])
                        .map((item) =>
                          typeof item === "string" ? (
                            <span
                              key={item}
                              style={{ padding: "0 4px", color: "#9ca3af", fontSize: 13 }}
                            >
                              …
                            </span>
                          ) : (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setCurrentPage(item)}
                              style={{
                                minWidth: 32,
                                height: 32,
                                borderRadius: 6,
                                border: "1px solid var(--line)",
                                background:
                                  item === currentPage ? "var(--accent)" : "white",
                                color: item === currentPage ? "white" : "#374151",
                                fontWeight: item === currentPage ? 600 : 500,
                                fontSize: 13,
                                cursor: "pointer",
                              }}
                            >
                              {item}
                            </button>
                          )
                        )}

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage === totalPages}
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* =====================================================
          MODAL TAMBAH / EDIT TRYOUT
      ===================================================== */}

      {showModal && (
        <div className="modal-overlay">
          <div
            className="modal question-modal"
            style={{ width: "900px", maxWidth: "95vw" }}
          >
            <div className="modal-header">
              <div>
                <h2>
                  {editingTryout ? "Edit Paket Tryout" : "Tambah Paket Tryout"}
                </h2>
                <p>
                  Tentukan informasi dan soal yang digunakan dalam paket tryout.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Judul Tryout *</label>
                <input
                  type="text"
                  name="title"
                  placeholder="Contoh: TKA Matematika Kelas 12 - Tryout 1"
                  value={form.title}
                  onChange={handleChange}
                  disabled={saving}
                  required
                />
              </div>

              <div className="form-group">
                <label>Deskripsi</label>
                <textarea
                  name="description"
                  rows="3"
                  placeholder="Deskripsi paket tryout..."
                  value={form.description}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Mata Pelajaran *</label>
                  <select
                    name="subject_id"
                    value={form.subject_id}
                    onChange={handleChange}
                    disabled={saving}
                    required
                  >
                    <option value="">-- Pilih Mata Pelajaran --</option>
                    {subjects
                      .filter((subject) => subject.is_active)
                      .map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.code} - {subject.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Kelas</label>
                  <select
                    name="grade"
                    value={form.grade}
                    onChange={handleChange}
                    disabled={saving}
                  >
                    <option value="">Pilih Kelas</option>
                    {GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        Kelas {grade}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Durasi (menit) *</label>
                  <input
                    type="number"
                    name="duration_minutes"
                    min="1"
                    value={form.duration_minutes}
                    onChange={handleChange}
                    disabled={saving}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Nilai Maksimal *</label>
                  <input
                    type="number"
                    name="max_score"
                    min="1"
                    step="0.01"
                    value={form.max_score}
                    onChange={handleChange}
                    disabled={saving}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Keterangan</label>
                <input
                  type="text"
                  name="difficulty"
                  value={form.difficulty}
                  onChange={handleChange}
                  disabled={saving}
                  maxLength={150}
                  placeholder="Contoh: Kelas Unggulan, Paket A (opsional)"
                />
                <small style={{ color: "#777" }}>
                  Catatan bebas untuk paket tryout ini — tidak
                  membatasi soal mana yang boleh dipilih di bawah.
                </small>
              </div>

              <div className="form-checkbox">
                <input
                  type="checkbox"
                  id="tryout-active"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                  disabled={saving}
                />
                <label htmlFor="tryout-active">Paket tryout aktif</label>
              </div>

              {/* =================================================
                  BANK SOAL
              ================================================= */}

              <div className="options-section">
                <div className="section-title">
                  <strong>Bank Soal</strong>
                  <span>Pilih soal yang akan dimasukkan ke dalam paket tryout. Semua tingkat kesulitan (mudah/sedang/sulit) boleh dicampur, yang penting mata pelajarannya sama.</span>
                </div>

                {form.subject_id && (
                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label>Filter Tingkat Kesulitan</label>
                    <select
                      value={bankSoalDifficultyFilter}
                      onChange={(e) =>
                        setBankSoalDifficultyFilter(e.target.value)
                      }
                      disabled={saving}
                    >
                      <option value="">Semua Tingkat Kesulitan</option>
                      {DIFFICULTIES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!form.subject_id && (
                  <div
                    style={{
                      padding: "20px",
                      border: "1px solid #e1e4e8",
                      borderRadius: "7px",
                      textAlign: "center",
                      color: "#777",
                      fontSize: "13px",
                    }}
                  >
                    Pilih mata pelajaran terlebih dahulu.
                  </div>
                )}

                {form.subject_id && loadingQuestions && (
                  <div className="loading-message" style={{ padding: "20px" }}>
                    Memuat bank soal...
                  </div>
                )}

                {form.subject_id &&
                  !loadingQuestions &&
                  filteredAvailableQuestions.length === 0 && (
                    <div
                      style={{
                        padding: "20px",
                        border: "1px solid #e1e4e8",
                        borderRadius: "7px",
                        textAlign: "center",
                        color: "#777",
                        fontSize: "13px",
                      }}
                    >
                      {availableQuestions.length === 0
                        ? "Tidak ada soal aktif untuk mata pelajaran tersebut."
                        : "Tidak ada soal dengan tingkat kesulitan tersebut."}
                    </div>
                  )}

                {form.subject_id &&
                  !loadingQuestions &&
                  filteredAvailableQuestions.length > 0 && (
                    <div
                      style={{
                        maxHeight: "330px",
                        overflowY: "auto",
                        border: "1px solid #e1e4e8",
                        borderRadius: "7px",
                      }}
                    >
                      {filteredAvailableQuestions.map((question, index) => {
                        const selected = isQuestionSelected(question.id);
                        const selectedItem = form.questions.find(
                          (item) =>
                            Number(item.question_id) === Number(question.id)
                        );

                        return (
                          <div
                            key={question.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "35px 1fr 80px",
                              gap: "10px",
                              alignItems: "start",
                              padding: "12px",
                              borderBottom: "1px solid #f0f0f0",
                              background: selected ? "#f8fafc" : "white",
                            }}
                          >
                            <div>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleQuestion(question)}
                                disabled={saving}
                              />
                            </div>

                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  alignItems: "center",
                                  marginBottom: "5px",
                                }}
                              >
                                <strong>Soal {index + 1}</strong>
                                <span
                                  className={`difficulty-badge ${(
                                    question.difficulty || ""
                                  ).toLowerCase()}`}
                                >
                                  {getDifficultyLabel(question.difficulty)}
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: "13px",
                                  lineHeight: "1.5",
                                  color: "#444",
                                }}
                              >
                                {question.question_text}
                              </div>
                            </div>

                            <div>
                              {selected && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "4px",
                                  }}
                                >
                                  <label
                                    style={{
                                      fontSize: "11px",
                                      color: "#777",
                                    }}
                                  >
                                    Point
                                  </label>
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={selectedItem?.points || 1}
                                    onChange={(e) =>
                                      handleQuestionPointsChange(
                                        question.id,
                                        e.target.value
                                      )
                                    }
                                    disabled={saving}
                                    style={{
                                      width: "100%",
                                      boxSizing: "border-box",
                                      padding: "7px",
                                      border: "1px solid #d5d9df",
                                      borderRadius: "6px",
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>

              {/* =================================================
                  SOAL TERPILIH
              ================================================= */}

              <div className="options-section">
                <div className="section-title">
                  <strong>Soal Terpilih</strong>
                  <span>{form.questions.length} soal dipilih</span>
                </div>

                {form.questions.length === 0 && (
                  <div
                    style={{
                      padding: "20px",
                      border: "1px solid #e1e4e8",
                      borderRadius: "7px",
                      textAlign: "center",
                      color: "#777",
                      fontSize: "13px",
                    }}
                  >
                    Belum ada soal yang dipilih.
                  </div>
                )}

                {form.questions.length > 0 && (
                  <div
                    style={{
                      border: "1px solid #e1e4e8",
                      borderRadius: "7px",
                      overflow: "hidden",
                    }}
                  >
                    {form.questions.map((selectedQuestion, index) => {
                      const question = availableQuestions.find(
                        (item) =>
                          Number(item.id) ===
                          Number(selectedQuestion.question_id)
                      );

                      return (
                        <div
                          key={selectedQuestion.question_id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "45px 1fr auto",
                            gap: "10px",
                            alignItems: "center",
                            padding: "10px 12px",
                            borderBottom:
                              index < form.questions.length - 1
                                ? "1px solid #f0f0f0"
                                : "none",
                          }}
                        >
                          <strong>{selectedQuestion.question_number}</strong>

                          <div
                            style={{
                              fontSize: "13px",
                              lineHeight: "1.45",
                            }}
                          >
                            {question?.question_text ||
                              `Soal ID ${selectedQuestion.question_id}`}

                            <div
                              style={{
                                marginTop: "3px",
                                fontSize: "11px",
                                color: "#777",
                              }}
                            >
                              Point: {selectedQuestion.points}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              type="button"
                              className="secondary-button"
                              style={{ padding: "6px 9px" }}
                              onClick={() =>
                                moveQuestionUp(selectedQuestion.question_id)
                              }
                              disabled={saving || index === 0}
                              title="Naik"
                            >
                              ↑
                            </button>

                            <button
                              type="button"
                              className="secondary-button"
                              style={{ padding: "6px 9px" }}
                              onClick={() =>
                                moveQuestionDown(selectedQuestion.question_id)
                              }
                              disabled={
                                saving || index === form.questions.length - 1
                              }
                              title="Turun"
                            >
                              ↓
                            </button>

                            <button
                              type="button"
                              className="delete-button"
                              onClick={() =>
                                removeQuestion(selectedQuestion.question_id)
                              }
                              disabled={saving}
                              title="Hapus soal"
                            >
                              <IconTrash size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* =================================================
                  TOTAL POINT
              ================================================= */}

              <div
                style={{
                  padding: "12px 15px",
                  marginBottom: "18px",
                  border: "1px solid #e1e4e8",
                  borderRadius: "7px",
                  background: "#f9fafb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "13px",
                }}
              >
                <span>
                  Total soal:
                  <strong style={{ marginLeft: "5px" }}>
                    {form.questions.length}
                  </strong>
                </span>

                <span>
                  Total bobot:
                  <strong style={{ marginLeft: "5px" }}>
                    {form.questions.reduce(
                      (total, item) => total + Number(item.points || 0),
                      0
                    )}
                  </strong>
                </span>
              </div>

              {formError && (
                <div
                  className="form-error-message"
                  style={{ marginBottom: "15px", textAlign: "left" }}
                >
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div
                  className="success-message"
                  style={{ marginBottom: "15px" }}
                >
                  <IconCheck size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                  {formSuccess}
                </div>
              )}

              {/* =================================================
                  FOOTER
              ================================================= */}

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Menyimpan..."
                    : editingTryout
                    ? "Simpan Perubahan"
                    : "Simpan Tryout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          MODAL REVIEW SOAL (tampilan seperti halaman cetak/PDF)
      ===================================================== */}

      {showReviewModal && (
        <div className="modal-overlay review-modal-overlay">
          <div
            className="modal review-modal no-print-overlay"
            style={{ width: "950px", maxWidth: "96vw" }}
          >
            <div className="modal-header no-print">
              <div>
                <h2>Review Soal Tryout</h2>
                <p>
                  Pratinjau soal yang akan ditampilkan dalam tryout ini.
                  Gunakan tab di bawah untuk melihat soal polos atau kunci
                  jawaban & pembahasan.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                {reviewData && !loadingReview && !reviewError && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handlePrintReview}
                  >
                    Cetak / PDF
                  </button>
                )}

                <button
                  type="button"
                  className="modal-close"
                  onClick={closeReviewModal}
                >
                  ×
                </button>
              </div>
            </div>

            {!loadingReview && !reviewError && reviewData && (
              <div className="review-tabs no-print">
                <button
                  type="button"
                  className={
                    reviewTab === "soal"
                      ? "review-tab-button active"
                      : "review-tab-button"
                  }
                  onClick={() => setReviewTab("soal")}
                >
                  Soal
                </button>

                <button
                  type="button"
                  className={
                    reviewTab === "jawaban"
                      ? "review-tab-button active"
                      : "review-tab-button"
                  }
                  onClick={() => setReviewTab("jawaban")}
                >
                  Jawaban &amp; Pembahasan
                </button>
              </div>
            )}

            {loadingReview && (
              <div className="loading-message">Memuat soal...</div>
            )}

            {!loadingReview && reviewError && (
              <div className="error-message">{reviewError}</div>
            )}

            {!loadingReview && !reviewError && reviewData && reviewTab === "soal" && (
              <div className="review-print-page">
                <div className="review-print-header">
                  <h3>{reviewData.title}</h3>
                  <div className="review-print-meta">
                    <span>Mapel: {reviewData.subject_name}</span>
                    <span>Kelas: {reviewData.grade || "-"}</span>
                    <span>Durasi: {reviewData.duration_minutes} menit</span>
                    <span>Jumlah Soal: {reviewData.total_questions}</span>
                  </div>
                </div>

                <div className="review-print-questions">
                  {reviewData.questions.map((question) => (
                    <div
                      key={question.question_id}
                      className="review-print-question"
                    >
                      <div className="review-print-question-text">
                        <span className="review-print-number">
                          {question.question_number}.
                        </span>
                        <span>{question.question_text}</span>
                      </div>

                      <div className="review-print-options">
                        {question.options.map((option) => (
                          <div
                            key={option.option_code}
                            className="review-print-option"
                          >
                            <span className="review-print-option-code">
                              {option.option_code}.
                            </span>
                            <span>{option.option_text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {reviewData.questions.length === 0 && (
                    <div className="empty-message">
                      Paket tryout ini belum memiliki soal.
                    </div>
                  )}
                </div>
              </div>
            )}

            {!loadingReview && !reviewError && reviewData && reviewTab === "jawaban" && (
              <div className="review-print-page">
                <div className="review-print-header">
                  <h3>{reviewData.title} — Kunci Jawaban &amp; Pembahasan</h3>
                  <div className="review-print-meta">
                    <span>Mapel: {reviewData.subject_name}</span>
                    <span>Kelas: {reviewData.grade || "-"}</span>
                    <span>Jumlah Soal: {reviewData.total_questions}</span>
                  </div>
                </div>

                <div className="review-print-questions">
                  {reviewData.questions.map((question) => {
                    const correctOption = question.options.find(
                      (option) => option.is_correct
                    );

                    return (
                      <div
                        key={question.question_id}
                        className="review-print-question"
                      >
                        <div className="review-print-question-text">
                          <span className="review-print-number">
                            {question.question_number}.
                          </span>
                          <span>{question.question_text}</span>
                        </div>

                        <div className="review-answer-correct">
                          Jawaban:{" "}
                          <strong>
                            {correctOption
                              ? `${correctOption.option_code}. ${correctOption.option_text}`
                              : "-"}
                          </strong>
                        </div>

                        {question.explanation && (
                          <div className="review-answer-explanation">
                            <em>Pembahasan:</em> {question.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {reviewData.questions.length === 0 && (
                    <div className="empty-message">
                      Paket tryout ini belum memiliki soal.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TryoutManagement;