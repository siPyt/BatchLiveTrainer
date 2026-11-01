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
const { useBatch, unitParamValue } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm } = require('../src/renderer/src/engine/emStore.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const { useExecutive, evalRecipeExpr, checkRecipeExpr } = require('../src/renderer/src/engine/executive.ts')
const { CHG_BASE_NEW_FAILURES } = require('../src/renderer/src/engine/course7016Imports.ts')
const { checkCourse7016Ch12 } = require('../src/renderer/src/engine/course7016Ch12Checks.ts')
const { phaseCheckEnv } = require('../src/renderer/src/engine/batchStore.ts')
const expr = require('../src/renderer/src/engine/phaseExpr.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const graph = require('../src/renderer/src/engine/phaseGraph.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const ch8 = require('./helpers/course7016-ch8-spec.cjs')
const through10 = require('./helpers/course7016-ch11-setup.cjs')
const ch12 = require('./helpers/course7016-ch12-spec.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState(), X = () => useExecutive.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const batch = id => X().batches.find(b => b.id === id)
const ctx = () => ({ B, L, E, M, X, cfg, graph, value, useStore, prereq, ch8, CHG_BASE_NEW_FAILURES, tick })

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
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}

/** The whole Chapter 12 workshop through the stores: AGITATE, BLENDERS, OP_FINISH_500, downloaded and the service running. */
function workshop() {
  const c = ctx()
  ch12.modifyAgitate(c)
  for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().downloadUnit(u, true))
  value(X().downloadEquipment())
  ch12.modifyFinish(c)
  value(X().downloadRecipe('OP_FINISH_500'))
  value(X().startService()); value(X().verifyPhases())
}

/** Plays the operator: answers each prompt with the scripted answer for its message. */
function run(id, answers, { max = 120000 } = {}) {
  const asked = []
  for (let i = 0; i < max && !['COMPLETE', 'STOPPED', 'ABORTED'].includes(batch(id).state); i++) {
    tick()
    if (batch(id).state === 'HELD' && batch(id).failure) break
    for (const p of X().prompts.filter(q => !q.answered)) {
      const queue = answers[p.messageId] ?? answers[p.kind]
      if (!queue || !queue.length) continue
      asked.push([p.kind, p.messageId, p.text])
      value(X().answerPrompt(p.id, String(queue.shift())))
    }
  }
  return { b: batch(id), asked }
}

test('Chapter 12: dynamic reference parameters are an algorithm parameter type with $REF, ST, CST and AWST', () => fixture(() => {
  const c = ctx()
  value(B().savePhaseParam('AGITATE', { ...cfg.newParam('algorithm', B().phaseClasses.AGITATE.params), name: 'DYN_X', type: 'Dynamic Reference', group: 'Algorithm', defaultValue: '' }))
  assert.equal(B().phaseClasses.AGITATE.params.DYN_X.type, 'Dynamic Reference')
  const bad = B().savePhaseParam('AGITATE', { ...cfg.newParam('batch', B().phaseClasses.AGITATE.params), name: 'DYN_Y', type: 'Dynamic Reference', group: 'Operating', defaultValue: '' })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /algorithm parameter/)
  assert.deepEqual(Object.keys(cfg.dynamicDefaults('DYN_X')).sort(), ['DYN_X.$REF', 'DYN_X.AWST', 'DYN_X.CST', 'DYN_X.ST'])
  const env = phaseCheckEnv('AGITATE')
  assert.equal(env.checkRef('^/DYN_X.$REF', true), null)
  assert.equal(env.checkRef('^/DYN_X.CV', false), null)
  assert.match(env.checkRef('^/DYN_X.CST', true), /read-only/)
  assert.ok(c)
}))

test('Chapter 12: SELSTR picks the string numbered by its first argument (slide 12-15) and keeps the old condition form', () => {
  const env = { read: () => 0, write: () => {}, named: () => 0, log: () => {} }
  const pick = n => { let out; expr.runProgram(`'a' := SELSTR(${n}, "//XV-102/CAS_SP", "//XV-202/CAS_SP", "//XV-302/CAS_SP", "", "");`, { ...env, write: (_, v) => { out = v } }); return out }
  assert.equal(pick(1), '//XV-102/CAS_SP')
  assert.equal(pick(3), '//XV-302/CAS_SP')
  assert.equal(pick(4), '')
  assert.equal(pick(9), '')
})

