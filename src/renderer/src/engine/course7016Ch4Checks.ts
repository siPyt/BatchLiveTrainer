import type { StepCheck } from './workshopChecks'
import type { EventLogEntry } from './types'
import type { CompositeName, PhaseClass, PhaseSfc, UnitModule } from './batchConfig'
import type { UnitDeployment } from './batchStore'
import type { SystemFeature } from './systemPreferences'

/** Evidence-based checking of the Course 7016 Chapter 3 (System Preferences) and Chapter 4 (FILL phase) workshops. */

export interface Ch3State {
  features: Record<SystemFeature, boolean>
  pending: Partial<Record<SystemFeature, boolean>>
  serverState: 'RUNNING' | 'STOPPED'
  restarts: number
}

export interface Ch4State {
  categories: Record<string, { name: string; kind: string; parent: string | null }>
  pcellClasses: Record<string, { name: string; category: string }>
  unitClasses: Record<string, { name: string; category: string; aliases: Record<string, unknown>; phaseClasses: string[] }>
  phaseClasses: Record<string, PhaseClass>
  phaseDrafts: Record<string, PhaseClass>
  processCells: Record<string, { name: string; className: string; area: string }>
  units: Record<string, UnitModule>
  contained: Record<string, string>
  cellMembers: Record<string, string>
  unitAssignments: Record<string, string>
  deployedUnits: Record<string, UnitDeployment>
}

const v = (id: string, ok: boolean, good: string, bad: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail: ok ? good : bad })
const UNITS = ['100', '200', '300'] as const

/** Normalize an expression for comparison: case, whitespace, ';', internal-ref prefix (/ vs ^/) and an implicit .CV field. */
export function normExpr(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '').replace(/;/g, '').replace(/'\^\//g, "'/").replace(/\.CV'/g, "'").replace(/!=/g, '<>').replace(/==/g, '=')
}
const has = (text: string, fragment: string): boolean => normExpr(text).includes(normExpr(fragment))

export function checkCourse7016Ch3(s: Ch3State): StepCheck[] {
  const chosen = s.pending.batch ?? s.features.batch
  return [
    v('7016-3-1', chosen || s.features.batch, 'System Preferences opened and Batch selected', 'Open System Preferences (Utilities ▸ System Preferences)'),
    v('7016-3-2', chosen, s.features.batch ? 'Enable Batch is active' : 'Enable Batch is checked (pending a server restart)', 'Check Enable Batch and click OK'),
    v('7016-3-3', s.restarts > 0 || s.serverState === 'STOPPED', 'Database Administrator used', 'Use the Database Administrator section of System Preferences'),
    v('7016-3-4', s.restarts > 0 || s.serverState === 'STOPPED', 'The database server was shut down', 'File ▸ Shutdown Server'),
    v('7016-3-5', s.features.batch && s.serverState === 'RUNNING', 'Server reconnected; Batch is active', s.serverState === 'STOPPED' ? 'File ▸ Connect to Server' : 'Restart the server after enabling Batch'),
    v('7016-3-6', s.features.batch && s.features.advancedUnitManagement, 'Explorer shows Process Cell/Unit/Phase Classes, Recipes and the Batch Executive/Historian subsystems',
      'Enable Batch and restart the server, then look in DeltaV Explorer')
  ]
}

