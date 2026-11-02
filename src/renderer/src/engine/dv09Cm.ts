import { create } from 'zustand'
import { useStore } from './store'
import { useLibrary, libraryHooks } from './libraryStore'
import { requireUnlockedKey } from './security'
import { moduleNameError } from './naming'
import { controllerIsDown } from './hardware'
import { findDst } from './traditionalIo'
import { usePictures } from './pictureStore'
import type { AnyModule, DiscreteInput, DiscreteOutput } from './types'

// Course DV-09 chapter 3 (DeltaV Control Modules): the Explorer / Control Studio authoring flow of a discrete module.
// A module is created empty (New > Control Module), gets its DO / DI block from the palette (or comes from the DISCRETE
// module template), is configured, assigned to a node, saved and downloaded. The running module lives in useStore.modules
// (type DO / DI) so alarms, faceplates, pictures and the I/O simulation work unchanged; this store holds the authoring state.

export type Dv09BlockType = 'DO' | 'DI'
export interface Dv09Block { name: string; type: Dv09BlockType }
export interface Dv09Cm {
  tag: string
  description: string
  area: string
  blocks: Dv09Block[]
  /** Module template the module was copied from (the DISCRETE template of Library > Module Templates > Monitoring). */
  template?: string
  /** Parameter window "Filtered by" selections (Control Studio): which parameter groups are listed. */
  filters: string[]
  /** Configuration signature at the last Save and at the last Download to the controller. */
  saved?: string
  deployed?: string
}

export const DV09_FILTER_GROUPS = ['Quick Configuration', 'Common Configuration', 'All Parameters'] as const
export const DV09_DISCRETE_TEMPLATE = 'DISCRETE'

interface CmState {
  cms: Record<string, Dv09Cm>
}

export const useDv09Cm = create<CmState>(() => ({ cms: {} }))

const setCms = (fn: (cms: Record<string, Dv09Cm>) => Record<string, Dv09Cm>): void => {
  useDv09Cm.setState(st => ({ cms: fn(st.cms) }))
  useStore.setState(s => ({ rev: s.rev + 1 }))
}
const log = (tag: string, description: string, category: 'CONFIGURE' | 'OPERATOR' | 'DIAGNOSTIC' = 'CONFIGURE'): void =>
  useStore.getState().logEvent(category, tag, description)
const fail = (tag: string, message: string): string => {
  log(tag, message, 'DIAGNOSTIC')
  if (typeof window !== 'undefined') window.alert(message)
  return message
}

const patchModule = (tag: string, patch: Partial<DiscreteOutput> | Partial<DiscreteInput>): void =>
  useStore.setState(s => s.modules[tag] ? { modules: { ...s.modules, [tag]: { ...s.modules[tag], ...patch } as AnyModule }, rev: s.rev + 1 } : {})

export const dv09Module = (tag: string): DiscreteOutput | DiscreteInput | undefined => {
  const m = useStore.getState().modules[tag]
  return m?.type === 'DO' || m?.type === 'DI' ? m : undefined
}

/** True when the object name is free in this database. */
export function nameInUse(tag: string): boolean {
  const s = useStore.getState()
  const lib = useLibrary.getState()
  return !!(s.modules[tag] || s.sfcs[tag] || s.equipment[tag] || useDv09Cm.getState().cms[tag] || lib.instances[tag] || lib.sims[tag])
}

/** Right-click a plant area > New > Control Module: an empty module named by the Object name. Returns an error message or null. */
export function createBlankModule(name: string, area: string, description = ''): string | null {
  const tag = name.trim().toUpperCase()
  const s = useStore.getState()
  const error = moduleNameError(tag) ?? (nameInUse(tag) ? `Module ${tag} already exists` : !s.areas.includes(area) ? `Area ${area} does not exist` : null)
  if (error) return fail(tag || name, `Module creation rejected: ${error}`)
  if (!requireUnlockedKey('CAN_CONFIGURE', `Create module ${tag}`)) return 'Requires the Can Configure key'
  setCms(cms => ({ ...cms, [tag]: { tag, description: description.trim(), area, blocks: [], filters: [] } }))
  log(tag, 'Module created')
  return null
}

