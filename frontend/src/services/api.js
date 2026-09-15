// =====================================================
// API BASE URL — AUTO-DETECT UNTUK AKSES LEWAT WIFI/LAN
//
// Kalau VITE_API_URL diisi manual di .env, itu yang dipakai
// (prioritas tertinggi, dipakai saat deploy ke domain asli).
//
// Kalau TIDAK diisi, base URL diturunkan dari alamat yang
// dipakai browser membuka halaman ini (window.location.hostname):
//   - Dibuka lewat http://localhost:5173      -> API di localhost:8000
//   - Dibuka lewat http://192.168.1.5:5173    -> API di 192.168.1.5:8000
//
// Ini penting untuk akses dari laptop LAIN di WiFi yang sama:
// kalau di-hardcode ke "localhost:8000", laptop lain akan mencoba
// menghubungi backend di LAPTOP MEREKA SENDIRI (yang tidak ada),
// bukan ke laptop admin. Dengan window.location.hostname, request
// otomatis diarahkan ke IP yang sama dengan yang dipakai membuka
// frontend-nya, jadi admin tidak perlu mengubah kode/.env setiap
// kali pindah jaringan WiFi.
function resolveApiBaseUrl() {

  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  const { protocol, hostname } = window.location;

  return `${protocol}//${hostname}:8000`;
}

const API_BASE_URL = resolveApiBaseUrl();


