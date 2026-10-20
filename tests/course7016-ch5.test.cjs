const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText, filename)
  }
}
const { useStore } = require('../src/renderer/src/engine/store.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const { useLibrary } = require('../src/renderer/src/engine/libraryStore.ts')
const { useBatch } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm, emCheckEnv, stateName } = require('../src/renderer/src/engine/emStore.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const expr = require('../src/renderer/src/engine/phaseExpr.ts')
const ch5 = require('../src/renderer/src/engine/course7016Ch5Checks.ts')
const { COURSE } = require('../src/renderer/src/engine/workshops.ts')

const L = () => useLibrary.getState()
const M = () => useStore.getState()
const B = () => useBatch.getState()
const E = () => useEm.getState()
const value = (r) => { assert.equal(r.ok, true, r.error); return r.value }
const run = (n = 5) => { for (let i = 0; i < n; i++) M().tick(0.1) }

function fixture(fn) {
  const before = { store: M(), security: useSecurity.getState(), library: L(), batch: B(), em: E(), system: useSystem.getState(), window: global.window }
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { alert: () => {}, localStorage: global.localStorage, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, lastDenied: null, workstation: null })
    assert.equal(L().installCourseProject(), true)
    fn()
  } finally {
    useStore.setState(before.store, true)
    useSecurity.setState(before.security, true)
    useLibrary.setState(before.library, true)
    useBatch.setState(before.batch, true)
    useEm.setState(before.em, true)
    useSystem.setState(before.system, true)
    delete global.localStorage
    if (before.window === undefined) delete global.window
    else global.window = before.window
  }
}

function ch5State() {
  const e = E(), b = B(), l = L()
  return { emCategories: e.categories, emClasses: e.classes, emDrafts: e.drafts, emInstances: e.instances, emDeployed: e.deployed,
    batchCategories: b.categories, unitClasses: b.unitClasses, units: b.units, contained: b.contained, assignments: l.assignments, modules: M().modules, transfers: l.transfers, sims: l.sims, runSince: ch5.blendersDownloadedAt(e.deployed) }
}
const pending = (checks) => checks.filter(c => c.verdict !== 'verified').map(c => `${c.id}: ${c.detail}`)

function sequence(rows) {
  let sfc = cfg.insertSequence(cfg.defaultSfc(), 0, rows.length - 1)
  return {
    steps: sfc.steps.map((s, i) => ({ ...s, name: rows[i][0], actions: rows[i][1].map((e, j) => ({ name: `A${j + 1}`, description: '', type: 'Assignment', qualifier: 'N', time: 0, expression: e })) })),
    transitions: sfc.transitions.map((t, i) => ({ ...t, name: rows[i][2], condition: rows[i][3] }))
  }
}

/** Chapter 1: LEVEL_INDICATOR with LI-504 / LI-604 for the blender TANK_LEVEL alias. */
function levelIndicators() {
  value(L().renameCategory(value(L().newCategory(null)), 'AnalogInput'))
  value(L().renameClass(value(L().createClassFromTemplate('ANALOG', 'AnalogInput')), 'LEVEL_INDICATOR'))
  value(L().editDraft('LEVEL_INDICATOR', d => {
    d.blocks.AI1.params.OUT_SCALE.value = { hi: 1000, lo: 0, units: 'gal', decimals: 1 }
    d.blocks.AI1.params.L_TYPE.value = 'Direct'
    d.blocks.AI1.params.SIMULATE.value = { enabled: true, value: 0 }
    d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: '', special: { item: 'INPUT', x: 40, y: 90 } }
  }))
  value(L().connect('LEVEL_INDICATOR', 'LEVEL_IN', 'AI1/SIMULATE_IN'))
  value(L().saveClass('LEVEL_INDICATOR'))
  for (const n of [5, 6]) {
    value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), `LI-${n}04`))
    value(L().setOverride(`LI-${n}04`, 'LEVEL_IN', `LEV${n}00-SIM/${n}00_LEV`))
  }
}

