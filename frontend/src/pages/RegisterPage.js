import { useState } from "react";
import api from "../services/api";

function RegisterPage({ onSwitchToLogin }) {
  const [username, setUsername] = useState("");
   const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Viewer");
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
     await api.post('/auth/register', {
       username,
       email,
       password,
       role,
     });

      setMessage("Account created successfully ✅");
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("Viewer");
    } catch (error) {
      setMessage(error.response?.data?.message || "Registration failed ❌");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Create Account</h1>

        <p className="auth-subtitle">Register to start managing documents</p>

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>Username</label>

            <input
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Email</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="Choose a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Role</label>

            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="Viewer">Viewer</option>
              <option value="Editor">Editor</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          <button className="auth-button" type="submit">
            Create Account
          </button>
        </form>

        {message && <p className="message">{message}</p>}

        <div className="auth-footer">
          Already have an account?{' '}
          <span className="auth-link" onClick={onSwitchToLogin}>
            Login
          </span>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;