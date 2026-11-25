import React, { useEffect, useRef, useState } from 'react'
import { login, me, register, type User } from './api'
import './App.css'

type Mode = "login" | "register"

type ChatMessage = {
  user: string
  text: string
}

function App() {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"))
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  // Состояния для чата
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [wsConnected, setWsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!token) { setUser(null); return }
    me()
      .then(setUser)
      .catch(() => { localStorage.removeItem('token'); setToken(null); });
  }, [token])

  // Подключение к Go WebSocket-чату после входа
  useEffect(() => {
    if (!token || !user) return

    const ws = new WebSocket(`ws://localhost:8080/ws?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    ws.onmessage = (event) => {
      try {
        const msg: ChatMessage = JSON.parse(event.data)
        setMessages((prev) => [...prev, msg])
      } catch (e) {
        console.error("Ошибка чтения сообщения:", e)
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [token, user])

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify({ text: chatInput.trim() }))
    setChatInput("")
  }

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
    setToken(null); setUser(null); setPassword(""); setMessages([]);
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
    <div className="page" style={{ gap: "20px", flexWrap: "wrap" }}>
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

      {/* Блок живого чата */}
      <div className="card" style={{ width: "360px", display: "flex", flexDirection: "column", height: "420px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Чат стрима</h2>
          <span style={{ fontSize: "12px", color: wsConnected ? "#4ade80" : "#f87171" }}>
            {wsConnected ? "● Подключено" : "● Отключено"}
          </span>
        </div>

        <div style={{
          flex: 1,
          overflowY: "auto",
          background: "rgba(0,0,0,0.25)",
          borderRadius: "8px",
          padding: "10px",
          marginBottom: "10px",
          textAlign: "left"
        }}>
          {messages.length === 0 ? (
            <p style={{ opacity: 0.5, fontSize: "14px" }}>Сообщений пока нет...</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} style={{ marginBottom: "6px", fontSize: "14px", wordBreak: "break-word" }}>
                <b style={{ color: "#a855f7" }}>{m.user}: </b>
                <span>{m.text}</span>
              </div>
            ))
          )}
        </div>

        <form onSubmit={sendMessage} style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Написать в чат..."
            style={{ flex: 1 }}
          />
          <button type="submit" className="submit" style={{ width: "auto", padding: "0 16px", marginTop: 0 }}>
            ➤
          </button>
        </form>
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
