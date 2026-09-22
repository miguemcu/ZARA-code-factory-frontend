import { useState, useEffect, useCallback, useRef } from 'react'
import {
  apiConfig, http,
  type LoginResponse, type UsuarioResponse, type RolResponse, type ScopeResponse,
  type CategoriaResponse, type TemplateResponse, type VarianteResponse,
  type TiendaResponse, type CentroDistribucionResponse, type CentroDistribucionConNodoResponse,
  type BodegaTiendaResponse, type SpringPage,
  type MfaActivarResponse, type MfaConfirmarResponse,
} from './api'

// ─── Types ─────────────────────────────────────────────────────────────────

type AuthState = 'login' | 'mfa' | 'app'
type View = 'perfil' | 'usuarios' | 'roles' | 'scopes' | 'categorias' | 'templates' | 'variantes' | 'tiendas' | 'centros' | 'bodegas'
type HttpStatus = 400 | 401 | 403 | 409 | 500 | 0

interface AppBanner { status: HttpStatus; mensaje: string }

// ─── Nav ────────────────────────────────────────────────────────────────────

const NAV: { title: string; items: { id: View; label: string }[] }[] = [
  { title: 'Autenticación', items: [{ id: 'perfil', label: 'Perfil / MFA' }] },
  {
    title: 'Usuarios & Permisos',
    items: [
      { id: 'usuarios', label: 'Usuarios' },
      { id: 'roles', label: 'Roles' },
      { id: 'scopes', label: 'Scopes' },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { id: 'categorias', label: 'Categorías' },
      { id: 'templates', label: 'Templates' },
      { id: 'variantes', label: 'Variantes' },
    ],
  },
  {
    title: 'Red Logística',
    items: [
      { id: 'tiendas', label: 'Tiendas' },
      { id: 'centros', label: 'Centros de Distribución' },
      { id: 'bodegas', label: 'Bodegas de Tienda' },
    ],
  },
]

// ─── Design tokens (inline — no external theme file needed) ─────────────────

const T = {
  ink: '#111111',
  muted: '#666666',
  faint: '#999999',
  rule: '#E2E2E2',
  surface: '#F9F9F9',
  canvas: '#FFFFFF',
  danger: '#B91C1C',
  warn: '#92400E',
}

// ─── Shared primitives ──────────────────────────────────────────────────────

function HR() {
  return <hr style={{ border: 'none', borderTop: `1px solid ${T.rule}`, margin: 0 }} />
}

function Mono({ children, size = 12 }: { children: React.ReactNode; size?: number }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: size, color: T.muted }}>{children}</span>
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 500, textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>
      {children}{required && <span style={{ color: T.ink, marginLeft: 2 }}>*</span>}
    </div>
  )
}

function Input({
  value, onChange, placeholder, type = 'text', mono, readOnly, autoFocus,
}: {
  value: string; onChange?: (v: string) => void; placeholder?: string
  type?: string; mono?: boolean; readOnly?: boolean; autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)}
      style={{
        border: `1px solid ${T.rule}`, background: T.canvas, color: T.ink,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: mono ? 13 : 14, padding: '9px 12px', width: '100%', outline: 'none',
        transition: 'border-color .15s',
      }}
      onFocus={e => (e.target.style.borderColor = T.ink)}
      onBlur={e => (e.target.style.borderColor = T.rule)}
    />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{ border: `1px solid ${T.rule}`, background: T.canvas, color: T.ink, fontFamily: 'var(--font-sans)', fontSize: 14, padding: '9px 12px', width: '100%', outline: 'none', appearance: 'none' }}
    >
      {children}
    </select>
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ border: `1px solid ${T.rule}`, background: T.canvas, color: T.ink, fontFamily: 'var(--font-sans)', fontSize: 14, padding: '9px 12px', width: '100%', outline: 'none', resize: 'vertical', transition: 'border-color .15s' }}
      onFocus={e => (e.target.style.borderColor = T.ink)}
      onBlur={e => (e.target.style.borderColor = T.rule)}
    />
  )
}

function Btn({
  children, variant = 'primary', small, onClick, type = 'button', disabled, loading,
}: {
  children: React.ReactNode; variant?: 'primary' | 'ghost' | 'danger'
  small?: boolean; onClick?: () => void; type?: 'button' | 'submit'
  disabled?: boolean; loading?: boolean
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-sans)', fontWeight: 500, letterSpacing: '0.04em',
    fontSize: small ? 12 : 13, padding: small ? '5px 12px' : '9px 20px',
    transition: 'background .15s, color .15s', gap: 6,
    opacity: disabled || loading ? 0.55 : 1,
  }
  const map: Record<string, React.CSSProperties> = {
    primary: { ...base, background: T.ink, color: T.canvas, borderColor: T.ink },
    ghost: { ...base, background: 'transparent', color: T.ink, borderColor: T.rule },
    danger: { ...base, background: 'transparent', color: T.danger, borderColor: T.danger },
  }
  return (
    <button style={map[variant]} onClick={onClick} type={type} disabled={disabled || loading}>
      {loading ? '…' : children}
    </button>
  )
}

function Badge({ value, variant = 'neutral' }: { value: string; variant?: 'neutral' | 'active' | 'inactive' | 'warn' }) {
  const colors: Record<string, [string, string]> = {
    neutral: [T.rule, T.ink],
    active: [T.ink, T.canvas],
    inactive: ['#DDDDDD', T.muted],
    warn: ['#FEF3C7', T.warn],
  }
  const [bg, fg] = colors[variant]
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', padding: '2px 8px', border: `1px solid ${fg === T.canvas ? T.ink : T.rule}`, background: bg, color: fg }}>
      {value}
    </span>
  )
}

// ─── Global error/info banner ───────────────────────────────────────────────

function Banner({ banner, onClose }: { banner: AppBanner; onClose: () => void }) {
  const cfg: Record<number, { label: string; side: string }> = {
    400: { label: '400 Bad Request', side: T.danger },
    401: { label: '401 No Autorizado', side: '#D97706' },
    403: { label: '403 Acceso Denegado', side: T.danger },
    409: { label: '409 Conflicto', side: '#7C3AED' },
    500: { label: '500 Error del Servidor', side: T.danger },
    0:   { label: 'Error de Conexión', side: T.muted },
  }
  const c = cfg[banner.status] ?? cfg[0]
  return (
    <div style={{ borderLeft: `3px solid ${c.side}`, background: T.surface, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: c.side, whiteSpace: 'nowrap', paddingTop: 1 }}>{c.label}</span>
        <span style={{ fontSize: 13, color: T.ink }}>{banner.mensaje}</span>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
    </div>
  )
}

// ─── Table primitives ───────────────────────────────────────────────────────

