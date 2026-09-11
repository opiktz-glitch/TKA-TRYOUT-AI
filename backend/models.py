from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Float,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


# =========================================================
# USER
# =========================================================

class User(Base):
    __tablename__ = "t_user"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)

    role = Column(
        String,
        nullable=False,
        default="SISWA"
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


# =========================================================
# STUDENT
# =========================================================

class Student(Base):
    __tablename__ = "t_student"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("t_user.id"),
        unique=True,
        nullable=False
    )

    student_code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    full_name = Column(
        String(150),
        nullable=False
    )

    school_name = Column(
        String(200),
        nullable=True
    )

    grade = Column(
        String(20),
        nullable=True
    )

    class_name = Column(
        String(50),
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


# =========================================================
# TEACHER
# =========================================================

class Teacher(Base):
    __tablename__ = "t_teacher"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("t_user.id"),
        unique=True,
        nullable=False
    )

    teacher_code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    full_name = Column(
        String(150),
        nullable=False
    )

    school_name = Column(
        String(200),
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


# =========================================================
# SUBJECT
# =========================================================

class Subject(Base):
    __tablename__ = "t_subject"

    id = Column(Integer, primary_key=True, index=True)

    code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    name = Column(
        String(100),
        nullable=False
    )

    description = Column(
        String(500),
        nullable=True
    )

    is_active = Column(
        Boolean,
        default=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


# =========================================================
# QUESTION
# =========================================================

class Question(Base):
    __tablename__ = "t_question"

    id = Column(Integer, primary_key=True, index=True)

    subject_id = Column(
        Integer,
        ForeignKey("t_subject.id"),
        nullable=False
    )

    question_text = Column(
        Text,
        nullable=False
    )

    question_type = Column(
        String(30),
        nullable=False,
        default="MULTIPLE_CHOICE"
    )

    difficulty = Column(
        String(20),
        nullable=False,
        default="MEDIUM"
    )

    # Ada di database versi terbaru
    correct_answer = Column(
        String(50),
        nullable=True
    )

    explanation = Column(
        Text,
        nullable=True
    )

    points = Column(
        Float,
        default=1
    )

    is_active = Column(
        Boolean,
        default=True
    )

    created_by = Column(
        Integer,
        ForeignKey("t_user.id"),
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    options = relationship(
        "QuestionOption",
        cascade="all, delete-orphan",
        order_by="QuestionOption.option_code"
    )


# =========================================================
# QUESTION OPTION
# =========================================================

class QuestionOption(Base):
    __tablename__ = "t_question_option"

    id = Column(Integer, primary_key=True, index=True)

    question_id = Column(
        Integer,
        ForeignKey("t_question.id"),
        nullable=False
    )

    option_code = Column(
        String(5),
        nullable=False
    )

    option_text = Column(
        Text,
        nullable=False
    )

    is_correct = Column(
        Boolean,
        default=False
    )

    __table_args__ = (
        UniqueConstraint(
            "question_id",
            "option_code",
            name="uq_question_option"
        ),
    )


# =========================================================
# TRYOUT
# =========================================================

class Tryout(Base):
    __tablename__ = "t_tryout"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(
        String(200),
        nullable=False
    )

    description = Column(
        Text,
        nullable=True
    )

    subject_id = Column(
        Integer,
        ForeignKey("t_subject.id"),
        nullable=False
    )

    grade = Column(
        String(20),
        nullable=True
    )

    duration_minutes = Column(
        Integer,
        nullable=False
    )

    total_questions = Column(
        Integer,
        default=0
    )

    max_score = Column(
        Float,
        default=100
    )

    difficulty = Column(
        String(20),
        nullable=True
    )

    created_by = Column(
        Integer,
        ForeignKey("t_user.id"),
        nullable=False
    )

    is_active = Column(
        Boolean,
        default=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


# =========================================================
# TRYOUT QUESTION
# =========================================================

class TryoutQuestion(Base):
    __tablename__ = "t_tryout_question"

    id = Column(Integer, primary_key=True, index=True)

    tryout_id = Column(
        Integer,
        ForeignKey("t_tryout.id"),
        nullable=False
    )

    question_id = Column(
        Integer,
        ForeignKey("t_question.id"),
        nullable=False
    )

    question_number = Column(
        Integer,
        nullable=False
    )

    points = Column(
        Float,
        default=1
    )

    __table_args__ = (
        UniqueConstraint(
            "tryout_id",
            "question_id",
            name="uq_tryout_question"
        ),

        UniqueConstraint(
            "tryout_id",
            "question_number",
            name="uq_tryout_question_number"
        ),
    )


# =========================================================
# ATTEMPT
# =========================================================

class Attempt(Base):
    __tablename__ = "t_attempt"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(
        Integer,
        ForeignKey("t_student.id"),
        nullable=False
    )

    tryout_id = Column(
        Integer,
        ForeignKey("t_tryout.id"),
        nullable=False
    )

    started_at = Column(
        DateTime,
        nullable=False
    )

    finished_at = Column(
        DateTime,
        nullable=True
    )

    status = Column(
        String(20),
        default="IN_PROGRESS"
    )

    score = Column(
        Float,
        nullable=True
    )

    correct_count = Column(
        Integer,
        default=0
    )

    wrong_count = Column(
        Integer,
        default=0
    )

    unanswered_count = Column(
        Integer,
        default=0
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


# =========================================================
# ANSWER
# =========================================================

class Answer(Base):
    __tablename__ = "t_answer"

    id = Column(Integer, primary_key=True, index=True)

    attempt_id = Column(
        Integer,
        ForeignKey("t_attempt.id"),
        nullable=False
    )

    question_id = Column(
        Integer,
        ForeignKey("t_question.id"),
        nullable=False
    )

    selected_option = Column(
        String(50),
        nullable=True
    )

    is_correct = Column(
        Boolean,
        nullable=True
    )

    points_earned = Column(
        Float,
        nullable=True
    )

    answered_at = Column(
        DateTime,
        nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "attempt_id",
            "question_id",
            name="uq_attempt_question_answer"
        ),
    )


# =========================================================
# RESULT
# =========================================================

class Result(Base):
    __tablename__ = "t_result"

    id = Column(Integer, primary_key=True, index=True)

    attempt_id = Column(
        Integer,
        ForeignKey("t_attempt.id"),
        unique=True,
        nullable=False
    )

    total_questions = Column(
        Integer,
        nullable=False
    )

    correct_count = Column(
        Integer,
        default=0
    )

    wrong_count = Column(
        Integer,
        default=0
    )

    unanswered_count = Column(
        Integer,
        default=0
    )

    score = Column(
        Float,
        default=0
    )

    percentage = Column(
        Float,
        default=0
    )

    passed = Column(
        Boolean,
        default=False
    )

    completed_at = Column(
        DateTime,
        nullable=True
    )


# =========================================================
# APP SETTING
#
# Tabel key-value generik untuk pengaturan yang bisa diubah
# admin lewat aplikasi (mis. model Ollama yang aktif), tanpa
# perlu edit file .env atau restart server. Kalau sebuah key
# tidak ada barisnya di sini, backend fallback ke default dari
# environment variable (lihat config.py).
# =========================================================

class AppSetting(Base):
    __tablename__ = "t_app_setting"

    key = Column(String, primary_key=True)

    value = Column(String, nullable=False)

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )