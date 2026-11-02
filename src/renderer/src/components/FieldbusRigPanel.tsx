import { useEffect, useState } from 'react'
import { useStore } from '../engine/store'
import {
  CHECKOUT_PAIRS, INPUT_SETUP_OPTIONS, JB_PORTS, POINT_LABEL, RIG_END_DEFS, RIG_TERMINAL_LABEL, SCOPE_COUPLING_OPTIONS, TEST_POINTS, defaultRig, evalRig, meterRangeLabel, meterReading,
  TIME_DIV_US, VOLT_DIV_MV, type MeterButton, type RigEnd, type TestPoint
} from '../engine/fieldbusRigModel'
import { checkoutRecordings, rigHubTerminator, rigMeterPress, rigPlug, rigRecord, rigReset, rigSetLead, rigClearMeasurements } from '../engine/fieldbusRig'
import '../dv09-chapters.css'

// Course DV-09 chapter 12 (pp 12-15 .. 12-17): Workshop - Wire Fieldbus Segment on the training simulator, and (pp 12-36 .. 12-53) the segment
// checkout with the Fluke 123 test tool. A lesson model: the readings follow the wiring state but certify no real installation.

const FIELD_JB: Record<string, string> = { 'jb-P1': 'P1', 'jb-S0': 'S0', 'jb-S1': 'S1', 'jb-S2': 'S2', 'jb-S3': 'S3', 'jb-S4': 'S4', 'jb-S5': 'S5', 'jb-S6': 'S6' }

function Led({ on, color, label }: { on: boolean; color: 'green' | 'red' | 'amber'; label: string }): JSX.Element {
  return <span className={`led led-${on ? color : 'off'}`} title={`${label}: ${on ? 'on' : 'off'}`} style={{ marginRight: 10 }}>● {label}</span>
}

function Meter({ now }: { now: number }): JSX.Element {
  const rig = useStore(s => s.hardware.fieldbusRig) ?? defaultRig()
  const m = rig.meter
  const [error, setError] = useState<string | null>(null)
  const press = (b: MeterButton): void => { setError(null); rigMeterPress(b) }
  const reading = meterReading(m, rig, m.mode === 'scope' && m.heldAt !== null ? m.heldAt : now)
  const btn = (b: MeterButton, label: string, aria?: string): JSX.Element => <button className="tbtn sm" aria-label={aria ?? label} onClick={() => press(b)}>{label}</button>
  const lead = (which: 'a' | 'com', label: string, value: TestPoint | null): JSX.Element => <label>{label}{' '}
    <select aria-label={label} value={value ?? ''} onChange={e => { setError(null); rigSetLead(which, (e.target.value || null) as TestPoint | null) }}>
      <option value="">(not connected)</option>{TEST_POINTS.map(p => <option key={p} value={p}>{POINT_LABEL[p]}</option>)}</select></label>
  return <div className="fluke" data-fluke aria-label="Fluke 123 Scope Meter">
    <div className="fluke-title">FLUKE 123 Industrial ScopeMeter</div>
    <div className="fluke-screen" data-fluke-screen={m.screen} role="status">
      {!m.on && <span className="fluke-off">(off)</span>}
      {m.on && m.screen === 'inputSetup' && <div><div>Input A</div>{INPUT_SETUP_OPTIONS.map((o, i) => <div key={o.id} className={i === m.cursor ? 'sel' : ''}>{o.label}</div>)}</div>}
      {m.on && m.screen === 'scopeMenu' && <div><div>Scope input A {m.stage > 0 ? '(coupling selected)' : ''}</div>
        {SCOPE_COUPLING_OPTIONS.map((o, i) => <div key={o} className={i === m.cursor && m.stage === 0 ? 'sel' : ''}>{o}</div>)}
        <div>{m.stage === 0 ? 'Select with the arrows, then F4' : m.stage === 1 ? 'Polarity: normal (F4)' : 'F4 to continue'}</div></div>}
      {m.on && m.screen === 'main' && <div>
        <div data-fluke-mode>{m.mode === 'scope' ? `Scope · Input A ${m.coupling}` : INPUT_SETUP_OPTIONS.find(o => o.id === m.mode)?.label}</div>
        <div data-fluke-range>{meterRangeLabel(m)}{m.mode === 'scope' ? ` · ${TIME_DIV_US[m.timeIndex]} µs/div${m.hold ? ' · HOLD' : ''}` : ''}</div>
        <div className="fluke-reading" data-fluke-reading>{reading.display} {reading.unit === 'Ω' || reading.unit === 'F' || reading.unit === 'V' ? reading.unit : ''}</div>
      </div>}
    </div>
    <div className="fluke-buttons">
      {btn('power', 'Power On/Off')}{btn('inputA', 'Input A Setup')}{btn('scopeMenu', 'Scope Menu')}{btn('F4', 'F4 (Enter)', 'F4')}
      {btn('up', '▲', 'Arrow Up')}{btn('down', '▼', 'Arrow Down')}{btn('left', '◄', 'Arrow Left')}{btn('right', '►', 'Arrow Right')}
      {btn('mV', 'mV', 'mV - V: mV')}{btn('V', 'V', 'mV - V: V')}{btn('timeDown', 'Time ◄', 'Time faster')}{btn('timeUp', 'Time ►', 'Time slower')}{btn('hold', 'HOLD')}
    </div>
    <div className="traditional-toolbar">
      {lead('a', 'Input A lead', m.leadA)}{lead('com', 'COM lead', m.leadCom)}
      <button className="tbtn sm" onClick={() => { const r = rigRecord(now); setError(typeof r === 'string' ? r : null) }}>Record reading in the checkout form</button>
    </div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    <p className="exp-hint" style={{ margin: 0 }}>Resistance: Input A Setup, ohm, F4, 500K with mV - V. Capacitance: Input A Setup, Cap, F4, 5 µF. DC voltage: Input A Setup, Vdc, F4, 20V/d. AC waveform: Scope Menu, AC, F4 (normal), F4 twice, 200 mV/div (mV - V), 10 µs (Time), HOLD. Range steps: {VOLT_DIV_MV.length} volts/div, {TIME_DIV_US.length} time/div.</p>
  </div>
}