const RUN_STEPS = ['INIT', 'OPEN_INLET', 'CLOSE_INLET', 'COMPLETE']
const RUN_TRANS = ['OUTLET_CLOSED', 'LEVEL_MET', 'INLET_CLOSED', 'COMPLETE_2']
const RUN_ACTIONS: string[][] = [
  ["'//#OUTLET_VLV#/MODE.TARGET':=CAS", "'//#OUTLET_VLV#/CAS_SP.CV':='vlvnc-sp:CLOSE'"],
  ["'//#INLET_VLV#/MODE.TARGET':=CAS", "'//#INLET_VLV#/CAS_SP.CV':='vlvnc-sp:OPEN'"],
  ["'//#INLET_VLV#/MODE.TARGET':=CAS", "'//#INLET_VLV#/CAS_SP.CV':='vlvnc-sp:CLOSE'"],
  ["'/RPT_FNL_LVL.CV':='//#TANK_LEVEL#'", "'//#INLET_VLV#/MODE.TARGET':=AUTO", "'//#OUTLET_VLV#/MODE.TARGET':=AUTO"]
]
const RUN_CONDS = ["'//#OUTLET_VLV#/PV.CV'='vlvnc-pv:CLOSED'", "'//#TANK_LEVEL#'>='/R_FILL_LEVEL.CV'", "'//#INLET_VLV#/PV.CV'='vlvnc-pv:CLOSED'", '']

function stepText(sfc: PhaseSfc, name: string): string | null {
  const s = sfc.steps.find(x => x.name.toUpperCase() === name)
  return s ? s.actions.map(a => a.expression).join(';') : null
}
function condText(sfc: PhaseSfc, name: string): string | null {
  return sfc.transitions.find(x => x.name.toUpperCase() === name)?.condition ?? null
}

/** Which of the course RUN_LOGIC requirements (a-m, p4-44/4-45) the sequence is missing. */
export function runLogicProblems(sfc: PhaseSfc | undefined): string[] {
  if (!sfc) return ['FILL has no RUN_LOGIC']
  const out: string[] = []
  const names = sfc.steps.map(s => s.name.toUpperCase())
  const trans = sfc.transitions.map(t => t.name.toUpperCase())
  if (names.slice(0, 4).join() !== RUN_STEPS.join()) out.push(`steps should be ${RUN_STEPS.join(' → ')} (found ${names.join(', ')})`)
  if (trans.slice(0, 4).join() !== RUN_TRANS.join()) out.push(`transitions should be ${RUN_TRANS.join(' → ')} (found ${trans.join(', ')})`)
  RUN_STEPS.forEach((step, i) => {
    const text = stepText(sfc, step)
    if (text === null) return
    for (const f of RUN_ACTIONS[i]) if (!has(text, f)) out.push(`${step} is missing ${f}`)
  })
  RUN_TRANS.forEach((t, i) => {
    const text = condText(sfc, t)
    if (text === null) return
    if (RUN_CONDS[i] && !has(text, RUN_CONDS[i]) && !(t === 'LEVEL_MET' && has(text, "'/R_FILL_LEVEL.CV'<='//#TANK_LEVEL#'"))) out.push(`${t} should be ${RUN_CONDS[i]}`)
    if (!RUN_CONDS[i] && text.trim() && normExpr(text) !== 'TRUE') out.push(`${t} should be TRUE`)
  })
  return out
}

function sequenceProblems(sfc: PhaseSfc | undefined, step: string, target: 'OPEN' | 'CLOSE', trans: string): string[] {
  if (!sfc) return ['no logic']
  const out: string[] = []
  const text = stepText(sfc, step)
  if (text === null) out.push(`add step ${step}`)
  else for (const f of ["'//#INLET_VLV#/MODE.TARGET':=CAS", `'//#INLET_VLV#/CAS_SP.CV':='vlvnc-sp:${target}'`]) if (!has(text, f)) out.push(`${step} is missing ${f}`)
  const cond = condText(sfc, trans)
  const want = `'//#INLET_VLV#/PV.CV'='vlvnc-pv:${target === 'OPEN' ? 'OPEN' : 'CLOSED'}'`
  if (cond === null) out.push(`add transition ${trans}`)
  else if (!has(cond, want)) out.push(`${trans} should be ${want}`)
  return out
}

const logged = (log: EventLogEntry[], tag: string, re: RegExp): EventLogEntry[] => log.filter(e => e.tag === tag && re.test(e.description))
const after = (a: EventLogEntry[], b: EventLogEntry[]): boolean => a.some(x => b.some(y => y.time >= x.time))

