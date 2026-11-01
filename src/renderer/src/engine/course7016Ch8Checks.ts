import type { PhaseClass, UnitClass, UnitModule } from './batchConfig'
import type { UnitDeployment } from './batchStore'
import type { ArbConfig, ArbDeployed } from './arbitration'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'

export interface Ch8State {
  phaseClasses: Record<string, PhaseClass>
  phaseDrafts: Record<string, PhaseClass>
  unitClasses: Record<string, UnitClass>
  units: Record<string, UnitModule>
  deployedUnits: Record<string, UnitDeployment>
  cellMembers: Record<string, string>
  arbitration: Record<string, ArbConfig>
  arbDeployed: Record<string, ArbDeployed>
}

const BLENDER_UNITS = ['UM_BL_500', 'UM_BL_600']
const TANK_UNITS = ['UM_COLOR_100', 'UM_COLOR_200', 'UM_COLOR_300']
const INLETS = ['BL_500_COLOR_IN', 'BL_600_COLOR_IN']
const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const same = (a: ArbConfig | undefined, b: ArbDeployed | undefined): boolean =>
  !!a && !!b && a.participate === b.participate && a.equipmentId === b.equipmentId && a.maxOwners === b.maxOwners && JSON.stringify(a.needed) === JSON.stringify(b.needed)

const runText = (pc: PhaseClass | undefined): string => (pc?.logic.RUN_LOGIC.steps.flatMap(s => s.actions.map(a => `${a.expression} ${a.delayExpression ?? ''}`)).join('\n') ?? '').toUpperCase()
const hasSteps = (pc: PhaseClass | undefined, names: string[]): boolean => names.every(n => pc?.logic.RUN_LOGIC.steps.some(s => s.name === n))
const requests = (pc: PhaseClass | undefined, codes: number[]): boolean => codes.every(c => new RegExp(`REQUEST\\.CV'\\s*:=\\s*${c}\\b`).test(runText(pc)))

