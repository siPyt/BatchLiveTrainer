import type { PhaseClass, UnitClass, UnitModule } from './batchConfig'
import type { UnitDeployment } from './batchStore'
import type { ArbConfig, ArbDeployed } from './arbitration'
import type { ControlModuleClass } from './classLibrary'
import type { NamedSetState } from './namedSets'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'

export interface Ch9State {
  phaseClasses: Record<string, PhaseClass>
  phaseDrafts: Record<string, PhaseClass>
  unitClasses: Record<string, UnitClass>
  units: Record<string, UnitModule>
  deployedUnits: Record<string, UnitDeployment>
  cellMembers: Record<string, string>
  arbitration: Record<string, ArbConfig>
  arbDeployed: Record<string, ArbDeployed>
}

const BLENDERS = ['UM_BL_500', 'UM_BL_600']
const VALVES = ['XV-501', 'XV-601']
const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const same = (a: ArbConfig | undefined, b: ArbDeployed | undefined): boolean =>
  !!a && !!b && a.participate === b.participate && a.equipmentId === b.equipmentId && a.maxOwners === b.maxOwners && JSON.stringify(a.needed) === JSON.stringify(b.needed)

/** Course 7016 Chapter 9 (pp 9-4 .. 9-10): BASE_HEADER arbitration, the shared HEADER control module class, and the CHG_BASE phase. */
export function checkCourse7016Ch9(s: Ch9State, events: EventLogEntry[], namedSets: NamedSetState, classes: Record<string, ControlModuleClass>): StepCheck[] {
  const header = s.arbitration.BASE_HEADER
  const arbOk = (tag: string): boolean => same(s.arbitration[tag], s.arbDeployed[tag])
  const pc = s.phaseClasses.CHG_BASE
  const amount = pc?.params.R_BASE_AMNT, rate = pc?.params.R_BASE_RATE, report = pc?.params.RPT_FEED_AMNT
  const targets = ['WORKSTATION', ...new Set(Object.values(s.deployedUnits).map(d => `CONTROLLER:${d.controller}`))]
  const messages = targets.every(t => [12, 13, 14, 15].every(v => namedSets.deployed[t]?.phase_failures?.entries.some(e => e.value === v)))
  const block = Object.values(s.unitClasses.BLENDERS?.modules ?? {}).find(m => m.className === 'HEADER')
  const seen = (unit: string, desc: string): boolean => events.some(e => e.tag === `${unit}/CHG_BASE` && e.description.includes(desc))
  const header1 = classes.HEADER
  return [
    check('7016-9h-1', VALVES.every(t => !!s.arbitration[t]?.participate && s.arbitration[t].maxOwners === 1), 'XV-501 and XV-601 participate in equipment arbitration (maximum owners 1)'),
    check('7016-9h-2', VALVES.every(t => !!s.arbitration[t]?.participate && arbOk(t)), 'both block valves are downloaded with their arbitration settings'),
    check('7016-9h-3', s.cellMembers.BASE_HEADER === 'PAINT_PRODUCTION', 'BASE_HEADER exists in process cell PAINT_PRODUCTION'),
    check('7016-9h-4', !!header?.participate && header.equipmentId === 30 && VALVES.every(n => header.needed.includes(n)), 'BASE_HEADER participates with Equipment ID 30 and needs XV-501 and XV-601'),
    check('7016-9h-5', !!header?.participate && arbOk('BASE_HEADER') && !!s.arbDeployed.BASE_HEADER?.controller, 'BASE_HEADER is assigned to the controller and downloaded'),

    check('7016-9s-1', !!header1 && header1.category === 'General', 'the control module class HEADER exists in the category General'),
    check('7016-9s-2', !!block && block.ownership === 'Shared' && block.allowVariant, 'HEADER is added to BLENDERS as a Shared module block that allows a variant module'),
    check('7016-9s-3', !!s.unitClasses.BLENDERS?.modules?.BASE_HDR && s.unitClasses.BLENDERS.modules.BASE_HDR.className === 'HEADER', 'the module block is renamed BASE_HDR'),
    check('7016-9s-4', BLENDERS.every(u => s.units[u]?.blocks?.BASE_HDR === 'BASE_HEADER'), 'BASE_HDR is bound to BASE_HEADER on UM_BL_500 and UM_BL_600'),

    check('7016-9p-1', !!pc && pc.category === 'BlenderClasses' && amount?.type === 'Real' && amount.direction === 'Input' && amount.low === 0 && amount.high === 1000 &&
      rate?.type === 'Real' && rate.low === 0 && rate.high === 100 && report?.direction === 'Report' && report.type === 'Real', 'CHG_BASE is imported into BlenderClasses with R_BASE_AMNT, R_BASE_RATE and RPT_FEED_AMNT'),
    check('7016-9p-2', messages && Object.keys(s.deployedUnits).length > 0, 'phase_failures messages 12-15 are downloaded to the workstation and the controller'),
    check('7016-9p-3', !!s.unitClasses.BLENDERS?.phaseClasses.includes('CHG_BASE'), 'CHG_BASE is added to the BLENDERS unit class'),
    check('7016-9p-4', BLENDERS.every(u => s.units[u]?.phases.CHG_BASE?.phaseClass === 'CHG_BASE'), 'CHG_BASE appears under UM_BL_500 and UM_BL_600'),
    check('7016-9p-5', !!pc && !s.phaseDrafts.CHG_BASE && BLENDERS.every(u => s.units[u]?.phases.CHG_BASE?.phaseType === 'Controller' &&
      JSON.stringify(s.deployedUnits[u]?.logic.CHG_BASE) === JSON.stringify(pc.logic)), 'both CHG_BASE unit phases are Controller phases and downloaded'),
    check('7016-9v-1', BLENDERS.every(u => seen(u, 'Command Start') && seen(u, 'Phase state Complete') && seen(u, 'Acquired BASE_HEADER') && seen(u, 'Released BASE_HEADER')),
      'CHG_BASE ran to Complete on both blenders, acquiring and releasing BASE_HEADER')
  ]
}