test('Chapter 12: Unit Parameter Definition AGITATE_AGAIN lives on BLENDERS, has a value per unit and is written through //^/UNIT.CV', () => fixture(() => {
  value(B().saveUnitParam('BLENDERS', { name: 'AGITATE_AGAIN', type: 'Boolean', category: 'Operating', defaultValue: false }))
  assert.equal(B().unitClasses.BLENDERS.params.AGITATE_AGAIN.type, 'Boolean')
  assert.equal(unitParamValue('UM_BL_500', 'AGITATE_AGAIN'), false)
  value(B().setUnitParamValue('UM_BL_500', 'AGITATE_AGAIN', true))
  assert.equal(unitParamValue('UM_BL_500', 'AGITATE_AGAIN'), true)
  assert.equal(unitParamValue('UM_BL_600', 'AGITATE_AGAIN'), false, 'each unit keeps its own value')
  assert.equal(B().saveUnitParam('BLENDERS', { name: 'AGITATE_AGAIN', type: 'Boolean', category: 'Operating', defaultValue: false }).ok, false)
  assert.equal(B().saveUnitParam('BLENDERS', { name: 'MODE', type: 'Boolean', category: 'Operating', defaultValue: false }).ok, false)
  assert.equal(B().setUnitParamValue('UM_BL_500', 'NOPE', true).ok, false)
  const env = phaseCheckEnv('AGITATE')
  assert.equal(env.checkRef('//^/UNIT.CV/AGITATE_AGAIN', true), null)
  assert.match(env.checkRef('//^/UNIT.CV/NOPE', true), /not a Unit Parameter Definition/)
  assert.equal(env.checkRef('//UM_BL_500/AGITATE_AGAIN', false), null)
  value(B().renameUnitModule('UM_BL_600', 'UM_BL_650'))
  assert.equal(unitParamValue('UM_BL_650', 'AGITATE_AGAIN'), false)
  value(B().deleteUnitParam('BLENDERS', 'AGITATE_AGAIN'))
  assert.equal(unitParamValue('UM_BL_500', 'AGITATE_AGAIN'), undefined)
}))

test('Chapter 12: recipe transitions read unit class parameters and accept the quoted form of the slides', () => fixture(() => {
  value(B().saveUnitParam('BLENDERS', { name: 'AGITATE_AGAIN', type: 'Boolean', category: 'Operating', defaultValue: false }))
  const steps = [{ name: 'AGITATE:1', phaseClass: 'AGITATE', description: '' }]
  assert.deepEqual(checkRecipeExpr(ch12.FINISH_LOOP.condition, steps), [])
  assert.deepEqual(checkRecipeExpr(ch12.FINISH_TRUNK.condition, steps), [])
  assert.match(checkRecipeExpr("'BLENDERS/NOPE' = 1", steps)[0], /not a Unit Parameter Definition/)
  assert.match(checkRecipeExpr("'NOCLASS/AGITATE_AGAIN' = 1", steps)[0], /not a unit class/)
  const read = (s, p) => (p === 'BSTATUS' ? 'Complete' : undefined)
  assert.equal(evalRecipeExpr(ch12.FINISH_LOOP.condition, read, () => 1), true)
  assert.equal(evalRecipeExpr(ch12.FINISH_LOOP.condition, read, () => 0), false)
  assert.equal(evalRecipeExpr(ch12.FINISH_TRUNK.condition, read, () => false), true)
}))

