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
const { useBatch, readModulePath } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm } = require('../src/renderer/src/engine/emStore.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const { useExecutive, evalRecipeExpr, checkRecipeExpr, defaultTransition } = require('../src/renderer/src/engine/executive.ts')
const { checkCourse7016Ch10 } = require('../src/renderer/src/engine/course7016Ch10Checks.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState(), X = () => useExecutive.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const level = n => readModulePath(`LI-${n}04/AI1/PV.CV`)
const batch = id => X().batches.find(b => b.id === id)

function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem, useExecutive]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installCourseProject(), true)
    prereq({ B, L, E, M, cfg, value, useStore, agitate: true })
    // Chapter 7: DRAIN and its messages 9-11.
    value(B().importPhaseClass('DRAIN.fhx'))
    const ns = M().namedSets
    useStore.setState({ namedSets: { ...ns, configured: { ...ns.configured, phase_failures: { ...ns.configured.phase_failures,
      entries: [...ns.configured.phase_failures.entries, ...['AGITATOR_RUNNING', 'PUMP_STOPPED', 'PRODUCT_VLV_CLOSED'].map((name, i) => ({ name, value: i + 9, visible: true, userSelectable: true }))] } } } })
    M().downloadChangedNamedSets({ kind: 'workstation' }); M().downloadChangedNamedSets({ kind: 'controller', tag: 'CTLR1' })
    value(B().assignPhaseClass('BLENDERS', 'DRAIN'))
    for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().setUnitPhaseProps(u, 'DRAIN', { phaseType: 'Controller' }))
    value(L().downloadController('CTLR1'))
    for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().downloadUnit(u, true))
    tick(1)
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}

/** Slides 10-34 and 10-35 as the student does them in Recipe Studio and Explorer. */
function opFinishWorkshop({ equipment = true } = {}) {
  value(X().newRecipe('OP_FINISH_500'))
  value(X().editDraft('OP_FINISH_500', r => {
    r.steps = [{ name: 'AGITATE:1', phaseClass: 'AGITATE', description: '' }, { name: 'DRAIN:1', phaseClass: 'DRAIN', description: '' }]
    r.transitions = [{ name: 'T1', condition: 'TRUE' }, { name: 'AGITATE_COMPLETE', condition: defaultTransition(r.steps[0]) }, { name: 'DRAIN_COMPLETE', condition: defaultTransition(r.steps[1]) }]
  }))
  value(X().saveRecipe('OP_FINISH_500'))
  value(X().setRecipeProps('OP_FINISH_500', { equipment: { mode: 'Unit', name: 'UM_BL_500' } }))
  value(X().setEnabled(true))
  value(X().assignArea('ED_CENTER_BATCH'))
  if (equipment) value(X().downloadEquipment())
  value(X().setRecipeProps('OP_FINISH_500', { product: { author: 'STUDENT', version: '1.0' } }))
  value(X().assignRecipe('OP_FINISH_500'))
  value(X().downloadRecipe('OP_FINISH_500'))
}

function startService() { value(X().startService()); const v = value(X().verifyPhases()); assert.equal(v.bad, 0, JSON.stringify(X().verify)) }

function runBatch(id, recipe = 'OP_FINISH_500', formula = null, max = 400, each = () => {}) {
  value(X().addBatch(recipe, id, formula))
  value(X().batchCommand(id, 'START'))
  for (let i = 0; i < max * 10 && batch(id).state === 'RUNNING'; i++) { tick(); each(batch(id)) }
  return batch(id)
}

test('Chapter 10: recipe transition expressions evaluate step status against the phase_state named set', () => {
  const read = (step, p) => (step === 'AGITATE:1' && p === 'BSTATUS' ? 'Complete' : step === 'DRAIN:1' && p === 'R_X' ? 5 : undefined)
  assert.equal(evalRecipeExpr('AGITATE:1/BSTATUS = $phase_state:Complete', read), true)
  assert.equal(evalRecipeExpr('AGITATE:1/BSTATUS = $phase_state:Running', read), false)
  assert.equal(evalRecipeExpr('AGITATE:1/BSTATUS = $phase_state:Complete AND DRAIN:1/R_X > 3', read), true)
  assert.equal(evalRecipeExpr('NOT (DRAIN:1/R_X = 5) OR FALSE', read), false)
  assert.equal(evalRecipeExpr('DRAIN:1/BSTATUS = $phase_state:Complete', read), false, 'a phase that is not loaded is never Complete')
  assert.deepEqual(checkRecipeExpr('TRUE', []), [])
  assert.match(checkRecipeExpr('FILL:1/BSTATUS = $phase_state:Complete', [{ name: 'AGITATE:1' }])[0], /FILL:1 is not a step/)
  assert.match(checkRecipeExpr('AGITATE:1/BSTATUS ==', [{ name: 'AGITATE:1' }])[0], /./)
  assert.equal(checkRecipeExpr('', []).length, 1)
})

