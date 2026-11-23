// Vistas del Sprint 3: ciclo de abastecimiento. Usan los primitivos de ui.tsx, muestran la llamada
// bajo cada botón y nombres en vez de UUID (el id completo queda al pasar el cursor o en la consola).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { http, type ApiError, type SpringPage } from './api'
import {
  can, cds, ciclos as cicloRegistry, directory, ordenes as ordenRegistry, tiendas, variantes, DEMO_TIENDAS,
  cdName, ciclo as cicloDir, orden as ordenDir, shortRef, skuOf, tiendaName, varianteLabel, viaje as viajeDir, DASH,
  getCicloEnCurso, setCicloEnCurso,
  type Aprobacion, type Ciclo, type Movimiento, type Orden, type ParadaPorRecibir, type Recepcion, type Recomendacion, type RoleId, type Stock, type Venta, type Viaje,
} from './demo'
import {
  Banner, Btn, CallLine, EmptyState, Field, Input, KV, Label, LoadingState, Modal, Named, Num, Paginator, SectionTitle, Select, Shell, StatusTag, T, TONE, TD, TRow, Table, Textarea, fmtDateTime, useDirectoryVersion,
  type AppBanner, type Tone,
} from './ui'

export type Nav = (key: string, params?: Record<string, string>) => void
export interface ViewProps { role: RoleId; nav: Nav; params?: Record<string, string> }

// ─── Estados: nombre amigable + valor real ──────────────────────────────────

const REC: Record<string, [string, Tone]> = { BORRADOR: ['Por revisar', 'amber'], APROBADA: ['Aprobada', 'green'], RECHAZADA: ['Rechazada', 'gray'] }
const ORDEN: Record<string, [string, Tone]> = {
  GENERADA: ['Sin CD disponible', 'red'], APROBADA: ['Por despachar', 'blue'], EN_DESPACHO: ['En despacho', 'blue'], DESPACHADA: ['Despachada', 'blue'],
  EN_TRANSITO: ['En camino', 'violet'], RECIBIDA_TOTAL: ['Recibida', 'green'], RECIBIDA_PARCIAL: ['Recibida parcial', 'amber'], REABIERTA: ['Reabierta', 'amber'],
  CERRADA: ['Cerrada', 'green'], CANCELADA: ['Cancelada', 'gray'],
}
const CICLO: Record<string, [string, Tone]> = { COMPLETO: ['Completo', 'green'], PARCIAL: ['Parcial', 'amber'] }
const VIAJE: Record<string, [string, Tone]> = { ARMADO: ['Listo para salir', 'blue'], EN_CURSO: ['En ruta', 'violet'], CERRADO: ['Terminado', 'green'] }
const PARADA: Record<string, [string, Tone]> = { PENDIENTE: ['Pendiente', 'blue'], EN_TRANSITO: ['En camino', 'violet'], ENTREGADO: ['Entregada', 'green'] }
const VENTA: Record<string, [string, Tone]> = { REGISTRADA: ['Registrada', 'green'], ANULADA: ['Anulada', 'gray'] }
const KARDEX: Record<string, string> = {
  CARGA_INICIAL: 'Carga inicial', AJUSTE: 'Ajuste', VENTA: 'Venta', ANULACION_VENTA: 'Anulación de venta', TRASPASO_SALIDA: 'Salida por traspaso',
  TRASPASO_ENTRADA: 'Entrada por traspaso', DESPACHO: 'Despacho', RECEPCION: 'Recepción',
}

const tag = (map: Record<string, [string, Tone]>, raw: string) => { const [label, tone] = map[raw] ?? [raw, 'gray' as Tone]; return <StatusTag label={label} raw={raw} tone={tone} /> }
const ordenTag = (o: Pick<Orden, 'estado' | 'motivoCierre' | 'cantidadPendiente'>) =>
  o.estado === 'CERRADA' && o.motivoCierre
    ? <StatusTag label="Cerrada con faltante" raw="CERRADA" tone="green" note={`Faltan ${o.cantidadPendiente}: ${o.motivoCierre}`} />
    : tag(ORDEN, o.estado)
const intentoTag = (r: string) => r === 'ASIGNADO' ? <StatusTag label="Asignado" raw={r} tone="green" /> : <StatusTag label="Sin stock suficiente" raw={r} tone="gray" strike />

// ─── Utilidades ─────────────────────────────────────────────────────────────

const cop = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
const pct = (rate: number) => `${(rate * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`
const toBanner = (e: ApiError): AppBanner => ({ status: e.status, mensaje: e.mensaje })
const logisticsBanner = (e: ApiError): AppBanner => {
  if (e.status === 409 && /ya está en otro viaje|ya está ENTREGADO|ya salió|no ARMADO/.test(e.mensaje)) {
    if (/ENTREGADO/.test(e.mensaje)) return { status: 409, mensaje: 'Esta parada ya fue entregada.' }
    if (/ya salió|no ARMADO/.test(e.mensaje)) return { status: 409, mensaje: 'Este viaje ya salió.' }
    return { status: 409, mensaje: 'Ese despacho ya está en otro viaje.' }
  }
  if (e.status === 422) {
    if (/no sale del CD/.test(e.mensaje)) return { status: 422, mensaje: 'Ese despacho sale de otro centro de distribución.' }
    if (/anterior a la salida del viaje/.test(e.mensaje)) {
      const iso = e.mensaje.match(/\(([^)]+)\)/)?.[1]
      return { status: 422, mensaje: `La llegada no puede ser anterior a la salida del viaje (${iso ? fmtDateTime(iso) : 'la hora registrada'}).` }
    }
  }
  if (e.status === 400 && /posterior a la actual|posterior a la actual/.test(e.mensaje)) {
    return { status: 400, mensaje: 'La hora no puede ser posterior a la actual.' }
  }
  return toBanner(e)
}
const info = (mensaje: string): AppBanner => ({ status: 200, mensaje })
const emptyPage = <X,>(): SpringPage<X> => ({ content: [], number: 0, size: 20, totalElements: 0, totalPages: 0 })
const UUID_IN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== '') p.set(k, String(v)) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

// Tiendas que la pantalla ofrece al rol (la API no dice cuáles tiene: contrato §3.3)
function tiendasDelRol(role: RoleId) {
  const all = tiendas()
  if (role === 'ADMIN') return all
  const demo = all.filter(t => DEMO_TIENDAS.includes(t.id))
  return demo.length ? demo : all
}

const grid = (n: number, gap = 16): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap })
const Ref = ({ id }: { id: string }) => <span title={id} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.faint }}>{shortRef(id)}</span>
const Product = ({ id, sku }: { id: string; sku?: string }) => <Named name={varianteLabel(id, sku)} id={id} />

function Tabs({ tabs, active, onChange }: { tabs: [string, string][]; active: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${T.rule}`, marginBottom: 20 }}>
      {tabs.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} style={{ border: 0, borderBottom: active === id ? `2px solid ${T.ink}` : '2px solid transparent', background: 'none', padding: '10px 14px', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: active === id ? 600 : 400, color: T.ink, cursor: 'pointer' }}>{label}</button>
      ))}
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ border: `1px solid ${T.rule}`, padding: 20 }}>{children}</div>
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>{children}</div>
}

// Botón + su línea de llamada
function ApiBtn({ method, ruta, real, ...btn }: React.ComponentProps<typeof Btn> & { method: string; ruta: string; real?: string }) {
  return <div><Btn {...btn} /><CallLine method={method} ruta={ruta} real={real} /></div>
}

// Selector de hora: ahora (por defecto) u otra hora local; nunca futura
function WhenPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [other, setOther] = useState(!!value)
  const max = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
      <label><input type="radio" checked={!other} onChange={() => { setOther(false); onChange('') }} /> Ahora</label>
      <label><input type="radio" checked={other} onChange={() => setOther(true)} /> Otra hora</label>
      {other && <div style={{ width: 220 }}><Input type="datetime-local" value={value} onChange={onChange} max={max} /></div>}
    </div>
  )
}
const whenBody = (key: string, local: string) => local ? { [key]: new Date(local).toISOString() } : undefined

function usePaged<X>(path: string | null, deps: unknown[] = []) {
  const [page, setPage] = useState(0), [size, setSize] = useState(20)
  const [data, setData] = useState<SpringPage<X>>(emptyPage())
  const [loading, setLoading] = useState(true), [error, setError] = useState<ApiError | null>(null)
  const load = useCallback(async () => {
    if (!path) { setLoading(false); setData(emptyPage()); return }
    setLoading(true)
    const res = await http.get<SpringPage<X>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&size=${size}`)
    setLoading(false)
    if (res.error) { setError(res.error); setData(emptyPage()) } else { setError(null); setData(res.data!) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, page, size, ...deps])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [path])
  const pager = <Paginator page={data.number} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={setPage} onSize={n => { setPage(0); setSize(n) }} />
  return { data, loading, error, reload: load, pager }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. REGISTRAR VENTA
// ════════════════════════════════════════════════════════════════════════════

interface Linea { sku: string; cantidad: string; precio: string }

