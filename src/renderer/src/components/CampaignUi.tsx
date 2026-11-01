import { useState } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'
import { useCampaigns, CAMPAIGN_ACTIONS, CAMPAIGN_STATES, type CampaignState } from '../engine/campaignManager'

// Course 7016 chapter 15: Campaign Manager Properties (General, Server, Action Confirmation; slides 15-8 .. 15-12) and the
// Campaign Manager Client Configuration (General, Column Order, Display Colors; slides 15-13 .. 15-17).

type Which = 'props' | 'clientConfig'
export const useCampUi = create<{ dlg: Which | null; open: (w: Which) => void; close: () => void }>(set => ({ dlg: null, open: dlg => set({ dlg }), close: () => set({ dlg: null }) }))
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)
const Tabs = ({ tabs, tab, onTab }: { tabs: string[]; tab: string; onTab: (t: string) => void }): JSX.Element =>
  <div className="dvd-tabs" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => onTab(t)}>{t}</button>)}</div>

function PropsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const s = useCampaigns()
  const [tab, setTab] = useState('General')
  const [enabled, setEnabled] = useState(s.enabled)
  const [description, setDescription] = useState(s.description)
  const [node, setNode] = useState(s.batchExecutiveNode)
  const [auto, setAuto] = useState(s.autoRemove)
  const [days, setDays] = useState(s.journalDays)
  const [confirm, setConfirm] = useState(s.actionConfirm)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const r = useCampaigns.getState().setProps({ enabled, description, batchExecutiveNode: node, autoRemove: auto, journalDays: days, actionConfirm: confirm })
    if (r.ok) onClose(); else setError(r.error)
  }
  const rule = (key: keyof CampaignState['autoRemove'], label: string): JSX.Element =>
    <div className="dvd-inline" key={key}><label className="lib-dlg-check"><input type="checkbox" aria-label={`Auto remove ${label}`} checked={auto[key].enabled} onChange={e => setAuto({ ...auto, [key]: { ...auto[key], enabled: e.target.checked } })} /> Remove completed batches run in {label} mode after</label>
      <input aria-label={`Delay ${label}`} type="number" style={{ width: 60 }} value={auto[key].delayMin} onChange={e => setAuto({ ...auto, [key]: { ...auto[key], delayMin: Number(e.target.value) } })} /> min</div>
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Campaign Manager Properties" onClose={onClose}>
    <Tabs tabs={['General', 'Server', 'Action Confirmation']} tab={tab} onTab={setTab} />
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Campaign Manager enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
        <label>Description:<input aria-label="Campaign Manager description" value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label>Batch Executive Node:<input aria-label="Batch Executive node" value={node} onChange={e => setNode(e.target.value)} /></label>
        <p className="exp-hint">The Campaign Manager must run on the same node as the Batch Executive.</p>
      </>}
      {tab === 'Server' && <>
        {rule('manual', 'Manual')}{rule('autoRelease', 'Auto-Release')}{rule('autoStart', 'Auto-Start')}
        <label>Remove journal entries older than (days):<input aria-label="Journal days" type="number" value={days} onChange={e => setDays(Number(e.target.value))} /></label>
      </>}
      {tab === 'Action Confirmation' && <table className="dvx-details" aria-label="Campaign action confirmation"><thead><tr><th>Action</th><th>Prompt</th><th>Confirm</th><th>Verify</th></tr></thead><tbody>
        {CAMPAIGN_ACTIONS.map(a => <tr key={a}><td>{a}</td>
          {(['prompt', 'confirm', 'verify'] as const).map(k => <td key={k}><input type="checkbox" aria-label={`${a} ${k}`} checked={confirm[a][k]} onChange={e => setConfirm({ ...confirm, [a]: { ...confirm[a], [k]: e.target.checked, ...(k === 'confirm' && !e.target.checked ? { verify: false } : {}), ...(k === 'verify' && e.target.checked ? { confirm: true } : {}) } })} /></td>)}</tr>)}</tbody></table>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

function ClientDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const c = useCampaigns(s => s.client)
  const [tab, setTab] = useState('General')
  const [v, setV] = useState(c)
  const [error, setError] = useState<string | null>(null)
  const move = (i: number, d: number): void => { const cols = [...v.columns]; const j = i + d; if (j < 0 || j >= cols.length) return; [cols[i], cols[j]] = [cols[j], cols[i]]; setV({ ...v, columns: cols }) }
  const submit = (): void => { const r = useCampaigns.getState().setClientConfig(v); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Campaign Manager Client Configuration" onClose={onClose}>
    <Tabs tabs={['General', 'Column Order', 'Display Colors']} tab={tab} onTab={setTab} />
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Allow local client settings" checked={v.allowLocal} onChange={e => setV({ ...v, allowLocal: e.target.checked })} /> Allow settings to be configured at the local client</label>
        <label>Sequence Length:<input aria-label="Sequence length" type="number" min={1} max={6} value={v.sequenceLength} onChange={e => setV({ ...v, sequenceLength: Number(e.target.value) })} /></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Hide completed batches" checked={v.hideCompleted} onChange={e => setV({ ...v, hideCompleted: e.target.checked })} /> Hide Completed Batches</label>
        <table className="dvx-details" aria-label="Administration actions"><thead><tr><th>Action</th><th>Enable</th></tr></thead><tbody>
          {CAMPAIGN_ACTIONS.map(a => <tr key={a}><td>{a}</td><td><input type="checkbox" aria-label={`Enable ${a}`} checked={v.enabledActions[a] !== false} onChange={e => setV({ ...v, enabledActions: { ...v.enabledActions, [a]: e.target.checked } })} /></td></tr>)}</tbody></table>
        <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setV({ ...v, sequenceLength: 2, hideCompleted: false, allowLocal: true })}>Restore General Defaults</button></div>
      </>}
      {tab === 'Column Order' && <ol aria-label="Columns">{v.columns.map((col, i) => <li key={col}>{col} <button className="tbtn sm" onClick={() => move(i, -1)}>Up</button> <button className="tbtn sm" onClick={() => move(i, 1)}>Down</button></li>)}</ol>}
      {tab === 'Display Colors' && CAMPAIGN_STATES.map(st => <label key={st}>{st}: <input aria-label={`Color ${st}`} type="color" value={v.colors[st] ?? '#888888'} onChange={e => setV({ ...v, colors: { ...v.colors, [st]: e.target.value } })} /></label>)}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

export function CampaignDialogHost(): JSX.Element | null {
  const dlg = useCampUi(s => s.dlg)
  const close = useCampUi(s => s.close)
  if (dlg === 'props') return <PropsDialog onClose={close} />
  if (dlg === 'clientConfig') return <ClientDialog onClose={close} />
  return null
}
