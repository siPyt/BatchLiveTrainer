import { create } from 'zustand'
import { useStore } from './store'
import { useSecurity } from './security'
import { makeModule } from './plant'
import { controllerIsDown } from './hardware'
import { isNameValid, NAME_RULE, defaultSfc, type PhaseSfc, type SeqPos } from './batchConfig'
import { evalCondition, runProgram, EvalError, MODE_WORDS, type CheckEnv, type Value } from './phaseExpr'
import { isValidDeltaVTag } from './naming'
import type { AnyModule } from './types'
import { COURSE_VALVE_TRAVEL } from './classLibrary'

// Course 7016 Chapter 5 (Module Classes): Equipment Module Classes (command-driven and
// state-driven), the Control Module Classes they embed (2STAGE_VALVE, NC_VALVE, AGIT_MTR,
// OUT_PMP), equipment module instances created from a unit class, and the A_COMMAND /
// A_TARGET / A_PV / A_ABT_ON_NEW_CMD runtime (pp 5-4 .. 5-50).

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never,>(error: string): Result<T> => ({ ok: false, error })

export type EmAlgorithm = 'Function Block Diagram' | 'Sequential Function Chart' | 'Command driven' | 'State driven' |
  'Phase Algorithm' | 'Phase with command-driven run logic' | 'Phase with state-driven run logic'
export const EM_ALGORITHMS: EmAlgorithm[] = ['Function Block Diagram', 'Sequential Function Chart', 'Command driven', 'State driven',
  'Phase Algorithm', 'Phase with command-driven run logic', 'Phase with state-driven run logic']
/** Course 7016 pp 5-8 / 5-9 definitions. Only Command driven and State driven are simulated (ALGORITHM-TYPES-NOTES.txt). */
export const EM_ALGORITHM_NOTE: Record<EmAlgorithm, string> = {
  'Function Block Diagram': 'Contains a control strategy with interconnected standard DeltaV function blocks. You define which blocks to use, their parameters and how they work together (p5-8).',
  'Sequential Function Chart': 'Contains a sequence of events with steps, transitions and actions (p5-8).',
  'Command driven': 'Contains SFC code based on commands: selects one of a number of command sub-blocks to run, based on the value written to A_COMMAND (a named set with an entry for each command plus the mandatory 255 idle entry) (p5-8).',
  'State driven': 'Contains SFC code based on states: a single step or value manipulates the control modules; best for simple equipment manipulation without complex timing, such as changing the setpoints on a group of valves or motors (p5-9).',
  'Phase Algorithm': 'Contains a state transition diagram made up of embedded composites that contain the logic that governs the transition between the states of a phase (p5-9).',
  'Phase with command-driven run logic': 'Substitutes the run logic composite block with a command-driven composite block (p5-9).',
  'Phase with state-driven run logic': 'Substitutes the run logic composite block with state-driven logic (p5-9).'
}
export const SUPPORTED_EM_ALGORITHMS: EmAlgorithm[] = ['Command driven', 'State driven']

/** Control Module Classes provided in the DV_School library for Chapter 5 (pp 5-13, 5-21, 5-32). */
export interface CmDeviceClass { name: string; category: string; kind: 'VALVE' | 'MOTOR'; twoStage: boolean; description: string; spSet: string; pvSet: string; template: string }
export const CM_DEVICE_CLASSES: Record<string, CmDeviceClass> = {
  '2STAGE_VALVE': { name: '2STAGE_VALVE', category: 'NC_Valves', kind: 'VALVE', twoStage: true, description: 'Two stage (dribble / bulk) normally closed valve', spSet: 'vlvnc2stage-sp', pvSet: 'vlvnc2stage-pv', template: 'VLVNC-12 (second output drives the bulk stage)' },
  NC_VALVE: { name: 'NC_VALVE', category: 'NC_Valves', kind: 'VALVE', twoStage: false, description: 'Normally closed block valve', spSet: 'vlvnc-sp', pvSet: 'vlvnc-pv', template: 'VLVNC-11' },
  AGIT_MTR: { name: 'AGIT_MTR', category: '2StateMotor', kind: 'MOTOR', twoStage: false, description: 'Two state agitator motor', spSet: 'mtr2-sp', pvSet: 'mtr2-pv', template: 'MTR-11' },
  OUT_PMP: { name: 'OUT_PMP', category: '2StateMotor', kind: 'MOTOR', twoStage: false, description: 'Two state outlet pump', spSet: 'mtr2-sp', pvSet: 'mtr2-pv', template: 'MTR-11' }
}
/** Module-level parameters of the device classes (course p2-9..2-11). */
export const DEVICE_PARAMS = ['MODE.TARGET', 'MODE.ACTUAL', 'CAS_SP.CV', 'PV.CV', 'PV_D.CV', 'SP_D.CV', 'DC1/MODE.TARGET', 'DC1/PV_D.CV', 'DC1/SP_D.CV']

