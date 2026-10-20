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
const { useEm } = require('../src/renderer/src/engine/emStore.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const save = require('../src/renderer/src/engine/courseSave.ts')
const ch4 = require('../src/renderer/src/engine/course7016Ch4Checks.ts')

const L = () => useLibrary.getState()
const M = () => useStore.getState()
const B = () => useBatch.getState()
const E = () => useEm.getState()
const value = (r) => { assert.equal(r.ok, true, r.error); return r.value }
const run = (n = 5) => { for (let i = 0; i < n; i++) M().tick(0.1) }

test('The DV_School database survives an app restart: save, fresh start, restore, keep working', () => {
  const before = { store: M(), security: useSecurity.getState(), library: L(), batch: B(), em: E(), system: useSystem.getState(), window: global.window }
  const storage = {}
  global.localStorage = { getItem: k => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v) }, removeItem: k => { delete storage[k] } }
  global.window = { alert: () => {}, localStorage: global.localStorage, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, lastDenied: null, workstation: null })
    assert.equal(save.restoreCourseDatabase(), false, 'nothing saved yet: the app installs a fresh DV_School')
    assert.equal(L().installCourseProject(), true)
    // some work from Chapters 1, 4 and 5
    value(L().renameCategory(value(L().newCategory(null)), 'AnalogInput'))
    value(L().renameClass(value(L().createClassFromTemplate('ANALOG', 'AnalogInput')), 'LEVEL_INDICATOR'))
    value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), 'LI-104'))
    value(B().renameCategory('unit', value(B().newCategory('unit', null)), 'ChargeTankUnits'))
    value(B().newUnitClass('ChargeTankUnits', 'COLORTANKS'))
    value(E().renameCategory(value(E().newCategory(null)), 'CommandDriven'))
    value(E().newClass('CommandDriven', 'BLENDER_COLOR', 'Command driven', 'EM-vlvnc-2stage'))
    M().openValve('XV-101')
    run(100)
    const level = L().process.tk100
    const time = M().time
    assert.equal(save.saveCourseDatabase(), true)

    // app restart: a fresh DV_School is installed, then the saved database is laid over it
    assert.equal(L().installCourseProject(), true)
    assert.equal(L().classes.LEVEL_INDICATOR, undefined)
    assert.equal(save.restoreCourseDatabase(), true)
    assert.ok(L().classes.LEVEL_INDICATOR)
    assert.ok(M().modules['LI-104'])
    assert.ok(B().unitClasses.COLORTANKS)
    assert.ok(E().classes.BLENDER_COLOR)
    assert.equal(L().process.tk100, level)
    assert.equal(M().time, time)
    assert.equal(M().modules['XV-101'].open, true, 'the plant keeps running where it was')
    run(20)
    assert.ok(L().process.tk100 > level, 'and the simulation continues')
    // export/import text round trip and rejection of foreign files
    const text = JSON.stringify(save.courseSnapshot())
    assert.equal(L().installCourseProject(), true)
    assert.equal(save.restoreCourseDatabase('{"hello":1}'), false)
    assert.equal(save.restoreCourseDatabase(text), true)
    assert.ok(E().classes.BLENDER_COLOR)
    // New Course 7016 Project resets Enable Batch; Chapter 3 Steps 3-4 stay verified after a restart once Batch is active
    useSystem.getState().resetPreferences()
    assert.equal(useSystem.getState().features.batch, false)
    const sys = useSystem.getState()
    const afterRestart = ch4.checkCourse7016Ch3({ ...sys, features: { ...sys.features, batch: true, advancedUnitManagement: true }, pending: {}, serverState: 'RUNNING', restarts: 0 })
    assert.deepEqual(afterRestart.filter(c => c.verdict !== 'verified').map(c => c.id), [])
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
})
