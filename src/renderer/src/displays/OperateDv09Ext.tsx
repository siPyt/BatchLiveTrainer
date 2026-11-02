import { useState } from 'react'
import { useStore } from '../engine/store'
import { usePictures, type PicElement } from '../engine/pictureStore'
import { DYNAMO_SETS } from '../engine/pictureObjects'
import { pictureSourcePaths } from '../engine/pictureObjects'
import { parseDatalinkSource } from '../engine/dv09Operate'
import {
  expertOpened, setDataEntry, setVisibility, setShapeColor, setFill, setPumpColorBy, setColorAnimation, type ConditionSpec, type EntrySpec
} from '../engine/dv09OperateEx'
import { pictureLimits, pictureSignal } from '../engine/pictureDynamics'
import { SimulatorDialog } from '../components/SimulatorDialog'

// Course DV-09 chapters 4-6: the experts and dynamo dialogs of DeltaV Operate (Configure): Data Entry Expert, Visibility Expert, the rectangle
// Color and Basic Animation (Fill Percentage / Fill Expert) dialogs, the pump and valve dynamo dialogs with their Color By dialogs.

const PALETTE: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#000000' }, { name: 'White', hex: '#ffffff' }, { name: 'Red', hex: '#ff0000' }, { name: 'Green', hex: '#00aa00' },
  { name: 'Blue', hex: '#0000ff' }, { name: 'Yellow', hex: '#ffff00' }, { name: 'Orange', hex: '#ff8800' }, { name: 'Cyan', hex: '#00aaaa' }, { name: 'Gray', hex: '#888888' },
  { name: 'Light Blue', hex: '#cfe2f3' }, { name: 'Light Green', hex: '#d9ead3' }
]
const colorName = (hex: string | undefined): string => PALETTE.find(p => p.hex === hex)?.name ?? ''

export type ExtDialog =
  | { kind: 'entry' | 'visibility' | 'rectcolor' | 'animations' | 'fill' | 'pump' | 'valve'; id: string }
  | { kind: 'pumpcolor' | 'valvecolor' | 'actuatorcolor'; id: string }

const sourceText = (el: PicElement): string => `DVSYS.${el.tag ?? ''}/${el.path ?? ''}${el.path && /\.A_/.test(el.path) ? '' : '.F_CV'}`

export function ExtDialogs({ pic, ext, setExt, setMessage }: { pic: string; ext: ExtDialog | null; setExt: (e: ExtDialog | null) => void; setMessage: (m: string) => void }): JSX.Element | null {
  const el = usePictures(s => (ext ? s.pictures[pic]?.elements.find(e => e.id === ext.id) : undefined))
  if (!ext || !el) return null
  const close = (): void => setExt(null)
  switch (ext.kind) {
    case 'entry': return <DataEntryExpert pic={pic} el={el} onClose={close} onMessage={setMessage} />
    case 'visibility': return <VisibilityExpert pic={pic} el={el} onClose={close} onMessage={setMessage} />
    case 'rectcolor': return <RectColorDialog pic={pic} el={el} onClose={close} onMessage={setMessage} />
    case 'animations': return <BasicAnimationDialog el={el} onClose={close} onFill={() => setExt({ kind: 'fill', id: el.id })} />
    case 'fill': return <FillExpert pic={pic} el={el} onClose={() => setExt({ kind: 'animations', id: el.id })} onMessage={setMessage} />
    case 'pump': return <PumpDynamoDialog el={el} onClose={close} onColor={() => setExt({ kind: 'pumpcolor', id: el.id })} />
    case 'pumpcolor': return <PumpColorBy pic={pic} el={el} onClose={() => setExt({ kind: 'pump', id: el.id })} onMessage={setMessage} />
    case 'valve': return <ValveDynamoDialog el={el} onClose={close} onValve={() => setExt({ kind: 'valvecolor', id: el.id })} onActuator={() => setExt({ kind: 'actuatorcolor', id: el.id })} />
    case 'valvecolor': return <ConditionColors pic={pic} el={el} target="valve" onClose={() => setExt({ kind: 'valve', id: el.id })} onMessage={setMessage} />
    case 'actuatorcolor': return <ConditionColors pic={pic} el={el} target="actuator" onClose={() => setExt({ kind: 'valve', id: el.id })} onMessage={setMessage} />
  }
}

