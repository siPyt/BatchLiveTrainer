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
const { useHistorian, outputPathError } = require('../src/renderer/src/engine/batchHistorian.ts')
const { checkCourse7016Ch14 } = require('../src/renderer/src/engine/course7016Ch14Checks.ts')
const { CHG_BASE_NEW_FAILURES } = require('../src/renderer/src/engine/course7016Imports.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const graph = require('../src/renderer/src/engine/phaseGraph.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const ch8 = require('./helpers/course7016-ch8-spec.cjs')
const through10 = require('./helpers/course7016-ch11-setup.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState(), X = () => useExecutive.getState(), H = () => useHistorian.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const batch = id => X().batches.find(b => b.id === id)
const ctx = () => ({ B, L, E, M, X, cfg, graph, value, useStore, prereq, ch8, CHG_BASE_NEW_FAILURES, tick })

function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem, useExecutive, useHistorian]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installCourseProject(), true)
    useHistorian.getState().reset()
    through10(ctx())
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}
const DB = 'C:\\DVBatchHistory\\Batch_Historian_Databases'
function configure() {
  value(H().setEnabled(true))
  value(H().addInput('Alarms And Events')); value(H().addInput('Batch Executive'))
  value(H().addOutput(`${DB}\\db1`, 10)); value(H().addOutput(`${DB}\\db2`, 10))
  assert.equal(H().connect().ok, false, 'the workstation must be downloaded first')
  value(X().downloadEquipment())
  assert.equal(H().downloaded, true)
  value(H().connect())
  value(H().toggleService())
  assert.equal(H().service, 'RUNNING')
  value(X().startService()); value(X().verifyPhases())
}
function runBatch(id, formula) {
  value(X().addBatch('OP_FINISH_500', id, formula)); value(X().batchCommand(id, 'START'))
  for (let i = 0; i < 120000 && !['COMPLETE', 'ABORTED', 'STOPPED'].includes(batch(id).state); i++) tick()
  assert.equal(batch(id).state, 'COMPLETE', batch(id).failure ?? '')
  tick(3)
}

test('Chapter 14: the Batch Historian needs enabling, inputs, outputs, a workstation download and a connection before the service starts', () => fixture(() => {
  assert.equal(H().connect().ok, false)
  value(H().setEnabled(true))
  assert.match(H().connect().error, /Download/)
  value(X().downloadEquipment())
  assert.match(H().connect().error, /no inputs/)
  assert.equal(H().addInput('Bogus').ok, false)
  value(H().addInput('Batch Executive'))
  assert.equal(H().addInput('Batch Executive').ok, false)
  value(X().downloadEquipment())
  assert.match(H().connect().error, /no output/)
  assert.match(H().addOutput('\\\\server\\share', 10).error, /network/)
  assert.match(H().addOutput('C:\\DeltaV\\data', 10).error, /DeltaV or DVData/)
  assert.match(H().addOutput('nonsense', 10).error, /local path/)
  assert.match(H().addOutput(`${DB}\\db1`, 0).error, /1 Mb/)
  value(H().addOutput(`${DB}\\db1`, 10))
  assert.equal(H().addOutput(`${DB}\\DB1\\`, 10).ok, false, 'duplicate path')
  assert.equal(H().downloaded, false, 'configuration changes need a new download')
  value(X().downloadEquipment())
  assert.equal(H().toggleService().ok, false, 'connect first')
  value(H().connect()); value(H().toggleService())
  assert.equal(H().service, 'RUNNING')
  assert.equal(outputPathError(`${DB}\\db1`), null)
}))

test('Chapter 14: batches, events, the unit phase tree and the process trend are collected while the service runs', () => fixture(() => {
  configure()
  runBatch('H1', 'Small'); runBatch('H2', 'Medium')
  const b1 = H().batches.H1, b2 = H().batches.H2
  assert.ok(b1 && b2)
  assert.equal(b1.state, 'Complete'); assert.equal(b1.active, false)
  const phases = b1.tree.children.filter(c => c.level === 'Unit Phase').map(c => c.name)
  assert.deepEqual(phases, ['AGITATE', 'DRAIN'])
  assert.ok(b1.tree.children.every(c => c.end !== null && c.start !== null))
  assert.ok(b1.events.some(e => /AGITATE acquired/.test(e.text)))
  assert.ok(H().chronicle.length > 0, 'process events from the Event Chronicle')
  assert.ok(H().processEvents('H1').length > 0)
  const trend = H().trend('H1', 'XV-503')
  assert.ok(trend.length > 5, 'trend of the product valve')
  const levels = H().trend('H1', 'LI-504')
  assert.ok(levels.length > 5)
  assert.ok(trend.some(p => p.v === 1) || H().trend('H1', 'XV-504').some(p => p.v === 1), 'a product or waste valve opened during DRAIN')
  const rows = value(H().compare('H1', 'H2'))
  const ag = rows.find(r => /AGITATE$/.test(r.path))
  assert.ok(ag.delta > 10 && ag.delta < 20, `AGITATE is about 15 s longer in the Medium batch (${ag.delta})`)
  assert.equal(H().compare('H1', 'NOPE').ok, false)
}))

