import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconEdit, IconTrash, IconCheck } from "../components/Icons";

import {
  getTeacherProfiles,
  getAvailableTeacherUsers,
  createTeacherProfile,
  updateTeacherProfile,
  deleteTeacherProfile,
} from "../services/api";


const EMPTY_FORM = {
  user_id: "",
  teacher_code: "",
  full_name: "",
  school_name: "",
};


function TeacherManagement() {

  const [teachers, setTeachers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);


  useEffect(() => {
    loadTeachers();
  }, []);


  async function loadTeachers() {
    try {
      setLoading(true);
      setError("");

      const data = await getTeacherProfiles();

      setTeachers(data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Gagal mengambil data guru");
    } finally {
      setLoading(false);
    }
  }


  // Dipanggil setiap kali modal "Tambah Guru" dibuka, supaya
  // daftar user yang bisa dipilih selalu yang terbaru (belum
  // punya profil guru).
  async function loadAvailableUsers() {
    try {
      const data = await getAvailableTeacherUsers();
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
    setEditingTeacher(null);
    setForm(EMPTY_FORM);

    setFormError("");
    setFormSuccess("");

    await loadAvailableUsers();

    setShowModal(true);
  }


  function openEditModal(teacher) {
    setEditingTeacher(teacher);

    setForm({
      user_id: teacher.user_id,
      teacher_code: teacher.teacher_code,
      full_name: teacher.full_name,
      school_name: teacher.school_name || "",
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

    if (!editingTeacher && !form.user_id) {
      setFormError("Silakan pilih akun guru terlebih dahulu");
      return;
    }

    try {
      setSaving(true);

      let result;

      if (editingTeacher) {

        result = await updateTeacherProfile(editingTeacher.id, {
          teacher_code: form.teacher_code,
          full_name: form.full_name,
          school_name: form.school_name || null,
        });

      } else {

        result = await createTeacherProfile({
          user_id: Number(form.user_id),
          teacher_code: form.teacher_code,
          full_name: form.full_name,
          school_name: form.school_name || null,
        });

      }

      setFormSuccess(result.message || "Data berhasil disimpan");

      await loadTeachers();

      /*
       * Tunggu sebentar supaya admin sempat melihat
       * pesan berhasil sebelum modal tertutup.
       */
      setTimeout(() => {
        setShowModal(false);
        setEditingTeacher(null);
        setFormSuccess("");
      }, 900);

    } catch (err) {
      console.error(err);
      setFormError(err.message || "Gagal menyimpan data guru");
    } finally {
      setSaving(false);
    }
  }


  async function handleDelete(teacher) {
    const confirmed = window.confirm(
      `Hapus data guru "${teacher.full_name}"? Akun login-nya tidak akan ikut terhapus.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionError("");
      setActionSuccess("");

      await deleteTeacherProfile(teacher.id);

      setActionSuccess(`Data guru "${teacher.full_name}" berhasil dihapus`);

      await loadTeachers();

      setTimeout(() => {
        setActionSuccess("");
      }, 2500);

    } catch (err) {
      console.error(err);
      setActionError(err.message || "Gagal menghapus data guru");
    }
  }


  const filteredTeachers = teachers.filter((item) => {
    const keyword = search.toLowerCase();

    return (
      item.full_name?.toLowerCase().includes(keyword) ||
      item.teacher_code?.toLowerCase().includes(keyword) ||
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
              <h1>Data Guru</h1>
              <p>Kelola profil guru (NIP, sekolah)</p>
            </div>

            <button className="primary-button" onClick={openModal}>
              + Tambah Guru
            </button>
          </div>


          {/* TABLE */}

          <div className="dashboard-card">

            <div className="user-toolbar">
              <input
                type="text"
                placeholder="Cari nama / NIP / username / sekolah..."
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading && (
              <div className="loading-message">Memuat data guru...</div>
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
                      <th>NIP</th>
                      <th>Nama</th>
                      <th>Username</th>
                      <th>Sekolah</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredTeachers.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id}</td>
                        <td><strong>{item.teacher_code}</strong></td>
                        <td>{item.full_name}</td>
                        <td>{item.username || "-"}</td>
                        <td>{item.school_name || "-"}</td>
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

                {filteredTeachers.length === 0 && (
                  <div className="empty-message">
                    {search ? "Guru tidak ditemukan." : "Belum ada data guru."}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </main>


      {/* MODAL TAMBAH / EDIT GURU */}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">

            <div className="modal-header">
              <div>
                <h2>{editingTeacher ? "Edit Guru" : "Tambah Guru"}</h2>
                <p>
                  {editingTeacher
                    ? "Perbaharui data profil guru"
                    : "Hubungkan akun GURU dengan data profilnya"}
                </p>
              </div>

              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>

              {/* AKUN — hanya saat tambah baru, tidak bisa diubah saat edit */}

              {!editingTeacher && (
                <div className="form-group">
                  <label>Akun Login (User GURU)</label>

                  <select
                    name="user_id"
                    value={form.user_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">-- Pilih akun guru --</option>

                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} {user.full_name ? `(${user.full_name})` : ""}
                      </option>
                    ))}
                  </select>

                  {availableUsers.length === 0 && (
                    <small style={{ color: "#9ca3af" }}>
                      Semua user GURU sudah punya profil, atau belum ada user
                      dengan role GURU. Buat dulu akunnya lewat User Management.
                    </small>
                  )}
                </div>
              )}

              {/* NIP */}

              <div className="form-group">
                <label>NIP / Kode Guru</label>
                <input
                  type="text"
                  name="teacher_code"
                  value={form.teacher_code}
                  onChange={handleChange}
                  placeholder="Masukkan NIP"
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
                  {saving ? "Menyimpan..." : "Simpan Guru"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}


export default TeacherManagement;
