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
const { useEm, emIo } = require('../src/renderer/src/engine/emStore.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const expr = require('../src/renderer/src/engine/phaseExpr.ts')
const { checkCourse7016ManualOp } = require('../src/renderer/src/engine/course7016Ch2Checks.ts')
const { COURSE } = require('../src/renderer/src/engine/workshops.ts')

const L = () => useLibrary.getState()
const M = () => useStore.getState()
const B = () => useBatch.getState()
const value = (r) => { assert.equal(r.ok, true, r.error); return r.value }
const run = (n = 5) => { for (let i = 0; i < n; i++) M().tick(0.1) }
const until = (fn, n = 2000) => { for (let i = 0; i < n && !fn(); i++) run(1); assert.ok(fn(), 'condition reached') }

function fixture(fn) {
  const before = { store: M(), security: useSecurity.getState(), library: L(), batch: B(), em: useEm.getState(), system: useSystem.getState(), window: global.window }
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { alert: () => {}, localStorage: global.localStorage, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, lastDenied: null, workstation: null })
    assert.equal(L().installCourseProject(), true)
    fn()
  } finally {
    useStore.setState(before.store, true)
    useSecurity.setState(before.security, true)
    useLibrary.setState(before.library, true)
    useBatch.setState(before.batch, true)
    useEm.setState(before.em, true)
    useSystem.setState(before.system, true)
    delete global.localStorage
    if (before.window === undefined) delete global.window
    else global.window = before.window
  }
}

/** Chapter 1: LI-104 and LI-504 from LEVEL_INDICATOR, area downloaded. */
function levelIndicators() {
  value(L().renameCategory(value(L().newCategory(null)), 'AnalogInput'))
  value(L().renameClass(value(L().createClassFromTemplate('ANALOG', 'AnalogInput')), 'LEVEL_INDICATOR'))
  value(L().editDraft('LEVEL_INDICATOR', d => {
    d.blocks.AI1.params.OUT_SCALE.value = { hi: 1000, lo: 0, units: 'gal', decimals: 1 }
    d.blocks.AI1.params.L_TYPE.value = 'Direct'
    d.blocks.AI1.params.SIMULATE.value = { enabled: true, value: 0 }
    d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: '', special: { item: 'INPUT', x: 40, y: 90 } }
  }))
  value(L().connect('LEVEL_INDICATOR', 'LEVEL_IN', 'AI1/SIMULATE_IN'))
  value(L().saveClass('LEVEL_INDICATOR'))
  value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), 'LI-104'))
  value(L().setOverride('LI-104', 'LEVEL_IN', 'TANKSIM/TKLEV100'))
  value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), 'LI-504'))
  value(L().setOverride('LI-504', 'LEVEL_IN', 'LEV500-SIM/500_LEV'))
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  value(L().downloadController('CTLR1'))
  run(5)
}

test('7016 ch2 parameter paths (pp 2-8..2-11) validate in the expression editor and drive the simulated modules', () => fixture(() => {
  levelIndicators()
  value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'Ch2'))
  value(B().newPhaseClass('Ch2', 'PATHS'))
  const check = phaseCheckEnv('PATHS')
  const env = { read: p => emIo.current.read(p), write: (p, v) => emIo.current.write(p, v), named: (s, n) => emIo.current.named(s, n), log: () => {} }
  const act = (src) => { assert.deepEqual(expr.checkExpression(src, 'action', check), [], src); expr.runProgram(src, env) }
  const cond = (src) => { assert.deepEqual(expr.checkExpression(src, 'condition', check), [], src); return expr.evalCondition(src, env) }

  // p2-9 normally closed block valve, p2-8 level indication
  act("'//XV-101/MODE.TARGET' := CAS; '//XV-101/CAS_SP.CV' := 'vlvnc-sp:OPEN';")
  until(() => cond("'//XV-101/PV.CV' = 'vlvnc-pv:OPEN'"))
  until(() => cond("'//LI-104/AI1/PV.CV' >= 60"))
  act("'//XV-101/CAS_SP.CV' := 'vlvnc-sp:CLOSE'; '//XV-101/MODE.TARGET' := AUTO;")
  until(() => cond("'//XV-101/PV.CV' = 'vlvnc-pv:CLOSED'"))
  assert.equal(B().dc['XV-101'].mode, 'AUTO', 'returned to the operator')
  // p2-10 two stage block valve
  act("'//XV-502/MODE.TARGET' := CAS; '//XV-502/CAS_SP.CV' := 'vlvnc-2stage-sp:DRIBBLE';")
  until(() => cond("'//XV-502/PV.CV' = 'vlvnc-2stage-pv:DRIBBLE'"))
  assert.equal(M().modules['XV-502'].bulk, false)
  act("'//XV-502/CAS_SP.CV' := 'vlvnc-2stage-sp:BULK';")
  until(() => cond("'//XV-502/PV.CV' = 'vlvnc-2stage-pv:BULK'"))
  act("'//XV-502/CAS_SP.CV' := 'vlvnc-2stage-sp:CLOSE'; '//XV-502/MODE.TARGET' := AUTO;")
  until(() => cond("'//XV-502/PV.CV' = 'vlvnc-2stage-pv:CLOSED'"))
  // p2-11 motor: module level CAS_SP, DC1 MODE and PV_D
  act("'//MTR-505/DC1/MODE.TARGET' := CAS; '//MTR-505/CAS_SP.CV' := 'mtr2-sp:START';")
  until(() => cond("'//MTR-505/DC1/PV_D.CV' = 'mtr2-pv:RUNNING'"))
  act("'//MTR-505/CAS_SP.CV' := 'mtr2-sp:STOP'; '//MTR-505/DC1/MODE.TARGET' := AUTO;")
  until(() => cond("'//MTR-505/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'"))
  assert.equal(B().dc['MTR-505'].mode, 'AUTO')
}))

