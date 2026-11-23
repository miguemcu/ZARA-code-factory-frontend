// Primitivos compartidos de RETAIL OS, extraídos de App.tsx con el mismo aspecto:
// Instrument Sans / DM Mono, ink/muted/faint/rule/surface, bordes de 1px, sin radios ni sombras.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { apiConfig } from './api'
import { directory, humanize, DASH } from './demo'

// ─── Tokens ─────────────────────────────────────────────────────────────────

export const T = {
  ink: '#111111',
  muted: '#666666',
  faint: '#999999',
  rule: '#E2E2E2',
  surface: '#F9F9F9',
  canvas: '#FFFFFF',
  danger: '#B91C1C',
  warn: '#92400E',
}

// Colores de estado: solo como punto o Badge pequeño, nunca como relleno grande
export const TONE = {
  amber: '#D97706',
  green: '#15803D',
  blue: '#1D4ED8',
  violet: '#7C3AED',
  red: '#B91C1C',
  gray: '#999999',
}
export type Tone = keyof typeof TONE

// ─── Estados HTTP ───────────────────────────────────────────────────────────

export type HttpStatus = 400 | 401 | 403 | 404 | 405 | 409 | 422 | 500 | 0
export interface AppBanner { status: HttpStatus | number; mensaje: string }

// ─── Básicos ────────────────────────────────────────────────────────────────

export function HR() {
  return <hr style={{ border: 'none', borderTop: `1px solid ${T.rule}`, margin: 0 }} />
}

export function Mono({ children, size = 12, color = T.muted, title }: { children: React.ReactNode; size?: number; color?: string; title?: string }) {
  return <span title={title} style={{ fontFamily: 'var(--font-mono)', fontSize: size, color }}>{children}</span>
}

export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 500, textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>
      {children}{required && <span style={{ color: T.ink, marginLeft: 2 }}>*</span>}
    </div>
  )
}

export function Input({
  value, onChange, placeholder, type = 'text', mono, readOnly, autoFocus, maxLength, min, max,
}: {
  value: string; onChange?: (v: string) => void; placeholder?: string
  type?: string; mono?: boolean; readOnly?: boolean; autoFocus?: boolean; maxLength?: number; min?: string | number; max?: string | number
}) {
  return (
    <input
      type={type} value={value} readOnly={readOnly} autoFocus={autoFocus} maxLength={maxLength} placeholder={placeholder} min={min} max={max}
      onChange={e => onChange?.(e.target.value)}
      style={{
        border: `1px solid ${T.rule}`, background: readOnly ? T.surface : T.canvas, color: T.ink,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: mono ? 13 : 14, padding: '9px 12px', width: '100%', outline: 'none',
        transition: 'border-color .15s',
      }}
      onFocus={e => (e.target.style.borderColor = T.ink)}
      onBlur={e => (e.target.style.borderColor = T.rule)}
    />
  )
}

export function Select({ value, onChange, children, disabled }: { value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{ border: `1px solid ${T.rule}`, background: disabled ? T.surface : T.canvas, color: T.ink, fontFamily: 'var(--font-sans)', fontSize: 14, padding: '9px 12px', width: '100%', outline: 'none', appearance: 'none', opacity: disabled ? 0.7 : 1 }}
    >
      {children}
    </select>
  )
}

export function Textarea({ value, onChange, placeholder, rows = 3, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number }) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} maxLength={maxLength}
      style={{ border: `1px solid ${T.rule}`, background: T.canvas, color: T.ink, fontFamily: 'var(--font-sans)', fontSize: 14, padding: '9px 12px', width: '100%', outline: 'none', resize: 'vertical', transition: 'border-color .15s' }}
      onFocus={e => (e.target.style.borderColor = T.ink)}
      onBlur={e => (e.target.style.borderColor = T.rule)}
    />
  )
}

// Etiqueta + control, para formularios
export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <Label required={required}>{label}</Label>
      {children}
      {hint && <div style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>{hint}</div>}
    </label>
  )
}

