import { isValidDeltaVTag } from './naming'
import { checkExpression, evalCondition, runProgram, EvalError, type CheckEnv, type EvalEnv, type Value } from './phaseExpr'

// Course 7016 Chapter 4 (FILL Unit Phase): Process Cell Classes, Unit Classes with
// aliases, Phase Classes with batch parameters and composite-state phase logic,
// Process Cells, Unit Modules (unit phases, alias resolution, contained modules)
// and the S88.01 phase state machine (p4-17 / p4-53).

export type BatchClassKind = 'pcell' | 'unit' | 'phase'

export interface BatchCategory { name: string; kind: BatchClassKind; parent: string | null }
export interface ProcessCellClass { name: string; category: string; description: string }
export interface AliasDef { name: string; description: string; /** Created for a module block (Chapter 5); renamed with the block. */ block?: boolean }
/** A Module Class added to a Unit Class (p5-26 / 5-27). */
export interface ModuleBlock { name: string; className: string; kind: 'em' | 'cm'; ownership: 'Private' | 'Shared'; allowVariant: boolean }
export interface UnitClass {
  name: string
  category: string
  description: string
  aliases: Record<string, AliasDef>
  phaseClasses: string[]
  modules?: Record<string, ModuleBlock>
  /** Instance counter for module block names (AGITATOR1, AGITATOR2 ...). */
  seq?: number
}

export type BatchParamType = 'Integer' | 'Real' | 'String'
export type PhaseParamKind = 'batch' | 'algorithm' | 'message'
export interface PhaseParamDef {
  name: string
  kind: PhaseParamKind
  /** Parameter category grouping, e.g. Operating or Report. */
  group: string
  type: BatchParamType
  /** Batch input/report parameters: Input = information to the phase (green), Report = from the phase (yellow). */
  direction: 'Input' | 'Report'
  id: number
  scalable: boolean
  low: number
  high: number
  defaultValue: number | string
  units: string
  description: string
}

export type ActionType = 'Assignment' | 'Boolean'
export type ActionQualifier = 'N' | 'P' | 'S' | 'R' | 'D' | 'L'
export const QUALIFIER_LABEL: Record<ActionQualifier, string> = {
  N: 'N - Non-stored', P: 'P - Pulse', S: 'S - Stored', R: 'R - Reset', D: 'D - Time delayed', L: 'L - Time limited'
}
export interface ActionDef { name: string; description: string; type: ActionType; qualifier: ActionQualifier; time: number; expression: string }
export interface StepDef { id: string; name: string; description: string; actions: ActionDef[] }
export interface TransitionDef { id: string; name: string; description: string; condition: string }
/** A composite-state sequence: steps[i] is followed by transitions[i]; after the last transition the sequence terminates. */
export interface PhaseSfc { steps: StepDef[]; transitions: TransitionDef[] }

export type CompositeName = 'RUN_LOGIC' | 'HOLD_LOGIC' | 'RESTART_LOGIC' | 'STOP_LOGIC' | 'ABORT_LOGIC' | 'FAIL_MONITOR'
export const COMPOSITES: CompositeName[] = ['ABORT_LOGIC', 'FAIL_MONITOR', 'HOLD_LOGIC', 'RESTART_LOGIC', 'RUN_LOGIC', 'STOP_LOGIC']

export interface PhaseClass {
  name: string
  category: string
  description: string
  params: Record<string, PhaseParamDef>
  logic: Record<CompositeName, PhaseSfc>
  revision: number
}

export interface ProcessCell { name: string; className: string; area: string; description: string }
export interface AliasResolution { path: string; ignore: boolean; description: string }
export type PhaseType = 'Controller' | 'Disabled' | 'External Phase'
export interface UnitPhaseConfig {
  name: string
  phaseClass: string
  description: string
  phaseType: PhaseType
  scanRate: number
  alwaysInMemory: boolean
  simulate: boolean
  /** Uploaded per-unit-phase parameter values (instead of the phase class default). */
  paramValues: Record<string, number | string>
}
export interface UnitModule {
  name: string
  unitClass: string
  processCell: string
  description: string
  workInProgress: boolean
  primaryDisplay: string
  detailDisplay: string
  instrumentDisplay: string
  scanRate: number
  aliases: Record<string, AliasResolution>
  phases: Record<string, UnitPhaseConfig>
  /** Module block → module instance created (Private) or bound (Shared, null while unbound). */
  blocks?: Record<string, string | null>
  modified: number
  modifiedBy: string
}