export const EM_PARAMS: [string, string][] = [
  ['A_ABT_ON_NEW_CMD', 'False'], ['A_COMMAND', 'Idle'], ['A_ERROR', 'False'], ['A_INITIALIZED', 'False'], ['A_MAX_TIME', 'False'],
  ['A_PV', 'Idle'], ['A_STATE', 'Idle'], ['A_TARGET', 'Idle'], ['A_TIME', '0'], ['ABNORM_ACTIVE', 'False'], ['MONITOR_ON', 'True']
]
export const MODE_CHOICES = ['Cascade', 'Auto', 'Manual', 'Out of Service']
const MODE_WORD: Record<string, string> = { CASCADE: 'CAS', AUTO: 'AUTO', MANUAL: 'MAN', 'OUT OF SERVICE': 'OOS' }

export interface EmCategory { name: string; parent: string | null }
export interface EmChild { name: string; className: string }
export interface EmCommand { value: number; block: string; state: string; maxTime: number; enabled: boolean; sfc: PhaseSfc }
export interface EmItem { name: string; write: string; readback: string }
export interface EmClass {
  name: string
  category: string
  description: string
  algorithm: EmAlgorithm
  namedSet: string
  children: Record<string, EmChild>
  /** Command-driven: COMMAND_0000n blocks keyed by named-set value. */
  commands: Record<string, EmCommand>
  /** State-driven: item rows and the value of every item for each named-set state. */
  items: EmItem[]
  states: Record<string, Record<string, string>>
  revision: number
}
export interface EmInstance { tag: string; className: string; area: string; unit: string | null; block: string | null; children: Record<string, string>; description: string }
export interface CmInstance { tag: string; className: string; owner: { kind: 'unit' | 'em'; name: string; block: string } }
export type BlockStatus = 'Idle' | 'Running' | 'Complete' | 'Failed' | 'Aborted'
export interface EmRuntime {
  command: number
  target: number
  pv: number
  abortOnNew: boolean
  running: { value: number; seq: SeqPos | null } | null
  queued: number | null
  blocks: Record<string, BlockStatus>
  error: string
  time: number
}
export interface EmDeployment { cls: EmClass; children: Record<string, string>; controller: string; at: number }

export interface EmIo {
  read: (path: string) => Value
  write: (path: string, value: Value) => void
  named: (set: string, state: string) => number
  log: (tag: string, text: string) => void
}
/** Module I/O provided by the batch store (valves/motors in CAS, analog PVs) without a circular import. */
export const emIo: { current: EmIo | null } = { current: null }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
function withoutKeys<T>(r: Record<string, T>, keys: readonly string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k)))
}
function requireUnlockedLock(lock: 'CAN_CONFIGURE' | 'CONTROL', action: string): boolean {
  const sec = useSecurity.getState()
  if (sec.locked) { useSecurity.setState({ lastDenied: `Access Denied — ${action} requires an unlocked workstation` }); return false }
  return sec.requireLock(lock, action)
}
const log = (tag: string, text: string, category: 'CONFIGURE' | 'BATCH' | 'DIAGNOSTIC' = 'CONFIGURE'): void => useStore.getState().logEvent(category, tag, text)

export function namedSetOf(name: string): { name: string; entries: { name: string; value: number; userSelectable?: boolean }[] } | undefined {
  const sets = useStore.getState().namedSets.configured
  return Object.values(sets).find(s => s.name.toLowerCase() === name.trim().toLowerCase())
}
export function stateName(set: string, value: number): string {
  return namedSetOf(set)?.entries.find(e => e.value === value)?.name ?? String(value)
}
export const IDLE = 255

/** Block names in a class / unit class: the class name truncated to 11 characters plus _n (2STAGE_VALV_1, BLENDER_COL_1). */
export function blockName(className: string, taken: (n: string) => boolean): string {
  const stem = className.slice(0, 11)
  for (let n = 1; ; n++) if (!taken(`${stem}_${n}`)) return `${stem}_${n}`
}

export function commandsFor(set: string, previous: Record<string, EmCommand> = {}): Record<string, EmCommand> | string {
  const def = namedSetOf(set)
  if (!def) return `Named set ${set} does not exist`
  if (!def.entries.some(e => e.value === IDLE)) return `Named set ${set} needs the mandatory entry with value 255 (undefined / idle)`
  return Object.fromEntries(def.entries.filter(e => e.value !== IDLE).sort((a, b) => a.value - b.value).map(e => {
    const key = String(e.value)
    const prev = previous[key]
    return [key, { value: e.value, block: `COMMAND_${String(e.value).padStart(5, '0')}`, state: e.name, maxTime: prev?.maxTime ?? 0, enabled: prev?.enabled ?? true, sfc: prev?.sfc ?? defaultSfc() }]
  }))
}

function statesFor(set: string, previous: Record<string, Record<string, string>> = {}): Record<string, Record<string, string>> | string {
  const def = namedSetOf(set)
  if (!def) return `Named set ${set} does not exist`
  if (!def.entries.some(e => e.value === IDLE)) return `Named set ${set} needs the mandatory entry with value 255 (undefined / idle)`
  return Object.fromEntries(def.entries.filter(e => e.value !== IDLE).map(e => [String(e.value), previous[String(e.value)] ?? {}]))
}