/** Course 7016 Chapter 8 (pp 8-10 .. 8-19): COLOR_HEADER arbitration, the DUMP and CHG_COLOR phases, and the verification run. */
export function checkCourse7016Ch8(s: Ch8State, events: EventLogEntry[]): StepCheck[] {
  const dump = s.phaseClasses.DUMP
  const chg = s.phaseClasses.CHG_COLOR
  const header = s.arbitration.COLOR_HEADER
  const arbOk = (tag: string): boolean => same(s.arbitration[tag], s.arbDeployed[tag])
  const deployedLogic = (unit: string, phase: string, pc: PhaseClass | undefined): boolean =>
    !!pc && s.units[unit]?.phases[phase]?.phaseType === 'Controller' && JSON.stringify(s.deployedUnits[unit]?.logic[phase]) === JSON.stringify(pc.logic)
  const seen = (tag: string, text: string): boolean => events.some(e => e.tag === tag && e.description.includes(text))
  const anySeen = (units: string[], phase: string, text: string): boolean => units.some(u => seen(`${u}/${phase}`, text))
  const completed = (units: string[], phase: string): boolean => units.every(u => seen(`${u}/${phase}`, 'Phase state Complete'))
  const unitStarted = (units: string[], phase: string): boolean => units.some(u => seen(`${u}/${phase}`, 'Command Start'))
  const cleared = (units: string[], phase: string, codes: number[]): boolean => codes.every(c => anySeen(units, phase, `Request ${c} cleared`))
  const r1 = s.arbitration[INLETS[0]], r2 = s.arbitration[INLETS[1]]
  return [
    check('7016-8h-1', [r1, r2].every(c => !!c?.participate && c.maxOwners === 1), 'BL_500_COLOR_IN and BL_600_COLOR_IN participate in equipment arbitration (maximum owners 1)'),
    check('7016-8h-2', INLETS.every(arbOk) && !!r1?.participate && !!r2?.participate, 'both color inlets are downloaded with their arbitration settings'),
    check('7016-8h-3', s.cellMembers.COLOR_HEADER === 'PAINT_PRODUCTION', 'COLOR_HEADER exists in process cell PAINT_PRODUCTION'),
    check('7016-8h-4', !!header?.participate && header.equipmentId === 20 && INLETS.every(n => header.needed.includes(n)), 'COLOR_HEADER participates with Equipment ID 20 and needs BL_500_COLOR_IN and BL_600_COLOR_IN'),
    check('7016-8h-5', !!header?.participate && arbOk('COLOR_HEADER') && !!s.arbDeployed.COLOR_HEADER?.controller, 'COLOR_HEADER is assigned to the controller and downloaded'),

    check('7016-8p-1', dump?.category === 'TankClasses', 'phase class DUMP exists in TankClasses'),
    check('7016-8p-2', chg?.category === 'BlenderClasses' && chg.params.R_CLR_AMNT?.type === 'Real' && chg.params.R_CLR_AMNT.direction === 'Input' &&
      chg.params.R_CLR_AMNT.group === 'Operating' && chg.params.R_CLR_AMNT.low === 0 && chg.params.R_CLR_AMNT.defaultValue === 70 && chg.params.R_CLR_AMNT.high === 500 &&
      chg.params.R_CLR_AMNT.units === 'gal', 'CHG_COLOR exists in BlenderClasses with R_CLR_AMNT 0-70-500 gal'),
    check('7016-8p-3', chg?.params.RPT_AMNT_CHARGED?.type === 'Real' && chg.params.RPT_AMNT_CHARGED.direction === 'Report' && chg.params.RPT_AMNT_CHARGED.group === 'Report' &&
      chg.params.RPT_AMNT_CHARGED.units === 'gal', 'CHG_COLOR has the report parameter RPT_AMNT_CHARGED (gal)'),
    check('7016-8p-4', hasSteps(dump, ['INIT', 'REQUEST_DUMP', 'OPEN_OUTLET', 'SEND_CONFIRM', 'REQ_CLOSE_VLV', 'CLOSE_OUTLET']) && requests(dump, [5501, 5202, 5503]) &&
      runText(dump).includes('MODE.TARGET') && /VLVNC-SP:OPEN/.test(runText(dump)) && /VLVNC-SP:CLOSE/.test(runText(dump)) && /VLVNC-PV:CLOSED/.test(runText(dump)) &&
      !!dump?.logic.RUN_LOGIC.transitions.some(t => /REQUEST\.CV'\s*=\s*0/.test(t.condition)), 'DUMP RUN_LOGIC drives OUTLET_VLV and sends requests 5501, 5202 and 5503'),
    check('7016-8p-5', hasSteps(chg, ['ACQ_HEADER', 'REQUEST_CHARGE', 'REQ_CONFIRM', 'CAPT_INIT_LVL', 'RECEIVE_CHARGE', 'SLOW_CHARGE', 'REQ_CLOSE_VLV', 'CLOSE_CLR_VLV', 'RELEASE_HEADER']) &&
      requests(chg, [4020, 5201, 5502, 5203, 4220]) && chg?.params.INIT_LEVEL?.kind === 'algorithm' && chg.params.INIT_LEVEL.type === 'Real' &&
      /BULK/.test(runText(chg)) && /DRIBBLE/.test(runText(chg)) && /A_COMMAND\.CV'\s*:=\s*'EM-VLVNC-2STAGE:CLOSE/.test(runText(chg)) && /RPT_AMNT_CHARGED/.test(runText(chg)) &&
      (chg?.logic.RUN_LOGIC.routes ?? []).filter(r => r.from === 'CAPT_INIT_LVL').length >= 2, 'CHG_COLOR RUN_LOGIC acquires and releases COLOR_HEADER, branches on R_CLR_AMNT and charges bulk then dribble'),
    check('7016-8p-6', !!dump && !!chg && !s.phaseDrafts.DUMP && !s.phaseDrafts.CHG_COLOR, 'DUMP and CHG_COLOR are saved (no unsaved Control Studio changes)'),
    check('7016-8p-7', !!s.unitClasses.BLENDERS?.phaseClasses.includes('CHG_COLOR') && !!s.unitClasses.COLORTANKS?.phaseClasses.includes('DUMP'), 'CHG_COLOR is in BLENDERS and DUMP is in COLORTANKS'),
    check('7016-8p-8', BLENDER_UNITS.every(u => deployedLogic(u, 'CHG_COLOR', chg)), 'CHG_COLOR is a Controller phase on UM_BL_500 and UM_BL_600 and downloaded'),
    check('7016-8p-9', TANK_UNITS.every(u => deployedLogic(u, 'DUMP', dump)), 'DUMP is a Controller phase on UM_COLOR_100, 200 and 300 and downloaded'),

    check('7016-8v-1', unitStarted(TANK_UNITS, 'DUMP') && unitStarted(BLENDER_UNITS, 'CHG_COLOR'), 'DUMP and CHG_COLOR have been started from their unit faceplates'),
    check('7016-8v-2', anySeen(TANK_UNITS, 'DUMP', 'Phase request 5501') && anySeen(BLENDER_UNITS, 'CHG_COLOR', 'Phase request 4020'), 'DUMP waited with 5501 and CHG_COLOR with 4020 in REQUEST'),
    check('7016-8v-3', anySeen(BLENDER_UNITS, 'CHG_COLOR', 'Acquired COLOR_HEADER') && anySeen(BLENDER_UNITS, 'CHG_COLOR', 'Phase request 5201'), 'CHG_COLOR acquired COLOR_HEADER and then sent 5201'),
    check('7016-8v-4', cleared(BLENDER_UNITS, 'CHG_COLOR', [5201, 5502, 5203]) && cleared(TANK_UNITS, 'DUMP', [5501, 5202, 5503]), 'the three synchronization points (5201/5501, 5202/5502, 5203/5503) were cleared on both phases'),
    check('7016-8v-5', completed(TANK_UNITS, 'DUMP') && completed(BLENDER_UNITS, 'CHG_COLOR') && anySeen(BLENDER_UNITS, 'CHG_COLOR', 'Released COLOR_HEADER'),
      'DUMP completed on all three color tanks and CHG_COLOR on both blenders, releasing COLOR_HEADER')
  ]
}
