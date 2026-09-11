import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconEdit, IconTrash, IconCheck } from "../components/Icons";
import {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject as deleteSubjectApi,
} from "../services/api";


function SubjectManagement() {

  const [subjects, setSubjects] = useState([]);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState("");

  const [actionError, setActionError] = useState("");

  const [actionSuccess, setActionSuccess] = useState("");

  const [showModal, setShowModal] = useState(false);

  const [editingSubject, setEditingSubject] = useState(null);

  const [search, setSearch] = useState("");

  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState("");

  const [formSuccess, setFormSuccess] = useState("");

  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    is_active: true
  });


  useEffect(() => {
    loadSubjects();
  }, []);


  async function loadSubjects() {

    try {

      setLoading(true);
      setLoadError("");

      const data = await getSubjects();

      setSubjects(data);

    } catch (err) {

      console.error(err);

      setLoadError(
        err.message ||
        "Gagal mengambil mata pelajaran"
      );

    } finally {

      setLoading(false);

    }
  }


  function handleChange(event) {

    const { name, value, type, checked } = event.target;

    setForm({
      ...form,
      [name]: type === "checkbox"
        ? checked
        : value
    });

  }


  function openModal() {

    setEditingSubject(null);

    setForm({
      code: "",
      name: "",
      description: "",
      is_active: true
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
    setEditingSubject(null);
    setFormError("");
    setFormSuccess("");

  }


  function openEditModal(subject) {

    setEditingSubject(subject);

    setForm({
      code: subject.code,
      name: subject.name,
      description: subject.description || "",
      is_active: subject.is_active
    });

    setFormError("");
    setFormSuccess("");

    setShowModal(true);
  }


  async function handleSubmit(event) {

    event.preventDefault();

    setFormError("");
    setFormSuccess("");

    if (!form.code.trim()) {
      setFormError("Kode mata pelajaran wajib diisi");
      return;
    }

    if (!form.name.trim()) {
      setFormError("Nama mata pelajaran wajib diisi");
      return;
    }

    try {

      setSaving(true);

      const data = editingSubject
        ? await updateSubject(editingSubject.id, form)
        : await createSubject(form);

      setFormSuccess(
        data.message ||
        (editingSubject
          ? "Mata pelajaran berhasil diperbarui"
          : "Mata pelajaran berhasil ditambahkan")
      );

      await loadSubjects();

      /*
       * Tunggu sebentar supaya admin sempat melihat
       * pesan berhasil sebelum modal tertutup.
       */
      setTimeout(() => {
        setShowModal(false);
        setEditingSubject(null);
        setFormSuccess("");
      }, 900);

    } catch (err) {

      console.error(err);

      setFormError(
        err.message ||
        "Gagal menyimpan mata pelajaran"
      );

    } finally {

      setSaving(false);

    }
  }


  async function handleDelete(subject) {

    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus mata pelajaran "${subject.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {

      setActionError("");
      setActionSuccess("");

      const data = await deleteSubjectApi(subject.id);

      setActionSuccess(
        data.message ||
        `Mata pelajaran "${subject.name}" berhasil dihapus`
      );

      await loadSubjects();

      setTimeout(() => {
        setActionSuccess("");
      }, 2500);

    } catch (err) {

      console.error(err);

      setActionError(
        err.message ||
        "Gagal menghapus mata pelajaran"
      );

    }
  }


  const filteredSubjects = subjects.filter((item) => {

    const keyword = search.toLowerCase();

    return (
      item.code
        ?.toLowerCase()
        .includes(keyword)
      ||
      item.name
        ?.toLowerCase()
        .includes(keyword)
      ||
      item.description
        ?.toLowerCase()
        .includes(keyword)
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

              <h1>Mata Pelajaran</h1>

              <p>
                Kelola master mata pelajaran TKA Tryout
              </p>

            </div>

            <button
              className="primary-button"
              onClick={openModal}
            >
              + Tambah Mata Pelajaran
            </button>

          </div>


          {/* TABLE */}

          <div className="dashboard-card">

            <div className="user-toolbar">

              <input
                type="text"
                placeholder="Cari kode / nama / deskripsi..."
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

            </div>


            {loading && (

              <div className="loading-message">
                Memuat data mata pelajaran...
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

                <table className="user-table">

                  <thead>

                    <tr>

                      <th className="align-center">ID</th>
                      <th className="align-center">Kode</th>
                      <th className="align-center">Nama</th>
                      <th className="align-center">Deskripsi</th>
                      <th className="align-center">Status</th>
                      <th className="align-left">Aksi</th>

                    </tr>

                  </thead>


                  <tbody>

                    {filteredSubjects.map((item) => (

                      <tr key={item.id}>

                        <td>
                          {item.id}
                        </td>

                        <td>
                          <strong>
                            {item.code}
                          </strong>
                        </td>

                        <td className="align-left">
                          {item.name}
                        </td>

                        <td className="align-left">
                          {item.description || "-"}
                        </td>

                        <td>

                          {item.is_active ? (

                            <span className="status-active">
                              Aktif
                            </span>

                          ) : (

                            <span className="status-inactive">
                              Nonaktif
                            </span>

                          )}

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


                {filteredSubjects.length === 0 && (

                  <div className="empty-message">
                    {search
                      ? "Mata pelajaran tidak ditemukan."
                      : "Belum ada mata pelajaran."
                    }
                  </div>

                )}

              </div>

            )}

          </div>

        </div>

      </main>


      {/* MODAL TAMBAH / EDIT MATA PELAJARAN */}

      {showModal && (

        <div className="modal-overlay">

          <div className="modal">

            <div className="modal-header">

              <div>

                <h2>
                  {editingSubject
                    ? "Edit Mata Pelajaran"
                    : "Tambah Mata Pelajaran"
                  }
                </h2>

                <p>
                  {editingSubject
                    ? "Perbaharui data mata pelajaran"
                    : "Tambahkan mata pelajaran baru"
                  }
                </p>

              </div>

              <button
                className="modal-close"
                onClick={closeModal}
                disabled={saving}
              >
                ×
              </button>

            </div>


            <form onSubmit={handleSubmit}>

              {/* KODE */}

              <div className="form-group">

                <label>
                  Kode Mata Pelajaran
                </label>

                <input
                  type="text"
                  name="code"
                  value={form.code}
                  onChange={handleChange}
                  placeholder="Contoh: MAT"
                  maxLength="50"
                  disabled={saving}
                  required
                />

              </div>


              {/* NAMA */}

              <div className="form-group">

                <label>
                  Nama Mata Pelajaran
                </label>

                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Contoh: Matematika"
                  maxLength="100"
                  disabled={saving}
                  required
                />

              </div>


              {/* DESKRIPSI */}

              <div className="form-group">

                <label>
                  Deskripsi
                </label>

                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Deskripsi mata pelajaran"
                  disabled={saving}
                  rows="3"
                />

              </div>


              {/* STATUS */}

              <div className="form-checkbox">

                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                  id="is_active"
                  disabled={saving}
                />

                <label htmlFor="is_active">
                  Mata pelajaran aktif
                </label>

              </div>


              {/* ERROR */}

              {formError && (

                <div
                  className="form-error-message"
                  style={{ marginBottom: "15px" }}
                >
                  {formError}
                </div>

              )}


              {/* SUCCESS */}

              {formSuccess && (

                <div
                  className="success-message"
                  style={{ marginBottom: "15px" }}
                >
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

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >

                  {saving
                    ? "Menyimpan..."
                    : "Simpan"
                  }

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>

  );

}


export default SubjectManagement;