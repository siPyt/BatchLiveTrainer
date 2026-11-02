// Shared test fixture for course DV-09 chapters. Usage in a chapter test:
//   const { fixture, M, L } = require('./helpers/dv09-fixture.cjs')
//   test('...', () => fixture(2, ctx => { ... }))      // 2 = start from the finished state of chapters 1-2
// A chapter N setup lives in tests/helpers/dv09-chN-setup.cjs: module.exports = function (ctx) { ...store API... }
// with module.exports.needs = ['engineModuleName', ...] for engine modules it reaches through ctx.eng(name).
// Setups use only the store API so the same files run inside the browser app (tests/../pw16/seed-dv09.mjs).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, filename)
}
const engine = name => require(`../../src/renderer/src/engine/${name}.ts`)
const { useStore } = engine('store')
const { useLibrary } = engine('libraryStore')
const { useBatch } = engine('batchStore')
const { useEm } = engine('emStore')
const { useSecurity } = engine('security')
const { useSystem } = engine('systemPreferences')
const M = () => useStore.getState(), L = () => useLibrary.getState()

function setupFile(n) {
  const p = path.join(__dirname, `dv09-ch${n}-setup.cjs`)
  return fs.existsSync(p) ? require(p) : null
}

/** Fresh DV-09 project, then the setups of chapters 1..through, then fn(ctx). Every store is restored afterwards. */
function fixture(through, fn) {
  const stores = [useStore, useLibrary, useBatch, useEm, useSecurity, useSystem]
  const before = stores.map(s => s.getState())
  const win = global.window, storage = global.localStorage
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { localStorage: global.localStorage, alert: () => {}, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, workstation: null })
    assert.equal(L().installDv09Project(), true)
    const ctx = { M, L, useStore, eng: engine, assert }
    for (let n = 1; n <= through; n++) { const s = setupFile(n); if (s) s(ctx) }
    return fn(ctx)
  } finally {
    stores.forEach((s, i) => s.setState(before[i], true))
    if (win === undefined) delete global.window; else global.window = win
    if (storage === undefined) delete global.localStorage; else global.localStorage = storage
  }
}

module.exports = { fixture, M, L, engine, useStore, useLibrary, useSecurity, useSystem, setupFile }
