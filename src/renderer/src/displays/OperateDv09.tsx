import { useEffect, useRef, useState } from 'react'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { usePictures, type PicElement, type Picture } from '../engine/pictureStore'
import { FONT_FAMILIES, pictureSourcePaths, PICTURE_TEMPLATES, DYNAMO_SETS } from '../engine/pictureObjects'
import {
  useOperate, logOperate, ensureStandardPictures, createMainPicture, setBackgroundColor, addDatalink, addText, setObjectColor,
  setTextCaption, setTextFont, deleteElement, addDynamo, setPictureNavigation, savePicture, pictureDirty, parseDatalinkSource, pictureKey,
  OVW_REF
} from '../engine/dv09Operate'
import { followPictureLink } from '../ui/dv09Operate'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { askConfirm } from '../components/AppNotices'
import { useDatabaseClient } from '../components/useDatabaseClient'
import { Canvas } from './DisplayBuilder'
import { UserSettingsHost, useUsUi } from '../components/Dv09UserSettingsUi'
import { ExtDialogs, ExtButtons, expertOpened, type ExtDialog } from './OperateDv09Ext'
import { addRectangle, addTank, addAnimDynamo, lastElement } from '../engine/dv09OperateEx'
import { FRS_ITEMS, FrsDynamoDialog, askFrsProperties } from './OperateDv09Frs'

// Course DV-09 chapter 3: DeltaV Operate (Configure / Run) as the manual shows it (pp 3-20 .. 3-50): title bar, menu bar, button bar,
// System Tree, the DeltaV_ToolBox and the work area with the pictures. The pictures themselves are the Display Builder pictures.

const TEMPLATES = ['FullScreen', 'HARTDetail', 'HARTDetailDVC', 'Help', 'Ia', 'Iafb', 'main', 'Main1280', 'Main1680']
const COLORS = ['#000000', '#ffffff', '#ff0000', '#00aa00', '#0000ff', '#ffff00', '#ff8800', '#8800aa', '#00aaaa', '#888888', '#c9e4c5', '#add8e6',
  '#f4cccc', '#fff2cc', '#d9ead3', '#cfe2f3', '#ead1dc', '#b6d7a8']
const DYNAMO_SET_NAMES = ['frsModules', 'Pumps', 'PumpsAnim', 'PipesAnim', 'Tanks', 'Tanks2', 'TanksAnim1', 'Valves', 'Valves2', 'ValvesAnim']
/** The dynamos of the sets the chapters 4-6 workshops use (name in the set -> what is dropped on the picture). */
const SET_ITEMS: Record<string, string[]> = { frsModules: FRS_ITEMS, Tanks: ['Tank'], PumpsAnim: ['PumpAnimC1'], ValvesAnim: ['ValveHorizontalControlD1'], PipesAnim: ['PipeAnimH'] }
const VALVES2 = Array.from({ length: 17 }, (_, i) => `Valve${i + 1}`)
const DND_DYNAMO = 'application/x-dv09-dynamo'

/** DeltaV Operate shows Tank101, Ovw_ref and alarmList the way the manual spells them. */
export function displayName(key: string): string {
  if (key === OVW_REF) return 'Ovw_ref'
  if (key === 'ALARMLIST') return 'alarmList'
  if (key === 'USER_REF') return 'User_Ref'
  if (key === 'USERSETTINGS') return 'UserSettings'
  return key.charAt(0) + key.slice(1).toLowerCase()
}

type Dialog = null | 'new' | 'open' | 'picture' | 'prevnext' | 'datalink' | 'colors' | 'font' | 'openmain'
type Tool = null | { kind: 'datalink'; source: string; inPlace: boolean; refresh: number } | { kind: 'text' } | { kind: 'rectangle' }