const blockName = (type: Dv09BlockType): string => `${type}1`

/** Drag and drop Discrete Output / Discrete Input from the IO palette onto an empty module. */
export function addBlock(tag: string, type: Dv09BlockType): string | null {
  const cm = useDv09Cm.getState().cms[tag]
  if (!cm) return fail(tag, `${tag} is not a module created in DeltaV Explorer`)
  if (cm.blocks.length) return fail(tag, `${tag} already contains the ${cm.blocks[0].name} block`)
  if (!requireUnlockedKey('CAN_CONFIGURE', `Configure ${tag}`)) return 'Requires the Can Configure key'
  if (!useStore.getState().createModule({ tag, type, description: cm.description || tag, area: cm.area })) return 'The module could not be created (see the Event Journal)'
  patchModule(tag, type === 'DO' ? { downloaded: false, modeTarget: 'CAS', mode: 'AUTO' } : { downloaded: false, mode: 'AUTO' })
  setCms(cms => ({ ...cms, [tag]: { ...cm, blocks: [{ name: blockName(type), type }] } }))
  log(tag, `${type === 'DO' ? 'Discrete Output' : 'Discrete Input'} block ${blockName(type)} added`)
  return null
}

/** Library > Module Templates > Monitoring > DISCRETE dropped on a plant area: a copy named DISCRETE (DISCRETE1 ... when taken). */
export function createFromTemplate(template: string, area: string): { tag: string } | { error: string } {
  if (template !== DV09_DISCRETE_TEMPLATE) return { error: `Module template ${template} is not modeled; use Library > Module Templates > Monitoring > DISCRETE` }
  const s = useStore.getState()
  if (!s.areas.includes(area)) return { error: fail(template, `Area ${area} does not exist`) }
  let tag = template
  for (let n = 1; nameInUse(tag); n++) tag = `${template}${n}`
  if (!requireUnlockedKey('CAN_CONFIGURE', `Create module ${tag}`)) return { error: 'Requires the Can Configure key' }
  if (!s.createModule({ tag, type: 'DI', description: 'Discrete monitoring', area })) return { error: 'The module could not be created (see the Event Journal)' }
  useStore.setState(st => {
    const m = st.modules[tag] as DiscreteInput
    const alarm = { type: 'HI' as const, label: 'DISCRETE', priority: 'WARNING' as const, enabled: true }
    return { modules: { ...st.modules, [tag]: { ...m, downloaded: false, mode: 'AUTO', alarmOnValue: true, alarms: [alarm] } as DiscreteInput }, rev: st.rev + 1 }
  })
  useDv09Cm.setState(st => ({ cms: { ...st.cms, [tag]: { tag, description: 'Discrete monitoring', area, template, blocks: [{ name: 'DI1', type: 'DI' }], filters: [] } } }))
  log(tag, `Module created from template ${template}`)
  return { tag }
}