const VLV = (p) => `'^/COLOR_IN_VLV/${p}'`
const COMMANDS = {
  1: [['CLOSE_VLV', [`${VLV('MODE.TARGET')} := CAS;`, `${VLV('CAS_SP.CV')} := 'vlvnc2stage-sp:CLOSE';`], 'VLV_CLOSED', `${VLV('PV.CV')} = 'vlvnc2stage-pv:CLOSED'`]],
  2: [['DRIBBLE_SP', [`${VLV('MODE.TARGET')} := CAS;`, `${VLV('CAS_SP.CV')} := 'vlvnc2stage-sp:DRIBBLE';`], 'VLV_DRIBBLE', `${VLV('PV.CV')} = 'vlvnc2stage-pv:DRIBBLE'`]],
  3: [['BULK_SP', [`${VLV('MODE.TARGET')} := CAS;`, `${VLV('CAS_SP.CV')} := 'vlvnc2stage-sp:BULK';`], 'VLV_BULK', `${VLV('PV.CV')} = 'vlvnc2stage-pv:BULK'`]],
  4: [['AUTO_MODE', [`${VLV('MODE.TARGET')} := AUTO;`], 'ACTUAL_AUTO', `${VLV('MODE.ACTUAL')} = AUTO`]]
}
const ITEMS = [
  { name: 'PRODUCT_MODE', write: 'PRODUCT_VLV/MODE.TARGET', readback: 'PRODUCT_VLV/MODE.ACTUAL' },
  { name: 'WASTE_MODE', write: 'WASTE_VLV/MODE.TARGET', readback: 'WASTE_VLV/MODE.ACTUAL' },
  { name: 'PRODUCT_SP', write: 'PRODUCT_VLV/CAS_SP.CV', readback: 'PRODUCT_VLV/PV.CV' },
  { name: 'WASTE_SP', write: 'WASTE_VLV/CAS_SP.CV', readback: 'WASTE_VLV/PV.CV' }
]
const STATES = {
  1: { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'CLOSE', WASTE_SP: 'CLOSE' },
  2: { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'CLOSE', WASTE_SP: 'OPEN' },
  3: { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'OPEN', WASTE_SP: 'CLOSE' },
  4: { PRODUCT_MODE: 'Auto', WASTE_MODE: 'Auto', PRODUCT_SP: 'CLOSE', WASTE_SP: 'CLOSE' }
}

function emClasses() {
  // Workshop – BLENDER_COLOR
  value(E().renameCategory(value(E().newCategory(null)), 'CommandDriven'))
  assert.match(E().newClass('CommandDriven', 'BAD', 'Command driven', 'vlvnc-sp').error, /255/)
  assert.match(E().newClass('CommandDriven', 'BAD', 'Function Block Diagram', 'EM-vlvnc-2stage').error, /not modeled/)
  value(E().newClass('CommandDriven', 'BLENDER_COLOR', 'Command driven', 'EM-vlvnc-2stage'))
  assert.deepEqual(Object.values(E().classes.BLENDER_COLOR.commands).map(c => `${c.block}:${c.state}`),
    ['COMMAND_00001:Close', 'COMMAND_00002:Dribble', 'COMMAND_00003:Bulk', 'COMMAND_00004:Auto Mode'])
  assert.equal(value(E().addChild('BLENDER_COLOR', '2STAGE_VALVE')), '2STAGE_VALV_1')
  value(E().renameChild('BLENDER_COLOR', '2STAGE_VALV_1', 'COLOR_IN_VLV'))
  const check = emCheckEnv(E().classes.BLENDER_COLOR)
  for (const rows of Object.values(COMMANDS)) for (const [, actions, , cond] of rows) {
    for (const a of actions) assert.deepEqual(expr.checkExpression(a, 'action', check), [], a)
    assert.deepEqual(expr.checkExpression(cond, 'condition', check), [], cond)
  }
  assert.match(expr.checkExpression("'//#INLET_VLV#/PV.CV' = 1", 'condition', check)[0], /Unit aliases/)
  value(E().editDraft('BLENDER_COLOR', d => { for (const [v, rows] of Object.entries(COMMANDS)) d.commands[v].sfc = sequence(rows) }))
  value(E().saveClass('BLENDER_COLOR'))
  // Workshop – BLENDER_OUTLET
  value(E().renameCategory(value(E().newCategory(null)), 'StateDriven'))
  value(E().newClass('StateDriven', 'BLENDER_OUTLET', 'State driven', 'EM_Outlet_State'))
  assert.equal(value(E().addChild('BLENDER_OUTLET', 'NC_VALVE')), 'NC_VALVE_1')
  value(E().renameChild('BLENDER_OUTLET', 'NC_VALVE_1', 'PRODUCT_VLV'))
  assert.equal(value(E().addChild('BLENDER_OUTLET', 'NC_VALVE')), 'NC_VALVE_1')
  value(E().renameChild('BLENDER_OUTLET', 'NC_VALVE_1', 'WASTE_VLV'))
  value(E().editDraft('BLENDER_OUTLET', d => { d.items = ITEMS; for (const [v, row] of Object.entries(STATES)) d.states[v] = row }))
  value(E().saveClass('BLENDER_OUTLET'))
}

