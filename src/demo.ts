// Demo del Sprint 3: roles de demo, directorio de nombres (id → nombre) y tipos del ciclo de abastecimiento.
// La API no tiene "quién soy" ni lookups para los roles operativos (contrato §3.3 y §13): el menú sale del
// rol elegido y los nombres salen de los datos sembrados más lo que el front va aprendiendo de las respuestas.

import { apiLog } from './api'

// ─── Tipos del ciclo (contrato §11) ─────────────────────────────────────────

export interface Recomendacion { id: string; tiendaId: string; varianteId: string; cdSugeridoId: string | null; cantidadSugerida: number; estado: string; fechaCreacion: string }
export interface Intento { cdId: string; ordenEvaluado: number; resultado: string; motivo: string | null; timestamp: string }
export interface Orden {
  id: string; recomendacionId: string | null; tiendaId: string; varianteId: string; cdAsignadoId: string | null; motivoAsignacion: string | null
  cantidadTotalSolicitada: number; cantidadPendiente: number; cantidadDespachadaAcumulada: number; estado: string; fechaCreacion: string
  intentos: Intento[]; motivoCierre: string | null; cerradaPor: string | null; fechaCierre: string | null
}
export interface Aprobacion { recomendacionId: string; estado: string; cantidadSugerida: number; cantidadAprobada: number; desviacion: number; aprobadoPor: string; fechaAprobacion: string; orden: Orden }
export interface Ciclo { id: string; ordenId: string; numeroCiclo: number; cantidadSolicitada: number; cantidadDespachada: number; cantidadPendiente: number; resultado: string; fillRate: number; fechaDespacho: string }
export interface Parada { id: string; cicloDespachoId: string; tiendaId: string; ordenParada: number; estado: string; fechaSalidaCd: string | null; fechaLlegada: string | null }
export interface Viaje { id: string; cdId: string; vehiculo: string; estado: string; fechaCreacion: string; fechaSalida: string | null; fechaCierre: string | null; paradas: Parada[] }
export interface ParadaPorRecibir { paradaId: string; viajeId: string; tiendaId: string; cicloDespachoId: string; ordenId: string; cantidadDespachada: number }
export interface Recepcion { id: string; viajeParadaId: string; cicloDespachoId: string; cantidadDespachada: number; cantidadRecibida: number; discrepancia: number; registradoPor: string; fechaRecepcion: string; estadoOrden: string; cantidadPendienteOrden: number }
export interface Stock { nodoId: string; varianteId: string; sku: string; aLaMano: number; disponibleParaUso: number; entrante: number; saliente: number; pronosticado: number }
export interface Movimiento { id: string; varianteId: string; tipo: string; cantidad: number; motivo: string | null; comentario: string | null; forzado: boolean; usuarioId: string | null; ocurridoEn: string }
export interface VentaLinea { id: string; varianteId: string; cantidad: number; precioUnitario: number; canal: string; forzada: boolean; estado: string }
export interface Venta { transaccionId: string; tiendaId: string; vendedorId: string; fecha: string; total: number; lineas: VentaLinea[] }

// ─── Roles de demo ──────────────────────────────────────────────────────────

export type RoleId = 'VENDEDOR' | 'SUPERVISOR_TIENDA' | 'PLANIFICADOR_ABASTECIMIENTO' | 'OPERADOR_CD' | 'COORDINADOR_TRANSPORTE' | 'ENCARGADO_BODEGA' | 'ADMIN'

export interface DemoRole { id: RoleId; nombre: string; descripcion: string; email: string; scopes: string[] }

const VENDEDOR_SCOPES = ['inventario:consultar', 'ventas:consultar', 'ventas:forzar-sin-stock', 'ventas:registrar']