/** Rename a module in the Explorer (right-click > Rename). Moves every reference to it. */
export function renameModule(oldTag: string, next: string): string | null {
  const tag = next.trim().toUpperCase()
  const cm = useDv09Cm.getState().cms[oldTag]
  if (!cm) return fail(oldTag, `${oldTag} cannot be renamed here`)
  if (tag === oldTag) return null
  const error = moduleNameError(tag) ?? (nameInUse(tag) ? `The name ${tag} is already used` : null)
  if (error) return fail(oldTag, `Rename rejected: ${error}`)
  if (!requireUnlockedKey('CAN_CONFIGURE', `Rename course module ${oldTag}`)) return 'Requires the Can Configure key'
  const rekey = <T,>(r: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!r || !(oldTag in r)) return r
    const out = { ...r }
    out[tag] = out[oldTag]
    delete out[oldTag]
    return out
  }
  useStore.setState(s => {
    const modules = { ...s.modules }
    if (modules[oldTag]) { modules[tag] = { ...modules[oldTag], tag } as AnyModule; delete modules[oldTag] }
    return {
      modules,
      hardware: { ...s.hardware, discreteBindings: rekey(s.hardware.discreteBindings) },
      alarms: s.alarms.map(a => a.moduleTag === oldTag ? { ...a, moduleTag: tag } : a),
      rev: s.rev + 1
    }
  })
  const lib = useLibrary.getState()
  if (lib.assignments[oldTag]) useLibrary.setState({ assignments: rekey(lib.assignments) as Record<string, string> })
  usePictures.setState(ps => ({ pictures: Object.fromEntries(Object.entries(ps.pictures).map(([name, p]) => [name,
    { ...p, elements: p.elements.map(e => e.tag === oldTag ? { ...e, tag } : e) }])) }))
  setCms(cms => {
    const out = { ...cms }
    out[tag] = { ...out[oldTag], tag }
    delete out[oldTag]
    return out
  })
  log(tag, `Module renamed from ${oldTag}`)
  return null
}

/** What Save stores and Download sends: the configuration of the module (the controller assignment is part of it). */
export function signatureFor(s: ReturnType<typeof useStore.getState>, assignments: Record<string, string>, cm: Dv09Cm | undefined): string {
  if (!cm) return ''
  const m = s.modules[cm.tag]
  const doModule = m?.type === 'DO' ? m : undefined
  const diModule = m?.type === 'DI' ? m : undefined
  const alarm = diModule?.alarms.find(a => a.type === 'HI')
  return JSON.stringify({
    description: cm.description, area: cm.area, blocks: cm.blocks.map(b => b.name),
    ioDst: s.hardware.discreteBindings?.[cm.tag] ?? '', modeTarget: doModule?.modeTarget ?? null,
    alarmOn: diModule ? diModule.alarmOnValue ?? true : null, alarmEnabled: alarm ? alarm.enabled : null,
    primary: m && 'primaryDisplay' in m ? m.primaryDisplay ?? '' : '', detail: m && 'detailDisplay' in m ? m.detailDisplay ?? '' : '',
    controller: assignments[cm.tag] ?? ''
  })
}

export const cmSignature = (tag: string): string => signatureFor(useStore.getState(), useLibrary.getState().assignments, useDv09Cm.getState().cms[tag])

export const cmDirty = (cm: Dv09Cm): boolean => cm.saved !== cmSignature(cm.tag)
/** Blue download triangle: the configuration differs from what the controller runs. */
export const cmNeedsDownload = (cm: Dv09Cm): boolean => cm.deployed !== cmSignature(cm.tag)

export function setFilters(tag: string, filters: string[]): string | null {
  if (!useDv09Cm.getState().cms[tag]) return `${tag} is not a module created in DeltaV Explorer`
  setCms(cms => ({ ...cms, [tag]: { ...cms[tag], filters: DV09_FILTER_GROUPS.filter(g => filters.includes(g)) } }))
  return null
}

/** IO_OUT / IO_IN: the DST of the card channel the block reads or writes. */
export function setIoDst(tag: string, dst: string): string | null {
  if (!useDv09Cm.getState().cms[tag]?.blocks.length) return fail(tag, `${tag} has no I/O block yet; drag Discrete Output or Discrete Input from the IO palette`)
  return useStore.getState().bindDiscreteDst(tag, dst) ? null : 'The DST was not bound (see the Event Journal)'
}

