import { useEffect, useState } from 'react'
import { useStore } from '../engine/store'
import { useLibrary } from '../engine/libraryStore'
import {
  useDv09Cm, DV09_FILTER_GROUPS, addBlock, assignToNode, downloadModule, cmDirty, cmNeedsDownload, saveModule, setDiscreteAlarm,
  setFilters, setIoDst, setModeTarget, setPrimaryDisplay, studioBlockSelected, studioOnline, studioOpened, writeSpD, type Dv09BlockType
} from '../engine/dv09Cm'
import { traditionalChannels } from '../engine/traditionalIo'
import { addLoopBlock, uploadDifferences } from '../engine/dv09Loops'
import { Dv09UploadDialog } from './Dv09UploadDialog'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { ModuleIcon, FunctionBlockIcon } from '../components/EngineeringIcons'
import { PaneResizer, usePersistentSize } from '../components/PaneResizer'
import { Btn, Group, Stack } from './ControlStudioDisplay'

// Course DV-09 chapter 3: Control Studio for a module created in DeltaV Explorer (XV-101, XVSTAT-101): Hierarchy View, Diagram View
// with the IO palette, Parameter View ("Filtered by") and Alarm View, and the Assign To Node / Properties / Save / Download /
// On-Line buttons of the manual (pp 3-14, 3-15, 3-18, 3-19).

const DND_BLOCK = 'application/x-dv09-block'
const IO_PALETTE: { label: string; type: Dv09BlockType | null; note: string }[] = [
  { label: 'Analog Input', type: 'AI', note: 'Drag onto the diagram' },
  { label: 'Analog Output', type: 'AO', note: 'Drag onto the diagram' },
  { label: 'Discrete Input', type: 'DI', note: 'Drag onto the diagram' },
  { label: 'Discrete Output', type: 'DO', note: 'Drag onto the diagram' }
]