export function OperateDv09(): JSX.Element {
  useDatabaseClient('DeltaV Operate (Configure)')
  const mode = useOperate(s => s.mode)
  const openRaw = useOperate(s => s.open)
  const activeRaw = useOperate(s => s.active)
  const pictures = usePictures(s => s.pictures)
  const open = openRaw.filter(k => !!pictures[k])
  const active = activeRaw && pictures[activeRaw] ? activeRaw : null
  const requestedPicture = useUi(s => s.builderPicture)
  const requestedRun = useUi(s => s.builderRun)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [selEl, setSelEl] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>(null)
  const [showProps, setShowProps] = useState(false)
  const [captionEditor, setCaptionEditor] = useState(false)
  const [dynamoWindow, setDynamoWindow] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const [message, setMessage] = useState('')
  const [ext, setExt] = useState<ExtDialog | null>(null)
  const configure = mode === 'configure'
  const pic = active ? pictures[active] : undefined

  useEffect(() => { ensureStandardPictures() }, [])
  useEffect(() => {
    if (requestedPicture && requestedRun) openPicture(requestedPicture, 'run')
  }, [requestedPicture, requestedRun])

  const switchMode = (next: 'run' | 'configure'): void => {
    if (next === useOperate.getState().mode) return
    useOperate.setState({ mode: next })
    setSelEl(null); setTool(null); setCtx(null)
    logOperate(next === 'run' ? 'Operate switched to Run' : 'Operate switched to Configure')
  }
  const removeRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        switchMode(useOperate.getState().mode === 'run' ? 'configure' : 'run')
      } else if (e.key === 'Delete' && useOperate.getState().mode === 'configure' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        removeRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!ctx && !menu) return
    const close = (): void => { setCtx(null); setMenu(null) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctx, menu])

  function openPicture(name: string, how?: 'run'): void {
    const key = pictureKey(name)
    if (!usePictures.getState().pictures[key]) { window.alert(`Picture not found: ${name}`); return }
    useOperate.setState(s => ({ open: s.open.includes(key) ? s.open : [...s.open, key], active: key, ...(how === 'run' ? { mode: 'run' as const } : {}) }))
    if (how !== 'run' && useOperate.getState().mode === 'configure') useStore.getState().logEvent('DIAGNOSTIC', key, 'Picture opened in Configure (File > Open)')
    setSelEl(null)
  }
  const openMain = (name: string): void => {
    openPicture(name)
    useStore.getState().logEvent('DIAGNOSTIC', pictureKey(name), 'Picture opened in Run (Open Main Display)')
  }
  const closePicture = async (key: string): Promise<void> => {
    const p = usePictures.getState().pictures[key]
    if (p && configure && pictureDirty(p) && !(await askConfirm(`${displayName(key)} has unsaved changes. Close without saving?`))) return
    useOperate.setState(s => {
      const rest = s.open.filter(k => k !== key)
      return { open: rest, active: s.active === key ? rest[rest.length - 1] ?? null : s.active }
    })
    useStore.getState().logEvent('DIAGNOSTIC', key, 'Picture closed (File > Close)')
    setSelEl(null)
  }
  const closeAll = (): void => {
    useOperate.setState({ open: [], active: null })
    setDynamoWindow(false); setSelEl(null); setTool(null)
    logOperate('Window > Close All')
  }
  const save = (): void => { if (active) { const e = savePicture(active); setMessage(e ?? `${displayName(active)}.grf saved`) } }
  const remove = (): void => { if (active && selEl) { deleteElement(active, selEl); setSelEl(null) } }
  removeRef.current = remove
  const stampAt = (x: number, y: number): void => {
    if (!active || !tool) return
    if (tool.kind === 'datalink') {
      const e = addDatalink(active, { source: tool.source, inPlace: tool.inPlace, refreshSeconds: tool.refresh, x: Math.max(0, Math.min(940, x)), y: Math.max(0, Math.min(610, y)) })
      setMessage(e ?? `Datalink ${tool.source} placed`)
      if (!e) { const els = usePictures.getState().pictures[active].elements; setSelEl(els[els.length - 1].id) }
      setTool(null)
    } else if (tool.kind === 'rectangle') {
      const e = addRectangle(active, Math.max(0, Math.min(930, x)), Math.max(0, Math.min(450, y)))
      setMessage(e ?? 'Rectangle added')
      if (!e) setSelEl(lastElement(active))
      setTool(null)
    }
  }
  const dropDynamo = (value: string, x: number, y: number): void => {
    if (!active) return
    const px = Math.max(0, Math.min(900, x)), py = Math.max(0, Math.min(560, y))
    let e: string | null
    if (FRS_ITEMS.includes(value)) { askFrsProperties({ pic: active, item: value, x: px, y: py }); return }
    if (value === 'Valve17') e = addDynamo(active, 'VALVE17', px, py)
    else if (value === 'Tank') e = addTank(active, px, py)
    else if (value === 'PumpAnimC1') e = addAnimDynamo(active, 'PUMPS_ANIM', px, py)
    else if (value === 'ValveHorizontalControlD1') e = addAnimDynamo(active, 'VALVE_HORIZONTAL_CONTROL_D1', px, py)
    else e = addAnimDynamo(active, 'PIPES_ANIM', px, py)
    setMessage(e ?? `${value} added`)
    if (!e) {
      const id = lastElement(active)
      setSelEl(id)
      if (value === 'PumpAnimC1') setExt({ kind: 'pump', id })
      else if (value === 'ValveHorizontalControlD1') setExt({ kind: 'valve', id })
    }
  }
  const selected = pic && selEl ? pic.elements.find(e => e.id === selEl) : undefined

  const menus: { label: string; items: { label: string; onClick: () => void; disabled?: boolean }[] }[] = [
    { label: 'File', items: [
      { label: 'New Picture...', onClick: () => setDialog('new'), disabled: !configure },
      { label: 'Open...', onClick: () => setDialog('open') },
      { label: 'Close', onClick: () => { if (active) void closePicture(active) }, disabled: !active },
      { label: 'Save', onClick: save, disabled: !active || !configure },
      { label: 'Save As...', onClick: () => useUsUi.getState().open('saveas'), disabled: !active || !configure }] },
    { label: 'Edit', items: [
      { label: 'Picture...', onClick: () => setDialog('picture'), disabled: !configure || !active },
      { label: 'Delete', onClick: remove, disabled: !configure || !selEl }] },
    { label: 'WorkSpace', items: [
      { label: 'Switch to Run', onClick: () => switchMode('run'), disabled: !configure },
      { label: 'Switch to Configure', onClick: () => switchMode('configure'), disabled: configure }] },
    { label: 'View', items: [
      { label: 'Color Selections...', onClick: () => setDialog('colors'), disabled: !configure || !selEl },
      { label: 'Property Window', onClick: () => setShowProps(v => !v), disabled: !configure }] },
    { label: 'Format', items: [{ label: 'Font...', onClick: () => setDialog('font'), disabled: !configure || selected?.type !== 'text' }] },
    { label: 'Window', items: [{ label: 'Close All', onClick: closeAll }] },
    { label: 'Help', items: [{ label: 'DeltaV Operate Help', onClick: () => setMessage('Help: see Course DV-09 Chapter 3, pages 3-20 to 3-50.') }] }
  ]

  return (
    <div className={'display builder dv09-operate ' + (configure ? 'configure' : 'run')} data-operate-mode={mode} role="application"
      aria-label={configure ? 'DeltaV Operate (Configure)' : 'DeltaV Operate (Run)'}>
      <div className="dv09-op-title"><span className="dv09-op-logo">F</span>DeltaV Operate ({configure ? 'Configure' : 'Run'})</div>
      <div className="dvx-menubar dv09-op-menu" role="menubar" onMouseDown={e => e.stopPropagation()}>
        {menus.map(m => <div key={m.label} className="dvx-menu">
          <button role="menuitem" className={'dvx-menu-btn' + (menu === m.label ? ' open' : '')} onClick={() => setMenu(v => (v === m.label ? null : m.label))}
            onMouseEnter={() => setMenu(v => (v ? m.label : v))}><u>{m.label[0]}</u>{m.label.slice(1)}</button>
          {menu === m.label && <div className="ctx-menu dvx-dropdown" role="menu" aria-label={`${m.label} menu`}>
            {m.items.map(item => <button key={item.label} role="menuitem" className="ctx-item" disabled={item.disabled}
              onClick={() => { setMenu(null); item.onClick() }}>{item.label}</button>)}
          </div>}
        </div>)}
      </div>
      <div className="dv09-op-bar" role="toolbar" aria-label="Button bar">
        <button className="dv09-op-btn" aria-label="New Picture" title="New Picture" disabled={!configure} onClick={() => setDialog('new')}>🗋</button>
        <button className="dv09-op-btn" aria-label="Open Picture" title="Open" onClick={() => setDialog('open')}>🗁</button>
        <button className="dv09-op-btn" aria-label="Save Picture" title="Save" disabled={!configure || !active} onClick={save}>💾</button>
        <span className="dvx-tsep" />
        <button className="dv09-op-btn" aria-label="Open Main Display" title="Open Main Display" disabled={configure} onClick={() => setDialog('openmain')}>▦</button>
        <button className="dv09-op-btn" aria-label="Process History View" title="Process History View (Event Chronicle)" disabled={configure}
          onClick={() => { useStore.getState().logEvent('DIAGNOSTIC', 'DeltaV Operate', 'Process History View (Event Chronicle) opened'); useUi.getState().navigate('journal') }}>🕘</button>
        <span className="dvx-tsep" />
        <span className="dv09-op-status" role="status">{message}</span>
        <span className="dv09-op-mode" data-mode-badge>{configure ? 'Configure' : 'Run'}</span>
      </div>
      <div className="dv09-op-body">
        {configure && <SystemTree pictures={pictures} active={active} selEl={selEl} onOpen={openPicture} onSelect={setSelEl}
          onOpenDynamoSet={() => { setDynamoWindow(true); logOperate('Dynamo set Valves2 opened') }} />}
        <div className="dv09-op-work">
          <div className="dv09-op-tabs" role="tablist" aria-label="Open pictures">
            {open.map(k => <span key={k} role="tab" aria-selected={k === active} className={'dv09-op-tab' + (k === active ? ' on' : '')}>
              <button className="dv09-op-tabname" onClick={() => { useOperate.setState({ active: k }); setSelEl(null) }}>{displayName(k)}.grf</button>
              <button className="dv09-op-tabx" aria-label={`Close ${displayName(k)}`} onClick={() => void closePicture(k)}>×</button></span>)}
            {dynamoWindow && <span className="dv09-op-tab on" role="tab" aria-selected><button className="dv09-op-tabname">Valves2.fds</button>
              <button className="dv09-op-tabx" aria-label="Close Valves2.fds" onClick={() => setDynamoWindow(false)}>×</button></span>}
          </div>
          <div className="dv09-op-stage">
            {dynamoWindow && configure && <div className="dv09-fds" aria-label="Valves2.fds">
              <div className="dv09-fds-title">Valves2.fds</div>
              <div className="dv09-fds-body">{VALVES2.map(v => <div key={v} className={'dv09-fds-item' + (v === 'Valve17' ? ' modeled' : '')}
                draggable={v === 'Valve17'} title={v === 'Valve17' ? 'Drag onto the picture' : `${v} is not modeled in the simulator`}
                onDragStart={e => { e.dataTransfer.setData(DND_DYNAMO, v); e.dataTransfer.effectAllowed = 'copy' }}><ValveGlyph /><span>{v}</span></div>)}</div>
            </div>}
            {pic && active ? <PictureWindow key={active} name={active} pic={pic} configure={configure} selEl={selEl} setSelEl={setSelEl} tool={tool}
              onStamp={stampAt} onTextDone={(x, y, text) => { const e = addText(active, x, y, text); setMessage(e ?? `Text "${text}" added`); setTool(null); if (!e) { const els = usePictures.getState().pictures[active].elements; setSelEl(els[els.length - 1].id) } }}
              onTextCancel={() => setTool(null)}
              onNavigate={(kind) => followPictureLink(active, kind, kind === 'Previous' ? pic.previousPicture : pic.nextPicture)}
              onPrevNext={() => setDialog('prevnext')}
              onDropDynamo={dropDynamo}
              onContext={(x, y) => setCtx({ x, y })} />
              : !dynamoWindow && <div className="dv09-op-empty" data-operate-empty>{configure ? 'No picture is open. Use File > New Picture or File > Open, or double-click a picture in the System Tree.' :
                'DeltaV Operate (Run). Select the Open Main Display button to open a picture.'}</div>}
            {configure && <ToolBox tool={tool} onDatalink={() => { logOperate('Datalink Stamper selected'); setDialog('datalink') }} onText={() => { if (active) { setTool({ kind: 'text' }); setMessage('Click on the picture where the text is to be placed, then type.') } else setMessage('Open a picture first.') }}
              onCaptionEditor={() => { logOperate('Text Caption Editor opened'); setCaptionEditor(true) }} onNew={() => setDialog('new')} onOpen={() => setDialog('open')} onSave={save}
              extra={<ExtButtons pic={active} selected={selected} onRectangle={() => { if (active) { setTool({ kind: 'rectangle' }); setMessage('Click on the picture where the rectangle is to be placed.') } }}
                onExpert={kind => { if (active && selected) { expertOpened(active, kind === 'entry' ? 'Data Entry Expert' : 'Visibility Expert'); setExt({ kind, id: selected.id }) } }} />} />}
            {configure && showProps && <PropertyWindow pic={active} element={selected} onClose={() => setShowProps(false)} />}
            {configure && captionEditor && <CaptionEditor pic={active} element={selected} onClose={() => setCaptionEditor(false)} />}
          </div>
        </div>
      </div>
      {ctx && selected && (selected.type === 'rectangle' || selected.type === 'dynamo' || selected.type === 'tank') && configure && active && <div className="ctx-menu dv09-op-ctx" style={{ left: ctx.x, top: ctx.y, position: 'fixed' }} onMouseDown={e => e.stopPropagation()}>
        {selected.type === 'rectangle' && <button className="ctx-item" onClick={() => { setCtx(null); setExt({ kind: 'rectcolor', id: selected.id }) }}>Color...</button>}
        {selected.type === 'rectangle' && <button className="ctx-item" onClick={() => { setCtx(null); setExt({ kind: 'animations', id: selected.id }) }}>Animations...</button>}
        {selected.type === 'dynamo' && selected.dynamoSet === 'PUMPS_ANIM' && <button className="ctx-item" onClick={() => { setCtx(null); setExt({ kind: 'pump', id: selected.id }) }}>Dynamo Properties...</button>}
        {selected.type === 'dynamo' && selected.dynamoSet === 'VALVE_HORIZONTAL_CONTROL_D1' && <button className="ctx-item" onClick={() => { setCtx(null); setExt({ kind: 'valve', id: selected.id }) }}>Dynamo Properties...</button>}
        <button className="ctx-item" onClick={() => { setCtx(null); remove() }}>Delete</button>
      </div>}
      {active && <ExtDialogs pic={active} ext={ext} setExt={setExt} setMessage={setMessage} />}
      <FrsDynamoDialog onMessage={setMessage} onPlaced={pic => { const els = usePictures.getState().pictures[pic]?.elements ?? []; setSelEl(els[els.length - 1]?.id ?? null) }} />
      {ctx && selected && selected.type === 'text' && configure && <div className="ctx-menu dv09-op-ctx" style={{ left: ctx.x, top: ctx.y, position: 'fixed' }} onMouseDown={e => e.stopPropagation()}>
        <button className="ctx-item" onClick={() => { setCtx(null); setDialog('colors') }}>Color...</button>
        <button className="ctx-item" onClick={() => { setCtx(null); setDialog('font') }}>Font...</button>
        <button className="ctx-item" onClick={() => { setCtx(null); setShowProps(true) }}>Property Window...</button>
        <button className="ctx-item" onClick={() => { setCtx(null); remove() }}>Delete</button>
      </div>}
      {dialog === 'new' && <NewPictureDialog onClose={() => setDialog(null)} onCreated={key => { openPicture(key); setMessage(`${displayName(key)}.grf created from the main template`) }} />}
      {dialog === 'open' && <OpenDialog label="Open" pictures={pictures} onClose={() => setDialog(null)} onOpen={name => { openPicture(name); setDialog(null) }} />}
      <UserSettingsHost active={active} configure={configure} menuAt={ctx && !(selected && (selected.type === 'text' || selected.type === 'rectangle' || selected.type === 'dynamo' || selected.type === 'tank')) ? ctx : null} closeMenu={() => setCtx(null)} />
      {dialog === 'openmain' && <OpenDialog label="Open Main Display" pictures={pictures} onClose={() => setDialog(null)} onOpen={name => { openMain(name); setDialog(null) }} />}
      {dialog === 'picture' && active && pic && <PictureDialog pic={pic} onClose={() => setDialog(null)} />}
      {dialog === 'prevnext' && active && pic && <PrevNextDialog pic={pic} onClose={() => setDialog(null)} />}
      {dialog === 'datalink' && <DatalinkDialog onClose={() => setDialog(null)} onOk={t => { setTool(t); setDialog(null); setMessage('Move the stamper to the desired position and click the left mouse button.') }} />}
      {dialog === 'colors' && active && selEl && <ColorDialog onClose={() => setDialog(null)} onPick={c => { setObjectColor(active, selEl, c); setDialog(null) }} />}
      {dialog === 'font' && active && selected?.type === 'text' && <FontDialog pic={active} element={selected} onClose={() => setDialog(null)} />}
    </div>
  )
}

