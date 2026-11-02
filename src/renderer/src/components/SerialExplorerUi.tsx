import { useState } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'
import { useStore } from '../engine/store'
import {
  PLC_TABLE_LABEL, SERIAL_BAUD_RATES, SERIAL_DATA_TYPE_LABEL, SERIAL_LIMITS, SERIAL_PORT_IDS, modbusAddress,
  type PlcTable, type SerialCard, type SerialDataType, type SerialDatasetConfig, type SerialParity, type SerialPortConfig, type SerialPortId
} from '../engine/serialIo'

// Course DV-09 chapter 9 in DeltaV Explorer: CTLR > I/O > New Card (p9-10), C05 > P01 > Properties with the Port / Advanced /
// Communications tabs (pp 9-11 .. 9-16), P01 > New Serial device (p9-17/18), DEV01 > New Dataset with the General / DeltaV / PLC tabs
// (pp 9-19 .. 9-26) and the card download of the workshop (p9-41).

export type SerialDlg =
  | { t: 'newCard'; controller: string }
  | { t: 'port'; cardId: string; port: SerialPortId }
  | { t: 'device'; cardId: string; port: SerialPortId; device?: string }
  | { t: 'dataset'; cardId: string; port: SerialPortId; device: string; dataset?: string }
  | { t: 'download'; cardId: string }
  | null
export const useSerialUi = create<{ dlg: SerialDlg; open: (d: NonNullable<SerialDlg>) => void; close: () => void }>(set => ({ dlg: null, open: dlg => set({ dlg }), close: () => set({ dlg: null }) }))

const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)
const slotName = (slot: number): string => `C${String(slot).padStart(2, '0')}`

/** The default names the Explorer gives a new serial device (DEV01) and a new dataset (DS01) on a port. */
export const nextDeviceName = (port: SerialPortConfig): string => {
  for (let n = 1; n < 100; n++) { const name = `DEV${String(n).padStart(2, '0')}`; if (!port.devices[name]) return name }
  return 'DEV99'
}
export const nextDatasetName = (port: SerialPortConfig): string => {
  const used = new Set(Object.values(port.devices).flatMap(d => Object.keys(d.datasets)))
  for (let n = 1; n < 100; n++) { const name = `DS${String(n).padStart(2, '0')}`; if (!used.has(name)) return name }
  return 'DS99'
}

