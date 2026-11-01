import { useState } from 'react'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { ContextMenu } from '../components/LibraryExplorer'
import { useHistorian, flatten, type HistBatch, type HistNode } from '../engine/batchHistorian'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { useWindows } from '../ui/windowStore'

// Course 7016 chapter 14: the Historian Administration Tool (slides 14-14 .. 14-18, 14-39 .. 14-49) and Batch History View (slides 14-19 .. 14-35).

const fmt = (t: number | null): string => (t === null ? '' : new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }))
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)
type Menu = { x: number; y: number; label: string; items: { label: string; onClick?: () => void; disabled?: string }[] }
const toInput = (t: number): string => { const d = new Date(t); const p = (n: number): string => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const H = (): ReturnType<typeof useHistorian.getState> => useHistorian.getState()

// ---------------------------------------------------------------------------------------------------------------------------------

export function HistorianAdminDisplay(): JSX.Element {
  const s = useHistorian()
  const time = useStore(st => st.time)
  const [node, setNode] = useState('DVHisDB/Batches')
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dlg, setDlg] = useState<'archive' | 'folder' | 'events' | 'maintenance' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ name: 'OldBatches', path: 'C:\\Batch_Archive_Databases', folder: '', from: toInput(time - 86400000), to: toInput(time), archive: '' })
  const run = (r: { ok: boolean; error?: string; value?: unknown }): boolean => { setError(r.ok ? null : (r as { error: string }).error); setMessage(r.ok && typeof r.value === 'string' ? r.value : null); return r.ok }
  const archiveNames = Object.keys(s.archives)
  const sel = node.startsWith('archive:') ? s.archives[node.slice(8)] : undefined
  const batches: HistBatch[] = sel ? Object.values(sel.batches) : Object.values(s.batches)
  const server = (): void => { run(s.connected ? (H().disconnect(), { ok: true }) : H().connect()) }
  const batchMenu = (b: HistBatch, e: React.MouseEvent): void => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: b.id, items: archiveNames.length
    ? archiveNames.map(a => ({ label: `Archive ▸ ${a}`, onClick: () => run(H().archiveBatch(b.id, a)) })) : [{ label: 'Archive', disabled: 'Create an archive database first (Server > Create Archive)' }] }) }
  return <div className="display histadmin" data-display="HistorianAdmin">
    <div className="rs-title">DeltaV Historian Administrator - PROPLUS</div>
    <div className="rs-toolbar" role="toolbar" aria-label="Historian Administrator toolbar">
      <span>Server:</span>
      <button className="tbtn sm" onClick={server}>{s.connected ? 'Disconnect' : 'Connect'}</button>
      <button className="tbtn sm" disabled={!s.connected} onClick={() => run(H().toggleService())}>Start/Stop Historian</button>
      <button className="tbtn sm" disabled={!s.connected} onClick={() => { setDlg('archive'); setError(null) }}>Create Archive...</button>
      <button className="tbtn sm" disabled={!s.connected} onClick={() => { setDlg('folder'); setError(null) }}>New Folder...</button>
      <button className="tbtn sm" disabled={!s.connected} onClick={() => { setDlg('maintenance'); setError(null) }}>Maintenance...</button>
      <button className="tbtn sm" onClick={() => { useWindows.getState().minimize('explorer'); useUi.getState().navigate('histview') }}>Batch History View</button>
    </div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    {message && <p role="status" className="exp-hint">{message}</p>}
    <div className="rs-body">
      <div className="rs-diagram" aria-label="Historian tree" style={{ minWidth: 260 }}>
        <div data-hist-server="PROPLUS" className="rs-step" onClick={() => setNode('server')}>{s.connected ? '▲' : '▽'} PROPLUS {s.connected ? '(connected)' : '(not connected)'}</div>
        <div style={{ paddingLeft: 16 }}>
          <div data-hist-node="DVHisDB" className="rs-step">DVHisDB {s.service === 'RUNNING' ? '(active)' : ''}</div>
          {['Batches', 'Alarms and Events', 'Administrative Log'].map(n => <div key={n} style={{ paddingLeft: 16 }} data-hist-node={`DVHisDB/${n}`} className={`rs-step${node === `DVHisDB/${n}` ? ' on' : ''}`}
            onClick={() => setNode(`DVHisDB/${n}`)} onContextMenu={e => { if (n === 'Alarms and Events') { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: n, items: [{ label: 'Archive Events...', disabled: archiveNames.length ? undefined : 'Create an archive database first', onClick: () => { setF(v => ({ ...v, archive: archiveNames[0] ?? '' })); setDlg('events') } }] }) } }}>{n}</div>)}
          {s.folders.map(fo => <div key={fo} data-hist-folder={fo} style={{ paddingLeft: 16 }}>▸ {fo}</div>)}
          {archiveNames.map(a => <div key={a} data-hist-archive={a} style={{ paddingLeft: 16 }} className={`rs-step${node === `archive:${a}` ? ' on' : ''}`}
            onClick={() => { setNode(`archive:${a}`); H().noteView(`archive-expanded ${a}`) }}>{a} <small>({Object.keys(s.archives[a].batches).length} batches)</small></div>)}
        </div>
      </div>
      <div className="rs-side" aria-label="Historian contents">
        {(node === 'DVHisDB/Batches' || sel) && <table className="dvx-details" aria-label={sel ? `${sel.name} batches` : 'Batches'}><thead><tr><th>Batch ID</th><th>Recipe</th><th>Formula</th><th>Start</th><th>End</th><th>State</th><th>Archived</th></tr></thead><tbody>
          {batches.map(b => <tr key={b.id} data-hist-batch={b.id} onContextMenu={e => batchMenu(b, e)}><td>{b.id}</td><td>{b.recipe}</td><td>{b.formula}</td><td>{fmt(b.start)}</td><td>{fmt(b.end)}</td><td>{b.state}</td><td>{b.archivedIn.join(', ')}</td></tr>)}
          {!batches.length && <tr><td colSpan={7} className="dvx-empty">{s.service === 'RUNNING' ? 'No batches yet.' : 'No batches. Start the Batch Historian service to collect batches.'}</td></tr>}</tbody></table>}
        {node === 'DVHisDB/Alarms and Events' && <table className="dvx-details" aria-label="Chronicle events"><thead><tr><th>Time</th><th>Category</th><th>Tag</th><th>Description</th><th>User</th></tr></thead><tbody>
          {s.chronicle.slice(-200).reverse().map(c => <tr key={c.id}><td>{fmt(c.time)}</td><td>{c.category}</td><td>{c.tag}</td><td>{c.description}</td><td>{c.user}</td></tr>)}</tbody></table>}
        {node === 'DVHisDB/Administrative Log' && <ul aria-label="Administrative log">{[...s.adminLog].reverse().map((a, i) => <li key={i}>{fmt(a.at)} · {a.text}</li>)}</ul>}
        {node === 'server' && <p className="exp-hint">Batch Historian server PROPLUS. Connect, then start the Historian service (Server &gt; Start/Stop Historian). Archive databases: {archiveNames.join(', ') || 'none'}.</p>}
      </div>
    </div>
    <div className="rs-status"><span data-hist-status>{s.connected ? 'Connected' : 'Not connected'} · Historian service: {s.service === 'RUNNING' ? 'Running' : 'Stopped'}</span><span>{Object.keys(s.batches).length} batch(es)</span></div>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    {dlg === 'archive' && <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Create Archive" onClose={() => setDlg(null)}>
      <div className="lib-dlg-fields dvd-panel">
        <label>Archive database name:<input aria-label="Archive name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>Path:<input aria-label="Archive path" value={f.path} onChange={e => setF({ ...f, path: e.target.value })} /></label>
        {s.folders.length > 0 && <label>Folder:<select aria-label="Archive folder" value={f.folder} onChange={e => setF({ ...f, folder: e.target.value })}><option value="" />{s.folders.map(x => <option key={x}>{x}</option>)}</select></label>}
      </div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { if (run(H().createArchive(f.name, f.path, f.folder))) setDlg(null) }}>Yes</button><button className="tbtn sm" onClick={() => setDlg(null)}>Cancel</button></div><Err error={error} />
    </SimulatorDialog>}
    {dlg === 'folder' && <SimulatorDialog className="module-download-dialog dvd" label="New Folder" onClose={() => setDlg(null)}>
      <div className="lib-dlg-fields dvd-panel"><label>Folder name:<input aria-label="Folder name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { if (run(H().newFolder(f.name))) setDlg(null) }}>OK</button><button className="tbtn sm" onClick={() => setDlg(null)}>Cancel</button></div><Err error={error} />
    </SimulatorDialog>}
    {dlg === 'events' && <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Archive Events" onClose={() => setDlg(null)}>
      <div className="lib-dlg-fields dvd-panel">
        <label>Archive:<select aria-label="Archive for events" value={f.archive} onChange={e => setF({ ...f, archive: e.target.value })}>{archiveNames.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Beginning time:<input aria-label="Beginning time" type="datetime-local" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
        <label>End time:<input aria-label="End time" type="datetime-local" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label>
      </div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { if (run(H().archiveEvents(f.archive, Date.parse(f.from), Date.parse(f.to) + 60000))) setDlg(null) }}>OK</button><button className="tbtn sm" onClick={() => setDlg(null)}>Cancel</button></div><Err error={error} />
    </SimulatorDialog>}
    {dlg === 'maintenance' && <MaintenanceDialog onClose={() => setDlg(null)} />}
  </div>
}

function MaintenanceDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const m = useHistorian(s => s.maintenance)
  const [v, setV] = useState(m)
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Batch Historian Maintenance" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label className="lib-dlg-check"><input type="checkbox" aria-label="AutoArchive" checked={v.autoArchive} onChange={e => setV({ ...v, autoArchive: e.target.checked })} /> AutoArchive batches older than <input aria-label="Archive after days" type="number" style={{ width: 60 }} value={v.archiveAfterDays} onChange={e => setV({ ...v, archiveAfterDays: Number(e.target.value) })} /> days</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="AutoBackup" checked={v.autoBackup} onChange={e => setV({ ...v, autoBackup: e.target.checked })} /> AutoBackup the Batch Historian database</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="AutoDelete" checked={v.autoDelete} onChange={e => setV({ ...v, autoDelete: e.target.checked })} /> AutoDelete archived batches older than <input aria-label="Delete after days" type="number" style={{ width: 60 }} value={v.deleteAfterDays} onChange={e => setV({ ...v, deleteAfterDays: Number(e.target.value) })} /> days</label>
      <p className="exp-hint">Only archived batches and campaigns can be deleted from the main database.</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { const r = H().setMaintenance(v); if (r.ok) onClose(); else setError(r.error) }}>OK</button>
      <button className="tbtn sm" onClick={() => { const r = H().setMaintenance(v); if (r.ok) setError(`Maintenance run: ${H().runMaintenance().ok ? 'done' : 'failed'}`); else setError(r.error) }}>Run Now</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

