import { useState } from 'react'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { useCampaigns, CAMPAIGN_ACTIONS, type CampaignAction, type CampaignMode, type CampRecipe } from '../engine/campaignManager'
import { useExecutive } from '../engine/executive'
import { useBatch } from '../engine/batchStore'

// Course 7016 chapter 15: the Campaign Manager Operator Interface (slides 15-18 .. 15-34).

const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)
const C = (): ReturnType<typeof useCampaigns.getState> => useCampaigns.getState()
const fmt = (t: number): string => new Date(t).toLocaleTimeString('en-US')

/** Recipe, unit binding, formula (with its parameters) and scale: slides 15-24, 15-27. */
function RecipePicker({ value, onChange, label }: { value: CampRecipe; onChange: (v: CampRecipe) => void; label: string }): JSX.Element {
  const downloaded = useExecutive(s => s.downloaded)
  const bindingsNeeded = useExecutive(s => s.bindingsNeeded)
  const units = useBatch(s => s.units)
  const r = downloaded[value.recipe]?.recipe
  const needs = value.recipe ? bindingsNeeded(value.recipe) : []
  const [showParams, setShowParams] = useState(false)
  const f = r && value.formula ? r.formulas[value.formula] : undefined
  return <fieldset className="lib-dlg-props"><legend>{label}</legend>
    <label>Base recipe:<select aria-label={`${label} recipe`} value={value.recipe} onChange={e => onChange({ ...value, recipe: e.target.value, formula: '', bindings: {} })}>
      <option value="" />{Object.keys(downloaded).sort().map(n => <option key={n}>{n}</option>)}</select></label>
    {needs.map(n => <label key={n.key}>Unit binding {n.label}:<select aria-label={`${label} bind ${n.label}`} value={n.fixed || value.bindings[n.key] || ''} disabled={!!n.fixed}
      onChange={e => onChange({ ...value, bindings: { ...value.bindings, [n.key]: e.target.value } })}><option value="" />{Object.values(units).filter(u => u.unitClass === n.unitClass).map(u => <option key={u.name}>{u.name}</option>)}</select></label>)}
    <label>Formula:<select aria-label={`${label} formula`} value={value.formula} onChange={e => onChange({ ...value, formula: e.target.value })}><option value="" />{Object.keys(r?.formulas ?? {}).map(n => <option key={n}>{n}</option>)}</select></label>
    <label>Scale:<input aria-label={`${label} scale`} type="number" step="0.1" value={value.scale} onChange={e => onChange({ ...value, scale: Number(e.target.value) })} /></label>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={!f} onClick={() => setShowParams(v => !v)}>View Parameters</button></div>
    {showParams && f && <table className="dvx-details" aria-label="Formula parameters"><tbody>{Object.entries(f.values).map(([k, v]) => <tr key={k}><td>{k}</td><td>{String(v.value)}{v.useDefault ? ' (default)' : ''}</td></tr>)}</tbody></table>}
  </fieldset>
}

