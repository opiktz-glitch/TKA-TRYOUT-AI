import { useEffect, useMemo, useRef, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconEdit, IconTrash, IconCheck, IconBook, IconEye } from "../components/Icons";
import PanduanSoalModal from "../components/PanduanSoalModal";
import {
  getSubjects,
  getQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion as deleteQuestionApi,
  generateAIQuestion,
  previewAIPrompt,
  getAIStatus,
  prepareDocumentExtraction,
  processDocumentChunk,
} from "../services/api";

const OPTION_CODES = ["A", "B", "C", "D"];

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
  const [showGuideModal, setShowGuideModal] = useState(false);

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

  // Diisi dari result.consistency_warning saat backend mendeteksi
  // opsi yang ditandai benar kemungkinan tidak sejalan dengan
  // pembahasannya sendiri (lihat routers/questions.py ->
  // _verify_answer_consistency). null kalau tidak ada masalah.
  const [aiConsistencyWarning, setAiConsistencyWarning] =
    useState(null);

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
  // IMPOR SOAL DARI DOKUMEN (PDF/DOCX/TXT)
  // ======================================================

  const [showImportModal, setShowImportModal] =
    useState(false);

  // Pakai pengecekan status AI yang SAMA seperti tombol "Tambah
  // Soal AI" (fitur ini juga memanggil provider AI yang aktif di
  // backend), supaya guru tidak buka modal dulu baru gagal
  // belakangan kalau tidak ada AI yang online.
  const [importCheckingStatus, setImportCheckingStatus] =
    useState(false);

  const [importUnavailableMessage, setImportUnavailableMessage] =
    useState("");

  // "upload" -> pilih mata pelajaran & file
  // "review" -> daftar soal hasil ekstraksi, bisa diperiksa/
  //             diedit/dicentang sebelum disimpan
  const [importStep, setImportStep] = useState("upload");

  const [importSubjectId, setImportSubjectId] = useState("");

  const [importFile, setImportFile] = useState(null);

  const [importLoading, setImportLoading] = useState(false);

  const [importError, setImportError] = useState("");

  const [importSkippedCount, setImportSkippedCount] = useState(0);

  // Setiap item: { key, question_text, explanation, options: [...],
  // warning, selected, saveStatus: null|"saving"|"saved"|"error",
  // saveError }. Disimpan terpisah dari `questions` (daftar soal
  // tersimpan) karena ini masih berupa DRAFT yang belum tentu jadi
  // soal sungguhan sampai guru menekan "Simpan Soal Terpilih".
  const [importedQuestions, setImportedQuestions] = useState([]);

  const [importSaving, setImportSaving] = useState(false);

  // "processing" (langkah tengah, baru): loading + progress bar
  // saat frontend memanggil processDocumentChunk() satu per satu.
  const [importProgressCurrent, setImportProgressCurrent] = useState(0);
  const [importProgressTotal, setImportProgressTotal] = useState(0);

  // Dipakai tombol "Batalkan" saat importStep === "processing":
  // loop di handleExtractSubmit mengecek ref ini SEBELUM memproses
  // tiap potongan berikutnya. Potongan yang SUDAH selesai diproses
  // tetap muncul di layar review — cuma potongan yang BELUM
  // diproses yang dilewati.
  const importCancelRef = useRef(false);

  const nextImportKeyRef = useRef(0);

  // ======================================================
  // PREVIEW SOAL (lihat soal + kunci jawaban + pembahasan)
  //
  // BEDA dari modal Review Soal di TryoutManagement.jsx: di sini
  // cuma preview SATU soal (bukan satu paket tryout berisi banyak
  // soal), dan datanya sudah ADA di `questions` (hasil loadQuestions
  // — QuestionResponse dari backend sudah menyertakan options +
  // is_correct + explanation), jadi TIDAK perlu panggil API lagi.
  // Tidak ada tombol cetak/PDF di sini (beda dari TryoutManagement)
  // karena ini cuma untuk lihat cepat, bukan dokumen yang mau
  // dicetak.
  // ======================================================

  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [previewQuestion, setPreviewQuestion] = useState(null);


  function openPreviewModal(question) {

    setPreviewQuestion(question);
    setShowPreviewModal(true);
  }


  function closePreviewModal() {

    setShowPreviewModal(false);
    setPreviewQuestion(null);
  }

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
  // PAGINATION (Bank Soal)
  // ======================================================

  const QUESTIONS_PER_PAGE = 10;

  const [currentPage, setCurrentPage] = useState(1);

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
    setAiConsistencyWarning(null);
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
    setAiConsistencyWarning(null);
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
    setAiConsistencyWarning(null);
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
      setAiConsistencyWarning(result.consistency_warning || null);

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
  // TOMBOL "IMPOR DARI DOKUMEN" DIKLIK
  //
  // Sama seperti handleAiButtonClick — cek status provider AI dulu
  // sebelum modal dibuka, karena fitur ini juga memanggil AI di
  // baliknya (bedanya: untuk MEMBACA ULANG soal dari dokumen, bukan
  // membuat soal baru dari materi).
  // ======================================================

  async function handleImportButtonClick() {

    setImportUnavailableMessage("");

    try {

      setImportCheckingStatus(true);

      const status = await getAIStatus();

      if (!status.online) {

        setImportUnavailableMessage(
          status.reason ||
          "Tidak ada AI yang online saat ini. Coba lagi nanti atau hubungi admin."
        );

        return;
      }

      setImportStep("upload");
      setImportSubjectId("");
      setImportFile(null);
      setImportError("");
      setImportedQuestions([]);
      setImportSkippedCount(0);
      setShowImportModal(true);

    } catch (err) {

      console.error(
        "CHECK AI STATUS (IMPORT) ERROR:",
        err
      );

      setImportUnavailableMessage(
        err.message ||
        "Gagal memeriksa status AI. Coba lagi nanti."
      );

    } finally {

      setImportCheckingStatus(false);
    }
  }


  function closeImportModal() {

    if (importLoading || importSaving || importStep === "processing") {
      return;
    }

    setShowImportModal(false);
  }


  // ======================================================
  // LANGKAH 1 -> 2 -> 3: UPLOAD (prepare, cepat & tanpa AI) LALU
  // PROSES TIAP POTONGAN SATU PER SATU LEWAT AI (processDocumentChunk)
  //
  // Hasil tiap potongan LANGSUNG ditambahkan ke `importedQuestions`
  // begitu selesai — bukan menunggu semua potongan kelar dulu.
  // Jadi kalau potongan ke-8 dari 15 gagal (timeout/AI error), 7
  // potongan sebelumnya TETAP ada di layar review, bukan ikut
  // hilang seperti pendekatan lama (1 request besar untuk semua
  // potongan sekaligus).
  // ======================================================

  async function handleExtractSubmit(event) {

    event.preventDefault();

    setImportError("");

    if (!importSubjectId) {

      setImportError("Mata pelajaran wajib dipilih");

      return;
    }

    if (!importFile) {

      setImportError("Pilih file dokumen (.pdf, .docx, atau .txt) terlebih dahulu");

      return;
    }

    let chunks;

    try {

      setImportLoading(true);

      const prepared = await prepareDocumentExtraction(
        Number(importSubjectId),
        importFile
      );

      chunks = prepared.chunks;

    } catch (err) {

      console.error(
        "PREPARE DOCUMENT EXTRACTION ERROR:",
        err
      );

      setImportError(
        err.message ||
        "Gagal membaca dokumen"
      );

      setImportLoading(false);

      return;
    }

    setImportLoading(false);

    if (!chunks || chunks.length === 0) {

      setImportError(
        "Dokumen tidak berisi teks yang bisa diproses."
      );

      return;
    }

    importCancelRef.current = false;

    setImportedQuestions([]);
    setImportSkippedCount(0);
    setImportProgressCurrent(0);
    setImportProgressTotal(chunks.length);
    setImportStep("processing");

    let totalSkipped = 0;

    for (let i = 0; i < chunks.length; i++) {

      if (importCancelRef.current) {
        break;
      }

      const chunk = chunks[i];

      try {

        const result = await processDocumentChunk(
          Number(importSubjectId),
          chunk.chunk_text,
          chunk.expected_count
        );

        const items = result.questions.map(question => ({
          key: nextImportKeyRef.current++,

          question_text: question.question_text,

          difficulty: question.difficulty || "MEDIUM",

          explanation: question.explanation || "",

          points: question.points ?? 1,

          options: OPTION_CODES.map(code => {

            const found = question.options.find(
              option => option.option_code === code
            );

            return {
              option_code: code,
              option_text: found?.option_text || "",
              is_correct: found?.is_correct || false,
            };
          }),

          warning: question.warning || null,

          selected: true,

          saveStatus: null,
          saveError: "",
        }));

        setImportedQuestions(prev => [...prev, ...items]);

        totalSkipped += result.skipped_count || 0;

        setImportSkippedCount(totalSkipped);

      } catch (err) {

        console.error(
          "PROCESS DOCUMENT CHUNK ERROR:",
          err
        );

        // Kemungkinan besar ini masalah konfigurasi (AI mati di
        // tengah proses, dsb) yang akan terus terulang di potongan
        // berikutnya juga — daripada menghabiskan waktu mencoba
        // semua potongan sisanya dan gagal semua, proses dihentikan
        // di sini. Potongan yang SUDAH berhasil (sebelum ini) tetap
        // ada di importedQuestions, tidak ikut dibuang.
        setImportError(
          `Berhenti di potongan ke-${i + 1} dari ${chunks.length}: ` +
          (err.message || "Gagal memproses potongan ini") +
          " Soal yang sudah berhasil diproses sebelumnya tetap tersimpan di bawah."
        );

        break;
      }

      setImportProgressCurrent(i + 1);
    }

    setImportStep("review");
  }


  function handleCancelImportProcessing() {

    importCancelRef.current = true;
  }


  function handleBackToImportUpload() {

    if (importSaving) {
      return;
    }

    setImportStep("upload");
    setImportError("");
  }


  // ======================================================
  // EDIT DI LAYAR REVIEW (sebelum disimpan)
  // ======================================================

  function handleImportToggleSelected(key) {

    setImportedQuestions(prev =>
      prev.map(item =>
        item.key === key
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  }


  function handleImportRemove(key) {

    setImportedQuestions(prev =>
      prev.filter(item => item.key !== key)
    );
  }


  function handleImportQuestionTextChange(key, value) {

    setImportedQuestions(prev =>
      prev.map(item =>
        item.key === key
          ? { ...item, question_text: value }
          : item
      )
    );
  }


  function handleImportExplanationChange(key, value) {

    setImportedQuestions(prev =>
      prev.map(item =>
        item.key === key
          ? { ...item, explanation: value }
          : item
      )
    );
  }


  function handleImportOptionTextChange(key, optionIndex, value) {

    setImportedQuestions(prev =>
      prev.map(item => {

        if (item.key !== key) {
          return item;
        }

        const newOptions = [...item.options];

        newOptions[optionIndex] = {
          ...newOptions[optionIndex],
          option_text: value,
        };

        return { ...item, options: newOptions };
      })
    );
  }


  function handleImportCorrectAnswer(key, optionIndex) {

    setImportedQuestions(prev =>
      prev.map(item => {

        if (item.key !== key) {
          return item;
        }

        return {
          ...item,
          options: item.options.map((option, index) => ({
            ...option,
            is_correct: index === optionIndex,
          })),
        };
      })
    );
  }


  // ======================================================
  // LANGKAH 2 -> SIMPAN: soal yang dicentang disimpan SATU PER
  // SATU lewat endpoint POST /api/questions biasa (validasinya
  // sama persis dengan tambah soal manual). Kalau ada yang
  // ditolak backend (mis. opsi belum lengkap, jawaban benar belum
  // ditandai), soal itu TETAP ada di layar dengan pesan error-nya
  // sendiri supaya guru tinggal perbaiki lalu simpan ulang — tidak
  // perlu upload dokumen dari awal lagi.
  // ======================================================

  async function handleSaveSelectedImported() {

    const selectedKeys = importedQuestions
      .filter(item => item.selected)
      .map(item => item.key);

    if (selectedKeys.length === 0) {

      setImportError("Pilih minimal satu soal untuk disimpan");

      return;
    }

    setImportError("");
    setImportSaving(true);

    // Tandai semua yang dicentang sebagai "saving" dulu supaya UI
    // langsung memberi umpan balik, baru diproses berurutan
    // (bukan Promise.all) supaya tidak membanjiri backend/provider
    // AI (verifikasi konsistensi ikut jalan tiap create? — tidak,
    // endpoint create biasa tidak memanggil AI, tapi tetap
    // berurutan lebih aman untuk SQLite).
    setImportedQuestions(prev =>
      prev.map(item =>
        selectedKeys.includes(item.key)
          ? { ...item, saveStatus: "saving", saveError: "" }
          : item
      )
    );

    let successCount = 0;

    for (const key of selectedKeys) {

      const item = importedQuestions.find(q => q.key === key);

      if (!item) {
        continue;
      }

      try {

        await createQuestion({
          subject_id: Number(importSubjectId),
          question_text: item.question_text,
          question_type: "MULTIPLE_CHOICE",
          difficulty: item.difficulty,
          explanation: item.explanation || null,
          points: item.points,
          is_active: true,
          options: item.options,
        });

        successCount += 1;

        setImportedQuestions(prev =>
          prev.map(q =>
            q.key === key
              ? { ...q, saveStatus: "saved", selected: false }
              : q
          )
        );

      } catch (err) {

        console.error(
          "SAVE IMPORTED QUESTION ERROR:",
          err
        );

        setImportedQuestions(prev =>
          prev.map(q =>
            q.key === key
              ? {
                  ...q,
                  saveStatus: "error",
                  saveError: err.message || "Gagal menyimpan soal ini",
                }
              : q
          )
        );
      }
    }

    setImportSaving(false);

    if (successCount > 0) {

      setActionSuccess(
        `${successCount} soal berhasil diimpor dari dokumen.`
      );

      loadQuestions();
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


  // Reset ke halaman 1 setiap kali pencarian/filter berubah, supaya
  // tidak "nyangkut" di halaman 5 misalnya padahal hasil filter
  // barunya cuma ada 1 halaman.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, subjectFilter, difficultyFilter, statusFilter]);


  const totalPages = Math.max(
    1,
    Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE)
  );

  // Kalau halaman aktif jadi lebih besar dari total halaman yang ada
  // (mis. setelah soal terakhir di halaman itu dihapus), mundurkan
  // otomatis ke halaman terakhir yang valid.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * QUESTIONS_PER_PAGE;
    return filteredQuestions.slice(start, start + QUESTIONS_PER_PAGE);
  }, [filteredQuestions, currentPage]);


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

              {importUnavailableMessage && (

                <div
                  className="form-error-message"
                  style={{
                    marginTop: 10,
                    maxWidth: 520,
                  }}
                >
                  {importUnavailableMessage}
                </div>

              )}

            </div>


            <div style={{ display: "flex", gap: "10px" }}>

              <button
                type="button"
                className="secondary-button"
                onClick={handleImportButtonClick}
                disabled={importCheckingStatus}
              >
                {importCheckingStatus
                  ? "Mengecek AI..."
                  : "📄 Impor dari Dokumen"
                }
              </button>

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
                      <th className="align-center sticky-col">Aksi</th>

                    </tr>

                  </thead>


                  <tbody>

                    {paginatedQuestions.map(
                      (question, index) => (

                        <tr
                          key={
                            question.id
                          }
                        >

                          <td className="align-center">
                            {(currentPage - 1) * QUESTIONS_PER_PAGE + index + 1}
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


                          <td className="align-center sticky-col">

                            <div className="action-buttons">

                              <button
                                className="review-button"
                                title="Preview Soal"
                                onClick={() =>
                                  openPreviewModal(
                                    question
                                  )
                                }
                              >
                                <IconEye size={16} />
                              </button>


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

                {filteredQuestions.length > 0 && (

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
                      {(currentPage - 1) * QUESTIONS_PER_PAGE + 1}
                      {"–"}
                      {Math.min(
                        currentPage * QUESTIONS_PER_PAGE,
                        filteredQuestions.length
                      )}{" "}
                      dari {filteredQuestions.length} soal
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

              {aiConsistencyWarning && (

                <div
                  className="form-error-message"
                  style={{ marginBottom: "15px" }}
                >
                  ⚠️ {aiConsistencyWarning}
                </div>

              )}

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
                  className="guide-button"
                  onClick={() => setShowGuideModal(true)}
                >
                  <IconBook size={15} />
                  Panduan
                </button>

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
                    className="guide-button"
                    onClick={() => setShowGuideModal(true)}
                  >
                    <IconBook size={15} />
                    Panduan
                  </button>

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

      {showImportModal && (

        <div className="modal-overlay">

          <div className="modal" style={{ maxWidth: 720 }}>

            <div className="modal-header">

              <div>

                <h2>
                  📄 Impor Soal dari Dokumen
                </h2>

                <p>
                  {importStep === "upload"
                    ? "Upload dokumen (.pdf, .docx, .txt) yang isinya SUDAH BERISI soal pilihan ganda. AI hanya akan membaca ulang & menstrukturkannya — bukan membuat soal baru."
                    : "Periksa & lengkapi tiap soal hasil ekstraksi sebelum disimpan. Soal tidak akan tersimpan kalau belum dicentang."
                  }
                </p>

              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeImportModal}
                disabled={importLoading || importSaving || importStep === "processing"}
              >
                ×
              </button>

            </div>


            {importStep === "upload" && (

              <form onSubmit={handleExtractSubmit}>

                <div className="form-group">

                  <label>
                    Mata Pelajaran *
                  </label>

                  <select
                    value={importSubjectId}
                    onChange={e => setImportSubjectId(e.target.value)}
                    disabled={importLoading}
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
                    File Dokumen *
                  </label>

                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={e =>
                      setImportFile(e.target.files?.[0] || null)
                    }
                    disabled={importLoading}
                    required
                  />

                  <small style={{ color: "#6b7280" }}>
                    Format didukung: PDF, Word (.docx), atau teks
                    biasa (.txt). Maksimal 15 MB.
                  </small>

                </div>


                {importError && (

                  <div
                    className="form-error-message"
                    style={{ marginBottom: "15px" }}
                  >
                    {importError}
                  </div>

                )}


                <div className="modal-footer">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeImportModal}
                    disabled={importLoading}
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={importLoading}
                  >
                    {importLoading
                      ? "Membaca dokumen... (bisa sampai belasan menit untuk dokumen panjang, terutama kalau pakai Ollama lokal)"
                      : "Ekstrak Soal"
                    }
                  </button>

                </div>

              </form>

            )}


            {importStep === "processing" && (

              <div>

                <div
                  style={{
                    marginBottom: "12px",
                    fontWeight: 600,
                  }}
                >
                  Memproses potongan {Math.min(importProgressCurrent + 1, importProgressTotal)} dari {importProgressTotal}...
                </div>

                <div
                  style={{
                    width: "100%",
                    height: "10px",
                    borderRadius: "6px",
                    background: "#e5e7eb",
                    overflow: "hidden",
                    marginBottom: "10px",
                  }}
                >

                  <div
                    style={{
                      width: `${importProgressTotal > 0
                        ? (importProgressCurrent / importProgressTotal) * 100
                        : 0}%`,
                      height: "100%",
                      background: "#2563eb",
                      transition: "width 0.3s ease",
                    }}
                  />

                </div>

                <p style={{ color: "#6b7280", marginBottom: "20px" }}>
                  {importedQuestions.length} soal ditemukan sejauh ini
                  {importSkippedCount > 0 &&
                    ` (${importSkippedCount} bagian tidak dikenali sebagai soal)`
                  }. Jangan tutup jendela ini — soal yang sudah
                  ditemukan tetap aman meski ada potongan berikutnya
                  yang gagal.
                </p>

                <div className="modal-footer">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleCancelImportProcessing}
                  >
                    Batalkan &amp; Lihat Hasil Sejauh Ini
                  </button>

                </div>

              </div>

            )}


            {importStep === "review" && (

              <div>

                {importSkippedCount > 0 && (

                  <div
                    className="form-error-message"
                    style={{ marginBottom: "15px" }}
                  >
                    {importSkippedCount} bagian dokumen tidak
                    berhasil dikenali sebagai soal pilihan ganda
                    dan tidak ikut muncul di bawah ini. Tambahkan
                    manual kalau ada soal yang terlewat.
                  </div>

                )}

                {importError && (

                  <div
                    className="form-error-message"
                    style={{ marginBottom: "15px" }}
                  >
                    {importError}
                  </div>

                )}

                <div
                  style={{
                    maxHeight: "55vh",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >

                  {importedQuestions.map((item, itemIndex) => (

                    <div
                      key={item.key}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "14px",
                        opacity: item.saveStatus === "saved" ? 0.6 : 1,
                      }}
                    >

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "10px",
                          marginBottom: "8px",
                        }}
                      >

                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontWeight: 600,
                          }}
                        >

                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() =>
                              handleImportToggleSelected(item.key)
                            }
                            disabled={importSaving}
                          />

                          Soal #{itemIndex + 1}

                          {item.saveStatus === "saved" && (
                            <span style={{ color: "#16a34a", fontWeight: 400 }}>
                              — Tersimpan
                            </span>
                          )}

                        </label>

                        <button
                          type="button"
                          className="secondary-button"
                          style={{ padding: "4px 10px" }}
                          onClick={() => handleImportRemove(item.key)}
                          disabled={importSaving}
                        >
                          Hapus
                        </button>

                      </div>


                      {item.warning && (

                        <div
                          className="form-error-message"
                          style={{ marginBottom: "10px" }}
                        >
                          ⚠️ {item.warning}
                        </div>

                      )}

                      {item.saveStatus === "error" && (

                        <div
                          className="form-error-message"
                          style={{ marginBottom: "10px" }}
                        >
                          {item.saveError}
                        </div>

                      )}


                      <div className="form-group">

                        <label>
                          Pertanyaan
                        </label>

                        <textarea
                          value={item.question_text}
                          onChange={e =>
                            handleImportQuestionTextChange(
                              item.key, e.target.value
                            )
                          }
                          rows={3}
                          disabled={importSaving}
                        />

                      </div>


                      <div className="options-section">

                        <div className="section-title">
                          <strong>Pilihan Jawaban</strong>
                          <span>Pilih satu jawaban benar</span>
                        </div>

                        {item.options.map((option, optionIndex) => (

                          <div
                            className={
                              `option-input-row ` +
                              (option.is_correct ? "correct" : "")
                            }
                            key={option.option_code}
                          >

                            <label className="correct-radio">

                              <input
                                type="radio"
                                name={`import-correct-${item.key}`}
                                checked={option.is_correct}
                                onChange={() =>
                                  handleImportCorrectAnswer(
                                    item.key, optionIndex
                                  )
                                }
                                disabled={importSaving}
                              />

                              <span>{option.option_code}</span>

                            </label>

                            <input
                              type="text"
                              value={option.option_text}
                              onChange={e =>
                                handleImportOptionTextChange(
                                  item.key, optionIndex, e.target.value
                                )
                              }
                              placeholder={`Pilihan ${option.option_code}`}
                              disabled={importSaving}
                            />

                            {option.is_correct && (
                              <span className="correct-label">
                                Jawaban Benar
                              </span>
                            )}

                          </div>

                        ))}

                      </div>


                      <div className="form-group">

                        <label>
                          Pembahasan (opsional)
                        </label>

                        <textarea
                          value={item.explanation}
                          onChange={e =>
                            handleImportExplanationChange(
                              item.key, e.target.value
                            )
                          }
                          rows={2}
                          disabled={importSaving}
                        />

                      </div>

                    </div>

                  ))}

                  {importedQuestions.length === 0 && (

                    <p style={{ color: "#6b7280" }}>
                      Semua soal hasil ekstraksi sudah dihapus dari
                      daftar ini. Kembali ke langkah upload kalau
                      mau coba dokumen lain.
                    </p>

                  )}

                </div>


                <div className="modal-footer">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleBackToImportUpload}
                    disabled={importSaving}
                  >
                    ← Dokumen Lain
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeImportModal}
                    disabled={importSaving}
                  >
                    Tutup
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleSaveSelectedImported}
                    disabled={
                      importSaving ||
                      importedQuestions.filter(q => q.selected).length === 0
                    }
                  >
                    {importSaving
                      ? "Menyimpan..."
                      : `Simpan ${
                          importedQuestions.filter(q => q.selected).length
                        } Soal Terpilih`
                    }
                  </button>

                </div>

              </div>

            )}

          </div>

        </div>

      )}

      {showPreviewModal && previewQuestion && (

        <div className="modal-overlay review-modal-overlay">

          <div
            className="modal review-modal"
            style={{ width: "700px", maxWidth: "96vw" }}
          >

            <div className="modal-header">

              <div>
                <h2>Preview Soal</h2>
                <p>
                  Tampilan soal beserta kunci jawaban dan pembahasan.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closePreviewModal}
              >
                ×
              </button>

            </div>

            <div className="review-print-page">

              <div className="review-print-header">
                <h3>
                  {getSubjectName(previewQuestion.subject_id)}
                </h3>
                <div className="review-print-meta">
                  <span>
                    Tingkat: {getDifficultyLabel(previewQuestion.difficulty)}
                  </span>
                  <span>
                    Bobot: {previewQuestion.points}
                  </span>
                  <span>
                    Status: {previewQuestion.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
              </div>

              <div className="review-print-questions">

                <div className="review-print-question">

                  <div className="review-print-question-text">
                    <span>{previewQuestion.question_text}</span>
                  </div>

                  <div className="review-print-options">
                    {previewQuestion.options.map(option => (

                      <div
                        key={option.option_code}
                        className={
                          `review-print-option ` +
                          (option.is_correct ? "is-correct" : "")
                        }
                      >
                        <span className="review-print-option-code">
                          {option.option_code}.
                        </span>
                        <span>{option.option_text}</span>
                      </div>

                    ))}
                  </div>

                  {(() => {

                    const correctOption = previewQuestion.options.find(
                      option => option.is_correct
                    );

                    return (
                      <div
                        className="review-answer-correct"
                        style={{ marginTop: 10 }}
                      >
                        Jawaban:{" "}
                        <strong>
                          {correctOption
                            ? `${correctOption.option_code}. ${correctOption.option_text}`
                            : "Belum ditandai"
                          }
                        </strong>
                      </div>
                    );

                  })()}

                  {previewQuestion.explanation && (

                    <div className="review-answer-explanation">
                      <em>Pembahasan:</em> {previewQuestion.explanation}
                    </div>

                  )}

                </div>

              </div>

            </div>

          </div>

        </div>

      )}

      {showGuideModal && (
        <PanduanSoalModal onClose={() => setShowGuideModal(false)} />
      )}

    </div>

  );

}


export default QuestionManagement;