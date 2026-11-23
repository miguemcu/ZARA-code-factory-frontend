// Modo simulado (ApiBar = "mock://demo"). Responde como la API usando src/imports/mock-data:
// el estado inicial (existencias, ids, usuarios), la forma de cada respuesta y los mismos códigos y
// mensajes de error que se capturaron. Encima corre una simulación pequeña del ciclo (venta → recomendación
// → orden → despacho → viaje → recepción → cierre) para que la demo se pueda recorrer en orden.
// Lo que no está simulado se responde con la captura exacta si existe; si no, 404 como Spring.

import { DEMO_ROLES, DEMO_TIENDAS, roleByEmail, roleById, storedRole, type RoleId,
  type Recomendacion, type Orden, type Ciclo, type Viaje, type Recepcion, type Venta, type Movimiento, type Stock } from './demo'

export interface MockResponse { status: number; body?: unknown; nota?: string }

// ─── Capturas ───────────────────────────────────────────────────────────────

interface Llamada { caso: string; rol: string; request: { metodo: string; ruta: string; cuerpo: unknown }; status: number; body: unknown; nota?: string }
interface Archivo { llamadas: Llamada[]; ids?: Ids; secuenciaDeMagnitudes?: Record<string, Record<string, Record<string, { aLaMano: number }>>>; scopesPorRol?: Record<string, string[]> }
interface Ids {
  variantes: Record<string, string>
  cds: Record<string, { id: string; nodoId: string }>
  tiendas: Record<string, { id: string; nombre: string; almacenId: string; bodegaId: string } | string>
}

interface Data {
  llamadas: Llamada[]
  ids: Ids
  inicial: Record<string, Record<string, { aLaMano: number }>>
  scopes: Record<string, string[]>
  pools: { recs: Map<string, string[]>; ordenByRec: Map<string, string>; ciclo: Map<string, string>; viaje: Map<string, string>; parada: Map<string, string>; recepcion: Map<string, string> }
}

let dataPromise: Promise<Data> | null = null

function loadData(): Promise<Data> {
  dataPromise ??= (async () => {
    const modules = import.meta.glob<Archivo>('./imports/mock-data/*.json', { import: 'default' })
    const files = await Promise.all(Object.entries(modules).sort(([a], [b]) => a.localeCompare(b)).map(([, load]) => load()))
    const llamadas = files.flatMap(f => f.llamadas ?? [])
    const ids = files.find(f => f.ids)!.ids!
    const inicial = files.find(f => f.secuenciaDeMagnitudes)!.secuenciaDeMagnitudes!.inicial
    const scopes = files.find(f => f.scopesPorRol)!.scopesPorRol!
    // Ids reales de las capturas, para que el recorrido simulado use los mismos que mock-data
    const pools: Data['pools'] = { recs: new Map(), ordenByRec: new Map(), ciclo: new Map(), viaje: new Map(), parada: new Map(), recepcion: new Map() }
    const seenRec = new Set<string>()
    const recs: Recomendacion[] = []
    const visit = (v: unknown, depth = 0): void => {
      if (depth > 4 || !v || typeof v !== 'object') return
      if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return }
      const o = v as Record<string, unknown>
      if (typeof o.id === 'string' && 'cantidadSugerida' in o && 'cdSugeridoId' in o && !seenRec.has(o.id)) { seenRec.add(o.id); recs.push(o as unknown as Recomendacion) }
      if (typeof o.id === 'string' && Array.isArray(o.intentos) && typeof o.recomendacionId === 'string') pools.ordenByRec.set(o.recomendacionId, o.id)
      if (typeof o.id === 'string' && 'numeroCiclo' in o) pools.ciclo.set(`${o.ordenId}:${o.numeroCiclo}`, o.id)
      if (typeof o.id === 'string' && 'vehiculo' in o && Array.isArray(o.paradas)) {
        const paradas = o.paradas as { id: string; cicloDespachoId: string }[]
        pools.viaje.set(paradas.map(p => p.cicloDespachoId).sort().join(','), o.id)
        paradas.forEach(p => pools.parada.set(p.cicloDespachoId, p.id))
      }
      if (typeof o.id === 'string' && typeof o.viajeParadaId === 'string') pools.recepcion.set(o.viajeParadaId, o.id)
      Object.values(o).forEach(x => visit(x, depth + 1))
    }
    llamadas.forEach(l => visit(l.body))
    recs.sort((a, b) => a.fechaCreacion.localeCompare(b.fechaCreacion)).forEach(r => {
      const key = `${r.tiendaId}:${r.varianteId}`
      pools.recs.set(key, [...(pools.recs.get(key) ?? []), r.id])
    })
    return { llamadas, ids, inicial, scopes, pools }
  })()
  return dataPromise
}

const capture = (d: Data, caso: string) => d.llamadas.find(l => l.caso === caso)

// ─── Red de la demo ─────────────────────────────────────────────────────────

interface NodoSim { id: string; tipo: 'CD' | 'ALMACEN' | 'BODEGA_TIENDA'; key: string; tiendaId?: string; cdId?: string }
interface Red { nodos: NodoSim[]; tiendas: { id: string; nombre: string; almacenId: string; bodegaId: string }[]; cds: { id: string; nodoId: string; key: string }[]; variantes: { id: string; sku: string; suffix: string }[]; prioridad: string[] }

function red(d: Data): Red {
  const tiendas = Object.values(d.ids.tiendas).filter((t): t is { id: string; nombre: string; almacenId: string; bodegaId: string } => typeof t === 'object')
  const cdKey: Record<string, string> = { principal: 'cdPrincipal', sinStock: 'cdSinStock' }
  const cds = Object.entries(d.ids.cds).map(([k, c]) => ({ ...c, key: cdKey[k] ?? k }))
  const nodos: NodoSim[] = [
    ...cds.map(c => ({ id: c.nodoId, tipo: 'CD' as const, key: c.key, cdId: c.id })),
    ...tiendas.flatMap(t => {
      const name = /Norte/.test(t.nombre) ? 'Norte' : 'Centro'
      return [
        { id: t.almacenId, tipo: 'ALMACEN' as const, key: `almacen${name}`, tiendaId: t.id },
        { id: t.bodegaId, tipo: 'BODEGA_TIENDA' as const, key: `bodega${name}`, tiendaId: t.id },
      ]
    }),
  ]
  const variantes = Object.entries(d.ids.variantes).map(([suffix, id]) => ({ id, suffix, sku: `DEMO-S3-${suffix}` }))
  // Prioridad sembrada: primero el CD Sin Stock, después el Principal (igual para las dos tiendas)
  const prioridad = [d.ids.cds.sinStock.id, d.ids.cds.principal.id]
  return { nodos, tiendas, cds, variantes, prioridad }
}