export function CampaignManagerDisplay(): JSX.Element {
  const s = useCampaigns()
  const [server, setServer] = useState('PROPLUS')
  const [connected, setConnected] = useState(false)
  const [selC, setSelC] = useState<string | null>(null)
  const [selB, setSelB] = useState<string | null>(null)
  const [dlg, setDlg] = useState<'new' | 'edit' | 'comment' | null>(null)
  const [nc, setNc] = useState({ name: '', nBatches: 2, maxActive: 1 })
  const [base, setBase] = useState<CampRecipe>({ recipe: '', formula: '', bindings: {}, scale: 1 })
  const [setup, setSetup] = useState<CampRecipe | null>(null)
  const [cleanup, setCleanup] = useState<CampRecipe | null>(null)
  const [edit, setEdit] = useState<CampRecipe>({ recipe: '', formula: '', bindings: {}, scale: 1 })
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const camp = selC ? s.campaigns[selC] : undefined
  const batch = camp?.batches.find(b => b.id === selB)
  const on = (a: CampaignAction): boolean => s.client.enabledActions[a] !== false
  const run = (r: { ok: boolean; error?: string }): boolean => { setError(r.ok ? null : (r as { error: string }).error); return r.ok }
  const connect = (): void => {
    if (!s.enabled) { setError('The Campaign Manager is not enabled'); return }
    if (s.service !== 'RUNNING') { setError('The Campaign Manager service is not running: start it in the Batch Application Manager (Campaign Manager tab)'); return }
    setConnected(true); setError(null)
  }
  const mode = (m: CampaignMode): void => { if (camp) run(C().setMode(camp.name, m)) }
  const btn = (label: string, action: CampaignAction, disabled: boolean, fn: () => void): JSX.Element =>
    <button className="tbtn sm" aria-label={label} disabled={!connected || disabled || !on(action)} title={on(action) ? undefined : 'Not enabled in the Client Configuration'} onClick={fn}>{label}</button>
  const visible = camp ? camp.batches.filter(b => !(s.client.hideCompleted && C().stateOf(camp.name, b.id) === 'Complete')) : []
  return <div className="display campaigns" data-display="CampaignManagerOI">
    <div className="rs-title">Campaign Manager Operator Interface</div>
    <div className="rs-toolbar">
      <label>Campaign Manager Server Name:<input aria-label="Campaign Manager server name" value={server} disabled={connected} onChange={e => setServer(e.target.value)} /></label>
      {!connected ? <button className="tbtn sm" onClick={connect}>Connect</button> : <button className="tbtn sm" onClick={() => setConnected(false)}>Disconnect</button>}
      <span data-camp-status>{connected ? `Connected to ${server}` : 'Not connected'}</span>
    </div>
    <div className="rs-toolbar" role="toolbar" aria-label="Campaign toolbar">
      {btn('New Campaign', 'New Campaign', false, () => { setNc({ name: '', nBatches: 2, maxActive: 1 }); setBase({ recipe: '', formula: '', bindings: {}, scale: 1 }); setSetup(null); setCleanup(null); setError(null); setDlg('new') })}
      {btn('Remove Campaign', 'Remove Campaign', !camp, () => { if (camp && run(C().removeCampaign(camp.name))) setSelC(null) })}
      {btn('Terminate Campaign', 'Terminate Campaign', !camp, () => camp && run(C().terminateCampaign(camp.name)))}
      {btn('Campaign Comment', 'Add Campaign Comment', !camp, () => { setText(''); setDlg('comment') })}
      {btn('Manual Mode', 'Set Campaign Mode', !camp, () => mode('Manual'))}
      {btn('Auto Release Mode', 'Set Campaign Mode', !camp, () => mode('Auto Release'))}
      {btn('Auto Start Mode', 'Set Campaign Mode', !camp, () => mode('Auto Start'))}
      {btn('New Batch', 'New Batch', !camp, () => camp && run(C().newBatch(camp.name)))}
      {btn('Delete Batch', 'Delete Batch', !batch, () => camp && batch && run(C().deleteBatch(camp.name, batch.id)))}
      {btn('Edit Batch', 'Edit Batch', !batch, () => { if (batch) { setEdit({ recipe: batch.recipe, formula: batch.formula, bindings: { ...batch.bindings }, scale: batch.scale }); setError(null); setDlg('edit') } })}
      {btn('Add Batch to Executive', 'Add Batch to Executive', !batch, () => camp && batch && run(C().release(camp.name, batch.id)))}
      {btn('Start Batch', 'Start Batch', !batch, () => camp && batch && run(C().startBatch(camp.name, batch.id)))}
      {btn('Remove Batch from Executive', 'Remove Batch from Executive', !batch, () => camp && batch && run(C().removeFromExecutive(camp.name, batch.id)))}
    </div>
    <Err error={error} />
    <div className="rs-body">
      <div className="rs-side" style={{ minWidth: 300 }}>
        <table className="dvx-details" aria-label="Campaigns"><thead><tr><th>Campaign</th><th>Mode</th><th>Batches</th><th>Max active</th></tr></thead><tbody>
          {connected && Object.values(s.campaigns).map(c => <tr key={c.name} data-campaign={c.name} className={selC === c.name ? 'sel' : undefined} onClick={() => { setSelC(c.name); setSelB(null) }}>
            <td>{c.name}{c.terminated ? ' (terminated)' : ''}</td><td>{c.mode}</td><td>{c.batches.length}</td><td>{c.maxActive}</td></tr>)}
          {(!connected || !Object.keys(s.campaigns).length) && <tr><td colSpan={4} className="dvx-empty">{connected ? 'No campaigns. Use New Campaign.' : 'Enter the Campaign Manager server name and connect.'}</td></tr>}</tbody></table>
      </div>
      <div className="rs-side" style={{ flex: 1 }}>
        {camp && <table className="dvx-details" aria-label="Campaign batches"><thead><tr><th>Batch ID</th><th>Type</th><th>State</th><th>Recipe</th><th>Formula</th><th>Units</th><th>Scale</th></tr></thead><tbody>
          {visible.map(b => { const st = C().stateOf(camp.name, b.id); return <tr key={b.id} data-camp-batch={b.id} data-camp-state={st} className={selB === b.id ? 'sel' : undefined} onClick={() => setSelB(b.id)}>
            <td>{b.id}</td><td>{b.kind}</td><td style={{ color: s.client.colors[st] }}>{st}</td><td>{b.recipe}</td><td>{b.formula}</td><td>{Object.values(b.bindings).join(', ')}</td><td>{b.scale}</td></tr> })}</tbody></table>}
        {camp && <ul aria-label="Campaign comments">{camp.comments.map((c, i) => <li key={i}>{fmt(c.at)} · {c.user} · {c.text}</li>)}</ul>}
      </div>
    </div>
    {dlg === 'new' && <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-action-dialog" label="Create Campaign" onClose={() => setDlg(null)}>
      <div className="lib-dlg-fields dvd-panel">
        <label>Campaign Name:<input aria-label="Campaign name" autoFocus value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} /></label>
        <label>Number of Batches:<input aria-label="Number of batches" type="number" value={nc.nBatches} onChange={e => setNc({ ...nc, nBatches: Number(e.target.value) })} /></label>
        <label>Maximum Number of Active Batches:<input aria-label="Maximum active batches" type="number" value={nc.maxActive} onChange={e => setNc({ ...nc, maxActive: Number(e.target.value) })} /></label>
        <RecipePicker label="Base" value={base} onChange={setBase} />
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Setup batch" checked={!!setup} onChange={e => setSetup(e.target.checked ? { ...base } : null)} /> Setup batch (started first)</label>
        {setup && <RecipePicker label="Setup" value={setup} onChange={setSetup} />}
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Cleanup batch" checked={!!cleanup} onChange={e => setCleanup(e.target.checked ? { ...base } : null)} /> Cleanup batch (started after all other batches)</label>
        {cleanup && <RecipePicker label="Cleanup" value={cleanup} onChange={setCleanup} />}
      </div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { if (run(C().createCampaign({ ...nc, ...base, setup, cleanup }))) { setSelC(nc.name.trim()); setSelB(null); setDlg(null) } }}>Create</button><button className="tbtn sm" onClick={() => setDlg(null)}>Cancel</button></div><Err error={error} />
    </SimulatorDialog>}
    {dlg === 'edit' && camp && batch && <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`Edit Batch ${batch.id}`} onClose={() => setDlg(null)}>
      <div className="lib-dlg-fields dvd-panel"><RecipePicker label="Batch" value={edit} onChange={setEdit} /></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { if (run(C().editBatch(camp.name, batch.id, edit))) setDlg(null) }}>OK</button><button className="tbtn sm" onClick={() => setDlg(null)}>Cancel</button></div><Err error={error} />
    </SimulatorDialog>}
    {dlg === 'comment' && camp && <SimulatorDialog className="module-download-dialog dvd" label="Campaign Comment" onClose={() => setDlg(null)}>
      <div className="lib-dlg-fields dvd-panel"><label>Comment:<textarea aria-label="Campaign comment" rows={3} autoFocus value={text} onChange={e => setText(e.target.value)} /></label></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { if (run(C().addComment(camp.name, text))) setDlg(null) }}>OK</button><button className="tbtn sm" onClick={() => setDlg(null)}>Cancel</button></div><Err error={error} />
    </SimulatorDialog>}
    <div className="rs-status"><span>{CAMPAIGN_ACTIONS.filter(a => on(a)).length} of {CAMPAIGN_ACTIONS.length} actions enabled</span></div>
  </div>
}
