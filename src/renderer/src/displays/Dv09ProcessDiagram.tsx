/**
 * Placeholder for the Chapter 5 process diagram (DV-09 manual, page 5-12, "Workshop - Creating a Motor Control Module"):
 * Tank101 with its level transmitter, the pump driven by MTR-102 (feedback XI-2, command ZX-2), a block valve and the
 * control valve. It is a static drawing only - no live values - until the real picture is built.
 */
export function Dv09ProcessDiagram({ onClose }: { onClose: () => void }): JSX.Element {
  const ink = '#1a2a6c'
  return (
    <div className="dv09-pdiag" role="dialog" aria-label="Process diagram (placeholder)">
      <div className="dv09-fds-title">Process diagram - page 5-12 (placeholder)
        <button className="dv09-op-tabx" aria-label="Close process diagram" onClick={onClose}>×</button></div>
      <svg viewBox="0 0 620 420" className="dv09-pdiag-svg" role="img" aria-label="Tank, pump XI-2 ZX-2, valves and the MTR-102 controller I/O cards">
        <g stroke="#000" fill="none" strokeWidth="1.5">
          <rect x="40" y="70" width="110" height="180" fill="#fff" />
          <circle cx="170" cy="150" r="14" fill="#fff" />
          <path d="M95 250 V340 H150" />
          <circle cx="175" cy="340" r="22" fill="#fff" />
          <path d="M153 360 L135 380 H215 L197 360 Z" fill="#fff" />
          <rect x="169" y="380" width="12" height="12" fill="#fff" />
          <circle cx="175" cy="300" r="5" />
          <path d="M175 305 V318" />
          <path d="M197 335 H255" />
          <path d="M255 322 L280 335 L255 348 Z M280 335 L305 322 V348 Z" fill="#fff" />
          <rect x="258" y="290" width="26" height="20" fill="#fff" />
          <path d="M268 310 V335" />
          <path d="M305 335 H370" />
          <path d="M372 322 V348 M380 322 V348" />
          <path d="M382 335 H420" />
          <path d="M420 322 L445 335 L420 348 Z M445 335 L470 322 V348 Z" fill="#fff" />
          <path d="M445 335 V315" />
          <path d="M425 315 A20 14 0 0 1 465 315 Z" fill="#fff" />
        </g>
        <g fill="#999" stroke="#000" strokeWidth="1.2">
          <rect x="330" y="40" width="34" height="115" rx="4" />
          <rect x="368" y="40" width="34" height="95" rx="4" />
          <rect x="406" y="40" width="34" height="95" rx="4" />
          <rect x="444" y="40" width="34" height="95" rx="4" />
          <rect x="482" y="40" width="34" height="95" rx="4" />
        </g>
        <g fill={ink} fontFamily="Times New Roman, serif" fontSize="18">
          <text x="485" y="32">DI DO</text>
          <text x="190" y="60">CTLR</text>
          <text x="190" y="84">MTR-102</text>
          <text x="140" y="288">XI-2</text>
          <text x="140" y="412">ZX-2</text>
        </g>
      </svg>
      <div className="dv09-pdiag-note">Placeholder - static drawing of the diagram on page 5-12. It has no live values yet.</div>
    </div>
  )
}
