const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, filename)
}
const { useBatch } = require('../src/renderer/src/engine/batchStore.ts')
const { useUi } = require('../src/renderer/src/ui/uiStore.ts')
const { unsavedStudioWork, confirmCloseStudio, useSaveReminder } = require('../src/renderer/src/components/StudioSaveReminder.tsx')

async function withPhase(fn) {
  const before = useBatch.getState()
  try {
    useBatch.getState().newCategory('phase', null)
    assert.equal(useBatch.getState().newPhaseClass('NewCategory', 'REMIND').ok, true)
    useUi.getState().openPhaseStudio('REMIND')
    await fn()
  } finally {
    useUi.getState().closePhaseStudio()
    useUi.getState().resetToOverview()
    useBatch.setState(before, true)
  }
}
const edit = () => useBatch.getState().editPhaseDraft('REMIND', d => { d.logic.RUN_LOGIC.steps[0].description = 'changed' })

test('Control Studio close: nothing unsaved closes at once, no reminder shown', async () => withPhase(async () => {
  assert.equal(unsavedStudioWork(), null)
  assert.equal(await confirmCloseStudio(), true)
  assert.equal(useSaveReminder.getState().pending, null)
}))

test('Control Studio close with unsaved changes shows the Ctrl+S reminder; staying keeps the changes', async () => withPhase(async () => {
  assert.equal(edit().ok, true)
  assert.match(unsavedStudioWork().label, /phase class REMIND/)
  const answer = confirmCloseStudio()
  const pending = useSaveReminder.getState().pending
  assert.ok(pending, 'the reminder is waiting for an answer')
  assert.match(pending.label, /REMIND/)
  pending.resolve(false)
  assert.equal(await answer, false, 'Back to Control Studio keeps the window open')
  assert.equal(useSaveReminder.getState().pending, null)
  assert.ok(useBatch.getState().phaseDrafts.REMIND, 'the unsaved changes are still there')
}))

test('Closing without saving discards the unsaved changes, so the reminder text is true; saving first closes without a reminder', async () => withPhase(async () => {
  assert.equal(edit().ok, true)
  const answer = confirmCloseStudio()
  useSaveReminder.getState().pending.resolve(true)
  assert.equal(await answer, true)
  assert.equal(useBatch.getState().phaseDrafts.REMIND, undefined, 'the unsaved draft is gone')

  assert.equal(edit().ok, true)
  assert.equal(useBatch.getState().savePhaseClass('REMIND').ok, true)
  assert.equal(unsavedStudioWork(), null, 'after Ctrl+S / File > Save nothing is unsaved')
  assert.equal(await confirmCloseStudio(), true)
}))
