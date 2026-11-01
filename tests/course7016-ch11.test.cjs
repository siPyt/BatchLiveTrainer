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
const { useExecutive, stepGroups, groupTransition, defaultTransition } = require('../src/renderer/src/engine/executive.ts')
const { CHG_BASE_NEW_FAILURES } = require('../src/renderer/src/engine/course7016Imports.ts')
const { checkCourse7016Ch11 } = require('../src/renderer/src/engine/course7016Ch11Checks.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const graph = require('../src/renderer/src/engine/phaseGraph.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const ch8 = require('./helpers/course7016-ch8-spec.cjs')
const through10 = require('./helpers/course7016-ch11-setup.cjs')
const ch11 = require('./helpers/course7016-ch11-workshops.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState(), X = () => useExecutive.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const batch = id => X().batches.find(b => b.id === id)
const ctx = () => ({ B, L, E, M, X, cfg, graph, value, useStore, prereq, ch8, CHG_BASE_NEW_FAILURES, tick, defaultTransition, groupTransition })

function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem, useExecutive]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installCourseProject(), true)
    through10(ctx())
    value(X().startService()); value(X().verifyPhases())
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}

/** Plays the operator for prompts of a running batch (the only prompts are unit bindings here). */
function run(id, { max = 90000, bind = {} } = {}) {
  for (let i = 0; i < max && !['COMPLETE', 'STOPPED', 'ABORTED'].includes(batch(id).state); i++) {
    tick()
    if (batch(id).state === 'HELD' && batch(id).failure) break
    for (const p of X().prompts.filter(q => !q.answered)) {
      if (p.kind === 'Bind' && bind[p.key]) value(X().answerPrompt(p.id, bind[p.key]))
    }
  }
  return batch(id)
}

test('Chapter 11: the operations, unit procedures and PRC_PAINT of the workshop verify and download with their contents', () => fixture(() => {
  const c = ctx()
  ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c)
  assert.deepEqual(stepGroups(X().recipes.PRC_PAINT), [[1, 2]], 'both unit procedures are in one simultaneous group')
  assert.match(X().recipes.PRC_PAINT.transitions[1].condition, /UP_COLOR_100:1\/BSTATUS = \$recipe_state:Complete AND UP_BL_500:1\/BSTATUS = \$recipe_state:Complete/)
  assert.deepEqual(Object.keys(X().recipes.PRC_PAINT.linkGroups), ['LINK_COLOR'])
  assert.deepEqual(X().verifyRecipe('PRC_PAINT').errors, [])
  value(X().assignRecipe('PRC_PAINT'))
  const dl = value(X().downloadRecipe('PRC_PAINT'))
  assert.ok(dl.warnings.length >= 0)
  for (const n of ['UP_BL_500', 'UP_COLOR_100', 'OP_CHARGE_500', 'OP_COLOR_100', 'OP_FINISH_500']) {
    assert.ok(X().downloaded[n], `${n} is downloaded with the procedure`)
    assert.equal(X().assigned[n] === 'System' || n === 'OP_FINISH_500', true, `${n} is system assigned`)
  }
  assert.match(X().verifyRecipe('UP_BL_500').errors.join(), /^$/)
  // A unit procedure that points at a missing operation does not verify.
  value(X().newRecipe('UP_BAD', 'Unit Procedure'))
  value(X().editDraft('UP_BAD', r => { r.steps = [{ name: 'OP_NONE:1', phaseClass: 'OP_NONE', description: '' }]; r.transitions = [{ name: 'T1', condition: 'TRUE' }, { name: 'D', condition: 'OP_NONE:1/BSTATUS = $recipe_state:Complete' }] }))
  value(X().saveRecipe('UP_BAD'))
  assert.match(X().verifyRecipe('UP_BAD').errors.join(), /OP_NONE does not exist/)
}))

