import { useAuth } from "../auth/AuthContext";
import { NavLink } from "react-router-dom";

import {
  IconHome,
  IconUsers,
  IconBook,
  IconNotebook,
  IconClipboard,
  IconGraduationCap,
  IconBarChart,
  IconTrendingUp,
  IconSettings,
  IconLogOut,
  IconTarget,
  IconUser,
} from "./Icons";


function Sidebar() {

  const {
    user,
    logout
  } = useAuth();


  const role = user?.role;


  // =====================================================
  // CLASS MENU
  // NavLink otomatis memberikan status aktif
  // berdasarkan URL yang sedang dibuka.
  // =====================================================
  const menuClass = ({ isActive }) =>
    `menu-item${isActive ? " active" : ""}`;


  return (
    <aside className="sidebar">


      {/* =================================================
          LOGO
          ================================================= */}

      <div className="sidebar-logo">

        <div className="logo-icon">
          T
        </div>

        <div>

          <div className="logo-title">
            TKA TRYOUT
          </div>

          <div className="logo-subtitle">
            Management System
          </div>

        </div>

      </div>


      {/* =================================================
          MENU
          ================================================= */}

      <nav className="sidebar-menu">


        {/* =================================================
            UTAMA
            ================================================= */}

        <div className="menu-section">
          UTAMA
        </div>


        {/* Dashboard */}

        <NavLink
          to="/dashboard"
          className={menuClass}
        >

          <span className="menu-icon">
            <IconHome />
          </span>

          <span>
            Dashboard
          </span>

        </NavLink>


        {/* =================================================
            ADMIN
            ================================================= */}

        {role === "ADMIN" && (

          <>


            <div className="menu-section">
              ADMINISTRASI
            </div>


            {/* User Management */}

            <NavLink
              to="/users"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconUsers />
              </span>

              <span>
                User Management
              </span>

            </NavLink>


            {/* Mata Pelajaran */}

            <NavLink
              to="/subjects"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconBook />
              </span>

              <span>
                Mata Pelajaran
              </span>

            </NavLink>


            {/* Bank Soal */}

            <NavLink
              to="/questions"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconNotebook />
              </span>

              <span>
                Bank Soal
              </span>

            </NavLink>


            {/* Paket Tryout */}

            <NavLink
              to="/tryouts"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconClipboard />
              </span>

              <span>
                Paket Tryout
              </span>

            </NavLink>


            {/* Data Siswa */}

            <NavLink
              to="/students"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconGraduationCap />
              </span>

              <span>
                Data Siswa
              </span>

            </NavLink>


            {/* Data Guru */}

            <NavLink
              to="/teachers"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconUser />
              </span>

              <span>
                Data Guru
              </span>

            </NavLink>


            {/* Nilai */}

            <NavLink
              to="/admin/scores"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconBarChart />
              </span>

              <span>
                Nilai
              </span>

            </NavLink>


            {/* Laporan */}

            <NavLink
              to="/admin/reports"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconTrendingUp />
              </span>

              <span>
                Laporan
              </span>

            </NavLink>


            {/* =================================================
                SISTEM
                ================================================= */}

            <div className="menu-section">
              SISTEM
            </div>


            {/* Pengaturan */}

            <NavLink
              to="/admin/settings"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconSettings />
              </span>

              <span>
                Pengaturan
              </span>

            </NavLink>


          </>

        )}


        {/* =================================================
            GURU
            ================================================= */}

        {role === "GURU" && (

          <>


            <div className="menu-section">
              AKADEMIK
            </div>


            {/* Mata Pelajaran */}

            <NavLink
              to="/subjects"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconBook />
              </span>

              <span>
                Mata Pelajaran
              </span>

            </NavLink>


            {/* Bank Soal */}

            <NavLink
              to="/questions"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconNotebook />
              </span>

              <span>
                Bank Soal
              </span>

            </NavLink>


            {/* Paket Tryout */}

            <NavLink
              to="/tryouts"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconClipboard />
              </span>

              <span>
                Paket Tryout
              </span>

            </NavLink>


            {/* Peserta */}

            <NavLink
              to="/teacher/students"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconGraduationCap />
              </span>

              <span>
                Peserta
              </span>

            </NavLink>


            {/* Nilai */}

            <NavLink
              to="/teacher/scores"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconBarChart />
              </span>

              <span>
                Nilai
              </span>

            </NavLink>


            {/* Laporan */}

            <NavLink
              to="/teacher/reports"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconTrendingUp />
              </span>

              <span>
                Laporan
              </span>

            </NavLink>


          </>

        )}


        {/* =================================================
            SISWA
            ================================================= */}

        {role === "SISWA" && (

          <>


            <div className="menu-section">
              PEMBELAJARAN
            </div>


            {/* Daftar Tryout */}

            <NavLink
              to="/student/tryouts"
              className={menuClass}
            >
              <IconClipboard size={19} />
              <span>
                Daftar Tryout
              </span>
            </NavLink>
            
            
            {/* Tryout Saya */}

            <NavLink
              to="/student/my-tryouts"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconTarget />
              </span>

              <span>
                Tryout Saya
              </span>

            </NavLink>


            {/* Riwayat & Hasil Tryout */}

            <NavLink
              to="/student/history"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconBarChart />
              </span>

              <span>
                Riwayat &amp; Hasil
              </span>

            </NavLink>


            {/* =================================================
                AKUN
                ================================================= */}

            <div className="menu-section">
              AKUN
            </div>


            {/* Profil */}

            <NavLink
              to="/student/profile"
              className={menuClass}
            >

              <span className="menu-icon">
                <IconUser />
              </span>

              <span>
                Profil
              </span>

            </NavLink>


          </>

        )}

      </nav>


      {/* =================================================
          USER + LOGOUT
          ================================================= */}

      <div className="sidebar-bottom">


        <div className="sidebar-user">


          <div className="user-avatar">

            {user?.full_name
              ?.charAt(0)
              ?.toUpperCase()}

          </div>


          <div className="sidebar-user-info">

            <div className="sidebar-user-name">

              {user?.full_name}

            </div>


            <div className="sidebar-user-role">

              {user?.role}

            </div>

          </div>


        </div>


        {/* Logout */}

        <button
          className="sidebar-logout"
          onClick={logout}
        >

          <span style={{ display: "flex" }}>
            <IconLogOut size={16} />
          </span>

          Logout

        </button>


      </div>


    </aside>
  );
}


export default Sidebar;