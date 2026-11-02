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
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const { useExecutive } = require('../src/renderer/src/engine/executive.ts')
const { useCampaigns } = require('../src/renderer/src/engine/campaignManager.ts')
const { checkCourse7016Ch15 } = require('../src/renderer/src/engine/course7016Ch15Checks.ts')
const { CHG_BASE_NEW_FAILURES } = require('../src/renderer/src/engine/course7016Imports.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const graph = require('../src/renderer/src/engine/phaseGraph.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const ch8 = require('./helpers/course7016-ch8-spec.cjs')
const through10 = require('./helpers/course7016-ch11-setup.cjs')
const ch11 = require('./helpers/course7016-ch11-workshops.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState(), X = () => useExecutive.getState(), C = () => useCampaigns.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const ctx = () => ({ B, L, E, M, X, cfg, graph, value, useStore, prereq, ch8, CHG_BASE_NEW_FAILURES, tick })
const BIND = { BLENDERS: 'UM_BL_500', COLORTANKS: 'UM_COLOR_100' }
const state = id => C().stateOf('InteriorLatex', id)

function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem, useExecutive, useCampaigns]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installCourseProject(), true)
    useCampaigns.getState().reset()
    through10(ctx())
    const c = ctx()
    ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c); ch11.paintFormulas(c); ch11.classBased(c)
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}
function online() {
  value(X().startService()); value(X().verifyPhases())
  value(C().setProps({ enabled: true }))
  value(C().toggleService())
}
const create = (extra = {}) => value(C().createCampaign({ name: 'InteriorLatex', nBatches: 2, maxActive: 1, recipe: 'PRC_PAINT', formula: 'Sky Blue', bindings: BIND, ...extra }))
function until(fn, max = 200000) { for (let i = 0; i < max && !fn(); i++) tick(); assert.ok(fn(), 'condition reached') }

test('Chapter 15: the Campaign Manager must be enabled and the Batch Executive running before its service starts', () => fixture(() => {
  assert.match(C().toggleService().error, /not enabled/)
  value(C().setProps({ enabled: true }))
  assert.match(C().toggleService().error, /Batch Executive first/)
  value(X().startService())
  value(C().toggleService())
  assert.equal(C().service, 'RUNNING')
  assert.match(C().purge().error, /Stop the Campaign Manager/)
  value(C().toggleService())
  value(C().purge())
}))

test('Chapter 15: creating a campaign validates names, counts, recipe and unit bindings', () => fixture(() => {
  value(X().startService()); value(C().setProps({ enabled: true }))
  assert.match(C().createCampaign({ name: 'A', nBatches: 1, maxActive: 1, recipe: 'PRC_PAINT', formula: '', bindings: BIND }).error, /service is not running/)
  value(C().toggleService())
  const bad = extra => C().createCampaign({ name: 'InteriorLatex', nBatches: 2, maxActive: 1, recipe: 'PRC_PAINT', formula: 'Sky Blue', bindings: BIND, ...extra })
  assert.match(bad({ name: '1bad' }).error, /start with a letter/)
  assert.match(bad({ name: 'AVeryLongCampaignName' }).error, /16 characters/)
  assert.match(bad({ nBatches: 0 }).error, /number of batches/)
  assert.match(bad({ maxActive: 3 }).error, /active batches/)
  assert.match(bad({ recipe: 'NOPE' }).error, /not been downloaded/)
  assert.match(bad({ formula: 'Teal' }).error, /Formula Teal/)
  assert.match(bad({ bindings: {} }).error, /Bind/)
  assert.match(bad({ bindings: { BLENDERS: 'UM_COLOR_100', COLORTANKS: 'UM_COLOR_100' } }).error, /not a unit of class BLENDERS/)
  create()
  assert.match(bad({}).error, /already exists/)
  const c = C().campaigns.InteriorLatex
  assert.deepEqual(c.batches.map(b => b.id), ['InteriorLatex_01', 'InteriorLatex_02'])
  assert.equal(c.mode, 'Manual')
  assert.equal(state('InteriorLatex_01'), 'Defined')
}))

