import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconUser, IconKey } from "../components/Icons";

import {
  updateMyAccountProfile,
  getAIModelSetting,
  updateAIModelSetting,
  resetAIModelSetting,
  getAIProviders,
  updateActiveProvider,
  updateGeminiSetting,
  clearGeminiSetting,
} from "../services/api";
import { useAuth } from "../auth/AuthContext";


const TABS = [
  { key: "profile", label: "Profil Saya" },
  { key: "ai-model", label: "AI" },
];


function AdminSettings() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [activeTab, setActiveTab] = useState("profile");

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --- Pengaturan Model AI (Ollama) ---
  const [aiSetting, setAiSetting] = useState(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuccess, setAiSuccess] = useState("");

  // --- Provider AI (Ollama vs Gemini) ---
  const [providers, setProviders] = useState(null);
  const [providerChoice, setProviderChoice] = useState("OLLAMA");
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [providerSuccess, setProviderSuccess] = useState("");

  // --- Koneksi Gemini (API key bisa diganti-ganti dari sini) ---
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [geminiModelInput, setGeminiModelInput] = useState("");
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiError, setGeminiError] = useState("");
  const [geminiSuccess, setGeminiSuccess] = useState("");


  useEffect(() => {
    loadAiSetting();
    loadProviders();
  }, []);


  async function loadProviders() {
    setProviderLoading(true);
    setProviderError("");

    try {
      const data = await getAIProviders();
      setProviders(data);
      setProviderChoice(data.active_provider);
      setGeminiModelInput(data.gemini?.model || "gemini-2.5-flash");
    } catch (err) {
      console.error("GET AI PROVIDERS ERROR:", err);
      setProviderError(err.message || "Gagal memuat status provider AI");
    } finally {
      setProviderLoading(false);
    }
  }


  async function handleSaveProvider() {
    setProviderError("");
    setProviderSuccess("");

    try {
      setProviderSaving(true);

      const data = await updateActiveProvider(providerChoice);

      setProviders(data);
      setProviderChoice(data.active_provider);
      setProviderSuccess(
        `Provider AI aktif sekarang: ${
          data.active_provider === "GEMINI" ? "Google Gemini" : "Ollama"
        }.`
      );
    } catch (err) {
      console.error("UPDATE AI PROVIDER ERROR:", err);
      setProviderError(err.message || "Gagal mengganti provider AI aktif");
    } finally {
      setProviderSaving(false);
    }
  }


  async function handleSaveGemini() {
    setGeminiError("");
    setGeminiSuccess("");

    const trimmedKey = geminiApiKeyInput.trim();
    const trimmedModel = geminiModelInput.trim();

    if (!trimmedModel) {
      setGeminiError("Nama model Gemini wajib diisi");
      return;
    }

    try {
      setGeminiSaving(true);

      // Kalau input key dikosongkan, jangan kirim api_key sama
      // sekali (undefined) supaya key lama yang sudah tersimpan
      // di database tidak ikut terhapus hanya karena admin cuma
      // mau ganti nama model.
      const data = await updateGeminiSetting({
        apiKey: trimmedKey ? trimmedKey : undefined,
        model: trimmedModel,
      });

      setProviders(data);
      setGeminiApiKeyInput("");
      setGeminiSuccess(
        trimmedKey
          ? "API key & model Gemini berhasil disimpan."
          : "Model Gemini berhasil diperbarui."
      );
    } catch (err) {
      console.error("UPDATE GEMINI SETTING ERROR:", err);
      setGeminiError(err.message || "Gagal menyimpan pengaturan Gemini");
    } finally {
      setGeminiSaving(false);
    }
  }


  async function handleClearGemini() {
    setGeminiError("");
    setGeminiSuccess("");

    try {
      setGeminiSaving(true);

      const data = await clearGeminiSetting();

      setProviders(data);
      setProviderChoice(data.active_provider);
      setGeminiApiKeyInput("");
      setGeminiModelInput(data.gemini?.model || "gemini-2.5-flash");
      setGeminiSuccess("API key Gemini telah dihapus.");
    } catch (err) {
      console.error("CLEAR GEMINI SETTING ERROR:", err);
      setGeminiError(err.message || "Gagal menghapus API key Gemini");
    } finally {
      setGeminiSaving(false);
    }
  }


  async function loadAiSetting() {
    setAiLoading(true);
    setAiError("");

    try {
      const data = await getAIModelSetting();
      setAiSetting(data);
      setSelectedModel(data.active_model);
    } catch (err) {
      console.error("GET AI MODEL SETTING ERROR:", err);
      setAiError(err.message || "Gagal memuat pengaturan model AI");
    } finally {
      setAiLoading(false);
    }
  }


  async function handleSaveAiModel() {
    setAiError("");
    setAiSuccess("");

    if (!selectedModel.trim()) {
      setAiError("Pilih atau isi nama model terlebih dahulu");
      return;
    }

    try {
      setAiSaving(true);

      const data = await updateAIModelSetting(selectedModel.trim());

      setAiSetting(data);
      setSelectedModel(data.active_model);
      setAiSuccess("Model AI berhasil diperbarui, langsung aktif tanpa perlu restart server.");
    } catch (err) {
      console.error("UPDATE AI MODEL SETTING ERROR:", err);
      setAiError(err.message || "Gagal menyimpan model AI");
    } finally {
      setAiSaving(false);
    }
  }


  async function handleResetAiModel() {
    setAiError("");
    setAiSuccess("");

    try {
      setAiSaving(true);

      const data = await resetAIModelSetting();

      setAiSetting(data);
      setSelectedModel(data.active_model);
      setAiSuccess("Dikembalikan ke model default dari .env.");
    } catch (err) {
      console.error("RESET AI MODEL SETTING ERROR:", err);
      setAiError(err.message || "Gagal mengembalikan model AI ke default");
    } finally {
      setAiSaving(false);
    }
  }


  function handleCancel() {
    navigate(-1);
  }


  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!fullName.trim()) {
      setError("Nama lengkap wajib diisi");
      return;
    }

    try {
      setSaving(true);

      const result = await updateMyAccountProfile(fullName.trim());

      await refreshUser();

      setSuccess(result.message || "Profil berhasil diperbarui");
    } catch (err) {
      console.error("UPDATE PROFILE ERROR:", err);
      setError(err.message || "Gagal memperbarui profil");
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
              <h1>Pengaturan</h1>
              <p>Kelola profil, keamanan akun, dan konfigurasi sistem</p>
            </div>
          </div>

          {/* TAB SWITCHER */}

          <div
            style={{
              display: "flex",
              gap: 6,
              maxWidth: "700px",
              margin: "0 auto 20px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: "10px 18px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent)" : "#6b7280",
                    borderBottom: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    marginBottom: "-1px",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ============================================= */}
          {/* TAB: PROFIL SAYA                                */}
          {/* ============================================= */}

          {activeTab === "profile" && (
            <>
              {/* KARTU AKUN (read-only) + tombol ubah password */}

              <div
                className="dashboard-card"
                style={{
                  maxWidth: "700px",
                  margin: "0 auto 20px",
                  padding: "24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    flexWrap: "wrap",
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

                  <div style={{ flex: 1, minWidth: 140 }}>
                    <strong style={{ fontSize: 16 }}>{user?.full_name}</strong>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      @{user?.username} &middot; {user?.role}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => navigate("/change-password")}
                  >
                    <IconKey size={15} />
                    Ubah Password
                  </button>
                </div>
              </div>

              {/* FORM EDIT PROFIL */}

              <div
                className="dashboard-card"
                style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}
              >

                <h2 style={{ marginTop: 0, marginBottom: 6 }}>Edit Profil</h2>
                <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                  Username dan role tidak bisa diubah di sini.
                </p>

                {error && (
                  <div className="error-message" style={{ marginBottom: 16 }}>
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
                    <label>Nama Lengkap</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Masukkan nama lengkap"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={user?.username || ""}
                      disabled
                    />
                  </div>

                  <div
                    style={{
                      marginTop: "24px",
                      display: "flex",
                      gap: 10,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={saving}
                      onClick={handleCancel}
                    >
                      Batal
                    </button>

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={saving}
                    >
                      {saving ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                  </div>

                </form>
              </div>
            </>
          )}

          {/* ============================================= */}
          {/* TAB: AI (PROVIDER, MODEL OLLAMA, KONEKSI GEMINI) */}
          {/* ============================================= */}

          {activeTab === "ai-model" && (
            <>

              {/* ============================================= */}
              {/* KARTU 1: PROVIDER AI AKTIF                     */}
              {/* ============================================= */}

              <div
                className="dashboard-card"
                style={{ maxWidth: "700px", margin: "0 auto 20px", padding: "24px" }}
              >
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>Provider AI Aktif</h2>
                <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                  Pilih AI mana yang dipakai fitur "Generate Soal AI" di Bank Soal:
                  Ollama (jalan lokal di laptop) atau Google Gemini (cloud, butuh
                  API key). Guru hanya memakai satu provider yang aktif di sini.
                </p>

                {providerLoading ? (
                  <p style={{ color: "#6b7280", fontSize: 13 }}>Memuat status provider...</p>
                ) : (
                  <>
                    {providerError && (
                      <div className="error-message" style={{ marginBottom: 18 }}>
                        {providerError}
                      </div>
                    )}

                    {providerSuccess && (
                      <div
                        className="alert-success"
                        style={{
                          backgroundColor: "#d4edda",
                          color: "#155724",
                          padding: "10px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          marginBottom: "18px",
                        }}
                      >
                        {providerSuccess}
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>

                      {[
                        { value: "OLLAMA", label: "Ollama (lokal)", status: providers?.ollama },
                        { value: "GEMINI", label: "Google Gemini (cloud)", status: providers?.gemini },
                      ].map((option) => {
                        const isChecked = providerChoice === option.value;
                        const online = option.status?.online;

                        return (
                          <label
                            key={option.value}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              border: isChecked ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                              borderRadius: 8,
                              padding: "12px 14px",
                              cursor: "pointer",
                              background: isChecked ? "rgba(37,99,235,0.04)" : "transparent",
                            }}
                          >
                            <input
                              type="radio"
                              name="ai-provider-choice"
                              value={option.value}
                              checked={isChecked}
                              onChange={() => setProviderChoice(option.value)}
                            />

                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {option.label}
                                {providers?.active_provider === option.value && (
                                  <span
                                    style={{
                                      marginLeft: 8,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "var(--accent)",
                                    }}
                                  >
                                    &middot; SEDANG AKTIF
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                                Model: <code>{option.status?.model || "-"}</code>
                              </div>

                              {option.status?.detail && (
                                <div style={{ fontSize: 12, color: "#856404", marginTop: 2 }}>
                                  {option.status.detail}
                                </div>
                              )}
                            </div>

                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "3px 9px",
                                borderRadius: 999,
                                whiteSpace: "nowrap",
                                backgroundColor: online ? "#d4edda" : "#f8d7da",
                                color: online ? "#155724" : "#721c24",
                              }}
                            >
                              {online ? "Online" : "Offline"}
                            </span>
                          </label>
                        );
                      })}

                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        className="primary-button"
                        disabled={providerSaving || providerChoice === providers?.active_provider}
                        onClick={handleSaveProvider}
                      >
                        {providerSaving ? "Menyimpan..." : "Jadikan Provider Aktif"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* ============================================= */}
              {/* KARTU 2: MODEL OLLAMA                          */}
              {/* ============================================= */}

              <div
                className="dashboard-card"
                style={{ maxWidth: "700px", margin: "0 auto 20px", padding: "24px" }}
              >

                <h2 style={{ marginTop: 0, marginBottom: 6 }}>Model Ollama</h2>
                <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                  Model yang dipakai kalau provider aktif = Ollama. Ganti di sini
                  langsung berlaku untuk generate berikutnya, tidak perlu edit file
                  .env atau restart server.
                </p>

                {aiLoading ? (
                  <p style={{ color: "#6b7280", fontSize: 13 }}>Memuat pengaturan...</p>
                ) : (
                  <>
                    {aiError && (
                      <div className="error-message" style={{ marginBottom: 18 }}>
                        {aiError}
                      </div>
                    )}

                    {aiSuccess && (
                      <div
                        className="alert-success"
                        style={{
                          backgroundColor: "#d4edda",
                          color: "#155724",
                          padding: "10px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          marginBottom: "18px",
                        }}
                      >
                        {aiSuccess}
                      </div>
                    )}

                    {!aiSetting?.ollama_reachable && (
                      <div
                        style={{
                          backgroundColor: "#fff3cd",
                          color: "#856404",
                          padding: "10px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          marginBottom: "18px",
                        }}
                      >
                        Ollama tidak terdeteksi berjalan di laptop ini. Daftar model
                        tidak bisa dimuat otomatis — ketik nama model secara manual
                        (pastikan sudah pernah di-pull lewat "ollama pull nama-model").
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 18 }}>
                      <label>Model Aktif</label>

                      {aiSetting?.ollama_reachable && aiSetting.installed_models.length > 0 ? (
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                        >
                          {!aiSetting.installed_models.includes(selectedModel) && (
                            <option value={selectedModel}>{selectedModel}</option>
                          )}

                          {aiSetting.installed_models.map((modelName) => (
                            <option key={modelName} value={modelName}>
                              {modelName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          placeholder="mis. qwen2.5:3b"
                        />
                      )}
                    </div>

                    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 0 }}>
                      Default dari .env: <code>{aiSetting?.default_model}</code>
                      {aiSetting?.is_override && (
                        <> &middot; sedang dioverride lewat Pengaturan ini</>
                      )}
                    </p>

                    <div
                      style={{
                        marginTop: "26px",
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      {aiSetting?.is_override && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={aiSaving}
                          onClick={handleResetAiModel}
                        >
                          Kembalikan ke Default
                        </button>
                      )}

                      <button
                        type="button"
                        className="primary-button"
                        disabled={aiSaving}
                        onClick={handleSaveAiModel}
                      >
                        {aiSaving ? "Menyimpan..." : "Simpan Model Ollama"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* ============================================= */}
              {/* KARTU 3: KONEKSI GEMINI                        */}
              {/* ============================================= */}

              <div
                className="dashboard-card"
                style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}
              >

                <h2 style={{ marginTop: 0, marginBottom: 6 }}>Koneksi Gemini</h2>
                <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                  API key Gemini disimpan di database, bukan di file .env — bisa
                  diganti kapan saja dari sini tanpa perlu akses server. Dapatkan
                  API key gratis di{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google AI Studio
                  </a>.
                </p>

                {geminiError && (
                  <div className="error-message" style={{ marginBottom: 18 }}>
                    {geminiError}
                  </div>
                )}

                {geminiSuccess && (
                  <div
                    className="alert-success"
                    style={{
                      backgroundColor: "#d4edda",
                      color: "#155724",
                      padding: "10px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      marginBottom: "18px",
                    }}
                  >
                    {geminiSuccess}
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 18 }}>
                  <label>API Key Gemini</label>

                  <input
                    type="password"
                    value={geminiApiKeyInput}
                    onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                    placeholder={
                      providers?.gemini?.masked_key
                        ? `Tersimpan: ${providers.gemini.masked_key} (isi untuk mengganti)`
                        : "Tempel API key Gemini di sini (mis. AIzaSy...)"
                    }
                    autoComplete="off"
                  />

                  <small style={{ color: "#6b7280" }}>
                    {providers?.gemini?.configured
                      ? "Sudah ada key tersimpan. Kosongkan kalau cuma mau ganti model, jangan ganti key."
                      : "Belum ada API key tersimpan."}
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: 18 }}>
                  <label>Model Gemini</label>

                  <input
                    type="text"
                    value={geminiModelInput}
                    onChange={(e) => setGeminiModelInput(e.target.value)}
                    placeholder="mis. gemini-2.5-flash"
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "flex-end",
                  }}
                >
                  {providers?.gemini?.configured && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={geminiSaving}
                      onClick={handleClearGemini}
                    >
                      Hapus API Key
                    </button>
                  )}

                  <button
                    type="button"
                    className="primary-button"
                    disabled={geminiSaving}
                    onClick={handleSaveGemini}
                  >
                    {geminiSaving ? "Menyimpan..." : "Simpan Koneksi Gemini"}
                  </button>
                </div>
              </div>

            </>
          )}

        </div>

      </main>
    </div>
  );
}

export default AdminSettings;
