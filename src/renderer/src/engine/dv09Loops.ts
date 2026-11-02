import { useStore } from './store'
import { useLibrary } from './libraryStore'
import { requireUnlockedKey } from './security'
import { moduleNameError } from './naming'
import { findDst } from './traditionalIo'
import { conditionSourceError } from './fbCondition'
import { materializeMotorStrategy, motorTemplateStrategy } from './motorStrategy'
import { aoConfigurationError } from './standaloneAo'
import {
  useDv09Cm, cmExtensions, fail, log, patchModule, setCmsPatch, nameInUse, createFromTemplate as createDiscreteFromTemplate, dv09Module,
  type Dv09Cm, type Dv09Block
} from './dv09Cm'
import type { AlarmLimit, AlarmPriority, AlarmType, AnalogIndicator, AnalogOutputModule, AnyModule, FunctionBlockModule, MotorModule, PidModule } from './types'

// Course DV-09 chapters 4-6: the Explorer / Control Studio authoring of an Analog Output (LEVEL-101), an Analog Input module from the
// ANALOG template (LI-101), a motor from MTR-11_ILOCK (MTR-102) and a regulatory loop from PID_LOOP (FIC-102). The running modules
// are the BatchLive AO / AI / MOTOR / PID modules (engine/store.ts); this file is the authoring layer on top of them, like dv09Cm.ts is
// for the discrete modules: a new module is undownloaded, configuration changes are saved and downloaded as a whole.

export const LOOP_TEMPLATES = ['ANALOG', 'MTR-11_ILOCK', 'PID_LOOP'] as const
export type LoopTemplate = typeof LOOP_TEMPLATES[number]
export type LoopBlockType = 'AO' | 'AI'
export const isLoopTemplate = (name: string): name is LoopTemplate => (LOOP_TEMPLATES as readonly string[]).includes(name)

/** The block types that open in the analog / motor / loop Control Studio. */
export const LOOP_BLOCK_TYPES = ['AO', 'AI', 'DC', 'PID']
export const isLoopCm = (cm: Dv09Cm | undefined): boolean => !!cm && cm.blocks.some(b => LOOP_BLOCK_TYPES.includes(b.type))

const cmOf = (tag: string): Dv09Cm | undefined => useDv09Cm.getState().cms[tag]
const state = () => useStore.getState()
const configure = (action: string): boolean => requireUnlockedKey('CAN_CONFIGURE', action)
const bump = (): void => useStore.setState(s => ({ rev: s.rev + 1 }))

/** The alarm detection parameters of an analog block, with the alarm name and alarm word the Block Alarms dialog shows. */
export const ALARM_NAMES: Partial<Record<AlarmType, { name: string; word: string; type: string }>> = {
  HI_HI: { name: 'HI_HI_ALM', word: 'HIHI', type: 'High High Alarm' },
  HI: { name: 'HI_ALM', word: 'HIGH', type: 'High Alarm' },
  LO: { name: 'LO_ALM', word: 'LOW', type: 'Low Alarm' },
  LO_LO: { name: 'LO_LO_ALM', word: 'LOLO', type: 'Low Low Alarm' }
}
export const ALARM_ORDER: AlarmType[] = ['HI', 'HI_HI', 'LO', 'LO_LO']
const priorityFor = (type: AlarmType): AlarmPriority => (type === 'HI_HI' || type === 'LO_LO' ? 'CRITICAL' : 'WARNING')

/** Alarm message of the Block Alarms dialog: "High Alarm Value 0 Limit 950". */
export function alarmMessage(alarm: AlarmLimit): string {
  const info = ALARM_NAMES[alarm.type]
  return `${info?.type ?? alarm.label} Value 0 Limit ${alarm.limit ?? ''}`
}

const templateAlarms = (low: number, high: number, enabled: { HI: boolean; LO: boolean }): AlarmLimit[] => [
  { type: 'HI', label: 'HI', priority: priorityFor('HI'), limit: high, enabled: enabled.HI },
  { type: 'LO', label: 'LO', priority: priorityFor('LO'), limit: low, enabled: enabled.LO },
  { type: 'HI_HI', label: 'HI_HI', priority: priorityFor('HI_HI'), limit: high, enabled: false },
  { type: 'LO_LO', label: 'LO_LO', priority: priorityFor('LO_LO'), limit: low, enabled: false }
]

