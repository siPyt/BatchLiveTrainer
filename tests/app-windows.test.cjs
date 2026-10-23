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
global.localStorage = { getItem: () => null, setItem: () => {} }
global.window = { alert: () => {}, localStorage: global.localStorage }
const { useUi } = require('../src/renderer/src/ui/uiStore.ts')
const { useWindows } = require('../src/renderer/src/ui/windowStore.ts')

const U = () => useUi.getState()
const W = () => useWindows.getState()
const open = () => ['explorer', 'studio'].filter(id => W().wins[id].open && !W().wins[id].minimized)

test.beforeEach(() => { U().resetToOverview() })

test('Explorer and Control Studio open as windows over the display behind them', () => {
  assert.deepEqual(open(), [])
  U().navigate('trend')
  assert.equal(W().base, 'trend')
  U().navigate('explorer')
  assert.deepEqual(open(), ['explorer'])
  assert.equal(W().base, 'trend', 'the main area keeps showing the display behind the window')
  U().navigate('studio')
  assert.deepEqual(open(), ['explorer', 'studio'])
  assert.ok(W().wins.studio.z > W().wins.explorer.z, 'the newest window is on top')
  U().navigate('alarms')
  assert.deepEqual(open(), ['explorer', 'studio'], 'navigating to another display does not close the windows')
  assert.equal(W().base, 'alarms')
})

test('minimize and close activate the next window, then the display behind', () => {
  U().navigate('explorer')
  U().navigate('studio')
  W().minimize('studio')
  assert.equal(U().display, 'explorer')
  assert.equal(W().wins.studio.minimized, true)
  W().close('explorer')
  assert.equal(U().display, 'process', 'only a minimized window is left, so the display behind is active')
  U().navigate('studio')
  assert.deepEqual(open(), ['studio'], 'opening a minimized window restores it')
  W().focus('studio')
  W().close('studio')
  assert.deepEqual(open(), [])
  assert.equal(U().display, 'process')
})

test('focusing a window makes it the active display; the in-studio Close closes the studio window', () => {
  U().navigate('explorer')
  U().navigate('studio')
  W().focus('explorer')
  assert.equal(U().display, 'explorer')
  U().openEmStudio('SOME_CLASS')
  assert.equal(U().display, 'studio')
  assert.deepEqual(open(), ['explorer', 'studio'])
  U().closeEmStudio()
  assert.equal(W().wins.studio.open, false)
  assert.equal(U().display, 'explorer')
})

test('Back / Forward reopen windows and a project reset closes them all', () => {
  U().navigate('explorer')
  U().navigate('trend')
  W().close('explorer')
  U().back()
  assert.equal(U().display, 'explorer')
  assert.deepEqual(open(), ['explorer'])
  U().navigate('studio')
  U().resetToOverview()
  assert.deepEqual(open(), [])
  assert.equal(U().display, 'process')
})

test('windows can be moved, resized and maximized', () => {
  U().navigate('explorer')
  W().setRect('explorer', { x: 20, y: 30, w: 640, h: 400 })
  assert.deepEqual(W().wins.explorer.rect, { x: 20, y: 30, w: 640, h: 400 })
  W().toggleMaximize('explorer')
  assert.equal(W().wins.explorer.maximized, true)
  W().setRect('explorer', { x: 5, y: 5, w: 500, h: 300 })
  assert.equal(W().wins.explorer.maximized, false, 'moving a maximized window restores it')
})
