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
const lib = require('../src/renderer/src/engine/libraryStore.ts')
const cl = require('../src/renderer/src/engine/classLibrary.ts')
const { useLibrary } = lib

function fixture(run) {
  const before = { store: useStore.getState(), security: useSecurity.getState(), library: useLibrary.getState(), window: global.window }
  const alerts = []
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { alert: (m) => alerts.push(m), localStorage: global.localStorage, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, lastDenied: null, workstation: null })
    assert.equal(useLibrary.getState().installCourseProject(), true)
    run(useLibrary.getState, alerts)
  } finally {
    useStore.setState(before.store, true)
    useSecurity.setState(before.security, true)
    useLibrary.setState(before.library, true)
    delete global.localStorage
    if (before.window === undefined) delete global.window
    else global.window = before.window
  }
}
const L = () => useLibrary.getState()
const M = () => useStore.getState()
const value = (r) => { assert.equal(r.ok, true, r.error); return r.value }
/** Advance the plant (and therefore the library) by n 100 ms steps. */
const run = (n = 5) => { for (let i = 0; i < n; i++) M().tick(0.1) }

/** Workshop 1-24/1-25: LEVEL_INDICATOR, performed with the store actions the UI calls. */
function buildLevelIndicator() {
  const cat = value(L().newCategory(null))
  value(L().renameCategory(cat, 'AnalogInput'))
  const name = value(L().createClassFromTemplate('ANALOG', 'AnalogInput'))
  value(L().renameClass(name, 'LEVEL_INDICATOR'))
  value(L().editDraft('LEVEL_INDICATOR', d => {
    const ai = d.blocks.AI1.params
    ai.OUT_SCALE.value = { hi: 500, lo: 0, units: 'gal', decimals: 1 }
    ai.OUT_SCALE.allowInstance = true
    ai.L_TYPE.value = 'Direct'
    d.alarms.HI_ALM.enabled = false
    d.alarms.LO_ALM.enabled = false
    ai.SIMULATE.value = { enabled: true, value: 0 }
    d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: 'Level input',
      special: { item: 'INPUT', x: 40, y: 90 } }
    d.primaryDisplay = 'Process'
  }))
  value(L().connect('LEVEL_INDICATOR', 'LEVEL_IN', 'AI1/SIMULATE_IN'))
  value(L().saveClass('LEVEL_INDICATOR'))
}

function createLi(name, path, scale) {
  const tag = value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH'))
  assert.equal(tag, 'LEVEL_INDIC_1')
  value(L().renameInstance(tag, name))
  value(L().setOverride(name, 'LEVEL_IN', path))
  if (scale) value(L().setOverride(name, 'AI1/OUT_SCALE', { hi: scale, lo: 0, units: 'gal', decimals: 1 }))
}

test('7016 ch1: the DV_School project provides ED_CENTER_BATCH, CTLR1, the course modules and TANKSIM sources', () => fixture(() => {
  assert.ok(M().areas.includes('ED_CENTER_BATCH'))
  assert.equal(M().hardware.controllers.CTLR1.commissioned, true)
  for (const tag of ['AGIT-503', 'XV-502', 'MTR-605', 'XV-101', 'XV-604']) assert.equal(M().modules[tag].area, 'ED_CENTER_BATCH')
  for (const tag of ['MTR-403', 'FIC-404', 'LI-401']) assert.equal(M().modules[tag].area, 'FEED_TANK_AREA')
  assert.deepEqual(Object.keys(L().sims).sort(), ['LEV500-SIM', 'LEV600-SIM', 'LEVEL-401', 'TANKSIM'])
  assert.deepEqual(Object.keys(L().categories).sort(), ['2StateMotor', 'General', 'NC_Valves'])
  assert.deepEqual(lib.browsePaths().filter(p => !p.includes('AI1')), ['LEV500-SIM/500_LEV', 'LEV600-SIM/600_LEV', 'LEVEL-401/401_LEV', 'LEVEL-401/FLOW', 'TANKSIM/TKLEV100', 'TANKSIM/TKLEV200', 'TANKSIM/TKLEV300'])
}))