export const SYSTEM_PHASE_PARAMS: [string, string][] = [
  ['AUTO_RESTART', 'False'], ['BATCH_ID', ''], ['BCOMMAND', '0'], ['BSTATUS', 'Idle'], ['CLASS', ''], ['COMMANDMASK', '0'],
  ['DOWNLOAD_REQ', 'False'], ['FAIL_INDEX', 'OK'], ['OWNER', 'DeltaV Batch'], ['PAUSE_REQ', 'False'], ['PAUSED', 'False'],
  ['REQDATA1', '0'], ['REQDATA2', '0'], ['REQDATA3', '0'], ['REQDATA4', '0'], ['REQDATA5', '0'], ['REQUEST', '0'],
  ['RESTART_TYPE', '0'], ['SINGLE_STEP', 'False'], ['SIZE', '0'], ['STATE_TIME', '0'], ['STATUS', '0'], ['STEP_INDEX', '0'],
  ['SWITCHED_OVER', 'False'], ['TIME', '0'], ['TOO_LONG_TIME', '0'], ['UNIT', ''], ['WATCHDOG', '0'], ['WDOG_STATE', 'OK'],
  ['WDOG_TIME', '0'], ['XCOMMAND', '0']
]
export const COMPOSITE_PARAMS: [string, string][] = [
  ['AUTO_ADVANCE', 'True'], ['COMMAND', 'Start Sequence'], ['CONFIRM_FAIL', 'False'], ['ERROR', 'False'],
  ['INITIAL_STATE', 'Sequence ...'], ['RERROR', 'False'], ['STATE', 'Sequence ...'], ['STATUS', '']
]
export const UNIT_CLASS_PARAMS = ['FREMEM', 'NUMPHASES']
export const UNIT_MODULE_PARAMS = ['ABNORM_ACTIVE', 'ALARMENB', 'AUTO_RESTART', 'BAD_ACTIVE', 'BATCH_ID', 'FREMEM', 'MODE', 'NUMPHASES', 'OWNER_ID', 'UNIT_STATE']

export function isNameValid(name: string): boolean { return isValidDeltaVTag(name) }
export const NAME_RULE = 'Names must be 1-16 characters, contain a letter, and use only letters, digits, $, - or _.'