// ─── Estado simulado (persistido para sobrevivir a una recarga) ─────────────

interface Session { role: RoleId; userId: string; email: string }
interface Sim {
  session: Session | null
  mfaPendiente: boolean
  stock: Record<string, Record<string, number>>
  recs: Record<string, Recomendacion>
  ordenes: Record<string, Orden>
  recibido: Record<string, number>
  ciclos: Record<string, Ciclo>
  viajes: Record<string, Viaje>
  recepciones: Record<string, Recepcion>
  ventas: Record<string, Venta & { firma: string }>
  kardex: Record<string, Movimiento[]>
  traspasos: Record<string, unknown[]>
  usados: string[]
}

const SIM_KEY = 'retailos.mock.v1'
let sim: Sim | null = null

const USER_IDS: Partial<Record<RoleId, string>> = {
  VENDEDOR: '76b6faf5-7844-41b9-8943-c05a65fdc3fa',
  PLANIFICADOR_ABASTECIMIENTO: 'fe11482c-0000-4000-8000-000000000003',
  ENCARGADO_BODEGA: 'd81c9130-0000-4000-8000-000000000006',
  ADMIN: 'd9d0887c-d2eb-48b7-86b3-02508c0d1e79',
}
const userId = (role: RoleId) => USER_IDS[role] ?? `0de30000-0000-4000-8000-00000000000${DEMO_ROLES.findIndex(r => r.id === role)}`

function initialSim(d: Data): Sim {
  const r = red(d)
  const stock: Sim['stock'] = {}
  const kardex: Sim['kardex'] = {}
  const t0 = '2026-11-23T00:37:44.283593Z'
  for (const n of r.nodos) {
    stock[n.id] = {}
    kardex[n.id] = []
    for (const v of r.variantes) {
      const q = d.inicial[n.key]?.[v.suffix]?.aLaMano ?? 0
      stock[n.id][v.id] = q
      kardex[n.id].push({ id: crypto.randomUUID(), varianteId: v.id, tipo: 'CARGA_INICIAL', cantidad: q, motivo: null, comentario: null, forzado: false, usuarioId: USER_IDS.ADMIN!, ocurridoEn: t0 })
    }
  }
  return { session: null, mfaPendiente: false, stock, recs: {}, ordenes: {}, recibido: {}, ciclos: {}, viajes: {}, recepciones: {}, ventas: {}, kardex, traspasos: {}, usados: [] }
}

async function state(): Promise<Sim> {
  if (sim) return sim
  const d = await loadData()
  try {
    const saved = localStorage.getItem(SIM_KEY)
    sim = saved ? JSON.parse(saved) as Sim : initialSim(d)
  } catch { sim = initialSim(d) }
  return sim
}
const save = () => { try { localStorage.setItem(SIM_KEY, JSON.stringify(sim)) } catch { /* sin espacio */ } }

// Vuelve al estado inicial del recorrido (la sesión se conserva)
export async function resetMock() {
  const d = await loadData()
  const session = sim?.session ?? null
  sim = { ...initialSim(d), session }
  save()
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const now = () => new Date().toISOString()
const msg = (status: number, mensaje: string): MockResponse => ({ status, body: { mensaje } })
const spring = (status: number, error: string, path: string): MockResponse => ({ status, body: { timestamp: now(), status, error, path: `/api/v1${path}` } })
const ok = (body: unknown, status = 200): MockResponse => ({ status, body })
const JSON_INVALIDO = 'El cuerpo de la solicitud no es un JSON válido para esta operación'
const SIN_PERMISO = 'No tiene permisos para realizar esta acción'

function page<T>(items: T[], q: URLSearchParams) {
  const size = Math.min(Math.max(Number(q.get('size') ?? 20) || 20, 1), 100)
  const number = Math.max(Number(q.get('page') ?? 0) || 0, 0)
  const content = items.slice(number * size, number * size + size)
  const sort = { empty: true, sorted: false, unsorted: true }
  return {
    content, empty: content.length === 0, first: number === 0, last: (number + 1) * size >= items.length, number, numberOfElements: content.length,
    pageable: { offset: number * size, pageNumber: number, pageSize: size, paged: true, sort, unpaged: false },
    size, sort, totalElements: items.length, totalPages: Math.ceil(items.length / size),
  }
}

// Toma un id de la captura si todavía no se usó; si no, uno nuevo
function takeId(s: Sim, candidate?: string | null) {
  if (candidate && !s.usados.includes(candidate)) { s.usados.push(candidate); return candidate }
  return crypto.randomUUID()
}

const isoWithZone = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v))
const ORDEN_VIVA = ['APROBADA', 'EN_DESPACHO', 'DESPACHADA', 'EN_TRANSITO', 'REABIERTA']
const ESTADOS_ORDEN = ['GENERADA', 'APROBADA', 'EN_DESPACHO', 'DESPACHADA', 'EN_TRANSITO', 'RECIBIDA_TOTAL', 'RECIBIDA_PARCIAL', 'REABIERTA', 'CERRADA', 'CANCELADA']

// ─── Contexto de una petición ───────────────────────────────────────────────

interface Ctx { d: Data; r: Red; s: Sim; m: string; path: string; q: URLSearchParams; body: Record<string, unknown> | null; p: string[]; role: RoleId; session: Session }

const scopesOf = (c: Ctx) => c.d.scopes[c.role] ?? roleById(c.role)?.scopes ?? []
const has = (c: Ctx, scope: string) => scopesOf(c).includes(scope)
const misTiendas = (c: Ctx) => c.role === 'ADMIN' ? c.r.tiendas.map(t => t.id) : ['VENDEDOR', 'SUPERVISOR_TIENDA', 'PLANIFICADOR_ABASTECIMIENTO', 'ENCARGADO_BODEGA'].includes(c.role) ? DEMO_TIENDAS : []
const nodoVisible = (c: Ctx, n: NodoSim) => c.role === 'ADMIN' || (n.tipo === 'CD' ? c.role === 'OPERADOR_CD' : !!n.tiendaId && misTiendas(c).includes(n.tiendaId))

function stockRow(c: Ctx, nodoId: string, varianteId: string): Stock {
  const n = c.r.nodos.find(x => x.id === nodoId)!
  const v = c.r.variantes.find(x => x.id === varianteId)!
  const aLaMano = c.s.stock[nodoId]?.[varianteId] ?? 0
  const vivas = Object.values(c.s.ordenes).filter(o => o.varianteId === varianteId && ORDEN_VIVA.includes(o.estado))
  const saliente = n.tipo === 'CD' ? vivas.filter(o => o.cdAsignadoId === n.cdId).reduce((a, o) => a + Math.max(o.cantidadTotalSolicitada - o.cantidadDespachadaAcumulada, 0), 0) : 0
  const entrante = n.tipo === 'BODEGA_TIENDA' ? vivas.filter(o => o.tiendaId === n.tiendaId).reduce((a, o) => a + o.cantidadPendiente, 0) : 0
  return { nodoId, varianteId, sku: v.sku, aLaMano, disponibleParaUso: aLaMano - saliente, entrante, saliente, pronosticado: aLaMano + entrante - saliente }
}

