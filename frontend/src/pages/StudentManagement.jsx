import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconEdit, IconTrash, IconCheck } from "../components/Icons";

import {
  getStudentProfiles,
  getAvailableStudentUsers,
  createStudentProfile,
  updateStudentProfile,
  deleteStudentProfile,
} from "../services/api";


const EMPTY_FORM = {
  user_id: "",
  student_code: "",
  full_name: "",
  school_name: "",
  grade: "",
  class_name: "",
};


function StudentManagement() {

  const [students, setStudents] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);


  useEffect(() => {
    loadStudents();
  }, []);


  async function loadStudents() {
    try {
      setLoading(true);
      setError("");

      const data = await getStudentProfiles();

      setStudents(data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Gagal mengambil data siswa");
    } finally {
      setLoading(false);
    }
  }


  // Dipanggil setiap kali modal "Tambah Siswa" dibuka, supaya
  // daftar user yang bisa dipilih selalu yang terbaru (belum
  // punya profil siswa).
  async function loadAvailableUsers() {
    try {
      const data = await getAvailableStudentUsers();
      setAvailableUsers(data);
    } catch (err) {
      console.error(err);
      setAvailableUsers([]);
    }
  }


  function handleChange(event) {
    const { name, value } = event.target;

    setForm({
      ...form,
      [name]: value,
    });
  }


  async function openModal() {
    setEditingStudent(null);
    setForm(EMPTY_FORM);

    setFormError("");
    setFormSuccess("");

    await loadAvailableUsers();

    setShowModal(true);
  }


  function openEditModal(student) {
    setEditingStudent(student);

    setForm({
      user_id: student.user_id,
      student_code: student.student_code,
      full_name: student.full_name,
      school_name: student.school_name || "",
      grade: student.grade || "",
      class_name: student.class_name || "",
    });

    setFormError("");
    setFormSuccess("");

    setShowModal(true);
  }


  function closeModal() {
    if (saving) {
      return;
    }

    setShowModal(false);

    setFormError("");
    setFormSuccess("");
  }


  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setFormSuccess("");

    if (!editingStudent && !form.user_id) {
      setFormError("Silakan pilih akun siswa terlebih dahulu");
      return;
    }

    try {
      setSaving(true);

      let result;

      if (editingStudent) {

        result = await updateStudentProfile(editingStudent.id, {
          student_code: form.student_code,
          full_name: form.full_name,
          school_name: form.school_name || null,
          grade: form.grade || null,
          class_name: form.class_name || null,
        });

      } else {

        result = await createStudentProfile({
          user_id: Number(form.user_id),
          student_code: form.student_code,
          full_name: form.full_name,
          school_name: form.school_name || null,
          grade: form.grade || null,
          class_name: form.class_name || null,
        });

      }

      setFormSuccess(result.message || "Data berhasil disimpan");

      await loadStudents();

      /*
       * Tunggu sebentar supaya admin sempat melihat
       * pesan berhasil sebelum modal tertutup.
       */
      setTimeout(() => {
        setShowModal(false);
        setEditingStudent(null);
        setFormSuccess("");
      }, 900);

    } catch (err) {
      console.error(err);
      setFormError(err.message || "Gagal menyimpan data siswa");
    } finally {
      setSaving(false);
    }
  }


  async function handleDelete(student) {
    const confirmed = window.confirm(
      `Hapus data siswa "${student.full_name}"? Akun login-nya tidak akan ikut terhapus.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionError("");
      setActionSuccess("");

      await deleteStudentProfile(student.id);

      setActionSuccess(`Data siswa "${student.full_name}" berhasil dihapus`);

      await loadStudents();

      setTimeout(() => {
        setActionSuccess("");
      }, 2500);

    } catch (err) {
      console.error(err);
      setActionError(err.message || "Gagal menghapus data siswa");
    }
  }


  const filteredStudents = students.filter((item) => {
    const keyword = search.toLowerCase();

    return (
      item.full_name?.toLowerCase().includes(keyword) ||
      item.student_code?.toLowerCase().includes(keyword) ||
      item.username?.toLowerCase().includes(keyword) ||
      item.school_name?.toLowerCase().includes(keyword)
    );
  });


  return (
    <div className="app-layout">

      <Sidebar />

      <main className="main-content">

        <Header />

        <div className="content">

          {/* HEADER */}

          <div className="page-header">
            <div>
              <h1>Data Siswa</h1>
              <p>Kelola profil siswa (NIS, sekolah, kelas)</p>
            </div>

            <button className="primary-button" onClick={openModal}>
              + Tambah Siswa
            </button>
          </div>


          {/* TABLE */}

          <div className="dashboard-card">

            <div className="user-toolbar">
              <input
                type="text"
                placeholder="Cari nama / NIS / username / sekolah..."
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading && (
              <div className="loading-message">Memuat data siswa...</div>
            )}

            {error && <div className="error-message">{error}</div>}

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

            {!loading && !error && (
              <div className="table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>NIS</th>
                      <th>Nama</th>
                      <th>Username</th>
                      <th>Sekolah</th>
                      <th>Kelas</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredStudents.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td><strong>{item.student_code}</strong></td>
                        <td>{item.full_name}</td>
                        <td>{item.username || "-"}</td>
                        <td>{item.school_name || "-"}</td>
                        <td>
                          {item.grade || "-"}
                          {item.class_name ? ` / ${item.class_name}` : ""}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="edit-button"
                              onClick={() => openEditModal(item)}
                            >
                              <IconEdit size={16} />
                            </button>

                            <button
                              className="delete-button"
                              onClick={() => handleDelete(item)}
                            >
                              <IconTrash size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredStudents.length === 0 && (
                  <div className="empty-message">
                    {search ? "Siswa tidak ditemukan." : "Belum ada data siswa."}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </main>


      {/* MODAL TAMBAH / EDIT SISWA */}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">

            <div className="modal-header">
              <div>
                <h2>{editingStudent ? "Edit Siswa" : "Tambah Siswa"}</h2>
                <p>
                  {editingStudent
                    ? "Perbaharui data profil siswa"
                    : "Hubungkan akun SISWA dengan data profilnya"}
                </p>
              </div>

              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>

              {/* AKUN — hanya saat tambah baru, tidak bisa diubah saat edit */}

              {!editingStudent && (
                <div className="form-group">
                  <label>Akun Login (User SISWA)</label>

                  <select
                    name="user_id"
                    value={form.user_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">-- Pilih akun siswa --</option>

                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} {user.full_name ? `(${user.full_name})` : ""}
                      </option>
                    ))}
                  </select>

                  {availableUsers.length === 0 && (
                    <small style={{ color: "#9ca3af" }}>
                      Semua user SISWA sudah punya profil, atau belum ada user
                      dengan role SISWA. Buat dulu akunnya lewat User Management.
                    </small>
                  )}
                </div>
              )}

              {/* NIS */}

              <div className="form-group">
                <label>NIS / Kode Siswa</label>
                <input
                  type="text"
                  name="student_code"
                  value={form.student_code}
                  onChange={handleChange}
                  placeholder="Masukkan NIS"
                  required
                />
              </div>

              {/* NAMA */}

              <div className="form-group">
                <label>Nama Lengkap</label>
                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="Masukkan nama lengkap"
                  required
                />
              </div>

              {/* SEKOLAH */}

              <div className="form-group">
                <label>Asal Sekolah</label>
                <input
                  type="text"
                  name="school_name"
                  value={form.school_name}
                  onChange={handleChange}
                  placeholder="Masukkan nama sekolah"
                />
              </div>

              {/* KELAS / TINGKAT */}

              <div style={{ display: "flex", gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Tingkat / Kelas</label>
                  <input
                    type="text"
                    name="grade"
                    value={form.grade}
                    onChange={handleChange}
                    placeholder="Contoh: XII"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label>Rombel</label>
                  <input
                    type="text"
                    name="class_name"
                    value={form.class_name}
                    onChange={handleChange}
                    placeholder="Contoh: IPA 1"
                  />
                </div>
              </div>

              {/* ERROR */}

              {formError && (
                <div className="form-error-message" style={{ marginBottom: "15px" }}>
                  {formError}
                </div>
              )}

              {/* SUCCESS */}

              {formSuccess && (
                <div className="success-message" style={{ marginBottom: "15px" }}>
                  <IconCheck size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                  {formSuccess}
                </div>
              )}

              {/* BUTTON */}

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>

                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Menyimpan..." : "Simpan Siswa"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}


export default StudentManagement;
