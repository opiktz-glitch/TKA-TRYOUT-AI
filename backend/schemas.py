from datetime import datetime
from pydantic import BaseModel, Field 


# ==========================================
# CREATE USER
# ==========================================

class UserCreate(BaseModel):

    username: str = Field(min_length=3)

    password: str = Field(min_length=6)

    full_name: str | None = None

    role: str = "SISWA"

    is_active: bool = True

# ==========================================
# USER RESPONSE
# ==========================================

class UserResponse(BaseModel):

    id: int

    username: str

    full_name: str | None = None

    role: str

    is_active: bool

    class Config:
        from_attributes = True


# ==========================================
# LOGIN
# ==========================================

class LoginRequest(BaseModel):

    username: str

    password: str


class LoginResponse(BaseModel):

    success: bool

    message: str

    access_token: str | None = None

    token_type: str | None = None
    

# ==========================================
# USER UPDATE
# ==========================================

class UserUpdate(BaseModel):

    username: str

    full_name: str | None = None

    role: str

    is_active: bool = True
    

# ==========================================
# PASSWORD
# ==========================================

class PasswordReset(BaseModel):
    new_password: str = Field(min_length=6)

class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class SubjectCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    is_active: bool = True


class SubjectUpdate(BaseModel):
    code: str
    name: str
    description: str | None = None
    is_active: bool = True


