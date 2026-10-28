const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, filename)
}
const { useStore } = require('../src/renderer/src/engine/store.ts')
const { useLibrary } = require('../src/renderer/src/engine/libraryStore.ts')
const { useBatch, phaseCheckEnv, readModulePath } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm } = require('../src/renderer/src/engine/emStore.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const expr = require('../src/renderer/src/engine/phaseExpr.ts')
const { courseSnapshot, restoreCourseDatabase } = require('../src/renderer/src/engine/courseSave.ts')
const { checkCourse7016Ch6 } = require('../src/renderer/src/engine/course7016Ch6Checks.ts')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const rt = unit => B().active[`${unit}/AGITATE`].rt
function until(unit, predicate, max = 30) {
  for (let i = 0; i < max * 10 && !predicate(rt(unit)); i++) tick()
  assert.ok(predicate(rt(unit)), `${unit}: ${JSON.stringify(rt(unit))}`)
}
function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installCourseProject(), true)
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}
const act = (expression, extra = {}) => ({
  name: cfg.newId('A'), description: '', type: 'Assignment', qualifier: 'P', time: 0, expression, ...extra
})
function sequence(rows) {
  return {
    steps: rows.map(([name, actions]) => ({ id: cfg.newId('s'), name, description: '', actions: actions.map(a => typeof a === 'string' ? act(a) : a) })),
    transitions: rows.map(([name, , condition = 'TRUE']) => ({ id: cfg.newId('t'), name: `T_${name}`.slice(0, 16), description: '', condition }))
  }
}
const alias = (name, p) => `'//#${name}#/${p}'`
const mode = (name, m = 'CAS') => `${alias(name, 'MODE.TARGET')} := ${m};`
const command = (name, on) => `${alias(name, 'CAS_SP.CV')} := ${on};`
const feedback = (name, v) => `${alias(name, 'PV_D.CV')} = ${v}`
const confirmed = (name, v) => act(command(name, v), { confirm: feedback(name, v), confirmTimeout: 10 })
const emCmd = (name, v) => `${alias(name, 'A_COMMAND.CV')} := ${v};`
const emConfirmed = (name, v) => act(emCmd(name, v), { confirm: `${alias(name, 'A_PV.CV')} = ${v}`, confirmTimeout: 10 })
const index = n => `'^/STEP_INDEX.CV' := ${n};`
const timer = (p, v) => `'^/RUN_LOGIC/BLEND_TIMER/${p}.CV' := ${v};`
const CND = ['AGITATOR_STOPPED', 'PRODUCT_VLV_OPEN', 'WASTE_VLV_OPEN', 'BASE_VLV_OPEN', 'COLOR_VLV_OPEN']
const enable = (names, disabled) => names.map(n => `'^/FAIL_MONITOR/${n}/DISABLE.CV' := ${disabled};`).join('\n')

function blenders() {
  value(E().renameCategory(value(E().newCategory(null)), 'General'))
  for (const n of [5, 6]) for (const tag of [`AGIT-${n}03`, `MTR-${n}05`, `XV-${n}01`, `XV-${n}02`, `XV-${n}03`, `XV-${n}04`]) {
    value(B().unassignModule(tag)); value(B().deleteCourseModule(tag))
  }
  value(E().newClass('General', 'BLENDER_COLOR', 'Command driven', 'EM-vlvnc-2stage'))
  value(E().renameChild('BLENDER_COLOR', value(E().addChild('BLENDER_COLOR', '2STAGE_VALVE')), 'COLOR_IN_VLV'))
  value(E().editDraft('BLENDER_COLOR', d => {
    for (const [n, cmd] of Object.entries(d.commands)) cmd.sfc = sequence([['COMMAND', [
      `'^/COLOR_IN_VLV/MODE.TARGET' := ${Number(n) === 4 ? 'AUTO' : 'CAS'};`,
      ...(Number(n) === 4 ? [] : [`'^/COLOR_IN_VLV/CAS_SP.CV' := ${Number(n) - 1};`])
    ]]])
  }))
  value(E().saveClass('BLENDER_COLOR'))
  value(E().newClass('General', 'BLENDER_OUTLET', 'State driven', 'EM_Outlet_State'))
  for (const name of ['PRODUCT_VLV', 'WASTE_VLV']) value(E().renameChild('BLENDER_OUTLET', value(E().addChild('BLENDER_OUTLET', 'NC_VALVE')), name))
  value(E().editDraft('BLENDER_OUTLET', d => {
    d.items = ['PRODUCT_VLV', 'WASTE_VLV'].flatMap(n => [
      { name: `${n}_MODE`, write: `${n}/MODE.TARGET`, readback: `${n}/MODE.ACTUAL` },
      { name: `${n}_SP`, write: `${n}/CAS_SP.CV`, readback: `${n}/PV.CV` }
    ])
    for (const n of [1, 2, 3, 4]) d.states[n] = Object.fromEntries(['PRODUCT_VLV', 'WASTE_VLV'].flatMap(v => [
      [`${v}_MODE`, n === 4 ? 'Auto' : 'Cascade'],
      [`${v}_SP`, (v === 'PRODUCT_VLV' && n === 3) || (v === 'WASTE_VLV' && n === 2) ? 'OPEN' : 'CLOSE']
    ]))
  }))
  value(E().saveClass('BLENDER_OUTLET'))
  value(B().renameClass('pcell', value(B().newProcessCellClass('General')), 'PRODUCTION'))
  value(B().renameProcessCell(value(B().createProcessCell('PRODUCTION', 'ED_CENTER_BATCH')), 'PAINT_PRODUCTION'))
  value(B().newUnitClass('General', 'BLENDERS'))
  for (const [cls, name] of [['BLENDER_COLOR', 'BLNDR_COLOR'], ['BLENDER_OUTLET', 'BLNDR_OUTLET'], ['AGIT_MTR', 'AGITATOR'], ['OUT_PMP', 'OUT_PUMP'], ['NC_VALVE', 'BASE_IN_VLV']]) {
    value(B().renameModuleBlock('BLENDERS', value(B().addModuleBlock('BLENDERS', cls, 'Private', true)), name))
  }
  for (const n of [5, 6]) value(B().renameUnitModule(value(B().createUnitModule('BLENDERS', 'PAINT_PRODUCTION')), `UM_BL_${n}00`))
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  value(L().downloadController('CTLR1'))
}