function blendersUnitClass() {
  // Step 1/2: delete the assigned standalone blender modules (LI-504, LI-604 and the simulations stay).
  const old = ['AGIT-503', 'AGIT-603', 'MTR-505', 'MTR-605', 'XV-501', 'XV-601', 'XV-502', 'XV-602', 'XV-503', 'XV-603', 'XV-504', 'XV-604']
  assert.match(B().deleteCourseModule('XV-502').error, /Delete its assignment first/)
  for (const t of old) value(B().unassignModule(t))
  for (const t of old) value(B().deleteCourseModule(t))
  for (const t of old) assert.equal(M().modules[t], undefined)
  // Process cell (Chapter 4 Task 1)
  value(B().renameClass('pcell', value(B().newProcessCellClass('General')), 'PRODUCTION'))
  value(B().renameProcessCell(value(B().createProcessCell('PRODUCTION', 'ED_CENTER_BATCH')), 'PAINT_PRODUCTION'))
  // Steps 3-8
  value(B().renameCategory('unit', value(B().newCategory('unit', null)), 'BlenderUnits'))
  value(B().newUnitClass('BlenderUnits', 'BLENDERS'))
  const blocks = [['BLENDER_COLOR', 'BLENDER_COL_1', 'BLNDR_COLOR'], ['BLENDER_OUTLET', 'BLENDER_OUT_1', 'BLNDR_OUTLET'],
    ['AGIT_MTR', 'AGIT_MTR_1', 'AGITATOR'], ['OUT_PMP', 'OUT_PMP_1', 'OUT_PUMP'], ['NC_VALVE', 'NC_VALVE_1', 'BASE_IN_VLV']]
  for (const [cls, first, renamed] of blocks) {
    assert.equal(value(B().addModuleBlock('BLENDERS', cls, 'Private', true)), first)
    value(B().renameModuleBlock('BLENDERS', first, renamed))
  }
  assert.deepEqual(Object.keys(B().unitClasses.BLENDERS.aliases).sort(), ['AGITATOR', 'BASE_IN_VLV', 'BLNDR_COLOR', 'BLNDR_OUTLET', 'OUT_PUMP'])
  value(B().addAlias('BLENDERS', 'TANK_LEVEL', ''))
  // Steps 9-13
  value(B().renameUnitModule(value(B().createUnitModule('BLENDERS', 'PAINT_PRODUCTION')), 'UM_BL_500'))
  value(B().renameUnitModule(value(B().createUnitModule('BLENDERS', 'PAINT_PRODUCTION')), 'UM_BL_600'))
  assert.deepEqual(E().instances.BLNDR_COLOR1.children, { COLOR_IN_VLV: 'COLOR_IN_VLV1' })
  assert.equal(M().modules.COLOR_IN_VLV2.twoStage, true)
  assert.equal(B().units.UM_BL_600.aliases.AGITATOR.path, 'AGITATOR2')
  for (const [n, i] of [[5, 1], [6, 2]]) {
    for (const [from, to] of [['AGITATOR', `AGIT-${n}03`], ['BASE_IN_VLV', `XV-${n}01`], ['BLNDR_COLOR', `BL_${n}00_COLOR_IN`], ['COLOR_IN_VLV', `XV-${n}02`],
      ['BLNDR_OUTLET', `BL_${n}00_OUTLET`], ['PRODUCT_VLV', `XV-${n}03`], ['WASTE_VLV', `XV-${n}04`], ['OUT_PUMP', `MTR-${n}05`]]) value(B().renameCourseModule(`${from}${i}`, to))
    const u = `UM_BL_${n}00`
    // Steps 14-16
    value(B().resolveAlias(u, 'TANK_LEVEL', { path: `LI-${n}04/AI1/PV.CV`, ignore: false, description: '' }))
    value(B().setUnitProps(u, { primaryDisplay: 'Process' }))
    value(B().containModule(`LI-${n}04`, u))
  }
  assert.equal(B().units.UM_BL_500.aliases.BLNDR_COLOR.path, 'BL_500_COLOR_IN')
  assert.equal(B().units.UM_BL_600.aliases.OUT_PUMP.path, 'MTR-605')
  assert.deepEqual(E().instances.BL_600_OUTLET.children, { PRODUCT_VLV: 'XV-603', WASTE_VLV: 'XV-604' })
  // Steps 17-18
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  value(L().assignArea('FEED_TANK_AREA', 'CTLR1'))
  const report = value(L().downloadController('CTLR1'))
  for (const t of ['BL_500_COLOR_IN', 'BL_500_OUTLET', 'BL_600_COLOR_IN', 'BL_600_OUTLET', 'LI-504']) assert.ok(report.downloaded.includes(t), t)
  assert.deepEqual(report.warnings.filter(w => !/LI-/.test(w)), [])
}

