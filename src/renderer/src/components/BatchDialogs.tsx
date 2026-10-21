import { useState, type ReactNode } from 'react'
import { SimulatorDialog } from './SimulatorDialog'
import { useBatchUi } from '../ui/batchUi'
import { useUi } from '../ui/uiStore'
import { useStore } from '../engine/store'
import { useLibrary } from '../engine/libraryStore'
import { useBatch, aliasesResolved, type UploadRow } from '../engine/batchStore'
import { newParam, type PhaseParamDef, type PhaseParamKind, type AliasResolution, type PhaseType } from '../engine/batchConfig'
import { CM_DEVICE_CLASSES, EM_ALGORITHMS, EM_ALGORITHM_NOTE, SUPPORTED_EM_ALGORITHMS, useEm, type EmAlgorithm } from '../engine/emStore'
import { askConfirm } from './AppNotices'

const NO_PARAMS: Record<string, PhaseParamDef> = {}
const NO_LOGIC: Record<string, unknown> = {}
type R = { ok: true } | { ok: false; error: string }
const asErr = (r: R | { ok: boolean; error?: string }): string | null => (r.ok ? null : (r as { error: string }).error)

function Buttons({ onOk, onClose, okLabel = 'OK', help, disabled }: { onOk: () => void; onClose: () => void; okLabel?: string; help?: string; disabled?: boolean }): JSX.Element {
  return <div className="dvd-buttons">
    <button className="tbtn sm" onClick={onOk} disabled={disabled}>{okLabel}</button>
    <button className="tbtn sm" onClick={onClose}>Cancel</button>
    {help !== undefined && <button className="tbtn sm" onClick={() => window.alert(help)}>Help</button>}
  </div>
}
function Err({ error }: { error: string | null }): JSX.Element | null {
  return error ? <p role="alert" className="lib-dlg-error">{error}</p> : null
}
function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }): JSX.Element {
  return <div className="dvd-tabs" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={t === active}
    className={t === active ? 'on' : ''} onClick={() => onChange(t)}>{t}</button>)}</div>
}
function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return <div className="dvd-row"><span className="dvd-k">{label}</span><span className="dvd-v">{children}</span></div>
}

/** Start From Existing ▸ Browse...: the existing objects of the same type to copy from. */
function ExistingPicker({ enabled, value, options, onPick }: { enabled: boolean; value: string; options: string[]; onPick: (v: string) => void }): JSX.Element {
  const [browse, setBrowse] = useState(false)
  return <>
    <div className="dvd-inline"><input disabled={!enabled} readOnly aria-label="Existing object" value={value} onClick={() => enabled && setBrowse(true)} />
      <button className="tbtn sm" disabled={!enabled} onClick={() => setBrowse(v => !v)}>Browse...</button></div>
    {enabled && browse && <div className="lib-browse" role="listbox" aria-label="Browse existing objects">
      {options.length ? options.map(o => <button key={o} role="option" aria-selected={o === value} className="ctx-item"
        onClick={() => { onPick(o); setBrowse(false) }}>{o}</button>) : <span className="exp-hint">No existing objects of this type.</span>}
    </div>}
  </>
}

