import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  http,
  type CategoriaResponse,
  type CentroDistribucionConNodoResponse,
  type CentroDistribucionResponse,
  type SpringPage,
  type TiendaConNodosResponse,
  type TiendaResponse,
} from './api'
import { invalidateNodeStock, loadCategorias, loadNodeStock, loadStoreDetail, loadTiendas, loadVariantCatalog, type Catalogs, type NodeStock } from './catalogCache'
import { VarianteSelector } from './VarianteSelector'

const C = { ink: '#111111', muted: '#666666', faint: '#999999', rule: '#E2E2E2', surface: '#F9F9F9', canvas: '#FFFFFF', danger: '#B91C1C' }
type ErrorState = { status: number; mensaje: string } | null
type Tab = { id: string; label: string }
// undefined: cargando · null: sin acceso o no disponible
type Loaded<T> = T | null | undefined

const emptyPage = <T,>(): SpringPage<T> => ({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0 })
const uuid = () => crypto.randomUUID()
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const date = (value: string) => {
  try { return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
  catch { return value }
}
// datetime-local no trae zona; la API espera un Instant ISO-8601
const apiValue = (key: string, value: string) => key === 'desde' || key === 'hasta' ? new Date(value).toISOString() : value

function Field({ label, value, onChange, type = 'text', required, maxLength, placeholder, readOnly }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; maxLength?: number; placeholder?: string; readOnly?: boolean
}) {
  return <label style={{ display: 'block' }}>
    <span style={labelStyle}>{label}{required ? ' *' : ''}</span>
    <input type={type} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} readOnly={readOnly} style={{ ...controlStyle, background: readOnly ? C.surface : C.canvas }} />
  </label>
}

// Campo para pegar un UUID cuando no hay acceso al listado; solo avisa cambios válidos
function IdField({ label, value, onChange, placeholder, readOnly }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; readOnly?: boolean
}) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return <Field label={label} value={text} placeholder={placeholder} readOnly={readOnly} onChange={next => {
    setText(next)
    const trimmed = next.trim()
    if (!trimmed || isUuid(trimmed)) onChange(trimmed)
  }} />
}

function Choice({ label, value, onChange, children, required }: {
  label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; required?: boolean
}) {
  return <label style={{ display: 'block' }}>
    <span style={labelStyle}>{label}{required ? ' *' : ''}</span>
    <select value={value} onChange={event => onChange(event.target.value)} style={controlStyle}>{children}</select>
  </label>
}

function TextArea({ label, value, onChange, required, maxLength = 500, rows = 3, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; maxLength?: number; rows?: number; placeholder?: string
}) {
  return <label style={{ display: 'block' }}>
    <span style={labelStyle}>{label}{required ? ' *' : ''}</span>
    <textarea value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} rows={rows} placeholder={placeholder} style={{ ...controlStyle, resize: 'vertical' }} />
  </label>
}