function kardex(c: Ctx, nodoId: string, varianteId: string, tipo: string, cantidad: number, extra: Partial<Movimiento> = {}) {
  ;(c.s.kardex[nodoId] ??= []).push({ id: crypto.randomUUID(), varianteId, tipo, cantidad, motivo: null, comentario: null, forzado: false, usuarioId: null, ocurridoEn: now(), ...extra })
}

const nodosDe = (c: Ctx, tiendaId: string) => {
  const t = c.r.tiendas.find(x => x.id === tiendaId)
  return t ? { almacen: t.almacenId, bodega: t.bodegaId } : null
}

// Lo que hace el backend después de mover el almacén o la bodega de una tienda (contrato §10)
function eventosDeTienda(c: Ctx, tiendaId: string, varianteId: string) {
  const n = nodosDe(c, tiendaId)
  if (!n) return
  const almacen = c.s.stock[n.almacen][varianteId] ?? 0
  if (almacen < 3) {
    const cantidad = Math.min(6 - almacen, c.s.stock[n.bodega][varianteId] ?? 0)
    if (cantidad > 0) {
      c.s.stock[n.almacen][varianteId] = almacen + cantidad
      c.s.stock[n.bodega][varianteId] -= cantidad
      kardex(c, n.bodega, varianteId, 'TRASPASO_SALIDA', -cantidad)
      kardex(c, n.almacen, varianteId, 'TRASPASO_ENTRADA', cantidad)
      ;(c.s.traspasos[tiendaId] ??= []).unshift({ id: crypto.randomUUID(), varianteId, tiendaId, cantidad, origen: 'AUTOMATICO', registradoPor: null, timestampTraspaso: now() })
    }
  }
  return recomendar(c, tiendaId, varianteId)
}

function recomendar(c: Ctx, tiendaId: string, varianteId: string): Recomendacion | null {
  const n = nodosDe(c, tiendaId)
  if (!n) return null
  const { pronosticado } = stockRow(c, n.bodega, varianteId)
  const abierta = Object.values(c.s.recs).some(r => r.tiendaId === tiendaId && r.varianteId === varianteId && r.estado === 'BORRADOR')
  const sinCd = Object.values(c.s.ordenes).some(o => o.tiendaId === tiendaId && o.varianteId === varianteId && o.estado === 'GENERADA')
  if (pronosticado >= 5 || abierta || sinCd) return null
  const pool = c.d.pools.recs.get(`${tiendaId}:${varianteId}`) ?? []
  const id = takeId(c.s, pool.find(x => !c.s.usados.includes(x)))
  const rec: Recomendacion = { id, tiendaId, varianteId, cdSugeridoId: c.r.prioridad[0], cantidadSugerida: 20 - pronosticado, estado: 'BORRADOR', fechaCreacion: now() }
  c.s.recs[id] = rec
  return rec
}

// ─── Rutas ──────────────────────────────────────────────────────────────────

type Handler = (c: Ctx) => MockResponse
interface Route { m: string; re: RegExp; uuid?: number[]; scope?: string | ((c: Ctx) => string | null); h: Handler }

const S = '([^/]+)'
const route = (m: string, pattern: string, h: Handler, scope?: Route['scope'], uuid?: number[]): Route =>
  ({ m, re: new RegExp(`^${pattern.replace(/:id/g, S)}$`), h, scope, uuid })

const tiendaFuera = (c: Ctx, id: string | null) => !!id && !misTiendas(c).includes(id)

