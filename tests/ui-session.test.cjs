const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, filename)
}
const { useUi } = require('../src/renderer/src/ui/uiStore.ts')
const { useWindows } = require('../src/renderer/src/ui/windowStore.ts')
const { snapshotUiSession, restoreUiSession } = require('../src/renderer/src/ui/uiSession.ts')
const { startKeepAwake } = require('../src/renderer/src/engine/keepAwake.ts')

function withStorage(fn) {
  const store = new Map()
  const old = global.localStorage
  global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
  try { fn(store) } finally { if (old === undefined) delete global.localStorage; else global.localStorage = old }
}

test('a reload returns to the Control Studio window the student was in, not the Process display', () => withStorage(store => {
  useUi.getState().resetToOverview()
  useUi.getState().openPhaseStudio('AGITATE', 'RUN_LOGIC')
  assert.equal(useUi.getState().display, 'studio')
  assert.equal(useWindows.getState().wins.studio.open, true)
  store.set('batchlive-ui-session', JSON.stringify(snapshotUiSession()))

  // Simulated reload: the stores start from their defaults again.
  useUi.getState().resetToOverview()
  useWindows.getState().closeAll()
  assert.equal(useUi.getState().display, 'process')

  assert.equal(restoreUiSession(), true)
  assert.equal(useUi.getState().display, 'studio')
  assert.equal(useUi.getState().studioPhase, 'AGITATE')
  assert.equal(useUi.getState().studioComposite, 'RUN_LOGIC')
  assert.equal(useWindows.getState().wins.studio.open, true)
  assert.equal(useWindows.getState().wins.studio.minimized, false)
  useUi.getState().resetToOverview()
}))

test('a missing or damaged saved session leaves the app on the Process display', () => withStorage(store => {
  useUi.getState().resetToOverview()
  assert.equal(restoreUiSession(), false)
  store.set('batchlive-ui-session', '{not json')
  assert.equal(restoreUiSession(), false)
  store.set('batchlive-ui-session', JSON.stringify({ ui: { display: 'nowhere', history: ['nowhere'] }, base: 'process', wins: {} }))
  assert.equal(restoreUiSession(), false)
  assert.equal(useUi.getState().display, 'process')
}))

test('keep-awake asks for a screen wake lock and holds a Web Lock for the life of the page', async () => {
  const calls = []
  const oldNav = Object.getOwnPropertyDescriptor(global, 'navigator'), oldDoc = global.document
  Object.defineProperty(global, 'navigator', { configurable: true, value: {
    wakeLock: { request: async kind => { calls.push(`wake:${kind}`); return { released: false } } },
    locks: { request: (name, cb) => { calls.push(`lock:${name}`); cb(); return Promise.resolve() } }
  } })
  global.document = { visibilityState: 'visible', addEventListener: (type) => calls.push(`listen:${type}`) }
  try {
    startKeepAwake()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(calls.sort(), ['listen:visibilitychange', 'lock:batchlive-keep-alive', 'wake:screen'])
  } finally {
    if (oldNav) Object.defineProperty(global, 'navigator', oldNav); else delete global.navigator
    if (oldDoc === undefined) delete global.document; else global.document = oldDoc
  }
})
