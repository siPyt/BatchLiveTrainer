import { useState } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'

// In-app message boxes. window.alert is routed here (main.tsx) so messages are shown inside BatchLiveTrainer in every
// host: the desktop app, a normal browser, and embedded/automated browsers that suppress native popups.

interface Notice { id: number; text: string }
interface Ask { id: number; text: string; resolve: (ok: boolean) => void }
interface ValueAsk { id: number; text: string; initial: string; resolve: (value: string | null) => void }
interface NoticeState {
  items: Notice[]; asks: Ask[]; valueAsks: ValueAsk[]
  push: (text: string) => void; dismiss: (id: number) => void; answer: (id: number, ok: boolean) => void
  answerValue: (id: number, value: string | null) => void
}
let seq = 0
export const useNotices = create<NoticeState>(set => ({
  items: [],
  asks: [],
  valueAsks: [],
  push: text => set(s => ({ items: [...s.items.slice(-4), { id: ++seq, text }] })),
  dismiss: id => set(s => ({ items: s.items.filter(n => n.id !== id) })),
  answer: (id, ok) => set(s => { s.asks.find(a => a.id === id)?.resolve(ok); return { asks: s.asks.filter(a => a.id !== id) } }),
  answerValue: (id, value) => set(s => { s.valueAsks.find(a => a.id === id)?.resolve(value); return { valueAsks: s.valueAsks.filter(a => a.id !== id) } })
}))

/** In-app replacement for window.confirm (native popups are suppressed in some hosts): resolves true on OK. */
export function askConfirm(text: string): Promise<boolean> {
  return new Promise(resolve => useNotices.setState(s => ({ asks: [...s.asks, { id: ++seq, text, resolve }] })))
}

/** In-app replacement for window.prompt (Electron does not support it): resolves the entered text, or null on Cancel. */
export function askValue(text: string, initial = ''): Promise<string | null> {
  return new Promise(resolve => useNotices.setState(s => ({ valueAsks: [...s.valueAsks, { id: ++seq, text, initial, resolve }] })))
}

function ValuePrompt({ ask, onAnswer }: { ask: ValueAsk; onAnswer: (value: string | null) => void }): JSX.Element {
  const [value, setValue] = useState(ask.initial)
  return <SimulatorDialog className="module-download-dialog dvd app-notice" label="BatchLiveTrainer" onClose={() => onAnswer(null)}>
    <form onSubmit={e => { e.preventDefault(); onAnswer(value) }}>
      <label data-app-prompt style={{ display: 'block', whiteSpace: 'pre-wrap', maxWidth: 560, marginBottom: 8 }}>{ask.text}
        <input aria-label="Value" autoFocus style={{ display: 'block', marginTop: 6, width: '100%' }} value={value}
          onChange={e => setValue(e.target.value)} onFocus={e => e.target.select()} />
      </label>
      <div className="lib-dlg-buttons" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="submit" className="tbtn sm">OK</button>
        <button type="button" className="tbtn sm" onClick={() => onAnswer(null)}>Cancel</button>
      </div>
    </form>
  </SimulatorDialog>
}

export function NoticeHost(): JSX.Element | null {
  const items = useNotices(s => s.items)
  const asks = useNotices(s => s.asks)
  const valueAsks = useNotices(s => s.valueAsks)
  const dismiss = useNotices(s => s.dismiss)
  const answer = useNotices(s => s.answer)
  const answerValue = useNotices(s => s.answerValue)
  const valueAsk = valueAsks[0]
  if (valueAsk) return <ValuePrompt key={valueAsk.id} ask={valueAsk} onAnswer={v => answerValue(valueAsk.id, v)} />
  const ask = asks[0]
  if (ask) return <SimulatorDialog className="module-download-dialog dvd app-notice" label="BatchLiveTrainer" onClose={() => answer(ask.id, false)}>
    <p data-app-confirm style={{ whiteSpace: 'pre-wrap', maxWidth: 560 }}>{ask.text}</p>
    <div className="lib-dlg-buttons" style={{ justifyContent: 'flex-end', gap: 8 }}>
      <button className="tbtn sm" autoFocus onClick={() => answer(ask.id, true)}>OK</button>
      <button className="tbtn sm" onClick={() => answer(ask.id, false)}>Cancel</button>
    </div>
  </SimulatorDialog>
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