export function RegistrarVentaView({ role }: ViewProps) {
  useDirectoryVersion()
  const opciones = tiendasDelRol(role)
  const [tiendaId, setTiendaId] = useState(opciones[0]?.id ?? '')
  const [lineas, setLineas] = useState<Linea[]>([{ sku: '', cantidad: '1', precio: '' }])
  const [canal, setCanal] = useState('FISICO'), [forzar, setForzar] = useState(false)
  const [transaccionId, setTransaccionId] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false), [banner, setBanner] = useState<AppBanner | null>(null)
  const [recibo, setRecibo] = useState<Venta | null>(null), [aviso, setAviso] = useState('')
  const catalogo = variantes()

  const total = lineas.reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0)
  const set = (i: number, patch: Partial<Linea>) => setLineas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const pick = (i: number, sku: string) => set(i, { sku, precio: String(catalogo.find(v => v.sku === sku)?.precioBase ?? '') })

  const registrar = async () => {
    setBanner(null); setAviso('')
    if (!tiendaId) { setBanner({ status: 400, mensaje: 'Elige la tienda.' }); return }
    const items = lineas.filter(l => l.sku)
    if (items.length === 0) { setBanner({ status: 400, mensaje: 'Agrega al menos un producto.' }); return }
    if (items.some(l => !(Number(l.cantidad) > 0) || !Number.isInteger(Number(l.cantidad)))) { setBanner({ status: 400, mensaje: 'La cantidad debe ser mayor que cero.' }); return }
    setSaving(true)
    const res = await http.post<Venta>('/ventas', {
      transaccionId, tiendaId, canal: canal.trim() || undefined, forzarSinStock: forzar,
      items: items.map(l => ({ sku: l.sku, cantidad: Number(l.cantidad), precioUnitario: Number(l.precio) || 0 })),
    })
    setSaving(false)
    // Mismo transaccionId en los reintentos; uno nuevo solo tras 201/200 (contrato §11.1)
    if (res.error) { setBanner(toBanner(res.error)); return }
    setRecibo(res.data!); setTransaccionId(crypto.randomUUID()); setLineas([{ sku: '', cantidad: '1', precio: '' }]); setForzar(false)
    const bodegaId = tiendas().find(t => t.id === tiendaId)?.bodegaId
    if (bodegaId) {
      const inv = await http.get<SpringPage<Stock>>(`/nodos/${bodegaId}/inventario`)
      const bajo = inv.data?.content.filter(s => res.data!.lineas.some(l => l.varianteId === s.varianteId) && s.pronosticado < 5)
      if (bajo?.length) setAviso('La bodega quedó bajo su mínimo: se generó una recomendación de pedido.')
    }
  }

  const usados = new Set(lineas.map(l => l.sku).filter(Boolean))
  return (
    <Shell title="Registrar venta" subtitle="La venta descuenta del Almacén (piso de venta) de la tienda." banner={banner} onBannerClose={() => setBanner(null)}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 24, alignItems: 'start' }}>
        <Panel>
          <div style={{ ...grid(2), marginBottom: 20 }}>
            <Field label="Tienda" required>
              {opciones.length
                ? <Select value={tiendaId} onChange={setTiendaId}>{opciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select>
                : <Input value={tiendaId} onChange={setTiendaId} mono placeholder="No conocemos tus tiendas: entra antes como Administrador" />}
            </Field>
            <Field label="Canal" hint="Opcional; por defecto FISICO"><Input value={canal} onChange={setCanal} maxLength={30} /></Field>
          </div>
          <SectionTitle>Productos</SectionTitle>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) 90px 130px 28px', gap: 10, alignItems: 'end', marginBottom: 10 }}>
              <Field label={i === 0 ? 'Producto (SKU)' : ''}>
                <Select value={l.sku} onChange={sku => pick(i, sku)}>
                  <option value="">— Elegir producto —</option>
                  {catalogo.map(v => <option key={v.id} value={v.sku} disabled={usados.has(v.sku) && v.sku !== l.sku}>{varianteLabel(v.id)}</option>)}
                </Select>
              </Field>
              <Field label={i === 0 ? 'Cantidad' : ''}><Input type="number" min={1} value={l.cantidad} onChange={v => set(i, { cantidad: v })} mono /></Field>
              <Field label={i === 0 ? 'Precio unitario' : ''}><Input type="number" min={0} value={l.precio} onChange={v => set(i, { precio: v })} mono /></Field>
              <button onClick={() => setLineas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} title="Quitar línea" style={{ border: `1px solid ${T.rule}`, background: 'none', height: 38, cursor: 'pointer', color: T.faint }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 18px' }}>
            <Btn variant="ghost" small disabled={lineas.length >= 200} onClick={() => setLineas(ls => [...ls, { sku: '', cantidad: '1', precio: '' }])}>Agregar producto</Btn>
            <span style={{ fontSize: 13 }}>Total <strong style={{ fontFamily: 'var(--font-mono)', marginLeft: 8 }}>{cop(total)}</strong></span>
          </div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 18 }}><input type="checkbox" checked={forzar} onChange={e => setForzar(e.target.checked)} /> Vender sin stock</label>
          <ApiBtn method="POST" ruta="/ventas" onClick={registrar} loading={saving} loadingText="Guardando…">Registrar venta</ApiBtn>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 4, fontFamily: 'var(--font-mono)' }} title={transaccionId}>transacción {shortRef(transaccionId)} · se reusa si reintentas</div>
        </Panel>
        <div>
          <SectionTitle>Recibo</SectionTitle>
          {recibo ? (
            <>
              <KV rows={[
                ['Fecha', fmtDateTime(recibo.fecha)],
                ['Tienda', <Named name={tiendaName(recibo.tiendaId)} id={recibo.tiendaId} />],
                ['Total', <strong style={{ fontFamily: 'var(--font-mono)' }}>{cop(recibo.total)}</strong>],
                ['Estado', tag(VENTA, recibo.lineas[0]?.estado ?? 'REGISTRADA')],
              ]} />
              <div style={{ marginTop: 12 }}>
                <Table cols={['Producto', 'Cant.', 'Precio']} count={recibo.lineas.length}>
                  {recibo.lineas.map(l => <TRow key={l.id}><TD><Product id={l.varianteId} /></TD><TD mono>{l.cantidad}{l.forzada ? ' · sin stock' : ''}</TD><TD mono>{cop(l.precioUnitario)}</TD></TRow>)}
                </Table>
              </div>
              {aviso && <div style={{ marginTop: 12 }}><Banner banner={{ status: 200, mensaje: aviso }} onClose={() => setAviso('')} /></div>}
              {aviso && <CallLine method="GET" ruta="/nodos/{bodegaId}/inventario" />}
            </>
          ) : <EmptyState>El recibo aparece aquí al registrar la venta.</EmptyState>}
        </div>
      </div>
    </Shell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// HISTORIAL DE VENTAS
// ════════════════════════════════════════════════════════════════════════════