export function Dv09ControlStudio({ tag }: { tag: string }): JSX.Element {
  const cm = useDv09Cm(s => s.cms[tag])
  const m = useStore(s => s.modules[tag])
  const hardware = useStore(s => s.hardware)
  const controller = useLibrary(s => s.assignments[tag])
  useStore(s => s.rev)
  const [online, setOnline] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [bottom, setBottom] = useState<'parameters' | 'alarms'>('parameters')
  const [dialog, setDialog] = useState<null | 'filter' | 'assign' | 'props' | 'download'>(null)
  const [message, setMessage] = useState('')
  const [bottomHeight, setBottomHeight] = usePersistentSize('studio.bottomHeight', 200)
  const [dropping, setDropping] = useState(false)
  useEffect(() => { studioOpened(tag) }, [tag])
  if (!cm) return <div className="display studio"><div className="exp-empty">{tag} was not found.</div></div>

  const block = cm.blocks[0]
  const dirty = cmDirty(cm)
  const status = (): string => (cm.deployed === undefined ? 'Not downloaded' : cmNeedsDownload(cm) ? 'Download required' : 'Downloaded')
  const run = (err: string | null): void => setMessage(err ?? '')
  const drop = (type: Dv09BlockType): void => { run(type === 'AI' || type === 'AO' ? addLoopBlock(tag, type) : addBlock(tag, type)); setSelected(type + '1'); setDropping(false) }
  const select = (name: string): void => {
    setSelected(name)
    if (online) studioBlockSelected(tag, name)
  }
  const goOnline = (value: boolean): void => {
    setOnline(value)
    setSelected(null)
    if (value) studioOnline(tag)
  }

  return (
    <div className="display studio" data-dv09-studio={tag}>
      <div className="ribbon">
        <div className="studio-caption"><ModuleIcon kind="control" size={16} /><span>{tag} — Control Studio</span>
          <span className="studio-caption-status">{online ? 'ON-LINE' : 'EDIT'} · {status()}{dirty && block ? ' · unsaved changes' : ''}</span></div>
        <div className="ribbon-tabs">
          <div className="rb-quick" role="toolbar" aria-label="Quick access">
            <Btn glyph="save" label="Save" size="tiny" onClick={() => run(saveModule(tag))} unavailable={online ? 'Go to Edit before saving' : undefined} />
          </div>
          <button type="button" className="ribbon-tab active" aria-pressed>Home</button>
        </div>
        <div className="ribbon-body rb-body">
          <Group label="Module">
            <Btn glyph="download" label="Download" onClick={() => { setMessage(''); setDialog('download') }} />
            <Btn glyph="assign" label="Assign To Node" onClick={() => setDialog('assign')} unavailable={online ? 'Go to Edit before assigning the module' : undefined} />
            <Stack>
              <Btn glyph="properties" label="Properties" size="small" onClick={() => setDialog('props')} unavailable={online ? 'Go to Edit before changing the module properties' : undefined} />
            </Stack>
          </Group>
          <Group label="Diagram Mode">
            <Btn glyph="onlineDebug" label="On-Line" active={online} onClick={() => goOnline(true)} />
            <Btn glyph="edit" label="Edit" active={!online} onClick={() => goOnline(false)} />
          </Group>
        </div>
      </div>
      <div className="studio-main">
        <div className="studio-pane studio-hier" style={{ width: 190, minWidth: 190, flex: '0 0 190px' }}>
          <div className="studio-tree">
            <div className="studio-tree-root" role="button" tabIndex={0} onClick={() => setSelected(null)}><ModuleIcon kind="control" /> {tag}</div>
            {block && <button type="button" className={'studio-tree-node studio-block-select' + (selected === block.name ? ' active' : '')}
              aria-label={`Select ${block.name}`} onClick={() => select(block.name)}><FunctionBlockIcon type={block.type} />{block.name}</button>}
          </div>
          <div className="studio-pane-label">Hierarchy View</div>
        </div>
        <div className="studio-center">
          <div className="studio-page dv09-diagram" role="document" aria-label={`${tag} diagram`}
            onDragOver={e => { if (!block && !online && e.dataTransfer.types.includes(DND_BLOCK)) { e.preventDefault(); setDropping(true) } }}
            onDragLeave={() => setDropping(false)}
            onDrop={e => { const t = e.dataTransfer.getData(DND_BLOCK); if (t === 'DO' || t === 'DI' || t === 'AO' || t === 'AI') { e.preventDefault(); if (!block && !online) drop(t) } }}>
            {!block ? <div className={'dv09-diagram-empty' + (dropping ? ' over' : '')} data-diagram-empty>
              <div>Diagram View — drag and drop a function block from the IO palette here
                {m === undefined && <div className="exp-hint">Discrete Output for a discrete output module, Discrete Input for a discrete input module.</div>}</div>
            </div> :
              <div className={'dv09-block' + (selected === block.name ? ' selected' : '')} data-block={block.name} role="button" tabIndex={0}
                onClick={() => select(block.name)}>
                <div className="dv09-block-title">{block.name}<span className="dv09-block-icon" /></div>
                {block.type === 'DO' ? <>
                  <div className="dv09-block-row"><span className="pin in">CAS_IN_D</span><span className="pin out">BKCAL_OUT_D</span></div>
                  <div className="dv09-block-row"><span /><span className="pin out">OUT_D</span></div>
                </> : <div className="dv09-block-row"><span /><span className="pin out">OUT_D</span></div>}
                <div className="dv09-block-foot">#1</div>
              </div>}
          </div>
          <PaneResizer axis="y" sign={-1} value={bottomHeight} min={96} max={600} onChange={setBottomHeight} label="Resize parameter and alarm panel" />
          <div className="studio-bottom" style={{ height: bottomHeight }}>
            <div className="studio-bottom-tabs" role="tablist" aria-label="Bottom panel">
              <button type="button" role="tab" aria-selected={bottom === 'parameters'} className={bottom === 'parameters' ? 'active' : ''} onClick={() => setBottom('parameters')}>Parameter View</button>
              <button type="button" role="tab" aria-selected={bottom === 'alarms'} className={bottom === 'alarms' ? 'active' : ''} onClick={() => setBottom('alarms')}>Alarm View</button>
            </div>
            {bottom === 'parameters' ? <ParameterView tag={tag} online={online} selected={selected} onFilter={() => setDialog('filter')} onMessage={setMessage} hardware={hardware} /> : <AlarmView tag={tag} online={online} />}
          </div>
        </div>
        <div className="studio-pane studio-palette" style={{ width: 184, minWidth: 184, flex: '0 0 184px' }}>
          <div className="studio-palette-body">
            <div className="studio-pal-group">
              <div className="studio-pal-head">IO</div>
              {IO_PALETTE.map(item => <div key={item.label} className="studio-pal-item" data-palette={item.label} aria-disabled={!item.type}
                draggable={!!item.type && !block && !online} title={item.type ? (block ? `${tag} already has a block` : item.note) : item.note}
                onDragStart={e => { if (item.type) { e.dataTransfer.setData(DND_BLOCK, item.type); e.dataTransfer.setData('text/plain', item.label); e.dataTransfer.effectAllowed = 'copy' } }}
                onDoubleClick={() => { if (item.type && !block && !online) drop(item.type) }}>
                <FunctionBlockIcon type={item.type ?? 'AI'} /><span>{item.label}</span></div>)}
            </div>
          </div>
          <div className="studio-pane-label">Palette · IO</div>
        </div>
      </div>
      <div className="studio-statusbar">
        <span>Assigned to: {controller ?? 'Not assigned'}</span>
        {message && <span role="status" className="dv09-studio-message">{message}</span>}
      </div>
      {dialog === 'filter' && <FilterDialog tag={tag} onClose={() => setDialog(null)} />}
      {dialog === 'assign' && <AssignDialog tag={tag} onClose={() => setDialog(null)} onMessage={setMessage} />}
      {dialog === 'props' && <PropertiesDialog tag={tag} onClose={() => setDialog(null)} onMessage={setMessage} />}
      {dialog === 'download' && <DownloadDialog tag={tag} onClose={() => setDialog(null)} />}
    </div>
  )
}