function ValveGlyph(): JSX.Element {
  return <svg width={28} height={22} viewBox="0 0 28 22" aria-hidden><path d="M3,4 L14,11 L3,18 Z M25,4 L14,11 L25,18 Z" fill="#2fb6c4" stroke="#1d3b5c" /><rect x={11} y={1} width={6} height={4} fill="#9aa1ab" /></svg>
}

function PictureWindow({ name, pic, configure, selEl, setSelEl, tool, onStamp, onTextDone, onTextCancel, onNavigate, onPrevNext, onDropDynamo, onContext }: {
  name: string; pic: Picture; configure: boolean; selEl: string | null; setSelEl: (id: string | null) => void; tool: Tool
  onStamp: (x: number, y: number) => void; onTextDone: (x: number, y: number, text: string) => void; onTextCancel: () => void
  onNavigate: (kind: 'Previous' | 'Next') => void; onPrevNext: () => void; onDropDynamo: (value: string, x: number, y: number) => void; onContext: (x: number, y: number) => void
}): JSX.Element {
  const wrap = useRef<HTMLDivElement>(null)
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null)
  const [text, setText] = useState('')
  const pos = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const canvas = wrap.current?.querySelector('.bld-canvas') as HTMLElement | null
    const r = canvas?.getBoundingClientRect()
    return { x: Math.round(e.clientX - (r?.left ?? 0) + (canvas?.scrollLeft ?? 0)), y: Math.round(e.clientY - (r?.top ?? 0) + (canvas?.scrollTop ?? 0)) }
  }
  const commitText = (): void => {
    if (!textAt) return
    const at = textAt, value = text
    setTextAt(null); setText('')
    if (value.trim()) onTextDone(Math.min(at.x, 900), Math.min(at.y, 610), value); else onTextCancel()
  }
  return (
    <div className={'dv09-op-pic' + (tool ? ' stamping' : '')} ref={wrap} data-picture={name} aria-label={`${displayName(name)}.grf`}
      onClick={e => {
        if (!configure || !tool) return
        if (tool.kind === 'datalink' || tool.kind === 'rectangle') onStamp(pos(e).x, pos(e).y)
        else if (tool.kind === 'text' && !textAt) { setTextAt(pos(e)); setText('') }
      }}
      onContextMenu={e => { if (configure) { e.preventDefault(); onContext(e.clientX, e.clientY) } }}
      onDragOver={e => { if (configure && e.dataTransfer.types.includes(DND_DYNAMO)) e.preventDefault() }}
      onDrop={e => { if (!configure) return; const v = e.dataTransfer.getData(DND_DYNAMO); if (v === 'Valve17' || Object.values(SET_ITEMS).some(items => items.includes(v))) { e.preventDefault(); const p = pos(e); onDropDynamo(v, p.x, p.y) } }}>
      <Canvas picture={name} edit={configure} selEl={selEl} setSelEl={setSelEl} />
      {pic.template === 'MAIN' && <div className="dv09-op-nav" data-nav-group>
        <button className="dv09-op-navbtn" aria-label="Previous Picture" title={pic.previousPicture ? `Previous: ${pic.previousPicture}` : 'Previous picture is not configured'}
          onClick={e => { e.stopPropagation(); if (!configure) onNavigate('Previous') }} onDoubleClick={e => { e.stopPropagation(); if (configure) onPrevNext() }}>◀</button>
        <button className="dv09-op-navbtn" aria-label="Next Picture" title={pic.nextPicture ? `Next: ${pic.nextPicture}` : 'Next picture is not configured'}
          onClick={e => { e.stopPropagation(); if (!configure) onNavigate('Next') }} onDoubleClick={e => { e.stopPropagation(); if (configure) onPrevNext() }}>▶</button>
      </div>}
      {textAt && <input className="dv09-op-textedit" aria-label="Text" autoFocus value={text} style={{ left: textAt.x, top: textAt.y }}
        onChange={e => setText(e.target.value)} onBlur={commitText}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitText() } else if (e.key === 'Escape') { setTextAt(null); setText(''); onTextCancel() } }} />}
    </div>
  )
}