test('Chapter 10: OP_FINISH_500 workshop - Recipe Studio, executive set-up, verify and download', () => fixture(() => {
  assert.match(X().newRecipe('bad name').error, /letters/)
  value(X().newRecipe('OP_FINISH_500'))
  assert.match(X().newRecipe('OP_FINISH_500').error, /already exists/)
  assert.match(X().assignRecipe('OP_FINISH_500').error, /Enable the Batch Executive/)
  // an empty recipe does not verify
  value(X().setEnabled(true))
  assert.ok(X().verifyRecipe('OP_FINISH_500').errors.some(e => /no steps/.test(e)))
  value(X().editDraft('OP_FINISH_500', r => {
    r.steps = [{ name: 'AGITATE:1', phaseClass: 'AGITATE', description: '' }, { name: 'DRAIN:1', phaseClass: 'DRAIN', description: '' }]
    r.transitions = [{ name: 'T1', condition: 'TRUE' }, { name: 'AGITATE_COMPLETE', condition: defaultTransition(r.steps[0]) }, { name: 'DRAIN_COMPLETE', condition: 'DRAIN:1/BSTATUS = $phase_state:Complete' }]
  }))
  assert.ok(X().verifyRecipe('OP_FINISH_500').errors.some(e => /Unsaved changes/.test(e)))
  value(X().saveRecipe('OP_FINISH_500'))
  assert.ok(X().verifyRecipe('OP_FINISH_500').errors.some(e => /no equipment/.test(e)))
  assert.match(X().setRecipeProps('OP_FINISH_500', { equipment: { mode: 'Unit', name: 'UM_NOPE' } }).error, /does not exist/)
  value(X().setRecipeProps('OP_FINISH_500', { equipment: { mode: 'Unit', name: 'UM_BL_500' } }))
  const v = X().verifyRecipe('OP_FINISH_500')
  assert.deepEqual(v.errors, [])
  assert.ok(v.warnings.some(w => /version/.test(w)) && v.warnings.some(w => /author/.test(w)), 'author and version warnings')
  assert.match(X().downloadRecipe('OP_FINISH_500').error, /not assigned/)
  value(X().assignRecipe('OP_FINISH_500'))
  assert.match(X().downloadRecipe('OP_FINISH_500').error, /not assigned to the Batch Executive/, 'the area is not assigned yet')
  value(X().assignArea('ED_CENTER_BATCH'))
  assert.match(X().assignArea('ED_CENTER_BATCH').error, /already assigned/)
  assert.deepEqual(value(X().downloadRecipe('OP_FINISH_500')).warnings.length, 2)
  assert.match(X().startService().error, /Download the ProfessionalPLUS workstation/)
  assert.equal(value(X().downloadEquipment()), 2 + 2, 'AGITATE and DRAIN on both blenders')
  value(X().startService())
  assert.match(X().addBatch('OP_FINISH_500', 'bad id!', null).error, /Batch ID/)
  assert.match(X().addBatch('NOPE', 'B1', null).error, /not been downloaded/)
}))

test('Chapter 10: Verify Phases counts phases the Batch Executive does not know until the equipment is downloaded', () => fixture(() => {
  value(X().setEnabled(true)); value(X().assignArea('ED_CENTER_BATCH'))
  value(X().downloadEquipment())
  startService()
  assert.equal(X().verify.total, 4)
  // Changing the AGITATE phase class (Step 1 of the prompt workshop) makes the executive's copy stale.
  value(B().savePhaseParam('AGITATE', { ...cfg.newParam('message', B().phaseClasses.AGITATE.params), name: 'MSG1', id: 1, defaultValue: 'OK to begin agitation?' }))
  value(B().savePhaseClass('AGITATE'))
  for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().downloadUnit(u, true))
  assert.equal(value(X().verifyPhases()).bad, 2)
  assert.match(X().verify.bads[0], /changed since the equipment was downloaded/)
  value(X().downloadEquipment())
  assert.equal(value(X().verifyPhases()).bad, 0)
}))