const inheritedFilters = (): string[] => Object.values(useDv09Cm.getState().cms).find(c => c.filters.length)?.filters ?? ['Quick Configuration', 'Common Configuration']

function uniqueTemplateName(template: string): string {
  let tag = template
  for (let n = 1; nameInUse(tag); n++) tag = `${template}${n}`
  return tag
}

/**
 * Library > Module Templates dropped on a plant area: ANALOG (an AI1 block with HI and LO alarms), MTR-11_ILOCK (a DC1 block with the CND1 / CND2 /
 * BFI1 / OR1 / NOT1 / AND1 interlock blocks) and PID_LOOP (AI1 > PID1 > AO1). DISCRETE keeps the chapter 3 behavior.
 */
export function createFromTemplate(template: string, area: string): { tag: string } | { error: string } {
  if (template === 'DISCRETE') return createDiscreteFromTemplate(template, area)
  if (!isLoopTemplate(template)) return { error: `Module template ${template} is not modeled; use ANALOG, DISCRETE, MTR-11_ILOCK or PID_LOOP` }
  const s = state()
  if (!s.areas.includes(area)) return { error: fail(template, `Area ${area} does not exist`) }
  const tag = uniqueTemplateName(template)
  if (!configure(`Create module ${tag}`)) return { error: 'Requires the Can Configure key' }
  const type = template === 'ANALOG' ? 'AI' : template === 'PID_LOOP' ? 'PID' : 'MOTOR'
  const description = template === 'ANALOG' ? 'Analog monitoring' : template === 'PID_LOOP' ? 'PID loop' : 'Two-state motor with interlock'
  if (!s.createModule({ tag, type, description, area, unit: type === 'MOTOR' ? undefined : '%', pvMin: 0, pvMax: 100 })) return { error: 'The module could not be created (see the Event Journal)' }
  let blocks: Dv09Block[]
  if (template === 'ANALOG') {
    patchModule(tag, { downloaded: false, pv: 0, alarms: templateAlarms(0, 100, { HI: true, LO: true }) })
    blocks = [{ name: 'AI1', type: 'AI' }]
  } else if (template === 'PID_LOOP') {
    patchModule(tag, {
      templateId: 'PID_LOOP', downloaded: false, gain: 1, reset: 10, rate: 0, direct: true, outputAction: 'DECREASE_TO_OPEN', sp: 50, out: 50,
      alarms: templateAlarms(0, 100, { HI: false, LO: false })
    })
    blocks = [{ name: 'AI1', type: 'AI' }, { name: 'PID1', type: 'PID' }, { name: 'AO1', type: 'AO' }]
  } else {
    const strategy = motorTemplateStrategy(tag)
    for (const name of ['CND1', 'CND2']) strategy[name] = { ...strategy[name], description: '', expr: 'IN1 != 0', delaySec: 0, in1: { kind: 'const', value: 0 } }
    patchModule(tag, {
      templateId: 'MTR-11_ILOCK', downloaded: false, ownedBlocks: materializeMotorStrategy(tag, area, strategy),
      interlockSource: `${tag}/NOT1`, interlockInverted: true, permissiveSource: `${tag}/AND1`, permissiveRequired: true, permissiveOk: false,
      ioInputBad: true, ioOutputBad: true, passiveOnTimeout: true, spTrack: true, resetRequired: false, tripEnabled: false
    })
    blocks = [{ name: 'DC1', type: 'DC' }, ...['CND1', 'CND2', 'BFI1', 'OR1', 'NOT1', 'AND1'].map(name => ({ name, type: name.replace(/\d+$/, '') as Dv09Block['type'] }))]
  }
  const loop: Dv09Cm['loop'] = template === 'MTR-11_ILOCK' ? { passiveWhenConfirmed: false, interlockOption: true, detailDefault: 'ILOCK16_DETAIL' } : undefined
  useDv09Cm.setState(st => ({ cms: { ...st.cms, [tag]: { tag, description, area, template, blocks, filters: inheritedFilters(), ...(loop ? { loop } : {}) } } }))
  if (template === 'MTR-11_ILOCK') patchModule(tag, { detailDisplay: 'ILOCK16_DETAIL' })
  log(tag, `Module created from template ${template}`)
  return { tag }
}

