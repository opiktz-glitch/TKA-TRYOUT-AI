//const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';


// =====================================================
// EXTRACT ERROR MESSAGE
//
// FastAPI membalas error dalam beberapa bentuk berbeda:
// - HTTPException manual   -> { detail: "Pesan error" }
// - Validasi Pydantic (422) -> { detail: [{ msg: "...", loc: [...] }, ...] }
//
// Tanpa penanganan ini, kasus kedua bikin `new Error(data.detail)`
// menghasilkan pesan rusak/kosong ("[object Object]"), sehingga
// terlihat seolah tidak ada feedback error sama sekali.
// =====================================================

function extractErrorMessage(data) {

  if (!data) {
    return "";
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return data.detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join(", ");
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  return "";
}


// =====================================================
// APIFETCH — helper pusat untuk semua request
//
// - Otomatis menambahkan Authorization header dari token
//   di localStorage (kecuali diminta sebaliknya).
// - Otomatis parse JSON & lempar Error dengan pesan dari
//   backend (`detail`) kalau response tidak ok.
// - Kalau backend membalas 401 (token invalid/kedaluwarsa),
//   hapus token dan broadcast event "auth:unauthorized"
//   supaya AuthContext bisa logout user secara global,
//   di halaman mana pun dia sedang berada.
// =====================================================

async function apiFetch(
  path,
  {
    method = "GET",
    body,
    auth = true,
    ...rest
  } = {}
) {

  const headers = {
    ...(rest.headers || {}),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = localStorage.getItem("access_token");

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });


  // -----------------------------------------------------
  // SESI KEDALUWARSA / TOKEN TIDAK VALID
  // -----------------------------------------------------

  if (response.status === 401 && auth) {

    localStorage.removeItem("access_token");

    window.dispatchEvent(new Event("auth:unauthorized"));

    throw new Error("Sesi Anda telah berakhir. Silakan login kembali.");
  }


  const data = await response.json().catch(() => ({}));

  if (!response.ok) {

    const errorMessage = extractErrorMessage(data);

    if (response.status === 429) {
      throw new Error(
        errorMessage || "Terlalu banyak percobaan. Coba lagi nanti."
      );
    }

    throw new Error(
      errorMessage || "Terjadi kesalahan pada server"
    );
  }

  return data;
}


// =====================================================
// AUTH
// =====================================================

export async function login(username, password) {
  // auth:false — endpoint login tidak butuh token,
  // dan kegagalan login TIDAK boleh memicu event
  // auth:unauthorized (itu untuk sesi yang sudah berjalan).
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
}

export async function getCurrentUser() {
  return apiFetch("/api/auth/me");
}

export async function changeMyPassword(currentPassword, newPassword) {
  return apiFetch("/api/auth/change-password", {
    method: "PUT",
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  });
}

export async function updateMyAccountProfile(fullName) {
  return apiFetch("/api/auth/profile", {
    method: "PUT",
    body: { full_name: fullName },
  });
}


// =====================================================
// USERS
// =====================================================

export async function getUsers() {
  return apiFetch("/api/users");
}

export async function createUser(userData) {
  return apiFetch("/api/users", {
    method: "POST",
    body: userData,
  });
}

export async function updateUser(userId, userData) {
  return apiFetch(`/api/users/${userId}`, {
    method: "PUT",
    body: userData,
  });
}

export async function deleteUser(userId) {
  return apiFetch(`/api/users/${userId}`, {
    method: "DELETE",
  });
}

export async function resetUserPassword(userId, newPassword) {
  return apiFetch(`/api/users/${userId}/password`, {
    method: "PUT",
    body: { new_password: newPassword },
  });
}


// =====================================================
// SUBJECTS (MATA PELAJARAN)
// =====================================================

export async function getSubjects() {
  return apiFetch("/api/subjects");
}

export async function createSubject(subjectData) {
  return apiFetch("/api/subjects", {
    method: "POST",
    body: subjectData,
  });
}

export async function updateSubject(subjectId, subjectData) {
  return apiFetch(`/api/subjects/${subjectId}`, {
    method: "PUT",
    body: subjectData,
  });
}

export async function deleteSubject(subjectId) {
  return apiFetch(`/api/subjects/${subjectId}`, {
    method: "DELETE",
  });
}


// =====================================================
// QUESTIONS (BANK SOAL)
// =====================================================

export async function getQuestions() {
  return apiFetch("/api/questions");
}

export async function createQuestion(questionData) {
  return apiFetch("/api/questions", {
    method: "POST",
    body: questionData,
  });
}

export async function updateQuestion(questionId, questionData) {
  return apiFetch(`/api/questions/${questionId}`, {
    method: "PUT",
    body: questionData,
  });
}

