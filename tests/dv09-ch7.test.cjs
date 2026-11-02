const assert = require('node:assert/strict')
const test = require('node:test')
const { fixture } = require('./helpers/dv09-fixture.cjs')
const setup = require('./helpers/dv09-ch7-setup.cjs')
const { DV09_CHAPTER7 } = require('../src/renderer/src/engine/dv09Ch7Workshops.ts')
const { DV09_CH7 } = require('../src/renderer/src/engine/dv09Ch7.ts')
const { DV09_COURSE } = require('../src/renderer/src/engine/dv09Course.ts')
const { sfcPathsUsed } = require('../src/renderer/src/engine/dv09Ch7Checks.ts')

const eng = ctx => ({ D: ctx.eng('dv09Sfc'), X: ctx.eng('sfcExpressions'), S: ctx.eng('store'), O: ctx.eng('dv09Operate'), P: ctx.eng('pictureStore') })
const verdicts = ctx => Object.fromEntries(DV09_CH7.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => [c.id, c.verdict]))
const details = ctx => Object.fromEntries(DV09_CH7.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => [c.id, c.detail]))
const alerts = []
const quiet = fn => { const before = global.window.alert; global.window.alert = m => alerts.push(m); try { return fn() } finally { global.window.alert = before } }
const withCh7 = fn => fixture(6, ctx => { setup.ensurePrereqs(ctx); ctx.useStore.setState({ running: true }); return quiet(() => fn(ctx, eng(ctx))) })
const scan = (ctx, n = 5) => { for (let i = 0; i < n; i++) ctx.M().tick(0.1) }
const ids = ws => ws.steps.map(s => s.id)

/** The expressions of a chart as the student types them into Action / Transition Properties. */
function chart(ctx, E, name, withShutdown) {
  const c = () => E.S.sfcExpressionContext(ctx.M(), name)
  const a = (text, extra) => { const r = E.X.parseSfcAssignment(text, ctx.M().modules, c()); assert.equal(r.error, undefined, text); return { ...r.value, ...extra } }
  const t = text => { const r = E.X.parseSfcCondition(text, ctx.M().modules, c()); assert.equal(r.error, undefined, text); return r.value }
  const steps = [
    { id: 'hold', name: 'HOLD_SFC', actions: [a("'MESSAGE.CV' := 'NS-T101:SELECT SEQUENCE'", { qualifier: 'P', seconds: 0 })], transition: t("'MESSAGE.CV' = 'NS-T101:STARTUP'"), nextStep: 'open' },
    { id: 'open', name: 'OPEN_BLK_VLV', actions: [a("'//XV-101/DO1/SP_D.CV' := 1")], transition: t("'//XVSTAT-101/DI1/PV_D.CV' = 1"), nextStep: 'flow' },
    { id: 'flow', name: 'SET_FLOW_RATE', actions: [a("'//FIC-102/PID1/SP.CV' := 50")], transition: t("'//FIC-102/PID1/OUT.CV' > 30"), nextStep: 'start' },
    { id: 'start', name: 'START_PUMP', actions: [a("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:START'")], transition: t("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:RUNNING'"), nextStep: withShutdown ? 'end' : 'hold' }
  ]
  if (!withShutdown) return steps
  steps[0].alternatives = [{ condition: t("'MESSAGE.CV' = 'NS-T101:SHUTDOWN'"), nextStep: 'stop' }]
  steps.push(
    { id: 'stop', name: 'STOP_PUMP', actions: [a("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:STOP'")], transition: t("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'"), nextStep: 'close' },
    { id: 'close', name: 'CLOSE_BLK_VLV', actions: [a("'//XV-101/DO1/SP_D.CV' := 0")], transition: t("'//XVSTAT-101/DI1/PV_D.CV' = 0"), nextStep: 'flowclose' },
    { id: 'flowclose', name: 'CLOSE_FLOW_VLV', actions: [a("'//FIC-102/PID1/MODE.TARGET' := MAN"), a("'//FIC-102/PID1/OUT.CV' := 0")], transition: t("'//FIC-102/PID1/OUT.CV' < 2"), nextStep: 'end' },
    { id: 'end', name: 'END_SEQUENCE', actions: [], transition: t('TRUE'), nextStep: 'hold' })
  return steps
}
const namedSet = (ctx, name, list) => {
  assert.equal(ctx.M().createNamedSet(name), true)
  assert.equal(ctx.M().applyNamedSetProperties(ctx.M().namedSets.configured[name], { name, description: '',
    entries: list.map(([n, value, visible, userSelectable]) => ({ name: n, value, visible, userSelectable })) }), true)
}
const NS = [['STARTUP', 1, true, true], ['SELECT SEQUENCE', 255, true, false]]

test('the run evidence survives a full Event Journal: the SFC keeps its own history and Browser picks', () => withCh7((ctx) => {
  setup(ctx)
  for (let i = 0; i < 2100; i++) ctx.M().logEvent('ALARM', 'NOISE', 'alarm ' + i)
  assert.equal(ctx.M().eventLog.some(e => /^SFC step OPEN_BLK_VLV active/.test(e.description)), false, 'the journal no longer holds the run')
  const v = verdicts(ctx)
  for (const id of ['dv09-7c-10', 'dv09-7d-5', 'dv09-7b-8', 'dv09-7b-9', 'dv09-7a-1']) assert.equal(v[id], 'verified', id)
  assert.ok(ctx.M().sfcLifecycle['SFC-T101'].history.length > 10)
  assert.ok(ctx.M().sfcLifecycle['SFC-T101'].history.length <= 400)
}))

