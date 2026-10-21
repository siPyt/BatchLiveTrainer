import { create } from 'zustand'
import { useStore } from './store'
import { useSecurity } from './security'
import { controllerIsDown } from './hardware'
import { isValidDeltaVTag } from './naming'
import { useLibrary, libraryHooks, makeReader } from './libraryStore'
import { EvalError, MODE_WORDS, toNum, type CheckEnv, type Value } from './phaseExpr'
import {
  CM_DEVICE_CLASSES, blockName, deployEm, emClassRenamed, emClassUsers, emIo, emParamValue, makeDeviceModule, useEm,
  type EmInstance
} from './emStore'
import {
  COMPOSITES, NAME_RULE, STATE_LABEL, SYSTEM_PHASE_PARAMS, commandPhase, isNameValid, newPhaseClass, newRuntime, paramDefError,
  stepIndex, stepPhase, type AliasDef, type AliasResolution, type BatchCategory, type BatchClassKind, type CompositeName,
  type PhaseClass, type PhaseCommand, type PhaseParamDef, type PhaseRuntime, type PhaseSfc, type ProcessCell, type ProcessCellClass,
  type UnitClass, type UnitModule, type UnitPhaseConfig
} from './batchConfig'
import type { AnyModule } from './types'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
function ok<T>(value: T): Result<T> { return { ok: true, value } }
function fail<T = never>(error: string): Result<T> { return { ok: false, error } }

export interface UnitDeployment {
  unit: UnitModule
  logic: Record<string, Record<CompositeName, PhaseSfc>>
  params: Record<string, Record<string, PhaseParamDef>>
  controller: string
  at: number
}
export type PhaseOwner = 'BATCH' | 'EXTERNAL'
export interface ActivePhase { unit: string; phase: string; owner: PhaseOwner; rt: PhaseRuntime }
export interface DcRemote { mode: string; casSp: number }
export interface UploadRow { phase: string; param: string; value: number | string }

const catKey = (kind: BatchClassKind, name: string): string => `${kind}:${name}`
export const activeKey = (unit: string, phase: string): string => `${unit}/${phase}`

interface BatchState {
  categories: Record<string, BatchCategory>
  pcellClasses: Record<string, ProcessCellClass>
  unitClasses: Record<string, UnitClass>
  phaseClasses: Record<string, PhaseClass>
  phaseDrafts: Record<string, PhaseClass>
  processCells: Record<string, ProcessCell>
  units: Record<string, UnitModule>
  /** Control module tag -> unit module that contains it. */
  contained: Record<string, string>
  /** Module/simulation tag -> process cell it was dropped on (TANKSIM, p4-51). */
  cellMembers: Record<string, string>
  unitAssignments: Record<string, string>
  deployedUnits: Record<string, UnitDeployment>
  active: Record<string, ActivePhase>
  dc: Record<string, DcRemote>

  resetBatch: () => void

  newCategory: (kind: BatchClassKind, parent: string | null) => Result<string>
  renameCategory: (kind: BatchClassKind, name: string, next: string) => Result<string>
  deleteCategory: (kind: BatchClassKind, name: string) => Result<string>

  newProcessCellClass: (category: string) => Result<string>
  newUnitClass: (category: string, name: string) => Result<string>
  newPhaseClass: (category: string, name: string) => Result<string>
  /** New ▸ Start From Existing: copy a saved unit or phase class into category under a new name. */
  copyClass: (kind: 'unit' | 'phase', category: string, source: string, name: string) => Result<string>
  renameClass: (kind: BatchClassKind, name: string, next: string) => Result<string>
  deleteClass: (kind: BatchClassKind, name: string) => Result<string>

  addAlias: (unitClass: string, name: string, description: string) => Result<string>
  deleteAlias: (unitClass: string, name: string) => Result<string>
  assignPhaseClass: (unitClass: string, phaseClass: string) => Result<string>
  removePhaseClass: (unitClass: string, phaseClass: string) => Result<string>

  savePhaseParam: (phaseClass: string, def: PhaseParamDef, original?: string) => Result<string>
  deletePhaseParam: (phaseClass: string, name: string) => Result<string>
  phaseDraftOf: (name: string) => PhaseClass | undefined
  editPhaseDraft: (name: string, edit: (d: PhaseClass) => string | null | void) => Result<string>
  savePhaseClass: (name: string) => Result<string>
  discardPhaseDraft: (name: string) => void

  createProcessCell: (className: string, area: string) => Result<string>
  renameProcessCell: (name: string, next: string) => Result<string>
  deleteProcessCell: (name: string) => Result<string>
  createUnitModule: (unitClass: string, cell: string) => Result<string>
  renameUnitModule: (name: string, next: string) => Result<string>
  deleteUnitModule: (name: string) => Result<string>
  setUnitProps: (name: string, patch: Partial<Pick<UnitModule, 'description' | 'workInProgress' | 'primaryDisplay' | 'detailDisplay' | 'instrumentDisplay' | 'scanRate'>>) => Result<string>
  setUnitPhaseProps: (unit: string, phase: string, patch: Partial<Pick<UnitPhaseConfig, 'description' | 'phaseType' | 'scanRate' | 'alwaysInMemory' | 'simulate'>>) => Result<string>
  resolveAlias: (unit: string, alias: string, res: AliasResolution) => Result<string>
  containModule: (tag: string, unit: string) => Result<string>
  releaseModule: (tag: string) => Result<string>
  addToCell: (tag: string, cell: string) => Result<string>

  assignUnit: (unit: string, controller: string, includeContained: boolean) => Result<string[]>
  assignCell: (cell: string, controller: string) => Result<string[]>
  downloadUnit: (unit: string, includeContained: boolean, uploads?: UploadRow[]) => Result<{ warnings: string[] }>
  downloadUnitPhase: (unit: string, phase: string) => Result<{ warnings: string[] }>
  pendingUploads: (unit: string) => UploadRow[]

  loadPhase: (unit: string, phase: string) => Result<string>
  unloadPhase: (unit: string, phase: string) => Result<string>
  command: (unit: string, phase: string, cmd: PhaseCommand) => Result<string>
  toggleOwner: (unit: string, phase: string) => Result<string>
  setOnlineParam: (unit: string, phase: string, param: string, value: number | string) => Result<string>
  /** Configured (downloaded) value of a phase parameter on one unit phase; null restores the phase class default. */
  setUnitPhaseParam: (unit: string, phase: string, param: string, value: number | string | null) => Result<string>

  // ---- Chapter 5: module classes on unit classes, module instances ----------
  addModuleBlock: (unitClass: string, className: string, ownership: 'Private' | 'Shared', allowVariant: boolean) => Result<string>
  renameModuleBlock: (unitClass: string, block: string, next: string) => Result<string>
  removeModuleBlock: (unitClass: string, block: string) => Result<string>
  bindBlock: (unit: string, block: string, tag: string | null) => Result<string>
  renameCourseModule: (tag: string, next: string) => Result<string>
  deleteCourseModule: (tag: string) => Result<string>
  unassignModule: (tag: string) => Result<string>
  setModuleDescription: (tag: string, description: string) => Result<string>
  setTwoStage: (tag: string, position: 'CLOSE' | 'DRIBBLE' | 'BULK') => Result<string>
  /** Faceplate MODE target of a course valve/motor (DC block): AUTO/MAN return it to the operator, CAS hands it to the phase or equipment module. */
  setDeviceMode: (tag: string, mode: 'AUTO' | 'MAN' | 'CAS') => Result<string>

  step: (dt: number) => void
}

function requireUnlockedLock(lock: 'CAN_CONFIGURE' | 'CAN_DOWNLOAD' | 'BATCH_OPERATE' | 'CONTROL', action: string): boolean {
  const sec = useSecurity.getState()
  if (sec.locked) {
    useSecurity.setState({ lastDenied: `Access Denied — ${action} requires an unlocked workstation` })
    return false
  }
  return sec.requireLock(lock, action)
}
const log = (tag: string, description: string, category: 'CONFIGURE' | 'DIAGNOSTIC' | 'BATCH' = 'CONFIGURE'): void =>
  useStore.getState().logEvent(category, tag, description)
const user = (): string => useSecurity.getState().currentUser.toUpperCase()

function defaultCategories(): Record<string, BatchCategory> {
  return Object.fromEntries((['pcell', 'unit', 'phase'] as BatchClassKind[]).map(kind => [catKey(kind, 'General'), { name: 'General', kind, parent: null }]))
}

const empty = (): Pick<BatchState, 'categories' | 'pcellClasses' | 'unitClasses' | 'phaseClasses' | 'phaseDrafts' | 'processCells' | 'units' |
  'contained' | 'cellMembers' | 'unitAssignments' | 'deployedUnits' | 'active' | 'dc'> => ({
  categories: defaultCategories(), pcellClasses: {}, unitClasses: {}, phaseClasses: {}, phaseDrafts: {}, processCells: {}, units: {},
  contained: {}, cellMembers: {}, unitAssignments: {}, deployedUnits: {}, active: {}, dc: {}
})

function classes(s: BatchState, kind: BatchClassKind): Record<string, { name: string; category: string }> {
  return kind === 'pcell' ? s.pcellClasses : kind === 'unit' ? s.unitClasses : s.phaseClasses
}
function batchNameTaken(s: BatchState, name: string, except?: string): boolean {
  const k = name.toUpperCase()
  return [...Object.keys(s.pcellClasses), ...Object.keys(s.unitClasses), ...Object.keys(s.phaseClasses), ...Object.keys(useLibrary.getState().classes)]
    .some(n => n.toUpperCase() === k && n !== except)
}
function hierarchyTaken(s: BatchState, name: string, except?: string): boolean {
  const main = useStore.getState()
  const k = name.toUpperCase()
  return [...main.areas, ...Object.keys(main.modules), ...Object.keys(main.sfcs), ...Object.keys(main.equipment), ...Object.keys(useLibrary.getState().sims),
    ...Object.keys(useEm.getState().instances), ...Object.keys(s.processCells), ...Object.keys(s.units)].some(n => n.toUpperCase() === k && n !== except)
}
function nextFree(stem: string, used: (n: string) => boolean): string {
  for (let n = 1; ; n++) if (!used(`${stem}_${n}`)) return `${stem}_${n}`
}
function withoutKeys<T>(r: Record<string, T>, keys: readonly string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k)))
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function aliasesResolved(u: UnitModule): boolean {
  return Object.values(u.aliases).every(a => a.ignore || !!a.path.trim())
}

function unitPhase(phaseClass: string): UnitPhaseConfig {
  return { name: phaseClass, phaseClass, description: '', phaseType: 'Controller', scanRate: 1, alwaysInMemory: false, simulate: false, paramValues: {} }
}

// ---------------------------------------------------------------------------
// Parameter references

type RefKind = { k: 'internal'; name: string; field: string } | { k: 'ignore'; alias: string } | { k: 'external'; path: string }

export function classifyRef(ref: string): RefKind | string {
  const r = ref.trim()
  if (r.startsWith('//')) return { k: 'external', path: r.slice(2) }
  const body = r.startsWith('^/') ? r.slice(2) : r.startsWith('/') ? r.slice(1) : null
  if (body === null) return `'${ref}' — external references begin with //, internal ones with / or ^/`
  const [name, field = 'CV'] = body.split('.')
  if (field.toUpperCase() === 'IGN' && r.startsWith('/') && !r.startsWith('^/')) return { k: 'ignore', alias: name.toUpperCase() }
  return { k: 'internal', name: name.toUpperCase(), field: field.toUpperCase() }
}