export async function deleteQuestion(questionId) {
  return apiFetch(`/api/questions/${questionId}`, {
    method: "DELETE",
  });
}

// Generate draft soal pakai AI (Ollama lokal). Generation lokal
// bisa memakan waktu cukup lama, jadi dikasih timeout sendiri
// (150 detik) yang lebih longgar daripada request biasa, supaya
// guru dapat pesan yang jelas kalau macet alih-alih menunggu
// tanpa batas.
export async function previewAIPrompt(payload) {
  return await apiFetch("/api/questions/ai-generate/prompt", {
    method: "POST",
    body: payload,
  });
}

export async function generateAIQuestion(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);

  try {
    return await apiFetch("/api/questions/ai-generate", {
      method: "POST",
      body: payload,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        "AI terlalu lama merespons (lebih dari 150 detik). Coba lagi, atau gunakan model Ollama yang lebih ringan."
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}


// Pengaturan model Ollama yang aktif. Disimpan di database lewat
// halaman Admin Settings, jadi admin tidak perlu edit file .env
// atau restart server manual tiap kali mau ganti model AI.
export async function getAIModelSetting() {
  return apiFetch("/api/settings/ai-model");
}

export async function updateAIModelSetting(model) {
  return apiFetch("/api/settings/ai-model", {
    method: "PUT",
    body: { model },
  });
}

export async function resetAIModelSetting() {
  return apiFetch("/api/settings/ai-model", {
    method: "DELETE",
  });
}


// =====================================================
// MULTI-PROVIDER AI (OLLAMA + GEMINI)
//
// Gemini adalah provider AI kedua selain Ollama. API key & model
// Gemini disimpan di database lewat endpoint ini (BUKAN hardcode
// di .env), jadi admin bisa ganti-ganti key kapan saja dari
// halaman Pengaturan. getAIStatus() dipakai untuk cek cepat
// SEBELUM membuka modal "Tambah Soal AI" — kalau tidak ada
// satupun provider yang online, error langsung ditampilkan saat
// tombol diklik, tanpa perlu isi form dulu.
// =====================================================

export async function getAIProviders() {
  return apiFetch("/api/settings/ai-providers");
}

export async function updateActiveProvider(provider) {
  return apiFetch("/api/settings/ai-provider", {
    method: "PUT",
    body: { provider },
  });
}

export async function updateGeminiSetting({ apiKey, model } = {}) {
  const body = {};

  // undefined -> field tidak dikirim sama sekali -> backend tidak
  // mengubah nilai lama. Ini disengaja supaya admin bisa menyimpan
  // model baru tanpa mengetik ulang API key, dan sebaliknya.
  if (apiKey !== undefined) {
    body.api_key = apiKey;
  }

  if (model !== undefined) {
    body.model = model;
  }

  return apiFetch("/api/settings/gemini", {
    method: "PUT",
    body,
  });
}

export async function clearGeminiSetting() {
  return apiFetch("/api/settings/gemini", {
    method: "DELETE",
  });
}

// Cek cepat status provider AI yang SEDANG AKTIF. Dipanggil
// frontend sebelum membuka modal generate soal AI.
export async function getAIStatus() {
  return apiFetch("/api/settings/ai-status");
}


// =====================================================
// TRYOUT
// =====================================================

export async function getTryouts() {
  return apiFetch("/api/tryouts");
}

export async function getTryout(tryoutId) {
  return apiFetch(`/api/tryouts/${tryoutId}`);
}

export async function getAvailableQuestions(subjectId, difficulty = "") {
  let url = `/api/tryouts/available/questions?subject_id=${subjectId}`;

  if (difficulty) {
    url += `&difficulty=${difficulty}`;
  }

  return apiFetch(url);
}

export async function createTryout(tryoutData) {
  return apiFetch("/api/tryouts", {
    method: "POST",
    body: tryoutData,
  });
}

export async function updateTryout(tryoutId, tryoutData) {
  return apiFetch(`/api/tryouts/${tryoutId}`, {
    method: "PUT",
    body: tryoutData,
  });
}

export async function deleteTryout(tryoutId) {
  return apiFetch(`/api/tryouts/${tryoutId}`, {
    method: "DELETE",
  });
}


// =========================================================
// DATA SISWA (t_student) — ADMIN
// =========================================================

export async function getStudentProfiles() {
  return apiFetch("/api/students");
}

export async function getAvailableStudentUsers() {
  return apiFetch("/api/students/available-users");
}

export async function createStudentProfile(studentData) {
  return apiFetch("/api/students", {
    method: "POST",
    body: studentData,
  });
}

export async function updateStudentProfile(studentId, studentData) {
  return apiFetch(`/api/students/${studentId}`, {
    method: "PUT",
    body: studentData,
  });
}

export async function deleteStudentProfile(studentId) {
  return apiFetch(`/api/students/${studentId}`, {
    method: "DELETE",
  });
}


// =========================================================
// DATA GURU (t_teacher) — ADMIN
// =========================================================

export async function getTeacherProfiles() {
  return apiFetch("/api/teachers");
}

export async function getAvailableTeacherUsers() {
  return apiFetch("/api/teachers/available-users");
}

export async function createTeacherProfile(teacherData) {
  return apiFetch("/api/teachers", {
    method: "POST",
    body: teacherData,
  });
}

export async function updateTeacherProfile(teacherId, teacherData) {
  return apiFetch(`/api/teachers/${teacherId}`, {
    method: "PUT",
    body: teacherData,
  });
}

export async function deleteTeacherProfile(teacherId) {
  return apiFetch(`/api/teachers/${teacherId}`, {
    method: "DELETE",
  });
}


// =========================================================
// STUDENT - TRYOUT
// =========================================================

export async function getStudentTryouts() {
  return apiFetch("/api/student/tryouts");
}


// =========================================================
// STUDENT - DETAIL TRYOUT
// =========================================================

export async function getStudentTryout(tryoutId) {
  return apiFetch(`/api/student/tryouts/${tryoutId}`);
}


// =========================================================
// STUDENT - START TRYOUT
// =========================================================

export async function startStudentTryout(tryoutId) {
  return apiFetch(`/api/student/tryouts/${tryoutId}/start`, {
    method: "POST",
  });
}


// =========================================================
// TEACHER - NILAI (REKAP SKOR TRYOUT SAYA)
// =========================================================

export async function getTeacherScores(tryoutId) {
  const query = tryoutId ? `?tryout_id=${tryoutId}` : "";
  return apiFetch(`/api/teacher/scores${query}`);
}


// =========================================================
// TEACHER - LAPORAN (ANALITIK PER TRYOUT)
// =========================================================

export async function getTeacherReport(tryoutId) {
  return apiFetch(`/api/teacher/reports/${tryoutId}`);
}


// =========================================================
// ADMIN - NILAI (REKAP SKOR SELURUH TRYOUT)
// =========================================================

export async function getAdminScores({ tryoutId, subjectId, teacherId } = {}) {
  const params = new URLSearchParams();

  if (tryoutId) params.set("tryout_id", tryoutId);
  if (subjectId) params.set("subject_id", subjectId);
  if (teacherId) params.set("teacher_id", teacherId);

  const query = params.toString() ? `?${params.toString()}` : "";

  return apiFetch(`/api/teacher/scores${query}`);
}

export async function getScoreCreators() {
  return apiFetch("/api/teacher/creators");
}


// =========================================================
// ADMIN - LAPORAN (ANALITIK SISTEM)
// =========================================================

export async function getAdminReportOverview() {
  return apiFetch("/api/admin/reports/overview");
}


// =========================================================
// STUDENT - TRYOUT SAYA (ATTEMPT YANG SEDANG BERJALAN)
// =========================================================

export async function getOngoingAttempts() {
  return apiFetch("/api/student/attempts/ongoing");
}


// =========================================================
// STUDENT - PROFIL SAYA
// =========================================================

export async function getMyProfile() {
  return apiFetch("/api/student/profile");
}

export async function updateMyProfile(profileData) {
  return apiFetch("/api/student/profile", {
    method: "PUT",
    body: profileData,
  });
}


// =========================================================
// STUDENT - RIWAYAT / HASIL TRYOUT
// =========================================================

export async function getAttemptHistory() {
  return apiFetch("/api/student/attempts/history");
}

export async function getAttemptResultDetail(attemptId) {
  return apiFetch(`/api/student/attempts/${attemptId}/result`);
}


// =========================================================
// STUDENT - GET ATTEMPT
// =========================================================

export async function getStudentAttempt(attemptId) {
  return apiFetch(`/api/student/attempts/${attemptId}`);
}


// =========================================================
// STUDENT - SAVE ANSWER
// =========================================================

export async function saveStudentAnswer(
  attemptId,
  questionId,
  selectedOption
) {
  return apiFetch(`/api/student/attempts/${attemptId}/answers`, {
    method: "POST",
    body: {
      question_id: questionId,
      selected_option: selectedOption,
    },
  });
}


// =========================================================
// STUDENT - SUBMIT TRYOUT
// =========================================================

export async function submitStudentAttempt(attemptId) {
  return apiFetch(`/api/student/attempts/${attemptId}/submit`, {
    method: "POST",
  });
}


// =========================================================
// SYSTEM STATUS — dipakai kartu "Informasi Sistem" di
// Dashboard (API, Database, Auth, AI/Ollama).
// =========================================================

export async function getSystemStatus() {
  return apiFetch("/api/system/status");
}
