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
const { checkDv09Ch2, DV09_DST_PLAN } = require('../src/renderer/src/engine/dv09Ch2Checks.ts')
const { computeDownloadPending } = require('../src/renderer/src/engine/downloadPending.ts')
const { downloadControllerTotal, verifyControllerConfig, controllerHardwarePending } = require('../src/renderer/src/engine/controllerConfig.ts')
const { DV09_COURSE } = require('../src/renderer/src/engine/dv09Course.ts')
const M = () => useStore.getState(), L = () => useLibrary.getState()
const START = 'CTLR-02F896', NAME = 'CTLR_PAINT'
const PROPS = { name: NAME, description: '', area: null, hardwareAlarms: false, networkRedundant: true, timeSyncIntegrity: false, redundant: false }

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
const verdicts = () => Object.fromEntries(checkDv09Ch2(M().areas, M().hardware, M().eventLog).map(c => [c.id, c.verdict]))
const commission = () => {
  assert.equal(M().commissionControllerWithProperties(START, PROPS), null)
  assert.equal(M().autoSenseController(NAME), true)
}
const configureAll = (only) => {
  for (const p of DV09_DST_PLAN) {
    if (only && !only.includes(p.slot)) continue
    p.dsts.forEach((dst, i) => assert.equal(M().configureTraditionalChannel(`${NAME}/C0${p.slot}`, i + 1, { dst, enabled: true, description: `${p.type} ${dst}` }), true))
  }
}
const pending = () => computeDownloadPending().controller(NAME)

test('Chapter 2 plant areas workshop: rename AREA_A, add PLANT_AREA_B', () => fixture(() => {
  assert.deepEqual(M().areas, ['AREA_A'])
  assert.equal(verdicts()['dv09-2a-1'], 'pending')
  assert.equal(M().renameArea('AREA_A', 'PLANT_AREA_A'), true)
  assert.equal(verdicts()['dv09-2a-1'], 'verified')
  assert.equal(verdicts()['dv09-2a-2'], 'pending')
  assert.equal(M().createArea('PLANT_AREA_B'), true)
  assert.equal(verdicts()['dv09-2a-2'], 'verified')
  assert.deepEqual(M().areas, ['PLANT_AREA_A', 'PLANT_AREA_B'])
  assert.equal(M().renameArea('PLANT_AREA_A', 'PLANT_AREA_B'), false, 'a duplicate area name is refused')
}))

test('Chapter 2 DST workshop: cards appear after auto-sense; eight DSTs on channels 1 and 2 satisfy the checks card by card', () => fixture(() => {
  assert.equal(M().configureTraditionalChannel(`${NAME}/C01`, 1, { dst: 'LT-1', enabled: true }), false, 'no card before commissioning and auto-sense')
  commission()
  configureAll([1])
  let v = verdicts()
  assert.deepEqual([v['dv09-2b-1'], v['dv09-2b-2'], v['dv09-2b-3'], v['dv09-2b-4']], ['verified', 'pending', 'pending', 'pending'])
  const ch = M().hardware.traditionalCards[`${NAME}/C01`].channels[0]
  assert.equal(ch.description, 'AI LT-1')
  assert.equal(M().configureTraditionalChannel(`${NAME}/C02`, 1, { dst: 'LT-1', enabled: true }), false, 'a DST name can be used only once')
  assert.equal(M().configureTraditionalChannel(`${NAME}/C02`, 1, { dst: 'LY-1', enabled: true }), true)
  assert.equal(M().configureTraditionalChannel(`${NAME}/C02`, 2, { dst: '', enabled: true }), false, 'an enabled channel needs a Device Tag')
  assert.equal(M().configureTraditionalChannel(`${NAME}/C02`, 2, { dst: 'FY-2', enabled: false }), true)
  assert.equal(verdicts()['dv09-2b-2'], 'pending', 'both channels must be enabled')
  configureAll([2, 3, 4])
  v = verdicts()
  assert.deepEqual([v['dv09-2b-1'], v['dv09-2b-2'], v['dv09-2b-3'], v['dv09-2b-4']], ['verified', 'verified', 'verified', 'verified'])
}))

