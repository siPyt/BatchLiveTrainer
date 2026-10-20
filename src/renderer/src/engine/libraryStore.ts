import { create } from 'zustand'
import { useStore } from './store'
import { usePictures } from './pictureStore'
import { useSecurity } from './security'
import { controllerIsDown, type Controller } from './hardware'
import { moduleNameError } from './naming'
import type { AlarmLimit, AnalogIndicator, AnyModule } from './types'
import type { NamedSetDefinition } from './namedSets'
import { makeModule, type NewModuleSpec } from './plant'
import {
  COURSE_SIMS, DEFAULT_CATEGORIES, TEMPLATE_DEFINITIONS, cloneDefinition, configurableParams, defaultClassName,
  defaultInstanceName, executeAi, findTemplate, getParam, initialCourseProcess, instanceConfigurable, libraryNameError,
  paramValueError, parseReference, pruneOverrides, resolveInstance, stepCourseProcess, wireError, BASE_CAPACITY, BASE_MAX_FLOW,
  type AiRuntime, type ClassCategory, type ClassInstance, type ControlModuleClass, type CourseProcess,
  type ModuleDefinition, type ParamValue, type ReferenceReader, type ScaleValue, type SimModule
} from './classLibrary'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
function ok<T>(value: T): Result<T> { return { ok: true, value } }
function fail<T = never>(error: string): Result<T> { return { ok: false, error } }
function withoutKeys<T>(r: Record<string, T>, keys: readonly string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k)))
}
function renameKey<T>(r: Record<string, T>, from: string, to: string): Record<string, T> {
  const out = { ...r }
  if (from in out) { out[to] = out[from]; delete out[from] }
  return out
}

export const COURSE_AREA = 'ED_CENTER_BATCH'
export const COURSE_CONTROLLER = 'CTLR1'
/** DV_School block valves confirm their position in 2 s (the travel the Chapter 4 overshoot exercise compensates for). */
export const COURSE_VALVE_TRAVEL = 2

/** Extension points used by the batch configuration (Chapter 4) without a circular import. */
export const libraryHooks = {
  /** Download batch objects assigned to the controller; returns { downloaded, warnings }. */
  controllerDownload: [] as ((controller: string) => { downloaded: string[]; warnings: string[] })[],
  /** Called after the Course 7016 project (or any project) is (re)installed. */
  reset: [] as ((course: boolean) => void)[],
  /** Extra objects (equipment modules) that belong to an area and are assigned with it. */
  areaTags: [] as ((area: string) => string[])[]
}

/** One path of the course process (BASE>BL500, TK100>BL500, BL500>PRODUCT, AGIT-503 RUN, TK100 FILL ...). */
export interface TransferEpisode { amount: number; seconds: number; avgSp: number; endLevel: number }
export interface TransferLog { active: number; seconds: number; spSum: number; total: number; episodes: TransferEpisode[] }

const LEVEL_OF: Record<string, keyof CourseProcess> = { 'TK100 FILL': 'tk100', 'TK200 FILL': 'tk200', 'TK300 FILL': 'tk300' }

/** Accumulate flows into episodes: an episode ends on the first step its path stops moving material. */
export function logTransfers(prev: Record<string, TransferLog>, flows: Record<string, number>, dt: number, p: CourseProcess, baseSp: number): Record<string, TransferLog> {
  let next = prev
  for (const key of new Set([...Object.keys(prev), ...Object.keys(flows)])) {
    const cur = prev[key] ?? { active: 0, seconds: 0, spSum: 0, total: 0, episodes: [] }
    const moved = flows[key] ?? 0
    let upd: TransferLog = cur
    if (moved > 0) upd = { ...cur, active: cur.active + moved, seconds: cur.seconds + dt, spSum: cur.spSum + (key.startsWith('BASE>') ? baseSp * dt : 0), total: cur.total + moved }
    else if (cur.active > 0) {
      const level = LEVEL_OF[key]
      const ep: TransferEpisode = { amount: cur.active, seconds: cur.seconds, avgSp: cur.seconds ? cur.spSum / cur.seconds : 0, endLevel: level ? p[level] : 0 }
      upd = { ...cur, active: 0, seconds: 0, spSum: 0, episodes: [...cur.episodes, ep].slice(-12) }
    }
    if (upd !== cur || !prev[key]) next = { ...next, [key]: upd }
  }
  return next
}

export interface DeployedModule { definition: ModuleDefinition; controller: string; at: number; classRevision: number }
export interface DownloadReport {
  target: string
  at: number
  downloaded: string[]
  warnings: string[]
}
export type DownloadState = 'unassigned' | 'not-downloaded' | 'pending' | 'current'

interface LibraryState {
  categories: Record<string, ClassCategory>
  classes: Record<string, ControlModuleClass>
  /** Unsaved Control Studio edits, per class. */
  drafts: Record<string, ModuleDefinition>
  instances: Record<string, ClassInstance>
  /** Module tag → controller (node) it is assigned to. */
  assignments: Record<string, string>
  deployed: Record<string, DeployedModule>
  sims: Record<string, SimModule>
  process: CourseProcess | null
  /** Course process transfer log (Chapter 2 / 5 manual operation checks). */
  transfers: Record<string, TransferLog>
  lastDownload: DownloadReport | null

