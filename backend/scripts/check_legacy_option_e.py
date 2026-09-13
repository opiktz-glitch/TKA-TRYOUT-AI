"""
Script pengecekan & pembersihan opsi "E" pada soal-soal LAMA —
TKA Tryout.

LATAR BELAKANG
--------------
Sistem sebelumnya mewajibkan setiap soal pilihan ganda punya TEPAT
5 opsi (A, B, C, D, E). Aturan itu sudah diubah jadi 4 opsi (A, B,
C, D) — lihat ALLOWED_OPTIONS di backend/routers/questions.py.

Perubahan itu HANYA memengaruhi validasi saat soal dibuat/diedit
lewat form atau AI generate baru. Soal-soal LAMA yang sudah
tersimpan dengan 5 opsi TIDAK otomatis berubah di database, dan
tetap tampil apa adanya ke siswa saat mengerjakan tryout. Baru jadi
masalah kalau Guru membuka soal lama itu untuk DIEDIT — form edit
sekarang cuma punya 4 slot (A-D), jadi opsi E bisa hilang tanpa
sengaja saat form itu disimpan ulang.

Script ini membantu menemukan soal-soal itu LEBIH DULU, dan
(opsional) membereskannya secara aman sebelum ada kejutan.

CARA KERJA
----------
Untuk setiap soal yang masih punya opsi dengan kode "E":

1. Kalau opsi E BUKAN kunci jawaban (is_correct=False) DAN belum
   pernah dipilih siswa di jawaban manapun (t_answer.selected_option
   != "E" untuk soal itu) -> AMAN dihapus otomatis lewat --fix.

2. Kalau opsi E ADALAH kunci jawaban (is_correct=True) -> TIDAK
   disentuh otomatis. Menghapusnya begitu saja akan membuat soal
   itu kehilangan kunci jawaban sama sekali. Ditandai sebagai
   "PERLU TINDAKAN MANUAL".

3. Kalau opsi E PERNAH dipilih siswa (ada baris t_answer dengan
   selected_option="E" untuk soal itu) -> TIDAK dihapus otomatis
   walau bukan kunci jawaban, supaya riwayat jawaban siswa tetap
   bisa ditelusuri apa adanya. Ditandai sebagai "PERLU TINDAKAN
   MANUAL" juga, tapi lebih ke catatan/informasi saja (nilai siswa
   yang sudah dihitung sebelumnya TIDAK berubah walau opsi E
   nantinya dihapus, karena is_correct & points_earned di
   t_answer sudah tersimpan permanen sejak saat dijawab).

Menghapus opsi E TIDAK memerlukan migrasi t_answer apa pun karena
t_answer.selected_option cuma kolom teks biasa (bukan foreign key
ke t_question_option) — lihat Database_Project_TKA_Tryout.txt.

CARA PAKAI
----------
Dari folder backend/, lihat dulu apa saja yang bermasalah (TIDAK
mengubah apa pun di database):

    python scripts/check_legacy_option_e.py

Kalau sudah yakin, bereskan yang AMAN dihapus otomatis (soal lain
yang butuh keputusan manual tidak akan disentuh):

    python scripts/check_legacy_option_e.py --fix

SELALU backup database dulu sebelum menjalankan --fix (lihat
scripts/backup_db.py atau tombol "Backup Sekarang" di halaman
Pengaturan Admin).
"""

import sys
from pathlib import Path

# Supaya "import database", "import models" (backend/database.py,
# backend/models.py) berhasil walau script ini dipanggil dari
# folder mana pun (bukan cuma saat cwd = folder backend/).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse  # noqa: E402

from database import SessionLocal  # noqa: E402
from models import Answer, Question, QuestionOption  # noqa: E402


def find_questions_with_option_e(db):
    """
    Mengembalikan list QuestionOption dengan option_code="E",
    beserta objek Question induknya (join manual, bukan pakai
    relationship, supaya script ini tidak bergantung pada
    relationship yang mungkin belum/tidak didefinisikan di
    models.py).
    """

    return (
        db.query(QuestionOption)
        .filter(QuestionOption.option_code == "E")
        .all()
    )