/** The DeltaV_ToolBox buttons added by chapters 4-6. */
export function ExtButtons({ pic, selected, onRectangle, onExpert }: { pic: string | null; selected: PicElement | undefined; onRectangle: () => void; onExpert: (kind: 'entry' | 'visibility') => void }): JSX.Element {
  return <>
    <button aria-label="Rectangle" title="Rectangle" disabled={!pic} onClick={onRectangle}><span className="dv09-rect-glyph" /></button>
    <button aria-label="Data Entry Expert" title="Data Entry Expert" disabled={!pic || selected?.type !== 'datalink'} onClick={() => onExpert('entry')}>⌨</button>
    <button aria-label="Visibility Expert" title="Visibility Expert" disabled={!pic || selected?.type !== 'datalink'} onClick={() => onExpert('visibility')}>👁</button>
  </>
}
export { expertOpened }

function Buttons({ onOk, onClose, okDisabled }: { onOk: () => void; onClose: () => void; okDisabled?: boolean }): JSX.Element {
  return <div className="dvd-buttons"><button className="tbtn sm" disabled={okDisabled} onClick={onOk}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button>
    <button className="tbtn sm" onClick={() => window.alert('Experts simplify the task of adding animation to an object (Course DV-09 pp 4-16, 4-53).')}>Help</button></div>
}

const ENTRY_TABS = ['Numeric/Alpha', 'Slider', 'PushButton', 'Ramp', 'Multi-Item Select'] as const