export function newEmClass(name: string, category: string, algorithm: EmAlgorithm, namedSet: string): EmClass | string {
  const base: EmClass = { name, category, description: '', algorithm, namedSet, children: {}, commands: {}, items: [], states: {}, revision: 1 }
  if (algorithm === 'Command driven') { const c = commandsFor(namedSet); if (typeof c === 'string') return c; base.commands = c }
  if (algorithm === 'State driven') { const st = statesFor(namedSet); if (typeof st === 'string') return st; base.states = st }
  return base
}

/** Parameter of a child module block: 'PRODUCT_VLV/MODE.TARGET' → { block, param }. */
export function splitBlockPath(path: string): { block: string; param: string } | null {
  const i = path.indexOf('/')
  if (i <= 0) return null
  return { block: path.slice(0, i).trim().toUpperCase(), param: path.slice(i + 1).trim().toUpperCase() }
}

export function itemError(cls: EmClass, item: EmItem, others: EmItem[]): string | null {
  if (!isNameValid(item.name)) return NAME_RULE
  if (others.some(o => o.name === item.name)) return `Item ${item.name} already exists`
  for (const [label, path] of [['Write', item.write], ['Readback', item.readback]] as const) {
    const sp = splitBlockPath(path)
    if (!sp || !cls.children[sp.block]) return `${label} parameter path must name a module block of ${cls.name} (${Object.keys(cls.children).join(', ') || 'none yet'}) and a parameter, e.g. PRODUCT_VLV/MODE.TARGET`
    if (!DEVICE_PARAMS.includes(sp.param)) return `Only module level parameters are available for the ${label.toLowerCase()} path (${DEVICE_PARAMS.slice(0, 6).join(', ')})`
  }
  return null
}

/** Choices for a state-table cell: modes for MODE.TARGET items, the child's setpoint named set states for CAS_SP / SP_D. */
export function itemChoices(cls: EmClass, item: EmItem): string[] {
  const sp = splitBlockPath(item.write)
  if (!sp) return []
  if (sp.param.startsWith('MODE')) return MODE_CHOICES
  const child = cls.children[sp.block]
  const dev = child && CM_DEVICE_CLASSES[child.className]
  const set = dev && namedSetOf(dev.spSet)
  return set ? set.entries.map(e => e.name) : []
}

// ---------------------------------------------------------------------------
// Expression references inside an equipment module (command blocks)

type EmRef = { k: 'param'; name: string } | { k: 'child'; block: string; param: string } | { k: 'external'; path: string } | string
export function classifyEmRef(ref: string): EmRef {
  const r = ref.trim()
  if (r.includes('#')) return 'Unit aliases (#ALIAS#) are not available inside an equipment module class; reference its module blocks with ^/BLOCK/PARAMETER'
  if (r.startsWith('//')) return { k: 'external', path: r.slice(2).toUpperCase() }
  const body = r.startsWith('^/') ? r.slice(2) : r.startsWith('/') ? r.slice(1) : null
  if (body === null) return `'${ref}' — internal references begin with ^/ (the equipment module) and external ones with //`
  const up = body.toUpperCase()
  if (up.includes('/')) { const sp = splitBlockPath(up)!; return { k: 'child', block: sp.block, param: sp.param } }
  return { k: 'param', name: up.split('.')[0] }
}

export function emCheckEnv(cls: EmClass): CheckEnv {
  return {
    checkRef: (ref, write) => {
      const c = classifyEmRef(ref)
      if (typeof c === 'string') return c
      if (c.k === 'param') {
        if (!EM_PARAMS.some(([n]) => n === c.name)) return `${c.name} is not a parameter of ${cls.name}`
        return write && c.name !== 'A_COMMAND' && c.name !== 'A_ABT_ON_NEW_CMD' ? `${c.name} is read-only` : null
      }
      if (c.k === 'child') {
        if (!cls.children[c.block]) return `${c.block} is not a module block of ${cls.name} (${Object.keys(cls.children).join(', ') || 'none'})`
        const p = c.param.includes('.') ? c.param : `${c.param}.CV`
        return DEVICE_PARAMS.includes(p) ? null : `${c.block} has no parameter ${c.param}`
      }
      const mod = c.path.split('/')[0]
      return useStore.getState().modules[mod] || useEm.getState().instances[mod] ? null : `Module ${mod} does not exist`
    },
    checkNamed: (set, state) => {
      const def = namedSetOf(set)
      if (!def) return `Named set ${set} does not exist`
      return def.entries.some(e => e.name.toUpperCase() === state.trim().toUpperCase()) ? null : `Named set ${set} has no state ${state}`
    }
  }
}

// ---------------------------------------------------------------------------
// Store

interface EmState {
  categories: Record<string, EmCategory>
  classes: Record<string, EmClass>
  drafts: Record<string, EmClass>
  instances: Record<string, EmInstance>
  cmInstances: Record<string, CmInstance>
  runtime: Record<string, EmRuntime>
  deployed: Record<string, EmDeployment>

