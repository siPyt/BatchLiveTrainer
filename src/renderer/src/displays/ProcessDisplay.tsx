import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { useLibrary } from '../engine/libraryStore'
import { useBatch } from '../engine/batchStore'
import { STATE_LABEL } from '../engine/batchConfig'
import { useBatchUi } from '../ui/batchUi'
import { BLENDER_CAPACITY, COLOR_TANK_CAPACITY, type CourseProcess } from '../engine/classLibrary'
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

/** Unit module that owns color tank n (contains its LI/XV modules); clicking the tank opens its unit faceplate (p4-34). */
function UnitLink({ n, cx }: { n: number; cx: number }): JSX.Element | null {
  const unit = useBatch(s => s.contained[`LI-${n}04`] ?? s.contained[`XV-${n}01`] ?? null)
  const deployed = useBatch(s => (unit ? !!s.deployedUnits[unit] : false))
  const status = useBatch(s => {
    if (!unit) return ''
    const loaded = Object.values(s.active).filter(a => a.unit === unit)
    return loaded.map(a => `${a.phase} ${STATE_LABEL[a.rt.state]}`).join(', ')
  })
  if (!unit) return null
  return <g data-unit-link={unit} style={{ cursor: 'pointer' }} onClick={() => useBatchUi.getState().openUnit(unit)}>
    <title>{deployed ? `${unit} — open the unit faceplate` : `${unit} has not been downloaded yet`}</title>
    <rect x={cx - 44} y={91} width={88} height={128} fill="transparent" stroke="transparent" />
    <text x={cx} y={232} textAnchor="middle" fill={PALE_TEXT} fontSize={8.5} fontWeight={700}>{unit}</text>
    {status && <text x={cx} y={243} textAnchor="middle" fill="#1f5fa8" fontSize={8} fontWeight={700}>{status}</text>}
  </g>
}

export function ProcessDisplay(): JSX.Element {
  const process = useLibrary(s => s.process)
  if (!process) return <div className="graphic-empty" role="status">
    The Process picture belongs to the Course 7016 DV_School database. Choose File → New Course 7016 Project (DV_School) to load ED_CENTER_BATCH.
  </div>
  const level = (key: keyof CourseProcess, capacity: number): number => pct(process[key], capacity)
  return (
    <div className="plant-diagram" data-display="Process">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}
        role="img" aria-label="ED_CENTER_BATCH process">
        <ClassicBackground w={W} h={H} />
        <ClassicTitle x={W / 2} y={22} text="ED_CENTER_BATCH" />
        <ClassicNavButton x={14} y={10} w={84} h={24} text="Batch Help" onClick={() => useUi.getState().navigate('batchhelp')} />

        {/* ===== color tanks 100 / 200 / 300 with supply (XV-n01) and outlet (XV-n02) valves ===== */}
        {COLOR_CX.map((cx, i) => {
          const n = i + 1
          return <g key={n}>
            <ClassicPipe d={`M${cx - 150},66 H${cx} V95`} width={PIPE} />
            <Valve tag={`XV-${n}01`} x={cx - 80} y={66} labelPosition="above" />
            <ClassicTank x={cx - 40} y={95} w={80} h={120} level={level(`tk${n}00` as keyof CourseProcess, COLOR_TANK_CAPACITY)} label="" />
            <ClassicLabel x={cx} y={160} text={`Color ${n}00`} />
            <LevelReadout tag={`LI-${n}04`} x={cx + 50} y={120} />
            <ClassicPipe d={`M${cx},215 V300`} width={PIPE} />
            <Valve tag={`XV-${n}02`} x={cx} y={258} orientation="vertical" labelPosition="right" />
            <UnitLink n={n} cx={cx} />
          </g>
        })}
        <ClassicPipe d={`M${COLOR_CX[0]},300 H${COLOR_CX[2]}`} width={PIPE} />

        {/* ===== base tank (reference only) and its lines to the blenders ===== */}
        <ClassicTank x={40} y={400} w={95} h={120} level={0} label="" below="Not modeled" />
        <ClassicLabel x={87} y={470} text="Base 400" />
        <ClassicPipe d="M135,460 H305" width={PIPE} />
        <Valve tag="XV-501" x={240} y={460} />
        <ClassicPipe d="M180,460 V372 H600 V460 H635" width={PIPE} />
        <Valve tag="XV-601" x={520} y={372} />

        {/* ===== blenders 500 / 600 ===== */}
        {BLENDERS.map(b => <g key={b.n}>
          <ClassicPipe d={`M${b.cx},300 V410`} width={PIPE} />
          <Valve tag={`XV-${b.n === '500' ? '502' : '602'}`} x={b.cx} y={340} orientation="vertical" labelPosition="right" />
          <ClassicTank x={b.cx - 55} y={410} w={110} h={140} level={level(b.key, BLENDER_CAPACITY)} label="" />
          <ClassicLabel x={b.cx} y={500} text={`Blender ${b.n}`} />
          <Running tag={b.agit}>{running => <ClassicAgitatorDrive x={b.cx + 30} y={413} running={running} tag={b.agit} />}</Running>
          <LevelReadout tag={b.li} x={b.liX} y={470} />
          <ClassicPipe d={`M${b.cx},534 V590`} width={PIPE} />
          <Running tag={b.pump}>{running => <ClassicPump x={b.cx} y={590} running={running} tag={b.pump} discharge="right" />}</Running>
        </g>)}

        {/* ===== product / waste headers ===== */}
        <ClassicPipe d="M705,590 H960" width={PIPE} />
        <Valve tag="XV-603" x={850} y={590} labelPosition="above" />
        <ClassicPipe d="M800,590 V630 H960" width={PIPE} />
        <Valve tag="XV-604" x={880} y={630} />
        <ClassicPipe d="M375,590 H420 V680 H960" width={PIPE} />
        <Valve tag="XV-503" x={560} y={680} labelPosition="above" />
        <ClassicPipe d="M460,680 V720 H960" width={PIPE} />
        <Valve tag="XV-504" x={620} y={720} />
        <ClassicFlag x={962} y={580} w={56} text="Product" />
        <ClassicFlag x={962} y={620} w={56} text="Waste" />
        <ClassicFlag x={962} y={670} w={56} text="Product" />
        <ClassicFlag x={962} y={710} w={56} text="Waste" />
      </svg>
    </div>
  )
}