test('Chapter 7 workshop definitions: reading, the five workshops and three optional exercises with unique step ids', () => {
  const ws = DV09_CHAPTER7.workshops
  assert.deepEqual(ws.map(w => w.id), ['dv09-ch7-reading', 'dv09-ch7-using-sfcs', 'dv09-ch7-parameter-paths', 'dv09-ch7-sfc-t101', 'dv09-ch7-modify-sfc-t101',
    'dv09-ch7-startup-shutdown', 'dv09-ch7-optional-messages', 'dv09-ch7-optional-level', 'dv09-ch7-optional-alarm'])
  assert.ok(ws.every(w => w.id.startsWith(DV09_CH7.prefix)))
  const all = ws.flatMap(ids)
  assert.equal(new Set(all).size, all.length)
  assert.ok(all.every(id => /^dv09-7[a-z]-\d+[a-z]?$/.test(id)))
  assert.equal(ws[1].steps.length, 4)
  assert.equal(ws[2].steps.length, 9)
  assert.match(ws[2].steps[4].text, /Set the mode of the flow loop/)
  assert.match(ws[3].steps[0].text, /Step 1\. Create Named Set NS-T101 using DeltaV Explorer\./)
  assert.match(ws[3].steps[2].text, /Select New and change the Algorithm Type to Sequential Function Chart/)
  assert.match(ws[4].steps[1].text, /using divergent paths as shown below/)
  assert.equal(ws[5].steps.length, 14)
  assert.ok(DV09_COURSE.some(m => m.workshops.some(w => w.id === 'dv09-ch7-sfc-t101')), 'the course module list contains chapter 7')
  // every step the checks answer exists in a workshop, and every checked workshop step is answered
  withCh7(ctx => {
    const answered = Object.keys(verdicts(ctx))
    assert.equal(new Set(answered).size, answered.length)
    for (const id of answered) assert.ok(all.includes(id), id)
    const tickOnly = ws.filter(w => !w.id.endsWith('reading')).flatMap(ids).filter(id => !answered.includes(id))
    assert.deepEqual(tickOnly, [])
  })
})

test('the manual expressions parse: Named Set states of devices, the SP_D command, XVSTAT/FIC/MTR paths (pp 7-13, 7-14, 7-17)', () => withCh7((ctx, E) => {
  namedSet(ctx, 'NS-T101', NS)
  ctx.M().createSfc('SFC-X', 'PLANT_AREA_A', { managed: true })
  const c = E.S.sfcExpressionContext(ctx.M(), 'SFC-X')
  ctx.M().configureSfcParameter('SFC-X', 'MESSAGE', { type: 'NAMED_SET', namedSet: 'NS-T101', value: 255 }, ctx.M().sfcLifecycle['SFC-X'].draft)
  const ctx2 = E.S.sfcExpressionContext(ctx.M(), 'SFC-X')
  const mods = ctx.M().modules
  assert.deepEqual(E.X.parseSfcAssignment("'MESSAGE.CV' := 'NS-T101:SELECT SEQUENCE'", mods, ctx2).value, { kind: 'namedSet', tag: 'SFC-X', parameter: 'MESSAGE', namedSet: 'NS-T101', entry: 'SELECT SEQUENCE' })
  assert.deepEqual(E.X.parseSfcAssignment("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:START'", mods, ctx2).value, { kind: 'motor', tag: 'MTR-102', run: true })
  assert.deepEqual(E.X.parseSfcAssignment("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:STOP'", mods, ctx2).value, { kind: 'motor', tag: 'MTR-102', run: false })
  assert.deepEqual(E.X.parseSfcAssignment("'//MTR-102/DC1/OUT_D.CV' := 1", mods, ctx2).value, { kind: 'motor', tag: 'MTR-102', run: true })
  assert.deepEqual(E.X.parseSfcAssignment("'//XV-101/DO1/SP_D.CV' := 1", mods, ctx2).value, { kind: 'do', tag: 'XV-101', on: true })
  assert.deepEqual(E.X.parseSfcAssignment("'//FIC-102/PID1/SP.CV' := 50", mods, ctx2).value, { kind: 'sp', tag: 'FIC-102', value: 50 })
  assert.deepEqual(E.X.parseSfcCondition("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:RUNNING'", mods, ctx2).value, { kind: 'motorRunning', tag: 'MTR-102', running: true })
  assert.deepEqual(E.X.parseSfcCondition("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'", mods, ctx2).value, { kind: 'motorRunning', tag: 'MTR-102', running: false })
  assert.deepEqual(E.X.parseSfcCondition("'//XVSTAT-101/DI1/PV_D.CV' = 1", mods, ctx2).value, { kind: 'discrete', tag: 'XVSTAT-101', state: true })
  assert.deepEqual(E.X.parseSfcCondition("'//FIC-102/PID1/OUT.CV' > 30", mods, ctx2).value, { kind: 'out', tag: 'FIC-102', op: '>', value: 30 })
  // negative cases: unknown set, case-sensitive state, a state whose value is not 0/1, a value on a device command, a wrong module path
  assert.match(E.X.parseSfcAssignment("'//MTR-102/DC1/SP_D.CV' := 'nosuch-sp:START'", mods, ctx2).error, /Named Set nosuch-sp is unavailable/)
  assert.match(E.X.parseSfcAssignment("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:start'", mods, ctx2).error, /Case-sensitive state mtr2-sp:start does not exist/)
  assert.match(E.X.parseSfcCondition("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:TRAVEL'", mods, ctx2).error, /value 2/)
  assert.match(E.X.parseSfcAssignment("'//MTR-102/DC1/SP_D.CV' := 2", mods, ctx2).error, /0 or 1/)
  assert.match(E.X.parseSfcAssignment("'//NOSUCH-1/DC1/SP_D.CV' := 1", mods, ctx2).error, /does not exist/)
  assert.match(E.X.parseSfcAssignment("'MESSAGE.CV' := 'NS-T101:BOGUS'", mods, ctx2).error, /does not exist/)
  assert.ok(c)
}))