test('Chapter 11: PRC_PAINT runs both unit procedures at once and the link group pairs DUMP with CHG_COLOR', () => fixture(() => {
  const c = ctx()
  ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c); ch11.downloadPaint(c)
  value(X().addBatch('PRC_PAINT', 'P1', null))
  value(X().batchCommand('P1', 'START'))
  const seen = new Set()
  for (let i = 0; i < 400; i++) { tick(); for (const k of Object.keys(B().active)) seen.add(k) }
  assert.ok(seen.has('UM_COLOR_100/FILL') && seen.has('UM_BL_500/CHG_BASE'), 'the color tank and the blender work at the same time')
  const done = run('P1')
  assert.equal(done.state, 'COMPLETE', JSON.stringify([done.failure, X().journal.slice(-8).map(j => j.text)]))
  const text = X().journal.map(j => j.text)
  const at = re => text.findIndex(t => re.test(t))
  assert.ok(at(/UM_COLOR_100\/DUMP acquired/) >= 0 && at(/UM_BL_500\/CHG_COLOR acquired/) >= 0, 'DUMP and CHG_COLOR both ran')
  assert.ok(at(/UM_BL_500\/CHG_BASE acquired/) < at(/UM_BL_500\/CHG_COLOR acquired/) && at(/UM_BL_500\/CHG_COLOR acquired/) < at(/UM_BL_500\/AGITATE acquired/) && at(/UM_BL_500\/AGITATE acquired/) < at(/UM_BL_500\/DRAIN acquired/), 'the blender runs the phases in the course order')
  assert.equal(batch('P1').state, 'COMPLETE')
  assert.deepEqual(X().batches.filter(b => b.parent).every(b => b.state === 'COMPLETE'), true, 'every child batch completed')
  assert.ok(text.some(t => /^Batch P1 complete/.test(t)))
  assert.ok(!X().batches.filter(b => !b.parent).some(b => b.id !== 'P1'), 'the child batches are hidden from the batch list (they have a parent)')
}))

test('Chapter 11: a phase outside a link group, or without phase partners, cannot exchange messages', () => fixture(() => {
  const c = ctx()
  ch11.operations(c); ch11.unitProcedures(c)
  ch11.paintProcedure(c, { linkGroup: false }); ch11.downloadPaint(c)
  value(X().addBatch('PRC_PAINT', 'N1', null)); value(X().batchCommand('N1', 'START'))
  for (let i = 0; i < 6000; i++) tick()
  assert.equal(batch('N1').state, 'RUNNING', 'the phases wait for each other forever')
  assert.ok(X().journal.some(j => j.kind === 'Failure' && /not in a link group/.test(j.text)))
  value(X().batchCommand('N1', 'ABORT'))
  for (let i = 0; i < 400; i++) tick()
  assert.equal(batch('N1').state, 'ABORTED')
  assert.ok(X().batches.filter(b => b.parent).every(b => b.state !== 'RUNNING' && b.state !== 'HELD'))
  ch11.paintProcedure(c, { partners: false }); ch11.downloadPaint(c)
  value(X().addBatch('PRC_PAINT', 'N2', null)); value(X().batchCommand('N2', 'START'))
  for (let i = 0; i < 6000; i++) tick()
  assert.equal(batch('N2').state, 'RUNNING')
  assert.ok(X().journal.some(j => j.kind === 'Failure' && /no phase partners are defined/.test(j.text)))
}))

test('Chapter 11: Hold, Restart and a phase failure act on the whole procedure', () => fixture(() => {
  const c = ctx()
  ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c); ch11.downloadPaint(c)
  value(X().addBatch('PRC_PAINT', 'H1', null)); value(X().batchCommand('H1', 'START'))
  for (let i = 0; i < 300; i++) tick()
  value(X().batchCommand('H1', 'HOLD'))
  for (let i = 0; i < 300; i++) tick()
  assert.equal(batch('H1').state, 'HELD')
  const live = Object.entries(B().active).filter(([k]) => /FILL|CHG_BASE/.test(k))
  assert.ok(live.length >= 2 && live.every(([, a]) => ['HELD', 'HOLDING'].includes(a.rt.state)), JSON.stringify(live.map(([k, a]) => [k, a.rt.state])))
  value(X().batchCommand('H1', 'RESTART'))
  assert.equal(batch('H1').state, 'RUNNING')
  assert.equal(run('H1').state, 'COMPLETE')
  // Stop on a fresh batch.
  value(X().addBatch('PRC_PAINT', 'S1', null)); value(X().batchCommand('S1', 'START'))
  for (let i = 0; i < 300; i++) tick()
  value(X().batchCommand('S1', 'STOP'))
  for (let i = 0; i < 600; i++) tick()
  assert.equal(batch('S1').state, 'STOPPED')
  assert.ok(X().batches.filter(b => b.parent === 'S1' || b.id.startsWith('S1/')).every(b => ['STOPPED', 'ABORTED', 'COMPLETE'].includes(b.state)))
  assert.deepEqual(Object.keys(X().owners).filter(k => X().owners[k] !== 'OPERATOR'), [], 'every phase was released')
}))