test('Chapter 10: a batch of OP_FINISH_500 runs AGITATE then DRAIN and completes', () => fixture(() => {
  opFinishWorkshop()
  startService()
  const seen = []
  const b = runBatch('B1', 'OP_FINISH_500', null, 400, bt => { if (!seen.includes(bt.pos)) seen.push(bt.pos) })
  assert.equal(b.state, 'COMPLETE', JSON.stringify(b))
  assert.deepEqual(seen, [1, 2, 3], 'positions: AGITATE:1, DRAIN:1, then past the last step (complete)')
  assert.deepEqual(Object.keys(B().active), [], 'phases are reset and unloaded')
  assert.deepEqual(X().owners, {}, 'phases are released')
  const text = X().journal.map(j => j.text).join('\n')
  assert.match(text, /Batch B1 started/)
  assert.match(text, /UM_BL_500\/AGITATE acquired by OP_FINISH_500/)
  assert.match(text, /UM_BL_500\/DRAIN acquired/)
  assert.match(text, /Batch B1 complete/)
  assert.match(X().addBatch('OP_FINISH_500', 'B1', null).error, /already exists/)
}))

test('Chapter 10: a phase failure holds the batch; Clear Failures and Restart finish it', () => fixture(() => {
  opFinishWorkshop(); startService()
  value(X().addBatch('OP_FINISH_500', 'F1', null)); value(X().batchCommand('F1', 'START'))
  for (let i = 0; i < 600 && !(B().active['UM_BL_500/AGITATE']?.rt.params.STEP_INDEX === 4); i++) tick()
  tick(1)
  const out = E().instances[B().units.UM_BL_500.aliases.BLNDR_OUTLET.path].children.PRODUCT_VLV
  value(B().setDeviceMode(out, 'AUTO')); M().openValve(out)
  for (let i = 0; i < 300 && batch('F1').state === 'RUNNING'; i++) tick()
  assert.equal(batch('F1').state, 'HELD')
  assert.match(batch('F1').failure, /UM_BL_500\/AGITATE: PRODUCT_VLV_OPEN/)
  assert.equal(X().batchCommand('F1', 'RESTART').ok, false, 'Restart is refused while the failure is uncleared')
  M().closeValve(out)
  for (let i = 0; i < 300 && B().active['UM_BL_500/AGITATE'].rt.state !== 'HELD'; i++) tick()
  value(X().batchCommand('F1', 'CLEAR_FAILURES'))
  assert.equal(batch('F1').failure, null)
  value(X().batchCommand('F1', 'RESTART'))
  for (let i = 0; i < 6000 && batch('F1').state === 'RUNNING'; i++) tick()
  assert.equal(batch('F1').state, 'COMPLETE', JSON.stringify([batch('F1'), B().active['UM_BL_500/AGITATE']?.rt.state]))
  assert.ok(X().journal.some(j => j.kind === 'Failure'))
}))

test('Chapter 10: Hold, Stop and Abort of a batch pass to the phase and release it', () => fixture(() => {
  opFinishWorkshop(); startService()
  value(X().addBatch('OP_FINISH_500', 'H1', null)); value(X().batchCommand('H1', 'START'))
  for (let i = 0; i < 600 && B().active['UM_BL_500/AGITATE']?.rt.params.STEP_INDEX !== 4; i++) tick()
  value(X().batchCommand('H1', 'HOLD'))
  for (let i = 0; i < 300 && B().active['UM_BL_500/AGITATE'].rt.state !== 'HELD'; i++) tick()
  assert.equal(B().active['UM_BL_500/AGITATE'].rt.state, 'HELD')
  value(X().batchCommand('H1', 'RESTART'))
  tick(3)
  assert.equal(batch('H1').state, 'RUNNING')
  value(X().batchCommand('H1', 'STOP'))
  for (let i = 0; i < 300 && (Object.keys(B().active).length || batch('H1').cleanup); i++) tick()
  assert.equal(batch('H1').state, 'STOPPED')
  assert.deepEqual(Object.keys(B().active), [])
  assert.deepEqual(X().owners, {})
}))