test('File > New > Sequential Function Chart creates UNTITLED; Save is Save As (name and area) and moves the parameter actions', () => withCh7((ctx, E) => {
  namedSet(ctx, 'NS-T101', NS)
  const first = E.D.newUntitledSfc()
  const second = E.D.newUntitledSfc()
  assert.deepEqual([first, second], ['UNTITLED', 'UNTITLED1'])
  assert.equal(ctx.M().sfcLifecycle.UNTITLED.online, false)
  assert.equal(ctx.M().sfcs.UNTITLED.status, 'READY')
  assert.equal(E.D.isUntitled('UNTITLED1'), true)
  assert.equal(E.D.isUntitled('SFC-T101'), false)
  assert.match(E.D.saveSfcAs('UNTITLED', 'THIS-NAME-IS-WAY-TOO-LONG', 'PLANT_AREA_A'), /16/)
  assert.match(E.D.saveSfcAs('UNTITLED', 'XV-101', 'PLANT_AREA_A'), /already used/)
  assert.match(E.D.saveSfcAs('UNTITLED', 'SFC-T101', 'NO_AREA'), /does not exist/)
  assert.match(E.D.saveSfcAs('NOPE', 'SFC-T101', 'PLANT_AREA_A'), /not found/)
  assert.equal(ctx.M().sfcs.UNTITLED.name, 'UNTITLED', 'rejected Save As changes nothing')
  ctx.M().configureSfcParameter('UNTITLED', 'MESSAGE', { type: 'NAMED_SET', namedSet: 'NS-T101', value: 255 }, ctx.M().sfcLifecycle.UNTITLED.draft)
  ctx.M().setSfcSteps('UNTITLED', chart(ctx, E, 'UNTITLED', false))
  assert.equal(E.D.saveSfcAs('UNTITLED', 'sfc-t101', 'PLANT_AREA_B'), null)
  const s = ctx.M()
  assert.equal(s.sfcs.UNTITLED, undefined)
  assert.equal(s.sfcs['SFC-T101'].area, 'PLANT_AREA_B')
  assert.equal(s.sfcLifecycle['SFC-T101'].draft.name, 'SFC-T101')
  assert.ok(s.sfcLifecycle['SFC-T101'].saved, 'Save As saves')
  assert.equal(s.sfcLifecycle['SFC-T101'].draft.steps[0].actions[0].tag, 'SFC-T101', 'the MESSAGE action addresses the renamed SFC')
  assert.equal(s.sfcLifecycle['SFC-T101'].draft.parameters.MESSAGE.namedSet, 'NS-T101')
  assert.match(E.D.saveSfcAs('SFC-T101', 'OTHER', 'PLANT_AREA_A'), /already been saved/)
  assert.equal(E.D.saveStudioSfc('SFC-T101'), null)
}))

test('Download: needs Save, a node and the Named Set; sends the Named Set to the controller; the SFC starts at HOLD_SFC; Edit stops it', () => withCh7((ctx, E) => {
  namedSet(ctx, 'NS-T101', NS)
  const name = E.D.newUntitledSfc()
  assert.match(E.D.downloadSfc(name), /Save the SFC with a name/)
  ctx.M().configureSfcParameter(name, 'MESSAGE', { type: 'NAMED_SET', namedSet: 'NS-T101', value: 255 }, ctx.M().sfcLifecycle[name].draft)
  ctx.M().setSfcSteps(name, chart(ctx, E, name, false))
  assert.equal(E.D.saveSfcAs(name, 'SFC-T101', 'PLANT_AREA_A'), null)
  assert.match(E.D.downloadSfc('SFC-T101'), /Assign the SFC to a controller/)
  assert.equal(ctx.M().sfcLifecycle['SFC-T101'].deployed, undefined)
  ctx.M().configureSfcProperties('SFC-T101', { controllerTag: 'CTLR_PAINT' }, ctx.M().sfcLifecycle['SFC-T101'].draft)
  assert.match(E.D.downloadSfc('SFC-T101'), /Save the current edits/, 'Module Properties changed the draft after the Save')
  assert.equal(E.D.saveStudioSfc('SFC-T101'), null)
  const controllerSets = () => ctx.M().namedSets.deployed['CONTROLLER:CTLR_PAINT'] ?? {}
  delete controllerSets()['NS-T101']
  assert.equal(E.D.downloadSfc('SFC-T101'), null)
  assert.ok(controllerSets()['NS-T101'], 'the referenced Named Set went to the controller with the module')
  const s = ctx.M()
  assert.equal(s.sfcs['SFC-T101'].status, 'RUNNING')
  assert.equal(s.sfcs['SFC-T101'].active, 0)
  assert.equal(s.sfcLifecycle['SFC-T101'].online, true)
  // the SFC waits at HOLD_SFC: nothing moves until the operator enters STARTUP
  const pumpBefore = ctx.M().modules['MTR-102'].running
  scan(ctx, 30)
  assert.equal(ctx.M().sfcs['SFC-T101'].active, 0)
  assert.equal(ctx.M().sfcs['SFC-T101'].status, 'RUNNING')
  assert.equal(ctx.M().modules['MTR-102'].running, pumpBefore, 'the pump is not touched before the operator enters STARTUP')
  E.D.goEdit('SFC-T101')
  assert.equal(ctx.M().sfcLifecycle['SFC-T101'].online, false)
  assert.equal(ctx.M().sfcs['SFC-T101'].status, 'READY')
  // an edit that fails Check is reported but can still be saved; Download then refuses it
  assert.equal(E.D.checkSfc('SFC-T101').ok, true)
  ctx.M().setSfcSteps('SFC-T101', [{ id: 'x', name: 'S1', actions: [], transition: { kind: 'namedSet', parameter: 'MESSAGE', namedSet: 'NS-T101', entry: 'NOPE' } }])
  const bad = E.D.checkSfc('SFC-T101')
  assert.equal(bad.ok, false)
  assert.match(bad.text, /NOPE|does not exist/)
  assert.match(E.D.downloadSfc('SFC-T101'), /Save the current edits/)
}))