  resetEm: () => void
  newCategory: (parent: string | null) => Result<string>
  renameCategory: (name: string, next: string) => Result<string>
  deleteCategory: (name: string) => Result<string>
  newClass: (category: string, name: string, algorithm: EmAlgorithm, namedSet: string) => Result<string>
  /** New ▸ Start From Existing: copy a saved equipment module class into category under a new name. */
  copyClass: (category: string, source: string, name: string) => Result<string>
  renameClass: (name: string, next: string) => Result<string>
  deleteClass: (name: string) => Result<string>
  setClassProps: (name: string, patch: { description?: string; namedSet?: string }) => Result<string>
  addChild: (emClass: string, cmClass: string) => Result<string>
  renameChild: (emClass: string, block: string, next: string) => Result<string>
  removeChild: (emClass: string, block: string) => Result<string>
  draftOf: (name: string) => EmClass | undefined
  editDraft: (name: string, edit: (d: EmClass) => string | null | void) => Result<string>
  saveClass: (name: string) => Result<string>
  discardDraft: (name: string) => void

  setCommand: (tag: string, command: number | string) => Result<number>
  setAbortOnNew: (tag: string, value: boolean) => Result<boolean>
  stepEms: (dt: number) => void
}

const empty = (): Pick<EmState, 'categories' | 'classes' | 'drafts' | 'instances' | 'cmInstances' | 'runtime' | 'deployed'> => ({
  categories: {}, classes: {}, drafts: {}, instances: {}, cmInstances: {}, runtime: {}, deployed: {}
})

export function emNameTaken(name: string, except?: string): boolean {
  const s = useEm.getState()
  const k = name.toUpperCase()
  return [...Object.keys(s.classes), ...Object.keys(CM_DEVICE_CLASSES)].some(n => n.toUpperCase() === k && n !== except)
}

function freshRuntime(): EmRuntime {
  return { command: IDLE, target: IDLE, pv: IDLE, abortOnNew: false, running: null, queued: null, blocks: {}, error: '', time: 0 }
}