export function Btn({
  children, variant = 'primary', small, onClick, type = 'button', disabled, loading, loadingText,
}: {
  children: React.ReactNode; variant?: 'primary' | 'ghost' | 'danger'
  small?: boolean; onClick?: () => void; type?: 'button' | 'submit'
  disabled?: boolean; loading?: boolean; loadingText?: string
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
      {loading ? loadingText ?? '…' : children}
    </button>
  )
}

export function Badge({ value, variant = 'neutral' }: { value: string; variant?: 'neutral' | 'active' | 'inactive' | 'warn' }) {
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

// ─── Línea de llamada: "POST {baseUrl}/ruta" bajo cada botón que llama a la API ──

export function useBaseUrl() {
  const [url, setUrl] = useState(apiConfig.getBaseUrl())
  useEffect(() => {
    const id = setInterval(() => setUrl(current => current === apiConfig.getBaseUrl() ? current : apiConfig.getBaseUrl()), 500)
    return () => clearInterval(id)
  }, [])
  return url
}

// `ruta` va con plantillas ({id}); `real` (la ruta con ids) solo aparece al pasar el cursor
export function CallLine({ method, ruta, real, align = 'left' }: { method: string; ruta: string; real?: string; align?: 'left' | 'center' | 'right' }) {
  const baseUrl = useBaseUrl()
  return (
    <div title={real ? `${method} ${baseUrl}${real}` : undefined} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: T.faint, marginTop: 6, textAlign: align, wordBreak: 'break-all' }}>
      {method} {baseUrl}{ruta}
    </div>
  )
}

// ─── Estados con nombre amigable + valor real: "● Por revisar  BORRADOR" ────

export function StatusTag({ label, raw, tone, strike, note }: { label: string; raw?: string; tone: Tone; strike?: boolean; note?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }} title={note}>
      <span style={{ color: TONE[tone], fontSize: 10, lineHeight: 1 }}>●</span>
      <span style={{ fontSize: 13, color: T.ink, textDecoration: strike ? 'line-through' : 'none' }}>{label}</span>
      {raw && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.faint, letterSpacing: '0.04em' }}>{raw}</span>}
    </span>
  )
}

// ─── Banner global de error/información ─────────────────────────────────────

export function Banner({ banner, onClose }: { banner: AppBanner; onClose: () => void }) {
  useDirectoryVersion()
  const cfg: Record<number, { label: string; side: string }> = {
    400: { label: 'Revisa los datos', side: T.danger },
    401: { label: 'Sesión no autorizada', side: '#D97706' },
    403: { label: 'Acceso denegado', side: T.danger },
    404: { label: 'No encontrado', side: T.muted },
    405: { label: 'No disponible', side: T.muted },
    409: { label: 'Conflicto', side: '#7C3AED' },
    422: { label: 'No se puede procesar', side: '#D97706' },
    500: { label: 'Error del servidor', side: T.danger },
    0: { label: 'Error de Conexión', side: T.muted },
  }
  const ok = banner.status >= 200 && banner.status < 300
  const c = ok ? { label: 'Listo', side: TONE.green } : cfg[banner.status] ?? (banner.status >= 500 ? cfg[500] : cfg[0])
  const text = banner.status === 403 ? 'Tu rol no permite esta acción.' : humanize(banner.mensaje)
  return (
    <div style={{ borderLeft: `3px solid ${c.side}`, background: T.surface, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: c.side, whiteSpace: 'nowrap', paddingTop: 1 }}>{c.label}</span>
        <span style={{ fontSize: 13, color: T.ink, lineHeight: 1.5 }} title={banner.mensaje}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.faint }}>{banner.status === 0 ? 'sin respuesta' : banner.status} · </span>
          {text}
        </span>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
    </div>
  )
}

// ─── Tabla ──────────────────────────────────────────────────────────────────

