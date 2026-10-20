import type { StepCheck } from './workshopChecks'
import type { AnyModule } from './types'
import { getParam, resolveInstance, type ClassCategory, type ClassInstance, type ControlModuleClass, type ModuleDefinition, type ScaleValue, type SimulateValue } from './classLibrary'
import { downloadState, referenceWarnings, type DeployedModule } from './libraryStore'

/** Evidence-based checking of the Course 7016 Chapter 1 workshops against the live library and plant state. */
export interface Ch1State {
  categories: Record<string, ClassCategory>
  classes: Record<string, ControlModuleClass>
  drafts: Record<string, ModuleDefinition>
  instances: Record<string, ClassInstance>
  assignments: Record<string, string>
  deployed: Record<string, DeployedModule>
}

export const CH1_INSTANCES = [
  { tag: 'LI-104', path: 'TANKSIM/TKLEV100', hi: 500 },
  { tag: 'LI-204', path: 'TANKSIM/TKLEV200', hi: 500 },
  { tag: 'LI-304', path: 'TANKSIM/TKLEV300', hi: 500 },
  { tag: 'LI-504', path: 'LEV500-SIM/500_LEV', hi: 1000 },
  { tag: 'LI-604', path: 'LEV600-SIM/600_LEV', hi: 1000 }
] as const

const v = (id: string, ok: boolean, good: string, bad: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail: ok ? good : bad })
const samePath = (a: unknown, b: string): boolean => typeof a === 'string' && a.trim().toUpperCase().replace(/\.CV$/, '') === b

