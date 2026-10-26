import { useRef, useState } from 'react'
import {
  blockInputPins, blockOutputPins, inputSlot, parseBlockRef, type DiagramBlockType, type PhaseBlock
} from '../engine/phaseBlocks'

// Function block diagram of a phase's FAIL_MONITOR composite: CND, BFI and CALC blocks wired output pin to input pin,
// drawn like the control module function block diagram in Control Studio (course 7016 pp 6-34..6-41).

export const DRAG_FB = 'application/x-bl-phase-fb'
const BLOCK_W = 176
const HEAD_H = 22
const ROW_H = 18
const CANVAS_W = 960
const CANVAS_H = 560

const rowsOf = (b: PhaseBlock): number => Math.max(blockInputPins(b).length, blockOutputPins(b).length, 1)
const heightOf = (b: PhaseBlock): number => HEAD_H + 10 + rowsOf(b) * ROW_H + (b.type === 'CND' ? 18 : 8)
const pinY = (index: number): number => HEAD_H + 16 + index * ROW_H
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const trim = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

const COLUMN: Record<PhaseBlock['type'], number> = { CND: 0, BFI: 1, CALC: 2, TIMER_SEC: 2 }

/** Position of each block; blocks that have never been placed go to the first free spot in the CND | BFI | CALC column. */
export function blockPositions(blocks: Record<string, PhaseBlock>): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  const taken: { x: number; y: number; h: number }[] = []
  for (const [name, b] of Object.entries(blocks)) {
    if (b.x === undefined || b.y === undefined) continue
    out[name] = { x: b.x, y: b.y }
    taken.push({ x: b.x, y: b.y, h: heightOf(b) })
  }
  for (const [name, b] of Object.entries(blocks)) {
    if (out[name]) continue
    const x = 40 + COLUMN[b.type] * 300
    let y = 30
    for (let moved = true; moved;) {
      moved = false
      for (const t of taken) {
        if (Math.abs(t.x - x) < BLOCK_W + 20 && y < t.y + t.h + 26 && y + heightOf(b) + 26 > t.y) { y = t.y + t.h + 26; moved = true }
      }
    }
    out[name] = { x, y }
    taken.push({ x, y, h: heightOf(b) })
  }
  return out
}

type Pin = { block: string; pin: string }
const route = (a: { x: number; y: number }, b: { x: number; y: number }, bend?: number): string => {
  const mid = bend === undefined ? Math.round((a.x + b.x) / 2) : Math.min(Math.round(b.x - 14), a.x + 16 + bend)
  return `M${a.x},${a.y} H${mid} V${b.y} H${b.x}`
}