export function checkCourse7016Ch4(s: Ch4State, log: EventLogEntry[]): StepCheck[] {
  const pc = s.phaseClasses.FILL
  const draft = s.phaseDrafts.FILL
  const fill = draft ?? pc
  const unitName = (n: string): string => `UM_COLOR_${n}`
  const unit = (n: string): UnitModule | undefined => {
    const u = s.units[unitName(n)]
    return u?.unitClass === 'COLORTANKS' && u.processCell === 'PAINT_PRODUCTION' ? u : undefined
  }
  const alias = (n: string, a: string): string => unit(n)?.aliases[a]?.path.trim().toUpperCase() ?? ''
  const aliasesOk = (n: string): boolean => alias(n, 'INLET_VLV') === `XV-${n[0]}01` && alias(n, 'OUTLET_VLV') === `XV-${n[0]}02` &&
    alias(n, 'TANK_LEVEL').replace(/\.CV$/, '') === `LI-${n[0]}04/AI1/PV`
  const containsOk = (n: string): boolean => [`XV-${n[0]}01`, `XV-${n[0]}02`, `LI-${n[0]}04`].every(t => s.contained[t] === unitName(n))
  const r = pc?.params.R_FILL_LEVEL
  const rpt = pc?.params.RPT_FNL_LVL
  const runDraft = runLogicProblems(fill?.logic.RUN_LOGIC)
  const runSaved = runLogicProblems(pc?.logic.RUN_LOGIC)
  const unitsCreated = UNITS.filter(n => unit(n))
  const key = (n: string): string => `${unitName(n)}/FILL`
  const ran = (n: string): boolean => {
    const complete = logged(log, key(n), /Phase state Complete/)
    return complete.length > 0
  }
  const resetUnloaded = (n: string): boolean => after(logged(log, key(n), /Phase state Complete/), logged(log, key(n), /Phase unloaded/))
  const fmtList = (xs: readonly string[]): string => xs.map(unitName).join(', ')
  const missing = (ok: (n: string) => boolean): string[] => UNITS.filter(n => !ok(n))

  return [
    // Task 1
    v('7016-4-1-1', !!s.categories['pcell:General'], 'Library ▸ Advanced Definitions ▸ Process Cell Classes ▸ General is available', 'Enable Batch (Chapter 3) so Advanced Definitions shows Process Cell Classes'),
    v('7016-4-1-2', s.pcellClasses.PRODUCTION?.category === 'General', 'Process Cell Class PRODUCTION exists in General', 'Right-click General ▸ New Process Cell Class, name it PRODUCTION'),
    v('7016-4-1-3', s.processCells.PAINT_PRODUCTION?.className === 'PRODUCTION' && s.processCells.PAINT_PRODUCTION.area === 'ED_CENTER_BATCH',
      'PAINT_PRODUCTION (class PRODUCTION) is in ED_CENTER_BATCH', 'Drag PRODUCTION onto ED_CENTER_BATCH and rename the process cell PAINT_PRODUCTION'),
    // Task 2
    v('7016-4-2-1', !!s.categories['unit:ChargeTankUnits'], 'Unit class category ChargeTankUnits exists', 'Right-click Unit Classes ▸ New Category, name it ChargeTankUnits'),
    v('7016-4-2-2', s.unitClasses.COLORTANKS?.category === 'ChargeTankUnits', 'Unit class COLORTANKS is in ChargeTankUnits', 'Right-click ChargeTankUnits ▸ New Unit Class COLORTANKS'),
    v('7016-4-2-3', ['INLET_VLV', 'OUTLET_VLV', 'TANK_LEVEL'].every(a => !!s.unitClasses.COLORTANKS?.aliases[a]), 'Aliases INLET_VLV, OUTLET_VLV and TANK_LEVEL exist',
      'Right-click COLORTANKS ▸ New ▸ Alias for INLET_VLV, OUTLET_VLV and TANK_LEVEL'),
    // Task 3
    v('7016-4-3-1', !!s.categories['phase:TankClasses'], 'Phase class category TankClasses exists', 'Right-click Phase Classes ▸ New Category, name it TankClasses'),
    v('7016-4-3-2', pc?.category === 'TankClasses', 'Phase class FILL is in TankClasses', 'Right-click TankClasses ▸ New Phase Class FILL'),
    v('7016-4-3-3', !!r && r.kind === 'batch' && r.group === 'Operating' && r.type === 'Real' && r.direction === 'Input' && r.low === 0 && Number(r.defaultValue) === 250 && r.high === 500 && r.units === 'gal',
      'R_FILL_LEVEL: Operating, Real, Input, 0 / 250 / 500 gal',
      r ? `R_FILL_LEVEL is ${r.group}, ${r.type}, ${r.direction}, ${r.low}/${r.defaultValue}/${r.high} ${r.units}` : 'Right-click FILL ▸ New ▸ Batch Input/Report Parameter R_FILL_LEVEL'),
    v('7016-4-3-4', !!rpt && rpt.kind === 'batch' && rpt.group === 'Report' && rpt.type === 'Real' && rpt.direction === 'Report' && rpt.units === 'gal',
      'RPT_FNL_LVL: Report category, Real, Report, gal', rpt ? `RPT_FNL_LVL is ${rpt.group}, ${rpt.type}, ${rpt.direction}, ${rpt.units}` : 'Add Batch Input/Report Parameter RPT_FNL_LVL (type Report as a new parameter category)'),
    // Task 4
    v('7016-4-4-1', !!fill && (fill.logic.RUN_LOGIC.steps.length > 1 || fill.revision > 1 || !!draft), 'FILL has been opened and edited in Control Studio', 'Right-click FILL ▸ Open with Control Studio'),
    v('7016-4-4-2', !runDraft.length, 'RUN_LOGIC has INIT, OPEN_INLET, CLOSE_INLET, COMPLETE with all actions a-m', runDraft[0] ?? ''),
    v('7016-4-4-3', !runSaved.length && !draft, 'The phase logic is saved', draft ? 'Save the phase logic (Ctrl+S)' : runSaved[0] ?? ''),
    v('7016-4-4-4', !!s.unitClasses.COLORTANKS?.phaseClasses.includes('FILL'), 'FILL is assigned to COLORTANKS', 'Drag Phase Class FILL onto Unit Class COLORTANKS'),
    // Task 5
    v('7016-4-5-1', !!unit('100'), 'UM_COLOR_100 created in PAINT_PRODUCTION', 'Drag COLORTANKS onto PAINT_PRODUCTION and rename COLORTANKS_1 to UM_COLOR_100'),
    v('7016-4-5-2', !!unit('100'), 'UM_COLOR_100 renamed', 'Rename COLORTANKS_1 to UM_COLOR_100'),
    v('7016-4-5-3', !!unit('200'), 'UM_COLOR_200 created', 'Repeat and rename to UM_COLOR_200'),
    v('7016-4-5-4', !!unit('300'), 'UM_COLOR_300 created', 'Repeat and rename to UM_COLOR_300'),
    v('7016-4-5-5', !!unit('100'), 'UM_COLOR_100 ▸ Aliases is available', 'Expand UM_COLOR_100 and select Aliases'),
    v('7016-4-5-6', alias('100', 'INLET_VLV') === 'XV-101', 'INLET_VLV → XV-101', `INLET_VLV is ${alias('100', 'INLET_VLV') || 'unresolved'}`),
    v('7016-4-5-7', alias('100', 'OUTLET_VLV') === 'XV-102', 'OUTLET_VLV → XV-102', `OUTLET_VLV is ${alias('100', 'OUTLET_VLV') || 'unresolved'}`),
    v('7016-4-5-8', alias('100', 'TANK_LEVEL').replace(/\.CV$/, '') === 'LI-104/AI1/PV', 'TANK_LEVEL → LI-104/AI1/PV.CV', `TANK_LEVEL is ${alias('100', 'TANK_LEVEL') || 'unresolved'}`),
    v('7016-4-5-9', aliasesOk('200'), 'UM_COLOR_200 aliases: XV-201, XV-202, LI-204/AI1/PV.CV', 'Resolve UM_COLOR_200 aliases to XV-201, XV-202, LI-204/AI1/PV.CV'),
    v('7016-4-5-10', aliasesOk('300'), 'UM_COLOR_300 aliases: XV-301, XV-302, LI-304/AI1/PV.CV', 'Resolve UM_COLOR_300 aliases to XV-301, XV-302, LI-304/AI1/PV.CV'),
    // Task 6
    v('7016-4-6-1', containsOk('100'), 'XV-101, XV-102 and LI-104 are in UM_COLOR_100', 'Drag XV-101, XV-102 and LI-104 onto UM_COLOR_100'),
    v('7016-4-6-2', containsOk('200'), 'XV-201, XV-202 and LI-204 are in UM_COLOR_200', 'Drag XV-201, XV-202 and LI-204 onto UM_COLOR_200'),
    v('7016-4-6-3', containsOk('300'), 'XV-301, XV-302 and LI-304 are in UM_COLOR_300', 'Drag XV-301, XV-302 and LI-304 onto UM_COLOR_300'),
    // Task 7
    v('7016-4-7-1', unitsCreated.length === 3 && UNITS.every(n => unit(n)!.primaryDisplay.toUpperCase() === 'PROCESS'), 'Primary Control Display is Process on all three units',
      `Set Properties ▸ Display ▸ Primary Control Display = Process on ${fmtList(missing(n => unit(n)?.primaryDisplay.toUpperCase() === 'PROCESS'))}`),
    v('7016-4-7-2', unitsCreated.length === 3 && UNITS.every(n => unit(n)!.phases.FILL?.phaseType === 'Controller'), 'Unit phase FILL is a Controller phase on all three units',
      `Set Phase Type = Controller on ${fmtList(missing(n => unit(n)?.phases.FILL?.phaseType === 'Controller'))}`),
    v('7016-4-7-3', s.cellMembers.TANKSIM === 'PAINT_PRODUCTION', 'TANKSIM is in PAINT_PRODUCTION', 'Drag TANKSIM onto the process cell PAINT_PRODUCTION'),
    v('7016-4-7-4', unitsCreated.length === 3 && UNITS.every(n => !!s.unitAssignments[unitName(n)]), `PAINT_PRODUCTION is assigned to ${s.unitAssignments.UM_COLOR_100 ?? 'a controller'}`,
      'Drag the process cell PAINT_PRODUCTION onto the controller CTLR1'),
    v('7016-4-7-5', unitsCreated.length === 3 && UNITS.every(n => !!s.deployedUnits[unitName(n)]?.logic.FILL), 'UM_COLOR_100/200/300 with unit phase FILL are downloaded',
      `Download the controller (${fmtList(missing(n => !!s.deployedUnits[unitName(n)]?.logic.FILL)) || 'units'} not downloaded)`),
    // Task 8
    v('7016-4-8-1', logged(log, key('100'), /Phase loaded/).length > 0, 'FILL was loaded on UM_COLOR_100', 'Process ▸ click Color 100 (unit faceplate) ▸ Load a Phase ... ▸ FILL'),
    v('7016-4-8-2', logged(log, key('100'), /R_FILL_LEVEL :=/).length > 0, 'R_FILL_LEVEL was changed on UM_COLOR_100', 'BatchHelp ▸ click the R_FILL_LEVEL value of UM_COLOR_100 and enter a new value'),
    v('7016-4-8-3', ran('100'), 'FILL ran to Complete on UM_COLOR_100', 'Phase faceplate ▸ Phase Command ... ▸ Start, wait for Complete'),
    v('7016-4-8-4', resetUnloaded('100'), 'FILL was reset and unloaded from UM_COLOR_100', 'Phase Command ▸ Reset, then Unload'),
    v('7016-4-8-5', ran('200') && resetUnloaded('200') && ran('300') && resetUnloaded('300'), 'FILL ran, was reset and unloaded on UM_COLOR_200 and UM_COLOR_300',
      `Repeat on ${fmtList(UNITS.filter(n => n !== '100' && !(ran(n) && resetUnloaded(n))))}`)
  ]
}