// Correos de los usuarios de demo tal como quedaron en mock-data (README: `<rol>@demo.local`).
// Con un backend sembrado de nuevo, el correo real es demo.<rol>.<sufijo>@supplychain.local: se edita en el login.
export const DEMO_ROLES: DemoRole[] = [
  { id: 'VENDEDOR', nombre: 'Vendedor', descripcion: 'Registra ventas en sus tiendas', email: 'vendedor@demo.local', scopes: VENDEDOR_SCOPES },
  { id: 'SUPERVISOR_TIENDA', nombre: 'Supervisor de tienda', descripcion: 'Supervisa ventas, anulaciones e inventario de sus tiendas', email: 'supervisor-tienda@demo.local', scopes: [...VENDEDOR_SCOPES, 'ventas:anular', 'inventario:administrar'] },
  { id: 'PLANIFICADOR_ABASTECIMIENTO', nombre: 'Planificador de abastecimiento', descripcion: 'Decide qué pedir a los centros de distribución', email: 'planificador-abastecimiento@demo.local', scopes: ['inventario:consultar', 'reposicion:administrar', 'reposicion:planificar'] },
  { id: 'OPERADOR_CD', nombre: 'Operador de CD', descripcion: 'Despacha los pedidos desde el centro de distribución', email: 'operador-cd@demo.local', scopes: ['despacho:operar', 'inventario-cd:administrar', 'inventario:consultar'] },
  { id: 'COORDINADOR_TRANSPORTE', nombre: 'Coordinador de transporte', descripcion: 'Arma los viajes y registra salidas y llegadas', email: 'coordinador-transporte@demo.local', scopes: ['inventario:consultar', 'transporte:operar'] },
  { id: 'ENCARGADO_BODEGA', nombre: 'Encargado de bodega', descripcion: 'Recibe la mercancía en la bodega de la tienda', email: 'encargado-bodega@demo.local', scopes: ['inventario:consultar', 'recepcion:registrar'] },
  {
    id: 'ADMIN', nombre: 'Administrador', descripcion: 'Acceso completo', email: 'admin@supplychain.local',
    scopes: ['catalogo:administrar', 'cd:administrar', 'despacho:operar', 'inventario-cd:administrar', 'inventario:administrar', 'inventario:consultar', 'recepcion:registrar', 'reposicion:administrar', 'reposicion:planificar', 'roles:administrar', 'scopes:administrar', 'tiendas:administrar', 'tiendas:operar-todas', 'transporte:operar', 'usuarios:administrar', 'ventas:anular', 'ventas:consultar', 'ventas:forzar-sin-stock', 'ventas:registrar'],
  },
]

export const roleById = (id: string | null | undefined) => DEMO_ROLES.find(role => role.id === id) ?? null
export const roleByEmail = (email: string) => DEMO_ROLES.find(role => role.email.toLowerCase() === email.trim().toLowerCase()) ?? null
export const can = (role: RoleId | null | undefined, scope: string) => !!roleById(role)?.scopes.includes(scope)

const ROLE_KEY = 'retailos.demo.rol'
export const storedRole = (): RoleId | null => roleById(sessionStorage.getItem(ROLE_KEY))?.id ?? null
export const storeRole = (role: RoleId | null) => { role ? sessionStorage.setItem(ROLE_KEY, role) : sessionStorage.removeItem(ROLE_KEY) }

// ─── Directorio de nombres ──────────────────────────────────────────────────

export interface TiendaDir { id: string; nombre: string; almacenId?: string; bodegaId?: string }
export interface CdDir { id: string; nombre: string; nodoId?: string }
export interface VarianteDir { id: string; sku: string; template?: string; color?: string; talla?: string; precioBase?: number }
export interface NodoDir { id: string; tipo: 'ALMACEN' | 'BODEGA_TIENDA' | 'CD'; tiendaId?: string; cdId?: string }