// =====================================================
// EXTRACT ERROR MESSAGE
//
// FastAPI/backend membalas error dalam beberapa bentuk:
// - HTTPException manual    -> { detail: "Pesan error" }
// - Validasi Pydantic (422) -> { detail: "Pesan A; Pesan B" }
//   Sejak backend/main.py punya validation_exception_handler
//   (translator error Pydantic ke Bahasa Indonesia), FastAPI
//   TIDAK LAGI mengirim detail berbentuk array untuk error
//   validasi — sudah digabung jadi satu string ("; " sebagai
//   pemisah bila lebih dari satu field bermasalah) dan sudah
//   diterjemahkan, jadi cabang string di bawah ini yang dipakai.
//
// Cabang Array.isArray tetap dipertahankan sebagai fallback
// jaga-jaga, kalau-kalau ada endpoint lain (di luar
// validation_exception_handler) yang suatu saat mengirim
// `detail` berbentuk array mentah ala FastAPI default —
// supaya tidak muncul pesan rusak seperti "[object Object]".
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

  // Upload file (mis. impor soal dari dokumen) mengirim FormData,
  // BUKAN JSON — kalau Content-Type dipaksa "application/json" di
  // sini, browser tidak akan menambahkan boundary multipart yang
  // benar dan request akan gagal di sisi backend. Untuk FormData,
  // Content-Type SENGAJA tidak diisi sama sekali supaya browser
  // yang menentukan sendiri (termasuk boundary-nya).
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const headers = {
    ...(rest.headers || {}),
  };

  if (body !== undefined && !isFormData) {
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
    body:
      body === undefined
        ? undefined
        : (isFormData ? body : JSON.stringify(body)),
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


// =====================================================
// IMPOR SOAL DARI DOKUMEN (PDF/DOCX/TXT) — 2 LANGKAH
//
// BEDA dari generateAIQuestion di atas: fitur ini TIDAK membuat
// soal baru, hanya membaca ulang soal yang SUDAH ADA di file yang
// diupload guru. Dipecah jadi 2 fungsi (bukan 1 seperti
// sebelumnya) SUPAYA kalau AI gagal/lambat di tengah dokumen
// panjang, potongan yang SUDAH selesai diproses tidak ikut hilang
// — pemanggil (QuestionManagement.jsx) memanggil
// prepareDocumentExtraction() SEKALI, lalu processDocumentChunk()
// berulang per potongan, menambahkan hasilnya ke layar satu per
// satu begitu tiap potongan selesai.
// =====================================================

// LANGKAH 1: upload file, dapat balik daftar potongan teks. Cepat
// (tidak memanggil AI), jadi timeout-nya dibuat wajar saja (2 menit
// — cukup longgar untuk dokumen besar yang perlu waktu di-parsing
// pypdf/python-docx).
export async function prepareDocumentExtraction(subjectId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    return await apiFetch(
      `/api/questions/ai-extract-document/prepare?subject_id=${encodeURIComponent(subjectId)}`,
      {
        method: "POST",
        body: formData,
        signal: controller.signal,
      }
    );
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        "Terlalu lama membaca dokumen. Coba file yang lebih kecil."
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// LANGKAH 2: proses SATU potongan teks (dari hasil langkah 1) lewat
// AI. Dipanggil berulang oleh pemanggil, satu per satu, BUKAN
// Promise.all — supaya progress bisa ditampilkan per potongan dan
// tidak membanjiri provider AI dengan banyak request bersamaan.
// Timeout di sini cukup untuk SATU potongan saja (jauh lebih kecil
// dari sebelumnya yang harus menampung SEMUA potongan sekaligus).
export async function processDocumentChunk(subjectId, chunkText, expectedCount) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 280000);

  try {
    return await apiFetch(
      "/api/questions/ai-extract-document/process-chunk",
      {
        method: "POST",
        body: {
          subject_id: subjectId,
          chunk_text: chunkText,
          expected_count: expectedCount,
        },
        signal: controller.signal,
      }
    );
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        "AI terlalu lama memproses potongan ini (lebih dari ~4.5 menit)."
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}


// =====================================================
// MULTI-PROVIDER AI — GENERIK (Ollama, Gemini, dst)
//
// Semua fungsi di bawah ini SENGAJA tidak menyebut nama provider
// tertentu di endpoint-nya (kecuali sebagai parameter) — backend
// membaca daftar provider dari registry (backend/ai_providers.py),
// jadi kalau admin/dev menambah provider AI baru di backend, UI
// Pengaturan otomatis bisa mengaturnya lewat fungsi generik yang
// sama ini, tanpa perlu fungsi baru di sini.
//
// getAIStatus() dipakai untuk cek cepat SEBELUM membuka modal
// "Tambah Soal AI" — kalau tidak ada satupun provider yang online,
// error langsung ditampilkan saat tombol diklik, tanpa perlu isi
// form dulu.
// =====================================================

// -> { active_provider: "OLLAMA", providers: [ { provider, label,
//      requires_api_key, configured, online, model, detail,
//      masked_key }, ... ] }
export async function getAIProviders() {
  return apiFetch("/api/settings/ai-providers");
}

export async function updateActiveProvider(provider) {
  return apiFetch("/api/settings/ai-provider", {
    method: "PUT",
    body: { provider },
  });
}

// Simpan/ganti API key & model milik SATU provider (bekerja untuk
// provider mana pun, bukan cuma Gemini — cukup kirim providerKey
// yang sesuai, mis. "GEMINI", "OLLAMA", atau provider baru lainnya).
export async function updateProviderConfig(providerKey, { apiKey, model, baseUrl } = {}) {
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

  // baseUrl: "" dikirim eksplisit -> backend reset ke alamat default
  // (mesin sendiri). undefined -> tidak dikirim -> tidak diubah.
  if (baseUrl !== undefined) {
    body.base_url = baseUrl;
  }

  return apiFetch(`/api/settings/providers/${providerKey}/config`, {
    method: "PUT",
    body,
  });
}

export async function clearProviderConfig(providerKey) {
  return apiFetch(`/api/settings/providers/${providerKey}/config`, {
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

export async function getTryoutReview(tryoutId) {
  return apiFetch(`/api/tryouts/${tryoutId}/review`);
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


// =========================================================
// PENGATURAN > JARINGAN — IP untuk akses dari laptop lain
// lewat WiFi/LAN yang sama.
// =========================================================

export async function getNetworkInfo() {
  return apiFetch("/api/system/network-info");
}


// =========================================================
// PENGATURAN > KEAMANAN — SECRET_KEY (JWT)
//
// SECRET_KEY dipakai untuk menandatangani token login SEMUA
// user. Menyimpan/merotasinya membuat SEMUA sesi login yang
// sedang aktif (termasuk admin yang melakukan aksi ini) langsung
// tidak valid — halaman AdminSettings.jsx bertanggung jawab
// logout otomatis begitu menerima force_logout: true di response.
// =========================================================

export async function getSecretKeyStatus() {
  return apiFetch("/api/settings/secret-key");
}

export async function updateSecretKey(newSecretKey) {
  return apiFetch("/api/settings/secret-key", {
    method: "PUT",
    body: { new_secret_key: newSecretKey },
  });
}

export async function rotateSecretKey() {
  return apiFetch("/api/settings/secret-key/rotate", {
    method: "POST",
  });
}


// =========================================================
// PENGATURAN > BACKUP — Backup Database SQLite
//
// getBackups() dipakai menampilkan daftar backup yang sudah ada.
// createBackupNow() memicu backup baru di luar jadwal otomatis
// (service "backup" di Docker sudah jalan sendiri tiap 24 jam).
//
// downloadBackup() SENGAJA tidak memakai apiFetch() biasa — respons
// endpoint ini berupa file biner (.db), bukan JSON, jadi di-fetch
// manual sebagai blob lalu dipicu download lewat elemen <a>
// sementara (browser tidak mengizinkan window.location langsung ke
// URL yang butuh header Authorization).
// =========================================================

export async function getBackups() {
  return apiFetch("/api/settings/backups");
}

export async function createBackupNow() {
  return apiFetch("/api/settings/backups", {
    method: "POST",
  });
}

export async function downloadBackup(filename) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE_URL}/api/settings/backups/${encodeURIComponent(filename)}/download`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(data) || "Gagal mengunduh backup");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}
