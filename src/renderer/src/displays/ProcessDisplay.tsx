import { useEffect, useRef, useState } from 'react'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { useLibrary } from '../engine/libraryStore'
import { useBatch } from '../engine/batchStore'
import { STATE_LABEL, phaseHasFailure } from '../engine/batchConfig'
import { useBatchUi } from '../ui/batchUi'
import { BASE_CAPACITY, BLENDER_CAPACITY, COLOR_TANK_CAPACITY, type CourseProcess } from '../engine/classLibrary'
import {
  ClassicAgitatorDrive, ClassicBackground, ClassicFlag, ClassicLabel, ClassicNavButton, ClassicPipe, ClassicPump, ClassicSanitaryValve,
  ClassicTank, ClassicTitle, PALE_TEXT
} from '../components/ClassicGraphics'
import { fmt } from '../utils/format'

// Course 7016 p1-16 (Control Module Class / LEVEL_INDICATOR): the ED_CENTER_BATCH color tanks and
// blenders, drawn with the same classic BatchLive primitives as every other plant picture. It is the
// "Process" primary display assigned to the LEVEL_INDICATOR class.

const W = 1040
const H = 760
/** The picture never spreads wider than this width-to-height ratio. */
const MAX_ASPECT = 3.2
const PIPE = 1.3
const COLOR_CX = [190, 490, 790] as const
const BLENDERS = [
  { n: '500', cx: 360, key: 'bl500', agit: 'AGIT-503', li: 'LI-504', liX: 425, pump: 'MTR-505' },
  { n: '600', cx: 690, key: 'bl600', agit: 'AGIT-603', li: 'LI-604', liX: 750, pump: 'MTR-605' }
] as const

/** Flat gray data box in the ClassicReadout style; shows ???? until the class-based module exists and is downloaded. */
function LevelReadout({ tag, x, y }: { tag: string; x: number; y: number }): JSX.Element {
  const m = useStore(s => s.modules[tag])
  const openFaceplate = useUi(s => s.openFaceplate)
  const ai = m?.type === 'AI' ? m : undefined
  const value = ai && !ai.pvBad ? `${fmt(ai.pv, ai.decimals)}${ai.unit}` : '????'
  const w = 96
  return (
    <g data-dynamo={tag} style={{ cursor: m ? 'pointer' : 'default' }} onClick={m ? () => openFaceplate(tag) : undefined}>
      <title>{!m ? `${tag} has not been created yet (Course 7016 Chapter 1 workshop)` : ai?.statusText ?? tag}</title>
      <rect x={x} y={y} width={w} height={24} fill="#eceeef" stroke="#6b7680" strokeWidth={1} />
      <text x={x + 4} y={y + 10} fill={PALE_TEXT} fontSize={8.5} fontWeight={700}>{tag}</text>
      <text x={x + 4} y={y + 21} fill="#3a4550" fontSize={8}>PV</text>
      <text x={x + w - 4} y={y + 21} fill={PALE_TEXT} fontSize={8} fontWeight={700} textAnchor="end">{value}</text>
    </g>
  )
}

/** FIC-404 data box (p5-46): PV / SP / OUT and the actual mode. */
function FlowReadout({ tag, x, y }: { tag: string; x: number; y: number }): JSX.Element {
  const m = useStore(s => s.modules[tag])
  const openFaceplate = useUi(s => s.openFaceplate)
  const pid = m?.type === 'PID' ? m : undefined
  const w = 112
  const line = (k: string, v: string, row: number): JSX.Element => <g key={k}>
    <text x={x + 4} y={y + 21 + row * 10} fill="#3a4550" fontSize={8}>{k}</text>
    <text x={x + w - 4} y={y + 21 + row * 10} fill={PALE_TEXT} fontSize={8} fontWeight={700} textAnchor="end">{v}</text>
  </g>
  return (
    <g data-dynamo={tag} style={{ cursor: m ? 'pointer' : 'default' }} onClick={m ? () => openFaceplate(tag) : undefined}>
      <title>{pid ? `${tag} ${pid.description}` : `${tag} does not exist`}</title>
      <rect x={x} y={y} width={w} height={54} fill="#eceeef" stroke="#6b7680" strokeWidth={1} />
      <text x={x + 4} y={y + 10} fill={PALE_TEXT} fontSize={8.5} fontWeight={700}>{tag}</text>
      <text x={x + w - 4} y={y + 10} fill="#1f5fa8" fontSize={8} fontWeight={700} textAnchor="end">{pid ? pid.actualMode : ''}</text>
      {line('PV', pid ? `${fmt(pid.pv, 1)} GPM` : '????', 0)}
      {line('SP', pid ? `${fmt(pid.sp, 1)} GPM` : '????', 1)}
      {line('OUT', pid ? `${fmt(pid.out, 1)} %` : '????', 2)}
    </g>
  )
}

