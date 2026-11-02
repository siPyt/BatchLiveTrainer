import { useStore } from './store'
import {
  applyRig, defaultRig, evalRig, meterPress, meterReading, measurementSetup, rigPlugError, RIG_END_DEFS, RIG_TERMINAL_LABEL, CHECKOUT_PAIRS, expectedResult, meterRangeLabel,
  type FieldbusRig, type MeterButton, type Measurement, type RigEnd, type TestPoint
} from './fieldbusRigModel'

// Actions of the course DV-09 chapter 12 workshop rig (wiring, the terminator switch of the power hub and the Fluke 123).
// They are the bench, not DeltaV configuration, so no DeltaV key is needed. Every change is journaled for the Event Chronicle.

const TAG = 'Fieldbus segment'

export const getRig = (): FieldbusRig => useStore.getState().hardware.fieldbusRig ?? defaultRig()

function commit(next: FieldbusRig, description?: string): void {
  useStore.setState((s) => ({ hardware: applyRig({ ...s.hardware, fieldbusRig: next }), rev: s.rev + 1 }))
  if (description) useStore.getState().logEvent('DIAGNOSTIC', TAG, description)
}

/** Plug a cable end into a terminal, or pull it out (terminal = null). Returns an error message or null. */
export function rigPlug(end: RigEnd, terminal: string | null): string | null {
  const rig = getRig()
  const error = rigPlugError(rig, end, terminal)
  if (error) return error
  const label = RIG_END_DEFS.find(d => d.id === end)?.label ?? end
  commit({ ...rig, plugs: { ...rig.plugs, [end]: terminal } }, terminal ? `${label} connected to ${RIG_TERMINAL_LABEL[terminal] ?? terminal}` : `${label} disconnected`)
  const ev = evalRig(getRig())
  if (end === 'supply-ac' && terminal === 'strip') useStore.getState().logEvent('DIAGNOSTIC', TAG, ev.powered ? 'Power applied to the Fieldbus segment' : 'Fieldbus power supply plugged in but the 24VDC plug is not correctly on the Mother Board')
  return null
}

export function rigHubTerminator(on: boolean): string | null {
  const rig = getRig()
  if (rig.hubTerminator === on) return null
  commit({ ...rig, hubTerminator: on }, `Power hub terminator switch ${on ? 'ON' : 'OFF'}`)
  return null
}

export function rigMeterPress(button: MeterButton, now = Date.now()): string | null {
  const rig = getRig()
  commit({ ...rig, meter: meterPress(rig.meter, button, now) })
  return null
}

export function rigSetLead(lead: 'a' | 'com', point: TestPoint | null, now = Date.now()): string | null {
  const rig = getRig()
  const meter = { ...rig.meter, [lead === 'a' ? 'leadA' : 'leadCom']: point, leadsSetAt: now }
  commit({ ...rig, meter })
  return null
}

/** Record the displayed reading (the segment checkout form). The meter must be set up the way the procedure says. */
export function rigRecord(now = Date.now()): string | { measurement: Measurement } {
  const rig = getRig()
  const m = rig.meter
  if (!m.leadA || !m.leadCom) return 'Place both leads on the segment conductors first'
  if (m.leadA === m.leadCom) return 'The two leads are on the same conductor'
  const setup = measurementSetup(m)
  if (!setup.ok) return setup.why
  const ev = evalRig(rig)
  if ((m.mode === 'ohm' || m.mode === 'cap') && !ev.isolated) return 'Remove the Fieldbus segment cable from the Mother Board connector first (resistance and capacitance are measured on the isolated field wiring)'
  if ((m.mode === 'vdc' || m.mode === 'scope') && ev.isolated) return 'Reconnect the previously removed segment connector to the power supply first'
  const frozen = m.mode === 'scope' && m.heldAt !== null ? m.heldAt : now
  const reading = meterReading(m, rig, frozen)
  const measurement: Measurement = {
    id: rig.measurements.length + 1, mode: m.mode, range: meterRangeLabel(m), coupling: m.mode === 'scope' ? m.coupling : null, timeDiv: null, held: m.hold,
    a: m.leadA, com: m.leadCom, isolated: ev.isolated, value: reading.value, display: `${reading.display} ${reading.unit}`.trim()
  }
  commit({ ...rig, measurements: [...rig.measurements, measurement] }, `Segment checkout reading recorded: ${m.mode} ${measurement.a} to ${measurement.com} = ${measurement.display}`)
  return { measurement }
}

export function rigClearMeasurements(): void {
  commit({ ...getRig(), measurements: [] })
}

export function rigReset(): void {
  commit(defaultRig(), 'Fieldbus training segment reset')
}

/** For each of the six conductor pairings: the latest correct recording of the given mode ('ohm' or 'cap'), or undefined. */
export function checkoutRecordings(rig: FieldbusRig, mode: 'ohm' | 'cap'): Record<string, Measurement | undefined> {
  const out: Record<string, Measurement | undefined> = {}
  for (const pair of CHECKOUT_PAIRS) {
    const found = [...rig.measurements].reverse().find(m => m.mode === mode && m.isolated && ((m.a === pair.a && m.com === pair.b) || (m.a === pair.b && m.com === pair.a)))
    out[pair.key] = found && expectedResult(found, pair) ? found : undefined
  }
  return out
}
