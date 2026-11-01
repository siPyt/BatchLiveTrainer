import { useState } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'
import { askConfirm } from './AppNotices'
import { useVc, nameOf, kindOf, VC_LOCKS, type VcPreference, type VcSigner } from '../engine/versionControl'
import { useSystem } from '../engine/systemPreferences'

// Course 7016 chapter 13: Version Control dialogs (Database Administrator configuration and snapshot, Check In, Show History,
// Show Differences, labels, search, reports and recipe signatures) and the "Version Control" entries of the Explorer context menus.

export type VcDlg =
  | { t: 'config' } | { t: 'signers' } | { t: 'snapshot' } | { t: 'messages' } | { t: 'preferences' } | { t: 'approvals' }
  | { t: 'checkIn'; key: string } | { t: 'history'; key: string } | { t: 'diff'; key: string; a: number | 'current'; b: number | 'current'; back?: boolean }
  | { t: 'details'; key: string; n: number; back?: boolean } | { t: 'view'; key: string; n: number; back?: boolean } | { t: 'label'; key: string } | { t: 'search'; key: string }
  | { t: 'report'; key: string } | { t: 'sign'; recipe: string; approve: boolean }

export const useVcUi = create<{ dlg: VcDlg | null; open: (d: VcDlg) => void; close: () => void }>(set => ({ dlg: null, open: dlg => set({ dlg }), close: () => set({ dlg: null }) }))

type MenuItem = { label: string; onClick?: () => void; disabled?: string; separator?: boolean; danger?: boolean }
const fmt = (t: number): string => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)
const Buttons = ({ onOk, onClose, ok = 'OK' }: { onOk?: () => void; onClose: () => void; ok?: string }): JSX.Element =>
  <div className="dvd-buttons">{onOk && <button className="tbtn sm" onClick={onOk}>{ok}</button>}<button className="tbtn sm" onClick={onClose}>{onOk ? 'Cancel' : 'Close'}</button></div>

/** Version Control entries of a context menu; empty while Version Control is disabled. */
export function vcMenuItems(key: string): MenuItem[] {
  const vc = useVc.getState()
  if (!vc.enabled) return []
  const open = useVcUi.getState().open
  const run = (fn: () => { ok: boolean; error?: string }): void => { const r = fn(); if (!r.ok) window.alert((r as { error: string }).error) }
  const out = vc.items[key]?.checkedOutBy
  return [
    { label: '', separator: true },
    { label: 'Version Control ▸ Check Out', disabled: out ? `Checked out by ${out}` : undefined, onClick: () => run(() => useVc.getState().checkOut(key)) },
    { label: 'Version Control ▸ Check Out Recursive', onClick: () => run(() => useVc.getState().checkOut(key, true)) },
    { label: 'Version Control ▸ Check In...', onClick: () => open({ t: 'checkIn', key }) },
    { label: 'Version Control ▸ Undo Check Out', onClick: () => run(() => useVc.getState().undoCheckOut(key)) },
    { label: 'Version Control ▸ Show History', onClick: () => open({ t: 'history', key }) },
    { label: 'Version Control ▸ Show Differences', onClick: () => open({ t: 'diff', key, a: Math.max(1, useVc.getState().items[key]?.versions.length ?? 1), b: 'current' }) },
    { label: 'Version Control ▸ Set Label...', onClick: () => open({ t: 'label', key }) },
    { label: 'Version Control ▸ Search...', onClick: () => open({ t: 'search', key }) },
    { label: 'Version Control ▸ History Report...', onClick: () => open({ t: 'report', key }) },
    { label: 'Version Control ▸ Messages', onClick: () => open({ t: 'messages' }) },
    { label: 'Version Control ▸ Preferences...', onClick: () => open({ t: 'preferences' }) }
  ]
}

/** Recipe authorization entries (slides 13-56 .. 13-58). */
export function recipeAuthItems(recipe: string): MenuItem[] {
  const vc = useVc.getState()
  if (!vc.enabled || !vc.authorization) return []
  const open = useVcUi.getState().open
  return [
    { label: 'Recipe Authorization ▸ Approve...', onClick: () => open({ t: 'sign', recipe, approve: true }) },
    { label: 'Recipe Authorization ▸ Reject...', onClick: () => open({ t: 'sign', recipe, approve: false }) },
    { label: 'Recipe Authorization ▸ Approval Report', onClick: () => open({ t: 'approvals' }) }
  ]
}

// ---- Database Administrator ---------------------------------------------------------------------------------------------------

