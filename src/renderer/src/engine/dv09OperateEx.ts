import { useStore } from './store'
import { usePictures, type PicElement } from './pictureStore'
import { useFlowColors } from './flowColorStore'
import { libraryHooks } from './libraryStore'
import { DYNAMO_SETS, type DynamoSetName } from './pictureObjects'
import { parseDatalinkSource } from './dv09Operate'
import type { FlowAnimation, FlowCondition } from './pictureFlow'

// Course DV-09 chapters 4-6: the DeltaV Operate (Configure) experts and dynamos on top of the picture model (pictureStore): the Data Entry
// Expert, the Visibility Expert, the tank / rectangle / Fill Expert, the pump Color By dialog, the valve color animations and the pipes.

const log = (pic: string, text: string, category: 'CONFIGURE' | 'DIAGNOSTIC' = 'CONFIGURE'): void => useStore.getState().logEvent(category, pic, text)
const store = () => usePictures.getState()
const element = (pic: string, id: string): PicElement | undefined => store().pictures[pic]?.elements.find(e => e.id === id)
const added = (pic: string): string => { const els = store().pictures[pic]?.elements ?? []; return els[els.length - 1]?.id ?? '' }

/** The Data Entry Expert button of the DeltaV_ToolBox was clicked with a datalink selected. */
export const expertOpened = (pic: string, expert: 'Data Entry Expert' | 'Visibility Expert'): void => log(pic, `${expert} opened`, 'DIAGNOSTIC')

export type EntrySpec =
  | { kind: 'numeric'; low: number; high: number; fetchLimits: boolean; confirm?: boolean }
  | { kind: 'multi'; labels?: [string, string] }
  | { kind: 'mode' }
  | { kind: 'ramp'; rate: number }

/** Data Entry Expert (Numeric/Alpha, Ramp and Multi-Item Select tabs). Returns an error text or null. */
export function setDataEntry(pic: string, id: string, spec: EntrySpec): string | null {
  const el = element(pic, id)
  if (!el || el.type !== 'datalink') return 'Select a datalink first'
  const entry: NonNullable<PicElement['entry']> =
    spec.kind === 'numeric' ? { method: 'NUMERIC', fetchLimits: spec.fetchLimits, low: spec.low, high: spec.high, ...(spec.confirm ? { confirm: true } : {}) } :
    spec.kind === 'multi' ? { method: 'DISCRETE', ...(spec.labels ? { labels: spec.labels } : {}) } :
    spec.kind === 'mode' ? { method: 'PID_MODE' } : { method: 'RAMP', rate: spec.rate }
  if (!store().configureDynamics(pic, id, { entry })) return 'The Data Entry Expert settings were not applied (see the Event Journal)'
  log(pic, `Data Entry Expert applied to ${el.tag}/${el.path}: ${JSON.stringify(entry)}`)
  return null
}

/** Visibility Expert: show a datalink only while the alarms of its module are active (LI-101/ALARMS[1].F_LAALM). */
export function setVisibility(pic: string, id: string, source: string, visibleWhenActive: boolean): string | null {
  const el = element(pic, id)
  if (!el || el.type !== 'datalink') return 'Select a datalink first'
  const parsed = parseDatalinkSource(source.replace(/\.F_LAALM$/i, '.A_LAALM'))
  if ('error' in parsed) return parsed.error
  if (!/^ALARMS\[1\]\.A_LAALM$/i.test(parsed.path) || parsed.tag !== el.tag) return `The data source must be ${el.tag}/ALARMS[1].F_LAALM`
  if (!store().configureDynamics(pic, id, { alarmVisibility: visibleWhenActive })) return 'The Visibility Expert settings were not applied (see the Event Journal)'
  log(pic, `Visibility Expert: ${el.tag}/ALARMS[1].F_LAALM ${visibleWhenActive ? 'visible only when an alarm is active' : 'always visible'}`)
  return null
}

/** Dynamo set Tanks: a tank dynamo. */
export function addTank(pic: string, x: number, y: number): string | null {
  const id = store().addElement(pic, { type: 'tank', x, y })
  if (!id) return 'The tank was not added (see the Event Journal)'
  log(pic, 'Dynamo set Tanks: Tank added')
  return null
}

/** DeltaV_ToolBox rectangle button (the click-and-drag shape is dropped at its default size). */
export function addRectangle(pic: string, x: number, y: number, width = 64, height = 160): string | null {
  const id = store().addElement(pic, { type: 'rectangle', x, y, width, height })
  if (!id) return 'The rectangle was not added (see the Event Journal)'
  log(pic, 'Rectangle added')
  return null
}

/** Right-click > Color: the foreground / background color of a rectangle (or a datalink / text). */
export function setShapeColor(pic: string, id: string, colors: { foreground?: string; background?: string }): string | null {
  const el = element(pic, id)
  if (!el) return 'Select an object first'
  const patch: Partial<PicElement> = {}
  if (colors.foreground) patch.color = colors.foreground
  if (colors.background) patch.backgroundColor = colors.background
  if (!store().updateElement(pic, id, patch)) return 'The color was not applied (see the Event Journal)'
  log(pic, `Object color set: ${JSON.stringify(colors)}`)
  return null
}