test('7016 ch5: Equipment Module Classes, the BLENDERS unit class and UM_BL_500 / UM_BL_600 instances', () => fixture(() => {
  levelIndicators()
  emClasses()
  blendersUnitClass()
  assert.deepEqual(Object.keys(B().units.UM_BL_500.blocks).sort(), ['AGITATOR', 'BASE_IN_VLV', 'BLNDR_COLOR', 'BLNDR_OUTLET', 'OUT_PUMP'])
  assert.equal(B().contained['BL_500_COLOR_IN'], 'UM_BL_500')
  assert.equal(B().contained['AGIT-503'], 'UM_BL_500')
  assert.equal(L().assignments['XV-602'], 'CTLR1')
  assert.equal(E().instances.BL_500_COLOR_IN.unit, 'UM_BL_500', 'unit module rename reaches the EM instance')
  assert.equal(E().cmInstances['AGIT-603'].owner.name, 'UM_BL_600', 'unit module rename reaches unit-owned control modules')
  // Live workshop checks agree with the configuration
  assert.deepEqual(pending(ch5.checkCourse7016BlenderColor(ch5State())), [])
  assert.deepEqual(pending(ch5.checkCourse7016BlenderOutlet(ch5State())), [])
  assert.deepEqual(pending(ch5.checkCourse7016BlendersUnit(ch5State())), [])
}))

