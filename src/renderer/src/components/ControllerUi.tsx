import { useState } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'
import { ControllerLedStrip } from './ControllerIndicators'
import { useStore } from '../engine/store'
import { commissionPropertiesErrors, defaultCommissionProperties, type CommissionProperties } from '../engine/commissioning'
import { COLD_RESTART_MODE_LABEL, coldRestartFromSelectors, coldRestartMode, splitColdRestart, RECOMMENDED_MIN_MINUTES, type ColdRestartMode, type ColdRestartParts } from '../engine/coldRestart'
import { MAX_CONTROLLER_DESCRIPTION_LENGTH } from '../engine/hardware'
import { downloadControllerTotal, downloadItems, verifyControllerConfig, type DownloadItem, type VerifyResult } from '../engine/controllerConfig'

// Course DV-09 chapter 1 in DeltaV Explorer: a decommissioned node's Properties (Flash lights, p1-54/55), dragging it onto the
// Control Network opens the commissioning Properties (pp 1-57 .. 1-60) followed by the Auto-Sense I/O prompt (p1-61), and a
// controller's Properties > Controller tab holds Cold Restart (pp 1-62 .. 1-64).

export type CtlDialog = { t: 'props'; tag: string } | { t: 'commission'; tag: string } | { t: 'sense'; tag: string }
  | { t: 'channel'; cardId: string; channel: number } | { t: 'download'; tag: string } | null
export const useCtlUi = create<{ dlg: CtlDialog; open: (d: NonNullable<CtlDialog>) => void; close: () => void }>(set => ({ dlg: null, open: dlg => set({ dlg }), close: () => set({ dlg: null }) }))

const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)

function PropertiesDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element | null {
  const c = useStore(s => s.hardware.controllers[tag])
  const area = useStore(s => s.hardware.controllerAreas?.[tag])
  const identify = useStore(s => s.identifyController)
  const configure = useStore(s => s.setControllerConfiguration)
  const [tab, setTab] = useState('General')
  const [mode, setMode] = useState<ColdRestartMode>(coldRestartMode(c?.coldRestartMinutes ?? 0))
  const [parts, setParts] = useState<ColdRestartParts>(splitColdRestart(c?.coldRestartMinutes ?? 0))
  const [error, setError] = useState<string | null>(null)
  if (!c) return null
  const parsed = coldRestartFromSelectors(mode, parts)
  const close = (): void => { if (c.identified) identify(tag, false); onClose() }
  const submit = (): void => {
    if ('error' in parsed) { setError(parsed.error); return }
    if (parsed.minutes !== c.coldRestartMinutes && !configure(tag, { coldRestartMinutes: parsed.minutes })) { setError('Cold Restart was not changed. Check the controller state and your Can Configure key.'); return }
    onClose()
  }
  const num = (key: keyof ColdRestartParts, label: string, max: number): JSX.Element =>
    <label>{label}:<input aria-label={label} type="number" min={0} max={max} disabled={mode !== 'WITHIN_LIMIT'} value={Number.isNaN(parts[key]) ? '' : parts[key]}
      onChange={e => setParts({ ...parts, [key]: e.target.value === '' ? Number.NaN : Number(e.target.value) })} /></label>
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${tag} Properties`} onClose={close}>
    <div className="dvd-tabs" role="tablist">{['General', 'Controller'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="lib-dlg-fields dvd-panel">
      {tab === 'General' && <>
        <p data-ctl-state={c.commissioned ? 'commissioned' : 'decommissioned'}><b>{c.commissioned ? 'Commissioned' : 'Decommissioned'}</b> controller {tag}{c.description ? ` - ${c.description}` : ''}</p>
        <p className="exp-hint">{c.commissioned ? `Control network address ${c.controlNetworkAddress ?? '-'}${area ? `, alarms and events associated with ${area}` : ''}.` : 'A decommissioned controller is a non-active member of the Control Network. Drag it onto the Control Network to commission it.'}</p>
        <ControllerLedStrip controller={c} />
        <div className="dvd-buttons">
          <button className="tbtn sm" disabled={c.identified || c.powerDownAt !== null} onClick={() => { if (!identify(tag, true)) setError('Identify could not be started. Verify the controller state and the Diagnostic key.'); else setError(null) }}>Flash lights</button>
          <button className="tbtn sm" disabled={!c.identified} onClick={() => identify(tag, false)}>Stop Flashing</button>
        </div>
      </>}
      {tab === 'Controller' && <>
        <fieldset className="lib-dlg-props"><legend>Cold Restart</legend>
          {(['DISABLED', 'ALWAYS_ENABLED', 'WITHIN_LIMIT'] as ColdRestartMode[]).map(m => <label key={m} className="lib-dlg-check">
            <input type="radio" name="cold-restart" aria-label={COLD_RESTART_MODE_LABEL[m]} checked={mode === m} onChange={() => { setMode(m); setError(null) }} /> {COLD_RESTART_MODE_LABEL[m]}</label>)}
          <div className="dvd-inline">{num('days', 'Days', 30)}{num('hours', 'Hours', 23)}{num('minutes', 'Minutes', 59)}</div>
          {'minutes' in parsed && mode === 'WITHIN_LIMIT' && parsed.minutes > 0 && parsed.minutes < RECOMMENDED_MIN_MINUTES && <p className="exp-hint">The manual recommends a cold restart time of at least two minutes.</p>}
        </fieldset>
        <p className="exp-hint">If power returns within this time the controller restarts itself from its non-volatile memory; a time of 0 is Always Disabled.</p>
      </>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={close}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

function CommissionDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element | null {
  const hardware = useStore(s => s.hardware)
  const areas = useStore(s => s.areas)
  const commission = useStore(s => s.commissionControllerWithProperties)
  const open = useCtlUi(s => s.open)
  const c = hardware.controllers[tag]
  const [props, setProps] = useState<CommissionProperties | null>(c ? defaultCommissionProperties(c, hardware.controllerAreas?.[tag] ?? null) : null)
  const [error, setError] = useState<string | null>(null)
  if (!c || !props) return null
  const errors = commissionPropertiesErrors(props, { otherControllers: Object.keys(hardware.controllers).filter(t => t !== tag), areas, simplexOnly: !!c.simplexOnly })
  const update = (patch: Partial<CommissionProperties>): void => setProps(p => (p ? { ...p, ...patch } : p))
  const submit = (): void => {
    const result = commission(tag, props, null)
    if (result) { setError(result); return }
    open({ t: 'sense', tag: props.name.trim() })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`Commission ${tag}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Name:<input aria-label="Controller name" maxLength={16} value={props.name} onChange={e => update({ name: e.target.value })} /></label>
      <label>Description:<input aria-label="Controller description" maxLength={MAX_CONTROLLER_DESCRIPTION_LENGTH} value={props.description} onChange={e => update({ description: e.target.value })} /></label>
      <label>Associate Alarms &amp; Events with Area:<select aria-label="Associate alarms and events with area" value={props.area ?? ''} onChange={e => update({ area: e.target.value || null })}>
        <option value="">(none)</option>{areas.map(a => <option key={a}>{a}</option>)}</select></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable System Hardware Alarms" checked={props.hardwareAlarms} onChange={e => update({ hardwareAlarms: e.target.checked })} /> Enable System Hardware Alarms</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable network redundancy for this node" checked={props.networkRedundant} onChange={e => update({ networkRedundant: e.target.checked })} /> Enable network redundancy for this node</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Show integrity error when not in time sync" checked={props.timeSyncIntegrity} onChange={e => update({ timeSyncIntegrity: e.target.checked })} /> Show integrity error when not in time sync</label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Node is redundant" disabled={!!c.simplexOnly} checked={props.redundant && !c.simplexOnly} onChange={e => update({ redundant: e.target.checked })} /> Node is redundant{c.simplexOnly ? ' (simplex controller)' : ''}</label>
      {errors.length > 0 && <ul role="alert" className="lib-dlg-error">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={errors.length > 0} onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

const CHANNEL_TYPE: Record<string, string> = { AI: 'Analog Input', AO: 'Analog Output', DI: 'Discrete Input', DO: 'Discrete Output' }
export const channelName = (n: number): string => `CH${String(n).padStart(2, '0')}`

/** CTLR > I/O > Card > Channel > Properties (p2-90): Description, Channel type, Device Tag and the Enable box. */
function ChannelDialog({ cardId, channel, onClose }: { cardId: string; channel: number; onClose: () => void }): JSX.Element | null {
  const card = useStore(s => s.hardware.traditionalCards?.[cardId])
  const configure = useStore(s => s.configureTraditionalChannel)
  const ch = card?.channels.find(c => c.channel === channel)
  const [description, setDescription] = useState(ch?.description ?? '')
  const [dst, setDst] = useState(ch?.dst ?? '')
  const [enabled, setEnabled] = useState(ch?.enabled ?? false)
  const [error, setError] = useState<string | null>(null)
  if (!card || !ch) return null
  const type = CHANNEL_TYPE[card.type]
  const submit = (): void => {
    if (enabled && !dst.trim()) { setError('An enabled channel requires a Device Tag'); return }
    if (!configure(cardId, channel, { dst, enabled, description, tiebackDst: ch.tiebackDst })) { setError('The channel was not changed (see the message above or the Event Journal).'); return }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${cardId.split('/').pop()} ${channelName(channel)} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Description:<input aria-label="Channel description" maxLength={255} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Channel type:<select aria-label="Channel type" value={type} onChange={() => undefined}><option>{type}</option></select></label>
      <label>Device Tag:<input aria-label="Device Tag" maxLength={16} value={dst} onChange={e => setDst(e.target.value)} /></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Enable" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable</label>
      <p className="exp-hint">The Device Signal Tag (DST) attaches this I/O channel to a control module. Name it like the instrument and check Enable to activate the channel.</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} />
  </SimulatorDialog>
}

/** CTLR > Download > Controller (pp 2-99 .. 2-103): download options, verify, the cautionary note, then the progress list. */
function DownloadDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element | null {
  const controller = useStore(s => s.hardware.controllers[tag])
  const [step, setStep] = useState<'options' | 'verify' | 'caution' | 'done'>('options')
  const [verify, setVerify] = useState(true)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [items, setItems] = useState<DownloadItem[]>([])
  const [error, setError] = useState<string | null>(null)
  if (!controller) return null
  const planned = downloadItems(tag)
  const toCaution = (): void => setStep('caution')
  const ok = (): void => { if (verify) { setResult(verifyControllerConfig(tag)); setStep('verify') } else toCaution() }
  const run = (): void => {
    const r = downloadControllerTotal(tag)
    if (!r.ok) { setError(r.error); return }
    setItems(r.items); setStep('done')
  }
  return <SimulatorDialog className="module-download-dialog lib-download-dialog dvd" label={`Download Controller ${tag}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      {step === 'options' && <>
        <p>Total/Full download of controller <b>{tag}</b>: the entire configuration of the node is sent from the ProfessionalPLUS configuration database. Control parameters go to their configured default values.</p>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Verify the configuration download options" checked={verify} onChange={e => setVerify(e.target.checked)} /> Verify the configuration before downloading (checks for unresolved references and other problems)</label>
        <ul aria-label="Objects to download">{planned.filter(i => i.needed).map(i => <li key={i.label}>{i.label}</li>)}</ul>
      </>}
      {step === 'verify' && result && <>
        <p><b>Verify results:</b> {result.cards} I/O card(s), {result.dsts} DST(s) checked.</p>
        {result.problems.length ? <ul role="alert" className="lib-dlg-error">{result.problems.map(p => <li key={p}>{p}</li>)}</ul> : <p role="status">No unresolved references or configuration problems were found.</p>}
        {result.problems.length > 0 && <p className="exp-hint">Resolve the problems before continuing, or continue to download anyway.</p>}
      </>}
      {step === 'caution' && <p role="alert"><b>Caution:</b> downloading replaces the configuration in controller {tag}. It may not be desirable to perform a Total/Full download on a running process. Do you want to continue?</p>}
      {step === 'done' && <>
        <p role="status" data-download-done>Downloading Selected Objects: download of {tag} completed, 0 Error(s).</p>
        <ul aria-label="Downloading Selected Objects">{items.map(i => <li key={i.label} style={i.needed ? undefined : { opacity: 0.45 }}>{i.needed ? '✓ ' : '▒ '}{i.label}</li>)}</ul>
        <p className="exp-hint">The blue triangle is removed from {tag} once the download is complete. Log file: C:\DeltaV\DVData\DownLoadProgress.log</p>
      </>}
    </div>
    <div className="dvd-buttons">
      {step === 'options' && <><button className="tbtn sm" onClick={ok}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></>}
      {step === 'verify' && <><button className="tbtn sm" onClick={toCaution}>Continue</button><button className="tbtn sm" onClick={onClose}>Cancel</button></>}
      {step === 'caution' && <><button className="tbtn sm" onClick={run}>Yes</button><button className="tbtn sm" onClick={onClose}>No</button></>}
      {step === 'done' && <button className="tbtn sm" onClick={onClose}>Close</button>}
    </div><Err error={error} />
  </SimulatorDialog>
}

function SenseDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element {
  const autoSense = useStore(s => s.autoSenseController)
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvd" label="Auto-Sense I/O Cards" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>{tag} is commissioned. Auto-sense the I/O cards now?</p>
      <p className="exp-hint">Yes scans the controller's I/O subsystem for the installed card types and carrier slots. No commissions without scanning; auto-sense can be run at any time from DeltaV Explorer.</p>
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { if (autoSense(tag)) onClose(); else setError('Auto-sense could not run. Check the controller and the Diagnostic key.') }}>Yes</button>
      <button className="tbtn sm" onClick={onClose}>No</button></div><Err error={error} />
  </SimulatorDialog>
}

/** The Identify pop-up (p1-55): a window of its own on top of the Properties window; closing it ends the Identify state. */
function IdentifyPopup({ tag }: { tag: string }): JSX.Element | null {
  const c = useStore(s => s.hardware.controllers[tag])
  const identify = useStore(s => s.identifyController)
  if (!c || !c.identified) return null
  const stop = (): void => { identify(tag, false) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Identify ${tag}`} onClose={stop}>
    <div className="lib-dlg-fields dvd-panel">
      <p>The controller indicators are flashing so you can locate it on the network.</p>
      <ControllerLedStrip controller={c} />
      <p className="exp-hint">Power LED on; all other LEDs flash at one-second intervals. Closing this window or choosing Stop Flashing ends the Identify state.</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={stop}>Stop Flashing</button></div>
  </SimulatorDialog>
}

export function ControllerDialogHost(): JSX.Element | null {
  const dlg = useCtlUi(s => s.dlg)
  const close = useCtlUi(s => s.close)
  const controllers = useStore(s => s.hardware.controllers)
  const identified = Object.values(controllers).filter(c => c.identified).map(c => c.tag)
  return <>
    {dlg?.t === 'props' && <PropertiesDialog key={dlg.tag} tag={dlg.tag} onClose={close} />}
    {dlg?.t === 'commission' && <CommissionDialog key={dlg.tag} tag={dlg.tag} onClose={close} />}
    {dlg?.t === 'sense' && <SenseDialog key={dlg.tag} tag={dlg.tag} onClose={close} />}
    {dlg?.t === 'channel' && <ChannelDialog key={`${dlg.cardId}/${dlg.channel}`} cardId={dlg.cardId} channel={dlg.channel} onClose={close} />}
    {dlg?.t === 'download' && <DownloadDialog key={dlg.tag} tag={dlg.tag} onClose={close} />}
    {identified.map(tag => <IdentifyPopup key={tag} tag={tag} />)}
  </>
}