/** Control Studio IO palette: Analog Output / Analog Input dropped on an empty module (LEVEL-101). */
export function addLoopBlock(tag: string, type: LoopBlockType): string | null {
  const cm = cmOf(tag)
  if (!cm) return fail(tag, `${tag} is not a module created in DeltaV Explorer`)
  if (cm.blocks.length) return fail(tag, `${tag} already contains the ${cm.blocks[0].name} block`)
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  const s = state()
  if (!s.createModule({ tag, type, description: cm.description || tag, area: cm.area, unit: '%', pvMin: 0, pvMax: 100 })) return 'The module could not be created (see the Event Journal)'
  patchModule(tag, type === 'AO' ? { downloaded: false } : { downloaded: false, pv: 0, alarms: templateAlarms(0, 100, { HI: true, LO: true }) })
  setCmsPatch(tag, { blocks: [{ name: `${type}1`, type }], filters: cm.filters.length ? cm.filters : inheritedFilters() })
  log(tag, `${type === 'AO' ? 'Analog Output' : 'Analog Input'} block ${type}1 added`)
  return null
}

const reject = (tag: string, text: string): string => fail(tag, text)
const analog = (tag: string): AnalogOutputModule | AnalogIndicator | PidModule | undefined => {
  const m = state().modules[tag]
  return m?.type === 'AO' || m?.type === 'AI' || m?.type === 'PID' ? m : undefined
}

/** IO_OUT / IO_IN (analog and PID) or IO_IN_1 / IO_OUT_1 (device): the DST of the card channel. An empty value clears the reference. */
export function setLoopIo(tag: string, port: 'IO_IN' | 'IO_OUT' | 'IO_IN_1' | 'IO_OUT_1', dst: string): string | null {
  const cm = cmOf(tag)
  const m = state().modules[tag]
  if (!cm || !m) return reject(tag, `${tag} has no function block yet; drag a block from the IO palette first`)
  const ok = m.type === 'MOTOR'
    ? useStore.getState().bindDeviceDst(tag, port === 'IO_IN_1' ? 'input' : 'output', dst)
    : useStore.getState().bindAnalogDst(tag, port === 'IO_IN' ? 'input' : 'output', dst)
  return ok ? null : 'The DST was not bound (see the Event Journal)'
}

export interface Scale { low: number; high: number; unit: string }
export const loopScale = (m: AnyModule | undefined): Scale | null => (m?.type === 'AO' || m?.type === 'AI' || m?.type === 'PID' ? { low: m.pvMin, high: m.pvMax, unit: m.unit } : null)

/** PV_SCALE (AO, PID) / OUT_SCALE (AI): the engineering range and unit. */
export function setScale(tag: string, scale: Scale): string | null {
  const m = analog(tag)
  if (!m || !cmOf(tag)) return reject(tag, `${tag} has no analog block yet`)
  if (![scale.low, scale.high].every(Number.isFinite) || scale.low >= scale.high) return reject(tag, 'The scale needs finite values with the low value below the high value')
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  if (m.type === 'AO') {
    const error = aoConfigurationError(m, { pvMin: scale.low, pvMax: scale.high })
    if (error) return reject(tag, error)
  }
  const unit = scale.unit.trim()
  patchModule(tag, {
    pvMin: scale.low, pvMax: scale.high, unit,
    ...(m.type === 'AI' ? { pv: Math.max(scale.low, Math.min(scale.high, m.pv)) } : {}),
    ...(m.type === 'AO' ? { sp: Math.max(m.spLow, Math.min(m.spHigh, m.sp)), pv: scale.low + m.out / 100 * (scale.high - scale.low) } : {}),
    ...(m.type === 'PID' ? { sp: Math.max(scale.low, Math.min(scale.high, m.sp)), pv: Math.max(scale.low, Math.min(scale.high, m.pv)) } : {})
  })
  log(tag, `${m.type === 'AI' ? 'OUT_SCALE' : 'PV_SCALE'} set to ${scale.low} - ${scale.high} ${unit}`)
  return null
}