test('7016 ch5 screens render: EM Control Studio (class and on-line), Process picture base loop, two stage faceplate', () => fixture(() => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const storeMod = require('../src/renderer/src/engine/store.ts')
  const batchMod = require('../src/renderer/src/engine/batchStore.ts')
  const libMod = require('../src/renderer/src/engine/libraryStore.ts')
  const emMod = require('../src/renderer/src/engine/emStore.ts')
  const uiMod = require('../src/renderer/src/ui/uiStore.ts')
  const batchUiMod = require('../src/renderer/src/ui/batchUi.ts')
  const { EmStudio } = require('../src/renderer/src/displays/EmStudio.tsx')
  const { ProcessDisplay } = require('../src/renderer/src/displays/ProcessDisplay.tsx')
  const { ValveFaceplate } = require('../src/renderer/src/faceplates/ValveFaceplate.tsx')
  const render = (C, props) => {
    const hooks = [[storeMod, 'useStore'], [batchMod, 'useBatch'], [libMod, 'useLibrary'], [emMod, 'useEm'], [uiMod, 'useUi'], [batchUiMod, 'useBatchUi']]
      .map(([m, k]) => { const real = m[k]; return test.mock.method(m, k, sel => (sel ? sel(real.getState()) : real.getState())) })
    try { return renderToStaticMarkup(React.createElement(C, props)) } finally { hooks.forEach(h => h.mock.restore()) }
  }
  levelIndicators()
  emClasses()
  blendersUnitClass()
  run(2)
  const ui = uiMod.useUi
  const before = ui.getState()
  try {
    ui.getState().openEmStudio('BLENDER_COLOR')
    const cmd = render(EmStudio)
    for (const s of ['COMMAND_00001', 'COMMAND_00004', 'Auto Mode', 'A_COMMAND', 'A_PV', 'A_ABT_ON_NEW_CMD', 'COLOR_IN_VLV']) assert.ok(cmd.includes(s), s)
    ui.getState().openEmStudio('BLENDER_OUTLET')
    const st = render(EmStudio)
    for (const s of ['PRODUCT_MODE', 'WASTE_VLV/CAS_SP.CV', 'Releasing Product - CAS', 'Draining Waste - CAS']) assert.ok(st.includes(s), s)
    value(E().setCommand('BL_500_COLOR_IN', 'Bulk'))
    ui.getState().openEmStudio('BLENDER_COLOR', 'BL_500_COLOR_IN')
    const online = render(EmStudio)
    assert.match(online, /data-em-instance="BL_500_COLOR_IN"/)
    assert.match(online, /Running/)
  } finally { ui.setState(before, true) }
  const proc = render(ProcessDisplay)
  for (const s of ['data-dynamo="FIC-404"', 'data-dynamo="LI-401"', 'MTR-403', 'Base 400', 'data-stage="XV-502"']) assert.ok(proc.includes(s), s)
  assert.ok(!proc.includes('Not modeled'))
  run(10)
  const fp = render(ValveFaceplate, { tag: 'XV-502' })
  assert.match(fp, /data-two-stage="XV-502"/)
  for (const s of ['Close', 'Dribble', 'Bulk', 'CAS', 'BL_500_COLOR_IN']) assert.ok(fp.includes(s), s)
}))

test('7016 ch5 workshops: every step id has a live check and ids are unique', () => {
  const ch = COURSE.find(m => m.module.includes('Ch 5'))
  assert.ok(ch, 'Chapter 5 module')
  const ids = ch.workshops.flatMap(w => w.steps.map(s => s.id))
  assert.equal(new Set(ids).size, ids.length)
  const all = COURSE.flatMap(m => m.workshops.flatMap(w => w.steps.map(s => s.id)))
  assert.equal(new Set(all).size, all.length, 'step ids unique across the course')
  const empty = { emCategories: {}, emClasses: {}, emDrafts: {}, emInstances: {}, emDeployed: {}, batchCategories: {}, unitClasses: {}, units: {}, contained: {}, assignments: {}, modules: {}, transfers: {}, sims: {}, runSince: null }
  const checked = [ch5.checkCourse7016BlenderColor(empty), ch5.checkCourse7016BlenderOutlet(empty), ch5.checkCourse7016BlendersUnit(empty),
    ch5.checkCourse7016RunProcess(empty), ch5.checkCourse7016VerifyEms([]), ch5.checkCourse7016Ch5Optional(empty, [])].flat().map(c => c.id)
  assert.deepEqual(checked.sort(), [...ids].sort())
})

