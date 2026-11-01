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
const { useBatch, phaseCheckEnv, readModulePath, arbitrationState } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm } = require('../src/renderer/src/engine/emStore.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const graph = require('../src/renderer/src/engine/phaseGraph.ts')
const expr = require('../src/renderer/src/engine/phaseExpr.ts')
const arb = require('../src/renderer/src/engine/arbitration.ts')
const { checkCourse7016Ch8 } = require('../src/renderer/src/engine/course7016Ch8Checks.ts')
const prereq = require('./helpers/course7016-prereq.cjs')
const { DUMP, CHG_COLOR, buildPhase } = require('./helpers/course7016-ch8-spec.cjs')
const M = () => useStore.getState(), L = () => useLibrary.getState(), B = () => useBatch.getState(), E = () => useEm.getState()
const value = r => { assert.equal(r.ok, true, r.error); return r.value }
const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
const rt = (unit, phase) => B().active[`${unit}/${phase}`].rt
const level = n => readModulePath(`LI-${n}04/AI1/PV.CV`)
const ctx = () => ({ B, cfg, graph, value })

function fixture(fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installCourseProject(), true)
    prereq({ B, L, E, M, cfg, value, useStore, colorTanks: true })
    fn()
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}

/** The header workshop (slide 8-11) as the student does it. */
function headerWorkshop() {
  for (const t of ['BL_500_COLOR_IN', 'BL_600_COLOR_IN']) {
    const c = value(B().ensureArbitration(t))
    value(B().setArbitration(t, { ...c, participate: true }))
  }
  value(L().downloadController('CTLR1'))
  value(B().createResourceModule('PAINT_PRODUCTION', 'COLOR_HEADER', 'Color header'))
  const h = value(B().ensureArbitration('COLOR_HEADER'))
  value(B().setArbitration('COLOR_HEADER', { ...h, participate: true, equipmentId: 20, needed: ['BL_500_COLOR_IN', 'BL_600_COLOR_IN'] }))
  value(L().assignModule('COLOR_HEADER', 'CTLR1'))
  value(L().downloadModule('COLOR_HEADER'))
}

/** Steps 1-11 of the phase workshop through the stores. */
function phaseWorkshop() {
  buildPhase(DUMP, ctx())
  buildPhase(CHG_COLOR, ctx())
  value(B().assignPhaseClass('BLENDERS', 'CHG_COLOR'))
  value(B().assignPhaseClass('COLORTANKS', 'DUMP'))
  for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().setUnitPhaseProps(u, 'CHG_COLOR', { phaseType: 'Controller' }))
  for (const u of ['UM_COLOR_100', 'UM_COLOR_200', 'UM_COLOR_300']) value(B().setUnitPhaseProps(u, 'DUMP', { phaseType: 'Controller' }))
  value(L().downloadController('CTLR1'))
  for (const u of ['UM_BL_500', 'UM_BL_600', 'UM_COLOR_100', 'UM_COLOR_200', 'UM_COLOR_300']) value(B().downloadUnit(u, true))
  tick(1)
}

/** Starts one DUMP and one CHG_COLOR and plays the Batch Executive: clears every REQUEST in the order the phases post them. */
function pair(tank, blender, amount, trace = []) {
  const d = `UM_COLOR_${tank}00`, b = `UM_BL_${blender}00`
  for (const [u, p] of [[d, 'DUMP'], [b, 'CHG_COLOR']]) { value(B().loadPhase(u, p)) }
  value(B().setOnlineParam(b, 'CHG_COLOR', 'R_CLR_AMNT', amount))
  for (const [u, p] of [[d, 'DUMP'], [b, 'CHG_COLOR']]) value(B().command(u, p, 'START'))
  for (let i = 0; i < 1200; i++) {
    tick()
    const posted = Object.fromEntries([[d, 'DUMP'], [b, 'CHG_COLOR']].map(([u, p]) => [p, { u, p, code: Number(rt(u, p).params.REQUEST ?? 0) }]))
    for (const x of Object.values(posted)) {
      if (x.code === 0) continue
      const info = arb.decodeRequest(x.code)
      const partner = Object.values(posted).find(y => y !== x)
      // A message (52nn / 55nn) is only answered once the other phase has posted the matching one, like the Batch Executive does.
      if ((info.kind === 'send' || info.kind === 'wait') && !(partner && arb.decodeRequest(partner.code).id === info.id && arb.decodeRequest(partner.code).kind === (info.kind === 'send' ? 'wait' : 'send'))) continue
      trace.push(`${x.p}:${x.code}`)
      const r = B().setRequest(x.u, x.p, 0)
      if (!r.ok) trace.push(`${x.p}:blocked`)
    }
    if (rt(d, 'DUMP').state === 'COMPLETE' && rt(b, 'CHG_COLOR').state === 'COMPLETE') {
      trace.charged = rt(b, 'CHG_COLOR').params.RPT_AMNT_CHARGED
      for (const [u, p] of [[d, 'DUMP'], [b, 'CHG_COLOR']]) { value(B().command(u, p, 'RESET')); value(B().unloadPhase(u, p)) }
      return trace
    }
  }
  assert.fail(`${d}/${b} did not complete: ${JSON.stringify([rt(d, 'DUMP').state, rt(d, 'DUMP').params.STEP_INDEX, rt(b, 'CHG_COLOR').state])} ${trace.join(' ')}`)
}