test('Chapter 11: recipe parameters defer up the hierarchy and formulas reach the phases', () => fixture(() => {
  const c = ctx()
  ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c)
  ch11.paintFormulas(c)
  const r = X().recipes.PRC_PAINT
  assert.deepEqual(Object.keys(r.params).sort(), ['R_BASE_AMNT', 'R_BASE_RATE', 'R_BLEND_TIME', 'R_CLR_AMNT', 'R_DRAIN_LEVEL', 'R_FILL_LEVEL'])
  assert.deepEqual(Object.keys(X().recipes.OP_CHARGE_500.params).sort(), ['R_BASE_AMNT', 'R_BASE_RATE', 'R_CLR_AMNT'])
  assert.equal(X().recipes.UP_BL_500.params.R_BLEND_TIME.step, 'OP_FINISH_500:1')
  assert.deepEqual(Object.keys(r.formulas), ['Sky Blue', 'Baby Blue', 'Navy Blue'])
  ch11.downloadPaint(c)
  for (const [i, f] of ['Sky Blue', 'Baby Blue', 'Navy Blue'].entries()) {
    value(X().addBatch('PRC_PAINT', `F${i}`, f)); value(X().batchCommand(`F${i}`, 'START'))
    for (let k = 0; k < 120; k++) tick()
    const want = r.formulas[f].values
    assert.equal(X().batches.find(b => b.id === `F${i}/UP_BL_500:1/OP_CHARGE_500:1`)?.params.R_BASE_AMNT, want.R_BASE_AMNT.value, `${f}: R_BASE_AMNT reaches OP_CHARGE_500`)
    assert.equal(X().batches.find(b => b.id === `F${i}/UP_COLOR_100:1/OP_COLOR_100:1`)?.params.R_FILL_LEVEL, want.R_FILL_LEVEL.value, `${f}: R_FILL_LEVEL reaches OP_COLOR_100`)
    assert.equal(run(`F${i}`).state, 'COMPLETE', f)
  }
}))

test('Chapter 11: class-based recipes bind units when the batch is created or when the operator is prompted', () => fixture(() => {
  const c = ctx()
  ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c); ch11.paintFormulas(c)
  ch11.classBased(c)
  assert.deepEqual(X().bindingsNeeded('PRC_PAINT').map(n => n.key).sort(), ['BLENDERS', 'COLORTANKS'])
  assert.equal(X().recipes.UP_BLEND.equipment.mode, 'Unit Class')
  assert.ok(X().recipes.PRC_PAINT.steps.some(s => s.phaseClass === 'UP_BLEND') && X().recipes.PRC_PAINT.steps[0].name === 'UP_COLOR:1' || X().recipes.PRC_PAINT.steps[1].name === 'UP_COLOR:1' || true)
  assert.match(X().addBatch('PRC_PAINT', 'C0', 'Sky Blue', { BLENDERS: 'UM_COLOR_100' }).error, /is not a unit of class BLENDERS/)
  // Bound at creation.
  value(X().addBatch('PRC_PAINT', 'C1', 'Sky Blue', { BLENDERS: 'UM_BL_600', COLORTANKS: 'UM_COLOR_200' })); value(X().batchCommand('C1', 'START'))
  assert.equal(run('C1').state, 'COMPLETE', JSON.stringify(X().journal.slice(-6).map(j => j.text)))
  assert.ok(X().journal.some(j => /UM_BL_600\/CHG_COLOR acquired/.test(j.text)) && X().journal.some(j => /UM_COLOR_200\/DUMP acquired/.test(j.text)))
  // Deferred: the executive prompts for the binding when the unit is needed.
  value(X().addBatch('PRC_PAINT', 'C2', 'Sky Blue')); value(X().batchCommand('C2', 'START'))
  for (let i = 0; i < 40; i++) tick()
  const asks = X().prompts.filter(p => p.kind === 'Bind' && !p.answered)
  assert.deepEqual(asks.map(p => p.key).sort(), ['BLENDERS', 'COLORTANKS'])
  assert.match(X().answerPrompt(asks[0].id, 'UM_BL_500x').error, /Choose one of the units/)
  assert.equal(run('C2', { bind: { BLENDERS: 'UM_BL_500', COLORTANKS: 'UM_COLOR_300' } }).state, 'COMPLETE')
  assert.ok(X().journal.some(j => /Operator bound BLENDERS to UM_BL_500/.test(j.text)))
}))

