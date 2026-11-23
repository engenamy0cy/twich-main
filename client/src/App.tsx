import React, { useEffect, useState } from 'react'
import { login, me, register, type User } from './api'
import './App.css'

type Mode = "login" | "register"

function App() {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"))
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) { setUser(null); return }
    me()
      .then(setUser)
      .catch(() => { localStorage.removeItem('token'); setToken(null); });
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "register") {
        await register(email, password);
        setNotice("Аккаунт создан входим")
      }
      const { access_token } = await login(email, password)
      localStorage.setItem("token", access_token);
      setToken(access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "случилась какая-то ошибка")
    } finally {
      setBusy(false)
    }
  }

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null); setUser(null); setPassword("");
  }

  if (token && !user) return (
    <div className="page">
      <div className="card loader-card">
        <div className="spinner"></div>
        <p>Проверяем токен...</p>
      </div>
    </div>
  )

  if (token && user) return (
    <div className="page">
      <div className="card profile-card">
        <div className="badge">ONLINE</div>
        <div className="avatar">{user.email[0].toUpperCase()}</div>
        <h1>Ты в системе</h1>
        <div className="info-box">
          <div className="info-row">
            <span>ID пользователя</span>
            <b>#{user.id}</b>
          </div>
          <div className="info-row">
            <span>Email</span>
            <b>{user.email}</b>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>Выйти из аккаунта</button>
      </div>
    </div>
  )

  return (
    <div className="page">
      <form className="card" onSubmit={submit}>
        <div className="logo">
          <span className="dot"></span>
          <h1>STREAM HUB</h1>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => { setMode('login'); setError(""); setNotice("") }}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => { setMode('register'); setError(""); setNotice("") }}
          >
            Регистрация
          </button>
        </div>

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="введите email"
          />
        </div>

        <div className="field">
          <label>Пароль</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="минимум 8 символов"
          />
        </div>

        <button className="submit" disabled={busy}>
          {busy ? "Подожди..." : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>

        {error && <div className="msg error">{error}</div>}
        {notice && !error && <div className="msg notice">{notice}</div>}
      </form>
    </div>
  )
}

export default App