test('7016 ch5 Verify Equipment Modules: command-driven BL_500_COLOR_IN and state-driven BL_500_OUTLET', () => fixture(() => {
  levelIndicators()
  emClasses()
  blendersUnitClass()
  run(2)
  const until = (fn, n = 200) => { for (let i = 0; i < n && !fn(); i++) run(1); assert.ok(fn()) }
  const pv = (t) => stateName(E().deployed[t].cls.namedSet, E().runtime[t].pv)
  // BLENDER_COLOR: Dribble, Bulk, Close, Auto Mode
  value(E().setCommand('BL_500_COLOR_IN', 'Dribble'))
  assert.equal(E().runtime.BL_500_COLOR_IN.blocks.COMMAND_00002, 'Running')
  until(() => pv('BL_500_COLOR_IN') === 'Dribble')
  assert.equal(E().runtime.BL_500_COLOR_IN.blocks.COMMAND_00002, 'Complete')
  assert.equal(B().dc['XV-502'].mode, 'CAS')
  assert.equal(M().modules['XV-502'].open && !M().modules['XV-502'].bulk, true, 'open to the DRIBBLE position')
  value(E().setCommand('BL_500_COLOR_IN', 'Bulk'))
  until(() => pv('BL_500_COLOR_IN') === 'Bulk')
  assert.equal(M().modules['XV-502'].bulk, true)
  value(E().setCommand('BL_500_COLOR_IN', 'Close'))
  until(() => pv('BL_500_COLOR_IN') === 'Close')
  assert.equal(M().modules['XV-502'].open, false)
  value(E().setCommand('BL_500_COLOR_IN', 'Auto Mode'))
  until(() => pv('BL_500_COLOR_IN') === 'Auto Mode')
  assert.equal(B().dc['XV-502'].mode, 'AUTO')
  assert.match(E().setCommand('BL_500_COLOR_IN', 'Idle').error, /not user selectable/)
  // A_ABT_ON_NEW_CMD False finishes the running command first; True aborts it.
  value(E().setCommand('BL_600_COLOR_IN', 'Bulk'))
  value(E().setCommand('BL_600_COLOR_IN', 'Close'))
  assert.equal(E().runtime.BL_600_COLOR_IN.queued, 1)
  until(() => pv('BL_600_COLOR_IN') === 'Close')
  value(E().setAbortOnNew('BL_600_COLOR_IN', true))
  value(E().setCommand('BL_600_COLOR_IN', 'Bulk'))
  value(E().setCommand('BL_600_COLOR_IN', 'Dribble'))
  assert.equal(E().runtime.BL_600_COLOR_IN.blocks.COMMAND_00003, 'Aborted')
  until(() => pv('BL_600_COLOR_IN') === 'Dribble')
  // BLENDER_OUTLET states
  value(E().setCommand('BL_500_OUTLET', 'Draining Waste - CAS'))
  until(() => pv('BL_500_OUTLET') === 'Draining Waste - CAS')
  assert.deepEqual([M().modules['XV-503'].open, M().modules['XV-504'].open, B().dc['XV-503'].mode, B().dc['XV-504'].mode], [false, true, 'CAS', 'CAS'])
  value(E().setCommand('BL_500_OUTLET', 'Releasing Product - CAS'))
  until(() => pv('BL_500_OUTLET') === 'Releasing Product - CAS')
  assert.deepEqual([M().modules['XV-503'].open, M().modules['XV-504'].open], [true, false])
  value(E().setCommand('BL_500_OUTLET', 'Closed - CAS'))
  until(() => pv('BL_500_OUTLET') === 'Closed - CAS')
  assert.deepEqual([M().modules['XV-503'].open, M().modules['XV-504'].open], [false, false])
  value(E().setCommand('BL_500_OUTLET', 'Auto Mode'))
  until(() => pv('BL_500_OUTLET') === 'Auto Mode')
  assert.deepEqual([B().dc['XV-503'].mode, B().dc['XV-504'].mode], ['AUTO', 'AUTO'])
  // A phase can drive the equipment module through its A_COMMAND / A_PV (later chapters).
  assert.equal(require('../src/renderer/src/engine/batchStore.ts').readModulePath('BL_500_OUTLET/A_PV.CV'), 4)
  const verify = ch5.checkCourse7016VerifyEms(M().eventLog)
  assert.deepEqual(pending(verify.filter(c => !['7016-5v-6', '7016-5v-11'].includes(c.id))), [])
}))