/** AO block SP_HI_LIM / SP_LO_LIM. */
export function setSpLimits(tag: string, limits: { high?: number; low?: number }): string | null {
  const m = state().modules[tag]
  if (m?.type !== 'AO' || !cmOf(tag)) return reject(tag, `${tag} has no Analog Output block`)
  const next = { spHigh: limits.high ?? m.spHigh, spLow: limits.low ?? m.spLow }
  const error = aoConfigurationError(m, next)
  if (error) return reject(tag, error)
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  patchModule(tag, { ...next, sp: Math.max(next.spLow, Math.min(next.spHigh, m.sp)) })
  log(tag, `AO1 SP limits set to ${next.spLow} - ${next.spHigh}`)
  return null
}

/** Special Items palette > Input Parameter: a Floating Point parameter of the module (CAS_SP). */
export function addInputParameter(tag: string, name: string, type = 'Floating Point'): string | null {
  const cm = cmOf(tag)
  const m = state().modules[tag]
  if (!cm || m?.type !== 'AO') return reject(tag, 'Input parameters are added to a module with an Analog Output block')
  if (type !== 'Floating Point') return reject(tag, 'Only the Floating Point parameter type is modeled')
  const key = name.trim().toUpperCase()
  if (!key) return reject(tag, 'Enter the parameter name')
  if (!state().addAoParameter(tag, key, 0)) return 'The parameter was not added (see the Event Journal)'
  setCmsPatch(tag, { params: [...(cm.params ?? []), { name: key, type: 'Floating Point' }] })
  log(tag, `Input parameter ${key} (${type}) added in Control Studio`)
  return null
}

/** Wire a parameter to the Cas_In pin of the AO block (drag from the parameter to the pin). */
export function connectWire(tag: string, from: string, to: string): string | null {
  const cm = cmOf(tag)
  const m = state().modules[tag]
  if (!cm || m?.type !== 'AO') return reject(tag, 'Wires are modeled between an input parameter and the Cas_In pin of an Analog Output block')
  if (to !== 'AO1.CAS_IN') return reject(tag, `${to} is not an input pin that can be wired here; use Cas_In`)
  if (!m.parameters[from]) return reject(tag, `${from} is not a parameter of ${tag}`)
  if (!state().connectAoParameter(tag, from)) return 'The wire was not made (see the Event Journal)'
  setCmsPatch(tag, { wires: [...(cm.wires ?? []).filter(w => w.to !== to), { from, to }] })
  log(tag, `${from} connected to Cas_In of AO1`)
  return null
}

/** Right-click a function block > Assign Alarm: enable a detection parameter and set its priority and limit. */
export function setBlockAlarm(tag: string, type: AlarmType, patch: { enabled?: boolean; limit?: number; priority?: AlarmPriority }): string | null {
  const m = analog(tag)
  if (!m || m.type === 'AO' || !cmOf(tag)) return reject(tag, `${tag} has no analog block with alarms`)
  const alarm = m.alarms.find(a => a.type === type)
  if (!alarm || !ALARM_NAMES[type]) return reject(tag, `${type} is not an alarm detection parameter of this block`)
  if (patch.limit !== undefined && !Number.isFinite(patch.limit)) return reject(tag, 'The limit value must be a number')
  if (!configure(`Configure alarms ${tag}`)) return 'Requires the Can Configure key'
  patchModule(tag, { alarms: m.alarms.map(a => a.type === type ? { ...a, ...patch } : a) })
  log(tag, `${ALARM_NAMES[type]!.name} ${JSON.stringify(patch)}`)
  return null
}

/** PID1 GAIN / RESET / RATE (the tuning parameters of FIC-102). */
export function setTuningParameter(tag: string, name: 'GAIN' | 'RESET' | 'RATE', value: number): string | null {
  const m = state().modules[tag]
  if (m?.type !== 'PID' || !cmOf(tag)) return reject(tag, `${tag} has no PID block`)
  if (!Number.isFinite(value) || value < 0) return reject(tag, `${name} must be a number of 0 or more`)
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  patchModule(tag, { [name.toLowerCase()]: value })
  log(tag, `PID1/${name} set to ${value}`)
  return null
}

