import { useState } from "react";
import api from "../services/api";
import "./AuthPage.css";

function LoginPage({ onSwitchToRegister, onLoginSuccess}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const res = await api.post("/auth/login", {
        username,
        password,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role);

      setMessage("Login successful ✅");
      onLoginSuccess();
    } catch (error) {
      setMessage("Login failed ❌");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">

        <h1 className="auth-title">
          Document Intelligence
        </h1>

        <p className="auth-subtitle">
          Login to manage your documents
        </p>

        <form onSubmit={handleLogin}>

          <div className="form-group">
            <label>Username</label>

            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="auth-button" type="submit">
            Login
          </button>

        </form>

        {message && (
          <p className="message">
            {message}
          </p>
        )}

        <div className="auth-footer">
          New here?{" "}

          <span
            className="auth-link"
            onClick={onSwitchToRegister}
          >
            Create account
          </span>
        </div>

      </div>
    </div>
  );
}

export default LoginPage;