function NewCardDialog({ controller, onClose }: { controller: string; onClose: () => void }): JSX.Element {
  const hardware = useStore(s => s.hardware)
  const addCard = useStore(s => s.addSerialCard)
  const taken = new Set([...Object.values(hardware.traditionalCards ?? {}).filter(c => !c.serial && c.controllerTag === controller).map(c => c.slot),
    ...Object.values(hardware.serialCards ?? {}).filter(c => c.controllerTag === controller).map(c => c.slot)])
  const free = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => !taken.has(n))
  const [slot, setSlot] = useState(free.includes(5) ? 5 : free[0] ?? 5)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const e = addCard(controller, slot, true); if (e) setError(e); else onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label="New Card" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Controller:<input aria-label="Controller" value={controller} readOnly /></label>
      <label>Card type:<select aria-label="Card type" value="Serial" onChange={() => undefined}><option>Serial</option></select></label>
      <label>Slot:<select aria-label="Slot" value={slot} onChange={e => setSlot(Number(e.target.value))}>{free.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <p className="exp-hint">A placeholder is configured for the card before the actual card is connected (p9-10). Slot {slot} becomes {slotName(slot)}.</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

const PORT_TYPES: [SerialPortConfig['portType'], string][] = [['RS232', 'RS232'], ['RS422_485_FULL', 'RS422/485 Full Duplex'], ['RS422_485_HALF', 'RS422/485 Half Duplex']]

/** Pn Properties (pp 9-11 .. 9-16): Port, Advanced and Communications tabs. */
function PortDialog({ cardId, port: portId, onClose }: { cardId: string; port: SerialPortId; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.serialCards?.[cardId])
  const configure = useStore(s => s.configureSerialPort)
  const [tab, setTab] = useState('Port')
  const [draft, setDraft] = useState<Omit<SerialPortConfig, 'devices'> | null>(() => {
    const p = card?.configured.ports[portId]
    if (!p) return null
    const { devices: _devices, ...rest } = p
    return rest
  })
  const [error, setError] = useState<string | null>(null)
  if (!card || !draft) return null
  const slave = draft.mode === 'SLAVE'
  const set = (patch: Partial<typeof draft>): void => { setDraft({ ...draft, ...patch }); setError(null) }
  const num = (label: string, key: 'retryCount' | 'timeoutMs' | 'transmitDelayMs', disabled = false): JSX.Element =>
    <label>{label}:<input aria-label={label} type="number" min={0} disabled={disabled} value={Number.isNaN(draft[key]) ? '' : draft[key]}
      onChange={e => set({ [key]: e.target.value === '' ? Number.NaN : Number(e.target.value) })} /></label>
  const submit = (): void => {
    const e = configure(cardId, portId, draft)
    if (e) setError(e); else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${portId} Properties`} onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{['Port', 'Advanced', 'Communications'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'Port' && <>
        <div className="dvd-row"><span className="dvd-k">Object type:</span><span className="dvd-v">Port</span></div>
        <div className="dvd-row"><span className="dvd-k">Card:</span><span className="dvd-v">{slotName(card.slot)} ({card.controllerTag})</span></div>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enabled" checked={draft.enabled} onChange={e => set({ enabled: e.target.checked })} /> Enabled</label>
        <label>Description:<input aria-label="Description" maxLength={255} value={draft.description} onChange={e => set({ description: e.target.value })} /></label>
        <p className="exp-hint">Enabled makes the port scan for input data and transmit outputs.</p>
      </>}
      {tab === 'Advanced' && <>
        <div className="dvd-inline">
          <label>Protocol type:<select aria-label="Protocol type" value={draft.protocol} onChange={e => set({ protocol: e.target.value as SerialPortConfig['protocol'], ...(e.target.value === 'RTU' ? { dataBits: 8 as const } : {}) })}>
            <option value="RTU">RTU</option><option value="ASCII">ASCII</option></select></label>
          <label>Mode:<select aria-label="Mode" value={draft.mode} onChange={e => set({ mode: e.target.value as SerialPortConfig['mode'] })}>
            <option value="MASTER">master</option><option value="SLAVE">slave</option></select></label>
        </div>
        <div className="dvd-inline">{num('Retry count', 'retryCount', slave)}{num('Message timeout (ms)', 'timeoutMs', slave)}{num('Transmit delay (ms)', 'transmitDelayMs')}</div>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Send outputs on startup" checked={draft.sendOutputsOnStartup} onChange={e => set({ sendOutputsOnStartup: e.target.checked })} /> Send outputs on startup</label>
      </>}
      {tab === 'Communications' && <>
        <div className="dvd-inline">
          <label>Port type:<select aria-label="Port type" value={draft.portType} onChange={e => set({ portType: e.target.value as SerialPortConfig['portType'] })}>
            {PORT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Baud rate:<select aria-label="Baud rate" value={draft.baud} onChange={e => set({ baud: Number(e.target.value) })}>
            {SERIAL_BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
          <label>Parity:<select aria-label="Parity" value={draft.parity} onChange={e => set({ parity: e.target.value as SerialParity })}>
            <option value="NONE">none</option><option value="EVEN">even</option><option value="ODD">odd</option></select></label>
        </div>
        <div className="dvd-inline">
          <label>Data bits:<select aria-label="Data bits" value={draft.dataBits} onChange={e => set({ dataBits: Number(e.target.value) as 7 | 8 })}><option value={7}>7</option><option value={8}>8</option></select></label>
          <label>Stop bits:<select aria-label="Stop bits" value={draft.stopBits} onChange={e => set({ stopBits: Number(e.target.value) as 1 | 2 })}><option value={1}>1</option><option value={2}>2</option></select></label>
        </div>
      </>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

/** New Serial device / device Properties (p9-17): Description and Device Address. */
function DeviceDialog({ cardId, port: portId, device, onClose }: { cardId: string; port: SerialPortId; device?: string; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.serialCards?.[cardId])
  const add = useStore(s => s.addSerialDevice)
  const update = useStore(s => s.updateSerialDevice)
  const existing = card?.configured.ports[portId].devices[device ?? '']
  const [description, setDescription] = useState(existing?.description ?? '')
  const [address, setAddress] = useState(existing?.address ?? 1)
  const [error, setError] = useState<string | null>(null)
  if (!card) return null
  const name = device ?? nextDeviceName(card.configured.ports[portId])
  const submit = (): void => {
    const e = device ? update(cardId, portId, device, { description, address }) : add(cardId, portId, name, address, description)
    if (e) setError(e); else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={device ? `${device} Properties` : 'Properties'} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-row"><span className="dvd-k">Object type:</span><span className="dvd-v">Serial I/O Device</span></div>
      <div className="dvd-row"><span className="dvd-k">Name:</span><span className="dvd-v">{name}</span></div>
      <label>Description:<input aria-label="Description" maxLength={255} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Device Address:<select aria-label="Device Address" value={address} onChange={e => setAddress(Number(e.target.value))}>
        {Array.from({ length: SERIAL_LIMITS.maxAddress }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

const TABLES: [PlcTable, string][] = [['COILS', 'coils'], ['INPUT_STATUS', 'input status'], ['INPUT_REGISTERS', 'input registers'], ['HOLDING_REGISTERS', 'holding registers']]
const DATA_TYPES = Object.entries(SERIAL_DATA_TYPE_LABEL) as [SerialDataType, string][]

/** Create dataset / dataset Properties (pp 9-19 .. 9-26): General, DeltaV and PLC tabs. */
function DatasetDialog({ cardId, port: portId, device, dataset, onClose }: { cardId: string; port: SerialPortId; device: string; dataset?: string; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.serialCards?.[cardId])
  const save = useStore(s => s.saveSerialDataset)
  const existing = card?.configured.ports[portId].devices[device]?.datasets[dataset ?? '']
  const [tab, setTab] = useState('General')
  const [d, setD] = useState<SerialDatasetConfig | null>(() => existing ? { ...existing } : card ? {
    name: nextDatasetName(card.configured.ports[portId]), description: '', direction: 'INPUT', outputMode: 'COMPLETE_BLOCK', outputReadback: false,
    dataType: 'BOOLEAN', tag: '', plcTable: 'COILS', plcBase: 0, plcOffset: 0, count: 1
  } : null)
  const [error, setError] = useState<string | null>(null)
  if (!card || !d) return null
  const set = (patch: Partial<SerialDatasetConfig>): void => { setD({ ...d, ...patch }); setError(null) }
  const out = d.direction === 'OUTPUT'
  const submit = (): void => {
    const e = save(cardId, portId, device, d, existing ? dataset : undefined)
    if (e) setError(e); else onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={existing ? `${d.name} Properties` : 'Create dataset'} onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{['General', 'DeltaV', 'PLC'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <div className="dvd-row"><span className="dvd-k">Object type:</span><span className="dvd-v">Dataset</span></div>
        <div className="dvd-row"><span className="dvd-k">Name:</span><span className="dvd-v">{d.name}</span></div>
        <label>Description:<input aria-label="Description" maxLength={255} value={d.description} onChange={e => set({ description: e.target.value })} /></label>
        <div className="dvd-inline">
          <label>Data direction:<select aria-label="Data direction" value={d.direction} onChange={e => set({ direction: e.target.value as SerialDatasetConfig['direction'] })}>
            <option value="INPUT">input</option><option value="OUTPUT">output</option></select></label>
          <label>Output mode:<select aria-label="Output mode" disabled={!out} value={d.outputMode} onChange={e => set({ outputMode: e.target.value as SerialDatasetConfig['outputMode'] })}>
            <option value="COMPLETE_BLOCK">complete block</option><option value="SINGLE_VALUE">single value</option></select></label>
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Output read back?" disabled={!out} checked={out && d.outputReadback} onChange={e => set({ outputReadback: e.target.checked })} /> Output read back?</label>
        </div>
      </>}
      {tab === 'DeltaV' && <>
        <label>DeltaV data type:<select aria-label="DeltaV data type" value={d.dataType} onChange={e => set({ dataType: e.target.value as SerialDataType })}>
          {DATA_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Dataset Tag:<input aria-label="Dataset Tag" maxLength={16} value={d.tag} onChange={e => set({ tag: e.target.value.toUpperCase() })} /></label>
        <p className="exp-hint">The dataset tag names the parameters of the dataset: COILS/R17 is a parameter that a Discrete Output or Device Control block can use as IO_OUT (p9-24).</p>
      </>}
      {tab === 'PLC' && <>
        <div className="dvd-inline">
          <label>PLC data type:<select aria-label="PLC data type" value={d.plcTable} onChange={e => set({ plcTable: e.target.value as PlcTable })}>
            {TABLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>PLC base register address:<input aria-label="PLC base register address" readOnly value={d.plcBase + 1} /></label>
        </div>
        <div className="dvd-inline">
          <label>PLC register offset:<input aria-label="PLC register offset" type="number" min={0} value={Number.isNaN(d.plcOffset) ? '' : d.plcOffset}
            onChange={e => set({ plcOffset: e.target.value === '' ? Number.NaN : Number(e.target.value) })} /></label>
          <label>Number of values:<input aria-label="Number of values" type="number" min={1} max={SERIAL_LIMITS.valuesPerDataset} value={Number.isNaN(d.count) ? '' : d.count}
            onChange={e => set({ count: e.target.value === '' ? Number.NaN : Number(e.target.value) })} /></label>
        </div>
        {Number.isFinite(d.plcOffset) && <p className="exp-hint">First value: {PLC_TABLE_LABEL[d.plcTable]} {String(modbusAddress(d)).padStart(5, '0')}.</p>}
      </>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

/** Download the serial card (step 10, p9-41). */
function CardDownloadDialog({ cardId, onClose }: { cardId: string; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.serialCards?.[cardId])
  const download = useStore(s => s.downloadSerialCard)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!card) return null
  const run = (): void => { const e = download(cardId); if (e) setError(e); else setDone(true) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Download Serial Card ${slotName(card.slot)}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      {done ? <p role="status" data-download-done>Download of {slotName(card.slot)} on {card.controllerTag} completed, 0 Error(s). The ports and datasets are active.</p>
        : <p>Download the serial card {slotName(card.slot)} to controller {card.controllerTag}? Port properties, serial devices and datasets take effect only after the download.</p>}
    </div>
    <div className="dvd-buttons">{done ? <button className="tbtn sm" onClick={onClose}>Close</button> : <><button className="tbtn sm" onClick={run}>Yes</button><button className="tbtn sm" onClick={onClose}>No</button></>}</div>
    <Err error={error} />
  </SimulatorDialog>
}

export function SerialDialogHost(): JSX.Element | null {
  const dlg = useSerialUi(s => s.dlg)
  const close = useSerialUi(s => s.close)
  if (!dlg) return null
  return <>
    {dlg.t === 'newCard' && <NewCardDialog key={dlg.controller} controller={dlg.controller} onClose={close} />}
    {dlg.t === 'port' && <PortDialog key={`${dlg.cardId}/${dlg.port}`} cardId={dlg.cardId} port={dlg.port} onClose={close} />}
    {dlg.t === 'device' && <DeviceDialog key={`${dlg.cardId}/${dlg.port}/${dlg.device ?? '+'}`} cardId={dlg.cardId} port={dlg.port} device={dlg.device} onClose={close} />}
    {dlg.t === 'dataset' && <DatasetDialog key={`${dlg.cardId}/${dlg.port}/${dlg.device}/${dlg.dataset ?? '+'}`} cardId={dlg.cardId} port={dlg.port} device={dlg.device} dataset={dlg.dataset} onClose={close} />}
    {dlg.t === 'download' && <CardDownloadDialog key={dlg.cardId} cardId={dlg.cardId} onClose={close} />}
  </>
}

/** The Explorer rows below a serial card: the card, its two ports, devices and datasets. */
export function serialCardsOf(cards: Record<string, SerialCard> | undefined, controller: string): SerialCard[] {
  return Object.values(cards ?? {}).filter(c => c.controllerTag === controller).sort((a, b) => a.slot - b.slot)
}
export { SERIAL_PORT_IDS, slotName }
