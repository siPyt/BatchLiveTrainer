import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../engine/store'
import { useLibrary } from '../engine/libraryStore'
import {
  useDv09Cm, cmDirty, cmNeedsDownload, saveModule, setPrimaryDisplay, studioBlockSelected, studioOnline, studioOpened
} from '../engine/dv09Cm'
import {
  ALARM_NAMES, ALARM_ORDER, CONTROL_OPTS, DEVICE_OPTIONS, DOWNLOAD_BEHAVIORS, IO_OPTS, addInputParameter, alarmMessage, connectWire, deviceOptions, pidControlOpts,
  pidIoOpts, propertiesOpened, setBlockAlarm, setCondition, setDeviceOption, setLoopIo, setModuleGeneral, setPidOptions, setScale, setSpLimits,
  setTuningParameter, type DeviceOption
} from '../engine/dv09Loops'
import { traditionalChannels } from '../engine/traditionalIo'
import { ENGINEERING_UNITS } from '../engine/classLibrary'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { ModuleIcon, FunctionBlockIcon } from '../components/EngineeringIcons'
import { PaneResizer, usePersistentSize } from '../components/PaneResizer'
import { Btn, Group, Stack } from './ControlStudioDisplay'
import { DownloadDialog, FilterDialog, AssignDialog } from './Dv09ControlStudio'
import type { AlarmType, AnalogIndicator, AnalogOutputModule, AnyModule, MotorModule, PidModule } from '../engine/types'

// Course DV-09 chapters 4-6: Control Studio for the analog, motor and regulatory modules created in DeltaV Explorer (LEVEL-101, LI-101,
// MTR-102, FIC-102): Hierarchy View, Diagram View with the IO and Special Items palettes, the Parameter View and the Alarm View, the Block Alarms
// dialog (right-click a block > Assign Alarm) and the Assign To Node / Properties / Save / Download / On-Line buttons of the manual.

const DND_LOOP = 'application/x-dv09-loop'
const PALETTE_IO: { label: string; type: 'AI' | 'AO' | null }[] = [
  { label: 'Analog Input', type: 'AI' }, { label: 'Analog Output', type: 'AO' }, { label: 'Discrete Input', type: null }, { label: 'Discrete Output', type: null }
]

interface Box { name: string; type: string; x: number; y: number; pins: { in: string[]; out: string[] } }

/** The function blocks of the module and where the diagram draws them. */
function boxesFor(m: AnyModule | undefined, blocks: { name: string; type: string }[]): Box[] {
  if (m?.type === 'PID') return [
    { name: 'AI1', type: 'AI', x: 20, y: 40, pins: { in: [], out: ['OUT'] } },
    { name: 'PID1', type: 'PID', x: 250, y: 40, pins: { in: ['IN', 'CAS_IN', 'BKCAL_IN'], out: ['OUT', 'BKCAL_OUT'] } },
    { name: 'AO1', type: 'AO', x: 480, y: 40, pins: { in: ['CAS_IN'], out: ['BKCAL_OUT'] } }
  ]
  if (m?.type === 'MOTOR') return [
    { name: 'DC1', type: 'DC', x: 480, y: 20, pins: { in: ['PERMISSIVE_D', 'INTERLOCK_D'], out: ['OUT_D', 'PV_D'] } },
    { name: 'CND1', type: 'CND', x: 20, y: 20, pins: { in: [], out: ['OUT_D'] } },
    { name: 'CND2', type: 'CND', x: 20, y: 120, pins: { in: [], out: ['OUT_D'] } },
    { name: 'BFI1', type: 'BFI', x: 190, y: 20, pins: { in: ['IN1', 'IN2'], out: ['OUT_D'] } },
    { name: 'OR1', type: 'OR', x: 190, y: 120, pins: { in: ['IN1', 'IN2'], out: ['OUT_D'] } },
    { name: 'NOT1', type: 'NOT', x: 340, y: 20, pins: { in: ['IN1'], out: ['OUT_D'] } },
    { name: 'AND1', type: 'AND', x: 340, y: 120, pins: { in: ['IN1', 'IN2'], out: ['OUT_D'] } }
  ].filter(b => blocks.some(x => x.name === b.name))
  if (m?.type === 'AO') return [{ name: 'AO1', type: 'AO', x: 300, y: 40, pins: { in: ['CAS_IN'], out: ['OUT', 'BKCAL_OUT'] } }]
  if (m?.type === 'AI') return [{ name: 'AI1', type: 'AI', x: 220, y: 40, pins: { in: ['SIMULATE_IN'], out: ['OUT'] } }]
  return []
}