export function checkCourse7016HoldRestart(s: Ch4State): StepCheck[] {
  const pc = s.phaseClasses.FILL
  const draft = s.phaseDrafts.FILL
  const hold = sequenceProblems((draft ?? pc)?.logic.HOLD_LOGIC, 'CLOSE_INLET', 'CLOSE', 'HOLD')
  const holdSaved = sequenceProblems(pc?.logic.HOLD_LOGIC, 'CLOSE_INLET', 'CLOSE', 'HOLD')
  const restart = sequenceProblems((draft ?? pc)?.logic.RESTART_LOGIC, 'OPEN_INLET', 'OPEN', 'RESTART')
  const restartSaved = sequenceProblems(pc?.logic.RESTART_LOGIC, 'OPEN_INLET', 'OPEN', 'RESTART')
  const dep = s.deployedUnits.UM_COLOR_100?.logic.FILL
  const deployed = !!dep && !sequenceProblems(dep.HOLD_LOGIC, 'CLOSE_INLET', 'CLOSE', 'HOLD').length && !sequenceProblems(dep.RESTART_LOGIC, 'OPEN_INLET', 'OPEN', 'RESTART').length
  return [
    v('7016-4h-1', !hold.length, 'HOLD_LOGIC: CLOSE_INLET (CAS, CLOSE) then HOLD waits for CLOSED', hold[0] ?? ''),
    v('7016-4h-2', !holdSaved.length && !draft, 'HOLD_LOGIC saved', draft ? 'Save the phase logic' : holdSaved[0] ?? ''),
    v('7016-4r-1', !restart.length, 'RESTART_LOGIC: OPEN_INLET (CAS, OPEN) then RESTART waits for OPEN', restart[0] ?? ''),
    v('7016-4r-2', !restartSaved.length && !draft, 'RESTART_LOGIC saved', draft ? 'Save the phase logic' : restartSaved[0] ?? ''),
    v('7016-4r-3', deployed, 'UM_COLOR_100/FILL downloaded with the Hold and Restart logic', 'Right-click UM_COLOR_100 ▸ FILL ▸ Download ▸ Unit Phase')
  ]
}