test('7016 ch2/ch5 Verify you can run the process: base transfer at 90 GPM, color dump, agitate and drain are logged', () => fixture(() => {
  run(2)
  const s = M()
  const until = (fn, n = 600) => { for (let i = 0; i < n && !fn(); i++) run(1); assert.ok(fn(), 'condition reached') }
  // Step 1: fill COLOR 100 to 60 gallons
  s.openValve('XV-101')
  until(() => L().process.tk100 >= 59.5)
  s.closeValve('XV-101')
  run(40)
  const fill = L().transfers['TK100 FILL'].episodes.at(-1).endLevel
  assert.ok(fill > 60 && fill < 75, `fill ended at ${fill} (2 s valve travel overshoot)`)
  // Step 2: transfer 100 gallons from BASE 400 to BLENDER 500 at 90 GPM (FIC-404 in AUTO, SP 90)
  const before = L().process.bl500
  s.setSetpoint('FIC-404', 90)
  s.setMode('FIC-404', 'AUTO')
  s.openValve('XV-501')
  s.startMotor('MTR-403')
  until(() => L().process.bl500 - before >= 100, 2000)
  assert.ok(Math.abs(M().modules['FIC-404'].pv - 90) < 6, `flow ${M().modules['FIC-404'].pv}`)
  s.stopMotor('MTR-403')
  s.closeValve('XV-501')
  run(30)
  const base = L().transfers['BASE>BL500'].episodes.at(-1)
  assert.ok(base.amount > 95 && base.amount < 115, `base episode ${base.amount}`)
  assert.equal(Math.round(base.avgSp), 90)
  assert.ok(M().modules['LI-401'].pv < 1500 - 95)
  // Step 3: dump 50 gallons from COLOR 100 to BLENDER 500 (XV-102 and the 2-stage XV-502 in BULK)
  value(B().setTwoStage('XV-502', 'BULK'))
  s.openValve('XV-102')
  const tk = L().process.tk100
  until(() => tk - L().process.tk100 >= 50)
  s.closeValve('XV-102')
  value(B().setTwoStage('XV-502', 'CLOSE'))
  run(30)
  const dump = L().transfers['TK100>BL500'].episodes.at(-1)
  assert.ok(dump.amount > 49 && dump.amount < 65, `dump ${dump.amount}`)
  // Dribble passes a fifth of the bulk rate
  value(B().setTwoStage('XV-502', 'DRIBBLE'))
  run(30)
  s.openValve('XV-102')
  const t0 = L().process.tk100
  run(100)
  const dribbled = t0 - L().process.tk100
  assert.ok(dribbled > 6 && dribbled < 10, `dribble ${dribbled} gal in 10 s (bulk would pass 40)`)
  s.closeValve('XV-102')
  value(B().setTwoStage('XV-502', 'CLOSE'))
  // Step 4: agitate one minute; Step 5: drain 125 gallons to Product
  s.startMotor('AGIT-503')
  run(610)
  s.stopMotor('AGIT-503')
  run(80)
  assert.ok(L().transfers['AGIT-503 RUN'].episodes.at(-1).amount >= 60)
  s.openValve('XV-503')
  s.startMotor('MTR-505')
  const bl = L().process.bl500
  until(() => bl - L().process.bl500 >= 125)
  s.stopMotor('MTR-505')
  s.closeValve('XV-503')
  run(30)
  const drain = L().transfers['BL500>PRODUCT'].episodes.at(-1)
  assert.ok(drain.amount > 124 && drain.amount < 150, `drain ${drain.amount}`)
  assert.equal(ch5.checkCourse7016RunProcess(ch5State())[0].verdict, 'pending', 'Chapter 2 style runs before the BLENDERS download do not count')
  const runChecks = ch5.checkCourse7016RunProcess({ ...ch5State(), runSince: 0 })
  assert.deepEqual(pending(runChecks.filter(c => ['7016-5r-1', '7016-5r-2', '7016-5r-3', '7016-5r-4', '7016-5r-5'].includes(c.id))), [])
  assert.equal(runChecks.find(c => c.id === '7016-5r-6').verdict, 'pending')
}))