export const useEm = create<EmState>((set, get) => ({
  ...empty(),

  resetEm: () => set(empty()),

  newCategory: parent => {
    const s = get()
    if (parent && !s.categories[parent]) return fail(`Category ${parent} does not exist`)
    let name = 'NewCategory'
    for (let n = 1; s.categories[name]; n++) name = `NewCategory${n}`
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create equipment module class category ${name}`)) return fail('Requires the Can Configure key')
    set({ categories: { ...s.categories, [name]: { name, parent } } })
    log(name, 'Equipment Module Class Category created')
    return ok(name)
  },
  renameCategory: (name, raw) => {
    const s = get()
    const to = raw.trim()
    if (!s.categories[name]) return fail(`Category ${name} does not exist`)
    if (to === name) return ok(name)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (s.categories[to]) return fail(`Category ${to} already exists`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename equipment module class category ${name}`)) return fail('Requires the Can Configure key')
    const categories = Object.fromEntries(Object.values(s.categories).map(c => {
      const moved = { ...c, parent: c.parent === name ? to : c.parent }
      return c.name === name ? [to, { ...moved, name: to }] : [c.name, moved]
    }))
    const recat = (r: Record<string, EmClass>): Record<string, EmClass> => Object.fromEntries(Object.entries(r).map(([k, c]) => [k, c.category === name ? { ...c, category: to } : c]))
    set({ categories, classes: recat(s.classes), drafts: recat(s.drafts) })
    log(to, `Equipment Module Class Category renamed from ${name}`)
    return ok(to)
  },
  deleteCategory: name => {
    const s = get()
    if (!s.categories[name]) return fail(`Category ${name} does not exist`)
    const kids = [...Object.values(s.categories).filter(c => c.parent === name).map(c => c.name), ...Object.values(s.classes).filter(c => c.category === name).map(c => c.name)]
    if (kids.length) return fail(`Category ${name} is not empty (${kids.join(', ')})`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete equipment module class category ${name}`)) return fail('Requires the Can Configure key')
    set({ categories: withoutKeys(s.categories, [name]) })
    log(name, 'Equipment Module Class Category deleted')
    return ok(name)
  },

  newClass: (category, raw, algorithm, namedSet) => {
    const s = get()
    const name = raw.trim().toUpperCase()
    if (!s.categories[category]) return fail(`Category ${category} does not exist`)
    if (!isNameValid(name)) return fail(NAME_RULE)
    if (emNameTaken(name)) return fail(`The name ${name} is already used in the library`)
    if (!SUPPORTED_EM_ALGORITHMS.includes(algorithm)) return fail(`The ${algorithm} algorithm type is defined in the course (p5-8/5-9) but not yet simulated in BatchLiveTrainer; Chapter 5 uses Command driven (BLENDER_COLOR) and State driven (BLENDER_OUTLET). See ALGORITHM-TYPES-NOTES.txt for what is needed to add it.`)
    if (!namedSet.trim()) return fail('Browse for the named set that defines the commands or states')
    const cls = newEmClass(name, category, algorithm, namedSetOf(namedSet)?.name ?? namedSet.trim())
    if (typeof cls === 'string') return fail(cls)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create equipment module class ${name}`)) return fail('Requires the Can Configure key')
    set({ classes: { ...s.classes, [name]: cls } })
    log(name, `Equipment Module Class created in ${category} (${algorithm}, named set ${cls.namedSet})`)
    return ok(name)
  },
  copyClass: (category, source, raw) => {
    const s = get()
    const name = raw.trim().toUpperCase()
    if (!s.categories[category]) return fail(`Category ${category} does not exist`)
    const from = s.classes[source]
    if (!from) return fail('Browse for an existing equipment module class to start from')
    if (!isNameValid(name)) return fail(NAME_RULE)
    if (emNameTaken(name)) return fail(`The name ${name} is already used in the library`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create equipment module class ${name} from ${source}`)) return fail('Requires the Can Configure key')
    set({ classes: { ...s.classes, [name]: { ...structuredClone(from), name, category, revision: 1 } } })
    log(name, `Equipment Module Class created in ${category} from existing ${source} (${from.algorithm}, named set ${from.namedSet})`)
    return ok(name)
  },
  renameClass: (name, raw) => {
    const s = get()
    const to = raw.trim().toUpperCase()
    if (!s.classes[name]) return fail(`${name} does not exist`)
    if (to === name) return ok(name)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (emNameTaken(to, name)) return fail(`The name ${to} is already used in the library`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename equipment module class ${name}`)) return fail('Requires the Can Configure key')
    const move = (r: Record<string, EmClass>): Record<string, EmClass> => { const out = { ...r }; if (out[name]) { out[to] = { ...out[name], name: to }; delete out[name] } return out }
    set({ classes: move(s.classes), drafts: move(s.drafts),
      instances: Object.fromEntries(Object.entries(s.instances).map(([k, i]) => [k, i.className === name ? { ...i, className: to } : i])) })
    emClassRenamed.forEach(fn => fn(name, to))
    log(to, `Equipment Module Class renamed from ${name}`)
    return ok(to)
  },
  deleteClass: name => {
    const s = get()
    if (!s.classes[name]) return fail(`${name} does not exist`)
    const users = Object.values(s.instances).filter(i => i.className === name).map(i => i.tag)
    if (users.length) return fail(`${name} is used by ${users.join(', ')}`)
    const inUnits = emClassUsers.flatMap(fn => fn(name))
    if (inUnits.length) return fail(`${name} is used by unit class ${inUnits.join(', ')}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete equipment module class ${name}`)) return fail('Requires the Can Configure key')
    set({ classes: withoutKeys(s.classes, [name]), drafts: withoutKeys(s.drafts, [name]) })
    log(name, 'Equipment Module Class deleted')
    return ok(name)
  },
  setClassProps: (name, patch) => {
    const s = get()
    const cls = s.classes[name]
    if (!cls) return fail(`${name} does not exist`)
    let next: EmClass = { ...cls, description: patch.description ?? cls.description }
    if (patch.namedSet !== undefined && patch.namedSet.trim().toLowerCase() !== cls.namedSet.toLowerCase()) {
      const setName = namedSetOf(patch.namedSet)?.name ?? patch.namedSet.trim()
      if (cls.algorithm === 'Command driven') { const c = commandsFor(setName, cls.commands); if (typeof c === 'string') return fail(c); next = { ...next, namedSet: setName, commands: c } }
      else { const st = statesFor(setName, cls.states); if (typeof st === 'string') return fail(st); next = { ...next, namedSet: setName, states: st } }
    }
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure equipment module class ${name}`)) return fail('Requires the Can Configure key')
    set({ classes: { ...s.classes, [name]: { ...next, revision: cls.revision + 1 } } })
    log(name, 'Equipment Module Class properties changed')
    return ok(name)
  },
  addChild: (emClass, cmClass) => {
    const s = get()
    const cls = s.classes[emClass]
    if (!cls) return fail(`${emClass} does not exist`)
    if (!CM_DEVICE_CLASSES[cmClass]) return fail(`${cmClass} is not a Control Module Class that can be embedded (Chapter 5 uses 2STAGE_VALVE and NC_VALVE)`)
    const name = blockName(cmClass, n => !!cls.children[n])
    if (!requireUnlockedLock('CAN_CONFIGURE', `Add module block ${cmClass} to equipment module class ${emClass}`)) return fail('Requires the Can Configure key')
    const children = { ...cls.children, [name]: { name, className: cmClass } }
    const draft = s.drafts[emClass]
    set({ classes: { ...s.classes, [emClass]: { ...cls, children, revision: cls.revision + 1 } },
      drafts: draft ? { ...s.drafts, [emClass]: { ...draft, children } } : s.drafts })
    log(emClass, `Module block ${name} (${cmClass}) added`)
    return ok(name)
  },
  renameChild: (emClass, block, raw) => {
    const s = get()
    const cls = s.classes[emClass]
    const to = raw.trim().toUpperCase()
    if (!cls?.children[block]) return fail(`${block} is not a module block of ${emClass}`)
    if (to === block) return ok(block)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (cls.children[to]) return fail(`${to} already exists in ${emClass}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename module block ${block}`)) return fail('Requires the Can Configure key')
    const ren = (c: EmClass): EmClass => {
      const children = Object.fromEntries(Object.values(c.children).map(ch => (ch.name === block ? [to, { ...ch, name: to }] : [ch.name, ch])))
      const fix = (p: string): string => (p.toUpperCase().startsWith(`${block}/`) ? `${to}/${p.slice(block.length + 1)}` : p)
      return { ...c, children, items: c.items.map(i => ({ ...i, write: fix(i.write), readback: fix(i.readback) })) }
    }
    set({ classes: { ...s.classes, [emClass]: { ...ren(cls), revision: cls.revision + 1 } },
      drafts: s.drafts[emClass] ? { ...s.drafts, [emClass]: ren(s.drafts[emClass]) } : s.drafts })
    log(emClass, `Module block ${block} renamed to ${to}`)
    return ok(to)
  },
  removeChild: (emClass, block) => {
    const s = get()
    const cls = s.classes[emClass]
    if (!cls?.children[block]) return fail(`${block} is not a module block of ${emClass}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Remove module block ${block}`)) return fail('Requires the Can Configure key')
    set({ classes: { ...s.classes, [emClass]: { ...cls, children: withoutKeys(cls.children, [block]), revision: cls.revision + 1 } } })
    log(emClass, `Module block ${block} deleted`)
    return ok(block)
  },
  draftOf: name => get().drafts[name] ?? get().classes[name],
  editDraft: (name, edit) => {
    const s = get()
    const cls = s.classes[name]
    if (!cls) return fail(`${name} does not exist`)
    const draft = clone(s.drafts[name] ?? cls)
    const err = edit(draft)
    if (err) return fail(err)
    set({ drafts: { ...s.drafts, [name]: draft } })
    return ok(name)
  },
  saveClass: name => {
    const s = get()
    const cls = s.classes[name]
    const draft = s.drafts[name]
    if (!cls) return fail(`${name} does not exist`)
    if (!draft) return ok(name)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Save equipment module class ${name}`)) return fail('Requires the Can Configure key')
    set({ classes: { ...s.classes, [name]: { ...draft, revision: cls.revision + 1 } }, drafts: withoutKeys(s.drafts, [name]) })
    log(name, `Equipment Module Class saved (revision ${cls.revision + 1})`)
    return ok(name)
  },
  discardDraft: name => set(s => ({ drafts: withoutKeys(s.drafts, [name]) })),

  // ---- Runtime --------------------------------------------------------------
  setCommand: (tag, command) => {
    const s = get()
    const dep = s.deployed[tag]
    if (!s.instances[tag]) return fail(`${tag} is not an equipment module`)
    if (!dep) return fail(`${tag} has not been downloaded`)
    const def = namedSetOf(dep.cls.namedSet)
    const entry = typeof command === 'number' ? def?.entries.find(e => e.value === command) :
      def?.entries.find(e => e.name.toUpperCase() === command.trim().toUpperCase()) ?? def?.entries.find(e => String(e.value) === command.trim())
    if (!entry) return fail(`${String(command)} is not a state of named set ${dep.cls.namedSet}`)
    if (entry.value === IDLE || entry.userSelectable === false) return fail(`${entry.name} is not user selectable`)
    if (dep.cls.algorithm === 'Command driven' && dep.cls.commands[String(entry.value)]?.enabled === false) return fail(`${dep.cls.commands[String(entry.value)].block} is disabled`)
    if (!requireUnlockedLock('CONTROL', `Command equipment module ${tag}`)) return fail('Requires the Control key')
    const rt = { ...(s.runtime[tag] ?? freshRuntime()), command: entry.value }
    log(tag, `A_COMMAND := ${entry.name}`, 'BATCH')
    if (rt.running && !rt.abortOnNew) {
      set({ runtime: { ...s.runtime, [tag]: { ...rt, queued: entry.value } } })
      return ok(entry.value)
    }
    if (rt.running) {
      const prev = dep.cls.commands[String(rt.running.value)]
      if (prev) rt.blocks = { ...rt.blocks, [prev.block]: 'Aborted' }
      log(tag, `${prev?.block ?? 'Command'} aborted by a new A_COMMAND (A_ABT_ON_NEW_CMD = True)`, 'BATCH')
    }
    set({ runtime: { ...s.runtime, [tag]: start(tag, dep, rt, entry.value) } })
    return ok(entry.value)
  },
  setAbortOnNew: (tag, value) => {
    const s = get()
    if (!s.instances[tag]) return fail(`${tag} is not an equipment module`)
    if (!requireUnlockedLock('CONTROL', `Command equipment module ${tag} A_ABT_ON_NEW_CMD`)) return fail('Requires the Control key')
    set({ runtime: { ...s.runtime, [tag]: { ...(s.runtime[tag] ?? freshRuntime()), abortOnNew: value } } })
    log(tag, `A_ABT_ON_NEW_CMD := ${value ? 'True' : 'False'}`, 'BATCH')
    return ok(value)
  },
  stepEms: dt => {
    const s = get()
    let runtime = s.runtime
    for (const [tag, rt] of Object.entries(s.runtime)) {
      const dep = s.deployed[tag]
      if (!dep || !rt.running || !controllerUp(dep.controller)) continue
      const next = stepRuntime(tag, dep, { ...rt, time: rt.time + dt }, dt)
      if (next !== rt) runtime = { ...runtime, [tag]: next }
    }
    if (runtime !== s.runtime) set({ runtime })
  }
}))

