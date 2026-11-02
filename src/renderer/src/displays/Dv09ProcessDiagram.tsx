import { useEffect, useRef, useState } from 'react'
import { ClassicControlValve, ClassicLabel, ClassicPipe, ClassicPump, ClassicSanitaryValve, ClassicTank, ClassicTitle, PALE_BG, PALE_BORDER, PALE_TEXT } from '../components/ClassicGraphics'

/**
 * Placeholder for the Chapter 5 process diagram (DV-09 manual, page 5-12, "Workshop - Creating a Motor Control Module"):
 * the tank with its level instrument, the pump driven by MTR-102 (feedback XI-2, command ZX-2), a block valve, a union and the
 * control valve, with the controller and its DI / DO cards. It is drawn with the same DeltaV Operate graphic primitives as the
 * Course 7016 Process picture (pale canvas, shaded tank dynamo, pump dynamo, valve dynamos), laid out like the manual page.
 * It is a static drawing only - no live values - until the real picture is built.
 */
export function Dv09ProcessDiagram({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="dv09-pdiag" role="dialog" aria-label="Process diagram (placeholder)">
      <div className="dv09-fds-title">Process diagram - page 5-12 (placeholder)
        <button className="dv09-op-tabx" aria-label="Close process diagram" onClick={onClose}>×</button></div>
      <Dv09ProcessDrawing />
      <div className="dv09-pdiag-note">Placeholder - static drawing of the diagram on page 5-12. It has no live values yet.</div>
    </div>
  )
}

/** Class DV-09 home display: the page 5-12 diagram, filling the main area the way the Process picture does in 7016. */
export function Dv09ProcessHome(): JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  const [aspect, setAspect] = useState(PICTURE_W / PICTURE_H)
  useEffect(() => {
    const el = svg.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height)
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  return (
    <div className="plant-diagram dv09-home" data-display="DV-09 Process" aria-label="Process diagram (DV-09 home display)">
      <Dv09ProcessDrawing title svgRef={svg} aspect={aspect} />
    </div>
  )
}

const PICTURE_W = 540
const PICTURE_H = 510
/** The picture never spreads wider than this width-to-height ratio. */
const MAX_ASPECT = 3.2

const NAVY = '#252887'

/** Instrument bubble with the "=" mark the manual uses for a discrete I/O point. */
function Bubble({ cx, cy }: { cx: number; cy: number }): JSX.Element {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={9} ry={8} fill="#eceeef" stroke={NAVY} strokeWidth={1.4} />
      <text x={cx} y={cy + 3.5} fill={NAVY} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily="Arial, sans-serif">=</text>
    </g>
  )
}

/** Text object in the picture's label font. */
function Text({ x, y, children, anchor = 'start' }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end' }): JSX.Element {
  return <text x={x} y={y} fill={PALE_TEXT} fontSize={17} textAnchor={anchor} fontFamily="'Segoe UI', sans-serif">{children}</text>
}

/** The drawing itself, shared by the home display and the Operate panel. Coordinates follow the manual slide (900 x 675). */
export function Dv09ProcessDrawing({ title = false, svgRef, aspect }: { title?: boolean; svgRef?: React.RefObject<SVGSVGElement>; aspect?: number }): JSX.Element {
  const PIPE = 1.6
  const grey = '#9aa5ae'
  // A window wider than the picture adds canvas equally left and right; the drawing keeps its size.
  const width = aspect ? Math.min(Math.max(PICTURE_W, PICTURE_H * aspect), PICTURE_H * MAX_ASPECT) : PICTURE_W
  const left = 440 - width / 2
  return (
    <svg ref={svgRef} viewBox={`${left} 95 ${width} ${PICTURE_H}`} className="dv09-pdiag-svg" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Tank, pump XI-2 ZX-2, valves and the MTR-102 controller I/O cards">
      <rect x={left} y={95} width={width} height={PICTURE_H} fill={PALE_BG} />
      {title && <ClassicTitle x={440} y={122} text="Workshop – Creating a Motor Control Module" />}

      {/* controller and its I/O cards: CTLR / MTR-102, DI and DO */}
      <g fill={grey} stroke={PALE_BORDER} strokeWidth={1.3}>
        <rect x={480} y={150} width={32} height={135} rx={4} />
        <rect x={514} y={150} width={32} height={107} rx={4} />
        <rect x={548} y={150} width={32} height={107} rx={4} />
        <rect x={583} y={150} width={32} height={107} rx={4} />
        <rect x={617} y={150} width={32} height={107} rx={4} />
      </g>
      <Text x={349} y={173}>CTLR</Text>
      <Text x={349} y={197}>MTR-102</Text>
      <Text x={599} y={143} anchor="middle">DI</Text>
      <Text x={633} y={143} anchor="middle">DO</Text>

      {/* piping: tank outlet, pump discharge, block valve, union, control valve */}
      <ClassicPipe d="M256,411 V515 H332" width={PIPE} />
      <ClassicPipe d="M353,490 V478" width={PIPE} />
      <ClassicPipe d="M383,498 H598" width={PIPE} />
      <ClassicPipe d="M598,486 V510 M605,486 V510" width={2} />
      <ClassicPipe d="M605,498 H671" width={PIPE} />

      {/* tank dynamo with its level instrument */}
      <ClassicTank x={205} y={215} w={103} h={196} level={0} label="" />
      <circle cx={329} cy={312} r={20} fill="#eceeef" stroke="#6b7680" strokeWidth={1.4} />

      {/* pump dynamo (XI-2 running feedback above, ZX-2 command below) */}
      <g transform="translate(353 513) scale(2) translate(-353 -513)">
        <ClassicPump x={353} y={513} running={false} tag="" label="" discharge="right" />
      </g>
      <Bubble cx={353} cy={470} />
      <Text x={333} y={444}>XI-2</Text>
      <rect x={348} y={541} width={10} height={9} fill="#eceeef" stroke={NAVY} strokeWidth={1.2} />
      <Text x={330} y={572}>ZX-2</Text>

      {/* block valve and control valve dynamos (reference symbols) */}
      <g transform="translate(484 497) scale(1.4) translate(-484 -497)">
        <ClassicSanitaryValve x={484} y={497} open={false} label="" mode="" />
      </g>
      <Bubble cx={522} cy={462} />
      <path d="M503,474 L513,466" stroke={NAVY} strokeWidth={1.2} fill="none" />
      <g transform="translate(671 497) scale(1.7) translate(-671 -497)">
        <ClassicControlValve x={671} y={497} position={0} tag="" label="" />
      </g>

      {title && <ClassicLabel x={440} y={598} text="Placeholder - Course DV-09 page 5-12 - static drawing, no live values yet" />}
    </svg>
  )
}