export function PhaseFbd({ blocks, zoom, selected, params, scope, readOnly, onSelect, onMove, onConnect, onDisconnect, onAdd, onMenu, onOpen }: {
  blocks: Record<string, PhaseBlock>; zoom: number; selected: string | null
  /** Run-time values keyed `<scope>/<block>/<pin>` while an on-line unit phase is shown. */
  params?: Record<string, unknown>; scope: string; readOnly: boolean
  onSelect: (name: string | null) => void
  onMove: (name: string, x: number, y: number) => void
  onConnect: (from: Pin, to: Pin) => string | null
  onDisconnect: (block: string, slot: number) => void
  onAdd: (type: DiagramBlockType, x: number, y: number) => void
  onMenu: (target: { block: string } | { wire: { block: string; slot: number; label: string } }, e: React.MouseEvent) => void
  onOpen: (name: string) => void
}): JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  const [moving, setMoving] = useState<{ name: string; ox: number; oy: number; x: number; y: number } | null>(null)
  const [wiring, setWiring] = useState<{ from: Pin; x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [wire, setWire] = useState<{ block: string; slot: number } | null>(null)
  const [problem, setProblem] = useState('')
  const base = blockPositions(blocks)
  const pos = (name: string): { x: number; y: number } => (moving?.name === name ? moving : base[name]) ?? { x: 0, y: 0 }
  const point = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = svg.current?.getBoundingClientRect()
    return { x: (e.clientX - (r?.left ?? 0)) / zoom, y: (e.clientY - (r?.top ?? 0)) / zoom }
  }
  const pinPoint = (block: string, pin: string, output: boolean): { x: number; y: number } | null => {
    const b = blocks[block]
    if (!b) return null
    const pins = output ? blockOutputPins(b) : blockInputPins(b)
    const i = pins.indexOf(pin)
    if (i < 0) return null
    const p = pos(block)
    return { x: output ? p.x + BLOCK_W + 10 : p.x - 10, y: p.y + pinY(i) }
  }
  const value = (block: string, pin: string): string | null => {
    const v = params?.[`${scope}/${block}/${pin}`]
    return v === undefined ? null : typeof v === 'boolean' ? (v ? '1' : '0') : String(v)
  }

  const wires = Object.entries(blocks).flatMap(([name, b]) => b.inputs.flatMap((ref, slot) => {
    const src = ref ? parseBlockRef(ref) : null
    const pin = blockInputPins(b)[b.type === 'BFI' ? slot + 1 : slot]
    if (!src || !pin) return []
    const a = pinPoint(src.block, src.pin, true)
    const z = pinPoint(name, pin, false)
    const names = Object.keys(blocks)
    return a && z ? [{ block: name, slot, from: `${src.block}/${src.pin}`, to: `${name}/${pin}`, a, z, bend: (names.indexOf(src.block) % 8) * 9,
      lit: value(src.block, src.pin) !== null && value(src.block, src.pin) !== '0' && value(src.block, src.pin) !== 'false' }] : []
  }))

  const onMouseMove = (e: React.MouseEvent): void => {
    const p = point(e)
    if (moving) setMoving({ ...moving, x: Math.round(clamp(p.x - moving.ox, 14, CANVAS_W - BLOCK_W - 24)), y: Math.round(clamp(p.y - moving.oy, 20, CANVAS_H - 60)) })
    if (wiring) setWiring({ ...wiring, x2: p.x, y2: p.y })
  }
  const onMouseUp = (): void => {
    if (moving) {
      const m = moving
      setMoving(null)
      if (base[m.name].x !== m.x || base[m.name].y !== m.y) onMove(m.name, m.x, m.y)
    }
    setWiring(null)
  }
  const startMove = (name: string, e: React.MouseEvent): void => {
    if (readOnly || e.button !== 0) return
    const p = point(e)
    const cur = pos(name)
    setMoving({ name, ox: p.x - cur.x, oy: p.y - cur.y, x: cur.x, y: cur.y })
  }
  const startWire = (from: Pin, e: React.MouseEvent): void => {
    if (readOnly) return
    e.stopPropagation()
    const p = pinPoint(from.block, from.pin, true)
    if (p) setWiring({ from, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }
  const endWire = (to: Pin, e: React.MouseEvent): void => {
    if (!wiring) return
    e.stopPropagation()
    setProblem(onConnect(wiring.from, to) ?? '')
    setWiring(null)
  }
  const drop = (e: React.DragEvent): void => {
    const type = e.dataTransfer.getData(DRAG_FB) as DiagramBlockType
    if (!type || readOnly) return
    e.preventDefault()
    const p = point(e)
    onAdd(type, Math.round(clamp(p.x - BLOCK_W / 2, 14, CANVAS_W - BLOCK_W - 24)), Math.round(clamp(p.y - 20, 20, CANVAS_H - 120)))
  }

  return <div className="cs-diagram-wrap ps-fbd" tabIndex={0} data-phase-fbd=""
    onKeyDown={e => { if (e.key === 'Delete' && wire && !readOnly) { e.preventDefault(); onDisconnect(wire.block, wire.slot); setWire(null) } }}
    onDragOver={e => { if (!readOnly && e.dataTransfer.types.includes(DRAG_FB)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }} onDrop={drop}>
    <svg ref={svg} className="cs-diagram fbd-canvas-svg" width={CANVAS_W * zoom} height={CANVAS_H * zoom} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      role="img" aria-label="FAIL_MONITOR function block diagram"
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onMouseDown={() => { onSelect(null); setWire(null); setProblem('') }}>
      <defs><pattern id="psFbdGrid" width={20} height={20} patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7e9eb" strokeWidth={0.7} /></pattern></defs>
      <rect width={CANVAS_W} height={CANVAS_H} fill="url(#psFbdGrid)" />
      {wires.map(w => {
        const isSel = wire?.block === w.block && wire.slot === w.slot
        return <g key={`${w.from}->${w.to}`} data-wire={`${w.from}->${w.to}`}>
          <path d={route(w.a, w.z, w.bend)} className={'cs-wire' + (isSel ? ' sel' : '') + (w.lit ? ' ps-wire-true' : '')} />
          <path d={route(w.a, w.z, w.bend)} className="cs-wire-hit" onMouseDown={e => { e.stopPropagation(); setWire({ block: w.block, slot: w.slot }) }}
            onContextMenu={e => { e.preventDefault(); if (!readOnly) onMenu({ wire: { block: w.block, slot: w.slot, label: `${w.from} → ${w.to}` } }, e) }} />
        </g>
      })}
      {wiring && <path d={route({ x: wiring.x1, y: wiring.y1 }, { x: wiring.x2, y: wiring.y2 })} className="cs-wire drawing" />}
      {Object.entries(blocks).map(([name, b]) => {
        const p = pos(name)
        const h = heightOf(b)
        const ins = blockInputPins(b)
        const outs = blockOutputPins(b)
        return <g key={name} transform={`translate(${p.x},${p.y})`} data-block={name} data-block-type={b.type}
          onMouseDown={e => { e.stopPropagation(); setWire(null); onSelect(name); startMove(name, e) }}
          onDoubleClick={() => onOpen(name)} onContextMenu={e => { e.preventDefault(); onSelect(name); onMenu({ block: name }, e) }}>
          <title>{b.expression ? `${name} (${b.type}): ${b.expression}` : `${name} (${b.type})`}</title>
          <text x={BLOCK_W / 2} y={-6} className="cs-block-badge" textAnchor="middle">{b.type}</text>
          <rect width={BLOCK_W} height={h} className={'cs-block' + (selected === name ? ' sel' : '')} />
          <rect width={BLOCK_W} height={HEAD_H} className="cs-block-head" />
          <text x={6} y={15} className="cs-block-name">{trim(name, 22)}</text>
          {ins.map((pin, i) => {
            const slot = inputSlot(b, pin)
            const wireable = slot >= 0
            return <g key={pin} data-pin={`${name}/${pin}`} onMouseUp={e => { if (wireable) endWire({ block: name, pin }, e) }}>
              <line x1={-10} y1={pinY(i)} x2={0} y2={pinY(i)} className="cs-pin-line" />
              <circle cx={-10} cy={pinY(i)} r={5} className={'cs-pin in' + (wiring && wireable ? ' armed' : '')} />
              <text x={4} y={pinY(i) + 3} className="cs-pin-label">{pin}</text>
              {!wireable && value(name, pin) !== null && <text x={BLOCK_W / 2 - 28} y={pinY(i) + 3} className="cs-pin-label dim">{value(name, pin)}</text>}
            </g>
          })}
          {outs.map((pin, i) => <g key={pin} data-pin={`${name}/${pin}`} onMouseDown={e => startWire({ block: name, pin }, e)}>
            <line x1={BLOCK_W} y1={pinY(i)} x2={BLOCK_W + 10} y2={pinY(i)} className="cs-pin-line" />
            <circle cx={BLOCK_W + 10} cy={pinY(i)} r={5} className="cs-pin out" />
            <text x={BLOCK_W - 4} y={pinY(i) + 3} textAnchor="end" className="cs-pin-label">{pin}</text>
            {value(name, pin) !== null && <text x={BLOCK_W - 70} y={pinY(i) + 3} textAnchor="end" className="cs-pin-label dim">{value(name, pin)}</text>}
          </g>)}
          {b.type === 'CND' && <>
            <line x1={0} y1={h - 18} x2={BLOCK_W} y2={h - 18} className="cs-block-rule" />
            <text x={6} y={h - 6} className="cs-pin-label dim">DISABLE = {value(name, 'DISABLE') ?? (b.disabled ? '1' : '0')}</text>
          </>}
        </g>
      })}
    </svg>
    {problem && <p className="lib-dlg-error" role="alert">{problem}</p>}
  </div>
}