function splitModulePath(path: string): { module: string; param: string; field: string } | null {
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const module = parts[0].toUpperCase()
  const rest = parts.slice(1).join('/').toUpperCase().replace(/^DC1\//, '')
  const dot = rest.lastIndexOf('.')
  return dot < 0 ? { module, param: rest, field: 'CV' } : { module, param: rest.slice(0, dot), field: rest.slice(dot + 1) }
}

const MODE_CODES: Record<number, string> = { 128: 'OOS', 16: 'CAS', 8: 'AUTO', 4: 'MAN', 2: 'ROUT', 1: 'RCAS' }
function modeWord(v: Value): string {
  if (typeof v === 'number') { const w = MODE_CODES[v]; if (!w) throw new EvalError(`${v} is not a mode value`); return w }
  const w = String(v).toUpperCase()
  if (!MODE_WORDS.includes(w)) throw new EvalError(`${String(v)} is not a mode (use CAS, AUTO, MAN or OOS)`)
  return w
}

export function moduleParamNames(m: AnyModule | undefined, simParams?: string[], emTag?: string): string[] {
  if (simParams) return simParams
  if (emTag && useEm.getState().instances[emTag]) return ['A_COMMAND.CV', 'A_PV.CV', 'A_TARGET.CV', 'A_ABT_ON_NEW_CMD.CV']
  if (!m) return []
  if (m.type === 'VALVE' || m.type === 'MOTOR') return ['CAS_SP.CV', 'MODE.TARGET', 'MODE.ACTUAL', 'PV.CV', 'PV_D.CV', 'SP_D.CV', 'DC1/MODE.TARGET', 'DC1/PV_D.CV', 'DC1/SP_D.CV']
  if (m.type === 'AI') return ['AI1/PV.CV', 'AI1/OUT.CV', 'PV.CV', 'OUT.CV']
  if (m.type === 'PID') return ['PID1/PV.CV', 'PID1/SP.CV', 'PID1/OUT.CV', 'MODE.TARGET', 'PV.CV', 'SP.CV']
  return ['PV.CV']
}

function readModule(path: string): Value {
  const sp = splitModulePath(path)
  if (!sp) throw new EvalError(`'//${path}' does not name a parameter (MODULE/PARAMETER)`)
  const lib = useLibrary.getState()
  const sim = Object.values(lib.sims).find(x => x.tag.toUpperCase() === sp.module)
  if (sim) {
    const v = makeReader(lib)(`${sim.tag}/${sp.param}`)
    if (!v) throw new EvalError(`${sim.tag} has no parameter ${sp.param}`)
    return v.value
  }
  const m = useStore.getState().modules[sp.module]
  if (!m) {
    const em = useEm.getState()
    if (em.instances[sp.module]) {
      const v = emParamValue(em.deployed[sp.module], em.runtime[sp.module], sp.param)
      if (v === undefined) throw new EvalError(`${sp.module} has no parameter ${sp.param}`)
      return v
    }
    throw new EvalError(`Module ${sp.module} does not exist`)
  }
  const p = sp.param
  if (m.type === 'VALVE' || m.type === 'MOTOR') {
    const remote = useBatch.getState().dc[m.tag]
    const open = m.type === 'VALVE' ? m.open : m.running
    const cmd = m.type === 'VALVE' ? m.commandedOpen : m.commanded
    const two = m.type === 'VALVE' && !!m.twoStage
    if (p === 'CAS_SP') return remote?.casSp ?? (cmd ? (two ? (m.type === 'VALVE' && m.bulk ? 2 : 1) : 1) : 0)
    if (p === 'MODE' || p === 'DC1/MODE') return remote?.mode ?? 'AUTO'
    if (p === 'PV' || p === 'PV_D' || p === 'DC1/PV_D') return m.dcState.startsWith('GOING') ? (two ? 3 : 2) : open ? (two ? (m.type === 'VALVE' && m.bulk ? 2 : 1) : 1) : 0
    if (p === 'SP_D' || p === 'DC1/SP_D') return cmd ? 1 : 0
  } else if (m.type === 'AI') {
    if (['PV', 'OUT', 'AI1/PV', 'AI1/OUT'].includes(p)) return m.pv
  } else if (m.type === 'PID') {
    if (['PV', 'PID1/PV'].includes(p)) return m.pv
    if (['SP', 'PID1/SP'].includes(p)) return m.sp
    if (['OUT', 'PID1/OUT'].includes(p)) return m.out
    if (p === 'MODE') return m.mode
  }
  throw new EvalError(`${m.tag} has no parameter ${p}`)
}

/** Read a module parameter path (MODULE/PARAM.FIELD) the way phase logic does. */
export function readModulePath(path: string): Value { return readModule(path) }

function applyRemote(tag: string): void {
  const r = useBatch.getState().dc[tag]
  if (!r || r.mode !== 'CAS') return
  useStore.setState(s => {
    const m = s.modules[tag]
    if (m?.type === 'VALVE') {
      const want = r.casSp === 1 || r.casSp === 2
      const bulk = m.twoStage ? r.casSp === 2 : m.bulk
      return m.commandedOpen === want && m.bulk === bulk ? {} : { modules: { ...s.modules, [tag]: { ...m, commandedOpen: want, bulk } } }
    }
    if (m?.type === 'MOTOR') { const want = r.casSp === 1; return m.commanded === want ? {} : { modules: { ...s.modules, [tag]: { ...m, commanded: want } } } }
    return {}
  })
}

function writeModule(path: string, value: Value): void {
  const sp = splitModulePath(path)
  if (!sp) throw new EvalError(`'//${path}' does not name a parameter (MODULE/PARAMETER)`)
  const m = useStore.getState().modules[sp.module]
  if (!m) {
    if (useEm.getState().instances[sp.module]) {
      if (sp.param === 'A_COMMAND') {
        const r = useEm.getState().setCommand(sp.module, typeof value === 'number' ? value : String(value))
        if (!r.ok) throw new EvalError(r.error)
        return
      }
      if (sp.param === 'A_ABT_ON_NEW_CMD') { const r = useEm.getState().setAbortOnNew(sp.module, toNum(value) !== 0 && String(value).toUpperCase() !== 'FALSE'); if (!r.ok) throw new EvalError(r.error); return }
      throw new EvalError(`${sp.module}/${sp.param} cannot be written`)
    }
    throw new EvalError(`Module ${sp.module} does not exist`)
  }
  if (m.type === 'VALVE' || m.type === 'MOTOR') {
    const cur = useBatch.getState().dc[m.tag] ?? { mode: 'AUTO', casSp: (m.type === 'VALVE' ? m.commandedOpen : m.commanded) ? 1 : 0 }
    if (sp.param === 'MODE') {
      if (sp.field === 'ACTUAL') throw new EvalError('MODE.ACTUAL is read-only; write MODE.TARGET')
      useBatch.setState(s => ({ dc: { ...s.dc, [m.tag]: { ...cur, mode: modeWord(value) } } }))
    } else if (sp.param === 'CAS_SP') {
      const n = toNum(value)
      if (!Number.isFinite(n)) throw new EvalError(`CAS_SP needs a named-set value, got ${String(value)}`)
      useBatch.setState(s => ({ dc: { ...s.dc, [m.tag]: { ...cur, casSp: n } } }))
    } else if (sp.param === 'SP_D') {
      if (cur.mode !== 'AUTO' && cur.mode !== 'MAN') throw new EvalError(`${m.tag} SP_D can be written in AUTO only (mode is ${cur.mode})`)
      const on = toNum(value) !== 0
      useStore.setState(s => ({ modules: { ...s.modules, [m.tag]: m.type === 'VALVE' ? { ...m, commandedOpen: on } : { ...m, commanded: on } } }))
      return
    } else throw new EvalError(`${m.tag}/${sp.param} cannot be written`)
    applyRemote(m.tag)
    return
  }
  if (m.type === 'PID' && (sp.param === 'SP' || sp.param === 'PID1/SP')) {
    useStore.getState().setSetpoint(m.tag, toNum(value))
    return
  }
  throw new EvalError(`${m.tag}/${sp.param} cannot be written`)
}

function namedValue(set: string, state: string): number {
  const sets = useStore.getState().namedSets.configured
  const def = Object.values(sets).find(x => x.name.toLowerCase() === set.toLowerCase())
  if (!def) throw new EvalError(`Named set ${set} does not exist`)
  const e = def.entries.find(x => x.name.toUpperCase() === state.toUpperCase())
  if (!e) throw new EvalError(`Named set ${set} has no state ${state}`)
  return e.value
}

function systemParam(a: ActivePhase, name: string): Value | undefined {
  const rt = a.rt
  switch (name) {
    case 'BSTATUS': case 'STATUS': return STATE_LABEL[rt.state]
    case 'STEP_INDEX': return stepIndex(rt)
    case 'STATE_TIME': return rt.stateTime
    case 'FAIL_INDEX': return rt.failIndex
    case 'OWNER': return a.owner === 'BATCH' ? 'DeltaV Batch' : 'External'
    case 'UNIT': return a.unit
    case 'WDOG_STATE': return 'OK'
  }
  return SYSTEM_PHASE_PARAMS.some(([n]) => n === name) ? (rt.params[name] ?? 0) : undefined
}

function resolveAliases(path: string, unit: UnitModule): { path: string; ignored: boolean } {
  let ignored = false
  const out = path.replace(/#([^#]+)#/g, (_, raw: string) => {
    const name = raw.toUpperCase()
    const res = unit.aliases[name]
    if (!res) throw new EvalError(`Alias #${name}# is not defined for unit ${unit.name}`)
    if (res.ignore) { ignored = true; return 'IGNORED' }
    if (!res.path.trim()) throw new EvalError(`Alias #${name}# is not resolved on ${unit.name}`)
    return res.path.trim()
  })
  return { path: out, ignored }
}

function phaseEnv(key: string) {
  const s = (): BatchState => useBatch.getState()
  const a = (): ActivePhase => s().active[key]
  const unit = (): UnitModule => s().deployedUnits[a().unit].unit
  const setParam = (name: string, value: Value): void => useBatch.setState(st => {
    const cur = st.active[key]
    return { active: { ...st.active, [key]: { ...cur, rt: { ...cur.rt, params: { ...cur.rt.params, [name]: value } } } } }
  })
  return {
    read: (ref: string): Value => {
      const c = classifyRef(ref)
      if (typeof c === 'string') throw new EvalError(c)
      if (c.k === 'ignore') { const res = unit().aliases[c.alias]; if (!res) throw new EvalError(`Alias ${c.alias} is not defined`); return res.ignore }
      if (c.k === 'internal') {
        const sys = systemParam(a(), c.name)
        if (sys !== undefined) return sys
        if (c.name in a().rt.params) return a().rt.params[c.name]
        throw new EvalError(`Phase parameter ${c.name} does not exist`)
      }
      const r = resolveAliases(c.path, unit())
      return r.ignored ? 0 : readModule(r.path)
    },
    write: (ref: string, value: Value): void => {
      const c = classifyRef(ref)
      if (typeof c === 'string') throw new EvalError(c)
      if (c.k === 'ignore') throw new EvalError('Alias ignore flags are changed in the Alias properties, not from phase logic in BatchLive')
      if (c.k === 'internal') {
        if (['BSTATUS', 'STATUS', 'STEP_INDEX', 'STATE_TIME', 'FAIL_INDEX', 'OWNER', 'UNIT', 'WDOG_STATE'].includes(c.name)) throw new EvalError(`${c.name} is read-only`)
        if (!(c.name in a().rt.params) && !SYSTEM_PHASE_PARAMS.some(([n]) => n === c.name)) throw new EvalError(`Phase parameter ${c.name} does not exist`)
        setParam(c.name, value)
        return
      }
      const r = resolveAliases(c.path, unit())
      if (!r.ignored) writeModule(r.path, value)
    },
    named: namedValue,
    log: (text: string): void => log(key, `LOGEVENT: ${text}`, 'BATCH'),
    failed: (message: string): void => log(key, `Phase failure: ${message}`, 'DIAGNOSTIC')
  }
}

