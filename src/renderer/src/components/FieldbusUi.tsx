import { useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../engine/store'
import { useSystem } from '../engine/systemPreferences'
import { SimulatorDialog } from './SimulatorDialog'
import { TreeRow, DvIcon, ContextMenu, type LibrarySelection } from './LibraryExplorer'
import { useSerialUi } from './SerialExplorerUi'
import * as act from '../engine/fieldbusActions'
import {
  BLOCK_EXEC_MS, DEVICE_ALARM_KINDS, FF_CATALOG, H1_LIMITS, H1_PORT_IDS, REQUESTED_MACROCYCLE_OPTIONS_MS, blockCounts, catalogEntry, h1PlacementError, linkCounts,
  macrocycleViewer, portMacrocycle,
  type DeviceAlarmKind, type FfDevice, type H1Card, type H1PortId
} from '../engine/fieldbus'
import { findFfDevice, rankPriority } from '../engine/deviceAlarms'
import '../dv09-chapters.css'

// Course DV-09 chapters 12 and 13 in DeltaV Explorer: I/O > New Card (Add Card dialog, p12-22) or Auto-Sense I/O Cards, the H1 card C05 with its
// ports (P01 > Properties with the General and Advanced tabs, View Schedule, pp 12-23 .. 12-30), Download > Card (Step 5, p12-33),
// the Fieldbus Device Alarms of a device (pp 13-8 .. 13-15) and the device Properties > Alarms & Displays tab (pp 13-17 .. 13-19).

export type FbDlg =
  | { t: 'newCard'; controller: string }
  | { t: 'port'; cardId: string; port: H1PortId; tab?: 'General' | 'Advanced' }
  | { t: 'download'; cardId: string }
  | { t: 'alarm'; cardId: string; device: string; kind: DeviceAlarmKind }
  | { t: 'alarms'; cardId: string; device: string }
  | { t: 'device'; cardId: string; device: string }
  | { t: 'commission'; cardId: string; port: H1PortId; deviceId: string }
  | null
export const useFbUi = create<{ dlg: FbDlg; open: (d: NonNullable<FbDlg>) => void; close: () => void }>(set => ({ dlg: null, open: dlg => set({ dlg }), close: () => set({ dlg: null }) }))

const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)
const slotLabel = (slot: number): string => `C${String(slot).padStart(2, '0')}`

export const ALARM_NAME: Record<DeviceAlarmKind, string> = { NOT_COMM: 'COMM_ALM', ABNORMAL: 'ABNORM_ALM', FAILED: 'FAIL_ALM', MAINTENANCE: 'MAINT_ALM', ADVISORY: 'ADVISE_ALM' }
const ALARM_ORDER: DeviceAlarmKind[] = ['ABNORMAL', 'ADVISORY', 'NOT_COMM', 'FAILED', 'MAINTENANCE']
const PRIORITY_RANK: Record<string, number> = { ADVISORY: 7, WARNING: 11, CRITICAL: 15, LOG: 4 }
export const priorityName = (rank: number): string => (rank <= 4 ? 'LOG' : rankPriority(rank))
const PRIORITY_ORDER = ['ADVISORY', 'CRITICAL', 'LOG', 'WARNING']

const useCards = (): H1Card[] => {
  const h1 = useStore(s => s.hardware.h1Cards)
  return Object.values(h1 ?? {})
}

// --- Add Card (p12-22) ----------------------------------------------------------