export function VcConfigDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const vc = useVc()
  const [enabled, setEnabled] = useState(vc.enabled)
  const [displays, setDisplays] = useState(vc.displays)
  const [auth, setAuth] = useState(vc.authorization)
  const [propagate, setPropagate] = useState(vc.propagate)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const a = useVc.getState().configure({ enabled, displays })
    if (!a.ok) { setError(a.error); return }
    if (enabled) {
      const b = useVc.getState().setAuthorization(auth, vc.signers, propagate)
      if (!b.ok) { setError(b.error); return }
    }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Version Control Configuration" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable Version Control" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable Version Control</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable Version Control for DeltaV Displays" checked={displays} disabled={!enabled} onChange={e => setDisplays(e.target.checked)} /> Enable Version Control for DeltaV Displays</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Recipes must be authorized before downloading" checked={auth} disabled={!enabled} onChange={e => setAuth(e.target.checked)} /> Recipes must be authorized before downloading</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable signature propagation to referenced recipes" checked={propagate} disabled={!enabled || !auth} onChange={e => setPropagate(e.target.checked)} /> Enable signature propagation to referenced recipes</label>
      <div className="dvd-buttons"><button className="tbtn sm" disabled={!enabled || !auth} onClick={() => useVcUi.getState().open({ t: 'signers' })}>Signers...</button></div>
      <p className="exp-hint">All database clients must be closed before Version Control can be enabled or disabled. Enabling synchronizes the Version Control database with the configuration database and shuts the Database Server down: use File &gt; Connect to Server afterwards.</p>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

export function VcSignersDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const vc = useVc()
  const [signers, setSigners] = useState<VcSigner[]>(vc.signers.map(s => ({ ...s })))
  const [error, setError] = useState<string | null>(null)
  const used = signers.map(s => s.lock)
  const submit = (): void => {
    const r = useVc.getState().setAuthorization(vc.authorization, signers, vc.propagate)
    if (r.ok) onClose(); else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Recipe Authorization Signers" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <table className="dvx-details" aria-label="Signers"><thead><tr><th>Signer description</th><th>Function lock</th><th /></tr></thead><tbody>
        {signers.map((s, i) => <tr key={i}>
          <td><input aria-label={`Signer name ${i + 1}`} value={s.name} onChange={e => setSigners(signers.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)))} /></td>
          <td><select aria-label={`Signer lock ${i + 1}`} value={s.lock} onChange={e => setSigners(signers.map((x, j) => (j === i ? { ...x, lock: e.target.value } : x)))}>
            <option value="" />{VC_LOCKS.filter(l => l === s.lock || !used.includes(l)).map(l => <option key={l}>{l}</option>)}</select></td>
          <td><button className="tbtn sm" onClick={() => setSigners(signers.filter((_, j) => j !== i))}>Delete</button></td></tr>)}
        {!signers.length && <tr><td colSpan={3} className="dvx-empty">No signers.</td></tr>}</tbody></table>
      <div className="dvd-buttons"><button className="tbtn sm" disabled={signers.length >= 5} onClick={() => setSigners([...signers, { name: `SIGNER${signers.length + 1}`, lock: '' }])}>Add</button></div>
      <p className="exp-hint">Up to five signers. Once a function lock is assigned to a signer it is no longer available. Adding a signer un-authorizes every authorized recipe until the new signer approves it.</p>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

export function VcSnapshotDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const snaps = useVc(s => s.snapshots)
  const [name, setName] = useState(`Snapshot${snaps.length + 1}`)
  const [pick, setPick] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const server = useSystem(s => s.serverState)
  const create = (): void => { const r = useVc.getState().createSnapshot(name); if (r.ok) { setInfo(`Snapshot ${r.value} created`); setError(null); setPick(r.value) } else setError(r.error) }
  const restore = (): void => {
    if (!pick) { setError('Select the snapshot you wish to restore'); return }
    void askConfirm('It is strongly recommended that you perform a backup BEFORE restoring a database. Perform a backup now?').then(() => {
      const r = useVc.getState().restoreSnapshot(pick)
      if (r.ok) { setInfo(r.value); setError(null) } else setError(r.error)
    })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Version Control Snapshot" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Snapshot name:<input aria-label="Snapshot name" value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="dvd-buttons"><button className="tbtn sm" disabled={server !== 'RUNNING'} onClick={create}>Create</button></div>
      <ul aria-label="Snapshots">{snaps.map(s => <li key={s.name}><label><input type="radio" name="vc-snap" aria-label={`Snapshot ${s.name}`} checked={pick === s.name} onChange={() => setPick(s.name)} /> {s.name} — {fmt(s.at)} by {s.user} ({Object.keys(s.contents).length} items)</label></li>)}</ul>
      {!snaps.length && <p className="exp-hint">No snapshots. A snapshot captures a complete copy of the present configuration database and adds it to the Version Control database; it is visible when you select History from the Explorer root.</p>}
      <div className="dvd-buttons"><button className="tbtn sm" disabled={!snaps.length || server !== 'RUNNING'} onClick={restore}>Restore</button></div>
    </div>
    {info && <p role="status" className="exp-hint">{info}</p>}<Err error={error} /><Buttons onClose={onClose} />
  </SimulatorDialog>
}