export function checkCourse7016Ch1(s: Ch1State, modules: Record<string, AnyModule>, read: (path: string) => unknown): StepCheck[] {
  const cls = s.classes.LEVEL_INDICATOR
  const d = cls?.definition
  const ai = d?.blocks.AI1?.params
  const scale = ai?.OUT_SCALE.value as ScaleValue | undefined
  const sim = ai?.SIMULATE.value as SimulateValue | undefined
  const level = d?.params.LEVEL_IN
  const draftNote = cls && s.drafts[cls.name] ? ' (Control Studio has unsaved changes)' : ''
  const saved = (id: string, ok: boolean, good: string, bad: string): StepCheck => v(id, ok, good, cls ? bad + draftNote : 'Create class LEVEL_INDICATOR first')
  const inst = (tag: string): ClassInstance | undefined => s.instances[tag]?.className === 'LEVEL_INDICATOR' && s.instances[tag].area === 'ED_CENTER_BATCH' ? s.instances[tag] : undefined
  const resolved = (tag: string): ModuleDefinition | undefined => { const i = inst(tag); return i && cls ? resolveInstance(cls, i) : undefined }
  const pathOk = (tag: string, path: string): boolean => samePath(resolved(tag)?.params.LEVEL_IN?.value, path)
  const scaleOk = (tag: string, hi: number): boolean => {
    const sc = resolved(tag) && getParam(resolved(tag)!, 'AI1/OUT_SCALE')?.value as ScaleValue | undefined
    return !!sc && sc.lo === 0 && sc.hi === hi && sc.units === 'gal'
  }
  const all = CH1_INSTANCES.map(x => x.tag)
  const created = all.filter(t => inst(t))
  const assigned = all.filter(t => s.assignments[t])
  const current = all.filter(t => inst(t) && downloadState(s, t) === 'current')
  const warnings = all.flatMap(t => { const r = resolved(t); return r ? referenceWarnings(t, r, p => (read(p) ? { value: 0, bad: false } : null)) : [] })
  const live = all.filter(t => { const m = modules[t]; return m?.type === 'AI' && !m.pvBad })

  return [
    v('7016-1-1', !!s.categories.AnalogInput, 'Category AnalogInput exists', 'Right-click Control Module Classes → New Category, name it AnalogInput'),
    v('7016-1-2', cls?.category === 'AnalogInput' && cls.template === 'ANALOG', 'LEVEL_INDICATOR was created from ANALOG in AnalogInput',
      cls ? `LEVEL_INDICATOR is in ${cls.category} from ${cls.template}` : 'Drag ModuleTemplates/Monitoring/ANALOG onto AnalogInput and rename it LEVEL_INDICATOR'),
    saved('7016-1-3', !!scale && scale.lo === 0 && scale.hi === 500 && scale.units === 'gal' && !!ai?.OUT_SCALE.allowInstance,
      'OUT_SCALE 0-500 gal, instance-configurable', `OUT_SCALE is ${scale ? `${scale.lo}-${scale.hi} ${scale.units}` : '?'}${ai?.OUT_SCALE.allowInstance ? '' : ', Allow instance value not checked'}`),
    saved('7016-1-4', ai?.L_TYPE.value === 'Direct', 'L_TYPE is Direct', `L_TYPE is ${String(ai?.L_TYPE.value ?? '?')}`),
    saved('7016-1-5', !!d && !d.alarms.HI_ALM?.enabled && !d.alarms.LO_ALM?.enabled, 'HI_ALM and LO_ALM are disabled', 'Disable HI_ALM and LO_ALM in the Alarm View'),
    saved('7016-1-6', !!sim?.enabled && sim.value === 0, 'SIMULATE is Enabled, 0', 'Set SIMULATE to Enabled with value 0'),
    saved('7016-1-7', level?.type === 'extref' && level.special?.item === 'INPUT' && !(level.value as string).trim(),
      'LEVEL_IN is an External reference input parameter with no class path', level ? (level.type !== 'extref' ? 'LEVEL_IN must be an External reference' : 'Leave the class LEVEL_IN path blank (DO NOT BROWSE)') : 'Add Input Parameter LEVEL_IN'),
    saved('7016-1-8', !!d?.wires.some(w => w.from === 'LEVEL_IN' && w.to === 'AI1/SIMULATE_IN'), 'LEVEL_IN is wired to AI1/SIMULATE_IN', 'Connect LEVEL_IN to SIMULATE_IN'),
    saved('7016-1-9', d?.primaryDisplay.toUpperCase() === 'PROCESS', 'Primary display is Process', 'Set the primary control display to Process'),
    v('7016-1-10', !!cls && cls.revision > 1 && !s.drafts[cls.name], `Saved (revision ${cls?.revision ?? 0})`, cls && s.drafts[cls.name] ? 'Save LEVEL_INDICATOR in Control Studio' : 'Configure and save the class'),

    v('7016-2-1', !!inst('LI-104'), 'LI-104 was created from LEVEL_INDICATOR in ED_CENTER_BATCH', 'Drag LEVEL_INDICATOR onto ED_CENTER_BATCH and rename LEVEL_INDIC_1 to LI-104'),
    v('7016-2-2', created.length === all.length, 'All five level indicators exist', `Missing: ${all.filter(t => !inst(t)).join(', ')}`),
    v('7016-2-3', CH1_INSTANCES.slice(0, 3).every(x => pathOk(x.tag, x.path)), 'LI-104/204/304 read TANKSIM/TKLEV100/200/300', 'Set LEVEL_IN on LI-104, LI-204 and LI-304'),
    v('7016-2-4', pathOk('LI-504', 'LEV500-SIM/500_LEV') && scaleOk('LI-504', 1000), 'LI-504 reads LEV500-SIM/500_LEV, 0-1000 gal', 'Set LI-504 LEVEL_IN and AI1$OUT_SCALE 0-1000 gal'),
    v('7016-2-5', pathOk('LI-604', 'LEV600-SIM/600_LEV') && scaleOk('LI-604', 1000), 'LI-604 reads LEV600-SIM/600_LEV, 0-1000 gal', 'Set LI-604 LEVEL_IN and AI1$OUT_SCALE 0-1000 gal'),
    v('7016-2-6', created.length > 0 && assigned.length === created.length, `Assigned to ${s.assignments[created[0]] ?? ''}`, 'Drag ED_CENTER_BATCH onto the controller'),
    v('7016-2-7', created.length === all.length && current.length === all.length, 'Controller downloaded; all modules current',
      `${all.length - current.length} module(s) not downloaded or changed since the download`),
    v('7016-2-8', current.length === all.length && !warnings.length && live.length === all.length, 'No unresolved references; all five LI modules report Good values',
      warnings[0] ?? (live.length < all.length ? `${all.filter(t => !live.includes(t)).join(', ')} not reporting a Good value yet` : 'Download first'))
  ]
}
