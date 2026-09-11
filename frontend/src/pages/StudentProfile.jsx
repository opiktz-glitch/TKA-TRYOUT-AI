import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconUser, IconKey, IconCheck } from "../components/Icons";

import { getMyProfile, updateMyProfile } from "../services/api";


function StudentProfile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    school_name: "",
    grade: "",
    class_name: "",
  });


  useEffect(() => {
    loadProfile();
  }, []);


  async function loadProfile() {
    try {
      setLoading(true);
      setError("");

      const data = await getMyProfile();

      setProfile(data);

      setForm({
        full_name: data.full_name || "",
        school_name: data.school_name || "",
        grade: data.grade || "",
        class_name: data.class_name || "",
      });
    } catch (err) {
      console.error("LOAD PROFILE ERROR:", err);
      setError(err.message || "Gagal memuat profil");
    } finally {
      setLoading(false);
    }
  }


  function handleChange(event) {
    const { name, value } = event.target;

    setForm({
      ...form,
      [name]: value,
    });
  }


  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");
    setFormSuccess("");

    try {
      setSaving(true);

      const result = await updateMyProfile({
        full_name: form.full_name,
        school_name: form.school_name || null,
        grade: form.grade || null,
        class_name: form.class_name || null,
      });

      setFormSuccess(result.message || "Profil berhasil diperbarui");

      await loadProfile();

      setTimeout(() => {
        setFormSuccess("");
      }, 2500);
    } catch (err) {
      console.error("UPDATE PROFILE ERROR:", err);
      setFormError(err.message || "Gagal memperbarui profil");
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Header />

        <div className="content">

          {/* HEADER */}

          <div className="page-header">
            <div>
              <h1>Profil</h1>
              <p>Data diri kamu sebagai siswa</p>
            </div>
          </div>

          {loading && (
            <div className="dashboard-card">
              <div className="loading-message">Memuat profil...</div>
            </div>
          )}

          {error && (
            <div className="dashboard-card">
              <div className="error-message">{error}</div>
            </div>
          )}

          {!loading && !error && profile && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>

              {/* KARTU AKUN (read-only) */}

              <div className="dashboard-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconUser size={24} />
                  </div>

                  <div>
                    <strong style={{ fontSize: 16 }}>{profile.full_name}</strong>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      @{profile.username} · NIS {profile.student_code}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    style={{ marginLeft: "auto" }}
                    onClick={() => navigate("/change-password")}
                  >
                    <IconKey size={15} />
                    Ubah Password
                  </button>
                </div>
              </div>


              {/* FORM EDIT PROFIL */}

              <div className="dashboard-card">
                <h2 style={{ marginBottom: 4 }}>Edit Data Diri</h2>
                <p style={{ marginBottom: 16, color: "#6b7280", fontSize: 13 }}>
                  NIS tidak bisa diubah di sini — hubungi admin kalau ada
                  kesalahan data NIS.
                </p>

                <form onSubmit={handleSubmit}>

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

                  {formError && (
                    <div className="form-error-message" style={{ marginTop: 16 }}>
                      {formError}
                    </div>
                  )}

                  {formSuccess && (
                    <div className="success-message" style={{ marginTop: 16 }}>
                      <IconCheck size={14} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                      {formSuccess}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={saving}
                      onClick={() => navigate(-1)}
                    >
                      Batal
                    </button>

                    <button type="submit" className="primary-button" disabled={saving}>
                      {saving ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                  </div>

                </form>
              </div>

            </div>
          )}

        </div>

      </main>
    </div>
  );
}

export default StudentProfile;