export const IO_OPTS = ['Increase to Close', 'Increase to Open'] as const
export const CONTROL_OPTS = ['Direct Acting', 'Reverse Acting'] as const
/** PID1 IO_OPTS (Increase to Open) and CONTROL_OPTS (Reverse Acting). */
export function setPidOptions(tag: string, opts: { ioOpts?: typeof IO_OPTS[number]; controlOpts?: typeof CONTROL_OPTS[number] }): string | null {
  const m = state().modules[tag]
  if (m?.type !== 'PID' || !cmOf(tag)) return reject(tag, `${tag} has no PID block`)
  if (opts.ioOpts !== undefined && !(IO_OPTS as readonly string[]).includes(opts.ioOpts)) return reject(tag, `Unknown IO_OPTS ${opts.ioOpts}`)
  if (opts.controlOpts !== undefined && !(CONTROL_OPTS as readonly string[]).includes(opts.controlOpts)) return reject(tag, `Unknown CONTROL_OPTS ${opts.controlOpts}`)
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  patchModule(tag, {
    ...(opts.ioOpts ? { outputAction: opts.ioOpts === 'Increase to Open' ? 'INCREASE_TO_OPEN' : 'DECREASE_TO_OPEN' } : {}),
    ...(opts.controlOpts ? { direct: opts.controlOpts === 'Direct Acting' } : {})
  })
  log(tag, `PID1 ${opts.ioOpts ? `IO_OPTS = ${opts.ioOpts}` : ''}${opts.ioOpts && opts.controlOpts ? ', ' : ''}${opts.controlOpts ? `CONTROL_OPTS = ${opts.controlOpts}` : ''}`)
  return null
}
export const pidIoOpts = (m: PidModule): typeof IO_OPTS[number] => (m.outputAction === 'INCREASE_TO_OPEN' ? 'Increase to Open' : 'Increase to Close')
export const pidControlOpts = (m: PidModule): typeof CONTROL_OPTS[number] => (m.direct ? 'Direct Acting' : 'Reverse Acting')

// ---- DC block (MTR-102) -----------------------------------------------------------------------------------------------------

export const DEVICE_OPTIONS = ['Passive on Active Timeout', 'Passive when confirmed', 'Trip', 'Reset required', 'Permissive', 'SP Track', 'Interlock'] as const
export type DeviceOption = typeof DEVICE_OPTIONS[number]

export function deviceOptions(m: MotorModule, cm: Dv09Cm | undefined): Record<DeviceOption, boolean> {
  return {
    'Passive on Active Timeout': !!m.passiveOnTimeout,
    'Passive when confirmed': !!cm?.loop?.passiveWhenConfirmed,
    Trip: !!m.tripEnabled,
    'Reset required': m.resetRequired,
    Permissive: m.permissiveRequired,
    'SP Track': !!m.spTrack,
    Interlock: cm?.loop?.interlockOption !== false
  }
}

/** DC1 DEVICE_OPTS property dialog: one option bit. */
export function setDeviceOption(tag: string, option: DeviceOption, on: boolean): string | null {
  const cm = cmOf(tag)
  const m = state().modules[tag]
  if (!cm || m?.type !== 'MOTOR') return reject(tag, `${tag} has no Device Control block`)
  if (!DEVICE_OPTIONS.includes(option)) return reject(tag, `Unknown device option ${option}`)
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  switch (option) {
    case 'Passive on Active Timeout': patchModule(tag, { passiveOnTimeout: on }); break
    case 'Passive when confirmed': setCmsPatch(tag, { loop: { ...cm.loop, passiveWhenConfirmed: on } }); break
    case 'Trip': patchModule(tag, { tripEnabled: on }); break
    case 'Reset required': patchModule(tag, { resetRequired: on }); break
    case 'Permissive': patchModule(tag, { permissiveRequired: on, ...(on ? {} : { permissiveOk: true }) }); break
    case 'SP Track': patchModule(tag, { spTrack: on }); break
    case 'Interlock':
      setCmsPatch(tag, { loop: { ...cm.loop, interlockOption: on } })
      patchModule(tag, { interlockSource: on ? `${tag}/NOT1` : undefined, ...(on ? {} : { interlock: false }) })
      break
  }
  log(tag, `DC1/DEVICE_OPTS ${option} ${on ? 'checked' : 'unchecked'}`)
  return null
}

