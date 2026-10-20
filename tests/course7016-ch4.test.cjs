const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText, filename)
  }
}
const { useStore } = require('../src/renderer/src/engine/store.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { useLibrary } = require('../src/renderer/src/engine/libraryStore.ts')
const { useBatch, phaseCheckEnv } = require('../src/renderer/src/engine/batchStore.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const expr = require('../src/renderer/src/engine/phaseExpr.ts')

const L = () => useLibrary.getState()
const M = () => useStore.getState()
const B = () => useBatch.getState()
const value = (r) => { assert.equal(r.ok, true, r.error); return r.value }
const run = (n = 5) => { for (let i = 0; i < n; i++) M().tick(0.1) }

function fixture(fn) {
  const before = { store: M(), security: useSecurity.getState(), library: L(), batch: B(), system: useSystem.getState(), window: global.window }
  const alerts = []
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { alert: (m) => alerts.push(m), localStorage: global.localStorage, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, lastDenied: null, workstation: null })
    assert.equal(L().installCourseProject(), true)
    fn(alerts)
  } finally {
    useStore.setState(before.store, true)
    useSecurity.setState(before.security, true)
    useLibrary.setState(before.library, true)
    useBatch.setState(before.batch, true)
    useSystem.setState(before.system, true)
    delete global.localStorage
    if (before.window === undefined) delete global.window
    else global.window = before.window
  }
}

/** Chapter 1 prerequisite: LEVEL_INDICATOR and LI-104/204/304 reading TANKSIM. */
function chapter1() {
  value(L().renameCategory(value(L().newCategory(null)), 'AnalogInput'))
  value(L().renameClass(value(L().createClassFromTemplate('ANALOG', 'AnalogInput')), 'LEVEL_INDICATOR'))
  value(L().editDraft('LEVEL_INDICATOR', d => {
    const ai = d.blocks.AI1.params
    ai.OUT_SCALE.value = { hi: 500, lo: 0, units: 'gal', decimals: 1 }
    ai.OUT_SCALE.allowInstance = true
    ai.L_TYPE.value = 'Direct'
    d.alarms.HI_ALM.enabled = false
    d.alarms.LO_ALM.enabled = false
    ai.SIMULATE.value = { enabled: true, value: 0 }
    d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: '', special: { item: 'INPUT', x: 40, y: 90 } }
    d.primaryDisplay = 'Process'
  }))
  value(L().connect('LEVEL_INDICATOR', 'LEVEL_IN', 'AI1/SIMULATE_IN'))
  value(L().saveClass('LEVEL_INDICATOR'))
  for (const n of [1, 2, 3]) {
    value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), `LI-${n}04`))
    value(L().setOverride(`LI-${n}04`, 'LEVEL_IN', `TANKSIM/TKLEV${n}00`))
  }
}

