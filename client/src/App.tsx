import { useEffect, useRef, useState, type FormEvent } from 'react'
import Hls from 'hls.js'
import { login, me, register, type User } from './api'
import './App.css'

type Mode = 'login' | 'register'
type StreamStatus = 'connecting' | 'live' | 'offline'

const statusText: Record<StreamStatus, string> = {
  connecting: 'ПОДКЛЮЧАЕМСЯ',
  live: 'В ЭФИРЕ',
  offline: 'НЕТ СИГНАЛА',
}

const rtmpServer = 'rtmp://127.0.0.1:1935/live'

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

  const [streamKey, setStreamKey] = useState('')
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting')
  const [retry, setRetry] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const hlsHost = isLocal ? '127.0.0.1' : window.location.hostname
  const hlsUrl = `http://${hlsHost}:8888/live/${streamKey}/index.m3u8`

  useEffect(() => {
    const video = videoRef.current
    if (!user || !streamKey || !video) return

    setStreamStatus('connecting')

    const onLoaded = () => setStreamStatus('live')

    const scheduleRetry = () => {
      setStreamStatus('offline')
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = setTimeout(() => {
        hlsRef.current?.destroy()
        hlsRef.current = null
        start()
      }, 4000)
    }

    const start = () => {
      if (!video) return
      if (Hls.isSupported()) {
        hlsRef.current = new Hls({ lowLatencyMode: true })
        hlsRef.current.loadSource(hlsUrl)
        hlsRef.current.attachMedia(video)
        hlsRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
          setStreamStatus('live')
          void video.play().catch(() => {})
        })
        hlsRef.current.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            hlsRef.current?.destroy()
            hlsRef.current = null
            scheduleRetry()
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl
        video.addEventListener('loadedmetadata', onLoaded)
        video.addEventListener('error', scheduleRetry)
        void video.play().catch(() => {})
      } else {
        setStreamStatus('offline')
      }
    }

    start()

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', scheduleRetry)
      video.removeAttribute('src')
      video.load()
    }
  }, [hlsUrl, user, retry])

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
                  <p>{streamStatus === 'connecting' ? 'Подключаемся...' : 'Эфира нет (поиск сигнала...)'}</p>
                  {streamStatus === 'offline' && (
                    <button className="solid-btn" onClick={() => setRetry((n) => n + 1)}>Повторить сейчас</button>
                  )}
                </div>
              )}
            </div>

            <div className="card settings-card">
              <h2>Настройки OBS</h2>
              <div className="setting">
                <label>Сервер (для OBS на этом ПК)</label>
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
                <p className="hint">В OBS укажите тот же ключ потока.</p>
              </div>
              {notice && <p className="notice-line">{notice}</p>}
            </div>
          </section>
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