/** Data Entry Expert (pp 4-16, 4-17): Entry Method tabs Numeric/Alpha, Slider, PushButton, Ramp and Multi-Item Select. */
function DataEntryExpert({ pic, el, onClose, onMessage }: { pic: string; el: PicElement; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const path = (el.path ?? '').toUpperCase()
  const first = /MODE\.A_TARGET$/.test(path) || /^(DC1|DO1)\/SP_D/.test(path) ? 'Multi-Item Select' : /PID1\/OUT$/.test(path) ? 'Ramp' : 'Numeric/Alpha'
  const [tab, setTab] = useState<typeof ENTRY_TABS[number]>(first)
  const [caption, setCaption] = useState(el.tag ?? '')
  const [method, setMethod] = useState<'numeric' | 'alpha'>('numeric')
  const entry = el.entry?.method === 'NUMERIC' ? el.entry : undefined
  const [low, setLow] = useState(String(entry?.low ?? 0))
  const [high, setHigh] = useState(String(entry?.high ?? 100))
  const [fetch, setFetch] = useState(entry?.fetchLimits ?? true)
  const [confirm, setConfirm] = useState(!!el.entry?.confirm)
  const [rate, setRate] = useState(String(el.entry?.method === 'RAMP' ? el.entry.rate : 5))
  const [names, setNames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const getNames = (): void => {
    const m = useStore.getState().modules[el.tag ?? '']
    setNames(/MODE\.A_TARGET$/.test(path) ? (m?.type === 'PID' ? (m.permittedModes ?? ['MAN', 'AUTO', 'CAS']) : []) : m?.type === 'MOTOR' ? ['STOP', 'START'] : m?.type === 'VALVE' ? ['CLOSE', 'OPEN'] : ['0', '1'])
  }
  const ok = (): void => {
    let spec: EntrySpec
    if (tab === 'Numeric/Alpha') {
      if (method === 'alpha') { setError('AlphaNumeric entry is not modeled; select Numeric Entry'); return }
      const lo = Number(low), hi = Number(high)
      if (!fetch && (!Number.isFinite(lo) || !Number.isFinite(hi))) { setError('The limits must be numbers'); return }
      spec = { kind: 'numeric', low: lo, high: hi, fetchLimits: fetch, confirm }
    } else if (tab === 'Ramp') spec = { kind: 'ramp', rate: Number(rate) }
    else if (tab === 'Multi-Item Select') spec = /MODE\.A_TARGET$/.test(path) ? { kind: 'mode' } : { kind: 'multi', labels: names.length === 2 ? [names[0], names[1]] : undefined }
    else { setError(`The ${tab} entry method is not modeled in this simulator`); return }
    const e = setDataEntry(pic, el.id, spec)
    if (e) setError(e); else { onMessage(`Data Entry Expert applied to ${el.tag}/${el.path}`); onClose() }
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Data Entry Expert" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <fieldset className="dvd-group"><legend>Output Data Source</legend><input aria-label="Output Data Source" readOnly value={sourceText(el)} /></fieldset>
      <fieldset className="dvd-group"><legend>Expert Caption</legend><input aria-label="Expert Caption" value={caption} onChange={e => setCaption(e.target.value)} /></fieldset>
      <fieldset className="dvd-group"><legend>Entry Method</legend>
        <div className="dvd-tabs" role="tablist">{ENTRY_TABS.map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => { setTab(t); setError(null) }}>{t}</button>)}</div>
        {tab === 'Numeric/Alpha' && <div className="dv09-entry-pane">
          <label className="lib-dlg-check"><input type="radio" name="entrymethod" aria-label="Numeric Entry" checked={method === 'numeric'} onChange={() => setMethod('numeric')} /> Numeric Entry</label>
          <label className="lib-dlg-check"><input type="radio" name="entrymethod" aria-label="AlphaNumeric Entry" checked={method === 'alpha'} onChange={() => setMethod('alpha')} /> AlphaNumeric Entry</label>
          <label>Low Limit:<input aria-label="Low Limit" disabled={fetch} value={low} onChange={e => setLow(e.target.value)} /></label>
          <label>High Limit:<input aria-label="High Limit" disabled={fetch} value={high} onChange={e => setHigh(e.target.value)} /></label>
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Fetch Limits from the Data Source" checked={fetch} onChange={e => setFetch(e.target.checked)} /> Fetch Limits from the Data Source</label>
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Write Requires Confirmation" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> Write Requires Confirmation</label>
        </div>}
        {tab === 'Ramp' && <div className="dv09-entry-pane"><label>Ramp rate (% per second):<input aria-label="Ramp rate" value={rate} onChange={e => setRate(e.target.value)} /></label></div>}
        {tab === 'Multi-Item Select' && <div className="dv09-entry-pane">
          <p className="exp-hint">Click Get Names to list the items of the parameter (the named set of the device, or the permitted modes of the block).</p>
          <button className="tbtn sm" aria-label="Get names" onClick={getNames}>Get names</button>
          <ul aria-label="Items" className="dv09-list">{names.map(n => <li key={n}>{n}</li>)}</ul>
        </div>}
        {(tab === 'Slider' || tab === 'PushButton') && <div className="dv09-entry-pane"><p className="exp-hint">The {tab} entry method is not modeled in this simulator.</p></div>}
      </fieldset>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <Buttons onOk={ok} onClose={onClose} />
  </SimulatorDialog>
}

/** Visibility Expert (pp 4-53): Data Source and the condition for the datalink to be visible. */
function VisibilityExpert({ pic, el, onClose, onMessage }: { pic: string; el: PicElement; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const [source, setSource] = useState('')
  const [op, setOp] = useState('=')
  const [value, setValue] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const ok = (): void => {
    const whenActive = op === '>' && Number(value) === 0
    if (op === '=' && Number(value) === 0) { setError('A datalink that is visible when the alarm field is 0 would show only when there is no alarm; set the condition to > 0'); return }
    const e = setVisibility(pic, el.id, source, whenActive)
    if (e) setError(e); else { onMessage('Visibility Expert applied'); onClose() }
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Visibility Expert" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <fieldset className="dvd-group"><legend>Data Source</legend><input aria-label="Data Source" value={source} onChange={e => { setSource(e.target.value); setError(null) }} placeholder="MODULE/ALARMS[1].F_LAALM" /></fieldset>
      <fieldset className="dvd-group"><legend>Condition</legend>
        <div className="dvd-inline"><span>Visible when the value is</span>
          <select aria-label="Operator" value={op} onChange={e => setOp(e.target.value)}><option>=</option><option>&gt;</option><option>&lt;</option></select>
          <input aria-label="Value" value={value} onChange={e => setValue(e.target.value)} style={{ width: 60 }} /></div>
        <p className="exp-hint">F_LAALM is 0 when the module has no alarm and greater than 0 when an alarm is active.</p>
      </fieldset>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <Buttons onOk={ok} onClose={onClose} okDisabled={!source.trim()} />
  </SimulatorDialog>
}

/** Right-click rectangle > Color: foreground and background. */
function RectColorDialog({ pic, el, onClose, onMessage }: { pic: string; el: PicElement; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const [which, setWhich] = useState<'foreground' | 'background'>('background')
  const [fg, setFg] = useState(el.color)
  const [bg, setBg] = useState(el.backgroundColor)
  return <SimulatorDialog className="module-download-dialog dvd" label="Color" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-inline">
        <label className="lib-dlg-check"><input type="radio" name="which" aria-label="Foreground" checked={which === 'foreground'} onChange={() => setWhich('foreground')} /> Foreground</label>
        <label className="lib-dlg-check"><input type="radio" name="which" aria-label="Background" checked={which === 'background'} onChange={() => setWhich('background')} /> Background</label></div>
      <div className="dv09-swatches">{PALETTE.map(p => <button key={p.hex} className={'dv09-swatch' + ((which === 'foreground' ? fg : bg) === p.hex ? ' on' : '')} style={{ background: p.hex }}
        aria-label={`${which === 'foreground' ? 'Foreground' : 'Background'} ${p.name}`} onClick={() => (which === 'foreground' ? setFg(p.hex) : setBg(p.hex))} />)}</div>
      <p className="exp-hint">Foreground {colorName(fg) || '(unchanged)'} · Background {colorName(bg) || '(unchanged)'}</p>
    </div>
    <Buttons onOk={() => { const e = setShapeColor(pic, el.id, { foreground: fg, background: bg }); if (e) window.alert(e); else { onMessage('Rectangle colors applied'); onClose() } }} onClose={onClose} />
  </SimulatorDialog>
}

/** Basic Animation Dialog (p4-18): the Fill Percentage box opens the Fill Expert. */
function BasicAnimationDialog({ el, onClose, onFill }: { el: PicElement; onClose: () => void; onFill: () => void }): JSX.Element {
  const [fill, setFillChecked] = useState(!!el.fill)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Basic Animation Dialog" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <fieldset className="dvd-group"><legend>General</legend><label>Object Name:<input aria-label="Object Name" readOnly value={`Rect${el.id.slice(-2)}`} /></label><label>Description:<input aria-label="Description" readOnly value="" /></label></fieldset>
      <div className="dvd-split">
        <fieldset className="dvd-group"><legend>Color</legend>{['Foreground', 'Edge', 'Background'].map(c => <label key={c} className="lib-dlg-check"><input type="checkbox" disabled aria-label={c} /> {c}</label>)}</fieldset>
        <fieldset className="dvd-group"><legend>Movement</legend>{['Position', 'Scale', 'Rotate'].map(c => <label key={c} className="lib-dlg-check"><input type="checkbox" disabled aria-label={c} /> {c}</label>)}</fieldset>
        <fieldset className="dvd-group"><legend>Fill</legend>
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Fill Percentage" checked={fill} onChange={e => { setFillChecked(e.target.checked); if (e.target.checked) onFill() }} /> Fill Percentage</label>
          <button className="tbtn sm" aria-label="Fill Percentage expert" onClick={onFill}>Fill Expert...</button>
          <label className="lib-dlg-check"><input type="checkbox" disabled aria-label="Visible" /> Visible</label></fieldset>
      </div>
      <p className="exp-hint">Foreground, Edge, Background, Position, Scale, Rotate, Click and Advanced animations are not modeled; this workshop uses Fill Percentage.</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button><button className="tbtn sm" onClick={onClose}>Help</button></div>
  </SimulatorDialog>
}

/** Fill Expert (p4-19): Data Source, Direction, Direction Settings, Input Ranges, Fill Percentages. */
function FillExpert({ pic, el, onClose, onMessage }: { pic: string; el: PicElement; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const [source, setSource] = useState(el.fill ? sourceText(el) : '')
  const [vertical, setVertical] = useState(el.fill?.vertical ?? false)
  const [fetch, setFetch] = useState(el.fill?.fetchLimits ?? false)
  const [low, setLow] = useState(String(el.fill?.low ?? 0))
  const [high, setHigh] = useState(String(el.fill?.high ?? 100))
  const [error, setError] = useState<string | null>(null)
  const parsed = source.trim() ? parseDatalinkSource(source) : null
  const ok = (): void => {
    const e = setFill(pic, el.id, { source, vertical, fetchLimits: fetch, low: Number(low), high: Number(high) })
    if (e) setError(e); else { onMessage('Fill Percentage animation applied'); onClose() }
  }
  void pictureLimits; void pictureSignal; void pictureSourcePaths
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Fill Expert" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <fieldset className="dvd-group"><legend>Fill Data Source</legend><label>Data Source:<input aria-label="Data Source" value={source} onChange={e => { setSource(e.target.value); setError(null) }} placeholder="DVSYS.MODULE/BLOCK/PARAMETER.F_CV" /></label>
        {parsed && 'error' in parsed && <p role="alert" className="lib-dlg-error">{parsed.error}</p>}</fieldset>
      <fieldset className="dvd-group"><legend>Direction</legend>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Vertical" checked={vertical} onChange={e => setVertical(e.target.checked)} /> Vertical</label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Horizontal" checked={!vertical} onChange={e => setVertical(!e.target.checked)} /> Horizontal</label>
        <label>Vertical Fill Direction:<select aria-label="Vertical Fill Direction" disabled={!vertical}><option>Bottom to Top</option></select></label></fieldset>
      <fieldset className="dvd-group"><legend>Input Ranges</legend>
        <label>Lowest Input Value:<input aria-label="Lowest Input Value" disabled={fetch} value={low} onChange={e => setLow(e.target.value)} /></label>
        <label>Highest Input Value:<input aria-label="Highest Input Value" disabled={fetch} value={high} onChange={e => setHigh(e.target.value)} /></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Fetch Limits from Data Source" checked={fetch} onChange={e => setFetch(e.target.checked)} /> Fetch Limits from Data Source</label></fieldset>
      <fieldset className="dvd-group"><legend>Fill Percentages</legend><label>Minimum Percentage:<input aria-label="Minimum Percentage" readOnly value="0" /></label><label>Maximum Percentage:<input aria-label="Maximum Percentage" readOnly value="100" /></label></fieldset>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <Buttons onOk={ok} onClose={onClose} />
  </SimulatorDialog>
}

/** Pump dynamo dialog (p5-17): Animate Pump Color or the Color button opens the Color By dialog. */
function PumpDynamoDialog({ el, onClose, onColor }: { el: PicElement; onClose: () => void; onColor: () => void }): JSX.Element {
  return <SimulatorDialog className="module-download-dialog dvd" label="Pump Dynamo" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Dynamo {el.dynamoSet ? DYNAMO_SETS[el.dynamoSet].label : ''} · module {el.tag}</p>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Animate Pump Color" checked={!!el.dynamoColors} onChange={e => { if (e.target.checked) onColor() }} /> Animate Pump Color</label>
      <button className="tbtn sm" aria-label="Color" onClick={onColor}>Color...</button>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** Color By dialog (pp 5-17, 5-18): Data Source, Color By Current Value, Color Threshold Exact Match, Value / Color rows. */
function PumpColorBy({ pic, el, onClose, onMessage }: { pic: string; el: PicElement; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const [source, setSource] = useState('')
  const [by, setBy] = useState('Current Value')
  const [threshold, setThreshold] = useState('Range')
  const [rows, setRows] = useState<{ value: string; color: string }[]>([{ value: '', color: '' }, { value: '', color: '' }])
  const [error, setError] = useState<string | null>(null)
  const ok = (): void => {
    if (by !== 'Current Value' || threshold !== 'Exact Match') { setError('Use Color By Current Value with the Exact Match threshold'); return }
    const entries = rows.filter(r => r.value !== '' && r.color).map(r => ({ value: Number(r.value), color: PALETTE.find(p => p.name === r.color)!.hex }))
    const e = setPumpColorBy(pic, el.id, { source, threshold: 'Exact Match', entries })
    if (e) setError(e); else { onMessage('Pump color animation applied'); onClose() }
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Color By" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Data Source:<input aria-label="Data Source" value={source} onChange={e => { setSource(e.target.value); setError(null) }} placeholder="DVSYS.MODULE/DC1/PV_D.F_CV" /></label>
      <label>Color By:<select aria-label="Color By" value={by} onChange={e => setBy(e.target.value)}><option>Current Value</option><option>Alarm Priority</option><option>Quality</option></select></label>
      <label>Color Threshold:<select aria-label="Color Threshold" value={threshold} onChange={e => setThreshold(e.target.value)}><option>Range</option><option>Exact Match</option></select></label>
      <table className="studio-param-table" aria-label="Color thresholds"><thead><tr><th>Value</th><th>Color</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={i}><td><input aria-label={`Value ${i + 1}`} value={r.value} onChange={e => setRows(x => x.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} /></td>
          <td><select aria-label={`Color ${i + 1}`} value={r.color} onChange={e => setRows(x => x.map((y, j) => (j === i ? { ...y, color: e.target.value } : y)))}><option value="" />{PALETTE.map(p => <option key={p.name}>{p.name}</option>)}</select></td></tr>)}
      </tbody></table>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <Buttons onOk={ok} onClose={onClose} />
  </SimulatorDialog>
}

/** Valve dynamo dialog (p6-20): Animate Valve Color and Animate Actuator Color. */
function ValveDynamoDialog({ el, onClose, onValve, onActuator }: { el: PicElement; onClose: () => void; onValve: () => void; onActuator: () => void }): JSX.Element {
  return <SimulatorDialog className="module-download-dialog dvd" label="Valve Dynamo" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Dynamo {el.dynamoSet ? DYNAMO_SETS[el.dynamoSet].label : ''} · module {el.tag}</p>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Animate Valve Color" checked={!!el.flowAnimation} onChange={e => { if (e.target.checked) onValve() }} /> Animate Valve Color</label>
      <button className="tbtn sm" aria-label="Valve Color" onClick={onValve}>Valve Color...</button>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Animate Actuator Color" checked={!!el.actuatorFlowAnimation} onChange={e => { if (e.target.checked) onActuator() }} /> Animate Actuator Color</label>
      <button className="tbtn sm" aria-label="Actuator Color" onClick={onActuator}>Actuator Color...</button>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

const conditionFor = (text: string): ConditionSpec | string => {
  const parsed = parseDatalinkSource(text)
  if ('error' in parsed) return parsed.error
  if (/^(DC1|DI1|DO1)\/(PV_D|SP_D)$/.test(parsed.path)) return { tag: parsed.tag, path: 'STATE', greaterThan: 0 }
  if (parsed.path === 'PID1/OUT') return { tag: parsed.tag, path: 'PID1/OUT', greaterThan: 0 }
  if (parsed.path === 'AO1/OUT') return { tag: parsed.tag, path: 'AO1/OUT', greaterThan: 0 }
  return `${parsed.tag}/${parsed.path} is not a True / False source; use a discrete PV_D or an output such as PID1/OUT`
}

/** True / False color animation of the valve body (MTR-102 is RUNNING AND XVSTAT-101 is OPEN) or of the actuator (FIC-102 is OPEN). */
function ConditionColors({ pic, el, target, onClose, onMessage }: { pic: string; el: PicElement; target: 'valve' | 'actuator'; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const [rows, setRows] = useState<string[]>(['', ''])
  const [trueColor, setTrueColor] = useState('')
  const [falseColor, setFalseColor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ok = (): void => {
    const conditions: ConditionSpec[] = []
    for (const text of rows.filter(r => r.trim())) { const c = conditionFor(text); if (typeof c === 'string') { setError(c); return } conditions.push(c) }
    const t = PALETTE.find(p => p.name === trueColor), f = PALETTE.find(p => p.name === falseColor)
    if (!conditions.length || !t || !f) { setError('Give the condition source(s) and the True and False colors'); return }
    const e = setColorAnimation(pic, el.id, target, conditions, t.hex, f.hex)
    if (e) setError(e); else { onMessage(`${target === 'valve' ? 'Valve' : 'Actuator'} color animation applied`); onClose() }
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={target === 'valve' ? 'Valve Color' : 'Actuator Color'} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>The color is True while all of the conditions are True (AND).</p>
      {rows.map((r, i) => <label key={i}>Condition {i + 1}:<input aria-label={`Condition ${i + 1}`} value={r} onChange={e => { setRows(x => x.map((y, j) => (j === i ? e.target.value : y))); setError(null) }} placeholder="DVSYS.MODULE/DC1/PV_D.F_CV" /></label>)}
      <button className="tbtn sm" onClick={() => setRows(x => [...x, ''])}>Add condition</button>
      <label>1 - True:<select aria-label="True color" value={trueColor} onChange={e => setTrueColor(e.target.value)}><option value="" />{PALETTE.map(p => <option key={p.name}>{p.name}</option>)}</select></label>
      <label>0 - False:<select aria-label="False color" value={falseColor} onChange={e => setFalseColor(e.target.value)}><option value="" />{PALETTE.map(p => <option key={p.name}>{p.name}</option>)}</select></label>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <Buttons onOk={ok} onClose={onClose} />
  </SimulatorDialog>
}
