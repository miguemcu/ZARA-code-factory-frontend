import { useMemo, useState } from 'react'
import type { Catalogs } from './catalogCache'

const color = { ink: '#111111', muted: '#666666', faint: '#999999', rule: '#E2E2E2', surface: '#F9F9F9', canvas: '#FFFFFF' }

export function VarianteSelector({
  value,
  onChange,
  catalogs,
  allowedIds,
  excludedIds,
  stockByVariant,
  label = 'Variante',
  emptyMessage = 'No hay variantes disponibles',
}: {
  value: string
  onChange: (id: string) => void
  catalogs: Catalogs
  allowedIds?: Set<string>
  excludedIds?: Set<string>
  stockByVariant?: Map<string, number>
  label?: string
  emptyMessage?: string
}) {
  const [search, setSearch] = useState('')
  const normalized = search.trim().toLocaleLowerCase('es')
  const available = useMemo(() => catalogs.variantes.filter(variant => {
    if (allowedIds && !allowedIds.has(variant.id)) return false
    if (excludedIds?.has(variant.id)) return false
    const template = catalogs.templatesById.get(variant.templateId)
    return !normalized || [variant.sku, variant.talla, variant.color, template?.nombre].some(part => part?.toLocaleLowerCase('es').includes(normalized))
  }), [allowedIds, catalogs, excludedIds, normalized])
  const excluded = useMemo(() => catalogs.variantes.filter(variant => excludedIds?.has(variant.id)), [catalogs, excludedIds])

  const optionText = (id: string) => {
    const variant = catalogs.variantesById.get(id)
    if (!variant) return 'Variante no disponible'
    const template = catalogs.templatesById.get(variant.templateId)
    const stock = stockByVariant?.get(id)
    return [variant.sku, template?.nombre ?? 'Template no disponible', variant.talla ?? '—', variant.color ?? '—', stock !== undefined ? `a la mano: ${stock}` : null].filter(Boolean).join(' · ')
  }

  return <div>
    <span style={{ display: 'block', color: color.muted, fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</span>
    <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por SKU, talla, color o template" aria-label={`Buscar ${label.toLocaleLowerCase('es')}`} style={{ border: `1px solid ${color.rule}`, borderRadius: 0, background: color.canvas, color: color.ink, padding: '9px 10px', width: '100%', font: '13px var(--font-sans)', marginBottom: 6 }} />
    <select value={value} onChange={event => onChange(event.target.value)} style={{ border: `1px solid ${color.rule}`, borderRadius: 0, background: color.canvas, color: color.ink, padding: '9px 10px', width: '100%', font: '13px var(--font-sans)' }}>
      <option value="">— Seleccionar variante —</option>
      {available.map(variant => <option key={variant.id} value={variant.id}>{optionText(variant.id)}</option>)}
      {excluded.map(variant => <option key={variant.id} value={variant.id} disabled>{optionText(variant.id)} · ya cargada</option>)}
    </select>
    {available.length === 0 && <div style={{ border: `1px solid ${color.rule}`, borderTop: 0, background: color.surface, color: color.faint, padding: '8px 10px', fontSize: 12 }}>{emptyMessage}</div>}
  </div>
}
