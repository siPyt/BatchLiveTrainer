import { useStore } from './store'
import { requireUnlockedKey } from './security'
import { moduleNameError } from './naming'
import { nameInUse } from './dv09Cm'
import { changedNamedSets, type NamedSetDefinition } from './namedSets'
import { sfcDraftDirty } from './sfcLifecycle'
import { newStep, type SfcStep } from './sfc'
import { addStepAfter, addSelectiveRoute, setPrimaryRoute } from './sfcGraph'
import type { AnyModule } from './types'

// Course DV-09 chapter 7 (Sequential Function Charts): the Control Studio authoring flow of a control module SFC (SFC-T101).
// File > New > Algorithm type "Sequential Function Chart" creates UNTITLED, Save names it (Save As), Properties assigns the controller,
// Download replaces the controller's copy and the downloaded SFC executes from its first step (HOLD_SFC) like a control module algorithm.

export const UNTITLED = 'UNTITLED'
export const isUntitled = (name: string): boolean => /^UNTITLED\d*$/.test(name)

const M = (): ReturnType<typeof useStore.getState> => useStore.getState()
const log = (tag: string, description: string, category: 'CONFIGURE' | 'DIAGNOSTIC' = 'CONFIGURE'): void => M().logEvent(category, tag, description)
const lastDiagnostic = (name: string, fallback: string): string =>
  [...M().eventLog].reverse().find(e => e.tag === name && e.category === 'DIAGNOSTIC')?.description ?? fallback

/** File > New with Algorithm type Sequential Function Chart: an empty managed (Offline) SFC named UNTITLED in the first plant area. */
export function newUntitledSfc(): string | null {
  const s = M()
  let name = UNTITLED
  for (let n = 1; s.sfcs[name] || s.modules[name]; n++) name = `${UNTITLED}${n}`
  const area = s.areas[0]
  if (!area) return null
  return M().createSfc(name, area, { managed: true }) ? name : null
}

/** Save for an UNTITLED SFC is Save As: the Object name and the plant area it is saved in. Returns an error text or null. */
export function saveSfcAs(from: string, to: string, area: string): string | null {
  const key = to.trim().toUpperCase()
  const s = M()
  const runtime = s.sfcs[from]
  const lifecycle = s.sfcLifecycle[from]
  if (!runtime || !lifecycle) return `SFC ${from} was not found`
  const error = moduleNameError(key) ?? (key !== from && nameInUse(key) ? `The name ${key} is already used` : null) ??
    (!s.areas.includes(area) ? `Area ${area} does not exist` : null) ??
    (lifecycle.saved || lifecycle.deployed ? `${from} has already been saved` : null)
  if (error) { log(from, `Save As rejected: ${error}`, 'DIAGNOSTIC'); return error }
  if (!requireUnlockedKey('CAN_CONFIGURE', `Save SFC ${key}`)) return 'Requires the Can Configure key'
  if (key !== from || area !== runtime.area) {
    useStore.setState(st => {
      const { [from]: moved, ...sfcs } = st.sfcs
      const { [from]: life, ...lifecycles } = st.sfcLifecycle
      return { sfcs: { ...sfcs, [key]: { ...moved, name: key, area } },
        sfcLifecycle: { ...lifecycles, [key]: { ...life, draft: { ...life.draft, name: key, area } } }, rev: st.rev + 1 }
    })
    log(key, `${from} saved as ${area}/${key}`)
  }
  return M().saveSfc(key) ? null : lastDiagnostic(key, 'The SFC could not be saved')
}

/** Studio Save: UNTITLED goes through Save As (the caller passes the dialog values); a named SFC is saved in place. */
export function saveStudioSfc(name: string): string | null {
  return M().saveSfc(name) ? null : lastDiagnostic(name, 'The SFC could not be saved')
}

/** Edit mode: stop the downloaded SFC and leave On-Line so the algorithm can be modified. */
export function goEdit(name: string): void {
  const lifecycle = M().sfcLifecycle[name]
  if (!lifecycle) return
  if (!lifecycle.online) return
  M().sfcCommand(name, 'reset')
  M().setSfcOnline(name, false)
  log(name, 'Diagram Mode: Edit; the running SFC was stopped')
}

/** On-Line mode: the downloaded SFC is shown with its live step states. */
export function goOnline(name: string): string | null {
  return M().setSfcOnline(name, true) ? null : lastDiagnostic(name, 'Download the SFC to an available controller before going On-Line')
}

/**
 * Download > Control Module: the referenced Named Sets go to the controller with the module (the workstation copy is the separate
 * Changed Setup Data download), then the saved SFC replaces the controller's copy and starts executing from its first step.
 */
