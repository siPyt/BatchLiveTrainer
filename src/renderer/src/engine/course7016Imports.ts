import { newId, newParam, newPhaseClass, type ActionDef, type PhaseClass, type PhaseRoute, type PhaseSfc } from './batchConfig'

// Course 7016 Chapter 7 (p7-4): "Import a phase that will drain the Blenders to a specified level". The course ships the
// phase as a file on the training disk; here it is offered by Explorer > Import Phase Class... and builds the same
// phase class: R_DRAIN_LEVEL / RPT_AMNT_DRAINED and the failure monitor for the five drain conditions.

export interface PhaseImportFile {
  file: string
  phaseClass: string
  category: string
  description: string
  build: () => PhaseClass
}

const act = (expression: string, extra: Partial<ActionDef> = {}): ActionDef =>
  ({ name: newId('A'), description: '', type: 'Assignment', qualifier: 'P', time: 0, expression, ...extra })

function sequence(rows: [string, (string | ActionDef)[], string?][]): PhaseSfc {
  return {
    steps: rows.map(([name, actions]) => ({ id: newId('s'), name, description: '', actions: actions.map(a => typeof a === 'string' ? act(a) : a) })),
    transitions: rows.map(([name, , condition = 'TRUE']) => ({ id: newId('t'), name: `T_${name}`.slice(0, 16), description: '', condition }))
  }
}

const route = (from: string, to: string, condition: string): PhaseRoute => ({ from, to, condition })

/** Failure conditions, in BFI input order. FIRST_OUT is 2^(n-1) for input n, so message = LOG2 + 7 gives 7, 8, 9, 10, 11 (BASE_IN_VLV and COLOR_IN_VLV reuse 7 and 8 from AGITATE). */
export const DRAIN_CONDITIONS = ['BASE_VLV_OPEN', 'COLOR_VLV_OPEN', 'AGITATOR_RUNNING', 'PUMP_STOPPED', 'PRODUCT_VLV_CLOSED'] as const
export const DRAIN_MESSAGE_OFFSET = 7

