import LoginForm from "../components/LoginForm";

import { useAuth } from "../auth/AuthContext";


function Login() {

  const { login } =
    useAuth();


  return (
    <LoginForm
      onLogin={login}
    />
  );

}


export default Login;