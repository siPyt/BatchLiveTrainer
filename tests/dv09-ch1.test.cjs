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
const { useBatch } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm } = require('../src/renderer/src/engine/emStore.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { checkDv09Ch1 } = require('../src/renderer/src/engine/dv09Ch1Checks.ts')
const { DV09_COURSE } = require('../src/renderer/src/engine/dv09Course.ts')
const { COURSE } = require('../src/renderer/src/engine/workshops.ts')
const M = () => useStore.getState(), L = () => useLibrary.getState()
const START = 'CTLR-02F896'
const PROPS = { name: 'CTLR_PAINT', description: 'DV-09 workshop controller', area: null, hardwareAlarms: false, networkRedundant: true, timeSyncIntegrity: false, redundant: false }

function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installDv09Project(), true)
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}
const verdicts = () => Object.fromEntries(checkDv09Ch1(M().hardware, M().eventLog).map(c => [c.id, c.verdict]))

test('DV-09 project: one decommissioned simplex controller whose four I/O cards appear only after auto-sense, and no plant areas', () => fixture(() => {
  const hw = M().hardware
  assert.deepEqual(Object.keys(hw.controllers), [START])
  const c = hw.controllers[START]
  assert.equal(c.commissioned, false)
  assert.equal(c.simplexOnly, true)
  assert.equal(c.coldRestartMinutes, 0)
  assert.deepEqual(c.installedCards.map(card => card.type), ['AI', 'AO', 'DI', 'DO'])
  assert.deepEqual(Object.keys(hw.traditionalCards ?? {}), [], 'the cards are not in the configuration until they are auto-sensed')
  assert.deepEqual(M().areas, ['AREA_A'], 'AREA_A is renamed in the Chapter 2 workshop')
  assert.deepEqual(Object.keys(M().modules), [])
  assert.deepEqual(Object.values(verdicts()).filter(v => v === 'verified'), [], 'nothing is done on a fresh project')
}))

test('DV-09 does not touch the 7016 project: installing the 7016 project afterwards restores DV_School', () => fixture(() => {
  assert.equal(L().installCourseProject(), true)
  assert.ok(M().areas.includes('ED_CENTER_BATCH'))
  assert.deepEqual(Object.keys(M().hardware.controllers), ['CTLR1'])
  assert.equal(L().installDv09Project(), true)
  assert.deepEqual(Object.keys(M().hardware.controllers), [START])
}))

test('Chapter 1 commissioning workshop: identify, commission with a name and network redundancy, auto-sense, cold restart 5 minutes', () => fixture(() => {
  assert.equal(verdicts()['dv09-1c-1'], 'pending')
  assert.equal(M().identifyController(START, true), true)
  assert.equal(M().hardware.controllers[START].identified, true)
  assert.equal(verdicts()['dv09-1c-1'], 'pending', 'Stop Flashing is part of the identify step')
  assert.equal(M().identifyController(START, false), true)
  assert.equal(verdicts()['dv09-1c-1'], 'verified')

  assert.match(M().commissionControllerWithProperties(START, { ...PROPS, name: '1BAD NAME!' }), /Name must/)
  assert.equal(M().commissionControllerWithProperties(START, { ...PROPS, redundant: true }), 'A simplex controller cannot be configured as redundant')
  assert.equal(M().commissionControllerWithProperties(START, PROPS), null)
  const c = M().hardware.controllers[PROPS.name]
  assert.equal(c.commissioned, true)
  assert.equal(c.networkRedundant, true)
  assert.match(c.controlNetworkAddress, /^192\.0\.2\./)
  assert.equal(M().hardware.controllers[START], undefined, 'the controller keeps only its new name')
  let v = verdicts()
  assert.deepEqual([v['dv09-1c-2'], v['dv09-1c-3'], v['dv09-1c-4'], v['dv09-1c-5']], ['verified', 'verified', 'pending', 'pending'])

  assert.equal(M().autoSenseController(PROPS.name), true)
  const sense = M().hardware.controllers[PROPS.name].lastAutoSense
  assert.equal(sense.channelsDetected, 32, 'four 8-channel cards')
  assert.deepEqual(Object.keys(M().hardware.traditionalCards).sort(), ['CTLR_PAINT/C01', 'CTLR_PAINT/C02', 'CTLR_PAINT/C03', 'CTLR_PAINT/C04'], 'the cards are added under the new name')
  assert.equal(M().autoSenseController(PROPS.name), true, 'a second scan does not duplicate the cards')
  assert.equal(Object.keys(M().hardware.traditionalCards).length, 4)
  assert.equal(verdicts()['dv09-1c-4'], 'verified')

  assert.equal(M().setControllerConfiguration(PROPS.name, { coldRestartMinutes: 5 }), true)
  assert.equal(verdicts()['dv09-1c-5'], 'verified')
  assert.equal(M().setControllerConfiguration(PROPS.name, { coldRestartMinutes: 4 }), true)
  assert.equal(verdicts()['dv09-1c-5'], 'pending', 'only 5 minutes satisfies the workshop')
}))