function SystemTree({ pictures, active, selEl, onOpen, onSelect, onOpenDynamoSet }: {
  pictures: Record<string, Picture>; active: string | null; selEl: string | null; onOpen: (name: string) => void; onSelect: (id: string) => void; onOpenDynamoSet: () => void
}): JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ ROOT: true })
  const flip = (k: string): void => setExpanded(e => ({ ...e, [k]: !e[k] }))
  const node = (key: string, depth: number, label: string, opts: { children?: boolean; onDouble?: () => void; onClick?: () => void; drag?: string; selected?: boolean; data?: string } = {}): JSX.Element =>
    <div key={key} className={'dv09-tree-row' + (opts.selected ? ' sel' : '')} style={{ paddingLeft: 4 + depth * 14 }} data-tree-node={opts.data ?? key}
      draggable={!!opts.drag} onDragStart={opts.drag ? e => { e.dataTransfer.setData(DND_DYNAMO, opts.drag as string); e.dataTransfer.effectAllowed = 'copy' } : undefined}
      onClick={opts.onClick} onDoubleClick={opts.onDouble}>
      {opts.children !== undefined ? <span className="tv-box" role="button" aria-label={`${expanded[key] ? 'Collapse' : 'Expand'} ${label}`} onClick={e => { e.stopPropagation(); flip(key) }}>{expanded[key] ? '−' : '+'}</span> : <span className="tv-box none" />}
      <span className="dv09-tree-icon">{opts.children !== undefined ? '📁' : '▫'}</span><span>{label}</span></div>
  const rows: JSX.Element[] = [node('ROOT', 0, 'THISNODE', { children: true })]
  if (expanded.ROOT) {
    rows.push(node('DYN', 1, 'Dynamo Sets', { children: true }))
    if (expanded.DYN) for (const set of DYNAMO_SET_NAMES) {
      rows.push(node(`DYN:${set}`, 2, set, { children: set === 'Valves2' || set in SET_ITEMS, onDouble: set === 'Valves2' ? onOpenDynamoSet : undefined, data: `dynamo-set:${set}` }))
      if (set in SET_ITEMS && expanded[`DYN:${set}`]) for (const v of SET_ITEMS[set]) rows.push(node(`DYN:${set}:${v}`, 3, v, { drag: v, data: `dynamo:${v}` }))
      if (set === 'Valves2' && expanded['DYN:Valves2']) for (const v of VALVES2) rows.push(node(`DYN:Valves2:${v}`, 3, v, { drag: v === 'Valve17' ? v : undefined, data: `dynamo:${v}` }))
    }
    rows.push(node('GLOB', 1, 'Globals', { children: true }), node('HELP', 1, 'Help & Information', { children: true }))
    rows.push(node('PICS', 1, 'Pictures', { children: true }))
    if (expanded.PICS) for (const p of Object.values(pictures)) {
      const k = `PIC:${p.name}`
      rows.push(node(k, 2, displayName(p.name), { children: true, selected: p.name === active, onDouble: () => onOpen(p.name), data: `picture:${p.name}` }))
      if (expanded[k]) for (const el of p.elements) rows.push(node(`${k}:${el.id}`, 3, elementLabel(el), { selected: el.id === selEl && p.name === active,
        onClick: () => { if (p.name === active) onSelect(el.id) }, data: `object:${el.id}` }))
    }
    rows.push(node('SCHED', 1, 'Schedules', { children: true }))
  }
  return <div className="dv09-op-tree" role="tree" aria-label="System Tree">{rows}</div>
}