  resetLibrary: () => void
  installCourseProject: () => boolean

  newCategory: (parent: string | null) => Result<string>
  renameCategory: (name: string, next: string) => Result<string>
  deleteCategory: (name: string) => Result<string>

  createClassFromTemplate: (template: string, category: string) => Result<string>
  renameClass: (name: string, next: string) => Result<string>
  moveClass: (name: string, category: string) => Result<string>
  deleteClass: (name: string) => Result<string>

  draftOf: (name: string) => ModuleDefinition | undefined
  editDraft: (name: string, edit: (d: ModuleDefinition) => string | null | void) => Result<string>
  connect: (name: string, from: string, to: string) => Result<string>
  saveClass: (name: string) => Result<string>
  discardDraft: (name: string) => void

  createInstance: (className: string, area: string) => Result<string>
  renameInstance: (tag: string, next: string) => Result<string>
  deleteInstance: (tag: string) => Result<string>
  setOverride: (tag: string, path: string, value: ParamValue | null) => Result<string>

  assignArea: (area: string, controller: string) => Result<string[]>
  assignModule: (tag: string, controller: string | null) => Result<string>
  downloadController: (controller: string) => Result<DownloadReport>
  downloadModule: (tag: string) => Result<DownloadReport>

  step: (dt: number) => void
}

const key = (s: string): string => s.trim().toUpperCase()
const requireUnlockedLock = (lock: 'CAN_CONFIGURE' | 'CAN_DOWNLOAD', action: string): boolean => {
  const sec = useSecurity.getState()
  if (sec.locked) {
    useSecurity.setState({ lastDenied: `Access Denied — ${action} requires an unlocked workstation` })
    return false
  }
  return sec.requireLock(lock, action)
}
const log = (tag: string, description: string, category: 'CONFIGURE' | 'DIAGNOSTIC' = 'CONFIGURE'): void =>
  useStore.getState().logEvent(category, tag, description)

const defaultCategories = (): Record<string, ClassCategory> => Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.name, { ...c }]))

function libraryNameTaken(s: Pick<LibraryState, 'categories' | 'classes'>, name: string, except?: string): boolean {
  const k = name.toLowerCase()
  return [...Object.keys(s.categories), ...Object.keys(s.classes)].some(n => n.toLowerCase() === k && n !== except)
}

function tagTaken(s: Pick<LibraryState, 'sims'>, tag: string, except?: string): boolean {
  const main = useStore.getState()
  const k = tag.toUpperCase()
  return [...Object.keys(main.modules), ...Object.keys(main.sfcs), ...Object.keys(main.equipment), ...Object.keys(s.sims)]
    .some(n => n.toUpperCase() === k && n !== except)
}

const unitsOf = (scale: ScaleValue): string => (scale.units === 'no units' ? '' : scale.units)

export function alarmsFor(d: ModuleDefinition): AlarmLimit[] {
  return Object.values(d.alarms).map(a => ({
    type: a.type, label: a.type, priority: a.priority, enabled: a.enabled,
    limit: typeof getParam(d, a.parameter)?.value === 'number' ? getParam(d, a.parameter)!.value as number : undefined
  }))
}

/** Operator-facing configuration of the AI module derived from a (resolved) class definition. */
function moduleView(d: ModuleDefinition): Pick<AnalogIndicator, 'description' | 'unit' | 'pvMin' | 'pvMax' | 'decimals' | 'alarms' | 'primaryDisplay' | 'detailDisplay'> {
  const scale = (d.blocks.AI1?.params.OUT_SCALE.value ?? { hi: 100, lo: 0, units: '%', decimals: 1 }) as ScaleValue
  return {
    description: d.description, unit: unitsOf(scale), pvMin: scale.lo, pvMax: scale.hi, decimals: scale.decimals,
    alarms: alarmsFor(d), primaryDisplay: d.primaryDisplay || undefined, detailDisplay: d.detailDisplay || undefined
  }
}

function controllerUp(c: Controller | undefined): boolean {
  return !!c && !controllerIsDown(c)
}

/** Reads MODULE/PARAM references: the DV_School simulation modules or any AI module's PV/OUT. */
export function makeReader(s: Pick<LibraryState, 'sims' | 'process' | 'assignments'>): ReferenceReader {
  const main = useStore.getState()
  return path => {
    const ref = parseReference(path)
    if (!ref) return null
    const sim = Object.values(s.sims).find(x => x.tag.toUpperCase() === ref.module)
    if (sim) {
      const field = Object.entries(sim.params).find(([name]) => name.toUpperCase() === ref.param)?.[1]
      if (!field || !s.process) return null
      const controller = main.hardware.controllers[s.assignments[sim.tag]]
      return { value: s.process[field], bad: !controllerUp(controller) }
    }
    const m = main.modules[ref.module]
    if (m?.type === 'AI' && ['PV', 'OUT', 'AI1/PV', 'AI1/OUT'].includes(ref.param)) return { value: m.pv, bad: m.pvBad }
    if (m?.type === 'PID' && ['PV', 'PID1/PV'].includes(ref.param)) return { value: m.pv, bad: !!m.pvBad }
    return null
  }
}