function NewCardDialog({ controller, onClose }: { controller: string; onClose: () => void }): JSX.Element {
  const hardware = useStore(s => s.hardware)
  const fieldbusOn = useSystem(s => s.features.fieldbus)
  const taken = new Set([
    ...Object.values(hardware.traditionalCards ?? {}).filter(c => !c.serial && !c.fieldbus && c.controllerTag === controller).map(c => c.slot),
    ...Object.values(hardware.serialCards ?? {}).filter(c => c.controllerTag === controller).map(c => c.slot),
    ...Object.values(hardware.h1Cards ?? {}).filter(c => c.controllerTag === controller).flatMap(c => (c.partnerSlot ? [c.slot, c.partnerSlot] : [c.slot]))
  ])
  const free = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => !taken.has(n))
  const [cardClass, setCardClass] = useState(fieldbusOn ? 'Fieldbus' : 'Serial')
  const [redundant, setRedundant] = useState(false)
  const [slot, setSlot] = useState(free.includes(5) ? 5 : free[0] ?? 5)
  const [error, setError] = useState<string | null>(null)
  const slotChoices = redundant ? free.filter(n => n % 2 === 1 && free.includes(n + 1)) : free
  const shownSlot = slotChoices.includes(slot) ? slot : slotChoices[0] ?? slot
  const submit = (): void => {
    if (cardClass === 'Serial') { onClose(); useSerialUi.getState().open({ t: 'newCard', controller }); return }
    const e = act.addH1Card(controller, shownSlot, redundant)
    if (e) { setError(e); return }
    act.enableDeviceAlarms(`${controller}/${slotLabel(shownSlot)}`, true)
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Add Card" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Card class:<select aria-label="Card class" value={cardClass} onChange={e => { setCardClass(e.target.value); setError(null) }}>
        <option>Fieldbus</option><option>Serial</option></select></label>
      <label>Card type:<select aria-label="Card type" value="H1" disabled={cardClass !== 'Fieldbus'} onChange={() => undefined}>
        {cardClass === 'Fieldbus' ? <option>H1</option> : <option>Serial</option>}</select></label>
      <label>Card series:<select aria-label="Card series" value="Series 2" disabled onChange={() => undefined}><option>Series 2</option></select></label>
      <label>Slot:<select aria-label="Slot" value={shownSlot} onChange={e => setSlot(Number(e.target.value))}>
        {slotChoices.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Card is redundant" checked={redundant} disabled={cardClass !== 'Fieldbus'}
        onChange={e => setRedundant(e.target.checked)} /> Card is redundant</label>
      <p className="exp-hint">I/O redundancy is available for Series 2 cards only. With Card is redundant selected, the next available odd-numbered slot appears. Slot {shownSlot} becomes {slotLabel(shownSlot)}.</p>
      {cardClass === 'Fieldbus' && !fieldbusOn && <p className="exp-hint">FOUNDATION fieldbus is not enabled yet: use System Preferences, then shut down and reconnect the database server.</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

// --- Port Properties (pp 12-23 .. 12-30) -----------------------------------------

const REQUESTED_LABEL = (ms: number): string => (ms < 1000 ? `${ms} ms` : `${ms / 1000} sec`)

function ScheduleDialog({ cardId, port: portId, onClose }: { cardId: string; port: H1PortId; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.h1Cards?.[cardId])
  if (!card) return null
  const port = card.ports[portId]
  const m = portMacrocycle(port)
  const rows = macrocycleViewer(port).rows
  let offset = 0
  const span = Math.max(m.actualMs, 100)
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${portId} Macrocycle Schedule`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel" data-schedule>
      <p><b>Calculated Macrocycle Time: {m.calculatedMs} ms &nbsp; Requested Macrocycle Time: {port.moduleDriven ? 'Module-driven' : `${m.requestedMs} ms`}</b></p>
      <div className="fb-sched">
        <div className="fb-sched-head"><span>Block (Device/Block Tag)</span><span>0 ms … {span} ms</span></div>
        {rows.length === 0 && <div className="exp-hint">No function blocks are scheduled on this port yet.</div>}
        {rows.flatMap(r => r.blocks.map(b => {
          const [dev, blk] = b.split('/')
          const type = port.devices[dev]?.blocks.find(x => x.tag === blk)?.type
          const w = (BLOCK_EXEC_MS[type ?? 'AI'] / span) * 100
          const left = (offset / span) * 100
          offset += BLOCK_EXEC_MS[type ?? 'AI']
          return <div key={b} className="fb-sched-row"><span>{b} ({r.bandMs / 1000} s)</span><span className="fb-sched-track"><i style={{ left: `${left}%`, width: `${Math.max(w, 1.5)}%` }} /></span></div>
        }))}
      </div>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>Close</button></div>
  </SimulatorDialog>
}

function PortDialog({ cardId, port: portId, tab: startTab, onClose }: { cardId: string; port: H1PortId; tab?: 'General' | 'Advanced'; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.h1Cards?.[cardId])
  const user = 'ADMINISTRATOR'
  const [tab, setTab] = useState<'General' | 'Advanced'>(startTab ?? 'General')
  const port0 = card?.ports[portId]
  const [enabled, setEnabled] = useState(port0?.enabled ?? false)
  const [description, setDescription] = useState(port0?.description ?? '')
  const [requested, setRequested] = useState<string>(port0?.moduleDriven ? 'Module-driven' : REQUESTED_LABEL(port0?.requestedMacrocycleMs ?? 1000))
  const [minCd, setMinCd] = useState(String(port0?.minCdSpacingMs ?? 20))
  const [error, setError] = useState<string | null>(null)
  const [schedule, setSchedule] = useState(false)
  if (!card || !port0) return null
  const moduleDriven = requested === 'Module-driven'
  const requestedMs = moduleDriven ? port0.requestedMacrocycleMs : REQUESTED_MACROCYCLE_OPTIONS_MS.find(ms => REQUESTED_LABEL(ms) === requested) ?? port0.requestedMacrocycleMs
  const cd = Number(minCd)
  const preview = { ...port0, requestedMacrocycleMs: requestedMs, minCdSpacingMs: Number.isFinite(cd) ? cd : port0.minCdSpacingMs }
  const calc = portMacrocycle(preview)
  const counts = linkCounts(port0)
  const blocks = Object.values(port0.devices).flatMap(d => d.blocks)
  const deviceBlocks = blocks.filter(b => b.executesIn === 'DEVICE').length
  const cardBlocks = blocks.filter(b => b.executesIn === 'CARD').length
  const total = blockCounts(card)
  const submit = (): void => {
    if (!Number.isInteger(cd)) { setError('Minimum schedule spacing must be a whole number of milliseconds'); return }
    const e = act.configureH1Port(cardId, portId, { enabled, description, requestedMacrocycleMs: requestedMs, moduleDriven, minCdSpacingMs: cd })
    if (e) setError(e); else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${portId} Properties`} onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{(['General', 'Advanced'] as const).map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <p>Object type: Fieldbus Port</p>
        <p>Modified by: {user}</p>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
        <label>Description:<input aria-label="Description" maxLength={255} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <fieldset className="lib-dlg-props"><legend>Schedule Macrocycle</legend>
          <label>Requested macrocycle:<select aria-label="Requested macrocycle" value={requested} onChange={e => setRequested(e.target.value)}>
            {[...REQUESTED_MACROCYCLE_OPTIONS_MS.map(REQUESTED_LABEL), 'Module-driven'].map(o => <option key={o}>{o}</option>)}</select></label>
          <label>Calculated macrocycle (ms):<input aria-label="Calculated macrocycle (ms)" readOnly value={moduleDriven ? Math.max(...[calc.calculatedMs, ...macrocycleViewer(port0).rows.map(r => r.calculatedMs)]) : calc.calculatedMs} /></label>
          <p className="exp-hint">The calculated macrocycle will be updated when the OK button is clicked.</p>
        </fieldset>
      </>}
      {tab === 'Advanced' && <fieldset className="lib-dlg-props"><legend>Schedule</legend>
        <label>Minimum schedule spacing (ms):<input aria-label="Minimum schedule spacing (ms)" type="number" min={0} max={H1_LIMITS.maxCdSpacingMs} value={minCd} onChange={e => setMinCd(e.target.value)} /></label>
        <table className="fb-limits" aria-label="Resource limits"><thead><tr><th /><th>Configured</th><th>Maximum</th></tr></thead><tbody>
          <tr><td>Publisher:</td><td data-field="publisher">{counts.publishers}</td><td>{H1_LIMITS.publishers}</td></tr>
          <tr><td>Subscriber:</td><td data-field="subscriber">{counts.subscribers}</td><td>{H1_LIMITS.subscribers}</td></tr>
          <tr><td>Total VCRs:</td><td data-field="vcrs">{counts.total}</td><td>{H1_LIMITS.totalVcrs}</td></tr>
          <tr><td>Device Blocks:</td><td data-field="deviceBlocks">{deviceBlocks}</td><td>{H1_LIMITS.deviceBlocks}</td></tr>
          <tr><td>H1 Card Block:</td><td data-field="cardBlocks">{cardBlocks}</td><td>{H1_LIMITS.cardBlocks}</td></tr>
        </tbody></table>
        <label className="lib-dlg-check"><input type="checkbox" disabled checked={false} readOnly /> Link master enabled</label>
        <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setSchedule(true)}>View Schedule</button></div>
        <p className="exp-hint">Per card the limits are {H1_LIMITS.totalBlocks} blocks ({total.device} device and {total.card} card blocks configured). Reducing the spacing can cause communication problems.</p>
      </fieldset>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
    {schedule && <ScheduleDialog cardId={cardId} port={portId} onClose={() => setSchedule(false)} />}
  </SimulatorDialog>
}

// --- Download ▸ Card (Step 5, p12-33) ---------------------------------------------

function DownloadDialog({ cardId, onClose }: { cardId: string; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.h1Cards?.[cardId])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!card) return null
  const run = (): void => { const e = act.downloadH1Card(cardId); if (e) setError(e); else setDone(true) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Download ${slotLabel(card.slot)}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      {!done ? <p>Download {slotLabel(card.slot)} ({card.id}) to the controller? The ports and their macrocycle schedules become active.</p>
        : <><p role="status" data-download-done>Downloading Selected Objects: download of {slotLabel(card.slot)} completed, 0 Error(s).</p>
          <ul aria-label="Downloading Selected Objects">{H1_PORT_IDS.map(p => <li key={p}>✓ {p} ({card.ports[p].enabled ? 'enabled' : 'disabled'})</li>)}</ul></>}
    </div>
    <div className="dvd-buttons">{!done ? <><button className="tbtn sm" onClick={run}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></> : <button className="tbtn sm" onClick={onClose}>Close</button>}</div><Err error={error} />
  </SimulatorDialog>
}

// --- Fieldbus Device Alarms (pp 13-8 .. 13-15) ------------------------------------

function PriorityEditor({ rank, onChange, label }: { rank: number; onChange: (rank: number) => void; label: string }): JSX.Element {
  return <select aria-label={label} value={priorityName(rank)} onChange={e => onChange(PRIORITY_RANK[e.target.value])}>{PRIORITY_ORDER.map(p => <option key={p}>{p}</option>)}</select>
}

function AlarmDialog({ cardId, device: tag, kind, onClose }: { cardId: string; device: string; kind: DeviceAlarmKind; onClose: () => void }): JSX.Element | null {
  const found = useStore(s => findFfDevice(s.hardware, tag))
  const setting = found?.device.alarms.settings[kind]
  const [enabled, setEnabled] = useState(setting?.enabled ?? false)
  const [rank, setRank] = useState(setting?.rank ?? 7)
  const [error, setError] = useState<string | null>(null)
  if (!found || !setting) return null
  const submit = (): void => { const e = act.configureDeviceAlarm(cardId, tag, kind, { enabled, rank }); if (e) setError(e); else onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${ALARM_NAME[kind]} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Object type: Fieldbus Device Alarm</p>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
      <label>Priority:<PriorityEditor rank={rank} onChange={setRank} label="Priority" /></label>
      <fieldset className="lib-dlg-props"><legend>Alarm Suppression Timeout</legend>
        <div className="dvd-inline"><label>Days:<input aria-label="Days" type="number" value={999} readOnly /></label><label>Hours:<input aria-label="Hours" type="number" value={0} readOnly /></label>
          <label>Minutes:<input aria-label="Minutes" type="number" value={0} readOnly /></label></div></fieldset>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

/** Properties of the Fieldbus Device Alarms node (p13-9): every alarm of the device with its Enabled box and Priority. */
function AlarmsDialog({ cardId, device: tag, onClose }: { cardId: string; device: string; onClose: () => void }): JSX.Element | null {
  const found = useStore(s => findFfDevice(s.hardware, tag))
  const [draft, setDraft] = useState(() => Object.fromEntries(DEVICE_ALARM_KINDS.map(k => [k, { ...(found?.device.alarms.settings[k] ?? { enabled: false, rank: 7 }) }])) as Record<DeviceAlarmKind, { enabled: boolean; rank: number }>)
  const [error, setError] = useState<string | null>(null)
  if (!found) return null
  const submit = (): void => {
    for (const k of DEVICE_ALARM_KINDS) {
      const cur = found.device.alarms.settings[k]
      if (cur.enabled === draft[k].enabled && cur.rank === draft[k].rank) continue
      const e = act.configureDeviceAlarm(cardId, tag, k, draft[k])
      if (e) { setError(e); return }
    }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Fieldbus Device Alarms Properties" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Object type: Fieldbus Device Alarms ({tag})</p>
      <table className="fb-limits"><thead><tr><th>Name</th><th>Enabled</th><th>Priority</th></tr></thead><tbody>
        {ALARM_ORDER.map(k => <tr key={k}><td>{ALARM_NAME[k]}</td>
          <td><input type="checkbox" aria-label={`${ALARM_NAME[k]} enabled`} checked={draft[k].enabled} onChange={e => setDraft({ ...draft, [k]: { ...draft[k], enabled: e.target.checked } })} /></td>
          <td><PriorityEditor rank={draft[k].rank} label={`${ALARM_NAME[k]} priority`} onChange={rank => setDraft({ ...draft, [k]: { ...draft[k], rank } })} /></td></tr>)}
      </tbody></table>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

// --- Fieldbus Device Properties (pp 13-16 .. 13-19) ---------------------------------

function DeviceDialog({ cardId, device: tag, onClose }: { cardId: string; device: string; onClose: () => void }): JSX.Element | null {
  const found = useStore(s => findFfDevice(s.hardware, tag))
  const modules = useStore(s => s.modules)
  const hardware = useStore(s => s.hardware)
  const [tab, setTab] = useState<'General' | 'Alarms & Displays'>('General')
  const card = found?.card
  const device = found?.device
  const [alarmsOn, setAlarmsOn] = useState(card?.deviceAlarms ?? false)
  const [reannounce, setReannounce] = useState(device?.alarms.reannunciate ?? false)
  const [manual, setManual] = useState(device?.alarms.areaMode === 'MODULE')
  const [areaModule, setAreaModule] = useState(device?.alarms.areaModule ?? '')
  const [primary, setPrimary] = useState(device?.alarms.primaryDisplay ?? '')
  const [error, setError] = useState<string | null>(null)
  if (!found || !card || !device) return null
  const supportsReannounce = !!catalogEntry(device.catalogId)?.reannunciation
  const area = manual ? (areaModule ? modules[areaModule]?.area : undefined) : hardware.controllerAreas?.[card.controllerTag]
  const submit = (): void => {
    const steps: (string | null)[] = [
      act.enableDeviceAlarms(cardId, alarmsOn),
      manual ? act.setDeviceAlarmArea(cardId, tag, 'MODULE', areaModule) : act.setDeviceAlarmArea(cardId, tag, 'CONTROLLER'),
      reannounce !== device.alarms.reannunciate ? act.setDeviceReannunciation(cardId, tag, reannounce, device.alarms.reannounceSeconds) : null,
      primary.trim().toUpperCase() !== device.alarms.primaryDisplay ? act.setDevicePrimaryDisplay(cardId, tag, primary) : null
    ]
    const e = steps.find(Boolean) ?? null
    if (e) setError(e); else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Fieldbus Device Properties" onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{(['General', 'Alarms & Displays'] as const).map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <p>Tag: <b>{tag}</b> · {device.state.charAt(0) + device.state.slice(1).toLowerCase()} · node address {device.address} · {catalogEntry(device.catalogId)?.model}</p>
        <p className="exp-hint">The General tab shows the same information as previous versions of the DeltaV software. Select the Alarms &amp; Displays tab to enable device alarms.</p>
      </>}
      {tab === 'Alarms & Displays' && <>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable Device Alarms" checked={alarmsOn} onChange={e => setAlarmsOn(e.target.checked)} /> Enable Device Alarms</label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable Device Alert Re-annunciation" checked={reannounce} disabled={!supportsReannounce} onChange={e => setReannounce(e.target.checked)} /> Enable Device Alert Re-annunciation</label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Manually select object used for area association" checked={manual} onChange={e => setManual(e.target.checked)} /> Manually select object used for area association</label>
        <label>Associate Alarms &amp; Events with Area or Module:<select aria-label="Associate Alarms and Events with Area or Module" disabled={!manual} value={areaModule} onChange={e => setAreaModule(e.target.value)}>
          <option value="">(select a module)</option>{Object.keys(modules).sort().map(m => <option key={m}>{m}</option>)}</select></label>
        <label>All device alarms associated with area:<input aria-label="All device alarms associated with area" readOnly value={area ?? ''} /></label>
        <fieldset className="lib-dlg-props"><legend>Displays</legend>
          <label>Primary control:<input aria-label="Primary control" value={primary} onChange={e => setPrimary(e.target.value)} /></label>
          <label>Faceplate:<input aria-label="Faceplate" readOnly value="FFDEV_fp" /></label></fieldset>
      </>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

function CommissionDialog({ cardId, port, deviceId, onClose }: { cardId: string; port: H1PortId; deviceId: string; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.h1Cards?.[cardId])
  const [tag, setTag] = useState('TT1')
  const [error, setError] = useState<string | null>(null)
  const physical = card?.field[deviceId]
  if (!card || !physical) return null
  const submit = (): void => {
    const e = act.addFfDevice(cardId, port, tag.trim(), physical.address, physical.catalogId, physical.deviceRevision, physical.ddRevision) ?? act.commissionFfDevice(cardId, tag.trim(), deviceId, 'Commissioned from DeltaV Explorer')
    if (e) setError(e); else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Commission Fieldbus Device" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Device {deviceId} ({catalogEntry(physical.catalogId)?.model}) at node address {physical.address} on {port}.</p>
      <label>Device tag:<input aria-label="Device tag" maxLength={16} value={tag} onChange={e => setTag(e.target.value)} /></label>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

export function FieldbusDialogHost(): JSX.Element | null {
  const dlg = useFbUi(s => s.dlg)
  const close = useFbUi(s => s.close)
  if (!dlg) return null
  switch (dlg.t) {
    case 'newCard': return <NewCardDialog key={dlg.controller} controller={dlg.controller} onClose={close} />
    case 'port': return <PortDialog key={`${dlg.cardId}/${dlg.port}`} cardId={dlg.cardId} port={dlg.port} tab={dlg.tab} onClose={close} />
    case 'download': return <DownloadDialog key={dlg.cardId} cardId={dlg.cardId} onClose={close} />
    case 'alarm': return <AlarmDialog key={`${dlg.device}/${dlg.kind}`} cardId={dlg.cardId} device={dlg.device} kind={dlg.kind} onClose={close} />
    case 'alarms': return <AlarmsDialog key={dlg.device} cardId={dlg.cardId} device={dlg.device} onClose={close} />
    case 'device': return <DeviceDialog key={dlg.device} cardId={dlg.cardId} device={dlg.device} onClose={close} />
    case 'commission': return <CommissionDialog key={dlg.deviceId} cardId={dlg.cardId} port={dlg.port} deviceId={dlg.deviceId} onClose={close} />
  }
}

// --- the tree rows under I/O ---------------------------------------------------------

type MenuState = { x: number; y: number; label: string; items: { label: string; onClick?: () => void; disabled?: string; separator?: boolean; danger?: boolean }[] } | null
const sep = { label: '', separator: true }
const stateText = (d: FfDevice): string => d.state.charAt(0) + d.state.slice(1).toLowerCase()

/** H1 cards of one controller as Explorer rows: C05 > P01 > devices > Fieldbus Device Alarms. */
export function FieldbusTreeRows({ controller, depth, selection, onSelect }: { controller: string; depth: number; selection: LibrarySelection | null; onSelect: (s: LibrarySelection) => void }): JSX.Element {
  const cards = useCards().filter(c => c.controllerTag === controller).sort((a, b) => a.slot - b.slot)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<MenuState>(null)
  const toggle = (k: string): void => setOpen(o => ({ ...o, [k]: !o[k] }))
  const isSel = (id: string): boolean => selection?.kind === 'fieldbus' && selection.id === id
  const pick = (id: string, label: string): void => onSelect({ kind: 'fieldbus', id, label })
  const show = (e: React.MouseEvent, label: string, items: NonNullable<MenuState>['items']): void => setMenu({ x: e.clientX, y: e.clientY, label, items })
  const tri = <span className="tv-pending" title="Download required">▲</span>
  const ui = useFbUi.getState()
  return <>
    {cards.map(card => {
      const cardLabel = card.redundant ? `${slotLabel(card.slot)}/${slotLabel(card.partnerSlot ?? card.slot + 1)}` : slotLabel(card.slot)
      return <TreeRow key={card.id} depth={depth} open={!!open[card.id]} onToggle={() => toggle(card.id)} icon={<DvIcon kind="item" />} selected={isSel(`card:${card.id}`)}
        pending={card.downloaded ? undefined : tri} label={<span>{cardLabel}</span>} sub={`Series 2 H1 Fieldbus card${card.redundant ? ' (redundant)' : ''}${card.downloaded ? '' : ' · not downloaded'}`}
        dataAttr={{ 'data-fb-card': card.id }} onClick={() => pick(`card:${card.id}`, cardLabel)}
        onContextMenu={e => { pick(`card:${card.id}`, cardLabel); show(e, cardLabel, [
          { label: 'Explore', onClick: () => toggle(card.id) },
          { label: 'Download ▸ Card...', onClick: () => ui.open({ t: 'download', cardId: card.id }) },
          sep,
          { label: 'Delete', danger: true, onClick: () => { const err = act.removeH1Card(card.id); if (err) window.alert(err) } },
          sep,
          { label: "What's this?", onClick: () => window.alert('H1 Fieldbus Interface card: its two ports P01 and P02 are the segments. Right-click a port and choose Properties to enable it and see its macrocycle.') },
          { label: 'Properties', disabled: 'The card has no properties of its own; configure the ports with Pn > Properties' }]) }}>
        {H1_PORT_IDS.map(portId => {
          const port = card.ports[portId]
          const key = `${card.id}/${portId}`
          const devices = Object.values(port.devices)
          const decom = act.ffInventory(card, portId).filter(r => !r.tag && r.deviceId)
          return <TreeRow key={portId} depth={depth + 1} open={!!open[key]} onToggle={() => toggle(key)} icon={<DvIcon kind="item" />} selected={isSel(`port:${key}`)}
            label={<span>{portId}</span>} sub={`Fieldbus Port · ${port.enabled ? 'enabled' : 'disabled'}${port.description ? ` · ${port.description}` : ''}`}
            dataAttr={{ 'data-fb-port': key }} onClick={() => pick(`port:${key}`, portId)}
            onDoubleClick={() => ui.open({ t: 'port', cardId: card.id, port: portId })}
            onContextMenu={e => { pick(`port:${key}`, portId); show(e, portId, [
              { label: 'Explore', onClick: () => toggle(key) },
              { label: 'Rescan Port (Auto-Sense Devices)', disabled: 'Use Diagnostics: select the port and right-click Rescan Port' },
              sep,
              { label: "What's this?", onClick: () => window.alert('Fieldbus port — one H1 segment. Properties > General enables the port and shows the macrocycle; Advanced shows the resource limits.') },
              { label: 'Properties', onClick: () => ui.open({ t: 'port', cardId: card.id, port: portId }) }]) }}>
            <TreeRow depth={depth + 2} open={!!open[`${key}:decom`]} onToggle={decom.length ? () => toggle(`${key}:decom`) : undefined} icon={<DvIcon kind="decom" />}
              selected={isSel(`decom:${key}`)} label={<span>Decommissioned Fieldbus Devices</span>} dataAttr={{ 'data-h1-decom': key }} onClick={() => pick(`decom:${key}`, 'Decommissioned Fieldbus Devices')}>
              {decom.map(r => <TreeRow key={r.deviceId} depth={depth + 3} icon={<DvIcon kind="item" />} label={<span>{r.deviceId}</span>} sub={`${r.model} · address ${r.address} · ${r.state}`}
                dataAttr={{ 'data-h1-decom-device': r.deviceId }}
                onContextMenu={e => show(e, r.deviceId, [{ label: 'Commission...', disabled: r.integrity === 'Good' ? undefined : 'The device is not communicating', onClick: () => ui.open({ t: 'commission', cardId: card.id, port: portId, deviceId: r.deviceId }) }])} />)}
            </TreeRow>
            {devices.map(device => {
              const dkey = `${key}/${device.tag}`
              return <TreeRow key={device.tag} depth={depth + 2} open={!!open[dkey]} onToggle={() => toggle(dkey)} icon={<DvIcon kind="item" />} selected={isSel(`device:${device.tag}`)}
                label={<span>{device.tag}</span>} sub={`${catalogEntry(device.catalogId)?.model ?? 'Fieldbus device'} · ${stateText(device)} · address ${device.address}`}
                dataAttr={{ 'data-h1-device': device.tag }} onClick={() => pick(`device:${device.tag}`, device.tag)}
                onDoubleClick={() => ui.open({ t: 'device', cardId: card.id, device: device.tag })}
                onContextMenu={e => { pick(`device:${device.tag}`, device.tag); show(e, device.tag, [
                  { label: 'Explore', onClick: () => toggle(dkey) },
                  sep,
                  { label: 'Properties', onClick: () => ui.open({ t: 'device', cardId: card.id, device: device.tag }) }]) }}>
                {device.blocks.map(b => <TreeRow key={b.tag} depth={depth + 3} icon={<DvIcon kind="item" />} label={<span>{b.tag}</span>} sub={`${b.type} block · ${b.mode}`} />)}
                <TreeRow depth={depth + 3} icon={<DvIcon kind="item" />} selected={isSel(`alarms:${device.tag}`)} label={<span>Fieldbus Device Alarms</span>}
                  dataAttr={{ 'data-h1-alarms': device.tag }} onClick={() => pick(`alarms:${device.tag}`, 'Fieldbus Device Alarms')}
                  onDoubleClick={() => pick(`alarms:${device.tag}`, 'Fieldbus Device Alarms')}
                  onContextMenu={e => { pick(`alarms:${device.tag}`, 'Fieldbus Device Alarms'); show(e, 'Fieldbus Device Alarms', [
                    { label: 'Explore', onClick: () => pick(`alarms:${device.tag}`, 'Fieldbus Device Alarms') },
                    sep,
                    { label: 'Properties', onClick: () => ui.open({ t: 'alarms', cardId: card.id, device: device.tag }) }]) }} />
              </TreeRow>
            })}
          </TreeRow>
        })}
      </TreeRow>
    })}
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </>
}

// --- the Contents pane -----------------------------------------------------------------

export function FieldbusDetail({ id }: { id: string }): JSX.Element {
  const hardware = useStore(s => s.hardware)
  const [menu, setMenu] = useState<MenuState>(null)
  const ui = useFbUi.getState()
  const [kind, ...rest] = id.split(':')
  const arg = rest.join(':')
  const wrap = (body: JSX.Element): JSX.Element => <div className="dvx-contents" data-fieldbus-contents={id}>{body}{menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}</div>
  if (kind === 'alarms') {
    const found = findFfDevice(hardware, arg)
    if (!found) return <div className="exp-empty">Device not found.</div>
    return wrap(<table className="dvx-details" role="grid" aria-label="Fieldbus Device Alarms"><thead><tr><th>Name</th><th>Type</th><th>Enabled</th><th>Priority</th></tr></thead><tbody>
      {ALARM_ORDER.map(k => { const s = found.device.alarms.settings[k]
        return <tr key={k} data-device-alarm={ALARM_NAME[k]} onDoubleClick={() => ui.open({ t: 'alarm', cardId: found.card.id, device: arg, kind: k })}
          onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: ALARM_NAME[k], items: [{ label: 'Properties', onClick: () => ui.open({ t: 'alarm', cardId: found.card.id, device: arg, kind: k }) }] }) }}>
          <td><span className="dvx-name"><DvIcon kind="item" /><span>{ALARM_NAME[k]}</span></span></td><td>Fieldbus Device Alarm</td><td>{s.enabled ? 'Yes' : 'No'}</td><td>{priorityName(s.rank)}</td></tr> })}
    </tbody></table>)
  }
  if (kind === 'card') {
    const card = hardware.h1Cards?.[arg]
    if (!card) return <div className="exp-empty">Card not found.</div>
    return wrap(<table className="dvx-details" role="grid"><thead><tr><th>Name</th><th>Type</th><th>State</th></tr></thead><tbody>
      {H1_PORT_IDS.map(p => <tr key={p} onDoubleClick={() => ui.open({ t: 'port', cardId: card.id, port: p })}><td><span className="dvx-name"><DvIcon kind="item" /><span>{p}</span></span></td><td>Fieldbus Port</td><td>{card.ports[p].enabled ? 'Enabled' : 'Disabled'}</td></tr>)}
    </tbody></table>)
  }
  if (kind === 'port') {
    const [cardId, portId] = [arg.slice(0, arg.lastIndexOf('/')), arg.slice(arg.lastIndexOf('/') + 1) as H1PortId]
    const card = hardware.h1Cards?.[cardId]
    if (!card) return <div className="exp-empty">Port not found.</div>
    return wrap(<table className="dvx-details" role="grid"><thead><tr><th>Name</th><th>Type</th><th>State</th></tr></thead><tbody>
      {Object.values(card.ports[portId].devices).map(d => <tr key={d.tag}><td><span className="dvx-name"><DvIcon kind="item" /><span>{d.tag}</span></span></td><td>{catalogEntry(d.catalogId)?.model}</td><td>{stateText(d)}</td></tr>)}
      {!Object.keys(card.ports[portId].devices).length && <tr><td colSpan={3} className="dvx-empty">No fieldbus devices are commissioned on {portId}. Decommissioned Fieldbus Devices lists the devices found on the segment.</td></tr>}
    </tbody></table>)
  }
  if (kind === 'decom') {
    const [cardId, portId] = [arg.slice(0, arg.lastIndexOf('/')), arg.slice(arg.lastIndexOf('/') + 1) as H1PortId]
    const card = hardware.h1Cards?.[cardId]
    if (!card) return <div className="exp-empty">Port not found.</div>
    const rows = act.ffInventory(card, portId).filter(r => !r.tag && r.deviceId)
    return wrap(<table className="dvx-details" role="grid"><thead><tr><th>Name</th><th>State</th><th>Node address</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.deviceId} onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: r.deviceId, items: [{ label: 'Commission...', onClick: () => ui.open({ t: 'commission', cardId, port: portId, deviceId: r.deviceId }) }] }) }}>
        <td><span className="dvx-name"><DvIcon kind="item" /><span>{r.deviceId}</span></span></td><td>{r.state}</td><td>{r.address}</td></tr>)}
      {!rows.length && <tr><td colSpan={3} className="dvx-empty">No decommissioned fieldbus devices found on {portId}. Download the card and rescan the port in Diagnostics.</td></tr>}
    </tbody></table>)
  }
  if (kind === 'device') {
    const found = findFfDevice(hardware, arg)
    if (!found) return <div className="exp-empty">Device not found.</div>
    return wrap(<table className="dvx-details" role="grid"><thead><tr><th>Name</th><th>Type</th></tr></thead><tbody>
      {found.device.blocks.map(b => <tr key={b.tag}><td><span className="dvx-name"><DvIcon kind="item" /><span>{b.tag}</span></span></td><td>{b.type} block ({b.mode})</td></tr>)}
      <tr><td><span className="dvx-name"><DvIcon kind="item" /><span>Fieldbus Device Alarms</span></span></td><td>Fieldbus Device Alarms</td></tr>
    </tbody></table>)
  }
  if (kind === 'dd') {
    const manufacturer = arg
    const entries = FF_CATALOG.filter(e => !manufacturer || manufacturer === 'ALL' || e.manufacturer === manufacturer)
    return wrap(<table className="dvx-details" role="grid"><thead><tr><th>Name</th><th>Type</th><th>Revisions</th></tr></thead><tbody>
      {manufacturer === 'ALL' || !manufacturer
        ? [...new Set(FF_CATALOG.map(e => e.manufacturer)), 'Unknown Manufacturer'].map(m => <tr key={m}><td><span className="dvx-name"><DvIcon kind="folder" /><span>{m}</span></span></td><td>Manufacturer</td><td /></tr>)
        : entries.map(e => <tr key={e.id}><td><span className="dvx-name"><DvIcon kind="item" /><span>{e.model}</span></span></td><td>Fieldbus device ({e.deviceType.toLowerCase()})</td><td>{e.revisions.map(r => `Rev ${r} / DD ${e.ddRevisions[Math.min(e.ddRevisions.length - 1, r - 1)]}`).join(', ')}</td></tr>)}
      {manufacturer === 'Unknown Manufacturer' && <tr><td colSpan={3} className="dvx-empty">Unknown Manufacturer is provided for the import of fieldbus devices that are not in the list of tested manufacturers.</td></tr>}
    </tbody></table>)
  }
  return <div className="exp-empty">Nothing to show.</div>
}

