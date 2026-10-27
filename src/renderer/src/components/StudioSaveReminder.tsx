import { useEffect } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'
import { useUi } from '../ui/uiStore'
import { useBatch } from '../engine/batchStore'
import { useEm } from '../engine/emStore'
import { useLibrary } from '../engine/libraryStore'

// TRAINING AID, NOT DELTAV: when the Control Studio window is about to be closed with unsaved work, remind the student to
// press Ctrl+S. (Real DeltaV asks "Save changes?" instead.) Closing without saving discards the unsaved work, so the
// message is true.

export interface UnsavedWork { label: string; discard: () => void }

/** The Control Studio item that has unsaved changes right now (phase class, control module class or equipment module class). */
export function unsavedStudioWork(): UnsavedWork | null {
  const ui = useUi.getState()
  if (ui.studioPhase && useBatch.getState().phaseDrafts[ui.studioPhase]) {
    const name = ui.studioPhase
    return { label: `phase class ${name}`, discard: () => { useBatch.getState().discardPhaseDraft(name) } }
  }
  if (ui.studioEm && !ui.studioEm.instance && useEm.getState().drafts[ui.studioEm.className]) {
    const name = ui.studioEm.className
    return { label: `equipment module class ${name}`, discard: () => useEm.getState().discardDraft(name) }
  }
  if (ui.studioClass && useLibrary.getState().drafts[ui.studioClass]) {
    const name = ui.studioClass
    return { label: `class ${name}`, discard: () => useLibrary.getState().discardDraft(name) }
  }
  return null
}

interface ReminderState { pending: { label: string; resolve: (close: boolean) => void } | null }
export const useSaveReminder = create<ReminderState>(() => ({ pending: null }))

/**
 * Call before closing the Control Studio window. Resolves true when it is fine to close (nothing unsaved, or the student
 * chose to close without saving - the unsaved work is then discarded) and false when the student stays to save.
 */
export function confirmCloseStudio(): Promise<boolean> {
  const work = unsavedStudioWork()
  if (!work) return Promise.resolve(true)
  return new Promise(resolve => useSaveReminder.setState({
    pending: { label: work.label, resolve: close => { if (close) work.discard(); useSaveReminder.setState({ pending: null }); resolve(close) } }
  }))
}

export function SaveReminderHost(): JSX.Element | null {
  const pending = useSaveReminder(s => s.pending)
  // Re-render when any draft or the open Control Studio item changes, so saving (Ctrl+S) dismisses the reminder.
  useBatch(s => s.phaseDrafts); useEm(s => s.drafts); useLibrary(s => s.drafts)
  useUi(s => s.studioPhase); useUi(s => s.studioClass); useUi(s => s.studioEm)
  const saved = !!pending && unsavedStudioWork() === null
  useEffect(() => { if (saved) pending?.resolve(false) }, [saved, pending])
  if (!pending || saved) return null
  return <SimulatorDialog className="module-download-dialog dvd app-notice save-reminder" label="Control Studio" onClose={() => pending.resolve(false)}>
    <p data-save-reminder style={{ whiteSpace: 'pre-wrap', maxWidth: 520, margin: '0 0 6px' }}>
      <b>Press Ctrl+S</b> to save your changes in Control Studio, or the unsaved changes will be lost.
    </p>
    <p className="exp-hint" style={{ margin: '0 0 8px' }}>Unsaved: {pending.label}. You can also use File &#8594; Save.</p>
    <div className="lib-dlg-buttons" style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
      <button type="button" className="tbtn sm" autoFocus onClick={() => pending.resolve(false)}>Back to Control Studio</button>
      <button type="button" className="tbtn sm" onClick={() => pending.resolve(true)}>Close without saving</button>
    </div>
  </SimulatorDialog>
}
