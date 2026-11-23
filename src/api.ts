// API client — configurable base URL, token mgmt, 401→refresh→retry,
// registro de llamadas (consola API) y modo simulado (mock://demo)

export type ApiError = { status: number; mensaje: string; body?: unknown }
export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError }

export interface SpringPage<T> {
  content: T[]
  number: number        // 0-based
  size: number
  totalElements: number
  totalPages: number
}

// ── Singleton state ────────────────────────────────────────────────────────

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
const defaultApiUrl = import.meta.env.DEV ? 'http://localhost:8080/api/v1' : ''

if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error('VITE_API_URL debe estar configurada para el build de producción')
}

// Con esta dirección en el ApiBar, http.* responde desde src/imports/mock-data
export const MOCK_URL = 'mock://demo'
export const isMockUrl = (url: string) => url.trim().toLowerCase().startsWith('mock://')

let _baseUrl = (configuredApiUrl || defaultApiUrl).replace(/\/$/, '')
let _accessToken: string | null = null
let _onUnauthorized: (() => void) | null = null
let _onBaseUrlChange: ((url: string) => void) | null = null

export const apiConfig = {
  getBaseUrl: () => _baseUrl,
  setBaseUrl: (url: string) => {
    _baseUrl = url.replace(/\/$/, '')
    _onBaseUrlChange?.(url)
  },
  isMock: () => isMockUrl(_baseUrl),
  getToken: () => _accessToken,
  setToken: (token: string | null) => { _accessToken = token },
  onUnauthorized: (fn: () => void) => { _onUnauthorized = fn },
  onBaseUrlChange: (fn: (url: string) => void) => { _onBaseUrlChange = fn },
}

// ── Registro de llamadas (consola API) ────────────────────────────────────
// Nunca se guardan cabeceras (Authorization, Cookie) ni secretos del cuerpo.

export interface ApiCall {
  id: number
  metodo: string
  ruta: string            // como la recibe el backend: /api/v1/…
  url: string
  status: number          // 0 = sin respuesta
  ms: number
  request: unknown
  response: unknown
  simulado: boolean
  nota?: string
  en: string
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity', 500: 'Internal Server Error',
}
export const statusText = (status: number) => status === 0 ? 'sin respuesta' : `${status} ${STATUS_TEXT[status] ?? ''}`.trim()

const SECRET_KEYS = new Set(['password', 'accessToken', 'refreshToken', 'refresh_token', 'mfaChallengeToken', 'token', 'secreto', 'qrCodeDataUri', 'codigosRespaldo'])

function redact(value: unknown, path: string): unknown {
  // "codigo" solo es secreto en autenticación (en /scopes es un dato normal)
  const auth = /^\/(auth|mfa)\//.test(path)
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) =>
        [k, (SECRET_KEYS.has(k) || (auth && k === 'codigo')) && x != null ? '«oculto»' : walk(x)]))
    }
    return v
  }
  return walk(value)
}

const MAX_CALLS = 150
let _calls: ApiCall[] = []
let _seq = 0
const _listeners = new Set<(calls: ApiCall[]) => void>()
const _bodyListeners = new Set<(path: string, body: unknown) => void>()

export const apiLog = {
  calls: () => _calls,
  subscribe: (fn: (calls: ApiCall[]) => void) => { _listeners.add(fn); return () => { _listeners.delete(fn) } },
  clear: () => { _calls = []; _listeners.forEach(fn => fn(_calls)) },
  // Respuestas 2xx (sin secretos) para quien aprende nombres de ellas: el directorio de la demo
  onResponse: (fn: (path: string, body: unknown) => void) => { _bodyListeners.add(fn); return () => { _bodyListeners.delete(fn) } },
}

function displayPath(path: string) {
  if (!isMockUrl(_baseUrl)) {
    try { const u = new URL(`${_baseUrl}${path}`); return u.pathname + u.search } catch { /* cae al prefijo */ }
  }
  return `/api/v1${path}`
}

function record(entry: { path: string; metodo: string; status: number; ms: number; request: unknown; response: unknown; simulado: boolean; nota?: string }) {
  const { path, ...rest } = entry
  const response = redact(rest.response, path)
  const call: ApiCall = {
    ...rest, id: ++_seq, en: new Date().toISOString(), ruta: displayPath(path), url: `${_baseUrl}${path}`,
    request: redact(rest.request, path), response,
  }
  _calls = [call, ..._calls].slice(0, MAX_CALLS)
  _listeners.forEach(fn => fn(_calls))
  if (call.status >= 200 && call.status < 300 && response != null) {
    _bodyListeners.forEach(fn => { try { fn(path, response) } catch { /* nunca rompe la llamada */ } })
  }
}