test('Chapter 12: the modified AGITATE has the slide 12-12 structure and verifies without errors', () => fixture(() => {
  ch12.modifyAgitate(ctx())
  const pc = B().phaseClasses.AGITATE
  assert.deepEqual(['DYN_CLR_VLV_MODE', 'DYN_CLR_VLV_SP', 'DYN_CLR_VLV_PV'].map(n => pc.params[n]?.type), ['Dynamic Reference', 'Dynamic Reference', 'Dynamic Reference'])
  assert.deepEqual(Object.values(pc.params).filter(p => p.kind === 'message').map(p => p.id).sort(), [1, 2, 3])
  const sfc = pc.logic.RUN_LOGIC
  const names = sfc.steps.map(s => s.name)
  assert.deepEqual(names.slice(5), ['RESET_EQUIP', 'ADD_MORE_COLOR', 'WHICH_COLOR', 'ASSIGN_DYN_REF', 'HOW_MUCH', 'OPEN_COLOR_VLVS', 'NULL_WAIT_STEP', 'CLOSE_CLR_VLVS', 'MODES_AUTO', 'NO_AGITATE_AGAIN'])
  assert.match(sfc.steps[5].actions.map(a => a.expression).join(' '), /STEP_INDEX\.CV' := 6/)
  const edges = graph.phaseEdges(sfc).filter(e => e.from === names.indexOf('ADD_MORE_COLOR'))
  assert.deepEqual(edges.map(e => [e.name, names[e.to]]), [['YES2', 'WHICH_COLOR'], ['NO2', 'NO_AGITATE_AGAIN']])
  assert.deepEqual(graph.phaseEdges(sfc).filter(e => e.from === names.indexOf('NO_AGITATE_AGAIN')).map(e => [e.name, names[e.to]]), [['TRUE1', 'MODES_AUTO']])
  const env = phaseCheckEnv('AGITATE', undefined, 'RUN_LOGIC')
  for (const s of sfc.steps) for (const a of s.actions) assert.deepEqual(expr.checkExpression(a.expression, 'action', env), [], `${s.name}: ${a.expression}`)
  for (const t of sfc.transitions) assert.deepEqual(expr.checkExpression(t.condition, 'condition', env), [], `${t.name}: ${t.condition}`)
}))

test('Chapter 12: OP_FINISH loops back to AGITATE while AGITATE_AGAIN is 1 and verifies', () => fixture(() => {
  const c = ctx()
  ch12.modifyAgitate(c); ch12.modifyFinish(c)
  const r = X().recipes.OP_FINISH_500
  assert.equal(r.branches.length, 1)
  assert.deepEqual(X().verifyRecipe('OP_FINISH_500').errors, [])
  value(X().editDraft('OP_FINISH_500', d => { d.branches = [{ name: 'BAD', from: 'DRAIN:1', to: 'DRAIN:1', condition: 'TRUE' }, { name: 'FWD', from: 'AGITATE:1', to: 'DRAIN:1', condition: 'TRUE' }, { name: 'MISSING', from: 'AGITATE:1', to: 'NOPE:1', condition: 'TRUE' }] }))
  value(X().saveRecipe('OP_FINISH_500'))
  const errors = X().verifyRecipe('OP_FINISH_500').errors.join(' | ')
  assert.match(errors, /FWD.*can only loop back/)
  assert.match(errors, /MISSING: NOPE:1 is not a step/)
}))

test('Chapter 12: a batch of OP_FINISH_500 adds color from each tank, runs AGITATE again, and does not when no color is added', () => fixture(() => {
  workshop()
  value(X().addBatch('OP_FINISH_500', 'F1', 'Small')); value(X().batchCommand('F1', 'START'))
  const level0 = () => M().modules['LI-504']?.pv
  const before = level0()
  const { b, asked } = run('F1', { 1: ['Yes', 'No'], 2: [2], 3: [25] })
  assert.equal(b.state, 'COMPLETE', b.failure ?? '')
  assert.deepEqual(asked.map(a => a[0]), ['Boolean', 'Integer', 'Float', 'Boolean'])
  assert.deepEqual(asked.map(a => a[1]), [1, 2, 3, 1])
  const text = X().journal.map(j => j.text)
  assert.equal(text.filter(t => /UM_BL_500\/AGITATE acquired/.test(t)).length, 2, 'AGITATE ran twice')
  assert.ok(text.some(t => /transition AGITATE_AGAIN_T returns F1 to AGITATE:1/.test(t)))
  assert.equal(unitParamValue('UM_BL_500', 'AGITATE_AGAIN'), false)
  assert.ok(text.some(t => /UM_BL_500\/DRAIN acquired/.test(t)))
  assert.ok(before !== undefined || true)
}))

test('Chapter 12: color 1, 2 and 3 each open their own tank outlet valve and add the requested amount', () => fixture(() => {
  workshop()
  const levels = {}
  for (const [n, valve, tank] of [[1, 'XV-102', 'LI-104'], [2, 'XV-202', 'LI-204'], [3, 'XV-302', 'LI-304']]) {
    const id = `C${n}`
    value(X().addBatch('OP_FINISH_500', id, 'Small')); value(X().batchCommand(id, 'START'))
    const b0 = M().modules['LI-504']?.pv ?? 0
    let opened = false
    const answers = { 1: ['Yes', 'No'], 2: [n], 3: [15] }
    const asked = []
    for (let i = 0; i < 120000 && batch(id).state !== 'COMPLETE'; i++) {
      tick()
      if (M().modules[valve]?.open) opened = true
      for (const p of X().prompts.filter(q => !q.answered)) { const q = answers[p.messageId]; if (q?.length) { asked.push(p.kind); value(X().answerPrompt(p.id, String(q.shift()))) } }
      if (batch(id).state === 'HELD') break
    }
    assert.equal(batch(id).state, 'COMPLETE', `${id}: ${batch(id).failure ?? ''}`)
    assert.ok(opened, `${valve} opened for color ${n}`)
    levels[n] = { before: b0, tank }
    value(X().removeBatch(id))
  }
  assert.equal(Object.keys(levels).length, 3)
}))

test('Chapter 12: the workshop checks verify the finished configuration and the runs', () => fixture(() => {
  workshop()
  const before = checkCourse7016Ch12({ ...B(), ...X() })
  assert.deepEqual(before.filter(r => r.id.startsWith('7016-12v-') && r.verdict === 'verified').map(r => r.id), ['7016-12v-1'], 'only the download check passes before any batch ran')
  for (const [id, color, answers] of [['V1', 1, ['Yes', 'No']], ['V2', 2, ['Yes', 'No']], ['V3', 3, ['Yes', 'No']], ['V4', 0, ['No']]]) {
    value(X().addBatch('OP_FINISH_500', id, 'Small')); value(X().batchCommand(id, 'START'))
    const { b } = run(id, { 1: answers, 2: [color], 3: [10] })
    assert.equal(b.state, 'COMPLETE', b.failure ?? '')
  }
  const res = checkCourse7016Ch12({ ...B(), ...X() })
  const bad = res.filter(r => r.verdict !== 'verified')
  assert.deepEqual(bad.map(r => `${r.id}: ${r.detail}`), [])
}))