/** Reference checker used by the Control Studio expression editor for a phase class. */
export function phaseCheckEnv(phaseClass: string, draft?: PhaseClass): CheckEnv {
  return {
    checkRef: (ref, write) => {
      const c = classifyRef(ref)
      if (typeof c === 'string') return c
      const s = useBatch.getState()
      const pc = draft ?? s.phaseDrafts[phaseClass] ?? s.phaseClasses[phaseClass]
      const owners = Object.values(s.unitClasses).filter(u => u.phaseClasses.includes(phaseClass))
      const aliasPool = owners.length ? owners : Object.values(s.unitClasses)
      if (c.k === 'ignore') return aliasPool.some(u => u.aliases[c.alias]) ? null : `Alias ${c.alias} is not defined in a unit class`
      if (c.k === 'internal') {
        if (pc?.params[c.name]) return null
        if (SYSTEM_PHASE_PARAMS.some(([n]) => n === c.name))
          return write && ['BSTATUS', 'STATUS', 'STEP_INDEX', 'STATE_TIME', 'FAIL_INDEX', 'OWNER', 'UNIT', 'WDOG_STATE'].includes(c.name) ? `${c.name} is read-only` : null
        return `${c.name} is not a parameter of phase class ${phaseClass}`
      }
      const aliases = [...c.path.matchAll(/#([^#]+)#/g)].map(m => m[1].toUpperCase())
      for (const al of aliases) if (!aliasPool.some(u => u.aliases[al])) return `#${al}# is not an alias of ${owners.length ? owners.map(o => o.name).join(', ') : 'any unit class'}`
      if (aliases.length) return null
      const sp = splitModulePath(c.path)
      if (!sp) return `'${ref}' does not name a parameter (//MODULE/PARAMETER)`
      const exists = !!useStore.getState().modules[sp.module] || !!useEm.getState().instances[sp.module] || Object.keys(useLibrary.getState().sims).some(t => t.toUpperCase() === sp.module)
      return exists ? null : `Module ${sp.module} does not exist`
    },
    checkNamed: (set, state) => {
      try { namedValue(set, state); return null } catch (e) { return (e as Error).message }
    }
  }
}

function controllerUp(tag: string | undefined): boolean {
  const c = tag ? useStore.getState().hardware.controllers[tag] : undefined
  return !!c && !controllerIsDown(c)
}

function snapshot(s: BatchState, unit: UnitModule, controller: string): UnitDeployment {
  const logic: UnitDeployment['logic'] = {}
  const params: UnitDeployment['params'] = {}
  for (const [name, ph] of Object.entries(unit.phases)) {
    const pc = s.phaseClasses[ph.phaseClass]
    if (!pc || ph.phaseType !== 'Controller') continue
    logic[name] = clone(pc.logic)
    params[name] = clone(pc.params)
  }
  return { unit: clone(unit), logic, params, controller, at: useStore.getState().time }
}

function unitWarnings(s: BatchState, unit: UnitModule): string[] {
  const w: string[] = []
  for (const [alias, res] of Object.entries(unit.aliases)) if (!res.ignore && !res.path.trim()) w.push(`${unit.name}: alias ${alias} is not resolved`)
  for (const ph of Object.values(unit.phases)) {
    if (!s.phaseClasses[ph.phaseClass]) w.push(`${unit.name}/${ph.name}: phase class ${ph.phaseClass} no longer exists`)
    else if (ph.phaseType !== 'Controller') w.push(`${unit.name}/${ph.name}: phase type is ${ph.phaseType}; the unit phase is not downloaded`)
    if (s.phaseDrafts[ph.phaseClass]) w.push(`Phase class ${ph.phaseClass} has unsaved Control Studio changes; the saved logic was downloaded`)
  }
  return [...new Set(w)]
}

export type UnitDownloadState = 'unassigned' | 'not-downloaded' | 'pending' | 'current'
export function unitDownloadState(s: BatchState, name: string): UnitDownloadState {
  const unit = s.units[name]
  const ctl = s.unitAssignments[name]
  if (!unit || !ctl) return 'unassigned'
  const dep = s.deployedUnits[name]
  if (!dep) return 'not-downloaded'
  const now = snapshot(s, unit, ctl)
  return dep.controller === ctl && JSON.stringify([now.unit, now.logic, now.params]) === JSON.stringify([dep.unit, dep.logic, dep.params]) ? 'current' : 'pending'
}

function initialParams(dep: UnitDeployment, phase: string): Record<string, Value> {
  const defs = dep.params[phase] ?? {}
  const cfg = dep.unit.phases[phase]?.paramValues ?? {}
  return Object.fromEntries(Object.values(defs).filter(d => d.kind !== 'message').map(d => [d.name, cfg[d.name] ?? d.defaultValue]))
}

/** Writable phase parameters: batch inputs and phase algorithm parameters (report parameters are written by the phase). */
function checkParamValue(def: PhaseParamDef | undefined, param: string, phase: string, value: number | string): Result<number | string> {
  if (!def || def.kind === 'message') return fail(`${param} is not a writable parameter of ${phase}`)
  if (def.kind === 'batch' && def.direction !== 'Input') return fail(`${param} is a report parameter; it is written by the phase`)
  if (def.type === 'String') return ok(String(value))
  const v = Number(value)
  if (String(value).trim() === '' || !Number.isFinite(v)) return fail(`${param} needs a number`)
  if (def.kind === 'batch' && (v < def.low || v > def.high)) return fail(`${param} must be between ${def.low} and ${def.high} ${def.units}`)
  if (def.type === 'Integer' && !Number.isInteger(v)) return fail(`${param} is an Integer`)
  return ok(v)
}

// ---------------------------------------------------------------------------

export const useBatch = create<BatchState>((set, get) => ({
  ...empty(),

  resetBatch: () => set(empty()),

  // ---- Categories ----------------------------------------------------------
  newCategory: (kind, parent) => {
    const s = get()
    if (parent && !s.categories[catKey(kind, parent)]) return fail(`Category ${parent} does not exist`)
    let name = 'NewCategory'
    for (let n = 1; s.categories[catKey(kind, name)]; n++) name = `NewCategory${n}`
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create batch category ${name}`)) return fail('Requires the Can Configure key')
    set({ categories: { ...s.categories, [catKey(kind, name)]: { name, kind, parent } } })
    log(name, 'Category created')
    return ok(name)
  },
  renameCategory: (kind, name, next) => {
    const s = get()
    const to = next.trim()
    if (!s.categories[catKey(kind, name)]) return fail(`Category ${name} does not exist`)
    if (to === name) return ok(name)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (s.categories[catKey(kind, to)]) return fail(`Category ${to} already exists`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename batch category ${name}`)) return fail('Requires the Can Configure key')
    const categories = Object.fromEntries(Object.entries(s.categories).map(([k, c]) => {
      const moved = c.kind === kind && c.parent === name ? { ...c, parent: to } : c
      return k === catKey(kind, name) ? [catKey(kind, to), { ...moved, name: to }] : [k, moved]
    }))
    const recat = <T extends { category: string }>(r: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.category === name ? { ...v, category: to } : v]))
    set({ categories, ...(kind === 'pcell' ? { pcellClasses: recat(s.pcellClasses) } : kind === 'unit' ? { unitClasses: recat(s.unitClasses) } : { phaseClasses: recat(s.phaseClasses) }) })
    log(to, `Category renamed from ${name}`)
    return ok(to)
  },
  deleteCategory: (kind, name) => {
    const s = get()
    if (!s.categories[catKey(kind, name)]) return fail(`Category ${name} does not exist`)
    const kids = [...Object.values(s.categories).filter(c => c.kind === kind && c.parent === name).map(c => c.name),
      ...Object.values(classes(s, kind)).filter(c => c.category === name).map(c => c.name)]
    if (kids.length) return fail(`Category ${name} is not empty (${kids.join(', ')})`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete batch category ${name}`)) return fail('Requires the Can Configure key')
    set({ categories: withoutKeys(s.categories, [catKey(kind, name)]) })
    log(name, 'Category deleted')
    return ok(name)
  },

  // ---- Classes ---------------------------------------------------------------
  newProcessCellClass: category => {
    const s = get()
    if (!s.categories[catKey('pcell', category)]) return fail(`Category ${category} does not exist`)
    let name = 'PCELL_CLASS'
    for (let n = 1; batchNameTaken(s, name); n++) name = `PCELL_CLASS${n}`
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create process cell class ${name}`)) return fail('Requires the Can Configure key')
    set({ pcellClasses: { ...s.pcellClasses, [name]: { name, category, description: '' } } })
    log(name, `Process Cell Class created in ${category}`)
    return ok(name)
  },
  newUnitClass: (category, raw) => {
    const s = get()
    const name = raw.trim().toUpperCase()
    if (!s.categories[catKey('unit', category)]) return fail(`Category ${category} does not exist`)
    if (!isNameValid(name)) return fail(NAME_RULE)
    if (batchNameTaken(s, name)) return fail(`The name ${name} is already used in the library`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create unit class ${name}`)) return fail('Requires the Can Configure key')
    set({ unitClasses: { ...s.unitClasses, [name]: { name, category, description: '', aliases: {}, phaseClasses: [] } } })
    log(name, `Unit Class created in ${category}`)
    return ok(name)
  },
  newPhaseClass: (category, raw) => {
    const s = get()
    const name = raw.trim().toUpperCase()
    if (!s.categories[catKey('phase', category)]) return fail(`Category ${category} does not exist`)
    if (!isNameValid(name)) return fail(NAME_RULE)
    if (batchNameTaken(s, name)) return fail(`The name ${name} is already used in the library`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create phase class ${name}`)) return fail('Requires the Can Configure key')
    set({ phaseClasses: { ...s.phaseClasses, [name]: newPhaseClass(name, category) } })
    log(name, `Phase Class created in ${category}`)
    return ok(name)
  },
  copyClass: (kind, category, source, raw) => {
    const s = get()
    const name = raw.trim().toUpperCase()
    const label = kind === 'unit' ? 'unit class' : 'phase class'
    if (!s.categories[catKey(kind, category)]) return fail(`Category ${category} does not exist`)
    const from = kind === 'unit' ? s.unitClasses[source] : s.phaseClasses[source]
    if (!from) return fail(`Browse for an existing ${label} to start from`)
    if (!isNameValid(name)) return fail(NAME_RULE)
    if (batchNameTaken(s, name)) return fail(`The name ${name} is already used in the library`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create ${kind === 'unit' ? 'unit class' : 'phase class'} ${name} from ${source}`)) return fail('Requires the Can Configure key')
    const copy = { ...structuredClone(from), name, category }
    if (kind === 'unit') set({ unitClasses: { ...s.unitClasses, [name]: copy as UnitClass } })
    else set({ phaseClasses: { ...s.phaseClasses, [name]: { ...(copy as PhaseClass), revision: 1 } } })
    log(name, `${kind === 'unit' ? 'Unit' : 'Phase'} Class created in ${category} from existing ${source}`)
    return ok(name)
  },
  renameClass: (kind, name, next) => {
    const s = get()
    const to = next.trim().toUpperCase()
    const pool = classes(s, kind)
    if (!pool[name]) return fail(`${name} does not exist`)
    if (to === name) return ok(name)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (batchNameTaken(s, to, name)) return fail(`The name ${to} is already used in the library`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename ${kind === 'pcell' ? 'process cell class' : kind === 'unit' ? 'unit class' : 'phase class'} ${name}`)) return fail('Requires the Can Configure key')
    const move = <T extends { name: string }>(r: Record<string, T>): Record<string, T> => {
      const out = { ...r }; out[to] = { ...out[name], name: to }; delete out[name]; return out
    }
    if (kind === 'pcell') set({ pcellClasses: move(s.pcellClasses), processCells: Object.fromEntries(Object.entries(s.processCells).map(([k, c]) => [k, c.className === name ? { ...c, className: to } : c])) })
    else if (kind === 'unit') set({ unitClasses: move(s.unitClasses), units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === name ? { ...u, unitClass: to } : u])) })
    else {
      const drafts = { ...s.phaseDrafts }
      if (drafts[name]) { drafts[to] = { ...drafts[name], name: to }; delete drafts[name] }
      set({
        phaseClasses: move(s.phaseClasses), phaseDrafts: drafts,
        unitClasses: Object.fromEntries(Object.entries(s.unitClasses).map(([k, u]) => [k, { ...u, phaseClasses: u.phaseClasses.map(p => p === name ? to : p) }])),
        units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, { ...u, phases: Object.fromEntries(Object.entries(u.phases).map(([pk, ph]) =>
          ph.phaseClass === name ? [pk === name ? to : pk, { ...ph, phaseClass: to, name: ph.name === name ? to : ph.name }] : [pk, ph])) }]))
      })
    }
    log(to, `Renamed from ${name}`)
    return ok(to)
  },
  deleteClass: (kind, name) => {
    const s = get()
    if (!classes(s, kind)[name]) return fail(`${name} does not exist`)
    const users = kind === 'pcell' ? Object.values(s.processCells).filter(c => c.className === name).map(c => c.name) :
      kind === 'unit' ? Object.values(s.units).filter(u => u.unitClass === name).map(u => u.name) :
        Object.values(s.unitClasses).filter(u => u.phaseClasses.includes(name)).map(u => u.name)
    if (users.length) return fail(`${name} is used by ${users.join(', ')}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete ${kind === 'pcell' ? 'process cell class' : kind === 'unit' ? 'unit class' : 'phase class'} ${name}`)) return fail('Requires the Can Configure key')
    if (kind === 'pcell') set({ pcellClasses: withoutKeys(s.pcellClasses, [name]) })
    else if (kind === 'unit') set({ unitClasses: withoutKeys(s.unitClasses, [name]) })
    else set({ phaseClasses: withoutKeys(s.phaseClasses, [name]), phaseDrafts: withoutKeys(s.phaseDrafts, [name]) })
    log(name, 'Deleted')
    return ok(name)
  },

  // ---- Unit class aliases and phases --------------------------------------
  addAlias: (unitClass, raw, description) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    const name = raw.trim().toUpperCase()
    if (!uc) return fail(`Unit class ${unitClass} does not exist`)
    if (!isNameValid(name)) return fail(NAME_RULE)
    if (uc.aliases[name]) return fail(`Alias ${name} already exists on ${unitClass}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create alias ${name}`)) return fail('Requires the Can Configure key')
    const def: AliasDef = { name, description }
    set({
      unitClasses: { ...s.unitClasses, [unitClass]: { ...uc, aliases: { ...uc.aliases, [name]: def } } },
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === unitClass ? { ...u, aliases: { ...u.aliases, [name]: { path: '', ignore: false, description: '' } } } : u]))
    })
    log(unitClass, `Alias ${name} created`)
    return ok(name)
  },
  deleteAlias: (unitClass, name) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    if (!uc?.aliases[name]) return fail(`Alias ${name} does not exist`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete alias ${name}`)) return fail('Requires the Can Configure key')
    set({
      unitClasses: { ...s.unitClasses, [unitClass]: { ...uc, aliases: withoutKeys(uc.aliases, [name]) } },
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === unitClass ? { ...u, aliases: withoutKeys(u.aliases, [name]) } : u]))
    })
    log(unitClass, `Alias ${name} deleted`)
    return ok(name)
  },
  assignPhaseClass: (unitClass, phaseClass) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    if (!uc) return fail(`Unit class ${unitClass} does not exist`)
    if (!s.phaseClasses[phaseClass]) return fail(`Phase class ${phaseClass} does not exist`)
    if (uc.phaseClasses.includes(phaseClass)) return fail(`${phaseClass} is already assigned to ${unitClass}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign phase class ${phaseClass} to unit class ${unitClass}`)) return fail('Requires the Can Configure key')
    set({
      unitClasses: { ...s.unitClasses, [unitClass]: { ...uc, phaseClasses: [...uc.phaseClasses, phaseClass] } },
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === unitClass ? { ...u, phases: { ...u.phases, [phaseClass]: unitPhase(phaseClass) } } : u]))
    })
    log(unitClass, `Phase class ${phaseClass} assigned; unit phases created on its unit modules`)
    return ok(phaseClass)
  },
  removePhaseClass: (unitClass, phaseClass) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    if (!uc?.phaseClasses.includes(phaseClass)) return fail(`${phaseClass} is not assigned to ${unitClass}`)
    const busy = Object.values(s.active).find(a => s.units[a.unit]?.unitClass === unitClass && a.phase === phaseClass)
    if (busy) return fail(`${busy.unit}/${phaseClass} is loaded; unload it first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure unit class ${unitClass}`)) return fail('Requires the Can Configure key')
    set({
      unitClasses: { ...s.unitClasses, [unitClass]: { ...uc, phaseClasses: uc.phaseClasses.filter(p => p !== phaseClass) } },
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === unitClass ? { ...u, phases: withoutKeys(u.phases, [phaseClass]) } : u]))
    })
    log(unitClass, `Phase class ${phaseClass} removed`)
    return ok(phaseClass)
  },

  // ---- Phase parameters and logic -------------------------------------------
  savePhaseParam: (phaseClass, def, original) => {
    const s = get()
    const pc = s.phaseClasses[phaseClass]
    if (!pc) return fail(`Phase class ${phaseClass} does not exist`)
    const d: PhaseParamDef = { ...def, name: def.name.trim().toUpperCase(), group: def.group.trim(), units: def.units.trim() }
    const others = withoutKeys(pc.params, original ? [original] : [])
    const err = paramDefError(d, others, undefined)
    if (err) return fail(err)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure phase class ${phaseClass}`)) return fail('Requires the Can Configure key')
    const params = { ...others, [d.name]: d }
    const draft = s.phaseDrafts[phaseClass]
    set({
      phaseClasses: { ...s.phaseClasses, [phaseClass]: { ...pc, params, revision: pc.revision + 1 } },
      phaseDrafts: draft ? { ...s.phaseDrafts, [phaseClass]: { ...draft, params } } : s.phaseDrafts
    })
    log(phaseClass, `${original ? 'Parameter properties changed' : 'Parameter created'}: ${d.name} (${d.kind === 'batch' ? `Batch ${d.direction.toLowerCase()} parameter` : d.kind === 'message' ? 'Phase message' : 'Phase algorithm parameter'})`)
    return ok(d.name)
  },
  deletePhaseParam: (phaseClass, name) => {
    const s = get()
    const pc = s.phaseClasses[phaseClass]
    if (!pc?.params[name]) return fail(`${name} does not exist`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete phase parameter ${name}`)) return fail('Requires the Can Configure key')
    set({ phaseClasses: { ...s.phaseClasses, [phaseClass]: { ...pc, params: withoutKeys(pc.params, [name]), revision: pc.revision + 1 } } })
    log(phaseClass, `Parameter ${name} deleted`)
    return ok(name)
  },
  phaseDraftOf: name => get().phaseDrafts[name] ?? get().phaseClasses[name],
  editPhaseDraft: (name, edit) => {
    const s = get()
    const pc = s.phaseClasses[name]
    if (!pc) return fail(`Phase class ${name} does not exist`)
    const draft = clone(s.phaseDrafts[name] ?? pc)
    const err = edit(draft)
    if (err) return fail(err)
    set({ phaseDrafts: { ...s.phaseDrafts, [name]: draft } })
    return ok(name)
  },
  savePhaseClass: name => {
    const s = get()
    const pc = s.phaseClasses[name]
    const draft = s.phaseDrafts[name]
    if (!pc) return fail(`Phase class ${name} does not exist`)
    if (!draft) return ok(name)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Save phase class ${name}`)) return fail('Requires the Can Configure key')
    set({ phaseClasses: { ...s.phaseClasses, [name]: { ...draft, revision: pc.revision + 1 } }, phaseDrafts: withoutKeys(s.phaseDrafts, [name]) })
    log(name, `Phase logic saved (revision ${pc.revision + 1})`)
    return ok(name)
  },
  discardPhaseDraft: name => set(s => ({ phaseDrafts: withoutKeys(s.phaseDrafts, [name]) })),

  // ---- Process cells and unit modules -----------------------------------------
  createProcessCell: (className, area) => {
    const s = get()
    if (!s.pcellClasses[className]) return fail(`Process cell class ${className} does not exist`)
    if (!useStore.getState().areas.includes(area)) return fail(`Area ${area} does not exist`)
    const name = nextFree(className.slice(0, 13), n => hierarchyTaken(s, n))
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create process cell ${name}`)) return fail('Requires the Can Configure key')
    set({ processCells: { ...s.processCells, [name]: { name, className, area, description: '' } } })
    log(name, `Process Cell created from ${className} in area ${area}`)
    return ok(name)
  },
  renameProcessCell: (name, raw) => {
    const s = get()
    const to = raw.trim().toUpperCase()
    if (!s.processCells[name]) return fail(`Process cell ${name} does not exist`)
    if (to === name) return ok(name)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (hierarchyTaken(s, to, name)) return fail(`The name ${to} is already used`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename process cell ${name}`)) return fail('Requires the Can Configure key')
    const cells = { ...s.processCells, [to]: { ...s.processCells[name], name: to } }
    delete cells[name]
    set({
      processCells: cells,
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.processCell === name ? { ...u, processCell: to } : u])),
      cellMembers: Object.fromEntries(Object.entries(s.cellMembers).map(([k, c]) => [k, c === name ? to : c]))
    })
    log(to, `Process Cell renamed from ${name}`)
    return ok(to)
  },
  deleteProcessCell: name => {
    const s = get()
    if (!s.processCells[name]) return fail(`Process cell ${name} does not exist`)
    const kids = Object.values(s.units).filter(u => u.processCell === name).map(u => u.name)
    if (kids.length) return fail(`${name} still contains ${kids.join(', ')}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete process cell ${name}`)) return fail('Requires the Can Configure key')
    set({ processCells: withoutKeys(s.processCells, [name]), cellMembers: Object.fromEntries(Object.entries(s.cellMembers).filter(([, c]) => c !== name)) })
    log(name, 'Process Cell deleted')
    return ok(name)
  },
  createUnitModule: (unitClass, cell) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    if (!uc) return fail(`Unit class ${unitClass} does not exist`)
    if (!s.processCells[cell]) return fail('Drop the unit class on a Process Cell')
    const name = nextFree(unitClass.slice(0, 13), n => hierarchyTaken(s, n))
    const area = s.processCells[cell].area
    const blocks = Object.values(uc.modules ?? {})
    const em = useEm.getState()
    for (const b of blocks) if (b.kind === 'em' && !em.classes[b.className]) return fail(`Equipment module class ${b.className} (block ${b.name}) no longer exists`)
    // Module block instances are named BLOCKn (AGITATOR1, BLNDR_COLOR1, COLOR_IN_VLV1 ...), n counting the unit class's instances.
    const namesFor = (n: number): string[] => blocks.filter(b => b.ownership === 'Private').flatMap(b => [`${b.name}${n}`,
      ...(b.kind === 'em' ? Object.keys(em.classes[b.className].children).map(c => `${c}${n}`) : [])])
    let seq = (uc.seq ?? 0) + 1
    while (namesFor(seq).some(n => hierarchyTaken(s, n) || n === name)) seq++
    const bad = namesFor(seq).find(n => !isNameValid(n))
    if (bad) return fail(`Module name ${bad} is not valid (${NAME_RULE})`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Create unit module ${name}`)) return fail('Requires the Can Configure key')
    const aliases: Record<string, AliasResolution> = Object.fromEntries(Object.keys(uc.aliases).map(a => [a, { path: '', ignore: false, description: '' }]))
    const unitBlocks: Record<string, string | null> = {}
    const newModules: Record<string, AnyModule> = {}
    const newEms: Record<string, EmInstance> = {}
    const cmInst: Record<string, { tag: string; className: string; owner: { kind: 'unit' | 'em'; name: string; block: string } }> = {}
    const contained: Record<string, string> = {}
    for (const b of blocks) {
      if (b.ownership === 'Shared') { unitBlocks[b.name] = null; continue }
      const tag = `${b.name}${seq}`
      unitBlocks[b.name] = tag
      aliases[b.name] = { path: tag, ignore: false, description: '' }
      contained[tag] = name
      if (b.kind === 'cm') {
        newModules[tag] = makeDeviceModule(tag, b.className, area)
        cmInst[tag] = { tag, className: b.className, owner: { kind: 'unit', name, block: b.name } }
      } else {
        const cls = em.classes[b.className]
        const children: Record<string, string> = {}
        for (const child of Object.values(cls.children)) {
          const ct = `${child.name}${seq}`
          newModules[ct] = makeDeviceModule(ct, child.className, area)
          cmInst[ct] = { tag: ct, className: child.className, owner: { kind: 'em', name: tag, block: child.name } }
          children[child.name] = ct
        }
        newEms[tag] = { tag, className: b.className, area, unit: name, block: b.name, children, description: cls.description || `${b.className} equipment module` }
      }
    }
    const unit: UnitModule = {
      name, unitClass, processCell: cell, description: 'Unit Module', workInProgress: false, primaryDisplay: '', detailDisplay: '', instrumentDisplay: '', scanRate: 1,
      aliases, phases: Object.fromEntries(uc.phaseClasses.map(p => [p, unitPhase(p)])), blocks: blocks.length ? unitBlocks : undefined,
      modified: useStore.getState().time, modifiedBy: user()
    }
    if (Object.keys(newModules).length) useStore.setState(st => ({ modules: { ...st.modules, ...newModules }, rev: st.rev + 1 }))
    if (Object.keys(newEms).length || Object.keys(cmInst).length) useEm.setState(st => ({ instances: { ...st.instances, ...newEms }, cmInstances: { ...st.cmInstances, ...cmInst } }))
    set({ units: { ...s.units, [name]: unit }, contained: { ...s.contained, ...contained },
      unitClasses: blocks.length ? { ...s.unitClasses, [unitClass]: { ...uc, seq } } : s.unitClasses })
    log(name, `Unit Module created from ${unitClass} in process cell ${cell}${blocks.length ? `; module instances ${Object.values(unitBlocks).filter(Boolean).join(', ')} created` : ''}`)
    return ok(name)
  },
  renameUnitModule: (name, raw) => {
    const s = get()
    const to = raw.trim().toUpperCase()
    if (!s.units[name]) return fail(`Unit module ${name} does not exist`)
    if (to === name) return ok(name)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (hierarchyTaken(s, to, name)) return fail(`The name ${to} is already used`)
    if (Object.values(s.active).some(a => a.unit === name)) return fail(`${name} has loaded phases; unload them first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename unit module ${name}`)) return fail('Requires the Can Configure key')
    const units = { ...s.units, [to]: { ...s.units[name], name: to } }
    delete units[name]
    const assign = { ...s.unitAssignments }
    if (assign[name]) { assign[to] = assign[name]; delete assign[name] }
    set({ units, unitAssignments: assign, deployedUnits: withoutKeys(s.deployedUnits, [name]),
      contained: Object.fromEntries(Object.entries(s.contained).map(([k, u]) => [k, u === name ? to : u])) })
    useEm.setState(st => ({
      instances: Object.fromEntries(Object.entries(st.instances).map(([k, i]) => [k, i.unit === name ? { ...i, unit: to } : i])),
      cmInstances: Object.fromEntries(Object.entries(st.cmInstances).map(([k, c]) => [k, c.owner.kind === 'unit' && c.owner.name === name ? { ...c, owner: { ...c.owner, name: to } } : c]))
    }))
    log(to, `Unit Module renamed from ${name}`)
    return ok(to)
  },
  deleteUnitModule: name => {
    const s = get()
    const u = s.units[name]
    if (!u) return fail(`Unit module ${name} does not exist`)
    if (Object.values(s.active).some(a => a.unit === name)) return fail(`${name} has loaded phases; unload them first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete unit module ${name}`)) return fail('Requires the Can Configure key')
    // Private module blocks were created with the unit module and are deleted with it.
    const em = useEm.getState()
    const owned = Object.values(em.cmInstances).filter(c => c.owner.kind === 'unit' && c.owner.name === name).map(c => c.tag)
    const ownedEms = Object.values(em.instances).filter(i => i.unit === name)
    const childTags = ownedEms.flatMap(i => Object.values(i.children))
    const gone = [...owned, ...childTags]
    if (gone.length) useStore.setState(st => ({ modules: withoutKeys(st.modules, gone), rev: st.rev + 1 }))
    const emTags = ownedEms.map(i => i.tag)
    if (gone.length || emTags.length) {
      useEm.setState(st => ({ instances: withoutKeys(st.instances, emTags), cmInstances: withoutKeys(st.cmInstances, gone), deployed: withoutKeys(st.deployed, emTags), runtime: withoutKeys(st.runtime, emTags) }))
      useLibrary.setState(l => ({ assignments: withoutKeys(l.assignments, [...gone, ...emTags]) }))
    }
    set({ units: withoutKeys(s.units, [name]), unitAssignments: withoutKeys(s.unitAssignments, [name]), deployedUnits: withoutKeys(s.deployedUnits, [name]),
      contained: Object.fromEntries(Object.entries(s.contained).filter(([t, x]) => x !== name && !gone.includes(t) && !emTags.includes(t))),
      dc: withoutKeys(s.dc, gone) })
    log(name, `Unit Module deleted${gone.length || emTags.length ? `; its module instances ${[...emTags, ...gone].join(', ')} were deleted` : ''}; other contained modules returned to the plant area`)
    return ok(name)
  },
  setUnitProps: (name, patch) => {
    const s = get()
    const u = s.units[name]
    if (!u) return fail(`Unit module ${name} does not exist`)
    if (patch.scanRate !== undefined && (!Number.isInteger(patch.scanRate) || patch.scanRate < 1)) return fail('Scan rate multiplier must be a whole number of 1 or more')
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure unit module ${name}`)) return fail('Requires the Can Configure key')
    set({ units: { ...s.units, [name]: { ...u, ...patch, modified: useStore.getState().time, modifiedBy: user() } } })
    log(name, 'Unit Module properties changed')
    return ok(name)
  },
  setUnitPhaseProps: (unit, phase, patch) => {
    const s = get()
    const u = s.units[unit]
    const ph = u?.phases[phase]
    if (!u || !ph) return fail(`Unit phase ${unit}/${phase} does not exist`)
    if (patch.scanRate !== undefined && (!Number.isInteger(patch.scanRate) || patch.scanRate < 1)) return fail('Scan rate multiplier must be a whole number of 1 or more')
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure unit phase ${unit}/${phase}`)) return fail('Requires the Can Configure key')
    set({ units: { ...s.units, [unit]: { ...u, phases: { ...u.phases, [phase]: { ...ph, ...patch } }, modified: useStore.getState().time, modifiedBy: user() } } })
    log(`${unit}/${phase}`, 'Unit Phase properties changed')
    return ok(phase)
  },
  resolveAlias: (unit, alias, res) => {
    const s = get()
    const u = s.units[unit]
    if (!u?.aliases[alias]) return fail(`Alias ${alias} does not exist on ${unit}`)
    const path = res.path.trim().toUpperCase()
    if (path && !res.ignore) {
      const mod = path.split('/')[0]
      const exists = !!useStore.getState().modules[mod] || !!useEm.getState().instances[mod] || Object.keys(useLibrary.getState().sims).some(t => t.toUpperCase() === mod)
      if (!exists) return fail(`Module ${mod} does not exist. Resolve the alias to a module (XV-101) or a full parameter path (LI-104/AI1/PV.CV).`)
      if (/[#'"]/.test(path)) return fail('Alias paths are plain module or parameter paths without quotes or #')
    }
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure alias ${alias}`)) return fail('Requires the Can Configure key')
    set({ units: { ...s.units, [unit]: { ...u, aliases: { ...u.aliases, [alias]: { ...res, path } }, modified: useStore.getState().time, modifiedBy: user() } } })
    log(unit, `Alias ${alias} resolved to ${res.ignore ? '(ignored)' : path || '(blank)'}`)
    return ok(alias)
  },
  containModule: (tag, unit) => {
    const s = get()
    const u = s.units[unit]
    const m = useStore.getState().modules[tag]
    if (!u) return fail(`Unit module ${unit} does not exist`)
    if (!m) return fail(`${tag} is not a control module`)
    const area = s.processCells[u.processCell]?.area
    if (m.area !== area) return fail(`${tag} is in area ${m.area}; ${unit} is in area ${area}`)
    if (s.contained[tag] === unit) return ok(tag)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign ${tag} to unit module ${unit}`)) return fail('Requires the Can Configure key')
    set({ contained: { ...s.contained, [tag]: unit } })
    log(tag, `Control Module assigned to unit module ${unit}`)
    return ok(tag)
  },
  releaseModule: tag => {
    const s = get()
    if (!s.contained[tag]) return fail(`${tag} is not in a unit module`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign ${tag} to plant area`)) return fail('Requires the Can Configure key')
    set({ contained: withoutKeys(s.contained, [tag]) })
    log(tag, 'Control Module moved back to the plant area')
    return ok(tag)
  },
  addToCell: (tag, cell) => {
    const s = get()
    const pc = s.processCells[cell]
    if (!pc) return fail(`Process cell ${cell} does not exist`)
    const sim = useLibrary.getState().sims[tag]
    const m = useStore.getState().modules[tag]
    if (!sim && !m) return fail(`${tag} does not exist`)
    const area = sim?.area ?? m!.area
    if (area !== pc.area) return fail(`${tag} is in area ${area}; ${cell} is in area ${pc.area}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign ${tag} to process cell ${cell}`)) return fail('Requires the Can Configure key')
    set({ cellMembers: { ...s.cellMembers, [tag]: cell }, contained: withoutKeys(s.contained, [tag]) })
    log(tag, `Assigned to process cell ${cell}`)
    return ok(tag)
  },

  // ---- Assignment and download -------------------------------------------------
  assignUnit: (unit, controller, includeContained) => {
    const s = get()
    if (!s.units[unit]) return fail(`Unit module ${unit} does not exist`)
    if (!useStore.getState().hardware.controllers[controller]) return fail(`Controller ${controller} does not exist`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign unit module ${unit} to controller ${controller}`)) return fail('Requires the Can Configure key')
    const tags = includeContained ? withEmChildren(Object.entries(s.contained).filter(([, u]) => u === unit).map(([t]) => t)) : []
    set({ unitAssignments: { ...s.unitAssignments, [unit]: controller } })
    if (tags.length) useLibrary.setState(l => ({ assignments: { ...l.assignments, ...Object.fromEntries(tags.map(t => [t, controller])) } }))
    log(unit, `Assigned to ${controller}${tags.length ? ` with ${tags.length} contained module(s)` : ''}`)
    return ok([unit, ...tags])
  },
  assignCell: (cell, controller) => {
    const s = get()
    if (!s.processCells[cell]) return fail(`Process cell ${cell} does not exist`)
    if (!useStore.getState().hardware.controllers[controller]) return fail(`Controller ${controller} does not exist`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Assign process cell ${cell} to controller ${controller}`)) return fail('Requires the Can Configure key')
    const units = Object.values(s.units).filter(u => u.processCell === cell).map(u => u.name)
    const tags = withEmChildren([...Object.entries(s.contained).filter(([, u]) => units.includes(u)).map(([t]) => t),
      ...Object.entries(s.cellMembers).filter(([, c]) => c === cell).map(([t]) => t)])
    set({ unitAssignments: { ...s.unitAssignments, ...Object.fromEntries(units.map(u => [u, controller])) } })
    useLibrary.setState(l => ({ assignments: { ...l.assignments, ...Object.fromEntries(tags.map(t => [t, controller])) } }))
    log(cell, `Process cell assigned to ${controller}: ${units.length} unit module(s), ${tags.length} module(s)`)
    return ok([...units, ...tags])
  },
  pendingUploads: unit => {
    const s = get()
    const rows: UploadRow[] = []
    const dep = s.deployedUnits[unit]
    if (!dep) return rows
    for (const a of Object.values(s.active).filter(x => x.unit === unit)) {
      const configured = initialParams(dep, a.phase)
      for (const def of Object.values(dep.params[a.phase] ?? {})) {
        if (def.kind !== 'batch' || def.direction !== 'Input') continue
        const v = a.rt.params[def.name]
        if (v !== undefined && String(v) !== String(configured[def.name])) rows.push({ phase: a.phase, param: def.name, value: v as number | string })
      }
    }
    return rows
  },
  downloadUnit: (unit, includeContained, uploads = []) => {
    const s = get()
    const u = s.units[unit]
    if (!u) return fail(`Unit module ${unit} does not exist`)
    const controller = s.unitAssignments[unit]
    if (!controller) return fail(`${unit} is not assigned to a controller. Use Assign ▸ Unit Module to Node, or drag the unit module (or its process cell) onto a controller.`)
    if (!controllerUp(controller)) return fail(`Controller ${controller} is not communicating`)
    const busy = Object.values(s.active).find(a => a.unit === unit && !['IDLE', 'COMPLETE', 'STOPPED', 'ABORTED'].includes(a.rt.state))
    if (busy) return fail(`${unit}/${busy.phase} is ${STATE_LABEL[busy.rt.state]}; it must be Idle or done before the unit module is downloaded`)
    if (!requireUnlockedLock('CAN_DOWNLOAD', `Download unit module ${unit}`)) return fail('Requires the Can Download key')
    let next = u
    for (const row of uploads) {
      const ph = next.phases[row.phase]
      if (ph) next = { ...next, phases: { ...next.phases, [row.phase]: { ...ph, paramValues: { ...ph.paramValues, [row.param]: row.value } } } }
    }
    const warnings = unitWarnings(s, next)
    const dep = snapshot(s, next, controller)
    set({ units: { ...s.units, [unit]: next }, deployedUnits: { ...s.deployedUnits, [unit]: dep },
      active: Object.fromEntries(Object.entries(s.active).filter(([, a]) => a.unit !== unit || dep.logic[a.phase])) })
    if (includeContained) {
      for (const tag of Object.entries(s.contained).filter(([, x]) => x === unit).map(([t]) => t)) {
        if (useEm.getState().instances[tag]) {
          const assign = withEmChildren([tag]).filter(t => !useLibrary.getState().assignments[t])
          if (assign.length) useLibrary.setState(l => ({ assignments: { ...l.assignments, ...Object.fromEntries(assign.map(t => [t, controller])) } }))
          warnings.push(...deployEm(tag, controller))
          continue
        }
        if (useLibrary.getState().instances[tag]) {
          if (!useLibrary.getState().assignments[tag]) useLibrary.setState(l => ({ assignments: { ...l.assignments, [tag]: controller } }))
          const r = useLibrary.getState().downloadModule(tag)
          if (!r.ok) warnings.push(`${tag}: ${r.error}`)
          else warnings.push(...r.value.warnings)
        }
      }
    }
    log(unit, `Unit module downloaded to ${controller}${uploads.length ? `; uploaded ${uploads.map(r => `${r.phase}/${r.param}`).join(', ')}` : ''}${warnings.length ? `; ${warnings.length} warning(s)` : ''}`)
    return ok({ warnings })
  },
  downloadUnitPhase: (unit, phase) => {
    const s = get()
    const u = s.units[unit]
    const ph = u?.phases[phase]
    if (!u || !ph) return fail(`Unit phase ${unit}/${phase} does not exist`)
    const dep = s.deployedUnits[unit]
    if (!dep) return fail(`Download the unit module ${unit} first`)
    if (!controllerUp(dep.controller)) return fail(`Controller ${dep.controller} is not communicating`)
    const a = s.active[activeKey(unit, phase)]
    if (a && !['IDLE', 'COMPLETE', 'STOPPED', 'ABORTED'].includes(a.rt.state)) return fail(`${unit}/${phase} is ${STATE_LABEL[a.rt.state]}; download it when it is Idle`)
    if (ph.phaseType !== 'Controller') return fail(`${unit}/${phase} phase type is ${ph.phaseType}; set it to Controller to download it`)
    const pc = s.phaseClasses[ph.phaseClass]
    if (!pc) return fail(`Phase class ${ph.phaseClass} does not exist`)
    if (!requireUnlockedLock('CAN_DOWNLOAD', `Download unit phase ${unit}/${phase}`)) return fail('Requires the Can Download key')
    const warnings = unitWarnings(s, u).filter(w => w.includes(phase) || w.includes('alias'))
    set({ deployedUnits: { ...s.deployedUnits, [unit]: { ...dep, unit: { ...dep.unit, phases: { ...dep.unit.phases, [phase]: clone(ph) }, aliases: clone(u.aliases) },
      logic: { ...dep.logic, [phase]: clone(pc.logic) }, params: { ...dep.params, [phase]: clone(pc.params) }, at: useStore.getState().time } } })
    log(`${unit}/${phase}`, `Unit phase downloaded (phase class ${pc.name} revision ${pc.revision})`)
    return ok({ warnings })
  },

  // ---- Runtime (DeltaV Operate faceplates, BatchHelp) ---------------------------
  loadPhase: (unit, raw) => {
    const s = get()
    const phase = raw.trim().toUpperCase()
    const dep = s.deployedUnits[unit]
    if (!dep) return fail(`${unit} has not been downloaded`)
    if (!controllerUp(dep.controller)) return fail(`Controller ${dep.controller} is not communicating`)
    if (!dep.unit.phases[phase]) return fail(`${phase} is not a unit phase of ${unit}`)
    if (!dep.logic[phase]) return fail(`${unit}/${phase} was not downloaded (phase type ${dep.unit.phases[phase].phaseType})`)
    if (s.active[activeKey(unit, phase)]) return fail(`${phase} is already loaded on ${unit}`)
    if (Object.values(s.active).filter(a => a.unit === unit).length >= 10) return fail('Up to ten unit phases can be active on a unit module')
    if (!requireUnlockedLock('BATCH_OPERATE', `Load unit phase ${unit}/${phase}`)) return fail('Requires the Batch Operate key')
    set({ active: { ...s.active, [activeKey(unit, phase)]: { unit, phase, owner: 'EXTERNAL', rt: newRuntime(initialParams(dep, phase)) } } })
    log(activeKey(unit, phase), 'Phase loaded (owner External)', 'BATCH')
    return ok(phase)
  },
  unloadPhase: (unit, phase) => {
    const s = get()
    const a = s.active[activeKey(unit, phase)]
    if (!a) return fail(`${phase} is not loaded on ${unit}`)
    if (a.rt.state !== 'IDLE') return fail(`Reset ${phase} to Idle before unloading it (state ${STATE_LABEL[a.rt.state]})`)
    if (!requireUnlockedLock('BATCH_OPERATE', `Unload unit phase ${unit}/${phase}`)) return fail('Requires the Batch Operate key')
    set({ active: withoutKeys(s.active, [activeKey(unit, phase)]) })
    log(activeKey(unit, phase), 'Phase unloaded', 'BATCH')
    return ok(phase)
  },
  command: (unit, phase, cmd) => {
    const s = get()
    const key = activeKey(unit, phase)
    const a = s.active[key]
    if (!a) return fail(`${phase} is not loaded on ${unit}. Use Load a Phase on the unit faceplate first.`)
    if (a.owner !== 'EXTERNAL') return fail(`${unit}/${phase} is owned by DeltaV Batch; toggle the phase owner to External to command it manually`)
    if (!requireUnlockedLock('BATCH_OPERATE', `Command unit phase ${unit}/${phase}`)) return fail('Requires the Batch Operate key')
    const next = commandPhase(a.rt, cmd)
    if (typeof next === 'string') return fail(next)
    set({ active: { ...s.active, [key]: { ...a, rt: next } } })
    log(key, `Command ${cmd.charAt(0) + cmd.slice(1).toLowerCase()} → ${STATE_LABEL[next.state]}`, 'BATCH')
    return ok(next.state)
  },
  toggleOwner: (unit, phase) => {
    const s = get()
    const key = activeKey(unit, phase)
    const a = s.active[key]
    if (!a) return fail(`${phase} is not loaded on ${unit}`)
    if (!requireUnlockedLock('BATCH_OPERATE', `Change owner of unit phase ${unit}/${phase}`)) return fail('Requires the Batch Operate key')
    const owner: PhaseOwner = a.owner === 'EXTERNAL' ? 'BATCH' : 'EXTERNAL'
    set({ active: { ...s.active, [key]: { ...a, owner } } })
    log(key, `Phase owner: ${owner === 'BATCH' ? 'DeltaV Batch' : 'External'}`, 'BATCH')
    return ok(owner)
  },
  setOnlineParam: (unit, phase, param, value) => {
    const s = get()
    const key = activeKey(unit, phase)
    const a = s.active[key]
    const dep = s.deployedUnits[unit]
    if (!a || !dep) return fail(`${phase} is not loaded on ${unit}`)
    const def = dep.params[phase]?.[param]
    const checked = checkParamValue(def, param, phase, value)
    if (!checked.ok) return checked
    if (!requireUnlockedLock('BATCH_OPERATE', `Write parameter of unit phase ${unit}/${phase}`)) return fail('Requires the Batch Operate key')
    const v = checked.value
    set({ active: { ...s.active, [key]: { ...a, rt: { ...a.rt, params: { ...a.rt.params, [param]: v } } } } })
    log(key, `${param} := ${v}${def?.units ? ' ' + def.units : ''}`, 'BATCH')
    return ok(param)
  },
  setUnitPhaseParam: (unit, phase, param, value) => {
    const s = get()
    const u = s.units[unit]
    const ph = u?.phases[phase]
    if (!u || !ph) return fail(`Unit phase ${unit}/${phase} does not exist`)
    const def = s.phaseClasses[ph.phaseClass]?.params[param]
    const checked = value === null ? ok<number | string>(0) : checkParamValue(def, param, phase, value)
    if (!checked.ok) return checked
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure unit phase ${unit}/${phase}`)) return fail('Requires the Can Configure key')
    const paramValues = { ...ph.paramValues }
    if (value === null) delete paramValues[param]
    else paramValues[param] = checked.value
    set({ units: { ...s.units, [unit]: { ...u, phases: { ...u.phases, [phase]: { ...ph, paramValues } }, modified: useStore.getState().time, modifiedBy: user() } } })
    log(`${unit}/${phase}`, value === null ? `${param} reset to the phase class default` : `${param} configured to ${checked.value}`)
    return ok(param)
  },

  // ---- Chapter 5: module classes on unit classes, module instances ----------
  addModuleBlock: (unitClass, className, ownership, allowVariant) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    if (!uc) return fail(`Unit class ${unitClass} does not exist`)
    const kind = CM_DEVICE_CLASSES[className] ? 'cm' : useEm.getState().classes[className] ? 'em' : null
    if (!kind) return fail(`${className} is not an Equipment Module Class or a Control Module Class that can be added to a unit class`)
    const modules = uc.modules ?? {}
    const name = blockName(className, n => !!modules[n] || !!uc.aliases[n])
    if (!requireUnlockedLock('CAN_CONFIGURE', `Add module block ${className} to unit class ${unitClass}`)) return fail('Requires the Can Configure key')
    const block = { name, className, kind, ownership, allowVariant } as const
    set({
      unitClasses: { ...s.unitClasses, [unitClass]: { ...uc, modules: { ...modules, [name]: block }, aliases: { ...uc.aliases, [name]: { name, description: `${className} module block`, block: true } } } },
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === unitClass ?
        { ...u, aliases: { ...u.aliases, [name]: { path: '', ignore: false, description: '' } }, blocks: { ...(u.blocks ?? {}), [name]: null } } : u]))
    })
    log(unitClass, `${kind === 'em' ? 'Equipment' : 'Control'} Module Class ${className} added as module block ${name} (${ownership}${allowVariant ? ', variant allowed' : ''}); alias ${name} created`)
    return ok(name)
  },
  renameModuleBlock: (unitClass, block, raw) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    const to = raw.trim().toUpperCase()
    if (!uc?.modules?.[block]) return fail(`${block} is not a module block of ${unitClass}`)
    if (to === block) return ok(block)
    if (!isNameValid(to)) return fail(NAME_RULE)
    if (uc.modules[to] || uc.aliases[to]) return fail(`${to} already exists on ${unitClass}`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename module block ${block}`)) return fail('Requires the Can Configure key')
    const ren = <T,>(r: Record<string, T>, value: (v: T) => T): Record<string, T> => Object.fromEntries(Object.entries(r).map(([k, v]) => (k === block ? [to, value(v)] : [k, v])))
    set({
      unitClasses: { ...s.unitClasses, [unitClass]: { ...uc, modules: ren(uc.modules, b => ({ ...b, name: to })), aliases: ren(uc.aliases, a => ({ ...a, name: to })) } },
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === unitClass ? { ...u, aliases: ren(u.aliases, a => a), blocks: u.blocks ? ren(u.blocks, b => b) : u.blocks } : u]))
    })
    useEm.setState(st => ({ instances: Object.fromEntries(Object.entries(st.instances).map(([k, i]) => [k, i.block === block && s.units[i.unit ?? '']?.unitClass === unitClass ? { ...i, block: to } : i])),
      cmInstances: Object.fromEntries(Object.entries(st.cmInstances).map(([k, c]) => [k, c.owner.kind === 'unit' && c.owner.block === block && s.units[c.owner.name]?.unitClass === unitClass ? { ...c, owner: { ...c.owner, block: to } } : c])) }))
    log(unitClass, `Module block ${block} renamed to ${to}; alias renamed`)
    return ok(to)
  },
  removeModuleBlock: (unitClass, block) => {
    const s = get()
    const uc = s.unitClasses[unitClass]
    if (!uc?.modules?.[block]) return fail(`${block} is not a module block of ${unitClass}`)
    const users = Object.values(s.units).filter(u => u.unitClass === unitClass && u.blocks?.[block]).map(u => u.name)
    if (users.length) return fail(`${block} has module instances on ${users.join(', ')}; delete those unit modules first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Remove module block ${block}`)) return fail('Requires the Can Configure key')
    set({
      unitClasses: { ...s.unitClasses, [unitClass]: { ...uc, modules: withoutKeys(uc.modules, [block]), aliases: withoutKeys(uc.aliases, [block]) } },
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.unitClass === unitClass ? { ...u, aliases: withoutKeys(u.aliases, [block]), blocks: u.blocks ? withoutKeys(u.blocks, [block]) : u.blocks } : u]))
    })
    log(unitClass, `Module block ${block} and its alias deleted`)
    return ok(block)
  },
  bindBlock: (unit, block, tag) => {
    const s = get()
    const u = s.units[unit]
    const b = u && s.unitClasses[u.unitClass]?.modules?.[block]
    if (!u || !b) return fail(`${block} is not a module block of ${unit}`)
    if (b.ownership !== 'Shared') return fail(`${block} is a Private module block; its module was created with ${unit}`)
    const t = tag?.trim().toUpperCase() ?? null
    if (t) {
      const em = useEm.getState()
      const cls = b.kind === 'em' ? em.instances[t]?.className : em.cmInstances[t]?.className
      if (!useStore.getState().modules[t] && !em.instances[t]) return fail(`Module ${t} does not exist`)
      if (!b.allowVariant && cls !== b.className) return fail(`${t} is not an instance of ${b.className} (variant modules are not allowed for ${block})`)
    }
    if (!requireUnlockedLock('CAN_CONFIGURE', `Bind module block ${unit}/${block}`)) return fail('Requires the Can Configure key')
    set({ units: { ...s.units, [unit]: { ...u, blocks: { ...(u.blocks ?? {}), [block]: t }, aliases: { ...u.aliases, [block]: { path: t ?? '', ignore: false, description: '' } } } } })
    log(unit, t ? `Shared module block ${block} bound to ${t}` : `Shared module block ${block} unbound`)
    return ok(block)
  },
  renameCourseModule: (tag, raw) => {
    const s = get()
    const to = raw.trim().toUpperCase()
    const main = useStore.getState()
    const em = useEm.getState()
    const isEm = !!em.instances[tag]
    if (!main.modules[tag] && !isEm) return fail(`${tag} does not exist`)
    if (to === tag) return ok(tag)
    if (useLibrary.getState().instances[tag]) { const r = useLibrary.getState().renameInstance(tag, to); if (r.ok) renameRefs(tag, r.value); return r }
    if (!isValidDeltaVTag(to)) return fail(NAME_RULE)
    if (hierarchyTaken(s, to, tag)) return fail(`The name ${to} is already used`)
    if (Object.values(s.active).some(a => { const dep = s.deployedUnits[a.unit]; return !!dep && Object.values(dep.unit.aliases).some(r => r.path.split('/')[0] === tag) }))
      return fail(`${tag} is used by a loaded unit phase; unload it first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Rename course module ${tag}`)) return fail('Requires the Can Configure key')
    if (isEm) {
      const inst = em.instances[tag]
      useEm.setState(st => ({
        instances: { ...withoutKeys(st.instances, [tag]), [to]: { ...inst, tag: to } },
        deployed: st.deployed[tag] ? { ...withoutKeys(st.deployed, [tag]), [to]: st.deployed[tag] } : st.deployed,
        runtime: st.runtime[tag] ? { ...withoutKeys(st.runtime, [tag]), [to]: st.runtime[tag] } : st.runtime,
        cmInstances: Object.fromEntries(Object.entries(st.cmInstances).map(([k, c]) => [k, c.owner.kind === 'em' && c.owner.name === tag ? { ...c, owner: { ...c.owner, name: to } } : c]))
      }))
    } else {
      useStore.setState(st => {
        const m = st.modules[tag]
        return { modules: { ...withoutKeys(st.modules, [tag]), [to]: { ...m, tag: to } as AnyModule }, rev: st.rev + 1 }
      })
      useEm.setState(st => ({
        cmInstances: st.cmInstances[tag] ? { ...withoutKeys(st.cmInstances, [tag]), [to]: { ...st.cmInstances[tag], tag: to } } : st.cmInstances,
        instances: Object.fromEntries(Object.entries(st.instances).map(([k, i]) => [k, Object.values(i.children).includes(tag) ? { ...i, children: Object.fromEntries(Object.entries(i.children).map(([b, t]) => [b, t === tag ? to : t])) } : i])),
        deployed: Object.fromEntries(Object.entries(st.deployed).map(([k, d]) => [k, Object.values(d.children).includes(tag) ? { ...d, children: Object.fromEntries(Object.entries(d.children).map(([b, t]) => [b, t === tag ? to : t])) } : d]))
      }))
    }
    renameRefs(tag, to)
    log(to, `Renamed from ${tag}`)
    return ok(to)
  },
  deleteCourseModule: tag => {
    const s = get()
    const em = useEm.getState()
    const isEm = !!em.instances[tag]
    if (!useStore.getState().modules[tag] && !isEm) return fail(`${tag} does not exist`)
    const ctl = useLibrary.getState().assignments[tag]
    if (ctl) return fail(`${tag} is assigned to ${ctl}. Delete its assignment first (Physical Network ▸ ${ctl} ▸ Assigned Modules ▸ right-click ▸ Delete Assignment).`)
    const owner = em.cmInstances[tag]?.owner
    if (owner?.kind === 'em') return fail(`${tag} is module block ${owner.block} of equipment module ${owner.name}; it is deleted with the equipment module`)
    if (Object.values(s.active).some(a => { const dep = s.deployedUnits[a.unit]; return !!dep && Object.values(dep.unit.aliases).some(r => r.path.split('/')[0] === tag) }))
      return fail(`${tag} is used by a loaded unit phase; unload it first`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete course module ${tag}`)) return fail('Requires the Can Configure key')
    const children = isEm ? Object.values(em.instances[tag].children) : []
    const gone = isEm ? children : [tag]
    if (isEm) useStore.setState(st => ({ modules: withoutKeys(st.modules, gone), rev: st.rev + 1 }))
    else { useStore.getState().deleteModule(tag); if (useStore.getState().modules[tag]) return fail(`${tag} was not deleted`) }
    useEm.setState(st => ({ instances: withoutKeys(st.instances, [tag]), cmInstances: withoutKeys(st.cmInstances, [tag, ...children]),
      deployed: withoutKeys(st.deployed, [tag]), runtime: withoutKeys(st.runtime, [tag]) }))
    useLibrary.setState(l => ({ assignments: withoutKeys(l.assignments, [tag, ...children]) }))
    set({ contained: withoutKeys(s.contained, [tag, ...children]), cellMembers: withoutKeys(s.cellMembers, [tag]), dc: withoutKeys(s.dc, gone),
      units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => [k, u.blocks && Object.values(u.blocks).includes(tag) ?
        { ...u, blocks: Object.fromEntries(Object.entries(u.blocks).map(([b, t]) => [b, t === tag ? null : t])) } : u])) })
    log(tag, isEm ? `Equipment module deleted with ${children.join(', ')}` : 'Control Module deleted')
    return ok(tag)
  },
  unassignModule: tag => {
    const lib = useLibrary.getState()
    const ctl = lib.assignments[tag]
    if (!ctl) return fail(`${tag} is not assigned to a controller`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Delete assignment of ${tag}`)) return fail('Requires the Can Configure key')
    const tags = withEmChildren([tag]).filter(t => lib.assignments[t] === ctl)
    useLibrary.setState(l => ({ assignments: withoutKeys(l.assignments, tags), deployed: withoutKeys(l.deployed, tags) }))
    useEm.setState(st => ({ deployed: withoutKeys(st.deployed, tags) }))
    log(tag, `Assignment to ${ctl} deleted`)
    return ok(tag)
  },
  setModuleDescription: (tag, description) => {
    const em = useEm.getState()
    const m = useStore.getState().modules[tag]
    if (!m && !em.instances[tag]) return fail(`${tag} does not exist`)
    if (!requireUnlockedLock('CAN_CONFIGURE', `Configure course module ${tag}`)) return fail('Requires the Can Configure key')
    if (m) useStore.setState(st => ({ modules: { ...st.modules, [tag]: { ...st.modules[tag], description } as AnyModule } }))
    else useEm.setState(st => ({ instances: { ...st.instances, [tag]: { ...st.instances[tag], description } } }))
    log(tag, `Description changed to "${description}"`)
    return ok(tag)
  },
  setTwoStage: (tag, position) => {
    const m = useStore.getState().modules[tag]
    if (m?.type !== 'VALVE' || !m.twoStage) return fail(`${tag} is not a two stage valve`)
    const remote = get().dc[tag]
    if (remote?.mode === 'CAS') return fail(`${tag} is in CAS; its equipment module or phase owns the setpoint. Put it in AUTO to operate it from the faceplate.`)
    if (!requireUnlockedLock('CONTROL', `Command two stage valve ${tag} ${position}`)) return fail('Requires the Control key')
    useStore.setState(st => ({ modules: { ...st.modules, [tag]: { ...m, commandedOpen: position !== 'CLOSE', bulk: position === 'BULK' } } }))
    log(tag, `Operator command: ${position}`, 'BATCH')
    return ok(position)
  },
  setDeviceMode: (tag, mode) => {
    const m = useStore.getState().modules[tag]
    if (m?.type !== 'VALVE' && m?.type !== 'MOTOR') return fail(`${tag} is not a valve or motor`)
    const cur = get().dc[tag] ?? { mode: 'AUTO', casSp: (m.type === 'VALVE' ? m.commandedOpen : m.commanded) ? (m.type === 'VALVE' && m.twoStage && m.bulk ? 2 : 1) : 0 }
    if (cur.mode === mode) return ok(mode)
    if (!requireUnlockedLock('CONTROL', `Command target mode of ${tag} ${mode}`)) return fail('Requires the Control key')
    // Bumpless: entering CAS keeps the current command as CAS_SP; leaving CAS keeps the device where it is.
    const casSp = mode === 'CAS' ? ((m.type === 'VALVE' ? m.commandedOpen : m.commanded) ? (m.type === 'VALVE' && m.twoStage && m.bulk ? 2 : 1) : 0) : cur.casSp
    set(s => ({ dc: { ...s.dc, [tag]: { mode, casSp } } }))
    log(tag, `MODE.TARGET changed from ${cur.mode} to ${mode}`, 'BATCH')
    return ok(mode)
  },

  step: dt => {
    for (const tag of Object.keys(get().dc)) applyRemote(tag)
    useEm.getState().stepEms(dt)
    for (const key of Object.keys(get().active)) {
      const s = get()
      const a = s.active[key]
      const dep = s.deployedUnits[a.unit]
      if (!dep || !dep.logic[a.phase] || !controllerUp(dep.controller)) continue
      const before = a.rt.state
      const rt = stepPhase(a.rt, dep.logic[a.phase], phaseEnv(key), dt)
      const cur = get().active[key]
      if (!cur) continue
      // Writes made by the logic during this scan (report parameters) live on cur.rt.params.
      useBatch.setState(st => ({ active: { ...st.active, [key]: { ...cur, rt: { ...rt, params: { ...cur.rt.params, ...diffParams(a.rt.params, rt.params) } } } } }))
      if (rt.state !== before) log(key, `Phase state ${STATE_LABEL[rt.state]}${rt.failIndex !== 'OK' && before !== rt.state && rt.message ? ` (failure: ${rt.message})` : ''}`, 'BATCH')
    }
  }
}))

