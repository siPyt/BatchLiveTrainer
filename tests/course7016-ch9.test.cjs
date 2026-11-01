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
const { useBatch, phaseCheckEnv, readModulePath, arbitrationState, currentOwners } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm } = require('../src/renderer/src/engine/emStore.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const expr = require('../src/renderer/src/engine/phaseExpr.ts')
const { PHASE_IMPORT_FILES, CHG_BASE_CONDITIONS, CHG_BASE_MESSAGES, CHG_BASE_NEW_FAILURES } = require('../src/renderer/src/engine/course7016Imports.ts')
const { checkCourse7016Ch9 } = require('../src/renderer/src/engine/course7016Ch9Checks.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const rt = unit => B().active[`${unit}/CHG_BASE`].rt
const level = n => readModulePath(`LI-${n}04/AI1/PV.CV`)
const U = { 5: 'UM_BL_500', 6: 'UM_BL_600' }

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
    addFailures([['AGITATOR_RUNNING', 9], ['PUMP_STOPPED', 10], ['PRODUCT_VLV_CLOSED', 11]])
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}

function addFailures(list) {
  const ns = M().namedSets
  useStore.setState({ namedSets: { ...ns, configured: { ...ns.configured, phase_failures: { ...ns.configured.phase_failures,
    entries: [...ns.configured.phase_failures.entries, ...list.map(([name, v]) => ({ name, value: v, visible: true, userSelectable: true }))] } } } })
  assert.equal(M().downloadChangedNamedSets({ kind: 'workstation' }), true)
  assert.equal(M().downloadChangedNamedSets({ kind: 'controller', tag: 'CTLR1' }), true)
}

/** Workshop "BASE_HEADER Resource" (slide 9-4). */
function headerWorkshop() {
  for (const t of ['XV-501', 'XV-601']) {
    const c = value(B().ensureArbitration(t))
    value(B().setArbitration(t, { ...c, participate: true }))
  }
  value(L().downloadController('CTLR1'))
  value(B().createResourceModule('PAINT_PRODUCTION', 'BASE_HEADER', 'Base header'))
  const h = value(B().ensureArbitration('BASE_HEADER'))
  value(B().setArbitration('BASE_HEADER', { ...h, participate: true, equipmentId: 30, needed: ['XV-501', 'XV-601'] }))
  value(L().assignModule('BASE_HEADER', 'CTLR1'))
  value(L().downloadModule('BASE_HEADER'))
}

/** Workshop "Shared Control Module Class" (slides 9-5 .. 9-8). */
function sharedClassWorkshop() {
  value(L().createBlankClass('General', 'HEADER'))
  assert.equal(value(B().addModuleBlock('BLENDERS', 'HEADER', 'Shared', true)), 'HEADER_1')
  value(B().renameModuleBlock('BLENDERS', 'HEADER_1', 'BASE_HDR'))
  for (const u of Object.values(U)) value(B().bindBlock(u, 'BASE_HDR', 'BASE_HEADER'))
}

/** Workshop "CHG_BASE Phase" (slides 9-9, 9-10), Steps 1-5. */
function phaseWorkshop() {
  value(B().importPhaseClass('CHG_BASE.fhx'))
  addFailures(CHG_BASE_NEW_FAILURES.map(([n, v]) => [n, v]))
  value(B().assignPhaseClass('BLENDERS', 'CHG_BASE'))
  for (const u of Object.values(U)) value(B().setUnitPhaseProps(u, 'CHG_BASE', { phaseType: 'Controller' }))
  value(L().downloadController('CTLR1'))
  for (const u of Object.values(U)) value(B().downloadUnit(u, true))
  tick(1)
}

function allWorkshops() { headerWorkshop(); sharedClassWorkshop(); phaseWorkshop() }

function until(unit, predicate, max = 120) {
  for (let i = 0; i < max * 10 && !predicate(rt(unit)); i++) tick()
  assert.ok(predicate(rt(unit)), `${unit}: ${JSON.stringify({ state: rt(unit).state, step: rt(unit).params.STEP_INDEX, req: rt(unit).params.REQUEST, fail: rt(unit).failIndex, msg: rt(unit).message })}\n${M().eventLog.filter(e => e.tag === `${unit}/CHG_BASE`).slice(-14).map(e => e.description).join('\n')}`)
}

/** Plays the Batch Executive for one phase: answers the header acquire and release requests. */
function run(unit, amount, rate, until = r => r.state === 'COMPLETE', seen = []) {
  value(B().loadPhase(unit, 'CHG_BASE'))
  value(B().setOnlineParam(unit, 'CHG_BASE', 'R_BASE_AMNT', amount))
  if (rate !== undefined) value(B().setOnlineParam(unit, 'CHG_BASE', 'R_BASE_RATE', rate))
  value(B().command(unit, 'CHG_BASE', 'START'))
  for (let i = 0; i < 6000; i++) {
    tick()
    const code = Number(rt(unit).params.REQUEST ?? 0)
    if (code) { seen.push(code); value(B().setRequest(unit, 'CHG_BASE', 0)) }
    if (until(rt(unit))) return seen
  }
  assert.fail(`${unit} did not finish: ${JSON.stringify([rt(unit).state, rt(unit).params.STEP_INDEX, rt(unit).params.REQUEST])}`)
}

test('Chapter 9: CHG_BASE is imported with the parameters, failure conditions and messages of slide 9-9', () => fixture(() => {
  assert.ok(PHASE_IMPORT_FILES.map(f => f.file).includes('CHG_BASE.fhx'))
  assert.equal(value(B().importPhaseClass('CHG_BASE.fhx')), 'CHG_BASE')
  assert.match(B().importPhaseClass('CHG_BASE.fhx').error, /already exists/)
  const pc = B().phaseClasses.CHG_BASE
  assert.equal(pc.category, 'BlenderClasses')
  const p = pc.params
  assert.deepEqual([p.R_BASE_AMNT.type, p.R_BASE_AMNT.direction, p.R_BASE_AMNT.low, p.R_BASE_AMNT.high, p.R_BASE_AMNT.units], ['Real', 'Input', 0, 1000, 'gal'])
  assert.deepEqual([p.R_BASE_RATE.type, p.R_BASE_RATE.direction, p.R_BASE_RATE.low, p.R_BASE_RATE.high, p.R_BASE_RATE.units], ['Real', 'Input', 0, 100, 'gpm'])
  assert.deepEqual([p.RPT_FEED_AMNT.type, p.RPT_FEED_AMNT.direction, p.RPT_FEED_AMNT.units], ['Real', 'Report', 'gal'])
  assert.equal(CHG_BASE_CONDITIONS.length, 8)
  assert.deepEqual(CHG_BASE_NEW_FAILURES.map(([, v]) => v), [12, 13, 14, 15])
  assert.deepEqual([...CHG_BASE_MESSAGES], [5, 6, 8, 9, 12, 13, 14, 15])
  value(B().assignPhaseClass('BLENDERS', 'CHG_BASE'))
  for (const c of cfg.COMPOSITES) {
    const check = phaseCheckEnv('CHG_BASE', undefined, c)
    for (const step of pc.logic[c].steps) for (const a of step.actions) {
      assert.deepEqual(expr.checkExpression(a.expression, 'action', check), [], a.expression)
      for (const e of [a.confirm, a.delayExpression].filter(Boolean)) assert.deepEqual(expr.checkExpression(e, 'condition', check), [], e)
    }
    for (const t of pc.logic[c].transitions) assert.deepEqual(expr.checkExpression(t.condition, 'condition', check), [], t.condition)
    for (const r of pc.logic[c].routes ?? []) assert.deepEqual(expr.checkExpression(r.condition, 'condition', check), [], r.condition)
  }
  const fm = phaseCheckEnv('CHG_BASE', undefined, 'FAIL_MONITOR')
  for (const b of Object.values(pc.logic.FAIL_MONITOR.blocks)) if (b.type === 'CND') assert.deepEqual(expr.checkExpression(b.expression, 'condition', fm), [], b.expression)
}))

test('Chapter 9: header workshop - XV-501 / XV-601 take part in arbitration and BASE_HEADER (ID 30) needs both', () => fixture(() => {
  headerWorkshop()
  assert.equal(arbitrationState('BASE_HEADER'), 'current')
  assert.equal(arbitrationState('XV-501'), 'current')
  assert.deepEqual(B().arbitration.BASE_HEADER.needed, ['XV-501', 'XV-601'])
  assert.equal(B().arbitration.BASE_HEADER.equipmentId, 30)
  assert.notEqual(B().arbitration['XV-501'].equipmentId, B().arbitration['XV-601'].equipmentId)
}))

test('Chapter 9: the shared HEADER control module class, its module block BASE_HDR and the bindings', () => fixture(() => {
  assert.match(L().createBlankClass('Nope', 'HEADER').error, /does not exist/)
  assert.match(L().createBlankClass('General', 'bad name').error, /./)
  value(L().createBlankClass('General', 'HEADER'))
  assert.match(L().createBlankClass('General', 'HEADER').error, /already used/)
  assert.equal(L().classes.HEADER.category, 'General')
  assert.match(L().createInstance('HEADER', 'ED_CENTER_BATCH').error, /no function blocks/)
  assert.match(B().addModuleBlock('BLENDERS', 'HEADER', 'Private', true).error, /Shared/)
  assert.equal(value(B().addModuleBlock('BLENDERS', 'HEADER', 'Shared', true)), 'HEADER_1')
  value(B().renameModuleBlock('BLENDERS', 'HEADER_1', 'BASE_HDR'))
  const blk = B().unitClasses.BLENDERS.modules.BASE_HDR
  assert.deepEqual([blk.className, blk.ownership, blk.allowVariant, blk.kind], ['HEADER', 'Shared', true, 'cm'])
  assert.equal(B().units.UM_BL_500.blocks.BASE_HDR, null, 'unbound until Step 5')
  headerWorkshop()
  assert.match(B().bindBlock('UM_BL_500', 'BASE_HDR', 'NOPE').error, /does not exist/)
  for (const u of Object.values(U)) value(B().bindBlock(u, 'BASE_HDR', 'BASE_HEADER'))
  assert.equal(B().units.UM_BL_600.blocks.BASE_HDR, 'BASE_HEADER')
  assert.equal(B().units.UM_BL_600.aliases.BASE_HDR.path, 'BASE_HEADER')
}))

test('Chapter 9: a variant module cannot be bound when the block does not allow variants', () => fixture(() => {
  value(L().createBlankClass('General', 'HEADER'))
  value(B().addModuleBlock('BLENDERS', 'HEADER', 'Shared', false))
  headerWorkshop()
  assert.match(B().bindBlock('UM_BL_500', 'HEADER_1', 'BASE_HEADER').error, /variant/)
}))

test('Chapter 9: CHG_BASE charges each blender with the requested amount, acquiring and releasing BASE_HEADER', () => fixture(() => {
  allWorkshops()
  for (const [n, amount, rate] of [[5, 100, 90], [6, 50, 60]]) {
    const unit = U[n]
    const start = level(n)
    const baseStart = readModulePath('LEVEL-401/401_LEV')
    const seen = run(unit, amount, rate)
    const charged = level(n) - start
    assert.deepEqual(seen, [4030, 4230], 'acquire then release BASE_HEADER')
    assert.ok(Math.abs(charged - amount) < 3, `${unit} charged ${charged} of ${amount}`)
    assert.ok(Math.abs(rt(unit).params.RPT_FEED_AMNT - charged) < 0.5, `RPT_FEED_AMNT ${rt(unit).params.RPT_FEED_AMNT}`)
    assert.ok(Math.abs((baseStart - readModulePath('LEVEL-401/401_LEV')) - charged) < 0.5, 'taken from BASE 400')
    assert.equal(rt(unit).params.STEP_INDEX, 0)
    assert.equal(readModulePath('MTR-403/DC1/PV_D.CV'), 0, 'MTR-403 stopped')
    assert.equal(readModulePath('XV-501/PV.CV') + readModulePath('XV-601/PV.CV'), 0, 'base valves closed')
    assert.deepEqual(currentOwners()[30] ?? [], [], 'BASE_HEADER released')
    value(B().command(unit, 'CHG_BASE', 'RESET'))
    value(B().unloadPhase(unit, 'CHG_BASE'))
  }
}))

test('Chapter 9: the charge stops close to the target at every rate', () => fixture(() => {
  allWorkshops()
  for (const rate of [30, 60, 90, 100]) {
    const start = level(5)
    run(U[5], 40, rate)
    const charged = level(5) - start
    assert.ok(charged > 40 - 2.5 && charged < 40 + 2.5, `rate ${rate}: charged ${charged}`)
    value(B().command(U[5], 'CHG_BASE', 'RESET'))
    value(B().unloadPhase(U[5], 'CHG_BASE'))
  }
}))

test('Chapter 9: both blenders share BASE_HEADER - the second charge waits until the first releases it', () => fixture(() => {
  allWorkshops()
  for (const n of [5, 6]) { value(B().loadPhase(U[n], 'CHG_BASE')); value(B().setOnlineParam(U[n], 'CHG_BASE', 'R_BASE_AMNT', 30)); value(B().command(U[n], 'CHG_BASE', 'START')) }
  tick(2)
  assert.equal(rt(U[5]).params.REQUEST, 4030)
  assert.equal(rt(U[6]).params.REQUEST, 4030)
  value(B().setRequest(U[5], 'CHG_BASE', 0))
  const blocked = B().setRequest(U[6], 'CHG_BASE', 0)
  assert.equal(blocked.ok, false)
  assert.match(blocked.error, /owned by|BASE_HEADER|UM_BL_500/)
  assert.equal(rt(U[6]).params.REQUEST, 4030, 'the request stays until the header is free')
  until(U[5], r => r.params.REQUEST === 4230)
  value(B().setRequest(U[5], 'CHG_BASE', 0))
  value(B().setRequest(U[6], 'CHG_BASE', 0))
  const start = level(6)
  for (let i = 0; i < 3000 && rt(U[6]).state !== 'COMPLETE'; i++) {
    tick()
    if (Number(rt(U[6]).params.REQUEST ?? 0)) value(B().setRequest(U[6], 'CHG_BASE', 0))
  }
  assert.equal(rt(U[6]).state, 'COMPLETE', `${JSON.stringify([rt(U[6]).state, rt(U[6]).params.STEP_INDEX, rt(U[6]).params.REQUEST, rt(U[6]).failIndex, level(6)])} ${M().eventLog.filter(e => e.tag === 'UM_BL_600/CHG_BASE').slice(-8).map(e => e.description).join(' | ')}`)
  assert.ok(Math.abs(level(6) - start - 30) < 3)
}))

test('Chapter 9: each CHG_BASE failure is reported with its message number, makes the blender safe and recovers', () => fixture(() => {
  allWorkshops()
  const unit = U[5]
  const a = B().units[unit].aliases
  const em = E().instances
  const trips = [
    ['PRODUCT_VLV_OPEN', 5, () => { const t = em[a.BLNDR_OUTLET.path].children.PRODUCT_VLV; value(B().setDeviceMode(t, 'AUTO')); M().openValve(t) }],
    ['WASTE_VLV_OPEN', 6, () => { const t = em[a.BLNDR_OUTLET.path].children.WASTE_VLV; value(B().setDeviceMode(t, 'AUTO')); M().openValve(t) }],
    ['COLOR_VLV_OPEN', 8, () => { const t = em[a.BLNDR_COLOR.path].children.COLOR_IN_VLV; value(B().setDeviceMode(t, 'AUTO')); M().openValve(t) }],
    ['AGITATOR_RUNNING', 9, () => { const t = a.AGITATOR.path; value(B().setDeviceMode(t, 'AUTO')); M().startMotor(t) }],
    ['MTR_403_STOPPED', 12, () => { value(B().setDeviceMode('MTR-403', 'AUTO')); M().stopMotor('MTR-403') }],
    ['FIC_404_CLOSED', 13, () => { M().setMode('FIC-404', 'MAN'); M().setOutput('FIC-404', 0) }],
    ['BASE_VLV_CLOSED', 14, () => { const t = a.BASE_IN_VLV.path; value(B().setDeviceMode(t, 'AUTO')); M().closeValve(t) }],
    ['PUMP_RUNNING', 15, () => { const t = a.OUT_PUMP.path; value(B().setDeviceMode(t, 'AUTO')); M().startMotor(t) }]
  ]
  value(B().loadPhase(unit, 'CHG_BASE'))
  value(B().setOnlineParam(unit, 'CHG_BASE', 'R_BASE_AMNT', 600))
  value(B().setOnlineParam(unit, 'CHG_BASE', 'R_BASE_RATE', 100))
  value(B().command(unit, 'CHG_BASE', 'START'))
  for (const [name, index, trip] of trips) {
    for (let i = 0; i < 1500 && !(rt(unit).state === 'RUNNING' && rt(unit).params.STEP_INDEX === 6); i++) {
      tick()
      if (Number(rt(unit).params.REQUEST ?? 0)) value(B().setRequest(unit, 'CHG_BASE', 0))
    }
    assert.equal(rt(unit).params.STEP_INDEX, 6, `${name}: charging`)
    tick(1)
    trip()
    until(unit, r => r.state === 'HELD')
    assert.equal(rt(unit).failIndex, index, name)
    assert.equal(rt(unit).message, name)
    assert.equal(readModulePath('MTR-403/DC1/PV_D.CV'), 0, `MTR-403 stopped after ${name}`)
    assert.equal(readModulePath('XV-501/PV.CV'), 0, `XV-501 closed after ${name}`)
    assert.equal(B().command(unit, 'CHG_BASE', 'RESTART').ok, false, 'Restart is refused until the failure is cleared')
    // Put the plant back before clearing, as the operator would.
    value(B().setDeviceMode(a.OUT_PUMP.path, 'AUTO')); M().stopMotor(a.OUT_PUMP.path)
    value(B().setDeviceMode(a.AGITATOR.path, 'AUTO')); M().stopMotor(a.AGITATOR.path)
    for (const t of [em[a.BLNDR_OUTLET.path].children.PRODUCT_VLV, em[a.BLNDR_OUTLET.path].children.WASTE_VLV, em[a.BLNDR_COLOR.path].children.COLOR_IN_VLV]) { value(B().setDeviceMode(t, 'AUTO')); M().closeValve(t) }
    value(B().setDeviceMode(a.BASE_IN_VLV.path, 'AUTO'))
    value(B().setDeviceMode('MTR-403', 'AUTO'))
    M().setMode('FIC-404', 'AUTO')
    tick(3)
    value(B().command(unit, 'CHG_BASE', 'CLEAR_FAILURES'))
    value(B().command(unit, 'CHG_BASE', 'RESTART'))
    until(unit, r => r.state === 'RUNNING')
    assert.equal(rt(unit).failIndex, 0)
  }
}))

test('Chapter 9: Hold stops the charge and Restart resumes it; Stop leaves the blender safe', () => fixture(() => {
  allWorkshops()
  const unit = U[5]
  value(B().loadPhase(unit, 'CHG_BASE'))
  value(B().setOnlineParam(unit, 'CHG_BASE', 'R_BASE_AMNT', 300))
  value(B().command(unit, 'CHG_BASE', 'START'))
  for (let i = 0; i < 1500 && rt(unit).params.STEP_INDEX !== 6; i++) { tick(); if (Number(rt(unit).params.REQUEST ?? 0)) value(B().setRequest(unit, 'CHG_BASE', 0)) }
  tick(3)
  value(B().command(unit, 'CHG_BASE', 'HOLD'))
  until(unit, r => r.state === 'HELD')
  const held = level(5)
  tick(5)
  assert.ok(Math.abs(level(5) - held) < 0.5, 'no charge while held')
  assert.equal(readModulePath('MTR-403/DC1/PV_D.CV'), 0)
  value(B().command(unit, 'CHG_BASE', 'RESTART'))
  until(unit, r => r.state === 'RUNNING')
  tick(5)
  assert.ok(level(5) > held + 1, 'charging again')
  value(B().command(unit, 'CHG_BASE', 'STOP'))
  until(unit, r => r.state === 'STOPPED')
  assert.equal(readModulePath('MTR-403/DC1/PV_D.CV'), 0)
  assert.equal(readModulePath('XV-501/PV.CV'), 0)
  assert.deepEqual(currentOwners()[30] ?? [], [], 'stopping releases BASE_HEADER')
}))

test('Chapter 9: the workshop checks verify each step from the configuration and the run history', () => fixture(() => {
  const state = () => ({ phaseClasses: B().phaseClasses, phaseDrafts: B().phaseDrafts, unitClasses: B().unitClasses, units: B().units, deployedUnits: B().deployedUnits,
    arbitration: B().arbitration, arbDeployed: B().arbDeployed, processCells: B().processCells, cellMembers: B().cellMembers })
  const checks = () => checkCourse7016Ch9(state(), M().eventLog, M().namedSets, L().classes)
  const pending = () => checks().filter(c => c.verdict !== 'verified').map(c => c.id)
  const total = checks().length
  assert.equal(pending().length, total, 'nothing verified before the work is done')
  headerWorkshop()
  assert.ok(pending().length < total)
  sharedClassWorkshop()
  phaseWorkshop()
  const left = pending()
  assert.ok(left.every(id => id.startsWith('7016-9v-')), `only the run steps are left: ${left}`)
  for (const n of [5, 6]) { run(U[n], 40, 90); value(B().command(U[n], 'CHG_BASE', 'RESET')); value(B().unloadPhase(U[n], 'CHG_BASE')) }
  assert.deepEqual(pending(), [])
}))
