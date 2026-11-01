import { create } from 'zustand'
import { useStore } from './store'
import { libraryHooks } from './libraryStore'
import { useBatch, activeKey, unitParamValue } from './batchStore'
import { vcHooks } from './vcHooks'
import { commandPhase, COMMAND_LABEL, STATE_LABEL, type PhaseCommand } from './batchConfig'
import { useSecurity } from './security'
import type { BatchFunction } from './securityTargets'

// Course 7016 Chapter 10: Recipe Studio operations, the Batch Executive (service, equipment, assigned areas and recipes),
// the Batch Operator Interface (batches, prompts, manual phase control, arbitration, journal) and recipe formulas.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never,>(error: string): Result<T> => ({ ok: false, error })

export type RecipeLevel = 'Operation' | 'Unit Procedure' | 'Procedure'
export interface RecipeProduct { name: string; code: string; version: string; author: string; approvedBy: string }
export interface RecipeStep {
  name: string
  /** Phase class for an operation's steps; the referenced operation / unit procedure for unit procedure / procedure steps. */
  phaseClass: string
  description: string
  /** Steps of a procedure that share a group run in parallel (simultaneous divergence); the transition of the group follows them all. */
  group?: number
  /** Procedure steps: the unit alias the unit procedure runs on. */
  unitAlias?: string
  /** Procedure steps (slide 11-13). */
  acquireUnit?: boolean
  retainUnit?: boolean
  keyParam?: string
  /** Phase steps: the number of phase partners for link groups (slide 11-17). */
  partners?: number
}
export interface UnitAlias { name: string; unitClass: string; resolution: 'Defer' | 'Fixed'; unit: string }
export interface RecipeTransition { name: string; condition: string }
/** An alternate transition after a step (slide 12-18): when TRUE the recipe goes back to an earlier step and runs it again. */
export interface RecipeBranch { name: string; from: string; to: string; condition: string }
export interface RecipeParam { name: string; step: string; phaseParam: string; type: 'Integer' | 'Real' | 'String'; defaultValue: number | string; low: number; high: number; units: string }
export interface FormulaValue { useDefault: boolean; value: number | string }
export interface Formula { name: string; operatorCanLoad: boolean; values: Record<string, FormulaValue> }
export interface Recipe {
  name: string
  level: RecipeLevel
  description: string
  workInProgress: boolean
  product: RecipeProduct
  notes: string
  /** Recipe tab (slide 10-30): informational only. */
  batchSize?: { min: number; def: number; max: number }
  units?: string
  duration?: string
  equipment: { mode: 'Unit' | 'Unit Class'; name: string }
  /** Steps in order; transitions[0] follows START (always TRUE) and transitions[i] follows step i. */
  steps: RecipeStep[]
  transitions: RecipeTransition[]
  params: Record<string, RecipeParam>
  formulas: Record<string, Formula>
  /** Procedures: unit aliases (File > Unit Aliases) and link groups (Edit > Link Groups; members are step paths). */
  aliases?: Record<string, UnitAlias>
  linkGroups?: Record<string, string[]>
  /** Operations: alternate transitions that loop back to an earlier step, checked before the trunk transition. */
  branches?: RecipeBranch[]
  revision: number
  modified: number
}

export type BatchState = 'IDLE' | 'RUNNING' | 'HELD' | 'COMPLETE' | 'STOPPED' | 'ABORTED'
export interface Batch {
  id: string
  recipe: string
  formula: string | null
  state: BatchState
  created: number
  started: number | null
  ended: number | null
  /** 0 = at START, i = step i is current. */
  pos: number
  stage: 'acquire' | 'run'
  params: Record<string, number | string>
  failure: string | null
  /** Unit phase this batch is waiting to acquire (owned by the OPERATOR or another recipe). */
  waiting: string | null
  creator: string
  /** Stopping or aborting: the phase is reset and released once it reaches Stopped / Aborted. */
  cleanup: boolean
  /** Unit procedures and procedures run their steps as child batches (parent = the batch that spawned this one). */
  parent?: string
  /** The step of the parent this child runs. */
  step?: string
  /** Unit this operation (or unit procedure) runs on, resolved from the unit binding. */
  unit?: string
  /** Procedure level of the recipe; undefined for a plain operation batch. */
  level?: RecipeLevel
  /** Unit bindings of a root batch: unit alias (#NAME#) or unit class name -> unit ('' = deferred). */
  bindings?: Record<string, string>
}
export interface Prompt { id: number; key: string; batch: string; kind: 'Integer' | 'Float' | 'Boolean' | 'String' | 'Bind'; text: string; messageId: number; at: number; answered: boolean; response: string; choices?: string[] }
export interface JournalEntry { at: number; kind: 'Event' | 'Comment' | 'Prompt' | 'Failure'; batch: string; key: string; text: string; user: string }
export interface DownloadedRecipe { recipe: Recipe; at: number }

export interface ExecutiveState {
  enabled: boolean
  description: string
  restart: 'Query User' | 'Warm Restart' | 'Cold Restart'
  holdPropagation: string
  removeEventFilesDays: number
  /** Server tab revision text. */
  revision: string
  /** Action Confirmation tab (slides 10-25, 10-60). */
  actionConfirm: Record<ConfirmAction, ActionSetting>
  allowSamePerson: boolean
  /** Client Configuration (slide 10-61): the actions every client offers, and whether a local client may narrow them (slides 10-62 .. 10-64). */
  clientAllowLocal: boolean
  clientEnabled: Record<ConfirmAction, boolean>
  localEnabled: Record<ConfirmAction, boolean>
  assignedAreas: string[]
  recipes: Record<string, Recipe>
  drafts: Record<string, Recipe>
  /** Recipe -> how it is assigned to the Batch Executive. */
  assigned: Record<string, 'User' | 'System'>
  downloaded: Record<string, DownloadedRecipe>
  /** Phase signatures the Batch Executive knows (set by Download of the workstation / equipment). */
  equipment: Record<string, string>
  equipmentAt: number | null
  service: 'STOPPED' | 'RUNNING'
  startedAt: number | null
  verify: { total: number; bad: number; bads: string[]; at: number } | null
  batches: Batch[]
  /** Unit phase -> OPERATOR or the recipe that owns it (arbitration). */
  owners: Record<string, string>
  prompts: Prompt[]
  nextPrompt: number
  journal: JournalEntry[]
  /** Last operator commands issued from Phase Control, for tracking. */
  manualBatch: Record<string, string>
  /** Which client the operator is using: the Batch Operator Interface or the DeltaV Operate BatchListView picture. */
  client: 'BOI' | 'Operate'
  setClient: (c: 'BOI' | 'Operate') => void

  setEnabled: (enabled: boolean) => Result<string>
  setServerProps: (p: Partial<Pick<ExecutiveState, 'description' | 'restart' | 'holdPropagation' | 'removeEventFilesDays' | 'revision'>>) => void
  /** Action Confirmation tab: prompt / confirm / verify per action. */
  setActionConfirmation: (settings: Record<ConfirmAction, ActionSetting>, allowSamePerson: boolean) => Result<string>
  /** Client Configuration (on the Batch Executive) and the local client's Config Tool. */
  setClientConfig: (allowLocal: boolean, enabled: Record<ConfirmAction, boolean>) => Result<string>
  setLocalEnabled: (enabled: Record<ConfirmAction, boolean>) => Result<string>
  /** Whether a client offers the action: the Batch Executive allows it and, when local settings are allowed, so does this client. */
  actionEnabled: (action: ConfirmAction) => boolean
  /** Checks the confirmation a configured action needs and records who confirmed / verified it in the Batch Event Journal. */
  authorizeAction: (action: ConfirmAction, subject: string, attempt: ActionAttempt, batchId?: string) => Result<string>
  assignArea: (area: string) => Result<string>
  unassignArea: (area: string) => Result<string>
  newRecipe: (name: string, level?: RecipeLevel) => Result<string>
  deleteRecipe: (name: string) => Result<string>
  renameRecipe: (name: string, next: string) => Result<string>
  setRecipeProps: (name: string, p: Partial<Pick<Recipe, 'description' | 'workInProgress' | 'notes' | 'equipment' | 'batchSize' | 'units' | 'duration'>> & { product?: Partial<RecipeProduct> }) => Result<string>
  /** Recipe Studio draft editing. */
  draftOf: (name: string) => Recipe | undefined
  editDraft: (name: string, edit: (r: Recipe) => string | null | void) => Result<string>
  saveRecipe: (name: string) => Result<string>
  discardDraft: (name: string) => void
  assignRecipe: (name: string) => Result<string>
  verifyRecipe: (name: string) => { errors: string[]; warnings: string[] }
  downloadRecipe: (name: string, opts?: { proceedUnauthorized?: boolean; proceedCheckedOut?: boolean }) => Result<{ warnings: string[] }>
  downloadEquipment: () => Result<number>
  startService: () => Result<string>
  stopService: () => Result<string>
  verifyPhases: () => Result<{ total: number; bad: number }>
  addBatch: (recipe: string, id: string, formula: string | null, bindings?: Record<string, string>) => Result<string>
  /** The unit bindings the Batch Creation dialog shows (slide 11-47): unit aliases and unit classes of class-based recipes. */
  bindingsNeeded: (recipe: string) => BindingNeed[]
  removeBatch: (id: string) => Result<string>
  batchCommand: (id: string, cmd: 'START' | 'HOLD' | 'RESTART' | 'STOP' | 'ABORT' | 'CLEAR_FAILURES') => Result<string>
  addComment: (id: string, text: string) => Result<string>
  answerPrompt: (id: number, response: string) => Result<string>
  acquirePhase: (unit: string, phase: string) => Result<string>
  releasePhase: (unit: string, phase: string) => Result<string>
  manualCommand: (unit: string, phase: string, cmd: PhaseCommand, batchId?: string) => Result<string>
  step: (dt: number) => void
  resetExecutive: () => void
}

export const PHASE_STATE_NAMES = ['Idle', 'Running', 'Holding', 'Held', 'Restarting', 'Complete', 'Stopping', 'Stopped', 'Aborting', 'Aborted']
export const BATCH_ACTIONS = ['Add Batch', 'Start', 'Hold', 'Restart', 'Stop', 'Abort', 'Clear Failures', 'Acquire Phase', 'Release Phase', 'Start Phase', 'Answer Prompt']