/** Unit classes that embed an EM class (registered by the batch store). */
export const emClassUsers: ((emClass: string) => string[])[] = []
export const emClassRenamed: ((from: string, to: string) => void)[] = []

function controllerUp(tag: string): boolean {
  const c = useStore.getState().hardware.controllers[tag]
  return !!c && !controllerIsDown(c)
}

function start(tag: string, dep: EmDeployment, rt: EmRuntime, value: number): EmRuntime {
  const io = emIo.current
  const next: EmRuntime = { ...rt, target: value, pv: IDLE, queued: null, error: '', time: 0 }
  if (dep.cls.algorithm === 'Command driven') {
    const cmd = dep.cls.commands[String(value)]
    if (!cmd) return { ...next, running: null, error: `No command block for ${value}` }
    return { ...next, running: { value, seq: { step: 0, stepTime: 0, executed: [], done: false } }, blocks: { ...rt.blocks, [cmd.block]: 'Running' } }
  }
  // State driven: write every item's value for the state, then confirm the readbacks.
  try {
    if (!io) throw new EvalError('Module I/O is not available')
    const writes = stateWrites(dep, value)
    for (const w of writes.filter(x => x.mode)) io.write(w.path, w.value)
    for (const w of writes.filter(x => !x.mode)) io.write(w.path, w.value)
  } catch (e) {
    io?.log(tag, `State ${stateName(dep.cls.namedSet, value)} failed: ${(e as Error).message}`)
    return { ...next, running: null, error: (e as Error).message }
  }
  return { ...next, running: { value, seq: null } }
}