test('Chapter 14: comments are added to the events of a unit phase; nothing is collected while the service is stopped', () => fixture(() => {
  configure()
  runBatch('H1', 'Small')
  const idx = H().batches.H1.events.findIndex(e => /AGITATE/.test(e.key))
  assert.ok(idx >= 0)
  value(H().addComment('H1', 'Checked the blend time', idx))
  assert.ok(H().batches.H1.events.some(e => e.kind === 'Comment' && /AGITATE/.test(e.key) && /blend time/.test(e.text)))
  assert.equal(H().addComment('H1', '  ').ok, false)
  assert.equal(H().addComment('ZZ', 'x').ok, false)
  value(H().toggleService())
  const n = Object.keys(H().batches).length
  runBatch('H3', 'Small')
  assert.equal(Object.keys(H().batches).length, n, 'the stopped service stores nothing')
}))

test('Chapter 14 workshop: archive databases, archiving completed batches, folders and maintenance', () => fixture(() => {
  configure()
  runBatch('H1', 'Small')
  assert.equal(H().createArchive('OldBatches', 'C:\\Batch_Archive_Databases').ok, true)
  assert.equal(H().createArchive('OldBatches', 'C:\\x').ok, false)
  assert.equal(H().createArchive('1bad', 'C:\\x').ok, false)
  assert.match(H().archiveBatch('H1', 'OldBatches').error, /active|Batch List/, 'still in the Batch List of the executive')
  value(X().removeBatch('H1'))
  value(H().archiveBatch('H1', 'OldBatches'))
  assert.deepEqual(H().archives.OldBatches.batches.H1.archivedIn, ['OldBatches'])
  assert.equal(H().archiveBatch('H1', 'OldBatches').ok, false)
  assert.equal(H().archiveBatch('H1', 'NOPE').ok, false)
  const t = M().time
  const a = value(H().archiveEvents('OldBatches', 0, t))
  assert.match(a, /events/)
  assert.equal(H().archiveEvents('OldBatches', t, 0).ok, false)
  value(H().newFolder('2026')); assert.equal(H().newFolder('2026').ok, false)
  assert.equal(H().setMaintenance({ autoDelete: true }).ok, false, 'AutoDelete needs AutoArchive')
  value(H().setMaintenance({ autoArchive: true, autoDelete: true, archiveAfterDays: 0, deleteAfterDays: 0 }))
  value(H().runMaintenance())
  assert.equal(H().batches.H1, undefined, 'archived batches older than the limit are deleted from DVHisDB')
  assert.ok(H().archives.OldBatches.batches.H1, 'the archive keeps the batch')
}))

test('Chapter 14: the workshop checks follow the workshops', () => fixture(() => {
  configure()
  runBatch('H1', 'Small'); runBatch('H2', 'Medium')
  const pending = () => checkCourse7016Ch14(H()).filter(c => c.verdict !== 'verified').map(c => c.id)
  assert.ok(pending().includes('7016-14b-1'))
  H().noteView('details H1'); H().noteView('events H1 UM_BL_500/AGITATE')
  value(H().addComment('H1', 'comment', H().batches.H1.events.findIndex(e => /AGITATE/.test(e.key))))
  H().noteView('compare H1 H2'); H().noteView('trend-compare H1 H2 DRAIN XV-503')
  value(H().createArchive('OldBatches', 'C:\\Batch_Archive_Databases'))
  value(X().removeBatch('H1')); value(H().archiveBatch('H1', 'OldBatches')); H().noteView('archive-expanded OldBatches')
  value(H().newFolder('F')); value(H().setMaintenance({ autoArchive: true }))
  assert.deepEqual(pending(), [])
}))