function ParameterView({ tag, online, selected, onFilter, onMessage, hardware }: {
  tag: string; online: boolean; selected: string | null; onFilter: () => void; onMessage: (m: string) => void; hardware: ReturnType<typeof useStore.getState>['hardware']
}): JSX.Element {
  const cm = useDv09Cm(s => s.cms[tag])
  const m = useStore(s => s.modules[tag])
  const assigned = useLibrary(s => s.assignments[tag])
  const filters = cm?.filters ?? []
  const all = filters.includes('All Parameters')
  const quick = all || filters.includes('Quick Configuration')
  const common = all || filters.includes('Common Configuration')
  const block = cm?.blocks[0]
  const filterText = filters.length ? filters.join(', ') : '(none)'
  const channels = traditionalChannels(hardware).filter(item => !!block && item.card.type === block.type && item.channel.dst)
  const binding = hardware.discreteBindings?.[tag] ?? ''
  const rows: JSX.Element[] = []
  const row = (name: string, value: JSX.Element | string, status: string): void => {
    rows.push(<tr key={name} data-param={name}><td>{name}</td><td className="pv">{value}</td><td className={status === 'Bad' ? 'bad' : 'good'}>{status}</td></tr>)
  }
  if (!block || !m || (m.type !== 'DO' && m.type !== 'DI') || selected !== block.name) {
    row('NAME', tag, 'Good')
    row('DESCRIPTION', cm?.description || tag, 'Good')
    row('AREA', cm?.area ?? '', 'Good')
    row('ASSIGNED NODE', assigned ?? '(not assigned)', 'Good')
    row('PRIMARY CONTROL DISPLAY', m && 'primaryDisplay' in m ? m.primaryDisplay ?? '' : '', 'Good')
    if (!block) rows.push(<tr key="hint"><td colSpan={3}>The module has no function block yet.</td></tr>)
  } else {
    const bad = !!m.ioBad
    if (m.type === 'DO') {
      row('SP_D', online ? <select aria-label="SP_D" value={m.commanded ? '1' : '0'} onChange={e => onMessage(writeSpD(tag, e.target.value === '1' ? 1 : 0) ?? '')}>
        <option value="0">0</option><option value="1">1</option></select> : String(Number(m.commanded)), bad ? 'Bad' : 'Good')
      row('PV_D', String(Number(m.state)), bad ? 'Bad' : 'Good')
      row('OUT_D', String(Number(m.state)), bad ? 'Bad' : 'Good')
    } else {
      row('PV_D', String(Number(m.state)), bad ? 'Bad' : 'Good')
      row('OUT_D', String(Number(m.state)), bad ? 'Bad' : 'Good')
    }
    if (quick) row(m.type === 'DO' ? 'IO_OUT' : 'IO_IN', <select aria-label={m.type === 'DO' ? 'IO_OUT' : 'IO_IN'} disabled={online} value={binding}
      onChange={e => onMessage(setIoDst(tag, e.target.value) ?? '')}>
      <option value="">(none)</option>
      {binding && !channels.some(c => c.channel.dst === binding) && <option value={binding}>{binding}</option>}
      {channels.map(c => <option key={c.channel.dst} value={c.channel.dst}>{c.channel.dst}</option>)}
    </select>, binding ? (bad ? 'Bad' : 'Good') : 'Bad')
    if (common) {
      if (m.type === 'DO') {
        row('MODE.TARGET', <select aria-label="MODE target" disabled={online} value={m.modeTarget ?? 'AUTO'} onChange={e => onMessage(setModeTarget(tag, e.target.value as 'CAS' | 'AUTO' | 'MAN' | 'OOS') ?? '')}>
          <option value="CAS">Cascade</option><option value="AUTO">Auto</option><option value="MAN">Manual</option><option value="OOS">Out of Service</option></select>, 'Good')
        row('MODE.ACTUAL', m.modeTarget === 'CAS' ? 'Cascade (CAS_IN_D not connected)' : m.mode === 'OOS' ? 'Out of Service' : (m.modeTarget ?? 'AUTO') === 'MAN' ? 'Manual' : 'Auto', 'Good')
        row('MODE.PERMITTED', 'OOS, MAN, AUTO, CAS', 'Good')
      } else {
        row('MODE.TARGET', m.mode === 'OOS' ? 'Out of Service' : 'Auto', 'Good')
        row('MODE.PERMITTED', 'OOS, AUTO', 'Good')
      }
    }
  }
  return (
    <div className="studio-pane studio-params">
      <div className="dv09-filterbar"><span>Filtered by:</span>
        <span className="dv09-filter-value" role="button" tabIndex={0} data-filtered-by aria-label="Filtered by" title="Double-click to choose the parameter groups"
          onDoubleClick={onFilter}>{filterText}</span></div>
      <table className="studio-param-table" aria-label={`${tag} parameters`}>
        <thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <div className="studio-pane-label">Parameter View — {tag}{block && selected === block.name ? `/${block.name}` : ''}</div>
    </div>
  )
}