export function Dv09LoopStudio({ tag }: { tag: string }): JSX.Element {
  const cm = useDv09Cm(s => s.cms[tag])
  const m = useStore(s => s.modules[tag])
  const hardware = useStore(s => s.hardware)
  const controller = useLibrary(s => s.assignments[tag])
  useStore(s => s.rev)
  const [online, setOnline] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [bottom, setBottom] = useState<'parameters' | 'alarms'>('parameters')
  const [dialog, setDialog] = useState<null | 'filter' | 'assign' | 'props' | 'download' | 'param'>(null)
  const [blockAlarms, setBlockAlarms] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; block: string } | null>(null)
  const [message, setMessage] = useState('')
  const [wiring, setWiring] = useState<string | null>(null)
  const [bottomHeight, setBottomHeight] = usePersistentSize('studio.bottomHeight', 200)
  const [, relayout] = useState(0)
  useEffect(() => { studioOpened(tag) }, [tag])
  // The wires are drawn between the pins, so they are measured after the blocks are on the screen.
  useLayoutEffect(() => { const t = setTimeout(() => relayout(n => n + 1), 0); return () => clearTimeout(t) }, [cm?.blocks.length, cm?.wires?.length, cm?.params?.length, selected, online])
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])
  if (!cm || !m) return <div className="display studio"><div className="exp-empty">{tag} was not found.</div></div>

  const blocks = cm.blocks
  const boxes = boxesFor(m, blocks)
  const dirty = cmDirty(cm)
  const status = (): string => (cm.deployed === undefined ? 'Not downloaded' : cmNeedsDownload(cm) ? 'Download required' : 'Downloaded')
  const run = (err: string | null | undefined): void => setMessage(err ?? '')
  const select = (name: string): void => { setSelected(name); if (online) studioBlockSelected(tag, name) }
  const goOnline = (value: boolean): void => { setOnline(value); setSelected(null); if (value) studioOnline(tag) }
  const params = m.type === 'AO' ? cm.params ?? [] : []
  const pinOf = (id: string): HTMLElement | null => document.querySelector(`[data-pin="${id}"]`)
  const finishWire = (to: string): void => {
    if (!wiring) return
    run(connectWire(tag, wiring, to))
    setWiring(null)
  }
  const wirePoints = (wire: { from: string; to: string }): { x1: number; y1: number; x2: number; y2: number } | null => {
    const diagram = document.querySelector('.dv09-loop-diagram')?.getBoundingClientRect()
    const a = pinOf(`${wire.from}.OUT`)?.getBoundingClientRect()
    const b = pinOf(wire.to)?.getBoundingClientRect()
    if (!diagram || !a || !b) return null
    return { x1: a.right - diagram.left, y1: a.top + a.height / 2 - diagram.top, x2: b.left - diagram.left, y2: b.top + b.height / 2 - diagram.top }
  }
  const staticWires = m.type === 'PID' ? [['AI1.OUT', 'PID1.IN'], ['PID1.OUT', 'AO1.CAS_IN'], ['AO1.BKCAL_OUT', 'PID1.BKCAL_IN']] :
    m.type === 'MOTOR' ? [['CND1.OUT_D', 'BFI1.IN1'], ['CND2.OUT_D', 'BFI1.IN2'], ['CND1.OUT_D', 'OR1.IN1'], ['CND2.OUT_D', 'OR1.IN2'], ['BFI1.OUT_D', 'NOT1.IN1'], ['NOT1.OUT_D', 'DC1.INTERLOCK_D'], ['AND1.OUT_D', 'DC1.PERMISSIVE_D']] : []

  return (
    <div className="display studio" data-dv09-studio={tag} data-dv09-loop-studio>
      <div className="ribbon">
        <div className="studio-caption"><ModuleIcon kind="control" size={16} /><span>{tag} — Control Studio</span>
          <span className="studio-caption-status">{online ? 'ON-LINE' : 'EDIT'} · {status()}{dirty ? ' · unsaved changes' : ''}</span></div>
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
              <Btn glyph="properties" label="Properties" size="small" onClick={() => { propertiesOpened(tag); setDialog('props') }} unavailable={online ? 'Go to Edit before changing the module properties' : undefined} />
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
            {blocks.map(b => <button key={b.name} type="button" className={'studio-tree-node studio-block-select' + (selected === b.name ? ' active' : '')}
              aria-label={`Select ${b.name}`} onClick={() => select(b.name)}><FunctionBlockIcon type={b.type} />{b.name}</button>)}
            {params.map(p => <div key={p.name} className="studio-tree-node" data-hier-param={p.name}>{p.name}</div>)}
          </div>
          <div className="studio-pane-label">Hierarchy View</div>
        </div>
        <div className="studio-center">
          <div className="studio-page dv09-diagram dv09-loop-diagram" role="document" aria-label={`${tag} diagram`}
            onDragOver={e => { if (!online && m.type === 'AO' && e.dataTransfer.types.includes(DND_LOOP)) e.preventDefault() }}
            onDrop={e => { if (e.dataTransfer.getData(DND_LOOP) === 'param' && !online) { e.preventDefault(); setDialog('param') } }}
            onMouseUp={() => setWiring(null)}>
            <svg className="dv09-loop-wires" aria-hidden>
              {staticWires.map(([a, b]) => { const p = wirePoints({ from: a.replace(/\.[^.]+$/, ''), to: b }); const pa = pinOf(a)?.getBoundingClientRect(); const d = document.querySelector('.dv09-loop-diagram')?.getBoundingClientRect()
                const pb = pinOf(b)?.getBoundingClientRect(); void p
                return pa && pb && d ? <line key={a + b} x1={pa.right - d.left} y1={pa.top + pa.height / 2 - d.top} x2={pb.left - d.left} y2={pb.top + pb.height / 2 - d.top} stroke="#27408b" strokeWidth={1.5} /> : null })}
              {(cm.wires ?? []).map(w => { const p = wirePoints(w); return p ? <line key={w.from + w.to} data-wire={`${w.from}->${w.to}`} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#000" strokeWidth={1.5} markerEnd="url(#arrow)" /> : null })}
            </svg>
            {boxes.length === 0 && <div className="dv09-diagram-empty" data-diagram-empty>Diagram View — drag and drop a function block from the IO palette here</div>}
            {params.map((p, i) => <div key={p.name} className="dv09-param-box" style={{ left: 20, top: 50 + i * 44 }} data-param-box={p.name}>
              <span>{p.name}</span>
              <span className="pin out" data-pin={`${p.name}.OUT`} role="button" aria-label={`${p.name} output pin`} onMouseDown={e => { if (!online) { e.preventDefault(); e.stopPropagation(); setWiring(p.name) } }}
                onClick={e => { e.stopPropagation(); if (!online) setWiring(w => (w === p.name ? null : p.name)) }}>▸</span></div>)}
            {boxes.map(b => <div key={b.name} className={'dv09-block dv09-loop-block' + (selected === b.name ? ' selected' : '')} data-block={b.name} role="button" tabIndex={0}
              style={{ left: b.x + (m.type === 'AO' ? 40 : 0), top: b.y, width: 170 }}
              onClick={() => select(b.name)} onContextMenu={e => { e.preventDefault(); select(b.name); setMenu({ x: e.clientX, y: e.clientY, block: b.name }) }}>
              <div className="dv09-block-title">{b.name}<span className="dv09-block-icon" /></div>
              {Array.from({ length: Math.max(b.pins.in.length, b.pins.out.length) }, (_, i) => <div key={i} className="dv09-block-row">
                {b.pins.in[i] ? <span className="pin in" data-pin={`${b.name}.${b.pins.in[i]}`} onMouseUp={e => { if (wiring) { e.stopPropagation(); finishWire(`${b.name}.${b.pins.in[i]}`) } }}
                  onClick={e => { if (wiring) { e.stopPropagation(); finishWire(`${b.name}.${b.pins.in[i]}`) } }}>{b.pins.in[i] === 'CAS_IN' ? 'Cas_In' : b.pins.in[i]}</span> : <span />}
                {b.pins.out[i] ? <span className="pin out" data-pin={`${b.name}.${b.pins.out[i]}`}>{b.pins.out[i]}</span> : <span />}</div>)}
              <div className="dv09-block-foot">#{boxes.indexOf(b) + 1}</div>
            </div>)}
            {wiring && <div className="dv09-wiring-hint" role="status">Release on the Cas_In pin of AO1 to connect {wiring}</div>}
          </div>
          <PaneResizer axis="y" sign={-1} value={bottomHeight} min={96} max={600} onChange={setBottomHeight} label="Resize parameter and alarm panel" />
          <div className="studio-bottom" style={{ height: bottomHeight }}>
            <div className="studio-bottom-tabs" role="tablist" aria-label="Bottom panel">
              <button type="button" role="tab" aria-selected={bottom === 'parameters'} className={bottom === 'parameters' ? 'active' : ''} onClick={() => setBottom('parameters')}>Parameter View</button>
              <button type="button" role="tab" aria-selected={bottom === 'alarms'} className={bottom === 'alarms' ? 'active' : ''} onClick={() => setBottom('alarms')}>Alarm View</button>
            </div>
            {bottom === 'parameters'
              ? <ParameterView tag={tag} m={m} online={online} selected={selected} hardware={hardware} onFilter={() => setDialog('filter')} run={run} />
              : <AlarmView tag={tag} m={m} online={online} run={run} />}
          </div>
        </div>
        <div className="studio-pane studio-palette" style={{ width: 184, minWidth: 184, flex: '0 0 184px' }}>
          <div className="studio-palette-body">
            <div className="studio-pal-group">
              <div className="studio-pal-head">IO</div>
              {PALETTE_IO.map(item => <div key={item.label} className="studio-pal-item" data-palette={item.label} aria-disabled aria-label={item.label} title={`${tag} already has a block`}>
                <FunctionBlockIcon type={item.type ?? 'DI'} /><span>{item.label}</span></div>)}
            </div>
            <div className="studio-pal-group">
              <div className="studio-pal-head">Special Items</div>
              <div className="studio-pal-item" data-palette="Input Parameter" aria-disabled={m.type !== 'AO' || online} draggable={m.type === 'AO' && !online}
                title={m.type === 'AO' ? 'Drag onto the diagram' : 'Input parameters are added to the Analog Output module'}
                onDragStart={e => { e.dataTransfer.setData(DND_LOOP, 'param'); e.dataTransfer.setData('text/plain', 'Input Parameter'); e.dataTransfer.effectAllowed = 'copy' }}
                onDoubleClick={() => { if (m.type === 'AO' && !online) setDialog('param') }}>
                <FunctionBlockIcon type="PIN" /><span>Input Parameter</span></div>
            </div>
          </div>
          <div className="studio-pane-label">Palette · IO · Special Items</div>
        </div>
      </div>
      <div className="studio-statusbar">
        <span>Assigned to: {controller ?? 'Not assigned'}</span>
        {message && <span role="status" className="dv09-studio-message">{message}</span>}
      </div>
      {menu && <div className="ctx-menu dv09-loop-ctx" style={{ position: 'fixed', left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
        <button className="ctx-item" disabled>Drill Down</button>
        <button className="ctx-item" disabled>Properties...</button>
        <button className="ctx-item" disabled={m.type === 'AO' || online || !['AI1', 'PID1'].includes(menu.block) || m.type === 'MOTOR'}
          onClick={() => { setBlockAlarms(menu.block); setMenu(null) }}>Assign Alarm</button>
      </div>}
      {blockAlarms && (m.type === 'AI' || m.type === 'PID') && <BlockAlarmsDialog tag={tag} m={m} block={blockAlarms} onClose={() => setBlockAlarms(null)} run={run} />}
      {dialog === 'filter' && <FilterDialog tag={tag} onClose={() => setDialog(null)} />}
      {dialog === 'assign' && <AssignDialog tag={tag} onClose={() => setDialog(null)} onMessage={setMessage} />}
      {dialog === 'props' && <PropertiesDialog tag={tag} onClose={() => setDialog(null)} onMessage={setMessage} />}
      {dialog === 'download' && <DownloadDialog tag={tag} onClose={() => setDialog(null)} />}
      {dialog === 'param' && <InputParameterDialog tag={tag} onClose={() => setDialog(null)} run={run} />}
    </div>
  )
}

/** A number that is committed when the field loses focus or Enter is pressed. */
function NumField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (n: number) => void; disabled?: boolean }): JSX.Element {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(String(value)) }, [value])
  const commit = (): void => { const n = Number(text); if (text.trim() !== '' && Number.isFinite(n)) onCommit(n); else setText(String(value)) }
  return <input aria-label={label} className="dv09-numfield" disabled={disabled} value={text} onFocus={() => { focused.current = true }}
    onChange={e => setText(e.target.value)} onBlur={() => { focused.current = false; commit() }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
}

function ParameterView({ tag, m, online, selected, hardware, onFilter, run }: {
  tag: string; m: AnyModule; online: boolean; selected: string | null; hardware: ReturnType<typeof useStore.getState>['hardware']; onFilter: () => void; run: (e: string | null | undefined) => void
}): JSX.Element {
  const cm = useDv09Cm(s => s.cms[tag])
  const [scaleDialog, setScaleDialog] = useState(false)
  const [optsDialog, setOptsDialog] = useState(false)
  const [masksDialog, setMasksDialog] = useState(false)
  const filters = cm?.filters ?? []
  const shown = filters.length > 0
  const rows: JSX.Element[] = []
  const row = (name: string, value: JSX.Element | string, status = 'Good'): void => {
    rows.push(<tr key={name} data-param={name}><td>{name}</td><td className="pv">{value}</td><td className={status === 'Bad' ? 'bad' : 'good'}>{status}</td></tr>)
  }
  const dstSelect = (label: string, type: 'AI' | 'AO' | 'DI' | 'DO', binding: string, port: 'IO_IN' | 'IO_OUT' | 'IO_IN_1' | 'IO_OUT_1'): JSX.Element => {
    const channels = traditionalChannels(hardware).filter(c => c.card.type === type && c.channel.dst)
    return <select aria-label={label} disabled={online} value={binding} onChange={e => run(setLoopIo(tag, port, e.target.value))}>
      <option value="">(none)</option>
      {binding && !channels.some(c => c.channel.dst === binding) && <option value={binding}>{binding}</option>}
      {channels.map(c => <option key={c.channel.dst} value={c.channel.dst}>{c.channel.dst}</option>)}
    </select>
  }
  const scaleButton = (label: string, mod: AnalogOutputModule | AnalogIndicator | PidModule): JSX.Element =>
    <button type="button" className="tbtn sm" aria-label={label} disabled={online} onClick={() => setScaleDialog(true)}>{mod.pvMin} - {mod.pvMax} {mod.unit}</button>
  const bindings = hardware.analogBindings?.[tag]
  const want = (block: string): boolean => selected === null || selected === block
  row('NAME', tag)
  row('DESCRIPTION', cm?.description || tag)
  if (!shown) rows.push(<tr key="hint"><td colSpan={3}>No parameter group is selected: double-click Filtered by and check Quick Configuration and Common Configuration.</td></tr>)
  else if (m.type === 'AO') {
    const ao = m
    if (want('AO1')) {
      row('IO_OUT', dstSelect('IO_OUT', 'AO', bindings?.output ?? '', 'IO_OUT'), bindings?.output ? (ao.bad ? 'Bad' : 'Good') : 'Bad')
      row('PV_SCALE', scaleButton('PV_SCALE', ao))
      row('SP_HI_LIM', <NumField label="SP_HI_LIM" value={ao.spHigh} disabled={online} onCommit={n => run(setSpLimits(tag, { high: n }))} />)
      row('SP_LO_LIM', <NumField label="SP_LO_LIM" value={ao.spLow} disabled={online} onCommit={n => run(setSpLimits(tag, { low: n }))} />)
      row('MODE.TARGET', <select aria-label="MODE target" disabled={online || true} value={ao.mode}><option value="CAS">Cascade</option><option value="AUTO">Auto</option><option value="MAN">Manual</option><option value="OOS">Out of Service</option></select>)
      row('MODE.ACTUAL', ao.actualMode === 'OOS' && ao.mode !== 'OOS' ? 'Out of Service (not downloaded)' : ao.actualMode)
      if (online) { row('SP', ao.sp.toFixed(1)); row('PV', `${ao.pv.toFixed(1)} ${ao.unit}`); row('OUT', ao.out.toFixed(1)) }
    }
    for (const name of Object.keys(ao.parameters)) {
      if (selected !== null && selected !== name) continue
      row(name, online ? <input aria-label={name} className="dv09-numfield" value={ao.parameters[name].value} readOnly /> : String(ao.parameters[name].value), 'Good')
    }
  } else if (m.type === 'AI') {
    const ai = m
    row('IO_IN', dstSelect('IO_IN', 'AI', bindings?.input ?? '', 'IO_IN'), bindings?.input ? (ai.pvBad ? 'Bad' : 'Good') : 'Bad')
    row('OUT_SCALE', scaleButton('OUT_SCALE', ai))
    for (const a of ALARM_ORDER) { const alarm = ai.alarms.find(x => x.type === a); if (alarm) row(`${a}_LIM`, <NumField label={`${a}_LIM`} value={alarm.limit ?? 0} disabled={online} onCommit={n => run(setBlockAlarm(tag, a, { limit: n }))} />) }
    if (online) { row('PV', `${ai.pv.toFixed(1)} ${ai.unit}`, ai.pvBad ? 'Bad' : 'Good'); row('OUT', `${ai.pv.toFixed(1)} ${ai.unit}`, ai.pvBad ? 'Bad' : 'Good') }
  } else if (m.type === 'PID') {
    const pid = m
    if (want('AI1') || want('PID1') || want('AO1')) {
      row('IO_IN', dstSelect('IO_IN', 'AI', bindings?.input ?? '', 'IO_IN'), bindings?.input ? (pid.pvBad ? 'Bad' : 'Good') : 'Bad')
      row('IO_OUT', dstSelect('IO_OUT', 'AO', bindings?.output ?? '', 'IO_OUT'), bindings?.output ? 'Good' : 'Bad')
      row('GAIN', <NumField label="GAIN" value={pid.gain} disabled={online} onCommit={n => run(setTuningParameter(tag, 'GAIN', n))} />)
      row('RESET', <><NumField label="RESET" value={pid.reset} disabled={online} onCommit={n => run(setTuningParameter(tag, 'RESET', n))} /> seconds/repeat</>)
      row('RATE', <NumField label="RATE" value={pid.rate} disabled={online} onCommit={n => run(setTuningParameter(tag, 'RATE', n))} />)
      row('PV_SCALE', scaleButton('PV_SCALE', pid))
      row('IO_OPTS', <select aria-label="IO_OPTS" disabled={online} value={pidIoOpts(pid)} onChange={e => run(setPidOptions(tag, { ioOpts: e.target.value as typeof IO_OPTS[number] }))}>{IO_OPTS.map(o => <option key={o}>{o}</option>)}</select>)
      row('CONTROL_OPTS', <select aria-label="CONTROL_OPTS" disabled={online} value={pidControlOpts(pid)} onChange={e => run(setPidOptions(tag, { controlOpts: e.target.value as typeof CONTROL_OPTS[number] }))}>{CONTROL_OPTS.map(o => <option key={o}>{o}</option>)}</select>)
      for (const a of ['HI', 'LO'] as AlarmType[]) { const alarm = pid.alarms.find(x => x.type === a); if (alarm) row(`${a}_LIM`, <NumField label={`${a}_LIM`} value={alarm.limit ?? 0} disabled={online} onCommit={n => run(setBlockAlarm(tag, a, { limit: n, enabled: true }))} />) }
      if (online) { row('SP', `${pid.sp.toFixed(1)} ${pid.unit}`); row('PV', `${pid.pv.toFixed(1)} ${pid.unit}`, pid.pvBad ? 'Bad' : 'Good'); row('OUT', pid.out.toFixed(1)); row('MODE.ACTUAL', pid.actualMode) }
    }
  } else if (m.type === 'MOTOR') {
    const motor = m as MotorModule
    const owned = selected && /^CND\d$/.test(selected) ? motor.ownedBlocks?.[selected] : undefined
    if (owned && selected) {
      const block = selected as 'CND1' | 'CND2'
      row('DESC', <input aria-label={`${block} DESC`} defaultValue={owned.description} key={owned.description} disabled={online} maxLength={24}
        onBlur={e => { if (e.target.value !== owned.description) run(setCondition(tag, block, { description: e.target.value })) }} />)
      row('TIME_DURATION', <><NumField label={`${block} TIME_DURATION`} value={owned.delaySec} disabled={online} onCommit={n => run(setCondition(tag, block, { delaySec: n }))} /> seconds</>)
      row('EXPRESSION', <input aria-label={`${block} EXPRESSION`} className="dv09-expr" defaultValue={owned.expr} key={owned.expr} disabled={online}
        onBlur={e => { if (e.target.value !== owned.expr) run(setCondition(tag, block, { expr: e.target.value })) }} />)
      row('OUT_D', owned.out ? '1' : '0', owned.bad ? 'Bad' : 'Good')
    } else if (selected === null || selected === 'DC1') {
      const binding = hardware.deviceBindings?.[tag]
      row('IO_IN_1', dstSelect('IO_IN_1', 'DI', binding?.input ?? '', 'IO_IN_1'), binding?.input ? (motor.ioInputBad ? 'Bad' : 'Good') : 'Bad')
      row('IO_OUT_1', dstSelect('IO_OUT_1', 'DO', binding?.output ?? '', 'IO_OUT_1'), binding?.output ? (motor.ioOutputBad ? 'Bad' : 'Good') : 'Bad')
      row('DEVICE_OPTS', <button type="button" className="tbtn sm" aria-label="DEVICE_OPTS" disabled={online} onClick={() => setOptsDialog(true)}>Non-zero ({Object.values(deviceOptions(motor, cm)).filter(Boolean).length} selected)</button>)
      row('STATE_MASKS', <button type="button" className="tbtn sm" aria-label="STATE_MASKS" onClick={() => setMasksDialog(true)}>DC state mask</button>)
      if (online) { row('SP_D', motor.commanded ? 'START' : 'STOP'); row('PV_D', motor.running ? 'RUNNING' : 'STOPPED'); row('DC_STATE', motor.dcState) }
    } else {
      row(selected, 'Condition / logic block of the MTR-11_ILOCK template (pre-wired)')
    }
  }
  return (
    <div className="studio-pane studio-params">
      <div className="dv09-filterbar"><span>Filtered by:</span>
        <span className="dv09-filter-value" role="button" tabIndex={0} data-filtered-by aria-label="Filtered by" title="Double-click to choose the parameter groups" onDoubleClick={onFilter}>{filters.length ? filters.join(', ') : '(none)'}</span></div>
      <table className="studio-param-table" aria-label={`${tag} parameters`}>
        <thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <div className="studio-pane-label">Parameter View — {tag}{selected ? `/${selected}` : ''}</div>
      {scaleDialog && (m.type === 'AO' || m.type === 'AI' || m.type === 'PID') && <ScaleDialog tag={tag} m={m} onClose={() => setScaleDialog(false)} run={run} />}
      {optsDialog && m.type === 'MOTOR' && <DeviceOptsDialog tag={tag} m={m} onClose={() => setOptsDialog(false)} run={run} />}
      {masksDialog && <StateMasksDialog onClose={() => setMasksDialog(false)} />}
    </div>
  )
}

function AlarmView({ tag, m, online, run }: { tag: string; m: AnyModule; online: boolean; run: (e: string | null | undefined) => void }): JSX.Element {
  const alarms = useStore(s => s.alarms)
  const list = m.type === 'AI' || m.type === 'PID' ? ALARM_ORDER.map(t => m.alarms.find(a => a.type === t)).filter(a => !!a) : []
  return (
    <div className="studio-pane studio-alarms">
      <div className="studio-alarm-scroll">
        <table className="studio-param-table" aria-label={`${tag} alarm view`}>
          <thead><tr><th>Alarm</th><th>Type</th><th>Limit</th><th>Enabled</th><th>Priority</th><th>State</th></tr></thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={6}>No alarms are defined for this module.</td></tr> : list.map(a => {
              const info = ALARM_NAMES[a!.type]!
              const live = alarms.find(x => x.moduleTag === tag && x.type === a!.type)
              return <tr key={a!.type} data-alarm={info.name}>
                <td>{info.name}</td><td>{info.type}</td>
                <td><NumField label={`${info.name} limit`} value={a!.limit ?? 0} disabled={online} onCommit={n => run(setBlockAlarm(tag, a!.type, { limit: n }))} /></td>
                <td><input type="checkbox" aria-label={`${info.name} enabled`} disabled={online} checked={a!.enabled} onChange={e => run(setBlockAlarm(tag, a!.type, { enabled: e.target.checked }))} /></td>
                <td>{a!.priority}</td><td>{live ? (live.active ? 'Active' : 'Return to normal') : 'Normal'}</td></tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="studio-pane-label">Alarm View — {tag}</div>
    </div>
  )
}

/** AI1: Block Alarms dialog of the right-click Assign Alarm command. */
function BlockAlarmsDialog({ tag, m, block, onClose, run }: { tag: string; m: AnalogIndicator | PidModule; block: string; onClose: () => void; run: (e: string | null | undefined) => void }): JSX.Element {
  const [draft, setDraft] = useState(() => Object.fromEntries(ALARM_ORDER.map(t => { const a = m.alarms.find(x => x.type === t)!; return [t, { enabled: a.enabled, limit: String(a.limit ?? 0), priority: a.priority }] })))
  const [current, setCurrent] = useState<AlarmType>('HI')
  const d = draft[current]
  const set = (patch: Partial<typeof d>): void => setDraft(x => ({ ...x, [current]: { ...x[current], ...patch } }))
  const apply = (): void => {
    for (const t of ALARM_ORDER) {
      const a = m.alarms.find(x => x.type === t)!
      const n = Number(draft[t].limit)
      if (!Number.isFinite(n)) { run('The limit value must be a number'); return }
      if (a.enabled !== draft[t].enabled || a.limit !== n || a.priority !== draft[t].priority) {
        const e = setBlockAlarm(tag, t, { enabled: draft[t].enabled, limit: n, priority: draft[t].priority })
        if (e) { run(e); return }
      }
    }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${block}: Block Alarms`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel dv09-block-alarms">
      <p>Alarm Detection Parameters:</p>
      <div className="dv09-alarm-list" role="listbox" aria-label="Alarm Detection Parameters">
        {ALARM_ORDER.map(t => <div key={t} role="option" aria-selected={t === current} className={t === current ? 'on' : ''} onClick={() => setCurrent(t)}>
          <input type="checkbox" aria-label={t} checked={draft[t].enabled} onChange={e => setDraft(x => ({ ...x, [t]: { ...x[t], enabled: e.target.checked } }))} onClick={e => e.stopPropagation()} /> {t}</div>)}
      </div>
      <fieldset className="dvd-group"><legend>Alarm Properties For {current}</legend>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enabled" checked={d.enabled} onChange={e => set({ enabled: e.target.checked })} /> Enabled</label>
        <label>Alarm name:<input aria-label="Alarm name" readOnly value={ALARM_NAMES[current]!.name} /></label>
        <label>Alarm type:<input aria-label="Alarm type" readOnly value={ALARM_NAMES[current]!.type} /></label>
        <label>Alarm priority:<select aria-label="Alarm priority" value={d.priority} onChange={e => set({ priority: e.target.value as typeof d.priority })}><option>ADVISORY</option><option>WARNING</option><option>CRITICAL</option></select></label>
        <label>Limit value:<input aria-label="Limit value" value={d.limit} onChange={e => set({ limit: e.target.value })} /></label>
        <label>Alarm message:<input aria-label="Alarm message" readOnly value={alarmMessage({ ...m.alarms.find(a => a.type === current)!, limit: Number(d.limit) })} /></label>
      </fieldset>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={apply}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function ScaleDialog({ tag, m, onClose, run }: { tag: string; m: AnalogOutputModule | AnalogIndicator | PidModule; onClose: () => void; run: (e: string | null | undefined) => void }): JSX.Element {
  const name = m.type === 'AI' ? 'OUT_SCALE' : 'PV_SCALE'
  const [high, setHigh] = useState(String(m.pvMax))
  const [low, setLow] = useState(String(m.pvMin))
  const [unit, setUnit] = useState(m.unit)
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label={`${name} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Parameter name:<input aria-label="Parameter name" readOnly value={name} /></label>
      <label>EU at 100%:<input aria-label="EU at 100%" value={high} onChange={e => setHigh(e.target.value)} /></label>
      <label>EU at 0%:<input aria-label="EU at 0%" value={low} onChange={e => setLow(e.target.value)} /></label>
      <label>Units:<input aria-label="Units" list="dv09-units" value={unit} onChange={e => setUnit(e.target.value)} /></label>
      <datalist id="dv09-units">{ENGINEERING_UNITS.map(u => <option key={u} value={u} />)}</datalist>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { const e = setScale(tag, { low: Number(low), high: Number(high), unit }); if (e) setError(e); else { run(''); onClose() } }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** Special Items palette > Input Parameter: the parameter name and type. */
function InputParameterDialog({ tag, onClose, run }: { tag: string; onClose: () => void; run: (e: string | null | undefined) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label="Input Parameter" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Parameter name:<input aria-label="Parameter name" autoFocus value={name} onChange={e => { setName(e.target.value); setError(null) }} /></label>
      <label>Parameter type:<select aria-label="Parameter type" defaultValue="Floating Point"><option>Floating Point</option></select></label>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { const e = addInputParameter(tag, name); if (e) setError(e); else { run(''); onClose() } }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** DC1 DEVICE_OPTS Properties: the seven option bits of the manual (p5-10). */
function DeviceOptsDialog({ tag, m, onClose, run }: { tag: string; m: MotorModule; onClose: () => void; run: (e: string | null | undefined) => void }): JSX.Element {
  const cm = useDv09Cm(s => s.cms[tag])
  const [draft, setDraft] = useState(() => deviceOptions(m, cm))
  const apply = (): void => {
    const now = deviceOptions(m, cm)
    for (const o of DEVICE_OPTIONS) if (now[o] !== draft[o]) { const e = setDeviceOption(tag, o, draft[o]); if (e) { run(e); return } }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="DEVICE_OPTS Properties" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Parameter name:<input aria-label="Parameter name" readOnly value="DEVICE_OPTS" /></label>
      <label>Parameter type:<input aria-label="Parameter type" readOnly value="Option bitstring" /></label>
      <fieldset className="dvd-group"><legend>Properties — Value</legend>
        {DEVICE_OPTIONS.map(o => <label key={o} className="lib-dlg-check"><input type="checkbox" aria-label={o} checked={draft[o]} onChange={e => setDraft(d => ({ ...d, [o]: e.target.checked }))} /> {o}</label>)}
      </fieldset>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={apply}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** DC1 STATE_MASKS Properties (read-only here): empty = 0 on the I/O channel, check mark = 1; Passive = 0 in the named set, Active1 = 1. */
function StateMasksDialog({ onClose }: { onClose: () => void }): JSX.Element {
  return <SimulatorDialog className="module-download-dialog dvd" label="STATE_MASKS Properties" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Empty = 0 value on the I/O channel; check mark = 1 value on the I/O; stippled = don&apos;t care / not available.</p>
      <table className="studio-param-table" aria-label="State masks"><thead><tr><th /><th colSpan={4}>Inputs 1 2 3 4</th><th colSpan={4}>Outputs 1 2 3 4</th></tr></thead>
        <tbody>
          <tr><td>Passive:</td><td>☐</td><td>▨</td><td>▨</td><td>▨</td><td>☐</td><td>▨</td><td>▨</td><td>▨</td></tr>
          <tr><td>Active 1:</td><td>☑</td><td>▨</td><td>▨</td><td>▨</td><td>☑</td><td>▨</td><td>▨</td><td>▨</td></tr>
        </tbody></table>
      <p className="exp-hint">The mask of the two-state motor is not modified in this workshop: input 1 (XI-2) and output 1 (ZX-2) are 0 when the motor is Passive and 1 when it is Active.</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** Module Properties: General (restore after restart, parameter download behavior), Execution, Displays (primary, detail) and Tools. */
function PropertiesDialog({ tag, onClose, onMessage }: { tag: string; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const cm = useDv09Cm(s => s.cms[tag])
  const m = useStore(s => s.modules[tag])
  const [tab, setTab] = useState('General')
  const [primary, setPrimary] = useState(m && 'primaryDisplay' in m ? m.primaryDisplay ?? '' : '')
  const [detail, setDetail] = useState(m && 'detailDisplay' in m ? m.detailDisplay ?? '' : '')
  const [restore, setRestore] = useState(!!cm?.restoreAfterRestart)
  const [behavior, setBehavior] = useState(cm?.downloadBehavior ?? DOWNLOAD_BEHAVIORS[0])
  const [error, setError] = useState<string | null>(null)
  const apply = (): void => {
    const e = setPrimaryDisplay(tag, primary, detail) ?? setModuleGeneral(tag, { restoreAfterRestart: restore, downloadBehavior: behavior })
    if (e) setError(e); else { onMessage(`${tag}: primary control display ${primary}`); onClose() }
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${tag} Properties`} onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{['General', 'Execution', 'Displays', 'Tools'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <label>Name:<input aria-label="Module name" readOnly value={tag} /></label>
        <label>Description:<input aria-label="Module description" readOnly value={cm?.description || tag} /></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Work in progress" disabled /> Work in progress</label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Restore parameter values after restart" checked={restore} onChange={e => setRestore(e.target.checked)} /> Restore parameter values after restart</label>
        <label>Parameter download behavior:<select aria-label="Parameter download behavior" value={behavior} onChange={e => setBehavior(e.target.value)}>{DOWNLOAD_BEHAVIORS.map(b => <option key={b}>{b}</option>)}</select></label>
      </>}
      {tab === 'Execution' && <p className="exp-hint">Module scan rate 1 second (default). Function block execution order is automatic.</p>}
      {tab === 'Displays' && <>
        <label>Primary control:<input aria-label="Primary control display" value={primary} onChange={e => setPrimary(e.target.value)} placeholder="e.g. Tank101" /></label>
        <label>Detail:<input aria-label="Detail display" value={detail} onChange={e => setDetail(e.target.value)} /></label>
        <label>Instrument:<input aria-label="Instrument display" readOnly value="" /></label>
      </>}
      {tab === 'Tools' && <p className="exp-hint">No tools are defined for this module.</p>}
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={apply}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}
