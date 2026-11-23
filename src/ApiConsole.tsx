// Consola API: barra inferior colapsable en mono. Muestra la última llamada y, al expandir,
// el historial con request y response. Se alimenta de apiLog (api.ts), que ya viene sin secretos.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { apiConfig, apiLog, statusText, type ApiCall } from './api'
import { T, TONE, useBaseUrl } from './ui'

const statusColor = (status: number) => status === 0 ? T.danger : status < 300 ? TONE.green : status === 401 || status === 422 ? TONE.amber : status === 409 ? TONE.violet : status === 404 || status === 405 ? T.muted : T.danger

const line = (c: ApiCall) => `${c.metodo} ${c.ruta} → ${statusText(c.status)} · ${c.ms} ms`

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span style={{ color: T.faint }}>(sin cuerpo)</span>
  return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, lineHeight: 1.5, color: T.ink }}>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>
}

function Entry({ call, open, onToggle }: { call: ApiCall; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${T.rule}` }}>
      <button onClick={onToggle} style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'baseline', background: open ? T.surface : 'transparent', border: 'none', padding: '6px 24px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'left', color: T.ink }}>
        <span style={{ color: T.faint, width: 62, flexShrink: 0 }}>{new Date(call.en).toLocaleTimeString('es-ES', { hour12: false })}</span>
        <span style={{ color: statusColor(call.status), width: 10 }}>●</span>
        <span style={{ flex: 1, wordBreak: 'break-all' }}>{line(call)}</span>
        {call.simulado && <span style={{ color: TONE.violet }} title={call.nota}>simulado</span>}
        <span style={{ color: T.faint }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: T.rule, borderTop: `1px solid ${T.rule}` }}>
          <div style={{ background: T.canvas, padding: '10px 24px' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: T.faint, marginBottom: 6 }}>REQUEST · {call.metodo} {call.url}</div>
            <Json value={call.request} />
          </div>
          <div style={{ background: T.canvas, padding: '10px 24px' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: T.faint, marginBottom: 6 }}>RESPONSE · {statusText(call.status)}{call.nota ? ` · ${call.nota}` : ''}</div>
            <Json value={call.response} />
          </div>
        </div>
      )}
    </div>
  )
}

export function ApiConsole() {
  const calls = useSyncExternalStore(apiLog.subscribe, apiLog.calls, apiLog.calls)
  const baseUrl = useBaseUrl()
  const mock = apiConfig.isMock()
  const [expanded, setExpanded] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const last = calls[0]

  useEffect(() => { if (!expanded) setOpenId(null) }, [expanded])

  const resetSim = async () => {
    const { resetMock } = await import('./mock')
    await resetMock()
    apiLog.clear()
  }

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 150, background: T.canvas, borderTop: `1px solid ${T.rule}`, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      {expanded && (
        <div style={{ maxHeight: '45vh', overflowY: 'auto', borderBottom: `1px solid ${T.rule}` }}>
          {calls.length === 0
            ? <div style={{ padding: '18px 24px', color: T.faint }}>Todavía no hay llamadas.</div>
            : calls.map(call => <Entry key={call.id} call={call} open={openId === call.id} onToggle={() => setOpenId(openId === call.id ? null : call.id)} />)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', height: 'var(--api-console-h)', background: T.surface }}>
        <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: T.faint, padding: 0, flexShrink: 0 }}>
          {expanded ? '▾' : '▸'} CONSOLA API{calls.length ? ` (${calls.length})` : ''}
        </button>
        {mock && <span style={{ color: TONE.violet, letterSpacing: '0.08em', flexShrink: 0 }} title="Las respuestas salen de src/imports/mock-data">● MODO SIMULADO</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: last ? T.ink : T.faint, cursor: last ? 'pointer' : 'default' }} title={last?.url} onClick={() => { if (last) { setExpanded(true); setOpenId(last.id) } }}>
          {last ? <><span style={{ color: statusColor(last.status) }}>● </span>{line(last)}</> : `Sin llamadas todavía · ${baseUrl}`}
        </span>
        {expanded && mock && <button onClick={resetSim} style={consoleBtn}>Reiniciar simulación</button>}
        {expanded && calls.length > 0 && <button onClick={() => apiLog.clear()} style={consoleBtn}>Limpiar</button>}
      </div>
    </div>
  )
}

const consoleBtn: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, border: `1px solid ${T.rule}`, background: T.canvas, color: T.muted, padding: '2px 10px', cursor: 'pointer', flexShrink: 0 }