export function THead({ cols }: { cols: React.ReactNode[] }) {
  return (
    <thead>
      <tr style={{ borderBottom: `1px solid ${T.rule}` }}>
        {cols.map((c, i) => (
          <th key={i} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function TRow({ children, onClick, selected }: { children: React.ReactNode; onClick?: () => void; selected?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <tr
      style={{ background: selected || hover ? T.surface : 'transparent', transition: 'background .1s', cursor: onClick ? 'pointer' : 'default', fontWeight: selected ? 500 : undefined }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function TD({ children, mono, align, title, color }: { children: React.ReactNode; mono?: boolean; align?: 'left' | 'right' | 'center'; title?: string; color?: string }) {
  return (
    <td title={title} style={{ padding: '11px 16px', fontSize: mono ? 12 : 13, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', color: color ?? T.ink, verticalAlign: 'middle', textAlign: align }}>
      {children}
    </td>
  )
}

export function EmptyRow({ cols, msg = 'Sin datos' }: { cols: number; msg?: string }) {
  return (
    <tr><td colSpan={cols} style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: T.faint }}>{msg}</td></tr>
  )
}

export function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr><td colSpan={cols} style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: T.faint }}>Cargando…</td></tr>
  )
}

// Tabla completa con estados vacío y cargando
export function Table({ cols, loading, empty = 'Sin datos', children, count }: { cols: React.ReactNode[]; loading?: boolean; empty?: string; children: React.ReactNode; count: number }) {
  return (
    <div style={{ border: `1px solid ${T.rule}`, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <THead cols={cols} />
        <tbody>{loading ? <LoadingRow cols={cols.length} /> : count === 0 ? <EmptyRow cols={cols.length} msg={empty} /> : children}</tbody>
      </table>
    </div>
  )
}

// ─── Estados vacío / cargando fuera de tablas ───────────────────────────────

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div style={{ border: `1px solid ${T.rule}`, padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: T.faint, lineHeight: 1.6 }}>{children}</div>
}

export function LoadingState({ text = 'Cargando…' }: { text?: string }) {
  return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, color: T.faint }}>{text}</div>
}

// ─── Paginador ──────────────────────────────────────────────────────────────

export function Paginator({ page, totalPages, totalElements, size, onPage, onSize }: {
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

export function pagerBtn(disabled: boolean): React.CSSProperties {
  return { border: `1px solid ${T.rule}`, background: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: '4px 10px', fontSize: 13, opacity: disabled ? 0.35 : 1, fontFamily: 'var(--font-sans)' }
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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

// ─── Shell de vista ─────────────────────────────────────────────────────────

export function Shell({ title, subtitle, action, banner, onBannerClose, children }: {
  title: string; subtitle?: React.ReactNode; action?: React.ReactNode; banner?: AppBanner | null
  onBannerClose?: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '26px 32px 20px', borderBottom: `1px solid ${T.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', color: T.ink, margin: 0 }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{subtitle}</div>}
        </div>
        {action && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>{action}</div>}
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

// Subtítulo de sección en mayúsculas, como "Información de Cuenta" en Perfil
export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase', color: T.muted }}>{children}</div>
      {right}
    </div>
  )
}

// Lista clave → valor con borde, como la ficha de Perfil
export function KV({ rows, width = 150 }: { rows: [React.ReactNode, React.ReactNode][]; width?: number }) {
  return (
    <div style={{ border: `1px solid ${T.rule}`, padding: '4px 20px' }}>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: i < rows.length - 1 ? `1px solid ${T.rule}` : 'none', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, width, flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: 13, color: T.ink }}>{v ?? DASH}</span>
        </div>
      ))}
    </div>
  )
}

// Nombre como dato principal; el id completo solo al pasar el cursor
export function Named({ name, id, mono }: { name: string; id?: string | null; mono?: boolean }) {
  return <span title={id ?? undefined} style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 12 : undefined, color: name === DASH ? T.faint : undefined }}>{name}</span>
}

// Número que se muestra en rojo si es negativo (sin recortarlo a 0)
export function Num({ value, strong }: { value: number | null | undefined; strong?: boolean }) {
  if (value == null) return <span style={{ color: T.faint }}>{DASH}</span>
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: value < 0 ? T.danger : T.ink, fontWeight: strong ? 600 : 400 }}>{value.toLocaleString('es-CO')}</span>
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

export function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
  } catch { return iso }
}
export { fmtDateTime } from './demo'

// Re-render cuando el directorio de nombres aprende algo nuevo
export function useDirectoryVersion() {
  return useSyncExternalStore(directory.subscribe, directory.version, directory.version)
}
