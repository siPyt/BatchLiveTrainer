import type { AlarmPriority } from './types'
import { isValidDeltaVTag } from './naming'

// Course 7016 Chapter 1 (Batch Process Overview, pp 1-16..1-27): the DeltaV
// Library, Control Module Class Categories, Control Module Classes created from
// Module Templates, class-based Control Modules (instances), the "Allow instance
// value to be configured" / "Use default value from library object" contract,
// external reference input parameters and the DV_School TANKSIM process.

// ---------------------------------------------------------------------------
// Parameters

export interface ScaleValue { hi: number; lo: number; units: string; decimals: number }
export interface SimulateValue { enabled: boolean; value: number }
export type ParamValue = ScaleValue | SimulateValue | number | string | string[]

/** scale/enum/float/... are block parameters; extref/intref/fstatus are Special Items input/output parameters. */
export type ParamType =
  | 'scale' | 'float' | 'enum' | 'simulate' | 'mode' | 'ioref' | 'bitstring' | 'string'
  | 'extref' | 'intref' | 'fstatus' | 'dynamic' | 'connector'

export type SpecialItemKind = 'INPUT' | 'OUTPUT'

export interface ParamDef {
  type: ParamType
  category: 'I/O' | 'Alarms' | 'Options' | 'Process' | 'Mode' | 'Simulate' | 'Diagnostics' | 'Other'
  value: ParamValue
  /** "Allow instance value to be configured" (class) — the only parameters an instance may override. */
  allowInstance: boolean
  /** Dynamic/connector parameters cannot be configured. */
  readOnly?: boolean
  options?: string[]
  units?: string
  description: string
  /** Present for Special Items (Input/Output Parameter) placed on the diagram. */
  special?: { item: SpecialItemKind; x: number; y: number }
}

export const PARAM_TYPE_LABEL: Record<ParamType, string> = {
  scale: 'Scaling', float: 'Floating point', enum: 'Named set', simulate: 'Simulate floating point',
  mode: 'Mode', ioref: 'I/O reference', bitstring: 'Bit string', string: 'ASCII text',
  extref: 'External reference', intref: 'Internal reference', fstatus: 'Floating point with status',
  dynamic: 'Floating point with status (dynamic)', connector: 'Input connector'
}

/** Types a Special Items Input/Output Parameter may take in its Properties dialog. */
export const SPECIAL_PARAM_TYPES: ParamType[] = ['extref', 'intref', 'fstatus']

export interface BlockDef { name: string; type: 'AI'; x: number; y: number; params: Record<string, ParamDef> }

export interface AlarmDef {
  type: 'HI_HI' | 'HI' | 'LO' | 'LO_LO'
  /** Limit parameter path, e.g. AI1/HI_LIM. */
  parameter: string
  priority: AlarmPriority
  enabled: boolean
}

/** Wire endpoints: a module parameter name (LEVEL_IN) or BLOCK/PIN (AI1/SIMULATE_IN, AI1/OUT). */
export interface Wire { from: string; to: string }

export interface ModuleDefinition {
  description: string
  primaryDisplay: string
  detailDisplay: string
  instrumentDisplay: string
  blocks: Record<string, BlockDef>
  params: Record<string, ParamDef>
  wires: Wire[]
  alarms: Record<string, AlarmDef>
}

export const BLOCK_PINS: Record<BlockDef['type'], { inputs: string[]; outputs: string[] }> = {
  AI: { inputs: ['SIMULATE_IN'], outputs: ['OUT'] }
}

// ---------------------------------------------------------------------------
// Library tree (DV_School)

export interface TemplateNode {
  name: string
  kind: 'folder' | 'module-template' | 'fb-template' | 'composite-template'
  children?: TemplateNode[]
  /** Only modeled templates can be dragged into a Control Module Class Category. */
  modeled?: boolean
  description?: string
}

const fb = (name: string, description: string): TemplateNode => ({ name, kind: 'fb-template', description })
const mt = (name: string, description: string, modeled = false): TemplateNode => ({ name, kind: 'module-template', description, modeled })

