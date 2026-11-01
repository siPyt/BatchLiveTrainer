import type { PhaseClass, UnitClass, UnitModule } from './batchConfig'
import type { UnitDeployment } from './batchStore'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'
import type { NamedSetState } from './namedSets'

export interface Ch7State {
  phaseClasses: Record<string, PhaseClass>
  phaseDrafts: Record<string, PhaseClass>
  unitClasses: Record<string, UnitClass>
  units: Record<string, UnitModule>
  deployedUnits: Record<string, UnitDeployment>
}

const BLENDERS = ['UM_BL_500', 'UM_BL_600']
const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** Course 7016 Chapter 7 (pp 7-4 / 7-5): import DRAIN, add its failure messages, add it to BLENDERS, download and verify. */
export function checkCourse7016Ch7(s: Ch7State, events: EventLogEntry[], namedSets: NamedSetState): StepCheck[] {
  const pc = s.phaseClasses.DRAIN
  const level = pc?.params.R_DRAIN_LEVEL
  const report = pc?.params.RPT_AMNT_DRAINED
  const targets = ['WORKSTATION', ...new Set(Object.values(s.deployedUnits).map(d => `CONTROLLER:${d.controller}`))]
  const messages = targets.every(t => [9, 10, 11].every(v => namedSets.deployed[t]?.phase_failures?.entries.some(e => e.value === v)))
  const seen = (unit: string, desc: string): boolean => events.some(e => e.tag === `${unit}/DRAIN` && e.description.includes(desc))
  return [
    check('7016-7-1', !!pc && pc.category === 'BlenderClasses' && level?.type === 'Real' && level.direction === 'Input' && level.low === 0 && level.defaultValue === 250 &&
      level.high === 1000 && report?.direction === 'Report' && report.type === 'Real', 'DRAIN is imported into BlenderClasses with R_DRAIN_LEVEL 0-250-1000 gal and RPT_AMNT_DRAINED'),
    check('7016-7-2', messages && Object.keys(s.deployedUnits).length > 0, 'phase_failures messages 9, 10 and 11 are downloaded to the workstation and the controller'),
    check('7016-7-3', !!s.unitClasses.BLENDERS?.phaseClasses.includes('DRAIN'), 'DRAIN is added to the BLENDERS unit class'),
    check('7016-7-4', BLENDERS.every(u => s.units[u]?.phases.DRAIN?.phaseClass === 'DRAIN'), 'DRAIN appears under UM_BL_500 and UM_BL_600'),
    check('7016-7-5', !!pc && !s.phaseDrafts.DRAIN && BLENDERS.every(u => s.units[u]?.phases.DRAIN?.phaseType === 'Controller' &&
      JSON.stringify(s.deployedUnits[u]?.logic.DRAIN) === JSON.stringify(pc.logic)), 'both DRAIN unit phases are Controller phases and downloaded'),
    check('7016-7-6', BLENDERS.every(u => seen(u, 'Command Start') && seen(u, 'Phase state Complete')), 'DRAIN has been started and has run to Complete on both blenders')
  ]
}