/** One Manual Operation pass from the Process picture faceplates; returns the measured results. */
function manualRun(s) {
  // Step 1: fill COLOR 100 to 60 gal (close a little early for the 2 s valve travel)
  s.openValve('XV-101')
  until(() => L().process.tk100 >= 50)
  s.closeValve('XV-101')
  run(40)
  // Step 2: 100 gal BASE 400 -> BLENDER 500 at 90 GPM
  const bl = L().process.bl500
  s.setSetpoint('FIC-404', 90)
  s.setMode('FIC-404', 'AUTO')
  s.openValve('XV-501')
  s.startMotor('MTR-403')
  until(() => L().process.bl500 - bl >= 95)
  s.stopMotor('MTR-403')
  s.closeValve('XV-501')
  run(40)
  // Step 3: dump 50 gal COLOR 100 -> BLENDER 500 (XV-502 two stage valve in Bulk)
  value(B().setTwoStage('XV-502', 'BULK'))
  s.openValve('XV-102')
  const tk = L().process.tk100
  until(() => tk - L().process.tk100 >= 45)
  s.closeValve('XV-102')
  value(B().setTwoStage('XV-502', 'CLOSE'))
  run(40)
  // Step 4: agitate one minute
  s.startMotor('AGIT-503')
  run(610)
  s.stopMotor('AGIT-503')
  run(80)
  // Step 5: drain 125 gal to Waste
  s.openValve('XV-504')
  s.startMotor('MTR-505')
  const b5 = L().process.bl500
  until(() => b5 - L().process.bl500 >= 115)
  s.stopMotor('MTR-505')
  s.closeValve('XV-504')
  run(80)
}

test('7016 ch2 Workshop - Manual Operation: two runs from the faceplates verify every step and compare the runs', () => fixture(() => {
  levelIndicators()
  const s = M()
  const pending = () => checkCourse7016ManualOp(L().transfers).filter(c => c.verdict !== 'verified').map(c => `${c.id}: ${c.detail}`)
  assert.equal(checkCourse7016ManualOp(L().transfers).filter(c => c.verdict === 'verified').length, 0)
  manualRun(s)
  assert.deepEqual(pending(), ['7016-2m-6: ' + checkCourse7016ManualOp(L().transfers)[5].detail])
  assert.match(checkCourse7016ManualOp(L().transfers)[5].detail, /Repeat the whole process/)
  manualRun(s)
  assert.deepEqual(pending(), [])
  assert.match(checkCourse7016ManualOp(L().transfers)[5].detail, /fill .* → .*, base .* → /)
}))

test('7016 ch2 FIC-404 faceplate: SP is enterable in MAN and the TUNE controls render', () => fixture(() => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const store = require('../src/renderer/src/engine/store.ts')
  const { PidFaceplate, PidTuningControls } = require('../src/renderer/src/faceplates/PidFaceplate.tsx')
  const fic = M().modules['FIC-404']
  assert.equal(fic.actualMode, 'MAN')
  assert.equal(fic.rate, 0)
  const hook = test.mock.method(store, 'useStore', selector => selector(store.useStore.getState()))
  try {
    const html = renderToStaticMarkup(React.createElement(PidFaceplate, { tag: 'FIC-404' }))
    const spRow = html.slice(html.indexOf('>Setpoint<'), html.indexOf('>Output %<'))
    assert.ok(spRow.length > 0 && !/disabled/.test(spRow), 'Setpoint stepper enabled in MAN')
    assert.match(renderToStaticMarkup(React.createElement(PidTuningControls, { tag: 'FIC-404' })), /Rate \(s\)/)
  } finally {
    hook.mock.restore()
  }
  assert.equal(M().setSetpoint('FIC-404', 90), true)
  assert.equal(M().modules['FIC-404'].sp, 90)
}))

test('7016 ch2/ch3 workshop definitions: every Chapter 2 Manual Operation step has a live check', () => {
  const ch2 = COURSE.find(m => m.module.includes('Ch 2'))
  assert.ok(ch2)
  const manual = ch2.workshops.find(w => w.id === '7016-ch2-manual')
  assert.deepEqual(manual.steps.map(s => s.id), checkCourse7016ManualOp({}).map(c => c.id))
  const ch3 = COURSE.find(m => m.module.includes('Ch 3'))
  assert.ok(ch3.workshops.some(w => w.id === '7016-ch3-licensing'))
  const all = COURSE.flatMap(m => m.workshops.flatMap(w => w.steps.map(s => s.id)))
  assert.equal(new Set(all).size, all.length, 'step ids unique across the course')
})