test('Chapter 10: Electronic Operator Log comments are recorded in the batch event journal', () => fixture(() => {
  opFinishWorkshop(); startService()
  value(X().addBatch('OP_FINISH_500', 'C1', null))
  assert.match(X().addComment('NOPE', 'x').error, /does not exist/)
  assert.match(X().addComment('C1', '  ').error, /Enter the comment/)
  value(X().addComment('C1', 'Agitator belt checked'))
  const c = X().journal.filter(j => j.kind === 'Comment')
  assert.equal(c.length, 1)
  assert.equal(c[0].batch, 'C1')
  assert.equal(c[0].text, '[BOI] Agitator belt checked')
}))

function promptWorkshop() {
  value(B().savePhaseParam('AGITATE', { ...cfg.newParam('message', B().phaseClasses.AGITATE.params), name: 'OK_TO_AGITATE', id: 1, defaultValue: "OK to begin agitation? Blend time is 'R_BLEND_TIME' sec" }))
  value(B().editPhaseDraft('AGITATE', d => {
    const first = d.logic.RUN_LOGIC.steps[0], firstT = d.logic.RUN_LOGIC.transitions[0]
    d.logic.RUN_LOGIC.steps.unshift({ ...first, id: 's_prompt', name: 'PROMPT', actions: [{ ...first.actions[0], name: 'P1', qualifier: 'P', expression: "'^/REQUEST.CV' := 3401;" }] })
    d.logic.RUN_LOGIC.transitions.unshift({ ...firstT, id: 't_prompt', name: 'ANSWERED', condition: "'^/REQUEST.CV' = 0 AND '^/PROMPT_BOOL.CV' = TRUE" })
  }))
  value(B().savePhaseClass('AGITATE'))
  for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().downloadUnit(u, true))
  value(X().downloadEquipment())
}

test('Chapter 10: an operator prompt holds the phase until the operator answers Yes', () => fixture(() => {
  opFinishWorkshop(); startService()
  promptWorkshop()
  value(X().addBatch('OP_FINISH_500', 'P1', null)); value(X().batchCommand('P1', 'START'))
  for (let i = 0; i < 100 && !X().prompts.length; i++) tick()
  const p = X().prompts[0]
  assert.equal(p.kind, 'Boolean')
  assert.equal(p.text, 'OK to begin agitation? Blend time is 30 sec', 'dynamic data in single quotes is replaced')
  assert.equal(p.answered, false)
  tick(5)
  assert.equal(B().active['UM_BL_500/AGITATE'].rt.params.STEP_INDEX ?? 0, 0, 'the phase does not continue before the answer')
  value(X().answerPrompt(p.id, 'No'))
  tick(3)
  assert.notEqual(B().active['UM_BL_500/AGITATE'].rt.params.STEP_INDEX, 1, 'No does not satisfy the transition')
  assert.equal(B().active['UM_BL_500/AGITATE'].rt.params.PROMPT_BOOL, 0)
  assert.match(X().answerPrompt(p.id, 'Yes').error, /already answered/)
  assert.equal(X().prompts.filter(q => !q.answered).length, 0)
}))

test('Chapter 10: answering Yes lets the batch continue to Complete', () => fixture(() => {
  opFinishWorkshop(); startService()
  promptWorkshop()
  value(X().addBatch('OP_FINISH_500', 'P2', null)); value(X().batchCommand('P2', 'START'))
  for (let i = 0; i < 6000 && batch('P2').state === 'RUNNING'; i++) {
    tick()
    const open = X().prompts.find(q => !q.answered)
    if (open) value(X().answerPrompt(open.id, 'Yes'))
  }
  assert.equal(batch('P2').state, 'COMPLETE')
  assert.equal(X().prompts.length, 1)
  assert.equal(X().prompts[0].response, 'Yes')
}))