test('Chapter 8: request codes are decoded and arbitration settings are validated', () => {
  assert.equal(arb.decodeRequest(4020).kind, 'acquire')
  assert.equal(arb.decodeRequest(4020).id, 20)
  assert.equal(arb.decodeRequest(4220).kind, 'release')
  assert.equal(arb.decodeRequest(5201).kind, 'send')
  assert.equal(arb.decodeRequest(5501).kind, 'wait')
  assert.equal(arb.decodeRequest(0).kind, 'none')
  assert.equal(arb.decodeRequest(1000).text, 'Download parameters')
  assert.equal(arb.decodeRequest(77).kind, 'other')
  assert.equal(arb.nextEquipmentId({ A: { equipmentId: 1 }, B: { equipmentId: 2 } }), 3)
  const configs = { X: { participate: true, equipmentId: 5, maxOwners: 1, needed: [] } }
  const ok = tag => tag === 'X' || tag === 'Y'
  assert.match(arb.arbitrationError('Y', { participate: true, equipmentId: 5, maxOwners: 1, needed: [] }, configs, ok), /already used by X/)
  assert.match(arb.arbitrationError('Y', { participate: true, equipmentId: 0, maxOwners: 1, needed: [] }, configs, ok), /1 to 99/)
  assert.match(arb.arbitrationError('Y', { participate: true, equipmentId: 6, maxOwners: 0, needed: [] }, configs, ok), /Maximum owners/)
  assert.match(arb.arbitrationError('Y', { participate: true, equipmentId: 6, maxOwners: 1, needed: ['Z'] }, configs, ok), /does not exist/)
  assert.equal(arb.arbitrationError('Y', { participate: true, equipmentId: 6, maxOwners: 1, needed: ['X'] }, configs, ok), null)
  assert.match(arb.arbitrationError('Y', { participate: false, equipmentId: 6, maxOwners: 1, needed: ['X'] }, configs, ok), /participates/)
})