class SubjectResponse(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None
    is_active: bool

    class Config:
        from_attributes = True


class QuestionOptionCreate(BaseModel):
    option_code: str
    option_text: str
    is_correct: bool = False


class QuestionOptionResponse(BaseModel):
    id: int
    option_code: str
    option_text: str
    is_correct: bool

    class Config:
        from_attributes = True


class QuestionCreate(BaseModel):
    subject_id: int
    question_text: str
    question_type: str = "MULTIPLE_CHOICE"
    difficulty: str = "MEDIUM"
    explanation: str | None = None
    points: float = 1
    is_active: bool = True
    options: list[QuestionOptionCreate]


class QuestionUpdate(BaseModel):
    subject_id: int
    question_text: str
    question_type: str = "MULTIPLE_CHOICE"
    difficulty: str = "MEDIUM"
    explanation: str | None = None
    points: float = 1
    is_active: bool = True
    options: list[QuestionOptionCreate]


# ==========================================
# GENERATE SOAL DENGAN AI (OLLAMA)
# ==========================================

class AIQuestionGenerateRequest(BaseModel):
    subject_id: int
    difficulty: str = "MEDIUM"
    materi: str = Field(min_length=1)
    additional_instruction: str | None = None

    # Prompt final yang sudah diperiksa/diedit guru di langkah
    # preview. Kalau diisi, dipakai APA ADANYA untuk memanggil
    # Ollama (menggantikan build_ai_prompt otomatis). Kalau
    # kosong/null, backend tetap menyusun prompt otomatis dari
    # materi/difficulty/additional_instruction seperti biasa.
    prompt: str | None = None


class AIPromptPreviewResponse(BaseModel):
    prompt: str


class AIQuestionGenerateResponse(BaseModel):
    subject_id: int
    question_text: str
    question_type: str = "MULTIPLE_CHOICE"
    difficulty: str
    explanation: str | None = None
    points: float = 1
    options: list[QuestionOptionCreate]

    # Diisi kalau lapisan verifikasi mandiri (lihat
    # routers/questions.py -> _verify_answer_consistency)
    # mendeteksi bahwa opsi yang ditandai benar TIDAK sejalan
    # dengan pembahasannya sendiri. None kalau konsisten, atau
    # kalau verifikasi gagal dijalankan (mis. provider AI lagi
    # error) — dalam kasus gagal, generate soal TETAP lanjut
    # apa adanya, cuma tanpa jaminan tambahan ini.
    consistency_warning: str | None = None


# ==========================================
# IMPOR SOAL DARI DOKUMEN (PDF/DOCX/TXT)
#
# BEDA dari AIQuestionGenerateResponse di atas: fitur ini TIDAK
# meminta AI membuat soal baru dari materi, melainkan MEMBACA
# ULANG soal yang SUDAH ADA di dalam dokumen yang diupload guru
# (mis. file bank soal lama), lalu menstrukturkannya ke format
# yang dipakai aplikasi ini — supaya guru tidak perlu mengetik
# ulang manual satu-satu.
# ==========================================

class AIExtractedQuestion(BaseModel):
    question_text: str
    question_type: str = "MULTIPLE_CHOICE"
    difficulty: str = "MEDIUM"
    explanation: str | None = None
    points: float = 1
    options: list[QuestionOptionCreate]

    # Diisi kalau hasil ekstraksi untuk soal ini punya kejanggalan
    # ringan yang TIDAK sampai membuatnya ditolak (mis. jumlah opsi
    # kurang dari 5 di dokumen aslinya) — guru tetap bisa
    # memeriksa/melengkapi manual sebelum menyimpan, alih-alih soal
    # itu didiamkan hilang begitu saja dari hasil ekstraksi.
    warning: str | None = None


class AIDocumentChunk(BaseModel):
    chunk_text: str

    # Perkiraan jumlah soal yang "dijanjikan" potongan ini (dari
    # jumlah blok penomoran yang terdeteksi saat dokumen dipecah di
    # backend). Dikirim balik oleh frontend saat memanggil
    # /process-chunk untuk potongan yang sama, dipakai backend
    # menghitung skipped_count yang akurat.
    expected_count: int = 0


class AIDocumentPrepareResponse(BaseModel):
    subject_id: int
    subject_name: str

    # Daftar potongan teks yang HARUS diproses frontend satu per
    # satu lewat POST /questions/ai-extract-document/process-chunk
    # (satu potongan = satu panggilan AI). Endpoint yang
    # mengembalikan ini SENGAJA tidak memanggil AI sama sekali,
    # jadi cepat & tidak berisiko timeout.
    chunks: list[AIDocumentChunk]


class AIChunkProcessRequest(BaseModel):
    subject_id: int
    chunk_text: str
    expected_count: int = 0


class AIChunkProcessResponse(BaseModel):
    questions: list[AIExtractedQuestion]

    # Jumlah blok soal DI POTONGAN INI yang gagal total di-parse
    # jadi struktur valid dan karena itu tidak ikut muncul di
    # `questions`. Frontend menjumlahkan angka ini dari semua
    # potongan untuk ditampilkan ke guru.
    skipped_count: int = 0


# ==========================================
# MULTI-PROVIDER AI — GENERIK (Ollama, Gemini, dst)
#
# Dipakai halaman Admin Settings & endpoint status AI. Struktur ini
# SENGAJA dibuat generik (list provider, bukan field terpisah per
# nama) supaya menambah provider baru (mis. OpenAI, Claude API,
# DeepSeek) TIDAK perlu mengubah schema ini — cukup daftarkan
# provider barunya di backend/ai_providers.py, provider baru itu
# otomatis muncul di response ini.
# ==========================================

class ProviderStatus(BaseModel):
    provider: str  # ID unik provider, mis. "OLLAMA", "GEMINI"
    label: str
    requires_api_key: bool
    configured: bool
    online: bool
    model: str
    detail: str | None = None
    masked_key: str | None = None  # mis. "••••••••ab12" — tidak pernah key penuh
    # Alamat server (host) provider ini — HANYA relevan untuk provider
    # yang berjalan sebagai server terpisah (mis. Ollama), bukan cloud
    # API dengan endpoint tetap (mis. Gemini). Lihat configurable_base_url.
    configurable_base_url: bool = False
    base_url: str | None = None  # nilai EFEKTIF yang sedang dipakai (override admin, atau default)
    default_base_url: str | None = None  # nilai bawaan dari .env, dipakai kalau admin belum override


class AIProvidersResponse(BaseModel):
    active_provider: str
    providers: list[ProviderStatus] = Field(default_factory=list)


class AIProviderUpdate(BaseModel):
    provider: str = Field(min_length=1)


class ProviderConfigUpdate(BaseModel):
    # None/tidak dikirim -> field tidak diubah (biarkan nilai lama).
    # String kosong "" -> sengaja dikosongkan/dihapus (base_url kembali
    # ke default .env, api_key/model kembali ke belum diisi).
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None


class AIStatusResponse(BaseModel):
    active_provider: str
    online: bool
    reason: str | None = None


# ==========================================
# SECRET_KEY (Pengaturan > Keamanan)
# ==========================================

class SecretKeyStatusResponse(BaseModel):
    is_configured: bool
    masked_key: str | None = None
    updated_at: datetime | None = None
    changed_by: str | None = None


class SecretKeyUpdateRequest(BaseModel):
    new_secret_key: str = Field(min_length=1)


class SecretKeyActionResponse(BaseModel):
    success: bool
    message: str


# ==========================================
# BACKUP DATABASE (Pengaturan > Backup)
# ==========================================

class BackupFileResponse(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime


class BackupListResponse(BaseModel):
    backups: list[BackupFileResponse] = Field(default_factory=list)
    retention_days: int


class BackupActionResponse(BaseModel):
    success: bool
    message: str
    backup: BackupFileResponse | None = None
    removed_old_count: int = 0


class RestoreActionResponse(BaseModel):
    success: bool
    message: str
    restored_from: str
    # Nama file backup pengaman yang otomatis dibuat dari kondisi
    # SEBELUM restore ini dijalankan — ditampilkan ke admin supaya
    # tahu ke mana harus "kembali" kalau restore ternyata salah.
    safety_backup_filename: str


class QuestionResponse(BaseModel):
    id: int
    subject_id: int
    question_text: str
    question_type: str
    difficulty: str
    explanation: str | None = None
    points: float
    is_active: bool
    created_by: int | None = None
    options: list[QuestionOptionResponse] = Field(
        default_factory=list
    )

    class Config:
        from_attributes = True


# ==========================================
# TRYOUT
# ==========================================


class TryoutQuestionCreate(BaseModel):

    question_id: int

    question_number: int

    points: float = 1


class TryoutCreate(BaseModel):

    title: str

    description: str | None = None

    subject_id: int

    grade: str | None = None

    duration_minutes: int = 60

    max_score: float = 100

    difficulty: str | None = None

    is_active: bool = True

    questions: list[TryoutQuestionCreate] = []


class TryoutUpdate(BaseModel):

    title: str

    description: str | None = None

    subject_id: int

    grade: str | None = None

    duration_minutes: int = 60

    max_score: float = 100

    difficulty: str | None = None

    is_active: bool = True

    questions: list[TryoutQuestionCreate] = []


class TryoutQuestionResponse(BaseModel):

    id: int

    question_id: int

    question_number: int

    points: float

    class Config:
        from_attributes = True


class TryoutResponse(BaseModel):

    id: int

    title: str

    description: str | None = None

    subject_id: int

    grade: str | None = None

    duration_minutes: int

    total_questions: int

    max_score: float

    difficulty: str | None = None

    created_by: int

    is_active: bool

    questions: list[TryoutQuestionResponse] = Field(
        default_factory=list
    )

    class Config:
        from_attributes = True
# ==========================================
# STUDENT (t_student)
# ==========================================

class StudentCreate(BaseModel):

    user_id: int

    student_code: str = Field(min_length=1, max_length=50)

    full_name: str = Field(min_length=1, max_length=150)

    school_name: str | None = None

    grade: str | None = None

    class_name: str | None = None


class StudentUpdate(BaseModel):

    student_code: str = Field(min_length=1, max_length=50)

    full_name: str = Field(min_length=1, max_length=150)

    school_name: str | None = None

    grade: str | None = None

    class_name: str | None = None


# ==========================================
# TEACHER (t_teacher)
# ==========================================

class TeacherCreate(BaseModel):

    user_id: int

    teacher_code: str = Field(min_length=1, max_length=50)

    full_name: str = Field(min_length=1, max_length=150)

    school_name: str | None = None


class TeacherUpdate(BaseModel):

    teacher_code: str = Field(min_length=1, max_length=50)

    full_name: str = Field(min_length=1, max_length=150)

    school_name: str | None = None


# ==========================================
# STUDENT SELF-SERVICE PROFILE (t_student)
# ==========================================

class StudentProfileUpdate(BaseModel):

    full_name: str = Field(min_length=1, max_length=150)

    school_name: str | None = None

    grade: str | None = None

    class_name: str | None = None


# ==========================================
# ACCOUNT SELF-SERVICE PROFILE (t_user)
#
# Untuk update nama tampilan akun sendiri
# (dipakai semua role, mis. halaman Pengaturan).
# ==========================================

class MyProfileUpdate(BaseModel):

    full_name: str = Field(min_length=1, max_length=150)


# ==========================================
# JARINGAN LOKAL (Pengaturan > Jaringan)
#
# Dipakai untuk menampilkan IP address laptop admin di jaringan
# WiFi/LAN yang sedang aktif, supaya laptop/HP lain di jaringan
# yang sama bisa mengakses aplikasi tanpa admin perlu mencari
# tahu IP-nya manual lewat Command Prompt (ipconfig).
# ==========================================

class NetworkAddress(BaseModel):

    interface: str

    ip: str

    frontend_url: str

    backend_url: str


class NetworkInfoResponse(BaseModel):

    hostname: str

    frontend_port: int

    backend_port: int

    addresses: list[NetworkAddress]

    backend_online: bool = True

    # "development" (dijalankan lewat run.py, localhost saja) atau
    # "server" (dijalankan lewat run_server.py, terbuka ke WiFi/LAN).
    mode: str = "development"