function AlarmView({ tag, online }: { tag: string; online: boolean }): JSX.Element {
  const m = useStore(s => s.modules[tag])
  const alarms = useStore(s => s.alarms)
  const di = m?.type === 'DI' ? m : undefined
  const alarm = di?.alarms.find(a => a.type === 'HI')
  const live = alarm ? alarms.find(a => a.moduleTag === tag && a.type === 'HI' && a.active) : undefined
  return (
    <div className="studio-pane studio-alarms">
      <div className="studio-alarm-scroll">
        <table className="studio-param-table" aria-label={`${tag} alarm view`}>
          <thead><tr><th>Alarm</th><th>Parameter</th><th>Alarm on value</th><th>Enabled</th><th>Priority</th><th>State</th></tr></thead>
          <tbody>
            {!di || !alarm ? <tr><td colSpan={6}>No alarms are defined for this module.</td></tr> : <tr data-alarm="DISCRETE_ALM">
              <td>Discrete Alarm</td><td>DI1/PV_D</td>
              <td><select aria-label="Discrete Alarm on value" disabled={online} value={Number(di.alarmOnValue ?? true)}
                onChange={e => setDiscreteAlarm(tag, e.target.value === '1')}><option value={0}>0</option><option value={1}>1</option></select></td>
              <td><input type="checkbox" aria-label="Discrete Alarm enabled" disabled={online} checked={alarm.enabled} onChange={e => setDiscreteAlarm(tag, di.alarmOnValue ?? true, e.target.checked)} /></td>
              <td>{alarm.priority}</td><td>{live ? 'Active' : 'Normal'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="studio-pane-label">Alarm View — {tag}</div>
    </div>
  )
}

export function FilterDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element {
  const current = useDv09Cm(s => s.cms[tag]?.filters ?? [])
  const [picked, setPicked] = useState<string[]>(current)
  const toggle = (g: string): void => setPicked(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g])
  return <SimulatorDialog className="module-download-dialog dvd" label="Filtered by" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p className="exp-hint">Choose the parameter groups the Parameter View lists.</p>
      {DV09_FILTER_GROUPS.map(g => <label key={g} className="lib-dlg-check"><input type="checkbox" aria-label={g} checked={picked.includes(g)} onChange={() => toggle(g)} /> {g}</label>)}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { setFilters(tag, picked); onClose() }}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

export function AssignDialog({ tag, onClose, onMessage }: { tag: string; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const controllers = useStore(s => s.hardware.controllers)
  const current = useLibrary(s => s.assignments[tag])
  const nodes = Object.values(controllers).filter(c => c.commissioned)
  const [node, setNode] = useState(current ?? nodes[0]?.tag ?? '')
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label="Assign to Node" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Assign {tag} to a node (controller):</p>
      {nodes.length === 0 && <p className="exp-hint">No commissioned controller exists: commission one in DeltaV Explorer first.</p>}
      {nodes.map(c => <label key={c.tag} className="lib-dlg-check"><input type="radio" name="node" aria-label={c.tag} checked={node === c.tag} onChange={() => setNode(c.tag)} /> {c.tag}{c.description ? ` - ${c.description}` : ''}</label>)}
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" disabled={!node} onClick={() => { const e = assignToNode(tag, node); if (e) setError(e); else { onMessage(`${tag} assigned to ${node}`); onClose() } }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function PropertiesDialog({ tag, onClose, onMessage }: { tag: string; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const cm = useDv09Cm(s => s.cms[tag])
  const m = useStore(s => s.modules[tag])
  const [tab, setTab] = useState('General')
  const [primary, setPrimary] = useState(m && 'primaryDisplay' in m ? m.primaryDisplay ?? '' : '')
  const [detail, setDetail] = useState(m && 'detailDisplay' in m ? m.detailDisplay ?? '' : '')
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${tag} Properties`} onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{['General', 'Displays'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <label>Name:<input aria-label="Module name" readOnly value={tag} /></label>
        <label>Description:<input aria-label="Module description" readOnly value={cm?.description || tag} /></label>
        <label>Area:<input aria-label="Module area" readOnly value={cm?.area ?? ''} /></label>
        <p className="exp-hint">Module scan rate 1 second (default). A control module is the smallest entity that is downloaded to the controller.</p>
      </>}
      {tab === 'Displays' && <>
        <label>Primary control:<input aria-label="Primary control display" value={primary} onChange={e => setPrimary(e.target.value)} placeholder="e.g. Tank101" /></label>
        <label>Detail:<input aria-label="Detail display" value={detail} onChange={e => setDetail(e.target.value)} /></label>
        <label>Instrument:<input aria-label="Instrument display" readOnly value="" /></label>
      </>}
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { const e = setPrimaryDisplay(tag, primary, detail); if (e) setError(e); else { onMessage(`${tag}: primary control display ${primary}`); onClose() } }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

export function DownloadDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element {
  const controller = useLibrary(s => s.assignments[tag])
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [upload, setUpload] = useState(false)
  const [prompted, setPrompted] = useState(false)
  const go = (): void => { const e = downloadModule(tag); setResult(e ? { ok: false, text: e } : { ok: true, text: `Download complete: ${tag} is running in ${controller}.` }) }
  // p6-26: a download offers an Upload first when the on-line values were changed.
  const start = (): void => { if (!prompted && uploadDifferences(tag).length) { setPrompted(true); setUpload(true) } else go() }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Download ${tag}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Download control module {tag} to {controller ?? 'its node (not assigned yet)'}.</p>
      {result && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'exp-hint' : 'lib-dlg-error'} data-download-result={result.ok ? 'ok' : 'failed'}>{result.text}</p>}
    </div>
    <div className="dvd-buttons">
      {!result?.ok && <button className="tbtn sm" onClick={start}>Download</button>}
      <button className="tbtn sm" onClick={onClose}>{result?.ok ? 'Close' : 'Cancel'}</button></div>
    {upload && <Dv09UploadDialog tag={tag} onClose={() => { setUpload(false); go() }} />}
  </SimulatorDialog>
}