export function checkCourse7016Verify(log: EventLogEntry[]): StepCheck[] {
  const k = (n: string): string => `UM_COLOR_${n}/FILL`
  const cmd = (n: string, c: string): EventLogEntry[] => logged(log, k(n), new RegExp(`^Command ${c}`))
  const state = (n: string, st: string): EventLogEntry[] => logged(log, k(n), new RegExp(`^Phase state ${st}`))
  const resumed = (n: string): boolean => after(cmd(n, 'Restart'), state(n, 'Running'))
  const full = (n: string): boolean => cmd(n, 'Start').length > 0 && cmd(n, 'Hold').length > 0 && state(n, 'Held').length > 0 && resumed(n)
  return [
    v('7016-4v-1', cmd('100', 'Start').length > 0, 'FILL started on UM_COLOR_100', 'Start FILL on UM_COLOR_100 and wait for the tank to begin filling'),
    v('7016-4v-2', cmd('100', 'Hold').length > 0, 'Hold sent', 'Phase Command ▸ Hold'),
    v('7016-4v-3', state('100', 'Held').length > 0, 'FILL reached Held (HOLD_LOGIC closed INLET_VLV)', 'Wait for Held and check XV-101 is CLOSED'),
    v('7016-4v-4', cmd('100', 'Restart').length > 0, 'Restart sent', 'Phase Command ▸ Restart'),
    v('7016-4v-5', resumed('100'), 'FILL returned to Running and COLOR_100 resumes filling', 'Wait for RESTART_LOGIC to open INLET_VLV and return to Running'),
    v('7016-4v-6', full('200') && full('300'), 'Hold/Restart verified on UM_COLOR_200 and UM_COLOR_300', `Repeat on ${['200', '300'].filter(n => !full(n)).map(n => `UM_COLOR_${n}`).join(', ')}`)
  ]
}

