from datetime import datetime
from pydantic import BaseModel, Field 


# ==========================================
# CREATE USER
# ==========================================

class UserCreate(BaseModel):

    username: str = Field(min_length=3)

    password: str = Field(min_length=8)

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
    new_password: str = Field(min_length=8)

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


class AIProvidersResponse(BaseModel):
    active_provider: str
    providers: list[ProviderStatus] = Field(default_factory=list)


class AIProviderUpdate(BaseModel):
    provider: str = Field(min_length=1)


class ProviderConfigUpdate(BaseModel):
    # None/tidak dikirim -> field tidak diubah (biarkan nilai lama).
    # String kosong "" -> sengaja dikosongkan/dihapus.
    api_key: str | None = None
    model: str | None = None


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