/** Two stage blender color valve position label (CLOSED / DRIBBLE / BULK). */
function StageLabel({ tag, x, y }: { tag: string; x: number; y: number }): JSX.Element | null {
  const stage = useStore(s => { const m = s.modules[tag]; return m?.type === 'VALVE' && m.twoStage ? (m.dcState.startsWith('GOING') ? 'TRAVEL' : m.open ? (m.bulk ? 'BULK' : 'DRIBBLE') : 'CLOSED') : '' })
  if (!stage) return null
  return <text data-stage={tag} x={x} y={y} fill={stage === 'CLOSED' ? PALE_TEXT : stage === 'TRAVEL' ? '#a35a00' : '#1f7a3a'} fontSize={8} fontWeight={700}>{stage}</text>
}

function useOpen(tag: string): boolean {
  return useStore(s => { const m = s.modules[tag]; return m?.type === 'VALVE' && m.open })
}

function Valve({ tag, x, y, orientation, labelPosition }: { tag: string; x: number; y: number; orientation?: 'horizontal' | 'vertical'; labelPosition?: 'above' | 'below' | 'right' }): JSX.Element {
  const open = useOpen(tag)
  const exists = useStore(s => !!s.modules[tag])
  return <ClassicSanitaryValve x={x} y={y} open={open} tag={exists ? tag : undefined} label={tag} mode="" orientation={orientation} labelPosition={labelPosition} />
}

function Running({ tag, children }: { tag: string; children: (running: boolean) => JSX.Element }): JSX.Element {
  const running = useStore(s => { const m = s.modules[tag]; return m?.type === 'MOTOR' && m.running })
  return children(running)
}

const pct = (value: number, capacity: number): number => (value / capacity) * 100

/** Clicking a tank opens the faceplate of the unit that contains its LI/XV modules. */
function UnitLink({ n, cx, y = 91, h = 128 }: { n: number; cx: number; y?: number; h?: number }): JSX.Element | null {
  const unit = useBatch(s => s.contained[`LI-${n}04`] ?? s.contained[`XV-${n}01`] ?? null)
  const deployed = useBatch(s => (unit ? !!s.deployedUnits[unit] : false))
  const status = useBatch(s => {
    if (!unit) return ''
    const loaded = Object.values(s.active).filter(a => a.unit === unit)
    return loaded.map(a => `${a.phase} ${STATE_LABEL[a.rt.state]}`).join(', ')
  })
  const failure = useBatch(s => Object.values(s.active).filter(a => a.unit === unit && phaseHasFailure(a.rt))
    .map(a => `${a.phase}: ${a.rt.message || `Failure ${a.rt.failIndex}`}`).join(', '))
  if (!unit) return null
  return <g data-unit-link={unit} style={{ cursor: 'pointer' }} onClick={() => useBatchUi.getState().openUnit(unit)}>
    <title>{deployed ? `${unit} — open the unit faceplate` : `${unit} has not been downloaded yet`}</title>
    <rect x={cx - 44} y={y} width={88} height={h} fill="transparent" stroke="transparent" />
    <text x={cx} y={y + h + 13} textAnchor="middle" fill={PALE_TEXT} fontSize={8.5} fontWeight={700}>{unit}</text>
    {status && <text x={cx} y={y + h + 24} textAnchor="middle" fill="#1f5fa8" fontSize={8} fontWeight={700}>{status}</text>}
    {failure && <text x={cx} y={y + h + 35} textAnchor="middle" fill="#b00020" fontSize={8} fontWeight={700}>{failure}</text>}
  </g>
}

