import { create } from 'zustand'
import { useStore } from './store'
import { libraryHooks } from './libraryStore'
import { useBatch, activeKey } from './batchStore'
import { commandPhase, COMMAND_LABEL, STATE_LABEL, type PhaseCommand } from './batchConfig'

// Course 7016 Chapter 10: Recipe Studio operations, the Batch Executive (service, equipment, assigned areas and recipes),
// the Batch Operator Interface (batches, prompts, manual phase control, arbitration, journal) and recipe formulas.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never,>(error: string): Result<T> => ({ ok: false, error })

export type RecipeLevel = 'Operation' | 'Unit Procedure' | 'Procedure'
export interface RecipeProduct { name: string; code: string; version: string; author: string; approvedBy: string }
export interface RecipeStep { name: string; phaseClass: string; description: string }
export interface RecipeTransition { name: string; condition: string }
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
  equipment: { mode: 'Unit' | 'Unit Class'; name: string }
  /** Steps in order; transitions[0] follows START (always TRUE) and transitions[i] follows step i. */
  steps: RecipeStep[]
  transitions: RecipeTransition[]
  params: Record<string, RecipeParam>
  formulas: Record<string, Formula>
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
}
export interface Prompt { id: number; key: string; batch: string; kind: 'Integer' | 'Float' | 'Boolean' | 'String'; text: string; messageId: number; at: number; answered: boolean; response: string }
export interface JournalEntry { at: number; kind: 'Event' | 'Comment' | 'Prompt' | 'Failure'; batch: string; key: string; text: string; user: string }
export interface DownloadedRecipe { recipe: Recipe; at: number }