function buildDrain(): PhaseClass {
  const pc = newPhaseClass('DRAIN', 'BlenderClasses')
  pc.description = 'Drains a blender to a specified level through the outlet pump. The blender is sealed off and the agitator stays stopped.'
  pc.params.R_DRAIN_LEVEL = { ...newParam('batch', {}), name: 'R_DRAIN_LEVEL', type: 'Real', direction: 'Input', group: 'Operating', id: 1,
    low: 0, high: 1000, defaultValue: 250, units: 'gal', description: 'Drain the blender down to this level' }
  pc.params.RPT_AMNT_DRAINED = { ...newParam('batch', {}), name: 'RPT_AMNT_DRAINED', type: 'Real', direction: 'Report', group: 'Report', id: 2,
    low: 0, high: 1000, defaultValue: 0, units: 'gal', description: 'Amount drained from the blender' }

  const alias = (name: string, p: string): string => `'//#${name}#/${p}'`
  const DIS = (name: string, v: 0 | 1): string => `'^/FAIL_MONITOR/${name}/DISABLE.CV' := ${v};`
  const confirmed = (expression: string, confirm: string, extra: Partial<ActionDef> = {}): ActionDef => act(expression, { confirm, confirmTimeout: 10, ...extra })
  const ALL = [...DRAIN_CONDITIONS]
  const PUMP_STOP = `${alias('OUT_PUMP', 'CAS_SP.CV')} := 'mtr2-sp:STOP';`
  const PUMP_START = `${alias('OUT_PUMP', 'CAS_SP.CV')} := 'mtr2-sp:START';`
  const PUMP_STOPPED = `${alias('OUT_PUMP', 'DC1/PV_D.CV')} = 'mtr2-pv:STOPPED'`
  const PUMP_RUNNING = `${alias('OUT_PUMP', 'DC1/PV_D.CV')} = 'mtr2-pv:RUNNING'`
  const AGIT_STOP = `${alias('AGITATOR', 'CAS_SP.CV')} := 'mtr2-sp:STOP';`
  const AGIT_STOPPED = `${alias('AGITATOR', 'DC1/PV_D.CV')} = 'mtr2-pv:STOPPED'`
  const outlet = (state: string): [string, string] => [`${alias('BLNDR_OUTLET', 'A_COMMAND.CV')} := 'EM_Outlet_State:${state}';`, `${alias('BLNDR_OUTLET', 'A_PV.CV')} = 'EM_Outlet_State:${state}'`]
  const [OUTLET_PRODUCT, OUTLET_PRODUCT_PV] = outlet('Releasing Product - CAS')
  const [OUTLET_CLOSE, OUTLET_CLOSE_PV] = outlet('Closed - CAS')
  const BASE_CLOSE = `${alias('BASE_IN_VLV', 'CAS_SP.CV')} := 'vlvnc-sp:CLOSE';`
  const BASE_CLOSED = `${alias('BASE_IN_VLV', 'PV.CV')} = 'vlvnc-pv:CLOSED'`
  const COLOR_CLOSE = `${alias('BLNDR_COLOR', 'A_COMMAND.CV')} := 'EM-vlvnc-2stage:Close';`
  const COLOR_CLOSED = `${alias('BLNDR_COLOR', 'A_PV.CV')} = 'EM-vlvnc-2stage:Close'`
  const modes = (v: string): string[] => [`${alias('OUT_PUMP', 'DC1/MODE.TARGET')} := ${v};`, `${alias('BASE_IN_VLV', 'MODE.TARGET')} := ${v};`, `${alias('AGITATOR', 'DC1/MODE.TARGET')} := ${v};`]

  pc.logic.RUN_LOGIC = sequence([
    ['INITIALIZE_MODES', ["'^/STEP_INDEX.CV' := 1;", ...modes('CAS'), "'^/RPT_AMNT_DRAINED.CV' := '//#TANK_LEVEL#';"]],
    ['SEAL_BLENDER', ["'^/STEP_INDEX.CV' := 2;", confirmed(PUMP_STOP, PUMP_STOPPED), confirmed(AGIT_STOP, AGIT_STOPPED), confirmed(BASE_CLOSE, BASE_CLOSED),
      confirmed(COLOR_CLOSE, COLOR_CLOSED)], "'/SEAL_BLENDER/PENDING_CONFIRMS.CV' = 0"],
    ['OPEN_OUTLET', ["'^/STEP_INDEX.CV' := 3;", confirmed(OUTLET_PRODUCT, OUTLET_PRODUCT_PV)], "'/OPEN_OUTLET/PENDING_CONFIRMS.CV' = 0"],
    ['START_PUMP', ["'^/STEP_INDEX.CV' := 4;", PUMP_START, ...ALL.filter(n => n !== 'PUMP_STOPPED').map(n => DIS(n, 0))], PUMP_RUNNING],
    ['DRAIN_TO_LEVEL', ["'^/STEP_INDEX.CV' := 5;", DIS('PUMP_STOPPED', 0)], "'//#TANK_LEVEL#' <= '^/R_DRAIN_LEVEL.CV'"],
    ['STOP_PUMP', ["'^/STEP_INDEX.CV' := 6;", DIS('PUMP_STOPPED', 1), act(PUMP_STOP, { delayExpression: "'^/FAIL_MONITOR/PUMP_STOPPED/DISABLE.CV' = 1" })], PUMP_STOPPED],
    ['CLOSE_OUTLET', ["'^/STEP_INDEX.CV' := 7;", ...ALL.map(n => DIS(n, 1)), confirmed(OUTLET_CLOSE, OUTLET_CLOSE_PV)], "'/CLOSE_OUTLET/PENDING_CONFIRMS.CV' = 0"],
    ['RESET_EQUIP', ["'^/STEP_INDEX.CV' := 0;", ...modes('AUTO'), `${alias('BLNDR_OUTLET', 'A_COMMAND.CV')} := 'EM_Outlet_State:Auto Mode';`,
      `${alias('BLNDR_COLOR', 'A_COMMAND.CV')} := 'EM-vlvnc-2stage:Auto Mode';`, "'^/RPT_AMNT_DRAINED.CV' := '^/RPT_AMNT_DRAINED.CV' - '//#TANK_LEVEL#';"], "'/RESET_EQUIP/TIME.CV' >= 3"]
  ])

  const conditions = [`${alias('BASE_IN_VLV', 'PV.CV')} = 'vlvnc-pv:OPEN'`, `${alias('BLNDR_COLOR', 'COLOR_IN_VLV/PV.CV')} != 'vlvnc-2stage-pv:CLOSED'`,
    `${alias('AGITATOR', 'DC1/PV_D.CV')} = 'mtr2-pv:RUNNING'`, PUMP_STOPPED, `${alias('BLNDR_OUTLET', 'PRODUCT_VLV/PV.CV')} = 'vlvnc-pv:CLOSED'`]
  const fm = Object.fromEntries(ALL.map((name, i) => [name, { type: 'CND' as const, expression: conditions[i], inputs: [], disabled: true }]))
  const blocks: NonNullable<PhaseSfc['blocks']> = {
    ...fm,
    BFI1: { type: 'BFI', expression: '', disabled: false, inputs: ALL.map(n => `/${n}/OUT_D.CV`) },
    MESSAGE: { type: 'CALC', inputs: ['/BFI1/FIRST_OUT.CV'], disabled: false, expression: `'OUT1.CV' := 'IN1.CV' != 0 ? LOG2(2, 'IN1.CV') + ${DRAIN_MESSAGE_OFFSET} : 0;` },
    BLOCK1: { type: 'CALC', inputs: [], disabled: false, expression: "if ( '^/BFI1/OUT_D.CV' != 0 ) and ( '/+/FAIL_INDEX.CV' = 0 ) then\n  '/+/FAIL_INDEX.CV' := '^/MESSAGE/OUT1.CV';\nendif;" }
  }
  pc.logic.FAIL_MONITOR = { ...pc.logic.FAIL_MONITOR, blocks }

  pc.logic.HOLD_LOGIC = sequence([
    ['HOLD_STATE', ALL.map(n => DIS(n, 1))],
    ['NULL', []],
    ['FAIL_SAFE', [...modes('CAS'), confirmed(COLOR_CLOSE, COLOR_CLOSED), confirmed(BASE_CLOSE, BASE_CLOSED), confirmed(PUMP_STOP, PUMP_STOPPED), confirmed(AGIT_STOP, AGIT_STOPPED),
      act(OUTLET_CLOSE, { delayExpression: PUMP_STOPPED, confirm: OUTLET_CLOSE_PV, confirmTimeout: 10 })], "'/FAIL_SAFE/PENDING_CONFIRMS.CV' = 0"],
    ['STOP_PUMP', [`${alias('OUT_PUMP', 'DC1/MODE.TARGET')} := CAS;`, PUMP_STOP], PUMP_STOPPED],
    ['HELD', []]
  ])
  pc.logic.HOLD_LOGIC.routes = [
    route('NULL', 'FAIL_SAFE', "'^/FAIL_INDEX.CV' != 0"),
    route('NULL', 'STOP_PUMP', "'^/STEP_INDEX.CV' = 4 OR '^/STEP_INDEX.CV' = 5"),
    route('NULL', 'HELD', 'TRUE'),
    route('FAIL_SAFE', 'HELD', "'/FAIL_SAFE/PENDING_CONFIRMS.CV' = 0")
  ]

  pc.logic.RESTART_LOGIC = sequence([
    ['RESTARTING', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:Continue';", "'^/FAIL_MONITOR/BFI1/RESET_IN.CV' := 1;"]],
    ['RESTART_TOP', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:From_Start';"]],
    ['RESTORE_OUTLET', [...modes('CAS'), confirmed(OUTLET_PRODUCT, OUTLET_PRODUCT_PV)], "'/RESTORE_OUTLET/PENDING_CONFIRMS.CV' = 0"],
    ['START_PUMP', [PUMP_START], PUMP_RUNNING],
    ['ENABLE_PC', ALL.map(n => DIS(n, 0))],
    ['NULL', []]
  ])
  const PENDING = "'/RESTORE_OUTLET/PENDING_CONFIRMS.CV' = 0"
  pc.logic.RESTART_LOGIC.routes = [
    route('RESTARTING', 'RESTART_TOP', "'^/STEP_INDEX.CV' = 1 OR '^/STEP_INDEX.CV' = 2"),
    route('RESTARTING', 'RESTORE_OUTLET', "'^/STEP_INDEX.CV' >= 3 AND '^/STEP_INDEX.CV' <= 5"),
    route('RESTARTING', 'NULL', 'TRUE'),
    route('RESTART_TOP', 'NULL', 'TRUE'),
    route('RESTORE_OUTLET', 'START_PUMP', `${PENDING} AND ('^/STEP_INDEX.CV' = 4 OR '^/STEP_INDEX.CV' = 5)`),
    route('RESTORE_OUTLET', 'NULL', `${PENDING} AND '^/STEP_INDEX.CV' = 3`),
    route('START_PUMP', 'ENABLE_PC', PUMP_RUNNING),
    route('ENABLE_PC', 'NULL', 'TRUE')
  ]

  for (const c of ['STOP_LOGIC', 'ABORT_LOGIC'] as const)
    pc.logic[c] = sequence([['SAFE', [...ALL.map(n => DIS(n, 1)), PUMP_STOP], PUMP_STOPPED]])
  return pc
}

export const PHASE_IMPORT_FILES: PhaseImportFile[] = [
  { file: 'DRAIN.fhx', phaseClass: 'DRAIN', category: 'BlenderClasses', build: buildDrain,
    description: 'DRAIN: drains a blender to R_DRAIN_LEVEL (0-250-1000 gal) and reports RPT_AMNT_DRAINED. Failure conditions: BASE_IN_VLV open, COLOR_IN_VLV open, AGITATOR running, OUT_PUMP stopped, PRODUCT_VLV closed.' }
]