test('Chapter 2 download workshop: blue triangle until the total download, and again after any change', () => fixture(() => {
  assert.equal(pending(), false, 'a decommissioned controller shows no download triangle')
  assert.equal(downloadControllerTotal(START).ok, false)
  commission()
  assert.equal(pending(), true, 'a commissioned controller that was never downloaded needs a download')
  configureAll()
  assert.equal(verdicts()['dv09-2d-1'], 'pending')
  const v0 = verifyControllerConfig(NAME)
  assert.deepEqual(v0, { problems: [], cards: 4, dsts: 8 })
  const r = downloadControllerTotal(NAME)
  assert.equal(r.ok, true)
  assert.deepEqual(r.items.filter(i => !i.needed).map(i => i.label), ['Performing Dependency Checks', 'Downloading control modules (0)'], 'stippled items are not needed')
  assert.equal(pending(), false, 'the blue triangle is removed after the download')
  assert.equal(controllerHardwarePending(M().hardware.controllers[NAME], M().hardware), false)
  let v = verdicts()
  assert.deepEqual([v['dv09-2d-1'], v['dv09-2d-2']], ['verified', 'verified'])
  assert.match(M().eventLog.find(e => /^Total controller download complete/.test(e.description)).description, /4 I\/O card\(s\), 8 DST\(s\)/)
  M().configureTraditionalChannel(`${NAME}/C03`, 1, { dst: 'LSO-1', enabled: true, description: 'changed' })
  assert.equal(pending(), true, 'a changed DST needs another download')
  M().setControllerConfiguration(NAME, { coldRestartMinutes: 5 })
  assert.equal(downloadControllerTotal(NAME).ok, true)
  assert.equal(pending(), false)
  M().setControllerConfiguration(NAME, { coldRestartMinutes: 6 })
  assert.equal(pending(), true, 'cold restart is part of the controller download')
}))

test('Chapter 2: a download before the DSTs were configured does not satisfy the workshop; the 7016 controller never shows the DV-09 triangle', () => fixture(() => {
  commission()
  assert.equal(downloadControllerTotal(NAME).ok, true)
  configureAll()
  let v = verdicts()
  assert.deepEqual([v['dv09-2d-1'], v['dv09-2d-2']], ['pending', 'pending'])
  assert.equal(downloadControllerTotal(NAME).ok, true)
  v = verdicts()
  assert.deepEqual([v['dv09-2d-1'], v['dv09-2d-2']], ['verified', 'verified'])
  assert.equal(L().installCourseProject(), true)
  assert.equal(computeDownloadPending().controller('CTLR1'), false)
}))

test('Chapter 2 checking the system: Diagnostics must be launched after the download', () => fixture(() => {
  commission(); configureAll()
  M().logEvent('DIAGNOSTIC', 'DeltaV Diagnostics', 'DeltaV Diagnostics launched')
  assert.equal(verdicts()['dv09-2e-1'], 'pending', 'launched before the download does not count')
  assert.equal(downloadControllerTotal(NAME).ok, true)
  assert.equal(verdicts()['dv09-2e-1'], 'pending')
  M().logEvent('DIAGNOSTIC', 'DeltaV Diagnostics', 'DeltaV Diagnostics launched')
  assert.equal(verdicts()['dv09-2e-1'], 'verified')
}))

test('Chapter 2 workshop definitions: every live check belongs to a step and ids are unique across DV-09', () => {
  const steps = DV09_COURSE.flatMap(m => m.workshops).flatMap(w => w.steps)
  const ids = steps.map(s => s.id)
  assert.equal(new Set(ids).size, ids.length)
  const checkIds = checkDv09Ch2([], { controllers: {}, carriers: {}, baseplates: {} }, []).map(c => c.id)
  assert.deepEqual(checkIds.filter(id => !ids.includes(id)), [])
  assert.deepEqual(DV09_COURSE[1].workshops.map(w => w.id), ['dv09-ch2-reading', 'dv09-ch2-areas', 'dv09-ch2-dsts', 'dv09-ch2-download', 'dv09-ch2-check'])
})