export interface ConditionPatch { description?: string; delaySec?: number; expr?: string }

/** CND1 / CND2: DESC, Time_Duration and the Expression, for example '//XVSTAT-101/DI1/PV_D'=0 . */
export function setCondition(tag: string, block: 'CND1' | 'CND2', patch: ConditionPatch): string | null {
  const cm = cmOf(tag)
  const m = state().modules[tag]
  const owned = m?.type === 'MOTOR' ? m.ownedBlocks?.[block] : undefined
  if (!cm || m?.type !== 'MOTOR' || !owned) return reject(tag, `${tag} has no ${block} condition block`)
  if (patch.description !== undefined && patch.description.length > 24) return reject(tag, 'DESC is at most 24 characters')
  if (patch.delaySec !== undefined && (!Number.isFinite(patch.delaySec) || patch.delaySec < 0)) return reject(tag, 'Time_Duration must be 0 or more seconds')
  if (patch.expr !== undefined) {
    const error = conditionSourceError(patch.expr, state().modules)
    if (error) return reject(tag, `${block}: ${error}`)
  }
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  const next: FunctionBlockModule = { ...owned, ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.delaySec !== undefined ? { delaySec: patch.delaySec } : {}), ...(patch.expr !== undefined ? { expr: patch.expr } : {}) }
  patchModule(tag, { ownedBlocks: { ...m.ownedBlocks, [block]: next } })
  log(tag, `${block} ${JSON.stringify(patch)}`)
  return null
}

// ---- module properties -----------------------------------------------------------------------------------------------------

export const DOWNLOAD_BEHAVIORS = ['Use configured values', 'Preserve critical block values', 'Preserve user-defined and critical block values'] as const
/** Module Properties > General: Restore parameter values after restart and the Parameter download behavior (pp 4-12, 4-13). */
export function setModuleGeneral(tag: string, general: { restoreAfterRestart?: boolean; downloadBehavior?: string }): string | null {
  const cm = cmOf(tag)
  if (!cm) return reject(tag, `${tag} is not a module created in DeltaV Explorer`)
  if (general.downloadBehavior !== undefined && !(DOWNLOAD_BEHAVIORS as readonly string[]).includes(general.downloadBehavior)) return reject(tag, `Unknown download behavior ${general.downloadBehavior}`)
  if (!configure(`Configure ${tag}`)) return 'Requires the Can Configure key'
  setCmsPatch(tag, { ...(general.restoreAfterRestart !== undefined ? { restoreAfterRestart: general.restoreAfterRestart } : {}), ...(general.downloadBehavior !== undefined ? { downloadBehavior: general.downloadBehavior } : {}) })
  log(tag, `Module properties: ${JSON.stringify(general)}`)
  return null
}

/** Module Properties > Displays > Detail. */
export function setDetailDisplay(tag: string, detail: string): string | null {
  if (!cmOf(tag) || !dv09Module(tag)) return reject(tag, `${tag} has no block yet`)
  if (!configure(`Assign module displays ${tag}`)) return 'Requires the Can Configure key'
  patchModule(tag, { detailDisplay: detail.trim() || undefined })
  log(tag, `Detail display set to ${detail.trim() || '(none)'}`)
  return null
}

// ---- Save / Download ------------------------------------------------------------------------------------------------------