// ---------------------------------------------------------------------------------------------------------------------------------

function Chart({ series }: { series: { label: string; points: { t: number; v: number }[]; dashed?: boolean }[] }): JSX.Element {
  const W = 520, Hh = 140
  const all = series.flatMap(x => x.points)
  if (!all.length) return <p className="exp-hint">No trend data was collected for this module in this time span.</p>
  const maxT = Math.max(1, ...all.map(p => p.t)), vs = all.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs, lo + 1)
  const pt = (p: { t: number; v: number }): string => `${(p.t / maxT) * (W - 10) + 5},${Hh - 8 - ((p.v - lo) / (hi - lo)) * (Hh - 16)}`
  return <svg role="img" aria-label="Process trend" width={W} height={Hh} style={{ background: '#fff', border: '1px solid #999' }}>
    {series.map((x, i) => <polyline key={i} data-trend-series={x.label} fill="none" stroke={i ? '#2f6db5' : '#b3261e'} strokeWidth={2} strokeDasharray={x.dashed ? '6 4' : undefined} points={x.points.map(pt).join(' ')} />)}
    <text x={6} y={12} fontSize={10}>{series.map(x => x.label).join('  |  ')} · {Math.round(lo * 10) / 10} to {Math.round(hi * 10) / 10} over {Math.round(maxT / 1000)} s</text>
  </svg>
}
const MODULES = ['XV-503', 'XV-504', 'XV-501', 'XV-502', 'MTR-505', 'AGIT-503', 'LI-504', 'LI-104', 'LI-204', 'LI-304', 'FIC-404']

function nodeWindow(n: { start: number | null; end: number | null } | undefined, now: number): [number, number] { return [n?.start ?? 0, n?.end ?? now] }
function slice(points: { t: number; v: number }[], win: [number, number]): { t: number; v: number }[] { return points.filter(p => p.t >= win[0] && p.t <= win[1]).map(p => ({ t: p.t - win[0], v: p.v })) }

