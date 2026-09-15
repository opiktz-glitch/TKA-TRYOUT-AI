import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconUser, IconKey, IconShield, IconRefresh, IconWifi, IconCheck, IconClipboard } from "../components/Icons";

import {
  updateMyAccountProfile,
  getAIProviders,
  updateActiveProvider,
  updateProviderConfig,
  clearProviderConfig,
  getSecretKeyStatus,
  updateSecretKey,
  rotateSecretKey,
  getNetworkInfo,
  getBackups,
  createBackupNow,
  downloadBackup,
} from "../services/api";
import { useAuth } from "../auth/AuthContext";


const TABS = [
  { key: "profile", label: "Profil Saya" },
  { key: "ai-model", label: "AI" },
  { key: "security", label: "Keamanan" },
  { key: "backup", label: "Backup" },
  { key: "network", label: "Jaringan" },
];


function AdminSettings() {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();

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


  // ======================================================
  // SECRET_KEY (Pengaturan > Keamanan)
  //
  // Mengganti/merotasi SECRET_KEY membuat SEMUA sesi login
  // (termasuk sesi admin yang melakukan aksi ini) langsung tidak
  // valid — begitu backend membalas sukses, kita langsung logout
  // sendiri & arahkan ke halaman login, alih-alih menunggu
  // request berikutnya gagal dengan 401.
  // ======================================================

  const [secretKeyStatus, setSecretKeyStatus] = useState(null);
  const [secretKeyLoading, setSecretKeyLoading] = useState(true);
  const [secretKeyError, setSecretKeyError] = useState("");

  const [secretKeyDraft, setSecretKeyDraft] = useState("");
  const [savingSecretKey, setSavingSecretKey] = useState(false);
  const [rotatingSecretKey, setRotatingSecretKey] = useState(false);

  // "confirm" -> null | "save" | "rotate". Dipakai untuk
  // menampilkan dialog konfirmasi sebelum benar-benar
  // mengeksekusi, karena aksi ini me-logout SEMUA orang yang
  // sedang login (termasuk siswa yang mungkin sedang tryout).
  const [secretKeyConfirm, setSecretKeyConfirm] = useState(null);


  // ======================================================
  // JARINGAN (Pengaturan > Jaringan)
  //
  // Menampilkan IP address laptop ini di WiFi/LAN yang aktif,
  // supaya admin tinggal membagikan URL-nya ke laptop/HP lain
  // di jaringan yang sama, tanpa perlu buka Command Prompt.
  // ======================================================

  const [networkInfo, setNetworkInfo] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(true);
  const [networkError, setNetworkError] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");


  // ======================================================
  // BACKUP (Pengaturan > Backup)
  //
  // Daftar backup database yang sudah ada (dari service Docker
  // "backup" yang jalan otomatis tiap 24 jam, ATAU dari tombol
  // "Backup Sekarang" di sini) + tombol untuk membuat backup baru
  // kapan saja di luar jadwal otomatis, dan tombol download tiap
  // file backup.
  // ======================================================

  const [backups, setBackups] = useState([]);
  const [retentionDays, setRetentionDays] = useState(null);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [backupsError, setBackupsError] = useState("");

  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupActionError, setBackupActionError] = useState("");
  const [backupActionSuccess, setBackupActionSuccess] = useState("");

  const [downloadingFilename, setDownloadingFilename] = useState("");


  useEffect(() => {
    loadProviders();
    loadSecretKeyStatus();
    // Dimuat di awal (bukan cuma saat tab "Jaringan" diklik) supaya
    // kita tahu APP_MODE lebih dulu, untuk memutuskan apakah tab
    // "Jaringan" perlu ditampilkan sama sekali (disembunyikan kalau
    // mode "production" — IP LAN tidak relevan di server cloud).
    loadNetworkInfo();
  }, []);


  useEffect(() => {
    if (activeTab === "network") {
      loadNetworkInfo();
    }

    if (activeTab === "backup") {
      loadBackups();
    }
  }, [activeTab]);


  async function loadBackups() {
    setBackupsLoading(true);
    setBackupsError("");

    try {
      const data = await getBackups();
      setBackups(data.backups || []);
      setRetentionDays(data.retention_days);
    } catch (err) {
      console.error("GET BACKUPS ERROR:", err);
      setBackupsError(err.message || "Gagal memuat daftar backup");
    } finally {
      setBackupsLoading(false);
    }
  }


  async function handleCreateBackupNow() {
    setBackupActionError("");
    setBackupActionSuccess("");

    try {
      setCreatingBackup(true);

      const data = await createBackupNow();

      setBackupActionSuccess(data.message);

      // Muat ulang daftar supaya backup baru langsung muncul di
      // tabel, tanpa admin perlu pindah tab lalu balik lagi.
      await loadBackups();
    } catch (err) {
      console.error("CREATE BACKUP ERROR:", err);
      setBackupActionError(err.message || "Gagal membuat backup");
    } finally {
      setCreatingBackup(false);
    }
  }


  async function handleDownloadBackup(filename) {
    setBackupActionError("");

    try {
      setDownloadingFilename(filename);
      await downloadBackup(filename);
    } catch (err) {
      console.error("DOWNLOAD BACKUP ERROR:", err);
      setBackupActionError(err.message || "Gagal mengunduh backup");
    } finally {
      setDownloadingFilename("");
    }
  }


  // Format ukuran file (bytes) jadi satuan yang gampang dibaca
  // (KB/MB) untuk ditampilkan di tabel backup.
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }


  async function loadNetworkInfo() {
    setNetworkLoading(true);
    setNetworkError("");

    try {
      const data = await getNetworkInfo();
      setNetworkInfo(data);
    } catch (err) {
      console.error("GET NETWORK INFO ERROR:", err);
      setNetworkError(err.message || "Gagal memuat info jaringan");
    } finally {
      setNetworkLoading(false);
    }
  }

  // Tab "Jaringan" disembunyikan sepenuhnya kalau backend berjalan
  // dalam mode "production" (server cloud) — fitur share IP LAN
  // tidak relevan di situ. Selama networkInfo belum termuat, tab
  // tetap ditampilkan dulu (menghindari salah sembunyi sebelum
  // tahu mode-nya).
  const visibleTabs = TABS.filter(
    (tab) => tab.key !== "network" || networkInfo?.mode !== "production"
  );

  // Kalau tab "Jaringan" sedang aktif tapi ternyata mode-nya
  // "production" (misal admin sempat klik sebelum data termuat),
  // otomatis pindah ke tab Profil supaya tidak terjebak di tab
  // yang sudah disembunyikan.
  useEffect(() => {
    if (activeTab === "network" && networkInfo?.mode === "production") {
      setActiveTab("profile");
    }
  }, [activeTab, networkInfo]);



  async function handleCopyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(""), 1800);
    } catch (err) {
      console.error("COPY URL ERROR:", err);
    }
  }


  async function loadSecretKeyStatus() {
    setSecretKeyLoading(true);
    setSecretKeyError("");

    try {
      const data = await getSecretKeyStatus();
      setSecretKeyStatus(data);
    } catch (err) {
      console.error("GET SECRET KEY STATUS ERROR:", err);
      setSecretKeyError(err.message || "Gagal memuat status SECRET_KEY");
    } finally {
      setSecretKeyLoading(false);
    }
  }


  // Dipanggil setelah "Simpan"/"Rotasi" berhasil — backend sudah
  // mengganti key, jadi token yang sedang dipakai browser ini
  // pasti sudah tidak valid untuk request berikutnya. Logout
  // sendiri di sini lebih ramah daripada membiarkan user mengklik
  // sesuatu lalu tiba-tiba "terlempar" oleh error 401.
  function forceLogoutAfterSecretKeyChange(message) {
    logout();
    navigate("/login", {
      replace: true,
      state: { message },
    });
  }


  async function handleSaveSecretKey() {
    setSecretKeyError("");

    const value = secretKeyDraft.trim();

    if (value.length < 32) {
      setSecretKeyError("SECRET_KEY minimal 32 karakter demi keamanan.");
      return;
    }

    try {
      setSavingSecretKey(true);

      const data = await updateSecretKey(value);

      forceLogoutAfterSecretKeyChange(
        data.message ||
          "SECRET_KEY berhasil disimpan. Silakan login kembali."
      );
    } catch (err) {
      console.error("UPDATE SECRET KEY ERROR:", err);
      setSecretKeyError(err.message || "Gagal menyimpan SECRET_KEY");
      setSavingSecretKey(false);
      setSecretKeyConfirm(null);
    }
  }


  async function handleRotateSecretKey() {
    setSecretKeyError("");

    try {
      setRotatingSecretKey(true);

      const data = await rotateSecretKey();

      forceLogoutAfterSecretKeyChange(
        data.message ||
          "SECRET_KEY berhasil dirotasi. Silakan login kembali."
      );
    } catch (err) {
      console.error("ROTATE SECRET KEY ERROR:", err);
      setSecretKeyError(err.message || "Gagal merotasi SECRET_KEY");
      setRotatingSecretKey(false);
      setSecretKeyConfirm(null);
    }
  }


  async function loadProviders() {
    setProviderLoading(true);
    setProviderError("");

    try {
      const data = await getAIProviders();

      setProviders(data);
      setProviderChoice(data.active_provider);

      const drafts = {};
      for (const p of data.providers) {
        drafts[p.provider] = {
          apiKey: "",
          model: p.model || "",
          // Alamat EFEKTIF yang sedang dipakai (override admin kalau
          // ada, atau default bawaan) — bukan dikosongkan seperti
          // apiKey, supaya admin langsung lihat & bisa edit nilainya.
          baseUrl: p.base_url || p.default_base_url || "",
        };
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

    const providerOption = (providers?.providers || []).find(
      (p) => p.provider === providerKey
    );

    const draft = configDrafts[providerKey] || {};
    const trimmedKey = (draft.apiKey || "").trim();
    const trimmedModel = (draft.model || "").trim();
    const trimmedBaseUrl = (draft.baseUrl || "").trim();
    const supportsBaseUrl = !!providerOption?.configurable_base_url;

    if (!trimmedModel) {
      setConfigError((prev) => ({
        ...prev,
        [providerKey]: "Nama model wajib diisi",
      }));
      return;
    }

    if (supportsBaseUrl && !trimmedBaseUrl) {
      setConfigError((prev) => ({
        ...prev,
        [providerKey]: "Alamat server wajib diisi (atau tekan \"Kembalikan ke Default\")",
      }));
      return;
    }

    try {
      setConfigSaving((prev) => ({ ...prev, [providerKey]: true }));

      // Kalau input key dikosongkan, jangan kirim api_key sama
      // sekali (undefined) supaya key lama yang sudah tersimpan
      // di database tidak ikut terhapus hanya karena admin cuma
      // mau ganti nama model. baseUrl cuma dikirim untuk provider
      // yang memang mendukungnya (mis. Ollama).
      const data = await updateProviderConfig(providerKey, {
        apiKey: trimmedKey ? trimmedKey : undefined,
        model: trimmedModel,
        baseUrl: supportsBaseUrl ? trimmedBaseUrl : undefined,
      });

      setProviders(data);

      const updated = data.providers.find((p) => p.provider === providerKey);

      setConfigDrafts((prev) => ({
        ...prev,
        [providerKey]: {
          apiKey: "",
          model: updated?.model || trimmedModel,
          baseUrl: updated?.base_url || updated?.default_base_url || trimmedBaseUrl,
        },
      }));

      setConfigSuccess((prev) => ({
        ...prev,
        [providerKey]: trimmedKey
          ? "API key & model berhasil disimpan."
          : "Pengaturan berhasil diperbarui.",
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


  // Kembalikan alamat server (base URL) provider ke default bawaan
  // (mesin sendiri, mis. http://localhost:11434) — mengirim base_url
  // kosong secara eksplisit supaya backend menghapus override yang
  // tersimpan, BUKAN cuma mengosongkan input di layar.
  async function handleResetBaseUrl(providerKey) {
    setConfigError((prev) => ({ ...prev, [providerKey]: "" }));
    setConfigSuccess((prev) => ({ ...prev, [providerKey]: "" }));

    try {
      setConfigSaving((prev) => ({ ...prev, [providerKey]: true }));

      const data = await updateProviderConfig(providerKey, { baseUrl: "" });

      setProviders(data);

      const updated = data.providers.find((p) => p.provider === providerKey);

      setConfigDrafts((prev) => ({
        ...prev,
        [providerKey]: {
          ...prev[providerKey],
          baseUrl: updated?.base_url || updated?.default_base_url || "",
        },
      }));

      setConfigSuccess((prev) => ({
        ...prev,
        [providerKey]: `Alamat server dikembalikan ke default (${updated?.default_base_url || "mesin sendiri"}).`,
      }));
    } catch (err) {
      console.error("RESET BASE URL ERROR:", err);
      setConfigError((prev) => ({
        ...prev,
        [providerKey]: err.message || "Gagal mengembalikan alamat default",
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
            {visibleTabs.map((tab) => {
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
                const draft = configDrafts[option.provider] || { apiKey: "", model: "", baseUrl: "" };
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

                    {option.configurable_base_url && (
                      <div className="form-group" style={{ marginBottom: 18 }}>
                        <label>Alamat Server (Base URL)</label>

                        <input
                          type="text"
                          value={draft.baseUrl}
                          onChange={(e) => updateDraft(option.provider, "baseUrl", e.target.value)}
                          placeholder={option.default_base_url || "http://localhost:11434"}
                          autoComplete="off"
                        />

                        <small style={{ color: "#6b7280" }}>
                          Kosongkan lalu klik "Kembalikan ke Default" untuk
                          pakai mesin sendiri ({option.default_base_url || "http://localhost:11434"}).
                          Untuk production, isi manual dengan alamat server
                          tempat Ollama benar-benar berjalan, mis.{" "}
                          <code>http://ollama:11434</code> (service Docker
                          Compose) atau <code>http://10.0.0.5:11434</code>{" "}
                          (server terpisah di jaringan).
                        </small>
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                      }}
                    >
                      {option.configurable_base_url && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={isSaving}
                          onClick={() => handleResetBaseUrl(option.provider)}
                        >
                          Kembalikan ke Default
                        </button>
                      )}

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

          {/* ============================================= */}
          {/* TAB: KEAMANAN — SECRET_KEY (JWT)               */}
          {/* ============================================= */}

          {activeTab === "security" && (
            <div
              className="dashboard-card"
              style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <IconShield size={18} />
                SECRET_KEY
              </h2>

              <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                Kunci rahasia untuk menandatangani sesi login (JWT) seluruh
                aplikasi. Tersimpan di database — tidak perlu edit file .env
                atau restart server untuk menggantinya.
              </p>

              <div
                style={{
                  backgroundColor: "#fff3cd",
                  color: "#856404",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  marginBottom: "20px",
                }}
              >
                ⚠️ Menyimpan atau merotasi SECRET_KEY langsung membuat{" "}
                <strong>semua sesi login yang sedang aktif tidak valid</strong>{" "}
                — termasuk sesi Anda sendiri (Anda akan diminta login ulang),
                guru, dan siswa yang mungkin sedang mengerjakan tryout.
                Sebaiknya lakukan di luar jam ujian.
              </div>

              {secretKeyError && (
                <div className="error-message" style={{ marginBottom: 18 }}>
                  {secretKeyError}
                </div>
              )}

              {secretKeyLoading ? (
                <p style={{ color: "#6b7280", fontSize: 13 }}>Memuat status...</p>
              ) : (
                <>
                  <div
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      marginBottom: 22,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ marginBottom: 4 }}>
                      <strong>Key saat ini:</strong>{" "}
                      <code>{secretKeyStatus?.masked_key || "-"}</code>
                    </div>

                    {secretKeyStatus?.updated_at && (
                      <div style={{ color: "#6b7280" }}>
                        Terakhir diganti:{" "}
                        {new Date(secretKeyStatus.updated_at).toLocaleString("id-ID")}
                        {secretKeyStatus?.changed_by
                          ? ` oleh @${secretKeyStatus.changed_by}`
                          : ""}
                      </div>
                    )}
                  </div>

                  {/* ROTASI OTOMATIS */}

                  <div style={{ marginBottom: 26 }}>
                    <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
                      Rotasi Otomatis
                    </label>
                    <p style={{ marginTop: 0, marginBottom: 12, color: "#6b7280", fontSize: 13 }}>
                      Generate key acak baru secara otomatis — cara yang
                      direkomendasikan untuk rotasi rutin, tidak perlu
                      mengetik apa pun.
                    </p>

                    {secretKeyConfirm === "rotate" ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, color: "#721c24" }}>
                          Yakin? Semua orang akan ter-logout.
                        </span>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={rotatingSecretKey}
                          onClick={() => setSecretKeyConfirm(null)}
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={rotatingSecretKey}
                          onClick={handleRotateSecretKey}
                        >
                          {rotatingSecretKey ? "Merotasi..." : "Ya, Rotasi Sekarang"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={rotatingSecretKey}
                        onClick={() => setSecretKeyConfirm("rotate")}
                      >
                        <IconRefresh size={15} />
                        Rotasi Otomatis
                      </button>
                    )}
                  </div>

                  {/* ISI MANUAL */}

                  <div>
                    <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 6 }}>
                      Isi Manual
                    </label>
                    <p style={{ marginTop: 0, marginBottom: 12, color: "#6b7280", fontSize: 13 }}>
                      Tempel SECRET_KEY Anda sendiri (mis. untuk menyamakan
                      dengan environment lain). Minimal 32 karakter.
                    </p>

                    <div className="form-group" style={{ marginBottom: 14 }}>
                      <input
                        type="password"
                        value={secretKeyDraft}
                        onChange={(e) => setSecretKeyDraft(e.target.value)}
                        placeholder="Tempel SECRET_KEY baru di sini"
                        autoComplete="off"
                      />
                    </div>

                    {secretKeyConfirm === "save" ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, color: "#721c24" }}>
                          Yakin? Semua orang akan ter-logout.
                        </span>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={savingSecretKey}
                          onClick={() => setSecretKeyConfirm(null)}
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={savingSecretKey}
                          onClick={handleSaveSecretKey}
                        >
                          {savingSecretKey ? "Menyimpan..." : "Ya, Simpan Sekarang"}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={savingSecretKey || secretKeyDraft.trim().length < 32}
                          onClick={() => setSecretKeyConfirm("save")}
                        >
                          Simpan
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ============================================= */}
          {/* TAB: BACKUP — BACKUP DATABASE SQLITE           */}
          {/* ============================================= */}

          {activeTab === "backup" && (
            <div
              className="dashboard-card"
              style={{ maxWidth: "800px", margin: "0 auto", padding: "24px" }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <IconClipboard size={18} />
                Backup Database
              </h2>

              <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                Backup otomatis berjalan sendiri tiap 24 jam di server.
                Gunakan tombol di bawah untuk membuat backup tambahan
                kapan saja — misalnya sebelum mengganti SECRET_KEY atau
                menghapus data dalam jumlah besar.
                {retentionDays != null && (
                  <> Backup lebih tua dari {retentionDays} hari otomatis dihapus.</>
                )}
              </p>

              {backupActionError && (
                <div className="error-message" style={{ marginBottom: 18 }}>
                  {backupActionError}
                </div>
              )}

              {backupActionSuccess && (
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
                  {backupActionSuccess}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
                <button
                  type="button"
                  className="primary-button"
                  disabled={creatingBackup}
                  onClick={handleCreateBackupNow}
                >
                  {creatingBackup ? "Membuat Backup..." : "Backup Sekarang"}
                </button>
              </div>

              {backupsError && (
                <div className="error-message" style={{ marginBottom: 18 }}>
                  {backupsError}
                </div>
              )}

              {backupsLoading ? (
                <p style={{ color: "#6b7280", fontSize: 13 }}>Memuat daftar backup...</p>
              ) : backups.length === 0 ? (
                <p style={{ color: "#6b7280", fontSize: 13 }}>
                  Belum ada backup. Klik "Backup Sekarang" di atas, atau
                  tunggu jadwal otomatis berikutnya.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {backups.map((backup) => (
                    <div
                      key={backup.filename}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        padding: "10px 14px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {backup.filename}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          {new Date(backup.created_at).toLocaleString("id-ID")}
                          {" · "}
                          {formatBytes(backup.size_bytes)}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={downloadingFilename === backup.filename}
                        onClick={() => handleDownloadBackup(backup.filename)}
                      >
                        {downloadingFilename === backup.filename
                          ? "Mengunduh..."
                          : "Download"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================= */}
          {/* TAB: JARINGAN — AKSES DARI LAPTOP LAIN (WIFI)  */}
          {/* ============================================= */}

          {activeTab === "network" && (
            <div
              className="dashboard-card"
              style={{ maxWidth: "700px", margin: "0 auto", padding: "24px" }}
            >
              {(!networkInfo || networkInfo.mode !== "development") && (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <IconWifi size={18} />
                    Akses dari Laptop Lain
                  </h2>

                  <p style={{ marginTop: 0, marginBottom: 22, color: "#6b7280", fontSize: 13 }}>
                    Bagikan alamat di bawah ini ke laptop/HP lain yang
                    terhubung ke <strong>WiFi yang sama</strong> dengan
                    laptop ini, supaya mereka bisa membuka aplikasi tanpa
                    install apa pun.
                  </p>
                </>
              )}

              {networkError && (
                <div className="error-message" style={{ marginBottom: 18 }}>
                  {networkError}
                </div>
              )}

              {networkLoading ? (
                <p style={{ color: "#6b7280", fontSize: 13 }}>Mendeteksi alamat jaringan...</p>
              ) : (
                <>
                  {/* STATUS SERVER */}

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      marginBottom: 22,
                    }}
                  >
                    <strong style={{ fontSize: 13, marginBottom: 4 }}>
                      {networkInfo
                        ? networkInfo.mode === "development"
                          ? "Server lokal / development"
                          : "Server sedang berjalan"
                        : "Server tidak terdeteksi"}
                    </strong>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: networkInfo ? "#16a34a" : "#dc2626",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 13, color: "#6b7280" }}>
                        {networkInfo
                          ? `Laptop ini: ${networkInfo.hostname} · Backend port ${networkInfo.backend_port} · Frontend port ${networkInfo.frontend_port}`
                          : "Muat ulang halaman ini setelah backend & frontend dijalankan."}
                      </span>
                    </div>

                    {networkInfo && networkInfo.addresses.length > 0 && (
                      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                        {networkInfo.addresses
                          .map((addr) => `${addr.interface} — ${addr.ip}`)
                          .join(" · ")}
                      </div>
                    )}
                  </div>

                  {networkInfo && networkInfo.mode !== "development" && (
                    <>
                      {/* DAFTAR ALAMAT IP */}

                      {networkInfo.addresses.length > 0 ? (
                        <div style={{ marginBottom: 26 }}>
                          <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 10 }}>
                            Alamat untuk Dibagikan
                          </label>

                          {networkInfo.addresses.map((addr) => (
                            <div
                              key={addr.ip}
                              style={{
                                border: "1px solid var(--line)",
                                borderRadius: 8,
                                padding: "14px 16px",
                                marginBottom: 12,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <code
                                  style={{
                                    flex: 1,
                                    minWidth: 220,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    padding: "8px 10px",
                                    background: "#f3f4f6",
                                    borderRadius: 6,
                                  }}
                                >
                                  {addr.frontend_url}
                                </code>

                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => handleCopyUrl(addr.frontend_url)}
                                >
                                  {copiedUrl === addr.frontend_url ? (
                                    <>
                                      <IconCheck size={14} /> Tersalin
                                    </>
                                  ) : (
                                    "Salin Link"
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="error-message" style={{ marginBottom: 22 }}>
                          Tidak ada IP jaringan lokal yang terdeteksi. Pastikan
                          laptop ini sudah terhubung ke WiFi (bukan cuma
                          Ethernet/hotspot pribadi), lalu muat ulang tab ini.
                        </div>
                      )}

                      {/* LANGKAH-LANGKAH */}

                      <div>
                        <label style={{ fontWeight: 600, fontSize: 14, display: "block", marginBottom: 10 }}>
                          Cara Mengakses dari Laptop Lain
                        </label>

                        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#374151", lineHeight: 1.9, textAlign: "left" }}>
                          <li>Pastikan laptop lain terhubung ke <strong>WiFi yang sama</strong> dengan laptop ini.</li>
                          <li>Jalankan project ini dengan <code>python run_server.py</code> (BUKAN <code>run.py</code> biasa) — cuma <code>run_server.py</code> yang membuka akses ke WiFi.</li>
                          <li>Pastikan backend & frontend masih berjalan di laptop ini (jangan ditutup terminalnya).</li>
                          <li>Buka browser di laptop lain, lalu ketik/tempel salah satu alamat di atas.</li>
                          <li>Login seperti biasa — data (soal, tryout, nilai) sama persis karena mengakses server yang sama.</li>
                        </ol>

                        <div
                          style={{
                            backgroundColor: "#fff3cd",
                            color: "#856404",
                            padding: "10px 12px",
                            borderRadius: "6px",
                            fontSize: "13px",
                            marginTop: "18px",
                          }}
                        >
                          ⚠️ Kalau laptop lain tetap tidak bisa connect, kemungkinan
                          besar <strong>Windows Firewall</strong> di laptop ini
                          memblokir port {networkInfo?.backend_port ?? 8000} &{" "}
                          {networkInfo?.frontend_port ?? 5173}. Izinkan akses saat
                          muncul pop-up "Windows Defender Firewall" ketika server
                          pertama kali dijalankan, atau tambahkan izin manual lewat
                          Control Panel &gt; Windows Defender Firewall &gt; Allow an
                          app.
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

        </div>

      </main>
    </div>
  );
}

export default AdminSettings;
