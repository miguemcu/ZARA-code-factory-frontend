import { useState, useEffect, useCallback, useRef } from 'react'
import {
  apiConfig, http,
  type LoginResponse, type UsuarioResponse, type RolResponse, type ScopeResponse,
  type CategoriaResponse, type TemplateResponse, type VarianteResponse,
  type TiendaResponse, type CentroDistribucionResponse, type CentroDistribucionConNodoResponse,
  type TiendaConNodosResponse, type TiendaAsignadaResponse, type PrioridadTiendaCdResponse,
  type BodegaTiendaResponse, type SpringPage,
  type MfaActivarResponse, type MfaConfirmarResponse,
} from './api'
import { InventoryView, ReplenishmentView, SalesView } from './Operations'
import {
  categoriasCache, loadStoreDetail, loadTiendas, loadVariantCatalog, resetCaches, templatesCache, tiendasCache,
  variantesCache, type Catalogs,
} from './catalogCache'
import { VarianteSelector } from './VarianteSelector'

// ─── Types ─────────────────────────────────────────────────────────────────

type AuthState = 'login' | 'mfa' | 'app'
type View = 'perfil' | 'usuarios' | 'roles' | 'scopes' | 'categorias' | 'templates' | 'variantes' | 'tiendas' | 'centros' | 'bodegas' | 'inventario' | 'ventas' | 'reposicion'
type HttpStatus = 400 | 401 | 403 | 404 | 409 | 500 | 0

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
  { title: 'Inventario', items: [{ id: 'inventario', label: 'Operaciones de Inventario' }] },
  { title: 'Punto de venta', items: [{ id: 'ventas', label: 'Ventas y Demanda' }] },
  { title: 'Reposición interna', items: [{ id: 'reposicion', label: 'Reposición y Traspasos' }] },
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
  value, onChange, placeholder, type = 'text', mono, readOnly, autoFocus, maxLength,
}: {
  value: string; onChange?: (v: string) => void; placeholder?: string
  type?: string; mono?: boolean; readOnly?: boolean; autoFocus?: boolean; maxLength?: number
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      autoFocus={autoFocus}
      maxLength={maxLength}
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

function Select({ value, onChange, children, disabled }: { value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{ border: `1px solid ${T.rule}`, background: disabled ? T.surface : T.canvas, color: T.ink, fontFamily: 'var(--font-sans)', fontSize: 14, padding: '9px 12px', width: '100%', outline: 'none', appearance: 'none', opacity: disabled ? 0.7 : 1 }}
    >
      {children}
    </select>
  )
}