/** Every resolvable reference path (the Browse... list). */
export function browsePaths(): string[] {
  const s = useLibrary.getState()
  const main = useStore.getState()
  return [
    ...Object.values(s.sims).flatMap(sim => Object.keys(sim.params).map(p => `${sim.tag}/${p}`)),
    ...Object.values(main.modules).filter(m => m.type === 'AI').map(m => `${m.tag}/AI1/PV`)
  ].sort()
}

export function instanceDefinition(tag: string): ModuleDefinition | undefined {
  const s = useLibrary.getState()
  const inst = s.instances[tag]
  const cls = inst && s.classes[inst.className]
  return inst && cls ? resolveInstance(cls, inst) : undefined
}

export function downloadState(s: Pick<LibraryState, 'instances' | 'classes' | 'assignments' | 'deployed'>, tag: string): DownloadState {
  const controller = s.assignments[tag]
  if (!controller) return 'unassigned'
  const inst = s.instances[tag]
  if (!inst) return 'current'
  const dep = s.deployed[tag]
  if (!dep) return 'not-downloaded'
  const cls = s.classes[inst.className]
  if (!cls) return 'pending'
  return dep.controller === controller && JSON.stringify(resolveInstance(cls, inst)) === JSON.stringify(dep.definition) ? 'current' : 'pending'
}

/** Unresolved / unconfigured external references for an instance's resolved definition. */
export function referenceWarnings(tag: string, d: ModuleDefinition, read: ReferenceReader): string[] {
  return Object.entries(d.params).filter(([, def]) => def.type === 'extref').flatMap(([name, def]) => {
    const path = (def.value as string).trim()
    if (!path) return [`${tag}: ${name} external reference path is not configured`]
    return read(path) ? [] : [`${tag}: ${name} references ${path}, which does not exist`]
  })
}

function courseModules(): AnyModule[] {
  const spec = (tag: string, type: NewModuleSpec['type'], description: string, extra: Partial<NewModuleSpec> = {}): AnyModule =>
    makeModule({ tag, type, description, area: COURSE_AREA, ...extra })
  return [
    spec('AGIT-503', 'MOTOR', 'Blender 500 agitator'),
    spec('AGIT-603', 'MOTOR', 'Blender 600 agitator'),
    spec('MTR-505', 'MOTOR', 'Blender 500 transfer pump'),
    spec('MTR-605', 'MOTOR', 'Blender 600 transfer pump'),
    ...[
      ['XV-101', 'Color 100 inlet'], ['XV-102', 'Color 100 outlet'], ['XV-201', 'Color 200 inlet'], ['XV-202', 'Color 200 outlet'],
      ['XV-301', 'Color 300 inlet'], ['XV-302', 'Color 300 outlet'], ['XV-501', 'Base to Blender 500'], ['XV-502', 'Colors to Blender 500'],
      ['XV-503', 'Blender 500 product'], ['XV-504', 'Blender 500 waste'], ['XV-601', 'Base to Blender 600'], ['XV-602', 'Colors to Blender 600'],
      ['XV-603', 'Blender 600 product'], ['XV-604', 'Blender 600 waste']
    ].map(([tag, description]) => { const v = spec(tag, 'VALVE', description); return v.type === 'VALVE' ? { ...v, confirmTimeSec: COURSE_VALVE_TRAVEL, ...(tag === 'XV-502' || tag === 'XV-602' ? { twoStage: true, bulk: false } : {}) } : v }),
    // FEED_TANK_AREA: BASE 400 transfer (course pp 2-6, 5-29).
    makeModule({ tag: 'MTR-403', type: 'MOTOR', description: 'Base 400 transfer pump', area: 'FEED_TANK_AREA' }),
    baseFlowLoop(),
    baseLevel()
  ]
}

function baseLevel(): AnyModule {
  const m = makeModule({ tag: 'LI-401', type: 'AI', description: 'Base 400 level', area: 'FEED_TANK_AREA', unit: 'gal', pvMin: 0, pvMax: BASE_CAPACITY })
  // The course process step overwrites its PV with the LEVEL-401 simulation every scan.
  return m.type === 'AI' ? { ...m, pv: 1500 } : m
}

function baseFlowLoop(): AnyModule {
  const m = makeModule({ tag: 'FIC-404', type: 'PID', description: 'Base 400 transfer flow', area: 'FEED_TANK_AREA', unit: 'GPM', pvMin: 0, pvMax: BASE_MAX_FLOW })
  // The transfer loop idles at 0 GPM between transfers, so its low flow alarms are disabled.
  return m.type === 'PID' ? { ...m, mode: 'MAN', actualMode: 'MAN', sp: 0, out: 0, pv: 0, alarms: m.alarms.map(a => /LO/.test(a.type) ? { ...a, enabled: false } : a) } as AnyModule : m
}