function formulaWorkshop() {
  value(X().editDraft('OP_FINISH_500', r => {
    r.params.R_BLEND_TIME = { name: 'R_BLEND_TIME', step: 'AGITATE:1', phaseParam: 'R_BLEND_TIME', type: 'Integer', defaultValue: 30, low: 0, high: 300, units: 'sec' }
    r.params.R_DRAIN_LEVEL = { name: 'R_DRAIN_LEVEL', step: 'DRAIN:1', phaseParam: 'R_DRAIN_LEVEL', type: 'Real', defaultValue: 250, low: 0, high: 1000, units: 'gal' }
    for (const [name, t, l] of [['LARGE', 55, 50], ['MEDIUM', 45, 75], ['SMALL', 30, 100]]) {
      r.formulas[name] = { name, operatorCanLoad: true, values: { R_BLEND_TIME: { useDefault: false, value: t }, R_DRAIN_LEVEL: { useDefault: false, value: l } } }
    }
  }))
  value(X().saveRecipe('OP_FINISH_500'))
  value(X().downloadRecipe('OP_FINISH_500'))
}

test('Chapter 10: formulas pass their recipe parameters to the phases when the batch runs', () => fixture(() => {
  opFinishWorkshop(); startService()
  formulaWorkshop()
  assert.match(X().addBatch('OP_FINISH_500', 'X1', 'NOPE').error, /does not exist/)
  const passed = {}
  const b = runBatch('X1', 'OP_FINISH_500', 'MEDIUM', 400, () => {
    for (const k of ['AGITATE', 'DRAIN']) { const a = B().active[`UM_BL_500/${k}`]; if (a && a.rt.state === 'RUNNING') passed[k] = { ...a.rt.params } }
  })
  assert.equal(b.state, 'COMPLETE')
  assert.equal(passed.AGITATE.R_BLEND_TIME, 45)
  assert.equal(passed.DRAIN.R_DRAIN_LEVEL, 75)
  assert.ok(level(5) <= 75 && level(5) > 40, `drained to ${level(5)}`)
  assert.deepEqual(b.params, { R_BLEND_TIME: 45, R_DRAIN_LEVEL: 75 })
  // Without a formula the recipe parameter defaults are used.
  value(X().addBatch('OP_FINISH_500', 'X2', null))
  assert.deepEqual(batch('X2').params, { R_BLEND_TIME: 30, R_DRAIN_LEVEL: 250 })
}))

test('Chapter 10: Phase Control - the OPERATOR owns a phase and a batch waits until it is released', () => fixture(() => {
  opFinishWorkshop(); startService()
  assert.match(X().manualCommand('UM_BL_500', 'AGITATE', 'START', 'M1').error, /Acquire/)
  value(X().acquirePhase('UM_BL_500', 'AGITATE'))
  assert.equal(X().owners['UM_BL_500/AGITATE'], 'OPERATOR')
  assert.equal(B().active['UM_BL_500/AGITATE'].owner, 'BATCH')
  assert.match(X().acquirePhase('UM_BL_500', 'AGITATE').error, /owned by OPERATOR/)
  assert.match(X().manualCommand('UM_BL_500', 'AGITATE', 'START', '').error, /Batch ID/)
  value(X().manualCommand('UM_BL_500', 'AGITATE', 'START', 'M1'))
  for (let i = 0; i < 1200 && B().active['UM_BL_500/AGITATE'].rt.state !== 'COMPLETE'; i++) tick()
  assert.equal(B().active['UM_BL_500/AGITATE'].rt.state, 'COMPLETE')
  assert.match(X().releasePhase('UM_BL_500', 'AGITATE').error, /Reset/)
  value(X().manualCommand('UM_BL_500', 'AGITATE', 'RESET'))
  // the OPERATOR keeps the phase: the batch waits to acquire it
  value(X().addBatch('OP_FINISH_500', 'M2', null)); value(X().batchCommand('M2', 'START'))
  tick(10)
  assert.equal(batch('M2').pos, 1)
  assert.equal(batch('M2').stage, 'acquire')
  assert.equal(X().owners['UM_BL_500/AGITATE'], 'OPERATOR')
  value(X().releasePhase('UM_BL_500', 'AGITATE'))
  tick(1)
  assert.equal(X().owners['UM_BL_500/AGITATE'], 'OP_FINISH_500', 'the owner of the phase becomes the recipe')
  assert.equal(batch('M2').stage, 'run')
  assert.equal(B().active['UM_BL_500/AGITATE'].owner, 'BATCH')
  const first = X().journal.find(j => j.batch === 'M1')
  assert.ok(first, 'the operator batch ID tracks the phase in the journal')
  for (let i = 0; i < 8000 && batch('M2').state === 'RUNNING'; i++) tick()
  assert.equal(batch('M2').state, 'COMPLETE')
}))