/** Slides 10-25 and 10-61: the actions of the Action Confirmation tab and Client Configuration. */
export const CONFIRM_ACTIONS = ['Start', 'Hold', 'Restart', 'Abort', 'Stop', 'Reset', 'Manual', 'Auto', 'Pause', 'Resume', 'Single Step', 'Add Batch', 'Remove Batch',
  'Active Step Change', 'Clear Failures', 'Acquire', 'Release', 'Acquire Reorder', 'Prompts', 'Parameters', 'User Comments'] as const
export type ConfirmAction = (typeof CONFIRM_ACTIONS)[number]
export interface ActionSetting { prompt: boolean; confirm: boolean; verify: boolean }
/** Actions the simulated Batch Executive does not perform (they appear on the tabs as on the slides but have no toolbar button). */
export const NOT_SIMULATED_ACTIONS: ConfirmAction[] = ['Manual', 'Auto', 'Pause', 'Resume', 'Single Step', 'Active Step Change', 'Acquire Reorder', 'Parameters']
export const ACTION_FUNCTION: Record<ConfirmAction, BatchFunction> = {
  Start: 'BATCH_START', Hold: 'BATCH_HOLD', Restart: 'BATCH_RESTART', Abort: 'BATCH_ABORT', Stop: 'BATCH_STOP', Reset: 'BATCH_RESET', Manual: 'BATCH_MANUAL', Auto: 'BATCH_AUTO',
  Pause: 'BATCH_PAUSE', Resume: 'BATCH_RESUME', 'Single Step': 'BATCH_SINGLE_STEP', 'Add Batch': 'BATCH_ADD', 'Remove Batch': 'BATCH_REMOVE', 'Active Step Change': 'BATCH_ACTIVE_STEP_CHANGE',
  'Clear Failures': 'BATCH_CLEAR_FAILURES', Acquire: 'BATCH_ACQUIRE_RELEASE', Release: 'BATCH_ACQUIRE_RELEASE', 'Acquire Reorder': 'BATCH_ACQUIRE_REORDER', Prompts: 'BATCH_ACK_PROMPT',
  Parameters: 'BATCH_PARAMETERS', 'User Comments': 'BATCH_USER_COMMENTS'
}
const NO_PROMPT: ConfirmAction[] = ['Add Batch', 'Prompts', 'Parameters']
export const defaultActionSettings = (): Record<ConfirmAction, ActionSetting> =>
  Object.fromEntries(CONFIRM_ACTIONS.map(a => [a, { prompt: !NO_PROMPT.includes(a), confirm: false, verify: false }])) as Record<ConfirmAction, ActionSetting>
export const defaultClientActions = (): Record<ConfirmAction, boolean> => Object.fromEntries(CONFIRM_ACTIONS.map(a => [a, true])) as Record<ConfirmAction, boolean>
export interface ActionCredential { user: string; password: string }
export interface BindingNeed { key: string; label: string; unitClass: string; /** Unit fixed in the recipe (alias with Fixed resolution), or ''. */ fixed: string }

/** Steps grouped into the simultaneous branches of a recipe: a linear recipe has one step per group. */
export function stepGroups(r: Pick<Recipe, 'steps'>): number[][] {
  const order: number[] = []
  const groups = new Map<number, number[]>()
  r.steps.forEach((s, i) => {
    const g = s.group ?? i + 1
    if (!groups.has(g)) { groups.set(g, []); order.push(g) }
    groups.get(g)!.push(i + 1)
  })
  return order.map(g => groups.get(g)!)
}
export const childLevel = (level: RecipeLevel): RecipeLevel | null => (level === 'Procedure' ? 'Unit Procedure' : level === 'Unit Procedure' ? 'Operation' : null)
/** Transition expression that waits for every step of a group (slide 11-9: BSTATUS = $recipe_state:Complete). */
export const groupTransition = (steps: RecipeStep[], level: RecipeLevel): string =>
  steps.map(s => `${s.name}/BSTATUS = ${level === 'Operation' ? '$phase_state:Complete' : '$recipe_state:Complete'}`).join(' AND ')
/** The parameters a step offers for deferral: a phase's batch input parameters, or the recipe parameters of the operation / unit procedure it runs. */
export function stepParamDefs(r: Recipe, stepName: string): Pick<RecipeParam, 'name' | 'type' | 'defaultValue' | 'low' | 'high' | 'units'>[] {
  const st = r.steps.find(s => s.name === stepName)
  if (!st) return []
  if (r.level === 'Operation') {
    return Object.values(useBatch.getState().phaseClasses[st.phaseClass]?.params ?? {}).filter(p => p.kind === 'batch' && p.direction === 'Input')
      .map(p => ({ name: p.name, type: p.type as RecipeParam['type'], defaultValue: p.defaultValue, low: p.low, high: p.high, units: p.units }))
  }
  return Object.values(useExecutive.getState().recipes[st.phaseClass]?.params ?? {}).map(p => ({ name: p.name, type: p.type, defaultValue: p.defaultValue, low: p.low, high: p.high, units: p.units }))
}
export interface ActionAttempt { comment?: string; confirm?: ActionCredential; verify?: ActionCredential }

const now = (): number => useStore.getState().time
const user = (): string => { const u = useSecurity.getState().currentUser; return u.toLowerCase() === 'admin' ? 'ADMINISTRATOR' : u.toUpperCase() }
const sec = (): ReturnType<typeof useSecurity.getState> => useSecurity.getState()
const FUNCTION_KEY: Record<BatchFunction, () => boolean> = {
  BATCH_ABORT: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_ABORT'),
  BATCH_ACK_PROMPT: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_ACK_PROMPT'),
  BATCH_ACQUIRE_RELEASE: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_ACQUIRE_RELEASE'),
  BATCH_ACQUIRE_REORDER: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_ACQUIRE_REORDER'),
  BATCH_ACTION_VERIFY: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_ACTION_VERIFY'),
  BATCH_ACTIVE_STEP_CHANGE: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_ACTIVE_STEP_CHANGE'),
  BATCH_ADD: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_ADD'),
  BATCH_AUTO: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_AUTO'),
  BATCH_CLEAR_FAILURES: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_CLEAR_FAILURES'),
  BATCH_HOLD: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_HOLD'),
  BATCH_MANUAL: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_MANUAL'),
  BATCH_PARAMETERS: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_PARAMETERS'),
  BATCH_PAUSE: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_PAUSE'),
  BATCH_REMOVE: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_REMOVE'),
  BATCH_RESET: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_RESET'),
  BATCH_RESTART: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_RESTART'),
  BATCH_RESUME: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_RESUME'),
  BATCH_SINGLE_STEP: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_SINGLE_STEP'),
  BATCH_START: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_START'),
  BATCH_STOP: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_STOP'),
  BATCH_USER_COMMENTS: () => sec().requireLock('BATCH_OPERATE', 'Batch function BATCH_USER_COMMENTS')
}
/** A Batch Operator Interface action needs the key of the function lock behind it (slide 10-8; Batch Operate unless reassigned). */
function allowedFunction(fn: BatchFunction, what: string): string | null {
  if (sec().locked) { useSecurity.setState({ lastDenied: `Access Denied — ${what} requires an unlocked workstation` }); return `Access Denied — ${what} requires an unlocked workstation` }
  return FUNCTION_KEY[fn]() ? null : (sec().lastDenied ?? `Access Denied — ${what} requires the key for ${fn}`)
}
const CMD_FUNCTION: Record<PhaseCommand | 'START' | 'HOLD' | 'RESTART' | 'STOP' | 'ABORT' | 'CLEAR_FAILURES', BatchFunction> = {
  START: 'BATCH_START', HOLD: 'BATCH_HOLD', RESTART: 'BATCH_RESTART', STOP: 'BATCH_STOP', ABORT: 'BATCH_ABORT', RESET: 'BATCH_RESET', CLEAR_FAILURES: 'BATCH_CLEAR_FAILURES'
}
export const defaultProduct = (): RecipeProduct => ({ name: '', code: '', version: '', author: '', approvedBy: '' })
export const defaultTransition = (step: RecipeStep): string => `${step.name}/BSTATUS = $phase_state:Complete`

function emptyState(): Pick<ExecutiveState, 'enabled' | 'description' | 'restart' | 'holdPropagation' | 'removeEventFilesDays' | 'revision' | 'actionConfirm' | 'allowSamePerson' | 'clientAllowLocal' | 'clientEnabled' | 'localEnabled' | 'assignedAreas' | 'recipes' | 'drafts' | 'assigned' | 'downloaded' | 'equipment' | 'equipmentAt' | 'service' | 'startedAt' | 'verify' | 'batches' | 'owners' | 'prompts' | 'nextPrompt' | 'journal' | 'manualBatch' | 'client'> {
  return {
    enabled: false, description: '', restart: 'Query User', holdPropagation: 'Procedure', removeEventFilesDays: 30, revision: '1.0', actionConfirm: defaultActionSettings(), allowSamePerson: true,
    clientAllowLocal: true, clientEnabled: defaultClientActions(), localEnabled: defaultClientActions(), assignedAreas: [], recipes: {}, drafts: {}, assigned: {},
    downloaded: {}, equipment: {}, equipmentAt: null, service: 'STOPPED', startedAt: null, verify: null, batches: [], owners: {}, prompts: [], nextPrompt: 1, journal: [], manualBatch: {}, client: 'BOI'
  }
}

const NAME_OK = /^[A-Za-z][A-Za-z0-9_]{0,15}$/
export function recipeNameError(name: string): string | null {
  if (!name.trim()) return 'Enter a name'
  return NAME_OK.test(name.trim()) ? null : 'Names start with a letter and use letters, digits and underscores (16 characters at most)'
}

// ---------------------------------------------------------------------------
// Recipe expressions: AGITATE:1/BSTATUS = $phase_state:Complete