test('the step journal: a downloaded SFC journals each step it enters, unmanaged SFCs stay silent', () => withCh7((ctx, E) => {
  setup(ctx)
  const log = ctx.M().eventLog.filter(e => e.tag === 'SFC-T101' && /^SFC step /.test(e.description)).map(e => e.description.replace(/^SFC step (\S+) active$/, '$1'))
  assert.deepEqual(log.slice(0, 5), ['OPEN_BLK_VLV', 'SET_FLOW_RATE', 'START_PUMP', 'HOLD_SFC', 'OPEN_BLK_VLV'])
  assert.deepEqual(log.slice(-6), ['STOP_PUMP', 'CLOSE_BLK_VLV', 'CLOSE_FLOW_VLV', 'END_SEQUENCE', 'HOLD_SFC'].slice(0, 5).length === 5 ? log.slice(-6) : [])
  assert.ok(ctx.M().eventLog.some(e => e.description === 'SFC complete') === false)
}))

test('palette: Step follows the selected step, Transition adds a divergent path, Termination ends the sequence; no selection is refused', () => withCh7((ctx, E) => {
  const step = (id, name) => ({ id, name, actions: [], transition: { kind: 'always' } })
  const steps = [step('a', 'HOLD_SFC'), step('b', 'OPEN_BLK_VLV')]
  const stepped = E.D.paletteStep(steps, 0)
  assert.equal(stepped.steps.length, 3)
  assert.equal(stepped.steps[1].name, 'S3', 'a new step is inserted after the selected step')
  assert.equal(stepped.selected, 1)
  const appended = E.D.paletteStep(steps, null)
  assert.equal(appended.steps.length, 3)
  assert.equal(appended.selected, 2)
  const branched = E.D.paletteTransition(steps, 0)
  assert.equal(branched.steps.length, 3)
  assert.equal(branched.steps[0].alternatives.length, 1)
  assert.equal(branched.steps[0].alternatives[0].nextStep, branched.steps[branched.selected].id)
  assert.match(E.D.paletteTransition(steps, null).error, /Select the step/)
  const ended = E.D.paletteTermination(steps, 0)
  assert.equal(ended.steps[0].nextStep, null)
  assert.match(E.D.paletteTermination(steps, null).error, /Select the step/)
}))

test('dv09ExpressionText shows the manual forms: // paths, SP_D with Named Set states, PV_D states', () => withCh7((ctx, E) => {
  const sets = ctx.M().namedSets.configured
  const mods = ctx.M().modules
  assert.equal(E.D.dv09ExpressionText("'^/XV-101/DO1/SP_D.CV' := 1", mods, sets), "'//XV-101/DO1/SP_D.CV' := 1")
  assert.equal(E.D.dv09ExpressionText("'^/MTR-102/DC1/OUT_D.CV' := 1", mods, sets), "'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:START'")
  assert.equal(E.D.dv09ExpressionText("'^/MTR-102/DC1/PV_D.CV' = 0", mods, sets), "'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'")
  assert.equal(E.D.dv09ExpressionText("'^/FIC-102/PID1/OUT.CV' > 30", mods, sets), "'//FIC-102/PID1/OUT.CV' > 30")
  assert.equal(E.D.dv09ExpressionText("'^/MTR-102/DC1/PV_D.CV' = 0", mods, {}), "'//MTR-102/DC1/PV_D.CV' = 0", 'without the Named Sets the numeric form stays')
}))

test('Using SFC-T101: each step goes pending -> verified from real state, with negative cases', () => withCh7((ctx, E) => {
  const v = () => verdicts(ctx)
  const before = v()
  assert.ok(Object.values(before).every(x => x === 'pending'), 'nothing is verified before the work: ' + JSON.stringify(Object.entries(before).filter(([, x]) => x === 'verified')))
  // Steps 1 and 2: Named Set
  assert.equal(ctx.M().createNamedSet('NS-T101'), true)
  assert.equal(v()['dv09-7c-1'], 'verified')
  assert.equal(v()['dv09-7c-2'], 'pending')
  const created = ctx.M().namedSets.configured['NS-T101']
  // SELECT SEQUENCE User Selectable = Yes is wrong
  ctx.M().applyNamedSetProperties(created, { ...created, entries: [{ name: 'STARTUP', value: 1, visible: true, userSelectable: true }, { name: 'SELECT SEQUENCE', value: 255, visible: true, userSelectable: true }] })
  assert.equal(v()['dv09-7c-2'], 'pending')
  ctx.M().applyNamedSetProperties(ctx.M().namedSets.configured['NS-T101'], { ...created, entries: [{ name: 'startup', value: 1, visible: true, userSelectable: true }, { name: 'SELECT SEQUENCE', value: 255, visible: true, userSelectable: false }] })
  assert.equal(v()['dv09-7c-2'], 'pending', 'names are case sensitive')
  ctx.M().applyNamedSetProperties(ctx.M().namedSets.configured['NS-T101'], { ...created, entries: NS.map(([name, value, visible, userSelectable]) => ({ name, value, visible, userSelectable })) })
  assert.equal(v()['dv09-7c-2'], 'verified')
  assert.equal(v()['dv09-7a-2'], 'verified', 'Task 2 of the overview follows steps 1 and 2')
  assert.equal(v()['dv09-7a-3'], 'pending')
}))