function guideLogic(d) {
  const A = (expression, extra = {}) => act(expression, extra)
  const DIS = (n, v) => `'^/FAIL_MONITOR/${n}/DISABLE.CV' := ${v};`
  const ALL5 = ['AGITATOR_STOPPED', 'PRODUCT_VLV_OPEN', 'WASTE_VLV_OPEN', 'BASE_VLV_OPEN', 'COLOR_VLV_OPEN']
  const confirmedG = (action, confirm, extra = {}) => A(action, { confirm, confirmTimeout: 10, ...extra })
  const PUMP_STOP = "'//#OUT_PUMP#/CAS_SP.CV' := 'mtr2-sp:STOP';", PUMP_STOPPED = "'//#OUT_PUMP#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'"
  const OUTLET_CLOSE = "'//#BLNDR_OUTLET#/A_COMMAND.CV' := 'EM-Outlet_State:Closed - CAS';", OUTLET_CLOSED = "'//#BLNDR_OUTLET#/A_PV.CV' = 'EM-Outlet_State:Closed - CAS'"
  const COLOR_CLOSE = "'//#BLNDR_COLOR#/A_COMMAND.CV' := 'EM-vlvnc-2stage:Close';", COLOR_CLOSED = "'//#BLNDR_COLOR#/A_PV.CV' = 'EM-vlvnc-2stage:Close'"
  const BASE_CLOSE = "'//#BASE_IN_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';", BASE_CLOSED = "'//#BASE_IN_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"
  const AGIT_CAS = "'//#AGITATOR#/DC1/MODE.TARGET' := CAS;", AGIT_STOP = "'//#AGITATOR#/CAS_SP.CV' := 'mtr2-sp:STOP';"
  const AGIT_STOPPED = "'//#AGITATOR#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'", AGIT_RUNNING = "'//#AGITATOR#/DC1/PV_D.CV' = 'mtr2-pv:RUNNING'"
  // The guide prints ^ as the modifier letter U+02C6 (it comes from the course PDF text); it must be accepted as well.
  d.logic.RUN_LOGIC = sequence([
    ['INITIALIZE_MODES', ["'\u02C6/STEP_INDEX.CV' := 1;", "'//#OUT_PUMP#/DC1/MODE.TARGET' := CAS;", "'//#BASE_IN_VLV#/MODE.TARGET' := CAS;", "'/BLEND_TIMER/RESET.CV' := 1;"]],
    ['INITIALIZE_EQUIP', ["'^/STEP_INDEX.CV' := 2;", confirmedG(PUMP_STOP, PUMP_STOPPED), confirmedG(OUTLET_CLOSE, OUTLET_CLOSED),
      confirmedG(BASE_CLOSE, BASE_CLOSED), confirmedG(COLOR_CLOSE, COLOR_CLOSED)], "'/INITIALIZE_EQUIP/PENDING_CONFIRMS.CV' = 0"],
    ['START_AGIT', ["'^/STEP_INDEX.CV' := 3;", AGIT_CAS, "'//#AGITATOR#/CAS_SP.CV' := 'mtr2-sp:START';", DIS('PRODUCT_VLV_OPEN', 0), DIS('WASTE_VLV_OPEN', 0),
      DIS('BASE_VLV_OPEN', 0), DIS('COLOR_VLV_OPEN', 0)], AGIT_RUNNING],
    ['START_TIMER', ["'^/STEP_INDEX.CV' := 4;", A("'/BLEND_TIMER'", { name: 'BLEND_TIMER', type: 'Non-Boolean', qualifier: 'N' }),
      "'/BLEND_TIMER/START.CV' := 1;", "'/BLEND_TIMER/TIME_DURATION.CV' := '^/R_BLEND_TIME.CV';", DIS('AGITATOR_STOPPED', 0)],
      "'/BLEND_TIMER/ELAPSED_TIME.CV' >= '^/R_BLEND_TIME.CV'"],
    ['STOP_AGIT', ["'^/STEP_INDEX.CV' := 5;", AGIT_CAS, DIS('AGITATOR_STOPPED', 1), A(AGIT_STOP, { delayExpression: "'^/FAIL_MONITOR/AGITATOR_STOPPED/DISABLE.CV' = 1" })], AGIT_STOPPED],
    ['RESET_EQUIP', ["'^/STEP_INDEX.CV' := 0;", "'//#OUT_PUMP#/DC1/MODE.TARGET' := AUTO;", "'//#BASE_IN_VLV#/MODE.TARGET' := AUTO;",
      "'//#BLNDR_OUTLET#/A_COMMAND.CV' := 'EM-Outlet_State:Auto Mode';", "'//#BLNDR_COLOR#/A_COMMAND.CV' := 'EM-vlvnc-2stage:Auto mode';",
      "'//#AGITATOR#/DC1/MODE.TARGET' := AUTO;", "'^/RPT_BLEND_TIME.CV' := '/BLEND_TIMER/ELAPSED_TIME.CV';", "'/BLEND_TIMER/START.CV' := 0;",
      "'/BLEND_TIMER/RESET.CV' := 1;", DIS('PRODUCT_VLV_OPEN', 1), DIS('WASTE_VLV_OPEN', 1), DIS('BASE_VLV_OPEN', 1), DIS('COLOR_VLV_OPEN', 1)], "'/RESET_EQUIP/TIME.CV' >= 3"]
  ])
  d.logic.RUN_LOGIC.blocks = { BLEND_TIMER: { type: 'TIMER_SEC', expression: '', inputs: [], disabled: false } }
  const conditions = ["'//#AGITATOR#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'", "'//#BLNDR_OUTLET#/PRODUCT_VLV/PV.CV' = 'vlvnc-pv:OPEN'",
    "'//#BLNDR_OUTLET#/WASTE_VLV/PV.CV' = 'vlvnc-pv:OPEN'", "'//#BASE_IN_VLV#/PV.CV' = 'vlvnc-pv:OPEN'", "'//#BLNDR_COLOR#/COLOR_IN_VLV/PV.CV' != 'vlvnc-2stage-pv:CLOSED'"]
  const fm = Object.fromEntries(ALL5.map((name, i) => [name, { type: 'CND', expression: conditions[i], inputs: [], disabled: true }]))
  fm.BFI1 = { type: 'BFI', expression: '', disabled: false, inputs: ALL5.map(n => `/${n}/OUT_D.CV`) }
  fm.MESSAGE = { type: 'CALC', inputs: ['/BFI1/FIRST_OUT.CV'], disabled: false,
    expression: "IF 'IN1.CV' > 0 THEN\n    'OUT1.CV' := (LN('IN1.CV') / LN(2)) + 4;\nELSE\n    'OUT1.CV' := 0;\nENDIF;" }
  fm.BLOCK1 = { type: 'CALC', inputs: [], disabled: false,
    expression: "IF ('^/FAIL_INDEX.CV' = 0) AND ('/BFI1/OUT_D.CV' = 1) THEN\n    '^/FAIL_INDEX.CV' := '/MESSAGE/OUT1.CV';\nENDIF;" }
  d.logic.FAIL_MONITOR.blocks = fm
  d.logic.HOLD_LOGIC = sequence([
    ['HOLD_STATE', [...ALL5.map(n => DIS(n, 1)), "'^/RUN_LOGIC/BLEND_TIMER/START.CV' := 0;"]],
    ['NULL', []],
    ['FAIL_SAFE', ["'//#BASE_IN_VLV#/MODE.TARGET' := CAS;", "'//#OUT_PUMP#/DC1/MODE.TARGET' := CAS;", AGIT_CAS, confirmedG(COLOR_CLOSE, COLOR_CLOSED),
      confirmedG(BASE_CLOSE, BASE_CLOSED), confirmedG(PUMP_STOP, PUMP_STOPPED),
      A(OUTLET_CLOSE, { delayExpression: PUMP_STOPPED, confirm: OUTLET_CLOSED, confirmTimeout: 10 }), confirmedG(AGIT_STOP, "'//#AGITATOR#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'")]],
    ['STOP_AGITATOR', [AGIT_CAS, AGIT_STOP], AGIT_STOPPED],
    ['NULL1', []]
  ])
  d.logic.HOLD_LOGIC.routes = [
    { from: 'NULL', to: 'FAIL_SAFE', condition: "'^/FAIL_INDEX.CV' != 0" },
    { from: 'NULL', to: 'STOP_AGITATOR', condition: "'^/FAIL_INDEX.CV' = 0 AND ('^/STEP_INDEX.CV' = 3 OR '^/STEP_INDEX.CV' = 4)" },
    { from: 'NULL', to: 'NULL1', condition: "'^/FAIL_INDEX.CV' = 0 AND ('^/STEP_INDEX.CV' != 3 AND '^/STEP_INDEX.CV' != 4)" },
    { from: 'FAIL_SAFE', to: 'NULL1', condition: "'/FAIL_SAFE/PENDING_CONFIRMS.CV' = 0" }
  ]
  d.logic.RESTART_LOGIC = sequence([
    ['RESTARTING', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:Continue';", "'^/FAIL_MONITOR/BFI1/RESET_IN.CV' := 1;"]],
    ['RESTART_TOP', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:From_Start';"]],
    ['START_AGITATOR', [AGIT_CAS, "'//#AGITATOR#/CAS_SP.CV' := 'mtr2-sp:START';"], AGIT_RUNNING],
    ['ENABLE_PC', ALL5.map(n => DIS(n, 0))],
    ['INIT_TIMER', ["'^/RUN_LOGIC/BLEND_TIMER/START.CV' := 1;"]],
    ['NULL', []]
  ])
  d.logic.RESTART_LOGIC.routes = [
    { from: 'RESTARTING', to: 'RESTART_TOP', condition: "'^/STEP_INDEX.CV' = 1 OR '^/STEP_INDEX.CV' = 2" },
    { from: 'RESTARTING', to: 'START_AGITATOR', condition: "'^/STEP_INDEX.CV' = 3 OR '^/STEP_INDEX.CV' = 4" },
    { from: 'RESTARTING', to: 'NULL', condition: 'TRUE' },
    { from: 'RESTART_TOP', to: 'NULL', condition: 'TRUE' }
  ]
  for (const c of ['STOP_LOGIC', 'ABORT_LOGIC']) d.logic[c] = sequence([['SAFE', [...ALL5.map(n => DIS(n, 1)), "'^/RUN_LOGIC/BLEND_TIMER/START.CV' := 0;", AGIT_CAS, AGIT_STOP], AGIT_STOPPED]])
}

function agitate(variant = 'code') {
  value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'BlenderClasses'))
  value(B().newPhaseClass('BlenderClasses', 'AGITATE'))
  for (const [name, direction] of [['R_BLEND_TIME', 'Input'], ['RPT_BLEND_TIME', 'Report']]) {
    value(B().savePhaseParam('AGITATE', { ...cfg.newParam('batch', {}), name, type: 'Integer', direction,
      group: direction === 'Input' ? 'Operating' : 'Report', units: 'sec', low: 0, high: 300, defaultValue: direction === 'Input' ? 30 : 0 }))
  }
  value(B().editPhaseDraft('AGITATE', d => {
    if (variant === 'guide') { guideLogic(d); return }
    d.logic.RUN_LOGIC = sequence([
      ['INITIALIZE_MODES', [index(1), mode('OUT_PUMP'), mode('BASE_IN_VLV'), timer('RESET', 1)]],
      ['INITIALIZE_EQUIP', [index(2), confirmed('OUT_PUMP', 0), confirmed('BASE_IN_VLV', 0), emConfirmed('BLNDR_OUTLET', 1), emConfirmed('BLNDR_COLOR', 1)], "'/INITIALIZE_EQUIP/PENDING_CONFIRMS.CV' = 0"],
      ['START_AGIT', [index(3), mode('AGITATOR'), command('AGITATOR', 1), enable(CND.slice(1), 0)], feedback('AGITATOR', 1)],
      ['START_TIMER', [index(4), act('', { name: 'BLEND_TIMER', type: 'Non-Boolean', qualifier: 'N' }), timer('TIME_DURATION', "'^/R_BLEND_TIME.CV'"), timer('START', 1), enable(CND.slice(0, 1), 0)],
        "'/BLEND_TIMER/ELAPSED_TIME.CV' >= '^/R_BLEND_TIME.CV'"],
      ['STOP_AGIT', [index(5), mode('AGITATOR'), enable(CND.slice(0, 1), 1), act(command('AGITATOR', 0), { delayExpression: "'^/FAIL_MONITOR/AGITATOR_STOPPED/DISABLE.CV' = 1" })], feedback('AGITATOR', 0)],
      ['RESET_EQUIP', [index(0), mode('OUT_PUMP', 'AUTO'), mode('BASE_IN_VLV', 'AUTO'), mode('AGITATOR', 'AUTO'), emCmd('BLNDR_COLOR', 4), emCmd('BLNDR_OUTLET', 4),
        "'^/RPT_BLEND_TIME.CV' := '/BLEND_TIMER/ELAPSED_TIME.CV';", timer('START', 0), timer('RESET', 1), enable(CND.slice(1), 1)], "'/RESET_EQUIP/TIME.CV' >= 3"]
    ])
    d.logic.RUN_LOGIC.blocks = { BLEND_TIMER: { type: 'TIMER_SEC', expression: '', inputs: [], disabled: false } }
    const conditions = [feedback('AGITATOR', 0), `${alias('BLNDR_OUTLET', 'PRODUCT_VLV/PV.CV')} = 1`,
      `${alias('BLNDR_OUTLET', 'WASTE_VLV/PV.CV')} = 1`, feedback('BASE_IN_VLV', 1),
      `${alias('BLNDR_COLOR', 'COLOR_IN_VLV/PV.CV')} != 0`]
    const fm = Object.fromEntries(CND.map((name, i) => [name, { type: 'CND', expression: conditions[i], inputs: [], disabled: true }]))
    fm.BFI1 = { type: 'BFI', expression: '', disabled: false, inputs: CND.map(n => `/${n}/OUT_D.CV`) }
    fm.MESSAGE = { type: 'CALC', inputs: ['/BFI1/FIRST_OUT.CV'], disabled: false, expression: "'OUT1.CV' := 'IN1.CV' != 0 ? LOG2(2, 'IN1.CV') + 4 : 0;" }
    fm.BLOCK1 = { type: 'CALC', inputs: [], disabled: false, expression: "if ( '^/BFI1/OUT_D.CV' != 0 ) and ( '/+/FAIL_INDEX.CV' = 0 ) then\n  '/+/FAIL_INDEX.CV' := '^/MESSAGE/OUT1.CV';\nendif;" }
    d.logic.FAIL_MONITOR.blocks = fm
    d.logic.HOLD_LOGIC = sequence([
      ['HOLD_STATE', [enable(CND, 1), timer('START', 0)]],
      ['NULL', []],
      ['FAIL_SAFE', [mode('BASE_IN_VLV'), mode('OUT_PUMP'), mode('AGITATOR'), emConfirmed('BLNDR_COLOR', 1), confirmed('BASE_IN_VLV', 0),
        confirmed('OUT_PUMP', 0), act(emCmd('BLNDR_OUTLET', 1), { delayExpression: feedback('OUT_PUMP', 0), confirm: `${alias('BLNDR_OUTLET', 'A_PV.CV')} = 1`, confirmTimeout: 10 }), confirmed('AGITATOR', 0)], "'/FAIL_SAFE/PENDING_CONFIRMS.CV' = 0"],
      ['STOP_AGITATOR', [mode('AGITATOR'), command('AGITATOR', 0)], feedback('AGITATOR', 0)],
      ['HELD', []]
    ])
    d.logic.HOLD_LOGIC.routes = [
      { from: 'NULL', to: 'FAIL_SAFE', condition: "'^/FAIL_INDEX.CV' != 0" },
      { from: 'NULL', to: 'STOP_AGITATOR', condition: "'^/STEP_INDEX.CV' = 3 OR '^/STEP_INDEX.CV' = 4" },
      { from: 'NULL', to: 'HELD', condition: 'TRUE' },
      { from: 'FAIL_SAFE', to: 'HELD', condition: "'/FAIL_SAFE/PENDING_CONFIRMS.CV' = 0" }
    ]
    d.logic.RESTART_LOGIC = sequence([
      ['RESTARTING', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:Continue';", "'^/FAIL_MONITOR/BFI1/RESET_IN.CV' := 1;"]],
      ['RESTART_TOP', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:From_Start';"]],
      ['START_AGITATOR', [mode('AGITATOR'), command('AGITATOR', 1)], feedback('AGITATOR', 1)],
      ['ENABLE_PC', [enable(CND, 0)]],
      ['INIT_TIMER', [timer('START', 1)]],
      ['NULL', []]
    ])
    d.logic.RESTART_LOGIC.routes = [
      { from: 'RESTARTING', to: 'RESTART_TOP', condition: "'^/STEP_INDEX.CV' = 1 OR '^/STEP_INDEX.CV' = 2" },
      { from: 'RESTARTING', to: 'START_AGITATOR', condition: "'^/STEP_INDEX.CV' = 3 OR '^/STEP_INDEX.CV' = 4" },
      { from: 'RESTARTING', to: 'NULL', condition: 'TRUE' },
      { from: 'RESTART_TOP', to: null, condition: 'TRUE' }
    ]
    for (const c of ['STOP_LOGIC', 'ABORT_LOGIC']) d.logic[c] = sequence([['SAFE', [enable(CND, 1), timer('START', 0), mode('AGITATOR'), command('AGITATOR', 0)], feedback('AGITATOR', 0)]])
  }))
  value(B().savePhaseClass('AGITATE'))
  value(B().assignPhaseClass('BLENDERS', 'AGITATE'))
  for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().setUnitPhaseProps(u, 'AGITATE', { phaseType: 'Controller' }))
  value(L().downloadController('CTLR1'))
  const ns = M().namedSets
  useStore.setState({ namedSets: { ...ns, configured: { ...ns.configured, phase_failures: { ...ns.configured.phase_failures,
    entries: [...ns.configured.phase_failures.entries, ...CND.map((name, i) => ({ name, value: i + 4, visible: true, userSelectable: true }))] } } } })
  assert.equal(M().downloadChangedNamedSets({ kind: 'workstation' }), true)
  assert.equal(M().downloadChangedNamedSets({ kind: 'controller', tag: 'CTLR1' }), true)
}

test('Chapter 6: IF/THEN/ELSE validates both branches and executes only the selected branch', () => {
  const values = { '/A.CV': 1, '/B.CV': 0 }
  const env = { read: ref => values[ref], write: (ref, v) => { values[ref] = v }, named: () => 0, log: () => {} }
  expr.runProgram("IF '/A.CV' = 1 THEN '/B.CV' := 4; ELSE '/B.CV' := 8; ENDIF;", env)
  assert.equal(values['/B.CV'], 4)
  assert.deepEqual(expr.checkExpression("IF TRUE THEN '/A.CV' := 1; ELSE '/BAD.CV' := 2; ENDIF;", 'action',
    { checkRef: ref => ref.includes('BAD') ? 'bad reference' : null, checkNamed: () => null }), ['bad reference'])
})

test('Chapter 6: slide 6-16 "Set STEP_INDEX to 1" is accepted quoted and explained when written bare', () => fixture(() => {
  blenders()
  const check = phaseCheckEnv('AGITATE')
  assert.deepEqual(expr.checkExpression("'//#OUT_PUMP#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'", 'condition', check), [])
  assert.deepEqual(expr.checkExpression("'//#OUT_PUMP#/CAS_SP.CV' := 'mtr2-sp:STOP';", 'action', check), [])
  assert.deepEqual(expr.checkExpression("'^/STEP_INDEX.CV' := 1;", 'action', check), [])
  assert.deepEqual(expr.checkExpression("'/STEP_INDEX.CV' := 1;", 'action', check), [])
  const bare = expr.checkExpression('STEP_INDEX := 1;', 'action', check)
  assert.equal(bare.length, 1)
  assert.match(bare[0], /quoted parameter reference.*'\^\/STEP_INDEX\.CV' := value;/)
  assert.match(expr.checkExpression("'STEP_INDEX' := 1;", 'action', check)[0], /write '\^\/STEP_INDEX\.CV'/)
  assert.match(expr.checkExpression("'BLEND_TIMER/RESET.CV' := 1;", 'action', check)[0], /write '\/BLEND_TIMER\/RESET\.CV'/)
  assert.match(expr.checkExpression("STEP_INDEX = 1", 'condition', check)[0], /Parameter references go in single quotes/)
}))

test('Chapter 6: the expression editor warns when the value does not fit the parameter being written', () => {
  const check = { checkRef: () => null, checkNamed: () => null }
  const errors = src => expr.checkExpression(src, 'action', check)
  // the mistake from PULSE_AGIT_ON: a mode written into the setpoint
  const mode = errors("'//#AGITATOR#/CAS_SP.CV' := CAS;")
  assert.equal(mode.length, 1)
  assert.match(mode[0], /cannot be set to the mode CAS/)
  assert.match(mode[0], /MODE\.TARGET/)
  assert.match(errors("'//#AGITATOR#/DC1/CAS_SP.CV' := AUTO;")[0], /MODE\.TARGET/)
  assert.match(errors("'^/STEP_INDEX.CV' := CAS;")[0], /modes/)
  assert.match(errors("'//#AGITATOR#/DC1/MODE.TARGET' := 'mtr2-sp:START';")[0], /MODE\.TARGET takes a mode/)
  assert.match(errors("'//#AGITATOR#/DC1/MODE.TARGET' := 1;")[0], /MODE\.TARGET takes a mode/)
  assert.match(errors("'//#AGITATOR#/DC1/CAS_SP.CV' := 'mtr2-pv:RUNNING';")[0], /feedback \(-pv\) state/)
  // correct forms stay quiet
  for (const ok of ["'//#AGITATOR#/DC1/MODE.TARGET' := CAS;", "'//#AGITATOR#/MODE.TARGET' := AUTO;", "'//#AGITATOR#/DC1/CAS_SP.CV' := 'mtr2-sp:START';",
    "'//#BASE_IN_VLV#/CAS_SP.CV' := 1;", "'^/STEP_INDEX.CV' := 2;", "'//#OUT_PUMP#/DC1/CAS_SP.CV' := 'mtr2-sp:STOP';"]) assert.deepEqual(errors(ok), [], ok)
  // reading a mode or comparing against a feedback state is still fine
  assert.deepEqual(expr.checkExpression("'//#AGITATOR#/DC1/MODE.ACTUAL' = CAS", 'condition', check), [])
  assert.deepEqual(expr.checkExpression("'//#AGITATOR#/DC1/PV_D.CV' = 'mtr2-pv:RUNNING'", 'condition', check), [])
})

test('Chapter 6: guide spellings are accepted, while states that do not exist are still rejected', () => fixture(() => {
  blenders()
  const check = phaseCheckEnv('AGITATE')
  const ok = src => assert.deepEqual(expr.checkExpression(src, 'action', check), [], src)
  ok("'//#BLNDR_OUTLET#/A_COMMAND.CV' := 'EM-Outlet_State:Closed - CAS';")
  ok("'//#BLNDR_OUTLET#/A_COMMAND.CV' := 'EM_Outlet_State:Closed - CAS';")
  ok("\u2018//#BLNDR_COLOR#/A_COMMAND.CV\u2019 := \u2018EM-vlvnc-2stage:Auto mode\u2019;")
  ok("'\u02C6/STEP_INDEX.CV' := 3;")
  assert.match(expr.checkExpression("'//#BLNDR_OUTLET#/A_COMMAND.CV' := 'EM-Outlet_State:Close - CAS';", 'action', check)[0], /has no state Close - CAS/)
  assert.match(expr.checkExpression("'//#BLNDR_OUTLET#/A_COMMAND.CV' := 'EM-Nope:Closed - CAS';", 'action', check)[0], /Named set EM-Nope does not exist/)
  assert.deepEqual(cfg.nonBooleanErrors("'/BLEND_TIMER'", { checkRef: () => null }), [])
  for (const form of ["'^/BLEND_TIMER'", "'/BLEND_TIMER'", "'^/BLEND_TIMER.CV'", "'^/RUN_LOGIC/BLEND_TIMER'", "'/BLEND_TIMER';"]) {
    assert.deepEqual(cfg.nonBooleanErrors(form, { checkRef: () => null }), [], form)
    assert.equal(cfg.nonBooleanBlock({ name: 'S', expression: form }, { BLEND_TIMER: {} }), 'BLEND_TIMER', form)
  }
  assert.match(cfg.nonBooleanErrors("'/BLEND_TIMER/START.CV' := 1;", { checkRef: () => null })[0], /composite block it starts/)
  assert.equal(cfg.nonBooleanBlock({ name: 'S', expression: "'/BLEND_TIMER'" }, { BLEND_TIMER: {} }), 'BLEND_TIMER')
  assert.equal(cfg.nonBooleanBlock({ name: 'BLEND_TIMER', expression: '' }, { BLEND_TIMER: {} }), 'BLEND_TIMER')
  assert.equal(cfg.nonBooleanBlock({ name: 'S', expression: '' }, { BLEND_TIMER: {} }), null)
  for (const expression of ["'^/BLEND_TIMER'", "'/BLEND_TIMER'"]) {
    const pc = cfg.newPhaseClass('TEST', 'General')
    pc.logic.RUN_LOGIC = sequence([['S', [act('', { name: 'START_IT', type: 'Non-Boolean', qualifier: 'N', expression })], 'FALSE']])
    pc.logic.RUN_LOGIC.blocks = { BLEND_TIMER: { type: 'TIMER_SEC', expression: '', inputs: [], disabled: false } }
    let rt = cfg.commandPhase(cfg.newRuntime({}), 'START')
    const env = { read: ref => { throw Error(ref) }, write: ref => { throw Error(ref) }, named: () => 0, log: () => {} }
    for (let i = 0; i < 3; i++) rt = cfg.stepPhase(rt, pc.logic, env, 0.1)
    assert.equal(rt.params['RUN_LOGIC/BLEND_TIMER/ACTIVE'], 1, `${expression} starts the BLEND_TIMER block`)
  }
  const values = {}
  expr.runProgram("'/A.CV' := LN(8) / LN(2) + 4; '/B.CV' := EXP(0) + SQRT(9) + LOG(100);", { read: r => values[r], write: (r, v) => { values[r] = v }, named: () => 0, log: () => {} })
  assert.ok(Math.abs(values['/A.CV'] - 7) < 1e-9)
  assert.equal(values['/B.CV'], 6)
}))

test('Chapter 6: references must use the DeltaV level (/ is this composite, ^/ is the phase), and feedback cannot be written', () => fixture(() => {
  blenders(); agitate()
  const errors = (src, kind, composite) => expr.checkExpression(src, kind, phaseCheckEnv('AGITATE', undefined, composite))
  const fine = [
    ["'/BLEND_TIMER/RESET.CV' := 1;", 'action', 'RUN_LOGIC'],
    ["'/INITIALIZE_EQUIP/PENDING_CONFIRMS.CV' = 0", 'condition', 'RUN_LOGIC'],
    ["'/RESET_EQUIP/TIME.CV' >= 3", 'condition', 'RUN_LOGIC'],
    ["'^/STEP_INDEX.CV' := 1;", 'action', 'RUN_LOGIC'],
    ["'/BLEND_TIMER/ELAPSED_TIME.CV' >= '^/R_BLEND_TIME.CV'", 'condition', 'RUN_LOGIC'],
    ["'^/RUN_LOGIC/BLEND_TIMER/START.CV' := 0;", 'action', 'HOLD_LOGIC'],
    ["'^/FAIL_MONITOR/BFI1/RESET_IN.CV' := 1;", 'action', 'RESTART_LOGIC'],
    ["'//#AGITATOR#/DC1/MODE.TARGET' := CAS;", 'action', 'RUN_LOGIC'],
    ["'//#OUT_PUMP#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'", 'condition', 'RUN_LOGIC'],
    ["'//#OUT_PUMP#/MODE.ACTUAL' = CAS", 'condition', 'RUN_LOGIC']
  ]
  for (const [src, kind, composite] of fine) assert.deepEqual(errors(src, kind, composite), [], `${composite}: ${src}`)
  const wrong = [
    ["'^/BLEND_TIMER/RESET.CV' := 1;", 'action', 'RUN_LOGIC', /write '\/BLEND_TIMER\/RESET\.CV'/],
    ["'^/INITIALIZE_EQUIP/PENDING_CONFIRMS.CV' = 0", 'condition', 'RUN_LOGIC', /write '\/INITIALIZE_EQUIP\/PENDING_CONFIRMS\.CV'/],
    ["'^/RESET_EQUIP/TIME.CV' >= 3", 'condition', 'RUN_LOGIC', /write '\/RESET_EQUIP\/TIME\.CV'/],
    ["'/STEP_INDEX.CV' := 1;", 'action', 'RUN_LOGIC', /Write '\^\/STEP_INDEX\.CV'/],
    ["'/R_BLEND_TIME.CV' > 1", 'condition', 'RUN_LOGIC', /Write '\^\/R_BLEND_TIME\.CV'/],
    ["'/FAIL_MONITOR/AGITATOR_STOPPED/DISABLE.CV' := 0;", 'action', 'RUN_LOGIC', /another composite state.*'\^\/FAIL_MONITOR\/AGITATOR_STOPPED\/DISABLE\.CV'/],
    ["'/RUN_LOGIC/BLEND_TIMER/START.CV' := 0;", 'action', 'HOLD_LOGIC', /'\^\/RUN_LOGIC\/BLEND_TIMER\/START\.CV'/],
    ["'//#OUT_PUMP#/DC1/PV_D.CV' := 'mtr2-pv:STOPPED';", 'action', 'RUN_LOGIC', /PV_D is feedback and cannot be written/],
    ["'//#BLNDR_OUTLET#/A_PV.CV' := 1;", 'action', 'RUN_LOGIC', /A_PV is feedback/],
    ["'//#OUT_PUMP#/MODE.ACTUAL' := CAS;", 'action', 'RUN_LOGIC', /MODE\.ACTUAL is feedback.*MODE\.TARGET/]
  ]
  for (const [src, kind, composite, re] of wrong) assert.match(errors(src, kind, composite).join(' | '), re, `${composite}: ${src}`)
  assert.deepEqual(expr.checkExpression("'^/BLEND_TIMER/RESET.CV' := 1;", 'action', phaseCheckEnv('AGITATE')), [], 'no composite context, no level check')
  // A Non-Boolean action names the block at its own level too.
  const run = phaseCheckEnv('AGITATE', undefined, 'RUN_LOGIC')
  assert.deepEqual(cfg.nonBooleanErrors("'/BLEND_TIMER'", run), [])
  assert.match(cfg.nonBooleanErrors("'^/BLEND_TIMER'", run)[0], /write '\/BLEND_TIMER'/)
}))

test('Chapter 6: pulse delay, confirmation timeout and step timing have measurable semantics', () => {
  const pc = cfg.newPhaseClass('TEST', 'General')
  pc.logic.RUN_LOGIC = sequence([['WAIT', [act("'/VALUE.CV' := 1;", { time: 0.5, confirm: 'FALSE', confirmTimeout: 0.3 })], "'/WAIT/PENDING_CONFIRMS.CV' = 0"]])
  let rt = cfg.commandPhase(cfg.newRuntime({ VALUE: 0 }), 'START')
  const env = { read: ref => { throw Error(ref) }, write: ref => { throw Error(ref) }, named: () => 0, log: () => {} }
  for (let i = 0; i < 4; i++) rt = cfg.stepPhase(rt, pc.logic, env, 0.1)
  assert.equal(rt.params.VALUE, 0)
  assert.equal(rt.params['RUN_LOGIC/WAIT/PENDING_CONFIRMS'], 1)
  rt = cfg.stepPhase(rt, pc.logic, env, 0.1)
  assert.equal(rt.params.VALUE, 1)
  for (let i = 0; i < 4; i++) rt = cfg.stepPhase(rt, pc.logic, env, 0.1)
  assert.equal(rt.state, 'COMPLETE')
  assert.equal(rt.params['RUN_LOGIC/WAIT/FAILED_CONFIRMS'], 1)
  assert.equal(rt.params['RUN_LOGIC/CONFIRM_FAIL'], true)
})

test('Chapter 6: confirm timeout can be an expression, and Default Expression reads back what the action wrote', () => fixture(() => {
  const pc = cfg.newPhaseClass('TEST', 'General')
  pc.logic.RUN_LOGIC = sequence([['WAIT', [act("'/VALUE.CV' := 1;", { confirm: 'FALSE', confirmTimeout: 0, confirmTimeoutExpression: "'/WAIT/TIME.CV' >= 1" })], "'/WAIT/PENDING_CONFIRMS.CV' = 0"]])
  let rt = cfg.commandPhase(cfg.newRuntime({ VALUE: 0 }), 'START')
  const env = { read: ref => { throw Error(ref) }, write: ref => { throw Error(ref) }, named: () => 0, log: () => {} }
  for (let i = 0; i < 8; i++) rt = cfg.stepPhase(rt, pc.logic, env, 0.1)
  assert.equal(rt.params['RUN_LOGIC/WAIT/PENDING_CONFIRMS'], 1, 'still waiting before the timeout expression is TRUE')
  assert.equal(rt.params['RUN_LOGIC/WAIT/FAILED_CONFIRMS'], 0)
  for (let i = 0; i < 6; i++) rt = cfg.stepPhase(rt, pc.logic, env, 0.1)
  assert.equal(rt.params['RUN_LOGIC/WAIT/FAILED_CONFIRMS'], 1, 'the timeout expression turning TRUE fails the confirm')
  assert.equal(rt.params['RUN_LOGIC/CONFIRM_FAIL'], true)

  const { defaultConfirmExpression } = require('../src/renderer/src/engine/phaseConfirm.ts')
  const sets = M().namedSets.configured
  const want = {
    "'//#OUT_PUMP#/CAS_SP.CV' := 'mtr2-sp:STOP';": "'//#OUT_PUMP#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'",
    "'//#BASE_IN_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';": "'//#BASE_IN_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'",
    "'//#BLNDR_COLOR#/A_COMMAND.CV' := 'EM-vlvnc-2stage:Close';": "'//#BLNDR_COLOR#/A_PV.CV' = 'EM-vlvnc-2stage:Close'",
    "'//#BLNDR_OUTLET#/A_COMMAND.CV' := 'EM_Outlet_State:Closed - CAS';": "'//#BLNDR_OUTLET#/A_PV.CV' = 'EM_Outlet_State:Closed - CAS'",
    "'^/COLOR_IN_VLV/CAS_SP.CV' := 'vlvnc2stage-sp:DRIBBLE';": "'^/COLOR_IN_VLV/PV.CV' = 'vlvnc2stage-pv:DRIBBLE'"
  }
  for (const [action, confirm] of Object.entries(want)) {
    const r = defaultConfirmExpression(action, sets)
    assert.equal(r.ok && r.expression, confirm, action)
    assert.deepEqual(expr.checkExpression(confirm, 'condition', { checkRef: () => null, checkNamed: () => null }), [], confirm)
  }
  assert.deepEqual(defaultConfirmExpression("'//#OUT_PUMP#/DC1/PV_D.CV':='mtr2-pv:STOPPED';", sets), { ok: true, expression: "'//#OUT_PUMP#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'" })
  assert.deepEqual(defaultConfirmExpression("'^/STEP_INDEX.CV' := 2;", sets), { ok: true, expression: "'^/STEP_INDEX.CV' = 2" })
  assert.equal(defaultConfirmExpression('', sets).ok, false)
}))

for (const variant of ['code', 'guide']) test(`Chapter 6 (${variant === 'guide' ? 'expressions typed as the course guide prints them, at the DeltaV levels' : 'built with the app forms'}): both real blender instances run, retain time on Hold, recover all five failures, and survive save/restore`, () => fixture(() => {
  blenders()
  agitate(variant)
  const pc = B().phaseClasses.AGITATE
  for (const c of cfg.COMPOSITES) {
    const check = phaseCheckEnv('AGITATE', undefined, c)
    for (const step of pc.logic[c].steps) for (const a of step.actions) {
      const problems = a.type === 'Non-Boolean' ? cfg.nonBooleanErrors(a.expression, check) : expr.checkExpression(a.expression, 'action', check)
      assert.deepEqual(problems, [], a.expression)
      for (const e of [a.confirm, a.delayExpression].filter(Boolean)) assert.deepEqual(expr.checkExpression(e, 'condition', check), [], e)
    }
    for (const t of pc.logic[c].transitions) assert.deepEqual(expr.checkExpression(t.condition, 'condition', check), [], t.condition)
  }
  for (const unit of ['UM_BL_500', 'UM_BL_600']) {
    value(B().loadPhase(unit, 'AGITATE'))
    value(B().setOnlineParam(unit, 'AGITATE', 'R_BLEND_TIME', 15))
    value(B().command(unit, 'AGITATE', 'START'))
    until(unit, r => r.params.STEP_INDEX === 4)
    tick(1)
    value(B().command(unit, 'AGITATE', 'HOLD'))
    until(unit, r => r.state === 'HELD')
    const elapsed = rt(unit).params['RUN_LOGIC/BLEND_TIMER/ELAPSED_TIME']
    tick(2)
    assert.equal(rt(unit).params['RUN_LOGIC/BLEND_TIMER/ELAPSED_TIME'], elapsed)
    assert.equal(readModulePath(`${B().units[unit].aliases.AGITATOR.path}/PV_D.CV`), 0)
    value(B().command(unit, 'AGITATE', 'RESTART'))
    until(unit, r => r.state === 'RUNNING')
    assert.equal(rt(unit).params.STEP_INDEX, 4)
    assert.ok(rt(unit).params['RUN_LOGIC/BLEND_TIMER/ELAPSED_TIME'] >= elapsed)
    const saved = JSON.stringify(courseSnapshot())
    B().resetBatch()
    assert.equal(restoreCourseDatabase(saved), true)
    for (let i = 0; i < 5; i++) {
      until(unit, r => r.state === 'RUNNING' && r.params.STEP_INDEX === 4)
      const u = B().units[unit], a = u.aliases
      const tag = i === 0 ? a.AGITATOR.path : i === 1 ? E().instances[a.BLNDR_OUTLET.path].children.PRODUCT_VLV :
        i === 2 ? E().instances[a.BLNDR_OUTLET.path].children.WASTE_VLV : i === 3 ? a.BASE_IN_VLV.path : E().instances[a.BLNDR_COLOR.path].children.COLOR_IN_VLV
      value(B().setDeviceMode(tag, 'AUTO'))
      if (i === 0) M().stopMotor(tag)
      else M().openValve(tag)
      until(unit, r => r.state === 'HELD')
      assert.equal(rt(unit).failIndex, i + 4)
      assert.equal(rt(unit).message, CND[i])
      assert.equal(rt(unit).params['FAIL_MONITOR/BFI1/FIRST_OUT'], 2 ** i)
      for (const name of ['AGITATOR', 'BASE_IN_VLV', 'OUT_PUMP']) assert.equal(readModulePath(`${a[name].path}/PV_D.CV`), 0)
      for (const name of ['PRODUCT_VLV', 'WASTE_VLV']) assert.equal(readModulePath(`${a.BLNDR_OUTLET.path}/${name}/PV.CV`), 0)
      assert.equal(readModulePath(`${a.BLNDR_COLOR.path}/COLOR_IN_VLV/PV.CV`), 0)
      assert.equal(B().command(unit, 'AGITATE', 'RESTART').ok, false)
      value(B().command(unit, 'AGITATE', 'CLEAR_FAILURES'))
      value(B().command(unit, 'AGITATE', 'RESTART'))
      until(unit, r => r.state === 'RUNNING')
      assert.equal(rt(unit).failIndex, 0)
      tick(0.2)
    }
    until(unit, r => r.state === 'COMPLETE', 35)
    assert.ok(rt(unit).params.RPT_BLEND_TIME >= 15 && rt(unit).params.RPT_BLEND_TIME < 16, `RPT_BLEND_TIME=${rt(unit).params.RPT_BLEND_TIME}`)
    assert.equal(rt(unit).params.STEP_INDEX, 0)
    assert.equal(rt(unit).params['RUN_LOGIC/BLEND_TIMER/ELAPSED_TIME'], 0)
    const otherUnit = unit === 'UM_BL_500' ? 'UM_BL_600' : 'UM_BL_500'
    if (B().active[`${otherUnit}/AGITATE`]) assert.equal(rt(otherUnit).state, 'COMPLETE', 'other blender stays independent')
  }
  const checks = checkCourse7016Ch6(B(), M().eventLog, M().namedSets)
  assert.deepEqual(checks.filter(c => c.verdict !== 'verified'), [])
}))

for (const variant of ['code', 'guide']) test(`Chapter 6 (${variant}): early Hold restarts initialization; Stop/Abort stop the agitator and reset permits another run`, () => fixture(() => {
  blenders(); agitate(variant)
  const unit = 'UM_BL_500'
  value(B().loadPhase(unit, 'AGITATE'))
  tick(0.2)
  assert.equal(rt(unit).failIndex, 0, 'Failure monitor does not run in Idle')
  value(B().command(unit, 'AGITATE', 'START'))
  tick()
  assert.equal(rt(unit).params.STEP_INDEX, 1)
  value(B().command(unit, 'AGITATE', 'HOLD'))
  until(unit, r => r.state === 'HELD')
  value(B().command(unit, 'AGITATE', 'RESTART'))
  until(unit, r => r.state === 'RUNNING')
  assert.equal(rt(unit).seq.step, 0, 'From_Start starts RUN_LOGIC at its initial step')
  for (const cmd of ['STOP', 'ABORT']) {
    until(unit, r => r.params.STEP_INDEX === 4)
    value(B().command(unit, 'AGITATE', cmd))
    until(unit, r => r.state === (cmd === 'STOP' ? 'STOPPED' : 'ABORTED'))
    assert.equal(readModulePath(`${B().units[unit].aliases.AGITATOR.path}/PV_D.CV`), 0)
    value(B().command(unit, 'AGITATE', 'RESET'))
    assert.equal(rt(unit).state, 'IDLE')
    value(B().command(unit, 'AGITATE', 'START'))
  }
}))

function blockEnv(blocks, values = {}) {
  for (const [name, b] of Object.entries(blocks)) for (const [p, v] of Object.entries(require('../src/renderer/src/engine/phaseBlocks.ts').phaseBlockDefaults(b))) values[`${name}/${p}`] ??= v
  const key = ref => ref.replace(/^\//, '').replace(/\.CV$/i, '').toUpperCase()
  return { values, read: ref => { const k = key(ref); if (!(k in values)) throw new Error(`no ${k}`); return values[k] }, write: (ref, v) => { values[key(ref)] = v }, named: () => 0, log: () => {} }
}

test('Chapter 6 function blocks follow the Function Block Reference: CND timing and DISABLE, BFI first-out trap, CALC pins', () => {
  const fb = require('../src/renderer/src/engine/phaseBlocks.ts')
  const mk = (type, extra = {}) => ({ type, expression: '', inputs: [], disabled: false, ...extra })
  const blocks = {
    CND1: mk('CND', { expression: "'/SIG1.CV' = 1", disabled: true, timeDuration: 2 }),
    CND2: mk('CND', { expression: "'/SIG2.CV' = 1" }),
    BFI1: mk('BFI', { inputs: ['/CND1/OUT_D.CV', '/CND2/OUT_D.CV'] })
  }
  const env = blockEnv(blocks, { SIG1: 0, SIG2: 0 })
  const v = env.values
  const scan = (dt = 0.5) => fb.scanPhaseBlocks(blocks, env, dt)
  // CND: the expression must be True for TIME_DURATION; DISABLE bypasses OUT_D but not PRE_OUT_D
  scan(); assert.equal(v['CND1/OUT_D'], false)
  v.SIG1 = 1
  scan(); scan(); assert.equal(v['CND1/PRE_OUT_D'], false, 'not True for 2 s yet')
  scan(); scan(); assert.equal(v['CND1/PRE_OUT_D'], true)
  assert.equal(v['CND1/OUT_D'], false, 'DISABLE = 1 holds OUT_D False')
  assert.equal(v['BFI1/FIRST_OUT'], 0)
  v['CND1/DISABLE'] = 0
  scan(); assert.equal(v['CND1/OUT_D'], true); assert.equal(v['BFI1/OUT_INT'], 1); assert.equal(v['BFI1/FIRST_OUT'], 1)
  v.SIG1 = 0; scan(); assert.equal(v['CND1/TIMER'], 0, 'an expression that goes False resets the timer')
  // BFI: weighted sum, the trap holds the first weighted value, RESET_IN clears it and the trap re-arms only after all inputs are False
  assert.equal(v['BFI1/OUT_INT'], 0)
  assert.equal(v['BFI1/FIRST_OUT'], 1, 'FIRST_OUT keeps its value after the input goes False')
  v.SIG2 = 1; scan(); assert.equal(v['BFI1/FIRST_OUT'], 2, 'the next zero to non-zero transition traps the new value')
  v.SIG1 = 1; v['CND1/PRE_OUT_D'] = true; v['CND1/TIMER'] = 5; scan(); scan()
  assert.equal(v['BFI1/OUT_INT'], 3); assert.equal(v['BFI1/FIRST_OUT'], 2, 'later inputs do not change the trap')
  v['BFI1/RESET_IN'] = 1; scan()
  assert.equal(v['BFI1/FIRST_OUT'], 0); assert.equal(v['BFI1/RESET_IN'], 0, 'the block sets RESET_IN back to zero')
  scan(); assert.equal(v['BFI1/FIRST_OUT'], 0, 'no re-trap while an input is still True')
  v.SIG1 = 0; v.SIG2 = 0; scan(); scan(); v.SIG2 = 1; scan(); assert.equal(v['BFI1/FIRST_OUT'], 2)
  v['BFI1/ARM_TRAP'] = 0; v['BFI1/RESET_IN'] = 1; scan(); v.SIG2 = 0; scan(); scan(); v.SIG2 = 1; scan()
  assert.equal(v['BFI1/FIRST_OUT'], 0, 'ARM_TRAP = 0 disables the trap')
  // BFI BCD parameter: each group of four inputs is one decimal digit
  const wide = { BFI1: mk('BFI', { inCount: 6, inputs: ['/S1.CV', '/S2.CV', '/S3.CV', '/S4.CV', '/S5.CV', '/S6.CV'] }) }
  const wideEnv = blockEnv(wide, { S1: 0, S2: 1, S3: 1, S4: 0, S5: 0, S6: 1 })
  fb.scanPhaseBlocks(wide, wideEnv, 0.1)
  assert.equal(wideEnv.values['BFI1/OUT_INT'], 38); assert.equal(wideEnv.values['BFI1/BCD'], 26)
})

test('Chapter 6 CALC block: bare IN1/OUT1 pins, extensible pins, and LN/LOG return 0 outside their range as the reference says', () => {
  const fb = require('../src/renderer/src/engine/phaseBlocks.ts')
  let blocks = { MESSAGE: { type: 'CALC', inputs: ['/SIG.CV'], disabled: false, inCount: 2, outCount: 2,
    expression: 'OUT1 := LN(IN1) / LN(2) + 4;\nIF IN1 > 0 THEN OUT2 := 1; ELSE OUT2 := 0; END_IF;' } }
  const env = blockEnv(blocks, { SIG: 8 })
  fb.scanPhaseBlocks(blocks, env, 0.1)
  assert.equal(env.values['MESSAGE/OUT1'], 7); assert.equal(env.values['MESSAGE/OUT2'], 1)
  env.values.SIG = 0
  fb.scanPhaseBlocks(blocks, env, 0.1)
  assert.equal(env.values['MESSAGE/OUT1'], 4, 'LN of zero is 0, so FIRST_OUT = 0 does not stop the phase')
  assert.equal(env.values['MESSAGE/OUT2'], 0)
  // a pin the block does not have is an error until Extensible Parameters adds it
  blocks.MESSAGE = { ...blocks.MESSAGE, expression: 'OUT3 := IN1;' }
  assert.throws(() => fb.scanPhaseBlocks(blocks, env, 0.1), /no OUT3/)
  blocks = fb.setBlockCounts(blocks, 'MESSAGE', { inCount: 3, outCount: 3 })
  assert.equal(typeof blocks, 'object')
  assert.deepEqual(fb.blockOutputPins(blocks.MESSAGE), ['OUT1', 'OUT2', 'OUT3'])
  assert.deepEqual(fb.blockInputPins(blocks.MESSAGE), ['IN1', 'IN2', 'IN3'])
  const env3 = blockEnv(blocks, { SIG: 5 }); fb.scanPhaseBlocks(blocks, env3, 0.1); assert.equal(env3.values['MESSAGE/OUT3'], 5)
  // shrinking removes the wires that would be left dangling
  const wired = { C: { type: 'CALC', expression: '', inputs: ['/A/OUT_D.CV', '', '/B/OUT_D.CV'], disabled: false, inCount: 3, outCount: 2 },
    D: { type: 'CALC', expression: '', inputs: ['/C/OUT2.CV'], disabled: false, inCount: 2, outCount: 2 } }
  const shrunk = fb.setBlockCounts(wired, 'C', { inCount: 2, outCount: 1 })
  assert.deepEqual(shrunk.C.inputs, ['/A/OUT_D.CV']); assert.deepEqual(shrunk.D.inputs, [])
  assert.equal(typeof fb.setBlockCounts(wired, 'C', { inCount: 17 }), 'string')
  assert.equal(typeof fb.setBlockCounts({ X: { type: 'CND', expression: '', inputs: [], disabled: false } }, 'X', { inCount: 2 }), 'string')
  assert.equal(typeof fb.connectBlocks({ ...blocks, S: { type: 'BFI', expression: '', inputs: [], disabled: false, inCount: 2 }, },
    { block: 'S', pin: 'OUT_D' }, { block: 'MESSAGE', pin: 'IN4' }), 'string', 'IN4 does not exist')
  // the editor accepts the bare pins in a CALC and still asks for quoted references elsewhere
  const noCheck = { checkRef: () => null, checkNamed: () => null }
  assert.deepEqual(expr.checkExpression('OUT1 := IN1;', 'action', { ...noCheck, calc: true }), [])
  assert.match(expr.checkExpression('OUT1 := IN1;', 'action', noCheck)[0], /quoted parameter reference/)
  assert.match(expr.checkExpression('OUT1 := LOG2(IN1);', 'action', { ...noCheck, calc: true })[0], /LOG2 takes two arguments/)
  // operators and functions from the System Configuration expression tables
  const run = src => { const v = {}; expr.runProgram(src, { read: r => v[r], write: (r, x) => { v[r] = x }, named: () => 0, log: () => {} }); return v }
  assert.deepEqual(run("'/A.CV' := 2 ** 3; '/B.CV' := 13 MOD 5; '/C.CV' := EXPT(2, 10); '/D.CV' := TRUNC(2.7) + ROUND(2.5); '/E.CV' := LN(0); '/F.CV' := SQRT(-4);"),
    { '/A.CV': 8, '/B.CV': 3, '/C.CV': 1024, '/D.CV': 5, '/E.CV': 0, '/F.CV': -4 })
  assert.equal(run("IF TRUE XOR FALSE THEN '/A.CV' := 1; ENDIF;")['/A.CV'], 1)
})

test('Chapter 6: the function block palette lists the DeltaV groups and the editor accepts the slide 6-37 BLOCK1 expression', () => fixture(() => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const studio = require('../src/renderer/src/displays/PhaseStudio.tsx')
  const pal = require('../src/renderer/src/engine/functionBlockPalette.ts')
  assert.deepEqual(pal.FUNCTION_BLOCK_GROUPS.map(g => g.group), ['Advanced Control', 'Advanced Function', 'Analog Control', 'Energy Metering', 'I/O', 'Logical', 'Math', 'Timer Counter'])
  const all = pal.FUNCTION_BLOCK_GROUPS.flatMap(g => g.blocks)
  assert.equal(new Set(all.map(b => b.abbr)).size, all.length, 'every palette abbreviation is unique')
  assert.ok(all.every(b => b.name && b.description), 'every block has a name and a description')
  assert.equal(pal.paletteGroupOf('CND'), 'Logical'); assert.equal(pal.paletteGroupOf('BFI'), 'Logical'); assert.equal(pal.paletteGroupOf('CALC'), 'Analog Control')
  for (const abbr of ['PID', 'AI', 'AO', 'DI', 'DO', 'AND', 'OR', 'NOT', 'ADD', 'RET', 'OND', 'DC', 'ALARM']) assert.ok(all.some(b => b.abbr === abbr), abbr)
  assert.deepEqual([...pal.MODELED_FUNCTION_BLOCKS], ['CND', 'BFI', 'CALC'])
  assert.ok(pal.MODELED_FUNCTION_BLOCKS.every(a => all.some(b => b.abbr === a)))

  const pc = cfg.newPhaseClass('TEST', 'General')
  const mk = (type, extra = {}) => ({ type, expression: '', inputs: [], disabled: false, ...extra })
  const slide = "if ( '^/BFI1/OUT_D.CV' != 0 ) and ( '/+/FAIL_INDEX.CV' = 0 ) then\n  '/+/FAIL_INDEX.CV' := '^/MESSAGE/OUT1.CV';\nendif;"
  pc.logic.FAIL_MONITOR.blocks = { BFI1: mk('BFI', { inCount: 5 }), MESSAGE: mk('CALC', { inCount: 2, outCount: 2 }),
    BLOCK1: mk('CALC', { expression: slide, inCount: 2, outCount: 2 }) }
  const ctx = studio.phaseExprCtx(pc, {}, 'FAIL_MONITOR')
  ctx.check = phaseCheckEnv('TEST', pc, 'FAIL_MONITOR')
  const dialog = expression => renderToStaticMarkup(React.createElement(studio.BlockDialog, { name: 'BLOCK1',
    sfc: { ...pc.logic.FAIL_MONITOR, blocks: { ...pc.logic.FAIL_MONITOR.blocks, BLOCK1: mk('CALC', { expression, inCount: 2, outCount: 2 }) } }, ctx, onOk: () => {}, onClose: () => {} }))
  assert.ok(dialog(slide).includes('0 error(s), 0 warning(s)'), 'slide 6-37 expression is accepted')
  assert.ok(dialog("IF '/BFI1/OUT_D.CV' != 0 THEN OUT1 := 1; ENDIF;").includes('0 error(s), 0 warning(s)'), 'composite-level form still accepted')
  assert.ok(!dialog("IF '^/NOPE/OUT_D.CV' != 0 THEN OUT1 := 1; ENDIF;").includes('0 error(s), 0 warning(s)'), 'a block that does not exist is still rejected')
}))

test('Chapter 6: UI exposes confirmations, wired function blocks, alternate-branch charts and Clear Failures', () => fixture(() => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const studio = require('../src/renderer/src/displays/PhaseStudio.tsx')
  const { ActionDialog } = studio
  const { PhaseFbd } = require('../src/renderer/src/components/PhaseFbd.tsx')
  const fb = require('../src/renderer/src/engine/phaseBlocks.ts')
  const graph = require('../src/renderer/src/engine/phaseGraph.ts')
  const check = { checkRef: () => null, checkNamed: () => null }
  const html = renderToStaticMarkup(React.createElement(ActionDialog, {
    step: 'TEST', composite: 'RUN_LOGIC', ctx: { check }, action: act("'/X.CV' := 1;"), existing: [], onOk: () => {}, onClose: () => {}
  }))
  for (const label of ['Pulse delay condition', 'Delay time', 'Non-Boolean', 'Qualifier']) assert.ok(html.includes(label), label)
  const confirmTab = renderToStaticMarkup(React.createElement(ActionDialog, {
    step: 'TEST', composite: 'RUN_LOGIC', ctx: { check }, action: act("'/X.CV' := 1;", { confirm: "'/X.CV' = 1", confirmTimeout: 5 }), existing: [], onOk: () => {}, onClose: () => {}, initialTab: 'Confirm'
  }))
  for (const label of ['Confirm action for pulse qualifier', 'Confirm expression', 'Confirm timeout', 'Expression Assistant', 'Default Expression', 'Confirm timeout expression', 'Timeout as expression']) assert.ok(confirmTab.includes(label), label)

  // FAIL_MONITOR: blocks come from the palette and are wired pin to pin, exactly as the course slide shows.
  let blocks = {}
  for (const type of ['CND', 'CND', 'BFI', 'CALC']) { const made = fb.newDiagramBlock(type, blocks, 40, 40); blocks = { ...blocks, [made.name]: made.block } }
  assert.deepEqual(Object.keys(blocks), ['CND1', 'CND2', 'BFI1', 'CALC1'])
  blocks = fb.renameBlock(blocks, 'CALC1', 'MESSAGE')
  for (const [i, n] of ['CND1', 'CND2'].entries()) {
    blocks = fb.connectBlocks(blocks, { block: n, pin: 'OUT_D' }, { block: 'BFI1', pin: `IN_D${i + 1}` })
    assert.equal(typeof blocks, 'object')
  }
  blocks = fb.connectBlocks(blocks, { block: 'BFI1', pin: 'FIRST_OUT' }, { block: 'MESSAGE', pin: 'IN1' })
  assert.deepEqual(blocks.BFI1.inputs, ['/CND1/OUT_D.CV', '/CND2/OUT_D.CV'])
  assert.deepEqual(blocks.MESSAGE.inputs, ['/BFI1/FIRST_OUT.CV'])
  assert.equal(typeof fb.connectBlocks(blocks, { block: 'CND1', pin: 'DISABLE' }, { block: 'BFI1', pin: 'IN_D3' }), 'string')
  assert.equal(typeof fb.connectBlocks(blocks, { block: 'CND1', pin: 'OUT_D' }, { block: 'CND2', pin: 'IN_D1' }), 'string')
  const fbd = renderToStaticMarkup(React.createElement(PhaseFbd, { blocks, zoom: 1, selected: 'BFI1', scope: 'FAIL_MONITOR', readOnly: false,
    onSelect: () => {}, onMove: () => {}, onConnect: () => null, onDisconnect: () => {}, onAdd: () => {}, onMenu: () => {}, onOpen: () => {} }))
  for (const text of ['data-wire="CND1/OUT_D-&gt;BFI1/IN_D1"', 'data-wire="BFI1/FIRST_OUT-&gt;MESSAGE/IN1"', 'data-block-type="BFI"', 'RESET_IN', 'FIRST_OUT', 'DISABLE = 0']) {
    assert.ok(fbd.includes(text), text)
  }
  blocks = fb.disconnectInput(blocks, 'BFI1', 0)
  assert.deepEqual(blocks.BFI1.inputs, ['', '/CND2/OUT_D.CV'])
  assert.equal(Object.keys(fb.deleteBlock(blocks, 'CND2').BFI1.inputs.filter(Boolean)).length, 0)
  const dlg = renderToStaticMarkup(React.createElement(studio.BlockDialog, { name: 'CND1', sfc: { ...cfg.defaultSfc(), blocks }, ctx: { check }, onOk: () => {}, onClose: () => {} }))
  assert.ok(dlg.includes('Block expression') && dlg.includes('DISABLE default') && dlg.includes('Edit Expression'))
  assert.ok(renderToStaticMarkup(React.createElement(studio.CompositeBlockDialog, { existing: [], onOk: () => {}, onClose: () => {} })).includes('TIMER_SEC'))

  // Alternate branches: built from the SFC, laid out as columns, and still executable by the phase engine.
  let sfc = sequence([['HOLD_STATE', []], ['HELD', []]])
  sfc = graph.addBranch(sfc, 0)
  assert.equal(typeof sfc, 'object')
  assert.equal(graph.phaseEdges(sfc).filter(e => e.from === 0).length, 2)
  const legStep = sfc.steps[sfc.steps.length - 1].name
  assert.equal(sfc.routes.find(r => r.to === legStep).from, 'HOLD_STATE')
  sfc = graph.insertOnEdge(sfc, { i: sfc.steps.length - 1, route: sfc.routes.findIndex(r => r.from === legStep) }, 1)
  const leg2 = sfc.steps[sfc.steps.length - 1].name
  sfc = graph.connectEdge(sfc, { i: sfc.steps.findIndex(s => s.name === leg2), route: sfc.routes.findIndex(r => r.from === leg2) }, 'HELD')
  const laid = graph.layoutPhaseSfc(sfc)
  assert.equal(laid.cols, 2)
  assert.ok(laid.row[sfc.steps.findIndex(s => s.name === 'HELD')] > laid.row[sfc.steps.findIndex(s => s.name === leg2)])
  const chart = renderToStaticMarkup(React.createElement(studio.SfcBranchDiagram, { sfc, zoom: 1, sel: null, liveStep: null,
    onSelect: () => {}, onStepOpen: () => {}, onEdgeOpen: () => {}, onStepMenu: () => {}, onEdgeMenu: () => {} }))
  assert.ok(chart.includes('data-branched') && chart.includes(`data-step="${leg2}"`) && chart.includes('data-edge="HOLD_STATE&gt;'))
  const edgeDlg = renderToStaticMarkup(React.createElement(studio.EdgeDialog, { sfc, edge: { i: 0, route: 0 }, composite: 'HOLD_LOGIC', ctx: { check }, onOk: () => {}, onClose: () => {} }))
  assert.ok(edgeDlg.includes('Connect to') && edgeDlg.includes('Termination'))
  assert.equal(typeof graph.deleteBranch(sfc, { i: 0, route: null }), 'string')
  assert.equal(cfg.COMMAND_LABEL.CLEAR_FAILURES, 'Clear Failures')
}))