export function setModeTarget(tag: string, target: 'CAS' | 'AUTO' | 'MAN' | 'OOS'): string | null {
  const m = useStore.getState().modules[tag]
  if (m?.type !== 'DO') return fail(tag, 'MODE target applies to the Discrete Output block')
  if (!['CAS', 'AUTO', 'MAN', 'OOS'].includes(target)) return fail(tag, `Unknown mode ${target}`)
  if (!requireUnlockedKey('CAN_CONFIGURE', `Configure ${tag}`)) return 'Requires the Can Configure key'
  patchModule(tag, { modeTarget: target, mode: target === 'OOS' ? 'OOS' : 'AUTO' })
  log(tag, `DO1/MODE target set to ${target}`)
  return null
}

/** The Discrete Alarm of a DISCRETE module: alarm on a value of 0 or 1. */
export function setDiscreteAlarm(tag: string, onValue: boolean, enabled?: boolean): string | null {
  const m = useStore.getState().modules[tag]
  if (m?.type !== 'DI') return fail(tag, 'The Discrete Alarm belongs to a discrete input module')
  const alarm = m.alarms.find(a => a.type === 'HI')
  return useStore.getState().configureDiscreteAlarm(tag, onValue, enabled ?? alarm?.enabled ?? true) ? null : 'The alarm was not changed (see the Event Journal)'
}

/** Module Properties > Displays: the primary control display (a picture name such as Tank101) and optionally the detail display. */
export function setPrimaryDisplay(tag: string, name: string, detail?: string): string | null {
  if (!useDv09Cm.getState().cms[tag]) return fail(tag, `${tag} is not a module created in DeltaV Explorer`)
  if (!dv09Module(tag)) return fail(tag, `${tag} has no block yet; add Discrete Output or Discrete Input first`)
  if (!requireUnlockedKey('CAN_CONFIGURE', `Assign module displays ${tag}`)) return 'Requires the Can Configure key'
  patchModule(tag, { primaryDisplay: name.trim() || undefined, ...(detail === undefined ? {} : { detailDisplay: detail.trim() || undefined }) })
  log(tag, `Primary control display set to ${name.trim() || '(none)'}`)
  return null
}

/** Assign to Node button / right-click Assign to controller. */
export function assignToNode(tag: string, controller: string): string | null {
  if (!dv09Module(tag)) return fail(tag, `${tag} has no block yet; add Discrete Output or Discrete Input before assigning it to a node`)
  const r = useLibrary.getState().assignModule(tag, controller)
  return r.ok ? null : r.error
}

/** Save button: stores the current configuration. */
export function saveModule(tag: string): string | null {
  const cm = useDv09Cm.getState().cms[tag]
  if (!cm) return `${tag} is not a module created in DeltaV Explorer`
  if (!requireUnlockedKey('CAN_CONFIGURE', `Save module configuration ${tag}`)) return 'Requires the Can Configure key'
  const signature = cmSignature(tag)
  setCms(cms => ({ ...cms, [tag]: { ...cms[tag], saved: signature } }))
  log(tag, 'Module saved')
  return null
}

/** Download button (Control Studio) or Download > Control Module in the Explorer. */
export function downloadModule(tag: string): string | null {
  const cm = useDv09Cm.getState().cms[tag]
  if (!cm || !dv09Module(tag)) return fail(tag, `${tag} has no block; there is nothing to download`)
  const controller = useLibrary.getState().assignments[tag]
  if (!controller) return fail(tag, `${tag} is not assigned to a controller; use the Assign to Node button first`)
  const c = useStore.getState().hardware.controllers[controller]
  if (!c || !c.commissioned || controllerIsDown(c)) return fail(tag, `Controller ${controller} is not available`)
  if (cmDirty(cm)) return fail(tag, `Save ${tag} before downloading it`)
  if (!requireUnlockedKey('CAN_DOWNLOAD', `Download module ${tag}`)) return 'Requires the Can Download key'
  deploy(tag, controller)
  log(tag, `Module downloaded to ${controller}`)
  return null
}

function deploy(tag: string, controller: string): void {
  const signature = cmSignature(tag)
  patchModule(tag, { downloaded: true, controllerTag: controller })
  setCms(cms => ({ ...cms, [tag]: { ...cms[tag], deployed: signature } }))
}