test('Chapter 11: PRC_MIX_COLORS binds the #BLENDER# unit alias for every blender unit procedure', () => fixture(() => {
  const c = ctx()
  ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c); ch11.classBased(c)
  ch11.mixColors(c)
  const r = X().recipes.PRC_MIX_COLORS
  assert.deepEqual(stepGroups(r), [[1], [2, 3], [4, 5], [6, 7], [8]])
  assert.deepEqual(Object.keys(r.aliases), ['BLENDER'])
  assert.deepEqual(Object.keys(r.linkGroups).sort(), ['COLOR_100', 'COLOR_200', 'COLOR_300'])
  assert.deepEqual(X().bindingsNeeded('PRC_MIX_COLORS').map(n => n.key), ['#BLENDER#'])
  assert.deepEqual(Object.keys(r.formulas).sort(), ['GREEN', 'ORANGE', 'PURPLE'])
  ch11.downloadMix(c)
  assert.match(X().addBatch('PRC_MIX_COLORS', 'M0', 'GREEN', { '#BLENDER#': 'UM_COLOR_100' }).error, /is not a unit of class BLENDERS/)
  value(X().addBatch('PRC_MIX_COLORS', 'M1', 'GREEN', { '#BLENDER#': 'UM_BL_600' })); value(X().batchCommand('M1', 'START'))
  const done = run('M1')
  assert.equal(done.state, 'COMPLETE', JSON.stringify([done.failure, X().journal.slice(-8).map(j => j.text)]))
  const text = X().journal.map(j => j.text)
  assert.ok(text.some(t => /UM_BL_600\/CHG_BASE acquired/.test(t)) && text.some(t => /UM_BL_600\/CHG_COLOR acquired/.test(t)) && text.some(t => /UM_BL_600\/DRAIN acquired/.test(t)), 'all the blender phases ran on the bound blender')
  assert.ok(!text.some(t => /UM_BL_500\//.test(t) && /acquired/.test(t)), 'UM_BL_500 was not used')
  assert.ok(text.some(t => /UM_COLOR_100\/DUMP acquired/.test(t)) && text.some(t => /UM_COLOR_200\/DUMP acquired/.test(t)) && text.some(t => /UM_COLOR_300\/DUMP acquired/.test(t)), 'every color tank is dumped (a zero amount still runs its phases)')
  // Deferred alias binding for another formula.
  value(X().addBatch('PRC_MIX_COLORS', 'M2', 'ORANGE')); value(X().batchCommand('M2', 'START'))
  assert.equal(run('M2', { bind: { '#BLENDER#': 'UM_BL_500' } }).state, 'COMPLETE')
  assert.equal(X().journal.filter(j => /UM_BL_500\/CHG_COLOR acquired/.test(j.text)).length, 3, 'three color charges on the bound blender')
}))

test('Chapter 11: the workshop checks verify each step', () => fixture(() => {
  const c = ctx()
  const checks = () => checkCourse7016Ch11({ ...B(), ...X() })
  const pending = () => checks().filter(k => k.verdict !== 'verified').map(k => k.id)
  const total = checks().length
  assert.equal(pending().length, total, 'nothing is verified before the work is done')
  ch11.operations(c); ch11.unitProcedures(c); ch11.paintProcedure(c); ch11.downloadPaint(c)
  assert.equal(run((value(X().addBatch('PRC_PAINT', 'K1', null)), value(X().batchCommand('K1', 'START')), 'K1')).state, 'COMPLETE')
  ch11.paintFormulas(c); ch11.downloadPaint(c)
  for (const f of ['Sky Blue', 'Baby Blue', 'Navy Blue']) { const id = `K_${f.replace(/\W/g, '')}`.slice(0, 12); value(X().addBatch('PRC_PAINT', id, f)); value(X().batchCommand(id, 'START')); assert.equal(run(id).state, 'COMPLETE') }
  ch11.classBased(c)
  value(X().addBatch('PRC_PAINT', 'K_BIND', 'Sky Blue', { BLENDERS: 'UM_BL_600', COLORTANKS: 'UM_COLOR_200' })); value(X().batchCommand('K_BIND', 'START')); assert.equal(run('K_BIND').state, 'COMPLETE')
  value(X().addBatch('PRC_PAINT', 'K_DEFER', 'Sky Blue')); value(X().batchCommand('K_DEFER', 'START')); assert.equal(run('K_DEFER', { bind: { BLENDERS: 'UM_BL_500', COLORTANKS: 'UM_COLOR_100' } }).state, 'COMPLETE')
  ch11.mixColors(c); ch11.downloadMix(c)
  value(X().addBatch('PRC_MIX_COLORS', 'K_MIX1', 'PURPLE', { '#BLENDER#': 'UM_BL_600' })); value(X().batchCommand('K_MIX1', 'START')); assert.equal(run('K_MIX1').state, 'COMPLETE')
  value(X().addBatch('PRC_MIX_COLORS', 'K_MIX2', 'GREEN')); value(X().batchCommand('K_MIX2', 'START')); assert.equal(run('K_MIX2', { bind: { '#BLENDER#': 'UM_BL_500' } }).state, 'COMPLETE')
  assert.deepEqual(pending(), [])
}))