export function downloadSfc(name: string): string | null {
  const s = M()
  const lifecycle = s.sfcLifecycle[name]
  if (!lifecycle) return `${name} is not a control module SFC`
  if (isUntitled(name)) return 'Save the SFC with a name before downloading it'
  if (!lifecycle.saved) return 'Save the SFC before downloading it'
  if (sfcDraftDirty(lifecycle)) return 'Save the current edits before downloading'
  const controller = lifecycle.saved.controllerTag
  if (!controller) return 'Assign the SFC to a controller (Module Properties or Assign To Node) before downloading'
  goEdit(name)
  const sets = Object.values(lifecycle.saved.parameters ?? {}).flatMap(p => p.type === 'NAMED_SET' ? [p.namedSet] : [])
  const changed = changedNamedSets(M().namedSets, { kind: 'controller', tag: controller })
  if (sets.some(set => changed.includes(set))) {
    if (!M().downloadChangedNamedSets({ kind: 'controller', tag: controller })) return lastDiagnostic('Named Sets', 'The Named Sets could not be downloaded to the controller')
  }
  if (!M().downloadSavedSfc(name)) return lastDiagnostic(name, 'The SFC could not be downloaded')
  if (!M().setSfcOnline(name, true)) return lastDiagnostic(name, 'The SFC could not go On-Line')
  M().sfcCommand(name, 'run')
  log(name, `Download complete: ${name} is executing in ${controller}`)
  return null
}

/** The Check button of the View tab. */
export function checkSfc(name: string): { ok: boolean; text: string } {
  const error = M().checkSfc(name)
  return error ? { ok: false, text: error } : { ok: true, text: `${name}: no errors found` }
}

/** Expression text as the manual writes it ('//TAG/BLOCK/PARAM', Named Set states for device commands and states). */
export function dv09ExpressionText(text: string, modules: Record<string, AnyModule>, sets: Record<string, NamedSetDefinition>): string {
  const state = (set: string, value: number): string | undefined => sets[set]?.entries.find(e => e.value === value)?.name
  let out = text.replace(/'\^\//g, "'//")
  out = out.replace(/'\/\/([A-Za-z0-9_$-]+)\/DC1\/(OUT_D|SP_D)\.CV' := ([01])\b/g, (whole, tag: string, _p: string, v: string) => {
    const module = modules[tag.toUpperCase()]
    const named = module?.type === 'MOTOR' ? state('mtr2-sp', Number(v)) : module?.type === 'VALVE' ? state('vlvnc-sp', Number(v)) : undefined
    const set = module?.type === 'MOTOR' ? 'mtr2-sp' : 'vlvnc-sp'
    return `'//${tag}/DC1/SP_D.CV' := ${named ? `'${set}:${named}'` : v}`
  })
  out = out.replace(/'\/\/([A-Za-z0-9_$-]+)\/DC1\/PV_D\.CV' = ([01])\b/g, (whole, tag: string, v: string) => {
    const module = modules[tag.toUpperCase()]
    const named = module?.type === 'MOTOR' ? state('mtr2-pv', Number(v)) : module?.type === 'VALVE' ? state('vlvnc-pv', Number(v)) : undefined
    const set = module?.type === 'MOTOR' ? 'mtr2-pv' : 'vlvnc-pv'
    return `'//${tag}/DC1/PV_D.CV' = ${named ? `'${set}:${named}'` : v}`
  })
  return out
}

/** Palette > Step: a new step (with its transition) follows the selected step, or ends the chart. */
export function paletteStep(steps: SfcStep[], selected: number | null): { steps: SfcStep[]; selected: number } | { error: string } {
  const name = nextStepName(steps)
  if (selected === null || !steps[selected]) {
    const added = [...steps, newStep(name)]
    return { steps: added, selected: added.length - 1 }
  }
  const result = addStepAfter(steps, steps[selected].id, name)
  if ('error' in result) return result
  const id = result.steps.find(step => !steps.some(old => old.id === step.id))?.id
  return { steps: result.steps, selected: result.steps.findIndex(step => step.id === id) }
}

/** Palette > Transition: a divergent path leaves the selected step through a new transition into a new step. */
export function paletteTransition(steps: SfcStep[], selected: number | null): { steps: SfcStep[]; selected: number } | { error: string } {
  if (selected === null || !steps[selected]) return { error: 'Select the step the new transition leaves from' }
  const stub = [...steps, newStep(nextStepName(steps))]
  const target = stub[stub.length - 1]
  const result = addSelectiveRoute(stub, steps[selected].id, target.id)
  return 'error' in result ? result : { steps: result.steps, selected: result.steps.findIndex(step => step.id === target.id) }
}

/** Palette > Termination: the sequence ends after the selected step's transition. */
export function paletteTermination(steps: SfcStep[], selected: number | null): { steps: SfcStep[]; selected: number } | { error: string } {
  if (selected === null || !steps[selected]) return { error: 'Select the step the sequence ends after' }
  const result = setPrimaryRoute(steps, steps[selected].id, null)
  return 'error' in result ? result : { steps: result.steps, selected }
}

function nextStepName(steps: SfcStep[]): string {
  const used = new Set(steps.map(step => step.name))
  for (let n = steps.length + 1; ; n++) if (!used.has(`S${n}`)) return `S${n}`
}