// Datos sembrados de la demo (mock-data/00-ids-de-referencia.json), con los nombres que pide el brief
const SEED = {
  tiendas: [
    { id: 'abed0b85-7532-4edd-9f0b-abcb3b885bad', nombre: 'Tienda Demo Centro', almacenId: '4b5508c1-910d-4360-99dc-bdf8cc3a8c7b', bodegaId: '0fe4ef24-652a-45ab-b569-67924f44214d' },
    { id: '8a7a1acc-4158-40ca-8a5c-9bcb628cc2ef', nombre: 'Tienda Demo Norte', almacenId: 'e77acc97-5bc2-4767-9f6f-42b40bd67aba', bodegaId: 'c4e696a8-f7b7-4e76-a35d-a2346f41b28b' },
    { id: '96408f30-5c6c-4ca7-bb7f-5694ea901807', nombre: 'Tienda Demo Sur' },
  ] as TiendaDir[],
  cds: [
    { id: '37918b02-357e-4a64-8f21-5a498541bfc7', nombre: 'CD Demo Principal', nodoId: '45cce843-da27-4a5e-8b73-2d2bac826b30' },
    { id: 'c41e9d7f-15f6-4193-8936-f8f4550f7a28', nombre: 'CD Demo Sin Stock', nodoId: 'daf8589f-432b-4944-b410-c2ef240d20e8' },
  ] as CdDir[],
  variantes: [
    { id: 'ce457d78-460f-4997-b22e-a491f579fe36', sku: 'DEMO-S3-AZ-M', template: 'Camisa Oxford', color: 'AZ', talla: 'M', precioBase: 89900 },
    { id: 'e8a1af1e-d171-417f-97c7-fe6a3e4d7253', sku: 'DEMO-S3-BL-L', template: 'Camisa Oxford', color: 'BL', talla: 'L', precioBase: 89900 },
  ] as VarianteDir[],
}
// Tiendas de los usuarios de demo (el sembrador asigna Centro y Norte a los roles de tienda)
export const DEMO_TIENDAS = SEED.tiendas.slice(0, 2).map(t => t.id)

const COLORES: Record<string, string> = { AZ: 'Azul', BL: 'Blanco', NE: 'Negro', RO: 'Rojo', VE: 'Verde', GR: 'Gris', BE: 'Beige' }

// Lo aprendido se guarda en localStorage: solo datos de negocio (nunca tokens).
// Así el operador ve las órdenes que aprobó el planificador aunque su rol no pueda listarlas (contrato §14.3).
const STORE_KEY = 'retailos.demo.directorio.v1'

interface Learned {
  tiendas: Record<string, TiendaDir>; cds: Record<string, CdDir>; variantes: Record<string, VarianteDir>
  ordenes: Record<string, Orden>; ciclos: Record<string, Ciclo>; viajes: Record<string, Viaje>; recomendaciones: Record<string, Recomendacion>
  skuPorVariante: Record<string, string>
}
const empty = (): Learned => ({ tiendas: {}, cds: {}, variantes: {}, ordenes: {}, ciclos: {}, viajes: {}, recomendaciones: {}, skuPorVariante: {} })

let learned: Learned = (() => {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') } } catch { return empty() }
})()
let saveTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
let version = 0
function changed() {
  version++
  listeners.forEach(fn => fn())
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(learned)) } catch { /* sin espacio: se pierde lo aprendido */ } }, 300)
}