interface StateWrite { item: string; path: string; value: Value; mode: boolean; readback: string; expect: Value }
export function stateWrites(dep: EmDeployment, value: number): StateWrite[] {
  const row = dep.cls.states[String(value)] ?? {}
  const out: StateWrite[] = []
  for (const item of dep.cls.items) {
    const raw = (row[item.name] ?? '').trim()
    if (!raw) continue
    const w = splitBlockPath(item.write)!
    const rb = splitBlockPath(item.readback)!
    const tag = dep.children[w.block]
    const rbTag = dep.children[rb.block]
    if (!tag || !rbTag) throw new EvalError(`Module block ${w.block} is not bound to a module`)
    if (w.param.startsWith('MODE')) {
      const word = MODE_WORD[raw.toUpperCase()] ?? raw.toUpperCase()
      if (!MODE_WORDS.includes(word)) throw new EvalError(`${raw} is not a mode`)
      out.push({ item: item.name, path: `${tag}/${w.param}`, value: word, mode: true, readback: `${rbTag}/${rb.param}`, expect: word })
    } else {
      const dev = CM_DEVICE_CLASSES[dep.cls.children[w.block]?.className ?? '']
      const v = dev ? emIo.current!.named(dev.spSet, raw) : Number(raw)
      out.push({ item: item.name, path: `${tag}/${w.param}`, value: v, mode: false, readback: `${rbTag}/${rb.param}`, expect: v })
    }
  }
  return out
}

function stepRuntime(tag: string, dep: EmDeployment, rt: EmRuntime, dt: number): EmRuntime {
  const io = emIo.current
  if (!io || !rt.running) return rt
  const value = rt.running.value
  const finish = (r: EmRuntime): EmRuntime => {
    const done: EmRuntime = { ...r, running: null }
    return done.queued !== null ? start(tag, dep, done, done.queued) : done
  }
  if (dep.cls.algorithm === 'State driven') {
    try {
      const writes = stateWrites(dep, value)
      const confirmed = writes.every(w => {
        const got = io.read(w.readback)
        return typeof w.expect === 'string' ? String(got).toUpperCase() === w.expect : Number(got) === Number(w.expect)
      })
      if (!confirmed) return rt
      io.log(tag, `A_PV = ${stateName(dep.cls.namedSet, value)}`)
      return finish({ ...rt, pv: value })
    } catch (e) {
      return finish({ ...rt, error: (e as Error).message })
    }
  }
  const cmd = dep.cls.commands[String(value)]
  const seq = { ...rt.running.seq!, stepTime: rt.running.seq!.stepTime + dt, executed: [...rt.running.seq!.executed] }
  const env = {
    read: (ref: string): Value => {
      const c = classifyEmRef(ref)
      if (typeof c === 'string') throw new EvalError(c)
      if (c.k === 'param') return emParamValue(dep, rt, c.name)
      if (c.k === 'child') { const t = dep.children[c.block]; if (!t) throw new EvalError(`${c.block} is not a module block`); return io.read(`${t}/${c.param}`) }
      return io.read(c.path)
    },
    write: (ref: string, v: Value): void => {
      const c = classifyEmRef(ref)
      if (typeof c === 'string') throw new EvalError(c)
      if (c.k === 'param') throw new EvalError(`${c.name} cannot be written from a command block`)
      if (c.k === 'child') { const t = dep.children[c.block]; if (!t) throw new EvalError(`${c.block} is not a module block`); io.write(`${t}/${c.param}`, v); return }
      io.write(c.path, v)
    },
    named: io.named,
    log: (text: string) => io.log(tag, `LOGEVENT: ${text}`)
  }
  try {
    const step = cmd.sfc.steps[seq.step]
    if (!step) seq.done = true
    else {
      for (const a of step.actions) {
        if (seq.executed.includes(a.name)) continue
        if (a.qualifier === 'D' && seq.stepTime < a.time) continue
        if (a.expression.trim()) runProgram(a.expression, env)
        seq.executed.push(a.name)
      }
      const tr = cmd.sfc.transitions[seq.step]
      if (step.actions.every(a => seq.executed.includes(a.name)) && (!tr || !tr.condition.trim() || evalCondition(tr.condition, env))) {
        if (seq.step + 1 >= cmd.sfc.steps.length) seq.done = true
        else Object.assign(seq, { step: seq.step + 1, stepTime: 0, executed: [] })
      }
    }
  } catch (e) {
    io.log(tag, `${cmd.block} failed: ${(e as Error).message}`)
    return finish({ ...rt, error: (e as Error).message, blocks: { ...rt.blocks, [cmd.block]: 'Failed' } })
  }
  if (cmd.maxTime > 0 && rt.time > cmd.maxTime && !seq.done) {
    io.log(tag, `${cmd.block} exceeded its maximum time of ${cmd.maxTime} s`)
    return finish({ ...rt, error: 'Maximum time exceeded', blocks: { ...rt.blocks, [cmd.block]: 'Failed' } })
  }
  if (seq.done) {
    io.log(tag, `${cmd.block} Complete; A_PV = ${cmd.state}`)
    return finish({ ...rt, pv: value, blocks: { ...rt.blocks, [cmd.block]: 'Complete' } })
  }
  return { ...rt, running: { value, seq } }
}

