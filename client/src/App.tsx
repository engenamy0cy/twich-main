import { useEffect, useRef, useState, type FormEvent } from 'react'
import Hls from 'hls.js'
import { login, me, register, type User } from './api'
import './App.css'

type Mode = 'login' | 'register'
type ChatMessage = { user: string; text: string }
type StreamStatus = 'connecting' | 'live' | 'offline'

const statusText: Record<StreamStatus, string> = {
  connecting: 'ПОДКЛЮЧАЕМСЯ',
  live: 'В ЭФИРЕ',
  offline: 'НЕТ СИГНАЛА',
}

const host =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '127.0.0.1'
    : window.location.hostname

const rtmpServer = `rtmp://${host}:1935/live`

function makeStreamKey(id: number) {
  let seed = ((id + 1) * 2654435761) >>> 0
  const part = (length: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed.toString(16).padStart(8, '0').slice(0, length)
  }
  return `${part(8)}-${part(4)}-4${part(3)}-a${part(3)}-${part(8)}${part(4)}`
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text)
}

function App() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [wsConnected, setWsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const [streamKey, setStreamKey] = useState('')
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting')
  const [retry, setRetry] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }
    me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('token')
        setToken(null)
      })
  }, [token])

  useEffect(() => {
    if (user) setStreamKey(makeStreamKey(user.id))
  }, [user])

  useEffect(() => {
    if (!token || !user) return

    const ws = new WebSocket(`ws://${host}:8080/ws?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    ws.onmessage = (event) => {
      try {
        const msg: ChatMessage = JSON.parse(event.data)
        setMessages((prev) => [...prev, msg])
      } catch {
        setMessages((prev) => prev)
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [token, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const hlsUrl = `http://${host}:8888/live/${streamKey}/index.m3u8`

  useEffect(() => {
    const video = videoRef.current
    if (!user || !streamKey || !video) return

    setStreamStatus('connecting')
    let hls: Hls | null = null

    const onLoaded = () => setStreamStatus('live')
    const onError = () => setStreamStatus('offline')

    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true })
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamStatus('live')
        void video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setStreamStatus('offline')
          hls?.destroy()
          hls = null
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl
      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onError)
      void video.play().catch(() => {})
    } else {
      setStreamStatus('offline')
    }

    return () => {
      hls?.destroy()
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video.load()
    }
  }, [hlsUrl, retry, user, streamKey])

  const sendMessage = (e: FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ text: chatInput.trim() }))
    setChatInput('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'register') {
        await register(email, password)
        setNotice('Аккаунт создан')
      }
      const { access_token } = await login(email, password)
      localStorage.setItem('token', access_token)
      setToken(access_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так')
    } finally {
      setBusy(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    setPassword('')
    setMessages([])
    setNotice('')
  }

  if (token && !user) {
    return (
      <div className="page">
        <div className="loader">
          <div className="spinner" />
          <p>Проверяем токен...</p>
        </div>
      </div>
    )
  }

  if (token && user) {
    return (
      <div className="app">
        <header className="header">
          <div className="brand">
            <span className="brand-mark">O</span>
            <span>OnlyTwitch</span>
          </div>
          <div className="header-user">
            <span className="avatar">{user.email[0].toUpperCase()}</span>
            <div className="user-info">
              <strong>{user.email}</strong>
              <span>ID: {user.id}</span>
            </div>
            <button className="outline-btn" onClick={logout}>Выйти</button>
          </div>
        </header>

        <main className="layout">
          <section className="stream-section">
            <div className="stream-heading">
              <h1>Эфир: {user.email}</h1>
              <span className={`status status-${streamStatus}`}>{statusText[streamStatus]}</span>
            </div>

            <div className="player">
              <video ref={videoRef} muted autoPlay playsInline controls />
              {streamStatus !== 'live' && (
                <div className="player-overlay">
                  <p>{streamStatus === 'connecting' ? 'Подключаемся...' : 'Эфира нет'}</p>
                  {streamStatus === 'offline' && (
                    <button className="solid-btn" onClick={() => setRetry((n) => n + 1)}>Повторить</button>
                  )}
                </div>
              )}
            </div>

            <div className="card settings-card">
              <h2>Настройки OBS</h2>
              <div className="setting">
                <label>Сервер</label>
                <div className="setting-row">
                  <input readOnly value={rtmpServer} />
                  <button className="outline-btn" onClick={() => copy(rtmpServer)}>Копировать</button>
                </div>
              </div>
              <div className="setting">
                <label>Ключ потока</label>
                <div className="setting-row">
                  <input value={streamKey} onChange={(e) => setStreamKey(e.target.value)} />
                  <button className="outline-btn" onClick={() => copy(streamKey)}>Копировать</button>
                </div>
                <p className="hint">Можно вставить свой ключ — плеер подключится к этому видео.</p>
              </div>
              {notice && <p className="notice-line">{notice}</p>}
            </div>
          </section>

          <aside className="card chat-card">
            <div className="chat-head">
              <h2>Чат стрима</h2>
              <span className={wsConnected ? 'chat-online' : 'chat-offline'}>
                {wsConnected ? 'Подключено' : 'Отключено'}
              </span>
            </div>
            <div className="messages">
              {messages.length === 0 ? (
                <p className="empty">Сообщений пока нет...</p>
              ) : (
                messages.map((m, i) => (
                  <div className="message" key={i}>
                    <b>{m.user}:</b> <span>{m.text}</span>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <form className="chat-form" onSubmit={sendMessage}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Написать в чат..."
              />
              <button type="submit" className="solid-btn">➤</button>
            </form>
          </aside>
        </main>
      </div>
    )
  }

  return (
    <div className="page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="logo">
          <span className="brand-mark">O</span>
          <h1>OnlyTwitch</h1>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(''); setNotice('') }}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(''); setNotice('') }}
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

        <button className="solid-btn auth-btn" disabled={busy}>
          {busy ? 'Подожди...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>

        {error && <div className="msg msg-error">{error}</div>}
        {notice && !error && <div className="msg msg-notice">{notice}</div>}
      </form>
    </div>
  )
}

export default App