test('7016 ch1: new category, template drag-and-drop, class rename and library name rules', () => fixture(() => {
  const cat = value(L().newCategory(null))
  assert.equal(cat, 'NewCategory')
  assert.match(L().renameCategory(cat, 'Analog Input').error, /1-16 characters/)
  value(L().renameCategory(cat, 'AnalogInput'))
  assert.match(L().createClassFromTemplate('DISCRETE', 'AnalogInput').error, /not modeled/)
  assert.match(L().createClassFromTemplate('AI', 'AnalogInput').error, /function block template/)
  assert.match(L().createClassFromTemplate('ANALOG', 'Nope').error, /Category/)
  const name = value(L().createClassFromTemplate('ANALOG', 'AnalogInput'))
  assert.equal(name, 'ANALOG')
  assert.equal(value(L().renameClass(name, 'level_indicator')), 'LEVEL_INDICATOR')
  assert.match(L().renameCategory('General', 'LEVEL_INDICATOR').error, /already used/)
  assert.match(L().deleteCategory('AnalogInput').error, /not empty/)
  const template = L().classes.LEVEL_INDICATOR.definition
  assert.equal(template.blocks.AI1.params.L_TYPE.value, 'Indirect')
  assert.equal(template.blocks.AI1.params.OUT_SCALE.allowInstance, false)
  assert.deepEqual(cl.configurableParams(template).map(p => p.name), ['AI1$ALARM_HYS', 'AI1$HI_HI_LIM', 'AI1$HI_LIM', 'AI1$IO_IN', 'AI1$IO_OPTS', 'AI1$LO_LIM', 'AI1$LO_LO_LIM', 'AI1$MODE', 'AI1$PV_FTIME', 'VERSION'])
}))

test('7016 ch1: class edits stay in the Control Studio draft until Save; wiring is validated', () => fixture(() => {
  value(L().newCategory(null))
  const name = value(L().createClassFromTemplate('ANALOG', 'NewCategory'))
  value(L().editDraft(name, d => { d.blocks.AI1.params.L_TYPE.value = 'Direct' }))
  assert.equal(L().classes[name].definition.blocks.AI1.params.L_TYPE.value, 'Indirect')
  assert.equal(L().draftOf(name).blocks.AI1.params.L_TYPE.value, 'Direct')
  assert.match(L().connect(name, 'LEVEL_IN', 'AI1/SIMULATE_IN').error, /not a connectable output/)
  value(L().editDraft(name, d => { d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: '', special: { item: 'INPUT', x: 0, y: 0 } } }))
  assert.match(L().connect(name, 'LEVEL_IN', 'AI1/OUT').error, /not an input/)
  value(L().connect(name, 'LEVEL_IN', 'AI1/SIMULATE_IN'))
  assert.match(L().connect(name, 'LEVEL_IN', 'AI1/SIMULATE_IN').error, /already has a connection/)
  value(L().editDraft(name, d => { d.blocks.AI1.params.OUT_SCALE.value = { hi: 0, lo: 10, units: 'gal', decimals: 1 } }))
  assert.match(L().saveClass(name).error, /100% scale/)
  value(L().editDraft(name, d => { d.blocks.AI1.params.OUT_SCALE.value = { hi: 500, lo: 0, units: 'gal', decimals: 1 } }))
  value(L().saveClass(name))
  assert.equal(L().drafts[name], undefined)
  assert.equal(L().classes[name].revision, 2)
  assert.deepEqual(L().classes[name].definition.wires, [{ from: 'LEVEL_IN', to: 'AI1/SIMULATE_IN' }])
}))

