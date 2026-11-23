// Selector de rol de la demo: antes del login, una tarjeta por rol.
// Al elegir, el login queda con el correo de demo escrito; solo falta la contraseña.

import { useState } from 'react'
import { DEMO_ROLES, type DemoRole } from './demo'
import { Mono, T } from './ui'

function RoleCard({ role, onPick }: { role: DemoRole; onPick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ textAlign: 'left', background: hover ? T.surface : T.canvas, border: `1px solid ${hover ? T.ink : T.rule}`, padding: '18px 20px', cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: 6, transition: 'border-color .15s, background .15s' }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, letterSpacing: '-0.01em' }}>{role.nombre}</span>
      <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.45 }}>{role.descripcion}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: T.faint, marginTop: 4 }}>{role.email}</span>
    </button>
  )
}

export function RoleSelectView({ onPick }: { onPick: (role: DemoRole) => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
      <div style={{ width: '100%', maxWidth: 880 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Mono size={10}><span style={{ letterSpacing: '0.2em' }}>DEMO · CICLO DE ABASTECIMIENTO</span></Mono>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: T.ink, marginTop: 10 }}>RETAIL OS</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 10 }}>Elige con qué rol entrar. El menú depende del rol elegido.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {DEMO_ROLES.map(role => <RoleCard key={role.id} role={role} onPick={() => onPick(role)} />)}
        </div>
      </div>
    </div>
  )
}
