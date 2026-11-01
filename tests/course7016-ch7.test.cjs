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
const { PHASE_IMPORT_FILES, DRAIN_CONDITIONS } = require('../src/renderer/src/engine/course7016Imports.ts')
const { checkCourse7016Ch7 } = require('../src/renderer/src/engine/course7016Ch7Checks.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const rt = unit => B().active[`${unit}/DRAIN`].rt
function until(unit, predicate, max = 60) {
  for (let i = 0; i < max * 10 && !predicate(rt(unit)); i++) tick()
  assert.ok(predicate(rt(unit)), `${unit}: ${JSON.stringify({ state: rt(unit).state, step: rt(unit).params.STEP_INDEX, fail: rt(unit).failIndex, msg: rt(unit).message })}\n${M().eventLog.filter(e => e.tag === `${unit}/DRAIN`).slice(-14).map(e => e.description).join('\n')}`)
}
const level = n => readModulePath(`LI-${n}04/AI1/PV.CV`)

function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installCourseProject(), true)
    prereq({ B, L, E, M, cfg, value, useStore })
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}

/** Steps 1-5 of the workshop as the student does them. */
function drainWorkshop() {
  value(B().importPhaseClass('DRAIN.fhx'))
  const ns = M().namedSets
  useStore.setState({ namedSets: { ...ns, configured: { ...ns.configured, phase_failures: { ...ns.configured.phase_failures,
    entries: [...ns.configured.phase_failures.entries, ...['AGITATOR_RUNNING', 'PUMP_STOPPED', 'PRODUCT_VLV_CLOSED'].map((name, i) => ({ name, value: i + 9, visible: true, userSelectable: true }))] } } } })
  assert.equal(M().downloadChangedNamedSets({ kind: 'workstation' }), true)
  assert.equal(M().downloadChangedNamedSets({ kind: 'controller', tag: 'CTLR1' }), true)
  value(B().assignPhaseClass('BLENDERS', 'DRAIN'))
  for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().setUnitPhaseProps(u, 'DRAIN', { phaseType: 'Controller' }))
  value(L().downloadController('CTLR1'))
  for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().downloadUnit(u, true))
  tick(1)
}

test('Chapter 7: the course supplies DRAIN as an import with the parameters and failure monitor of slide 7-4', () => fixture(() => {
  assert.ok(PHASE_IMPORT_FILES.map(f => f.file).includes('DRAIN.fhx'))
  assert.match(B().importPhaseClass('NOPE.fhx').error, /not a Course 7016 import file/)
  assert.equal(value(B().importPhaseClass('DRAIN.fhx')), 'DRAIN')
  assert.match(B().importPhaseClass('DRAIN.fhx').error, /already exists/)
  const pc = B().phaseClasses.DRAIN
  assert.equal(pc.category, 'BlenderClasses')
  assert.ok(B().categories['phase:BlenderClasses'])
  const p = pc.params
  assert.deepEqual([p.R_DRAIN_LEVEL.type, p.R_DRAIN_LEVEL.direction, p.R_DRAIN_LEVEL.low, p.R_DRAIN_LEVEL.defaultValue, p.R_DRAIN_LEVEL.high, p.R_DRAIN_LEVEL.units],
    ['Real', 'Input', 0, 250, 1000, 'gal'])
  assert.deepEqual([p.RPT_AMNT_DRAINED.type, p.RPT_AMNT_DRAINED.direction, p.RPT_AMNT_DRAINED.units], ['Real', 'Report', 'gal'])
  assert.equal(DRAIN_CONDITIONS.length, 5)
  value(B().assignPhaseClass('BLENDERS', 'DRAIN'))
  for (const c of cfg.COMPOSITES) {
    const check = phaseCheckEnv('DRAIN', undefined, c)
    for (const step of pc.logic[c].steps) for (const a of step.actions) {
      assert.deepEqual(expr.checkExpression(a.expression, 'action', check), [], a.expression)
      for (const e of [a.confirm, a.delayExpression].filter(Boolean)) assert.deepEqual(expr.checkExpression(e, 'condition', check), [], e)
    }
    for (const t of pc.logic[c].transitions) assert.deepEqual(expr.checkExpression(t.condition, 'condition', check), [], t.condition)
    for (const r of pc.logic[c].routes ?? []) assert.deepEqual(expr.checkExpression(r.condition, 'condition', check), [], r.condition)
  }
  for (const [name, b] of Object.entries(pc.logic.FAIL_MONITOR.blocks)) if (b.type === 'CND') assert.deepEqual(expr.checkExpression(b.expression, 'condition', phaseCheckEnv('DRAIN', undefined, 'FAIL_MONITOR')), [], name)
}))