function Textarea({ value, onChange, placeholder, rows = 3, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number }) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} maxLength={maxLength}
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
    400: { label: 'Revisa los datos', side: T.danger },
    401: { label: 'Sesión no autorizada', side: '#D97706' },
    403: { label: 'Acceso denegado', side: T.danger },
    404: { label: 'No encontrado', side: T.muted },
    409: { label: 'Conflicto', side: '#7C3AED' },
    500: { label: 'Error del servidor', side: T.danger },
    0:   { label: 'Error de Conexión', side: T.muted },
  }
  const c = cfg[banner.status] ?? cfg[0]
  return (
    <div style={{ borderLeft: `3px solid ${c.side}`, background: T.surface, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: c.side, whiteSpace: 'nowrap', paddingTop: 1 }}>{c.label}</span>
        <span style={{ fontSize: 13, color: T.ink }}>{banner.status === 403 ? 'Acceso denegado: falta el permiso requerido' : banner.mensaje}</span>
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

function Paginator({ page, totalPages, totalElements, size, onPage, onSize }: {
  page: number; totalPages: number; totalElements: number; size: number; onPage: (p: number) => void; onSize: (size: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: `1px solid ${T.rule}`, fontSize: 12, color: T.muted }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Resultados por página</span>
        <select value={size} onChange={e => onSize(Number(e.target.value))} style={{ border: `1px solid ${T.rule}`, background: T.canvas, padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {[10, 20, 50].map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{totalElements} resultado{totalElements !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button onClick={() => onPage(page - 1)} disabled={page === 0} style={pagerBtn(page === 0)}>‹</button>
        <span style={{ padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Página {page + 1} de {Math.max(1, totalPages)}</span>
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
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: T.faint, textTransform: 'uppercase', flexShrink: 0 }}>API Endpoint:</span>
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
  const [tiendas, setTiendas] = useState<TiendaResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<UsuarioResponse | null>(null)
  const [userRoles, setUserRoles] = useState<RolResponse[]>([])
  const [userTiendas, setUserTiendas] = useState<TiendaAsignadaResponse[]>([])
  const [rolId, setRolId] = useState('')
  const [tiendaId, setTiendaId] = useState('')
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [pass, setPass] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const showError = (status: number, mensaje: string, inForm = false) => {
    if (status === 400 && inForm) setFormError(mensaje)
    else setBanner({ status: status as HttpStatus, mensaje })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [usersRes, rolesRes, storesRes] = await Promise.all([
      http.get<UsuarioResponse[]>('/usuarios'),
      http.get<RolResponse[]>('/roles'),
      http.get<SpringPage<TiendaResponse>>('/tiendas?page=0&size=200'),
    ])
    setLoading(false)
    if (usersRes.error) showError(usersRes.error.status, usersRes.error.mensaje)
    else setData(usersRes.data!)
    if (!rolesRes.error) setRoles(rolesRes.data!)
    if (!storesRes.error) setTiendas(storesRes.data!.content)
  }, [])

  useEffect(() => { load() }, [load])

  const createUser = async () => {
    if (!email || !nombre || pass.length < 12 || pass.length > 128) { setFormError('Completa los campos y usa una contraseña de 12 a 128 caracteres.'); return }
    setSaving(true); setFormError('')
    const res = await http.post<UsuarioResponse>('/usuarios', { email, nombreCompleto: nombre, password: pass })
    setSaving(false)
    if (res.error) { showError(res.error.status, res.error.mensaje, true); return }
    setShowCreate(false); setEmail(''); setNombre(''); setPass(''); load()
  }

  const openAccess = async (u: UsuarioResponse) => {
    setSelected(u); setRolId(''); setTiendaId('')
    const [roleRes, storeRes] = await Promise.all([
      http.get<RolResponse[]>(`/usuarios/${u.id}/roles`),
      http.get<TiendaAsignadaResponse[]>(`/usuarios/${u.id}/tiendas`),
    ])
    if (roleRes.error) showError(roleRes.error.status, roleRes.error.mensaje); else setUserRoles(roleRes.data!)
    if (storeRes.error) showError(storeRes.error.status, storeRes.error.mensaje); else setUserTiendas(storeRes.data!)
  }

  const changeStatus = async (u: UsuarioResponse) => {
    const action = u.estado === 'ACTIVO' ? 'desactivar' : 'activar'
    const res = await http.put<UsuarioResponse>(`/usuarios/${u.id}/${action}`)
    if (res.error) showError(res.error.status, res.error.mensaje); else load()
  }

  const assignRole = async () => {
    if (!selected || !rolId) return
    const res = await http.post(`/usuarios/${selected.id}/roles`, { rolId })
    if (res.error) showError(res.error.status, res.error.mensaje)
    else { const role = roles.find(r => r.id === rolId); if (role) setUserRoles(p => [...p, role]); setRolId('') }
  }
  const removeRole = async (id: string) => {
    if (!selected) return
    const res = await http.delete(`/usuarios/${selected.id}/roles/${id}`)
    if (res.error) showError(res.error.status, res.error.mensaje); else setUserRoles(p => p.filter(r => r.id !== id))
  }
  const assignStore = async () => {
    if (!selected || !tiendaId) return
    const res = await http.post(`/usuarios/${selected.id}/tiendas`, { tiendaId })
    if (res.error) showError(res.error.status, res.error.mensaje)
    else { const store = tiendas.find(t => t.id === tiendaId); if (store) setUserTiendas(p => [...p, { id: store.id, nombre: store.nombre, activa: store.estado === 'ACTIVA' }]); setTiendaId('') }
  }
  const removeStore = async (id: string) => {
    if (!selected) return
    const res = await http.delete(`/usuarios/${selected.id}/tiendas/${id}`)
    if (res.error) showError(res.error.status, res.error.mensaje); else setUserTiendas(p => p.filter(t => t.id !== id))
  }

  return <>
    <Shell title="Usuarios" banner={banner} onBannerClose={() => setBanner(null)} action={<Btn variant="primary" small onClick={() => { setFormError(''); setShowCreate(true) }}>+ Crear Usuario</Btn>}>
      <div style={{ border: `1px solid ${T.rule}` }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <THead cols={['Correo', 'Nombre Completo', 'Estado', 'Creado', 'Acciones']} />
        <tbody>{loading ? <LoadingRow cols={5} /> : data.length === 0 ? <EmptyRow cols={5} /> : data.map(u => <TRow key={u.id}>
          <TD>{u.email}</TD><TD><strong style={{ fontWeight: 500 }}>{u.nombreCompleto}</strong></TD>
          <TD><Badge value={u.estado} variant={u.estado === 'ACTIVO' ? 'active' : u.estado === 'BLOQUEADO' ? 'warn' : 'inactive'} /></TD>
          <TD mono>{fmtDate(u.creadoEn)}</TD>
          <td style={{ padding: '8px 16px' }}><div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="ghost" small onClick={() => openAccess(u)}>Roles y tiendas</Btn>
            <Btn variant={u.estado === 'ACTIVO' ? 'danger' : 'ghost'} small onClick={() => changeStatus(u)}>{u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}</Btn>
          </div></td>
        </TRow>)}</tbody>
      </table></div>
    </Shell>

    {showCreate && <Modal title="Crear Usuario" onClose={() => setShowCreate(false)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError && <div style={{ fontSize: 13, color: T.danger, borderLeft: `2px solid ${T.danger}`, paddingLeft: 10 }}>{formError}</div>}
        <div><Label required>Correo Electrónico</Label><Input value={email} onChange={setEmail} type="email" maxLength={255} /></div>
        <div><Label required>Nombre Completo</Label><Input value={nombre} onChange={setNombre} maxLength={150} /></div>
        <div><Label required>Contraseña (12–128 caracteres)</Label><Input value={pass} onChange={setPass} type="password" maxLength={128} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Btn><Btn variant="primary" onClick={createUser} loading={saving}>Crear Usuario</Btn></div>
      </div>
    </Modal>}

    {selected && <Modal title={`Accesos — ${selected.nombreCompleto}`} onClose={() => setSelected(null)} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div><Label>Roles asignados</Label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}><Select value={rolId} onChange={setRolId}><option value="">— Seleccionar rol —</option>{roles.filter(r => !userRoles.some(x => x.id === r.id)).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</Select><Btn small onClick={assignRole} disabled={!rolId}>Asignar</Btn></div>
          <div style={{ border: `1px solid ${T.rule}` }}>{userRoles.length === 0 ? <div style={{ padding: 14, color: T.faint, fontSize: 12 }}>Sin roles asignados</div> : userRoles.map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 10, borderBottom: `1px solid ${T.rule}` }}><span>{r.nombre}</span><Btn variant="danger" small onClick={() => removeRole(r.id)}>Quitar</Btn></div>)}</div>
        </div>
        <div><Label>Tiendas asignadas</Label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}><Select value={tiendaId} onChange={setTiendaId}><option value="">— Seleccionar tienda —</option>{tiendas.filter(t => !userTiendas.some(x => x.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select><Btn small onClick={assignStore} disabled={!tiendaId}>Asignar</Btn></div>
          <div style={{ border: `1px solid ${T.rule}` }}>{userTiendas.length === 0 ? <div style={{ padding: 14, color: T.faint, fontSize: 12 }}>Sin tiendas asignadas</div> : userTiendas.map(t => <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottom: `1px solid ${T.rule}` }}><span>{t.nombre} <Badge value={t.activa ? 'ACTIVA' : 'INACTIVA'} variant={t.activa ? 'active' : 'inactive'} /></span><Btn variant="danger" small onClick={() => removeStore(t.id)}>Quitar</Btn></div>)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}><Btn variant="ghost" onClick={() => setSelected(null)}>Cerrar</Btn></div>
    </Modal>}
  </>
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
  const [scopeId, setScopeId] = useState('')
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
    setScopeId('')
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
                      <button onClick={() => openEdit(r)} style={iconBtn(selected?.id === r.id ? T.canvas : T.muted)}>Editar</button>
                      <button onClick={() => deleteRol(r.id)} style={iconBtn(selected?.id === r.id ? '#FCA5A5' : T.danger)}>Eliminar</button>
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
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Select value={scopeId} onChange={setScopeId}>
                        <option value="">— Seleccionar scope —</option>
                        {allScopes.filter(s => !rolScopes.find(rs => rs.id === s.id)).map(s => <option key={s.id} value={s.id}>{s.codigo}</option>)}
                      </Select>
                      <Btn small disabled={!scopeId} onClick={() => assignScope(scopeId)}>Asignar</Btn>
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
            <div><Label required>Nombre del Rol</Label><Input value={nombre} onChange={setNombre} placeholder="OPERADOR" maxLength={100} /></div>
            <div><Label>Descripción</Label><Textarea value={desc} onChange={setDesc} placeholder="Descripción del rol y sus responsabilidades" rows={3} maxLength={255} /></div>
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
  return { background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 11, padding: '2px 4px', lineHeight: 1 }
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
            <div><Label required>Código</Label><Input value={codigo} onChange={setCodigo} mono placeholder="catalogo:administrar" maxLength={100} /></div>
            <div><Label>Descripción</Label><Input value={desc} onChange={setDesc} placeholder="Administrar el catálogo de productos" maxLength={255} /></div>
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
  const [size, setSize] = useState(10)
  const [pageData, setPageData] = useState<SpringPage<CategoriaResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<CategoriaResponse | null>(null)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const res = await http.get<SpringPage<CategoriaResponse>>(`/categorias?page=${p}&size=${size}&sort=nombre,asc`)
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setPageData(res.data!)
  }, [size])

  useEffect(() => { load(page) }, [load, page])

  const save = async () => {
    if (!nombre) return
    setSaving(true)
    const res = edit
      ? await http.put<CategoriaResponse>(`/categorias/${edit.id}`, { nombre })
      : await http.post<CategoriaResponse>('/categorias', { nombre })
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    categoriasCache.upsert(res.data!)
    setShowForm(false); setEdit(null); setNombre(''); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/categorias/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else { categoriasCache.remove(id); load(page) }
  }

  return (
    <>
      <Shell title="Categorías de Catálogo" banner={banner} onBannerClose={() => setBanner(null)}
        action={<Btn variant="primary" small onClick={() => { setEdit(null); setNombre(''); setShowForm(true) }}>+ Nueva Categoría</Btn>}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['Nombre', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={2} /> : pageData.content.length === 0 ? <EmptyRow cols={2} /> :
                pageData.content.map(c => (
                  <TRow key={c.id}>
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
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => setPage(p)} onSize={next => { setPage(0); setSize(next) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Categoría' : 'Nueva Categoría'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><Label required>Nombre de Categoría</Label><Input value={nombre} onChange={setNombre} placeholder="Camisas" maxLength={150} /></div>
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
  const [size, setSize] = useState(10)
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
      http.get<SpringPage<TemplateResponse>>(`/templates?page=${p}&size=${size}`),
      http.get<SpringPage<CategoriaResponse>>('/categorias?page=0&size=100'),
    ])
    setLoading(false)
    if (r.error) setBanner({ status: r.error.status as HttpStatus, mensaje: r.error.mensaje })
    else setPageData(r.data!)
    if (!c.error) setCats(c.data!.content)
  }, [size])

  useEffect(() => { load(page) }, [load, page])

  const save = async () => {
    if (!f.nombre || !f.categoriaId) return
    setSaving(true)
    const commonBody = { nombre: f.nombre, temporada: f.temporada || null, proveedor: f.proveedor || null, precioBase: f.precioBase ? parseFloat(f.precioBase) : null }
    const res = edit
      ? await http.put<TemplateResponse>(`/templates/${edit.id}`, commonBody)
      : await http.post<TemplateResponse>('/templates', { ...commonBody, categoriaId: f.categoriaId })
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    templatesCache.upsert(res.data!)
    setShowForm(false); setEdit(null); setF({ nombre: '', temporada: '', proveedor: '', precioBase: '', categoriaId: '' }); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/templates/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else { templatesCache.remove(id); load(page) }
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
            <THead cols={['Nombre', 'Temporada', 'Proveedor', 'Precio Base', 'Categoría', 'Acciones']} />
            <tbody>
              {loading ? <LoadingRow cols={6} /> : pageData.content.length === 0 ? <EmptyRow cols={6} /> :
                pageData.content.map(t => {
                  const catNombre = cats.find(c => c.id === t.categoriaId)?.nombre ?? 'Categoría no disponible'
                  return (
                  <TRow key={t.id}>
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
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => setPage(p)} onSize={next => { setPage(0); setSize(next) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Template' : 'Nuevo Template'} onClose={() => { setShowForm(false); setEdit(null) }} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1/-1' }}><Label required>Nombre del Template</Label><Input value={f.nombre} onChange={v => setF(p => ({ ...p, nombre: v }))} placeholder="Camisa básica" maxLength={200} /></div>
            <div><Label>Temporada</Label><Input value={f.temporada} onChange={v => setF(p => ({ ...p, temporada: v }))} placeholder="2026-Otoño" maxLength={50} /></div>
            <div><Label>Proveedor</Label><Input value={f.proveedor} onChange={v => setF(p => ({ ...p, proveedor: v }))} placeholder="Proveedor Textil" maxLength={150} /></div>
            <div><Label>Precio Base</Label><Input value={f.precioBase} onChange={v => setF(p => ({ ...p, precioBase: v }))} placeholder="89900.00" /></div>
            <div>
              <Label required>Categoría</Label>
              <Select value={f.categoriaId} onChange={v => setF(p => ({ ...p, categoriaId: v }))} disabled={Boolean(edit)}>
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
  const [size, setSize] = useState(10)
  const [pageData, setPageData] = useState<SpringPage<VarianteResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [templates, setTemplates] = useState<TemplateResponse[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null)
  const [skuResult, setSkuResult] = useState<VarianteResponse | null | 'notfound'>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<VarianteResponse | null>(null)
  const [f, setF] = useState({ sku: '', talla: '', color: '', templateId: '' })
  // Mientras el usuario no toque el SKU, cambiar de template lo vuelve a generar
  const [skuEditado, setSkuEditado] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skuLoading, setSkuLoading] = useState(false)

  const loadTemplates = useCallback(async () => {
    const res = await http.get<SpringPage<TemplateResponse>>('/templates?page=0&size=200')
    if (!res.error) setTemplates(res.data!.content)
  }, [])

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const res = await http.get<SpringPage<VarianteResponse>>(`/variantes?page=${p}&size=${size}`)
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setPageData(res.data!)
  }, [size])

  useEffect(() => { load(page); loadTemplates(); loadVariantCatalog().then(setCatalogs).catch(() => undefined) }, [load, loadTemplates, page])

  const templateName = (id: string) => templates.find(t => t.id === id)?.nombre ?? 'Template no disponible'

  const searchBySku = async () => {
    const selected = catalogs?.variantesById.get(selectedVariantId)
    if (!selected) return
    setSkuLoading(true)
    const res = await http.get<VarianteResponse>(`/variantes/sku/${encodeURIComponent(selected.sku)}`)
    setSkuLoading(false)
    if (res.error?.status === 404) setSkuResult('notfound')
    else if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else setSkuResult(res.data!)
  }

  const save = async () => {
    if (!f.sku.trim() || !f.templateId) return
    setSaving(true)
    const body = { sku: f.sku.trim(), talla: f.talla || null, color: f.color || null, templateId: f.templateId }
    const res = edit
      ? await http.put<VarianteResponse>(`/variantes/${edit.id}`, body)
      : await http.post<VarianteResponse>('/variantes', body)
    setSaving(false)
    if (res.error) { setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); return }
    variantesCache.upsert(res.data!)
    loadVariantCatalog().then(setCatalogs).catch(() => undefined)
    setShowForm(false); setEdit(null); setF({ sku: '', talla: '', color: '', templateId: '' }); load(page)
  }

  const del = async (id: string) => {
    const res = await http.delete(`/variantes/${id}`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else { variantesCache.remove(id); loadVariantCatalog().then(setCatalogs).catch(() => undefined); load(page) }
  }

  const openEdit = (v: VarianteResponse) => {
    setEdit(v); setF({ sku: v.sku, talla: v.talla ?? '', color: v.color ?? '', templateId: v.templateId }); setSkuEditado(true); setShowForm(true)
  }

  const generateSku = (templateId: string) => {
    const prefix = (templates.find(template => template.id === templateId)?.nombre ?? 'VARIANTE')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    return `${prefix || 'VARIANTE'}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`.slice(0, 60)
  }

  const openCreate = () => {
    const templateId = templates[0]?.id ?? ''
    setEdit(null); setF({ sku: templateId ? generateSku(templateId) : '', talla: '', color: '', templateId }); setSkuEditado(false); setShowForm(true)
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
              {catalogs ? <VarianteSelector value={selectedVariantId} onChange={setSelectedVariantId} catalogs={catalogs} label="SKU" /> : <div style={{ color: T.faint }}>Cargando catálogo…</div>}
            </div>
            <Btn variant="primary" onClick={searchBySku} loading={skuLoading}>Buscar SKU</Btn>
            {skuResult && <Btn variant="ghost" onClick={() => { setSkuResult(null); setSelectedVariantId('') }}>Limpiar</Btn>}
          </div>
          {skuResult === 'notfound' && (
            <div style={{ fontSize: 13, color: T.danger, borderLeft: `2px solid ${T.danger}`, paddingLeft: 10, marginTop: 8 }}>No encontrado</div>
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
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => setPage(p)} onSize={next => { setPage(0); setSize(next) }} />
        </div>
      </Shell>

      {showForm && (
        <Modal title={edit ? 'Editar Variante' : 'Nueva Variante'} onClose={() => { setShowForm(false); setEdit(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Label required>SKU</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><Input value={f.sku} onChange={v => { setSkuEditado(true); setF(p => ({ ...p, sku: v })) }} mono maxLength={60} /></div>
                <Btn variant="ghost" small disabled={!f.templateId} onClick={() => { setSkuEditado(false); setF(p => ({ ...p, sku: generateSku(p.templateId) })) }}>Generar</Btn>
              </div>
              {!edit && <div style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>Se genera a partir del template; puedes cambiarlo.</div>}
            </div>
            <div>
              <Label required>Template</Label>
              <Select value={f.templateId} onChange={v => setF(p => ({ ...p, templateId: v, sku: skuEditado || !v ? p.sku : generateSku(v) }))}>
                <option value="">— Seleccionar template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><Label>Talla</Label><Input value={f.talla} onChange={v => setF(p => ({ ...p, talla: v }))} placeholder="M" maxLength={20} /></div>
              <div><Label>Color</Label><Input value={f.color} onChange={v => setF(p => ({ ...p, color: v }))} placeholder="Negro" maxLength={50} /></div>
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
  const [size, setSize] = useState(10)
  const [pageData, setPageData] = useState<SpringPage<TiendaResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState<TiendaResponse | null>(null)
  const [detail, setDetail] = useState<TiendaConNodosResponse | null>(null)
  const [centros, setCentros] = useState<CentroDistribucionResponse[]>([])
  const [prioridad, setPrioridad] = useState<PrioridadTiendaCdResponse[]>([])
  const [nombre, setNombre] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const res = await http.get<SpringPage<TiendaResponse>>(`/tiendas?page=${p}&size=${size}`)
    setLoading(false)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); else setPageData(res.data!)
  }, [size])
  useEffect(() => { load(page) }, [load, page])

  const changeStatus = async (store: TiendaResponse) => {
    const res = store.estado === 'ACTIVA' ? await http.delete(`/tiendas/${store.id}`) : await http.put<TiendaResponse>(`/tiendas/${store.id}/activar`)
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
    else { tiendasCache.upsert(res.data ?? { ...store, estado: 'INACTIVA' }); load(page) }
  }

  const openDetail = async (id: string) => {
    const [store, priorities, cds] = await Promise.all([
      http.get<TiendaConNodosResponse>(`/tiendas/${id}`),
      http.get<PrioridadTiendaCdResponse[]>(`/tiendas/${id}/prioridad-cd`),
      http.get<SpringPage<CentroDistribucionResponse>>('/centros-distribucion?page=0&size=200'),
    ])
    if (store.error) { setBanner({ status: store.error.status as HttpStatus, mensaje: store.error.mensaje }); return }
    setDetail(store.data!); setPrioridad(priorities.error ? [] : priorities.data!); setCentros(cds.error ? [] : cds.data!.content)
  }

  const save = async () => {
    if (!nombre) { setFormError('El nombre es obligatorio.'); return }
    setSaving(true); setFormError('')
    const body = { nombre, ubicacion }
    const res = edit ? await http.put<TiendaResponse>(`/tiendas/${edit.id}`, body) : await http.post<TiendaConNodosResponse>('/tiendas', body)
    setSaving(false)
    if (res.error) {
      if (res.error.status === 400) setFormError(res.error.mensaje); else setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje })
      return
    }
    tiendasCache.upsert(res.data!)
    setShowForm(false); setEdit(null); setNombre(''); setUbicacion(''); load(page)
    if (!edit) openDetail(res.data!.id)
  }

  const movePriority = (index: number, direction: -1 | 1) => {
    const next = [...prioridad]; const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setPrioridad(next.map((item, i) => ({ ...item, ordenPrioridad: i + 1 })))
  }
  const addPriority = (cdId: string) => {
    if (!detail || !cdId || prioridad.some(p => p.cdId === cdId)) return
    setPrioridad(p => [...p, { id: `local-${cdId}`, tiendaId: detail.id, cdId, ordenPrioridad: p.length + 1 }])
  }
  const savePriority = async () => {
    if (!detail) return
    const res = await http.put<PrioridadTiendaCdResponse[]>(`/tiendas/${detail.id}/prioridad-cd`, { cdIds: prioridad.map(p => p.cdId) })
    if (res.error) setBanner({ status: res.error.status as HttpStatus, mensaje: res.error.mensaje }); else setPrioridad(res.data!)
  }
  const cdName = (id: string) => centros.find(c => c.id === id)?.nombre ?? 'Centro no disponible'

  return <>
    <Shell title="Gestión de Tiendas" banner={banner} onBannerClose={() => setBanner(null)} action={<Btn variant="primary" small onClick={() => { setEdit(null); setNombre(''); setUbicacion(''); setFormError(''); setShowForm(true) }}>+ Nueva Tienda</Btn>}>
      <div style={{ border: `1px solid ${T.rule}` }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <THead cols={['Nombre', 'Ubicación', 'Estado', 'Acciones']} />
        <tbody>{loading ? <LoadingRow cols={4} /> : pageData.content.length === 0 ? <EmptyRow cols={4} /> : pageData.content.map(store => <TRow key={store.id}>
          <TD><strong style={{ fontWeight: 500 }}>{store.nombre}</strong></TD><TD>{store.ubicacion || '—'}</TD>
          <TD><Badge value={store.estado} variant={store.estado === 'ACTIVA' ? 'active' : 'inactive'} /></TD>
          <td style={{ padding: '8px 16px' }}><div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="ghost" small onClick={() => openDetail(store.id)}>Detalle</Btn>
            <Btn variant="ghost" small onClick={() => { setEdit(store); setNombre(store.nombre); setUbicacion(store.ubicacion); setFormError(''); setShowForm(true) }}>Editar</Btn>
            <Btn variant={store.estado === 'ACTIVA' ? 'danger' : 'ghost'} small onClick={() => changeStatus(store)}>{store.estado === 'ACTIVA' ? 'Desactivar' : 'Activar'}</Btn>
          </div></td>
        </TRow>)}</tbody>
      </table><Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={setPage} onSize={next => { setPage(0); setSize(next) }} /></div>
    </Shell>

    {showForm && <Modal title={edit ? 'Editar Tienda' : 'Nueva Tienda'} onClose={() => setShowForm(false)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError && <div style={{ fontSize: 13, color: T.danger, borderLeft: `2px solid ${T.danger}`, paddingLeft: 10 }}>{formError}</div>}
        <div><Label required>Nombre</Label><Input value={nombre} onChange={setNombre} maxLength={150} /></div>
        <div><Label>Ubicación</Label><Input value={ubicacion} onChange={setUbicacion} maxLength={255} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Btn variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Btn><Btn onClick={save} loading={saving}>Guardar</Btn></div>
      </div>
    </Modal>}

    {detail && <Modal title={`Detalle — ${detail.nombre}`} onClose={() => setDetail(null)} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
        <div style={{ border: `1px solid ${T.rule}`, padding: 14 }}><Label>Nodo almacén</Label><Mono>{detail.almacenId}</Mono></div>
        <div style={{ border: `1px solid ${T.rule}`, padding: 14 }}><Label>Nodo bodega</Label><Mono>{detail.bodegaId}</Mono></div>
      </div>
      <Label>Prioridad de centros</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><Select value="" onChange={addPriority}><option value="">— Añadir centro —</option>{centros.filter(c => !prioridad.some(p => p.cdId === c.id)).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></div>
      <div style={{ border: `1px solid ${T.rule}` }}>{prioridad.length === 0 ? <div style={{ padding: 14, color: T.faint }}>Sin centros priorizados</div> : prioridad.map((item, index) => <div key={item.cdId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottom: `1px solid ${T.rule}` }}>
        <span><Mono>{index + 1}</Mono> &nbsp; {cdName(item.cdId)}</span><div style={{ display: 'flex', gap: 5 }}><Btn variant="ghost" small disabled={index === 0} onClick={() => movePriority(index, -1)}>Subir</Btn><Btn variant="ghost" small disabled={index === prioridad.length - 1} onClick={() => movePriority(index, 1)}>Bajar</Btn><Btn variant="danger" small onClick={() => setPrioridad(p => p.filter(x => x.cdId !== item.cdId))}>Quitar</Btn></div>
      </div>)}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}><Btn variant="ghost" onClick={() => setDetail(null)}>Cerrar</Btn><Btn onClick={savePriority}>Guardar prioridad</Btn></div>
    </Modal>}
  </>
}

// ════════════════════════════════════════════════════════════════════════════
// CENTROS DE DISTRIBUCIÓN
// ════════════════════════════════════════════════════════════════════════════

function CentrosView() {
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(10)
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
    const params = new URLSearchParams({ page: String(p), size: String(size) })
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
  }, [size])

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
        <div style={{ border: `1px solid ${T.rule}`, marginTop: 14 }}>
          <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={p => setPage(p)} onSize={next => { setPage(0); setSize(next) }} />
        </div>
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
            <div><Label required>Nombre</Label><Input value={nombre} onChange={setNombre} placeholder="CD Principal" maxLength={150} /></div>
            <div><Label>Ubicación</Label><Input value={ubicacion} onChange={setUbicacion} placeholder="Bogotá" maxLength={255} /></div>
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
  const [size, setSize] = useState(10)
  const [pageData, setPageData] = useState<SpringPage<BodegaTiendaResponse>>({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
  const [tiendas, setTiendas] = useState<Map<string, TiendaResponse>>(new Map())
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<AppBanner | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    const warehouses = await http.get<SpringPage<BodegaTiendaResponse>>(`/bodegas-tienda?page=${p}&size=${size}`)
    setLoading(false)
    if (warehouses.error) setBanner({ status: warehouses.error.status as HttpStatus, mensaje: warehouses.error.mensaje })
    else {
      setPageData(warehouses.data!)
      try {
        const next = new Map((await loadTiendas()).map(item => [item.id, item]))
        const missing = [...new Set(warehouses.data!.content.map(item => item.tiendaId).filter(id => !next.has(id)))]
        await Promise.all(missing.map(async id => {
          try { next.set(id, await loadStoreDetail(id)) } catch { /* unresolved stores render as em dashes */ }
        }))
        setTiendas(next)
      } catch (error) {
        const apiError = error as { status: number; mensaje: string }
        setBanner({ status: apiError.status as HttpStatus, mensaje: apiError.mensaje })
      }
    }
  }, [size])

  useEffect(() => { load(page) }, [load, page])
  const store = (id: string) => tiendas.get(id)

  return <Shell title="Bodegas de Tienda" banner={banner} onBannerClose={() => setBanner(null)}>
    <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Vista de solo lectura. Las bodegas se crean automáticamente con cada tienda.</div>
    <div style={{ border: `1px solid ${T.rule}` }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <THead cols={['Tienda', 'Ubicación', 'Estado de la tienda']} />
      <tbody>{loading ? <LoadingRow cols={3} /> : pageData.content.length === 0 ? <EmptyRow cols={3} /> : pageData.content.map(b => {
        const resolved = store(b.tiendaId)
        const estado = resolved?.estado
        return <TRow key={b.id}>
          <TD><strong style={{ fontWeight: 500 }}>{b.tiendaNombre ?? resolved?.nombre ?? '—'}</strong></TD>
          <TD>{b.tiendaUbicacion ?? resolved?.ubicacion ?? '—'}</TD>
          <TD>{estado ? <Badge value={estado} variant={estado === 'ACTIVA' ? 'active' : 'inactive'} /> : <span style={{ color: T.faint }}>No disponible</span>}</TD>
        </TRow>
      })}</tbody>
    </table>
    <Paginator page={pageData.number} totalPages={pageData.totalPages} totalElements={pageData.totalElements} size={pageData.size} onPage={setPage} onSize={next => { setPage(0); setSize(next) }} />
    </div>
  </Shell>
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
    apiConfig.setToken(null); resetCaches()
    setUser(null); setAuthState('login'); setView('usuarios')
  }, [])

  // Register 401 handler
  useEffect(() => {
    apiConfig.onUnauthorized(() => {
      apiConfig.setToken(null); resetCaches(); setUser(null); setAuthState('login')
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
      case 'inventario': return <InventoryView />
      case 'ventas':     return <SalesView />
      case 'reposicion': return <ReplenishmentView />
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