export function emParamValue(dep: EmDeployment | undefined, rt: EmRuntime | undefined, name: string): Value {
  const r = rt ?? freshRuntime()
  const set = dep?.cls.namedSet ?? ''
  switch (name) {
    case 'A_COMMAND': return r.command
    case 'A_TARGET': return r.target
    case 'A_PV': return r.pv
    case 'A_STATE': return r.running ? 'Running' : r.error ? 'Failed' : r.pv === IDLE ? 'Idle' : 'Complete'
    case 'A_ABT_ON_NEW_CMD': return r.abortOnNew
    case 'A_ERROR': return !!r.error
    case 'A_TIME': return Math.floor(r.time)
    case 'A_INITIALIZED': return !!dep
    default: return EM_PARAMS.find(([n]) => n === name)?.[1] ?? (set ? 0 : 0)
  }
}

export function emDisplay(dep: EmDeployment | undefined, rt: EmRuntime | undefined, name: string): string {
  const v = emParamValue(dep, rt, name)
  if (dep && ['A_COMMAND', 'A_TARGET', 'A_PV'].includes(name)) return stateName(dep.cls.namedSet, Number(v))
  return typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v)
}

export function emDownloadState(tag: string, controller: string | undefined): 'unassigned' | 'not-downloaded' | 'pending' | 'current' {
  const s = useEm.getState()
  const inst = s.instances[tag]
  if (!inst || !controller) return 'unassigned'
  const dep = s.deployed[tag]
  if (!dep) return 'not-downloaded'
  const cls = s.classes[inst.className]
  return cls && dep.controller === controller && JSON.stringify(dep.cls) === JSON.stringify(cls) && JSON.stringify(dep.children) === JSON.stringify(inst.children) ? 'current' : 'pending'
}

/** Download one equipment module (controller download, unit download with contained modules). */
export function deployEm(tag: string, controller: string): string[] {
  const s = useEm.getState()
  const inst = s.instances[tag]
  if (!inst) return [`${tag}: not an equipment module`]
  const cls = s.classes[inst.className]
  if (!cls) return [`${tag}: class ${inst.className} no longer exists; not downloaded`]
  const warnings: string[] = []
  if (s.drafts[cls.name]) warnings.push(`Class ${cls.name} has unsaved Control Studio changes; the saved configuration was downloaded`)
  for (const [block, child] of Object.entries(cls.children)) if (!inst.children[block]) warnings.push(`${tag}: module block ${block} (${child.className}) is not bound to a module`)
  if (cls.algorithm === 'Command driven') for (const c of Object.values(cls.commands)) if (c.enabled && c.sfc.steps.every(st => !st.actions.length)) warnings.push(`${tag}: ${c.block} (${c.state}) has no actions`)
  useEm.setState(st => ({ deployed: { ...st.deployed, [tag]: { cls: clone(cls), children: { ...inst.children }, controller, at: useStore.getState().time } },
    runtime: st.runtime[tag] ? st.runtime : { ...st.runtime, [tag]: freshRuntime() } }))
  return warnings
}

/** Create a control module from a device class (store module, two-stage valves flagged). */
export function makeDeviceModule(tag: string, className: string, area: string, description?: string): AnyModule {
  const dev = CM_DEVICE_CLASSES[className]
  const m = makeModule({ tag, type: dev.kind, description: description ?? dev.description, area })
  // Same physical DV_School valves as the stand-alone modules they replace: 2 s travel.
  if (m.type === 'VALVE') return { ...m, confirmTimeSec: COURSE_VALVE_TRAVEL, ...(dev.twoStage ? { twoStage: true, bulk: false } : {}) }
  return m
}

export function tagFree(tag: string): boolean {
  return isValidDeltaVTag(tag) && !useStore.getState().modules[tag] && !useEm.getState().instances[tag]
}