test('Chapter 15 workshop: edit batches, add a batch, Auto Start, then Manual and remove each batch as it completes', () => fixture(() => {
  online()
  create()
  value(C().editBatch('InteriorLatex', 'InteriorLatex_02', { formula: 'Baby Blue' }))
  assert.match(C().editBatch('InteriorLatex', 'InteriorLatex_02', { formula: 'Teal' }).error, /Formula Teal/)
  const third = value(C().newBatch('InteriorLatex'))
  assert.equal(third, 'InteriorLatex_03')
  value(C().editBatch('InteriorLatex', third, { formula: 'Navy Blue', scale: 2 }))
  assert.equal(C().campaigns.InteriorLatex.batches[2].scale, 2)
  tick(5)
  assert.deepEqual(['_01', '_02', '_03'].map(s => state(`InteriorLatex${s}`)), ['Defined', 'Defined', 'Defined'], 'Manual mode releases nothing')
  value(C().setMode('InteriorLatex', 'Auto Start'))
  tick(3)
  assert.deepEqual(['_01', '_02', '_03'].map(s => state(`InteriorLatex${s}`)), ['Active - Running', 'Active - Ready', 'Defined'])
  assert.ok(X().batches.some(b => b.id === 'InteriorLatex_01') && X().batches.some(b => b.id === 'InteriorLatex_02'), 'released batches appear in the Batch List of the executive')
  assert.match(C().deleteBatch('InteriorLatex', 'InteriorLatex_01').error, /released/)
  assert.match(C().editBatch('InteriorLatex', 'InteriorLatex_01', { formula: 'Navy Blue' }).error, /before they are released/)
  value(C().setMode('InteriorLatex', 'Manual'))
  until(() => state('InteriorLatex_01') === 'Active - Complete')
  assert.equal(state('InteriorLatex_02'), 'Active - Ready', 'Manual mode does not start the next batch')
  value(C().removeFromExecutive('InteriorLatex', 'InteriorLatex_01'))
  assert.equal(state('InteriorLatex_01'), 'Complete')
  assert.ok(!X().batches.some(b => b.id === 'InteriorLatex_01'), 'removed from the Batch List')
  assert.match(C().removeCampaign('InteriorLatex').error, /after all its batches complete|active/)
  for (const id of ['InteriorLatex_02', 'InteriorLatex_03']) {
    if (state(id) === 'Defined') value(C().release('InteriorLatex', id))
    value(C().startBatch('InteriorLatex', id))
    until(() => state(id) === 'Active - Complete')
    value(C().removeFromExecutive('InteriorLatex', id))
  }
  value(C().addComment('InteriorLatex', 'All three batches done'))
  value(C().removeCampaign('InteriorLatex'))
  assert.equal(C().campaigns.InteriorLatex, undefined)
  const checks = checkCourse7016Ch15(C(), X())
  const pending = checks.filter(c => c.verdict !== 'verified').map(c => c.id)
  assert.deepEqual(pending.filter(id => !/15o-2|15o-3|15o-4|15o-5|15a-2/.test(id)), [])
}))

test('Chapter 15: Auto Release releases without starting; terminating stops further releases', () => fixture(() => {
  online()
  create({ nBatches: 3 })
  value(C().setMode('InteriorLatex', 'Auto Release'))
  tick(3)
  assert.deepEqual(['_01', '_02', '_03'].map(s => state(`InteriorLatex${s}`)), ['Active - Ready', 'Active - Ready', 'Defined'], 'maximum active 1 plus one ready')
  value(C().terminateCampaign('InteriorLatex'))
  assert.equal(checkCourse7016Ch15(C(), X()).find(c => c.id === '7016-15o-5').verdict, 'verified')
  assert.match(C().release('InteriorLatex', 'InteriorLatex_03').error, /terminated/)
  assert.match(C().setMode('InteriorLatex', 'Auto Start').error, /terminated/)
  assert.match(C().newBatch('InteriorLatex').error, /terminated/)
  assert.match(C().removeCampaign('InteriorLatex').error, /active/)
  value(C().removeFromExecutive('InteriorLatex', 'InteriorLatex_01')); value(C().removeFromExecutive('InteriorLatex', 'InteriorLatex_02'))
  value(C().removeCampaign('InteriorLatex'))
}))

test('Chapter 15: setup and cleanup batches, auto remove, client configuration and the enabled actions', () => fixture(() => {
  online()
  value(C().setProps({ autoRemove: { manual: { enabled: false, delayMin: 5 }, autoRelease: { enabled: false, delayMin: 5 }, autoStart: { enabled: true, delayMin: 0 } } }))
  create({ nBatches: 1, setup: { recipe: 'PRC_PAINT', formula: 'Baby Blue', bindings: BIND, scale: 1 }, cleanup: { recipe: 'PRC_PAINT', formula: 'Navy Blue', bindings: BIND, scale: 1 } })
  assert.deepEqual(C().campaigns.InteriorLatex.batches.map(b => b.kind), ['Setup', 'Batch', 'Cleanup'])
  value(C().setMode('InteriorLatex', 'Auto Start'))
  tick(3)
  assert.equal(state('InteriorLatex_01'), 'Active - Running', 'the setup batch starts first')
  assert.equal(state('InteriorLatex_02'), 'Defined', 'the base batch waits for the setup batch')
  until(() => C().campaigns.InteriorLatex.batches.every(b => b.released), 400000)
  until(() => C().campaigns.InteriorLatex.batches.every(b => b.removed), 800000)
  assert.deepEqual(C().campaigns.InteriorLatex.batches.map(b => state(b.id)), ['Complete', 'Complete', 'Complete'])
  const verdict = id => checkCourse7016Ch15(C(), X()).find(c => c.id === id).verdict
  assert.equal(verdict('7016-15o-4'), 'verified', 'setup first, cleanup last')
  assert.equal(verdict('7016-15o-5'), 'pending')
  assert.equal(C().setClientConfig({ sequenceLength: 9 }).ok, false)
  value(C().setClientConfig({ sequenceLength: 3, hideCompleted: true }))
  create2()
  function create2() {
    value(C().createCampaign({ name: 'Second', nBatches: 1, maxActive: 1, recipe: 'PRC_PAINT', formula: 'Sky Blue', bindings: BIND }))
    assert.equal(C().campaigns.Second.batches[0].id, 'Second_001', 'the sequence length sets the digits of the Batch ID')
  }
  value(C().setClientConfig({ enabledActions: { ...C().client.enabledActions, 'Terminate Campaign': false } }))
  assert.equal(C().actionEnabled('Terminate Campaign'), false)
  assert.equal(C().actionEnabled('New Batch'), true)
}))