export const LIBRARY_TEMPLATES: TemplateNode[] = [
  { name: 'FunctionBlockTemplates', kind: 'folder', children: [
    { name: 'AnalogControl', kind: 'folder', children: [fb('PID', 'PID control'), fb('SPLTR', 'Splitter'), fb('RATIO', 'Ratio')] },
    { name: 'IO', kind: 'folder', children: [fb('AI', 'Analog input'), fb('AO', 'Analog output'), fb('DI', 'Discrete input'), fb('DO', 'Discrete output')] },
    { name: 'Logic', kind: 'folder', children: [fb('AND', 'Logical AND'), fb('OR', 'Logical OR'), fb('CND', 'Condition')] },
    { name: 'Math', kind: 'folder', children: [fb('ADD', 'Add'), fb('CALC', 'Calculation/Logic')] }
  ] },
  { name: 'CompositeTemplates', kind: 'folder', children: [
    { name: 'Analog', kind: 'folder', children: [{ name: 'LIMIT_ALARM', kind: 'composite-template', description: 'Limit alarm composite' }] }
  ] },
  { name: 'ModuleTemplates', kind: 'folder', children: [
    { name: 'AnalogControl', kind: 'folder', children: [mt('PID_LOOP', 'PID loop'), mt('CASCADE_LOOP', 'Cascade loop')] },
    { name: 'Monitoring', kind: 'folder', children: [
      mt('AALARM', 'Analog alarm'), mt('ANALOG', 'Analog monitoring (AI block)', true),
      mt('DISCRETE', 'Discrete monitoring'), mt('PULSE', 'Pulse input')
    ] },
    { name: 'Motors-2State', kind: 'folder', children: [mt('MTR_1_SPEED', 'Single speed motor')] },
    { name: 'Motors-3State', kind: 'folder', children: [mt('MTR_2_SPEED', 'Two speed motor')] },
    { name: 'Simulation', kind: 'folder', children: [mt('SIM_TANK', 'Tank simulation')] }
  ] }
]

export function findTemplate(name: string, nodes: TemplateNode[] = LIBRARY_TEMPLATES, path: string[] = []): { node: TemplateNode; path: string[] } | null {
  for (const node of nodes) {
    if (node.kind !== 'folder' && node.name === name) return { node, path: [...path, node.name] }
    const hit = node.children ? findTemplate(name, node.children, [...path, node.name]) : null
    if (hit) return hit
  }
  return null
}

export interface ClassCategory { name: string; parent: string | null; description: string }

export interface ControlModuleClass {
  name: string
  category: string
  template: string
  definition: ModuleDefinition
  /** Increments on every Save from Control Studio. */
  revision: number
}

export interface ClassInstance {
  tag: string
  className: string
  area: string
  /** Instance values for "Allow instance value to be configured" parameters (path → value). */
  overrides: Record<string, ParamValue>
}

export const DEFAULT_CATEGORIES: ClassCategory[] = [
  { name: '2StateMotor', parent: null, description: 'Two-state motor classes' },
  { name: 'General', parent: null, description: 'General classes' },
  { name: 'NC_Valves', parent: null, description: 'Normally closed valve classes' }
]

// ---------------------------------------------------------------------------
// ANALOG module template (Library > ModuleTemplates > Monitoring > ANALOG)

const p = (type: ParamType, category: ParamDef['category'], value: ParamValue, description: string,
  allowInstance = false, extra: Partial<ParamDef> = {}): ParamDef => ({ type, category, value, description, allowInstance, ...extra })

export const L_TYPE_OPTIONS = ['Direct', 'Indirect', 'Indirect Square Root']
export const MODE_OPTIONS = ['AUTO', 'MAN', 'OOS']
export const IO_OPTS_OPTIONS = ['Low cutoff']
export const ENGINEERING_UNITS = ['no units', '%', 'gal', 'GPM', 'L', 'kg', 'lb', 'in', 'ft', 'degC', 'degF', 'psig', 'kPa']