test('Chapter 1: auto-sense before commissioning is refused, commissioning without auto-sense leaves that step pending, and a duplicate name is refused', () => fixture(() => {
  assert.equal(M().autoSenseController(START), false, 'a decommissioned controller cannot be scanned')
  M().createController('CTLR_OTHER', '', {})
  assert.match(M().commissionControllerWithProperties(START, { ...PROPS, name: 'CTLR_OTHER' }), /already exists/)
  assert.equal(M().commissionControllerWithProperties(START, { ...PROPS, name: PROPS.name }), null)
  assert.equal(verdicts()['dv09-1c-4'], 'pending')
  assert.equal(M().commissionControllerWithProperties(START, PROPS), 'Controller CTLR-02F896 does not exist', 'it was renamed at commissioning')
}))

test('Chapter 1 logon workshop: administrator / deltav through FlexLock', () => fixture(() => {
  const sec = useSecurity.getState()
  assert.equal(verdicts()['dv09-1a-4'], 'pending')
  assert.equal(sec.loginStatus('administrator', 'DELTAV'), 'bad', 'passwords are case sensitive')
  assert.equal(sec.loginStatus('administrator', 'deltav'), 'ok')
  sec.lockWorkstation()
  assert.equal(useSecurity.getState().locked, true)
  assert.equal(useSecurity.getState().login('administrator', 'deltav'), true)
  assert.equal(useSecurity.getState().locked, false)
  assert.equal(useSecurity.getState().currentUser, 'administrator')
  assert.equal(verdicts()['dv09-1a-4'], 'pending', 'the FlexLock screen records the logon event')
  M().logEvent('SECURITY', 'administrator', 'User logged on')
  assert.equal(verdicts()['dv09-1a-4'], 'verified')
  assert.deepEqual(useSecurity.getState().authenticate('administrator', 'deltav').ok, true)
}))

test('Chapter 1 workshop definitions: every live check belongs to a step, ids are unique and do not collide with 7016', () => {
  const steps = DV09_COURSE.flatMap(m => m.workshops).flatMap(w => w.steps)
  const ids = steps.map(s => s.id)
  assert.equal(new Set(ids).size, ids.length)
  const seven = new Set(COURSE.flatMap(m => m.workshops).flatMap(w => w.steps).map(s => s.id))
  assert.deepEqual(ids.filter(id => seven.has(id)), [])
  const checkIds = checkDv09Ch1(M().hardware, []).map(c => c.id)
  assert.deepEqual(checkIds.filter(id => !ids.includes(id)), [])
  assert.deepEqual(DV09_COURSE[0].workshops.map(w => w.id), ['dv09-ch1-reading', 'dv09-ch1-logon', 'dv09-ch1-commission'])
})