test('7016 ch1 workshop: LI-104..LI-604 from LEVEL_INDICATOR, instance-only parameters, download and live verification', () => fixture(() => {
  buildLevelIndicator()
  createLi('LI-104', 'TANKSIM/TKLEV100')
  createLi('LI-204', 'TANKSIM/TKLEV200')
  createLi('LI-304', 'TANKSIM/TKLEV300')
  createLi('LI-504', 'LEV500-SIM/500_LEV', 1000)
  createLi('LI-604', 'LEV600-SIM/600_LEV', 1000)
  assert.deepEqual(Object.keys(L().instances).sort(), ['LI-104', 'LI-204', 'LI-304', 'LI-504', 'LI-604'])
  assert.equal(M().modules['LI-104'].classInstance, 'LEVEL_INDICATOR')
  assert.deepEqual(lib.instanceContents('LI-104').map(r => r.name), ['AI1$ALARM_HYS', 'AI1$HI_HI_LIM', 'AI1$HI_LIM', 'AI1$IO_IN', 'AI1$IO_OPTS', 'AI1$LO_LIM', 'AI1$LO_LO_LIM', 'AI1$MODE', 'AI1$OUT_SCALE', 'AI1$PV_FTIME', 'LEVEL_IN', 'VERSION'])
  assert.match(L().setOverride('LI-104', 'AI1/L_TYPE', 'Indirect').error, /not configurable on instances/)

  run(3)
  assert.equal(M().modules['LI-104'].pvBad, true)
  assert.equal(M().modules['LI-104'].statusText, 'Not downloaded')
  assert.equal(lib.downloadState(L(), 'LI-104'), 'unassigned')
  assert.match(L().downloadModule('LI-104').error, /not assigned/)

  const assigned = value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  assert.ok(assigned.includes('LI-604') && assigned.includes('TANKSIM'))
  assert.equal(lib.downloadState(L(), 'LI-104'), 'not-downloaded')
  const report = value(L().downloadController('CTLR1'))
  assert.deepEqual(report.warnings, [])
  assert.equal(lib.downloadState(L(), 'LI-604'), 'current')

  run(3)
  const p = L().process
  const li = (t) => M().modules[t]
  assert.equal(li('LI-104').pvBad, false)
  assert.ok(Math.abs(li('LI-104').pv - p.tk100) < 1e-6, `${li('LI-104').pv} vs ${p.tk100}`)
  assert.ok(Math.abs(li('LI-304').pv - p.tk300) < 1e-6)
  assert.ok(Math.abs(li('LI-504').pv - p.bl500) < 1e-6)
  assert.equal(li('LI-104').pvMax, 500)
  assert.equal(li('LI-504').pvMax, 1000)
  assert.equal(li('LI-604').unit, 'gal')
  assert.equal(li('LI-104').primaryDisplay, 'Process')
  assert.ok(li('LI-104').alarms.every(a => !a.enabled), 'HI_ALM and LO_ALM are disabled')

  // Opening XV-101 fills color tank 100 and LI-104 follows it.
  const before = li('LI-104').pv
  useStore.setState(s => ({ modules: { ...s.modules, 'XV-101': { ...s.modules['XV-101'], commandedOpen: true } } }))
  run(80)
  assert.equal(M().modules['XV-101'].open, true)
  assert.ok(li('LI-104').pv > before + 5, `${li('LI-104').pv} should rise from ${before}`)
}))

test('7016 ch1: class changes propagate to defaults, unchecking Allow instance reverts overrides, downloads go pending', () => fixture(() => {
  buildLevelIndicator()
  createLi('LI-104', 'TANKSIM/TKLEV100')
  createLi('LI-504', 'LEV500-SIM/500_LEV', 1000)
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  value(L().downloadController('CTLR1'))
  value(L().editDraft('LEVEL_INDICATOR', d => { d.blocks.AI1.params.OUT_SCALE.value = { hi: 600, lo: 0, units: 'gal', decimals: 1 } }))
  assert.equal(lib.downloadState(L(), 'LI-104'), 'current', 'unsaved drafts are not part of the configuration')
  value(L().saveClass('LEVEL_INDICATOR'))
  assert.equal(lib.downloadState(L(), 'LI-104'), 'pending')
  assert.equal(lib.instanceDefinition('LI-104').blocks.AI1.params.OUT_SCALE.value.hi, 600)
  assert.equal(lib.instanceDefinition('LI-504').blocks.AI1.params.OUT_SCALE.value.hi, 1000, 'instance value wins over the new class default')
  value(L().editDraft('LEVEL_INDICATOR', d => { d.blocks.AI1.params.OUT_SCALE.allowInstance = false }))
  value(L().saveClass('LEVEL_INDICATOR'))
  assert.deepEqual(Object.keys(L().instances['LI-504'].overrides), ['LEVEL_IN'])
  assert.equal(lib.instanceDefinition('LI-504').blocks.AI1.params.OUT_SCALE.value.hi, 600)
  value(L().setOverride('LI-104', 'LEVEL_IN', null))
  assert.equal(lib.instanceDefinition('LI-104').params.LEVEL_IN.value, '')
  const report = value(L().downloadController('CTLR1'))
  assert.ok(report.warnings.some(w => /LI-104: LEVEL_IN external reference path is not configured/.test(w)))
  run(2)
  assert.equal(M().modules['LI-104'].pvBad, true)
  assert.match(M().modules['LI-104'].statusText, /not configured/)
  assert.match(L().deleteClass('LEVEL_INDICATOR').error, /used by/)
}))