export function analogTemplate(): ModuleDefinition {
  return {
    description: 'Analog monitoring',
    primaryDisplay: '',
    detailDisplay: '',
    instrumentDisplay: '',
    blocks: {
      AI1: { name: 'AI1', type: 'AI', x: 300, y: 70, params: {
        ALARM_HYS: p('float', 'Alarms', 0.5, 'Alarm hysteresis (% of OUT_SCALE)', true, { units: '%' }),
        HI_HI_LIM: p('float', 'Alarms', 95, 'HI HI alarm limit', true),
        HI_LIM: p('float', 'Alarms', 90, 'HI alarm limit', true),
        IO_IN: p('ioref', 'I/O', '', 'I/O channel path (DST)', true),
        IO_OPTS: p('bitstring', 'Options', [], 'I/O options', true, { options: IO_OPTS_OPTIONS }),
        L_TYPE: p('enum', 'I/O', 'Indirect', 'Linearization type', false, { options: L_TYPE_OPTIONS }),
        LO_LIM: p('float', 'Alarms', 10, 'LO alarm limit', true),
        LO_LO_LIM: p('float', 'Alarms', 5, 'LO LO alarm limit', true),
        LOW_CUT: p('float', 'Options', 0, 'Low cutoff (OUT_SCALE units)'),
        MODE: p('mode', 'Mode', 'AUTO', 'Block mode (target)', true, { options: MODE_OPTIONS }),
        OUT: p('dynamic', 'Process', 0, 'Block output', false, { readOnly: true }),
        OUT_SCALE: p('scale', 'I/O', { hi: 100, lo: 0, units: 'no units', decimals: 1 }, 'Output scaling'),
        PV: p('dynamic', 'Process', 0, 'Process value', false, { readOnly: true }),
        PV_FTIME: p('float', 'Process', 0, 'PV filter time constant (s)', true, { units: 's' }),
        SIMULATE: p('simulate', 'Simulate', { enabled: false, value: 0 }, 'Simulate enable and value'),
        SIMULATE_IN: p('connector', 'Simulate', 0, 'Simulate input connector', false, { readOnly: true }),
        XD_SCALE: p('scale', 'I/O', { hi: 100, lo: 0, units: '%', decimals: 1 }, 'Transducer scaling')
      } }
    },
    params: {
      VERSION: p('string', 'Other', '1', 'Module version', true)
    },
    wires: [],
    alarms: {
      HI_ALM: { type: 'HI', parameter: 'AI1/HI_LIM', priority: 'WARNING', enabled: true },
      LO_ALM: { type: 'LO', parameter: 'AI1/LO_LIM', priority: 'WARNING', enabled: true }
    }
  }
}

export const TEMPLATE_DEFINITIONS: Record<string, () => ModuleDefinition> = { ANALOG: analogTemplate }

// ---------------------------------------------------------------------------
// Helpers

export function cloneDefinition(d: ModuleDefinition): ModuleDefinition {
  return JSON.parse(JSON.stringify(d)) as ModuleDefinition
}

export function libraryNameError(name: string, kind: 'Category' | 'Class'): string | null {
  return isValidDeltaVTag(name) ? null :
    `${kind} names must be 1-16 characters, contain a letter, and use only letters, digits, $, - or _.`
}

/** Path → ParamDef for every parameter (module-level "LEVEL_IN", block-level "AI1/OUT_SCALE"). */
export function allParams(d: ModuleDefinition): { path: string; def: ParamDef }[] {
  return [
    ...Object.entries(d.params).map(([name, def]) => ({ path: name, def })),
    ...Object.values(d.blocks).flatMap(b => Object.entries(b.params).map(([name, def]) => ({ path: `${b.name}/${name}`, def })))
  ]
}

export function getParam(d: ModuleDefinition, path: string): ParamDef | undefined {
  const [first, second] = path.split('/')
  return second === undefined ? d.params[first] : d.blocks[first]?.params[second]
}