// ---- Item dialogs -------------------------------------------------------------------------------------------------------------

function CheckInDialog({ keyName, onClose }: { keyName: string; onClose: () => void }): JSX.Element {
  const [comment, setComment] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const r = useVc.getState().checkIn(keyName, comment, recursive); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Check In ${nameOf(keyName)}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Comment:<textarea aria-label="Check in comment" rows={3} autoFocus value={comment} onChange={e => setComment(e.target.value)} /></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Recursive" checked={recursive} onChange={e => setRecursive(e.target.checked)} /> Recursive (check in the subordinate items you have checked out)</label>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

export function DiffDialog({ keyName, a, b, onClose }: { keyName: string; a: number | 'current'; b: number | 'current'; onClose: () => void }): JSX.Element {
  const [text, setText] = useState(false)
  const r = useVc.getState().diff(keyName, a, b)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-action-dialog" label={`Differences - ${nameOf(keyName)}`} onClose={onClose}>
    {!r.ok ? <Err error={r.error} /> : <div className="dvd-panel">
      <p role="status" data-vc-compare>Comparing: {r.value.left} with {r.value.right}</p>
      {r.value.same ? <p className="exp-hint" data-vc-same>There are no differences.</p> :
        <pre aria-label="Differences" className="ps-code" style={{ maxHeight: 360, overflow: 'auto' }}>{r.value.lines.filter(l => text ? l.kind !== 'same' : true).map((l, i) =>
          <div key={i} data-diff={l.kind} style={{ background: l.kind === 'added' ? '#cdeccd' : l.kind === 'removed' ? '#f3cccc' : undefined }}>{l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '- ' : '  '}{l.text}</div>)}</pre>}
      <p className="exp-hint"><span style={{ background: '#cdeccd' }}>Green: only in {r.value.right}</span> · <span style={{ background: '#f3cccc' }}>Red: only in {r.value.left}</span></p>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setText(t => !t)}>{text ? 'Graphical Differences' : 'Textual Differences'}</button></div>
    </div>}
    <Buttons onClose={onClose} />
  </SimulatorDialog>
}

function HistoryDialog({ keyName, onClose }: { keyName: string; onClose: () => void }): JSX.Element {
  const versions = useVc(s => s.items[keyName]?.versions)
  const list = [...(versions ?? [])].reverse()
  const [sel, setSel] = useState<number>(list[0]?.n ?? 0)
  const open = useVcUi.getState().open
  const [error, setError] = useState<string | null>(null)
  const prev = list.find(v => v.n < sel)?.n
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-action-dialog" label={`History - ${nameOf(keyName)}`} onClose={onClose}>
    <div className="dvd-panel">
      <table className="dvx-details" aria-label="Version history"><thead><tr><th>Version</th><th>Date</th><th>User</th><th>Label</th><th>Comment</th></tr></thead><tbody>
        {list.map(v => <tr key={v.n} data-version={v.n} aria-selected={sel === v.n} className={sel === v.n ? 'sel' : undefined} onClick={() => setSel(v.n)}>
          <td>{v.n}</td><td>{fmt(v.at)}</td><td>{v.user}</td><td>{v.label}</td><td>{v.comment}</td></tr>)}
        {!list.length && <tr><td colSpan={5} className="dvx-empty">No versions.</td></tr>}</tbody></table>
      <div className="dvd-buttons">
        <button className="tbtn sm" disabled={!sel || list[0]?.n === sel} onClick={() => { const r = useVc.getState().rollback(keyName, sel); if (!r.ok) setError(r.error); else onClose() }}>Rollback</button>
        <button className="tbtn sm" disabled={!sel} onClick={() => open({ t: 'diff', key: keyName, a: prev ?? sel, b: sel, back: true })}>Differences</button>
        <button className="tbtn sm" disabled={!sel} onClick={() => open({ t: 'diff', key: keyName, a: sel, b: 'current', back: true })}>Compare with Current</button>
        <button className="tbtn sm" disabled={!sel} onClick={() => open({ t: 'details', key: keyName, n: sel, back: true })}>Details</button>
        <button className="tbtn sm" disabled={!sel} onClick={() => open({ t: 'view', key: keyName, n: sel, back: true })}>View</button>
        <button className="tbtn sm" onClick={() => window.print()}>Print</button>
      </div>
      <p className="exp-hint">Rollback restores the selected version into the configuration database; the item is then checked out until you check it in.</p>
    </div>
    <Err error={error} /><Buttons onClose={onClose} />
  </SimulatorDialog>
}