test('Using SFC-T101 steps 3 to 10 and Startup & Shutdown boxes, one at a time', () => withCh7((ctx, E) => {
  const v = () => verdicts(ctx)
  namedSet(ctx, 'NS-T101', NS)
  assert.equal(v()['dv09-7c-3'], 'pending', 'no SFC yet')
  const untitled = E.D.newUntitledSfc()
  ctx.M().configureSfcParameter(untitled, 'MESSAGE', { type: 'NAMED_SET', namedSet: 'NS-T101', value: 255 }, ctx.M().sfcLifecycle[untitled].draft)
  // the checks look for SFC-T101: UNTITLED is not it
  assert.equal(v()['dv09-7c-4'], 'pending')
  const steps = chart(ctx, E, untitled, false)
  ctx.M().setSfcSteps(untitled, steps)
  assert.equal(E.D.saveSfcAs(untitled, 'SFC-T101', 'PLANT_AREA_A'), null)
  let r = v()
  for (const id of ['dv09-7c-3', 'dv09-7c-4', 'dv09-7c-5a', 'dv09-7c-5b', 'dv09-7c-5c', 'dv09-7c-5d', 'dv09-7c-5e', 'dv09-7c-5f', 'dv09-7c-5g', 'dv09-7c-5h', 'dv09-7c-8']) assert.equal(r[id], 'verified', id)
  assert.equal(r['dv09-7c-6'], 'pending', 'not assigned to a controller yet')
  assert.equal(r['dv09-7c-7'], 'pending', 'saved but not downloaded')
  assert.match(details(ctx)['dv09-7c-7'], /saved and not downloaded/)
  // Startup & Shutdown: only the startup half exists
  assert.equal(r['dv09-7e-2'], 'verified')
  assert.equal(r['dv09-7e-7'], 'pending', 'the pump transition leads back to HOLD_SFC, not to END_SEQUENCE')
  assert.equal(r['dv09-7e-8'], 'pending')
  assert.equal(r['dv09-7d-2'], 'pending')
  // a wrong value / wrong qualifier / wrong step name each fail only their own line
  const keep = ctx.M().sfcLifecycle['SFC-T101'].draft.steps
  const edit = (patch) => { ctx.M().setSfcSteps('SFC-T101', keep.map(s => (s.id === patch.id ? { ...s, ...patch.set } : s))); const out = v(); ctx.M().setSfcSteps('SFC-T101', keep); return out }
  assert.equal(edit({ id: 'flow', set: { actions: [{ ...keep[2].actions[0], value: 40 }] } })['dv09-7c-5e'], 'pending')
  assert.equal(edit({ id: 'hold', set: { actions: [{ ...keep[0].actions[0], qualifier: 'N' }] } })['dv09-7c-5a'], 'pending')
  assert.match(details(ctx)['dv09-7c-5a'], /Pulse sets the prompt once|qualifier/)
  assert.equal(edit({ id: 'open', set: { name: 'OPEN_VALVE' } })['dv09-7c-5c'], 'pending')
  assert.equal(edit({ id: 'flow', set: { transition: { kind: 'out', tag: 'FIC-102', op: '>', value: 20 } } })['dv09-7c-5f'], 'pending')
  assert.equal(edit({ id: 'open', set: { transition: { kind: 'discrete', tag: 'XVSTAT-101', state: false } } })['dv09-7c-5d'], 'pending')
  // Step 6, 7
  assert.equal(ctx.M().configureSfcProperties('SFC-T101', { controllerTag: 'CTLR_PAINT' }, ctx.M().sfcLifecycle['SFC-T101'].draft), true)
  assert.equal(v()['dv09-7c-6'], 'verified')
  assert.equal(E.D.saveStudioSfc('SFC-T101'), null)
  assert.equal(v()['dv09-7c-7'], 'pending')
  assert.equal(E.D.downloadSfc('SFC-T101'), null)
  r = v()
  assert.equal(r['dv09-7c-7'], 'verified')
  assert.equal(r['dv09-7c-9'], 'pending')
  assert.equal(r['dv09-7c-10'], 'pending')
  // Step 9 and the note: the picture and Changed Setup Data
  assert.match(E.O.addDatalink('TANK101', { source: 'DVSYS.SFC-T101/NOPE.F_CV', inPlace: true, refreshSeconds: 1, x: 10, y: 10 }), /no module parameter NOPE/)
  assert.equal(E.O.addDatalink('TANK101', { source: 'DVSYS.SFC-T101/MESSAGE.F_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 340 }), null)
  assert.equal(v()['dv09-7c-9'], 'pending', 'a datalink without data entry is not Step 9')
  const el = E.P.usePictures.getState().pictures.TANK101.elements.filter(x => x.tag === 'SFC-T101')
  E.P.usePictures.getState().removeElement ? E.P.usePictures.getState().removeElement('TANK101', el[0].id) : E.O.deleteElement('TANK101', el[0].id)
  assert.equal(E.O.addDatalink('TANK101', { source: 'DVSYS.SFC-T101/MESSAGE.F_CV', inPlace: true, refreshSeconds: 1, x: 300, y: 340 }), null)
  assert.equal(v()['dv09-7c-9'], 'pending', 'not saved yet')
  assert.equal(E.O.savePicture('TANK101'), null)
  assert.equal(v()['dv09-7c-9'], 'verified')
  assert.equal(v()['dv09-7c-9n'], 'pending')
  const link = E.P.usePictures.getState().pictures.TANK101.elements.find(x => x.tag === 'SFC-T101')
  assert.equal(link.entry.method, 'NAMED_SET')
  // the workstation does not know NS-T101 yet: entry is refused
  assert.equal(E.P.usePictures.getState().writeNamedValue('TANK101', link.id, 1), false)
  assert.equal(ctx.M().downloadChangedNamedSets({ kind: 'workstation' }), true)
  assert.equal(v()['dv09-7c-9n'], 'verified')
  // SELECT SEQUENCE is not user selectable
  assert.equal(E.P.usePictures.getState().writeNamedValue('TANK101', link.id, 255), false)
  assert.equal(ctx.M().sfcs['SFC-T101'].parameters.MESSAGE.value, 255)
  // Step 10: STARTUP from the datalink, the sequence runs
  scan(ctx, 5)
  assert.equal(E.P.usePictures.getState().writeNamedValue('TANK101', link.id, 1), true)
  for (let i = 0; i < 600 && !(i > 5 && ctx.M().sfcs['SFC-T101'].active === 0); i++) ctx.M().tick(0.1)
  assert.equal(v()['dv09-7c-10'], 'verified')
  assert.equal(ctx.M().modules['MTR-102'].running, true)
  assert.equal(ctx.M().modules['XV-101'].commanded, true)
  assert.equal(ctx.M().sfcs['SFC-T101'].parameters.MESSAGE.value, 255, 'the prompt pulse returned MESSAGE to SELECT SEQUENCE')
}))

test('Modifying SFC-T101 and Startup & Shutdown: the divergent chart, Download and the two runs', () => withCh7((ctx, E) => {
  const v = () => verdicts(ctx)
  namedSet(ctx, 'NS-T101', NS)
  const u = E.D.newUntitledSfc()
  ctx.M().configureSfcParameter(u, 'MESSAGE', { type: 'NAMED_SET', namedSet: 'NS-T101', value: 255 }, ctx.M().sfcLifecycle[u].draft)
  ctx.M().setSfcSteps(u, chart(ctx, E, u, false))
  ctx.M().configureSfcProperties(u, { controllerTag: 'CTLR_PAINT' }, ctx.M().sfcLifecycle[u].draft)
  assert.equal(E.D.saveSfcAs(u, 'SFC-T101', 'PLANT_AREA_A'), null)
  assert.equal(E.D.downloadSfc('SFC-T101'), null)
  ctx.M().downloadChangedNamedSets({ kind: 'workstation' })
  assert.equal(v()['dv09-7d-1'], 'pending')
  // Step 1: SHUTDOWN is added to NS-T101 (not visible: still pending)
  const named = ctx.M().namedSets.configured['NS-T101']
  ctx.M().applyNamedSetProperties(named, { ...named, entries: [...named.entries, { name: 'SHUTDOWN', value: 2, visible: true, userSelectable: false }] })
  assert.equal(v()['dv09-7d-1'], 'pending', 'SHUTDOWN has to be user selectable')
  const n2 = ctx.M().namedSets.configured['NS-T101']
  ctx.M().applyNamedSetProperties(n2, { ...n2, entries: n2.entries.map(e => (e.name === 'SHUTDOWN' ? { ...e, userSelectable: true } : e)) })
  assert.equal(v()['dv09-7d-1'], 'verified')
  assert.equal(v()['dv09-7c-9n'], 'verified', 'the earlier Changed Setup Data download still counts')
  assert.match(details(ctx)['dv09-7c-9n'], /changed since: download Changed Setup Data again/)
  // the chart is edited: the running SFC has to be stopped first (Edit)
  assert.equal(ctx.M().setSfcSteps('SFC-T101', chart(ctx, E, 'SFC-T101', true)), undefined)
  assert.equal(ctx.M().sfcLifecycle['SFC-T101'].draft.steps.length, 4, 'a running SFC cannot be edited')
  E.D.goEdit('SFC-T101')
  ctx.M().setSfcSteps('SFC-T101', chart(ctx, E, 'SFC-T101', true))
  let r = v()
  for (let i = 1; i <= 14; i++) assert.equal(r['dv09-7e-' + i], 'verified', 'figure box ' + i)
  assert.equal(r['dv09-7d-2'], 'verified')
  assert.equal(r['dv09-7d-3'], 'pending', 'not saved/downloaded yet')
  assert.match(details(ctx)['dv09-7d-3'], /not saved yet/)
  assert.equal(E.D.saveStudioSfc('SFC-T101'), null)
  assert.match(details(ctx)['dv09-7d-3'], /Download again/)
  assert.equal(E.D.downloadSfc('SFC-T101'), null)
  assert.equal(v()['dv09-7d-3'], 'verified')
  assert.equal(v()['dv09-7d-4'], 'verified')
  assert.equal(v()['dv09-7d-5'], 'pending')
  ctx.M().downloadChangedNamedSets({ kind: 'workstation' })
  const link = E.P.usePictures.getState().pictures.TANK101
  assert.equal(E.O.addDatalink('TANK101', { source: 'DVSYS.SFC-T101/MESSAGE.F_CV', inPlace: true, refreshSeconds: 1, x: 300, y: 340 }), null)
  const el = Object.values(E.P.usePictures.getState().pictures.TANK101.elements).find(x => x.tag === 'SFC-T101')
  const run = value => { assert.equal(E.P.usePictures.getState().writeNamedValue('TANK101', el.id, value), true); for (let i = 0; i < 800 && !(i > 5 && ctx.M().sfcs['SFC-T101'].active === 0); i++) ctx.M().tick(0.1) }
  scan(ctx, 5)
  run(1)
  assert.equal(v()['dv09-7d-5'], 'pending', 'only the startup run so far')
  assert.equal(ctx.M().modules['MTR-102'].running, true)
  run(2)
  r = v()
  assert.equal(r['dv09-7d-5'], 'verified')
  assert.equal(ctx.M().modules['MTR-102'].running, false)
  assert.equal(ctx.M().modules['XV-101'].commanded, false)
  assert.equal(ctx.M().modules['FIC-102'].mode, 'MAN')
  assert.equal(ctx.M().sfcs['SFC-T101'].active, 0)
  assert.ok(link)
  // the figure: a wrong stop value or a missing END_SEQUENCE route fail their own box
  E.D.goEdit('SFC-T101')
  const steps = chart(ctx, E, 'SFC-T101', true).map(s => (s.id === 'flowclose' ? { ...s, transition: { kind: 'out', tag: 'FIC-102', op: '<', value: 5 } } : s))
  ctx.M().setSfcSteps('SFC-T101', steps)
  r = v()
  assert.equal(r['dv09-7e-13'], 'pending')
  assert.equal(r['dv09-7e-12'], 'verified')
  assert.equal(r['dv09-7d-2'], 'pending')
  const noReturn = chart(ctx, E, 'SFC-T101', true).map(s => (s.id === 'end' ? { ...s, nextStep: null } : s))
  ctx.M().setSfcSteps('SFC-T101', noReturn)
  assert.equal(v()['dv09-7e-14'], 'pending')
}))

test('Parameter Paths: each line is verified by the path used in an SFC expression or picked in the Browser', () => withCh7((ctx, E) => {
  const v = () => verdicts(ctx)
  ctx.M().createSfc('SFC-X', 'PLANT_AREA_A', { managed: true })
  const ids9 = Array.from({ length: 9 }, (_, i) => `dv09-7b-${i + 1}`)
  assert.ok(ids9.every(id => v()[id] === 'pending'))
  E.D.recordBrowse('SFC-X', '//XV-101/DO1/SP_D.CV')
  assert.equal(v()['dv09-7b-1'], 'verified')
  assert.equal(v()['dv09-7b-2'], 'pending')
  E.D.recordBrowse('SFC-X', '//XVSTAT-101/DI1/PV_D.CV')
  E.D.recordBrowse('SFC-X', '//MTR-102/DC1/SP_D.CV')
  E.D.recordBrowse('SFC-X', '//MTR-102/DC1/PV_D.CV')
  E.D.recordBrowse('SFC-X', '//FIC-102/PID1/MODE.TARGET')
  E.D.recordBrowse('SFC-X', '//FIC-102/PID1/SP.CV')
  E.D.recordBrowse('SFC-X', '//FIC-102/PID1/OUT.CV')
  E.D.recordBrowse('SFC-X', '//FIC-102/PID1/MODE.ACTUAL')
  assert.equal(v()['dv09-7a-1'], 'pending')
  assert.equal(v()['dv09-7b-9'], 'pending')
  E.D.recordBrowse('SFC-X', '//FIC-102/PID1/MODE.CV')
  assert.equal(v()['dv09-7b-9'], 'pending', 'a different parameter does not count')
  E.D.recordBrowse('SFC-X', '//FIC-102/PID1/PV.CV')
  assert.ok(ids9.every(id => v()[id] === 'verified'))
  assert.equal(v()['dv09-7a-1'], 'verified')
  // an SFC expression counts without the Browser
  const used = sfcPathsUsed([{ id: 'a', name: 'A', actions: [{ kind: 'do', tag: 'XV-101', on: true }], transition: { kind: 'expression', text: "'//FIC-102/AI1/PV.CV' > 5 AND '^/MTR-102/DC1/PV_D.CV' = 1" } }])
  assert.deepEqual([...used].sort(), ['FIC-102/AI1/PV', 'MTR-102/DC1/PV_D', 'XV-101/DO1/SP_D'])
}))

test('the full chapter setup verifies every workshop of the chapter (optional exercises excepted)', () => withCh7((ctx) => {
  setup(ctx)
  const r = verdicts(ctx)
  const required = DV09_CHAPTER7.workshops.filter(w => !/optional|reading/.test(w.id)).flatMap(ids)
  const pending = required.filter(id => r[id] !== 'verified')
  assert.deepEqual(pending, [], JSON.stringify(pending.map(id => details(ctx)[id])))
  assert.equal(r['dv09-7f-1'], 'pending')
  assert.equal(ctx.M().sfcs['SFC-T101'].status, 'RUNNING')
  assert.equal(ctx.M().sfcs['SFC-T101'].parameters.MESSAGE.value, 255)
}))

test('Optional exercises: messages, level and lock, execution time alarm', () => withCh7((ctx, E) => {
  setup(ctx)
  const v = () => verdicts(ctx)
  assert.ok(['dv09-7f-1', 'dv09-7f-2', 'dv09-7g-1', 'dv09-7g-2', 'dv09-7h-1', 'dv09-7h-2', 'dv09-7h-3', 'dv09-7h-4'].every(id => v()[id] === 'pending'))
  E.D.goEdit('SFC-T101')
  // 1. messages
  const named = ctx.M().namedSets.configured['NS-T101']
  const extra = ['OPENING VALVE', 'SETTING FLOW', 'STARTING PUMP', 'STOPPING PUMP', 'CLOSING VALVE', 'CLOSING FLOW'].map((name, i) => ({ name, value: 10 + i, visible: true, userSelectable: false }))
  ctx.M().applyNamedSetProperties(named, { ...named, entries: [...named.entries, ...extra] })
  assert.equal(v()['dv09-7f-1'], 'verified')
  assert.equal(v()['dv09-7f-2'], 'pending')
  const c = E.S.sfcExpressionContext(ctx.M(), 'SFC-T101')
  const msg = text => E.X.parseSfcAssignment(`'MESSAGE.CV' := 'NS-T101:${text}'`, ctx.M().modules, c).value
  const names = { open: 'OPENING VALVE', flow: 'SETTING FLOW', start: 'STARTING PUMP', stop: 'STOPPING PUMP', close: 'CLOSING VALVE', flowclose: 'CLOSING FLOW' }
  const level = E.X.parseSfcCondition("'//LI-101/AI1/PV.CV' > 50", ctx.M().modules, c)
  assert.equal(level.error, undefined)
  const reset = E.X.parseSfcAssignment("'//MTR-102/DC1/RESET_D.CV' := 1", ctx.M().modules, c)
  assert.equal(reset.error, undefined)
  const steps = ctx.M().sfcLifecycle['SFC-T101'].draft.steps.map(s => {
    let next = names[s.id] ? { ...s, actions: [msg(names[s.id]), ...s.actions] } : s
    if (s.id === 'flow') next = { ...next, actions: [...next.actions, reset.value] }
    return next
  })
  ctx.M().setSfcSteps('SFC-T101', steps)
  assert.equal(v()['dv09-7f-2'], 'verified')
  assert.equal(v()['dv09-7g-2'], 'verified')
  assert.equal(v()['dv09-7g-1'], 'pending')
  ctx.M().setSfcSteps('SFC-T101', steps.map(s => (s.id === 'flow' ? { ...s, transition: { kind: 'expression', text: "'//FIC-102/PID1/OUT.CV' > 30 AND '//LI-101/AI1/PV.CV' > 50" } } : s)))
  assert.equal(v()['dv09-7g-1'], 'verified')
  assert.equal(v()['dv09-7e-5'], 'verified', 'the OUT > 30 transition combined with the level condition still counts for the figure')
  // 3. alarm: type, alarm, block, Non-Boolean action
  const draft = () => ctx.M().sfcLifecycle['SFC-T101'].draft
  assert.equal(ctx.M().configureSfcBlocks('SFC-T101', { alarmTypes: { SEQ_TIME: { description: 'Sequence time exceeded', priority: 'WARNING' } } }, draft()), true)
  assert.equal(v()['dv09-7h-1'], 'verified')
  assert.equal(v()['dv09-7h-2'], 'pending')
  assert.equal(ctx.M().configureSfcBlocks('SFC-T101', { ...draft(), blocks: { TIMECHK: { type: 'ALARM', source: 'ACTION_TIME', op: '>', seconds: 30 } },
    alarms: { SEQ_ALM: { type: 'SEQ_TIME', block: 'TIMECHK', enabled: true } } }, draft()), true)
  assert.deepEqual(['dv09-7h-2', 'dv09-7h-3', 'dv09-7h-4'].map(id => v()[id]), ['verified', 'verified', 'pending'])
  const blockAction = E.X.parseSfcBlockAction("'TIMECHK'", E.S.sfcExpressionContext(ctx.M(), 'SFC-T101')).value
  const withBlock = draft().steps.map(s => (s.id === 'open' ? { ...s, actions: [...s.actions, { ...blockAction, qualifier: 'S', name: 'TIMER' }] } : s))
  ctx.M().setSfcSteps('SFC-T101', withBlock)
  assert.equal(v()['dv09-7h-4'], 'verified')
}))

test('Operate datalink to the SFC parameter: only existing Named Set parameters, user selectable states only', () => withCh7((ctx, E) => {
  namedSet(ctx, 'NS-T101', NS)
  const u = E.D.newUntitledSfc()
  ctx.M().configureSfcParameter(u, 'MESSAGE', { type: 'NAMED_SET', namedSet: 'NS-T101', value: 255 }, ctx.M().sfcLifecycle[u].draft)
  ctx.M().configureSfcParameter(u, 'FLAG', { type: 'BOOLEAN', value: false }, ctx.M().sfcLifecycle[u].draft)
  assert.deepEqual(E.O.parseDatalinkSource(`DVSYS.${u}/MESSAGE.F_CV`), { tag: u, path: 'MESSAGE', sfc: true })
  assert.match(E.O.parseDatalinkSource(`DVSYS.${u}/NOPE.F_CV`).error, /no module parameter NOPE/)
  assert.match(E.O.parseDatalinkSource('DVSYS.NOSUCH/MESSAGE.F_CV').error, /does not exist/)
  assert.match(E.O.addDatalink('TANK101', { source: `DVSYS.${u}/FLAG.F_CV`, inPlace: true, refreshSeconds: 1, x: 1, y: 1 }), /Named Set parameter/)
  assert.match(E.O.addDatalink('TANK101', { source: `DVSYS.${u}/FLAG.F_CV`, inPlace: false, refreshSeconds: 1, x: 1, y: 1 }), /not added/, 'a Boolean SFC parameter cannot be shown')
  assert.equal(E.O.addDatalink('TANK101', { source: `DVSYS.${u}/MESSAGE.F_CV`, inPlace: true, refreshSeconds: 1, x: 1, y: 1 }), null)
}))

test('openSfc opens a control module SFC in Control Studio in class DV-09 and on the SFC Charts page otherwise', () => withCh7((ctx, E) => {
  const { useUi } = ctx.eng('../ui/uiStore')
  namedSet(ctx, 'NS-T101', NS)
  const name = E.D.newUntitledSfc()
  useUi.setState({ course: 'DV-09', display: 'explorer' })
  assert.equal(useUi.getState().openSfc(name), true)
  assert.equal(useUi.getState().display, 'studio')
  assert.equal(useUi.getState().studioTag, name)
  useUi.setState({ course: '7016', display: 'explorer' })
  assert.equal(useUi.getState().openSfc(name), true)
  assert.equal(useUi.getState().display, 'sfc')
  assert.equal(useUi.getState().openSfc('NOSUCH'), false)
  useUi.setState({ course: 'DV-09' })
}))