/** On-line view: write SP_D of the DO block. Only a downloaded module whose mode is AUTO (or MAN) accepts it. */
export function writeSpD(tag: string, value: 0 | 1): string | null {
  const m = useStore.getState().modules[tag]
  if (m?.type !== 'DO') return fail(tag, `${tag} has no DO1 block`)
  if (!requireUnlockedKey('CONTROL', `Toggle ${tag}`)) return 'Requires the Control key'
  if (m.downloaded === false) return fail(tag, `${tag} is not downloaded; download it before writing SP_D`)
  if (m.modeTarget === 'CAS' || m.modeTarget === 'OOS' || m.mode === 'OOS') return fail(tag, `${tag}/DO1/SP_D cannot be written: the MODE target is ${m.modeTarget ?? m.mode}, not AUTO`)
  patchModule(tag, { commanded: value === 1 })
  if (!useStore.getState().hardware.discreteBindings?.[tag]) patchModule(tag, { state: value === 1 })
  log(tag, `${tag}/DO1/SP_D set to ${value}`, 'OPERATOR')
  return null
}

/** Controller total download deploys every saved module assigned to it. */
libraryHooks.controllerDownload.push(controller => {
  const downloaded: string[] = []
  const warnings: string[] = []
  const assignments = useLibrary.getState().assignments
  for (const cm of Object.values(useDv09Cm.getState().cms)) {
    if (assignments[cm.tag] !== controller || !dv09Module(cm.tag)) continue
    if (cmDirty(cm)) { warnings.push(`${cm.tag} has unsaved changes; the saved configuration was not downloaded`); continue }
    deploy(cm.tag, controller)
    downloaded.push(cm.tag)
  }
  return { downloaded, warnings }
})

libraryHooks.reset.push(() => useDv09Cm.setState({ cms: {} }))

/** Event Journal evidence of what the student did in Control Studio (launch, On-Line view, block selection). */
export const studioOpened = (tag: string): void => log(tag, 'Control Studio opened', 'DIAGNOSTIC')
export const studioOnline = (tag: string): void => log(tag, 'On-Line view selected in Control Studio', 'DIAGNOSTIC')
export const studioBlockSelected = (tag: string, block: string): void => log(tag, `${block} function block selected in Control Studio`, 'DIAGNOSTIC')

// Evidence for "Card 4 Channel 1 is on" and "XV-101's output manipulates XVSTAT-101's input": the first scan in which a
// downloaded DO module drives its card channel high, and every change of a downloaded DI module's value, is logged.
const channelOn = new Set<string>()
const inputState = new Map<string, boolean>()
useStore.subscribe(s => {
  for (const cm of Object.values(useDv09Cm.getState().cms)) {
    const m = s.modules[cm.tag]
    const dst = s.hardware.discreteBindings?.[cm.tag]
    if (m?.type === 'DI' && dst && m.downloaded && !m.ioBad) {
      const before = inputState.get(cm.tag)
      inputState.set(cm.tag, m.state)
      if (before !== undefined && before !== m.state) log(cm.tag, `${cm.tag}/DI1/PV_D changed to ${m.state ? 1 : 0} (${dst})`, 'DIAGNOSTIC')
      continue
    }
    if (m?.type === 'DI') inputState.delete(cm.tag)
    if (m?.type !== 'DO' || !dst) continue
    const target = findDst(s.hardware, dst)
    const on = !!target && target.channel.value !== 0 && !target.channel.bad
    if (on && !channelOn.has(cm.tag)) {
      channelOn.add(cm.tag)
      const where = `${target!.card.id.split('/').pop()} CH${String(target!.channel.channel).padStart(2, '0')}`
      log(cm.tag, `${cm.tag}/DO1/OUT_D: card ${target!.card.slot} channel ${target!.channel.channel} (${dst}, ${where}) is on`, 'DIAGNOSTIC')
    } else if (!on) channelOn.delete(cm.tag)
  }
})