test('Chapter 6: HOLD_LOGIC from the course diagram can be drawn with Branch, Add Sequence After and Connect To', () => {
  const graph = require('../src/renderer/src/engine/phaseGraph.ts')
  let s = sequence([['HOLD_STATE', []], ['NULL', []]])
  s = graph.addBranch(s, 1)
  s = graph.addBranch(s, 1)
  const leaving = (i) => graph.phaseEdges(s).filter(e => e.from === i)
  assert.equal(leaving(1).length, 3)
  const outOf = (i) => ({ i, route: leaving(i)[0].route })
  s = graph.insertOnEdge(s, { i: 1, route: leaving(1)[0].route }, 1)
  const failSafe = s.steps.length - 1
  s = graph.insertOnEdge(s, outOf(failSafe), 1)
  const join = s.steps.length - 1
  for (const e of graph.phaseEdges(s)) if (e.to === null && e.from !== join) s = graph.connectEdge(s, { i: e.from, route: e.route }, s.steps[join].name)
  const laid = graph.layoutPhaseSfc(s)
  assert.equal(laid.cols, 3)
  assert.equal(laid.edges.filter(e => e.to === join && !e.back).length, 3)
  assert.equal(graph.phaseEdges(s).filter(e => e.to === null).length, 1)
  assert.ok(new Set(laid.row.map((r, i) => `${r}:${laid.col[i]}`)).size === s.steps.length, 'no two steps share a position')
  // the three legs keep their order, so the first TRUE transition wins as in DeltaV
  assert.deepEqual(leaving(1).map(e => e.route), s.routes.map((r, k) => (r.from === 'NULL' ? k : -1)).filter(k => k >= 0))
  const renamed = graph.editEdge(s, { i: 1, route: leaving(1)[0].route }, { name: 'FAIL_DETECTED', condition: "'^/FAIL_INDEX.CV' != 0" })
  assert.equal(graph.phaseEdges(renamed).find(e => e.from === 1).name, 'FAIL_DETECTED')
  assert.equal(typeof graph.deleteBranch(renamed, { i: 1, route: null }), 'string')
  assert.equal(graph.phaseEdges(graph.deleteBranch(renamed, { i: 1, route: leaving(1)[2].route })).filter(e => e.from === 1).length, 2)
})