test('Chapter 7: DRAIN drains each blender to the requested level and reports the amount', () => fixture(() => {
  drainWorkshop()
  assert.ok(B().units.UM_BL_500.phases.DRAIN && B().units.UM_BL_600.phases.DRAIN, 'DRAIN was added to both unit modules')
  for (const [unit, n, start, target] of [['UM_BL_500', 5, 250, 100], ['UM_BL_600', 6, 120, 40]]) {
    value(B().loadPhase(unit, 'DRAIN'))
    value(B().setOnlineParam(unit, 'DRAIN', 'R_DRAIN_LEVEL', target))
    assert.ok(Math.abs(level(n) - start) < 1, `starting level ${level(n)}`)
    value(B().command(unit, 'DRAIN', 'START'))
    until(unit, r => r.params.STEP_INDEX === 5)
    assert.equal(readModulePath(`${B().units[unit].aliases.AGITATOR.path}/PV_D.CV`), 0, 'agitator stays stopped')
    assert.equal(readModulePath(`${B().units[unit].aliases.BASE_IN_VLV.path}/PV.CV`), 0, 'blender sealed off')
    until(unit, r => r.state === 'COMPLETE')
    assert.ok(level(n) <= target && level(n) > target - 25, `final level ${level(n)}`)
    const drained = rt(unit).params.RPT_AMNT_DRAINED
    assert.ok(Math.abs(drained - (start - level(n))) < 1, `RPT_AMNT_DRAINED ${drained}`)
    assert.equal(rt(unit).params.STEP_INDEX, 0)
    assert.equal(readModulePath(`${B().units[unit].aliases.OUT_PUMP.path}/PV_D.CV`), 0)
    assert.equal(readModulePath(`${B().units[unit].aliases.BLNDR_OUTLET.path}/PRODUCT_VLV/PV.CV`), 0)
  }
  const other = rt('UM_BL_500')
  assert.equal(other.state, 'COMPLETE')
}))