/** What Save and Download compare: every configuration value of the block, the wires and the module properties. */
cmExtensions.snapshot = (s, cm) => {
  const m = s.modules[cm.tag]
  if (!m || (m.type !== 'AO' && m.type !== 'AI' && m.type !== 'PID' && m.type !== 'MOTOR')) return null
  const hw = s.hardware
  const common = { params: cm.params ?? [], wires: cm.wires ?? [], restore: cm.restoreAfterRestart ?? false, behavior: cm.downloadBehavior ?? '', loop: cm.loop ?? {}, template: cm.template ?? '' }
  if (m.type === 'AO') return { ...common, io: hw.analogBindings?.[cm.tag]?.output ?? '', scale: [m.pvMin, m.pvMax, m.unit], limits: [m.spLow, m.spHigh], mode: m.mode, cas: m.casParameter ?? '' }
  if (m.type === 'AI') return { ...common, io: hw.analogBindings?.[cm.tag]?.input ?? '', scale: [m.pvMin, m.pvMax, m.unit], alarms: m.alarms }
  if (m.type === 'PID') return { ...common, io: [hw.analogBindings?.[cm.tag]?.input ?? '', hw.analogBindings?.[cm.tag]?.output ?? ''], scale: [m.pvMin, m.pvMax, m.unit],
    tuning: [m.gain, m.reset, m.rate], direct: m.direct, action: m.outputAction ?? '', alarms: m.alarms, detail: m.detailDisplay ?? '' }
  return { ...common, io: [hw.deviceBindings?.[cm.tag]?.input ?? '', hw.deviceBindings?.[cm.tag]?.output ?? ''],
    options: [m.passiveOnTimeout ?? false, m.tripEnabled ?? false, m.resetRequired, m.permissiveRequired, m.spTrack ?? false, !!m.interlockSource],
    conditions: Object.entries(m.ownedBlocks ?? {}).filter(([n]) => n.startsWith('CND')).map(([n, b]) => [n, b.description, b.delaySec, b.expr]), detail: m.detailDisplay ?? '' }
}

/** A module cannot be downloaded without the I/O its block needs on the node it is assigned to. */
cmExtensions.downloadError = tag => {
  const s = state()
  const m = s.modules[tag]
  const controller = useLibrary.getState().assignments[tag]
  if (!m || (m.type !== 'AO' && m.type !== 'AI' && m.type !== 'PID' && m.type !== 'MOTOR')) return null
  const dsts: [string, string][] = m.type === 'AO' ? [['IO_OUT', s.hardware.analogBindings?.[tag]?.output ?? '']] :
    m.type === 'AI' ? [['IO_IN', s.hardware.analogBindings?.[tag]?.input ?? '']] :
    m.type === 'PID' ? [['IO_IN', s.hardware.analogBindings?.[tag]?.input ?? ''], ['IO_OUT', s.hardware.analogBindings?.[tag]?.output ?? '']] :
    [['IO_IN_1', s.hardware.deviceBindings?.[tag]?.input ?? ''], ['IO_OUT_1', s.hardware.deviceBindings?.[tag]?.output ?? '']]
  for (const [label, dst] of dsts) {
    if (!dst) return `${tag}: ${label} is not set; pick the DST in the Parameter View`
    const found = findDst(s.hardware, dst)
    if (!found || found.card.controllerTag !== controller) return `${tag}: ${label} ${dst} is not on ${controller}`
  }
  return null
}

/** Renaming a motor module renames its owned CND / BFI / OR / NOT / AND blocks and the wires between them. */
cmExtensions.renamed = (oldTag, tag) => {
  const m = state().modules[tag]
  if (m?.type !== 'MOTOR' || !m.ownedBlocks) return
  const swap = (text: string | undefined): string | undefined => (text && text.startsWith(`${oldTag}/`) ? `${tag}/${text.slice(oldTag.length + 1)}` : text)
  const fix = <T extends { kind: string; tag?: string }>(ref: T): T => (ref.tag ? { ...ref, tag: swap(ref.tag) } : ref)
  const ownedBlocks = Object.fromEntries(Object.entries(m.ownedBlocks).map(([name, b]) => [name, { ...b, tag: `${tag}/${name}`, in1: fix(b.in1), in2: fix(b.in2) }]))
  patchModule(tag, { ownedBlocks, interlockSource: swap(m.interlockSource), permissiveSource: swap(m.permissiveSource), commandSource: swap(m.commandSource) })
}