test('Chapter 8: header workshop - arbitration is configured, downloaded and only then in effect', () => fixture(() => {
  const t = 'BL_500_COLOR_IN'
  const first = value(B().ensureArbitration(t))
  assert.equal(first.participate, false)
  assert.equal(first.maxOwners, 1)
  const second = value(B().ensureArbitration('BL_600_COLOR_IN'))
  assert.notEqual(first.equipmentId, second.equipmentId, 'every module gets its own default Equipment ID')
  assert.equal(arbitrationState(t), 'none')
  value(B().setArbitration(t, { ...first, participate: true }))
  assert.equal(arbitrationState(t), 'not-downloaded')
  assert.match(B().setArbitration('BL_600_COLOR_IN', { ...second, participate: true, equipmentId: first.equipmentId }).error, /already used by BL_500_COLOR_IN/)
  assert.match(B().setArbitration('NOPE', first).error, /does not exist/)
  value(L().downloadController('CTLR1'))
  assert.equal(arbitrationState(t), 'current')
  value(B().setArbitration(t, { ...first, participate: true, maxOwners: 2 }))
  assert.equal(arbitrationState(t), 'pending')
  // COLOR_HEADER: a new module in PAINT_PRODUCTION that needs the two inlets
  assert.match(B().createResourceModule('NOWHERE', 'COLOR_HEADER', '').error, /does not exist/)
  assert.match(B().createResourceModule('PAINT_PRODUCTION', 'XV-101', '').error, /already used|already exists/)
  value(B().createResourceModule('PAINT_PRODUCTION', 'COLOR_HEADER', 'Color header'))
  assert.equal(B().cellMembers.COLOR_HEADER, 'PAINT_PRODUCTION')
  const h = value(B().ensureArbitration('COLOR_HEADER'))
  assert.match(B().setArbitration('COLOR_HEADER', { ...h, participate: true, equipmentId: 20, needed: ['BL_600_COLOR_IN'] }).error, /does not participate/)
  value(B().setArbitration('BL_600_COLOR_IN', { ...second, participate: true }))
  value(B().setArbitration('COLOR_HEADER', { ...h, participate: true, equipmentId: 20, needed: ['BL_500_COLOR_IN', 'BL_600_COLOR_IN'] }))
  assert.match(L().downloadModule('COLOR_HEADER').error, /not assigned to a controller/)
  value(L().assignModule('COLOR_HEADER', 'CTLR1'))
  value(L().downloadModule('COLOR_HEADER'))
  assert.equal(arbitrationState('COLOR_HEADER'), 'current')
  assert.equal(B().arbDeployed.COLOR_HEADER.equipmentId, 20)
}))

test('Chapter 8: DUMP and CHG_COLOR are built, validated, downloaded and run together (big and small charge)', () => fixture(() => {
  headerWorkshop()
  phaseWorkshop()
  for (const name of ['DUMP', 'CHG_COLOR']) {
    const pc = B().phaseClasses[name]
    const check = phaseCheckEnv(name, undefined, 'RUN_LOGIC')
    for (const step of pc.logic.RUN_LOGIC.steps) for (const a of step.actions) {
      assert.deepEqual(expr.checkExpression(a.expression, 'action', check), [], a.expression)
      if (a.delayExpression) assert.deepEqual(expr.checkExpression(a.delayExpression, 'condition', check), [], a.delayExpression)
    }
    for (const r of graph.phaseEdges(pc.logic.RUN_LOGIC)) assert.deepEqual(expr.checkExpression(r.condition, 'condition', check), [], r.condition)
  }
  assert.equal(graph.phaseEdges(B().phaseClasses.CHG_COLOR.logic.RUN_LOGIC).filter(e => e.from === 3).length, 2, 'CAPT_INIT_LVL has the BIG and SMALL legs')
  L().process.tk100 = 300; L().process.tk200 = 300
  tick(1)
  // BIG: 70 gal (> 30) from tank 100 into BLENDER 500, bulk then dribble
  const start500 = level(5)
  const trace = pair(1, 5, 70)
  assert.deepEqual(trace.filter(x => x.startsWith('CHG_COLOR')).map(x => x.split(':')[1]), ['4020', '5201', '5502', '5203', '4220'])
  assert.deepEqual(trace.filter(x => x.startsWith('DUMP')).map(x => x.split(':')[1]), ['5501', '5202', '5503'])
  assert.ok(!trace.includes('CHG_COLOR:blocked'))
  const charged = trace.charged
  assert.ok(charged >= 69 && charged <= 76, `charged ${charged}`)
  assert.ok(Math.abs(level(5) - start500 - charged) < 0.5)
  assert.equal(readModulePath('XV-102/PV.CV'), 0, 'tank outlet closed again')
  assert.deepEqual(arbOwnersFor(20), [], 'COLOR_HEADER released')
  // SMALL: 20 gal (<= 30) takes the short branch (no bulk step) into BLENDER 600
  const start600 = level(6)
  const t2 = pair(2, 6, 20)
  const small = t2.charged
  assert.ok(small >= 19 && small <= 24, `charged ${small}`)
  assert.ok(Math.abs(level(6) - start600 - small) < 0.5)
  assert.deepEqual(t2.filter(x => x.startsWith('CHG_COLOR')).map(x => x.split(':')[1]), ['4020', '5201', '5502', '5203', '4220'])
  assert.ok(M().eventLog.some(e => e.tag === 'UM_BL_600/CHG_COLOR' && e.description.startsWith('Released COLOR_HEADER')))
}))