const hasLogic = (sfc: PhaseSfc | undefined): boolean => !!sfc && sfc.steps.some(s => s.actions.some(a => a.expression.trim()))

export function checkCourse7016Optional(s: Ch4State, log: EventLogEntry[]): StepCheck[] {
  const pc = s.phaseClasses.FILL
  const any = (re: RegExp): boolean => log.some(e => /^UM_COLOR_\d00\/FILL$/.test(e.tag) && re.test(e.description))
  const levelMet = pc?.logic.RUN_LOGIC.transitions.find(t => t.name.toUpperCase() === 'LEVEL_MET')?.condition ?? ''
  const plain = normExpr("'//#TANK_LEVEL#'>='/R_FILL_LEVEL.CV'")
  const compensated = !!levelMet.trim() && normExpr(levelMet) !== plain && /R_FILL_LEVEL/i.test(levelMet) && /[-+]/.test(normExpr(levelMet).replace(/'[^']*'/g, ''))
  const refs = [...normExpr(levelMet).matchAll(/'\/([A-Z0-9_$-]+)'/g)].map(m => m[1]).filter(n => n !== 'R_FILL_LEVEL')
  const perUnit = refs.some(p => {
    const vals = ['100', '200', '300'].map(n => s.units[`UM_COLOR_${n}`]?.phases.FILL?.paramValues[p] ?? pc?.params[p]?.defaultValue)
    return vals.every(x => x !== undefined) && new Set(vals.map(String)).size > 1
  })
  return [
    v('7016-4o-1', hasLogic(pc?.logic.STOP_LOGIC), 'STOP_LOGIC has saved steps and actions', 'Drill into STOP_LOGIC and add steps/transitions (for example close INLET_VLV and OUTLET_VLV), then Save'),
    v('7016-4o-2', any(/^Phase state Stopped/), 'A unit phase was Stopped through STOP_LOGIC', 'Download the unit phase, Start FILL, then Phase Command ▸ Stop and watch Stopping → Stopped'),
    v('7016-4o-3', hasLogic(pc?.logic.ABORT_LOGIC), 'ABORT_LOGIC has saved steps and actions', 'Drill into ABORT_LOGIC and add steps/transitions (for example close both valves immediately), then Save'),
    v('7016-4o-4', any(/^Phase state Aborted/), 'A unit phase was Aborted through ABORT_LOGIC', 'Download, Start FILL, then Phase Command ▸ Abort and watch Aborting → Aborted'),
    v('7016-4o-5', compensated, 'LEVEL_MET compensates for overshoot', `LEVEL_MET is ${levelMet || 'missing'}; subtract an overshoot (hard coded or a parameter) from R_FILL_LEVEL`),
    v('7016-4o-6', perUnit, 'Each color tank uses its own overshoot value', 'Add a phase parameter (for example OVERSHOOT) used in LEVEL_MET and give UM_COLOR_100/200/300 different values (unit phase ▸ parameter Properties)')
  ]
}

export type { CompositeName }