type Tok = { t: 'num' | 'str' | 'ref' | 'uref' | 'set' | 'op' | 'word'; v: string }
function tokenize(raw: string): Tok[] | string {
  const out: Tok[] = []
  // The slides quote references and named-set values ('AGITATE:1/BSTATUS' = '$phase_state:Complete'); the quotes are optional here.
  const src = raw.replace(/'/g, ' ')
  const re = /\s*(?:(\d+(?:\.\d+)?)|(\$[A-Za-z_]\w*:[A-Za-z_]\w*)|([A-Za-z_]\w*:\d+\/[A-Za-z_]\w*)|([A-Za-z_]\w*\/[A-Za-z_]\w*)|([A-Za-z_]\w*)|(<=|>=|<>|!=|=|<|>|\(|\)))/y
  let i = 0
  while (i < src.length) {
    re.lastIndex = i
    const m = re.exec(src)
    if (!m || m[0].length === 0) { if (!src.slice(i).trim()) break; return `Unexpected text near "${src.slice(i, i + 12).trim()}"` }
    i = re.lastIndex
    if (m[1] !== undefined) out.push({ t: 'num', v: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'set', v: m[2] })
    else if (m[3] !== undefined) out.push({ t: 'ref', v: m[3] })
    else if (m[4] !== undefined) out.push({ t: 'uref', v: m[4] })
    else if (m[5] !== undefined) out.push({ t: 'word', v: m[5].toUpperCase() })
    else if (m[6] !== undefined) out.push({ t: 'op', v: m[6] })
  }
  return out
}
type V = number | string | boolean | undefined
/** `read` answers STEP:n/PARAM references; `readUnit` answers UNITCLASS/PARAM (a Unit Parameter Definition, slide 12-18). */
export function evalRecipeExpr(src: string, read: (step: string, param: string) => V, readUnit?: (unitClass: string, param: string) => V): V | { error: string } {
  const toks = tokenize(src)
  if (typeof toks === 'string') return { error: toks }
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const isWord = (w: string): boolean => peek()?.t === 'word' && peek()!.v === w
  const loose = (a: V, b: V): boolean => (typeof a === 'string' || typeof b === 'string') ? String(a).toLowerCase() === String(b).toLowerCase() : Number(a) === Number(b)
  const primary = (): V => {
    const t = toks[p++]
    if (!t) throw new Error('Expression is incomplete')
    if (t.t === 'num') return Number(t.v)
    if (t.t === 'set') return t.v.split(':')[1]
    if (t.t === 'ref') { const [step, param] = t.v.split('/'); return read(step, param.toUpperCase()) }
    if (t.t === 'uref') { const [cls, param] = t.v.split('/'); return readUnit ? readUnit(cls.toUpperCase(), param.toUpperCase()) : 0 }
    if (t.t === 'word') { if (t.v === 'TRUE') return true; if (t.v === 'FALSE') return false; throw new Error(`Unknown word ${t.v}`) }
    if (t.v === '(') { const v = or(); if (toks[p++]?.v !== ')') throw new Error('Missing )'); return v }
    throw new Error(`Unexpected ${t.v}`)
  }
  const cmp = (): V => {
    const a = primary()
    const t = peek()
    if (t?.t === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      p++
      const b = primary()
      if (a === undefined || b === undefined) return false
      switch (t.v) {
        case '=': return loose(a, b)
        case '<>': case '!=': return !loose(a, b)
        case '<': return Number(a) < Number(b)
        case '>': return Number(a) > Number(b)
        case '<=': return Number(a) <= Number(b)
        default: return Number(a) >= Number(b)
      }
    }
    return a
  }
  const not = (): V => { if (isWord('NOT')) { p++; return !not() } return cmp() }
  const and = (): V => { let a = not(); while (isWord('AND')) { p++; const b = not(); a = !!a && !!b } return a }
  const or = (): V => { let a = and(); while (isWord('OR')) { p++; const b = and(); a = !!a || !!b } return a }
  try { const v = or(); if (p < toks.length) throw new Error(`Unexpected ${toks[p].v}`); return v } catch (e) { return { error: (e as Error).message } }
}
export function checkRecipeExpr(src: string, steps: RecipeStep[]): string[] {
  if (!src.trim()) return ['Enter a transition expression']
  const stepNames = new Set(steps.map(s => s.name.toUpperCase()))
  const missing = [...src.matchAll(/([A-Za-z_]\w*:\d+)\/[A-Za-z_]\w*/g)].map(m => m[1]).filter(n => !stepNames.has(n.toUpperCase()))
  if (missing.length) return [`${missing[0]} is not a step of this recipe`]
  const classes = useBatch.getState().unitClasses
  for (const m of src.matchAll(/(?<![\w:])([A-Za-z_]\w*)\/([A-Za-z_]\w*)/g)) {
    const [, cls, param] = m
    if (!classes[cls.toUpperCase()]) return [`${cls} is not a unit class`]
    if (!classes[cls.toUpperCase()].params?.[param.toUpperCase()]) return [`${param} is not a Unit Parameter Definition of ${cls.toUpperCase()}`]
  }
  const r = evalRecipeExpr(src, () => 0, () => 0)
  return typeof r === 'object' && r !== null && 'error' in r ? [r.error] : []
}

// ---------------------------------------------------------------------------

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const phaseSig = (unit: string, phase: string): string => {
  const dep = useBatch.getState().deployedUnits[unit]
  return dep ? JSON.stringify(Object.values(dep.params[phase] ?? {}).map(p => [p.name, p.kind, p.id, p.defaultValue, p.low, p.high])) : ''
}
const unitArea = (unit: string): string => {
  const b = useBatch.getState()
  const cell = b.units[unit]?.processCell
  return (cell && b.processCells[cell]?.area) || ''
}

export const useExecutive = create<ExecutiveState>((set, get) => {
  const rootOf = (b: Batch): Batch => { let x = b; for (let n = 0; x.parent && n < 8; n++) { const p = get().batches.find(y => y.id === x.parent); if (!p) break; x = p } return x }
  const childrenOf = (id: string): Batch[] => get().batches.filter(b => b.parent === id)
  const descendants = (id: string): Batch[] => childrenOf(id).flatMap(c => [c, ...descendants(c.id)])
  const isProc = (b: Batch): boolean => !!b.level && b.level !== 'Operation'
  const journal = (kind: JournalEntry['kind'], batch: string, key: string, text: string): void => {
    const owner = batch ? get().batches.find(y => y.id === batch) : undefined
    const bid = owner ? rootOf(owner).id : batch
    useStore.getState().logEvent('BATCH', bid || key || 'BATCH EXECUTIVE', text)
    set(s => ({ journal: [...s.journal, { at: now(), kind, batch: bid, key, text, user: user() }].slice(-800) }))
  }
  const patchBatch = (id: string, patch: Partial<Batch>): void => set(s => ({ batches: s.batches.map(b => (b.id === id ? { ...b, ...patch } : b)) }))
  const recipeOf = (b: Batch): Recipe | undefined => get().downloaded[b.recipe]?.recipe
  /** The unit an operation batch runs on: the unit it was bound to, or the unit fixed in its recipe. */
  const unitOf = (b: Batch, r: Recipe): string => b.unit ?? (r.equipment.mode === 'Unit' ? r.equipment.name : '')
  const stepKey = (b: Batch, r: Recipe, i: number): string => `${unitOf(b, r)}/${r.steps[i - 1].phaseClass}`
  /** Arbitration owner name of a batch: the recipe name for a batch, the child batch id inside a procedure. */
  const ownerName = (b: Batch, r: Recipe): string => (b.parent ? b.id : r.name)
  const split = (key: string): [string, string] => { const i = key.indexOf('/'); return [key.slice(0, i), key.slice(i + 1)] }
  const active = (key: string) => useBatch.getState().active[key]

  /** Executive commands bypass the External owner rule: it owns the phases whose owner is DeltaV Batch. */
  const phaseCmd = (key: string, cmd: PhaseCommand): string | null => {
    const a = active(key)
    if (!a) return `${key} is not loaded`
    const next = commandPhase(a.rt, cmd)
    if (typeof next === 'string') return next
    useBatch.setState(s => ({ active: { ...s.active, [key]: { ...s.active[key], rt: next } } }))
    useStore.getState().logEvent('BATCH', key, `Command ${COMMAND_LABEL[cmd]} → ${STATE_LABEL[next.state]}`)
    return null
  }
  const loadAsBatch = (key: string): string | null => {
    const [unit, phase] = split(key)
    const b = useBatch.getState()
    if (b.active[key]) return null
    const r = b.loadPhase(unit, phase)
    if (!r.ok) return r.error
    useBatch.setState(s => ({ active: { ...s.active, [key]: { ...s.active[key], owner: 'BATCH' } } }))
    return null
  }
  const unloadPhaseKey = (key: string): void => {
    const a = active(key)
    if (!a) return
    if (a.rt.state === 'COMPLETE' || a.rt.state === 'STOPPED' || a.rt.state === 'ABORTED') phaseCmd(key, 'RESET')
    const [unit, phase] = split(key)
    useBatch.getState().unloadPhase(unit, phase)
  }
  const release = (key: string): void => set(s => { const owners = { ...s.owners }; delete owners[key]; return { owners } })

  const evalFor = (b: Batch, r: Recipe, expr: string): boolean => {
    const res = evalRecipeExpr(expr, (stepName, param) => {
      const st = r.steps.find(s => s.name.toUpperCase() === stepName.toUpperCase())
      if (!st) return undefined
      if (isProc(b)) {
        // A unit procedure or procedure step is complete when the child batch it spawned is.
        const kid = childrenOf(b.id).find(c => c.step === st.name)
        if (param !== 'BSTATUS') return undefined
        return !kid ? 'Idle' : ({ IDLE: 'Idle', RUNNING: 'Running', HELD: 'Held', COMPLETE: 'Complete', STOPPED: 'Stopped', ABORTED: 'Aborted' } as const)[kid.state]
      }
      const a = active(`${unitOf(b, r)}/${st.phaseClass}`)
      if (!a) return undefined
      if (param === 'BSTATUS') return STATE_LABEL[a.rt.state]
      const v = a.rt.params[param]
      return typeof v === 'boolean' ? v : (v as number | string | undefined)
    }, (unitClass, param) => {
      const unit = unitOf(b, r)
      const u = useBatch.getState().units[unit]
      return u && u.unitClass === unitClass ? unitParamValue(unit, param) : undefined
    })
    if (typeof res === 'object' && res !== null && 'error' in res) {
      patchBatch(b.id, { failure: `Transition expression error: ${res.error}`, state: 'HELD' })
      journal('Failure', b.id, '', `Transition expression error: ${res.error}`)
      return false
    }
    return !!res
  }

  const promptText = (key: string, id: number): string => {
    const [unit, phase] = split(key)
    const dep = useBatch.getState().deployedUnits[unit]
    const def = Object.values(dep?.params[phase] ?? {}).find(p => p.kind === 'message' && p.id === id)
    if (!def) return `Message ${id} is not defined in ${phase}`
    const rt = active(key)?.rt.params ?? {}
    return String(def.defaultValue).replace(/'([A-Za-z_]\w*)'/g, (_, name: string) => {
      const v = rt[name.toUpperCase()] ?? dep?.params[phase]?.[name.toUpperCase()]?.defaultValue
      return v === undefined ? `'${name}'` : String(v)
    })
  }
  const clearRequest = (key: string): void => {
    const [unit, phase] = split(key)
    useBatch.getState().setRequest(unit, phase, 0, true)
  }

  /** The Batch Executive answers the REQUEST of every phase it owns: arbitration, messages, prompts and message synchronisation. */
  const serveRequests = (): void => {
    const act = useBatch.getState().active
    const waiting: Record<string, string[]> = {}
    for (const [key, a] of Object.entries(act)) {
      if (a.owner !== 'BATCH') continue
      const code = Number(a.rt.params.REQUEST ?? 0)
      if (!code) continue
      const kind = Math.floor(code / 100), nn = code % 100
      if (code === 1000 || code === 2000) {
        journal('Event', batchOf(key), key, code === 1000 ? `Batch parameters downloaded to ${key}` : `Report parameters uploaded from ${key}`)
        clearRequest(key); continue
      }
      if (kind === 40 || kind === 42) { clearRequest(key); continue }
      if (kind === 52 || kind === 55) {
        const li = linkInfo(key)
        if (li === 'none') { warnOnce(key, `${key} posts message ${nn} but is not in a link group of its procedure`); continue }
        if (li && li.partners < 1) { warnOnce(key, `${key} is in link group ${li.group} but no phase partners are defined for it`); continue }
        ;(waiting[`${li ? `${li.root}|${li.group}` : '*'}#${nn}:${kind}`] ??= []).push(key)
        continue
      }
      if (kind === 30) {
        journal('Event', batchOf(key), key, `Message: ${promptText(key, nn)}`)
        clearRequest(key); continue
      }
      if (kind === 31) { clearRequest(key); continue }
      if (kind >= 32 && kind <= 35) {
        if (get().prompts.some(p => p.key === key && !p.answered)) continue
        const text = promptText(key, nn)
        const p: Prompt = { id: get().nextPrompt, key, batch: batchOf(key), kind: (['Integer', 'Float', 'Boolean', 'String'] as const)[kind - 32], text, messageId: nn, at: now(), answered: false, response: '' }
        set(s => ({ prompts: [...s.prompts, p], nextPrompt: s.nextPrompt + 1 }))
        journal('Prompt', p.batch, key, `Operator prompt: ${text}`)
      }
    }
    for (const gn of new Set(Object.keys(waiting).map(k => k.split(':')[0]))) {
      const send = waiting[`${gn}:52`], wait = waiting[`${gn}:55`]
      if (send?.length && wait?.length) { clearRequest(send[0]); clearRequest(wait[0]) }
    }
  }
  const warned = new Set<string>()
  const warnOnce = (key: string, text: string): void => {
    if (warned.has(text)) return
    warned.add(text)
    journal('Failure', batchOf(key), key, text)
  }
  /**
   * Link group of the phase a child batch is running (slides 11-14 .. 11-18): phases may only exchange messages with the
   * partners of their own link group. A phase of a standalone operation pairs with any other (null).
   */
  const linkInfo = (key: string): { root: string; group: string; partners: number } | 'none' | null => {
    const owner = get().owners[key]
    const b = get().batches.find(x => x.id === owner && x.parent)
    if (!b) return null
    const root = rootOf(b)
    const rr = recipeOf(root)
    const r = recipeOf(b)
    const phaseStep = r?.steps[b.pos - 1]
    if (!rr || !r || !phaseStep) return 'none'
    const parts: string[] = []
    for (let x: Batch | undefined = b; x?.parent; x = get().batches.find(y => y.id === x!.parent)) parts.unshift(x.step ?? '')
    const path = [...parts, phaseStep.name].join('/').toUpperCase()
    for (const [group, members] of Object.entries(rr.linkGroups ?? {})) {
      if (members.some(m => path === m.toUpperCase() || path.endsWith(`/${m.toUpperCase()}`) || m.toUpperCase() === phaseStep.name.toUpperCase() || m.toUpperCase() === phaseStep.phaseClass.toUpperCase())) {
        return { root: root.id, group, partners: phaseStep.partners ?? 0 }
      }
    }
    return 'none'
  }
  const batchOf = (key: string): string => {
    const owner = get().owners[key]
    const child = get().batches.find(x => x.id === owner && x.parent)
    if (child) return rootOf(child).id
    const b = get().batches.find(x => x.recipe === owner && x.state !== 'COMPLETE' && x.state !== 'IDLE')
    return owner === 'OPERATOR' ? (get().manualBatch[key] ?? '') : (b?.id ?? '')
  }

  // ---- Unit procedures and procedures (Chapter 11) ------------------------------
  const lookupRecipe = (n: string): Recipe | undefined => get().downloaded[n]?.recipe ?? get().recipes[n]
  const bindingsNeeded = (name: string): BindingNeed[] => {
    const r = lookupRecipe(name)
    if (!r) return []
    const needs: BindingNeed[] = []
    const add = (key: string, label: string, unitClass: string, fixed = ''): void => { if (!needs.some(n => n.key === key)) needs.push({ key, label, unitClass, fixed }) }
    if (r.level === 'Procedure') {
      for (const s of r.steps) {
        const cr = lookupRecipe(s.phaseClass)
        const al = s.unitAlias ? r.aliases?.[s.unitAlias] : undefined
        if (al) add(`#${al.name}#`, `#${al.name}#`, al.unitClass, al.resolution === 'Fixed' ? al.unit : '')
        else if (cr?.equipment.mode === 'Unit Class' && cr.equipment.name) add(cr.equipment.name, cr.equipment.name, cr.equipment.name)
      }
    } else if (r.equipment.mode === 'Unit Class' && r.equipment.name) add(r.equipment.name, r.equipment.name, r.equipment.name)
    return needs
  }
  /** The bound unit for a key, or a Bind prompt in the Unacknowledged Prompts list (slide 11-49 step 9) and '' until the operator answers. */
  const ensureBinding = (root: Batch, key: string, label: string, unitClass: string): string => {
    const bound = get().batches.find(x => x.id === root.id)?.bindings?.[key]
    if (bound) return bound
    if (!get().prompts.some(q => q.kind === 'Bind' && q.batch === root.id && q.key === key && !q.answered)) {
      const choices = Object.values(useBatch.getState().units).filter(u => u.unitClass === unitClass).map(u => u.name).sort()
      const p: Prompt = { id: get().nextPrompt, key, batch: root.id, kind: 'Bind', text: `Bind ${label} (unit class ${unitClass}) for batch ${root.id}`, messageId: 0, at: now(), answered: false, response: '', choices }
      set(s => ({ prompts: [...s.prompts, p], nextPrompt: s.nextPrompt + 1 }))
      journal('Prompt', root.id, key, `Operator prompt: ${p.text}`)
    }
    return ''
  }
  const resolveChildUnit = (p: Batch, pr: Recipe, step: RecipeStep, cr: Recipe): string => {
    if (p.level === 'Unit Procedure') {
      if (p.unit) return p.unit
      const need = bindingsNeeded(p.recipe)[0]
      return need ? ensureBinding(rootOf(p), need.key, need.label, need.unitClass) : ''
    }
    const root = rootOf(p)
    const al = step.unitAlias ? pr.aliases?.[step.unitAlias] : undefined
    if (al) return al.resolution === 'Fixed' ? al.unit : ensureBinding(root, `#${al.name}#`, `#${al.name}#`, al.unitClass)
    if (cr.equipment.mode === 'Unit') return cr.equipment.name
    return ensureBinding(root, cr.equipment.name, cr.equipment.name, cr.equipment.name)
  }
  /** Starts the child batch of one step of a unit procedure / procedure; false while it is waiting for a unit binding. */
  const spawnStep = (p: Batch, pr: Recipe, idx: number): boolean => {
    const step = pr.steps[idx - 1]
    const cr = get().downloaded[step.phaseClass]?.recipe
    if (!cr) { patchBatch(p.id, { state: 'HELD', failure: `${step.phaseClass} is not downloaded to the Batch Executive` }); journal('Failure', p.id, '', `${step.name}: ${step.phaseClass} is not downloaded`); return false }
    const unit = resolveChildUnit(p, pr, step, cr)
    if (!unit) return false
    const parent = get().batches.find(x => x.id === p.id)!
    const params: Batch['params'] = {}
    for (const cp of Object.values(cr.params)) {
      const up = Object.values(pr.params).find(x => x.step === step.name && x.phaseParam === cp.name)
      params[cp.name] = up && parent.params[up.name] !== undefined ? parent.params[up.name] : cp.defaultValue
    }
    const kid: Batch = { id: `${p.id}/${step.name}`, recipe: cr.name, formula: null, state: 'RUNNING', created: now(), started: now(), ended: null, pos: 0, stage: 'acquire', params, failure: null, waiting: null,
      creator: p.creator, cleanup: false, parent: p.id, step: step.name, unit, level: cr.level === 'Operation' ? undefined : cr.level }
    set(st => ({ batches: [...st.batches, kid] }))
    journal('Event', p.id, '', `${step.name} (${cr.name}) started on ${unit}`)
    return true
  }
  const finishProc = (p: Batch): void => {
    patchBatch(p.id, { state: 'COMPLETE', ended: now() })
    journal('Event', p.id, '', p.parent ? `${p.step} (${p.recipe}) complete` : `Batch ${p.id} complete`)
  }
  /** Runs the simultaneous branches of a unit procedure or procedure: spawn a group, wait for its transition, go on to the next. */
  const stepProc = (p: Batch, pr: Recipe): void => {
    if (p.state !== 'RUNNING') return
    const groups = stepGroups(pr)
    if (p.pos === 0) {
      if (evalFor(p, pr, pr.transitions[0]?.condition || 'TRUE')) patchBatch(p.id, { pos: 1, stage: 'acquire' })
      return
    }
    const idxs = groups[p.pos - 1] ?? []
    if (p.stage === 'acquire') {
      const spawned = childrenOf(p.id).map(c => c.step)
      let all = true
      for (const i of idxs) if (!spawned.includes(pr.steps[i - 1].name)) { if (!spawnStep(p, pr, i)) all = false; if (get().batches.find(x => x.id === p.id)!.state !== 'RUNNING') return }
      if (all) patchBatch(p.id, { stage: 'run' })
      return
    }
    if (evalFor(p, pr, pr.transitions[p.pos]?.condition || 'TRUE')) {
      if (p.pos >= groups.length) { finishProc(p); patchBatch(p.id, { pos: p.pos + 1 }) } else patchBatch(p.id, { pos: p.pos + 1, stage: 'acquire' })
    }
  }
  /** Hold propagates to the whole batch: every running phase is held and every procedural level goes to Held. */
  const holdAll = (root: Batch): void => {
    for (const d of descendants(root.id)) {
      if (d.state !== 'RUNNING') continue
      if (isProc(d)) patchBatch(d.id, { state: 'HELD' })
      else get().batchCommand(d.id, 'HOLD')
    }
  }
  const procCommand = (b: Batch, cmd: 'START' | 'HOLD' | 'RESTART' | 'STOP' | 'ABORT' | 'CLEAR_FAILURES'): Result<string> => {
    const id = b.id
    const kids = descendants(id)
    switch (cmd) {
      case 'START': {
        if (b.state !== 'IDLE') return fail(`Batch ${id} is ${b.state}; only an idle batch can be started`)
        patchBatch(id, { state: 'RUNNING', started: now() })
        journal('Event', id, '', `Batch ${id} started by ${user()} [${get().client}]`)
        return ok('RUNNING')
      }
      case 'HOLD': {
        if (b.state !== 'RUNNING') return fail(`Batch ${id} is ${b.state}; only a running batch can be held`)
        holdAll(b)
        patchBatch(id, { state: 'HELD' })
        journal('Event', id, '', `Batch ${id} held by ${user()}`)
        return ok('HELD')
      }
      case 'RESTART': {
        if (b.state !== 'HELD') return fail(`Batch ${id} is ${b.state}; only a held batch can be restarted`)
        if (b.failure || kids.some(k => k.failure)) return fail(`Clear the failure first: ${b.failure ?? kids.find(k => k.failure)?.failure}`)
        for (const k of kids) if (k.state === 'HELD' && !isProc(k)) { const r = get().batchCommand(k.id, 'RESTART'); if (!r.ok) return fail(r.error) }
        for (const k of kids) if (k.state === 'HELD' && isProc(k)) patchBatch(k.id, { state: 'RUNNING' })
        patchBatch(id, { state: 'RUNNING' })
        journal('Event', id, '', `Batch ${id} restarted by ${user()}`)
        return ok('RUNNING')
      }
      case 'CLEAR_FAILURES': {
        for (const k of kids) { if (!isProc(k) && (k.failure || k.state === 'HELD')) get().batchCommand(k.id, 'CLEAR_FAILURES'); else if (isProc(k)) patchBatch(k.id, { failure: null }) }
        patchBatch(id, { failure: null })
        journal('Event', id, '', `Failures cleared on batch ${id} by ${user()}`)
        return ok('cleared')
      }
      case 'STOP': case 'ABORT': {
        if (b.state !== 'RUNNING' && b.state !== 'HELD') return fail(`Batch ${id} is ${b.state}`)
        for (const k of kids) {
          if (k.state !== 'RUNNING' && k.state !== 'HELD') continue
          if (isProc(k)) patchBatch(k.id, { state: cmd === 'STOP' ? 'STOPPED' : 'ABORTED', ended: now() })
          else get().batchCommand(k.id, cmd)
        }
        patchBatch(id, { state: cmd === 'STOP' ? 'STOPPED' : 'ABORTED', ended: now() })
        journal('Event', id, '', `Batch ${id} ${cmd === 'STOP' ? 'stopped' : 'aborted'} by ${user()}`)
        return ok(cmd)
      }
    }
  }

  return {
    ...emptyState(),

    setEnabled: enabled => {
      if (!enabled && get().service === 'RUNNING') return fail('Stop the Batch Executive service first')
      set({ enabled })
      journal('Event', '', '', `Batch Executive ${enabled ? 'enabled' : 'disabled'}`)
      return ok(enabled ? 'Enabled' : 'Disabled')
    },
    setServerProps: p => set(p),
    setClient: client => set({ client }),
    setActionConfirmation: (settings, allowSamePerson) => {
      const next = { ...settings }
      for (const a of CONFIRM_ACTIONS) next[a] = { ...next[a], confirm: next[a].confirm || next[a].verify }
      set({ actionConfirm: next, allowSamePerson })
      journal('Event', '', '', 'Batch Executive Action Confirmation settings changed')
      return ok('saved')
    },
    setClientConfig: (allowLocal, enabled) => {
      set({ clientAllowLocal: allowLocal, clientEnabled: { ...enabled } })
      journal('Event', '', '', `Batch Executive Client Configuration changed (local client settings ${allowLocal ? 'allowed' : 'not allowed'})`)
      return ok('saved')
    },
    setLocalEnabled: enabled => {
      if (!get().clientAllowLocal) return fail('Allow settings to be configured at the local client is not enabled on the Batch Executive (Client Configuration)')
      set({ localEnabled: { ...enabled } })
      return ok('saved')
    },
    actionEnabled: action => get().clientEnabled[action] && (!get().clientAllowLocal || get().localEnabled[action]),
    authorizeAction: (action, subject, attempt, batchId = '') => {
      const s = get()
      const cfg = s.actionConfirm[action]
      if (!cfg.confirm && !cfg.verify) return ok(action)
      const sec = useSecurity.getState()
      const fn = ACTION_FUNCTION[action]
      if (!attempt.confirm) return fail(`${action} needs a confirmer`)
      const confirmer = sec.authenticate(attempt.confirm.user, attempt.confirm.password)
      if (!confirmer.ok) return fail(`Confirm failed: ${confirmer.reason}`)
      if (!confirmer.locks.includes(sec.lockFor('BATCH_OPERATE', `Batch function ${fn}`))) return fail(`Confirm failed: ${confirmer.user} does not hold the key for ${fn}`)
      let who = `confirmed by ${confirmer.user}`
      if (cfg.verify) {
        if (!attempt.verify) return fail(`${action} needs a verifier`)
        const verifier = sec.authenticate(attempt.verify.user, attempt.verify.password)
        if (!verifier.ok) return fail(`Verify failed: ${verifier.reason}`)
        if (!verifier.locks.includes(sec.lockFor('BATCH_OPERATE', 'Batch function BATCH_ACTION_VERIFY'))) return fail(`Verify failed: ${verifier.user} does not hold the key for BATCH_ACTION_VERIFY`)
        if (verifier.user === confirmer.user && !s.allowSamePerson) return fail('Verify failed: the verifier must be a different person (Allow Confirmer and Verifier to be the same person is off)')
        who += ` and verified by ${verifier.user}`
      }
      journal('Event', batchId, '', `${action} of ${subject} ${who}${attempt.comment?.trim() ? `: ${attempt.comment.trim()}` : ''}`)
      return ok(action)
    },
    assignArea: area => {
      const s = get()
      if (!useStore.getState().areas.includes(area)) return fail(`Plant area ${area} does not exist`)
      if (s.assignedAreas.includes(area)) return fail(`${area} is already assigned to the Batch Executive`)
      set({ assignedAreas: [...s.assignedAreas, area].sort() })
      journal('Event', '', '', `Area ${area} assigned to the Batch Executive (download the ProfessionalPLUS workstation)`)
      return ok(area)
    },
    unassignArea: area => {
      if (get().service === 'RUNNING') return fail('Stop the Batch Executive service first')
      set(s => ({ assignedAreas: s.assignedAreas.filter(a => a !== area) }))
      return ok(area)
    },

    newRecipe: (raw, level = 'Operation') => {
      const name = raw.trim().toUpperCase()
      const err = recipeNameError(name)
      if (err) return fail(err)
      if (get().recipes[name]) return fail(`${name} already exists`)
      const r: Recipe = { name, level, description: '', workInProgress: false, product: defaultProduct(), notes: '', equipment: { mode: 'Unit', name: '' }, steps: [], transitions: [{ name: 'T1', condition: 'TRUE' }],
        params: {}, formulas: {}, revision: 0, modified: now() }
      set(s => ({ recipes: { ...s.recipes, [name]: r } }))
      useStore.getState().logEvent('CONFIGURE', name, `${level} ${name} created`)
      return ok(name)
    },
    deleteRecipe: name => {
      if (!get().recipes[name]) return fail(`${name} does not exist`)
      if (get().batches.some(b => b.recipe === name && b.state !== 'COMPLETE' && b.state !== 'STOPPED' && b.state !== 'ABORTED')) return fail(`${name} has batches that are not finished`)
      set(s => {
        const recipes = { ...s.recipes }, drafts = { ...s.drafts }, assigned = { ...s.assigned }, downloaded = { ...s.downloaded }
        delete recipes[name]; delete drafts[name]; delete assigned[name]; delete downloaded[name]
        return { recipes, drafts, assigned, downloaded }
      })
      return ok(name)
    },
    renameRecipe: (name, raw) => {
      const to = raw.trim().toUpperCase()
      const s = get()
      if (!s.recipes[name]) return fail(`${name} does not exist`)
      if (to === name) return ok(name)
      const err = recipeNameError(to)
      if (err) return fail(err)
      if (s.recipes[to]) return fail(`${to} already exists`)
      if (s.batches.some(b => b.recipe === name && b.state !== 'COMPLETE' && b.state !== 'STOPPED' && b.state !== 'ABORTED')) return fail(`${name} has batches that are not finished`)
      const rx = new RegExp(`(?<![A-Za-z0-9_])${name}:`, 'g')
      const fix = (r: Recipe): Recipe => {
        const c = clone(r)
        const renamed: Record<string, string> = {}
        for (const st of c.steps) if (st.phaseClass === name) { const old = st.name; st.phaseClass = to; st.name = old.replace(rx, `${to}:`); renamed[old] = st.name }
        if (c.linkGroups) for (const [g, ms] of Object.entries(c.linkGroups)) c.linkGroups[g] = ms.map(m => m.replace(rx, `${to}:`))
        if (!Object.keys(renamed).length) return c.linkGroups ? c : r
        for (const t of c.transitions) t.condition = t.condition.replace(rx, `${to}:`)
        for (const p of Object.values(c.params)) if (renamed[p.step]) p.step = renamed[p.step]
        return c
      }
      const move = <T,>(r: Record<string, T>, f?: (v: T) => T): Record<string, T> => Object.fromEntries(Object.entries(r).map(([k, v]) => (k === name ? [to, f ? f(v) : v] : [k, v])))
      const stale = new Set([name, ...Object.values(s.recipes).filter(r => r.steps.some(st => st.phaseClass === name)).map(r => r.name)])
      const downloaded = { ...s.downloaded }
      for (const n of stale) delete downloaded[n]
      const fixAll = (r: Record<string, Recipe>): Record<string, Recipe> => Object.fromEntries(Object.entries(r).map(([k, v]) => [k === name ? to : k, fix(k === name ? { ...v, name: to } : v)]))
      set({ recipes: fixAll(s.recipes), drafts: fixAll(s.drafts), assigned: move(s.assigned), downloaded })
      useStore.getState().logEvent('CONFIGURE', to, `${name} renamed to ${to}; download the Batch Executive again`)
      return ok(to)
    },
    setRecipeProps: (name, p) => {
      const r = get().recipes[name]
      if (!r) return fail(`${name} does not exist`)
      if (p.equipment?.mode === 'Unit' && p.equipment.name && !useBatch.getState().units[p.equipment.name]) return fail(`Unit ${p.equipment.name} does not exist`)
      if (p.equipment?.mode === 'Unit Class' && p.equipment.name && !useBatch.getState().unitClasses[p.equipment.name]) return fail(`Unit class ${p.equipment.name} does not exist`)
      const { product, ...rest } = p
      const merged: Recipe = { ...r, ...rest, product: { ...r.product, ...(product ?? {}) } }
      if (JSON.stringify(merged) === JSON.stringify(r)) return ok(name)
      const next: Recipe = { ...merged, revision: r.revision + 1, modified: now() }
      set(s => ({ recipes: { ...s.recipes, [name]: next }, drafts: s.drafts[name] ? { ...s.drafts, [name]: { ...s.drafts[name], ...rest, product: next.product } } : s.drafts }))
      return ok(name)
    },
    draftOf: name => get().drafts[name] ?? get().recipes[name],
    editDraft: (name, edit) => {
      const base = get().drafts[name] ?? get().recipes[name]
      if (!base) return fail(`${name} does not exist`)
      const d = clone(base)
      const err = edit(d)
      if (typeof err === 'string') return fail(err)
      set(s => ({ drafts: { ...s.drafts, [name]: d } }))
      return ok(name)
    },
    saveRecipe: name => {
      const d = get().drafts[name]
      if (!d) return ok(name)
      const blocked = vcHooks.gate(`Recipe:${name}`)
      if (blocked) return fail(blocked)
      set(s => {
        const drafts = { ...s.drafts }
        delete drafts[name]
        return { recipes: { ...s.recipes, [name]: { ...d, revision: d.revision + 1, modified: now() } }, drafts }
      })
      useStore.getState().logEvent('CONFIGURE', name, `${d.level} ${name} saved in Recipe Studio`)
      vcHooks.saved(`Recipe:${name}`)
      return ok(name)
    },
    discardDraft: name => set(s => { const drafts = { ...s.drafts }; delete drafts[name]; return { drafts } }),

    assignRecipe: name => {
      if (!get().recipes[name]) return fail(`${name} does not exist`)
      if (!get().enabled) return fail('Enable the Batch Executive first (Batch Executive > Properties > General)')
      set(s => ({ assigned: { ...s.assigned, [name]: 'User' } }))
      useStore.getState().logEvent('CONFIGURE', name, `${name} assigned to the Batch Executive`)
      return ok(name)
    },
    verifyRecipe: name => {
      const r = get().recipes[name]
      const errors: string[] = [], warnings: string[] = []
      if (!r) return { errors: [`${name} does not exist`], warnings }
      if (get().drafts[name]) errors.push('Unsaved changes: save the recipe in Recipe Studio first')
      const b = useBatch.getState()
      if (!r.steps.length) errors.push('The recipe has no steps')
      if (r.level !== 'Operation') {
        const below = childLevel(r.level)
        if (r.level === 'Unit Procedure' && !r.equipment.name) errors.push('The unit procedure has no equipment: set the unit or unit class on the Equipment tab')
        for (const s of r.steps) {
          const cr = get().recipes[s.phaseClass]
          if (!cr) errors.push(`Step ${s.name}: ${s.phaseClass} does not exist`)
          else if (cr.level !== below) errors.push(`Step ${s.name}: ${s.phaseClass} is a${cr.level === 'Operation' ? 'n' : ''} ${cr.level.toLowerCase()}, expected a${below === 'Operation' ? 'n' : ''} ${below?.toLowerCase()}`)
          else if (get().drafts[cr.name]) errors.push(`Step ${s.name}: ${cr.name} has unsaved changes`)
          if (s.unitAlias && !r.aliases?.[s.unitAlias]) errors.push(`Step ${s.name}: unit alias ${s.unitAlias} is not defined`)
        }
        const groups = stepGroups(r)
        groups.forEach((g, gi) => {
          for (const e of checkRecipeExpr(r.transitions[gi + 1]?.condition ?? '', r.steps)) errors.push(`Transition ${r.transitions[gi + 1]?.name ?? gi + 1}: ${e}`)
        })
        for (const p of Object.values(r.params)) {
          const st = r.steps.find(x => x.name === p.step)
          const cr = st ? get().recipes[st.phaseClass] : undefined
          if (!st) errors.push(`Recipe parameter ${p.name} refers to the missing step ${p.step}`)
          else if (cr && !cr.params[p.phaseParam]) errors.push(`Recipe parameter ${p.name}: ${cr.name} has no recipe parameter ${p.phaseParam}`)
        }
        for (const [g, members] of Object.entries(r.linkGroups ?? {})) if (members.length < 2) warnings.push(`Link group ${g} has fewer than two phases`)
        if (r.workInProgress) warnings.push('The recipe is marked Work in progress')
        if (!r.product.version.trim()) warnings.push('No version is set on the Product tab')
        if (!r.product.author.trim()) warnings.push('No author is set on the Product tab')
        return { errors, warnings }
      }
      const unit = r.equipment.mode === 'Unit' ? b.units[r.equipment.name] : undefined
      const classPhases = r.equipment.mode === 'Unit Class' ? b.unitClasses[r.equipment.name]?.phaseClasses : undefined
      if (!r.equipment.name) errors.push('The recipe has no equipment: set the unit on the Equipment tab')
      else if (r.equipment.mode === 'Unit' && !unit) errors.push(`Unit ${r.equipment.name} does not exist`)
      else if (r.equipment.mode === 'Unit Class' && !classPhases) errors.push(`Unit class ${r.equipment.name} does not exist`)
      for (const [i, s] of r.steps.entries()) {
        if (!b.phaseClasses[s.phaseClass]) errors.push(`Step ${s.name}: phase class ${s.phaseClass} does not exist`)
        else if (unit && !unit.phases[s.phaseClass]) errors.push(`Step ${s.name}: ${s.phaseClass} is not a unit phase of ${unit.name}`)
        else if (classPhases && !classPhases.includes(s.phaseClass)) errors.push(`Step ${s.name}: ${s.phaseClass} is not a phase of unit class ${r.equipment.name}`)
        for (const e of checkRecipeExpr(r.transitions[i + 1]?.condition ?? '', r.steps)) errors.push(`Transition ${r.transitions[i + 1]?.name ?? i + 1}: ${e}`)
      }
      for (const p of Object.values(r.params)) if (!r.steps.some(s => s.name === p.step)) errors.push(`Recipe parameter ${p.name} refers to the missing step ${p.step}`)
      for (const br of r.branches ?? []) {
        const from = r.steps.findIndex(s => s.name === br.from), to = r.steps.findIndex(s => s.name === br.to)
        if (from < 0 || to < 0) errors.push(`Transition ${br.name}: ${from < 0 ? br.from : br.to} is not a step`)
        else if (to > from) errors.push(`Transition ${br.name}: it connects to ${br.to}, which follows ${br.from}; a branch can only loop back`)
        for (const e of checkRecipeExpr(br.condition, r.steps)) errors.push(`Transition ${br.name}: ${e}`)
      }
      if (r.workInProgress) warnings.push('The recipe is marked Work in progress')
      if (!r.product.version.trim()) warnings.push('No version is set on the Product tab')
      if (!r.product.author.trim()) warnings.push('No author is set on the Product tab')
      return { errors, warnings }
    },
    downloadRecipe: (name, opts) => {
      const s = get()
      const r = s.recipes[name]
      if (!r) return fail(`${name} does not exist`)
      if (!s.enabled) return fail('The Batch Executive is not enabled')
      if (!s.assigned[name]) return fail(`${name} is not assigned to a Batch Executive: use Assign Now on the Tools tab`)
      // A procedure or unit procedure downloads every recipe it contains; those are system assigned (slide 10-32).
      const order: string[] = []
      const collect = (n: string): string | null => {
        const rec = get().recipes[n]
        if (!rec) return `${n} does not exist`
        for (const st of rec.steps) if (rec.level !== 'Operation') { const e = collect(st.phaseClass); if (e) return e }
        if (!order.includes(n)) order.push(n)
        return null
      }
      const ce = collect(name)
      if (ce) return fail(`${name} cannot be downloaded: ${ce}`)
      const vcError = vcHooks.downloadCheck(order, opts)
      if (vcError) return fail(`${name} cannot be downloaded: ${vcError}`)
      const warnings: string[] = []
      for (const n of order) {
        const v = get().verifyRecipe(n)
        if (v.errors.length) return fail(`${n} cannot be downloaded: ${v.errors[0]}`)
        if (n === name) warnings.push(...v.warnings)
        const rec = get().recipes[n]
        const units = rec.level === 'Operation' || rec.level === 'Unit Procedure'
          ? (rec.equipment.mode === 'Unit' ? [rec.equipment.name] : Object.values(useBatch.getState().units).filter(u => u.unitClass === rec.equipment.name).map(u => u.name)) : []
        for (const u of units) {
          const area = unitArea(u)
          if (!s.assignedAreas.includes(area)) return fail(`${u} is in area ${area || '(none)'}, which is not assigned to the Batch Executive`)
        }
      }
      set(st => ({
        downloaded: { ...st.downloaded, ...Object.fromEntries(order.map(n => [n, { recipe: clone(st.recipes[n]), at: now() }])) },
        assigned: { ...st.assigned, ...Object.fromEntries(order.filter(n => !st.assigned[n]).map(n => [n, 'System' as const])) }
      }))
      useStore.getState().logEvent('CONFIGURE', name, `${name} revision ${r.revision} downloaded to the Batch Executive${order.length > 1 ? ` with ${order.filter(n => n !== name).join(', ')}` : ''}`)
      return ok({ warnings })
    },
    downloadEquipment: () => {
      const s = get()
      if (!s.enabled) return fail('The Batch Executive is not enabled')
      const b = useBatch.getState()
      const eq: Record<string, string> = {}
      for (const u of Object.values(b.units)) {
        if (!s.assignedAreas.includes(unitArea(u.name))) continue
        for (const ph of Object.values(u.phases)) if (ph.phaseType === 'Controller' && b.deployedUnits[u.name]?.logic[ph.name]) eq[`${u.name}/${ph.name}`] = phaseSig(u.name, ph.name)
      }
      set({ equipment: eq, equipmentAt: now(), verify: null })
      useStore.getState().logEvent('CONFIGURE', 'PROPLUS', `Batch Executive equipment downloaded (${Object.keys(eq).length} unit phases in ${s.assignedAreas.join(', ') || 'no areas'})`)
      return ok(Object.keys(eq).length)
    },

    startService: () => {
      const s = get()
      if (!s.enabled) return fail('The Batch Executive is not enabled (Explorer > PROPLUS > Batch Executive > Properties)')
      if (!s.assignedAreas.length) return fail('No plant area is assigned to the Batch Executive')
      if (s.equipmentAt === null) return fail('Download the ProfessionalPLUS workstation so the Batch Executive knows its equipment')
      set({ service: 'RUNNING', startedAt: now() })
      journal('Event', '', '', 'Batch Executive service started')
      return ok('RUNNING')
    },
    stopService: () => {
      if (get().batches.some(b => b.state === 'RUNNING')) return fail('Batches are running; stop or hold them first')
      set({ service: 'STOPPED', startedAt: null })
      journal('Event', '', '', 'Batch Executive service stopped')
      return ok('STOPPED')
    },
    verifyPhases: () => {
      const s = get()
      if (s.service !== 'RUNNING') return fail('Start the Batch Executive service first')
      const b = useBatch.getState()
      let total = 0
      const bads: string[] = []
      for (const u of Object.values(b.units)) {
        if (!s.assignedAreas.includes(unitArea(u.name))) continue
        for (const ph of Object.values(u.phases)) {
          if (ph.phaseType !== 'Controller') continue
          total++
          const key = `${u.name}/${ph.name}`
          if (!b.deployedUnits[u.name]?.logic[ph.name]) bads.push(`${key}: not downloaded to the controller`)
          else if (s.equipment[key] === undefined) bads.push(`${key}: not known to the Batch Executive (download the workstation)`)
          else if (s.equipment[key] !== phaseSig(u.name, ph.name)) bads.push(`${key}: changed since the equipment was downloaded to the Batch Executive`)
        }
      }
      set({ verify: { total, bad: bads.length, bads, at: now() } })
      journal('Event', '', '', `Verify Phases: ${total} phases, ${bads.length} bad`)
      return ok({ total, bad: bads.length })
    },

    bindingsNeeded: name => bindingsNeeded(name),
    addBatch: (recipe, rawId, formula, bindings = {}) => {
      const s = get()
      const id = rawId.trim()
      const denied = allowedFunction('BATCH_ADD', 'Add Batch')
      if (denied) return fail(denied)
      if (s.service !== 'RUNNING') return fail('The Batch Executive service is not running')
      if (!s.downloaded[recipe]) return fail(`${recipe} has not been downloaded to the Batch Executive`)
      if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) return fail('Enter a Batch ID of letters and digits (16 characters at most)')
      if (s.batches.some(b => b.id.toUpperCase() === id.toUpperCase())) return fail(`Batch ${id} already exists`)
      const r = s.downloaded[recipe].recipe
      if (formula && !r.formulas[formula]) return fail(`Formula ${formula} does not exist in ${recipe}`)
      const params: Batch['params'] = {}
      for (const p of Object.values(r.params)) {
        const fv = formula ? r.formulas[formula].values[p.name] : undefined
        params[p.name] = fv && !fv.useDefault ? fv.value : p.defaultValue
      }
      const bound: Record<string, string> = {}
      for (const need of bindingsNeeded(recipe)) {
        const unit = need.fixed || bindings[need.key] || ''
        if (unit && useBatch.getState().units[unit]?.unitClass !== need.unitClass) return fail(`${unit} is not a unit of class ${need.unitClass} (binding ${need.label})`)
        if (unit) bound[need.key] = unit
      }
      const level = r.level === 'Operation' ? undefined : r.level
      const unit = r.level === 'Procedure' ? undefined : (r.equipment.mode === 'Unit' ? r.equipment.name : bound[r.equipment.name])
      const batch: Batch = { id, recipe, formula, state: 'IDLE', created: now(), started: null, ended: null, pos: 0, stage: 'acquire', params, failure: null, waiting: null, creator: user(), cleanup: false,
        ...(level ? { level } : {}), ...(unit ? { unit } : {}), ...(Object.keys(bound).length || bindingsNeeded(recipe).length ? { bindings: bound } : {}) }
      set(st => ({ batches: [...st.batches, batch] }))
      journal('Event', id, '', `Batch ${id} created from ${recipe}${formula ? ` with formula ${formula}` : ''} by ${user()} [${get().client}]${Object.keys(bound).length ? ` (${Object.entries(bound).map(([k, v]) => `${k} = ${v}`).join(', ')})` : ''}`)
      return ok(id)
    },
    removeBatch: id => {
      const b = get().batches.find(x => x.id === id)
      const denied = allowedFunction('BATCH_REMOVE', 'Remove Batch')
      if (denied) return fail(denied)
      if (!b) return fail(`Batch ${id} does not exist`)
      if (b.state === 'RUNNING' || b.state === 'HELD') return fail(`Batch ${id} is ${b.state}; stop it first`)
      const gone = new Set([id, ...descendants(id).map(d => d.id)])
      set(s => ({ batches: s.batches.filter(x => !gone.has(x.id)), prompts: s.prompts.filter(p => !(p.kind === 'Bind' && p.batch === id && !p.answered)) }))
      return ok(id)
    },
    batchCommand: (id, cmd) => {
      const b = get().batches.find(x => x.id === id)
      const denied = allowedFunction(CMD_FUNCTION[cmd], `Batch ${cmd.toLowerCase().replace('_', ' ')}`)
      if (denied) return fail(denied)
      if (!b) return fail(`Batch ${id} does not exist`)
      const r = recipeOf(b)
      if (!r) return fail(`${b.recipe} is not downloaded`)
      if (get().service !== 'RUNNING') return fail('The Batch Executive service is not running')
      if (isProc(b)) return procCommand(b, cmd)
      const key = b.pos >= 1 && b.pos <= r.steps.length ? stepKey(b, r, b.pos) : null
      const a = key ? active(key) : undefined
      switch (cmd) {
        case 'START':
          if (b.state !== 'IDLE') return fail(`Batch ${id} is ${b.state}; only an idle batch can be started`)
          if (!b.parent && !unitOf(b, r)) { const need = bindingsNeeded(r.name)[0]; if (need && !ensureBinding(b, need.key, need.label, need.unitClass)) journal('Event', id, '', `Batch ${id} is waiting for the ${need.label} binding`) }
          patchBatch(id, { state: 'RUNNING', started: now() })
          journal('Event', id, '', `Batch ${id} started by ${user()} [${get().client}]`)
          return ok('RUNNING')
        case 'HOLD':
          if (b.state !== 'RUNNING') return fail(`Batch ${id} is ${b.state}; only a running batch can be held`)
          if (key && a && a.rt.state === 'RUNNING') phaseCmd(key, 'HOLD')
          patchBatch(id, { state: 'HELD' })
          journal('Event', id, key ?? '', `Batch ${id} held by ${user()}`)
          return ok('HELD')
        case 'RESTART': {
          if (b.state !== 'HELD') return fail(`Batch ${id} is ${b.state}; only a held batch can be restarted`)
          if (b.failure) return fail(`Clear the failure first: ${b.failure}`)
          if (key && a && a.rt.state === 'HOLDING') return fail(`${key} is still Holding; restart the batch when the phase is Held`)
          if (key && a && a.rt.state === 'HELD') { const e = phaseCmd(key, 'RESTART'); if (e) return fail(e) }
          patchBatch(id, { state: 'RUNNING' })
          journal('Event', id, key ?? '', `Batch ${id} restarted by ${user()}`)
          return ok('RUNNING')
        }
        case 'CLEAR_FAILURES': {
          if (key && a && a.rt.failIndex !== 0) { const e = phaseCmd(key, 'CLEAR_FAILURES'); if (e) return fail(e) }
          patchBatch(id, { failure: null })
          journal('Event', id, key ?? '', `Failures cleared on batch ${id} by ${user()}`)
          return ok('cleared')
        }
        case 'STOP': case 'ABORT': {
          if (b.state !== 'RUNNING' && b.state !== 'HELD') return fail(`Batch ${id} is ${b.state}`)
          if (key && a) { const e = phaseCmd(key, cmd); if (e && cmd === 'STOP') phaseCmd(key, 'ABORT') }
          patchBatch(id, { state: cmd === 'STOP' ? 'STOPPED' : 'ABORTED', cleanup: true, ended: now() })
          journal('Event', id, key ?? '', `Batch ${id} ${cmd === 'STOP' ? 'stopped' : 'aborted'} by ${user()}`)
          return ok(cmd)
        }
      }
    },
    addComment: (id, text) => {
      const denied = allowedFunction('BATCH_USER_COMMENTS', 'Add a user comment')
      if (denied) return fail(denied)
      if (!get().batches.some(b => b.id === id)) return fail(`Batch ${id} does not exist`)
      if (!text.trim()) return fail('Enter the comment')
      journal('Comment', id, '', `[${get().client}] ${text.trim()}`)
      return ok(id)
    },
    answerPrompt: (id, response) => {
      const denied = allowedFunction('BATCH_ACK_PROMPT', 'Acknowledge a prompt')
      if (denied) return fail(denied)
      const p = get().prompts.find(x => x.id === id)
      if (!p) return fail('That prompt does not exist')
      if (p.answered) return fail('That prompt was already answered')
      if (p.kind === 'Bind') {
        if (!p.choices?.includes(response)) return fail(`Choose one of the units: ${(p.choices ?? []).join(', ')}`)
        const root = get().batches.find(x => x.id === p.batch)
        if (!root) return fail(`Batch ${p.batch} no longer exists`)
        const rr = recipeOf(root)
        patchBatch(root.id, { bindings: { ...(root.bindings ?? {}), [p.key]: response }, ...(rr && !isProc(root) && rr.equipment.name === p.key ? { unit: response } : {}) })
        set(s => ({ prompts: s.prompts.map(x => (x.id === id ? { ...x, answered: true, response } : x)) }))
        journal('Prompt', p.batch, p.key, `Operator bound ${p.key} to ${response} for batch ${p.batch} by ${user()}`)
        return ok('bound')
      }
      const a = active(p.key)
      if (!a) return fail(`${p.key} is no longer loaded`)
      let value: number | string
      if (p.kind === 'Boolean') value = /^(yes|true|1)$/i.test(response) ? 1 : 0
      else if (p.kind === 'String') value = response
      else { value = Number(response); if (!Number.isFinite(value) || (p.kind === 'Integer' && !Number.isInteger(value))) return fail(p.kind === 'Integer' ? 'Enter a whole number' : 'Enter a number') }
      const param = { Integer: 'PROMPT_INT', Float: 'PROMPT_FLOAT', Boolean: 'PROMPT_BOOL', String: 'PROMPT_STRING' }[p.kind]
      useBatch.setState(s => ({ active: { ...s.active, [p.key]: { ...s.active[p.key], rt: { ...s.active[p.key].rt, params: { ...s.active[p.key].rt.params, [param]: value } } } } }))
      clearRequest(p.key)
      set(s => ({ prompts: s.prompts.map(x => (x.id === id ? { ...x, answered: true, response: p.kind === 'Boolean' ? (value === 1 ? 'Yes' : 'No') : String(value) } : x)) }))
      journal('Prompt', p.batch, p.key, `Operator response to "${p.text}": ${p.kind === 'Boolean' ? (value === 1 ? 'Yes' : 'No') : value} by ${user()}`)
      return ok('answered')
    },

    acquirePhase: (unit, phase) => {
      const denied = allowedFunction('BATCH_ACQUIRE_RELEASE', 'Acquire a phase')
      if (denied) return fail(denied)
      const s = get()
      const b = useBatch.getState()
      const key = activeKey(unit, phase)
      if (s.service !== 'RUNNING') return fail('The Batch Executive service is not running')
      if (!b.units[unit]?.phases[phase]) return fail(`${phase} is not a unit phase of ${unit}`)
      if (s.owners[key]) return fail(`${key} is owned by ${s.owners[key]}`)
      if (b.active[key] && b.active[key].owner === 'EXTERNAL') return fail(`${key} is loaded from DeltaV Operate; unload it first`)
      const e = loadAsBatch(key)
      if (e) return fail(e)
      set(st => ({ owners: { ...st.owners, [key]: 'OPERATOR' } }))
      journal('Event', '', key, `${key} acquired by OPERATOR`)
      return ok(key)
    },
    releasePhase: (unit, phase) => {
      const denied = allowedFunction('BATCH_ACQUIRE_RELEASE', 'Release a phase')
      if (denied) return fail(denied)
      const key = activeKey(unit, phase)
      const owner = get().owners[key]
      if (owner !== 'OPERATOR') return fail(`${key} is not owned by OPERATOR`)
      const a = active(key)
      if (a && a.rt.state !== 'IDLE') return fail(`Reset ${phase} to Idle before releasing it (state ${STATE_LABEL[a.rt.state]})`)
      unloadPhaseKey(key)
      release(key)
      journal('Event', '', key, `${key} released by OPERATOR`)
      return ok(key)
    },
    manualCommand: (unit, phase, cmd, batchId) => {
      const denied = allowedFunction(CMD_FUNCTION[cmd], `Phase ${COMMAND_LABEL[cmd]}`)
      if (denied) return fail(denied)
      const key = activeKey(unit, phase)
      if (get().owners[key] !== 'OPERATOR') return fail(`Acquire ${key} first`)
      if (cmd === 'START') {
        if (!batchId?.trim()) return fail('Enter a Batch ID for tracking the phase in the Batch Event Journal')
        set(s => ({ manualBatch: { ...s.manualBatch, [key]: batchId.trim() } }))
      }
      const e = phaseCmd(key, cmd)
      if (e) return fail(e)
      journal('Event', get().manualBatch[key] ?? '', key, `${COMMAND_LABEL[cmd]} issued to ${key} by OPERATOR`)
      return ok(key)
    },

    step: () => {
      const s = get()
      if (s.service !== 'RUNNING') return
      serveRequests()
      for (const b0 of get().batches) {
        const b = get().batches.find(x => x.id === b0.id)
        if (!b) continue
        const r = recipeOf(b)
        if (!r) continue
        if (isProc(b)) {
          if (!b.parent && b.state === 'RUNNING' && !b.failure) {
            const bad = descendants(b.id).find(d => !isProc(d) && d.failure)
            if (bad) { holdAll(b); patchBatch(b.id, { state: 'HELD', failure: bad.failure }); journal('Failure', b.id, '', `Batch ${b.id} held: ${bad.failure}`); continue }
          }
          stepProc(b, r)
          continue
        }
        const own = ownerName(b, r)
        // Stopped or aborted: reset, unload and release the phase once it has settled.
        if (b.cleanup) {
          const key = b.pos >= 1 && b.pos <= r.steps.length ? stepKey(b, r, b.pos) : null
          const a = key ? active(key) : undefined
          if (!key || !a) { if (key) release(key); patchBatch(b.id, { cleanup: false }); continue }
          if (['STOPPED', 'ABORTED', 'COMPLETE', 'IDLE'].includes(a.rt.state)) {
            if (get().owners[key] === own) { unloadPhaseKey(key); release(key) }
            patchBatch(b.id, { cleanup: false })
          }
          continue
        }
        if (b.state !== 'RUNNING' && b.state !== 'HELD') continue
        if (b.state === 'RUNNING' && !b.parent && !unitOf(b, r)) {
          const need = bindingsNeeded(r.name)[0]
          if (need) ensureBinding(b, need.key, need.label, need.unitClass)
          continue
        }
        if (b.pos === 0) {
          if (b.state === 'RUNNING' && evalFor(b, r, r.transitions[0]?.condition || 'TRUE')) patchBatch(b.id, { pos: 1, stage: 'acquire' })
          continue
        }
        const key = stepKey(b, r, b.pos)
        const step = r.steps[b.pos - 1]
        if (b.stage === 'acquire') {
          if (b.state !== 'RUNNING') continue
          const owner = get().owners[key]
          if (owner && owner !== own) {
            if (b.waiting !== key) { patchBatch(b.id, { waiting: key }); journal('Event', b.id, key, `Batch ${rootOf(b).id} is waiting to acquire ${key} (owned by ${owner})`) }
            continue
          }
          const a0 = active(key)
          if (a0 && a0.owner === 'EXTERNAL') continue
          if (owner !== own) set(st => ({ owners: { ...st.owners, [key]: own } }))
          const e = loadAsBatch(key)
          if (e) { patchBatch(b.id, { state: 'HELD', failure: e }); journal('Failure', b.id, key, `Could not load ${key}: ${e}`); continue }
          for (const p of Object.values(r.params)) {
            if (p.step !== step.name) continue
            const [unit, phase] = split(key)
            useBatch.getState().setOnlineParam(unit, phase, p.phaseParam, b.params[p.name])
          }
          const ce = phaseCmd(key, 'START')
          if (ce) { patchBatch(b.id, { state: 'HELD', failure: ce }); journal('Failure', b.id, key, `${key}: ${ce}`); continue }
          patchBatch(b.id, { stage: 'run', waiting: null })
          journal('Event', b.id, key, `${key} acquired by ${b.parent ? r.name : own} and started (batch ${rootOf(b).id})`)
          continue
        }
        const a = active(key)
        if (!a) { patchBatch(b.id, { state: 'HELD', failure: `${key} is not loaded` }); continue }
        if (b.state === 'RUNNING' && (a.rt.state === 'HOLDING' || a.rt.state === 'HELD') && a.rt.failIndex !== 0 && !b.failure) {
          const text = `${key}: ${a.rt.message || `Phase failure ${a.rt.failIndex}`}`
          patchBatch(b.id, { state: 'HELD', failure: text })
          journal('Failure', b.id, key, `Phase failure: ${text}`)
          continue
        }
        if (b.state !== 'RUNNING') continue
        // Alternate transitions (slide 12-18) are checked first, in the order they were added.
        const loop = (r.branches ?? []).filter(x => x.from.toUpperCase() === step.name.toUpperCase()).find(x => evalFor(b, r, x.condition))
        if (loop) {
          const back = r.steps.findIndex(s => s.name.toUpperCase() === loop.to.toUpperCase()) + 1
          if (back < 1) { patchBatch(b.id, { state: 'HELD', failure: `Transition ${loop.name} connects to ${loop.to}, which is not a step of ${r.name}` }); journal('Failure', b.id, key, `Transition ${loop.name}: ${loop.to} is not a step`); continue }
          unloadPhaseKey(key)
          release(key)
          journal('Event', b.id, key, `${key} complete; transition ${loop.name} returns ${b.id} to ${loop.to}`)
          patchBatch(b.id, { pos: back, stage: 'acquire' })
          continue
        }
        if (evalFor(b, r, r.transitions[b.pos]?.condition || 'TRUE')) {
          unloadPhaseKey(key)
          release(key)
          journal('Event', b.id, key, `${key} complete; ${step.name} released`)
          if (b.pos >= r.steps.length) {
            patchBatch(b.id, { state: 'COMPLETE', ended: now(), pos: b.pos + 1 })
            journal('Event', b.id, '', b.parent ? `${b.step} (${r.name}) complete` : `Batch ${b.id} complete`)
          } else patchBatch(b.id, { pos: b.pos + 1, stage: 'acquire' })
        }
      }
    },
    resetExecutive: () => set(emptyState())
  }
})

useStore.subscribe((state, previous) => {
  const dt = (state.time - previous.time) / 1000
  if (dt > 0 && dt < 5) useExecutive.getState().step(dt)
})
libraryHooks.reset.push(() => useExecutive.getState().resetExecutive())

/** Number of batch failures and unanswered prompts, for the Operate status buttons. */
export function executiveCounts(s: ExecutiveState): { failures: number; prompts: number } {
  return { failures: s.batches.filter(b => b.failure && !b.parent).length, prompts: s.prompts.filter(p => !p.answered).length }
}
