import { useState } from "react";


function LoginForm({
  onLogin
}) {

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [formError, setFormError] =
    useState("");


  const handleSubmit = async (
    event
  ) => {

    event.preventDefault();

    setFormError("");


    if (!username || !password) {

      setFormError(
        "Username dan password harus diisi"
      );

      return;

    }


    setLoading(true);


    try {

      const result =
        await onLogin(
          username,
          password
        );


      if (!result.success) {

        setFormError(
          result.message ||
          "Username atau password salah"
        );

      }

      // Kalau berhasil, tidak perlu menampilkan apa pun di
      // sini — AuthContext akan meng-update state user, dan
      // App.jsx otomatis mengarahkan ke /dashboard.

    } catch (error) {

      console.error(error);

      setFormError(
        error.message ||
        "Tidak dapat terhubung ke server"
      );

    } finally {

      setLoading(false);

    }

  };


  return (

    <div className="login-container">

      <div className="login-box">

        <h2>Login</h2>


        <form
          onSubmit={handleSubmit}
        >

          <div className="form-group">

            <label>
              User Name
            </label>

            <input
              type="text"

              value={username}

              onChange={(e) =>
                setUsername(
                  e.target.value
                )
              }

              placeholder={
                "Masukkan user name"
              }

              autoFocus
            />

          </div>


          <div className="form-group">

            <label>
              Password
            </label>

            <input
              type="password"

              value={password}

              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }

              placeholder={
                "Masukkan password"
              }
            />

          </div>


          {/* ERROR — inline, mengikuti pola UserManagement.jsx */}

          {formError && (

            <div
              className="form-error-message"
              style={{ marginBottom: "15px" }}
            >
              {formError}
            </div>

          )}


          <button
            type="submit"
            disabled={loading}
          >

            {loading
              ? "Proses..."
              : "OK"}

          </button>

        </form>

      </div>

    </div>

  );

}


export default LoginForm;