test('7016 ch1: rename/delete instances keep the main plant in sync; a downed controller makes PVs Bad', () => fixture(() => {
  buildLevelIndicator()
  createLi('LI-104', 'TANKSIM/TKLEV100')
  assert.match(L().renameInstance('LI-104', 'XV-101').error, /already exists/)
  assert.match(L().renameInstance('LI-104', 'BAD NAME').error, /1-16 characters/)
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  value(L().downloadController('CTLR1'))
  run(2)
  assert.equal(M().modules['LI-104'].pvBad, false)
  useStore.setState(s => ({ hardware: { ...s.hardware, controllers: { ...s.hardware.controllers, CTLR1: { ...s.hardware.controllers.CTLR1, primary: 'FAILED' } } } }))
  run(2)
  assert.equal(M().modules['LI-104'].pvBad, true)
  assert.match(M().modules['LI-104'].statusText, /not communicating/)
  value(L().renameInstance('LI-104', 'LI-105'))
  assert.equal(M().modules['LI-104'], undefined)
  assert.equal(M().modules['LI-105'].classInstance, 'LEVEL_INDICATOR')
  assert.equal(L().assignments['LI-105'], 'CTLR1')
  assert.equal(lib.downloadState(L(), 'LI-105'), 'not-downloaded', 'a renamed module must be downloaded again')
  M().deleteModule('LI-105')
  assert.equal(L().instances['LI-105'], undefined)
}))

test('7016 ch1: AI execution follows SIMULATE, L_TYPE, MODE and PV_FTIME', () => {
  const d = cl.analogTemplate()
  const read = () => ({ value: 40, bad: false })
  assert.match(cl.executeAi(d, read, undefined, 0.1).status, /IO_IN is not configured/)
  d.blocks.AI1.params.SIMULATE.value = { enabled: true, value: 25 }
  assert.equal(cl.executeAi(d, read, undefined, 0.1).pv, 25)
  d.blocks.AI1.params.OUT_SCALE.value = { hi: 500, lo: 0, units: 'gal', decimals: 1 }
  assert.equal(cl.executeAi(d, read, undefined, 0.1).pv, 125, 'Indirect rescales XD_SCALE % into OUT_SCALE')
  d.blocks.AI1.params.L_TYPE.value = 'Direct'
  assert.equal(cl.executeAi(d, read, undefined, 0.1).pv, 25)
  d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: 'TANKSIM/TKLEV100', allowInstance: true, description: '', special: { item: 'INPUT', x: 0, y: 0 } }
  d.wires.push({ from: 'LEVEL_IN', to: 'AI1/SIMULATE_IN' })
  assert.equal(cl.executeAi(d, read, undefined, 0.1).pv, 40)
  assert.match(cl.executeAi(d, () => null, undefined, 0.1).status, /unresolved reference/)
  d.blocks.AI1.params.PV_FTIME.value = 0.9
  assert.ok(Math.abs(cl.executeAi(d, read, 0, 0.1).pv - 4) < 1e-9)
  d.blocks.AI1.params.MODE.value = 'OOS'
  assert.equal(cl.executeAi(d, read, 7, 0.1).bad, true)
  assert.equal(cl.defaultInstanceName('LEVEL_INDICATOR', t => t === 'LEVEL_INDIC_1'), 'LEVEL_INDIC_2')
  assert.equal(cl.externalPathError('TANKSIM/TKLEV100.CV'), null)
  assert.match(cl.externalPathError('TANKSIM'), /MODULE\/PARAMETER/)
})

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { checkCourse7016Ch1 } = require('../src/renderer/src/engine/course7016Checks.ts')
const { useUi } = require('../src/renderer/src/ui/uiStore.ts')

