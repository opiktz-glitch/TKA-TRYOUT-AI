import { useLocation } from "react-router-dom";

import LoginForm from "../components/LoginForm";

import { useAuth } from "../auth/AuthContext";


function Login() {

  const { login } =
    useAuth();

  const location = useLocation();

  // Pesan opsional dari halaman lain yang me-redirect ke sini,
  // mis. AdminSettings.jsx setelah SECRET_KEY diganti (semua
  // sesi login dipaksa logout, termasuk admin yang mengganti).
  const infoMessage = location.state?.message;


  return (
    <LoginForm
      onLogin={login}
      infoMessage={infoMessage}
    />
  );

}


export default Login;