export interface ExecutiveState {
  enabled: boolean
  description: string
  restart: 'Query User' | 'Warm Restart' | 'Cold Restart'
  holdPropagation: string
  removeEventFilesDays: number
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
  setServerProps: (p: Partial<Pick<ExecutiveState, 'description' | 'restart' | 'holdPropagation' | 'removeEventFilesDays'>>) => void
  assignArea: (area: string) => Result<string>
  unassignArea: (area: string) => Result<string>
  newRecipe: (name: string, level?: RecipeLevel) => Result<string>
  deleteRecipe: (name: string) => Result<string>
  renameRecipe: (name: string, next: string) => Result<string>
  setRecipeProps: (name: string, p: Partial<Pick<Recipe, 'description' | 'workInProgress' | 'notes' | 'equipment'>> & { product?: Partial<RecipeProduct> }) => Result<string>
  /** Recipe Studio draft editing. */
  draftOf: (name: string) => Recipe | undefined
  editDraft: (name: string, edit: (r: Recipe) => string | null | void) => Result<string>
  saveRecipe: (name: string) => Result<string>
  discardDraft: (name: string) => void
  assignRecipe: (name: string) => Result<string>
  verifyRecipe: (name: string) => { errors: string[]; warnings: string[] }
  downloadRecipe: (name: string) => Result<{ warnings: string[] }>
  downloadEquipment: () => Result<number>
  startService: () => Result<string>
  stopService: () => Result<string>
  verifyPhases: () => Result<{ total: number; bad: number }>
  addBatch: (recipe: string, id: string, formula: string | null) => Result<string>
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

const now = (): number => useStore.getState().time
const user = (): string => 'ADMINISTRATOR'
export const defaultProduct = (): RecipeProduct => ({ name: '', code: '', version: '', author: '', approvedBy: '' })
export const defaultTransition = (step: RecipeStep): string => `${step.name}/BSTATUS = $phase_state:Complete`

function emptyState(): Pick<ExecutiveState, 'enabled' | 'description' | 'restart' | 'holdPropagation' | 'removeEventFilesDays' | 'assignedAreas' | 'recipes' | 'drafts' | 'assigned' | 'downloaded' | 'equipment' | 'equipmentAt' | 'service' | 'startedAt' | 'verify' | 'batches' | 'owners' | 'prompts' | 'nextPrompt' | 'journal' | 'manualBatch' | 'client'> {
  return {
    enabled: false, description: '', restart: 'Query User', holdPropagation: 'Procedure', removeEventFilesDays: 30, assignedAreas: [], recipes: {}, drafts: {}, assigned: {},
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

type Tok = { t: 'num' | 'str' | 'ref' | 'set' | 'op' | 'word'; v: string }
function tokenize(src: string): Tok[] | string {
  const out: Tok[] = []
  const re = /\s*(?:(\d+(?:\.\d+)?)|(\$[A-Za-z_]\w*:[A-Za-z_]\w*)|([A-Za-z_]\w*:\d+\/[A-Za-z_]\w*)|([A-Za-z_]\w*)|(<=|>=|<>|!=|=|<|>|\(|\)))/y
  let i = 0
  while (i < src.length) {
    re.lastIndex = i
    const m = re.exec(src)
    if (!m || m[0].length === 0) { if (!src.slice(i).trim()) break; return `Unexpected text near "${src.slice(i, i + 12).trim()}"` }
    i = re.lastIndex
    if (m[1] !== undefined) out.push({ t: 'num', v: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'set', v: m[2] })
    else if (m[3] !== undefined) out.push({ t: 'ref', v: m[3] })
    else if (m[4] !== undefined) out.push({ t: 'word', v: m[4].toUpperCase() })
    else if (m[5] !== undefined) out.push({ t: 'op', v: m[5] })
  }
  return out
}
type V = number | string | boolean | undefined
export function evalRecipeExpr(src: string, read: (step: string, param: string) => V): V | { error: string } {
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
  const r = evalRecipeExpr(src, () => 0)
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
  const journal = (kind: JournalEntry['kind'], batch: string, key: string, text: string): void => {
    useStore.getState().logEvent('BATCH', batch || key || 'BATCH EXECUTIVE', text)
    set(s => ({ journal: [...s.journal, { at: now(), kind, batch, key, text, user: user() }].slice(-800) }))
  }
  const patchBatch = (id: string, patch: Partial<Batch>): void => set(s => ({ batches: s.batches.map(b => (b.id === id ? { ...b, ...patch } : b)) }))
  const recipeOf = (b: Batch): Recipe | undefined => get().downloaded[b.recipe]?.recipe
  const stepKey = (r: Recipe, i: number): string => `${r.equipment.name}/${r.steps[i - 1].phaseClass}`
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
      const a = active(`${r.equipment.name}/${st.phaseClass}`)
      if (!a) return undefined
      if (param === 'BSTATUS') return STATE_LABEL[a.rt.state]
      const v = a.rt.params[param]
      return typeof v === 'boolean' ? v : (v as number | string | undefined)
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
      if (kind === 40 || kind === 42) { clearRequest(key); continue }
      if (kind === 52 || kind === 55) { (waiting[`${nn}:${kind}`] ??= []).push(key); continue }
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
    for (const nn of new Set(Object.keys(waiting).map(k => k.split(':')[0]))) {
      const send = waiting[`${nn}:52`], wait = waiting[`${nn}:55`]
      if (send?.length && wait?.length) { clearRequest(send[0]); clearRequest(wait[0]) }
    }
  }
  const batchOf = (key: string): string => {
    const owner = get().owners[key]
    const b = get().batches.find(x => x.recipe === owner && x.state !== 'COMPLETE' && x.state !== 'IDLE')
    return owner === 'OPERATOR' ? (get().manualBatch[key] ?? '') : (b?.id ?? '')
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
      if (s.downloaded[name] || s.batches.some(b => b.recipe === name)) return fail(`${name} has been downloaded to the Batch Executive and cannot be renamed`)
      const move = <T,>(r: Record<string, T>, f?: (v: T) => T): Record<string, T> => Object.fromEntries(Object.entries(r).map(([k, v]) => (k === name ? [to, f ? f(v) : v] : [k, v])))
      set({ recipes: move(s.recipes, r => ({ ...r, name: to })), drafts: move(s.drafts, r => ({ ...r, name: to })), assigned: move(s.assigned) })
      return ok(to)
    },
    setRecipeProps: (name, p) => {
      const r = get().recipes[name]
      if (!r) return fail(`${name} does not exist`)
      if (p.equipment?.mode === 'Unit' && p.equipment.name && !useBatch.getState().units[p.equipment.name]) return fail(`Unit ${p.equipment.name} does not exist`)
      if (p.equipment?.mode === 'Unit Class' && p.equipment.name && !useBatch.getState().unitClasses[p.equipment.name]) return fail(`Unit class ${p.equipment.name} does not exist`)
      const { product, ...rest } = p
      const next: Recipe = { ...r, ...rest, product: { ...r.product, ...(product ?? {}) }, revision: r.revision + 1, modified: now() }
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
      set(s => {
        const drafts = { ...s.drafts }
        delete drafts[name]
        return { recipes: { ...s.recipes, [name]: { ...d, revision: d.revision + 1, modified: now() } }, drafts }
      })
      useStore.getState().logEvent('CONFIGURE', name, `${d.level} ${name} saved in Recipe Studio`)
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
      const unit = r.equipment.mode === 'Unit' ? b.units[r.equipment.name] : undefined
      if (!r.equipment.name) errors.push('The recipe has no equipment: set the unit on the Equipment tab')
      else if (r.equipment.mode === 'Unit' && !unit) errors.push(`Unit ${r.equipment.name} does not exist`)
      for (const [i, s] of r.steps.entries()) {
        if (!b.phaseClasses[s.phaseClass]) errors.push(`Step ${s.name}: phase class ${s.phaseClass} does not exist`)
        else if (unit && !unit.phases[s.phaseClass]) errors.push(`Step ${s.name}: ${s.phaseClass} is not a unit phase of ${unit.name}`)
        for (const e of checkRecipeExpr(r.transitions[i + 1]?.condition ?? '', r.steps)) errors.push(`Transition ${r.transitions[i + 1]?.name ?? i + 1}: ${e}`)
      }
      for (const p of Object.values(r.params)) if (!r.steps.some(s => s.name === p.step)) errors.push(`Recipe parameter ${p.name} refers to the missing step ${p.step}`)
      if (r.workInProgress) warnings.push('The recipe is marked Work in progress')
      if (!r.product.version.trim()) warnings.push('No version is set on the Product tab')
      if (!r.product.author.trim()) warnings.push('No author is set on the Product tab')
      return { errors, warnings }
    },
    downloadRecipe: name => {
      const s = get()
      const r = s.recipes[name]
      if (!r) return fail(`${name} does not exist`)
      if (!s.enabled) return fail('The Batch Executive is not enabled')
      if (!s.assigned[name]) return fail(`${name} is not assigned to a Batch Executive: use Assign Now on the Tools tab`)
      const v = get().verifyRecipe(name)
      if (v.errors.length) return fail(`${name} cannot be downloaded: ${v.errors[0]}`)
      const area = unitArea(r.equipment.name)
      if (!s.assignedAreas.includes(area)) return fail(`${r.equipment.name} is in area ${area || '(none)'}, which is not assigned to the Batch Executive`)
      set(st => ({ downloaded: { ...st.downloaded, [name]: { recipe: clone(r), at: now() } } }))
      useStore.getState().logEvent('CONFIGURE', name, `${name} revision ${r.revision} downloaded to the Batch Executive`)
      return ok({ warnings: v.warnings })
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

    addBatch: (recipe, rawId, formula) => {
      const s = get()
      const id = rawId.trim()
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
      const batch: Batch = { id, recipe, formula, state: 'IDLE', created: now(), started: null, ended: null, pos: 0, stage: 'acquire', params, failure: null, waiting: null, creator: user(), cleanup: false }
      set(st => ({ batches: [...st.batches, batch] }))
      journal('Event', id, '', `Batch ${id} created from ${recipe}${formula ? ` with formula ${formula}` : ''} by ${user()} [${get().client}]`)
      return ok(id)
    },
    removeBatch: id => {
      const b = get().batches.find(x => x.id === id)
      if (!b) return fail(`Batch ${id} does not exist`)
      if (b.state === 'RUNNING' || b.state === 'HELD') return fail(`Batch ${id} is ${b.state}; stop it first`)
      set(s => ({ batches: s.batches.filter(x => x.id !== id) }))
      return ok(id)
    },
    batchCommand: (id, cmd) => {
      const b = get().batches.find(x => x.id === id)
      if (!b) return fail(`Batch ${id} does not exist`)
      const r = recipeOf(b)
      if (!r) return fail(`${b.recipe} is not downloaded`)
      if (get().service !== 'RUNNING') return fail('The Batch Executive service is not running')
      const key = b.pos >= 1 && b.pos <= r.steps.length ? stepKey(r, b.pos) : null
      const a = key ? active(key) : undefined
      switch (cmd) {
        case 'START':
          if (b.state !== 'IDLE') return fail(`Batch ${id} is ${b.state}; only an idle batch can be started`)
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
      if (!get().batches.some(b => b.id === id)) return fail(`Batch ${id} does not exist`)
      if (!text.trim()) return fail('Enter the comment')
      journal('Comment', id, '', `[${get().client}] ${text.trim()}`)
      return ok(id)
    },
    answerPrompt: (id, response) => {
      const p = get().prompts.find(x => x.id === id)
      if (!p) return fail('That prompt does not exist')
      if (p.answered) return fail('That prompt was already answered')
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
        const b = get().batches.find(x => x.id === b0.id)!
        const r = recipeOf(b)
        if (!r) continue
        // Stopped or aborted: reset, unload and release the phase once it has settled.
        if (b.cleanup) {
          const key = b.pos >= 1 && b.pos <= r.steps.length ? stepKey(r, b.pos) : null
          const a = key ? active(key) : undefined
          if (!key || !a) { if (key) release(key); patchBatch(b.id, { cleanup: false }); continue }
          if (['STOPPED', 'ABORTED', 'COMPLETE', 'IDLE'].includes(a.rt.state)) {
            if (get().owners[key] === r.name) { unloadPhaseKey(key); release(key) }
            patchBatch(b.id, { cleanup: false })
          }
          continue
        }
        if (b.state !== 'RUNNING' && b.state !== 'HELD') continue
        if (b.pos === 0) {
          if (b.state === 'RUNNING' && evalFor(b, r, r.transitions[0]?.condition || 'TRUE')) patchBatch(b.id, { pos: 1, stage: 'acquire' })
          continue
        }
        const key = stepKey(r, b.pos)
        const step = r.steps[b.pos - 1]
        if (b.stage === 'acquire') {
          if (b.state !== 'RUNNING') continue
          const owner = get().owners[key]
          if (owner && owner !== r.name) {
            if (b.waiting !== key) { patchBatch(b.id, { waiting: key }); journal('Event', b.id, key, `Batch ${b.id} is waiting to acquire ${key} (owned by ${owner})`) }
            continue
          }
          const a0 = active(key)
          if (a0 && a0.owner === 'EXTERNAL') continue
          if (owner !== r.name) set(st => ({ owners: { ...st.owners, [key]: r.name } }))
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
          journal('Event', b.id, key, `${key} acquired by ${r.name} and started (batch ${b.id})`)
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
        if (evalFor(b, r, r.transitions[b.pos]?.condition || 'TRUE')) {
          unloadPhaseKey(key)
          release(key)
          journal('Event', b.id, key, `${key} complete; ${step.name} released`)
          if (b.pos >= r.steps.length) {
            patchBatch(b.id, { state: 'COMPLETE', ended: now(), pos: b.pos + 1 })
            journal('Event', b.id, '', `Batch ${b.id} complete`)
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
  return { failures: s.batches.filter(b => b.failure).length, prompts: s.prompts.filter(p => !p.answered).length }
}