/** DV_School named sets used by the batch phase logic (course 7016 pp 2-9..2-11). */
export function courseNamedSets(): Record<string, NamedSetDefinition> {
  const set = (name: string, description: string, entries: [string, number][]): NamedSetDefinition => ({
    name, description, entries: entries.map(([n, value]) => ({ name: n, value, visible: true, userSelectable: true }))
  })
  const emSet = (name: string, entries: [string, number][]): NamedSetDefinition => ({
    name, description: '', entries: [...entries.map(([n, value]) => ({ name: n, value, visible: true, userSelectable: true })), { name: 'Idle', value: 255, visible: true, userSelectable: false }]
  })
  return {
    'vlvnc-sp': set('vlvnc-sp', 'Normally closed valve setpoint', [['CLOSE', 0], ['OPEN', 1]]),
    'vlvnc-pv': set('vlvnc-pv', 'Normally closed valve state', [['CLOSED', 0], ['OPEN', 1], ['TRAVEL', 2]]),
    'vlvnc-2stage-sp': set('vlvnc-2stage-sp', '2 stage valve setpoint', [['CLOSE', 0], ['DRIBBLE', 1], ['BULK', 2]]),
    'vlvnc-2stage-pv': set('vlvnc-2stage-pv', '2 stage valve state', [['CLOSED', 0], ['DRIBBLE', 1], ['BULK', 2], ['TRAVEL', 3]]),
    // Chapter 5 writes the same sets as 'vlvnc2stage-sp' / 'vlvnc2stage-pv' (p5-15).
    'vlvnc2stage-sp': set('vlvnc2stage-sp', '2 stage valve setpoint', [['CLOSE', 0], ['DRIBBLE', 1], ['BULK', 2]]),
    'vlvnc2stage-pv': set('vlvnc2stage-pv', '2 stage valve state', [['CLOSED', 0], ['DRIBBLE', 1], ['BULK', 2], ['TRAVEL', 3]]),
    'mtr2-sp': set('mtr2-sp', 'Two state motor setpoint', [['STOP', 0], ['START', 1]]),
    'mtr2-pv': set('mtr2-pv', 'Two state motor state', [['STOPPED', 0], ['RUNNING', 1], ['TRAVEL', 2]]),
    // Equipment module command / state named sets (pp 5-13, 5-21): 255 is the mandatory Idle entry.
    'EM-vlvnc-2stage': emSet('EM-vlvnc-2stage', [['Close', 1], ['Dribble', 2], ['Bulk', 3], ['Auto Mode', 4]]),
    EM_Outlet_State: emSet('EM_Outlet_State', [['Closed - CAS', 1], ['Draining Waste - CAS', 2], ['Releasing Product - CAS', 3], ['Auto Mode', 4]])
  }
}

function courseController(): Controller {
  return {
    tag: COURSE_CONTROLLER, description: 'DV_School training controller', commissioned: true, redundant: false,
    networkRedundant: false, controlNetworkAddress: '10.4.0.1', identified: false, coldRestartMinutes: 5,
    powerDownAt: null, lastAutoSense: null, primary: 'ACTIVE', secondary: 'N/A', scanTimeMs: 100, cpuLoadPct: 12, carrierIds: []
  }
}

const empty = (): Pick<LibraryState, 'categories' | 'classes' | 'drafts' | 'instances' | 'assignments' | 'deployed' | 'sims' | 'process' | 'transfers' | 'lastDownload'> => ({
  categories: defaultCategories(), classes: {}, drafts: {}, instances: {}, assignments: {}, deployed: {}, sims: {}, process: null, transfers: {}, lastDownload: null
})