export function ProcessDisplay(): JSX.Element {
  const process = useLibrary(s => s.process)
  const svg = useRef<SVGSVGElement>(null)
  const [aspect, setAspect] = useState(W / H)
  useEffect(() => {
    const el = svg.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height)
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [process])
  if (!process) return <div className="graphic-empty" role="status">
    The Process picture belongs to the Course 7016 DV_School database. Choose File → New Course 7016 Project (DV_School) to load ED_CENTER_BATCH.
  </div>
  const level = (key: keyof CourseProcess, capacity: number): number => pct(process[key], capacity)
  // A window wider than the picture spreads the equipment apart, equally left and right; symbols keep their size.
  const width = Math.min(Math.max(W, H * aspect), H * MAX_ASPECT)
  const f = width / W
  const X = (v: number): number => Math.round(v * f * 10) / 10
  const flagX = X(962)
  const outX = X(960)
  return (
    <div className="plant-diagram" data-display="Process">
      <svg ref={svg} width="100%" height="100%" viewBox={`0 0 ${width} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}
        role="img" aria-label="ED_CENTER_BATCH process">
        <ClassicBackground w={width} h={H} />
        <ClassicTitle x={width / 2} y={22} text="ED_CENTER_BATCH" />
        <ClassicNavButton x={14} y={10} w={84} h={24} text="Batch Help" onClick={() => useUi.getState().navigate('batchhelp')} />

        {/* ===== color tanks 100 / 200 / 300 with supply (XV-n01) and outlet (XV-n02) valves ===== */}
        {COLOR_CX.map((cx, i) => {
          const n = i + 1
          const xc = X(cx)
          return <g key={n}>
            <ClassicPipe d={`M${X(cx - 150)},66 H${xc} V95`} width={PIPE} />
            <Valve tag={`XV-${n}01`} x={X(cx - 80)} y={66} labelPosition="above" />
            <ClassicTank x={xc - 40} y={95} w={80} h={120} level={level(`tk${n}00` as keyof CourseProcess, COLOR_TANK_CAPACITY)} label="" />
            <ClassicLabel x={xc} y={160} text={`Color ${n}00`} />
            <LevelReadout tag={`LI-${n}04`} x={xc + 50} y={120} />
            <ClassicPipe d={`M${xc},215 V300`} width={PIPE} />
            <Valve tag={`XV-${n}02`} x={xc} y={258} orientation="vertical" labelPosition="right" />
            <UnitLink n={n} cx={xc} />
          </g>
        })}
        <ClassicPipe d={`M${X(COLOR_CX[0])},300 H${X(COLOR_CX[2])}`} width={PIPE} />

        {/* ===== base tank 400, transfer pump MTR-403 and flow loop FIC-404 (Chapter 5) ===== */}
        <ClassicTank x={X(87) - 47} y={400} w={95} h={120} level={level('bs400', BASE_CAPACITY)} label="" />
        <ClassicLabel x={X(87)} y={470} text="Base 400" />
        <LevelReadout tag="LI-401" x={X(87) - 48} y={372} />
        <ClassicPipe d={`M${X(87)},520 V570 H${X(160) - 10}`} width={PIPE} />
        <ClassicPipe d={`M${X(160) + 10},570 H${X(180)} V520`} width={PIPE} />
        <Running tag="MTR-403">{running => <ClassicPump x={X(160)} y={570} running={running} tag="MTR-403" discharge="right" />}</Running>
        <FlowReadout tag="FIC-404" x={X(87) - 51} y={610} />
        {/* Base header tee (p2-5): XV-501 rises to its own Blender 500 inlet; XV-601 runs behind Blender 500 to Blender 600. */}
        <ClassicPipe d={`M${X(180)},520 V390 H${X(BLENDERS[0].cx) - 30} V414`} width={PIPE} />
        <Valve tag="XV-501" x={X(180)} y={450} orientation="vertical" labelPosition="right" />
        <ClassicPipe d={`M${X(180)},520 H${X(570)} V390 H${X(BLENDERS[1].cx) - 30} V414`} width={PIPE} />
        <Valve tag="XV-601" x={X(245)} y={520} />

        {/* ===== blenders 500 / 600 ===== */}
        {BLENDERS.map(b => {
          const xc = X(b.cx)
          return <g key={b.n}>
            <ClassicPipe d={`M${xc},300 V410`} width={PIPE} />
            <Valve tag={`XV-${b.n === '500' ? '502' : '602'}`} x={xc} y={340} orientation="vertical" labelPosition="right" />
            <StageLabel tag={`XV-${b.n === '500' ? '502' : '602'}`} x={xc + 14} y={362} />
            <ClassicTank x={xc - 55} y={410} w={110} h={140} level={level(b.key, BLENDER_CAPACITY)} label="" />
            <ClassicLabel x={xc} y={500} text={`Blender ${b.n}`} />
            <UnitLink n={Number(b.n) / 100} cx={xc} y={414} h={124} />
            <Running tag={b.agit}>{running => <ClassicAgitatorDrive x={xc + 30} y={413} running={running} tag={b.agit} />}</Running>
            <LevelReadout tag={b.li} x={xc + (b.liX - b.cx)} y={470} />
            <ClassicPipe d={`M${xc},534 V590`} width={PIPE} />
            <Running tag={b.pump}>{running => <ClassicPump x={xc} y={590} running={running} tag={b.pump} discharge="right" />}</Running>
          </g>
        })}

        {/* ===== product / waste headers ===== */}
        <ClassicPipe d={`M${X(BLENDERS[1].cx) + 15},590 H${outX}`} width={PIPE} />
        <Valve tag="XV-603" x={X(850)} y={590} labelPosition="above" />
        <ClassicPipe d={`M${X(800)},590 V630 H${outX}`} width={PIPE} />
        <Valve tag="XV-604" x={X(880)} y={630} />
        <ClassicPipe d={`M${X(BLENDERS[0].cx) + 15},590 H${X(420)} V680 H${outX}`} width={PIPE} />
        <Valve tag="XV-503" x={X(560)} y={680} labelPosition="above" />
        <ClassicPipe d={`M${X(460)},680 V720 H${outX}`} width={PIPE} />
        <Valve tag="XV-504" x={X(620)} y={720} />
        <ClassicFlag x={flagX} y={580} w={56} text="Product" />
        <ClassicFlag x={flagX} y={620} w={56} text="Waste" />
        <ClassicFlag x={flagX} y={670} w={56} text="Product" />
        <ClassicFlag x={flagX} y={710} w={56} text="Waste" />
      </svg>
    </div>
  )
}
