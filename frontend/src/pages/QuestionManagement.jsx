import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconEdit, IconTrash, IconCheck } from "../components/Icons";
import {
  getSubjects,
  getQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion as deleteQuestionApi,
  generateAIQuestion,
  previewAIPrompt,
  getAIStatus,
} from "../services/api";

const OPTION_CODES = ["A", "B", "C", "D", "E"];

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


function QuestionManagement() {

  // ======================================================
  // DATA
  // ======================================================

  const [questions, setQuestions] = useState([]);

  const [subjects, setSubjects] = useState([]);

  // ======================================================
  // UI STATE
  // ======================================================

  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);

  const [editingQuestion, setEditingQuestion] =
    useState(null);

  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] =
    useState(null);

  // ======================================================
  // AI GENERATE SOAL
  // ======================================================

  const [showAiModal, setShowAiModal] =
    useState(false);

  // Cek status provider AI (Ollama/Gemini) SEBELUM modal dibuka.
  // Kalau tidak ada satupun AI yang online, error langsung
  // ditampilkan saat tombol "Tambah Soal AI" diklik, tanpa perlu
  // isi form dulu baru gagal di endpoint generate.
  const [aiCheckingStatus, setAiCheckingStatus] =
    useState(false);

  const [aiUnavailableMessage, setAiUnavailableMessage] =
    useState("");

  // Tombol "Edit dengan AI" di dalam modal Edit Soal punya alur
  // status/loading terpisah dari tombol "Tambah Soal AI" di
  // toolbar, supaya pesan error tidak "salah tempat" (tombol Edit
  // AI ada di dalam modal, bukan di toolbar Bank Soal).
  const [editAiChecking, setEditAiChecking] =
    useState(false);

  const [editAiUnavailableMessage, setEditAiUnavailableMessage] =
    useState("");

  // true kalau modal AI sedang dibuka untuk MENGGANTIKAN soal yang
  // sedang diedit (bukan membuat soal baru). Dipakai supaya:
  // - editingQuestion TIDAK di-null-kan setelah generate (submit
  //   berikutnya harus tetap UPDATE, bukan CREATE baru)
  // - kalau modal AI dibatalkan, modal Edit Soal dibuka lagi
  //   dengan data yang sudah ada, bukan hilang begitu saja
  const [aiReplaceMode, setAiReplaceMode] =
    useState(false);

  const [aiGenerating, setAiGenerating] =
    useState(false);

  const [aiError, setAiError] = useState("");

  const [aiGeneratedNotice, setAiGeneratedNotice] =
    useState(false);

  // "form"   -> isi mata pelajaran/kesulitan/materi
  // "prompt" -> tampilkan prompt (bisa diedit) sebelum generate
  const [aiStep, setAiStep] = useState("form");

  const [aiPrompt, setAiPrompt] = useState("");

  const [aiPromptLoading, setAiPromptLoading] =
    useState(false);

  const createEmptyAiForm = () => ({
    subject_id: "",
    difficulty: "MEDIUM",
    materi: "",
    additional_instruction: "",
  });

  const [aiForm, setAiForm] = useState(
    createEmptyAiForm()
  );

  // ======================================================
  // FILTER
  // ======================================================

  const [search, setSearch] = useState("");

  const [subjectFilter, setSubjectFilter] =
    useState("");

  const [difficultyFilter, setDifficultyFilter] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("");

  // ======================================================
  // MESSAGE
  // ======================================================

  const [loadError, setLoadError] = useState("");

  const [actionError, setActionError] = useState("");

  const [actionSuccess, setActionSuccess] = useState("");

  const [formError, setFormError] = useState("");

  const [formSuccess, setFormSuccess] = useState("");

  // ======================================================
  // FORM
  // ======================================================

  const createEmptyForm = () => ({
    subject_id: "",
    question_text: "",
    question_type: "MULTIPLE_CHOICE",
    difficulty: "MEDIUM",
    explanation: "",
    points: 1,
    is_active: true,

    options: OPTION_CODES.map((code) => ({
      option_code: code,
      option_text: "",
      is_correct: false,
    })),
  });


  const [form, setForm] = useState(
    createEmptyForm()
  );


  // ======================================================
  // LOAD SUBJECTS
  // ======================================================

  async function loadSubjects() {

    try {

      const data = await getSubjects();

      setSubjects(data);

    } catch (err) {

      console.error(
        "LOAD SUBJECT ERROR:",
        err
      );

      setLoadError(
        err.message ||
        "Gagal mengambil mata pelajaran"
      );
    }
  }


  // ======================================================
  // LOAD QUESTIONS
  // ======================================================

  async function loadQuestions() {

    try {

      setLoading(true);
      setLoadError("");

      const data = await getQuestions();

      setQuestions(data);

    } catch (err) {

      console.error(
        "LOAD QUESTIONS ERROR:",
        err
      );

      setLoadError(
        err.message ||
        "Gagal mengambil bank soal"
      );

    } finally {

      setLoading(false);
    }
  }


  // ======================================================
  // INITIAL LOAD
  // ======================================================

  useEffect(() => {

    loadSubjects();

    loadQuestions();

  }, []);


  // ======================================================
  // SUBJECT NAME
  // ======================================================

  function getSubjectName(subjectId) {

    const subject =
      subjects.find(
        item => item.id === subjectId
      );

    return subject
      ? subject.name
      : "-";
  }


  // ======================================================
  // DIFFICULTY LABEL
  // ======================================================

  function getDifficultyLabel(
    difficulty
  ) {

    const item =
      DIFFICULTIES.find(
        item =>
          item.value === difficulty
      );

    return item
      ? item.label
      : difficulty;
  }


  // ======================================================
  // OPEN ADD MODAL
  // ======================================================

  function openAddModal() {

    setEditingQuestion(null);

    setForm(createEmptyForm());

    setFormError("");
    setFormSuccess("");
    setAiGeneratedNotice(false);
    setEditAiUnavailableMessage("");

    setShowModal(true);
  }


  // ======================================================
  // OPEN EDIT MODAL
  // ======================================================

  function openEditModal(question) {

    const options =
      OPTION_CODES.map(code => {

        const existingOption =
          question.options?.find(
            option =>
              option.option_code === code
          );

        return {
          option_code: code,

          option_text:
            existingOption?.option_text ||
            "",

          is_correct:
            existingOption?.is_correct ||
            false,
        };
      });


    setEditingQuestion(question);

    setForm({
      subject_id:
        String(question.subject_id),

      question_text:
        question.question_text || "",

      question_type:
        question.question_type ||
        "MULTIPLE_CHOICE",

      difficulty:
        question.difficulty ||
        "MEDIUM",

      explanation:
        question.explanation || "",

      points:
        question.points ?? 1,

      is_active:
        question.is_active !== false,

      options,
    });

    setFormError("");
    setFormSuccess("");
    setAiGeneratedNotice(false);
    setEditAiUnavailableMessage("");

    setShowModal(true);
  }


  // ======================================================
  // CLOSE MODAL
  // ======================================================

  function closeModal() {

    if (saving) {
      return;
    }

    setShowModal(false);

    setEditingQuestion(null);

    setForm(createEmptyForm());

    setFormError("");
    setFormSuccess("");
    setAiGeneratedNotice(false);
    setEditAiUnavailableMessage("");
  }


  // ======================================================
  // OPEN / CLOSE MODAL GENERATE SOAL AI
  // ======================================================

  function openAiModal() {

    // Mode TAMBAH: pastikan tidak "menempel" ke soal manapun,
    // supaya hasil generate nanti disimpan sebagai soal BARU.
    setEditingQuestion(null);

    setAiReplaceMode(false);

    setAiForm(createEmptyAiForm());

    setAiError("");

    setAiStep("form");

    setAiPrompt("");

    setShowAiModal(true);
  }


  // ======================================================
  // TOMBOL "EDIT DENGAN AI" DI DALAM MODAL EDIT SOAL
  //
  // Membuka modal generate AI yang SAMA, tapi:
  // - subject_id & difficulty diisi otomatis dari soal yang
  //   sedang diedit (guru tidak perlu pilih ulang)
  // - additional_instruction diisi draft yang menyebutkan soal
  //   lama, supaya AI tahu ini permintaan PENGGANTI, bukan soal
  //   yang tidak berhubungan sama sekali
  // - editingQuestion TETAP tersimpan (lihat aiReplaceMode) supaya
  //   setelah draft AI dipakai, tombol "Simpan Perubahan" di modal
  //   Edit Soal meng-UPDATE soal ini, bukan membuat soal baru
  // ======================================================

  function openAiModalForEdit() {

    setAiReplaceMode(true);

    setAiForm({
      subject_id: form.subject_id,
      difficulty: form.difficulty,
      materi: "",
      additional_instruction: form.question_text
        ? `Buatkan soal PENGGANTI untuk soal lama berikut (topik ` +
          `boleh sejenis, tapi teks soal & pilihan jawaban harus ` +
          `beda, jangan cuma menyalin ulang):\n"${form.question_text}"`
        : "",
    });

    setAiError("");

    setAiStep("form");

    setAiPrompt("");

    // Modal Edit Soal disembunyikan dulu (bukan ditutup total —
    // form & editingQuestion tetap tersimpan di state) supaya
    // modal AI tidak bertumpuk di atasnya.
    setShowModal(false);

    setShowAiModal(true);
  }


  // ======================================================
  // TOMBOL "TAMBAH SOAL AI" DIKLIK
  //
  // Cek dulu ke backend (GET /api/settings/ai-status) apakah
  // provider AI yang aktif (Ollama atau Gemini) benar-benar
  // online. Kalau TIDAK ADA satupun AI yang online, langsung
  // tampilkan error di sini — modal generate tidak dibuka sama
  // sekali, supaya guru tidak buang waktu isi form dulu baru
  // gagal belakangan saat submit ke Ollama/Gemini.
  // ======================================================

  async function handleAiButtonClick() {

    setAiUnavailableMessage("");

    try {

      setAiCheckingStatus(true);

      const status = await getAIStatus();

      if (!status.online) {

        setAiUnavailableMessage(
          status.reason ||
          "Tidak ada AI yang online saat ini. Coba lagi nanti atau hubungi admin."
        );

        return;
      }

      openAiModal();

    } catch (err) {

      console.error(
        "CHECK AI STATUS ERROR:",
        err
      );

      setAiUnavailableMessage(
        err.message ||
        "Gagal memeriksa status AI. Coba lagi nanti."
      );

    } finally {

      setAiCheckingStatus(false);
    }
  }


  function closeAiModal() {

    if (aiGenerating || aiPromptLoading) {
      return;
    }

    setShowAiModal(false);

    setAiError("");

    setAiStep("form");

    setAiPrompt("");

    // Kalau modal AI ini dibuka dari tombol "Edit dengan AI" dan
    // dibatalkan (bukan berhasil generate), buka lagi modal Edit
    // Soal supaya guru tidak kehilangan soal yang sedang diedit.
    if (aiReplaceMode) {

      setAiReplaceMode(false);

      setShowModal(true);
    }
  }


  // ======================================================
  // TOMBOL "EDIT DENGAN AI" DIKLIK (di dalam modal Edit Soal)
  //
  // Sama seperti handleAiButtonClick, cek dulu status provider AI
  // sebelum modal generate dibuka. Kalau tidak ada AI yang online,
  // error ditampilkan DI DALAM modal Edit Soal (modal tidak jadi
  // disembunyikan), supaya guru tidak kehilangan perubahan manual
  // yang sudah diketik.
  // ======================================================

  async function handleEditAiButtonClick() {

    setEditAiUnavailableMessage("");

    try {

      setEditAiChecking(true);

      const status = await getAIStatus();

      if (!status.online) {

        setEditAiUnavailableMessage(
          status.reason ||
          "Tidak ada AI yang online saat ini. Coba lagi nanti atau hubungi admin."
        );

        return;
      }

      openAiModalForEdit();

    } catch (err) {

      console.error(
        "CHECK AI STATUS (EDIT) ERROR:",
        err
      );

      setEditAiUnavailableMessage(
        err.message ||
        "Gagal memeriksa status AI. Coba lagi nanti."
      );

    } finally {

      setEditAiChecking(false);
    }
  }


  // ======================================================
  // LANGKAH 1 -> 2: SUSUN PROMPT UNTUK DIPERIKSA/DIEDIT
  //
  // Tidak memanggil Ollama sama sekali. Cuma minta backend
  // menyusun teks prompt dari form, supaya guru bisa membaca
  // dan mengubahnya dulu sebelum benar-benar generate soal.
  // ======================================================

  async function handleShowPrompt(event) {

    event.preventDefault();

    setAiError("");

    if (!aiForm.subject_id) {

      setAiError("Mata pelajaran wajib dipilih");

      return;
    }

    if (!aiForm.materi.trim()) {

      setAiError("Materi / lingkup soal wajib diisi");

      return;
    }

    try {

      setAiPromptLoading(true);

      const result = await previewAIPrompt({
        subject_id: Number(aiForm.subject_id),
        difficulty: aiForm.difficulty,
        materi: aiForm.materi.trim(),
        additional_instruction:
          aiForm.additional_instruction.trim() || null,
      });

      setAiPrompt(result.prompt);

      setAiStep("prompt");

    } catch (err) {

      console.error(
        "AI PREVIEW PROMPT ERROR:",
        err
      );

      setAiError(
        err.message ||
        "Gagal menyusun prompt"
      );

    } finally {

      setAiPromptLoading(false);
    }
  }


  // Kembali dari langkah prompt ke form (mis. mau ganti materi
  // atau tingkat kesulitan, bukan cuma teks prompt-nya).
  function handleBackToAiForm() {

    if (aiGenerating) {
      return;
    }

    setAiStep("form");

    setAiError("");
  }


  // ======================================================
  // FORM GENERATE AI - CHANGE
  // ======================================================

  function handleAiFormChange(event) {

    const { name, value } = event.target;

    setAiForm(prev => ({
      ...prev,
      [name]: value,
    }));
  }


  // ======================================================
  // GENERATE SOAL DENGAN AI
  //
  // Endpoint AI hanya mengembalikan draft (tidak menyimpan
  // apapun). Hasilnya dipakai untuk mengisi form soal biasa
  // dalam mode "review" — guru wajib memeriksa/mengedit lalu
  // menekan "Simpan Soal" seperti alur tambah soal manual.
  // ======================================================

  async function handleAiGenerate(event) {

    event.preventDefault();

    setAiError("");

    if (!aiForm.subject_id) {

      setAiError("Mata pelajaran wajib dipilih");

      return;
    }

    if (!aiForm.materi.trim()) {

      setAiError("Materi / lingkup soal wajib diisi");

      return;
    }

    if (!aiPrompt.trim()) {

      setAiError("Prompt tidak boleh kosong");

      return;
    }

    try {

      setAiGenerating(true);

      const result = await generateAIQuestion({
        subject_id: Number(aiForm.subject_id),
        difficulty: aiForm.difficulty,
        materi: aiForm.materi.trim(),
        additional_instruction:
          aiForm.additional_instruction.trim() || null,
        prompt: aiPrompt.trim(),
      });

      // CATATAN: editingQuestion SENGAJA tidak di-null-kan di sini.
      // Kalau modal ini dibuka lewat "Edit dengan AI"
      // (aiReplaceMode = true), editingQuestion masih menunjuk ke
      // soal lama, supaya tombol "Simpan Perubahan" nanti meng-
      // UPDATE soal itu. Untuk mode Tambah, editingQuestion sudah
      // di-null-kan lebih dulu di openAiModal().

      setForm(prev => ({
        subject_id: String(result.subject_id),

        question_text: result.question_text,

        question_type:
          result.question_type || "MULTIPLE_CHOICE",

        difficulty: result.difficulty,

        explanation: result.explanation || "",

        // Mode ganti soal (edit): pertahankan poin & status aktif
        // soal LAMA, karena itu bukan sesuatu yang AI tentukan.
        // Mode tambah baru: pakai default dari hasil AI / 1.
        points: aiReplaceMode ? prev.points : (result.points ?? 1),

        is_active: aiReplaceMode ? prev.is_active : true,

        options: OPTION_CODES.map(code => {

          const found = result.options.find(
            option => option.option_code === code
          );

          return {
            option_code: code,

            option_text: found?.option_text || "",

            is_correct: found?.is_correct || false,
          };
        }),
      }));

      setFormError("");
      setFormSuccess("");
      setAiGeneratedNotice(true);

      setShowAiModal(false);
      setAiStep("form");
      setAiPrompt("");
      setAiReplaceMode(false);
      setShowModal(true);

    } catch (err) {

      console.error(
        "AI GENERATE ERROR:",
        err
      );

      setAiError(
        err.message ||
        "Gagal membuat soal dengan AI"
      );

    } finally {

      setAiGenerating(false);
    }
  }


  // ======================================================
  // FORM CHANGE
  // ======================================================

  function handleChange(event) {

    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setForm(prev => ({
      ...prev,

      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));
  }


  // ======================================================
  // OPTION CHANGE
  // ======================================================

  function handleOptionTextChange(
    index,
    value
  ) {

    setForm(prev => {

      const newOptions =
        [...prev.options];

      newOptions[index] = {
        ...newOptions[index],
        option_text: value,
      };

      return {
        ...prev,
        options: newOptions,
      };
    });
  }


  // ======================================================
  // CORRECT ANSWER
  // ======================================================

  function handleCorrectAnswer(index) {

    setForm(prev => {

      const newOptions =
        prev.options.map(
          (option, optionIndex) => ({
            ...option,

            is_correct:
              optionIndex === index,
          })
        );

      return {
        ...prev,
        options: newOptions,
      };
    });
  }


  // ======================================================
  // VALIDATE FORM
  // ======================================================

  function validateForm() {

    if (!form.subject_id) {

      return "Mata pelajaran wajib dipilih";
    }

    if (!form.question_text.trim()) {

      return "Pertanyaan wajib diisi";
    }

    if (form.question_text.trim().length < 5) {

      return "Pertanyaan minimal 5 karakter";
    }

    const points =
      Number(form.points);

    if (
      !Number.isFinite(points) ||
      points <= 0
    ) {

      return "Bobot soal harus lebih besar dari 0";
    }

    for (
      let index = 0;
      index < form.options.length;
      index++
    ) {

      const option =
        form.options[index];

      if (!option.option_text.trim()) {

        return (
          `Pilihan ${option.option_code} ` +
          "wajib diisi"
        );
      }
    }

    const correctOptions =
      form.options.filter(
        option => option.is_correct
      );

    if (correctOptions.length !== 1) {

      return (
        "Harus memilih tepat satu " +
        "jawaban yang benar"
      );
    }

    return null;
  }


  // ======================================================
  // SUBMIT
  // ======================================================

  async function handleSubmit(event) {

    event.preventDefault();

    setFormError("");
    setFormSuccess("");

    const validationError =
      validateForm();

    if (validationError) {

      setFormError(validationError);

      return;
    }

    try {

      setSaving(true);

      const payload = {

        subject_id:
          Number(form.subject_id),

        question_text:
          form.question_text.trim(),

        question_type:
          form.question_type,

        difficulty:
          form.difficulty,

        explanation:
          form.explanation.trim() ||
          null,

        points:
          Number(form.points),

        is_active:
          form.is_active,

        options:
          form.options.map(option => ({
            option_code:
              option.option_code,

            option_text:
              option.option_text.trim(),

            is_correct:
              option.is_correct,
          })),
      };


      const data = editingQuestion
        ? await updateQuestion(editingQuestion.id, payload)
        : await createQuestion(payload);


      setFormSuccess(
        data.message ||
        (editingQuestion
          ? "Soal berhasil diperbarui"
          : "Soal berhasil ditambahkan")
      );

      await loadQuestions();

      /*
       * Tunggu sebentar supaya admin sempat melihat
       * pesan berhasil sebelum modal tertutup.
       */
      setTimeout(() => {
        setShowModal(false);
        setEditingQuestion(null);
        setForm(createEmptyForm());
        setFormSuccess("");
      }, 900);


    } catch (err) {

      console.error(
        "SAVE QUESTION ERROR:",
        err
      );

      setFormError(
        err.message ||
        "Gagal menyimpan soal"
      );

    } finally {

      setSaving(false);
    }
  }


  // ======================================================
  // DELETE
  // ======================================================

  async function handleDelete(
    question
  ) {

    const confirmed =
      window.confirm(
        "Apakah Anda yakin ingin menghapus soal ini?"
      );

    if (!confirmed) {
      return;
    }


    try {

      setDeletingId(question.id);

      setActionError("");
      setActionSuccess("");

      const data = await deleteQuestionApi(question.id);


      setActionSuccess(
        data.message ||
        "Soal berhasil dihapus"
      );


      await loadQuestions();

      setTimeout(() => {
        setActionSuccess("");
      }, 2500);


    } catch (err) {

      console.error(
        "DELETE QUESTION ERROR:",
        err
      );

      setActionError(
        err.message ||
        "Gagal menghapus soal"
      );

    } finally {

      setDeletingId(null);
    }
  }


  // ======================================================
  // FILTER QUESTIONS
  // ======================================================

  const filteredQuestions =
    useMemo(() => {

      const keyword =
        search.trim().toLowerCase();


      return questions.filter(
        question => {

          const subjectName =
            getSubjectName(
              question.subject_id
            ).toLowerCase();


          const questionText =
            (
              question.question_text ||
              ""
            ).toLowerCase();


          const matchesSearch =
            !keyword ||
            questionText.includes(keyword) ||
            subjectName.includes(keyword);


          const matchesSubject =
            !subjectFilter ||
            String(
              question.subject_id
            ) === String(
              subjectFilter
            );


          const matchesDifficulty =
            !difficultyFilter ||
            question.difficulty ===
              difficultyFilter;


          const matchesStatus =
            !statusFilter ||
            (
              statusFilter === "ACTIVE"
                ? question.is_active
                : !question.is_active
            );


          return (
            matchesSearch &&
            matchesSubject &&
            matchesDifficulty &&
            matchesStatus
          );
        }
      );

    }, [
      questions,
      subjects,
      search,
      subjectFilter,
      difficultyFilter,
      statusFilter,
    ]);


  // ======================================================
  // RENDER
  // ======================================================

  return (

    <div className="app-layout">

      <Sidebar />


      <main className="main-content">

        <Header />


        <div className="content">

          {/* ============================================
              PAGE HEADER
              ============================================ */}

          <div className="page-header">

            <div>

              <h1>
                Bank Soal
              </h1>

              <p>
                Kelola soal TKA Tryout
              </p>

              {aiUnavailableMessage && (

                <div
                  className="form-error-message"
                  style={{
                    marginTop: 10,
                    maxWidth: 520,
                  }}
                >
                  {aiUnavailableMessage}
                </div>

              )}

            </div>


            <div style={{ display: "flex", gap: "10px" }}>

              <button
                type="button"
                className="secondary-button"
                onClick={handleAiButtonClick}
                disabled={aiCheckingStatus}
              >
                {aiCheckingStatus
                  ? "Mengecek AI..."
                  : "✨ Tambah Soal AI"
                }
              </button>

              <button
                className="primary-button"
                onClick={openAddModal}
              >
                + Tambah Soal
              </button>

            </div>


          </div>


          {/* ============================================
              FILTER & TABLE CARD
              ============================================ */}

          <div className="dashboard-card">

            <div className="question-filter">

              <div className="filter-group">

                <input
                  type="text"
                  placeholder="Cari pertanyaan..."
                  className="search-input"
                  value={search}
                  onChange={e =>
                    setSearch(
                      e.target.value
                    )
                  }
                />

              </div>


              <div className="filter-group">

                <select
                  value={subjectFilter}
                  onChange={e =>
                    setSubjectFilter(
                      e.target.value
                    )
                  }
                  className="search-input"
                >

                  <option value="">
                    Semua Mata Pelajaran
                  </option>

                  {subjects.map(
                    subject => (

                      <option
                        key={
                          subject.id
                        }
                        value={
                          subject.id
                        }
                      >
                        {subject.code} -{" "}
                        {subject.name}
                      </option>

                    )
                  )}

                </select>

              </div>


              <div className="filter-group">

                <select
                  value={
                    difficultyFilter
                  }
                  onChange={e =>
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
                    difficulty => (

                      <option
                        key={
                          difficulty.value
                        }
                        value={
                          difficulty.value
                        }
                      >
                        {
                          difficulty.label
                        }
                      </option>

                    )
                  )}

                </select>

              </div>


              <div className="filter-group">

                <select
                  value={statusFilter}
                  onChange={e =>
                    setStatusFilter(
                      e.target.value
                    )
                  }
                  className="search-input"
                >

                  <option value="">
                    Semua Status
                  </option>

                  <option value="ACTIVE">
                    Aktif
                  </option>

                  <option value="INACTIVE">
                    Tidak Aktif
                  </option>

                </select>

              </div>

            </div>


            {loading && (

              <div className="loading-message">
                Memuat bank soal...
              </div>

            )}


            {loadError && !showModal && (

              <div className="error-message">
                {loadError}
              </div>

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

                <table className="user-table question-bank-table">

                  <thead>

                    <tr>

                      <th className="align-center">No</th>
                      <th className="align-center">ID</th>
                      <th className="align-center">Mata Pelajaran</th>
                      <th className="align-left">Pertanyaan</th>
                      <th className="align-center">Tingkat</th>
                      <th className="align-center">Bobot</th>
                      <th className="align-center">Status</th>
                      <th className="align-center">Aksi</th>

                    </tr>

                  </thead>


                  <tbody>

                    {filteredQuestions.map(
                      (question, index) => (

                        <tr
                          key={
                            question.id
                          }
                        >

                          <td className="align-center">
                            {index + 1}
                          </td>

                          <td className="align-center">
                            {question.id}
                          </td>


                          <td className="align-left">

                            <strong>
                              {
                                getSubjectName(
                                  question.subject_id
                                )
                              }
                            </strong>

                          </td>


                          <td className="align-left">

                            <div className="question-preview">
                              {
                                question.question_text
                              }
                            </div>

                          </td>


                          <td className="align-center">

                            <span
                              className={
                                `difficulty-badge ` +
                                question.difficulty
                                  .toLowerCase()
                              }
                            >
                              {
                                getDifficultyLabel(
                                  question.difficulty
                                )
                              }
                            </span>

                          </td>


                          <td className="align-center">
                            {question.points}
                          </td>


                          <td className="align-center">

                            {question.is_active ? (

                              <span className="status-active">
                                Aktif
                              </span>

                            ) : (

                              <span className="status-inactive">
                                Nonaktif
                              </span>

                            )}

                          </td>


                          <td className="align-center">

                            <div className="action-buttons">

                              <button
                                className="edit-button"
                                onClick={() =>
                                  openEditModal(
                                    question
                                  )
                                }
                              >
                                <IconEdit size={16} />
                              </button>


                              <button
                                className="delete-button"
                                onClick={() =>
                                  handleDelete(
                                    question
                                  )
                                }
                                disabled={
                                  deletingId ===
                                  question.id
                                }
                              >
                                <IconTrash size={16} />
                              </button>

                            </div>

                          </td>

                        </tr>

                      )
                    )}

                  </tbody>

                </table>


                {filteredQuestions.length === 0 && (

                  <div className="empty-message">
                    {search || subjectFilter || difficultyFilter || statusFilter
                      ? "Soal tidak ditemukan."
                      : "Belum ada soal."
                    }
                  </div>

                )}

              </div>

            )}

          </div>

        </div>

      </main>


      {/* ==================================================
          MODAL TAMBAH / EDIT SOAL
          ================================================== */}

      {showModal && (

        <div className="modal-overlay">

          <div className="modal question-modal">

            <div className="modal-header">

              <div>

                <h2>
                  {editingQuestion
                    ? "Edit Soal"
                    : "Tambah Soal"
                  }
                </h2>

                <p>
                  {editingQuestion
                    ? "Perbaharui data soal pilihan ganda"
                    : "Tambahkan soal pilihan ganda baru"
                  }
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


            {editingQuestion && (

              <div
                style={{
                  padding: "0 24px",
                  marginTop: "16px",
                }}
              >

                {editAiUnavailableMessage && (

                  <div
                    className="form-error-message"
                    style={{ marginBottom: "10px" }}
                  >
                    {editAiUnavailableMessage}
                  </div>

                )}

                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleEditAiButtonClick}
                  disabled={editAiChecking || saving}
                >
                  {editAiChecking
                    ? "Mengecek AI..."
                    : "✨ Edit dengan AI"
                  }
                </button>

                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginTop: "8px",
                    marginBottom: "0",
                  }}
                >
                  AI akan membuatkan draft soal pengganti untuk soal
                  ini. Draft akan mengisi form di bawah — Anda tetap
                  bisa edit manual sebelum menekan "Simpan Perubahan".
                </p>

              </div>

            )}


            <form
              onSubmit={handleSubmit}
            >

              {aiGeneratedNotice && (

                <div
                  className="success-message"
                  style={{ marginBottom: "15px" }}
                >
                  ✨ Soal ini dibuat oleh AI. Periksa dan edit
                  bila perlu sebelum menyimpan — pastikan
                  jawaban yang ditandai benar sudah tepat.
                </div>

              )}

              <div className="form-row">

                <div className="form-group">

                  <label>
                    Mata Pelajaran *
                  </label>

                  <select
                    name="subject_id"
                    value={
                      form.subject_id
                    }
                    onChange={
                      handleChange
                    }
                    disabled={saving}
                    required
                  >

                    <option value="">
                      -- Pilih Mata Pelajaran --
                    </option>

                    {subjects
                      .filter(
                        subject =>
                          subject.is_active
                      )
                      .map(subject => (

                        <option
                          key={
                            subject.id
                          }
                          value={
                            subject.id
                          }
                        >
                          {subject.code} -{" "}
                          {subject.name}
                        </option>

                      ))}

                  </select>

                </div>


                <div className="form-group">

                  <label>
                    Tingkat Kesulitan *
                  </label>

                  <select
                    name="difficulty"
                    value={
                      form.difficulty
                    }
                    onChange={
                      handleChange
                    }
                    disabled={saving}
                    required
                  >

                    {DIFFICULTIES.map(
                      difficulty => (

                        <option
                          key={
                            difficulty.value
                          }
                          value={
                            difficulty.value
                          }
                        >
                          {
                            difficulty.label
                          }
                        </option>

                      )
                    )}

                  </select>

                </div>

              </div>


              <div className="form-group">

                <label>
                  Pertanyaan *
                </label>

                <textarea
                  name="question_text"
                  value={
                    form.question_text
                  }
                  onChange={
                    handleChange
                  }
                  placeholder="Tuliskan pertanyaan..."
                  rows="4"
                  disabled={saving}
                  required
                />

              </div>


              <div className="options-section">

                <div className="section-title">

                  <strong>
                    Pilihan Jawaban
                  </strong>

                  <span>
                    Pilih satu jawaban benar
                  </span>

                </div>


                {form.options.map(
                  (option, index) => (

                    <div
                      className={
                        `option-input-row ` +
                        (
                          option.is_correct
                            ? "correct"
                            : ""
                        )
                      }
                      key={
                        option.option_code
                      }
                    >

                      <label
                        className="correct-radio"
                      >

                        <input
                          type="radio"
                          name="correct_answer"
                          checked={
                            option.is_correct
                          }
                          onChange={() =>
                            handleCorrectAnswer(
                              index
                            )
                          }
                          disabled={saving}
                        />

                        <span>
                          {option.option_code}
                        </span>

                      </label>


                      <input
                        type="text"
                        value={
                          option.option_text
                        }
                        onChange={e =>
                          handleOptionTextChange(
                            index,
                            e.target.value
                          )
                        }
                        placeholder={
                          `Pilihan ${option.option_code}`
                        }
                        disabled={saving}
                        required
                      />


                      {option.is_correct && (

                        <span className="correct-label">
                          Jawaban Benar
                        </span>

                      )}

                    </div>

                  )
                )}

              </div>


              <div className="form-group">

                <label>
                  Pembahasan
                </label>

                <textarea
                  name="explanation"
                  value={
                    form.explanation
                  }
                  onChange={
                    handleChange
                  }
                  placeholder="Tuliskan pembahasan atau penjelasan jawaban..."
                  rows="3"
                  disabled={saving}
                />

              </div>


              <div className="form-row">

                <div className="form-group">

                  <label>
                    Bobot Soal *
                  </label>

                  <input
                    type="number"
                    name="points"
                    value={
                      form.points
                    }
                    onChange={
                      handleChange
                    }
                    min="0.1"
                    step="0.1"
                    disabled={saving}
                    required
                  />

                </div>


                <div className="form-checkbox" style={{ alignSelf: "flex-end", paddingBottom: "8px" }}>

                  <input
                    type="checkbox"
                    name="is_active"
                    checked={
                      form.is_active
                    }
                    onChange={
                      handleChange
                    }
                    id="is_active"
                    disabled={saving}
                  />

                  <label htmlFor="is_active">
                    Soal aktif
                  </label>

                </div>

              </div>


              {formError && (

                <div
                  className="form-error-message"
                  style={{ marginBottom: "15px" }}
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


              <div className="modal-footer">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeModal
                  }
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
                    : "Simpan Soal"
                  }

                </button>

              </div>

            </form>

          </div>

        </div>

      )}


      {/* ============================================
          MODAL GENERATE SOAL AI (TAMBAH / GANTI SOAL)
          ============================================ */}

      {showAiModal && (

        <div className="modal-overlay">

          <div className="modal">

            <div className="modal-header">

              <div>

                <h2>
                  {aiReplaceMode
                    ? "✨ Ganti Soal dengan AI"
                    : "✨ Tambah Soal dengan AI"
                  }
                </h2>

                <p>
                  {aiStep === "form"
                    ? "Prompt akan ditampilkan dulu untuk diperiksa sebelum soal benar-benar dibuat oleh AI."
                    : "Periksa dan edit prompt di bawah ini kalau perlu, lalu tekan \"Generate Soal\"."
                  }
                </p>

              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeAiModal}
                disabled={aiGenerating || aiPromptLoading}
              >
                ×
              </button>

            </div>


            {aiStep === "form" && (

              <form onSubmit={handleShowPrompt}>

                <div className="form-row">

                  <div className="form-group">

                    <label>
                      Mata Pelajaran *
                    </label>

                    <select
                      name="subject_id"
                      value={aiForm.subject_id}
                      onChange={handleAiFormChange}
                      disabled={aiPromptLoading}
                      required
                    >

                      <option value="">
                        -- Pilih Mata Pelajaran --
                      </option>

                      {subjects
                        .filter(subject => subject.is_active)
                        .map(subject => (

                          <option
                            key={subject.id}
                            value={subject.id}
                          >
                            {subject.code} - {subject.name}
                          </option>

                        ))}

                    </select>

                  </div>


                  <div className="form-group">

                    <label>
                      Tingkat Kesulitan *
                    </label>

                    <select
                      name="difficulty"
                      value={aiForm.difficulty}
                      onChange={handleAiFormChange}
                      disabled={aiPromptLoading}
                      required
                    >

                      {DIFFICULTIES.map(difficulty => (

                        <option
                          key={difficulty.value}
                          value={difficulty.value}
                        >
                          {difficulty.label}
                        </option>

                      ))}

                    </select>

                  </div>

                </div>


                <div className="form-group">

                  <label>
                    Jenis Soal
                  </label>

                  <select value="MULTIPLE_CHOICE" disabled>
                    <option value="MULTIPLE_CHOICE">
                      Pilihan Ganda
                    </option>
                  </select>

                  <small style={{ color: "#6b7280" }}>
                    Jenis soal lain (Benar/Salah, Isian Singkat)
                    belum didukung sistem ini.
                  </small>

                </div>


                <div className="form-group">

                  <label>
                    Materi / Lingkup Soal *
                  </label>

                  <input
                    type="text"
                    name="materi"
                    value={aiForm.materi}
                    onChange={handleAiFormChange}
                    placeholder="Contoh: pecahan, penjumlahan bilangan bulat"
                    disabled={aiPromptLoading}
                    required
                  />

                </div>


                <div className="form-group">

                  <label>
                    Perintah Tambahan (opsional)
                  </label>

                  <textarea
                    name="additional_instruction"
                    value={aiForm.additional_instruction}
                    onChange={handleAiFormChange}
                    placeholder="Contoh: gunakan konteks soal cerita, hindari angka negatif"
                    rows={3}
                    disabled={aiPromptLoading}
                  />

                </div>


                {aiError && (

                  <div
                    className="form-error-message"
                    style={{ marginBottom: "15px" }}
                  >
                    {aiError}
                  </div>

                )}


                <div className="modal-footer">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeAiModal}
                    disabled={aiPromptLoading}
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={aiPromptLoading}
                  >
                    {aiPromptLoading
                      ? "Menyusun prompt..."
                      : "Lihat & Edit Prompt"
                    }
                  </button>

                </div>

              </form>

            )}


            {aiStep === "prompt" && (

              <form onSubmit={handleAiGenerate}>

                <div className="form-group">

                  <label>
                    Prompt untuk AI
                  </label>

                  <textarea
                    name="prompt"
                    value={aiPrompt}
                    onChange={(event) =>
                      setAiPrompt(event.target.value)
                    }
                    rows={14}
                    disabled={aiGenerating}
                    style={{
                      fontFamily: "monospace",
                      fontSize: "13px",
                    }}
                    required
                  />

                  <small style={{ color: "#6b7280" }}>
                    Ini teks persis yang akan dikirim ke Ollama.
                    Boleh diubah bebas — misalnya menambah contoh
                    soal, mengetatkan format, atau mengganti
                    bahasa instruksi.
                  </small>

                </div>


                {aiError && (

                  <div
                    className="form-error-message"
                    style={{ marginBottom: "15px" }}
                  >
                    {aiError}
                  </div>

                )}


                <div className="modal-footer">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleBackToAiForm}
                    disabled={aiGenerating}
                  >
                    ← Kembali
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={aiGenerating}
                  >
                    {aiGenerating
                      ? "Membuat soal... (bisa 1-2 menit)"
                      : "Generate Soal"
                    }
                  </button>

                </div>

              </form>

            )}

          </div>

        </div>

      )}

    </div>

  );

}


export default QuestionManagement;