function elementLabel(el: PicElement): string {
  return el.type === 'text' ? `Text: ${el.content}` : el.type === 'datalink' ? `Datalink: ${el.tag}/${el.path}` : el.type === 'dynamo' ? `Dynamo: ${el.dynamoSet ? DYNAMO_SETS[el.dynamoSet].label : 'dynamo'}` : el.type
}

function ToolBox({ tool, onDatalink, onText, onCaptionEditor, onNew, onOpen, onSave, extra }: {
  extra?: React.ReactNode; tool: Tool; onDatalink: () => void; onText: () => void; onCaptionEditor: () => void; onNew: () => void; onOpen: () => void; onSave: () => void
}): JSX.Element {
  return <div className="dv09-toolbox" role="toolbar" aria-label="DeltaV_ToolBox">
    <div className="dv09-toolbox-title">DeltaV_ToolBox</div>
    <div className="dv09-toolbox-grid">
      <button aria-label="Toolbox New" title="New" onClick={onNew}>🗋</button>
      <button aria-label="Toolbox Open" title="Open" onClick={onOpen}>🗁</button>
      <button aria-label="Toolbox Save" title="Save" onClick={onSave}>💾</button>
      <button aria-label="Datalink Stamper" title="Datalink Stamper" className={tool?.kind === 'datalink' ? 'on' : ''} onClick={onDatalink}><span className="dv09-abc">ABC<br />100</span></button>
      <button aria-label="Text" title="Text" className={tool?.kind === 'text' ? 'on' : ''} onClick={onText}><b className="dv09-textglyph">A</b></button>
      <button aria-label="Text Caption Editor" title="Text Caption Editor" onClick={onCaptionEditor}>✎</button>
      {extra}
    </div>
  </div>
}