test('Chapter 6: open branches can be brought together on one step like slide 6-28', () => {
  const graph = require('../src/renderer/src/engine/phaseGraph.ts')
  let s = sequence([['RESTARTING', []], ['NULL', []]])
  s = graph.addBranch(s, 0, 'left')
  s = graph.addBranch(s, 0, 'right')
  const nul = s.steps.findIndex(x => x.name === 'NULL')
  assert.equal(graph.phaseEdges(s).filter(e => e.to === null).length, 3, 'two open legs and the end of NULL')
  const joined = graph.convergeBranches(s, nul)
  assert.equal(typeof joined, 'object')
  const edges = graph.phaseEdges(joined)
  assert.equal(edges.filter(e => e.to === nul).length, 3, 'trunk and both legs join NULL')
  assert.equal(edges.filter(e => e.to === null).length, 1, 'only the end of NULL still terminates')
  const laid = graph.layoutPhaseSfc(joined)
  assert.equal(laid.col[nul], laid.col[0], 'the joined step sits under the middle leg')
  assert.ok(laid.row[nul] > Math.max(...laid.row.filter((_, i) => i !== nul)), 'and below every leg')
  assert.equal(laid.cols, 3)
  assert.equal(typeof graph.convergeBranches(joined, nul), 'string', 'nothing left to join')
  // Joining on the first step is refused: every open end already follows it, so it would only make loops.
  assert.equal(typeof graph.convergeBranches(s, 0), 'string')
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const studio = require('../src/renderer/src/displays/PhaseStudio.tsx')
  const html = renderToStaticMarkup(React.createElement(studio.SfcBranchDiagram, { sfc: joined, zoom: 1, sel: null, liveStep: null,
    onSelect: () => {}, onStepOpen: () => {}, onEdgeOpen: () => {}, onStepMenu: () => {}, onEdgeMenu: () => {} }))
  assert.equal([...html.matchAll(/data-edge="[^"]*&gt;NULL"/g)].length, 3)
})

test('Chapter 6: a save made before $phase_restart_types existed still runs Restart after it is loaded', () => fixture(() => {
  blenders(); agitate()
  const unit = 'UM_BL_500'
  value(B().loadPhase(unit, 'AGITATE'))
  value(B().command(unit, 'AGITATE', 'START'))
  until(unit, r => r.params.STEP_INDEX === 4)
  value(B().command(unit, 'AGITATE', 'HOLD'))
  until(unit, r => r.state === 'HELD')
  const saved = JSON.parse(JSON.stringify(courseSnapshot()))
  const sets = saved.stores.main.namedSets
  for (const group of [sets.configured, ...Object.values(sets.deployed)]) delete group.$phase_restart_types
  assert.ok(Object.keys(sets.deployed).length >= 2)
  B().resetBatch()
  assert.equal(restoreCourseDatabase(JSON.stringify(saved)), true)
  const now = M().namedSets
  assert.ok(now.configured.$phase_restart_types)
  for (const key of Object.keys(sets.deployed)) assert.ok(now.deployed[key].$phase_restart_types, key)
  assert.ok(now.deployed.WORKSTATION.$phase_restart_types)
  value(B().command(unit, 'AGITATE', 'RESTART'))
  until(unit, r => r.state === 'RUNNING')
  assert.equal(rt(unit).failIndex, 0, 'Restart no longer fails with "Named set $phase_restart_types does not exist"')
}))

test('Chapter 6: long transition conditions are stacked on several lines, never cut with "..."', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const studio = require('../src/renderer/src/displays/PhaseStudio.tsx')
  const graph = require('../src/renderer/src/engine/phaseGraph.ts')
  const long = "('^/STEP_INDEX.CV'=3) OR ('^/STEP_INDEX.CV'=4) OR ('^/FAIL_INDEX.CV' != 0)"
  let s = sequence([['RESTARTING', []], ['DONE', []]])
  s = graph.addBranch(s, 0, 'left')
  s = graph.editEdge(s, { i: 0, route: 0 }, { name: 'STEP_INDEX_3_O_4', condition: long })
  const html = renderToStaticMarkup(React.createElement(studio.SfcBranchDiagram, { sfc: s, zoom: 1, sel: null, liveStep: null,
    onSelect: () => {}, onStepOpen: () => {}, onEdgeOpen: () => {}, onStepMenu: () => {}, onEdgeMenu: () => {} }))
  assert.ok(!html.includes('...'), 'no truncated text')
  const lines = [...html.matchAll(/<text[^>]*ps-trans-cond[^>]*>([^<]*)<\/text>/g)].map(m => m[1].replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
  assert.ok(lines.every(l => l.length <= 30), JSON.stringify(lines))
  assert.equal(lines.filter(l => l !== 'TRUE').join(' '), long.replace(/ != /, ' != '))
  // the actions of a step are listed beside it with their expression, not only their name
  s = { ...s, steps: s.steps.map((st, i) => (i === 0 ? { ...st, actions: [act("'^/RESTART_TYPE.CV' := 'From_Start';", { name: 'A1' })] } : st)) }
  const withAction = renderToStaticMarkup(React.createElement(studio.SfcBranchDiagram, { sfc: s, zoom: 1, sel: null, liveStep: null,
    onSelect: () => {}, onStepOpen: () => {}, onEdgeOpen: () => {}, onStepMenu: () => {}, onEdgeMenu: () => {} }))
  const actionText = [...withAction.matchAll(/<text[^>]*ps-step-action-text[^>]*>([^<]*)<\/text>/g)].map(m => m[1].replace(/&#x27;/g, "'")).join(' ')
  assert.ok(actionText.includes('A1:') && actionText.includes('RESTART_TYPE') && actionText.includes('From_Start'), actionText)
})

test('Chapter 6: RESTART_LOGIC branches can be added left and right of the step as on slide 6-26', () => {
  const graph = require('../src/renderer/src/engine/phaseGraph.ts')
  let s = sequence([['RESTARTING', []], ['DONE', []]])
  s = graph.addBranch(s, 0, 'left')
  const leftStep = s.steps.length - 1
  s = graph.addBranch(s, 0, 'right')
  const rightStep = s.steps.length - 1
  const laid = graph.layoutPhaseSfc(s)
  const done = s.steps.findIndex(x => x.name === 'DONE')
  assert.equal(laid.cols, 3)
  assert.equal(laid.col[leftStep], 0, 'left leg is drawn left of the step')
  assert.equal(laid.col[0], 1, 'the step stays over its trunk')
  assert.equal(laid.col[done], 1)
  assert.equal(laid.col[rightStep], 2)
  // left-to-right is also priority order: the left leg is evaluated first, the right leg last
  assert.deepEqual(graph.phaseEdges(s).filter(e => e.from === 0).map(e => e.to), [leftStep, done, rightStep])
  // a second left branch becomes the new leftmost leg
  s = graph.addBranch(s, 0, 'left')
  const left2 = s.steps.length - 1
  const laid2 = graph.layoutPhaseSfc(s)
  assert.deepEqual([laid2.col[left2], laid2.col[leftStep], laid2.col[0], laid2.col[rightStep]], [0, 1, 2, 3])
  assert.ok(new Set(laid2.row.map((r, i) => `${r}:${laid2.col[i]}`)).size === s.steps.length, 'no two steps share a position')
})

test('Chapter 6: optional holding agitation can loop with timed steps and Stop/Abort safely interrupt it', () => fixture(() => {
  blenders(); agitate()
  value(B().editPhaseDraft('AGITATE', d => {
    d.logic.HOLD_LOGIC = sequence([
      ['PAUSE', [enable(CND, 1), timer('START', 0), mode('AGITATOR'), command('AGITATOR', 0)], "'/PAUSE/TIME.CV' >= 3"],
      ['MIX', [command('AGITATOR', 1)], "'/MIX/TIME.CV' >= 3"]
    ])
    d.logic.HOLD_LOGIC.routes = [{ from: 'MIX', to: 'PAUSE', condition: "'/MIX/TIME.CV' >= 3" }]
  }))
  value(B().savePhaseClass('AGITATE'))
  value(L().downloadController('CTLR1'))
  for (const [unit, cmd] of [['UM_BL_500', 'STOP'], ['UM_BL_600', 'ABORT']]) {
    value(B().loadPhase(unit, 'AGITATE'))
    value(B().command(unit, 'AGITATE', 'START'))
    until(unit, r => r.params.STEP_INDEX === 4)
    value(B().command(unit, 'AGITATE', 'HOLD'))
    until(unit, r => r.seq.step === 1 && r.seq.stepTime >= 2.5)
    const agitator = `${B().units[unit].aliases.AGITATOR.path}/PV_D.CV`
    assert.equal(readModulePath(agitator), 1, 'holding loop agitates during MIX')
    until(unit, r => r.seq.step === 0 && r.seq.stepTime >= 2.5)
    assert.equal(readModulePath(agitator), 0, 'loop returns to a stopped PAUSE')
    assert.equal(rt(unit).state, 'HOLDING', 'loop continues until interrupted')
    assert.equal(rt(unit).failIndex, 0)
    value(B().command(unit, 'AGITATE', cmd))
    until(unit, r => r.state === (cmd === 'STOP' ? 'STOPPED' : 'ABORTED'))
    assert.equal(readModulePath(agitator), 0)
  }
}))

test('Chapter 6: Process opens each blender unit from its tank', () => fixture(() => {
  blenders()
  useBatch.setState(s => ({ contained: { ...s.contained, 'LI-504': 'UM_BL_500', 'LI-604': 'UM_BL_600' } }))
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const { ProcessDisplay } = require('../src/renderer/src/displays/ProcessDisplay.tsx')
  // SSR reads Zustand's initial snapshots rather than the current fixture.
  const initial = useBatch.getInitialState()
  const contained = initial.contained
  const libraryInitial = useLibrary.getInitialState()
  const process = libraryInitial.process
  initial.contained = B().contained
  libraryInitial.process = L().process
  try {
    const html = renderToStaticMarkup(React.createElement(ProcessDisplay))
    for (const unit of ['UM_BL_500', 'UM_BL_600']) assert.ok(html.includes(`data-unit-link="${unit}"`), unit)
  } finally {
    initial.contained = contained
    libraryInitial.process = process
  }
}))