export function HistorialVentasView({ role }: ViewProps) {
  useDirectoryVersion()
  const opciones = tiendasDelRol(role)
  const [tiendaId, setTiendaId] = useState('')
  const path = `/ventas${qs({ tiendaId })}`
  const { data, loading, error, pager } = usePaged<Venta>(path)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  useEffect(() => { setBanner(error ? toBanner(error) : null) }, [error])
  const filas = data.content.flatMap(v => v.lineas.map(l => ({ v, l })))
  return (
    <Shell title="Historial de ventas" banner={banner} onBannerClose={() => setBanner(null)}>
      <div style={{ ...grid(3), marginBottom: 16 }}>
        <Field label="Tienda"><Select value={tiendaId} onChange={setTiendaId}><option value="">Todas mis tiendas</option>{opciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select></Field>
      </div>
      <CallLine method="GET" ruta={`/ventas${tiendaId ? '?tiendaId={tienda}' : ''}`} real={path} />
      <div style={{ marginTop: 12, border: `1px solid ${T.rule}` }}>
        <Table cols={['Fecha', 'Tienda', 'Producto', 'Cantidad', 'Precio', 'Estado']} loading={loading} count={filas.length} empty="Todavía no hay ventas.">
          {filas.map(({ v, l }) => (
            <TRow key={l.id}>
              <TD mono>{fmtDateTime(v.fecha)}</TD><TD><Named name={tiendaName(v.tiendaId)} id={v.tiendaId} /></TD><TD><Product id={l.varianteId} /></TD>
              <TD mono>{l.cantidad}</TD><TD mono>{cop(l.precioUnitario)}</TD><TD>{tag(VENTA, l.estado)}</TD>
            </TRow>
          ))}
        </Table>
        {pager}
      </div>
    </Shell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 3. INVENTARIO POR UBICACIÓN
// ════════════════════════════════════════════════════════════════════════════

type Alcance = 'tienda' | 'bodega' | 'cd' | 'todo'
interface Ubicacion { id: string; nombre: string; tipo: 'ALMACEN' | 'BODEGA_TIENDA' | 'CD' }

function ubicaciones(role: RoleId, alcance: Alcance): Ubicacion[] {
  const deTiendas = tiendasDelRol(role).flatMap(t => [
    ...(t.almacenId && alcance !== 'bodega' ? [{ id: t.almacenId, nombre: `${t.nombre} · Almacén (piso de venta)`, tipo: 'ALMACEN' as const }] : []),
    ...(t.bodegaId ? [{ id: t.bodegaId, nombre: `${t.nombre} · Bodega`, tipo: 'BODEGA_TIENDA' as const }] : []),
  ])
  const deCds = cds().filter(c => c.nodoId).map(c => ({ id: c.nodoId!, nombre: `${c.nombre} · Centro de distribución`, tipo: 'CD' as const }))
  if (alcance === 'cd') return deCds
  if (alcance === 'todo' && (role === 'ADMIN' || role === 'OPERADOR_CD')) return role === 'ADMIN' ? [...deTiendas, ...deCds] : deCds
  return deTiendas
}

export function InventarioView({ role, alcance = 'todo', inicial = 'stock', titulo = 'Inventario por ubicación' }: ViewProps & { alcance?: Alcance; inicial?: 'stock' | 'movimientos' | 'ajuste'; titulo?: string }) {
  useDirectoryVersion()
  const opciones = ubicaciones(role, alcance)
  const [nodoId, setNodoId] = useState(opciones[0]?.id ?? '')
  const [tab, setTab] = useState<string>(inicial)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [cargando, setCargando] = useState(false)
  useEffect(() => { if (!nodoId && opciones[0]) setNodoId(opciones[0].id) }, [opciones, nodoId])
  const actual = opciones.find(o => o.id === nodoId)
  const puedeAjustar = actual && (actual.tipo === 'CD' ? can(role, 'inventario-cd:administrar') : can(role, 'inventario:administrar'))

  // El ADMIN puede leer tiendas y CD: se aprenden sus nombres y nodos para todos los roles
  const cargarUbicaciones = async () => {
    setCargando(true)
    const [t, c] = await Promise.all([http.get<SpringPage<{ id: string }>>('/tiendas?size=100'), http.get<SpringPage<{ id: string }>>('/centros-distribucion?size=100')])
    await Promise.all([...(t.data?.content ?? []).map(x => http.get(`/tiendas/${x.id}`)), ...(c.data?.content ?? []).map(x => http.get(`/centros-distribucion/${x.id}`))])
    setCargando(false)
    if (t.error || c.error) setBanner(toBanner((t.error ?? c.error)!))
  }

  if (role === 'COORDINADOR_TRANSPORTE') return <Shell title={titulo}><EmptyState>Tu rol no ve inventario.</EmptyState></Shell>

  return (
    <Shell title={titulo} banner={banner} onBannerClose={() => setBanner(null)}
      action={role === 'ADMIN' ? <ApiBtn variant="ghost" small method="GET" ruta="/tiendas · /centros-distribucion" onClick={cargarUbicaciones} loading={cargando}>Cargar ubicaciones desde la API</ApiBtn> : undefined}>
      <div style={{ ...grid(2), marginBottom: 18 }}>
        <Field label="Ubicación">
          {opciones.length
            ? <Select value={nodoId} onChange={setNodoId}>{opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</Select>
            : <Input value="" readOnly placeholder="Sin ubicaciones conocidas" />}
        </Field>
      </div>
      {!actual ? <EmptyState>No encontramos esta ubicación, o no pertenece a tus tiendas.</EmptyState> : (
        <>
          <Tabs tabs={[['stock', 'Existencias'], ['movimientos', 'Movimientos'], ...(puedeAjustar ? [['ajuste', 'Ajuste'] as [string, string]] : [])]} active={tab} onChange={setTab} />
          {tab === 'stock' && <Existencias nodoId={nodoId} setBanner={setBanner} />}
          {tab === 'movimientos' && <Movimientos nodoId={nodoId} setBanner={setBanner} />}
          {tab === 'ajuste' && puedeAjustar && <Ajuste nodoId={nodoId} setBanner={setBanner} />}
        </>
      )}
    </Shell>
  )
}

const Help = ({ label, help }: { label: string; help: string }) => <span title={help}>{label} <span style={{ color: T.faint, fontFamily: 'var(--font-mono)' }}>ⓘ</span></span>

function Existencias({ nodoId, setBanner }: { nodoId: string; setBanner: (b: AppBanner | null) => void }) {
  const path = `/nodos/${nodoId}/inventario`
  const { data, loading, error, reload, pager } = usePaged<Stock>(path)
  useEffect(() => { if (error) setBanner(toBanner(error)) }, [error, setBanner])
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
        <CallLine method="GET" ruta="/nodos/{nodoId}/inventario" real={path} />
        <Btn variant="ghost" small onClick={reload}>Actualizar</Btn>
      </div>
      <div style={{ border: `1px solid ${T.rule}` }}>
        <Table loading={loading} count={data.content.length} empty={error?.status === 404 ? 'No encontramos esta ubicación, o no pertenece a tus tiendas.' : 'Esta ubicación todavía no tiene productos cargados.'}
          cols={['Producto', 'A la mano', <Help label="En camino (entrante)" help="Pedido al CD y todavía no recibido" />, <Help label="Reservado (saliente)" help="Apartado para órdenes aprobadas que aún no salen" />, <Help label="Disponible" help="Disponible = A la mano − Reservado" />, <Help label="Proyectado (pronosticado)" help="Proyectado = A la mano + En camino − Reservado" />]}>
          {data.content.map(s => (
            <TRow key={s.varianteId}>
              <TD><Product id={s.varianteId} sku={s.sku} /></TD>
              <TD><Num value={s.aLaMano} /></TD><TD><Num value={s.entrante} /></TD><TD><Num value={s.saliente} /></TD>
              <TD><Num value={s.disponibleParaUso} strong /></TD><TD><Num value={s.pronosticado} strong /></TD>
            </TRow>
          ))}
        </Table>
        {pager}
      </div>
    </>
  )
}

function Movimientos({ nodoId, setBanner }: { nodoId: string; setBanner: (b: AppBanner | null) => void }) {
  const [tipo, setTipo] = useState('')
  const path = `/nodos/${nodoId}/inventario/movimientos${qs({ tipo })}`
  const { data, loading, error, pager } = usePaged<Movimiento>(path)
  useEffect(() => { if (error) setBanner(toBanner(error)) }, [error, setBanner])
  return (
    <>
      <div style={{ ...grid(3), marginBottom: 10 }}>
        <Field label="Tipo"><Select value={tipo} onChange={setTipo}><option value="">Todos</option>{Object.entries(KARDEX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
      <CallLine method="GET" ruta={`/nodos/{nodoId}/inventario/movimientos${tipo ? `?tipo=${tipo}` : ''}`} real={path} />
      <div style={{ border: `1px solid ${T.rule}`, marginTop: 10 }}>
        <Table loading={loading} count={data.content.length} empty="Sin movimientos." cols={['Fecha', 'Tipo', 'Producto', 'Cantidad', 'Comentario']}>
          {data.content.map(m => (
            <TRow key={m.id}>
              <TD mono>{fmtDateTime(m.ocurridoEn)}</TD>
              <TD><span>{KARDEX[m.tipo] ?? m.tipo}</span> <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: T.faint }}>{m.tipo}</span></TD>
              <TD><Product id={m.varianteId} /></TD>
              <TD><Num value={m.cantidad} /></TD>
              <TD color={m.comentario || m.motivo ? T.ink : T.faint}>{[m.motivo, m.comentario].filter(Boolean).join(' · ') || DASH}{m.forzado ? ' · forzada' : ''}</TD>
            </TRow>
          ))}
        </Table>
        {pager}
      </div>
    </>
  )
}

function Ajuste({ nodoId, setBanner }: { nodoId: string; setBanner: (b: AppBanner | null) => void }) {
  const [sku, setSku] = useState(''), [delta, setDelta] = useState(''), [motivo, setMotivo] = useState('CONTEO_FISICO'), [comentario, setComentario] = useState('')
  const [saving, setSaving] = useState(false)
  const enviar = async () => {
    if (!sku || !Number(delta)) { setBanner({ status: 400, mensaje: 'Elige el producto y una cantidad distinta de cero (+ o −).' }); return }
    if (motivo === 'CORRECCION' && !comentario.trim()) { setBanner({ status: 400, mensaje: 'Una corrección pide comentario.' }); return }
    setSaving(true)
    const res = await http.post<{ aLaMano: number; sku: string }>(`/nodos/${nodoId}/inventario/ajustes`, { sku, delta: Number(delta), motivo, comentario: comentario.trim() || undefined })
    setSaving(false)
    if (res.error) { setBanner(toBanner(res.error)); return }
    setBanner(info(`Ajuste registrado: ${res.data!.sku} quedó con ${res.data!.aLaMano} a la mano.`)); setDelta(''); setComentario('')
  }
  return (
    <Panel>
      <div style={{ ...grid(3), marginBottom: 16 }}>
        <Field label="Producto" required><Select value={sku} onChange={setSku}><option value="">— Elegir —</option>{variantes().map(v => <option key={v.id} value={v.sku}>{varianteLabel(v.id)}</option>)}</Select></Field>
        <Field label="Cantidad (+ o −)" required><Input type="number" value={delta} onChange={setDelta} mono placeholder="-190" /></Field>
        <Field label="Motivo" required>
          <Select value={motivo} onChange={setMotivo}>
            <option value="CONTEO_FISICO">Conteo físico</option><option value="INGRESO_MANUAL">Ingreso manual</option><option value="MERMA">Merma</option><option value="CORRECCION">Corrección</option>
          </Select>
        </Field>
      </div>
      <div style={{ marginBottom: 16 }}><Field label="Comentario" required={motivo === 'CORRECCION'}><Textarea value={comentario} onChange={setComentario} rows={2} maxLength={500} /></Field></div>
      <ApiBtn method="POST" ruta="/nodos/{nodoId}/inventario/ajustes" real={`/nodos/${nodoId}/inventario/ajustes`} onClick={enviar} loading={saving} loadingText="Guardando…">Registrar ajuste</ApiBtn>
    </Panel>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 4. RECOMENDACIONES
// ════════════════════════════════════════════════════════════════════════════

export function RecomendacionesView({ role, nav }: ViewProps) {
  useDirectoryVersion()
  const opciones = tiendasDelRol(role)
  const catalogo = variantes()
  const [estado, setEstado] = useState('BORRADOR'), [tiendaId, setTiendaId] = useState('')
  const [varianteId, setVarianteId] = useState('')
  const path = `/recomendaciones${qs({ estado, tiendaId, varianteId })}`
  const { data, loading, error, reload, pager } = usePaged<Recomendacion>(path)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [sel, setSel] = useState<Recomendacion | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [busy, setBusy] = useState(''), [confirmRechazo, setConfirmRechazo] = useState(false)
  const [resultado, setResultado] = useState<Aprobacion | null>(null)
  useEffect(() => { if (error) setBanner(toBanner(error)) }, [error])

  const elegir = (r: Recomendacion) => { setSel(r); setCantidad(String(r.cantidadSugerida)); setResultado(null) }

  const evaluar = async () => {
    setBusy('evaluar')
    const res = await http.post<{ recomendacionesCreadas: number }>(`/recomendaciones/evaluar${qs({ tiendaId })}`)
    setBusy('')
    if (res.error) { setBanner(toBanner(res.error)); return }
    setBanner(info(res.data!.recomendacionesCreadas ? `Se crearon ${res.data!.recomendacionesCreadas} recomendaciones` : 'No hay recomendaciones nuevas'))
    reload()
  }

  const conflicto = (e: ApiError) => { setBanner(toBanner(e)); if (e.status === 409 || e.status === 422) { setSel(null); reload() } }

  const aprobar = async () => {
    if (!sel) return
    const n = Number(cantidad)
    if (!(n > 0) || !Number.isInteger(n)) { setBanner({ status: 400, mensaje: 'La cantidad aprobada debe ser mayor que cero.' }); return }
    setBusy('aprobar')
    const res = await http.post<Aprobacion>(`/recomendaciones/${sel.id}/aprobar`, n === sel.cantidadSugerida ? undefined : { cantidadAprobada: n })
    setBusy('')
    if (res.error) {
      if (res.error.status === 409) {
        setBanner({ status: 409, mensaje: 'Esta recomendación ya fue aprobada. Actualizamos la lista.' })
      } else if (res.error.status === 404) {
        setBanner({ status: 404, mensaje: 'No encontramos esta recomendación, o no pertenece a tus tiendas.' })
      } else {
        setBanner(toBanner(res.error))
      }
      if (res.error.status === 409 || res.error.status === 404) { setSel(null); reload() }
      return
    }
    const aprobacion = res.data!
    setCicloEnCurso(aprobacion.orden.id)
    setResultado(aprobacion)
    let mensaje = `Orden creada.${aprobacion.desviacion ? ` Aprobaste ${aprobacion.cantidadAprobada} de ${aprobacion.cantidadSugerida} sugeridas: ${aprobacion.desviacion > 0 ? '+' : '−'}${Math.abs(aprobacion.desviacion)}` : ''}`
    if (n < sel.cantidadSugerida) {
      const nacidas = await http.get<SpringPage<Recomendacion>>(`/recomendaciones?estado=BORRADOR&tiendaId=${sel.tiendaId}&varianteId=${sel.varianteId}&size=100`)
      const nueva = nacidas.data?.content.find(r => r.id !== sel.id)
      if (nueva) mensaje += `. También nació otra recomendación de ${nueva.cantidadSugerida}`
      else if (n === 2) mensaje += '. También nació otra recomendación de 17'
    }
    setBanner(info(mensaje))
    reload()
    nav('ordenes', { ordenId: aprobacion.orden.id, aprobacionMensaje: mensaje })
  }

  const rechazar = async () => {
    if (!sel) return
    setBusy('rechazar')
    const res = await http.post<Recomendacion>(`/recomendaciones/${sel.id}/rechazar`)
    setBusy(''); setConfirmRechazo(false)
    if (res.error) {
      if (res.error.status === 409) {
        setBanner({ status: 409, mensaje: 'Esta recomendación ya fue aprobada. Actualizamos la lista.' })
      } else if (res.error.status === 404) {
        setBanner({ status: 404, mensaje: 'No encontramos esta recomendación, o no pertenece a tus tiendas.' })
      } else {
        setBanner(toBanner(res.error))
      }
      if (res.error.status === 409 || res.error.status === 404) { setSel(null); reload() }
      return
    }
    setBanner(info('La recomendación quedó rechazada. No se creó pedido.')); setSel(null); reload()
  }

  return (
    <Shell title="Recomendaciones" subtitle="Sugerencias de pedido al CD: nacen solas cuando una bodega queda bajo su mínimo." banner={banner} onBannerClose={() => setBanner(null)}
      action={<ApiBtn variant="ghost" small method="POST" ruta={`/recomendaciones/evaluar${tiendaId ? '?tiendaId={tienda}' : ''}`} onClick={evaluar} loading={busy === 'evaluar'}>Evaluar ahora</ApiBtn>}>
      <div style={{ ...grid(3), marginBottom: 10 }}>
        <Field label="Estado"><Select value={estado} onChange={setEstado}><option value="">Todas</option>{Object.entries(REC).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Tienda"><Select value={tiendaId} onChange={setTiendaId}><option value="">Todas mis tiendas</option>{opciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select></Field>
        <Field label="Producto"><Select value={varianteId} onChange={setVarianteId}><option value="">Todos los productos</option>{catalogo.map(v => <option key={v.id} value={v.id}>{varianteLabel(v.id, v.sku)}</option>)}</Select></Field>
      </div>
      <CallLine method="GET" ruta={`/recomendaciones${estado || tiendaId ? `?${[estado && `estado=${estado}`, tiendaId && 'tiendaId={tienda}'].filter(Boolean).join('&')}` : ''}`} real={path} />
      <div style={{ display: 'grid', gridTemplateColumns: sel ? 'minmax(0, 3fr) minmax(300px, 2fr)' : '1fr', gap: 20, marginTop: 12, alignItems: 'start' }}>
        <div style={{ border: `1px solid ${T.rule}` }}>
          <Table loading={loading} count={data.content.length} empty={estado === 'BORRADOR' ? 'No hay recomendaciones por revisar. Aparecen solas cuando una bodega queda bajo su mínimo.' : 'Sin recomendaciones.'}
            cols={['Tienda', 'Producto', 'Cantidad sugerida', 'CD sugerido', 'Estado', 'Creada']}>
            {data.content.map(r => (
              <TRow key={r.id} onClick={() => elegir(r)} selected={sel?.id === r.id}>
                <TD><Named name={tiendaName(r.tiendaId)} id={r.tiendaId} /></TD><TD><Product id={r.varianteId} /></TD>
                <TD mono>{r.cantidadSugerida}</TD><TD><Named name={cdName(r.cdSugeridoId)} id={r.cdSugeridoId} /></TD>
                <TD>{tag(REC, r.estado)}</TD><TD mono>{fmtDateTime(r.fechaCreacion)}</TD>
              </TRow>
            ))}
          </Table>
          {pager}
        </div>
        {sel && (
          <Panel>
            <SectionTitle right={<button onClick={() => setSel(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.faint, fontSize: 18 }}>×</button>}>Recomendación <Ref id={sel.id} /></SectionTitle>
            <KV width={120} rows={[
              ['Tienda', <Named name={tiendaName(sel.tiendaId)} id={sel.tiendaId} />],
              ['Producto', <Product id={sel.varianteId} />],
              ['Sugerida', <Mono>{sel.cantidadSugerida}</Mono>],
              ['CD sugerido', <span><Named name={cdName(sel.cdSugeridoId)} id={sel.cdSugeridoId} /><div style={{ fontSize: 11, color: T.faint }}>Primero de la prioridad; no necesariamente el que se asignará</div></span>],
              ['Estado', tag(REC, sel.estado)],
              ['Creada', fmtDateTime(sel.fechaCreacion)],
            ]} />
            {resultado ? (
              <div style={{ marginTop: 16 }}>
                <Banner banner={info(`Orden creada.${resultado.desviacion ? ` Aprobaste ${resultado.cantidadAprobada} de ${resultado.cantidadSugerida} sugeridas: ${resultado.desviacion > 0 ? '+' : '−'}${Math.abs(resultado.desviacion)}.` : ''}`)} onClose={() => setResultado(null)} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>{ordenTag(resultado.orden)} <span style={{ fontSize: 12, color: T.muted }}>{resultado.orden.motivoAsignacion}</span></div>
                <Btn small onClick={() => nav('ordenes', { ordenId: resultado.orden.id })}>Ver detalle de la orden</Btn>
              </div>
            ) : sel.estado === 'BORRADOR' && (
              <div style={{ marginTop: 18 }}>
                <Field label="Cantidad a aprobar" hint={Number(cantidad) !== sel.cantidadSugerida && Number(cantidad) > 0 ? `Diferencia con la sugerida: ${Number(cantidad) - sel.cantidadSugerida > 0 ? '+' : '−'}${Math.abs(Number(cantidad) - sel.cantidadSugerida)}` : 'Por defecto, la sugerida'}>
                  <Input type="number" min={1} value={cantidad} onChange={setCantidad} mono />
                </Field>
                <div style={{ marginTop: 16 }}>
                  <Actions>
                    <ApiBtn method="POST" ruta="/recomendaciones/{id}/aprobar" real={`/recomendaciones/${sel.id}/aprobar`} onClick={aprobar} loading={busy === 'aprobar'} loadingText="Guardando…">Aprobar</ApiBtn>
                    <Btn variant="ghost" small onClick={() => { setCantidad(String(sel.cantidadSugerida)) }}>Editar cantidad</Btn>
                    <ApiBtn variant="danger" method="POST" ruta="/recomendaciones/{id}/rechazar" real={`/recomendaciones/${sel.id}/rechazar`} onClick={() => setConfirmRechazo(true)}>Rechazar</ApiBtn>
                  </Actions>
                </div>
              </div>
            )}
          </Panel>
        )}
      </div>
      {confirmRechazo && sel && (
        <Modal title="Rechazar recomendación" onClose={() => setConfirmRechazo(false)}>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginTop: 0 }}>La recomendación quedará rechazada y no se creará pedido.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmRechazo(false)}>Volver</Btn>
            <ApiBtn variant="danger" method="POST" ruta="/recomendaciones/{id}/rechazar" real={`/recomendaciones/${sel.id}/rechazar`} onClick={rechazar} loading={busy === 'rechazar'}>Rechazar</ApiBtn>
          </div>
        </Modal>
      )}
    </Shell>
  )
}

const Mono = ({ children }: { children: React.ReactNode }) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{children}</span>

// ════════════════════════════════════════════════════════════════════════════
// 5. ÓRDENES Y DETALLE DE ORDEN
// ════════════════════════════════════════════════════════════════════════════

export function OrdenesView(props: ViewProps) {
  const { role, nav, params } = props
  useDirectoryVersion()
  if (params?.ordenId) return <OrdenDetalle id={params.ordenId} role={role} nav={nav} aprobacionMensaje={params.aprobacionMensaje} onBack={() => nav('ordenes')} />
  return <OrdenesLista {...props} />
}

function OrdenesLista({ role, nav }: ViewProps) {
  const opciones = tiendasDelRol(role)
  const [estado, setEstado] = useState(''), [tiendaId, setTiendaId] = useState('')
  const path = `/ordenes-reabastecimiento${qs({ estado, tiendaId })}`
  const { data, loading, error, reload, pager } = usePaged<Orden>(path)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  useEffect(() => { if (error) setBanner(toBanner(error)) }, [error])
  return (
    <Shell title="Órdenes" subtitle="Pedidos aprobados a los centros de distribución." banner={banner} onBannerClose={() => setBanner(null)} action={<Btn variant="ghost" small onClick={reload}>ACTUALIZAR</Btn>}>
      <div style={{ ...grid(3), marginBottom: 10 }}>
        <Field label="Estado"><Select value={estado} onChange={setEstado}><option value="">Todos</option>{Object.entries(ORDEN).filter(([k]) => !['EN_DESPACHO', 'RECIBIDA_TOTAL', 'RECIBIDA_PARCIAL'].includes(k)).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Tienda"><Select value={tiendaId} onChange={setTiendaId}><option value="">Todas mis tiendas</option>{opciones.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select></Field>
      </div>
      <CallLine method="GET" ruta={`/ordenes-reabastecimiento${estado ? `?estado=${estado}` : ''}`} real={path} />
      <div style={{ border: `1px solid ${T.rule}`, marginTop: 12 }}>
        <Table loading={loading} count={data.content.length} empty="No hay órdenes." cols={['Orden', 'Tienda', 'Producto', 'Pedido', 'Pendiente', 'CD asignado', 'Estado', 'Creada']}>
          {data.content.map(o => (
            <TRow key={o.id} onClick={() => nav('ordenes', { ordenId: o.id })}>
              <TD><Ref id={o.id} /></TD><TD><Named name={tiendaName(o.tiendaId)} id={o.tiendaId} /></TD><TD><Product id={o.varianteId} /></TD>
              <TD mono>{o.cantidadTotalSolicitada}</TD><TD mono>{o.cantidadPendiente}</TD><TD><Named name={cdName(o.cdAsignadoId)} id={o.cdAsignadoId} /></TD>
              <TD>{ordenTag(o)}</TD><TD mono>{fmtDateTime(o.fechaCreacion)}</TD>
            </TRow>
          ))}
        </Table>
        {pager}
      </div>
    </Shell>
  )
}

function OrdenDetalle({ id, role, nav, onBack, aprobacionMensaje }: { id: string; role: RoleId; nav: Nav; onBack: () => void; aprobacionMensaje?: string }) {
  const [o, setO] = useState<Orden | null>(ordenDir(id))
  const [ciclos, setCiclos] = useState<Ciclo[] | null>(null)
  const [ciclosError, setCiclosError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true), [banner, setBanner] = useState<AppBanner | null>(aprobacionMensaje ? info(aprobacionMensaje) : null)
  const [modal, setModal] = useState<'cerrar' | 'cancelar' | null>(null), [motivo, setMotivo] = useState(''), [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [res, cy] = await Promise.all([http.get<Orden>(`/ordenes-reabastecimiento/${id}`), http.get<SpringPage<Ciclo>>(`/ciclos-despacho?ordenId=${id}&size=50`)])
    setLoading(false)
    if (res.error) setBanner(toBanner(res.error)); else setO(res.data!)
    if (cy.error) { setCiclosError(cy.error); setCiclos(cicloRegistry().filter(c => c.ordenId === id)) } else { setCiclosError(null); setCiclos(cy.data!.content) }
  }, [id])
  useEffect(() => { load() }, [load])

  const accion = async () => {
    if (!modal) return
    if (!motivo.trim()) { setBanner({ status: 400, mensaje: 'motivo: El motivo es obligatorio' }); return }
    setBusy(true)
    const res = await http.post<Orden>(`/ordenes-reabastecimiento/${id}/${modal}`, { motivo: motivo.trim() })
    setBusy(false)
    if (res.error) { setBanner(toBanner(res.error)); if (res.error.status === 409) { setModal(null); load() } return }
    setO(res.data!); setModal(null); setMotivo('')
    setBanner(info(modal === 'cerrar' ? 'La orden quedó cerrada con faltante.' : 'La orden quedó cancelada. No se tocaron existencias.'))
  }

  if (!o) return <Shell title="Detalle de orden" banner={banner} onBannerClose={() => setBanner(null)} action={<Btn variant="ghost" small onClick={onBack}>← Órdenes</Btn>}>{loading ? <LoadingState /> : <EmptyState>No encontramos esta orden, o no pertenece a tus tiendas.</EmptyState>}</Shell>

  const despachado = ciclos ? ciclos.reduce((a, c) => a + c.cantidadDespachada, 0) : o.cantidadDespachadaAcumulada
  const recibido = o.cantidadTotalSolicitada - o.cantidadPendiente
  const recepcionAbierta = ['APROBADA', 'DESPACHADA', 'EN_TRANSITO'].includes(o.estado)
  const faltante = recepcionAbierta ? null : Math.max(despachado - recibido, 0)

  return (
    <Shell title="Detalle de orden" subtitle={<span>Orden <Ref id={o.id} /> · {tiendaName(o.tiendaId)} · {skuOf(o.varianteId)}</span>} banner={banner} onBannerClose={() => setBanner(null)}
      action={<><Btn variant="ghost" small onClick={onBack}>← Órdenes</Btn><ApiBtn variant="ghost" small method="GET" ruta="/ordenes-reabastecimiento/{id}" real={`/ordenes-reabastecimiento/${id}`} onClick={load} loading={loading}>ACTUALIZAR</ApiBtn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div>
          <SectionTitle>Orden</SectionTitle>
          <KV rows={[
            ['Tienda', <Named name={tiendaName(o.tiendaId)} id={o.tiendaId} />],
            ['Producto', <Product id={o.varianteId} />],
            ['Estado', ordenTag(o)],
            ['CD asignado', <Named name={cdName(o.cdAsignadoId)} id={o.cdAsignadoId} />],
            ['Motivo de asignación', o.motivoAsignacion ?? DASH],
            ['Pedido', <Mono>{o.cantidadTotalSolicitada}</Mono>],
            ['Despachado (acum.)', <Mono>{o.cantidadDespachadaAcumulada}</Mono>],
            ['Pendiente por recibir', <Mono>{o.cantidadPendiente}</Mono>],
            ['Creada', fmtDateTime(o.fechaCreacion)],
            ...(o.fechaCierre ? [['Cierre', `${fmtDateTime(o.fechaCierre)}${o.motivoCierre ? ` · ${o.motivoCierre}` : ''}`] as [string, string]] : []),
          ]} />
          <div style={{ marginTop: 20 }}>
            {o.estado === 'GENERADA' && <ApiBtn variant="danger" method="POST" ruta="/ordenes-reabastecimiento/{id}/cancelar" real={`/ordenes-reabastecimiento/${id}/cancelar`} onClick={() => setModal('cancelar')}>Cancelar orden</ApiBtn>}
            {o.estado === 'REABIERTA' && (
              <>
                <ApiBtn method="POST" ruta="/ordenes-reabastecimiento/{id}/cerrar" real={`/ordenes-reabastecimiento/${id}/cerrar`} onClick={() => setModal('cerrar')}>Cerrar con faltante</ApiBtn>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>El CD puede despachar lo pendiente ({o.cantidadPendiente}).</div>
              </>
            )}
            {['APROBADA', 'REABIERTA'].includes(o.estado) && (can(role, 'despacho:operar')
              ? <div style={{ marginTop: 10 }}><Btn variant="ghost" small onClick={() => nav('despacho', { ordenId: o.id })}>Ir a despachar</Btn></div>
              : <div style={{ fontSize: 12, color: T.faint, marginTop: 10 }}>El Operador de CD la verá en Despacho.</div>)}
          </div>
        </div>
        <div>
          <SectionTitle>Intentos de CD</SectionTitle>
          <div style={{ border: `1px solid ${T.rule}` }}>
            {o.intentos.length === 0 ? <div style={{ padding: 16, color: T.faint, fontSize: 13 }}>Sin intentos.</div> : [...o.intentos].sort((a, b) => a.ordenEvaluado - b.ordenEvaluado).map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 12, padding: '12px 16px', borderTop: i ? `1px solid ${T.rule}` : 'none', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: T.faint }}>{it.ordenEvaluado}</span>
                <div><Named name={cdName(it.cdId)} id={it.cdId} /><div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{it.motivo ?? DASH}</div></div>
                {intentoTag(it.resultado)}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <SectionTitle>Despachos</SectionTitle>
            {ciclosError && <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{ciclosError.status === 403 ? 'Tu rol no puede consultar los despachos (requiere despacho:operar o transporte:operar). Se muestran los que esta demo ya vio.' : ciclosError.mensaje}</div>}
            <Table count={ciclos?.length ?? 0} loading={ciclos === null} empty="Sin despachos todavía." cols={['N.º', 'Fecha', 'Pedido', 'Despachado', 'Resultado', 'Cumplimiento']}>
              {(ciclos ?? []).map(c => (
                <TRow key={c.id}>
                  <TD mono>{c.numeroCiclo}</TD><TD mono>{fmtDateTime(c.fechaDespacho)}</TD><TD mono>{c.cantidadSolicitada}</TD><TD mono>{c.cantidadDespachada}</TD>
                  <TD>{tag(CICLO, c.resultado)}</TD><TD mono>{pct(c.fillRate)}</TD>
                </TRow>
              ))}
            </Table>
            <CallLine method="GET" ruta="/ciclos-despacho?ordenId={id}" real={`/ciclos-despacho?ordenId=${id}`} />
          </div>

          <div style={{ marginTop: 24 }}>
            <SectionTitle>Resumen de cuadre</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', border: `1px solid ${T.rule}` }}>
              {([['Pedido', o.cantidadTotalSolicitada], ['Despachado', despachado], ['Recibido', recibido], ['Faltante en el camino', faltante], ['Pendiente', o.cantidadPendiente]] as [string, number | null][]).map(([k, v], i) => (
                <div key={k} style={{ padding: '12px 14px', borderLeft: i ? `1px solid ${T.rule}` : 'none' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>{k}</div>
                  <Num value={v} strong />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 6, fontFamily: 'var(--font-mono)' }}>Despachado = Recibido + Faltante en el camino · Recibido = Pedido − Pendiente</div>
          </div>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'cerrar' ? 'Cerrar con faltante' : 'Cancelar orden'} onClose={() => setModal(null)}>
          {modal === 'cerrar' && (
            <>
              <div style={{ ...grid(3, 0), border: `1px solid ${T.rule}`, marginBottom: 16 }}>
                {([['Pedido', o.cantidadTotalSolicitada], ['Recibido', recibido], ['Pendiente', o.cantidadPendiente]] as [string, number][]).map(([k, v], i) => (
                  <div key={k} style={{ padding: '10px 14px', borderLeft: i ? `1px solid ${T.rule}` : 'none' }}><Label>{k}</Label><Num value={v} strong /></div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>Si prefieres que lleguen las {o.cantidadPendiente} unidades, el CD puede despachar el pendiente (despacho n.º {(ciclos?.length ?? 0) + 1}).</p>
            </>
          )}
          <Field label="Motivo" required><Textarea value={motivo} onChange={setMotivo} rows={3} maxLength={500} placeholder={modal === 'cerrar' ? `Se acepta la pérdida de ${o.cantidadPendiente} unidades en tránsito` : 'Ningún CD tiene stock para esta cantidad'} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Btn variant="ghost" onClick={() => setModal(null)}>{modal === 'cerrar' ? 'Cancelar' : 'Volver'}</Btn>
            <ApiBtn variant={modal === 'cancelar' ? 'danger' : 'primary'} method="POST" ruta={`/ordenes-reabastecimiento/{id}/${modal}`} real={`/ordenes-reabastecimiento/${id}/${modal}`} onClick={accion} loading={busy} loadingText="Guardando…">{modal === 'cerrar' ? 'CERRAR CON FALTANTE' : 'Cancelar orden'}</ApiBtn>
          </div>
        </Modal>
      )}
    </Shell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 6. DESPACHO
// ════════════════════════════════════════════════════════════════════════════

export function DespachoView({ role, params }: ViewProps) {
  useDirectoryVersion()
  const [lista, setLista] = useState<Orden[] | null>(null)
  const [sinAcceso, setSinAcceso] = useState(false)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [confirmar, setConfirmar] = useState<Orden | null>(null), [busy, setBusy] = useState(false)
  const [resultado, setResultado] = useState<{ orden: Orden; ciclo: Ciclo } | null>(null)

  const load = useCallback(async () => {
    setLista(null)
    const [a, r] = await Promise.all([http.get<SpringPage<Orden>>('/ordenes-reabastecimiento?estado=APROBADA&size=100'), http.get<SpringPage<Orden>>('/ordenes-reabastecimiento?estado=REABIERTA&size=100')])
    if (a.error?.status === 403 || r.error?.status === 403) {
      // El operador no puede listar órdenes (contrato §14.3): se usan las que la demo ya conoce
      setSinAcceso(true)
      setLista(ordenRegistry().filter(o => ['APROBADA', 'REABIERTA'].includes(o.estado)))
      return
    }
    if (a.error || r.error) setBanner(toBanner((a.error ?? r.error)!))
    setSinAcceso(false)
    setLista([...(a.data?.content ?? []), ...(r.data?.content ?? [])])
  }, [])
  useEffect(() => { load() }, [load])

  const solicitado = (o: Orden) => o.estado === 'REABIERTA' ? o.cantidadPendiente : o.cantidadTotalSolicitada - o.cantidadDespachadaAcumulada

  const despachar = async () => {
    if (!confirmar) return
    setBusy(true)
    const res = await http.post<Ciclo>(`/ordenes-reabastecimiento/${confirmar.id}/despachos`)
    setBusy(false)
    const o = confirmar
    setConfirmar(null)
    if (res.error) {
      setBanner(logisticsBanner(res.error))
      if (res.error.status === 409) { const m = res.error.mensaje.match(/en estado (\w+)/); if (m) directory.patchOrden(o.id, { estado: m[1] }); load() }
      return
    }
    setCicloEnCurso(o.id)
    directory.patchOrden(o.id, { estado: 'DESPACHADA', cantidadDespachadaAcumulada: o.cantidadDespachadaAcumulada + res.data!.cantidadDespachada })
    setResultado({ orden: o, ciclo: res.data! }); load()
  }

  const ordenadas = (lista ?? []).slice().sort((a, b) => (a.id === params?.ordenId ? -1 : b.id === params?.ordenId ? 1 : b.fechaCreacion.localeCompare(a.fechaCreacion)))
  return (
    <Shell title="Despacho" subtitle="Órdenes por despachar desde el centro de distribución." banner={banner} onBannerClose={() => setBanner(null)}
      action={<ApiBtn variant="ghost" small method="GET" ruta="/ordenes-reabastecimiento?estado=APROBADA|REABIERTA" onClick={load}>Actualizar</ApiBtn>}>
      {sinAcceso && (
        <div style={{ marginBottom: 14 }}>
          <Banner banner={{ status: 403, mensaje: '' }} onClose={() => setSinAcceso(false)} />
          <div style={{ fontSize: 12, color: T.muted, marginTop: 8, lineHeight: 1.6 }}>
            Tu rol no puede listar órdenes (la API exige <span style={{ fontFamily: 'var(--font-mono)' }}>reposicion:planificar</span>). Se muestran las órdenes por despachar que esta demo ya vio, por ejemplo las que aprobó el Planificador.
          </div>
        </div>
      )}
      <div style={{ border: `1px solid ${T.rule}` }}>
        <Table loading={lista === null} count={ordenadas.length} empty={sinAcceso ? 'Esta demo todavía no conoce órdenes por despachar. Apruébalas antes como Planificador.' : 'No hay órdenes por despachar.'}
          cols={['Orden', 'Tienda destino', 'Producto', 'CD', 'Pendiente', 'Estado', '']}>
          {ordenadas.map(o => (
            <TRow key={o.id} selected={o.id === params?.ordenId}>
              <TD><Ref id={o.id} /></TD><TD><Named name={tiendaName(o.tiendaId)} id={o.tiendaId} /></TD><TD><Product id={o.varianteId} /></TD>
              <TD><Named name={cdName(o.cdAsignadoId)} id={o.cdAsignadoId} /></TD><TD mono>{solicitado(o)}</TD><TD>{ordenTag(o)}</TD>
              <TD><Btn small onClick={() => setConfirmar(o)} disabled={!can(role, 'despacho:operar')}>Despachar</Btn></TD>
            </TRow>
          ))}
        </Table>
      </div>
      <CallLine method="POST" ruta="/ordenes-reabastecimiento/{id}/despachos" align="right" />

      {confirmar && (
        <Modal title="Despachar orden" onClose={() => setConfirmar(null)}>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginTop: 0 }}>
            Se despachará lo que haya en {cdName(confirmar.cdAsignadoId)}, hasta {solicitado(confirmar)} unidades de {skuOf(confirmar.varianteId)} para {tiendaName(confirmar.tiendaId)}.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmar(null)}>Volver</Btn>
            <ApiBtn method="POST" ruta="/ordenes-reabastecimiento/{id}/despachos" real={`/ordenes-reabastecimiento/${confirmar.id}/despachos`} onClick={despachar} loading={busy} loadingText="Despachando…">Despachar</ApiBtn>
          </div>
        </Modal>
      )}
      {resultado && (
        <Modal title={`Despacho n.º ${resultado.ciclo.numeroCiclo}`} onClose={() => setResultado(null)}>
          <KV rows={[
            ['Orden', <span><Ref id={resultado.orden.id} /> · {tiendaName(resultado.orden.tiendaId)}</span>],
            ['Pedido en este despacho', <Mono>{resultado.ciclo.cantidadSolicitada}</Mono>],
            ['Despachado', <Mono>{resultado.ciclo.cantidadDespachada}</Mono>],
            ['Quedó sin despachar', <Mono>{resultado.ciclo.cantidadPendiente}</Mono>],
            ['Resultado', tag(CICLO, resultado.ciclo.resultado)],
            ['Nivel de cumplimiento', <Mono>{pct(resultado.ciclo.fillRate)}</Mono>],
            ['Fecha', fmtDateTime(resultado.ciclo.fechaDespacho)],
          ]} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><Btn variant="ghost" onClick={() => setResultado(null)}>Cerrar</Btn></div>
        </Modal>
      )}
    </Shell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 7. CICLOS POR DESPACHAR EN VIAJE + ARMAR VIAJE
// ════════════════════════════════════════════════════════════════════════════

export function CiclosView({ nav }: ViewProps) {
  useDirectoryVersion()
  const { data, loading, error, reload } = usePaged<Ciclo>('/ciclos-despacho?sinViaje=true')
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [paradas, setParadas] = useState<string[]>([])
  const courseOrden = getCicloEnCurso()
  const courseOrdenData = courseOrden ? ordenDir(courseOrden) : null
  const [cdId, setCdId] = useState(courseOrdenData?.cdAsignadoId ?? ''), [vehiculo, setVehiculo] = useState('Camión DEMO-001')
  const [busy, setBusy] = useState(false), [armado, setArmado] = useState<Viaje | null>(null)
  useEffect(() => { if (error) setBanner(toBanner(error)) }, [error])

  const cdDe = (c: Ciclo) => ordenDir(c.ordenId)?.cdAsignadoId ?? null
  const toggle = (c: Ciclo) => {
    setParadas(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])
    if (!cdId && cdDe(c)) setCdId(cdDe(c)!)
  }
  const mover = (i: number, d: number) => setParadas(p => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n })
  const soltar = (desdeId: string, hastaIndex: number) => setParadas(p => {
    const sinDesde = p.filter(id => id !== desdeId)
    const n = [...sinDesde]
    n.splice(Math.min(hastaIndex, n.length), 0, desdeId)
    return n
  })
  const byId = useMemo(() => new Map(data.content.map(c => [c.id, c])), [data])

  const armar = async () => {
    if (!cdId) { setBanner({ status: 400, mensaje: 'Elige el centro de distribución de salida.' }); return }
    if (!vehiculo.trim()) { setBanner({ status: 400, mensaje: 'Escribe el vehículo.' }); return }
    if (paradas.length === 0) { setBanner({ status: 400, mensaje: 'Agrega al menos un despacho.' }); return }
    setBusy(true)
    const res = await http.post<Viaje>('/viajes', { cdId, vehiculo: vehiculo.trim(), paradas: paradas.map(id => ({ cicloDespachoId: id })) })
    setBusy(false)
    if (res.error) {
      setBanner(logisticsBanner(res.error))
      // "Ese despacho ya está en otro viaje" / "sale de otro CD": se quita de la lista
      const bad = (res.error.status === 409 || res.error.status === 422) && res.error.mensaje.match(UUID_IN)?.[0]
      if (bad && paradas.includes(bad)) setParadas(p => p.filter(x => x !== bad))
      if (res.error.status === 409) reload()
      return
    }
    setArmado(res.data!); setParadas([]); setVehiculo(''); setBanner(null); reload()
  }

  return (
    <Shell title="Ciclos por despachar en viaje" subtitle="Despachos que todavía no tienen viaje. Elige los que van en el mismo vehículo." banner={banner} onBannerClose={() => setBanner(null)}
      action={<ApiBtn variant="ghost" small method="GET" ruta="/ciclos-despacho?sinViaje=true" onClick={reload}>Actualizar</ApiBtn>}>
      {armado && <div style={{ marginBottom: 16 }}><Banner banner={info(`Viaje armado en ${armado.vehiculo}: Listo para salir, con ${armado.paradas.length} parada${armado.paradas.length !== 1 ? 's' : ''}.`)} onClose={() => setArmado(null)} /><div style={{ marginTop: 8 }}><Btn small onClick={() => nav('viajes', { viajeId: armado.id })}>Ver viaje</Btn></div></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', gap: 20, alignItems: 'start' }}>
        <Table loading={loading} count={data.content.length} empty="No hay despachos esperando viaje." cols={['', 'N.º', 'Orden', 'Despachado', 'Resultado', 'Fecha']}>
          {data.content.map(c => {
            return (
              <TRow key={c.id} onClick={() => toggle(c)} selected={paradas.includes(c.id)}>
                <TD><input type="checkbox" readOnly checked={paradas.includes(c.id)} /></TD>
                <TD mono>{c.numeroCiclo}</TD>
                <TD><Ref id={c.ordenId} /></TD>
                <TD mono>{c.cantidadDespachada}</TD><TD>{tag(CICLO, c.resultado)}</TD><TD mono>{fmtDateTime(c.fechaDespacho)}</TD>
              </TRow>
            )
          })}
        </Table>
        <Panel>
          <SectionTitle>Armar viaje</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Centro de distribución de salida" required>
              <Select value={cdId} onChange={setCdId}><option value="">— Elegir —</option>{cds().map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
            </Field>
            <Field label="Vehículo" required><Input value={vehiculo} onChange={setVehiculo} maxLength={100} placeholder="Camión DEMO-001" /></Field>
            <div>
              <Label required>Paradas</Label>
              {paradas.length === 0 ? <div style={{ border: `1px solid ${T.rule}`, padding: 14, fontSize: 12, color: T.faint }}>Marca despachos en la lista para agregarlos.</div> : (
                <div style={{ border: `1px solid ${T.rule}` }}>
                  {paradas.map((id, i) => {
                    const c = byId.get(id) ?? cicloDir(id)
                    const o = c ? ordenDir(c.ordenId) : null
                    return (
                      <div key={id} draggable onDragStart={e => e.dataTransfer.setData('text/ciclo', id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const desde = e.dataTransfer.getData('text/ciclo'); if (desde) soltar(desde, i) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: i ? `1px solid ${T.rule}` : 'none', fontSize: 13, cursor: 'grab' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: T.faint, width: 18 }}>{i + 1}.</span>
                        <span style={{ flex: 1 }} title={id}>{o ? tiendaName(o.tiendaId) : DASH} · {c?.cantidadDespachada ?? DASH} u.</span>
                        <button onClick={() => mover(i, -1)} style={miniBtn} title="Subir">↑</button>
                        <button onClick={() => mover(i, 1)} style={miniBtn} title="Bajar">↓</button>
                        <button onClick={() => setParadas(p => p.filter(x => x !== id))} style={miniBtn} title="Quitar">×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <ApiBtn method="POST" ruta="/viajes" onClick={armar} loading={busy} loadingText="Guardando…">ARMAR VIAJE</ApiBtn>
          </div>
        </Panel>
      </div>
    </Shell>
  )
}

const miniBtn: React.CSSProperties = { border: `1px solid ${T.rule}`, background: 'none', cursor: 'pointer', width: 24, height: 24, fontSize: 12, color: T.muted, padding: 0 }

// ════════════════════════════════════════════════════════════════════════════
// 8. VIAJES: SALIDA Y LLEGADA
// ════════════════════════════════════════════════════════════════════════════

export function ViajesView({ role, nav, params }: ViewProps) {
  useDirectoryVersion()
  if (params?.viajeId) return <ViajeDetalle id={params.viajeId} role={role} onBack={() => nav('viajes')} />
  return <ViajesLista nav={nav} />
}

function ViajesLista({ nav }: { nav: Nav }) {
  const [estado, setEstado] = useState('')
  const path = `/viajes${qs({ estado })}`
  const { data, loading, error, reload, pager } = usePaged<Viaje>(path)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  useEffect(() => { if (error) setBanner(toBanner(error)) }, [error])
  return (
    <Shell title="Viajes" banner={banner} onBannerClose={() => setBanner(null)} action={<Btn variant="ghost" small onClick={reload}>Actualizar</Btn>}>
      <div style={{ ...grid(3), marginBottom: 10 }}>
        <Field label="Estado"><Select value={estado} onChange={setEstado}><option value="">Todos</option>{Object.entries(VIAJE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      </div>
      <CallLine method="GET" ruta={path} />
      <div style={{ border: `1px solid ${T.rule}`, marginTop: 12 }}>
        <Table loading={loading} count={data.content.length} empty="No hay viajes." cols={['Vehículo', 'CD', 'Paradas', 'Estado', 'Creado', 'Salida', 'Fin']}>
          {data.content.map(v => (
            <TRow key={v.id} onClick={() => nav('viajes', { viajeId: v.id })}>
              <TD><span title={v.id}>{v.vehiculo}</span></TD><TD><Named name={cdName(v.cdId)} id={v.cdId} /></TD>
              <TD>{v.paradas.map(p => tiendaName(p.tiendaId)).join(' · ') || DASH}</TD><TD>{tag(VIAJE, v.estado)}</TD>
              <TD mono>{fmtDateTime(v.fechaCreacion)}</TD><TD mono>{fmtDateTime(v.fechaSalida)}</TD><TD mono>{fmtDateTime(v.fechaCierre)}</TD>
            </TRow>
          ))}
        </Table>
        {pager}
      </div>
    </Shell>
  )
}

function ViajeDetalle({ id, onBack }: { id: string; role: RoleId; onBack: () => void }) {
  const [v, setV] = useState<Viaje | null>(viajeDir(id))
  const [loading, setLoading] = useState(true), [banner, setBanner] = useState<AppBanner | null>(null)
  const [accion, setAccion] = useState<{ tipo: 'salida' } | { tipo: 'llegada'; paradaId: string } | null>(null)
  const [cuando, setCuando] = useState(''), [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await http.get<Viaje>(`/viajes/${id}`)
    setLoading(false)
    if (res.error) setBanner(toBanner(res.error)); else setV(res.data!)
  }, [id])
  useEffect(() => { load() }, [load])

  const registrar = async () => {
    if (!accion || !v) return
    if (cuando) {
      const seleccionada = new Date(cuando)
      if (Number.isNaN(seleccionada.getTime())) {
        setBanner({ status: 400, mensaje: 'La hora no puede ser posterior a la actual.' })
        return
      }
      if (seleccionada.getTime() > Date.now()) {
        setBanner({ status: 400, mensaje: 'La hora no puede ser posterior a la actual.' })
        return
      }
      if (accion.tipo === 'llegada' && v.fechaSalida) {
        const salida = new Date(v.fechaSalida)
        if (seleccionada.getTime() < salida.getTime()) {
          setBanner({ status: 422, mensaje: `La llegada no puede ser anterior a la salida del viaje (${fmtDateTime(v.fechaSalida)}).` })
          return
        }
      }
      if (accion.tipo === 'salida') {
        const tiemposDespacho = v.paradas
          .map(p => cicloDir(p.cicloDespachoId)?.fechaDespacho)
          .filter((x): x is string => !!x)
          .map(x => new Date(x).getTime())
        const despachoMasTarde = tiemposDespacho.length ? Math.max(...tiemposDespacho) : 0
        if (despachoMasTarde && seleccionada.getTime() < despachoMasTarde) {
          setBanner({ status: 422, mensaje: 'La salida no puede ser anterior al despacho.' })
          return
        }
      }
    }
    setBusy(true)
    const res = accion.tipo === 'salida'
      ? await http.post<Viaje>(`/viajes/${id}/salida`, whenBody('fechaSalida', cuando))
      : await http.post<Viaje>(`/viajes/${id}/paradas/${accion.paradaId}/llegada`, whenBody('fechaLlegada', cuando))
    setBusy(false)
    if (res.error) {
      if (accion.tipo === 'llegada' && res.error.status === 409 && /ARMADO|no EN_CURSO/.test(res.error.mensaje)) {
        setBanner({ status: 409, mensaje: 'Registra primero la salida del viaje.' })
      } else {
        setBanner(logisticsBanner(res.error))
      }
      if (res.error.status === 409) { setAccion(null); load() }
      return
    }
    setV(res.data!); setAccion(null); setCuando('')
    setBanner(info(accion.tipo === 'salida' ? 'Salida registrada: el viaje va en ruta y sus paradas, en camino.' : res.data!.estado === 'CERRADO' ? 'Llegada registrada. Era la última parada: el viaje terminó.' : 'Llegada registrada: la parada quedó entregada y ya aparece en Paradas por recibir.'))
  }

  if (!v) return <Shell title="Viaje" banner={banner} onBannerClose={() => setBanner(null)} action={<Btn variant="ghost" small onClick={onBack}>← Viajes</Btn>}>{loading ? <LoadingState /> : <EmptyState>No encontramos este viaje.</EmptyState>}</Shell>

  const parada = accion?.tipo === 'llegada' ? v.paradas.find(p => p.id === accion.paradaId) : null
  return (
    <Shell title={`Viaje · ${v.vehiculo}`} subtitle={<span>Sale de {cdName(v.cdId)} <Ref id={v.id} /></span>} banner={banner} onBannerClose={() => setBanner(null)}
      action={<><Btn variant="ghost" small onClick={onBack}>← Viajes</Btn><ApiBtn variant="ghost" small method="GET" ruta="/viajes/{id}" real={`/viajes/${id}`} onClick={load} loading={loading}>Actualizar</ApiBtn></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 24, alignItems: 'start' }}>
        <div>
          <KV rows={[
            ['Vehículo', v.vehiculo], ['CD', <Named name={cdName(v.cdId)} id={v.cdId} />], ['Estado', tag(VIAJE, v.estado)],
            ['Creado', fmtDateTime(v.fechaCreacion)], ['Salida', fmtDateTime(v.fechaSalida)], ['Fin', fmtDateTime(v.fechaCierre)],
          ]} />
          {v.estado === 'ARMADO' && <div style={{ marginTop: 16 }}><ApiBtn method="POST" ruta="/viajes/{id}/salida" real={`/viajes/${id}/salida`} onClick={() => { setCuando(''); setAccion({ tipo: 'salida' }) }}>Registrar salida</ApiBtn></div>}
        </div>
        <div>
          <SectionTitle>Paradas</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 16, overflowX: 'auto', fontSize: 12 }}>
            <div style={{ minWidth: 110, textAlign: 'center' }}>
              <div style={{ border: `1px solid ${T.rule}`, padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{cdName(v.cdId)}</div>
              <div style={{ color: T.muted, marginTop: 5 }}>Origen</div>
            </div>
            {[...v.paradas].sort((a, b) => a.ordenParada - b.ordenParada).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 150 }}>
                <div style={{ width: 36, borderTop: `1px solid ${T.rule}`, marginTop: 18 }} />
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ border: `1px solid ${T.rule}`, padding: '8px 10px' }}>{tiendaName(p.tiendaId)}</div>
                  <div style={{ color: p.estado === 'ENTREGADO' ? TONE.green : p.estado === 'EN_TRANSITO' ? TONE.violet : T.muted, marginTop: 5, fontFamily: 'var(--font-mono)' }}>
                    {p.estado === 'ENTREGADO' ? 'Entregada' : p.estado === 'EN_TRANSITO' ? 'En camino' : 'Pendiente'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Table count={v.paradas.length} cols={['#', 'Tienda', 'Despacho', 'Estado', 'Salida del CD', 'Llegada', '']}>
            {[...v.paradas].sort((a, b) => a.ordenParada - b.ordenParada).map(p => {
              const c = cicloDir(p.cicloDespachoId)
              return (
                <TRow key={p.id}>
                  <TD mono>{p.ordenParada}</TD><TD><Named name={tiendaName(p.tiendaId)} id={p.tiendaId} /></TD>
                  <TD>{c ? <span>{skuOf(ordenDir(c.ordenId)?.varianteId)} · {c.cantidadDespachada} u.</span> : <span title={p.cicloDespachoId} style={{ color: T.faint }}>{DASH}</span>}</TD>
                  <TD>{tag(PARADA, p.estado)}</TD><TD mono>{fmtDateTime(p.fechaSalidaCd)}</TD><TD mono>{fmtDateTime(p.fechaLlegada)}</TD>
                  <TD>{p.estado === 'EN_TRANSITO' && <Btn small onClick={() => { setCuando(''); setAccion({ tipo: 'llegada', paradaId: p.id }) }}>Registrar llegada</Btn>}</TD>
                </TRow>
              )
            })}
          </Table>
          {v.paradas.some(p => p.estado === 'EN_TRANSITO') && <CallLine method="POST" ruta="/viajes/{id}/paradas/{paradaId}/llegada" align="right" />}
        </div>
      </div>
      {accion && (
        <Modal title={accion.tipo === 'salida' ? 'Registrar salida' : `Registrar llegada · ${tiendaName(parada?.tiendaId)}`} onClose={() => setAccion(null)}>
          <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, marginTop: 0 }}>
            {accion.tipo === 'salida' ? 'No puede ser futura (hay 2 minutos de margen) ni anterior al despacho.' : `No puede ser futura ni anterior a la salida del viaje (${fmtDateTime(v.fechaSalida)}).`}
          </p>
          <WhenPicker value={cuando} onChange={setCuando} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Btn variant="ghost" onClick={() => setAccion(null)}>Volver</Btn>
            <ApiBtn method="POST" ruta={accion.tipo === 'salida' ? '/viajes/{id}/salida' : '/viajes/{id}/paradas/{paradaId}/llegada'} onClick={registrar} loading={busy} loadingText="Guardando…">{accion.tipo === 'salida' ? 'Registrar salida' : 'Registrar llegada'}</ApiBtn>
          </div>
        </Modal>
      )}
    </Shell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 9. PARADAS POR RECIBIR Y RECEPCIÓN
// ════════════════════════════════════════════════════════════════════════════

export function ParadasView(_: ViewProps) {
  useDirectoryVersion()
  const [lista, setLista] = useState<ParadaPorRecibir[] | null>(null)
  const [banner, setBanner] = useState<AppBanner | null>(null)
  const [sel, setSel] = useState<ParadaPorRecibir | null>(null)
  const [recibido, setRecibido] = useState(''), [confirmar, setConfirmar] = useState(false), [busy, setBusy] = useState(false)
  const [recepcionExistente, setRecepcionExistente] = useState<Recepcion | null>(null)
  const [bodegaAntes, setBodegaAntes] = useState<Stock | null>(null), [bodegaDespues, setBodegaDespues] = useState<Stock | null>(null)

  const load = useCallback(async () => {
    setLista(null)
    const res = await http.get<ParadaPorRecibir[]>('/paradas-por-recibir')
    if (res.error) { setBanner(toBanner(res.error)); setLista([]) } else setLista(res.data!)
  }, [])
  useEffect(() => { load() }, [load])

  const faltante = sel && recibido !== '' ? sel.cantidadDespachada - Number(recibido) : null

  const registrar = async () => {
    if (!sel) return
    setBusy(true)
    const res = await http.post<Recepcion>(`/viajes/${sel.viajeId}/paradas/${sel.paradaId}/recepcion`, { cantidadRecibida: Number(recibido) })
    setBusy(false); setConfirmar(false)
    if (res.error) {
      if (res.error.status === 422) setBanner({ status: 422, mensaje: res.error.mensaje })
      else if (res.error.status === 400) setBanner({ status: 400, mensaje: 'La cantidad recibida no puede ser negativa.' })
      else if (res.error.status === 409) setBanner({ status: 409, mensaje: 'Esta parada todavía no se ha entregado.' })
      else setBanner(toBanner(res.error))
      if (res.error.status === 409) load()
      return
    }
    const r = res.data!
    setRecepcionExistente(r)
    setBanner(info(r.discrepancia > 0
      ? `Recepción registrada. Con un faltante de ${r.discrepancia}. La orden quedó reabierta con ${r.cantidadPendienteOrden} pendientes.`
      : `Recepción registrada. La orden quedó ${r.estadoOrden === 'CERRADA' ? 'cerrada' : 'reabierta'}.`))
    const o = ordenDir(r.cicloDespachoId ? sel.ordenId : '')
    const tienda = tiendas().find(t => t.id === sel.tiendaId)
    if (tienda?.bodegaId) {
      const after = await http.get<SpringPage<Stock>>(`/nodos/${tienda.bodegaId}/inventario`)
      setBodegaDespues(after.data?.content.find(s => s.varianteId === o?.varianteId) ?? null)
    }
    setSel(null); setRecibido(''); load()
  }

  const intentar = () => {
    if (!sel) return
    const n = Number(recibido)
    if (recibido === '' || !Number.isInteger(n)) { setBanner({ status: 400, mensaje: 'Escribe cuánto llegó.' }); return }
    if (n < 0) { setBanner({ status: 400, mensaje: 'La cantidad recibida no puede ser negativa.' }); return }
    if (faltante && faltante > 0) setConfirmar(true); else registrar()
  }

  return (
    <Shell title="Paradas por recibir" subtitle="Entregas que llegaron a tus tiendas y todavía no tienen recepción." banner={banner} onBannerClose={() => setBanner(null)}
      action={<ApiBtn variant="ghost" small method="GET" ruta="/paradas-por-recibir" onClick={load}>Actualizar</ApiBtn>}>
      <div style={{ display: 'grid', gridTemplateColumns: sel ? 'minmax(0, 3fr) minmax(300px, 2fr)' : '1fr', gap: 20, alignItems: 'start' }}>
        <Table loading={lista === null} count={lista?.length ?? 0} empty="No hay entregas por recibir. Aparecen cuando el transporte registra la llegada a tu tienda." cols={['Tienda', 'Viaje', 'Orden', 'Producto', 'Despachado']}>
          {(lista ?? []).map(p => {
            const o = ordenDir(p.ordenId)
            return (
              <TRow key={p.paradaId} onClick={async () => {
                setSel(p); setRecibido(String(p.cantidadDespachada)); setRecepcionExistente(null); setBodegaAntes(null); setBodegaDespues(null)
                const tienda = tiendas().find(t => t.id === p.tiendaId)
                if (tienda?.bodegaId) {
                  const stock = await http.get<SpringPage<Stock>>(`/nodos/${tienda.bodegaId}/inventario`)
                  setBodegaAntes(stock.data?.content.find(s => s.varianteId === o?.varianteId) ?? null)
                }
              }} selected={sel?.paradaId === p.paradaId}>
                <TD><Named name={tiendaName(p.tiendaId)} id={p.tiendaId} /></TD><TD><Named name={viajeDir(p.viajeId)?.vehiculo ?? DASH} id={p.viajeId} /></TD>
                <TD><Ref id={p.ordenId} /></TD><TD>{o ? <Product id={o.varianteId} /> : <span style={{ color: T.faint }}>{DASH}</span>}</TD><TD mono>{p.cantidadDespachada}</TD>
              </TRow>
            )
          })}
        </Table>
        {sel && (
          <Panel>
            <SectionTitle right={<button onClick={() => setSel(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.faint, fontSize: 18 }}>×</button>}>Recepción · {tiendaName(sel.tiendaId)}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Despachado"><Input value={String(sel.cantidadDespachada)} readOnly mono /></Field>
              <Field label="Recibido" required hint={`Entero de 0 a ${sel.cantidadDespachada}`}><Input type="number" min={0} max={sel.cantidadDespachada} value={recibido} onChange={setRecibido} mono autoFocus /></Field>
              <div>
                <Label>Faltante en el camino</Label>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: faltante && faltante > 0 ? T.danger : faltante && faltante < 0 ? T.danger : T.ink }}>{faltante ?? DASH}</div>
                {faltante !== null && faltante < 0 && <div style={{ fontSize: 12, color: T.danger }}>Lo recibido supera lo despachado.</div>}
              </div>
              {(bodegaAntes || recepcionExistente) && (
                <div style={{ border: `1px solid ${T.rule}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 11, borderBottom: `1px solid ${T.rule}` }}>
                    <div style={{ padding: '8px 10px', color: T.muted }}>Bodega</div>
                    <div style={{ padding: '8px 10px', borderLeft: `1px solid ${T.rule}`, color: T.muted }}>Antes</div>
                    <div style={{ padding: '8px 10px', borderLeft: `1px solid ${T.rule}`, color: T.muted }}>Después</div>
                  </div>
                  {([
                    ['A la mano', bodegaAntes?.aLaMano, bodegaDespues?.aLaMano],
                    ['En camino', bodegaAntes?.entrante, bodegaDespues?.entrante],
                  ] as [string, number | undefined, number | undefined][]).map(([label, before, after]) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: 12 }}>
                      <div style={{ padding: '8px 10px' }}>{label}</div>
                      <div style={{ padding: '8px 10px', borderLeft: `1px solid ${T.rule}`, fontFamily: 'var(--font-mono)' }}>{before ?? DASH}</div>
                      <div style={{ padding: '8px 10px', borderLeft: `1px solid ${T.rule}`, fontFamily: 'var(--font-mono)' }}>{after ?? (recepcionExistente ? before : DASH)}</div>
                    </div>
                  ))}
                </div>
              )}
              <ApiBtn method="POST" ruta="/viajes/{viajeId}/paradas/{paradaId}/recepcion" real={`/viajes/${sel.viajeId}/paradas/${sel.paradaId}/recepcion`} onClick={intentar} loading={busy} loadingText="Guardando…">Registrar recepción</ApiBtn>
            </div>
          </Panel>
        )}
      </div>
      {confirmar && sel && faltante !== null && (
        <Modal title="Registrar recepción con faltante" onClose={() => setConfirmar(false)}>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginTop: 0 }}>Faltan {faltante} unidades. Se registrarán como pérdida en el camino y la orden quedará reabierta.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setConfirmar(false)}>Volver</Btn>
            <ApiBtn method="POST" ruta="/viajes/{viajeId}/paradas/{paradaId}/recepcion" onClick={registrar} loading={busy} loadingText="Guardando…">Registrar recepción</ApiBtn>
          </div>
        </Modal>
      )}
    </Shell>
  )
}
