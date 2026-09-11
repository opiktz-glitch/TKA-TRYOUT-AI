import { useEffect, useState } from "react";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconEdit, IconTrash, IconKey, IconEye, IconEyeOff, IconCheck } from "../components/Icons";

import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword
} from "../services/api";


function UserManagement() {

  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);

  // --------------------------------------------------------
  // STATE HALAMAN (tabel & aksi hapus)
  // --------------------------------------------------------

  const [loadError, setLoadError] = useState("");

  const [actionError, setActionError] = useState("");

  const [actionSuccess, setActionSuccess] = useState("");

  const [search, setSearch] = useState("");


  // --------------------------------------------------------
  // STATE MODAL TAMBAH / EDIT USER
  // --------------------------------------------------------

  const [showModal, setShowModal] = useState(false);

  const [editingUser, setEditingUser] = useState(null);

  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState("");

  const [formSuccess, setFormSuccess] = useState("");

  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "SISWA",
    is_active: true
  });


  // --------------------------------------------------------
  // STATE MODAL RESET PASSWORD
  // --------------------------------------------------------

  const [passwordUser, setPasswordUser] = useState(null);

  const [newPassword, setNewPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [passwordLoading, setPasswordLoading] = useState(false);

  const [showNewPassword, setShowNewPassword] = useState(false);

  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordError, setPasswordError] = useState("");

  const [passwordSuccess, setPasswordSuccess] = useState("");


  useEffect(() => {
    loadUsers();
  }, []);


  async function loadUsers() {

    try {

      setLoading(true);
      setLoadError("");

      const data = await getUsers();

      setUsers(data);

    } catch (err) {

      console.error(err);

      setLoadError(
        err.message || "Gagal mengambil data user"
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

    setEditingUser(null);

    setForm({
      username: "",
      password: "",
      full_name: "",
      role: "SISWA",
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

    setFormError("");
    setFormSuccess("");

  }


  function openEditModal(user) {

    setEditingUser(user);

    setForm({
      username: user.username,
      password: "",
      full_name: user.full_name || "",
      role: user.role,
      is_active: user.is_active
    });

    setFormError("");
    setFormSuccess("");

    setShowModal(true);
  }


  function openPasswordModal(user) {
    setPasswordUser(user);

    setNewPassword("");
    setConfirmPassword("");

    setPasswordError("");
    setPasswordSuccess("");

    setPasswordLoading(false);

    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }


  function closePasswordModal() {
    if (passwordLoading) {
      return;
    }

    setPasswordUser(null);

    setNewPassword("");
    setConfirmPassword("");

    setPasswordError("");
    setPasswordSuccess("");

    setPasswordLoading(false);

    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }


  async function handleSubmit(event) {

    event.preventDefault();

    setFormError("");
    setFormSuccess("");

    if (!form.username.trim()) {
      setFormError("Username wajib diisi");
      return;
    }

    if (!editingUser && !form.password.trim()) {
      setFormError("Password wajib diisi");
      return;
    }

    try {

      setSaving(true);

      let result;

      if (editingUser) {

        result = await updateUser(
          editingUser.id,
          {
            username: form.username,
            full_name: form.full_name,
            role: form.role,
            is_active: form.is_active
          }
        );

      } else {

        result = await createUser(form);

      }

      setFormSuccess(
        result.message || "Data berhasil disimpan"
      );

      await loadUsers();

      /*
       * Tunggu sebentar supaya admin sempat melihat
       * pesan berhasil sebelum modal tertutup, sama
       * seperti pola di modal Reset Password.
       */
      setTimeout(() => {
        setShowModal(false);
        setEditingUser(null);
        setFormSuccess("");
      }, 900);

    } catch (err) {

      console.error(err);

      setFormError(
        err.message || "Gagal menyimpan data"
      );

    } finally {

      setSaving(false);

    }
  }


  async function handleDelete(user) {

    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus user "${user.username}"?`
    );

    if (!confirmed) {
      return;
    }

    try {

      setActionError("");
      setActionSuccess("");

      await deleteUser(user.id);

      setActionSuccess(
        `User "${user.username}" berhasil dihapus`
      );

      await loadUsers();

      setTimeout(() => {
        setActionSuccess("");
      }, 2500);

    } catch (err) {

      console.error(err);

      setActionError(
        err.message || "Gagal menghapus user"
      );

    }
  }


  async function handleResetPassword(event) {
    event.preventDefault();

    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordUser) {
      setPasswordError("User belum dipilih");
      return;
    }

    if (!newPassword.trim()) {
      setPasswordError("Password baru wajib diisi");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password minimal 8 karakter");
      return;
    }

    if (!confirmPassword.trim()) {
      setPasswordError("Konfirmasi password wajib diisi");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi password tidak sama");
      return;
    }

    try {
      setPasswordLoading(true);

      const result = await resetUserPassword(
        passwordUser.id,
        newPassword
      );

      setPasswordSuccess(
        result.message || "Password berhasil diubah"
      );

      setNewPassword("");
      setConfirmPassword("");

      /*
       * Tunggu sebentar supaya admin
       * bisa melihat pesan berhasil.
       */
      setTimeout(() => {
        setPasswordUser(null);
        setPasswordSuccess("");
      }, 1200);

    } catch (err) {

      console.error(
        "RESET PASSWORD ERROR:",
        err
      );

      setPasswordError(
        err.message ||
        "Gagal mengubah password"
      );

    } finally {

      setPasswordLoading(false);

    }
  }

  const filteredUsers = users.filter((item) => {

    const keyword = search.toLowerCase();

    return (
      item.username
        ?.toLowerCase()
        .includes(keyword)
      ||
      item.full_name
        ?.toLowerCase()
        .includes(keyword)
      ||
      item.role
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

              <h1>User Management</h1>

              <p>
                Kelola pengguna aplikasi TKA Tryout
              </p>

            </div>

            <button
              className="primary-button"
              onClick={openModal}
            >
              + Tambah User
            </button>

          </div>


          {/* TABLE */}

          <div className="dashboard-card">

            <div className="user-toolbar">

              <input
                type="text"
                placeholder="Cari username / nama / role..."
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

            </div>


            {/* -----------------------------------------------------
                FEEDBACK AKSI (hapus user) — banner kecil, tidak
                menyembunyikan tabel di bawahnya sama sekali,
                beda dengan loadError yang memang berarti tabel
                gagal dimuat sama sekali.
                ----------------------------------------------------- */}

            {actionSuccess && (

              <div
                className="success-message"
                style={{ margin: "0 18px 15px" }}
              >
                <IconCheck size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                {actionSuccess}
              </div>

            )}


            {actionError && (

              <div
                className="form-error-message"
                style={{ margin: "0 18px 15px" }}
              >
                {actionError}
              </div>

            )}


            {loading && (

              <div className="loading-message">
                Memuat data user...
              </div>

            )}


            {loadError && (

              <div className="error-message">
                {loadError}
              </div>

            )}


            {!loading && !loadError && (

              <div className="table-container">

                <table className="user-table">

                  <thead>

                    <tr>

                      <th className="align-center">ID</th>
                      <th className="align-center">Username</th>
                      <th className="align-center">Nama</th>
                      <th className="align-center">Role</th>
                      <th className="align-center">Status</th>
                      <th className="align-left">Aksi</th>

                    </tr>

                  </thead>


                  <tbody>

                    {filteredUsers.map((item) => (

                      <tr key={item.id}>

                        <td>
                          {item.id}
                        </td>

                        <td>
                          <strong>
                            {item.username}
                          </strong>
                        </td>

                        <td className="align-left">
                          {item.full_name || "-"}
                        </td>

                        <td>

                          <span
                            className={`role-badge role-${item.role.toLowerCase()}`}
                          >
                            {item.role}
                          </span>

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

                            <button
                              className="password-button"
                              onClick={() => openPasswordModal(item)}
                            >
                              <IconKey size={16} />
                            </button>

                          </div>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>


                {filteredUsers.length === 0 && (

                  <div className="empty-message">
                    {search
                      ? "User tidak ditemukan."
                      : "Belum ada user."
                    }
                  </div>

                )}

              </div>

            )}

          </div>

        </div>

      </main>


      {/* MODAL TAMBAH / EDIT USER */}

      {showModal && (

        <div className="modal-overlay">

          <div className="modal">

            <div className="modal-header">

              <div>

                <h2>
                  {editingUser
                    ? "Edit User"
                    : "Tambah User"
                  }
                </h2>

                <p>
                  {editingUser
                    ? "Perbaharui data pengguna"
                    : "Tambahkan pengguna baru"
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

              {/* USERNAME */}

              <div className="form-group">

                <label>
                  Username
                </label>

                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="Masukkan username"
                  disabled={saving}
                  required
                />

              </div>


              {/* PASSWORD */}

              {!editingUser && (

                <div className="form-group">

                  <label>
                    Password
                  </label>

                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Masukkan password"
                    disabled={saving}
                    required
                   />

                </div>

                )}


              {/* NAMA */}

              <div className="form-group">

                <label>
                  Nama Lengkap
                </label>

                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder="Masukkan nama lengkap"
                  disabled={saving}
                />

              </div>


              {/* ROLE */}

              <div className="form-group">

                <label>
                  Role
                </label>

                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  disabled={saving}
                >

                  <option value="ADMIN">
                    ADMIN
                  </option>

                  <option value="GURU">
                    GURU
                  </option>

                  <option value="SISWA">
                    SISWA
                  </option>

                </select>

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
                  User aktif
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
                    : "Simpan User"
                  }

                </button>

              </div>

            </form>

          </div>

        </div>

      )}


      {/* =========================================================
          MODAL RESET PASSWORD
      ========================================================= */}

      {passwordUser && (

        <div className="modal-overlay">

          <div className="modal">

            {/* HEADER */}

            <div className="modal-header">

              <div>

                <h2>
                  Reset Password
                </h2>

                <p>
                  Ubah password pengguna
                </p>

              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closePasswordModal}
                disabled={passwordLoading}
              >
                ×
              </button>

            </div>


            {/* INFORMASI USER */}

            <div className="password-user-info">

              <strong>
                {passwordUser.full_name ||
                  passwordUser.username}
              </strong>

              <span>
                Username: {passwordUser.username}
              </span>

              <span>
                Role: {passwordUser.role}
              </span>

            </div>


            {/* FORM */}

            <form onSubmit={handleResetPassword}>

              {/* PASSWORD BARU */}

              <div className="form-group">

                <label>
                  Password Baru
                </label>

                <div className="password-input-wrapper">

                  <input
                    type={
                      showNewPassword
                        ? "text"
                        : "password"
                    }
                    value={newPassword}
                    onChange={(e) =>
                      setNewPassword(e.target.value)
                    }
                    placeholder="Minimal 8 karakter"
                    autoComplete="new-password"
                    disabled={passwordLoading}
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowNewPassword(
                        !showNewPassword
                      )
                    }
                    disabled={passwordLoading}
                    tabIndex="-1"
                  >
                    {showNewPassword
                      ? <IconEyeOff size={17} />
                      : <IconEye size={17} />}
                  </button>

                </div>

              </div>


              {/* KONFIRMASI PASSWORD */}

              <div className="form-group">

                <label>
                  Konfirmasi Password
                </label>

                <div className="password-input-wrapper">

                  <input
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    placeholder="Ulangi password baru"
                    autoComplete="new-password"
                    disabled={passwordLoading}
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowConfirmPassword(
                        !showConfirmPassword
                      )
                    }
                    disabled={passwordLoading}
                    tabIndex="-1"
                  >
                    {showConfirmPassword
                      ? <IconEyeOff size={17} />
                      : <IconEye size={17} />}
                  </button>

                </div>

              </div>


              {/* VALIDASI PASSWORD */}

              <div className="password-rules">

                <div
                  className={
                    newPassword.length >= 8
                      ? "rule-valid"
                      : "rule-invalid"
                  }
                >
                  {newPassword.length >= 8
                    ? <IconCheck size={13} style={{ verticalAlign: "-2px" }} />
                    : "○"}{" "}
                  Minimal 8 karakter
                </div>


                <div
                  className={
                    confirmPassword &&
                    newPassword === confirmPassword
                      ? "rule-valid"
                      : "rule-invalid"
                  }
                >
                  {confirmPassword &&
                  newPassword === confirmPassword
                    ? <IconCheck size={13} style={{ verticalAlign: "-2px" }} />
                    : "○"}{" "}
                  Password cocok
                </div>

              </div>


              {/* ERROR */}

              {passwordError && (

                <div
                  className="form-error-message"
                  style={{
                    marginBottom: "15px"
                  }}
                >
                  {passwordError}
                </div>

              )}


              {/* SUCCESS */}

              {passwordSuccess && (

                <div
                  className="success-message"
                  style={{
                    marginBottom: "15px"
                  }}
                >
                  <IconCheck size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                  {passwordSuccess}
                </div>

              )}


              {/* FOOTER */}

              <div className="modal-footer">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={closePasswordModal}
                  disabled={passwordLoading}
                >
                  Batal
                </button>


                <button
                  type="submit"
                  className="primary-button"
                  disabled={passwordLoading}
                >

                  {passwordLoading
                    ? "Menyimpan..."
                    : "Ubah Password"}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}
    </div>

  );

}


export default UserManagement;