// ── Mensajes cuando el cuerpo no trae "mensaje" (UUID mal formado, 404 de ruta, 405, 500) ──

const GENERIC: Record<number, string> = {
  0: 'No pudimos conectar con el sistema. Revisa tu conexión e intenta de nuevo.',
  400: 'Revisa los datos e intenta de nuevo.',
  401: 'Tu sesión terminó. Inicia sesión de nuevo.',
  403: 'Tu rol no permite esta acción.',
  404: 'No encontramos lo que buscas.',
  405: 'Esta operación no está disponible.',
  409: 'El estado cambió; actualiza la pantalla.',
  422: 'La operación no se puede hacer así.',
  500: 'Algo salió mal de nuestro lado. Intenta de nuevo en un momento.',
}
export const genericMessage = (status: number) => GENERIC[status] ?? (status >= 500 ? GENERIC[500] : 'Ocurrió un error inesperado.')

// ── Transporte: fetch real o simulado ─────────────────────────────────────

type RawResponse = { status: number; text: string; nota?: string }

async function transport(path: string, options: RequestInit, headers: Record<string, string>): Promise<RawResponse> {
  if (isMockUrl(_baseUrl)) {
    const { mockRequest } = await import('./mock')
    const res = await mockRequest(String(options.method ?? 'GET'), path, typeof options.body === 'string' ? options.body : undefined)
    return { status: res.status, text: res.body === undefined ? '' : JSON.stringify(res.body), nota: res.nota }
  }
  const res = await fetch(`${_baseUrl}${path}`, { ...options, headers, credentials: 'include' })
  return { status: res.status, text: res.status === 204 ? '' : await res.text() }
}

function parse(text: string): unknown {
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

// ── Core fetch ─────────────────────────────────────────────────────────────

async function doFetch<T>(
  path: string,
  options: RequestInit,
  retry: boolean
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  const metodo = String(options.method ?? 'GET')
  const request = typeof options.body === 'string' ? parse(options.body) : null
  const simulado = isMockUrl(_baseUrl)
  const started = performance.now()

  let res: RawResponse
  try {
    res = await transport(path, options, headers)
  } catch {
    record({ path, metodo, status: 0, ms: Math.round(performance.now() - started), request, response: null, simulado })
    return { data: null, error: { status: 0, mensaje: genericMessage(0) } }
  }

  const body = parse(res.text)
  record({ path, metodo, status: res.status, ms: Math.round(performance.now() - started), request, response: body, simulado, nota: res.nota })

  if (res.status === 204) return { data: null as unknown as T, error: null }

  if (res.status < 200 || res.status >= 300) {
    if (res.status === 401 && retry) {
      const ok = await refreshToken()
      if (ok) return doFetch<T>(path, options, false)
      _onUnauthorized?.()
    }
    const own = body && typeof body === 'object' ? (body as Record<string, unknown>).mensaje : undefined
    const msg = typeof own === 'string' && own.trim() ? own : genericMessage(res.status)
    return { data: null, error: { status: res.status, mensaje: msg, body } }
  }

  return { data: body as T, error: null }
}

async function refreshToken(): Promise<boolean> {
  const simulado = isMockUrl(_baseUrl)
  const started = performance.now()
  try {
    const res = await transport('/auth/refresh', { method: 'POST' }, {})
    const body = parse(res.text)
    record({ path: '/auth/refresh', metodo: 'POST', status: res.status, ms: Math.round(performance.now() - started), request: null, response: body, simulado })
    if (res.status !== 200) return false
    _accessToken = (body as { accessToken: string }).accessToken
    return true
  } catch {
    record({ path: '/auth/refresh', metodo: 'POST', status: 0, ms: Math.round(performance.now() - started), request: null, response: null, simulado })
    return false
  }
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
  templateNombre?: string | null
  precioBase?: number | null
}

export interface TiendaResponse {
  id: string
  nombre: string
  ubicacion: string
  estado: 'ACTIVA' | 'INACTIVA'
  creadoEn: string
  actualizadoEn: string
}

export interface TiendaConNodosResponse extends TiendaResponse {
  almacenId: string
  bodegaId: string
}

export interface TiendaAsignadaResponse {
  id: string
  nombre: string
  activa: boolean
}

export interface PrioridadTiendaCdResponse {
  id: string
  tiendaId: string
  cdId: string
  ordenPrioridad: number
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