let idSeq = 0
export const newId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(++idSeq).toString(36)}`

export function defaultSfc(): PhaseSfc {
  return { steps: [{ id: newId('s'), name: 'S1', description: '', actions: [] }], transitions: [{ id: newId('t'), name: 'T1', description: '', condition: 'TRUE' }] }
}

export function newPhaseClass(name: string, category: string): PhaseClass {
  return {
    name, category, description: '', params: {}, revision: 1,
    logic: Object.fromEntries(COMPOSITES.map(c => [c, defaultSfc()])) as Record<CompositeName, PhaseSfc>
  }
}

export function sfcNames(sfc: PhaseSfc): string[] {
  return [...sfc.steps.map(s => s.name), ...sfc.transitions.map(t => t.name)]
}

export function nextName(sfc: PhaseSfc, prefix: 'S' | 'T'): string {
  const used = new Set(sfcNames(sfc).map(n => n.toUpperCase()))
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}

/** Insert `count` connected step/transition pairs after step `afterIndex` (Palette ▸ Sequence, p4-19). */
export function insertSequence(sfc: PhaseSfc, afterIndex: number, count: number): PhaseSfc {
  const out: PhaseSfc = { steps: [...sfc.steps], transitions: [...sfc.transitions] }
  const at = Math.max(0, Math.min(afterIndex + 1, out.steps.length))
  for (let i = 0; i < count; i++) {
    const step: StepDef = { id: newId('s'), name: nextName(out, 'S'), description: '', actions: [] }
    out.steps.splice(at + i, 0, step)
    const tr: TransitionDef = { id: newId('t'), name: nextName(out, 'T'), description: '', condition: 'TRUE' }
    out.transitions.splice(at + i, 0, tr)
  }
  return out
}

export function deleteStep(sfc: PhaseSfc, index: number): PhaseSfc | string {
  if (sfc.steps.length <= 1) return 'A sequence needs at least its initial step'
  return { steps: sfc.steps.filter((_, i) => i !== index), transitions: sfc.transitions.filter((_, i) => i !== index) }
}

export function renameError(sfc: PhaseSfc, oldName: string, next: string): string | null {
  if (!isNameValid(next)) return NAME_RULE
  if (next.toUpperCase() !== oldName.toUpperCase() && sfcNames(sfc).some(n => n.toUpperCase() === next.toUpperCase())) return `${next} is already used in this sequence`
  return null
}

export function paramDefError(p: PhaseParamDef, existing: Record<string, PhaseParamDef>, original?: string): string | null {
  if (!isNameValid(p.name)) return NAME_RULE
  if (p.name !== original && (existing[p.name] || SYSTEM_PHASE_PARAMS.some(([n]) => n === p.name) || COMPOSITES.includes(p.name as CompositeName)))
    return `${p.name} already exists in this phase class`
  if (!p.group.trim()) return 'Enter a parameter category'
  if (p.kind === 'batch' && p.type !== 'String') {
    if (!Number.isFinite(p.low) || !Number.isFinite(p.high)) return 'Limits must be numbers'
    if (p.low > p.high) return 'The low limit must not exceed the high limit'
    if (p.direction === 'Input') {
      const d = Number(p.defaultValue)
      if (!Number.isFinite(d)) return 'The default value must be a number'
      if (d < p.low || d > p.high) return 'Low limit <= Default value <= High limit'
      if (p.type === 'Integer' && !Number.isInteger(d)) return 'An Integer parameter needs a whole-number default'
    }
  }
  return null
}

export function newParam(kind: PhaseParamKind, existing: Record<string, PhaseParamDef>): PhaseParamDef {
  let n = 1
  while (existing[`PARAM${n}`]) n++
  return {
    name: `PARAM${n}`, kind, group: kind === 'batch' ? 'Operating' : kind === 'message' ? 'Messages' : 'Algorithm',
    type: kind === 'message' ? 'String' : 'Integer', direction: 'Input', id: Object.keys(existing).length + 1,
    scalable: kind === 'batch', low: 0, high: 100, defaultValue: kind === 'message' ? '' : 0, units: '', description: ''
  }
}

// ---------------------------------------------------------------------------
// Phase state machine (S88.01, p4-53)

export type PhaseState = 'IDLE' | 'RUNNING' | 'HOLDING' | 'HELD' | 'RESTARTING' | 'COMPLETE' | 'STOPPING' | 'STOPPED' | 'ABORTING' | 'ABORTED'
export const STATE_LABEL: Record<PhaseState, string> = {
  IDLE: 'Idle', RUNNING: 'Running', HOLDING: 'Holding', HELD: 'Held', RESTARTING: 'Restarting', COMPLETE: 'Complete',
  STOPPING: 'Stopping', STOPPED: 'Stopped', ABORTING: 'Aborting', ABORTED: 'Aborted'
}
export type PhaseCommand = 'START' | 'HOLD' | 'RESTART' | 'STOP' | 'ABORT' | 'RESET'
export const COMMAND_LABEL: Record<PhaseCommand, string> = { START: 'Start', HOLD: 'Hold', RESTART: 'Restart', STOP: 'Stop', ABORT: 'Abort', RESET: 'Reset' }
export const COMMANDS_FOR: Record<PhaseState, PhaseCommand[]> = {
  IDLE: ['START'], RUNNING: ['HOLD', 'STOP', 'ABORT'], HOLDING: ['STOP', 'ABORT'], HELD: ['RESTART', 'STOP', 'ABORT'],
  RESTARTING: ['HOLD', 'STOP', 'ABORT'], COMPLETE: ['RESET'], STOPPING: ['ABORT'], STOPPED: ['RESET'], ABORTING: [], ABORTED: ['RESET']
}
const COMPOSITE_OF: Partial<Record<PhaseState, CompositeName>> = {
  RUNNING: 'RUN_LOGIC', HOLDING: 'HOLD_LOGIC', RESTARTING: 'RESTART_LOGIC', STOPPING: 'STOP_LOGIC', ABORTING: 'ABORT_LOGIC'
}
const DONE_STATE: Partial<Record<PhaseState, PhaseState>> = {
  RUNNING: 'COMPLETE', HOLDING: 'HELD', RESTARTING: 'RUNNING', STOPPING: 'STOPPED', ABORTING: 'ABORTED'
}
export const compositeOf = (state: PhaseState): CompositeName | undefined => COMPOSITE_OF[state]

export interface SeqPos { step: number; stepTime: number; executed: string[]; done: boolean }
export interface PhaseRuntime {
  state: PhaseState
  stateTime: number
  lastCommand: PhaseCommand | null
  seq: SeqPos | null
  /** RUN_LOGIC position saved while Holding/Held/Restarting; RUNNING resumes from it. */
  runPos: SeqPos | null
  params: Record<string, Value>
  failIndex: string
  message: string
}

export function newRuntime(params: Record<string, Value>): PhaseRuntime {
  return { state: 'IDLE', stateTime: 0, lastCommand: null, seq: null, runPos: null, params, failIndex: 'OK', message: '' }
}
const freshSeq = (): SeqPos => ({ step: 0, stepTime: 0, executed: [], done: false })

/** Apply an operator/Batch command; returns an error message or the next runtime. */
export function commandPhase(rt: PhaseRuntime, cmd: PhaseCommand): PhaseRuntime | string {
  if (!COMMANDS_FOR[rt.state].includes(cmd)) return `${COMMAND_LABEL[cmd]} is not valid while the phase is ${STATE_LABEL[rt.state]}`
  const next: PhaseRuntime = { ...rt, lastCommand: cmd, stateTime: 0 }
  switch (cmd) {
    case 'START':
      if (rt.failIndex !== 'OK') return 'The phase cannot start while a failure is active; Reset it first'
      return { ...next, state: 'RUNNING', seq: freshSeq(), runPos: null, message: '' }
    case 'HOLD':
      return { ...next, state: 'HOLDING', runPos: rt.state === 'RUNNING' ? rt.seq : rt.runPos, seq: freshSeq() }
    case 'RESTART':
      if (rt.failIndex !== 'OK') return 'The phase cannot restart while a failure is active'
      return { ...next, state: 'RESTARTING', seq: freshSeq() }
    case 'STOP':
      return { ...next, state: 'STOPPING', seq: freshSeq() }
    case 'ABORT':
      return { ...next, state: 'ABORTING', seq: freshSeq() }
    case 'RESET':
      return { ...next, state: 'IDLE', seq: null, runPos: null, failIndex: 'OK', message: '' }
  }
}

export interface PhaseEnv extends EvalEnv { failed?: (message: string) => void }

/** Advance one scan of the active composite sequence. */
export function stepPhase(rt: PhaseRuntime, logic: Record<CompositeName, PhaseSfc>, env: PhaseEnv, dt: number): PhaseRuntime {
  let next: PhaseRuntime = { ...rt, stateTime: rt.stateTime + dt }
  const composite = COMPOSITE_OF[rt.state]
  if (!composite || !rt.seq) return next
  const sfc = logic[composite]
  const pos: SeqPos = { ...rt.seq, stepTime: rt.seq.stepTime + dt, executed: [...rt.seq.executed] }
  try {
    if (!pos.done) {
      const step = sfc.steps[pos.step]
      if (!step) pos.done = true
      else {
        for (const a of step.actions) {
          if (pos.executed.includes(a.name)) continue
          if (a.qualifier === 'D' && pos.stepTime < a.time) continue
          if (a.expression.trim()) runProgram(a.expression, env)
          pos.executed.push(a.name)
        }
        const allDone = step.actions.every(a => pos.executed.includes(a.name))
        const tr = sfc.transitions[pos.step]
        if (allDone && (!tr || !tr.condition.trim() || evalCondition(tr.condition, env))) {
          if (pos.step + 1 >= sfc.steps.length) pos.done = true
          else Object.assign(pos, { step: pos.step + 1, stepTime: 0, executed: [] })
        }
      }
    }
  } catch (e) {
    const message = e instanceof EvalError || e instanceof SyntaxError ? e.message : String((e as Error).message ?? e)
    env.failed?.(`${composite}/${sfc.steps[pos.step]?.name ?? ''}: ${message}`)
    const failNext: PhaseState = rt.state === 'RUNNING' || rt.state === 'RESTARTING' ? 'HOLDING' : DONE_STATE[rt.state] ?? rt.state
    return { ...next, failIndex: 'FAILED', message, state: failNext, stateTime: 0,
      runPos: rt.state === 'RUNNING' ? rt.seq : rt.runPos, seq: failNext === 'HOLDING' ? freshSeq() : null }
  }
  next = { ...next, seq: pos }
  if (pos.done) {
    const target = DONE_STATE[rt.state]!
    next = { ...next, state: target, stateTime: 0, seq: null }
    if (target === 'RUNNING') next.seq = rt.runPos ? { ...rt.runPos } : freshSeq()
    if (target === 'COMPLETE' || target === 'STOPPED' || target === 'ABORTED') next.runPos = null
  }
  return next
}

/** STEP_INDEX: 1-based index of the active step of the active composite (0 when no sequence runs). */
export function stepIndex(rt: PhaseRuntime): number {
  return rt.seq && !rt.seq.done ? rt.seq.step + 1 : 0
}

export function activeStepName(rt: PhaseRuntime, logic: Record<CompositeName, PhaseSfc>): string {
  const c = COMPOSITE_OF[rt.state]
  return c && rt.seq ? logic[c].steps[rt.seq.step]?.name ?? '' : ''
}

export type { CheckEnv, Value }
export { checkExpression }