test('7016 ch1: the workshop checker verifies every step only after the full workshop is complete', () => fixture(() => {
  const check = () => checkCourse7016Ch1(L(), M().modules, lib.makeReader(L()))
  assert.ok(check().every(s => s.verdict === 'pending'))
  buildLevelIndicator()
  assert.deepEqual(check().filter(s => s.id.startsWith('7016-1-')).filter(s => s.verdict !== 'verified').map(s => s.id), [])
  createLi('LI-104', 'TANKSIM/TKLEV100')
  createLi('LI-204', 'TANKSIM/TKLEV200')
  createLi('LI-304', 'TANKSIM/TKLEV300')
  createLi('LI-504', 'LEV500-SIM/500_LEV', 1000)
  createLi('LI-604', 'LEV600-SIM/600_LEV')
  assert.equal(check().find(s => s.id === '7016-2-5').verdict, 'pending', 'LI-604 still needs 0-1000 gal')
  value(L().setOverride('LI-604', 'AI1/OUT_SCALE', { hi: 1000, lo: 0, units: 'gal', decimals: 1 }))
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  assert.equal(check().find(s => s.id === '7016-2-7').verdict, 'pending')
  value(L().downloadController('CTLR1'))
  run(2)
  const pending = check().filter(s => s.verdict !== 'verified')
  assert.deepEqual(pending, [])
}))

test('7016 ch1: library tree, parameter Properties dialogs and the Process empty state render', () => {
  const { LibraryTree } = require('../src/renderer/src/components/LibraryExplorer.tsx')
  const { LibraryParamDialog } = require('../src/renderer/src/components/LibraryParamDialog.tsx')
  const { ProcessDisplay } = require('../src/renderer/src/displays/ProcessDisplay.tsx')
  // Server rendering uses each store's initial snapshot, so this checks structure; live behaviour is covered above.
  const tree = renderToStaticMarkup(React.createElement(LibraryTree, { selection: null, onSelect: () => {} }))
  for (const text of ['Library', 'FunctionBlockTemplates', 'CompositeTemplates', 'ModuleTemplates', 'Advanced Definitions', 'Equipment Module Classes', 'Control Module Classes', '2StateMotor', 'General', 'NC_Valves'])
    assert.ok(tree.includes(`>${text}<`), text)
  const def = cl.analogTemplate().blocks.AI1.params.OUT_SCALE
  const props = { title: 'OUT_SCALE', name: 'OUT_SCALE', def, value: def.value, flag: false, onOk: () => null, onClose: () => {} }
  const cls = renderToStaticMarkup(React.createElement(LibraryParamDialog, { ...props, mode: 'class' }))
  assert.match(cls, /aria-label="OUT_SCALE Properties"/)
  assert.match(cls, /Allow instance value to be configured/)
  assert.match(cls, /aria-label="100% scale"/)
  assert.doesNotMatch(cls, /Use default value from library object/)
  const inst = renderToStaticMarkup(React.createElement(LibraryParamDialog, { ...props, title: 'AI1$OUT_SCALE', mode: 'instance', flag: true, classValue: def.value }))
  assert.match(inst, /Use default value from library object/)
  assert.match(inst, /<fieldset class="lib-dlg-props" disabled=""/)
  assert.match(renderToStaticMarkup(React.createElement(ProcessDisplay)), /New Course 7016 Project \(DV_School\)/)
})
