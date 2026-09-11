import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";

import {
  login as apiLogin,
  getCurrentUser
} from "../services/api";


const AuthContext = createContext(null);


export function AuthProvider({
  children
}) {

  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);


  // ==========================================
  // CEK TOKEN
  // ==========================================

  useEffect(() => {

    checkLogin();

  }, []);


  const checkLogin = async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error(error);
      localStorage.removeItem("access_token");
    } finally {
      setLoading(false);
    }
  };


  // ==========================================
  // LOGOUT
  // (dideklarasikan lebih awal supaya bisa
  // dipakai oleh listener sesi kedaluwarsa)
  // ==========================================

  const logout = () => {

    localStorage.removeItem(
      "access_token"
    );

    setUser(null);

  };


  // ==========================================
  // SESI KEDALUWARSA (GLOBAL)
  //
  // api.js akan broadcast event ini kapan pun
  // backend membalas 401 di halaman mana pun.
  // Begitu user di-set null, ProtectedRoute di
  // App.jsx otomatis mengarahkan ke /login —
  // tidak perlu navigate() manual di sini.
  // ==========================================

  useEffect(() => {

    function handleUnauthorized() {
      setUser(null);
    }

    window.addEventListener(
      "auth:unauthorized",
      handleUnauthorized
    );

    return () => {
      window.removeEventListener(
        "auth:unauthorized",
        handleUnauthorized
      );
    };

  }, []);


  // ==========================================
  // LOGIN
  // ==========================================

  const login = async (username, password) => {
    const data = await apiLogin(username, password);

    if (data.success) {
      localStorage.setItem("access_token", data.access_token);

      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error("Gagal memuat data user setelah login:", error);
      }

      return {
        success: true,
        message: "benar"
      };
    }

    return {
      success: false,
      message: data.message
    };
  };


  // ==========================================
  // REFRESH USER
  // Dipakai setelah update profil (mis. dari
  // halaman Pengaturan) supaya nama di Sidebar
  // ikut ter-update tanpa perlu login ulang.
  // ==========================================

  const refreshUser = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error("Gagal memuat ulang data user:", error);
    }
  };


  return (

    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser
      }}
    >

      {children}

    </AuthContext.Provider>

  );

}


export function useAuth() {

  return useContext(
    AuthContext
  );

}
