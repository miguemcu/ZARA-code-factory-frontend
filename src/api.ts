// API client — configurable base URL, token mgmt, 401→refresh→retry

export type ApiError = { status: number; mensaje: string }
export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError }

export interface SpringPage<T> {
  content: T[]
  number: number        // 0-based
  size: number
  totalElements: number
  totalPages: number
}

// ── Singleton state ────────────────────────────────────────────────────────

let _baseUrl = 'http://localhost:8080/api/v1'
let _accessToken: string | null = null
let _onUnauthorized: (() => void) | null = null
let _onBaseUrlChange: ((url: string) => void) | null = null

export const apiConfig = {
  getBaseUrl: () => _baseUrl,
  setBaseUrl: (url: string) => {
    _baseUrl = url.replace(/\/$/, '')
    _onBaseUrlChange?.(url)
  },
  getToken: () => _accessToken,
  setToken: (token: string | null) => { _accessToken = token },
  onUnauthorized: (fn: () => void) => { _onUnauthorized = fn },
  onBaseUrlChange: (fn: (url: string) => void) => { _onBaseUrlChange = fn },
}

// ── Core fetch ─────────────────────────────────────────────────────────────

async function doFetch<T>(
  path: string,
  options: RequestInit,
  retry: boolean
): Promise<ApiResult<T>> {
  const url = `${_baseUrl}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  let res: Response
  try {
    res = await fetch(url, { ...options, headers, credentials: 'include' })
  } catch {
    return { data: null, error: { status: 0, mensaje: 'Error de conexión con el servidor' } }
  }

  if (res.status === 204) return { data: null as unknown as T, error: null }

  const text = await res.text()
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* keep null */ }

  if (!res.ok) {
    if (res.status === 401 && retry) {
      const ok = await refreshToken()
      if (ok) return doFetch<T>(path, options, false)
      _onUnauthorized?.()
    }
    const msg = (body as Record<string, string> | null)?.mensaje ?? `Error HTTP ${res.status}`
    return { data: null, error: { status: res.status, mensaje: msg } }
  }

  return { data: body as T, error: null }
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${_baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (!res.ok) return false
    const body = (await res.json()) as { accessToken: string }
    _accessToken = body.accessToken
    return true
  } catch { return false }
}

// ── Public API helpers ─────────────────────────────────────────────────────

export const http = {
  get: <T>(path: string) =>
    doFetch<T>(path, { method: 'GET' }, true),

  post: <T>(path: string, body?: unknown) =>
    doFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, true),

  put: <T>(path: string, body?: unknown) =>
    doFetch<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, true),

  delete: <T = void>(path: string) =>
    doFetch<T>(path, { method: 'DELETE' }, true),

  postPublic: <T>(path: string, body?: unknown) =>
    doFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, false),
}

// ── Domain types ───────────────────────────────────────────────────────────

export interface LoginResponse {
  mfaRequerido: boolean
  mfaChallengeToken: string | null
  accessToken: string | null
  usuario: UsuarioResponse | null
}

export interface UsuarioResponse {
  id: string
  email: string
  nombreCompleto: string
  estado: string
  creadoEn: string
}

export interface RolResponse {
  id: string
  nombre: string
  descripcion: string
  creadoEn: string
}

export interface ScopeResponse {
  id: string
  codigo: string
  descripcion: string
  sensible: boolean
  creadoEn: string
}

export interface CategoriaResponse {
  id: string
  nombre: string
}

export interface TemplateResponse {
  id: string
  nombre: string
  temporada: string | null
  proveedor: string | null
  precioBase: number | null
  categoriaId: string
}

export interface VarianteResponse {
  id: string
  sku: string
  talla: string | null
  color: string | null
  templateId: string
}

export interface TiendaResponse {
  id: string
  nombre: string
  ubicacion: string
  estado: 'ACTIVA' | 'INACTIVA'
  creadoEn: string
  actualizadoEn: string
}

export interface CentroDistribucionResponse {
  id: string
  nombre: string
  ubicacion: string
}

export interface NodoResponse {
  id: string
  tipo: string
  cdId: string | null
  tiendaId: string | null
}

export interface CentroDistribucionConNodoResponse extends CentroDistribucionResponse {
  nodo: NodoResponse | null
}

export interface BodegaTiendaResponse {
  id: string
  tiendaId: string
  tiendaNombre: string | null
  tiendaUbicacion: string | null
  inventario: unknown[]
}

export interface MfaActivarResponse {
  secreto: string
  qrCodeDataUri: string
}

export interface MfaConfirmarResponse {
  codigosRespaldo: string[]
}
