import {
  http,
  type CategoriaResponse,
  type SpringPage,
  type TemplateResponse,
  type TiendaConNodosResponse,
  type TiendaResponse,
  type VarianteResponse,
} from './api'

export interface NodeStock {
  nodoId: string
  varianteId: string
  aLaMano: number
  disponibleParaUso: number
  entrante: number
  saliente: number
  pronosticado: number
}

// Lo que necesita el selector de variantes: las variantes y, si hay acceso, sus templates
export interface Catalogs {
  variantes: VarianteResponse[]
  variantesById: Map<string, VarianteResponse>
  variantesBySku: Map<string, VarianteResponse>
  templatesById: Map<string, TemplateResponse>
}

async function loadAllPages<T>(path: string): Promise<T[]> {
  const content: T[] = []
  let page = 0
  let totalPages = 1
  do {
    const separator = path.includes('?') ? '&' : '?'
    const result = await http.get<SpringPage<T>>(`${path}${separator}page=${page}&size=200`)
    if (result.error) throw result.error
    content.push(...result.data!.content)
    totalPages = result.data!.totalPages
    page += 1
  } while (page < totalPages)
  return content
}

// Cada listado se pide una sola vez y por separado: si el usuario no tiene acceso a uno,
// los demás siguen funcionando. Un fallo no queda guardado.
function cachedList<T extends { id: string }>(path: string) {
  let promise: Promise<T[]> | null = null
  const keep = (next: Promise<T[]>) => {
    promise = next.catch(error => {
      promise = null
      throw error
    })
    return promise
  }
  // Solo se actualiza lo que ya se cargó; si nunca se pidió, la próxima carga lo trae fresco
  const update = (change: (items: T[]) => T[]) => { if (promise) keep(promise.then(change)) }
  return {
    load: () => promise ?? keep(loadAllPages<T>(path)),
    upsert: (item: T) => update(items => [...items.filter(current => current.id !== item.id), item]),
    remove: (id: string) => update(items => items.filter(current => current.id !== id)),
    reset: () => { promise = null },
  }
}

export const variantesCache = cachedList<VarianteResponse>('/variantes')
export const templatesCache = cachedList<TemplateResponse>('/templates')
export const categoriasCache = cachedList<CategoriaResponse>('/categorias')
export const tiendasCache = cachedList<TiendaResponse>('/tiendas')

export const loadTiendas = () => tiendasCache.load()
export const loadCategorias = () => categoriasCache.load()

export async function loadVariantCatalog(): Promise<Catalogs> {
  const [variantes, templates] = await Promise.all([
    variantesCache.load(),
    // Sin templates el selector sigue funcionando, solo pierde el nombre y el precio base
    templatesCache.load().catch(() => [] as TemplateResponse[]),
  ])
  return {
    variantes,
    variantesById: new Map(variantes.map(item => [item.id, item])),
    variantesBySku: new Map(variantes.map(item => [item.sku, item])),
    templatesById: new Map(templates.map(item => [item.id, item])),
  }
}

const storeDetails = new Map<string, Promise<TiendaConNodosResponse>>()

export function loadStoreDetail(id: string): Promise<TiendaConNodosResponse> {
  let request = storeDetails.get(id)
  if (!request) {
    request = http.get<TiendaConNodosResponse>(`/tiendas/${id}`).then(result => {
      if (result.error) throw result.error
      return result.data!
    }).catch(error => {
      storeDetails.delete(id)
      throw error
    })
    storeDetails.set(id, request)
  }
  return request
}

const nodeStocks = new Map<string, Promise<NodeStock[]>>()

export function loadNodeStock(nodeId: string): Promise<NodeStock[]> {
  let request = nodeStocks.get(nodeId)
  if (!request) {
    request = loadAllPages<NodeStock>(`/nodos/${nodeId}/inventario`).catch(error => {
      nodeStocks.delete(nodeId)
      throw error
    })
    nodeStocks.set(nodeId, request)
  }
  return request
}

// Sin nodo invalida todo: anulaciones y evaluaciones mueven stock de nodos que la vista no conoce
export function invalidateNodeStock(nodeId?: string) {
  if (nodeId) nodeStocks.delete(nodeId)
  else nodeStocks.clear()
}

// Al cerrar sesión: otro usuario puede tener otro alcance
export function resetCaches() {
  [variantesCache, templatesCache, categoriasCache, tiendasCache].forEach(cache => cache.reset())
  storeDetails.clear()
  nodeStocks.clear()
}