/** Library > Device Definitions (p12-6): Fieldbus Devices appears once the Fieldbus system preference is enabled. */
export function DeviceDefinitionRows({ depth, selection, onSelect }: { depth: number; selection: LibrarySelection | null; onSelect: (s: LibrarySelection) => void }): JSX.Element {
  const fieldbus = useSystem(s => s.features.fieldbus)
  const [open, setOpen] = useState<Record<string, boolean>>({ defs: true })
  const toggle = (k: string): void => setOpen(o => ({ ...o, [k]: !o[k] }))
  const isSel = (id: string): boolean => selection?.kind === 'fieldbus' && selection.id === id
  const manufacturers = [...new Set(FF_CATALOG.map(e => e.manufacturer)), 'Unknown Manufacturer']
  return <TreeRow depth={depth} open={!!open.defs} onToggle={() => toggle('defs')} icon={<DvIcon kind="folder" />} label={<span>Device Definitions</span>} dataAttr={{ 'data-device-definitions': '' }}>
    {fieldbus && <TreeRow depth={depth + 1} open={!!open.fb} onToggle={() => toggle('fb')} icon={<DvIcon kind="folder" />} selected={isSel('dd:ALL')} label={<span>Fieldbus Devices</span>}
      dataAttr={{ 'data-fieldbus-devices': '' }} onClick={() => onSelect({ kind: 'fieldbus', id: 'dd:ALL', label: 'Fieldbus Devices' })}>
      {manufacturers.map(m => <TreeRow key={m} depth={depth + 2} icon={<DvIcon kind="folder" />} selected={isSel(`dd:${m}`)} label={<span>{m}</span>}
        onClick={() => onSelect({ kind: 'fieldbus', id: `dd:${m}`, label: m })} />)}
    </TreeRow>}
    <TreeRow depth={depth + 1} icon={<DvIcon kind="folder" />} label={<span>HART Devices</span>} sub="HART device definitions are not modeled" />
  </TreeRow>
}