function diffParams(before: Record<string, Value>, after: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k] !== v))
}

export function containedIn(unit: string): string[] {
  return Object.entries(useBatch.getState().contained).filter(([, u]) => u === unit).map(([t]) => t).sort()
}

export function categoriesOf(kind: BatchClassKind): BatchCategory[] {
  return Object.values(useBatch.getState().categories).filter(c => c.kind === kind)
}

export { COMPOSITES, catKey }

/** Equipment module tags expanded with the child control modules they own. */
export function withEmChildren(tags: string[]): string[] {
  const em = useEm.getState()
  return [...new Set(tags.flatMap(t => [t, ...Object.values(em.instances[t]?.children ?? {})]))]
}

/** After a module rename: controller assignments, unit containment, process cell members, alias paths, unit blocks, cascade remote state. */
function renameRefs(from: string, to: string): void {
  const swap = <T,>(r: Record<string, T>): Record<string, T> => (from in r ? { ...withoutKeys(r, [from]), [to]: r[from] } : r)
  useLibrary.setState(l => ({ assignments: swap(l.assignments) }))
  useBatch.setState(s => ({
    contained: swap(s.contained), cellMembers: swap(s.cellMembers), dc: swap(s.dc),
    units: Object.fromEntries(Object.entries(s.units).map(([k, u]) => {
      const aliases = Object.fromEntries(Object.entries(u.aliases).map(([a, r]) => {
        const head = r.path.split('/')[0]
        return [a, head === from ? { ...r, path: to + r.path.slice(from.length) } : r]
      }))
      const blocks = u.blocks ? Object.fromEntries(Object.entries(u.blocks).map(([b, t]) => [b, t === from ? to : t])) : u.blocks
      return [k, { ...u, aliases, blocks }]
    }))
  }))
}