function THead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr style={{ borderBottom: `1px solid ${T.rule}` }}>
        {cols.map(c => (
          <th key={c} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, fontFamily: 'var(--font-sans)' }}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function TRow({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <tr
      style={{ background: hover ? T.surface : 'transparent', transition: 'background .1s', cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

function TD({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td style={{ padding: '11px 16px', fontSize: mono ? 12 : 13, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', color: T.ink, verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function EmptyRow({ cols, msg = 'Sin datos' }: { cols: number; msg?: string }) {
  return (
    <tr><td colSpan={cols} style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: T.faint }}>{msg}</td></tr>
  )
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr><td colSpan={cols} style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: T.faint }}>Cargando…</td></tr>
  )
}

// ─── Paginator ──────────────────────────────────────────────────────────────

function Paginator({ page, totalPages, totalElements, size, onPage }: {
  page: number; totalPages: number; totalElements: number; size: number; onPage: (p: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: `1px solid ${T.rule}`, fontSize: 12, color: T.muted }}>
      <span style={{ fontFamily: 'var(--font-mono)' }}>{totalElements} resultado{totalElements !== 1 ? 's' : ''} · {size} por página</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button onClick={() => onPage(page - 1)} disabled={page === 0} style={pagerBtn(page === 0)}>‹</button>
        <span style={{ padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Pág. {page + 1} de {Math.max(1, totalPages)}</span>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1} style={pagerBtn(page >= totalPages - 1)}>›</button>
      </div>
    </div>
  )
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return { border: `1px solid ${T.rule}`, background: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: '4px 10px', fontSize: 13, opacity: disabled ? 0.35 : 1, fontFamily: 'var(--font-sans)' }
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: T.canvas, border: `1px solid ${T.rule}`, width: '100%', maxWidth: wide ? 640 : 480, maxHeight: '90vh', overflow: 'auto', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── View shell ─────────────────────────────────────────────────────────────

function Shell({ title, action, banner, onBannerClose, children }: {
  title: string; action?: React.ReactNode; banner?: AppBanner | null
  onBannerClose?: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '26px 32px 20px', borderBottom: `1px solid ${T.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', color: T.ink, margin: 0 }}>{title}</h1>
        {action && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{action}</div>}
      </div>
      {banner && onBannerClose && (
        <div style={{ padding: '14px 32px 0' }}>
          <Banner banner={banner} onClose={onBannerClose} />
        </div>
      )}
      <div style={{ flex: 1, padding: '24px 32px' }}>{children}</div>
    </div>
  )
}

// ─── Date formatter ─────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
  } catch { return iso }
}

// ─── API URL Settings Bar ───────────────────────────────────────────────────

function ApiBar({ baseUrl, onChangeUrl }: { baseUrl: string; onChangeUrl: (url: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(baseUrl)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    onChangeUrl(draft.trim() || baseUrl)
    setEditing(false)
  }

  return (
    <div style={{ borderBottom: `1px solid ${T.rule}`, background: T.surface, padding: '6px 24px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 36 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: T.faint, textTransform: 'uppercase', flexShrink: 0 }}>API Endpoint</span>
      {editing ? (
        <form onSubmit={e => { e.preventDefault(); commit() }} style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.ink, background: T.canvas, border: `1px solid ${T.ink}`, padding: '3px 8px', flex: 1, outline: 'none' }}
            onBlur={commit}
          />
          <button type="submit" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, border: `1px solid ${T.ink}`, background: T.ink, color: T.canvas, padding: '3px 10px', cursor: 'pointer' }}>OK</button>
        </form>
      ) : (
        <>
          <span
            onClick={() => { setDraft(baseUrl); setEditing(true) }}
            title="Haz clic para editar"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.ink, cursor: 'text', padding: '2px 6px', border: `1px solid transparent`, transition: 'border-color .15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = T.rule)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
          >
            {baseUrl}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.faint }}>(clic para editar)</span>
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH VIEWS
// ════════════════════════════════════════════════════════════════════════════

function LoginView({ onLogin, onMfa, baseUrl, onChangeUrl }: {
  onLogin: (user: UsuarioResponse, token: string) => void
  onMfa: (challengeToken: string) => void
  baseUrl: string
  onChangeUrl: (url: string) => void
}) {
  const [email, setEmail] = useState('admin@supplychain.local')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Correo y contraseña son obligatorios.'); return }
    setError('')
    setLoading(true)
    const res = await http.postPublic<LoginResponse>('/auth/login', { email, password })
    setLoading(false)
    if (res.error) { setError(res.error.mensaje); return }
    const data = res.data!
    if (data.mfaRequerido) {
      onMfa(data.mfaChallengeToken!)
    } else {
      apiConfig.setToken(data.accessToken!)
      onLogin(data.usuario!, data.accessToken!)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: T.canvas }}>
      <ApiBar baseUrl={baseUrl} onChangeUrl={onChangeUrl} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 360, padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <Mono size={10}><span style={{ letterSpacing: '0.2em' }}>SISTEMA DE GESTIÓN</span></Mono>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: T.ink, marginTop: 10 }}>RETAIL OS</div>
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && <div style={{ fontSize: 13, color: T.danger, borderLeft: `2px solid ${T.danger}`, paddingLeft: 10 }}>{error}</div>}
            <div>
              <Label required>Correo Electrónico</Label>
              <Input value={email} onChange={setEmail} type="email" placeholder="usuario@empresa.com" />
            </div>
            <div>
              <Label required>Contraseña</Label>
              <Input value={password} onChange={setPassword} type="password" placeholder="••••••••" />
            </div>
            <button
              type="submit" disabled={loading}
              style={{ background: T.ink, color: T.canvas, border: 'none', padding: 11, fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, letterSpacing: '0.06em', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'VERIFICANDO…' : 'INICIAR SESIÓN'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: T.faint }}>
              POST {baseUrl}/auth/login
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function MfaView({ challengeToken, onSuccess, onBack, baseUrl }: {
  challengeToken: string
  onSuccess: (user: UsuarioResponse, token: string) => void
  onBack: () => void
  baseUrl: string
}) {
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigo) { setError('El código es obligatorio.'); return }
    setError('')
    setLoading(true)
    const res = await http.postPublic<LoginResponse>('/auth/login/mfa', { mfaChallengeToken: challengeToken, codigo })
    setLoading(false)
    if (res.error) { setError(res.error.mensaje); return }
    const data = res.data!
    apiConfig.setToken(data.accessToken!)
    onSuccess(data.usuario!, data.accessToken!)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.canvas }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Mono size={10}><span style={{ letterSpacing: '0.2em' }}>RETAIL OS</span></Mono>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: T.ink, marginTop: 10 }}>Verificación en Dos Pasos</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>Introduce el código TOTP de tu autenticador o un código de respaldo.</div>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <div style={{ fontSize: 13, color: T.danger, borderLeft: `2px solid ${T.danger}`, paddingLeft: 10 }}>{error}</div>}
          <div>
            <Label required>Código (TOTP o respaldo)</Label>
            <input
              value={codigo} onChange={e => setCodigo(e.target.value)} maxLength={20}
              placeholder="000000"
              style={{ border: `1px solid ${T.rule}`, padding: '10px 12px', fontSize: 22, fontFamily: 'var(--font-mono)', color: T.ink, background: T.canvas, outline: 'none', letterSpacing: '0.3em', textAlign: 'center', width: '100%' }}
              onFocus={e => (e.target.style.borderColor = T.ink)}
              onBlur={e => (e.target.style.borderColor = T.rule)}
            />
          </div>
          <button
            type="submit" disabled={loading}
            style={{ background: T.ink, color: T.canvas, border: 'none', padding: 11, fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, letterSpacing: '0.06em', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'VERIFICANDO…' : 'VERIFICAR'}
          </button>
          <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
            ← Volver al inicio de sesión
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: T.faint }}>
            POST {baseUrl}/auth/login/mfa
          </div>
        </form>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PERFIL / MFA SETUP
// ════════════════════════════════════════════════════════════════════════════

function PerfilView({ user }: { user: UsuarioResponse }) {
  const [mfaData, setMfaData] = useState<MfaActivarResponse | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [confirmedCodigo, setConfirmedCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<AppBanner | null>(null)

  const activar = async () => {
    setLoading(true)
    const res = await http.post<MfaActivarResponse>('/mfa/activar')
    setLoading(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setMfaData(res.data!)
    setBackupCodes([])
  }

  const confirmar = async () => {
    if (!confirmedCodigo) return
    setLoading(true)
    const res = await http.post<MfaConfirmarResponse>('/mfa/confirmar', { codigo: confirmedCodigo })
    setLoading(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setBackupCodes(res.data!.codigosRespaldo)
    setMfaData(null)
  }

  return (
    <Shell title="Perfil & Configuración MFA" banner={banner} onBannerClose={() => setBanner(null)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 800 }}>
        {/* Account info */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, marginBottom: 16 }}>Información de Cuenta</div>
          <div style={{ border: `1px solid ${T.rule}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              ['ID', user.id],
              ['Correo', user.email],
              ['Nombre Completo', user.nombreCompleto],
              ['Estado', user.estado],
              ['Registrado', fmtDate(user.creadoEn)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${T.rule}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, width: 120, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 13, color: T.ink, fontFamily: ['ID', 'Registrado'].includes(k) ? 'var(--font-mono)' : 'var(--font-sans)', wordBreak: 'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MFA */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, marginBottom: 16 }}>Autenticación de Dos Factores</div>
          <div style={{ border: `1px solid ${T.rule}`, padding: 20 }}>
            {backupCodes.length > 0 ? (
              <>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
                  MFA activado. Guarda estos códigos de respaldo en un lugar seguro — se muestran una única vez.
                </div>
                <div style={{ background: T.surface, border: `1px solid ${T.rule}`, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {backupCodes.map(c => (
                    <span key={c} style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: T.ink, letterSpacing: '0.06em' }}>{c}</span>
                  ))}
                </div>
                <Btn variant="ghost" small onClick={() => setBackupCodes([])}>Entendido</Btn>
              </>
            ) : mfaData ? (
              <>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
                  Escanea el código QR con tu autenticador y confirma con el código generado.
                </div>
                <img
                  src={mfaData.qrCodeDataUri}
                  alt="Código QR MFA"
                  style={{ width: 160, height: 160, display: 'block', marginBottom: 16, border: `1px solid ${T.rule}` }}
                />
                <div style={{ marginBottom: 12 }}>
                  <Label>Clave Secreta</Label>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: T.surface, border: `1px solid ${T.rule}`, padding: '8px 12px', letterSpacing: '0.12em', userSelect: 'all' }}>
                    {mfaData.secreto}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Label required>Código de Confirmación</Label>
                  <Input value={confirmedCodigo} onChange={setConfirmedCodigo} mono placeholder="000000" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="primary" small onClick={confirmar} loading={loading}>Confirmar y Obtener Códigos</Btn>
                  <Btn variant="ghost" small onClick={() => setMfaData(null)}>Cancelar</Btn>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 20, lineHeight: 1.5 }}>
                  Activa la autenticación de dos factores para mayor seguridad. Se generará un secreto TOTP y un código QR.
                </div>
                <Btn variant="primary" small onClick={activar} loading={loading}>Activar 2FA</Btn>
                <div style={{ marginTop: 10, fontSize: 11, fontFamily: 'var(--font-mono)', color: T.faint }}>POST /mfa/activar</div>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// USUARIOS
// ════════════════════════════════════════════════════════════════════════════

function UsuariosView() {
  const [data, setData] = useState<UsuarioResponse[]>([])
  const [roles, setRoles] = useState<RolResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showRoles, setShowRoles] = useState<UsuarioResponse | null>(null)
  const [userRoles, setUserRoles] = useState<RolResponse[]>([])

  // Create form
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [pass, setPass] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await http.get<UsuarioResponse[]>('/usuarios')
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setData(res.data!)
  }, [])

  const loadRoles = useCallback(async () => {
    const res = await http.get<RolResponse[]>('/roles')
    if (!res.error) setRoles(res.data!)
  }, [])

  useEffect(() => { load(); loadRoles() }, [load, loadRoles])

  const createUser = async () => {
    if (!email || !nombre || !pass) return
    setSaving(true)
    const res = await http.post<UsuarioResponse>('/usuarios', { email, nombreCompleto: nombre, password: pass })
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowCreate(false); setEmail(''); setNombre(''); setPass('')
    load()
  }

  const openRoles = async (u: UsuarioResponse) => {
    setShowRoles(u)
    const res = await http.get<RolResponse[]>(`/usuarios/${u.id}/roles`)
    if (!res.error) setUserRoles(res.data!)
  }

  const assignRole = async (userId: string, rolId: string) => {
    const res = await http.post(`/usuarios/${userId}/roles`, { rolId })
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else { const r = await http.get<RolResponse[]>(`/usuarios/${userId}/roles`); if (!r.error) setUserRoles(r.data!) }
  }

  const removeRole = async (userId: string, rolId: string) => {
    const res = await http.delete(`/usuarios/${userId}/roles/${rolId}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setUserRoles(p => p.filter(r => r.id !== rolId))
  }

  return (
    <>
      <Shell title="Usuarios" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => setShowCreate(true)}>+ Crear Usuario</Btn>}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['ID', 'Nombre Completo', 'Correo', 'Estado', 'Registrado', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={6} /> : data.length === 0 ? <EmptyRow cols={6} /> :
                data.map((u, i) => (
                  <TRow key={u.id}>
                    <TD mono>{u.id.slice(0, 8)}…</TD>
                    <TD><strong style={{ fontWeight: 500 }}>{u.nombreCompleto}</strong></TD>
                    <TD>{u.email}</TD>
                    <TD><Badge value={u.estado} variant={u.estado === 'ACTIVO' ? 'active' : 'inactive'} /></TD>
                    <TD mono>{fmtDate(u.creadoEn)}</TD>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn variant="ghost" small onClick={() => openRoles(u)}>Roles</Btn>
                      </div>
                    </td>
                  </TRow>
                ))}
            </tbody>
          </table>
        </div>
      </Shell>

      {showCreate && (
        <Modal title="Crear Usuario" onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>Nombre Completo</Label><Input value={nombre} onChange={setNombre} placeholder="Ana García" /></div>
            <div><Label required>Correo Electrónico</Label><Input value={email} onChange={setEmail} type="email" placeholder="usuario@empresa.com" /></div>
            <div><Label required>Contraseña (mín. 12 caracteres)</Label><Input value={pass} onChange={setPass} type="password" /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Btn>
              <Btn variant="primary" onClick={createUser} loading={saving}>Crear Usuario</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showRoles && (
        <Modal title={`Roles — ${showRoles.nombreCompleto}`} onClose={() => setShowRoles(null)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, marginBottom: 12 }}>Roles Asignados</div>
              <div style={{ border: `1px solid ${T.rule}`, minHeight: 80 }}>
                {userRoles.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: T.faint, fontFamily: 'var(--font-mono)' }}>Sin roles asignados</div>
                ) : userRoles.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < userRoles.length - 1 ? `1px solid ${T.rule}` : 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{r.nombre}</span>
                    <Btn variant="danger" small onClick={() => removeRole(showRoles.id, r.id)}>Quitar</Btn>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, marginBottom: 12 }}>Roles Disponibles</div>
              <div style={{ border: `1px solid ${T.rule}`, minHeight: 80 }}>
                {roles.filter(r => !userRoles.find(ur => ur.id === r.id)).map((r, i, arr) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${T.rule}` : 'none' }}>
                    <span style={{ fontSize: 13 }}>{r.nombre}</span>
                    <Btn variant="ghost" small onClick={() => assignRole(showRoles.id, r.id)}>Asignar</Btn>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setShowRoles(null)}>Cerrar</Btn>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ROLES
// ════════════════════════════════════════════════════════════════════════════

function RolesView() {
  const [roles, setRoles] = useState<RolResponse[]>([])
  const [allScopes, setAllScopes] = useState<ScopeResponse[]>([])
  const [selected, setSelected] = useState<RolResponse | null>(null)
  const [rolScopes, setRolScopes] = useState<ScopeResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editRol, setEditRol] = useState<RolResponse | null>(null)
  const [nombre, setNombre] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, s] = await Promise.all([http.get<RolResponse[]>('/roles'), http.get<ScopeResponse[]>('/scopes')])
    setLoading(false)
    if (r.error) setBanner({ status: r.error.status as HttpStatus, mensaje: r.error.mensaje })
    else setRoles(r.data!)
    if (!s.error) setAllScopes(s.data!)
  }, [])

  useEffect(() => { load() }, [load])

  const selectRol = async (r: RolResponse) => {
    setSelected(r)
    const res = await http.get<ScopeResponse[]>(`/roles/${r.id}/scopes`)
    if (!res.error) setRolScopes(res.data!)
  }

  const assignScope = async (scopeId: string) => {
    if (!selected) return
    const res = await http.post(`/roles/${selected.id}/scopes`, { scopeId })
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    const sc = allScopes.find(s => s.id === scopeId)!
    setRolScopes(p => [...p, sc])
  }

  const removeScope = async (scopeId: string) => {
    if (!selected) return
    const res = await http.delete(`/roles/${selected.id}/scopes/${scopeId}`)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setRolScopes(p => p.filter(s => s.id !== scopeId))
  }

  const saveRol = async () => {
    if (!nombre) return
    setSaving(true)
    const body = { nombre, descripcion: desc }
    const res = editRol
      ? await http.put<RolResponse>(`/roles/${editRol.id}`, body)
      : await http.post<RolResponse>('/roles', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowCreate(false); setEditRol(null); setNombre(''); setDesc('')
    load()
  }

  const deleteRol = async (id: string) => {
    const res = await http.delete(`/roles/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else { if (selected?.id === id) { setSelected(null); setRolScopes([]) }; load() }
  }

  const openEdit = (r: RolResponse) => { setEditRol(r); setNombre(r.nombre); setDesc(r.descripcion); setShowCreate(true) }

  return (
    <>
      <Shell title="Roles" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => { setEditRol(null); setNombre(''); setDesc(''); setShowCreate(true) }}>+ Nuevo Rol</Btn>}>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
          {/* Role list */}
          <div style={{ border: `1px solid ${T.rule}` }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.rule}`, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted }}>
              Roles ({roles.length})
            </div>
            {loading ? <div style={{ padding: 24, fontSize: 12, color: T.faint, fontFamily: 'var(--font-mono)' }}>Cargando…</div> :
              roles.map((r, i) => (
                <div
                  key={r.id}
                  onClick={() => selectRol(r)}
                  style={{
                    padding: '13px 16px', cursor: 'pointer',
                    borderBottom: i < roles.length - 1 ? `1px solid ${T.rule}` : 'none',
                    background: selected?.id === r.id ? T.ink : 'transparent',
                    color: selected?.id === r.id ? T.canvas : T.ink,
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== r.id) e.currentTarget.style.background = T.surface }}
                  onMouseLeave={e => { if (selected?.id !== r.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.nombre}</div>
                      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2, lineHeight: 1.4 }}>{r.descripcion}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(r)} style={iconBtn(selected?.id === r.id ? T.canvas : T.muted)}>✎</button>
                      <button onClick={() => deleteRol(r.id)} style={iconBtn(selected?.id === r.id ? '#FCA5A5' : T.danger)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Scope editor */}
          <div>
            {selected ? (
              <>
                <div style={{ border: `1px solid ${T.rule}`, marginBottom: 16 }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.nombre}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{rolScopes.length} scopes asignados</div>
                    </div>
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, marginBottom: 10 }}>Scopes Asignados</div>
                    {rolScopes.length === 0
                      ? <div style={{ fontSize: 12, color: T.faint, fontFamily: 'var(--font-mono)', padding: '8px 0' }}>Sin scopes asignados</div>
                      : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                          {rolScopes.map(s => (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${T.ink}`, background: T.ink, padding: '4px 10px' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.canvas }}>{s.codigo}</span>
                              <button onClick={() => removeScope(s.id)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                            </div>
                          ))}
                        </div>
                    }
                    <HR />
                    <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, margin: '12px 0 10px' }}>Scopes Disponibles</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {allScopes.filter(s => !rolScopes.find(rs => rs.id === s.id)).map(s => (
                        <button
                          key={s.id}
                          onClick={() => assignScope(s.id)}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, border: `1px solid ${T.rule}`, background: 'transparent', color: T.muted, padding: '4px 10px', cursor: 'pointer', transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.color = T.ink }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = T.rule; e.currentTarget.style.color = T.muted }}
                        >
                          + {s.codigo}
                        </button>
                      ))}
                      {allScopes.filter(s => !rolScopes.find(rs => rs.id === s.id)).length === 0 &&
                        <span style={{ fontSize: 12, color: T.faint, fontFamily: 'var(--font-mono)' }}>Todos los scopes asignados</span>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, border: `1px solid ${T.rule}`, color: T.faint, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                Selecciona un rol para gestionar sus scopes
              </div>
            )}
          </div>
        </div>
      </Shell>

      {showCreate && (
        <Modal title={editRol ? 'Editar Rol' : 'Nuevo Rol'} onClose={() => { setShowCreate(false); setEditRol(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>Nombre del Rol</Label><Input value={nombre} onChange={setNombre} placeholder="OPERADOR" /></div>
            <div><Label>Descripción</Label><Textarea value={desc} onChange={setDesc} placeholder="Descripción del rol y sus responsabilidades" rows={3} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowCreate(false); setEditRol(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={saveRol} loading={saving}>{editRol ? 'Guardar Cambios' : 'Crear Rol'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function iconBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 13, padding: '2px 4px', lineHeight: 1 }
}

// ════════════════════════════════════════════════════════════════════════════
// SCOPES
// ════════════════════════════════════════════════════════════════════════════

function ScopesView() {
  const [data, setData] = useState<ScopeResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<ScopeResponse | null>(null)
  const [codigo, setCodigo] = useState('')
  const [desc, setDesc] = useState('')
  const [sensible, setSensible] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await http.get<ScopeResponse[]>('/scopes')
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setData(res.data!)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!codigo) return
    setSaving(true)
    const body = { codigo, descripcion: desc, sensible }
    const res = edit
      ? await http.put<ScopeResponse>(`/scopes/${edit.id}`, body)
      : await http.post<ScopeResponse>('/scopes', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowForm(false); setEdit(null); setCodigo(''); setDesc(''); setSensible(false); load()
  }

  const del = async (id: string) => {
    const res = await http.delete(`/scopes/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load()
  }

  const openEdit = (s: ScopeResponse) => { setEdit(s); setCodigo(s.codigo); setDesc(s.descripcion); setSensible(s.sensible); setShowForm(true) }

  return (
    <>
      <Shell title="Scopes de Permisos" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => { setEdit(null); setCodigo(''); setDesc(''); setSensible(false); setShowForm(true) }}>+ Nuevo Scope</Btn>}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['Código', 'Descripción', 'Sensible', 'Registrado', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={5} /> : data.length === 0 ? <EmptyRow cols={5} /> :
                data.map((s, i) => (
                  <TRow key={s.id}>
                    <TD mono>{s.codigo}</TD>
                    <TD>{s.descripcion}</TD>
                    <TD>
                      {s.sensible
                        ? <Badge value="SENSIBLE" variant="warn" />
                        : <span style={{ fontSize: 11, color: T.faint, fontFamily: 'var(--font-mono)' }}>—</span>}
                    </TD>
                    <TD mono>{fmtDate(s.creadoEn)}</TD>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn variant="ghost" small onClick={() => openEdit(s)}>Editar</Btn>
                        <Btn variant="danger" small onClick={() => del(s.id)}>Eliminar</Btn>
                      </div>
                    </td>
                  </TRow>
                ))}
            </tbody>
          </table>
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Scope' : 'Nuevo Scope'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>Código</Label><Input value={codigo} onChange={setCodigo} mono placeholder="catalogo:administrar" /></div>
            <div><Label>Descripción</Label><Input value={desc} onChange={setDesc} placeholder="Administrar el catálogo de productos" /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={sensible} onChange={e => setSensible(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: T.ink }} />
              <span style={{ fontSize: 13, color: T.ink }}>Scope sensible (requiere confirmación extra)</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowForm(false); setEdit(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} loading={saving}>{edit ? 'Guardar Cambios' : 'Crear Scope'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ════════════════════════════════════════════════════════════════════════════

function CategoriasView() {
  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<SpringPage<CategoriaResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<CategoriaResponse | null>(null)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const res = await http.get<SpringPage<CategoriaResponse>>(`/categorias?page=${p}&size=10&sort=nombre,asc`)
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setPageData(res.data!)
  }, [])

  useEffect(() => { load(page) }, [load, page])

  const save = async () => {
    if (!nombre) return
    setSaving(true)
    const res = edit
      ? await http.put<CategoriaResponse>(`/categorias/${edit.id}`, { nombre })
      : await http.post<CategoriaResponse>('/categorias', { nombre })
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowForm(false); setEdit(null); setNombre(''); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/categorias/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load(page)
  }

  return (
    <>
      <Shell title="Categorías de Catálogo" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => { setEdit(null); setNombre(''); setShowForm(true) }}>+ Nueva Categoría</Btn>}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['ID', 'Nombre', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={3} /> : pageData.content.length === 0 ? <EmptyRow cols={3} /> :
                pageData.content.map(c => (
                  <TRow key={c.id}>
                    <TD mono>{c.id.slice(0, 8)}…</TD>
                    <TD><strong style={{ fontWeight: 500 }}>{c.nombre}</strong></TD>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn variant="ghost" small onClick={() => { setEdit(c); setNombre(c.nombre); setShowForm(true) }}>Editar</Btn>
                        <Btn variant="danger" small onClick={() => del(c.id)}>Eliminar</Btn>
                      </div>
                    </td>
                  </TRow>
                ))}
            </tbody>
          </table>
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => { setPage(p); load(p) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Categoría' : 'Nueva Categoría'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>Nombre de Categoría</Label><Input value={nombre} onChange={setNombre} placeholder="Camisas" /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowForm(false); setEdit(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} loading={saving}>{edit ? 'Guardar' : 'Crear'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════════════════════════════════════

function TemplatesView() {
  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<SpringPage<TemplateResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [cats, setCats] = useState<CategoriaResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<TemplateResponse | null>(null)
  const [f, setF] = useState({ nombre: '', temporada: '', proveedor: '', precioBase: '', categoriaId: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const [r, c] = await Promise.all([
      http.get<SpringPage<TemplateResponse>>(`/templates?page=${p}&size=10`),
      http.get<SpringPage<CategoriaResponse>>('/categorias?page=0&size=100'),
    ])
    setLoading(false)
    if (r.error) setBanner({ status: r.error.status as HttpStatus, mensaje: r.error.mensaje })
    else setPageData(r.data!)
    if (!c.error) setCats(c.data!.content)
  }, [])

  useEffect(() => { load(page) }, [load, page])

  const save = async () => {
    if (!f.nombre || !f.categoriaId) return
    setSaving(true)
    const body = { nombre: f.nombre, temporada: f.temporada || null, proveedor: f.proveedor || null, precioBase: f.precioBase ? parseFloat(f.precioBase) : null, categoriaId: f.categoriaId }
    const res = edit
      ? await http.put<TemplateResponse>(`/templates/${edit.id}`, body)
      : await http.post<TemplateResponse>('/templates', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowForm(false); setEdit(null); setF({ nombre: '', temporada: '', proveedor: '', precioBase: '', categoriaId: '' }); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/templates/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load(page)
  }

  const openEdit = (t: TemplateResponse) => {
    setEdit(t); setF({ nombre: t.nombre, temporada: t.temporada ?? '', proveedor: t.proveedor ?? '', precioBase: t.precioBase?.toString() ?? '', categoriaId: t.categoriaId })
    setShowForm(true)
  }

  return (
    <>
      <Shell title="Templates de Producto" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => { setEdit(null); setF({ nombre: '', temporada: '', proveedor: '', precioBase: '', categoriaId: cats[0]?.id ?? '' }); setShowForm(true) }}>+ Nuevo Template</Btn>}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['ID', 'Nombre', 'Temporada', 'Proveedor', 'Precio Base', 'Categoría', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={7} /> : pageData.content.length === 0 ? <EmptyRow cols={7} /> :
                pageData.content.map(t => {
                  const catNombre = cats.find(c => c.id === t.categoriaId)?.nombre ?? t.categoriaId.slice(0, 8) + '…'
                  return (
                  <TRow key={t.id}>
                    <TD mono>{t.id.slice(0, 8)}…</TD>
                    <TD><strong style={{ fontWeight: 500 }}>{t.nombre}</strong></TD>
                    <TD>{t.temporada ?? <span style={{ color: T.faint }}>—</span>}</TD>
                    <TD>{t.proveedor ?? <span style={{ color: T.faint }}>—</span>}</TD>
                    <TD mono>{t.precioBase != null ? t.precioBase.toFixed(2) : <span style={{ color: T.faint, fontFamily: 'var(--font-sans)' }}>—</span>}</TD>
                    <TD><span style={{ fontSize: 13 }}>{catNombre}</span></TD>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn variant="ghost" small onClick={() => openEdit(t)}>Editar</Btn>
                        <Btn variant="danger" small onClick={() => del(t.id)}>Eliminar</Btn>
                      </div>
                    </td>
                  </TRow>
                )})}
            </tbody>
          </table>
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => { setPage(p); load(p) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Template' : 'Nuevo Template'} onClose={() => { setShowForm(false); setEdit(null) }} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1/-1' }}><Label required>Nombre del Template</Label><Input value={f.nombre} onChange={v => setF(p => ({ ...p, nombre: v }))} placeholder="Camisa básica" /></div>
            <div><Label>Temporada</Label><Input value={f.temporada} onChange={v => setF(p => ({ ...p, temporada: v }))} placeholder="2026-Otoño" /></div>
            <div><Label>Proveedor</Label><Input value={f.proveedor} onChange={v => setF(p => ({ ...p, proveedor: v }))} placeholder="Proveedor Textil" /></div>
            <div><Label>Precio Base</Label><Input value={f.precioBase} onChange={v => setF(p => ({ ...p, precioBase: v }))} placeholder="89900.00" /></div>
            <div>
              <Label required>Categoría</Label>
              <Select value={f.categoriaId} onChange={v => setF(p => ({ ...p, categoriaId: v }))}>
                <option value="">— Seleccionar —</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEdit(null) }}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} loading={saving}>{edit ? 'Guardar' : 'Crear'}</Btn>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VARIANTES
// ════════════════════════════════════════════════════════════════════════════

function VariantesView() {
  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<SpringPage<VarianteResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [skuSearch, setSkuSearch] = useState('')
  const [skuResult, setSkuResult] = useState<VarianteResponse | null | 'notfound'>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<VarianteResponse | null>(null)
  const [f, setF] = useState({ sku: '', talla: '', color: '', templateId: '' })
  const [saving, setSaving] = useState(false)
  const [skuLoading, setSkuLoading] = useState(false)

  const loadTemplates = useCallback(async () => {
    const res = await http.get<SpringPage<TemplateResponse>>('/templates?page=0&size=200')
    if (!res.error) setTemplates(res.data!.content)
  }, [])

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const res = await http.get<SpringPage<VarianteResponse>>(`/variantes?page=${p}&size=10`)
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setPageData(res.data!)
  }, [])

  useEffect(() => { load(page); loadTemplates() }, [load, loadTemplates, page])

  const templateName = (id: string) => templates.find(t => t.id === id)?.nombre ?? id.slice(0, 8) + '…'

  const searchBySku = async () => {
    if (!skuSearch.trim()) return
    setSkuLoading(true)
    const res = await http.get<VarianteResponse>(`/variantes/sku/${encodeURIComponent(skuSearch.trim())}`)
    setSkuLoading(false)
    if (res.error) setSkuResult('notfound')
    else setSkuResult(res.data!)
  }

  const save = async () => {
    if (!f.sku || !f.templateId) return
    setSaving(true)
    const body = { sku: f.sku, talla: f.talla || null, color: f.color || null, templateId: f.templateId }
    const res = edit
      ? await http.put<VarianteResponse>(`/variantes/${edit.id}`, body)
      : await http.post<VarianteResponse>('/variantes', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowForm(false); setEdit(null); setF({ sku: '', talla: '', color: '', templateId: '' }); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/variantes/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load(page)
  }

  const openEdit = (v: VarianteResponse) => {
    setEdit(v); setF({ sku: v.sku, talla: v.talla ?? '', color: v.color ?? '', templateId: v.templateId }); setShowForm(true)
  }

  const openCreate = () => {
    setEdit(null); setF({ sku: '', talla: '', color: '', templateId: templates[0]?.id ?? '' }); setShowForm(true)
  }

  return (
    <>
      <Shell title="Variantes de Producto" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={openCreate}>+ Nueva Variante</Btn>}>

        {/* SKU Search */}
        <div style={{ border: `1px solid ${T.rule}`, padding: 16, marginBottom: 20, background: T.surface }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, marginBottom: 10 }}>
            Búsqueda por SKU — GET /variantes/sku/&#123;sku&#125;
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: skuResult ? 12 : 0 }}>
            <div style={{ flex: 1 }}>
              <Input value={skuSearch} onChange={setSkuSearch} mono placeholder="CAM-BAS-001" />
            </div>
            <Btn variant="primary" onClick={searchBySku} loading={skuLoading}>Buscar SKU</Btn>
            {skuResult && <Btn variant="ghost" onClick={() => { setSkuResult(null); setSkuSearch('') }}>Limpiar</Btn>}
          </div>
          {skuResult === 'notfound' && (
            <div style={{ fontSize: 13, color: T.danger, borderLeft: `2px solid ${T.danger}`, paddingLeft: 10, marginTop: 8 }}>SKU no encontrado.</div>
          )}
          {skuResult && skuResult !== 'notfound' && (
            <div style={{ marginTop: 8, padding: '12px 14px', border: `1px solid ${T.ink}`, background: T.canvas }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {([
                  ['SKU', skuResult.sku],
                  ['Talla', skuResult.talla ?? '—'],
                  ['Color', skuResult.color ?? '—'],
                  ['Template', templateName(skuResult.templateId)],
                  ['ID Variante', skuResult.id],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, fontWeight: 600, marginBottom: 2 }}>{k}</div>
                    <div style={{ fontFamily: k === 'ID Variante' || k === 'SKU' ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 12, color: T.ink }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['SKU', 'Talla', 'Color', 'Template', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={5} /> : pageData.content.length === 0 ? <EmptyRow cols={5} /> :
                pageData.content.map(v => (
                  <TRow key={v.id}>
                    <TD mono>{v.sku}</TD>
                    <TD>{v.talla ?? <span style={{ color: T.faint }}>—</span>}</TD>
                    <TD>{v.color ?? <span style={{ color: T.faint }}>—</span>}</TD>
                    <TD>{templateName(v.templateId)}</TD>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn variant="ghost" small onClick={() => openEdit(v)}>Editar</Btn>
                        <Btn variant="danger" small onClick={() => del(v.id)}>Eliminar</Btn>
                      </div>
                    </td>
                  </TRow>
                ))}
            </tbody>
          </table>
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => { setPage(p); load(p) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Variante' : 'Nueva Variante'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>SKU</Label><Input value={f.sku} onChange={v => setF(p => ({ ...p, sku: v }))} mono placeholder="CAM-BAS-001" /></div>
            <div>
              <Label required>Template</Label>
              <Select value={f.templateId} onChange={v => setF(p => ({ ...p, templateId: v }))}>
                <option value="">— Seleccionar template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><Label>Talla</Label><Input value={f.talla} onChange={v => setF(p => ({ ...p, talla: v }))} placeholder="M" /></div>
              <div><Label>Color</Label><Input value={f.color} onChange={v => setF(p => ({ ...p, color: v }))} placeholder="Negro" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowForm(false); setEdit(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} loading={saving}>{edit ? 'Guardar' : 'Crear'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TIENDAS
// ════════════════════════════════════════════════════════════════════════════

function TiendasView() {
  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<SpringPage<TiendaResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<TiendaResponse | null>(null)
  const [nombre, setNombre] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const res = await http.get<SpringPage<TiendaResponse>>(`/tiendas?page=${p}&size=10`)
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setPageData(res.data!)
  }, [])

  useEffect(() => { load(page) }, [load, page])

  const deactivate = async (id: string) => {
    const res = await http.delete(`/tiendas/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load(page)
  }

  const activate = async (id: string) => {
    const res = await http.put<TiendaResponse>(`/tiendas/${id}/activar`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load(page)
  }

  const save = async () => {
    if (!nombre) return
    setSaving(true)
    const body = { nombre, ubicacion }
    const res = edit
      ? await http.put<TiendaResponse>(`/tiendas/${edit.id}`, body)
      : await http.post<TiendaResponse>('/tiendas', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowForm(false); setEdit(null); setNombre(''); setUbicacion(''); load(page)
  }

  return (
    <>
      <Shell title="Gestión de Tiendas" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => { setEdit(null); setNombre(''); setUbicacion(''); setShowForm(true) }}>+ Nueva Tienda</Btn>}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['ID', 'Nombre', 'Ubicación', 'Estado', 'Actualizado', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={6} /> : pageData.content.length === 0 ? <EmptyRow cols={6} /> :
                pageData.content.map(s => (
                  <TRow key={s.id}>
                    <TD mono>{s.id.slice(0, 8)}…</TD>
                    <TD><strong style={{ fontWeight: 500 }}>{s.nombre}</strong></TD>
                    <TD>{s.ubicacion}</TD>
                    <TD><Badge value={s.estado} variant={s.estado === 'ACTIVA' ? 'active' : 'inactive'} /></TD>
                    <TD mono>{fmtDate(s.actualizadoEn)}</TD>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn variant="ghost" small onClick={() => { setEdit(s); setNombre(s.nombre); setUbicacion(s.ubicacion); setShowForm(true) }}>Editar</Btn>
                        {s.estado === 'ACTIVA'
                          ? <Btn variant="danger" small onClick={() => deactivate(s.id)}>Desactivar</Btn>
                          : <Btn variant="ghost" small onClick={() => activate(s.id)}>Reactivar</Btn>}
                      </div>
                    </td>
                  </TRow>
                ))}
            </tbody>
          </table>
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => { setPage(p); load(p) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Tienda' : 'Nueva Tienda'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>Nombre de Tienda</Label><Input value={nombre} onChange={setNombre} placeholder="Tienda Centro" /></div>
            <div><Label>Ubicación</Label><Input value={ubicacion} onChange={setUbicacion} placeholder="Bogotá" /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowForm(false); setEdit(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} loading={saving}>{edit ? 'Guardar' : 'Crear'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CENTROS DE DISTRIBUCIÓN
// ════════════════════════════════════════════════════════════════════════════

function CentrosView() {
  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<SpringPage<CentroDistribucionResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [filters, setFilters] = useState({ id: '', nombre: '', ubicacion: '' })
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [detail, setDetail] = useState<CentroDistribucionConNodoResponse | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<CentroDistribucionResponse | null>(null)
  const [nombre, setNombre] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [saving, setSaving] = useState(false)

  const buildQuery = (p: number, f = filters) => {
    const params = new URLSearchParams({ page: String(p), size: '10' })
    if (f.id) params.set('id', f.id)
    if (f.nombre) params.set('nombre', f.nombre)
    if (f.ubicacion) params.set('ubicacion', f.ubicacion)
    return `/centros-distribucion?${params}`
  }

  const load = useCallback(async (p: number, f?: typeof filters) => {
    setLoading(true)
    const res = await http.get<SpringPage<CentroDistribucionResponse>>(buildQuery(p, f))
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setPageData(res.data!)
  }, [])

  useEffect(() => { load(page) }, [load, page])

  const applyFilters = () => { setPage(0); load(0, filters) }

  const openDetail = async (id: string) => {
    const res = await http.get<CentroDistribucionConNodoResponse>(`/centros-distribucion/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setDetail(res.data!)
  }

  const save = async () => {
    if (!nombre) return
    setSaving(true)
    const body = { nombre, ubicacion }
    const res = edit
      ? await http.put<CentroDistribucionResponse>(`/centros-distribucion/${edit.id}`, body)
      : await http.post<CentroDistribucionResponse>('/centros-distribucion', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowForm(false); setEdit(null); setNombre(''); setUbicacion(''); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/centros-distribucion/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load(page)
  }

  return (
    <>
      <Shell title="Centros de Distribución" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => { setEdit(null); setNombre(''); setUbicacion(''); setShowForm(true) }}>+ Nuevo Centro</Btn>}>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr auto', gap: 10, marginBottom: 20, padding: 14, border: `1px solid ${T.rule}`, background: T.surface, alignItems: 'end' }}>
          {([['ID parcial', 'id', 'uuid…'], ['Nombre', 'nombre', 'CD Principal…'], ['Ubicación', 'ubicacion', 'Bogotá…']] as const).map(([label, key, ph]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input value={filters[key]} onChange={v => setFilters(p => ({ ...p, [key]: v }))} placeholder={ph} />
            </div>
          ))}
          <div style={{ paddingBottom: 0 }}>
            <Btn variant="primary" onClick={applyFilters}>Filtrar</Btn>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {loading
            ? <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: T.faint }}>Cargando…</div>
            : pageData.content.length === 0
            ? <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: T.faint }}>Sin resultados</div>
            : pageData.content.map(c => (
              <div key={c.id} style={{ border: `1px solid ${T.rule}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Mono>{c.id.slice(0, 8)}…</Mono>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.3 }}>{c.nombre}</div>
                <div style={{ fontSize: 13, color: T.muted }}>{c.ubicacion}</div>
                <HR />
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn variant="ghost" small onClick={() => openDetail(c.id)}>Ver Nodo</Btn>
                  <Btn variant="ghost" small onClick={() => { setEdit(c); setNombre(c.nombre); setUbicacion(c.ubicacion); setShowForm(true) }}>Editar</Btn>
                  <Btn variant="danger" small onClick={() => del(c.id)}>Eliminar</Btn>
                </div>
              </div>
            ))}
        </div>
        {pageData.totalPages > 1 && (
          <div style={{ border: `1px solid ${T.rule}`, marginTop: 14 }}>
            <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => { setPage(p); load(p) }} />
          </div>
        )}
      </Shell>

      {detail && (
        <Modal title="Detalle del Centro — Nodo Logístico" onClose={() => setDetail(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['ID Centro', detail.id], ['Nombre', detail.nombre], ['Ubicación', detail.ubicacion]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: `1px solid ${T.rule}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, width: 100, flexShrink: 0 }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.ink, wordBreak: 'break-all' }}>{v}</span>
              </div>
            ))}
            {detail.nodo ? (
              <>
                <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted, marginTop: 8 }}>Nodo Asociado</div>
                {[['ID Nodo', detail.nodo.id], ['Tipo', detail.nodo.tipo], ['CD ID', detail.nodo.cdId ?? '—'], ['Tienda ID', detail.nodo.tiendaId ?? '—']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: `1px solid ${T.rule}` }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, width: 100, flexShrink: 0 }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.ink }}>{v}</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 13, color: T.faint, fontFamily: 'var(--font-mono)', padding: '8px 0' }}>Sin nodo asociado</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setDetail(null)}>Cerrar</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showForm && (
        <Modal title={edit ? 'Editar Centro' : 'Nuevo Centro de Distribución'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>Nombre</Label><Input value={nombre} onChange={setNombre} placeholder="CD Principal" /></div>
            <div><Label>Ubicación</Label><Input value={ubicacion} onChange={setUbicacion} placeholder="Bogotá" /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowForm(false); setEdit(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} loading={saving}>{edit ? 'Guardar' : 'Crear'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BODEGAS DE TIENDA
// ════════════════════════════════════════════════════════════════════════════

function BodegasView() {
  const [page, setPage] = useState(0)
  const [pageData, setPageData] = useState<SpringPage<BodegaTiendaResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [tiendas, setTiendas] = useState<TiendaResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<BodegaTiendaResponse | null>(null)
  const [tiendaId, setTiendaId] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTiendas = useCallback(async () => {
    const res = await http.get<SpringPage<TiendaResponse>>('/tiendas?page=0&size=200')
    if (!res.error) setTiendas(res.data!.content)
  }, [])

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const res = await http.get<SpringPage<BodegaTiendaResponse>>(`/bodegas-tienda?page=${p}&size=10`)
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setPageData(res.data!)
  }, [])

  useEffect(() => { load(page); loadTiendas() }, [load, loadTiendas, page])

  const openCreate = () => {
    setEdit(null)
    setTiendaId(tiendas.find(t => t.estado === 'ACTIVA')?.id ?? tiendas[0]?.id ?? '')
    setShowForm(true)
  }

  const openReasignar = (b: BodegaTiendaResponse) => {
    setEdit(b); setTiendaId(b.tiendaId); setShowForm(true)
  }

  const save = async () => {
    if (!tiendaId) return
    setSaving(true)
    const body = { tiendaId }
    const res = edit
      ? await http.put<BodegaTiendaResponse>(`/bodegas-tienda/${edit.id}`, body)
      : await http.post<BodegaTiendaResponse>('/bodegas-tienda', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    setShowForm(false); setEdit(null); setTiendaId(''); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/bodegas-tienda/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else load(page)
  }

  return (
    <>
      <Shell title="Bodegas de Tienda" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={openCreate}>+ Registrar Bodega</Btn>}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['ID Bodega', 'Tienda Vinculada', 'Ubicación', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={4} /> : pageData.content.length === 0 ? <EmptyRow cols={4} /> :
                pageData.content.map(b => (
                  <TRow key={b.id}>
                    <TD mono>{b.id.slice(0, 8)}…</TD>
                    <TD><strong style={{ fontWeight: 500 }}>{b.tiendaNombre ?? <span style={{ color: T.faint }}>—</span>}</strong></TD>
                    <TD>{b.tiendaUbicacion ?? <span style={{ color: T.faint }}>—</span>}</TD>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn variant="ghost" small onClick={() => openReasignar(b)}>Reasignar Tienda</Btn>
                        <Btn variant="danger" small onClick={() => del(b.id)}>Eliminar</Btn>
                      </div>
                    </td>
                  </TRow>
                ))}
            </tbody>
          </table>
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => { setPage(p); load(p) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Reasignar Bodega a Tienda' : 'Registrar Nueva Bodega'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Label required>Tienda</Label>
              <Select value={tiendaId} onChange={setTiendaId}>
                <option value="">— Seleccionar tienda —</option>
                {tiendas.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}{t.ubicacion ? ` · ${t.ubicacion}` : ''}{t.estado === 'INACTIVA' ? ' (Inactiva)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            {edit && (
              <div style={{ fontSize: 12, color: T.muted, borderLeft: `2px solid ${T.rule}`, paddingLeft: 10, lineHeight: 1.5 }}>
                La bodega <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{edit.id.slice(0, 8)}…</strong> será reasignada a la tienda seleccionada.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowForm(false); setEdit(null) }}>Cancelar</Btn>
              <Btn variant="primary" onClick={save} loading={saving} disabled={!tiendaId}>{edit ? 'Reasignar' : 'Registrar'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════════════════

function Sidebar({ current, onNav, onLogout, user }: {
  current: View; onNav: (v: View) => void; onLogout: () => void; user: UsuarioResponse
}) {
  return (
    <aside style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.rule}`, display: 'flex', flexDirection: 'column', background: T.canvas, height: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ padding: '22px 20px 18px', borderBottom: `1px solid ${T.rule}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: T.ink }}>RETAIL OS</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: T.faint, marginTop: 2 }}>v2.4.1 · API v1</div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 0' }}>
        {NAV.map(group => (
          <div key={group.title} style={{ marginBottom: 4 }}>
            <div style={{ padding: '5px 20px', fontSize: 10, letterSpacing: '0.1em', color: T.faint, fontWeight: 600, textTransform: 'uppercase' }}>
              {group.title}
            </div>
            {group.items.map(item => {
              const active = current === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onNav(item.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 20px', fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: active ? 600 : 400, background: active ? T.ink : 'transparent', color: active ? T.canvas : '#333333', border: 'none', cursor: 'pointer', transition: 'background .1s, color .1s' }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.surface }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  {item.label}
                </button>
              )
            })}
            <div style={{ height: 1, background: '#F0F0F0', margin: '8px 0' }} />
          </div>
        ))}
      </nav>

      <div style={{ borderTop: `1px solid ${T.rule}`, padding: 16 }}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user.email}>{user.email}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.faint, marginBottom: 12 }}>{user.estado}</div>
        <button
          onClick={onLogout}
          style={{ background: 'none', border: `1px solid ${T.rule}`, padding: '6px 12px', fontSize: 12, fontFamily: 'var(--font-sans)', color: T.muted, cursor: 'pointer', fontWeight: 500, width: '100%', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink; e.currentTarget.style.color = T.ink }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.rule; e.currentTarget.style.color = T.muted }}
        >
          Cerrar Sesión
        </button>
      </div>
    </aside>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('login')
  const [challengeToken, setChallengeToken] = useState('')
  const [user, setUser] = useState<UsuarioResponse | null>(null)
  const [view, setView] = useState<View>('usuarios')
  const [baseUrl, setBaseUrl] = useState(() => apiConfig.getBaseUrl())

  const handleChangeUrl = useCallback((url: string) => {
    apiConfig.setBaseUrl(url)
    setBaseUrl(apiConfig.getBaseUrl())
  }, [])

  const handleLogin = useCallback((u: UsuarioResponse) => {
    setUser(u); setAuthState('app')
  }, [])

  const handleMfa = useCallback((token: string) => {
    setChallengeToken(token); setAuthState('mfa')
  }, [])

  const handleMfaSuccess = useCallback((u: UsuarioResponse) => {
    setUser(u); setAuthState('app')
  }, [])

  const handleLogout = useCallback(async () => {
    await http.postPublic('/auth/logout')
    apiConfig.setToken(null)
    setUser(null); setAuthState('login'); setView('usuarios')
  }, [])

  // Register 401 handler
  useEffect(() => {
    apiConfig.onUnauthorized(() => {
      apiConfig.setToken(null); setUser(null); setAuthState('login')
    })
  }, [])

  if (authState === 'login')
    return <LoginView onLogin={handleLogin} onMfa={handleMfa} baseUrl={baseUrl} onChangeUrl={handleChangeUrl} />

  if (authState === 'mfa')
    return <MfaView challengeToken={challengeToken} onSuccess={handleMfaSuccess} onBack={() => setAuthState('login')} baseUrl={baseUrl} />

  const renderView = () => {
    switch (view) {
      case 'perfil':    return <PerfilView user={user!} />
      case 'usuarios':  return <UsuariosView />
      case 'roles':     return <RolesView />
      case 'scopes':    return <ScopesView />
      case 'categorias': return <CategoriasView />
      case 'templates': return <TemplatesView />
      case 'variantes': return <VariantesView />
      case 'tiendas':   return <TiendasView />
      case 'centros':   return <CentrosView />
      case 'bodegas':   return <BodegasView />
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ApiBar baseUrl={baseUrl} onChangeUrl={handleChangeUrl} />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar current={view} onNav={setView} onLogout={handleLogout} user={user!} />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.canvas }}>
          {renderView()}
        </main>
      </div>
    </div>
  )
}