export const directory = {
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  version: () => version,
  reset: () => { learned = empty(); changed() },
  // Lo que la pantalla sabe que cambió aunque la respuesta no traiga la orden (p. ej. tras despachar)
  patchOrden: (id: string, patch: Partial<Orden>) => { const o = learned.ordenes[id]; if (o) { learned.ordenes[id] = { ...o, ...patch }; changed() } },
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export const tiendas = (): TiendaDir[] => {
  const map = new Map<string, TiendaDir>()
  Object.values(learned.tiendas).forEach(t => map.set(t.id, t))
  SEED.tiendas.forEach(t => map.set(t.id, { ...map.get(t.id), ...t }))
  return [...map.values()]
}
export const cds = (): CdDir[] => {
  const map = new Map<string, CdDir>()
  Object.values(learned.cds).forEach(c => map.set(c.id, c))
  SEED.cds.forEach(c => map.set(c.id, { ...map.get(c.id), ...c }))
  return [...map.values()]
}
export const variantes = (): VarianteDir[] => {
  const map = new Map<string, VarianteDir>()
  Object.values(learned.variantes).forEach(v => map.set(v.id, v))
  SEED.variantes.forEach(v => map.set(v.id, { ...map.get(v.id), ...v }))
  return [...map.values()]
}
export const tienda = (id?: string | null) => id ? tiendas().find(t => t.id === id) ?? null : null
export const cd = (id?: string | null) => id ? cds().find(c => c.id === id) ?? null : null
export const variante = (id?: string | null) => {
  if (!id) return null
  const found = variantes().find(v => v.id === id)
  if (found) return found
  const sku = learned.skuPorVariante[id]
  return sku ? { id, sku } : null
}
export const varianteBySku = (sku: string) => variantes().find(v => v.sku === sku) ?? null

export function nodo(id?: string | null): (NodoDir & { nombre: string }) | null {
  if (!id) return null
  for (const t of tiendas()) {
    if (t.almacenId === id) return { id, tipo: 'ALMACEN', tiendaId: t.id, nombre: `${t.nombre} · Almacén` }
    if (t.bodegaId === id) return { id, tipo: 'BODEGA_TIENDA', tiendaId: t.id, nombre: `${t.nombre} · Bodega` }
  }
  const c = cds().find(x => x.nodoId === id)
  return c ? { id, tipo: 'CD', cdId: c.id, nombre: c.nombre } : null
}

export const orden = (id?: string | null) => id ? learned.ordenes[id] ?? null : null
export const ordenes = () => Object.values(learned.ordenes)
export const ciclo = (id?: string | null) => id ? learned.ciclos[id] ?? null : null
export const ciclos = () => Object.values(learned.ciclos)
export const viaje = (id?: string | null) => id ? learned.viajes[id] ?? null : null
export const recomendacion = (id?: string | null) => id ? learned.recomendaciones[id] ?? null : null

// Ciclo aprobado en curso: permite al Operador ver/despachar aunque la API no
// permita listar órdenes y permite al Coordinador usar el CD correcto al armar el viaje.
let cicloEnCursoOrdenId: string | null = null
export const setCicloEnCurso = (ordenId: string | null) => { cicloEnCursoOrdenId = ordenId }
export const getCicloEnCurso = () => cicloEnCursoOrdenId

// ─── Textos para pantalla ───────────────────────────────────────────────────

export const DASH = '—'
export const shortRef = (id?: string | null) => id ? `#${id.slice(0, 8)}` : DASH
export const tiendaName = (id?: string | null) => tienda(id)?.nombre ?? DASH
export const cdName = (id?: string | null) => cd(id)?.nombre ?? DASH
export const nodoName = (id?: string | null) => nodo(id)?.nombre ?? DASH
export const colorName = (code?: string | null) => code ? COLORES[code.toUpperCase()] ?? code : null

// "DEMO-S3-AZ-M · Camisa Oxford · Azul · M"
export function varianteLabel(id?: string | null, fallbackSku?: string | null) {
  const v = variante(id)
  const sku = v?.sku ?? fallbackSku
  if (!sku) return DASH
  return [sku, v?.template, colorName(v?.color), v?.talla].filter(Boolean).join(' · ')
}
export const skuOf = (id?: string | null) => variante(id)?.sku ?? DASH

// Nombre de lo que sea que identifique un UUID (para mensajes de error y la consola)
export function nameForId(id: string): string | null {
  const t = tienda(id); if (t) return t.nombre
  const c = cd(id); if (c) return c.nombre
  const n = nodo(id); if (n) return n.nombre
  const v = variante(id); if (v) return v.sku
  const o = orden(id); if (o) return `orden ${shortRef(id)}`
  const cy = ciclo(id); if (cy) return `despacho n.º ${cy.numeroCiclo} (${shortRef(cy.ordenId)})`
  const vi = viaje(id); if (vi) return vi.vehiculo
  return null
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g

export function fmtDateTime(iso?: string | null) {
  if (!iso) return DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '')
}

// Mensaje del backend con nombres en vez de UUID y fechas UTC en hora local
export function humanize(text: string) {
  return text
    .replace(UUID_RE, id => nameForId(id) ?? shortRef(id))
    .replace(ISO_RE, iso => fmtDateTime(iso))
}

// ─── Aprendizaje desde las respuestas de la API ─────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string' ? v : undefined

function learnObject(o: Record<string, unknown>, path: string) {
  const id = str(o.id)
  if (Array.isArray(o.intentos) && 'cantidadTotalSolicitada' in o && id) { learned.ordenes[id] = o as unknown as Orden; return true }
  if ('numeroCiclo' in o && 'fillRate' in o && id) { learned.ciclos[id] = o as unknown as Ciclo; return true }
  if ('vehiculo' in o && Array.isArray(o.paradas) && id) { learned.viajes[id] = o as unknown as Viaje; return true }
  if ('cantidadSugerida' in o && 'cdSugeridoId' in o && id) { learned.recomendaciones[id] = o as unknown as Recomendacion; return true }
  if ('viajeParadaId' in o && 'discrepancia' in o) {
    const cy = learned.ciclos[str(o.cicloDespachoId) ?? '']
    const or = cy && learned.ordenes[cy.ordenId]
    if (or) learned.ordenes[or.id] = { ...or, estado: String(o.estadoOrden), cantidadPendiente: Number(o.cantidadPendienteOrden) }
    return true
  }
  if (str(o.sku) && str(o.varianteId)) { learned.skuPorVariante[o.varianteId as string] = o.sku as string; return true }
  if (str(o.sku) && id && ('talla' in o || 'templateId' in o)) {
    learned.variantes[id] = { id, sku: o.sku as string, template: str(o.templateNombre) ?? learned.variantes[id]?.template, color: str(o.color), talla: str(o.talla), precioBase: typeof o.precioBase === 'number' ? o.precioBase : undefined }
    return true
  }
  if (id && str(o.nombre)) {
    if (path.startsWith('/tiendas') || path.startsWith('/usuarios')) {
      learned.tiendas[id] = { ...learned.tiendas[id], id, nombre: o.nombre as string, ...(str(o.almacenId) ? { almacenId: o.almacenId as string, bodegaId: str(o.bodegaId) } : {}) }
      return true
    }
    if (path.startsWith('/centros-distribucion')) {
      const nodoId = isObj(o.nodo) ? str(o.nodo.id) : undefined
      learned.cds[id] = { ...learned.cds[id], id, nombre: o.nombre as string, ...(nodoId ? { nodoId } : {}) }
      return true
    }
  }
  return false
}

function learn(path: string, body: unknown) {
  let any = false
  const visit = (v: unknown, depth: number) => {
    if (depth > 3) return
    if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return }
    if (!isObj(v)) return
    if (learnObject(v, path)) any = true
    // La aprobación trae la orden dentro; la recomendación aprobada se marca
    if (isObj(v.orden)) { visit(v.orden, depth + 1); const r = learned.recomendaciones[str(v.recomendacionId) ?? '']; if (r && str(v.estado)) learned.recomendaciones[r.id] = { ...r, estado: v.estado as string } }
    if (Array.isArray(v.content)) visit(v.content, depth + 1)
    if (Array.isArray(v.recomendaciones)) visit(v.recomendaciones, depth + 1)
  }
  visit(body, 0)
  if (any) changed()
}

apiLog.onResponse(learn)
