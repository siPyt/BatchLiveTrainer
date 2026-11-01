import { useState } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'
import { useHistorian, HISTORIAN_INPUTS } from '../engine/batchHistorian'

// Course 7016 chapter 14: Batch Historian Properties (General, Input, Output tabs; slides 14-8 .. 14-13).

export const useHistUi = create<{ props: boolean; open: () => void; close: () => void }>(set => ({ props: false, open: () => set({ props: true }), close: () => set({ props: false }) }))
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)

export function HistorianPropsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const cfg = useHistorian(s => s.config)
  const downloaded = useHistorian(s => s.downloaded)
  const [tab, setTab] = useState('General')
  const [enabled, setEnabled] = useState(cfg.enabled)
  const [description, setDescription] = useState(cfg.description)
  const [pick, setPick] = useState<string>(HISTORIAN_INPUTS[0])
  const [path, setPath] = useState('')
  const [size, setSize] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const h = (): ReturnType<typeof useHistorian.getState> => useHistorian.getState()
  const run = (r: { ok: boolean; error?: string }): void => setError(r.ok ? null : (r as { error: string }).error)
  const submit = (): void => {
    if (enabled !== cfg.enabled || description !== cfg.description) h().setEnabled(enabled, description)
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Batch Historian Properties" onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{['General', 'Input', 'Output'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
        <label>Description:<input aria-label="Historian description" value={description} onChange={e => setDescription(e.target.value)} /></label>
        <p className="exp-hint">The Batch Historian runs on an Application Station (here PROPLUS). When the configuration is complete, download the workstation (right-click PROPLUS &gt; Download ▸ Workstation...). {downloaded ? 'Configuration downloaded.' : 'Not downloaded yet.'}</p>
      </>}
      {tab === 'Input' && <>
        <table className="dvx-details" aria-label="Historian inputs"><thead><tr><th>Source</th><th>Node</th><th /></tr></thead><tbody>
          {cfg.inputs.map(i => <tr key={i}><td>{i}</td><td>PROPLUS</td><td><button className="tbtn sm" onClick={() => h().removeInput(i)}>Remove</button></td></tr>)}
          {!cfg.inputs.length && <tr><td colSpan={3} className="dvx-empty">No inputs. Add both the Batch Executive and Alarms And Events.</td></tr>}</tbody></table>
        <label>Source:<select aria-label="Input source" value={pick} onChange={e => setPick(e.target.value)}>{HISTORIAN_INPUTS.map(i => <option key={i}>{i}</option>)}</select></label>
        <div className="dvd-buttons"><button className="tbtn sm" onClick={() => run(h().addInput(pick))}>Add</button></div>
      </>}
      {tab === 'Output' && <>
        <table className="dvx-details" aria-label="Historian outputs"><thead><tr><th>Directory path</th><th>Size (Mb)</th><th /></tr></thead><tbody>
          {cfg.outputs.map(o => <tr key={o.path} data-output={o.path}><td>{o.path}</td><td>{o.sizeMb}</td><td><button className="tbtn sm" onClick={() => h().removeOutput(o.path)}>Remove</button></td></tr>)}
          {!cfg.outputs.length && <tr><td colSpan={3} className="dvx-empty">No output databases.</td></tr>}</tbody></table>
        <label>Directory path:<input aria-label="Output path" value={path} placeholder="C:\DVBatchHistory\Batch_Historian_Databases\db1" onChange={e => setPath(e.target.value)} /></label>
        <label>Size (Mb):<input aria-label="Output size" type="number" value={size} onChange={e => setSize(Number(e.target.value))} /></label>
        <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { const r = h().addOutput(path, size); run(r); if (r.ok) setPath('') }}>Add</button></div>
        <p className="exp-hint">The output directory must be on the Batch Historian&apos;s local drive and not in the DeltaV or DVData paths. The storage locations define the maximum size of DVHISDB.</p>
      </>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    <Err error={error} />
  </SimulatorDialog>
}

export function HistorianDialogHost(): JSX.Element | null {
  const open = useHistUi(s => s.props)
  const close = useHistUi(s => s.close)
  return open ? <HistorianPropsDialog onClose={close} /> : null
}
