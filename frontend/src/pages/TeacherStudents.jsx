import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { IconBarChart } from "../components/Icons";

import { getStudentProfiles } from "../services/api";


function TeacherStudents() {
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");


  useEffect(() => {
    loadStudents();
  }, []);


  async function loadStudents() {
    try {
      setLoading(true);
      setError("");

      const data = await getStudentProfiles();

      setStudents(data);
    } catch (err) {
      console.error("LOAD STUDENTS ERROR:", err);
      setError(err.message || "Gagal memuat data siswa");
    } finally {
      setLoading(false);
    }
  }


  function viewScores(student) {
    navigate(`/teacher/scores?q=${encodeURIComponent(student.full_name)}`);
  }


  const filteredStudents = students.filter((item) => {
    const keyword = search.toLowerCase();

    return (
      item.full_name?.toLowerCase().includes(keyword) ||
      item.student_code?.toLowerCase().includes(keyword) ||
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
              <h1>Peserta</h1>
              <p>Daftar siswa yang terdaftar di sistem</p>
            </div>
          </div>

          <div className="dashboard-card">

            <div className="user-toolbar">
              <input
                type="text"
                placeholder="Cari nama / NIS / sekolah..."
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading && (
              <div className="loading-message">Memuat data siswa...</div>
            )}

            {error && <div className="error-message">{error}</div>}

            {!loading && !error && (
              <div className="table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>NIS</th>
                      <th>Nama</th>
                      <th>Sekolah</th>
                      <th>Kelas</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredStudents.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.student_code}</strong></td>
                        <td>{item.full_name}</td>
                        <td>{item.school_name || "-"}</td>
                        <td>
                          {item.grade || "-"}
                          {item.class_name ? ` / ${item.class_name}` : ""}
                        </td>
                        <td>
                          <button
                            className="secondary-button"
                            onClick={() => viewScores(item)}
                          >
                            <IconBarChart size={15} />
                            Lihat Nilai
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredStudents.length === 0 && (
                  <div className="empty-message">
                    {search ? "Siswa tidak ditemukan." : "Belum ada data siswa."}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </main>
    </div>
  );
}

export default TeacherStudents;
