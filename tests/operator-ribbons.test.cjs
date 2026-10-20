const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText, filename)
  }
}
const store = require('../src/renderer/src/engine/store.ts')
const ui = require('../src/renderer/src/ui/uiStore.ts')
const useStore = store.useStore
const useUi = ui.useUi
const { DISPLAY_NAVIGATION } = require('../src/renderer/src/ui/displayNavigation.ts')
const { TopBar } = require('../src/renderer/src/components/TopBar.tsx')
const { NavSidebar } = require('../src/renderer/src/components/NavSidebar.tsx')
const { App } = require('../src/renderer/src/App.tsx')

function render(Component, props) {
  const hooks = [
    test.mock.method(store, 'useStore', selector => selector(useStore.getState())),
    test.mock.method(ui, 'useUi', selector => selector(useUi.getState()))
  ]
  try {
    return renderToStaticMarkup(React.createElement(Component, props))
  } finally {
    hooks.forEach(hook => hook.mock.restore())
  }
}

const SITE_DISPLAYS = ['overview', 'plant-map', 'photo-overview', 'photo-n3', 'photo-n1', 'photo-n1bp', 'photo-still', 'feed', 'reactor',
  'product', 'wfi', 'autoclave', 'lyo', 'cip', 'tcu', 'pwaste', 'batch']

test('three ribbon bands expose every display and preserve the excluded branding', () => {
  const html = render(TopBar)
  assert.equal((html.match(/role="toolbar"/g) || []).length, 3)
  for (const label of ['Operator utilities', 'Display actions', 'Picture navigation', 'Current display',
    'Back', 'Forward', 'Up to Process', 'Home display', 'Search displays and modules']) {
    assert.ok(html.includes(`aria-label="${label}"`), label)
  }
  assert.equal(new Set(DISPLAY_NAVIGATION.map(display => display.id)).size, 14)
  for (const display of DISPLAY_NAVIGATION) assert.ok(html.includes(`value="${display.id}"`), display.id)
  assert.match(html, /class="brand-name">BatchLiveTrainer<\/span>/)
  assert.match(html, /class="brand-credit">Charles R\. Freeman, software engineer<\/span>/)
})

test('BatchLiveTrainer shows only the Course 7016 displays: no BatchLive site areas, pictures or presets', () => {
  const ids = DISPLAY_NAVIGATION.map(display => display.id)
  for (const id of SITE_DISPLAYS) assert.ok(!ids.includes(id), id)
  assert.deepEqual(DISPLAY_NAVIGATION.filter(display => display.operator).map(display => display.id), ['process', 'batchhelp'])
  const top = render(TopBar)
  for (const text of ['Plant Overview', 'GMP Pharma', 'New Blank Project', 'DV-09', 'Batch Operator']) assert.ok(!top.includes(text), text)
  assert.ok(top.includes('Course 7016 Workshops'))
  const nav = render(NavSidebar)
  for (const text of ['Plant Overview', 'Feed System', 'Reactor', 'WFI', 'Autoclaves', 'Lyophilizers', 'CIP', 'TCUs', 'Process Waste', 'GMP Pharma', 'DV-09'])
    assert.ok(!nav.includes(text), text)
  assert.ok(nav.includes('Process (ED_CENTER_BATCH)') && nav.includes('BatchHelp'))
  assert.equal(useUi.getState().display, 'process', 'the Process picture is the home display')
})

test('operator layout places the alarm banner below the working area with an optional sidebar', () => {
  const before = ui.useUi.getState()
  try {
    ui.useUi.setState({ navigationOpen: false })
    const html = render(App)
    assert.ok(html.indexOf('operator-ribbons') < html.indexOf('app-body'))
    assert.ok(html.indexOf('app-body') < html.indexOf('alarm-banner'))
    assert.ok(html.indexOf('alarm-banner') < html.indexOf('statusbar'))
    assert.ok(!html.includes('class="nav-sidebar"'))
    ui.useUi.getState().toggleNavigation()
    assert.ok(render(App).includes('class="nav-sidebar"'))
  } finally {
    ui.useUi.setState(before, true)
  }
})

test('picture navigation and reset affect UI only, never live process state or faceplates', () => {
  const engine = store.useStore.getState()
  const before = ui.useUi.getState()
  try {
    ui.useUi.setState({ display: 'process', history: ['process'], histIndex: 0, pictureHistory: [null],
      faceplates: [{ tag: 'LI-104', x: 50, y: 50 }] })
    const s = ui.useUi.getState()
    s.navigate('batchhelp')
    s.navigate('explorer')
    s.back()
    assert.equal(ui.useUi.getState().display, 'batchhelp')
    s.forward()
    assert.equal(ui.useUi.getState().display, 'explorer')
    const revision = ui.useUi.getState().processViewRevision
    s.resetProcessView()
    assert.equal(ui.useUi.getState().processViewRevision, revision + 1)
    assert.deepEqual(ui.useUi.getState().faceplates, [{ tag: 'LI-104', x: 50, y: 50 }])
    assert.equal(store.useStore.getState(), engine)
  } finally {
    ui.useUi.setState(before, true)
  }
})