export interface FillSpec { source: string; vertical: boolean; fetchLimits: boolean; low?: number; high?: number }
/** Right-click > Animations > Fill Percentage: the Fill Expert (data source, direction, input ranges). */
export function setFill(pic: string, id: string, spec: FillSpec): string | null {
  const el = element(pic, id)
  if (!el || el.type !== 'rectangle') return 'Select a rectangle first'
  const parsed = parseDatalinkSource(spec.source)
  if ('error' in parsed) return parsed.error
  if (!store().configureDynamics(pic, id, { tag: parsed.tag, path: parsed.path, fill: { vertical: spec.vertical, fetchLimits: spec.fetchLimits, low: spec.low ?? 0, high: spec.high ?? 100 } })) {
    return 'The Fill Expert settings were not applied (see the Event Journal)'
  }
  log(pic, `Fill Percentage animation: ${parsed.tag}/${parsed.path} (${spec.vertical ? 'vertical' : 'horizontal'}${spec.fetchLimits ? ', limits from the data source' : ''})`)
  return null
}

/** Dynamo sets PumpsAnim / ValvesAnim / PipesAnim: PumpAnimC1, ValveHorizontalControlD1 and a pipe, bound to a module. */
export function addAnimDynamo(pic: string, set: DynamoSetName, x: number, y: number, tag?: string): string | null {
  if (!DYNAMO_SETS[set]) return `Dynamo set ${set} is not modeled`
  const modules = useStore.getState().modules
  const bound = tag ?? Object.values(modules).find(m => DYNAMO_SETS[set].modules.includes(m.type))?.tag
  if (set !== 'PIPES_ANIM' && !bound) return `Create a ${DYNAMO_SETS[set].modules.join(' or ')} module first`
  const id = store().addElement(pic, { type: 'dynamo', dynamoSet: set, x, y, ...(bound ? { tag: bound } : {}) })
  if (!id) return 'The dynamo was not added (see the Event Journal)'
  log(pic, `Dynamo ${DYNAMO_SETS[set].label} added${bound ? ` (animated by ${bound})` : ''}`)
  return null
}
export const lastElement = added

export interface ColorBy { source: string; threshold: 'Exact Match'; entries: { value: number; color: string }[] }
/** Pump dynamo > Animate Pump Color > Color By: Current Value, Exact Match, value 0 = white, value 1 = yellow. */
export function setPumpColorBy(pic: string, id: string, spec: ColorBy): string | null {
  const el = element(pic, id)
  if (!el || el.dynamoSet !== 'PUMPS_ANIM') return 'Select the pump dynamo first'
  const parsed = parseDatalinkSource(spec.source)
  if ('error' in parsed) return parsed.error
  if (parsed.tag !== el.tag || !/^DC1\/PV_D$/i.test(parsed.path)) return `The data source must be ${el.tag}/DC1/PV_D.F_CV`
  const inactive = spec.entries.find(e => e.value === 0)?.color
  const active = spec.entries.find(e => e.value === 1)?.color
  if (!inactive || !active) return 'Give a color for the values 0 and 1'
  if (!store().configureDynamics(pic, id, { dynamoColors: { inactive, active } })) return 'The Color By settings were not applied (see the Event Journal)'
  log(pic, `Pump color animation: ${parsed.tag}/DC1/PV_D.F_CV Current Value, Exact Match, 0 = ${inactive}, 1 = ${active}`)
  return null
}

export interface ConditionSpec { tag: string; path: FlowCondition['path']; greaterThan: number }
/** A True / False color animation of a dynamo: "all of these conditions" colored True yellow, otherwise False green. */
export function setColorAnimation(pic: string, id: string, target: 'valve' | 'actuator', conditions: ConditionSpec[], trueColor: string, falseColor: string): string | null {
  const el = element(pic, id)
  if (!el || el.type !== 'dynamo') return 'Select the valve dynamo first'
  const table = `${target}_${id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-12)}`
  if (!useFlowColors.getState().applyTable({ name: table, flowColor: trueColor, noFlowColor: falseColor })) return 'The colors were not applied (see the Event Journal)'
  const animation: FlowAnimation = { table, conditions: conditions.map(c => ({ ...c })) }
  if (!store().configureDynamics(pic, id, target === 'valve' ? { flowAnimation: animation } : { actuatorFlowAnimation: animation })) return 'The color animation was not applied (see the Event Journal)'
  log(pic, `${target === 'valve' ? 'Valve' : 'Actuator'} color animation: ${conditions.map(c => `${c.tag}/${c.path} > ${c.greaterThan}`).join(' AND ')}: True ${trueColor}, False ${falseColor}`)
  return null
}

// A new project starts without shared flow color tables.
libraryHooks.reset.push(() => useFlowColors.setState({ tables: {} }))