export function FieldbusRigPanel(): JSX.Element {
  const rig = useStore(s => s.hardware.fieldbusRig) ?? defaultRig()
  const hw = useStore(s => s.hardware)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const ev = evalRig(rig)
  const ohm = checkoutRecordings(rig, 'ohm')
  const cap = checkoutRecordings(rig, 'cap')
  const lastV = [...rig.measurements].reverse().find(x => x.mode === 'vdc' && !x.isolated && x.value !== null && x.value >= 28 && x.value <= 30)
  const lastAc = [...rig.measurements].reverse().find(x => x.mode === 'scope' && !x.isolated && x.held && x.value !== null && x.value >= 500 && x.value <= 900)
  const card = Object.values(hw.h1Cards ?? {}).find(c => c.slot === 5)
  const port = card ? card.ports[ev.hostPort ?? 'P01'] : undefined
  const yellow = !!card && !!port?.enabled && card.downloaded
  const select = (end: RigEnd, current: string | null, allowed: string[]): JSX.Element => <select aria-label={RIG_END_DEFS.find(d => d.id === end)!.label} value={current ?? ''}
    onChange={e => { setError(rigPlug(end, e.target.value || null)); setNow(Date.now()) }}>
    <option value="">(not connected)</option>
    {allowed.map(t => <option key={t} value={t}>{RIG_TERMINAL_LABEL[t] ?? FIELD_JB[t] ?? t}</option>)}
  </select>
  return <section className="serial-io fb-rig" aria-label="Fieldbus training segment" data-fieldbus-rig>
    <div className="batch-panel-head">Fieldbus Segment — training simulator (Workshop – Wire Fieldbus Segment)</div>
    <p className="traditional-note">
      Series 2 H1 interface (terminals 1-8), Ground Bar, 24 VDC power supply, P&amp;F Mother Board, Quick Disconnect Junction Box (P1, S0-S6) and the 3144P temperature transmitter.
      Step 1: connect the 24VDC power supply plug to the P&amp;F Power Supply connection on the Mother Board (blue is negative, brown is positive). Step 2: connect the Host cable to H1 terminals 3(+) and 4(-).
      Step 3: P&amp;F trunk cable to Quick Disconnect Junction Box P1. Step 4: Junction Box S2 to the 3144P. Step 5: plug the Fieldbus terminator into S0. Step 6: plug the Fieldbus power supply into the power strip.
      A lesson model of the bench; it does not certify any real installation.
    </p>
    <table className="exp-table" aria-label="Segment connections"><thead><tr><th>Connection</th><th>Plugged into</th><th>Where the manual connects it</th></tr></thead><tbody>
      {RIG_END_DEFS.map(d => <tr key={d.id} data-rig-end={d.id}><td>{d.label}</td><td>{select(d.id, rig.plugs[d.id], d.allowed)}</td><td className="exp-hint">{d.note}</td></tr>)}
    </tbody></table>
    <div className="traditional-toolbar">
      <label><input type="checkbox" aria-label="Power hub terminator switch" checked={rig.hubTerminator} onChange={e => { rigHubTerminator(e.target.checked); setError(null) }} /> P&amp;F power hub terminator switch ON</label>
      <button className="tbtn sm" onClick={() => { rigReset(); setError(null) }}>Reset bench</button>
    </div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    <div data-rig-status>
      <Led on={ev.powered} color="green" label="DC OK" />
      <Led on={ev.hostPort !== null} color="green" label={`Host on ${ev.hostPort ?? 'no port'}`} />
      <Led on={ev.reversedSupply} color="red" label="Supply polarity reversed" />
      <Led on={ev.transmitterOnBus} color="green" label="3144P on the segment" />
      <Led on={yellow && ev.transmitterOnBus} color="amber" label="H1 port LED" />
      <span> Terminators: {ev.totalTerminators} (hub {rig.hubTerminator ? 1 : 0} + field {ev.fieldTerminators})</span>
      {ev.hostProblem && <p className="exp-hint" style={{ margin: 0 }}>{ev.hostProblem}</p>}
    </div>
    <div className="batch-panel-head">Segment Checkout — Fluke 123 (pp 12-36 .. 12-53)</div>
    <p className="traditional-note">Before the resistance and capacitance checks remove the segment cable (+, - and shield) from the Mother Board connector; reconnect it for the voltage and waveform checks. Do not touch the meter leads with bare hands.</p>
    <Meter now={now} />
    <button className="tbtn sm" onClick={() => setNow(Date.now())}>Refresh reading</button>
    <table className="exp-table" aria-label="Segment checkout form" data-checkout-form><thead><tr><th>Measure</th><th>Expected result</th><th>Resistance (500K)</th><th>Capacitance (5 µF)</th></tr></thead><tbody>
      {CHECKOUT_PAIRS.map(p => <tr key={p.key} data-checkout-row={p.key}><td>{p.label}</td><td>{p.key === 'pm' ? 'R: > 50 K ohms (increasing); C: 1 µF (0.80 to 1.20 µF)' : p.key === 'sg' || p.key === 'pg' || p.key === 'mg' ? 'R: open circuit > 20 MΩ; C: < 300 nF' : 'R: open circuit > 20 MΩ; C: < 300 nF'}</td>
        <td>{ohm[p.key]?.display ?? '—'}</td><td>{cap[p.key]?.display ?? '—'}</td></tr>)}
      <tr data-checkout-row="term"><td>Termination: power supply and device connection block terminators (2 per segment)</td><td>2 terminators total per segment</td><td colSpan={2}>{ev.totalTerminators} terminator(s) — {ev.totalTerminators === 2 ? 'OK' : 'not 2'}</td></tr>
      <tr data-checkout-row="vdc"><td>DC voltage at the power supply terminals</td><td>P+F Fieldbus Power Hub 28-30 VDC</td><td colSpan={2}>{lastV?.display ?? '—'}</td></tr>
      <tr data-checkout-row="ac"><td>AC waveform (200 mV/div, 10 µs/div, HOLD)</td><td>500 mV and 900 mV peak</td><td colSpan={2}>{lastAc?.display ?? '—'}</td></tr>
    </tbody></table>
    <div className="traditional-toolbar"><button className="tbtn sm" onClick={() => { rigClearMeasurements(); setError(null) }}>Clear the form</button>
      <span className="exp-hint">Junction box ports: {JB_PORTS.map(p => FIELD_JB[p]).join(', ')}.</span></div>
  </section>
}
