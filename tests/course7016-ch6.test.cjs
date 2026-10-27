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

function agitate() {
  value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'BlenderClasses'))
  value(B().newPhaseClass('BlenderClasses', 'AGITATE'))
  for (const [name, direction] of [['R_BLEND_TIME', 'Input'], ['RPT_BLEND_TIME', 'Report']]) {
    value(B().savePhaseParam('AGITATE', { ...cfg.newParam('batch', {}), name, type: 'Integer', direction,
      group: direction === 'Input' ? 'Operating' : 'Report', units: 'sec', low: 0, high: 300, defaultValue: direction === 'Input' ? 30 : 0 }))
  }
  value(B().editPhaseDraft('AGITATE', d => {
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
    fm.BLOCK1 = { type: 'CALC', inputs: [], disabled: false, expression: "IF '/BFI1/OUT_D.CV' AND '/+/FAIL_INDEX.CV' = 0 THEN '/+/FAIL_INDEX.CV' := '/MESSAGE/OUT1.CV'; ENDIF;" }
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

test('Chapter 6: both real blender instances run, retain time on Hold, recover all five failures, and survive save/restore', () => fixture(() => {
  blenders()
  agitate()
  const pc = B().phaseClasses.AGITATE, check = phaseCheckEnv('AGITATE')
  for (const c of cfg.COMPOSITES) {
    for (const step of pc.logic[c].steps) for (const a of step.actions) {
      assert.deepEqual(expr.checkExpression(a.expression, 'action', check), [], a.expression)
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

test('Chapter 6: early Hold restarts initialization; Stop/Abort stop the agitator and reset permits another run', () => fixture(() => {
  blenders(); agitate()
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
  for (const label of ['Confirm action for pulse qualifier', 'Confirm expression', 'Confirm timeout', 'Expression Assistant']) assert.ok(confirmTab.includes(label), label)

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
  for (const text of ['data-wire="CND1/OUT_D-&gt;BFI1/IN_D1"', 'data-wire="BFI1/FIRST_OUT-&gt;MESSAGE/IN1"', 'data-block-type="BFI"', 'RESET_IN', 'FIRST_OUT', 'DISABLE = 1']) {
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
