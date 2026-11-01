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

/** CHG_BASE (Chapter 9, p9-9). BFI input order; the failure message numbers follow phase_failures: 5, 6, 8 and 9 exist from Chapters 6 and 7, 12-15 are new on slide 9-9. */
export const CHG_BASE_CONDITIONS = ['PRODUCT_VLV_OPEN', 'WASTE_VLV_OPEN', 'COLOR_VLV_OPEN', 'AGITATOR_RUNNING', 'MTR_403_STOPPED', 'FIC_404_CLOSED', 'BASE_VLV_CLOSED', 'PUMP_RUNNING'] as const
export const CHG_BASE_MESSAGES = [5, 6, 8, 9, 12, 13, 14, 15] as const
export const CHG_BASE_NEW_FAILURES = [['MTR_403_STOPPED', 12], ['FIC_404_CLOSED', 13], ['BASE_VLV_CLOSED', 14], ['PUMP_RUNNING', 15]] as const
/** Equipment ID of BASE_HEADER (slide 9-4): the REQUEST to acquire it is 4030 and 4230 releases it. */
export const BASE_HEADER_ID = 30
/** The charge stops this many seconds of flow early: the pump coasts and the block valve takes 2 s to close. */
export const CHG_BASE_COAST_SECONDS = 4

function buildChgBase(): PhaseClass {
  const pc = newPhaseClass('CHG_BASE', 'BlenderClasses')
  pc.description = 'Charges a blender with a specified amount of base product from BASE 400 at a specified rate. The base header is acquired for the charge and released afterwards.'
  const real = (name: string, direction: 'Input' | 'Report', group: string, id: number, low: number, defaultValue: number, high: number, units: string, description: string, kind: 'batch' | 'algorithm' = 'batch') =>
    ({ ...newParam(kind, {}), name, type: 'Real' as const, direction, group, id, low, high, defaultValue, units, description })
  pc.params.R_BASE_AMNT = real('R_BASE_AMNT', 'Input', 'Operating', 1, 0, 100, 1000, 'gal', 'Amount of base to charge')
  pc.params.R_BASE_RATE = real('R_BASE_RATE', 'Input', 'Operating', 2, 0, 90, 100, 'gpm', 'Charge rate (FIC-404 setpoint)')
  pc.params.RPT_FEED_AMNT = real('RPT_FEED_AMNT', 'Report', 'Report', 3, 0, 0, 1000, 'gal', 'Amount of base charged')
  pc.params.INIT_LEVEL = real('INIT_LEVEL', 'Input', 'Algorithm', 4, 0, 0, 1000, 'gal', 'Blender level when the charge started', 'algorithm')

  const alias = (name: string, p: string): string => `'//#${name}#/${p}'`
  const DIS = (name: string, v: 0 | 1): string => `'^/FAIL_MONITOR/${name}/DISABLE.CV' := ${v};`
  const confirmed = (expression: string, confirm: string, extra: Partial<ActionDef> = {}): ActionDef => act(expression, { confirm, confirmTimeout: 10, ...extra })
  const ALL = [...CHG_BASE_CONDITIONS]
  const REQUEST = (n: number): string => `'^/REQUEST.CV' := ${n};`
  const MTR = (p: string): string => `'//MTR-403/${p}'`
  const FIC = (p: string): string => `'//FIC-404/${p}'`
  const PUMP_START = `${MTR('CAS_SP.CV')} := 'mtr2-sp:START';`
  const PUMP_STOP = `${MTR('CAS_SP.CV')} := 'mtr2-sp:STOP';`
  const PUMP_RUNNING = `${MTR('DC1/PV_D.CV')} = 'mtr2-pv:RUNNING'`
  const PUMP_STOPPED = `${MTR('DC1/PV_D.CV')} = 'mtr2-pv:STOPPED'`
  const BASE_OPEN = `${alias('BASE_IN_VLV', 'CAS_SP.CV')} := 'vlvnc-sp:OPEN';`
  const BASE_CLOSE = `${alias('BASE_IN_VLV', 'CAS_SP.CV')} := 'vlvnc-sp:CLOSE';`
  const BASE_OPENED = `${alias('BASE_IN_VLV', 'PV.CV')} = 'vlvnc-pv:OPEN'`
  const BASE_CLOSED = `${alias('BASE_IN_VLV', 'PV.CV')} = 'vlvnc-pv:CLOSED'`
  const FIC_AUTO = `${FIC('MODE.TARGET')} := AUTO;`
  const FIC_RATE = `${FIC('SP.CV')} := '^/R_BASE_RATE.CV';`
  const FIC_ZERO = `${FIC('SP.CV')} := 0;`
  const modes = (v: string): string[] => [`${MTR('DC1/MODE.TARGET')} := ${v};`, `${alias('BASE_IN_VLV', 'MODE.TARGET')} := ${v};`]
  const level = "'//#TANK_LEVEL#'"
  const step = (n: number): string => `'^/STEP_INDEX.CV' := ${n};`

  pc.logic.RUN_LOGIC = sequence([
    ['INITIALIZE', [step(1), "'^/RPT_FEED_AMNT.CV' := 0;"]],
    ['ACQ_HEADER', [step(2), REQUEST(4000 + BASE_HEADER_ID)], "'^/REQUEST.CV' = 0"],
    ['SETUP_FLOW', [step(3), ...modes('CAS'), `'^/INIT_LEVEL.CV' := ${level};`, FIC_AUTO, FIC_RATE, confirmed(BASE_OPEN, BASE_OPENED)], "'/SETUP_FLOW/PENDING_CONFIRMS.CV' = 0"],
    ['START_PUMP', [step(4), PUMP_START], PUMP_RUNNING],
    ['ESTABLISH_FLOW', [step(5)], `${FIC('OUT.CV')} > 0`],
    ['CHARGE', [step(6), ...ALL.map(n => DIS(n, 0))],
      `${level} >= '^/INIT_LEVEL.CV' + '^/R_BASE_AMNT.CV' - '^/R_BASE_RATE.CV' / 60 * ${CHG_BASE_COAST_SECONDS}`],
    ['STOP_PUMP', [step(7), DIS('MTR_403_STOPPED', 1), DIS('FIC_404_CLOSED', 1), PUMP_STOP], PUMP_STOPPED],
    ['CLOSE_BASE_VLV', [step(8), DIS('BASE_VLV_CLOSED', 1), FIC_ZERO, confirmed(BASE_CLOSE, BASE_CLOSED)], "'/CLOSE_BASE_VLV/PENDING_CONFIRMS.CV' = 0"],
    ['RELEASE_HEADER', [step(0), ...ALL.map(n => DIS(n, 1)), ...modes('AUTO'), `'^/RPT_FEED_AMNT.CV' := ${level} - '^/INIT_LEVEL.CV';`, REQUEST(4200 + BASE_HEADER_ID)], "'^/REQUEST.CV' = 0"]
  ])

  const conditions = [`${alias('BLNDR_OUTLET', 'PRODUCT_VLV/PV.CV')} = 'vlvnc-pv:OPEN'`, `${alias('BLNDR_OUTLET', 'WASTE_VLV/PV.CV')} = 'vlvnc-pv:OPEN'`,
    `${alias('BLNDR_COLOR', 'COLOR_IN_VLV/PV.CV')} != 'vlvnc-2stage-pv:CLOSED'`, `${alias('AGITATOR', 'DC1/PV_D.CV')} = 'mtr2-pv:RUNNING'`,
    PUMP_STOPPED, `${FIC('OUT.CV')} <= 0`, BASE_CLOSED, `${alias('OUT_PUMP', 'DC1/PV_D.CV')} = 'mtr2-pv:RUNNING'`]
  const fm = Object.fromEntries(ALL.map((name, i) => [name, { type: 'CND' as const, expression: conditions[i], inputs: [], disabled: true }]))
  const k = "LOG2(2, 'IN1.CV')"
  const blocks: NonNullable<PhaseSfc['blocks']> = {
    ...fm,
    BFI1: { type: 'BFI', expression: '', disabled: false, inputs: ALL.map(n => `/${n}/OUT_D.CV`) },
    // FIRST_OUT is 2^(n-1) for input n; inputs 1-2, 3-4 and 5-8 map to messages 5-6, 8-9 and 12-15.
    MESSAGE: { type: 'CALC', inputs: ['/BFI1/FIRST_OUT.CV'], disabled: false, expression: `'OUT1.CV' := 'IN1.CV' != 0 ? ${k} + (${k} < 2 ? 5 : (${k} < 4 ? 6 : 8)) : 0;` },
    BLOCK1: { type: 'CALC', inputs: [], disabled: false, expression: "if ( '^/BFI1/OUT_D.CV' != 0 ) and ( '/+/FAIL_INDEX.CV' = 0 ) then\n  '/+/FAIL_INDEX.CV' := '^/MESSAGE/OUT1.CV';\nendif;" }
  }
  pc.logic.FAIL_MONITOR = { ...pc.logic.FAIL_MONITOR, blocks }

  const secure = (): ActionDef[] => [confirmed(PUMP_STOP, PUMP_STOPPED), act(FIC_ZERO), confirmed(BASE_CLOSE, BASE_CLOSED)]
  pc.logic.HOLD_LOGIC = sequence([
    ['HOLD_STATE', ALL.map(n => DIS(n, 1))],
    ['NULL', []],
    ['SECURE', [...modes('CAS'), ...secure()], "'/SECURE/PENDING_CONFIRMS.CV' = 0"],
    ['HELD', []]
  ])
  pc.logic.HOLD_LOGIC.routes = [
    route('NULL', 'SECURE', "'^/FAIL_INDEX.CV' != 0 OR ('^/STEP_INDEX.CV' >= 3 AND '^/STEP_INDEX.CV' <= 8)"),
    route('NULL', 'HELD', 'TRUE'),
    route('SECURE', 'HELD', "'/SECURE/PENDING_CONFIRMS.CV' = 0")
  ]

  pc.logic.RESTART_LOGIC = sequence([
    ['RESTARTING', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:Continue';", "'^/FAIL_MONITOR/BFI1/RESET_IN.CV' := 1;"]],
    ['RESTART_TOP', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:From_Start';"]],
    ['RESTORE', [...modes('CAS'), FIC_AUTO, FIC_RATE, confirmed(BASE_OPEN, BASE_OPENED)], "'/RESTORE/PENDING_CONFIRMS.CV' = 0"],
    ['START_PUMP', [PUMP_START], PUMP_RUNNING],
    ['ENABLE_PC', ALL.map(n => DIS(n, 0))],
    ['NULL', []]
  ])
  const PENDING = "'/RESTORE/PENDING_CONFIRMS.CV' = 0"
  pc.logic.RESTART_LOGIC.routes = [
    route('RESTARTING', 'RESTART_TOP', "'^/STEP_INDEX.CV' = 1 OR '^/STEP_INDEX.CV' = 2"),
    route('RESTARTING', 'RESTORE', "'^/STEP_INDEX.CV' >= 3 AND '^/STEP_INDEX.CV' <= 6"),
    route('RESTARTING', 'NULL', 'TRUE'),
    route('RESTART_TOP', 'NULL', 'TRUE'),
    route('RESTORE', 'START_PUMP', `${PENDING} AND '^/STEP_INDEX.CV' >= 4`),
    route('RESTORE', 'NULL', `${PENDING} AND '^/STEP_INDEX.CV' = 3`),
    route('START_PUMP', 'ENABLE_PC', `${PUMP_RUNNING} AND '^/STEP_INDEX.CV' = 6`),
    route('START_PUMP', 'NULL', PUMP_RUNNING),
    route('ENABLE_PC', 'NULL', 'TRUE')
  ]

  for (const c of ['STOP_LOGIC', 'ABORT_LOGIC'] as const)
    pc.logic[c] = sequence([['SAFE', [...ALL.map(n => DIS(n, 1)), ...modes('CAS'), PUMP_STOP, FIC_ZERO, BASE_CLOSE], `${PUMP_STOPPED} AND ${BASE_CLOSED}`]])
  return pc
}

export const PHASE_IMPORT_FILES: PhaseImportFile[] = [
  { file: 'DRAIN.fhx', phaseClass: 'DRAIN', category: 'BlenderClasses', build: buildDrain,
    description: 'DRAIN: drains a blender to R_DRAIN_LEVEL (0-250-1000 gal) and reports RPT_AMNT_DRAINED. Failure conditions: BASE_IN_VLV open, COLOR_IN_VLV open, AGITATOR running, OUT_PUMP stopped, PRODUCT_VLV closed.' },
  { file: 'CHG_BASE.fhx', phaseClass: 'CHG_BASE', category: 'BlenderClasses', build: buildChgBase,
    description: 'CHG_BASE: charges a blender with R_BASE_AMNT (0-1000 gal) of base at R_BASE_RATE (0-100 gpm) through BASE_IN_VLV, MTR-403 and FIC-404 and reports RPT_FEED_AMNT. Acquires and releases BASE_HEADER (REQUEST 4030 / 4230). Failure conditions: MTR_403 stopped, FIC_404 closed, BASE_IN_VLV closed, OUT_PUMP running, product / waste outlet valve open, COLOR_IN_VLV open, AGITATOR running.' }
]
