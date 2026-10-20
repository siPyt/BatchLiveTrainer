import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'

// In-app message boxes. window.alert is routed here (main.tsx) so messages are shown inside BatchLiveTrainer in every
// host: the desktop app, a normal browser, and embedded/automated browsers that suppress native popups.

interface Notice { id: number; text: string }
interface NoticeState { items: Notice[]; push: (text: string) => void; dismiss: (id: number) => void }
let seq = 0
export const useNotices = create<NoticeState>(set => ({
  items: [],
  push: text => set(s => ({ items: [...s.items.slice(-4), { id: ++seq, text }] })),
  dismiss: id => set(s => ({ items: s.items.filter(n => n.id !== id) }))
}))

export function NoticeHost(): JSX.Element | null {
  const items = useNotices(s => s.items)
  const dismiss = useNotices(s => s.dismiss)
  const top = items.at(-1)
  if (!top) return null
  return <SimulatorDialog className="module-download-dialog dvd app-notice" label="BatchLiveTrainer" onClose={() => dismiss(top.id)}>
    <p data-app-notice style={{ whiteSpace: 'pre-wrap', maxWidth: 520 }}>{top.text}</p>
    <div className="lib-dlg-buttons" style={{ justifyContent: 'flex-end' }}>
      <button className="tbtn sm" autoFocus onClick={() => dismiss(top.id)}>OK</button>
    </div>
  </SimulatorDialog>
}

/** In-app OK / Cancel confirmation (used where a native confirm() could be suppressed by the host). */
export function ConfirmDialog({ title, text, okLabel = 'OK', onOk, onClose }: { title: string; text: string; okLabel?: string; onOk: () => void; onClose: () => void }): JSX.Element {
  return <SimulatorDialog className="module-download-dialog dvd" label={title} onClose={onClose}>
    <p data-confirm-text style={{ whiteSpace: 'pre-wrap', maxWidth: 560 }}>{text}</p>
    <div className="lib-dlg-buttons" style={{ justifyContent: 'flex-end', gap: 8 }}>
      <button className="tbtn sm" onClick={() => { onClose(); onOk() }}>{okLabel}</button>
      <button className="tbtn sm" autoFocus onClick={onClose}>Cancel</button>
    </div>
  </SimulatorDialog>
}
