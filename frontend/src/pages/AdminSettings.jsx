import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconUser, IconKey } from "../components/Icons";

import {
  updateMyAccountProfile,
  getAIProviders,
  updateActiveProvider,
  updateProviderConfig,
  clearProviderConfig,
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

  // ======================================================
  // PROVIDER AI — GENERIK
  //
  // "providers" datang dari backend sebagai LIST (bukan field
  // terpisah per nama seperti "ollama"/"gemini"). Jadi kalau nanti
  // ada provider baru didaftarkan di backend/ai_providers.py, UI
  // di bawah ini otomatis ikut menampilkannya tanpa perlu tambahan
  // state atau komponen baru.
  // ======================================================

  const [providers, setProviders] = useState(null);
  const [providerChoice, setProviderChoice] = useState("");
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [providerSuccess, setProviderSuccess] = useState("");

  // Form konfigurasi (API key & model) per provider, key-nya =
  // provider key (mis. "GEMINI"). apiKey sengaja SELALU dimulai
  // kosong (key asli tidak pernah dikirim balik oleh backend);
  // model diisi dari nilai yang sedang aktif supaya enak diedit.
  const [configDrafts, setConfigDrafts] = useState({});
  const [configSaving, setConfigSaving] = useState({});
  const [configError, setConfigError] = useState({});
  const [configSuccess, setConfigSuccess] = useState({});


  useEffect(() => {
    loadProviders();
  }, []);


  async function loadProviders() {
    setProviderLoading(true);
    setProviderError("");

    try {
      const data = await getAIProviders();

      setProviders(data);
      setProviderChoice(data.active_provider);

      const drafts = {};
      for (const p of data.providers) {
        drafts[p.provider] = { apiKey: "", model: p.model || "" };
      }
      setConfigDrafts(drafts);
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

      const activeLabel =
        data.providers.find((p) => p.provider === data.active_provider)?.label ||
        data.active_provider;

      setProviderSuccess(`Provider AI aktif sekarang: ${activeLabel}.`);
    } catch (err) {
      console.error("UPDATE AI PROVIDER ERROR:", err);
      setProviderError(err.message || "Gagal mengganti provider AI aktif");
    } finally {
      setProviderSaving(false);
    }
  }


  function updateDraft(providerKey, field, value) {
    setConfigDrafts((prev) => ({
      ...prev,
      [providerKey]: { ...prev[providerKey], [field]: value },
    }));
  }


  async function handleSaveProviderConfig(providerKey) {
    setConfigError((prev) => ({ ...prev, [providerKey]: "" }));
    setConfigSuccess((prev) => ({ ...prev, [providerKey]: "" }));

    const draft = configDrafts[providerKey] || {};
    const trimmedKey = (draft.apiKey || "").trim();
    const trimmedModel = (draft.model || "").trim();

    if (!trimmedModel) {
      setConfigError((prev) => ({
        ...prev,
        [providerKey]: "Nama model wajib diisi",
      }));
      return;
    }

    try {
      setConfigSaving((prev) => ({ ...prev, [providerKey]: true }));

      // Kalau input key dikosongkan, jangan kirim api_key sama
      // sekali (undefined) supaya key lama yang sudah tersimpan
      // di database tidak ikut terhapus hanya karena admin cuma
      // mau ganti nama model.
      const data = await updateProviderConfig(providerKey, {
        apiKey: trimmedKey ? trimmedKey : undefined,
        model: trimmedModel,
      });

      setProviders(data);

      const updated = data.providers.find((p) => p.provider === providerKey);

      setConfigDrafts((prev) => ({
        ...prev,
        [providerKey]: { apiKey: "", model: updated?.model || trimmedModel },
      }));

      setConfigSuccess((prev) => ({
        ...prev,
        [providerKey]: trimmedKey
          ? "API key & model berhasil disimpan."
          : "Model berhasil diperbarui.",
      }));
    } catch (err) {
      console.error("UPDATE PROVIDER CONFIG ERROR:", err);
      setConfigError((prev) => ({
        ...prev,
        [providerKey]: err.message || "Gagal menyimpan pengaturan",
      }));
    } finally {
      setConfigSaving((prev) => ({ ...prev, [providerKey]: false }));
    }
  }


  async function handleClearProviderConfig(providerKey) {
    setConfigError((prev) => ({ ...prev, [providerKey]: "" }));
    setConfigSuccess((prev) => ({ ...prev, [providerKey]: "" }));

    try {
      setConfigSaving((prev) => ({ ...prev, [providerKey]: true }));

      const data = await clearProviderConfig(providerKey);

      setProviders(data);
      setProviderChoice(data.active_provider);

      const updated = data.providers.find((p) => p.provider === providerKey);

      setConfigDrafts((prev) => ({
        ...prev,
        [providerKey]: { apiKey: "", model: updated?.model || "" },
      }));

      setConfigSuccess((prev) => ({
        ...prev,
        [providerKey]: "API key telah dihapus.",
      }));
    } catch (err) {
      console.error("CLEAR PROVIDER CONFIG ERROR:", err);
      setConfigError((prev) => ({
        ...prev,
        [providerKey]: err.message || "Gagal menghapus API key",
      }));
    } finally {
      setConfigSaving((prev) => ({ ...prev, [providerKey]: false }));
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
          {/* TAB: AI — GENERIK, MENGIKUTI DAFTAR PROVIDER    */}
          {/* DARI BACKEND (backend/ai_providers.py). NAMBAH  */}
          {/* PROVIDER BARU DI BACKEND OTOMATIS MUNCUL DI SINI */}
          {/* TANPA UBAH KOMPONEN INI.                         */}
          {/* ============================================= */}

          {activeTab === "ai-model" && (
            <>

              {/* ============================================= */}
              {/* KARTU: PROVIDER AI AKTIF                       */}
              {/* ============================================= */}

              <div
                className="dashboard-card"
                style={{ maxWidth: "700px", margin: "0 auto 20px", padding: "24px" }}
              >
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>Provider AI Aktif</h2>
                <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                  Pilih AI mana yang dipakai fitur "Generate Soal AI" di Bank Soal.
                  Guru hanya memakai satu provider yang aktif di sini.
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

                      {(providers?.providers || []).map((option) => {
                        const isChecked = providerChoice === option.provider;

                        return (
                          <label
                            key={option.provider}
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
                              value={option.provider}
                              checked={isChecked}
                              onChange={() => setProviderChoice(option.provider)}
                            />

                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {option.label}
                                {providers?.active_provider === option.provider && (
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
                                Model: <code>{option.model || "-"}</code>
                              </div>

                              {option.detail && (
                                <div style={{ fontSize: 12, color: "#856404", marginTop: 2 }}>
                                  {option.detail}
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
                                backgroundColor: option.online ? "#d4edda" : "#f8d7da",
                                color: option.online ? "#155724" : "#721c24",
                              }}
                            >
                              {option.online ? "Online" : "Offline"}
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
              {/* KARTU KONFIGURASI — SATU KARTU PER PROVIDER    */}
              {/* (di-render dari list, bukan hardcode per nama)  */}
              {/* ============================================= */}

              {!providerLoading && (providers?.providers || []).map((option, index) => {
                const draft = configDrafts[option.provider] || { apiKey: "", model: "" };
                const isSaving = !!configSaving[option.provider];
                const errMsg = configError[option.provider];
                const okMsg = configSuccess[option.provider];
                const isLast = index === providers.providers.length - 1;

                return (
                  <div
                    key={option.provider}
                    className="dashboard-card"
                    style={{
                      maxWidth: "700px",
                      margin: isLast ? "0 auto" : "0 auto 20px",
                      padding: "24px",
                    }}
                  >
                    <h2 style={{ marginTop: 0, marginBottom: 6 }}>
                      Konfigurasi {option.label}
                    </h2>

                    <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                      {option.requires_api_key
                        ? "API key disimpan di database, bukan di file .env — bisa diganti kapan saja dari sini tanpa perlu akses server."
                        : "Provider ini berjalan lokal dan tidak memerlukan API key. Cukup atur nama model yang dipakai."}
                    </p>

                    {errMsg && (
                      <div className="error-message" style={{ marginBottom: 18 }}>
                        {errMsg}
                      </div>
                    )}

                    {okMsg && (
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
                        {okMsg}
                      </div>
                    )}

                    {!option.online && option.detail && (
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
                        {option.detail}
                      </div>
                    )}

                    {option.requires_api_key && (
                      <div className="form-group" style={{ marginBottom: 18 }}>
                        <label>API Key</label>

                        <input
                          type="password"
                          value={draft.apiKey}
                          onChange={(e) => updateDraft(option.provider, "apiKey", e.target.value)}
                          placeholder={
                            option.masked_key
                              ? `Tersimpan: ${option.masked_key} (isi untuk mengganti)`
                              : "Tempel API key di sini"
                          }
                          autoComplete="off"
                        />

                        <small style={{ color: "#6b7280" }}>
                          {option.configured
                            ? "Sudah ada key tersimpan. Kosongkan kalau cuma mau ganti model, jangan ganti key."
                            : "Belum ada API key tersimpan."}
                        </small>
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 18 }}>
                      <label>Model</label>

                      <input
                        type="text"
                        value={draft.model}
                        onChange={(e) => updateDraft(option.provider, "model", e.target.value)}
                        placeholder="mis. nama-model"
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      {option.requires_api_key && option.configured && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={isSaving}
                          onClick={() => handleClearProviderConfig(option.provider)}
                        >
                          Hapus API Key
                        </button>
                      )}

                      <button
                        type="button"
                        className="primary-button"
                        disabled={isSaving}
                        onClick={() => handleSaveProviderConfig(option.provider)}
                      >
                        {isSaving ? "Menyimpan..." : `Simpan ${option.label}`}
                      </button>
                    </div>
                  </div>
                );
              })}

            </>
          )}

        </div>

      </main>
    </div>
  );
}

export default AdminSettings;