def student_ever_answered_e(db, question_id: int) -> bool:

    return (
        db.query(Answer)
        .filter(
            Answer.question_id == question_id,
            Answer.selected_option == "E",
        )
        .first()
        is not None
    )


def main():

    parser = argparse.ArgumentParser(
        description=(
            "Cek (dan opsional bereskan) soal-soal lama yang masih "
            "punya opsi jawaban E."
        )
    )

    parser.add_argument(
        "--fix",
        action="store_true",
        help=(
            "Hapus opsi E yang AMAN dihapus (bukan kunci jawaban & "
            "tidak pernah dipilih siswa). Tanpa flag ini, script "
            "hanya melaporkan (dry-run), tidak mengubah database."
        ),
    )

    args = parser.parse_args()

    db = SessionLocal()

    try:

        option_e_rows = find_questions_with_option_e(db)

        if not option_e_rows:

            print(
                "Tidak ditemukan soal dengan opsi E. "
                "Database sudah bersih, tidak ada yang perlu dilakukan."
            )

            return

        print(
            f"Ditemukan {len(option_e_rows)} soal dengan opsi E.\n"
        )

        safe_to_delete = []
        needs_manual_review = []

        for option in option_e_rows:

            question = (
                db.query(Question)
                .filter(Question.id == option.question_id)
                .first()
            )

            question_label = (
                f"ID {question.id}: "
                f"{question.question_text[:60].strip()}..."
                if question
                else f"ID soal {option.question_id} (soal tidak ditemukan?)"
            )

            already_answered_e = student_ever_answered_e(
                db, option.question_id
            )

            if option.is_correct:

                needs_manual_review.append(
                    (
                        question_label,
                        "Opsi E adalah KUNCI JAWABAN — kalau dihapus, "
                        "soal ini kehilangan kunci jawaban sama sekali. "
                        "Tentukan dulu kunci jawaban baru di antara "
                        "A-D sebelum menghapus opsi E, atau biarkan "
                        "soal ini tetap 5 opsi.",
                    )
                )

            elif already_answered_e:

                needs_manual_review.append(
                    (
                        question_label,
                        "Opsi E BUKAN kunci jawaban, tapi sudah pernah "
                        "dipilih oleh siswa. Aman dihapus dari sisi "
                        "kunci jawaban (nilai siswa yang sudah "
                        "dihitung tidak berubah), tapi tinjau dulu "
                        "kalau ingin riwayat jawaban tetap utuh.",
                    )
                )

            else:

                safe_to_delete.append((question_label, option))

        if safe_to_delete:

            print(
                f"AMAN dihapus otomatis ({len(safe_to_delete)} opsi):"
            )

            for label, _ in safe_to_delete:
                print(f"  - {label}")

            print()

        if needs_manual_review:

            print(
                f"PERLU TINDAKAN MANUAL ({len(needs_manual_review)} opsi):"
            )

            for label, reason in needs_manual_review:
                print(f"  - {label}")
                print(f"    -> {reason}")

            print()

        if not args.fix:

            print(
                "Mode cek saja (dry-run) — tidak ada perubahan "
                "disimpan ke database."
            )

            if safe_to_delete:

                print(
                    "Jalankan ulang dengan --fix untuk menghapus "
                    f"{len(safe_to_delete)} opsi E yang aman di atas."
                )

            return

        if not safe_to_delete:

            print(
                "Tidak ada opsi E yang aman dihapus otomatis. "
                "Semua yang ditemukan butuh peninjauan manual "
                "(lihat daftar di atas)."
            )

            return

        for _, option in safe_to_delete:
            db.delete(option)

        db.commit()

        print(
            f"Selesai. {len(safe_to_delete)} opsi E berhasil dihapus."
        )

    finally:

        db.close()


if __name__ == "__main__":
    main()
