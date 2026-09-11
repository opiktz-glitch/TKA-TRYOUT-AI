import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { changeMyPassword } from "../services/api";

function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setError("Semua field wajib diisi");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password baru minimal 8 karakter");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak sama");
      return;
    }

    if (currentPassword === newPassword) {
      setError("Password baru harus berbeda dengan password lama");
      return;
    }

    try {
      setLoading(true);

      const result = await changeMyPassword(
        currentPassword,
        newPassword
      );

      setSuccess(
        result.message || "Password berhasil diubah"
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
              <h1>Ganti Password</h1>
              <p>
                Gunakan password yang kuat untuk menjaga keamanan akun Anda
              </p>
            </div>
          </div>

          {/* FORM CARD */}
          <div className="dashboard-card" style={{ maxWidth: "700px", margin: "0 auto" }}>
            {error && (
              <div className="error-message" style={{ marginBottom: "16px" }}>
                {error}
              </div>
            )}

            {success && (
              <div
                className="alert-success"
                style={{
                  backgroundColor: "#d4edda",
                  color: "#155724",
                  padding: "10px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Password Lama</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) =>
                    setCurrentPassword(e.target.value)
                  }
                  placeholder="Masukkan password lama"
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="form-group">
                <label>Password Baru</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="form-group">
                <label>Konfirmasi Password Baru</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                  placeholder="Ulangi password baru"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div style={{ marginTop: "24px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={loading}
                  onClick={() => navigate(-1)}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                >
                  {loading ? "Mengubah..." : "Ubah Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ChangePassword;