export const useLibrary = create<LibraryState>((set, get) => ({
  ...empty(),

  resetLibrary: () => { set(empty()); libraryHooks.reset.forEach(fn => fn(false)) },

  installCourseProject: () => {
    if (!requireUnlockedLock('CAN_CONFIGURE', 'New Project (course 7016 DV_School)')) return false
    useStore.getState().newProject('blank')
    const modules = Object.fromEntries(courseModules().map(m => [m.tag, m]))
    useStore.setState(s => ({
      // DV_School plant areas as shown in Explorer on course p1-21.
      areas: ['AREA_A', COURSE_AREA, 'FEED_TANK_AREA'],
      modules: { ...s.modules, ...modules },
      hardware: { ...s.hardware, controllers: { ...s.hardware.controllers, [COURSE_CONTROLLER]: courseController() } },
      namedSets: { configured: courseNamedSets(), deployed: { [`CONTROLLER:${COURSE_CONTROLLER}`]: courseNamedSets(), WORKSTATION: courseNamedSets() } },
      rev: s.rev + 1
    }))
    const sims = Object.fromEntries(COURSE_SIMS.map(x => [x.tag, { ...x, params: { ...x.params } }]))
    set({
      ...empty(),
      sims,
      process: initialCourseProcess(),
      assignments: Object.fromEntries([...Object.keys(modules), ...Object.keys(sims)].map(tag => [tag, COURSE_CONTROLLER]))
    })
    libraryHooks.reset.forEach(fn => fn(true))
    // Built-in operator pictures belong to the BatchLive site plant; the course database has none.
    usePictures.setState({ pictures: {} })
    log('DV_School', 'Course 7016 training database loaded: areas AREA_A / ED_CENTER_BATCH / FEED_TANK_AREA, controller CTLR1, TANKSIM/LEV500-SIM/LEV600-SIM/LEVEL-401, named sets vlvnc-sp/vlvnc-pv/vlvnc-2stage-sp/vlvnc-2stage-pv/mtr2-sp/mtr2-pv/EM-vlvnc-2stage/EM_Outlet_State')
    return true
  },

  // ---- Categories --------------------------------------------------------
  newCategory: parent => {
    const s = get()
    if (parent !== null && !s.categories[parent]) return fail(`Category ${parent} does not exist`)
    let name = 'NewCategory'
    for (let n = 1; libraryNameTaken(s, name); n++) name = `NewCategory${n}`
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create library category ${name}`)) return fail('Requires the Can Configure key')
    set({ categories: { ...s.categories, [name]: { name, parent, description: '' } } })
    log(name, 'Control Module Class Category created')
    return ok(name)
  },

  renameCategory: (name, next) => {
    const s = get()
    const to = next.trim()
    if (!s.categories[name]) return fail(`Category ${name} does not exist`)
    if (to === name) return ok(name)
    const error = libraryNameError(to, 'Category') ?? (libraryNameTaken(s, to, name) ? `The name ${to} is already used in the library` : null)
    if (error) return fail(error)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename library category ${name}`)) return fail('Requires the Can Configure key')
    const categories = Object.fromEntries(Object.values(s.categories).map(c => {
      const moved = { ...c, parent: c.parent === name ? to : c.parent }
      return c.name === name ? [to, { ...moved, name: to }] : [c.name, moved]
    }))
    const classes = Object.fromEntries(Object.entries(s.classes).map(([k, c]) => [k, c.category === name ? { ...c, category: to } : c]))
    set({ categories, classes })
    log(to, `Control Module Class Category renamed from ${name}`)
    return ok(to)
  },

  deleteCategory: name => {
    const s = get()
    if (!s.categories[name]) return fail(`Category ${name} does not exist`)
    const children = [...Object.values(s.categories).filter(c => c.parent === name).map(c => c.name),
      ...Object.values(s.classes).filter(c => c.category === name).map(c => c.name)]
    if (children.length) return fail(`Category ${name} is not empty (${children.join(', ')}); delete or move its contents first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete library category ${name}`)) return fail('Requires the Can Configure key')
    const categories = { ...s.categories }
    delete categories[name]
    set({ categories })
    log(name, 'Control Module Class Category deleted')
    return ok(name)
  },

  // ---- Classes -----------------------------------------------------------
  createClassFromTemplate: (template, category) => {
    const s = get()
    const found = findTemplate(template)
    if (!found) return fail(`Template ${template} does not exist`)
    if (found.node.kind !== 'module-template') return fail(`${template} is a ${found.node.kind === 'fb-template' ? 'function block' : 'composite'} template; drop a Module Template to create a Control Module Class`)
    const build = TEMPLATE_DEFINITIONS[template]
    if (!build || !found.node.modeled) return fail(`Module template ${template} is not modeled in BatchLive. Chapter 1 uses Library > ModuleTemplates > Monitoring > ANALOG.`)
    if (!s.categories[category]) return fail(`Drop the template on a Control Module Class Category (Category ${category} does not exist)`)
    const name = defaultClassName(template, n => libraryNameTaken(s, n))
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create control module class ${name}`)) return fail('Requires the Can Configure key')
    set({ classes: { ...s.classes, [name]: { name, category, template, definition: build(), revision: 1 } } })
    log(name, `Control Module Class created from Module Template ${found.path.join('/')} in ${category}`)
    return ok(name)
  },

  renameClass: (name, next) => {
    const s = get()
    const to = next.trim().toUpperCase()
    if (!s.classes[name]) return fail(`Class ${name} does not exist`)
    if (to === name) return ok(name)
    const error = libraryNameError(to, 'Class') ?? (libraryNameTaken(s, to, name) ? `The name ${to} is already used in the library` : null)
    if (error) return fail(error)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename control module class ${name}`)) return fail('Requires the Can Configure key')
    const classes = { ...s.classes }
    classes[to] = { ...classes[name], name: to }
    delete classes[name]
    const drafts = { ...s.drafts }
    if (drafts[name]) { drafts[to] = drafts[name]; delete drafts[name] }
    const instances = Object.fromEntries(Object.entries(s.instances).map(([k, i]) => [k, i.className === name ? { ...i, className: to } : i]))
    set({ classes, drafts, instances })
    useStore.setState(m => ({ modules: Object.fromEntries(Object.entries(m.modules).map(([k, mod]) =>
      [k, mod.type === 'AI' && mod.classInstance === name ? { ...mod, classInstance: to } : mod])) }))
    log(to, `Control Module Class renamed from ${name}`)
    return ok(to)
  },

  moveClass: (name, category) => {
    const s = get()
    if (!s.classes[name]) return fail(`Class ${name} does not exist`)
    if (!s.categories[category]) return fail(`Category ${category} does not exist`)
    if (s.classes[name].category === category) return ok(name)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Move control module class ${name}`)) return fail('Requires the Can Configure key')
    set({ classes: { ...s.classes, [name]: { ...s.classes[name], category } } })
    log(name, `Control Module Class moved to category ${category}`)
    return ok(name)
  },

  deleteClass: name => {
    const s = get()
    if (!s.classes[name]) return fail(`Class ${name} does not exist`)
    const users = Object.values(s.instances).filter(i => i.className === name).map(i => i.tag)
    if (users.length) return fail(`${name} is used by ${users.join(', ')}; delete those modules first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete control module class ${name}`)) return fail('Requires the Can Configure key')
    const classes = { ...s.classes }
    const drafts = { ...s.drafts }
    delete classes[name]
    delete drafts[name]
    set({ classes, drafts })
    log(name, 'Control Module Class deleted')
    return ok(name)
  },

  // ---- Control Studio drafts --------------------------------------------
  draftOf: name => get().drafts[name] ?? get().classes[name]?.definition,

  editDraft: (name, edit) => {
    const s = get()
    const cls = s.classes[name]
    if (!cls) return fail(`Class ${name} does not exist`)
    const draft = cloneDefinition(s.drafts[name] ?? cls.definition)
    const error = edit(draft)
    if (error) return fail(error)
    set({ drafts: { ...s.drafts, [name]: draft } })
    return ok(name)
  },

  connect: (name, from, to) => get().editDraft(name, d => {
    const error = wireError(d, from, to)
    if (error) return error
    d.wires.push({ from, to })
  }),

  saveClass: name => {
    const s = get()
    const cls = s.classes[name]
    if (!cls) return fail(`Class ${name} does not exist`)
    const draft = s.drafts[name]
    if (!draft) return ok(name)
    for (const [path, def] of [...Object.entries(draft.params), ...Object.values(draft.blocks).flatMap(b => Object.entries(b.params).map(([p, d]) => [`${b.name}/${p}`, d] as const))]) {
      if (def.readOnly) continue
      const error = paramValueError(def, def.value)
      if (error) return fail(`${path}: ${error}`)
    }
    if (!requireUnlockedLock('CAN_CONFIGURE', `Save control module class ${name}`)) return fail('Requires the Can Configure key')
    const instances = Object.fromEntries(Object.entries(s.instances).map(([k, i]) =>
      [k, i.className === name ? { ...i, overrides: pruneOverrides(draft, i.overrides) } : i]))
    const reverted = Object.values(s.instances).filter(i => i.className === name &&
      Object.keys(i.overrides).length !== Object.keys(instances[i.tag].overrides).length).map(i => i.tag)
    const drafts = { ...s.drafts }
    delete drafts[name]
    set({ classes: { ...s.classes, [name]: { ...cls, definition: draft, revision: cls.revision + 1 } }, drafts, instances })
    log(name, `Control Module Class saved (revision ${cls.revision + 1})${reverted.length ? `; instance values reverted to the class value on ${reverted.join(', ')}` : ''}`)
    return ok(name)
  },

  discardDraft: name => {
    const drafts = { ...get().drafts }
    delete drafts[name]
    set({ drafts })
  },

  // ---- Class-based Control Modules ---------------------------------------
  createInstance: (className, area) => {
    const s = get()
    const cls = s.classes[className]
    if (!cls) return fail(`Class ${className} does not exist`)
    if (!useStore.getState().areas.includes(area)) return fail(`Area ${area} does not exist`)
    const tag = defaultInstanceName(className, t => tagTaken(s, t))
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create class-based module ${tag}`)) return fail('Requires the Can Configure key')
    const inst: ClassInstance = { tag, className, area, overrides: {} }
    set({ instances: { ...s.instances, [tag]: inst } })
    const view = moduleView(cls.definition)
    const module: AnalogIndicator = {
      tag, type: 'AI', area, pv: view.pvMin, pvBad: true, classInstance: className, statusText: 'Not downloaded', ...view
    }
    useStore.setState(m => ({ modules: { ...m.modules, [tag]: module }, rev: m.rev + 1 }))
    log(tag, `Control Module created from Control Module Class ${className} in area ${area}`)
    return ok(tag)
  },

  renameInstance: (tag, next) => {
    const s = get()
    const to = key(next)
    const inst = s.instances[tag]
    if (!inst) return fail(`${tag} is not a class-based module`)
    if (to === tag) return ok(tag)
    const error = moduleNameError(to) ?? (tagTaken(s, to, tag) ? `Module ${to} already exists` : null)
    if (error) return fail(error)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename class-based module ${tag}`)) return fail('Requires the Can Configure key')
    set({ instances: renameKey({ ...s.instances, [tag]: { ...inst, tag: to } }, tag, to),
      assignments: renameKey(s.assignments, tag, to), deployed: withoutKeys(s.deployed, [tag]) })
    useStore.setState(m => {
      const modules = { ...m.modules }
      const module = modules[tag]
      delete modules[tag]
      if (module) modules[to] = { ...module, tag: to, pvBad: true, statusText: 'Not downloaded' } as AnyModule
      return { modules, alarms: m.alarms.filter(a => a.moduleTag !== tag), rev: m.rev + 1 }
    })
    log(to, `Control Module renamed from ${tag}`)
    return ok(to)
  },

  deleteInstance: tag => {
    const s = get()
    if (!s.instances[tag]) return fail(`${tag} is not a class-based module`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete class-based module ${tag}`)) return fail('Requires the Can Configure key')
    set({ instances: withoutKeys(s.instances, [tag]), assignments: withoutKeys(s.assignments, [tag]), deployed: withoutKeys(s.deployed, [tag]) })
    useStore.setState(m => ({ modules: withoutKeys(m.modules, [tag]), alarms: m.alarms.filter(a => a.moduleTag !== tag), rev: m.rev + 1 }))
    log(tag, 'Class-based Control Module deleted')
    return ok(tag)
  },

  setOverride: (tag, path, value) => {
    const s = get()
    const inst = s.instances[tag]
    const cls = inst && s.classes[inst.className]
    if (!inst || !cls) return fail(`${tag} is not a class-based module`)
    const def = getParam(cls.definition, path)
    if (!def) return fail(`${tag} has no parameter ${path}`)
    if (!instanceConfigurable(def)) return fail(`${path} is not configurable on instances. Check "Allow instance value to be configured" on class ${cls.name} and save it.`)
    if (value !== null) {
      const error = paramValueError(def, value)
      if (error) return fail(error)
    }
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure class-based module ${tag} ${path}`)) return fail('Requires the Can Configure key')
    const overrides = { ...inst.overrides }
    if (value === null) delete overrides[path]
    else overrides[path] = JSON.parse(JSON.stringify(value)) as ParamValue
    set({ instances: { ...s.instances, [tag]: { ...inst, overrides } } })
    log(tag, value === null ? `${path} reset to use the default value from library object ${cls.name}` : `${path} instance value configured`)
    return ok(tag)
  },

  // ---- Assignment and download -------------------------------------------
  assignArea: (area, controller) => {
    const s = get()
    const main = useStore.getState()
    if (!main.areas.includes(area)) return fail(`Area ${area} does not exist`)
    if (!main.hardware.controllers[controller]) return fail(`Controller ${controller} does not exist`)
    const tags = [...Object.values(main.modules).filter(m => m.area === area).map(m => m.tag),
      ...Object.values(s.sims).filter(x => x.area === area).map(x => x.tag),
      ...libraryHooks.areaTags.flatMap(fn => fn(area))]
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign area ${area} to controller ${controller}`)) return fail('Requires the Can Configure key')
    set({ assignments: { ...s.assignments, ...Object.fromEntries(tags.map(t => [t, controller])) } })
    log(controller, `Area ${area} assigned: ${tags.length} module(s) now assigned to ${controller}`)
    return ok(tags)
  },

  assignModule: (tag, controller) => {
    const s = get()
    const main = useStore.getState()
    if (!main.modules[tag] && !s.sims[tag]) return fail(`Module ${tag} does not exist`)
    if (controller !== null && !main.hardware.controllers[controller]) return fail(`Controller ${controller} does not exist`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign ${tag} to controller ${controller ?? '(none)'}`)) return fail('Requires the Can Configure key')
    const assignments = { ...s.assignments }
    if (controller === null) delete assignments[tag]
    else assignments[tag] = controller
    set({ assignments })
    log(tag, controller ? `Assigned to controller ${controller}` : 'Controller assignment removed')
    return ok(tag)
  },

  downloadController: controller => {
    const main = useStore.getState()
    const c = main.hardware.controllers[controller]
    if (!c) return fail(`Controller ${controller} does not exist`)
    if (!c.commissioned) return fail(`Controller ${controller} is not commissioned`)
    if (controllerIsDown(c)) return fail(`Controller ${controller} is not communicating`)
    if (!requireUnlockedLock('CAN_DOWNLOAD', `Download controller ${controller}`)) return fail('Requires the Can Download key')
    const s = get()
    const tags = Object.entries(s.assignments).filter(([, ctl]) => ctl === controller).map(([t]) => t).sort()
    const report = deploy(s, tags, controller, controller)
    for (const hook of libraryHooks.controllerDownload) {
      const extra = hook(controller)
      report.report.downloaded.push(...extra.downloaded)
      report.report.warnings.push(...extra.warnings)
    }
    set({ deployed: { ...s.deployed, ...report.deployed }, lastDownload: report.report })
    log(controller, `Controller downloaded: ${report.report.downloaded.length} module(s)${report.report.warnings.length ? `, ${report.report.warnings.length} warning(s)` : ''}`)
    return ok(report.report)
  },

  downloadModule: tag => {
    const s = get()
    const controller = s.assignments[tag]
    if (!s.instances[tag] && !s.sims[tag] && !useStore.getState().modules[tag]) return fail(`Module ${tag} does not exist`)
    if (!controller) return fail(`${tag} is not assigned to a controller. Drag its area onto a controller (or Assign ▸ to a node) first.`)
    const c = useStore.getState().hardware.controllers[controller]
    if (!c || controllerIsDown(c)) return fail(`Controller ${controller} is not communicating`)
    if (!requireUnlockedLock('CAN_DOWNLOAD', `Download class-based module ${tag}`)) return fail('Requires the Can Download key')
    const report = deploy(s, [tag], controller, tag)
    set({ deployed: { ...s.deployed, ...report.deployed }, lastDownload: report.report })
    log(tag, `Module downloaded to ${controller}`)
    return ok(report.report)
  },

  // ---- Runtime -------------------------------------------------------------
  step: dt => {
    const s = get()
    const main = useStore.getState()
    let process = s.process
    if (process) {
      const mod = (tag: string): AnyModule | undefined => main.modules[tag]
      const fic = mod('FIC-404')
      const result = stepCourseProcess(process, {
        open: tag => { const m = mod(tag); return m?.type === 'VALVE' && m.open },
        stage: tag => { const m = mod(tag); return m?.type === 'VALVE' && m.open ? (m.twoStage && !m.bulk ? 1 : 2) : 0 },
        running: tag => { const m = mod(tag); return m?.type === 'MOTOR' && m.running },
        baseOut: fic?.type === 'PID' ? fic.out : 0
      }, dt)
      process = result.process
      const transfers = logTransfers(s.transfers, result.flows, dt, process, fic?.type === 'PID' ? fic.sp : 0)
      set({ process, transfers })
      // FIC-404 measures the base transfer flow; LI-401 indicates the BASE 400 level.
      const flow = process.baseFlow
      const level = process.bs400
      useStore.setState(state => {
        const f = state.modules['FIC-404']
        const li = state.modules['LI-401']
        const patch: Record<string, AnyModule> = {}
        if (f?.type === 'PID' && f.io && Math.abs(f.io.ai.raw - flow) > 1e-6) patch['FIC-404'] = { ...f, io: { ...f.io, ai: { ...f.io.ai, raw: flow } } }
        if (li?.type === 'AI' && Math.abs(li.pv - level) > 1e-6) patch['LI-401'] = { ...li, pv: level, pvBad: false }
        return Object.keys(patch).length ? { modules: { ...state.modules, ...patch } } : {}
      })
    }
    const read = makeReader({ ...s, process })
    const patches: Record<string, Partial<AnalogIndicator>> = {}
    for (const inst of Object.values(s.instances)) {
      const m = main.modules[inst.tag]
      const cls = s.classes[inst.className]
      if (m?.type !== 'AI' || !cls) continue
      const dep = s.deployed[inst.tag]
      const c = dep ? main.hardware.controllers[dep.controller] : undefined
      const runtime: AiRuntime = !dep ? { pv: m.pv, bad: true, status: 'Not downloaded' } :
        !controllerUp(c) ? { pv: m.pv, bad: true, status: `Bad: controller ${dep.controller} is not communicating` } :
          executeAi(dep.definition, read, m.pvBad ? undefined : m.pv, dt)
      const view = moduleView(dep?.definition ?? resolveInstance(cls, inst))
      const next: Partial<AnalogIndicator> = { ...view, pv: runtime.pv, pvBad: runtime.bad, statusText: runtime.status }
      if ((Object.keys(next) as (keyof AnalogIndicator)[]).some(k => JSON.stringify(next[k]) !== JSON.stringify(m[k]))) patches[inst.tag] = next
    }
    if (Object.keys(patches).length) {
      useStore.setState(state => ({ modules: { ...state.modules, ...Object.fromEntries(Object.entries(patches)
        .filter(([tag]) => state.modules[tag]?.type === 'AI')
        .map(([tag, patch]) => [tag, { ...state.modules[tag], ...patch } as AnyModule])) } }))
    }
  }
}))

function deploy(s: LibraryState, tags: string[], controller: string, target: string): { deployed: Record<string, DeployedModule>; report: DownloadReport } {
  const read = makeReader(s)
  const deployed: Record<string, DeployedModule> = {}
  const warnings: string[] = []
  const at = useStore.getState().time
  const draftsWarned = new Set<string>()
  for (const tag of tags) {
    const inst = s.instances[tag]
    if (!inst) continue
    const cls = s.classes[inst.className]
    if (!cls) { warnings.push(`${tag}: class ${inst.className} no longer exists; not downloaded`); continue }
    if (s.drafts[cls.name] && !draftsWarned.has(cls.name)) {
      draftsWarned.add(cls.name)
      warnings.push(`Class ${cls.name} has unsaved Control Studio changes; the saved configuration was downloaded`)
    }
    const definition = resolveInstance(cls, inst)
    warnings.push(...referenceWarnings(tag, definition, read))
    deployed[tag] = { definition, controller, at, classRevision: cls.revision }
  }
  return { deployed, report: { target, at, downloaded: tags, warnings } }
}

/** Parameter rows for an instance's Explorer contents pane. */
export function instanceContents(tag: string): { path: string; name: string; value: ParamValue; overridden: boolean; type: string }[] {
  const s = useLibrary.getState()
  const inst = s.instances[tag]
  const cls = inst && s.classes[inst.className]
  if (!inst || !cls) return []
  return configurableParams(cls.definition).map(p => ({
    path: p.path, name: p.name, type: p.def.type, overridden: p.path in inst.overrides,
    value: p.path in inst.overrides ? inst.overrides[p.path] : p.def.value
  }))
}

// Run class-based modules and the DV_School process every simulation step, and
// forget instances whose module was removed elsewhere (Delete, New Project).
useStore.subscribe((state, previous) => {
  const dt = (state.time - previous.time) / 1000
  if (dt > 0 && dt < 5) useLibrary.getState().step(dt)
  if (state.modules !== previous.modules) {
    const lib = useLibrary.getState()
    const gone = Object.keys(lib.instances).filter(tag => !state.modules[tag])
    if (gone.length) {
      useLibrary.setState({ instances: withoutKeys(lib.instances, gone), deployed: withoutKeys(lib.deployed, gone), assignments: withoutKeys(lib.assignments, gone) })
    }
  }
})