const ROUTES: Route[] = [
  // ── Ventas ──
  route('POST', '/ventas', c => {
    const b = c.body ?? {}
    const items = Array.isArray(b.items) ? b.items as { sku: string; cantidad: number; precioUnitario: number }[] : []
    const errors: string[] = []
    if (!b.transaccionId) errors.push('transaccionId: must not be null')
    if (!b.tiendaId) errors.push('tiendaId: must not be null')
    if (items.length === 0) errors.push('items: must not be empty')
    items.forEach((it, i) => { if (!(Number(it.cantidad) > 0)) errors.push(`items[${i}].cantidad: must be greater than 0`) })
    if (errors.length) return msg(400, errors.join('; '))
    const tiendaId = String(b.tiendaId)
    if (!c.r.tiendas.some(t => t.id === tiendaId) || tiendaFuera(c, tiendaId)) return c.role === 'ADMIN' ? msg(404, `La tienda ${tiendaId} no tiene Almacén`) : msg(403, 'No tiene acceso a esta tienda')
    if (b.forzarSinStock && !has(c, 'ventas:forzar-sin-stock')) return msg(403, SIN_PERMISO)
    const firma = JSON.stringify({ tiendaId, forzar: !!b.forzarSinStock, items: items.map(i => [i.sku, Number(i.cantidad), Number(i.precioUnitario)]) })
    const previa = c.s.ventas[String(b.transaccionId)]
    if (previa) {
      if (previa.firma !== firma) return msg(409, `La transacción ${b.transaccionId} ya se usó con datos diferentes`)
      const { firma: _f, ...venta } = previa
      return ok(venta, 200)
    }
    const n = nodosDe(c, tiendaId)!
    for (const it of items) {
      const v = c.r.variantes.find(x => x.sku === it.sku)
      if (!v) return msg(404, `No existe una variante con SKU ${it.sku}`)
      if (!b.forzarSinStock && (c.s.stock[n.almacen][v.id] ?? 0) < Number(it.cantidad)) return msg(409, `Stock insuficiente para el SKU ${it.sku}`)
    }
    const venta: Venta = {
      transaccionId: String(b.transaccionId), tiendaId, vendedorId: c.session.userId, fecha: now(),
      total: items.reduce((a, it) => a + Number(it.cantidad) * Number(it.precioUnitario), 0),
      lineas: items.map(it => {
        const v = c.r.variantes.find(x => x.sku === it.sku)!
        const forzada = !!b.forzarSinStock && (c.s.stock[n.almacen][v.id] ?? 0) < Number(it.cantidad)
        c.s.stock[n.almacen][v.id] = (c.s.stock[n.almacen][v.id] ?? 0) - Number(it.cantidad)
        kardex(c, n.almacen, v.id, 'VENTA', -Number(it.cantidad), { forzado: forzada })
        return { id: crypto.randomUUID(), varianteId: v.id, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario), canal: typeof b.canal === 'string' && b.canal ? b.canal : 'FISICO', forzada, estado: 'REGISTRADA', anuladaPor: null, anuladaEn: null, motivoAnulacion: null }
      }),
    }
    venta.lineas.forEach(l => eventosDeTienda(c, tiendaId, l.varianteId))
    c.s.ventas[venta.transaccionId] = { ...venta, firma }
    return ok(venta, 201)
  }, 'ventas:registrar'),
  route('GET', '/ventas', c => {
    const t = c.q.get('tiendaId')
    if (t && !UUID.test(t)) return spring(400, 'Bad Request', c.path)
    const items = Object.values(c.s.ventas).filter(v => misTiendas(c).includes(v.tiendaId) && (!t || v.tiendaId === t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)).map(({ firma: _f, ...v }) => v)
    return ok(page(items, c.q))
  }, 'ventas:consultar'),

  // ── Inventario ──
  route('GET', '/nodos/:id/inventario', c => {
    const n = c.r.nodos.find(x => x.id === c.p[0])
    if (!n || !nodoVisible(c, n)) return msg(404, `El nodo ${c.p[0]} no existe`)
    return ok(page(c.r.variantes.map(v => stockRow(c, n.id, v.id)).sort((a, b) => a.sku.localeCompare(b.sku)), c.q))
  }, 'inventario:consultar', [0]),
  route('GET', '/nodos/:id/inventario/movimientos', c => {
    const n = c.r.nodos.find(x => x.id === c.p[0])
    if (!n || !nodoVisible(c, n)) return msg(404, `El nodo ${c.p[0]} no existe`)
    const tipo = c.q.get('tipo')
    return ok(page((c.s.kardex[n.id] ?? []).filter(k => !tipo || k.tipo === tipo), c.q))
  }, 'inventario:consultar', [0]),
  route('GET', '/variantes/:id/inventario', c => ok(c.r.nodos.filter(n => nodoVisible(c, n) && c.r.variantes.some(v => v.id === c.p[0])).map(n => stockRow(c, n.id, c.p[0]))), 'inventario:consultar', [0]),
  route('POST', '/nodos/:id/inventario/ajustes', c => {
    const n = c.r.nodos.find(x => x.id === c.p[0])
    const b = c.body ?? {}
    const delta = Number(b.delta)
    if (!b.sku) return msg(400, 'sku: must not be blank')
    if (!Number.isInteger(delta) || delta === 0) return msg(400, 'delta: el ajuste no puede ser cero')
    if (!['CONTEO_FISICO', 'INGRESO_MANUAL', 'MERMA', 'CORRECCION'].includes(String(b.motivo))) return msg(400, 'motivo: debe ser CONTEO_FISICO, INGRESO_MANUAL, MERMA o CORRECCION')
    if (b.motivo === 'CORRECCION' && !String(b.comentario ?? '').trim()) return msg(400, 'comentario: es obligatorio cuando el motivo es CORRECCION')
    if (!n || !nodoVisible(c, n)) return msg(404, `El nodo ${c.p[0]} no existe`)
    const v = c.r.variantes.find(x => x.sku === b.sku)
    if (!v) return msg(404, `No existe una variante con SKU ${b.sku}`)
    const actual = c.s.stock[n.id][v.id] ?? 0
    if (actual + delta < 0) return msg(400, `El ajuste dejaría el stock en negativo: a la mano=${actual}, delta=${delta}`)
    c.s.stock[n.id][v.id] = actual + delta
    const comentario = typeof b.comentario === 'string' ? b.comentario : null
    kardex(c, n.id, v.id, 'AJUSTE', delta, { motivo: String(b.motivo), comentario, usuarioId: c.session.userId })
    if (n.tiendaId) eventosDeTienda(c, n.tiendaId, v.id)
    return ok({ movimientoId: crypto.randomUUID(), nodoId: n.id, sku: v.sku, delta, motivo: b.motivo, comentario, aLaMano: actual + delta, ocurridoEn: now() }, 201)
  }, c => c.r.nodos.find(x => x.id === c.p[0])?.tipo === 'CD' ? 'inventario-cd:administrar' : 'inventario:administrar', [0]),
  route('GET', '/tiendas/:id/traspasos-internos', c => tiendaFuera(c, c.p[0]) ? msg(404, `No existe una tienda con id ${c.p[0]}`) : ok(c.s.traspasos[c.p[0]] ?? []), 'reposicion:administrar', [0]),

  // ── Recomendaciones ──
  route('GET', '/recomendaciones', c => {
    const estado = c.q.get('estado'), t = c.q.get('tiendaId'), v = c.q.get('varianteId')
    if ((estado && !['BORRADOR', 'APROBADA', 'RECHAZADA'].includes(estado)) || (t && !UUID.test(t)) || (v && !UUID.test(v))) return spring(400, 'Bad Request', c.path)
    if (tiendaFuera(c, t)) return msg(404, `No existe una tienda con id ${t}`)
    const items = Object.values(c.s.recs).filter(r => misTiendas(c).includes(r.tiendaId) && (!estado || r.estado === estado) && (!t || r.tiendaId === t) && (!v || r.varianteId === v))
      .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))
    return ok(page(items, c.q))
  }, 'reposicion:planificar'),
  route('GET', '/recomendaciones/:id', c => {
    const r = c.s.recs[c.p[0]]
    return r && misTiendas(c).includes(r.tiendaId) ? ok(r) : msg(404, `No existe una recomendación con id ${c.p[0]}`)
  }, 'reposicion:planificar', [0]),
  route('POST', '/recomendaciones/evaluar', c => {
    const t = c.q.get('tiendaId')
    if (t && !UUID.test(t)) return spring(400, 'Bad Request', c.path)
    if (tiendaFuera(c, t)) return msg(404, `No existe una tienda con id ${t}`)
    const creadas = (t ? [t] : misTiendas(c)).flatMap(tid => c.r.variantes.map(v => recomendar(c, tid, v.id)).filter((x): x is Recomendacion => !!x))
    return ok({ recomendacionesCreadas: creadas.length, recomendaciones: creadas })
  }, 'reposicion:planificar'),
  route('POST', '/recomendaciones/:id/aprobar', c => {
    const rec = c.s.recs[c.p[0]]
    const pedido = c.body?.cantidadAprobada
    if (pedido !== undefined && pedido !== null && !(Number.isInteger(pedido) && Number(pedido) > 0)) return msg(400, 'cantidadAprobada: La cantidad aprobada debe ser mayor que cero')
    if (!rec || !misTiendas(c).includes(rec.tiendaId)) return msg(404, `No existe una recomendación con id ${c.p[0]}`)
    if (rec.estado !== 'BORRADOR') return msg(409, `No se puede aprobar la recomendación ${rec.id}: está en estado ${rec.estado}`)
    const cantidad = pedido == null ? rec.cantidadSugerida : Number(pedido)
    const intentos: Orden['intentos'] = []
    let asignado: string | null = null
    for (const [i, cdId] of c.r.prioridad.entries()) {
      const cdN = c.r.cds.find(x => x.id === cdId)!
      const disponible = stockRow(c, cdN.nodoId, rec.varianteId).disponibleParaUso
      const alcanza = disponible >= cantidad
      intentos.push({ cdId, ordenEvaluado: i + 1, resultado: alcanza ? 'ASIGNADO' : 'SIN_STOCK', motivo: alcanza ? null : `Disponible ${disponible} menor que lo requerido ${cantidad}`, timestamp: now() })
      if (alcanza) { asignado = cdId; break }
    }
    const prioridad = asignado ? c.r.prioridad.indexOf(asignado) + 1 : 0
    const orden: Orden = {
      id: takeId(c.s, c.d.pools.ordenByRec.get(rec.id)), recomendacionId: rec.id, tiendaId: rec.tiendaId, varianteId: rec.varianteId,
      cdAsignadoId: asignado, motivoAsignacion: asignado ? `Asignado al CD de prioridad ${prioridad}` : 'Ningún CD cubre la cantidad solicitada',
      cantidadTotalSolicitada: cantidad, cantidadPendiente: cantidad, cantidadDespachadaAcumulada: 0, estado: asignado ? 'APROBADA' : 'GENERADA',
      fechaCreacion: now(), intentos, motivoCierre: null, cerradaPor: null, fechaCierre: null,
    }
    c.s.ordenes[orden.id] = orden
    c.s.recibido[orden.id] = 0
    c.s.recs[rec.id] = { ...rec, estado: 'APROBADA' }
    recomendar(c, rec.tiendaId, rec.varianteId)
    return ok({ recomendacionId: rec.id, estado: 'APROBADA', cantidadSugerida: rec.cantidadSugerida, cantidadAprobada: cantidad, desviacion: cantidad - rec.cantidadSugerida, aprobadoPor: c.session.userId, fechaAprobacion: now(), orden }, 201)
  }, 'reposicion:planificar', [0]),
  route('POST', '/recomendaciones/:id/rechazar', c => {
    const rec = c.s.recs[c.p[0]]
    if (!rec || !misTiendas(c).includes(rec.tiendaId)) return msg(404, `No existe una recomendación con id ${c.p[0]}`)
    if (rec.estado !== 'BORRADOR') return msg(409, `No se puede rechazar la recomendación ${rec.id}: está en estado ${rec.estado}`)
    c.s.recs[rec.id] = { ...rec, estado: 'RECHAZADA' }
    return ok(c.s.recs[rec.id])
  }, 'reposicion:planificar', [0]),

  // ── Órdenes ──
  route('GET', '/ordenes-reabastecimiento', c => {
    const estado = c.q.get('estado'), t = c.q.get('tiendaId')
    if ((estado && !ESTADOS_ORDEN.includes(estado)) || (t && !UUID.test(t))) return spring(400, 'Bad Request', c.path)
    if (tiendaFuera(c, t)) return msg(404, `No existe una tienda con id ${t}`)
    const items = Object.values(c.s.ordenes).filter(o => misTiendas(c).includes(o.tiendaId) && (!estado || o.estado === estado) && (!t || o.tiendaId === t))
      .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))
    return ok(page(items, c.q))
  }, 'reposicion:planificar'),
  route('GET', '/ordenes-reabastecimiento/:id', c => {
    const o = c.s.ordenes[c.p[0]]
    return o && misTiendas(c).includes(o.tiendaId) ? ok(o) : msg(404, `No existe una orden de reabastecimiento con id ${c.p[0]}`)
  }, 'reposicion:planificar', [0]),
  route('POST', '/ordenes-reabastecimiento/:id/despachos', c => {
    const o = c.s.ordenes[c.p[0]]
    if (!o) return msg(404, `No existe una orden de reabastecimiento con id ${c.p[0]}`)
    if (!['APROBADA', 'REABIERTA'].includes(o.estado) || !o.cdAsignadoId) return msg(409, `No se puede iniciar el despacho de la orden ${o.id} en estado ${o.estado}`)
    const nodoCd = c.r.cds.find(x => x.id === o.cdAsignadoId)!.nodoId
    const aLaMano = c.s.stock[nodoCd][o.varianteId] ?? 0
    if (aLaMano <= 0) return msg(409, `El CD no tiene unidades a la mano para despachar la orden ${o.id}`)
    const solicitada = o.estado === 'REABIERTA' ? o.cantidadPendiente : o.cantidadTotalSolicitada - o.cantidadDespachadaAcumulada
    const despachada = Math.min(solicitada, aLaMano)
    const numero = Object.values(c.s.ciclos).filter(x => x.ordenId === o.id).length + 1
    const ciclo: Ciclo = {
      id: takeId(c.s, c.d.pools.ciclo.get(`${o.id}:${numero}`)), ordenId: o.id, numeroCiclo: numero, cantidadSolicitada: solicitada, cantidadDespachada: despachada,
      cantidadPendiente: solicitada - despachada, resultado: despachada === solicitada ? 'COMPLETO' : 'PARCIAL', fillRate: Math.round((despachada / solicitada) * 10000) / 10000, fechaDespacho: now(),
    }
    c.s.ciclos[ciclo.id] = ciclo
    c.s.stock[nodoCd][o.varianteId] = aLaMano - despachada
    kardex(c, nodoCd, o.varianteId, 'DESPACHO', -despachada, { usuarioId: c.session.userId })
    c.s.ordenes[o.id] = { ...o, estado: 'DESPACHADA', cantidadDespachadaAcumulada: o.cantidadDespachadaAcumulada + despachada }
    return ok(ciclo, 201)
  }, 'despacho:operar', [0]),
  route('POST', '/ordenes-reabastecimiento/:id/cerrar', c => cerrarOCancelar(c, 'REABIERTA', 'CERRADA', 'cerrar con faltante'), 'reposicion:planificar', [0]),
  route('POST', '/ordenes-reabastecimiento/:id/cancelar', c => cerrarOCancelar(c, 'GENERADA', 'CANCELADA', 'cancelar'), 'reposicion:planificar', [0]),

  // ── Ciclos de despacho ──
  route('GET', '/ciclos-despacho', c => {
    const ordenId = c.q.get('ordenId')
    if (ordenId && !UUID.test(ordenId)) return spring(400, 'Bad Request', c.path)
    const enViaje = new Set(Object.values(c.s.viajes).flatMap(v => v.paradas.map(p => p.cicloDespachoId)))
    const items = Object.values(c.s.ciclos).filter(x => (!ordenId || x.ordenId === ordenId) && (c.q.get('sinViaje') !== 'true' || !enViaje.has(x.id)))
      .sort((a, b) => b.fechaDespacho.localeCompare(a.fechaDespacho))
    return ok(page(items, c.q))
  }, c => has(c, 'despacho:operar') ? 'despacho:operar' : 'transporte:operar'),
  route('GET', '/ciclos-despacho/:id', c => c.s.ciclos[c.p[0]] ? ok(c.s.ciclos[c.p[0]]) : msg(404, `No existe un ciclo de despacho con id ${c.p[0]}`),
    c => has(c, 'despacho:operar') ? 'despacho:operar' : 'transporte:operar', [0]),

  // ── Viajes ──
  route('POST', '/viajes', c => {
    const b = c.body ?? {}
    const paradas = Array.isArray(b.paradas) ? b.paradas as { cicloDespachoId?: string; ordenParada?: number }[] : []
    const errors: string[] = []
    if (!b.cdId) errors.push('cdId: must not be null')
    if (paradas.length === 0) errors.push('paradas: must not be empty')
    if (!String(b.vehiculo ?? '').trim()) errors.push('vehiculo: must not be blank')
    else if (String(b.vehiculo).length > 100) errors.push('vehiculo: size must be between 0 and 100')
    if (errors.length) return msg(400, errors.join('; '))
    const ids = paradas.map(p => String(p.cicloDespachoId ?? ''))
    const repetido = ids.find((id, i) => ids.indexOf(id) !== i)
    if (repetido) return msg(400, `El ciclo de despacho ${repetido} está repetido en las paradas`)
    if (!c.r.cds.some(x => x.id === b.cdId)) return msg(404, `No existe un centro de distribución con id ${b.cdId}`)
    const enViaje = new Set(Object.values(c.s.viajes).flatMap(v => v.paradas.map(p => p.cicloDespachoId)))
    for (const id of ids) {
      const ciclo = c.s.ciclos[id]
      if (!ciclo) return msg(404, `No existe un ciclo de despacho con id ${id}`)
      if (enViaje.has(id)) return msg(409, `El ciclo de despacho ${id} ya está en otro viaje`)
      if (c.s.ordenes[ciclo.ordenId]?.cdAsignadoId !== b.cdId) return msg(422, `El ciclo de despacho ${id} no sale del CD ${b.cdId}`)
    }
    const viaje: Viaje = {
      id: takeId(c.s, c.d.pools.viaje.get([...ids].sort().join(','))), cdId: String(b.cdId), vehiculo: String(b.vehiculo).trim(), estado: 'ARMADO',
      fechaCreacion: now(), fechaSalida: null, fechaCierre: null,
      paradas: paradas.map((p, i) => ({ id: takeId(c.s, c.d.pools.parada.get(ids[i])), cicloDespachoId: ids[i], tiendaId: c.s.ordenes[c.s.ciclos[ids[i]].ordenId].tiendaId, ordenParada: p.ordenParada ?? i + 1, estado: 'PENDIENTE', fechaSalidaCd: null, fechaLlegada: null })),
    }
    c.s.viajes[viaje.id] = viaje
    return ok(viaje, 201)
  }, 'transporte:operar'),
  route('GET', '/viajes', c => {
    const estado = c.q.get('estado')
    if (estado && !['ARMADO', 'EN_CURSO', 'CERRADO'].includes(estado)) return spring(400, 'Bad Request', c.path)
    return ok(page(Object.values(c.s.viajes).filter(v => !estado || v.estado === estado).sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion)), c.q))
  }, 'transporte:operar'),
  route('GET', '/viajes/:id', c => c.s.viajes[c.p[0]] ? ok(c.s.viajes[c.p[0]]) : msg(404, `No existe un viaje con id ${c.p[0]}`), 'transporte:operar', [0]),
  route('POST', '/viajes/:id/salida', c => {
    const fecha = c.body?.fechaSalida
    if (fecha != null && !isoWithZone(fecha)) return msg(400, JSON_INVALIDO)
    const cuando = fecha ? new Date(String(fecha)) : new Date()
    if (cuando.getTime() > Date.now() + 120_000) return msg(400, 'La hora de salida no puede ser posterior a la actual')
    const v = c.s.viajes[c.p[0]]
    if (!v) return msg(404, `No existe un viaje con id ${c.p[0]}`)
    const despacho = v.paradas.map(p => c.s.ciclos[p.cicloDespachoId]?.fechaDespacho).filter(Boolean).sort().pop()
    if (despacho && cuando.getTime() < Date.parse(despacho)) return msg(422, `La salida no puede ser anterior al despacho de sus ciclos (${despacho})`)
    if (v.estado !== 'ARMADO') return msg(409, `El viaje ${v.id} está ${v.estado}, no ARMADO: ya salió`)
    const noLista = v.paradas.map(p => c.s.ordenes[c.s.ciclos[p.cicloDespachoId].ordenId]).find(o => o.estado !== 'DESPACHADA')
    if (noLista) return msg(409, `La orden ${noLista.id} está en estado ${noLista.estado}, no DESPACHADA`)
    const iso = cuando.toISOString()
    v.paradas.forEach(p => { const o = c.s.ordenes[c.s.ciclos[p.cicloDespachoId].ordenId]; c.s.ordenes[o.id] = { ...o, estado: 'EN_TRANSITO' } })
    c.s.viajes[v.id] = { ...v, estado: 'EN_CURSO', fechaSalida: iso, paradas: v.paradas.map(p => ({ ...p, estado: 'EN_TRANSITO', fechaSalidaCd: iso })) }
    return ok(c.s.viajes[v.id])
  }, 'transporte:operar', [0]),
  route('POST', '/viajes/:id/paradas/:id/llegada', c => {
    const fecha = c.body?.fechaLlegada
    if (fecha != null && !isoWithZone(fecha)) return msg(400, JSON_INVALIDO)
    const cuando = fecha ? new Date(String(fecha)) : new Date()
    if (cuando.getTime() > Date.now() + 120_000) return msg(400, 'La hora de llegada no puede ser posterior a la actual')
    const v = c.s.viajes[c.p[0]]
    if (!v) return msg(404, `No existe un viaje con id ${c.p[0]}`)
    const parada = v.paradas.find(p => p.id === c.p[1])
    if (!parada) return msg(404, `El viaje ${v.id} no tiene la parada ${c.p[1]}`)
    if (v.fechaSalida && cuando.getTime() < Date.parse(v.fechaSalida)) return msg(422, `La llegada no puede ser anterior a la salida del viaje (${v.fechaSalida})`)
    if (parada.estado === 'ENTREGADO') return msg(409, `La parada ${parada.id} ya está ENTREGADO`)
    if (v.estado !== 'EN_CURSO') return msg(409, `El viaje ${v.id} está ${v.estado}, no EN_CURSO`)
    const iso = cuando.toISOString()
    const paradas = v.paradas.map(p => p.id === parada.id ? { ...p, estado: 'ENTREGADO', fechaLlegada: iso } : p)
    const cerrado = paradas.every(p => p.estado === 'ENTREGADO')
    c.s.viajes[v.id] = { ...v, paradas, estado: cerrado ? 'CERRADO' : v.estado, fechaCierre: cerrado ? paradas.map(p => p.fechaLlegada!).sort().pop()! : null }
    return ok(c.s.viajes[v.id])
  }, 'transporte:operar', [0, 1]),

  // ── Recepción ──
  route('GET', '/paradas-por-recibir', c => ok(Object.values(c.s.viajes).sort((a, b) => a.fechaCreacion.localeCompare(b.fechaCreacion)).flatMap(v =>
    v.paradas.filter(p => p.estado === 'ENTREGADO' && !c.s.recepciones[p.id] && misTiendas(c).includes(p.tiendaId)).sort((a, b) => a.ordenParada - b.ordenParada).map(p => ({
      paradaId: p.id, viajeId: v.id, tiendaId: p.tiendaId, cicloDespachoId: p.cicloDespachoId, ordenId: c.s.ciclos[p.cicloDespachoId].ordenId, cantidadDespachada: c.s.ciclos[p.cicloDespachoId].cantidadDespachada,
    })))), 'recepcion:registrar'),
  route('POST', '/viajes/:id/paradas/:id/recepcion', c => {
    const recibida = c.body?.cantidadRecibida
    if (recibida == null) return msg(400, 'cantidadRecibida: must not be null')
    if (!Number.isInteger(recibida)) return msg(400, JSON_INVALIDO)
    if (Number(recibida) < 0) return msg(400, 'cantidadRecibida: La cantidad recibida no puede ser negativa')
    const v = c.s.viajes[c.p[0]]
    const parada = v?.paradas.find(p => p.id === c.p[1])
    if (!v || !parada || !misTiendas(c).includes(parada.tiendaId)) return msg(404, `No existe la parada ${c.p[1]}`)
    const ciclo = c.s.ciclos[parada.cicloDespachoId]
    if (Number(recibida) > ciclo.cantidadDespachada) return msg(422, `La cantidad recibida (${recibida}) supera la despachada (${ciclo.cantidadDespachada})`)
    if (c.s.recepciones[parada.id]) return ok(c.s.recepciones[parada.id], 200)
    if (parada.estado !== 'ENTREGADO') return msg(409, `La parada ${parada.id} todavía no se ha entregado`)
    const o = c.s.ordenes[ciclo.ordenId]
    if (o.estado !== 'EN_TRANSITO') return msg(409, `La orden ${o.id} está en estado ${o.estado}, no EN_TRANSITO`)
    const total = (c.s.recibido[o.id] ?? 0) + Number(recibida)
    c.s.recibido[o.id] = total
    const pendiente = o.cantidadTotalSolicitada - total
    const estado = pendiente <= 0 ? 'CERRADA' : 'REABIERTA'
    c.s.ordenes[o.id] = { ...o, estado, cantidadPendiente: Math.max(pendiente, 0), fechaCierre: estado === 'CERRADA' ? now() : o.fechaCierre }
    const bodega = nodosDe(c, o.tiendaId)!.bodega
    c.s.stock[bodega][o.varianteId] = (c.s.stock[bodega][o.varianteId] ?? 0) + Number(recibida)
    if (Number(recibida) > 0) kardex(c, bodega, o.varianteId, 'RECEPCION', Number(recibida), { usuarioId: c.session.userId })
    const rec: Recepcion = {
      id: takeId(c.s, c.d.pools.recepcion.get(parada.id)), viajeParadaId: parada.id, cicloDespachoId: ciclo.id, cantidadDespachada: ciclo.cantidadDespachada,
      cantidadRecibida: Number(recibida), discrepancia: ciclo.cantidadDespachada - Number(recibida), registradoPor: c.session.userId, fechaRecepcion: now(),
      estadoOrden: estado, cantidadPendienteOrden: Math.max(pendiente, 0),
    }
    c.s.recepciones[parada.id] = rec
    return ok(rec, 201)
  }, 'recepcion:registrar', [0, 1]),

  // ── Lookups (solo ADMIN, como en el backend) ──
  route('GET', '/tiendas', c => {
    const cap = capture(c.d, 'lookup_tiendas_200_admin')!.body as { content: unknown[] }
    return ok(page(cap.content, c.q))
  }, 'tiendas:administrar'),
  route('GET', '/tiendas/:id', c => {
    const list = (capture(c.d, 'lookup_tiendas_200_admin')!.body as { content: Record<string, unknown>[] }).content
    const t = list.find(x => x.id === c.p[0])
    if (!t) return msg(404, `No existe una tienda con id ${c.p[0]}`)
    const n = c.r.tiendas.find(x => x.id === t.id)
    return ok({ ...t, almacenId: n?.almacenId ?? null, bodegaId: n?.bodegaId ?? null })
  }, 'tiendas:administrar', [0]),
  route('GET', '/tiendas/:id/prioridad-cd', c => ok(c.r.prioridad.map((cdId, i) => ({ id: `${c.p[0].slice(0, 8)}-0000-4000-8000-00000000000${i + 1}`, tiendaId: c.p[0], cdId, ordenPrioridad: i + 1 }))), 'inventario:administrar', [0]),
  route('GET', '/centros-distribucion', c => ok(page(c.r.cds.map(x => cdBody(c, x.id)), c.q)), 'cd:administrar'),
  route('GET', '/centros-distribucion/:id', c => c.r.cds.some(x => x.id === c.p[0]) ? ok({ ...cdBody(c, c.p[0]), nodo: { id: c.r.cds.find(x => x.id === c.p[0])!.nodoId, tipo: 'CD', cdId: c.p[0], tiendaId: null } }) : msg(404, `No existe un centro de distribución con id ${c.p[0]}`), 'cd:administrar', [0]),
  route('GET', '/variantes', c => {
    const all = (capture(c.d, 'lookup_variantes_sku_200_admin')!.body as { content: { sku: string }[] }).content
    const sku = c.q.get('sku')
    return ok(page(all.filter(v => !sku || v.sku.includes(sku)), c.q))
  }, 'catalogo:administrar'),
  route('GET', '/templates', c => ok(page([{ id: 'b602461c-04ad-414c-90e5-c6d22c5f5771', nombre: 'Camisa Oxford demo S3', temporada: null, proveedor: null, precioBase: 89900, categoriaId: null }], c.q)), 'catalogo:administrar'),
  route('GET', '/categorias', c => ok(page([], c.q)), 'catalogo:administrar'),
  route('GET', '/bodegas-tienda', c => ok(page(c.r.tiendas.map(t => ({ id: t.bodegaId, tiendaId: t.id, tiendaNombre: t.nombre, tiendaUbicacion: /Norte/.test(t.nombre) ? 'Barranquilla' : 'Medellín', inventario: [] })), c.q)), 'tiendas:administrar'),
  route('GET', '/usuarios', () => ok(DEMO_ROLES.map(r => ({ id: userId(r.id), email: r.email, nombreCompleto: `Demo ${r.nombre}`, estado: 'ACTIVO', creadoEn: '2026-11-23T00:37:45.108142Z' }))), 'usuarios:administrar'),
  route('GET', '/usuarios/:id/tiendas', c => ok(capture(c.d, 'x_admin_tiendas_de_usuario')!.body), 'usuarios:administrar', [0]),
  route('GET', '/roles', () => ok(DEMO_ROLES.map((r, i) => ({ id: `a0000000-0000-4000-8000-00000000000${i}`, nombre: r.id, descripcion: r.descripcion, creadoEn: '2026-11-23T00:37:40Z' }))), 'roles:administrar'),
]