test('Chapter 7: each DRAIN failure is reported, makes the blender safe, and recovers with Clear Failures and Restart', () => fixture(() => {
  drainWorkshop()
  for (const [unit, n] of [['UM_BL_500', 5], ['UM_BL_600', 6]]) {
    if (n === 6) L().process.bl600 = 400
    value(B().loadPhase(unit, 'DRAIN'))
    value(B().setOnlineParam(unit, 'DRAIN', 'R_DRAIN_LEVEL', 0))
    value(B().command(unit, 'DRAIN', 'START'))
    const a = B().units[unit].aliases
    const em = E().instances
    const trips = [
      ['BASE_VLV_OPEN', 7, () => { const t = a.BASE_IN_VLV.path; value(B().setDeviceMode(t, 'AUTO')); M().openValve(t) }],
      ['COLOR_VLV_OPEN', 8, () => { const t = em[a.BLNDR_COLOR.path].children.COLOR_IN_VLV; value(B().setDeviceMode(t, 'AUTO')); M().openValve(t) }],
      ['AGITATOR_RUNNING', 9, () => { const t = a.AGITATOR.path; value(B().setDeviceMode(t, 'AUTO')); M().startMotor(t) }],
      ['PUMP_STOPPED', 10, () => { const t = a.OUT_PUMP.path; value(B().setDeviceMode(t, 'AUTO')); M().stopMotor(t) }],
      ['PRODUCT_VLV_CLOSED', 11, () => { const t = em[a.BLNDR_OUTLET.path].children.PRODUCT_VLV; value(B().setDeviceMode(t, 'AUTO')); M().closeValve(t) }]
    ]
    for (const [name, index, trip] of trips) {
      until(unit, r => r.state === 'RUNNING' && r.params.STEP_INDEX === 5)
      tick(0.5)
      trip()
      until(unit, r => r.state === 'HELD')
      assert.equal(rt(unit).failIndex, index, name)
      assert.equal(rt(unit).message, name)
      for (const x of ['OUT_PUMP', 'AGITATOR', 'BASE_IN_VLV']) assert.equal(readModulePath(`${a[x].path}/PV_D.CV`) ?? readModulePath(`${a[x].path}/PV.CV`), 0, `${x} safe after ${name}`)
      assert.equal(readModulePath(`${a.BLNDR_OUTLET.path}/PRODUCT_VLV/PV.CV`), 0)
      assert.equal(B().command(unit, 'DRAIN', 'RESTART').ok, false, 'Restart is refused until the failure is cleared')
      value(B().command(unit, 'DRAIN', 'CLEAR_FAILURES'))
      value(B().command(unit, 'DRAIN', 'RESTART'))
      until(unit, r => r.state === 'RUNNING')
      assert.equal(rt(unit).failIndex, 0)
    }
    until(unit, r => r.state === 'COMPLETE')
    assert.ok(level(n) < 5, `drained to ${level(n)}`)
  }
}))

test('Chapter 7: Hold during the drain stops the pump and Restart resumes it; Stop leaves the blender safe', () => fixture(() => {
  drainWorkshop()
  const unit = 'UM_BL_500'
  value(B().loadPhase(unit, 'DRAIN'))
  value(B().setOnlineParam(unit, 'DRAIN', 'R_DRAIN_LEVEL', 0))
  value(B().command(unit, 'DRAIN', 'START'))
  until(unit, r => r.params.STEP_INDEX === 5)
  tick(2)
  value(B().command(unit, 'DRAIN', 'HOLD'))
  until(unit, r => r.state === 'HELD')
  const held = level(5)
  tick(3)
  assert.equal(level(5), held, 'no drain while held')
  value(B().command(unit, 'DRAIN', 'RESTART'))
  until(unit, r => r.state === 'RUNNING')
  tick(3)
  assert.ok(level(5) < held)
  value(B().command(unit, 'DRAIN', 'STOP'))
  until(unit, r => r.state === 'STOPPED')
  assert.equal(readModulePath(`${B().units[unit].aliases.OUT_PUMP.path}/PV_D.CV`), 0)
}))

test('Chapter 7: the workshop checks verify each step from the configuration and the run history', () => fixture(() => {
  const state = () => ({ phaseClasses: B().phaseClasses, phaseDrafts: B().phaseDrafts, unitClasses: B().unitClasses, units: B().units, deployedUnits: B().deployedUnits })
  const pending = () => checkCourse7016Ch7(state(), M().eventLog, M().namedSets).filter(c => c.verdict !== 'verified').map(c => c.id)
  assert.equal(pending().length, 6, 'nothing verified before the work is done')
  drainWorkshop()
  for (const unit of ['UM_BL_500', 'UM_BL_600']) {
    value(B().loadPhase(unit, 'DRAIN'))
    value(B().setOnlineParam(unit, 'DRAIN', 'R_DRAIN_LEVEL', 100))
    value(B().command(unit, 'DRAIN', 'START'))
    until(unit, r => r.state === 'COMPLETE')
  }
  assert.deepEqual(pending(), [])
}))