// Equipment modules run against the same module I/O as unit phases (valves and motors in CAS).
emIo.current = {
  read: (path: string) => readModule(path),
  write: (path: string, value: Value) => { writeModule(path, value); const m = splitModulePath(path)?.module; if (m) applyRemote(m) },
  named: (set: string, state: string) => namedValue(set, state),
  log: (tag: string, text: string) => log(tag, text, 'BATCH')
}
emClassUsers.push(cls => Object.values(useBatch.getState().unitClasses).filter(u => Object.values(u.modules ?? {}).some(b => b.kind === 'em' && b.className === cls)).map(u => u.name))
emClassRenamed.push((from, to) => useBatch.setState(s => ({ unitClasses: Object.fromEntries(Object.entries(s.unitClasses).map(([k, u]) => [k, u.modules ?
  { ...u, modules: Object.fromEntries(Object.entries(u.modules).map(([b, m]) => [b, m.kind === 'em' && m.className === from ? { ...m, className: to } : m])) } : u])) })))
libraryHooks.reset.push(() => useEm.getState().resetEm())
libraryHooks.areaTags.push(area => Object.values(useEm.getState().instances).filter(i => i.area === area).map(i => i.tag))
libraryHooks.controllerDownload.push(controller => {
  const lib = useLibrary.getState()
  const em = useEm.getState()
  const tags = Object.keys(em.instances).filter(t => lib.assignments[t] === controller).sort()
  return { downloaded: tags, warnings: tags.flatMap(t => deployEm(t, controller)) }
})

libraryHooks.reset.push(() => useBatch.getState().resetBatch())
libraryHooks.controllerDownload.push(controller => {
  const s = useBatch.getState()
  const downloaded: string[] = []
  const warnings: string[] = []
  const deployed = { ...s.deployedUnits }
  for (const [unit, ctl] of Object.entries(s.unitAssignments)) {
    if (ctl !== controller || !s.units[unit]) continue
    const busy = Object.values(s.active).find(a => a.unit === unit && !['IDLE', 'COMPLETE', 'STOPPED', 'ABORTED'].includes(a.rt.state))
    if (busy) { warnings.push(`${unit}: not downloaded while ${busy.phase} is ${STATE_LABEL[busy.rt.state]}`); continue }
    warnings.push(...unitWarnings(s, s.units[unit]))
    deployed[unit] = snapshot(s, s.units[unit], controller)
    downloaded.push(unit)
  }
  useBatch.setState({ deployedUnits: deployed })
  return { downloaded, warnings }
})

useStore.subscribe((state, previous) => {
  const dt = (state.time - previous.time) / 1000
  if (dt > 0 && dt < 5) useBatch.getState().step(dt)
})