function cdBody(c: Ctx, id: string) {
  const principal = c.d.ids.cds.principal.id === id
  return { id, nombre: principal ? 'CD Demo Principal S3' : 'CD Demo Sin Stock S3', ubicacion: principal ? 'Bogotá' : '—' }
}

function cerrarOCancelar(c: Ctx, desde: string, hacia: string, accion: string): MockResponse {
  const motivo = String(c.body?.motivo ?? '')
  if (!motivo.trim()) return msg(400, 'motivo: El motivo es obligatorio')
  if (motivo.length > 500) return msg(400, 'motivo: size must be between 0 and 500')
  const o = c.s.ordenes[c.p[0]]
  if (!o || !misTiendas(c).includes(o.tiendaId)) return msg(404, `No existe una orden de reabastecimiento con id ${c.p[0]}`)
  if (o.estado !== desde) return msg(409, `No se puede ${accion} de la orden ${o.id} en estado ${o.estado}`)
  c.s.ordenes[o.id] = { ...o, estado: hacia, motivoCierre: motivo.trim(), cerradaPor: c.session.userId, fechaCierre: now() }
  return ok(c.s.ordenes[o.id])
}

// ─── Autenticación ──────────────────────────────────────────────────────────

function auth(d: Data, s: Sim, m: string, path: string, body: Record<string, unknown> | null): MockResponse | null {
  if (m !== 'POST') return null
  if (path === '/auth/login') {
    const email = String(body?.email ?? '').trim(), password = String(body?.password ?? '')
    const errors = [
      ...(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? ['email: el email no tiene un formato válido'] : []),
      ...(!password ? ['password: la contraseña es obligatoria'] : []),
    ]
    if (errors.length) return msg(400, errors.join('; '))
    if (email.toLowerCase() === 'mfa@demo.local') { s.mfaPendiente = true; return ok(capture(d, 'auth_login_200_mfa_requerido')!.body) }
    // El modo simulado no conoce contraseñas: acepta cualquiera y toma el rol del correo (o el rol elegido)
    const role = roleByEmail(email)?.id ?? storedRole()
    if (!role) return msg(401, 'Credenciales inválidas')
    s.session = { role, userId: userId(role), email }
    const base = capture(d, 'auth_login_200')!.body as { usuario: Record<string, unknown> }
    return ok({ ...base, usuario: { ...base.usuario, id: userId(role), email, nombreCompleto: `Demo ${roleById(role)!.nombre}` } })
  }
  if (path === '/auth/login/mfa') {
    if (!s.mfaPendiente) return msg(401, 'Sesión inválida o expirada')
    if (!/^(\d{6}|[A-Za-z0-9]{10})$/.test(String(body?.codigo ?? ''))) return msg(400, 'El código ingresado no es válido')
    s.mfaPendiente = false
    const role = storedRole() ?? 'VENDEDOR'
    s.session = { role, userId: userId(role), email: 'mfa@demo.local' }
    return ok(capture(d, 'auth_login_mfa_200')!.body)
  }
  if (path === '/auth/refresh') return s.session ? ok(capture(d, 'auth_refresh_200')!.body) : msg(401, 'Sesión inválida o expirada')
  if (path === '/auth/logout') { s.session = null; return { status: 204 } }
  return null
}