function DetailsDialog({ keyName, n, view, onClose }: { keyName: string; n: number; view?: boolean; onClose: () => void }): JSX.Element {
  const v = useVc.getState().items[keyName]?.versions.find(x => x.n === n)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${view ? 'View' : 'Details'} - ${nameOf(keyName)} version ${n}`} onClose={onClose}>
    {!v ? <p>That version does not exist.</p> : view ? <pre className="ps-code" aria-label="Version content" style={{ maxHeight: 360, overflow: 'auto' }}>{v.content}</pre> :
      <table className="exp-props-table" aria-label="Version details"><tbody>
        <tr><td className="k">Item</td><td className="v">{nameOf(keyName)} ({kindOf(keyName)})</td></tr><tr><td className="k">Version</td><td className="v">{v.n}</td></tr>
        <tr><td className="k">Date</td><td className="v">{fmt(v.at)}</td></tr><tr><td className="k">User</td><td className="v">{v.user}</td></tr>
        <tr><td className="k">Label</td><td className="v">{v.label || '(none)'}</td></tr><tr><td className="k">Comment</td><td className="v" data-vc-comment>{v.comment || '(none)'}</td></tr></tbody></table>}
    <Buttons onClose={onClose} />
  </SimulatorDialog>
}

function LabelDialog({ keyName, onClose }: { keyName: string; onClose: () => void }): JSX.Element {
  const [label, setLabel] = useState(''), [comment, setComment] = useState(''), [rec, setRec] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const r = useVc.getState().setLabel(keyName, label, comment, rec); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd" label="Set Label" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Label name:<input aria-label="Label name" autoFocus value={label} onChange={e => setLabel(e.target.value)} /></label>
      <label>Comment:<input aria-label="Label comment" value={comment} onChange={e => setComment(e.target.value)} /></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Label subordinate items" checked={rec} onChange={e => setRec(e.target.checked)} /> Apply to subordinate items</label>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

function SearchDialog({ keyName, onClose }: { keyName: string; onClose: () => void }): JSX.Element {
  const [who, setWho] = useState('')
  const [scope, setScope] = useState<'selected' | 'sub' | 'all'>('all')
  const [results, setResults] = useState<{ key: string; user: string }[] | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Version Control Search" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Items checked out to (blank = all checked-out items):<input aria-label="Checked out to" value={who} onChange={e => setWho(e.target.value)} /></label>
      <label>Search:<select aria-label="Search scope" value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
        <option value="selected">Selected items only</option><option value="sub">Selected items and all subitems</option><option value="all">All items</option></select></label>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setResults(useVc.getState().search({ checkedOut: who.trim() || 'all', scope, key: keyName }))}>Search</button></div>
      {results && <table className="dvx-details" aria-label="Search results"><thead><tr><th>Item</th><th>Checked out to</th></tr></thead><tbody>
        {results.map(r => <tr key={r.key}><td>{nameOf(r.key)} ({kindOf(r.key)})</td><td>{r.user}</td></tr>)}{!results.length && <tr><td colSpan={2} className="dvx-empty">No items found.</td></tr>}</tbody></table>}
    </div>
    <Buttons onClose={onClose} />
  </SimulatorDialog>
}

function ReportDialog({ keyName, onClose }: { keyName: string; onClose: () => void }): JSX.Element {
  const [who, setWho] = useState(''), [rec, setRec] = useState(false)
  const [rows, setRows] = useState<ReturnType<ReturnType<typeof useVc.getState>['historyReport']> | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="History Report" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>User:<input aria-label="Report user" value={who} onChange={e => setWho(e.target.value)} /></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Recursive query" checked={rec} onChange={e => setRec(e.target.checked)} /> Recursive query</label>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setRows(useVc.getState().historyReport({ key: keyName, recursive: rec, user: who.trim() || undefined }))}>Run Report</button></div>
      {rows && <table className="dvx-details" aria-label="History report"><thead><tr><th>Item</th><th>Version</th><th>Date</th><th>User</th><th>Comment</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={i}><td>{nameOf(r.key)}</td><td>{r.version.n}</td><td>{fmt(r.version.at)}</td><td>{r.version.user}</td><td>{r.version.comment}</td></tr>)}</tbody></table>}
    </div>
    <Buttons onClose={onClose} />
  </SimulatorDialog>
}

function MessagesDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const messages = useVc(s => s.messages)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-action-dialog" label="Version Control - Messages" onClose={onClose}>
    <ul aria-label="Version Control messages" className="dvd-panel">{[...messages].reverse().map((m, i) => <li key={i}>{fmt(m.at)} · {m.user} · {m.text}</li>)}{!messages.length && <li>No messages.</li>}</ul>
    <Buttons onClose={onClose} />
  </SimulatorDialog>
}

function PreferencesDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const pref = useVc(s => s.preference)
  const [v, setV] = useState<VcPreference>(pref)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Version Control Preferences" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      {(['Manual', 'Auto Check Out', 'Auto Check Out and In'] as VcPreference[]).map(p => <label key={p} className="dvd-radio"><input type="radio" name="vc-pref" aria-label={p} checked={v === p} onChange={() => setV(p)} /> {p === 'Manual' ? 'Manual or Prompt user for Checkout' : p}</label>)}
      <p className="exp-hint">These preferences pertain to all users and applications affected by Version Control.</p>
    </div>
    <Buttons onOk={() => { useVc.getState().setPreference(v); onClose() }} onClose={onClose} />
  </SimulatorDialog>
}

function ApprovalsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [only, setOnly] = useState(false)
  useVc(s => s.signatures)
  const rows = useVc.getState().approvalReport(only)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Recipe Approval Report" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Show Unapproved Recipes Only" checked={only} onChange={e => setOnly(e.target.checked)} /> Show Unapproved Recipes Only</label>
      <table className="dvx-details" aria-label="Approval report"><thead><tr><th>Recipe</th><th>Authorized</th><th>Signatures</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.recipe} data-approval={r.recipe}><td>{r.recipe}</td><td>{r.authorized ? 'Yes' : 'No'}</td><td>{r.signatures}</td></tr>)}</tbody></table>
    </div>
    <Buttons onClose={onClose} />
  </SimulatorDialog>
}

function SignDialog({ recipe, approve, onClose }: { recipe: string; approve: boolean; onClose: () => void }): JSX.Element {
  const signers = useVc(s => s.signers)
  const [signer, setSigner] = useState(signers[0]?.name ?? '')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const r = useVc.getState().sign(recipe, signer, approve, comment); if (r.ok) onClose(); else setError(r.error) }
  const clear = (): void => { const r = useVc.getState().clearSignature(recipe, signer); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${approve ? 'Approval' : 'Rejection'} Signature - ${recipe}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Signer:<select aria-label="Signer" value={signer} onChange={e => setSigner(e.target.value)}>{signers.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
      <label>Comment:<input aria-label="Signature comment" autoFocus value={comment} onChange={e => setComment(e.target.value)} /></label>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={clear}>Clear signer</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

/** One host for every Version Control dialog; mounted once in App. */
export function VcDialogHost(): JSX.Element | null {
  const dlg = useVcUi(s => s.dlg)
  const close = useVcUi(s => s.close)
  if (!dlg) return null
  switch (dlg.t) {
    case 'config': return <VcConfigDialog onClose={close} />
    case 'signers': return <VcSignersDialog onClose={() => useVcUi.getState().open({ t: 'config' })} />
    case 'snapshot': return <VcSnapshotDialog onClose={close} />
    case 'messages': return <MessagesDialog onClose={close} />
    case 'preferences': return <PreferencesDialog onClose={close} />
    case 'approvals': return <ApprovalsDialog onClose={close} />
    case 'checkIn': return <CheckInDialog keyName={dlg.key} onClose={close} />
    case 'history': return <HistoryDialog keyName={dlg.key} onClose={close} />
    case 'diff': return <DiffDialog keyName={dlg.key} a={dlg.a} b={dlg.b} onClose={dlg.back ? () => useVcUi.getState().open({ t: 'history', key: dlg.key }) : close} />
    case 'details': return <DetailsDialog keyName={dlg.key} n={dlg.n} onClose={dlg.back ? () => useVcUi.getState().open({ t: 'history', key: dlg.key }) : close} />
    case 'view': return <DetailsDialog keyName={dlg.key} n={dlg.n} view onClose={dlg.back ? () => useVcUi.getState().open({ t: 'history', key: dlg.key }) : close} />
    case 'label': return <LabelDialog keyName={dlg.key} onClose={close} />
    case 'search': return <SearchDialog keyName={dlg.key} onClose={close} />
    case 'report': return <ReportDialog keyName={dlg.key} onClose={close} />
    case 'sign': return <SignDialog recipe={dlg.recipe} approve={dlg.approve} onClose={close} />
  }
}