function Button({ children, onClick, kind = 'primary', disabled }: {
  children: React.ReactNode; onClick: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean
}) {
  const colors = kind === 'primary'
    ? { background: C.ink, color: C.canvas, borderColor: C.ink }
    : { background: C.canvas, color: kind === 'danger' ? C.danger : C.ink, borderColor: kind === 'danger' ? C.danger : C.rule }
  return <button onClick={onClick} disabled={disabled} style={{ border: '1px solid', padding: '8px 14px', font: '500 12px var(--font-sans)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .45 : 1, ...colors }}>{children}</button>
}

function Badge({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return <span style={{ border: `1px solid ${dark ? C.ink : C.rule}`, background: dark ? C.ink : C.surface, color: dark ? C.canvas : C.ink, padding: '2px 7px', font: '11px var(--font-mono)' }}>{children}</span>
}

function Banner({ error, close }: { error: ErrorState; close: () => void }) {
  if (!error) return null
  const message = error.status === 403 ? 'Acceso denegado: falta el permiso requerido' : error.mensaje
  return <div style={{ borderLeft: `3px solid ${C.danger}`, background: C.surface, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
    <span style={{ fontSize: 13 }}>{message}</span><button onClick={close} style={{ border: 0, background: 'none', cursor: 'pointer' }}>Cerrar</button>
  </div>
}

function Tabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return <div style={{ display: 'flex', borderBottom: `1px solid ${C.rule}`, marginBottom: 22, overflowX: 'auto' }}>
    {tabs.map(tab => <button key={tab.id} onClick={() => onChange(tab.id)} style={{ border: 0, borderBottom: active === tab.id ? `2px solid ${C.ink}` : '2px solid transparent', background: 'none', padding: '10px 14px', font: `${active === tab.id ? 600 : 400} 13px var(--font-sans)`, whiteSpace: 'nowrap', cursor: 'pointer' }}>{tab.label}</button>)}
  </div>
}

function Page({ title, tabs, active, onTab, error, closeError, children }: {
  title: string; tabs: Tab[]; active: string; onTab: (id: string) => void; error: ErrorState; closeError: () => void; children: React.ReactNode
}) {
  return <div><header style={{ padding: '26px 32px 20px', borderBottom: `1px solid ${C.rule}` }}><h1 style={{ margin: 0, fontSize: 19 }}>{title}</h1></header>
    <main style={{ padding: '20px 32px' }}><Banner error={error} close={closeError} /><Tabs tabs={tabs} active={active} onChange={onTab} />{children}</main>
  </div>
}

function Box({ title, children }: { title?: string; children: React.ReactNode }) {
  return <section style={{ border: `1px solid ${C.rule}`, padding: 18, marginBottom: 18 }}>
    {title && <h2 style={{ margin: '0 0 16px', fontSize: 14 }}>{title}</h2>}{children}
  </section>
}

function DataTable({ columns, rows, empty = 'Sin datos' }: { columns: string[]; rows: React.ReactNode; empty?: string }) {
  return <div style={{ border: `1px solid ${C.rule}`, overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead><tr>{columns.map(column => <th key={column} style={thStyle}>{column}</th>)}</tr></thead>
    <tbody>{useMemo(() => Array.isArray(rows) && rows.length === 0 ? <tr><td colSpan={columns.length} style={{ padding: 30, textAlign: 'center', color: C.faint }}>{empty}</td></tr> : rows, [rows, columns.length, empty])}</tbody>
  </table></div>
}

function Cell({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td style={{ padding: '10px 14px', borderTop: `1px solid ${C.rule}`, font: `${mono ? 12 : 13}px ${mono ? 'var(--font-mono)' : 'var(--font-sans)'}` }}>{children}</td>
}

function Pager({ data, setPage, setSize }: { data: SpringPage<unknown>; setPage: (page: number) => void; setSize: (size: number) => void }) {
  return <div style={{ border: `1px solid ${C.rule}`, borderTop: 0, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
    <label>Resultados por página&nbsp; <select value={data.size} onChange={event => setSize(Number(event.target.value))}>{[10, 20, 50].map(size => <option key={size}>{size}</option>)}</select></label>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Button kind="ghost" disabled={data.number === 0} onClick={() => setPage(data.number - 1)}>Anterior</Button><span>Página {data.number + 1} de {Math.max(1, data.totalPages)}</span><Button kind="ghost" disabled={data.number >= data.totalPages - 1} onClick={() => setPage(data.number + 1)}>Siguiente</Button></div>
  </div>
}

const labelStyle: React.CSSProperties = { display: 'block', color: C.muted, fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }
const controlStyle: React.CSSProperties = { border: `1px solid ${C.rule}`, borderRadius: 0, background: C.canvas, color: C.ink, padding: '9px 10px', width: '100%', font: '13px var(--font-sans)' }
const thStyle: React.CSSProperties = { padding: '9px 14px', textAlign: 'left', color: C.muted, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const grid = (count = 3): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, gap: 12 })

// Cada vista pide solo lo que usa. Un 403 no bloquea la vista: el selector pasa a campo manual.
function useCatalog<T>(load: () => Promise<T>, setError: (error: ErrorState) => void): Loaded<T> {
  const [data, setData] = useState<Loaded<T>>(undefined)
  useEffect(() => {
    let active = true
    load().then(value => { if (active) setData(value) }).catch((error: ErrorState) => {
      if (!active) return
      setData(null)
      if (error?.status !== 403) setError(error)
    })
    return () => { active = false }
  }, [load, setError])
  return data
}

function useSku(catalogs: Loaded<Catalogs>) {
  return useCallback((id: string) => catalogs?.variantesById.get(id)?.sku ?? (catalogs ? 'SKU no disponible' : id), [catalogs])
}

function StoreChoice({ stores, value, onChange, label = 'Tienda', empty = '— Seleccionar tienda —', required = true }: {
  stores: Loaded<TiendaResponse[]>; value: string; onChange: (id: string) => void; label?: string; empty?: string; required?: boolean
}) {
  if (!stores) return <IdField label={`${label} (ID)`} value={value} onChange={onChange} readOnly={stores === undefined} placeholder={stores === undefined ? 'Cargando tiendas…' : 'Sin acceso al listado de tiendas: pega el ID'} />
  return <Choice label={label} value={value} onChange={onChange} required={required}><option value="">{empty}</option>{stores.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}</Choice>
}

// by='sku' para endpoints que reciben SKU (carga, ajuste, venta); by='id' para los que reciben varianteId
function VariantChoice({ catalogs, value, onChange, by = 'id', ...selector }: {
  catalogs: Loaded<Catalogs>; value: string; onChange: (value: string) => void; by?: 'id' | 'sku'
} & Omit<React.ComponentProps<typeof VarianteSelector>, 'value' | 'onChange' | 'catalogs'>) {
  if (!catalogs) {
    const placeholder = catalogs === undefined ? 'Cargando catálogo…' : by === 'sku' ? 'Sin acceso al catálogo: escribe el SKU' : 'Sin acceso al catálogo: pega el ID'
    return by === 'sku'
      ? <Field label="SKU" value={value} onChange={onChange} readOnly={catalogs === undefined} placeholder={placeholder} required />
      : <IdField label="Variante (ID)" value={value} onChange={onChange} readOnly={catalogs === undefined} placeholder={placeholder} />
  }
  const id = by === 'sku' ? catalogs.variantesBySku.get(value)?.id ?? '' : value
  return <VarianteSelector {...selector} value={id} onChange={next => onChange(by === 'sku' ? catalogs.variantesById.get(next)?.sku ?? '' : next)} catalogs={catalogs} />
}

type Stock = NodeStock
interface Movement { id: string; varianteId: string; tipo: string; cantidad: number; motivo: string | null; comentario: string | null; forzado: boolean; usuarioId: string | null; ocurridoEn: string }
interface NodeOption { id: string; label: string }

export function InventoryView() {
  const [tab, setTab] = useState('stock')
  const [error, setError] = useState<ErrorState>(null)
  const catalogs = useCatalog(loadVariantCatalog, setError)
  const stores = useCatalog(loadTiendas, setError)
  const sku = useSku(catalogs)
  const [storeId, setStoreId] = useState('')
  const [nodes, setNodes] = useState<NodeOption[]>([])
  const [nodeId, setNodeId] = useState('')
  const [centers, setCenters] = useState<CentroDistribucionResponse[]>([])

  useEffect(() => { http.get<SpringPage<CentroDistribucionResponse>>('/centros-distribucion?page=0&size=200').then(result => { if (!result.error) setCenters(result.data!.content) }) }, [])
  const chooseStore = async (id: string) => {
    setStoreId(id); setNodeId(''); setNodes([])
    if (!id) return
    let detail: TiendaConNodosResponse
    try { detail = await loadStoreDetail(id) } catch (caught) { setError(caught as ErrorState); return }
    const next = [{ id: detail.almacenId, label: 'Almacén' }, { id: detail.bodegaId, label: 'Bodega' }]
    setNodes(next); setNodeId(next[0].id)
  }
  const chooseCenter = async (id: string) => {
    if (!id) return
    const result = await http.get<CentroDistribucionConNodoResponse>(`/centros-distribucion/${id}`)
    if (result.error) { setError(result.error); return }
    if (result.data!.nodo) { setStoreId(''); setNodes([{ id: result.data!.nodo!.id, label: `CD · ${result.data!.nombre}` }]); setNodeId(result.data!.nodo!.id) }
  }
  const selector = <Box title="Nodo operativo"><div style={grid(3)}><StoreChoice stores={stores} value={storeId} onChange={chooseStore} />
    <Choice label="Centro de distribución" value="" onChange={chooseCenter}><option value="">— Seleccionar CD —</option>{centers.map(center => <option key={center.id} value={center.id}>{center.nombre}</option>)}</Choice>
    <Choice label="Nodo" value={nodeId} onChange={setNodeId}><option value="">— Seleccionar nodo —</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</Choice></div></Box>

  return <Page title="Inventario" tabs={[{ id: 'stock', label: 'Stock por nodo' }, { id: 'variant', label: 'Stock por variante' }, { id: 'initial', label: 'Carga inicial' }, { id: 'adjust', label: 'Ajuste' }, { id: 'kardex', label: 'Kardex' }]} active={tab} onTab={setTab} error={error} closeError={() => setError(null)}>
    {selector}
    {tab === 'stock' && <NodeStock nodeId={nodeId} sku={sku} setError={setError} />}
    {tab === 'variant' && <VariantStock catalogs={catalogs} sku={sku} setError={setError} />}
    {tab === 'initial' && <InitialLoad nodeId={nodeId} catalogs={catalogs} setError={setError} />}
    {tab === 'adjust' && <Adjustment nodeId={nodeId} catalogs={catalogs} setError={setError} />}
    {tab === 'kardex' && <Kardex nodeId={nodeId} sku={sku} setError={setError} />}
  </Page>
}

function NodeStock({ nodeId, sku, setError }: { nodeId: string; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [rows, setRows] = useState<Stock[]>([])
  const [page, setPage] = useState(0), [size, setSize] = useState(10)
  useEffect(() => { setPage(0); if (!nodeId) { setRows([]); return }; loadNodeStock(nodeId).then(setRows).catch(setError) }, [nodeId, setError])
  const data = useMemo<SpringPage<Stock>>(() => ({ content: rows.slice(page * size, page * size + size), number: page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) }), [page, rows, size])
  return <><DataTable columns={['SKU', 'A la mano', 'Disponible para uso', 'Entrante', 'Saliente', 'Pronosticado']} rows={data.content.map(item => <tr key={item.varianteId}><Cell mono>{sku(item.varianteId)}</Cell><Cell>{item.aLaMano}</Cell><Cell>{item.disponibleParaUso}</Cell><Cell>{item.entrante}</Cell><Cell>{item.saliente}</Cell><Cell>{item.pronosticado}</Cell></tr>)} empty={nodeId ? 'Sin stock' : 'Selecciona un nodo'} /><Pager data={data} setPage={setPage} setSize={value => { setPage(0); setSize(value) }} /></>
}

function VariantStock({ catalogs, sku, setError }: { catalogs: Loaded<Catalogs>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [variantId, setVariantId] = useState(''), [rows, setRows] = useState<Stock[]>([])
  const search = async () => { if (!variantId) return; const result = await http.get<Stock[]>(`/variantes/${variantId}/inventario`); if (result.error) setError(result.error); else setRows(result.data!) }
  return <><Box><div style={{ ...grid(2), alignItems: 'end' }}><VariantChoice value={variantId} onChange={setVariantId} catalogs={catalogs} /><Button onClick={search} disabled={!variantId}>Consultar stock</Button></div></Box>
    <DataTable columns={['SKU', 'A la mano', 'Disponible para uso', 'Entrante', 'Saliente', 'Pronosticado']} rows={rows.map((item, index) => <tr key={`${item.nodoId}-${index}`}><Cell mono>{sku(item.varianteId)}</Cell><Cell>{item.aLaMano}</Cell><Cell>{item.disponibleParaUso}</Cell><Cell>{item.entrante}</Cell><Cell>{item.saliente}</Cell><Cell>{item.pronosticado}</Cell></tr>)} empty="Sin stock visible en los nodos del usuario" /></>
}

const MAX_CARGA = 500

// Una línea por variante: "SKU,cantidad" (también ; o tabulador, como al copiar de una hoja de cálculo)
function parseBulk(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines[0] && /^sku\s*[,;\t]\s*cantidad$/i.test(lines[0])) lines.shift()
  return lines.map(line => {
    const [sku = '', cantidad = ''] = line.split(/[,;\t]/).map(part => part.trim())
    return { sku, cantidad }
  })
}

function InitialLoad({ nodeId, catalogs, setError }: { nodeId: string; catalogs: Loaded<Catalogs>; setError: (error: ErrorState) => void }) {
  const [items, setItems] = useState([{ sku: '', cantidad: '0' }])
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    setItems([{ sku: '', cantidad: '0' }]); setMessage('')
    if (!nodeId) { setLoadedIds(new Set()); return }
    loadNodeStock(nodeId).then(rows => setLoadedIds(new Set(rows.map(row => row.varianteId)))).catch(setError)
  }, [nodeId, setError])
  const update = (index: number, key: 'sku' | 'cantidad', value: string) => setItems(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item))
  const isLoaded = (sku: string) => loadedIds.has(catalogs?.variantesBySku.get(sku)?.id ?? '')
  const list = (skus: string[]) => skus.slice(0, 5).join(', ') + (skus.length > 5 ? ` y ${skus.length - 5} más` : '')
  const addBulk = () => {
    setMessage('')
    const parsed = parseBulk(bulk)
    if (parsed.length === 0) return
    const invalid = parsed.filter(item => !item.sku || !/^\d+$/.test(item.cantidad)).map(item => item.sku || '(sin SKU)')
    if (invalid.length) { setMessage(`Líneas sin SKU o con cantidad no entera: ${list(invalid)}.`); return }
    if (catalogs) {
      const unknown = parsed.filter(item => !catalogs.variantesBySku.has(item.sku)).map(item => item.sku)
      if (unknown.length) { setMessage(`SKU que no están en el catálogo: ${list(unknown)}.`); return }
      const loaded = parsed.filter(item => isLoaded(item.sku)).map(item => item.sku)
      if (loaded.length) { setMessage(`Ya están cargados en este nodo: ${list(loaded)}.`); return }
    }
    const next = [...items.filter(item => item.sku.trim()), ...parsed]
    if (next.length > MAX_CARGA) { setMessage(`Una carga admite máximo ${MAX_CARGA} filas.`); return }
    setItems(next); setBulk('')
  }
  const submit = async () => {
    setMessage('')
    if (!nodeId) { setMessage('Selecciona un nodo.'); return }
    if (items.some(item => !item.sku.trim() || !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 0)) { setMessage('Cada fila requiere una variante y una cantidad entera mayor o igual a cero.'); return }
    const skus = items.map(item => item.sku.trim())
    if (new Set(skus).size !== skus.length) { setMessage('No puedes repetir una variante dentro de la misma carga inicial.'); return }
    const result = await http.post<{ nodoId: string; filasCreadas: number; unidadesTotales: number }>(`/nodos/${nodeId}/inventario/carga-inicial`, { items: items.map(item => ({ sku: item.sku.trim(), cantidad: Number(item.cantidad) })) })
    if (result.error) { setError(result.error); return }
    invalidateNodeStock(nodeId)
    const ids = skus.map(sku => catalogs?.variantesBySku.get(sku)?.id).filter((id): id is string => !!id)
    setLoadedIds(current => new Set([...current, ...ids]))
    setItems([{ sku: '', cantidad: '0' }])
    setMessage(`Carga completada: ${result.data!.filasCreadas} filas y ${result.data!.unidadesTotales} unidades.`)
  }
  return <Box title="Carga inicial">{message && <p style={{ color: message.startsWith('Carga') ? C.ink : C.danger }}>{message}</p>}
    {items.map((item, index) => <div key={index} style={{ ...grid(3), marginBottom: 8, alignItems: 'end' }}><VariantChoice by="sku" value={item.sku} onChange={value => update(index, 'sku', value)} catalogs={catalogs} excludedIds={loadedIds} emptyMessage="Todas las variantes del catálogo ya están cargadas en este nodo" /><Field label="Cantidad" value={item.cantidad} onChange={value => update(index, 'cantidad', value)} type="number" required /><Button kind="danger" disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Quitar</Button></div>)}
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Button kind="ghost" disabled={items.length >= MAX_CARGA || (!!catalogs && loadedIds.size >= catalogs.variantes.length)} onClick={() => setItems(current => [...current, { sku: '', cantidad: '0' }])}>Añadir fila</Button><Button onClick={submit}>Cargar inventario</Button></div>
    <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 18, paddingTop: 14 }}>
      <TextArea label="Pegar varias líneas" value={bulk} onChange={setBulk} rows={5} maxLength={40000} placeholder={'CAM-BAS-001,10\nCAM-BAS-002,0'} />
      <div style={{ color: C.muted, fontSize: 12, margin: '6px 0 10px' }}>Una línea por variante: SKU y cantidad separados por coma, punto y coma o tabulador. Se pueden copiar dos columnas de una hoja de cálculo.</div>
      <Button kind="ghost" onClick={addBulk} disabled={!bulk.trim()}>Agregar líneas</Button>
    </div>
  </Box>
}

function Adjustment({ nodeId, catalogs, setError }: { nodeId: string; catalogs: Loaded<Catalogs>; setError: (error: ErrorState) => void }) {
  const [sku, setSku] = useState(''), [delta, setDelta] = useState(''), [motivo, setMotivo] = useState('CONTEO_FISICO'), [comment, setComment] = useState(''), [message, setMessage] = useState('')
  const [stock, setStock] = useState<NodeStock[]>([])
  useEffect(() => {
    setSku(''); setMessage('')
    if (!nodeId) { setStock([]); return }
    loadNodeStock(nodeId).then(setStock).catch(setError)
  }, [nodeId, setError])
  const stockByVariant = useMemo(() => new Map(stock.map(row => [row.varianteId, row.aLaMano])), [stock])
  const allowedIds = useMemo(() => new Set(stock.map(row => row.varianteId)), [stock])
  const variantId = catalogs?.variantesBySku.get(sku)?.id ?? ''
  const submit = async () => {
    setMessage(''); const number = Number(delta)
    if (!nodeId || !sku.trim() || !Number.isInteger(number) || number === 0 || (motivo === 'CORRECCION' && !comment.trim())) { setMessage('Completa la variante, un delta entero distinto de cero y el comentario obligatorio para CORRECCIÓN.'); return }
    const result = await http.post<{ aLaMano: number }>(`/nodos/${nodeId}/inventario/ajustes`, { sku: sku.trim(), delta: number, motivo, comentario: comment || null })
    if (result.error) { if (result.error.status === 400) setMessage(result.error.mensaje); else setError(result.error); return }
    invalidateNodeStock(nodeId)
    setStock(current => current.map(row => row.varianteId === variantId ? { ...row, aLaMano: result.data!.aLaMano } : row))
    setMessage(`Ajuste registrado. Nuevo stock a la mano: ${result.data!.aLaMano}.`)
  }
  return <Box title="Registrar ajuste"><div style={grid(3)}><VariantChoice by="sku" value={sku} onChange={setSku} catalogs={catalogs} allowedIds={allowedIds} stockByVariant={stockByVariant} emptyMessage="Este nodo aún no tiene variantes cargadas. Haz primero la carga inicial." /><div><Field label="Delta" value={delta} onChange={setDelta} type="number" required />{Number(delta) < 0 && variantId && <div style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>Máximo a restar: {stockByVariant.get(variantId) ?? 0}</div>}</div><Choice label="Motivo" value={motivo} onChange={setMotivo}>{['CONTEO_FISICO', 'INGRESO_MANUAL', 'MERMA', 'CORRECCION'].map(x => <option key={x}>{x}</option>)}</Choice></div>
    <div style={{ marginTop: 12 }}><TextArea label="Comentario" value={comment} onChange={setComment} required={motivo === 'CORRECCION'} /></div>{message && <p style={{ color: message.startsWith('Ajuste') ? C.ink : C.danger }}>{message}</p>}<Button onClick={submit}>Registrar ajuste</Button>
  </Box>
}

function Kardex({ nodeId, sku, setError }: { nodeId: string; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [data, setData] = useState<SpringPage<Movement>>(emptyPage()), [page, setPage] = useState(0), [size, setSize] = useState(10)
  const [filters, setFilters] = useState({ tipo: '', desde: '', hasta: '' })
  const load = useCallback(async () => {
    if (!nodeId) { setData(emptyPage()); return }
    const params = new URLSearchParams({ page: String(page), size: String(size), sort: 'ocurridoEn,asc' })
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, apiValue(key, value)))
    const result = await http.get<SpringPage<Movement>>(`/nodos/${nodeId}/inventario/movimientos?${params}`)
    if (result.error) setError(result.error); else setData(result.data!)
  }, [nodeId, page, size, filters, setError])
  useEffect(() => { load() }, [load])
  return <><Box><div style={grid(4)}><Choice label="Tipo" value={filters.tipo} onChange={value => setFilters(f => ({ ...f, tipo: value }))}><option value="">Todos</option>{['CARGA_INICIAL', 'AJUSTE', 'VENTA', 'ANULACION_VENTA', 'REPOSICION', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA'].map(x => <option key={x}>{x}</option>)}</Choice><Field label="Desde" type="datetime-local" value={filters.desde} onChange={value => setFilters(f => ({ ...f, desde: value }))} /><Field label="Hasta" type="datetime-local" value={filters.hasta} onChange={value => setFilters(f => ({ ...f, hasta: value }))} /><Button onClick={() => { setPage(0); load() }}>Filtrar</Button></div></Box>
    <DataTable columns={['Fecha', 'Tipo', 'SKU', 'Cantidad', 'Motivo', 'Comentario', 'Forzado', 'Usuario']} rows={data.content.map(item => <tr key={item.id}><Cell mono>{date(item.ocurridoEn)}</Cell><Cell>{item.tipo}</Cell><Cell mono>{sku(item.varianteId)}</Cell><Cell>{item.cantidad}</Cell><Cell>{item.motivo ?? '—'}</Cell><Cell>{item.comentario ?? '—'}</Cell><Cell><Badge>{item.forzado ? 'SÍ' : 'NO'}</Badge></Cell><Cell>{item.usuarioId ? 'Usuario' : '—'}</Cell></tr>)} /><Pager data={data} setPage={setPage} setSize={value => { setPage(0); setSize(value) }} /></>
}

interface SaleLine { id: string; varianteId: string; cantidad: number; precioUnitario: number; canal: string; forzada: boolean; estado: 'REGISTRADA' | 'ANULADA'; anuladaPor: string | null; anuladaEn: string | null; motivoAnulacion: string | null }
interface Sale { transaccionId: string; tiendaId: string; vendedorId: string; fecha: string; total: number; lineas: SaleLine[] }
interface RequestMissed { id: string; tiendaId: string; varianteId: string; cantidad: number; stockSistema: number | null; registradaEn: string; registradoPor: string; claveIdempotencia: string; estado: 'ACTIVA' | 'ANULADA'; motivoAnulacion: string | null }
interface BreakWindow { id: string; tiendaId: string; varianteId: string; fechaInicio: string; fechaFin: string | null; motivoCierre: string | null; estado: 'ABIERTA' | 'CERRADA' }

export function SalesView() {
  const [tab, setTab] = useState('cart'), [error, setError] = useState<ErrorState>(null)
  const catalogs = useCatalog(loadVariantCatalog, setError)
  const stores = useCatalog(loadTiendas, setError)
  const sku = useSku(catalogs)
  const [storeId, setStoreId] = useState(''), [store, setStore] = useState<TiendaConNodosResponse | null>(null)
  const chooseStore = async (id: string) => {
    setStoreId(id); setStore(null)
    if (!id) return
    try { setStore(await loadStoreDetail(id)) } catch (caught) { setError(caught as ErrorState) }
  }
  return <Page title="Punto de venta" tabs={[{ id: 'cart', label: 'Carrito' }, { id: 'history', label: 'Historial' }, { id: 'missed', label: 'Solicitudes no satisfechas' }, { id: 'breaks', label: 'Ventanas de quiebre' }]} active={tab} onTab={setTab} error={error} closeError={() => setError(null)}>
    <Box title="Contexto de tienda"><div style={grid(2)}><StoreChoice stores={stores} value={storeId} onChange={chooseStore} /><div style={{ alignSelf: 'end', color: C.muted, fontSize: 12 }}>{store ? 'Nodos Almacén y Bodega disponibles para la operación' : 'Selecciona una tienda para cargar sus nodos'}</div></div></Box>
    {tab === 'cart' && <Cart store={store} catalogs={catalogs} sku={sku} setError={setError} />}
    {tab === 'history' && <SalesHistory stores={stores} catalogs={catalogs} sku={sku} setError={setError} />}
    {tab === 'missed' && <MissedRequests stores={stores} catalogs={catalogs} sku={sku} setError={setError} />}
    {tab === 'breaks' && <BreakWindows stores={stores} catalogs={catalogs} sku={sku} setError={setError} />}
  </Page>
}

function Cart({ store, catalogs, sku, setError }: { store: TiendaConNodosResponse | null; catalogs: Loaded<Catalogs>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [transactionId, setTransactionId] = useState(uuid), [force, setForce] = useState(false)
  const [items, setItems] = useState([{ sku: '', cantidad: '1', precioUnitario: '' }]), [result, setResult] = useState<Sale | null>(null), [message, setMessage] = useState('')
  const [stock, setStock] = useState<NodeStock[]>([])
  useEffect(() => {
    setItems([{ sku: '', cantidad: '1', precioUnitario: '' }])
    if (!store) { setStock([]); return }
    loadNodeStock(store.almacenId).then(setStock).catch(setError)
  }, [store, setError])
  const stockByVariant = useMemo(() => new Map(stock.map(row => [row.varianteId, row.aLaMano])), [stock])
  const allowedIds = useMemo(() => new Set(stock.map(row => row.varianteId)), [stock])
  const update = (index: number, key: string, value: string) => setItems(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item))
  const chooseVariant = (index: number, value: string) => {
    const variant = catalogs?.variantesBySku.get(value)
    const price = variant ? catalogs?.templatesById.get(variant.templateId)?.precioBase : null
    setItems(current => current.map((item, i) => i === index ? { ...item, sku: value, precioUnitario: price != null ? price.toFixed(2) : item.precioUnitario } : item))
  }
  const short = (item: { sku: string; cantidad: string }) => {
    const id = catalogs?.variantesBySku.get(item.sku)?.id
    return !!id && Number(item.cantidad) > (stockByVariant.get(id) ?? 0)
  }
  const submit = async () => {
    setMessage('')
    if (!store || items.some(item => !item.sku.trim() || Number(item.cantidad) <= 0 || !Number.isInteger(Number(item.cantidad)) || Number(item.precioUnitario) < 0 || !item.precioUnitario || !/^\d+(?:\.\d{1,2})?$/.test(item.precioUnitario))) { setMessage('Selecciona una tienda y completa las variantes, cantidades y precios con un máximo de dos decimales.'); return }
    const response = await http.post<Sale>('/ventas', { transaccionId: transactionId, tiendaId: store.id, canal: 'FISICO', forzarSinStock: force, items: items.map(item => ({ sku: item.sku.trim(), cantidad: Number(item.cantidad), precioUnitario: Number(Number(item.precioUnitario).toFixed(2)) })) })
    if (response.error) { setError(response.error); return }
    invalidateNodeStock(store.almacenId)
    loadNodeStock(store.almacenId).then(setStock).catch(setError)
    setResult(response.data!); setItems([{ sku: '', cantidad: '1', precioUnitario: '' }]); setForce(false); setTransactionId(uuid())
  }
  return <><Box title="Venta"><div style={grid(2)}><Field label="Transacción actual" value={transactionId} onChange={() => undefined} readOnly /></div>
    {store && <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Nodo de venta: Almacén seleccionado</div>}
    {items.map((item, index) => <div key={index} style={{ ...grid(4), alignItems: 'end', marginTop: 12 }}><VariantChoice by="sku" value={item.sku} onChange={value => chooseVariant(index, value)} catalogs={catalogs} allowedIds={allowedIds} stockByVariant={stockByVariant} emptyMessage="El Almacén de esta tienda aún no tiene variantes cargadas" /><div><Field label="Cantidad" type="number" value={item.cantidad} onChange={value => update(index, 'cantidad', value)} required />{short(item) && <div style={{ color: C.danger, fontSize: 12, marginTop: 5 }}>Sin stock suficiente</div>}</div><Field label="Precio unitario" type="number" value={item.precioUnitario} onChange={value => update(index, 'precioUnitario', value)} required /><Button kind="danger" disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Quitar</Button></div>)}
    <label style={{ display: 'block', margin: '15px 0', fontSize: 13 }}><input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)} /> Forzar sin stock</label>
    {message && <p style={{ color: C.danger }}>{message}</p>}<div style={{ display: 'flex', gap: 8 }}><Button kind="ghost" disabled={items.length >= 200} onClick={() => setItems(current => [...current, { sku: '', cantidad: '1', precioUnitario: '' }])}>Añadir línea</Button><Button onClick={submit}>Registrar venta</Button></div>
  </Box>
  {result && <Box title={`Venta registrada · Total ${result.total.toFixed(2)}`}><DataTable columns={['SKU', 'Cantidad', 'Precio unitario', 'Estado']} rows={result.lineas.map(line => <tr key={line.id}><Cell mono>{sku(line.varianteId)}</Cell><Cell>{line.cantidad}</Cell><Cell>{line.precioUnitario.toFixed(2)}</Cell><Cell><Badge dark={line.estado === 'REGISTRADA'}>{line.estado}</Badge></Cell></tr>)} /></Box>}</>
}

function SalesHistory({ stores, catalogs, sku, setError }: { stores: Loaded<TiendaResponse[]>; catalogs: Loaded<Catalogs>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [data, setData] = useState<SpringPage<Sale>>(emptyPage()), [page, setPage] = useState(0), [size, setSize] = useState(10)
  const [filters, setFilters] = useState({ tiendaId: '', varianteId: '', transaccionId: '', estado: '', desde: '', hasta: '' })
  const [cancel, setCancel] = useState<{ type: 'line' | 'transaction'; id: string } | null>(null), [reason, setReason] = useState('')
  const load = useCallback(async () => { const params = new URLSearchParams({ page: String(page), size: String(size), sort: 'timestampVenta,desc' }); Object.entries(filters).forEach(([key, value]) => value && params.set(key, apiValue(key, value))); const response = await http.get<SpringPage<Sale>>(`/ventas?${params}`); if (response.error) setError(response.error); else setData(response.data!) }, [page, size, filters, setError])
  useEffect(() => { load() }, [load])
  const annul = async () => {
    if (!cancel || !reason.trim()) return
    const path = cancel.type === 'line' ? `/ventas/${cancel.id}/anular` : `/ventas/transacciones/${cancel.id}/anular`
    const response = await http.post<Sale>(path, { motivo: reason.trim() })
    if (response.error) setError(response.error); else { invalidateNodeStock(); setCancel(null); setReason(''); load() }
  }
  return <><Box><div style={grid(3)}><StoreChoice stores={stores} value={filters.tiendaId} onChange={value => setFilters(f => ({ ...f, tiendaId: value }))} empty="Todas" required={false} /><VariantChoice label="Variante" value={filters.varianteId} onChange={value => setFilters(f => ({ ...f, varianteId: value }))} catalogs={catalogs} /><Field label="Transacción" value={filters.transaccionId} onChange={value => setFilters(f => ({ ...f, transaccionId: value }))} /><Choice label="Estado" value={filters.estado} onChange={value => setFilters(f => ({ ...f, estado: value }))}><option value="">Todos</option><option>REGISTRADA</option><option>ANULADA</option></Choice><Field label="Desde" type="datetime-local" value={filters.desde} onChange={value => setFilters(f => ({ ...f, desde: value }))} /><Field label="Hasta" type="datetime-local" value={filters.hasta} onChange={value => setFilters(f => ({ ...f, hasta: value }))} /></div></Box>
    <DataTable columns={['Fecha', 'SKU', 'Cantidad', 'Precio', 'Estado', 'Acciones']} rows={data.content.flatMap(sale => sale.lineas.map(line => <tr key={line.id}><Cell mono>{date(sale.fecha)}</Cell><Cell mono>{sku(line.varianteId)}</Cell><Cell>{line.cantidad}</Cell><Cell>{line.precioUnitario.toFixed(2)}</Cell><Cell><Badge dark={line.estado === 'REGISTRADA'}>{line.estado}</Badge></Cell><Cell><div style={{ display: 'flex', gap: 5 }}><Button kind="danger" disabled={line.estado === 'ANULADA'} onClick={() => setCancel({ type: 'line', id: line.id })}>Anular línea</Button><Button kind="danger" disabled={line.estado === 'ANULADA'} onClick={() => setCancel({ type: 'transaction', id: sale.transaccionId })}>Anular transacción</Button></div></Cell></tr>))} /><Pager data={data} setPage={setPage} setSize={value => { setPage(0); setSize(value) }} />
    {cancel && <Dialog title="Motivo de anulación" close={() => setCancel(null)}><TextArea label="Motivo" value={reason} onChange={setReason} required /><div style={{ marginTop: 12 }}><Button onClick={annul} disabled={!reason.trim()}>Confirmar anulación</Button></div></Dialog>}</>
}

function Dialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 300, display: 'grid', placeItems: 'center' }}><div style={{ width: 460, maxWidth: '90vw', background: C.canvas, border: `1px solid ${C.rule}`, padding: 24 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}><strong>{title}</strong><button onClick={close} style={{ border: 0, background: 'none' }}>Cerrar</button></div>{children}</div></div>
}

function MissedRequests({ stores, catalogs, sku, setError }: { stores: Loaded<TiendaResponse[]>; catalogs: Loaded<Catalogs>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [form, setForm] = useState({ tiendaId: '', varianteId: '', cantidad: '1', claveIdempotencia: uuid() })
  const [data, setData] = useState<SpringPage<RequestMissed>>(emptyPage()), [page, setPage] = useState(0), [size, setSize] = useState(10)
  const [filters, setFilters] = useState({ tiendaId: '', varianteId: '', estado: '', desde: '', hasta: '' }), [cancelId, setCancelId] = useState(''), [reason, setReason] = useState('')
  const load = useCallback(async () => { const params = new URLSearchParams({ page: String(page), size: String(size) }); Object.entries(filters).forEach(([k, v]) => v && params.set(k, apiValue(k, v))); const result = await http.get<SpringPage<RequestMissed>>(`/solicitudes-no-satisfechas?${params}`); result.error ? setError(result.error) : setData(result.data!) }, [page, size, filters, setError])
  useEffect(() => { load() }, [load])
  const create = async () => {
    if (!form.tiendaId || !form.varianteId || !Number.isInteger(Number(form.cantidad)) || Number(form.cantidad) <= 0) return
    const result = await http.post<RequestMissed>('/solicitudes-no-satisfechas', { ...form, cantidad: Number(form.cantidad) })
    if (result.error) setError(result.error); else { setForm({ tiendaId: '', varianteId: '', cantidad: '1', claveIdempotencia: uuid() }); load() }
  }
  const annul = async () => { if (!reason.trim()) return; const result = await http.post<RequestMissed>(`/solicitudes-no-satisfechas/${cancelId}/anular`, { motivo: reason }); if (result.error) setError(result.error); else { setCancelId(''); setReason(''); load() } }
  return <><Box title="Registrar solicitud"><div style={grid(4)}><StoreChoice stores={stores} value={form.tiendaId} onChange={value => setForm(f => ({ ...f, tiendaId: value }))} /><VariantChoice value={form.varianteId} onChange={value => setForm(f => ({ ...f, varianteId: value }))} catalogs={catalogs} /><Field label="Cantidad" type="number" value={form.cantidad} onChange={value => setForm(f => ({ ...f, cantidad: value }))} /><Button onClick={create}>Registrar</Button></div><div style={{ marginTop: 12 }}><Field label="Clave de idempotencia" value={form.claveIdempotencia} onChange={() => undefined} maxLength={100} readOnly /></div></Box>
    <Box title="Filtros"><div style={grid(3)}><StoreChoice stores={stores} value={filters.tiendaId} onChange={value => setFilters(f => ({ ...f, tiendaId: value }))} empty="Todas" required={false} /><VariantChoice value={filters.varianteId} onChange={value => setFilters(f => ({ ...f, varianteId: value }))} catalogs={catalogs} /><Choice label="Estado" value={filters.estado} onChange={value => setFilters(f => ({ ...f, estado: value }))}><option value="">Todos</option><option>ACTIVA</option><option>ANULADA</option></Choice><Field label="Desde" type="datetime-local" value={filters.desde} onChange={value => setFilters(f => ({ ...f, desde: value }))} /><Field label="Hasta" type="datetime-local" value={filters.hasta} onChange={value => setFilters(f => ({ ...f, hasta: value }))} /></div></Box>
    <DataTable columns={['Fecha', 'SKU', 'Cantidad', 'Stock sistema', 'Estado', 'Acciones']} rows={data.content.map(item => <tr key={item.id}><Cell mono>{date(item.registradaEn)}</Cell><Cell mono>{sku(item.varianteId)}</Cell><Cell>{item.cantidad}</Cell><Cell>{item.stockSistema ?? '—'}</Cell><Cell><Badge dark={item.estado === 'ACTIVA'}>{item.estado}</Badge></Cell><Cell><Button kind="danger" disabled={item.estado === 'ANULADA'} onClick={() => setCancelId(item.id)}>Anular</Button></Cell></tr>)} /><Pager data={data} setPage={setPage} setSize={value => { setPage(0); setSize(value) }} />
    {cancelId && <Dialog title="Anular solicitud" close={() => setCancelId('')}><TextArea label="Motivo" value={reason} onChange={setReason} required /><Button onClick={annul}>Confirmar</Button></Dialog>}</>
}

function BreakWindows({ stores, catalogs, sku, setError }: { stores: Loaded<TiendaResponse[]>; catalogs: Loaded<Catalogs>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [data, setData] = useState<SpringPage<BreakWindow>>(emptyPage()), [page, setPage] = useState(0), [size, setSize] = useState(10)
  const [filters, setFilters] = useState({ tiendaId: '', varianteId: '', abierta: '', desde: '', hasta: '' }), [show, setShow] = useState(false), [reconcile, setReconcile] = useState({ tiendaId: '', varianteId: '', desde: '', hasta: '' }), [summary, setSummary] = useState('')
  const load = useCallback(async () => { const params = new URLSearchParams({ page: String(page), size: String(size) }); Object.entries(filters).forEach(([k, v]) => v && params.set(k, apiValue(k, v))); const result = await http.get<SpringPage<BreakWindow>>(`/ventanas-quiebre?${params}`); result.error ? setError(result.error) : setData(result.data!) }, [page, size, filters, setError])
  useEffect(() => { load() }, [load])
  const run = async () => { if (!reconcile.tiendaId) return; const body = Object.fromEntries(Object.entries(reconcile).filter(([, value]) => value).map(([key, value]) => [key, apiValue(key, value)])); const result = await http.post<{ paresProcesados: number; creadas: number; cerradas: number; corregidas: number; sinCambios: number; sinRespaldoEnKardex: number }>('/ventanas-quiebre/reconciliar', body); if (result.error) setError(result.error); else { const x = result.data!; setSummary(`Procesados ${x.paresProcesados} · Creadas ${x.creadas} · Cerradas ${x.cerradas} · Corregidas ${x.corregidas} · Sin cambios ${x.sinCambios} · Sin respaldo ${x.sinRespaldoEnKardex}`); setShow(false); load() } }
  return <><Box><div style={grid(3)}><StoreChoice stores={stores} value={filters.tiendaId} onChange={value => setFilters(f => ({ ...f, tiendaId: value }))} empty="Todas" required={false} /><VariantChoice value={filters.varianteId} onChange={value => setFilters(f => ({ ...f, varianteId: value }))} catalogs={catalogs} /><Choice label="Abierta" value={filters.abierta} onChange={value => setFilters(f => ({ ...f, abierta: value }))}><option value="">Todas</option><option value="true">Sí</option><option value="false">No</option></Choice><Field label="Desde" type="datetime-local" value={filters.desde} onChange={value => setFilters(f => ({ ...f, desde: value }))} /><Field label="Hasta" type="datetime-local" value={filters.hasta} onChange={value => setFilters(f => ({ ...f, hasta: value }))} /><Button onClick={() => setShow(true)}>Reconciliar</Button></div>{summary && <p>{summary}</p>}</Box>
    <DataTable columns={['SKU', 'Inicio', 'Fin', 'Estado', 'Motivo de cierre']} rows={data.content.map(item => <tr key={item.id}><Cell mono>{sku(item.varianteId)}</Cell><Cell mono>{date(item.fechaInicio)}</Cell><Cell>{item.fechaFin ? date(item.fechaFin) : '—'}</Cell><Cell><Badge dark={item.estado === 'ABIERTA'}>{item.estado}</Badge></Cell><Cell>{item.motivoCierre ?? '—'}</Cell></tr>)} /><Pager data={data} setPage={setPage} setSize={value => { setPage(0); setSize(value) }} />
    {show && <Dialog title="Reconciliar ventanas" close={() => setShow(false)}><div style={grid(2)}><StoreChoice stores={stores} value={reconcile.tiendaId} onChange={value => setReconcile(f => ({ ...f, tiendaId: value }))} /><VariantChoice value={reconcile.varianteId} onChange={value => setReconcile(f => ({ ...f, varianteId: value }))} catalogs={catalogs} /><Field label="Desde" type="datetime-local" value={reconcile.desde} onChange={value => setReconcile(f => ({ ...f, desde: value }))} /><Field label="Hasta" type="datetime-local" value={reconcile.hasta} onChange={value => setReconcile(f => ({ ...f, hasta: value }))} /></div><div style={{ marginTop: 14 }}><Button onClick={run}>Reconciliar</Button></div></Dialog>}</>
}

interface Threshold { id: string; varianteId: string | null; categoriaId: string | null; cantidadMinima: number; cantidadObjetivo: number }
interface Transfer { id: string; varianteId: string; tiendaId: string; cantidad: number; origen: 'AUTOMATICO' | 'MANUAL'; registradoPor: string | null; timestampTraspaso: string }

export function ReplenishmentView() {
  const [tab, setTab] = useState('thresholds'), [error, setError] = useState<ErrorState>(null)
  const catalogs = useCatalog(loadVariantCatalog, setError)
  const stores = useCatalog(loadTiendas, setError)
  const sku = useSku(catalogs)
  return <Page title="Reposición interna" tabs={[{ id: 'thresholds', label: 'Umbrales' }, { id: 'evaluation', label: 'Evaluación' }, { id: 'transfers', label: 'Traspasos' }]} active={tab} onTab={setTab} error={error} closeError={() => setError(null)}>
    {tab === 'thresholds' && <Thresholds catalogs={catalogs} sku={sku} setError={setError} />}
    {tab === 'evaluation' && <Evaluation stores={stores} sku={sku} setError={setError} />}
    {tab === 'transfers' && <Transfers stores={stores} catalogs={catalogs} sku={sku} setError={setError} />}
  </Page>
}

function Thresholds({ catalogs, sku, setError }: { catalogs: Loaded<Catalogs>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const categories = useCatalog<CategoriaResponse[]>(loadCategorias, setError)
  const [data, setData] = useState<SpringPage<Threshold>>(emptyPage()), [page, setPage] = useState(0), [size, setSize] = useState(10)
  const [form, setForm] = useState({ mode: 'variant', target: '', min: '1', goal: '2' }), [edit, setEdit] = useState<Threshold | null>(null), [message, setMessage] = useState('')
  const load = useCallback(async () => { const result = await http.get<SpringPage<Threshold>>(`/umbrales-reposicion?page=${page}&size=${size}`); result.error ? setError(result.error) : setData(result.data!) }, [page, size, setError])
  useEffect(() => { load() }, [load])
  const save = async () => {
    const min = Number(form.min), goal = Number(form.goal); setMessage('')
    if (!Number.isInteger(min) || !Number.isInteger(goal) || min <= 0 || goal <= min || (!edit && !form.target)) { setMessage('La cantidad mínima debe ser mayor que cero y la objetivo debe ser mayor que la mínima.'); return }
    const body = edit ? { cantidadMinima: min, cantidadObjetivo: goal } : { varianteId: form.mode === 'variant' ? form.target : null, categoriaId: form.mode === 'category' ? form.target : null, cantidadMinima: min, cantidadObjetivo: goal }
    const result = edit ? await http.put<Threshold>(`/umbrales-reposicion/${edit.id}`, body) : await http.post<Threshold>('/umbrales-reposicion', body)
    if (result.error) setError(result.error); else { setEdit(null); setForm({ mode: 'variant', target: '', min: '1', goal: '2' }); load() }
  }
  const remove = async (id: string) => { const result = await http.delete(`/umbrales-reposicion/${id}`); result.error ? setError(result.error) : load() }
  const targetName = (item: Threshold) => item.varianteId ? sku(item.varianteId) : categories?.find(c => c.id === item.categoriaId)?.nombre ?? (categories ? 'Categoría no disponible' : item.categoriaId)
  const categoryChoice = categories
    ? <Choice label="Categoría" value={form.target} onChange={value => setForm(f => ({ ...f, target: value }))}><option value="">— Seleccionar categoría —</option>{categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Choice>
    : <IdField label="Categoría (ID)" value={form.target} onChange={value => setForm(f => ({ ...f, target: value }))} readOnly={categories === undefined} placeholder={categories === undefined ? 'Cargando categorías…' : 'Sin acceso a las categorías: pega el ID'} />
  return <><Box title={edit ? 'Editar cantidades' : 'Nuevo umbral'}>{!edit && <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}><label><input type="radio" checked={form.mode === 'variant'} onChange={() => setForm(f => ({ ...f, mode: 'variant', target: '' }))} /> Por variante</label><label><input type="radio" checked={form.mode === 'category'} onChange={() => setForm(f => ({ ...f, mode: 'category', target: '' }))} /> Por categoría</label></div>}
    <div style={grid(edit ? 2 : 3)}>{!edit && (form.mode === 'variant' ? <VariantChoice value={form.target} onChange={value => setForm(f => ({ ...f, target: value }))} catalogs={catalogs} /> : categoryChoice)}<Field label="Cantidad mínima" type="number" value={form.min} onChange={value => setForm(f => ({ ...f, min: value }))} /><Field label="Cantidad objetivo" type="number" value={form.goal} onChange={value => setForm(f => ({ ...f, goal: value }))} /></div>
    {message && <p style={{ color: C.danger }}>{message}</p>}<div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Button onClick={save}>{edit ? 'Guardar' : 'Crear umbral'}</Button>{edit && <Button kind="ghost" onClick={() => { setEdit(null); setForm({ mode: 'variant', target: '', min: '1', goal: '2' }) }}>Cancelar</Button>}</div></Box>
    <DataTable columns={['Tipo', 'Variante o categoría', 'Mínima', 'Objetivo', 'Acciones']} rows={data.content.map(item => <tr key={item.id}><Cell>{item.varianteId ? 'Variante' : 'Categoría'}</Cell><Cell>{targetName(item)}</Cell><Cell>{item.cantidadMinima}</Cell><Cell>{item.cantidadObjetivo}</Cell><Cell><div style={{ display: 'flex', gap: 6 }}><Button kind="ghost" onClick={() => { setEdit(item); setForm({ mode: item.varianteId ? 'variant' : 'category', target: '', min: String(item.cantidadMinima), goal: String(item.cantidadObjetivo) }) }}>Editar</Button><Button kind="danger" onClick={() => remove(item.id)}>Eliminar</Button></div></Cell></tr>)} /><Pager data={data} setPage={setPage} setSize={value => { setPage(0); setSize(value) }} /></>
}

function Evaluation({ stores, sku, setError }: { stores: Loaded<TiendaResponse[]>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [storeId, setStoreId] = useState(''), [result, setResult] = useState<{ traspasoEjecutados: number; traspasos: Transfer[] } | null>(null)
  const run = async (all: boolean) => { const response = await http.post<{ traspasoEjecutados: number; traspasos: Transfer[] }>(all ? '/reposicion-interna/evaluar' : `/reposicion-interna/tiendas/${storeId}/evaluar`); if (response.error) setError(response.error); else { invalidateNodeStock(); setResult(response.data!) } }
  return <><Box title="Evaluar reposición"><div style={{ ...grid(3), alignItems: 'end' }}><StoreChoice stores={stores} value={storeId} onChange={setStoreId} /><Button kind="ghost" onClick={() => run(true)}>Evaluar todas las tiendas</Button><Button onClick={() => run(false)} disabled={!storeId}>Evaluar esta tienda</Button></div></Box>
    {result && <Box title={`${result.traspasoEjecutados} traspasos ejecutados`}><DataTable columns={['Variante', 'Cantidad', 'Origen']} rows={result.traspasos.map(item => <tr key={item.id}><Cell mono>{sku(item.varianteId)}</Cell><Cell>{item.cantidad}</Cell><Cell><Badge dark={item.origen === 'AUTOMATICO'}>{item.origen}</Badge></Cell></tr>)} /></Box>}</>
}

function Transfers({ stores, catalogs, sku, setError }: { stores: Loaded<TiendaResponse[]>; catalogs: Loaded<Catalogs>; sku: (id: string) => string; setError: (error: ErrorState) => void }) {
  const [storeId, setStoreId] = useState(''), [rows, setRows] = useState<Transfer[]>([]), [variantId, setVariantId] = useState(''), [quantity, setQuantity] = useState('1')
  const [store, setStore] = useState<TiendaConNodosResponse | null>(null), [stock, setStock] = useState<NodeStock[]>([])
  const load = useCallback(async () => { if (!storeId) { setRows([]); return }; const result = await http.get<Transfer[]>(`/tiendas/${storeId}/traspasos-internos`); result.error ? setError(result.error) : setRows(result.data!) }, [storeId, setError])
  useEffect(() => { load() }, [load])
  const chooseStore = async (id: string) => {
    setStoreId(id); setStore(null); setStock([]); setVariantId('')
    if (!id) return
    try {
      const detail = await loadStoreDetail(id)
      setStore(detail)
      setStock(await loadNodeStock(detail.bodegaId))
    } catch (caught) { setError(caught as ErrorState) }
  }
  const stockByVariant = useMemo(() => new Map(stock.map(row => [row.varianteId, row.aLaMano])), [stock])
  const allowedIds = useMemo(() => new Set(stock.map(row => row.varianteId)), [stock])
  const create = async () => {
    const number = Number(quantity)
    if (!storeId || !variantId || !Number.isInteger(number) || number < 1) return
    const result = await http.post<Transfer>(`/tiendas/${storeId}/traspasos-internos`, { varianteId: variantId, cantidad: number })
    if (result.error) { setError(result.error); return }
    // El traspaso mueve stock de la Bodega al Almacén
    if (store) { invalidateNodeStock(store.bodegaId); invalidateNodeStock(store.almacenId); loadNodeStock(store.bodegaId).then(setStock).catch(setError) }
    setVariantId(''); setQuantity('1'); load()
  }
  return <><Box title="Traspaso manual"><div style={{ ...grid(4), alignItems: 'end' }}><StoreChoice stores={stores} value={storeId} onChange={chooseStore} /><div><VariantChoice value={variantId} onChange={setVariantId} catalogs={catalogs} allowedIds={allowedIds} stockByVariant={stockByVariant} emptyMessage="La Bodega de esta tienda aún no tiene variantes cargadas" />{variantId && (stockByVariant.get(variantId) ?? 0) === 0 && <div style={{ color: C.danger, fontSize: 12, marginTop: 5 }}>Sin stock en la bodega</div>}</div><Field label="Cantidad" type="number" value={quantity} onChange={setQuantity} /><Button onClick={create}>Registrar traspaso</Button></div></Box>
    <DataTable columns={['Fecha', 'Variante', 'Cantidad', 'Origen', 'Registrado por']} rows={rows.map(item => <tr key={item.id}><Cell mono>{date(item.timestampTraspaso)}</Cell><Cell mono>{sku(item.varianteId)}</Cell><Cell>{item.cantidad}</Cell><Cell><Badge dark={item.origen === 'AUTOMATICO'}>{item.origen}</Badge></Cell><Cell>{item.registradoPor === null ? 'Sistema' : 'Usuario'}</Cell></tr>)} empty={storeId ? 'Sin traspasos' : 'Selecciona una tienda'} /></>
}
