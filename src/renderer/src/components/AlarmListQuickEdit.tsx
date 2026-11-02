import { useState } from 'react'
import { useStore } from '../engine/store'
import { SimulatorDialog } from './SimulatorDialog'
import { askConfirm } from './AppNotices'
import { ALARM_COLUMNS, type AlarmColumnKey } from '../utils/format'
import { alarmListDirty, applyAlarmColumns, closeQuickEdit, effectiveAlarmColumns, saveAlarmList, useDv09Ops } from '../engine/dv09Settings'

// Course DV-09 chapter 13 (pp 13-20 .. 13-26): the Alarm List opened with Quick Edit in DeltaV Operate (Configure) and the DeltaV Alarm
// Summary Configuration dialog of its Alarm Summary object (General, Layout, Columns, Sorting, Filters, Colors, Time Format, Actions).
// Only the General and Columns tabs hold settings in the trainer; the other tabs say so.

const TABS = ['General', 'Layout', 'Columns', 'Sorting', 'Filters', 'Colors', 'Time Format', 'Actions'] as const
const label = (k: AlarmColumnKey): string => ALARM_COLUMNS.find(c => c.key === k)?.label ?? k
const log = (text: string): void => useStore.getState().logEvent('DIAGNOSTIC', 'alarmList', text)

function AlarmSummaryConfigDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<(typeof TABS)[number]>('General')
  const start = useDv09Ops.getState()
  const [displayed, setDisplayed] = useState<AlarmColumnKey[]>(() => [...(start.alarmListApplied ?? effectiveAlarmColumns(start))])
  const [pickedAvailable, setPickedAvailable] = useState<AlarmColumnKey | null>(null)
  const [pickedDisplayed, setPickedDisplayed] = useState<AlarmColumnKey | null>(null)
  const [applied, setApplied] = useState<AlarmColumnKey[]>(displayed)
  const [error, setError] = useState<string | null>(null)
  const available = ALARM_COLUMNS.map(c => c.key).filter(k => !displayed.includes(k)).sort((a, b) => label(a).localeCompare(label(b)))
  const changed = JSON.stringify(displayed) !== JSON.stringify(applied)
  const index = pickedDisplayed ? displayed.indexOf(pickedDisplayed) : -1
  const choose = (t: (typeof TABS)[number]): void => { setTab(t); log(`Alarm Summary Configuration: ${t} tab`) }
  const add = (): void => {
    if (!pickedAvailable) return
    setDisplayed(d => [...d, pickedAvailable])
    setPickedDisplayed(pickedAvailable)
    log(`Alarm Summary Configuration: ${label(pickedAvailable)} added to Displayed Columns`)
    setPickedAvailable(null)
  }
  const remove = (): void => { if (pickedDisplayed) { setDisplayed(d => d.filter(k => k !== pickedDisplayed)); setPickedDisplayed(null) } }
  const move = (step: -1 | 1): void => setDisplayed(d => {
    const i = pickedDisplayed ? d.indexOf(pickedDisplayed) : -1
    const j = i + step
    if (i < 0 || j < 0 || j >= d.length) return d
    const next = [...d]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const apply = (): boolean => {
    const e = applyAlarmColumns(displayed)
    setError(e)
    if (!e) setApplied(displayed)
    return !e
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="DeltaV Alarm Summary Configuration" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <div className="al-tabs" role="tablist">{TABS.map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => choose(t)}>{t}</button>)}</div>
      {tab === 'General' && <fieldset className="lib-dlg-props"><legend>Alarm Summary Type</legend>
        <label className="lib-dlg-check"><input type="radio" checked readOnly /> Active Alarms</label>
        <label className="lib-dlg-check"><input type="radio" disabled /> Suppressed Alarms</label>
        {['Process Alarms', 'Device Alarms', 'SIS Process Alarms', 'SIS Device Alarms', 'SIS Hardware Alarms'].map(t => <label key={t} className="lib-dlg-check"><input type="checkbox" checked disabled readOnly /> {t}</label>)}
        <fieldset className="lib-dlg-props"><legend>Run-time Options:</legend>
          <label>Update Rate: <input type="number" value={1} readOnly aria-label="Update Rate" style={{ width: 50 }} /> seconds.</label>
          <label>Pause updating for: <input type="number" value={5} readOnly aria-label="Pause updating for" style={{ width: 50 }} /> seconds when an alarm is selected.</label></fieldset></fieldset>}
      {tab === 'Columns' && <>
        <div className="al-cols">
          <div><div>Available Columns:</div>
            <select aria-label="Available Columns" size={9} value={pickedAvailable ?? ''} onChange={e => setPickedAvailable((e.target.value || null) as AlarmColumnKey | null)}>
              {available.map(k => <option key={k} value={k}>{label(k)}</option>)}</select></div>
          <div className="al-col-buttons">
            <button className="tbtn sm" onClick={add} disabled={!pickedAvailable}>Add &gt;&gt;</button>
            <button className="tbtn sm" onClick={remove} disabled={!pickedDisplayed}>&lt;&lt; Remove</button>
            <button className="tbtn sm" onClick={() => move(-1)} disabled={index <= 0}>Move Up</button>
            <button className="tbtn sm" onClick={() => move(1)} disabled={index < 0 || index >= displayed.length - 1}>Move Down</button>
            <button className="tbtn sm" disabled>Modify</button></div>
          <div><div>Displayed Columns:</div>
            <div className="al-displayed" role="listbox" aria-label="Displayed Columns" data-displayed={displayed.join(',')}>
              <div className="row head"><span>Column</span><span>Color</span></div>
              <div className="row" role="option" aria-selected={false}><span>Ack</span><span>Priority</span></div>
              {displayed.map(k => <div key={k} className={'row' + (k === pickedDisplayed ? ' sel' : '')} role="option" aria-selected={k === pickedDisplayed} onClick={() => setPickedDisplayed(k)}>
                <span>{label(k)}</span><span>Priority</span></div>)}
            </div></div>
        </div>
        <label className="lib-dlg-check"><input type="checkbox" checked readOnly /> Single Click Actions Enabled</label>
        <label className="lib-dlg-check"><input type="checkbox" checked readOnly /> Adjust column widths allowed</label>
      </>}
      {tab !== 'General' && tab !== 'Columns' && <p className="exp-hint">The {tab} tab is part of the DeltaV Alarm Summary Configuration; its settings are not modeled in the trainer. Refer to Books Online or Help for the screen.</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { if (apply()) onClose() }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button>
      <button className="tbtn sm" disabled={!changed} onClick={apply}>Apply</button>
      <button className="tbtn sm" onClick={() => setError('Refer to Books Online or Help for each screen displayed.')}>Help</button>
    </div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
  </SimulatorDialog>
}

/** The Alarm List display in DeltaV Operate (Configure): AlarmList.grf with its Alarm Summary object (p13-21). */
export function AlarmListQuickEdit({ unack, total, shelved }: { unack: number; total: number; shelved: number }): JSX.Element {
  const ops = useDv09Ops()
  const columns = ops.alarmListApplied ?? effectiveAlarmColumns(ops)
  const [menu, setMenu] = useState<string | null>(null)
  const [objMenu, setObjMenu] = useState<{ x: number; y: number } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [message, setMessage] = useState('')
  const dirty = alarmListDirty(ops)
  const openConfig = (): void => { setObjMenu(null); log('Alarm Summary Configuration opened (DeltaV.DVAlarmSummary Object Properties)'); setConfigOpen(true) }
  const save = (): void => { const e = saveAlarmList(); setMessage(e ?? 'AlarmList.grf saved') }
  const leave = async (): Promise<void> => {
    setMenu(null)
    if (dirty && !(await askConfirm('AlarmList.grf has unsaved changes. Close without saving?'))) return
    closeQuickEdit()
  }
  return <div className="display" style={{ display: 'flex', flexDirection: 'column' }} data-alarm-list-configure role="application" aria-label="DeltaV Operate (Configure)"
    onMouseDown={() => { setMenu(null); setObjMenu(null) }}>
    <div className="al-config-title">DeltaV Operate (Configure) — AlarmList.grf{dirty ? ' *' : ''}</div>
    <div className="al-config-menu" role="menubar" onMouseDown={e => e.stopPropagation()}>
      <span style={{ position: 'relative' }}><button className="sp-menu-btn" role="menuitem" onClick={() => setMenu(m => (m === 'File' ? null : 'File'))}>File</button>
        {menu === 'File' && <div className="ctx-menu dvx-dropdown" role="menu" aria-label="File menu">
          <button className="ctx-item" role="menuitem" onClick={() => { setMenu(null); save() }}>Save</button>
          <button className="ctx-item" role="menuitem" onClick={() => void leave()}>Close</button></div>}</span>
      <span style={{ position: 'relative' }}><button className="sp-menu-btn" role="menuitem" onClick={() => setMenu(m => (m === 'WorkSpace' ? null : 'WorkSpace'))}>WorkSpace</button>
        {menu === 'WorkSpace' && <div className="ctx-menu dvx-dropdown" role="menu" aria-label="WorkSpace menu">
          <button className="ctx-item" role="menuitem" onClick={() => void leave()}>Switch to Run</button></div>}</span>
      <button className="tbtn sm" aria-label="Save display" title="Save" onClick={save}>💾</button>
      <span className="exp-hint" role="status" data-quick-edit-status>{message}</span>
    </div>
    <div className="alarm-list-head">
      <span className="alh-title">Alarm List</span>
      <span className="alh-counts">Unack: <b>{unack}</b>&nbsp;&nbsp; Total: <b>{total}</b>&nbsp;&nbsp; Suppressed: <b>{shelved}</b></span>
    </div>
    <p className="exp-hint" style={{ margin: '4px 8px' }}>Configure the object by double-clicking on the display area or by right-clicking and selecting Properties.</p>
    <div style={{ overflow: 'auto', flex: 1 }} data-alarm-summary-object aria-label="Alarm Summary object" onDoubleClick={openConfig}
      onContextMenu={e => { e.preventDefault(); setObjMenu({ x: e.clientX, y: e.clientY }) }}>
      <table className="alarm-table al-config-sample">
        <thead><tr><th style={{ width: 44 }}>Ack</th>{columns.map(k => <th key={k} data-configured-column={k}>{label(k)}</th>)}</tr></thead>
        <tbody><tr><td /> {columns.map(k => <td key={k}>1234567890</td>)}</tr></tbody>
      </table>
    </div>
    {objMenu && <div className="ctx-menu dv09-op-ctx" role="menu" aria-label="Alarm Summary object menu" style={{ position: 'fixed', left: objMenu.x, top: objMenu.y, zIndex: 60 }} onMouseDown={e => e.stopPropagation()}>
      {['Animations...', 'Undo', 'Cut', 'Copy', 'Delete', 'Duplicate', 'Group', 'Bring to Front', 'Send to Back', 'Edit Script', 'KeyMacros', 'Property Window...']
        .map(t => <button key={t} className="ctx-item" role="menuitem" disabled title="Not modeled">{t}</button>)}
      <button className="ctx-item" role="menuitem" onClick={openConfig}>Properties... DeltaV.DVAlarmSummary Object</button>
    </div>}
    {configOpen && <AlarmSummaryConfigDialog onClose={() => setConfigOpen(false)} />}
  </div>
}