/** "New" object dialog (course p4-11 / p4-14): Object name, Object type, Start From Existing / Create New. */
export function NewObjectDialog({ objectType, algorithm, existing, onOk, onCopy, onClose }: {
  objectType: string; algorithm: string; existing: string[]
  onOk: (name: string) => string | null; onCopy: (source: string, name: string) => string | null; onClose: () => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [fromExisting, setFromExisting] = useState(false)
  const [source, setSource] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const n = name.trim().toUpperCase()
    const e = fromExisting ? onCopy(source, n) : onOk(n)
    if (e) setError(e); else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="New" onClose={onClose}>
    <div className="dvd-split">
      <div className="lib-dlg-fields">
        <label>Object name:<input aria-label="Object name" autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
        <label title="Fixed by the item you right-clicked (as in DeltaV)">Object type:<select aria-label="Object type" disabled value={objectType}><option>{objectType}</option></select></label>
        <fieldset className="lib-dlg-props">
          <legend><label className="lib-dlg-check"><input type="radio" name="new-object-mode" aria-label="Start From Existing" checked={fromExisting} onChange={() => setFromExisting(true)} /> Start From Existing</label></legend>
          <ExistingPicker enabled={fromExisting} value={source} options={existing} onPick={setSource} />
        </fieldset>
        <fieldset className="lib-dlg-props"><legend><label className="lib-dlg-check"><input type="radio" name="new-object-mode" aria-label="Create New" checked={!fromExisting} onChange={() => setFromExisting(false)} /> Create New</label></legend>
          <label title="Fixed for this object type (greyed in DeltaV too)">Algorithm type:<select disabled aria-label="Algorithm type"><option>{algorithm}</option></select></label>
        </fieldset>
      </div>
      <div className="lib-dlg-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    </div>
    <Err error={error} />
  </SimulatorDialog>
}

/** Unit class New ▸ Alias (p4-12). */
export function NewAliasDialog({ unitClass, onClose }: { unitClass: string; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const r = useBatch.getState().addAlias(unitClass, name, description)
    if (r.ok) onClose()
    else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Alias" onClose={onClose}>
    <Tabs tabs={['General']} active="General" onChange={() => {}} />
    <div className="lib-dlg-fields dvd-panel">
      <label>Alias Name:<input aria-label="Alias Name" autoFocus value={name} onChange={e => setName(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
      <label>Description:<input aria-label="Alias description" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <p className="exp-hint">Defined on unit class {unitClass}; each unit module resolves it to a module or parameter path.</p>
    </div>
    <Buttons onOk={submit} onClose={onClose} />
    <Err error={error} />
  </SimulatorDialog>
}

/** Resolving Aliases (p4-26): Alias dialog on a unit module. */
export function AliasResolveDialog({ unit, alias, onClose }: { unit: string; alias: string; onClose: () => void }): JSX.Element {
  const res = useBatch(s => s.units[unit]?.aliases[alias])
  const [v, setV] = useState<AliasResolution>(res ?? { path: '', ignore: false, description: '' })
  const [browse, setBrowse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modules = useStore(s => s.modules)
  const sims = useLibrary(s => s.sims)
  const submit = (): void => {
    const r = useBatch.getState().resolveAlias(unit, alias, v)
    if (r.ok) onClose()
    else setError(r.error)
  }
  const paths = [...Object.values(modules).flatMap(m => m.type === 'AI' ? [m.tag, `${m.tag}/AI1/PV.CV`] : [m.tag]), ...Object.keys(sims)].sort()
  return <SimulatorDialog className="module-download-dialog dvd" label="Alias" onClose={onClose}>
    <Tabs tabs={['General']} active="General" onChange={() => {}} />
    <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-inline">
        <label style={{ flex: 1 }}>Alias Name:<input aria-label="Alias Name" value={alias} disabled /></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Ignore" checked={v.ignore} onChange={e => setV({ ...v, ignore: e.target.checked })} /> Ignore</label>
      </div>
      <label>Description:<input aria-label="Alias description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
      <div className="dvd-inline">
        <label style={{ flex: 1 }}>Path:<input aria-label="Alias path" autoFocus value={v.path} disabled={v.ignore}
          onChange={e => setV({ ...v, path: e.target.value.toUpperCase() })} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
        <button className="tbtn sm" disabled={v.ignore} onClick={() => setBrowse(b => !b)}>Browse...</button>
      </div>
      {browse && <div className="lib-browse" role="listbox" aria-label="Browse alias path">
        {paths.map(p => <button key={p} className="ctx-item" onClick={() => { setV({ ...v, path: p }); setBrowse(false) }}>{p}</button>)}
      </div>}
    </div>
    <Buttons onOk={submit} onClose={onClose} help="Resolve the alias to a module name (XV-101) for valves and motors, or to a full parameter path (LI-104/AI1/PV.CV) for level indicators. Ignore makes the phase skip writes to this alias." />
    <Err error={error} />
  </SimulatorDialog>
}

const KIND_TITLE: Record<PhaseParamKind, string> = { batch: 'Batch input/report parameter', algorithm: 'Phase algorithm parameter', message: 'Phase message' }

/** Batch Input Parameters (p4-15): PARAM1 Properties. */
export function PhaseParamDialog({ phaseClass, kind, original, onClose }: { phaseClass: string; kind: PhaseParamKind; original?: string; onClose: () => void }): JSX.Element {
  const params = useBatch(s => s.phaseClasses[phaseClass]?.params ?? NO_PARAMS)
  const [d, setD] = useState<PhaseParamDef>(() => (original && params[original]) ? { ...params[original] } : newParam(kind, params))
  const [error, setError] = useState<string | null>(null)
  const groups = Array.from(new Set(['Operating', 'Report', ...Object.values(params).map(p => p.group)]))
  const submit = (): void => {
    const r = useBatch.getState().savePhaseParam(phaseClass, { ...d, kind: d.kind, defaultValue: d.type === 'String' ? String(d.defaultValue) : Number(d.defaultValue) }, original)
    if (r.ok) onClose()
    else setError(r.error)
  }
  const numeric = d.type !== 'String'
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${original ?? d.name} Properties`} onClose={onClose}>
    <div className="dvd-split">
      <div className="lib-dlg-fields">
        <label>Name:<input aria-label="Parameter name" autoFocus value={d.name} onChange={e => setD({ ...d, name: e.target.value.toUpperCase() })} /></label>
        <label>Parameter category:<input aria-label="Parameter category" list="dvd-param-groups" value={d.group} onChange={e => setD({ ...d, group: e.target.value })} /></label>
        <datalist id="dvd-param-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        <div className="dvd-inline">
          <label>Type:<select aria-label="Parameter type" value={d.type} disabled={kind === 'message'} onChange={e => setD({ ...d, type: e.target.value as PhaseParamDef['type'], defaultValue: e.target.value === 'String' ? '' : 0 })}>
            <option>Integer</option><option>Real</option><option>String</option></select></label>
          {kind === 'batch' && <label>Category:<select aria-label="Parameter direction" value={d.direction} onChange={e => setD({ ...d, direction: e.target.value as 'Input' | 'Report' })}>
            <option>Input</option><option>Report</option></select></label>}
          <label>ID:<input aria-label="Parameter ID" type="number" min={1} value={d.id} onChange={e => setD({ ...d, id: Number(e.target.value) })} /></label>
        </div>
        <fieldset className="lib-dlg-props"><legend>Value</legend>
          {kind === 'batch' && <label className="lib-dlg-check"><input type="checkbox" aria-label="Scalable" checked={d.scalable} onChange={e => setD({ ...d, scalable: e.target.checked })} /> Scalable</label>}
          {numeric ? <div className="dvd-inline">
            <label>Low limit:<input aria-label="Low limit" type="number" value={d.low} onChange={e => setD({ ...d, low: Number(e.target.value) })} /></label>
            <span>&lt;=</span>
            <label>Default value:<input aria-label="Default value" type="number" value={d.defaultValue as number} disabled={d.direction === 'Report' && kind === 'batch'}
              onChange={e => setD({ ...d, defaultValue: Number(e.target.value) })} /></label>
            <span>&lt;=</span>
            <label>High limit:<input aria-label="High limit" type="number" value={d.high} onChange={e => setD({ ...d, high: Number(e.target.value) })} /></label>
          </div> : <label>Default value:<input aria-label="Default value" value={String(d.defaultValue)} onChange={e => setD({ ...d, defaultValue: e.target.value })} /></label>}
          {numeric && <label>Engineering units:<input aria-label="Engineering units" list="dvd-eu" value={d.units} onChange={e => setD({ ...d, units: e.target.value })} /></label>}
          <datalist id="dvd-eu">{['gal', 'GPM', '%', 'degC', 'degF', 'kg', 'lb', 'min', 's'].map(u => <option key={u} value={u} />)}</datalist>
        </fieldset>
        <p className="exp-hint">{KIND_TITLE[kind]}{kind === 'batch' ? ' — Input = information to the phase (green); Report = information from the phase (yellow). Batch parameters are uploaded/downloaded by the Batch Executive.' : ''}</p>
      </div>
      <div className="lib-dlg-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    </div>
    <Err error={error} />
  </SimulatorDialog>
}

const fmtTime = (t: number): string => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** Unit Module Properties (p4-28): General, Execution, Displays, Arbitration, Tools. */
export function UnitModulePropsDialog({ unit, onClose, initialTab = 'General' }: { unit: string; onClose: () => void; initialTab?: string }): JSX.Element {
  const u = useBatch(s => s.units[unit])
  const [tab, setTab] = useState(initialTab)
  const [v, setV] = useState({ description: u?.description ?? '', workInProgress: !!u?.workInProgress, primaryDisplay: u?.primaryDisplay ?? '',
    detailDisplay: u?.detailDisplay ?? '', instrumentDisplay: u?.instrumentDisplay ?? '', scanRate: u?.scanRate ?? 1 })
  const [error, setError] = useState<string | null>(null)
  if (!u) return <></>
  const submit = (): void => { const e = asErr(useBatch.getState().setUnitProps(unit, v)); if (e) setError(e); else onClose() }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Unit Module Properties" onClose={onClose}>
    <Tabs tabs={['General', 'Execution', 'Displays', 'Arbitration', 'Tools']} active={tab} onChange={setTab} />
    <div className="dvd-panel">
      {tab === 'General' && <>
        <Row label="Object type:">Unit Module</Row>
        <Row label="Modified:">{fmtTime(u.modified)}</Row>
        <Row label="Modified by:">{u.modifiedBy}</Row>
        <div className="lib-dlg-fields">
          <label>Unit class:<input aria-label="Unit class" value={u.unitClass} disabled /></label>
          <label>Description:<input aria-label="Unit description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Work in progress" checked={v.workInProgress} onChange={e => setV({ ...v, workInProgress: e.target.checked })} /> Work in progress</label>
        </div>
        <Row label="Available to the Batch Executive?">Yes</Row>
      </>}
      {tab === 'Execution' && <div className="lib-dlg-fields">
        <label>Scan rate multiplier:<input aria-label="Unit scan rate" type="number" min={1} value={v.scanRate} onChange={e => setV({ ...v, scanRate: Number(e.target.value) })} /></label>
      </div>}
      {tab === 'Displays' && <div className="lib-dlg-fields">
        <label>Primary control display:<input aria-label="Primary control display" list="dvd-displays" value={v.primaryDisplay} onChange={e => setV({ ...v, primaryDisplay: e.target.value })} /></label>
        <label>Detail display:<input aria-label="Detail display" list="dvd-displays" value={v.detailDisplay} onChange={e => setV({ ...v, detailDisplay: e.target.value })} /></label>
        <label>Instrument area display:<input aria-label="Instrument area display" list="dvd-displays" value={v.instrumentDisplay} onChange={e => setV({ ...v, instrumentDisplay: e.target.value })} /></label>
        <datalist id="dvd-displays">{['Process', 'BatchHelp'].map(x => <option key={x} value={x} />)}</datalist>
      </div>}
      {(tab === 'Arbitration' || tab === 'Tools') && <p className="exp-hint">{tab === 'Arbitration' ? 'Unit acquisition/arbitration is performed by the Batch Executive, which is not simulated.' : 'No tools are configured.'}</p>}
    </div>
    <Buttons onOk={submit} onClose={onClose} help="Set the Display tab Primary Control Display to Process (course p4-51)." />
    <Err error={error} />
  </SimulatorDialog>
}

/** Unit Phase Properties (p4-28 / p4-29). */
export function UnitPhasePropsDialog({ unit, phase, onClose }: { unit: string; phase: string; onClose: () => void }): JSX.Element {
  const u = useBatch(s => s.units[unit])
  const ph = u?.phases[phase]
  const [tab, setTab] = useState('General')
  const [v, setV] = useState({ description: ph?.description ?? '', phaseType: ph?.phaseType ?? 'Controller' as PhaseType, scanRate: ph?.scanRate ?? 1,
    alwaysInMemory: !!ph?.alwaysInMemory, simulate: !!ph?.simulate })
  const [error, setError] = useState<string | null>(null)
  if (!u || !ph) return <></>
  const submit = (): void => { const e = asErr(useBatch.getState().setUnitPhaseProps(unit, phase, v)); if (e) setError(e); else onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label="Unit Phase Properties" onClose={onClose}>
    <Tabs tabs={['General', 'Arbitration', 'Tools']} active={tab} onChange={setTab} />
    <div className="dvd-panel">
      {tab === 'General' ? <>
        <Row label="Object type:">Phase</Row>
        <Row label="Modified:">{fmtTime(u.modified)}</Row>
        <Row label="Modified by:">{u.modifiedBy}</Row>
        <Row label="Aliases Resolved?">{aliasesResolved(u) ? 'Yes' : 'No'}</Row>
        <div className="lib-dlg-fields">
          <label>Unit Phase Name:<input aria-label="Unit Phase Name" value={ph.name} disabled /></label>
          <label>Description:<input aria-label="Unit phase description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
          <fieldset className="lib-dlg-props">
            <label>Phase type:<select aria-label="Phase type" value={v.phaseType} onChange={e => setV({ ...v, phaseType: e.target.value as PhaseType })}>
              <option>Controller</option><option>Disabled</option><option>External Phase</option></select></label>
            <label>Scan Rate Multiplier:<input aria-label="Scan Rate Multiplier" type="number" min={1} value={v.scanRate} onChange={e => setV({ ...v, scanRate: Number(e.target.value) })} /></label>
            <label className="lib-dlg-check"><input type="checkbox" aria-label="Always in memory" checked={v.alwaysInMemory} onChange={e => setV({ ...v, alwaysInMemory: e.target.checked })} /> Always in memory</label>
          </fieldset>
          <label className="lib-dlg-check" title="Run with Recipe Simulator — overrides the phase type. Recipe Simulator is not part of BatchLive."><input type="checkbox" aria-label="Simulate" checked={v.simulate} disabled onChange={e => setV({ ...v, simulate: e.target.checked })} /> Simulate</label>
        </div>
      </> : <p className="exp-hint">{tab === 'Arbitration' ? 'Phase arbitration is performed by the Batch Executive, which is not simulated.' : 'No tools are configured.'}</p>}
    </div>
    <Buttons onOk={submit} onClose={onClose} help="Controller: downloaded with the unit module. Disabled: ignored during downloads. External Phase: exists outside the DeltaV database. Always in memory keeps the phase in controller memory when it is not running." />
    <Err error={error} />
  </SimulatorDialog>
}

/** Pick one name from a list (Assign Phase Class..., Add To Unit Class...). */
export function PickDialog({ title, prompt, options, onPick, onClose }: { title: string; prompt: string; options: string[]; onPick: (v: string) => string | null; onClose: () => void }): JSX.Element {
  const [sel, setSel] = useState(options[0] ?? '')
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label={title} onClose={onClose}>
    <p>{prompt}</p>
    {options.length ? <select aria-label={prompt} size={Math.min(8, Math.max(3, options.length))} className="dvd-list" value={sel} onChange={e => setSel(e.target.value)}
      onDoubleClick={() => { const e = onPick(sel); if (e) setError(e); else onClose() }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select> : <p className="exp-hint">Nothing to choose.</p>}
    <Buttons disabled={!sel} onOk={() => { const e = onPick(sel); if (e) setError(e); else onClose() }} onClose={onClose} />
    <Err error={error} />
  </SimulatorDialog>
}

/** Assign ▸ Unit Module to Node / Unit And All Contained Modules to Node (p4-31). */
export function AssignNodeDialog({ unit, includeContained: initial, controller: preset, onClose }: { unit: string; includeContained: boolean; controller?: string; onClose: () => void }): JSX.Element {
  const controllers = Object.keys(useStore(s => s.hardware.controllers))
  const [controller, setController] = useState(preset ?? controllers[0] ?? '')
  const [contained, setContained] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const e = asErr(useBatch.getState().assignUnit(unit, controller, contained)); if (e) setError(e); else onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Assign ${unit} to Node`} onClose={onClose}>
    <div className="lib-dlg-fields">
      <label>Node:<select aria-label="Node" value={controller} onChange={e => setController(e.target.value)}>{controllers.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Also assign any contained modules" checked={contained} onChange={e => setContained(e.target.checked)} /> Also assign any contained modules</label>
    </div>
    <Buttons onOk={submit} onClose={onClose} />
    <Err error={error} />
  </SimulatorDialog>
}

/** Download ▸ Unit Module [and contained modules] with the Upload dialog (p4-32 / p4-33). */
export function UnitDownloadDialog({ unit, includeContained, onClose }: { unit: string; includeContained: boolean; onClose: () => void }): JSX.Element {
  const rows = useBatch.getState().pendingUploads(unit)
  const [stage, setStage] = useState<'upload' | 'confirm' | 'done'>(rows.length ? 'upload' : 'confirm')
  const [selected, setSelected] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const key = (r: UploadRow): string => `${r.phase}/${r.param}`
  const go = (): void => {
    const r = useBatch.getState().downloadUnit(unit, includeContained, rows.filter(x => selected.includes(key(x))))
    if (!r.ok) setError(r.error)
    else { setWarnings(r.value.warnings); setStage('done') }
  }
  if (stage === 'upload') return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`Upload - ${unit}`} onClose={onClose}>
    <p>On-line parameter changes have been made, but not yet uploaded to the configuration database.</p>
    <p>Select the desired parameter values that you wish to upload into the database. Any parameters that are not selected will not be uploaded and the on-line parameter value changes will be lost.</p>
    <table className="dvx-details dvd-table"><thead><tr><th></th><th>Parameter Path</th><th>Field Name</th><th>Value</th><th>User Name</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={key(r)}><td><input type="checkbox" aria-label={`Upload ${key(r)}`} checked={selected.includes(key(r))}
        onChange={e => setSelected(s => e.target.checked ? [...s, key(r)] : s.filter(x => x !== key(r)))} /></td>
        <td>P{i + 1}/{r.param}</td><td>CV</td><td>{String(r.value)}</td><td>ADMINISTRATOR</td></tr>)}</tbody></table>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => setStage('confirm')}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button>
      <button className="tbtn sm" onClick={() => setSelected(rows.map(key))}>Select All</button>
      <button className="tbtn sm" onClick={() => setSelected([])}>Select None</button>
    </div>
  </SimulatorDialog>
  return <SimulatorDialog className="module-download-dialog dvd" label={`Download ${unit}`} onClose={onClose}>
    {stage === 'confirm' ? <>
      <p>Download {includeContained ? 'the unit module and contained modules' : 'the unit module'} {unit} to {useBatch.getState().unitAssignments[unit] ?? '(not assigned)'}?</p>
      {selected.length > 0 && <p className="exp-hint">Uploading {selected.join(', ')} into the configuration first.</p>}
      <Buttons okLabel="Download" onOk={go} onClose={onClose} />
    </> : <>
      <p role="status">Download of {unit} completed.</p>
      {warnings.length ? <ul className="lib-download-warnings">{warnings.map(w => <li key={w}>⚠ {w}</li>)}</ul> : <p>No warnings.</p>}
      <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button></div>
    </>}
    <Err error={error} />
  </SimulatorDialog>
}

/** DeltaV Operate: "Enter the name of the phase to start" (p4-34). */
export function LoadPhaseDialog({ unit, onClose }: { unit: string; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const phases = Object.keys(useBatch(s => s.deployedUnits[unit]?.logic ?? NO_LOGIC))
  const submit = (): void => { const e = asErr(useBatch.getState().loadPhase(unit, name)); if (e) setError(e); else onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label="DeltaV Operate" onClose={onClose}>
    <div className="dvd-split">
      <p style={{ flex: 1 }}>Enter the name of the phase to start :</p>
      <div className="lib-dlg-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    </div>
    <input aria-label="Phase name" className="dvd-big-input" autoFocus list="dvd-unit-phases" value={name}
      onChange={e => setName(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
    <datalist id="dvd-unit-phases">{phases.map(p => <option key={p} value={p} />)}</datalist>
    <Err error={error} />
  </SimulatorDialog>
}

/** Unit phase parameter Properties: per-unit configured value (overrides the phase class default; download the unit phase). */
export function UnitPhaseParamDialog({ unit, phase, param, onClose }: { unit: string; phase: string; param: string; onClose: () => void }): JSX.Element {
  const ph = useBatch(s => s.units[unit]?.phases[phase])
  const def = useBatch(s => (ph ? s.phaseClasses[ph.phaseClass]?.params[param] : undefined))
  const configured = ph?.paramValues[param]
  const [useDefault, setUseDefault] = useState(configured === undefined)
  const [value, setValue] = useState(String(configured ?? def?.defaultValue ?? ''))
  const [error, setError] = useState<string | null>(null)
  if (!ph || !def) return <></>
  const submit = (): void => {
    const e = asErr(useBatch.getState().setUnitPhaseParam(unit, phase, param, useDefault ? null : def.type === 'String' ? value : Number(value)))
    if (e) setError(e)
    else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${param} Properties`} onClose={onClose}>
    <Tabs tabs={['General']} active="General" onChange={() => {}} />
    <div className="dvd-panel">
      <Row label="Unit phase:">{unit}/{phase}</Row>
      <Row label="Parameter type:">{def.kind === 'batch' ? `Batch ${def.direction.toLowerCase()} parameter` : 'Phase algorithm parameter'} ({def.type})</Row>
      <Row label="Phase class default:">{String(def.defaultValue)}{def.units ? ` ${def.units}` : ''}</Row>
      <div className="lib-dlg-fields">
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Use phase class default" checked={useDefault} onChange={e => setUseDefault(e.target.checked)} /> Use phase class default</label>
        <label>Value:<input aria-label="Unit phase parameter value" autoFocus disabled={useDefault} value={useDefault ? String(def.defaultValue) : value}
          onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
      </div>
      <p className="exp-hint">A value configured here applies only to this unit phase. Download the unit phase (or unit module) for the change to take effect in the controller.</p>
    </div>
    <Buttons onOk={submit} onClose={onClose} />
    <Err error={error} />
  </SimulatorDialog>
}

/** Renders whichever Chapter 4 dialog is open (useBatchUi.dialog). */
export function BatchDialogHost(): JSX.Element | null {
  const d = useBatchUi(s => s.dialog)
  const close = (): void => useBatchUi.getState().openDialog(null)
  const b = useBatch.getState()
  if (!d) return null
  switch (d.t) {
    case 'newUnitClass': return <NewObjectDialog objectType="Unit Class" algorithm="<None>" existing={Object.keys(b.unitClasses).sort()} onClose={close}
      onOk={n => asErr(b.newUnitClass(d.category, n))} onCopy={(src, n) => asErr(useBatch.getState().copyClass('unit', d.category, src, n))} />
    case 'newPhaseClass': {
      const created = (r: ReturnType<typeof b.newPhaseClass>): string | null => {
        if (r.ok) void askConfirm(`Phase class ${r.value} created. Open it with Control Studio now?`).then(ok => { if (ok) { useUi.getState().openPhaseStudio(r.value) } })
        return asErr(r)
      }
      return <NewObjectDialog objectType="Phase Class" algorithm="Phase Algorithm" existing={Object.keys(b.phaseClasses).sort()} onClose={close}
        onOk={n => created(useBatch.getState().newPhaseClass(d.category, n))} onCopy={(src, n) => created(useBatch.getState().copyClass('phase', d.category, src, n))} />
    }
    case 'newAlias': return <NewAliasDialog unitClass={d.unitClass} onClose={close} />
    case 'alias': return <AliasResolveDialog unit={d.unit} alias={d.alias} onClose={close} />
    case 'param': return <PhaseParamDialog phaseClass={d.phaseClass} kind={d.kind} original={d.original} onClose={close} />
    case 'unitProps': return <UnitModulePropsDialog unit={d.unit} initialTab={d.tab} onClose={close} />
    case 'phaseProps': return <UnitPhasePropsDialog unit={d.unit} phase={d.phase} onClose={close} />
    case 'uphaseParam': return <UnitPhaseParamDialog unit={d.unit} phase={d.phase} param={d.param} onClose={close} />
    case 'assignPhase': return <PickDialog title="Assign Phase Class" prompt={`Select the phase class to assign to ${d.unitClass}:`}
      options={Object.keys(useBatch.getState().phaseClasses).filter(p => !useBatch.getState().unitClasses[d.unitClass]?.phaseClasses.includes(p)).sort()}
      onPick={p => asErr(useBatch.getState().assignPhaseClass(d.unitClass, p))} onClose={close} />
    case 'addToUnit': return <PickDialog title="Add To Unit Class" prompt={`Select the unit class to add ${d.phaseClass} to:`}
      options={Object.values(useBatch.getState().unitClasses).filter(u => !u.phaseClasses.includes(d.phaseClass)).map(u => u.name).sort()}
      onPick={u => asErr(useBatch.getState().assignPhaseClass(u, d.phaseClass))} onClose={close} />
    case 'assignNode': return <AssignNodeDialog unit={d.unit} includeContained={d.contained} controller={d.controller} onClose={close} />
    case 'download': return <UnitDownloadDialog unit={d.unit} includeContained={d.contained} onClose={close} />
    case 'loadPhase': return <LoadPhaseDialog unit={d.unit} onClose={close} />
    case 'newEmClass': return <NewEmClassDialog category={d.category} onClose={close} />
    case 'emProps': return <EmClassPropsDialog cls={d.cls} onClose={close} />
    case 'moduleBlock': return <ModuleBlockDialog unitClass={d.unitClass} className={d.className} onClose={close} />
    case 'moduleDesc': return <ModuleDescDialog tag={d.tag} onClose={close} />
    case 'bindBlock': {
      const u = useBatch.getState().units[d.unit]
      const blk = u && useBatch.getState().unitClasses[u.unitClass]?.modules?.[d.block]
      const em = useEm.getState()
      const options = blk?.kind === 'em' ? Object.values(em.instances).filter(i => blk.allowVariant || i.className === blk.className).map(i => i.tag) :
        Object.values(useStore.getState().modules).filter(m => blk?.allowVariant || em.cmInstances[m.tag]?.className === blk?.className).map(m => m.tag)
      return <PickDialog title={`Bind ${d.unit}/${d.block}`} prompt={`Select the module to bind to shared module block ${d.block} (${blk?.className ?? ''}):`}
        options={options.sort()} onPick={t => asErr(useBatch.getState().bindBlock(d.unit, d.block, t))} onClose={close} />
    }
  }
}

/** New ▸ Equipment Module Class (p5-12): Object name, Create New ▸ Algorithm type, Named Set name ▸ Browse. */
function NewEmClassDialog({ category, onClose }: { category: string; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [fromExisting, setFromExisting] = useState(false)
  const [source, setSource] = useState('')
  const [algorithm, setAlgorithm] = useState<EmAlgorithm>('Command driven')
  const [namedSet, setNamedSet] = useState('')
  const [browse, setBrowse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sets = useStore(s => s.namedSets.configured)
  const existing = useEm(s => Object.keys(s.classes).sort())
  const submit = (): void => {
    const r = fromExisting ? useEm.getState().copyClass(category, source, name) : useEm.getState().newClass(category, name, algorithm, namedSet)
    if (!r.ok) { setError(r.error); return }
    onClose()
    void askConfirm(`Equipment module class ${r.value} created. Open it with Control Studio now?`).then(ok => { if (ok) { useUi.getState().openEmStudio(r.value) } })
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="New" onClose={onClose}>
    <div className="dvd-split">
      <div className="lib-dlg-fields">
        <label>Object name:<input aria-label="Object name" autoFocus value={name} onChange={e => setName(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
        <label title="Fixed by the item you right-clicked (as in DeltaV)">Object type:<select aria-label="Object type" disabled value="Equipment Module Class"><option>Equipment Module Class</option></select></label>
        <fieldset className="lib-dlg-props">
          <legend><label className="lib-dlg-check"><input type="radio" name="new-em-mode" aria-label="Start From Existing" checked={fromExisting} onChange={() => setFromExisting(true)} /> Start From Existing</label></legend>
          <ExistingPicker enabled={fromExisting} value={source} options={existing} onPick={setSource} />
        </fieldset>
        <fieldset className="lib-dlg-props" disabled={fromExisting}>
          <legend><label className="lib-dlg-check"><input type="radio" name="new-em-mode" aria-label="Create New" checked={!fromExisting} onChange={() => setFromExisting(false)} /> Create New</label></legend>
          <label>Algorithm type:<select aria-label="Algorithm type" value={algorithm} onChange={e => setAlgorithm(e.target.value as EmAlgorithm)}>
            {EM_ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
          <p className="exp-hint">{EM_ALGORITHM_NOTE[algorithm]}{SUPPORTED_EM_ALGORITHMS.includes(algorithm) ? '' : ' — Not yet simulated in BatchLiveTrainer (see ALGORITHM-TYPES-NOTES.txt).'}</p>
          <div className="dvd-inline">
            <label style={{ flex: 1 }}>Named Set name:<input aria-label="Named Set name" value={namedSet} onChange={e => setNamedSet(e.target.value)} /></label>
            <button className="tbtn sm" onClick={() => setBrowse(v => !v)}>Browse...</button>
          </div>
          {browse && <div className="lib-browse" role="listbox" aria-label="Browse named sets">
            {Object.values(sets).map(s => <button key={s.name} className="ctx-item" onClick={() => { setNamedSet(s.name); setBrowse(false) }}>{s.name}{s.entries.some(x => x.value === 255) ? '' : ' (no 255 entry)'}</button>)}
          </div>}
        </fieldset>
      </div>
      <div className="lib-dlg-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    </div>
    <Err error={error} />
  </SimulatorDialog>
}

function EmClassPropsDialog({ cls, onClose }: { cls: string; onClose: () => void }): JSX.Element {
  const c = useEm(s => s.classes[cls])
  const [description, setDescription] = useState(c?.description ?? '')
  const [namedSet, setNamedSet] = useState(c?.namedSet ?? '')
  const [error, setError] = useState<string | null>(null)
  if (!c) return <SimulatorDialog className="module-download-dialog dvd" label="Properties" onClose={onClose}><p>{cls} no longer exists.</p></SimulatorDialog>
  return <SimulatorDialog className="module-download-dialog dvd" label={`${cls} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <Row label="Object type">Equipment Module Class</Row>
      <Row label="Algorithm type">{c.algorithm}</Row>
      <label>Description:<input aria-label="Description" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Named set:<input aria-label="Named set" value={namedSet} onChange={e => setNamedSet(e.target.value)} /></label>
      <p className="exp-hint">Changing the named set regenerates the {c.algorithm === 'Command driven' ? 'command blocks (existing logic is kept for matching values)' : 'state columns'}.</p>
    </div>
    <Buttons onOk={() => { const r = useEm.getState().setClassProps(cls, { description, namedSet }); if (r.ok) onClose(); else setError(r.error) }} onClose={onClose} />
    <Err error={error} />
  </SimulatorDialog>
}

/** Module block (p5-26 / 5-27): Class name, Ownership type, Allow variant module to be substituted on module instances. */
function ModuleBlockDialog({ unitClass, className, onClose }: { unitClass: string; className: string; onClose: () => void }): JSX.Element {
  const [cls, setCls] = useState(className)
  const [ownership, setOwnership] = useState<'Private' | 'Shared'>('Private')
  const [variant, setVariant] = useState(true)
  const [browse, setBrowse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ems = Object.keys(useEm(s => s.classes))
  const submit = (): void => {
    const r = useBatch.getState().addModuleBlock(unitClass, cls.trim().toUpperCase(), ownership, variant)
    // Start the in-place rename after the dialog has unmounted and returned focus, or the editor would blur-commit at once.
    if (r.ok) { onClose(); window.setTimeout(() => useBatchUi.getState().setRenaming({ kind: 'ucBlock', unitClass, name: r.value }), 0) } else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Module block" onClose={onClose}>
    <div className="dvd-split">
      <div className="lib-dlg-fields">
        <div className="dvd-inline"><label style={{ flex: 1 }}>Class name:<input aria-label="Class name" autoFocus value={cls} onChange={e => setCls(e.target.value)} /></label>
          <button className="tbtn sm" onClick={() => setBrowse(v => !v)}>Browse...</button></div>
        {browse && <div className="lib-browse" role="listbox" aria-label="Browse module classes">
          {[...ems, ...Object.keys(CM_DEVICE_CLASSES)].map(n => <button key={n} className="ctx-item" onClick={() => { setCls(n); setBrowse(false) }}>{n}</button>)}
        </div>}
        <label>Ownership type:<select aria-label="Ownership type" value={ownership} onChange={e => setOwnership(e.target.value as 'Private' | 'Shared')}>
          <option>Private</option><option>Shared</option></select></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Allow variant module to be substituted on module instances" checked={variant} onChange={e => setVariant(e.target.checked)} />
          Allow variant module to be substituted on module instances</label>
        <p className="exp-hint">{ownership === 'Private' ? 'Private converts this module block to a module when you create an instance of the unit class.' :
          'Shared creates an unbound module block on each instance; bind it to a module later.'}</p>
      </div>
      <div className="lib-dlg-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    </div>
    <Err error={error} />
  </SimulatorDialog>
}

function ModuleDescDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element {
  const m = useStore(s => s.modules[tag])
  const inst = useEm(s => s.instances[tag])
  const [description, setDescription] = useState(m?.description ?? inst?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label={`${tag} Properties`} onClose={onClose}>
    <Tabs tabs={['General']} active="General" onChange={() => {}} />
    <div className="lib-dlg-fields dvd-panel">
      <Row label="Object type">{inst ? `Equipment Module (${inst.className})` : `Control Module${useEm.getState().cmInstances[tag] ? ` (${useEm.getState().cmInstances[tag].className})` : ''}`}</Row>
      <label>Description:<input aria-label="Description" autoFocus value={description} onChange={e => setDescription(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const r = useBatch.getState().setModuleDescription(tag, description); if (r.ok) onClose(); else setError(r.error) } }} /></label>
    </div>
    <Buttons onOk={() => { const r = useBatch.getState().setModuleDescription(tag, description); if (r.ok) onClose(); else setError(r.error) }} onClose={onClose} />
    <Err error={error} />
  </SimulatorDialog>
}