/** DeltaV Explorer shows block parameters with a $ separator (AI1$OUT_SCALE). */
export const explorerName = (path: string): string => path.replace('/', '$')
export const pathFromExplorerName = (name: string): string => name.replace('$', '/')

/** External references are always configurable on the instance; everything else follows the class flag. */
export function instanceConfigurable(def: ParamDef): boolean {
  return !def.readOnly && (def.type === 'extref' || def.allowInstance)
}

/** The right-hand "Contents of 'LI-104'" pane: only instance-configurable parameters, alphabetical. */
export function configurableParams(d: ModuleDefinition): { path: string; name: string; def: ParamDef }[] {
  return allParams(d).filter(x => instanceConfigurable(x.def))
    .map(x => ({ ...x, name: explorerName(x.path) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function sameValue(a: ParamValue | undefined, b: ParamValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Class definition with the instance's allowed overrides applied. */
export function resolveInstance(cls: ControlModuleClass, inst: ClassInstance): ModuleDefinition {
  const d = cloneDefinition(cls.definition)
  for (const [path, value] of Object.entries(inst.overrides)) {
    const def = getParam(d, path)
    if (def && instanceConfigurable(def)) def.value = JSON.parse(JSON.stringify(value)) as ParamValue
  }
  return d
}

/** Overrides that remain valid once the class has been saved (unchecking "Allow instance" reverts instances). */
export function pruneOverrides(d: ModuleDefinition, overrides: Record<string, ParamValue>): Record<string, ParamValue> {
  return Object.fromEntries(Object.entries(overrides).filter(([path]) => {
    const def = getParam(d, path)
    return !!def && instanceConfigurable(def)
  }))
}

/** LEVEL_INDICATOR → LEVEL_INDIC_1 (first 11 characters, lowest unused number). */
export function defaultInstanceName(className: string, used: (tag: string) => boolean): string {
  const stem = className.slice(0, 11)
  for (let n = 1; ; n++) {
    const tag = `${stem}_${n}`
    if (!used(tag)) return tag
  }
}

export function defaultClassName(template: string, used: (name: string) => boolean): string {
  if (!used(template)) return template
  for (let n = 1; ; n++) {
    const name = `${template.slice(0, 13)}_${n}`
    if (!used(name)) return name
  }
}

export function defaultSpecialName(d: ModuleDefinition, item: SpecialItemKind): string {
  const stem = item === 'INPUT' ? 'IN' : 'OUT'
  for (let n = 1; ; n++) if (!d.params[`${stem}${n}`] && !d.blocks[`${stem}${n}`]) return `${stem}${n}`
}

export function scaleError(s: ScaleValue): string | null {
  if (!Number.isFinite(s.hi) || !Number.isFinite(s.lo)) return 'Scale limits must be numbers'
  if (s.hi <= s.lo) return '100% scale must be greater than 0% scale'
  if (!Number.isInteger(s.decimals) || s.decimals < 0 || s.decimals > 6) return 'Decimal places must be 0-6'
  return null
}

const EXT_PATH = /^[A-Za-z0-9_$-]+(\/[A-Za-z0-9_$-]+)+(\.(CV|ST))?$/i
export function externalPathError(path: string): string | null {
  if (!path.trim()) return null
  return EXT_PATH.test(path.trim()) ? null : 'External reference paths look like MODULE/PARAMETER (for example TANKSIM/TKLEV100)'
}

export function paramValueError(def: ParamDef, value: ParamValue): string | null {
  switch (def.type) {
    case 'scale': return scaleError(value as ScaleValue)
    case 'float': case 'fstatus': return Number.isFinite(value as number) ? null : 'Value must be a number'
    case 'simulate': return Number.isFinite((value as SimulateValue).value) ? null : 'Simulate value must be a number'
    case 'enum': case 'mode': return def.options?.includes(value as string) ? null : `Value must be one of ${def.options?.join(', ')}`
    case 'extref': case 'intref': return externalPathError(value as string)
    case 'bitstring': return (value as string[]).every(v => def.options?.includes(v)) ? null : 'Unknown option'
    default: return null
  }
}

export function formatParamValue(def: ParamDef, value: ParamValue = def.value): string {
  switch (def.type) {
    case 'scale': { const s = value as ScaleValue; return `${s.lo}-${s.hi} ${s.units}` }
    case 'simulate': { const s = value as SimulateValue; return `${s.enabled ? 'Enabled' : 'Disabled'}, ${s.value}` }
    case 'bitstring': return (value as string[]).join(', ') || '(none)'
    case 'extref': case 'intref': case 'ioref': return (value as string) || '(not configured)'
    default: return String(value)
  }
}

// ---------------------------------------------------------------------------
// Diagram editing (Control Studio)

export function wireError(d: ModuleDefinition, from: string, to: string): string | null {
  const source = from.includes('/') ? from : d.params[from]
  if (!source) return `${from} is not a connectable output`
  if (from.includes('/')) {
    const [block, pin] = from.split('/')
    if (!d.blocks[block] || !BLOCK_PINS[d.blocks[block].type].outputs.includes(pin)) return `${from} is not an output`
  } else if (d.params[from].special?.item !== 'INPUT') return `${from} is not an input parameter`
  if (to.includes('/')) {
    const [block, pin] = to.split('/')
    if (!d.blocks[block] || !BLOCK_PINS[d.blocks[block].type].inputs.includes(pin)) return `${to} is not an input`
  } else if (d.params[to]?.special?.item !== 'OUTPUT') return `${to} is not an output parameter`
  if (from.split('/')[0] === to.split('/')[0]) return 'A block cannot be wired to itself'
  if (d.wires.some(w => w.to === to)) return `${to} already has a connection`
  return null
}

// ---------------------------------------------------------------------------
// Execution (controller) — AI block with SIMULATE / SIMULATE_IN, L_TYPE, PV_FTIME

export interface AiRuntime { pv: number; bad: boolean; status: string }
export type ReferenceReader = (path: string) => { value: number; bad: boolean } | null

const num = (d: ModuleDefinition, path: string, fallback = 0): number => {
  const v = getParam(d, path)?.value
  return typeof v === 'number' ? v : fallback
}

export function executeAi(d: ModuleDefinition, read: ReferenceReader, previous: number | undefined, dt: number): AiRuntime {
  const ai = d.blocks.AI1
  if (!ai) return { pv: previous ?? 0, bad: true, status: 'No AI1 block' }
  const mode = ai.params.MODE?.value as string
  if (mode === 'OOS') return { pv: previous ?? 0, bad: true, status: 'Out of service (OOS)' }
  const out = ai.params.OUT_SCALE.value as ScaleValue
  const xd = ai.params.XD_SCALE.value as ScaleValue
  const sim = ai.params.SIMULATE.value as SimulateValue
  let raw: number
  if (sim.enabled) {
    const wire = d.wires.find(w => w.to === 'AI1/SIMULATE_IN')
    if (!wire) raw = sim.value
    else {
      const src = d.params[wire.from]
      if (!src) return { pv: previous ?? 0, bad: true, status: `SIMULATE_IN source ${wire.from} is missing` }
      if (src.type === 'fstatus') raw = src.value as number
      else {
        const path = (src.value as string).trim()
        if (!path) return { pv: previous ?? 0, bad: true, status: `Bad: ${wire.from} external reference path is not configured` }
        const v = read(path)
        if (!v) return { pv: previous ?? 0, bad: true, status: `Bad: unresolved reference ${wire.from} → ${path}` }
        if (v.bad) return { pv: previous ?? 0, bad: true, status: `Bad: ${path} status is Bad` }
        raw = v.value
      }
    }
  } else {
    const io = (ai.params.IO_IN.value as string).trim()
    return { pv: previous ?? 0, bad: true, status: io ? `Bad: I/O channel ${io} is not available` : 'Bad: IO_IN is not configured and SIMULATE is disabled' }
  }
  if (mode === 'MAN') return { pv: previous ?? raw, bad: false, status: 'Manual (OUT held)' }
  const ltype = ai.params.L_TYPE.value as string
  const xspan = xd.hi - xd.lo || 1
  const pct = (raw - xd.lo) / xspan
  let pv = ltype === 'Direct' ? raw :
    ltype === 'Indirect Square Root' ? out.lo + Math.sqrt(Math.max(0, pct)) * (out.hi - out.lo) :
      out.lo + pct * (out.hi - out.lo)
  const opts = ai.params.IO_OPTS.value as string[]
  if (opts.includes('Low cutoff') && pv < num(d, 'AI1/LOW_CUT')) pv = out.lo
  const ftime = num(d, 'AI1/PV_FTIME')
  if (ftime > 0 && previous !== undefined && Number.isFinite(previous)) pv = previous + (pv - previous) * Math.min(1, dt / (ftime + dt))
  return { pv, bad: false, status: sim.enabled ? 'Good (simulated)' : 'Good' }
}

// ---------------------------------------------------------------------------
// DV_School ED_CENTER_BATCH process: three color tanks (100/200/300) feeding
// two blenders (500/600), and BASE 400 (FEED_TANK_AREA) pumped by MTR-403 under
// FIC-404 through XV-501 / XV-601. TANKSIM, LEV500-SIM, LEV600-SIM and LEVEL-401
// publish the levels.

export interface CourseProcess { tk100: number; tk200: number; tk300: number; bl500: number; bl600: number; bs400: number; baseFlow: number }
export const COLOR_TANK_CAPACITY = 500
export const BLENDER_CAPACITY = 1000
export const BASE_CAPACITY = 2000
export const FILL_RATE = 6
/** Inlet valve capacities differ per color tank (gal/s), so the fill overshoot differs per unit (Chapter 4 optional exercise). */
export const TANK_FILL_RATE: Record<'tk100' | 'tk200' | 'tk300', number> = { tk100: FILL_RATE, tk200: 8, tk300: 5 }
/** Color dump through a fully open (BULK) blender color valve, gal/s; DRIBBLE passes a fifth of it. */
export const COLOR_DRAIN_RATE = 5
export const DRIBBLE_FRACTION = 0.2
export const BLENDER_DRAIN_RATE = 8
/** FIC-404 at 100 % output with MTR-403 running (GPM). */
export const BASE_MAX_FLOW = 150

export interface SimModule { tag: string; area: string; description: string; params: Record<string, keyof CourseProcess> }

export const COURSE_SIMS: SimModule[] = [
  { tag: 'TANKSIM', area: 'ED_CENTER_BATCH', description: 'Color tank level simulation', params: { TKLEV100: 'tk100', TKLEV200: 'tk200', TKLEV300: 'tk300' } },
  { tag: 'LEV500-SIM', area: 'ED_CENTER_BATCH', description: 'Blender 500 level simulation', params: { '500_LEV': 'bl500' } },
  { tag: 'LEV600-SIM', area: 'ED_CENTER_BATCH', description: 'Blender 600 level simulation', params: { '600_LEV': 'bl600' } },
  { tag: 'LEVEL-401', area: 'FEED_TANK_AREA', description: 'Base 400 level simulation', params: { '401_LEV': 'bs400', FLOW: 'baseFlow' } }
]

export function initialCourseProcess(): CourseProcess { return { tk100: 40, tk200: 30, tk300: 50, bl500: 250, bl600: 120, bs400: 1500, baseFlow: 0 } }

/** Signals the process reads from the control modules each step. */
export interface CourseIo {
  open: (tag: string) => boolean
  /** Blender color valve position: 0 closed, 1 DRIBBLE, 2 BULK (single-stage valves report 2 when open). */
  stage: (tag: string) => number
  running: (tag: string) => boolean
  /** FIC-404 applied output, %. */
  baseOut: number
}

/** Material moved this step on each path (gallons; agitator entries are seconds of running). */
export type CourseFlows = Record<string, number>

export function stepCourseProcess(p: CourseProcess, io: CourseIo, dt: number): { process: CourseProcess; flows: CourseFlows } {
  const next = { ...p }
  const flows: CourseFlows = {}
  const add = (k: string, v: number): void => { if (v > 0) flows[k] = (flows[k] ?? 0) + v }
  for (const n of [1, 2, 3] as const) {
    const key = `tk${n}00` as 'tk100' | 'tk200' | 'tk300'
    if (io.open(`XV-${n}01`)) {
      const added = Math.min(COLOR_TANK_CAPACITY - next[key], TANK_FILL_RATE[key] * dt)
      next[key] += added
      add(`TK${n}00 FILL`, added)
    }
    if (!io.open(`XV-${n}02`)) continue
    const dests = ([['bl500', 'XV-502'], ['bl600', 'XV-602']] as const)
      .map(([bl, xv]) => ({ bl, factor: io.stage(xv) >= 2 ? 1 : io.stage(xv) === 1 ? DRIBBLE_FRACTION : 0 }))
      .filter(d => d.factor > 0)
    if (!dests.length) continue
    for (const d of dests) {
      const moved = Math.max(0, Math.min(next[key], COLOR_DRAIN_RATE * d.factor * dt / dests.length, BLENDER_CAPACITY - next[d.bl]))
      next[d.bl] += moved
      next[key] -= moved
      add(`TK${n}00>${d.bl.toUpperCase()}`, moved)
    }
  }
  // BASE 400 → blenders: MTR-403 with FIC-404 throttling, first-order flow response.
  const baseDests = ([['bl500', 'XV-501'], ['bl600', 'XV-601']] as const).filter(([, xv]) => io.open(xv)).map(([bl]) => bl)
  const baseCmd = io.running('MTR-403') && baseDests.length && next.bs400 > 0 ? Math.max(0, Math.min(100, io.baseOut)) / 100 * BASE_MAX_FLOW : 0
  next.baseFlow += (baseCmd - next.baseFlow) * Math.min(1, dt / 2)
  if (next.baseFlow < 0.05 && baseCmd === 0) next.baseFlow = 0
  if (baseDests.length && next.baseFlow > 0) {
    for (const bl of baseDests) {
      const moved = Math.max(0, Math.min(next.bs400, next.baseFlow / 60 * dt / baseDests.length, BLENDER_CAPACITY - next[bl]))
      next[bl] += moved
      next.bs400 -= moved
      add(`BASE>${bl.toUpperCase()}`, moved)
    }
  }
  for (const [blender, mtr, product, waste, agit] of [['bl500', 'MTR-505', 'XV-503', 'XV-504', 'AGIT-503'], ['bl600', 'MTR-605', 'XV-603', 'XV-604', 'AGIT-603']] as const) {
    if (io.running(agit)) add(`${agit} RUN`, dt)
    const outs = [[product, 'PRODUCT'], [waste, 'WASTE']].filter(([xv]) => io.open(xv))
    if (!io.running(mtr) || !outs.length) continue
    const total = Math.min(next[blender], BLENDER_DRAIN_RATE * dt)
    next[blender] -= total
    for (const [, dest] of outs) add(`${blender.toUpperCase()}>${dest}`, total / outs.length)
  }
  return { process: next, flows }
}
/** MODULE/PARAM[.CV] → normalized { module, param }. */
export function parseReference(path: string): { module: string; param: string } | null {
  const clean = path.trim().replace(/\.(CV|ST)$/i, '')
  const parts = clean.split('/')
  if (parts.length < 2 || parts.some(x => !x)) return null
  return { module: parts[0].toUpperCase(), param: parts.slice(1).join('/').toUpperCase() }
}

export function simParamPaths(sims: SimModule[]): string[] {
  return sims.flatMap(s => Object.keys(s.params).map(param => `${s.tag}/${param}`))
}