const RUN_LOGIC = [
  ['INIT', ["'//#OUTLET_VLV#/MODE.TARGET' := CAS;", "'//#OUTLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'OUTLET_CLOSED', "'//#OUTLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"],
  ['OPEN_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:OPEN';"], 'LEVEL_MET', "'//#TANK_LEVEL#' >= '^/R_FILL_LEVEL.CV'"],
  ['CLOSE_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'INLET_CLOSED', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"],
  ['COMPLETE', ["'^/RPT_FNL_LVL.CV' := '//#TANK_LEVEL#';", "'//#INLET_VLV#/MODE.TARGET' := AUTO;", "'//#OUTLET_VLV#/MODE.TARGET' := AUTO;"], 'COMPLETE_2', 'TRUE']
]

function sequence(rows) {
  let sfc = cfg.insertSequence(cfg.defaultSfc(), 0, rows.length - 1)
  sfc = {
    steps: sfc.steps.map((s, i) => ({ ...s, name: rows[i][0], actions: rows[i][1].map((e, j) => ({ name: `A${j + 1}`, description: '', type: 'Assignment', qualifier: 'N', time: 0, expression: e })) })),
    transitions: sfc.transitions.map((t, i) => ({ ...t, name: rows[i][2], condition: rows[i][3] }))
  }
  return sfc
}

function chapter4() {
  // Task 1
  const pcc = value(B().newProcessCellClass('General'))
  value(B().renameClass('pcell', pcc, 'PRODUCTION'))
  const cell = value(B().createProcessCell('PRODUCTION', 'ED_CENTER_BATCH'))
  value(B().renameProcessCell(cell, 'PAINT_PRODUCTION'))
  // Task 2
  value(B().renameCategory('unit', value(B().newCategory('unit', null)), 'ChargeTankUnits'))
  value(B().newUnitClass('ChargeTankUnits', 'COLORTANKS'))
  for (const a of ['INLET_VLV', 'OUTLET_VLV', 'TANK_LEVEL']) value(B().addAlias('COLORTANKS', a, ''))
  // Task 3
  value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'TankClasses'))
  value(B().newPhaseClass('TankClasses', 'FILL'))
  value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', {}), name: 'R_FILL_LEVEL', group: 'Operating', type: 'Real', direction: 'Input', low: 0, high: 500, defaultValue: 250, units: 'gal' }))
  value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', B().phaseClasses.FILL.params), name: 'RPT_FNL_LVL', group: 'Report', type: 'Real', direction: 'Report', units: 'gal' }))
  // Task 4
  value(B().editPhaseDraft('FILL', d => { d.logic.RUN_LOGIC = sequence(RUN_LOGIC) }))
  value(B().savePhaseClass('FILL'))
  value(B().assignPhaseClass('COLORTANKS', 'FILL'))
  // Task 5 and 6
  for (const n of [1, 2, 3]) {
    const um = value(B().createUnitModule('COLORTANKS', 'PAINT_PRODUCTION'))
    assert.equal(um, 'COLORTANKS_1')
    value(B().renameUnitModule(um, `UM_COLOR_${n}00`))
    const u = `UM_COLOR_${n}00`
    value(B().resolveAlias(u, 'INLET_VLV', { path: `XV-${n}01`, ignore: false, description: '' }))
    value(B().resolveAlias(u, 'OUTLET_VLV', { path: `XV-${n}02`, ignore: false, description: '' }))
    value(B().resolveAlias(u, 'TANK_LEVEL', { path: `LI-${n}04/AI1/PV.CV`, ignore: false, description: '' }))
    for (const t of [`XV-${n}01`, `XV-${n}02`, `LI-${n}04`]) value(B().containModule(t, u))
    // Task 7
    value(B().setUnitProps(u, { primaryDisplay: 'Process' }))
    value(B().setUnitPhaseProps(u, 'FILL', { phaseType: 'Controller' }))
  }
  value(B().addToCell('TANKSIM', 'PAINT_PRODUCTION'))
  value(B().assignCell('PAINT_PRODUCTION', 'CTLR1'))
  const report = value(L().downloadController('CTLR1'))
  return report
}

test('7016 ch4: phase-logic expressions parse, validate and evaluate like DeltaV', () => {
  const p = expr.parseProgram("'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:OPEN'; '^/RPT.CV' := '//X/PV.CV' + 1;")
  assert.equal(p.statements.length, 2)
  assert.equal(p.statements[0].expr.k, 'named')
  assert.throws(() => expr.parseProgram("'//X/PV.CV' := "), /end of expression/)
  const vars = { a: 5 }
  const env = { read: r => vars[r] ?? 0, write: (r, v) => { vars[r] = v }, named: (s, st) => (st === 'OPEN' ? 1 : 0), log: () => {} }
  expr.runProgram("'a' := 'a' * 2 + 1; 'b' := SELSTR(\"none\", \"big\", 'a' > 10)", env)
  assert.equal(vars.a, 11)
  assert.equal(vars.b, 'big')
  assert.equal(expr.evalCondition("'a' >= 11 AND NOT 'z' <> 0", env), true)
  const check = { checkRef: r => (r.includes('BAD') ? `bad ${r}` : null), checkNamed: (s) => (s === 'vlvnc-sp' ? null : `no set ${s}`) }
  assert.deepEqual(expr.checkExpression("'//BAD/PV.CV' := 'nope:OPEN'", 'action', check), ['bad //BAD/PV.CV', 'no set nope'])
  assert.match(expr.checkExpression("'//X/PV.CV' := 1", 'condition', check)[0], /single Boolean/)
})

test('7016 ch3: Enable Batch auto-selects Advanced Unit Management and needs a server restart', () => fixture(() => {
  useSystem.setState({ features: { batch: false, advancedUnitManagement: false, fieldbus: false, signaturePolicies: false }, pending: {}, acknowledged: false, serverState: 'RUNNING', clients: [] })
  assert.equal(useSystem.getState().setPendingFeature('batch', true), null)
  assert.deepEqual(useSystem.getState().pending, { batch: true, advancedUnitManagement: true })
  assert.match(useSystem.getState().setPendingFeature('advancedUnitManagement', false), /required while Enable Batch/)
  assert.equal(useSystem.getState().acknowledgePending(), null)
  assert.equal(useSystem.getState().shutdownServer(), null)
  assert.equal(useSystem.getState().connectServer(), null)
  assert.equal(useSystem.getState().features.batch, true)
  assert.equal(useSystem.getState().features.advancedUnitManagement, true)
}))

test('7016 ch4 FILL workshop: classes, aliases, unit modules, download and running FILL on UM_COLOR_100', () => fixture(() => {
  chapter1()
  const report = chapter4()
  assert.ok(report.downloaded.includes('UM_COLOR_100') && report.downloaded.includes('LI-104'), report.downloaded.join(','))
  assert.deepEqual(report.warnings, [])
  assert.equal(B().unitAssignments.UM_COLOR_300, 'CTLR1')
  assert.equal(L().assignments.TANKSIM, 'CTLR1')
  assert.equal(B().deployedUnits.UM_COLOR_100.unit.aliases.TANK_LEVEL.path, 'LI-104/AI1/PV.CV')
  // unit phase FILL exists on each unit module, logic validates in Control Studio
  const check = phaseCheckEnv('FILL')
  for (const [, actions, , cond] of RUN_LOGIC) {
    for (const a of actions) assert.deepEqual(expr.checkExpression(a, 'action', check), [], a)
    assert.deepEqual(expr.checkExpression(cond, 'condition', check), [], cond)
  }
  assert.match(expr.checkExpression("'//#NOPE#/PV.CV' = 1", 'condition', check)[0], /not an alias of COLORTANKS/)

  run(3)
  // Run the unit phase (p4-34/4-35): load, toggle owner stays External, set R_FILL_LEVEL via BatchHelp, Start
  assert.match(B().command('UM_COLOR_100', 'FILL', 'START').error, /not loaded/)
  value(B().loadPhase('UM_COLOR_100', 'fill'))
  value(B().setOnlineParam('UM_COLOR_100', 'FILL', 'R_FILL_LEVEL', 100))
  assert.match(B().setOnlineParam('UM_COLOR_100', 'FILL', 'R_FILL_LEVEL', 900).error, /between 0 and 500/)
  assert.deepEqual(B().pendingUploads('UM_COLOR_100'), [{ phase: 'FILL', param: 'R_FILL_LEVEL', value: 100 }])
  value(B().toggleOwner('UM_COLOR_100', 'FILL'))
  assert.match(B().command('UM_COLOR_100', 'FILL', 'START').error, /owned by DeltaV Batch/)
  value(B().toggleOwner('UM_COLOR_100', 'FILL'))
  value(B().command('UM_COLOR_100', 'FILL', 'START'))
  run(5)
  assert.equal(B().dc['XV-101'].mode, 'CAS')
  assert.equal(M().modules['XV-101'].commandedOpen, true)
  for (let i = 0; i < 400 && B().active['UM_COLOR_100/FILL'].rt.state === 'RUNNING'; i++) run(1)
  const a = B().active['UM_COLOR_100/FILL']
  assert.equal(a.rt.state, 'COMPLETE', a.rt.message)
  assert.ok(a.rt.params.RPT_FNL_LVL >= 100, `report ${a.rt.params.RPT_FNL_LVL}`)
  assert.equal(B().dc['XV-101'].mode, 'AUTO')
  assert.equal(M().modules['XV-101'].commandedOpen, false)
  assert.match(B().unloadPhase('UM_COLOR_100', 'FILL').error, /Reset/)
  value(B().command('UM_COLOR_100', 'FILL', 'RESET'))
  value(B().unloadPhase('UM_COLOR_100', 'FILL'))
  assert.equal(B().active['UM_COLOR_100/FILL'], undefined)
}))

test('7016 ch4 Hold & Restart: HOLD closes the inlet, RESTART reopens it and RUN_LOGIC resumes', () => fixture(() => {
  chapter1()
  chapter4()
  value(B().editPhaseDraft('FILL', d => {
    d.logic.HOLD_LOGIC = sequence([['CLOSE_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'HOLD', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"]])
    d.logic.RESTART_LOGIC = sequence([['OPEN_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:OPEN';"], 'RESTART', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:OPEN'"]])
  }))
  value(B().savePhaseClass('FILL'))
  value(B().downloadUnitPhase('UM_COLOR_100', 'FILL'))
  run(2)
  value(B().loadPhase('UM_COLOR_100', 'FILL'))
  value(B().command('UM_COLOR_100', 'FILL', 'START'))
  for (let i = 0; i < 100 && !M().modules['XV-101'].open; i++) run(1)
  assert.equal(M().modules['XV-101'].open, true, 'tank begins filling')
  const level = L().process.tk100
  value(B().command('UM_COLOR_100', 'FILL', 'HOLD'))
  for (let i = 0; i < 100 && B().active['UM_COLOR_100/FILL'].rt.state !== 'HELD'; i++) run(1)
  assert.equal(B().active['UM_COLOR_100/FILL'].rt.state, 'HELD')
  assert.equal(M().modules['XV-101'].open, false)
  const held = L().process.tk100
  assert.ok(held > level)
  run(20)
  assert.ok(Math.abs(L().process.tk100 - held) < 1e-9, 'no filling while held')
  assert.match(B().command('UM_COLOR_100', 'FILL', 'START').error, /not valid while the phase is Held/)
  value(B().command('UM_COLOR_100', 'FILL', 'RESTART'))
  for (let i = 0; i < 100 && B().active['UM_COLOR_100/FILL'].rt.state !== 'RUNNING'; i++) run(1)
  assert.equal(B().active['UM_COLOR_100/FILL'].rt.state, 'RUNNING')
  assert.equal(cfg.activeStepName(B().active['UM_COLOR_100/FILL'].rt, B().deployedUnits.UM_COLOR_100.logic.FILL), 'OPEN_INLET', 'resumed at the LEVEL_MET wait')
  run(10)
  assert.ok(L().process.tk100 > held, 'COLOR_100 resumes filling')
}))

test('7016 ch4: unresolved aliases fail the phase into Holding and are reported on download', () => fixture(() => {
  chapter1()
  chapter4()
  value(B().resolveAlias('UM_COLOR_200', 'INLET_VLV', { path: '', ignore: false, description: '' }))
  assert.match(B().resolveAlias('UM_COLOR_200', 'INLET_VLV', { path: 'NOPE-1', ignore: false, description: '' }).error, /does not exist/)
  const r = value(B().downloadUnit('UM_COLOR_200', false))
  assert.ok(r.warnings.some(w => /INLET_VLV is not resolved/.test(w)))
  run(2)
  value(B().loadPhase('UM_COLOR_200', 'FILL'))
  value(B().command('UM_COLOR_200', 'FILL', 'START'))
  for (let i = 0; i < 100 && B().active['UM_COLOR_200/FILL'].rt.state === 'RUNNING'; i++) run(1)
  const rt = B().active['UM_COLOR_200/FILL'].rt
  assert.ok(['HOLDING', 'HELD'].includes(rt.state), rt.state)
  assert.equal(rt.failIndex, 'FAILED')
  assert.match(rt.message, /INLET_VLV# is not resolved/)
  assert.match(B().command('UM_COLOR_200', 'FILL', 'RESTART').error ?? 'HOLDING', /failure|not valid/)
}))

test('7016 ch4 syntax reference (pp 4-21..4-23): /, ^/, //, ##, named states, :=, comparisons, +, quotes and ; all execute', () => fixture(() => {
  chapter1()
  chapter4()
  const INIT = ["'//#OUTLET_VLV#/MODE.TARGET' := CAS;", "'//#OUTLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';",
    "'/REQUEST.CV' := 3202;", 'LOGEVENT("FILL target " + \'^/R_FILL_LEVEL.CV\' + " gal");']
  const OUTLET_CLOSED = "'//#OUTLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED' AND '^/REQUEST.CV' = 3202 AND '^/REQUEST.CV' <> 0 AND '^/REQUEST.CV' != 1" +
    " AND '/INLET_VLV.IGN' = FALSE AND '//XV-102/DC1/SP_D' = 0 AND '//#TANK_LEVEL#' < 500 AND '^/R_FILL_LEVEL.CV' > 0 AND '^/R_FILL_LEVEL.CV' <= 500"
  const check = phaseCheckEnv('FILL')
  for (const a of INIT) assert.deepEqual(expr.checkExpression(a, 'action', check), [], a)
  assert.deepEqual(expr.checkExpression(OUTLET_CLOSED, 'condition', check), [])
  assert.deepEqual(expr.checkExpression("'^/REQUEST.CV' := 3202", 'action', check), [], 'the trailing ; is optional on the last statement')
  assert.ok(expr.checkExpression("'^/REQUEST.CV' = 0", 'action', check).length, 'a comparison is not an action')
  assert.ok(expr.checkExpression("'^/REQUEST.CV' := 3202", 'condition', check).length, 'an assignment is not a transition')
  value(B().editPhaseDraft('FILL', d => {
    d.logic.RUN_LOGIC.steps[0].actions = INIT.map((e, j) => ({ name: `A${j + 1}`, description: '', type: 'Assignment', qualifier: 'N', time: 0, expression: e }))
    d.logic.RUN_LOGIC.transitions[0].condition = OUTLET_CLOSED
  }))
  value(B().savePhaseClass('FILL'))
  value(B().downloadUnitPhase('UM_COLOR_100', 'FILL'))
  run(2)
  value(B().loadPhase('UM_COLOR_100', 'FILL'))
  value(B().setOnlineParam('UM_COLOR_100', 'FILL', 'R_FILL_LEVEL', 60))
  value(B().command('UM_COLOR_100', 'FILL', 'START'))
  for (let i = 0; i < 400 && B().active['UM_COLOR_100/FILL'].rt.state === 'RUNNING'; i++) run(1)
  const a = B().active['UM_COLOR_100/FILL']
  assert.equal(a.rt.state, 'COMPLETE', a.rt.message)
  assert.equal(a.rt.params.REQUEST, 3202)
  assert.ok(M().eventLog.some(e => /LOGEVENT: FILL target 60 gal/.test(e.description)), 'LOGEVENT concatenates strings and numbers')
}))

const checks = require('../src/renderer/src/engine/course7016Ch4Checks.ts')
const notVerified = (list) => list.filter(s => s.verdict !== 'verified').map(s => `${s.id}: ${s.detail}`)

function runFill(n, level = 60) {
  const u = `UM_COLOR_${n}00`
  value(B().loadPhase(u, 'FILL'))
  value(B().setOnlineParam(u, 'FILL', 'R_FILL_LEVEL', level))
  value(B().command(u, 'FILL', 'START'))
  for (let i = 0; i < 400 && B().active[`${u}/FILL`].rt.state === 'RUNNING'; i++) run(1)
  assert.equal(B().active[`${u}/FILL`].rt.state, 'COMPLETE', B().active[`${u}/FILL`].rt.message)
  value(B().command(u, 'FILL', 'RESET'))
  value(B().unloadPhase(u, 'FILL'))
}

test('7016 workshop checker: Chapter 3 and every FILL workshop step verify from live state', () => fixture(() => {
  const sys = useSystem.getState()
  assert.equal(checks.checkCourse7016Ch3({ ...sys, features: { ...sys.features, batch: false, advancedUnitManagement: false }, pending: {}, serverState: 'RUNNING', restarts: 0 })[1].verdict, 'pending')
  chapter1()
  const before = checks.checkCourse7016Ch4(B(), M().eventLog)
  assert.equal(before.find(s => s.id === '7016-4-1-2').verdict, 'pending')
  chapter4()
  run(2)
  for (const n of [1, 2, 3]) runFill(n)
  assert.deepEqual(notVerified(checks.checkCourse7016Ch4(B(), M().eventLog)), [])
  // an incomplete RUN_LOGIC is reported precisely
  value(B().editPhaseDraft('FILL', d => { d.logic.RUN_LOGIC.steps[1].actions.pop() }))
  const r = checks.checkCourse7016Ch4(B(), M().eventLog)
  assert.match(r.find(s => s.id === '7016-4-4-2').detail, /OPEN_INLET is missing '\/\/#INLET_VLV#\/CAS_SP.CV':='vlvnc-sp:OPEN'/)
  assert.equal(r.find(s => s.id === '7016-4-4-3').verdict, 'pending')
}))

test('7016 workshop checker: Hold & Restart, Verify Functionality and the optional exercises', () => fixture(() => {
  chapter1()
  chapter4()
  value(B().editPhaseDraft('FILL', d => {
    d.logic.HOLD_LOGIC = sequence([['CLOSE_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'HOLD', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"]])
    d.logic.RESTART_LOGIC = sequence([['OPEN_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:OPEN';"], 'RESTART', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:OPEN'"]])
    const close = ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';", "'//#OUTLET_VLV#/MODE.TARGET' := CAS;", "'//#OUTLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"]
    d.logic.STOP_LOGIC = sequence([['CLOSE_ALL', close, 'CLOSED', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED' AND '//#OUTLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"]])
    d.logic.ABORT_LOGIC = sequence([['CLOSE_ALL', close, 'DONE', 'TRUE']])
    d.logic.RUN_LOGIC.transitions[1].condition = "'//#TANK_LEVEL#' >= '^/R_FILL_LEVEL.CV' - '^/OVERSHOOT.CV'"
  }))
  value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', B().phaseClasses.FILL.params), name: 'OVERSHOOT', group: 'Operating', type: 'Real', direction: 'Input', low: 0, high: 50, defaultValue: 0, units: 'gal' }))
  value(B().savePhaseClass('FILL'))
  assert.deepEqual(notVerified(checks.checkCourse7016HoldRestart(B())).map(x => x.split(':')[0]), ['7016-4r-3'])
  for (const [n, o] of [[1, 12], [2, 16], [3, 10]]) value(B().setUnitPhaseParam(`UM_COLOR_${n}00`, 'FILL', 'OVERSHOOT', o))
  value(L().downloadController('CTLR1'))
  assert.deepEqual(notVerified(checks.checkCourse7016HoldRestart(B())), [])
  run(2)
  for (const n of [1, 2, 3]) {
    const u = `UM_COLOR_${n}00`
    value(B().loadPhase(u, 'FILL'))
    assert.equal(B().active[`${u}/FILL`].rt.params.OVERSHOOT, [12, 16, 10][n - 1], 'per-unit configured value is downloaded')
    value(B().command(u, 'FILL', 'START'))
    for (let i = 0; i < 100 && !M().modules[`XV-${n}01`].open; i++) run(1)
    value(B().command(u, 'FILL', 'HOLD'))
    for (let i = 0; i < 100 && B().active[`${u}/FILL`].rt.state !== 'HELD'; i++) run(1)
    assert.equal(M().modules[`XV-${n}01`].open, false)
    value(B().command(u, 'FILL', 'RESTART'))
    for (let i = 0; i < 100 && B().active[`${u}/FILL`].rt.state !== 'RUNNING'; i++) run(1)
    assert.equal(B().active[`${u}/FILL`].rt.state, 'RUNNING')
  }
  assert.deepEqual(notVerified(checks.checkCourse7016Verify(M().eventLog)), [])
  value(B().command('UM_COLOR_100', 'FILL', 'STOP'))
  value(B().command('UM_COLOR_200', 'FILL', 'ABORT'))
  for (let i = 0; i < 100 && !(B().active['UM_COLOR_100/FILL'].rt.state === 'STOPPED' && B().active['UM_COLOR_200/FILL'].rt.state === 'ABORTED'); i++) run(1)
  assert.equal(B().active['UM_COLOR_100/FILL'].rt.state, 'STOPPED')
  assert.equal(B().active['UM_COLOR_200/FILL'].rt.state, 'ABORTED')
  assert.equal(M().modules['XV-101'].open || M().modules['XV-102'].open, false, 'STOP_LOGIC closed both valves')
  assert.deepEqual(notVerified(checks.checkCourse7016Optional(B(), M().eventLog)), [])
}))

test('7016 ch4 screens render: Phase Studio state diagram and RUN_LOGIC SFC, BatchHelp, unit and phase faceplates', () => fixture(() => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const storeMod = require('../src/renderer/src/engine/store.ts')
  const batchMod = require('../src/renderer/src/engine/batchStore.ts')
  const libMod = require('../src/renderer/src/engine/libraryStore.ts')
  const uiMod = require('../src/renderer/src/ui/uiStore.ts')
  const batchUiMod = require('../src/renderer/src/ui/batchUi.ts')
  const { PhaseStudio } = require('../src/renderer/src/displays/PhaseStudio.tsx')
  const fp = require('../src/renderer/src/components/BatchFaceplates.tsx')
  const { ProcessDisplay } = require('../src/renderer/src/displays/ProcessDisplay.tsx')
  const render = (C, props) => {
    const hooks = [[storeMod, 'useStore'], [batchMod, 'useBatch'], [libMod, 'useLibrary'], [uiMod, 'useUi'], [batchUiMod, 'useBatchUi']]
      .map(([m, k]) => { const real = m[k]; return test.mock.method(m, k, sel => (sel ? sel(real.getState()) : real.getState())) })
    try { return renderToStaticMarkup(React.createElement(C, props)) } finally { hooks.forEach(h => h.mock.restore()) }
  }
  chapter1()
  chapter4()
  run(2)
  const ui = uiMod.useUi
  const before = ui.getState()
  try {
    ui.getState().openPhaseStudio('FILL')
    const states = render(PhaseStudio)
    for (const s of ['Failure_Monitor', 'Aborting', 'Holding', 'Held', 'Restarting', 'Idle', 'Running', 'Stopping', 'Complete', 'Stopped', 'Start &amp; not fail'])
      assert.ok(states.includes(s), s)
    assert.match(states, /R_FILL_LEVEL/)
    ui.getState().openPhaseStudio('FILL', 'RUN_LOGIC')
    const sfc = render(PhaseStudio)
    for (const s of ['INIT', 'OUTLET_CLOSED', 'OPEN_INLET', 'LEVEL_MET', 'CLOSE_INLET', 'INLET_CLOSED', 'COMPLETE', 'COMPLETE_2', 'All SFC Items', 'Sequence', 'Termination'])
      assert.ok(sfc.includes(`>${s}<`) || sfc.includes(s), s)
    assert.match(sfc, /data-step="OPEN_INLET"/)
    assert.match(sfc, /AUTO_ADVANCE/, 'composite parameters in the parameter view')
  } finally { ui.setState(before, true) }
  assert.match(render(ProcessDisplay), /data-unit-link="UM_COLOR_100"/)
  value(B().loadPhase('UM_COLOR_100', 'FILL'))
  const unit = render(fp.UnitFaceplate, { unit: 'UM_COLOR_100' })
  for (const s of ['UM_COLOR_100', 'Batch ID', 'Unit Procedure', 'Active Phases', 'FILL', 'EXT', 'Idle', 'Load a Phase']) assert.ok(unit.includes(s), s)
  const phase = render(fp.PhaseFaceplate, { unit: 'UM_COLOR_100', phase: 'FILL' })
  for (const s of ['UM_COLOR_100/P1', 'Unload', 'Phase State', 'Time in State', 'Step Index', 'Watchdog State', 'Phase Command', 'Phase Owner', 'DeltaV Batch', 'External', 'R_FILL_LEVEL', 'RPT_FNL_LVL'])
    assert.ok(phase.includes(s), s)
  const help = render(fp.BatchHelpDisplay)
  for (const s of ['Batch Help', 'UM_COLOR_100', 'UM_COLOR_200', 'UM_COLOR_300', 'R_FILL_LEVEL', 'Not loaded', 'Downloaded to CTLR1']) assert.ok(help.includes(s), s)
}))