function arbOwnersFor(id) { return require('../src/renderer/src/engine/batchStore.ts').currentOwners()[String(id)] ?? [] }

test('Chapter 8: the header is shared - a second phase waits for it, and an unknown Equipment ID is refused', () => fixture(() => {
  headerWorkshop()
  phaseWorkshop()
  L().process.tk100 = 300; L().process.tk200 = 300
  tick(1)
  for (const u of ['UM_BL_500', 'UM_BL_600']) { value(B().loadPhase(u, 'CHG_COLOR')); value(B().command(u, 'CHG_COLOR', 'START')) }
  tick(0.5)
  assert.equal(rt('UM_BL_500', 'CHG_COLOR').params.REQUEST, 4020)
  assert.equal(rt('UM_BL_600', 'CHG_COLOR').params.REQUEST, 4020)
  value(B().setRequest('UM_BL_500', 'CHG_COLOR', 0))
  const blocked = B().setRequest('UM_BL_600', 'CHG_COLOR', 0)
  assert.equal(blocked.ok, false)
  assert.match(blocked.error, /COLOR_HEADER \(Equipment ID 20\) is owned by UM_BL_500\/CHG_COLOR; its maximum owners is 1/)
  assert.equal(rt('UM_BL_600', 'CHG_COLOR').params.REQUEST, 4020, 'the request stays')
  assert.match(B().setRequest('UM_BL_500', 'CHG_COLOR', 5).error, /Only 0/)
  // Reset releases what the aborted phase held, so the other blender can go ahead
  value(B().command('UM_BL_500', 'CHG_COLOR', 'ABORT'))
  tick(1)
  value(B().command('UM_BL_500', 'CHG_COLOR', 'RESET'))
  value(B().setRequest('UM_BL_600', 'CHG_COLOR', 0))
  assert.deepEqual(arbOwnersFor(20), ['UM_BL_600/CHG_COLOR'])
}))

test('Chapter 8: a phase request for an Equipment ID that no downloaded module has stays pending with an explanation', () => fixture(() => {
  phaseWorkshop()
  value(B().loadPhase('UM_BL_500', 'CHG_COLOR'))
  value(B().command('UM_BL_500', 'CHG_COLOR', 'START'))
  tick(0.5)
  assert.equal(rt('UM_BL_500', 'CHG_COLOR').params.REQUEST, 4020)
  const r = B().setRequest('UM_BL_500', 'CHG_COLOR', 0)
  assert.match(r.error, /No downloaded module has Equipment ID 20/)
  assert.equal(rt('UM_BL_500', 'CHG_COLOR').params.REQUEST, 4020)
  value(B().toggleOwner('UM_BL_500', 'CHG_COLOR'))
  assert.match(B().setRequest('UM_BL_500', 'CHG_COLOR', 0).error, /owned by DeltaV Batch/)
}))

test('Chapter 8: the workshop checks verify each step from the configuration and the run history', () => fixture(() => {
  const state = () => ({ phaseClasses: B().phaseClasses, phaseDrafts: B().phaseDrafts, unitClasses: B().unitClasses, units: B().units, deployedUnits: B().deployedUnits,
    cellMembers: B().cellMembers, arbitration: B().arbitration, arbDeployed: B().arbDeployed })
  const pending = () => checkCourse7016Ch8(state(), M().eventLog).filter(c => c.verdict !== 'verified').map(c => c.id)
  assert.equal(pending().length, 19, 'nothing verified before the work is done')
  headerWorkshop()
  phaseWorkshop()
  assert.deepEqual(pending(), ['7016-8v-1', '7016-8v-2', '7016-8v-3', '7016-8v-4', '7016-8v-5'], 'configuration steps verified, verification run not yet done')
  L().process.tk100 = 300; L().process.tk200 = 300; L().process.tk300 = 300
  tick(1)
  pair(1, 5, 70)
  pair(2, 6, 20)
  assert.deepEqual(pending(), ['7016-8v-5'], 'tank 300 has not dumped yet')
  pair(3, 5, 40)
  assert.deepEqual(pending(), [])
}))