export function BatchHistoryViewDisplay(): JSX.Element {
  const s = useHistorian()
  const time = useStore(st => st.time)
  const [checked, setChecked] = useState<string[]>([])
  const [detail, setDetail] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [selNode, setSelNode] = useState<HistNode | null>(null)
  const [panel, setPanel] = useState<'none' | 'events' | 'process' | 'trend' | 'compare'>('none')
  const [selEvent, setSelEvent] = useState<number | null>(null)
  const [comment, setComment] = useState<string | null>(null)
  const [module, setModule] = useState('XV-503')
  const [row, setRow] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = Object.values(s.batches).sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
  const t0 = Math.min(...list.map(b => b.start ?? time), time), t1 = Math.max(...list.map(b => b.end ?? time), t0 + 1)
  const toggle = (id: string): void => setChecked(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id].slice(-2)))
  const cur = detail ? s.batches[detail] : undefined
  const key = (n: HistNode | null): string => (n && n.level === 'Unit Phase' ? `${n.unit}/${n.name}` : '')
  const events = (cur?.events ?? []).map((e, i) => ({ e, i })).filter(({ e }) => {
    if (!selNode || selNode.level === 'Batch') return true
    const [a, b] = nodeWindow(selNode, time)
    return e.at >= a && e.at <= b && (!key(selNode) || e.key === key(selNode) || e.kind === 'Comment' && e.key === key(selNode))
  })
  const rows = (panel === 'compare' && checked.length === 2) ? H().compare(checked[0], checked[1]) : null
  const nodeFor = (b: HistBatch | undefined, path: string): { start: number | null; end: number | null } | undefined => (b ? flatten(b.tree).find(r => r.path === path) : undefined)
  const renderNode = (n: HistNode, depth: number): JSX.Element => <div key={n.id}>
    <div data-node={`${n.level}:${n.name}`} className={`rs-step${selNode?.id === n.id ? ' on' : ''}`} style={{ marginLeft: depth * 18, display: 'block' }} onClick={() => setSelNode(n)}>
      {n.children.length > 0 && <button className="tbtn sm" aria-label={`Expand ${n.name}`} onClick={e => { e.stopPropagation(); setOpen(o => ({ ...o, [n.id]: !o[n.id] })) }}>{open[n.id] ? '−' : '+'}</button>}
      {' '}{n.level}: {n.name}{n.unit ? ` (${n.unit})` : ''} · {n.state} · {fmt(n.start)} - {fmt(n.end)}</div>
    {open[n.id] && n.children.map(c => renderNode(c, depth + 1))}
  </div>
  const expandAll = (n: HistNode, acc: Record<string, boolean>): Record<string, boolean> => { acc[n.id] = true; n.children.forEach(c => expandAll(c, acc)); return acc }
  return <div className="display histview" data-display="BatchHistoryView">
    <div className="rs-title">Batch History View - Batch Overview</div>
    <div className="rs-toolbar" role="toolbar" aria-label="Batch History View toolbar">
      <button className="tbtn sm" disabled={checked.length < 1} onClick={() => { const id = checked[checked.length - 1]; setDetail(id); const b = s.batches[id]; setOpen(expandAll(b.tree, {})); setSelNode(b.tree); setPanel('none'); H().noteView(`details ${id}`) }}>Details</button>
      <button className="tbtn sm" disabled={!cur} onClick={() => { setPanel('events'); setSelEvent(null); if (cur) H().noteView(`events ${cur.id} ${key(selNode) || 'batch'}`) }}>Batch Events</button>
      <button className="tbtn sm" disabled={!cur} onClick={() => { setPanel('process'); if (cur) H().noteView(`process-events ${cur.id}`) }}>Process Events</button>
      <button className="tbtn sm" disabled={!cur} onClick={() => setPanel('trend')}>Process Trend</button>
      <button className="tbtn sm" disabled={checked.length !== 2} onClick={() => { setPanel('compare'); setDetail(null); setRow(null); H().noteView(`compare ${checked[0]} ${checked[1]}`) }}>Compare Batches</button>
    </div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    <table className="dvx-details" aria-label="Batch overview"><thead><tr><th /><th>Batch ID</th><th>Recipe</th><th>Formula</th><th>State</th><th>Start</th><th>End</th><th style={{ width: 240 }}>Gantt</th></tr></thead><tbody>
      {list.map(b => <tr key={b.id} data-hist-batch={b.id}>
        <td><input type="checkbox" aria-label={`Select ${b.id}`} checked={checked.includes(b.id)} onChange={() => toggle(b.id)} /></td>
        <td>{b.id}</td><td>{b.recipe}</td><td>{b.formula}</td><td>{b.state}</td><td>{fmt(b.start)}</td><td>{fmt(b.end)}</td>
        <td><div style={{ position: 'relative', height: 12, background: '#eee' }}><div style={{ position: 'absolute', left: `${(((b.start ?? t0) - t0) / (t1 - t0)) * 100}%`, width: `${Math.max(1, (((b.end ?? time) - (b.start ?? t0)) / (t1 - t0)) * 100)}%`, height: 12, background: b.active ? '#b3261e' : '#2f6db5' }} />{b.active && <span style={{ color: '#b3261e' }}>|||||</span>}</div></td></tr>)}
      {!list.length && <tr><td colSpan={8} className="dvx-empty">No batches in the Batch Historian. Enable it in Explorer, connect the Historian Administration Tool and start the service, then run a batch.</td></tr>}</tbody></table>
    {cur && <div className="rs-pane-head">Batch {cur.id} (select a unit phase for Batch Events and Process Trend)</div>}
    {cur && <div aria-label="Batch chart">{renderNode(cur.tree, 0)}</div>}
    {cur && panel === 'events' && <div>
      <table className="dvx-details" aria-label="Batch events"><thead><tr><th>Time</th><th>Type</th><th>Item</th><th>Event</th><th>User</th></tr></thead><tbody>
        {events.map(({ e, i }) => <tr key={i} data-hist-event={i} className={selEvent === i ? 'sel' : undefined} onClick={() => setSelEvent(i)}><td>{e.kind === 'Comment' ? '' : fmt(e.at)}</td><td>{e.kind}</td><td>{e.key}</td><td>{e.text}</td><td>{e.user}</td></tr>)}</tbody></table>
      <div className="dvd-buttons"><button className="tbtn sm" disabled={selEvent === null} onClick={() => setComment('')}>Add Comment...</button></div>
    </div>}
    {cur && panel === 'process' && <table className="dvx-details" aria-label="Process events"><thead><tr><th>Time</th><th>Category</th><th>Tag</th><th>Description</th><th>User</th></tr></thead><tbody>
      {H().processEvents(cur.id).map(c => <tr key={c.id}><td>{fmt(c.time)}</td><td>{c.category}</td><td>{c.tag}</td><td>{c.description}</td><td>{c.user}</td></tr>)}</tbody></table>}
    {cur && panel === 'trend' && <div>
      <label>Module:<select aria-label="Trend module" value={module} onChange={e => setModule(e.target.value)}>{MODULES.map(m => <option key={m}>{m}</option>)}</select></label>
      <button className="tbtn sm" onClick={() => H().noteView(`trend ${cur.id} ${key(selNode) || 'batch'} ${module}`)}>Show Trend</button>
      <Chart series={[{ label: `${cur.id} ${module}`, points: slice(H().trend(cur.id, module), nodeWindow(selNode ?? cur.tree, time)) }]} />
    </div>}
    {panel === 'compare' && rows && <div>
      {!rows.ok ? <Err error={rows.error} /> : <table className="dvx-details" aria-label="Batch comparison"><thead><tr><th>Item</th><th>Level</th><th>{checked[0]} (s)</th><th>{checked[1]} (s)</th><th>Difference</th></tr></thead><tbody>
        {rows.value.map(r => <tr key={r.path} data-compare-row={r.path} className={row === r.path ? 'sel' : undefined} onClick={() => setRow(r.path)}><td>{r.path}</td><td>{r.level}</td><td>{r.durationA ?? ''}</td><td>{r.durationB ?? ''}</td><td>{r.delta ?? ''}</td></tr>)}</tbody></table>}
      {rows.ok && <div>
        <label>Process Trend Comparison module:<select aria-label="Comparison module" value={module} onChange={e => setModule(e.target.value)}>{MODULES.map(m => <option key={m}>{m}</option>)}</select></label>
        <button className="tbtn sm" disabled={!row} onClick={() => { if (row) { H().noteView(`trend-compare ${checked[0]} ${checked[1]} ${row} ${module}`); setError(null) } else setError('Select an item of the comparison first') }}>Show Trend Comparison</button>
        {row && <Chart series={[{ label: `${checked[1]} ${module}`, points: slice(H().trend(checked[1], module), nodeWindow(nodeFor(s.batches[checked[1]], row), time)) },
          { label: `${checked[0]} ${module}`, dashed: true, points: slice(H().trend(checked[0], module), nodeWindow(nodeFor(s.batches[checked[0]], row), time)) }]} />}
        <p className="exp-hint">The most recent batch shows a solid line; the other batch a broken line.</p>
      </div>}
    </div>}
    {comment !== null && cur && selEvent !== null && <SimulatorDialog className="module-download-dialog dvd" label="Add Comment" onClose={() => setComment(null)}>
      <div className="lib-dlg-fields dvd-panel"><label>Comment:<textarea aria-label="Event comment" rows={3} autoFocus value={comment} onChange={e => setComment(e.target.value)} /></label></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { const r = H().addComment(cur.id, comment, selEvent); if (r.ok) { setComment(null); setError(null) } else setError(r.error) }}>OK</button><button className="tbtn sm" onClick={() => setComment(null)}>Cancel</button></div>
    </SimulatorDialog>}
  </div>
}