test('Chapter 10: the workshop checks verify each step from the executive configuration and the run history', () => fixture(() => {
  const state = () => ({ ...B(), ...X() })
  const checks = () => checkCourse7016Ch10(state(), M().eventLog)
  const pending = () => checks().filter(c => c.verdict !== 'verified').map(c => c.id)
  const total = checks().length
  assert.equal(total, 33)
  assert.equal(pending().length, total, 'nothing verified before the work is done')
  // OP_FINISH_500, executive set-up and a first batch from the BOI.
  opFinishWorkshop(); startService()
  assert.equal(runBatch('B1').state, 'COMPLETE')
  assert.ok(pending().length < total)
  // Failure handling.
  value(X().addBatch('OP_FINISH_500', 'F1', null)); value(X().batchCommand('F1', 'START'))
  for (let i = 0; i < 600 && B().active['UM_BL_500/AGITATE']?.rt.params.STEP_INDEX !== 4; i++) tick()
  tick(1)
  const out = E().instances[B().units.UM_BL_500.aliases.BLNDR_OUTLET.path].children.PRODUCT_VLV
  value(B().setDeviceMode(out, 'AUTO')); M().openValve(out)
  for (let i = 0; i < 300 && batch('F1').state === 'RUNNING'; i++) tick()
  M().closeValve(out)
  for (let i = 0; i < 300 && B().active['UM_BL_500/AGITATE'].rt.state !== 'HELD'; i++) tick()
  value(X().batchCommand('F1', 'CLEAR_FAILURES')); value(X().batchCommand('F1', 'RESTART'))
  for (let i = 0; i < 6000 && batch('F1').state === 'RUNNING'; i++) tick()
  assert.equal(batch('F1').state, 'COMPLETE')
  // Electronic Operator Log from both clients, and a batch run from DeltaV Operate.
  value(X().addComment('F1', 'From the BOI'))
  X().setClient('Operate')
  assert.equal(runBatch('O1').state, 'COMPLETE')
  value(X().addComment('O1', 'From Operate'))
  X().setClient('BOI')
  // Operator prompt, formulas, one batch per formula.
  promptWorkshop()
  value(X().verifyPhases())
  value(X().addBatch('OP_FINISH_500', 'P1', null)); value(X().batchCommand('P1', 'START'))
  for (let i = 0; i < 6000 && batch('P1').state === 'RUNNING'; i++) { tick(); const o = X().prompts.find(q => !q.answered); if (o) value(X().answerPrompt(o.id, 'Yes')) }
  assert.equal(batch('P1').state, 'COMPLETE')
  formulaWorkshop()
  for (const f of ['LARGE', 'MEDIUM', 'SMALL']) {
    value(X().addBatch('OP_FINISH_500', `R_${f}`, f)); value(X().batchCommand(`R_${f}`, 'START'))
    for (let i = 0; i < 8000 && batch(`R_${f}`).state === 'RUNNING'; i++) { tick(); const o = X().prompts.find(q => !q.answered); if (o) value(X().answerPrompt(o.id, 'Yes')) }
    assert.equal(batch(`R_${f}`).state, 'COMPLETE', f)
  }
  // Manual phase control and arbitration.
  value(X().acquirePhase('UM_BL_500', 'AGITATE'))
  value(X().manualCommand('UM_BL_500', 'AGITATE', 'START', 'M1'))
  for (let i = 0; i < 3000 && B().active['UM_BL_500/AGITATE'].rt.state !== 'COMPLETE'; i++) { tick(); const o = X().prompts.find(q => !q.answered); if (o) value(X().answerPrompt(o.id, 'Yes')) }
  value(X().manualCommand('UM_BL_500', 'AGITATE', 'RESET'))
  value(X().addBatch('OP_FINISH_500', 'M2', null)); value(X().batchCommand('M2', 'START'))
  tick(5)
  value(X().releasePhase('UM_BL_500', 'AGITATE'))
  for (let i = 0; i < 8000 && batch('M2').state === 'RUNNING'; i++) { tick(); const o = X().prompts.find(q => !q.answered); if (o) value(X().answerPrompt(o.id, 'Yes')) }
  assert.deepEqual(pending(), [])
}))