// ─── Entrada ────────────────────────────────────────────────────────────────

export async function mockRequest(method: string, fullPath: string, rawBody?: string): Promise<MockResponse> {
  const d = await loadData()
  const s = await state()
  await new Promise(resolve => setTimeout(resolve, 60 + Math.random() * 160))
  const [path, query = ''] = fullPath.split('?')
  const m = method.toUpperCase()
  let body: Record<string, unknown> | null = null
  if (rawBody) {
    try { body = JSON.parse(rawBody) } catch { return { ...msg(400, JSON_INVALIDO), nota: 'simulado' } }
  }
  const respond = (res: MockResponse, nota = 'simulado') => { save(); return { ...res, nota: res.nota ?? nota } }

  const a = auth(d, s, m, path, body)
  if (a) return respond(a)
  if (path.startsWith('/mfa/') && m === 'POST') {
    if (!s.session) return respond(msg(401, 'Se requiere autenticación'))
    if (path === '/mfa/activar') return respond(ok(capture(d, 'mfa_activar_200')!.body), 'captura mfa_activar_200')
    if (path === '/mfa/confirmar') return respond(/^\d{6}$/.test(String(body?.codigo ?? '')) ? ok(capture(d, 'mfa_confirmar_200')!.body) : msg(400, 'El código ingresado no es válido'))
  }

  const matches = ROUTES.map(r => ({ r, x: r.re.exec(path) })).filter(({ x }) => x)
  const hit = matches.find(({ r }) => r.m === m)
  if (!hit) {
    // Sin simulación: la captura exacta, si existe (p. ej. 404 de ruta o 405 de método)
    const cap = d.llamadas.find(l => l.request.metodo === m && l.request.ruta === `/api/v1${fullPath}`)
    if (cap) return respond({ status: cap.status, body: cap.body }, `captura ${cap.caso}`)
    return respond(matches.length ? spring(405, 'Method Not Allowed', path) : spring(404, 'Not Found', path), 'simulado: sin captura para esta ruta')
  }
  if (!s.session) return respond(msg(401, 'Se requiere autenticación'))
  const p = hit.x!.slice(1).map(decodeURIComponent)
  if (hit.r.uuid?.some(i => !UUID.test(p[i]))) return respond(spring(400, 'Bad Request', path))
  const c: Ctx = { d, r: red(d), s, m, path, q: new URLSearchParams(query), body, p, role: s.session.role, session: s.session }
  const scope = typeof hit.r.scope === 'function' ? hit.r.scope(c) : hit.r.scope
  if (scope && !has(c, scope)) return respond(msg(403, SIN_PERMISO))
  return respond(hit.r.h(c))
}