function PropertyWindow({ pic, element, onClose }: { pic: string | null; element: PicElement | undefined; onClose: () => void }): JSX.Element {
  const [caption, setCaption] = useState(element?.content ?? '')
  useEffect(() => { setCaption(element?.content ?? '') }, [element?.id, element?.content])
  const text = element?.type === 'text'
  const style = element?.bold && element?.italic ? 'Bold Italic' : element?.bold ? 'Bold' : element?.italic ? 'Italic' : 'Regular'
  const setStyle = (s: string): void => { if (pic && element) setTextFont(pic, element.id, { bold: s.includes('Bold'), italic: s.includes('Italic') }, 'Property Window') }
  return <div className="dv09-props" role="dialog" aria-label="Properties">
    <div className="dv09-props-title"><span>Properties</span><button aria-label="Close Properties" onClick={onClose}>×</button></div>
    {!element || !pic ? <p className="dv09-props-note">Select an object on the picture.</p> : <table><tbody>
      <tr><td>(Name)</td><td>{element.type}{element.id.slice(-3)}</td></tr>
      {text ? <>
        <tr><td>Caption</td><td><input aria-label="Caption" value={caption} onChange={e => setCaption(e.target.value)}
          onBlur={() => { if (caption !== element.content && caption.trim()) setTextCaption(pic, element.id, caption, 'Property Window') }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (caption.trim()) setTextCaption(pic, element.id, caption, 'Property Window') } }} /></td></tr>
        <tr><td>FontName</td><td><select aria-label="FontName" value={element.fontFamily ?? 'Segoe UI'} onChange={e => setTextFont(pic, element.id, { fontFamily: e.target.value }, 'Property Window')}>
          {FONT_FAMILIES.map(f => <option key={f}>{f}</option>)}</select></td></tr>
        <tr><td>FontSize</td><td><input aria-label="FontSize" type="number" min={6} max={96} value={element.fontSize ?? 14}
          onChange={e => { const n = Number(e.target.value); if (n >= 6 && n <= 96) setTextFont(pic, element.id, { fontSize: n }, 'Property Window') }} /></td></tr>
        <tr><td>FontStyle</td><td><select aria-label="FontStyle" value={style} onChange={e => setStyle(e.target.value)}>
          {['Regular', 'Italic', 'Bold', 'Bold Italic'].map(s => <option key={s}>{s}</option>)}</select></td></tr>
        <tr><td>ForegroundColor</td><td>{element.color ?? '#1a1a1a'}</td></tr>
      </> : <>
        {element.tag && <tr><td>Source</td><td>DVSYS.{element.tag}{element.path ? `/${element.path}.F_CV` : ''}</td></tr>}
        {element.type === 'datalink' && <tr><td>Refresh Rate</td><td>{element.refreshSeconds ?? '-'} s</td></tr>}
        <tr><td>X / Y</td><td>{element.x} / {element.y}</td></tr>
      </>}
    </tbody></table>}
  </div>
}

function CaptionEditor({ pic, element, onClose }: { pic: string | null; element: PicElement | undefined; onClose: () => void }): JSX.Element {
  const [caption, setCaption] = useState('')
  const [read, setRead] = useState(false)
  return <div className="dv09-capedit" role="dialog" aria-label="Text Caption Editor">
    <div className="dv09-props-title"><span>Text Caption Editor</span><button aria-label="Close Text Caption Editor" onClick={onClose}>×</button></div>
    <label>Caption: <input aria-label="Caption text" value={caption} onChange={e => setCaption(e.target.value)} /></label>
    <p>Select a Text Object in the Workspace.<br />Click Read Caption to view the Text Object&apos;s Caption.<br />Click Write Caption to write and save to the Text Object&apos;s Caption.</p>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { if (element?.type === 'text') { setCaption(element.content ?? ''); setRead(true) } else window.alert('Select a text object first') }}>Read Caption</button>
      <button className="tbtn sm" disabled={!read && !caption} onClick={() => { if (pic && element?.type === 'text') setTextCaption(pic, element.id, caption, 'Text Caption Editor'); else window.alert('Select a text object first') }}>Write Caption</button>
      <button className="tbtn sm" onClick={onClose}>Close</button></div>
  </div>
}

function NewPictureDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('FullScreen')
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label="New Picture" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Picture Name:<input aria-label="Picture Name" autoFocus value={name} onChange={e => { setName(e.target.value); setError(null) }} /></label>
      <label>Template:</label>
      <select aria-label="Template" size={9} value={template} onChange={e => setTemplate(e.target.value)} className="dv09-list">{TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}</select>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { const e = createMainPicture(name, template); if (e) setError(e); else { onCreated(pictureKey(name)); onClose() } }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function OpenDialog({ label, pictures, onOpen, onClose }: { label: string; pictures: Record<string, Picture>; onOpen: (name: string) => void; onClose: () => void }): JSX.Element {
  const names = Object.keys(pictures).sort((a, b) => a.localeCompare(b))
  const [pick, setPick] = useState(names[0] ?? '')
  return <SimulatorDialog className="module-download-dialog dvd" label={label} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Picture:</label>
      <select aria-label="Pictures" size={10} value={pick} onChange={e => setPick(e.target.value)} className="dv09-list"
        onKeyDown={e => { if (e.key === 'Enter' && pick) { e.preventDefault(); onOpen(pick) } }} onDoubleClick={() => pick && onOpen(pick)}>
        {names.map(n => <option key={n} value={n}>{displayName(n)}</option>)}</select>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={!pick} onClick={() => onOpen(pick)}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function PictureDialog({ pic, onClose }: { pic: Picture; onClose: () => void }): JSX.Element {
  const [color, setColor] = useState(pic.background ?? PICTURE_TEMPLATES.MAIN.background)
  return <SimulatorDialog className="module-download-dialog dvd" label="Picture" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Picture {displayName(pic.name)}.grf</p>
      <fieldset className="dvd-group"><legend>Background Color</legend>
        <div className="dv09-swatches">{COLORS.map(c => <button key={c} className={'dv09-swatch' + (c === color ? ' on' : '')} style={{ background: c }} aria-label={`Background color ${c}`} onClick={() => setColor(c)} />)}</div>
        <div className="dv09-swatch-sample" style={{ background: color }}>{color}</div>
      </fieldset>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { setBackgroundColor(pic.name, color); onClose() }}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function ColorDialog({ onPick, onClose }: { onPick: (c: string) => void; onClose: () => void }): JSX.Element {
  return <SimulatorDialog className="module-download-dialog dvd" label="Color Selections" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel"><p>Foreground color of the selected object:</p>
      <div className="dv09-swatches">{COLORS.map(c => <button key={c} className="dv09-swatch" style={{ background: c }} aria-label={`Color ${c}`} onClick={() => onPick(c)} />)}</div></div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function PrevNextDialog({ pic, onClose }: { pic: Picture; onClose: () => void }): JSX.Element {
  const [previous, setPrevious] = useState(pic.previousPicture ?? '')
  const [next, setNext] = useState(pic.nextPicture ?? '')
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label="Previous/Next Picture" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Previous Picture Name:<input aria-label="Previous Picture Name" value={previous} onChange={e => setPrevious(e.target.value)} placeholder="Ovw_ref.grf" /></label>
      <label>Next Picture name:<input aria-label="Next Picture name" value={next} onChange={e => setNext(e.target.value)} placeholder="alarmList.grf" /></label>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { const e = setPictureNavigation(pic.name, previous, next); if (e) setError(e); else onClose() }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function FontDialog({ pic, element, onClose }: { pic: string; element: PicElement; onClose: () => void }): JSX.Element {
  const [family, setFamily] = useState(element.fontFamily ?? 'Arial')
  const [style, setStyle] = useState(element.bold && element.italic ? 'Bold Italic' : element.bold ? 'Bold' : element.italic ? 'Italic' : 'Regular')
  const [size, setSize] = useState(element.fontSize ?? 14)
  const [underline, setUnderline] = useState(!!element.underline)
  return <SimulatorDialog className="module-download-dialog dvd" label="Font" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel dv09-font">
      <label>Font:<select aria-label="Font" size={5} value={family} onChange={e => setFamily(e.target.value)}>{FONT_FAMILIES.map(f => <option key={f}>{f}</option>)}</select></label>
      <label>Font Style:<select aria-label="Font Style" size={4} value={style} onChange={e => setStyle(e.target.value)}>{['Regular', 'Italic', 'Bold', 'Bold Italic'].map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Size:<select aria-label="Size" size={5} value={size} onChange={e => setSize(Number(e.target.value))}>{[8, 10, 12, 14, 16, 18, 24, 36].map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Underline" checked={underline} onChange={e => setUnderline(e.target.checked)} /> Underline</label>
      <div className="dv09-font-sample" style={{ fontFamily: family, fontSize: size, fontWeight: style.includes('Bold') ? 700 : 400, fontStyle: style.includes('Italic') ? 'italic' : 'normal', textDecoration: underline ? 'underline' : 'none' }}>AaBbYyZz</div>
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { setTextFont(pic, element.id, { fontFamily: family, fontSize: size, bold: style.includes('Bold'), italic: style.includes('Italic'), underline }, 'Font dialog'); onClose() }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

function DatalinkDialog({ onOk, onClose }: { onOk: (t: NonNullable<Tool>) => void; onClose: () => void }): JSX.Element {
  const [source, setSource] = useState('')
  const [inPlace, setInPlace] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [refresh, setRefresh] = useState(1)
  const [errorMode, setErrorMode] = useState('Use Error Table')
  const [builder, setBuilder] = useState(false)
  const parsed = source.trim() ? parseDatalinkSource(source) : null
  const valid = !!parsed && !('error' in parsed)
  const discrete = valid && /^(DC1|DI1|DO1)\//.test((parsed as { path: string }).path)
  const sfcParameter = valid && !!(parsed as { sfc?: boolean }).sfc
  return <SimulatorDialog className="module-download-dialog dvd" label="Datalink" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <fieldset className="dvd-group"><legend>Source</legend>
        <div className="dvd-inline"><input aria-label="Source" value={source} onChange={e => setSource(e.target.value)} placeholder="DVSYS.MODULE/BLOCK/PARAMETER.F_CV" />
          <button className="tbtn sm" aria-label="Browse (ellipsis)" title="Expression Builder / Browser" onClick={() => { logOperate('Expression Builder opened'); setBuilder(true) }}>…</button></div>
        {parsed && 'error' in parsed && <p role="alert" className="lib-dlg-error">{parsed.error}</p>}
      </fieldset>
      <div className="dvd-split">
        <fieldset className="dvd-group"><legend>Data Entry</legend>
          <label>Type:<select aria-label="Data Entry Type" value={inPlace ? 'In-Place' : 'None'} onChange={e => setInPlace(e.target.value === 'In-Place')}><option>None</option><option>In-Place</option></select></label>
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Confirm" disabled={!inPlace} checked={confirm && inPlace} onChange={e => setConfirm(e.target.checked)} /> Confirm</label>
        </fieldset>
        <fieldset className="dvd-group"><legend>Error Configuration</legend>
          <label>Output Error Mode:<select aria-label="Output Error Mode" value={errorMode} onChange={e => setErrorMode(e.target.value)}><option>Use Error Table</option><option>Use Current Output</option></select></label>
          {errorMode === 'Use Current Output' && <p className="lib-dlg-error">Use Current Output - DO NOT USE!</p>}
        </fieldset>
      </div>
      <fieldset className="dvd-group"><legend>Formatting</legend>
        <div className="dvd-inline">
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Raw Format" /> Raw Format</label>
          <label>Type:<select aria-label="Format Type" value={valid ? 'Numeric' : 'Alpha-Numeric'} disabled><option>Alpha-Numeric</option><option>Numeric</option></select></label></div>
        <div className="dvd-inline"><label>Justify:<select aria-label="Justify" defaultValue="Left"><option>Left</option><option>Right</option><option>Center</option></select></label>
          <label>Lines:<input aria-label="Lines" defaultValue={1} /></label><label>Chars/Lines:<input aria-label="Chars/Lines" defaultValue={8} /></label></div>
      </fieldset>
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" disabled={!valid} onClick={() => {
        if (inPlace && !discrete && !sfcParameter) { window.alert('In-Place data entry is available for discrete SP_D parameters and SFC Named Set parameters in this simulator'); return }
        onOk({ kind: 'datalink', source, inPlace, refresh })
      }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button><button className="tbtn sm" onClick={() => window.alert('Datalink: Source, Data Entry, Error Configuration and Formatting (Course DV-09 pp 3-32, 3-33).')}>Help</button></div>
    {builder && <ExpressionBuilder initial={source} refresh={refresh} onClose={() => setBuilder(false)} onOk={(expr, rate) => { setSource(expr); setRefresh(rate); setBuilder(false) }} />}
  </SimulatorDialog>
}

const BUILDER_TABS: { id: string; note: string }[] = [
  { id: 'FIX Database', note: 'FIX Database: browse to key workstation parameters (such as DVSYS.THISUSER/USERNAME.A_CV) and enter the parameter path or expression.' },
  { id: 'Pictures', note: 'Pictures: browse for information on any open picture (not recommended).' },
  { id: 'Globals', note: 'Globals: browse for information stored in Globals.' },
  { id: 'Data Servers', note: 'Data Servers: browse for information from other configured data servers, such as OPC.' },
  { id: 'Alarm Counters', note: 'Alarm Counters: not modeled in this simulator.' },
  { id: 'DeltaV', note: '' }
]

function ExpressionBuilder({ initial, refresh, onOk, onClose }: { initial: string; refresh: number; onOk: (expr: string, rate: number) => void; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState('FIX Database')
  const [expr, setExpr] = useState(initial)
  const [rate, setRate] = useState(refresh)
  const [browse, setBrowse] = useState(false)
  const note = BUILDER_TABS.find(t => t.id === tab)?.note
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Expression Builder" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-tabs" role="tablist" aria-label="Data Source Browser">{BUILDER_TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.id}</button>)}</div>
      <div className="dv09-builder-pane">
        {tab === 'DeltaV' ? <div className="dv09-builder-deltav">
          <button className="tbtn sm" onClick={() => { logOperate('Browse DeltaV Control Parameters started'); setBrowse(true) }}>Browse DeltaV Control Parameters</button>
          <button className="tbtn sm" onClick={() => window.alert('Workstation display parameters, for example DVSYS.THISUSER/USERNAME.A_CV identifies the current user logged onto the DeltaV Workstation.')}>Help on Display Parameters</button>
        </div> : <p className="exp-hint">{note}</p>}
      </div>
      <textarea aria-label="Expression" rows={3} value={expr} onChange={e => setExpr(e.target.value)} />
      <div className="dvd-inline"><label>Tolerance:<input aria-label="Tolerance" readOnly value="0.001000" /></label><label>Deadband:<input aria-label="Deadband" readOnly value="0.000000" /></label>
        <label>Refresh Rate:<select aria-label="Refresh Rate" value={rate} onChange={e => setRate(Number(e.target.value))}>{[0.1, 0.5, 1, 2, 5, 10].map(r => <option key={r} value={r}>{r.toFixed(6)}</option>)}</select></label></div>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={() => onOk(expr, rate)}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    {browse && <BrowseDialog onClose={() => setBrowse(false)} onOk={path => { setExpr(path); setBrowse(false) }} />}
  </SimulatorDialog>
}

function BrowseDialog({ onOk, onClose }: { onOk: (path: string) => void; onClose: () => void }): JSX.Element {
  const areas = useStore(s => s.areas)
  const modules = useStore(s => s.modules)
  const sfcs = useStore(s => s.sfcs)
  const sfcLifecycle = useStore(s => s.sfcLifecycle)
  const [area, setArea] = useState(areas[0] ?? '')
  const [tag, setTag] = useState<string | null>(null)
  const [block, setBlock] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const module = tag ? modules[tag] : undefined
  // Course DV-09 chapter 7: a control module SFC lists its module parameters (MESSAGE) directly.
  const isSfc = !!tag && !!sfcs[tag]
  const paths = pictureSourcePaths(module)
  // Items without a block (an alarm such as HI_ALM, ALARMS[1].A_LAALM or an AO input parameter such as CAS_SP) are listed next to the blocks.
  const blocks = [...new Set(paths.filter(p => p.path.includes('/')).map(p => p.path.split('/')[0]))]
  const moduleLevel = paths.filter(p => !p.path.includes('/')).map(p => p.path)
  const params = block ? paths.filter(p => p.path.startsWith(`${block}/`)).map(p => p.path.split('/')[1]) : []
  const choose = (s: string): void => setPick(s)
  const suffix = (name: string, blockName?: string): string => (/ALARMS\[|\.A_/.test(name) ? '' : /_ALM$/.test(name) || blockName === 'DC1' ? '.A_CV' : '.F_CV')
  const full = isSfc ? (pick ? `DVSYS.${tag}/${pick}.F_CV` : '') : tag && block && pick ? `DVSYS.${tag}/${block}/${pick}${suffix(pick, block)}` : tag && !block && moduleLevel.includes(pick) ? `DVSYS.${tag}/${pick}${suffix(pick)}` : ''
  const list = isSfc && tag ? Object.keys(sfcLifecycle[tag]?.draft.parameters ?? sfcs[tag].parameters ?? {}) : block ? params : tag ? [...blocks, ...moduleLevel] :
    [...Object.values(modules).filter(m => m.area === area).map(m => m.tag), ...Object.values(sfcs).filter(s => s.area === area).map(s => s.name)]
  const open = (s: string): void => { if (isSfc || block || moduleLevel.includes(s)) choose(s); else if (tag) { setBlock(s); setPick('') } else { setTag(s); setPick('') } }
  return <SimulatorDialog className="module-download-dialog dvd" label="Browse" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Look in:<select aria-label="Look in" value={area} onChange={e => { setArea(e.target.value); setTag(null); setBlock(null); setPick('') }}>{areas.map(a => <option key={a}>{a}</option>)}</select></label>
      <div className="dvd-inline"><button className="tbtn sm" aria-label="Up One Level" disabled={!tag} onClick={() => { if (block) { setBlock(null); setPick('') } else setTag(null) }}>↑</button>
        <span className="exp-hint">{[area, tag, block].filter(Boolean).join(' / ')}</span></div>
      <ul className="dv09-browse-list" aria-label="Browse list">{list.length === 0 && <li className="exp-hint">(empty)</li>}
        {list.map(item => <li key={item} className={pick === item ? 'sel' : ''} data-browse-item={item} onClick={() => (block || isSfc || moduleLevel.includes(item) ? choose(item) : undefined)} onDoubleClick={() => open(item)}>{item}</li>)}</ul>
      <label>Object Name:<input aria-label="Object Name" readOnly value={full ? full.replace('DVSYS.', '') : tag ?? ''} /></label>
      <label>Object Type:<select aria-label="Object Type" defaultValue="Module Parameters"><option>Module Parameters</option></select></label>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={!full} onClick={() => onOk(full)}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}
