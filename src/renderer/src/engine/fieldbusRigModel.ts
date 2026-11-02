import type { H1Card, H1PortId } from './fieldbus'
import type { HardwareState } from './hardware'

// ---------------------------------------------------------------------------
// Course DV-09 chapter 12 workshop rig (pp 12-15 .. 12-53): the training simulator's FOUNDATION fieldbus segment (24 VDC
// supply, P&F mother board, Series 2 H1 terminals 1-8, quick disconnect junction box, 3144P temperature transmitter and
// the terminator) and the Fluke 123 test tool used for the segment checkout. The readings are computed from the actual wiring
// state so wiring faults give different readings; this is a lesson model, not an electrical simulation, and it certifies nothing.
// Pure functions only (no store), so the store, the auto-sense and the tests can all use them.
// ---------------------------------------------------------------------------

export type RigEnd =
  | 'supply-ac' | 'supply-brown' | 'supply-blue'
  | 'host-plus' | 'host-minus' | 'host-shield'
  | 'trunk-mb' | 'trunk-jb' | 'spur-jb' | 'terminator' | 'terminator2'

export interface RigEndDef { id: RigEnd; label: string; allowed: string[]; note: string }

export const JB_PORTS = ['jb-P1', 'jb-S0', 'jb-S1', 'jb-S2', 'jb-S3', 'jb-S4', 'jb-S5', 'jb-S6'] as const
const H1_TERMINALS = ['h1-1', 'h1-2', 'h1-3', 'h1-4', 'h1-5', 'h1-6', 'h1-7', 'h1-8']
const GROUND_BAR = ['gnd-1', 'gnd-2', 'gnd-3', 'gnd-4']

export const RIG_END_DEFS: RigEndDef[] = [
  { id: 'supply-ac', label: 'Fieldbus power supply plug', allowed: ['strip'], note: 'plugs into the power strip at the bottom of the simulator (Step 6)' },
  { id: 'supply-brown', label: '24VDC power supply plug, brown wire (positive)', allowed: ['mb-pwr+', 'mb-pwr-'], note: 'P&F Power Supply connection on the Mother Board; brown is positive' },
  { id: 'supply-blue', label: '24VDC power supply plug, blue wire (negative)', allowed: ['mb-pwr+', 'mb-pwr-'], note: 'P&F Power Supply connection on the Mother Board; blue is negative' },
  { id: 'host-plus', label: 'Mother Board Host cable, + conductor', allowed: H1_TERMINALS, note: 'H1 Fieldbus Interface terminal 3 (+)' },
  { id: 'host-minus', label: 'Mother Board Host cable, - conductor', allowed: H1_TERMINALS, note: 'H1 Fieldbus Interface terminal 4 (-)' },
  { id: 'host-shield', label: 'Mother Board Host cable, shield (S)', allowed: GROUND_BAR, note: 'Ground Bar (shield grounded at one point)' },
  { id: 'trunk-mb', label: 'P&F trunk cable, Mother Board end', allowed: ['mb-seg'], note: 'segment connector of the Mother Board (removed for the checkout)' },
  { id: 'trunk-jb', label: 'P&F trunk cable, junction box end', allowed: ['jb-P1'], note: 'Quick Disconnect Junction Box P1' },
  { id: 'spur-jb', label: 'Spur from the 3144P', allowed: ['jb-S1', 'jb-S2', 'jb-S3', 'jb-S4', 'jb-S5', 'jb-S6'], note: 'Quick Disconnect Junction Box S2' },
  { id: 'terminator', label: 'Fieldbus terminator', allowed: JB_PORTS.filter(p => p !== 'jb-P1'), note: 'plugs into S0' },
  { id: 'terminator2', label: 'Spare terminator', allowed: JB_PORTS.filter(p => p !== 'jb-P1'), note: 'a second field terminator makes three on the segment (checkout comparison only)' }
]

export const RIG_TERMINAL_LABEL: Record<string, string> = {
  strip: 'Power strip', 'mb-pwr+': 'Mother Board PRI PWR +', 'mb-pwr-': 'Mother Board PRI PWR -', 'mb-seg': 'Mother Board segment connector',
  'jb-P1': 'Junction Box P1', 'jb-S0': 'Junction Box S0', 'jb-S1': 'Junction Box S1', 'jb-S2': 'Junction Box S2', 'jb-S3': 'Junction Box S3',
  'jb-S4': 'Junction Box S4', 'jb-S5': 'Junction Box S5', 'jb-S6': 'Junction Box S6',
  ...Object.fromEntries(H1_TERMINALS.map((t, i) => [t, `H1 terminal ${i + 1}${i === 2 || i === 4 ? ' (+)' : i === 3 || i === 5 ? ' (-)' : i === 0 || i === 6 ? ' (24 VIN+, not available)' : ' (24 VIN-, not available)'}`])),
  ...Object.fromEntries(GROUND_BAR.map((t, i) => [t, `Ground Bar ${i + 1}`]))
}

export type MeterMode = 'vac' | 'vdc' | 'vacdc' | 'vpeak' | 'ohm' | 'cap' | 'scope'
export type MeterScreen = 'main' | 'inputSetup' | 'scopeMenu'
export type MeterButton = 'power' | 'inputA' | 'scopeMenu' | 'F4' | 'up' | 'down' | 'left' | 'right' | 'mV' | 'V' | 'timeUp' | 'timeDown' | 'hold'
export type TestPoint = 'sig+' | 'sig-' | 'shield' | 'ground'
export const TEST_POINTS: TestPoint[] = ['sig+', 'sig-', 'shield', 'ground']
export const POINT_LABEL: Record<TestPoint, string> = { 'sig+': '+ signal conductor', 'sig-': '- signal conductor', shield: 'drain/shield wire', ground: 'instrument ground bar' }

export const INPUT_SETUP_OPTIONS: { id: MeterMode; label: string }[] = [
  { id: 'vac', label: 'Vac' }, { id: 'vdc', label: 'Vdc' }, { id: 'vacdc', label: 'Vac+dc' }, { id: 'vpeak', label: 'Vpeak' }, { id: 'ohm', label: 'ohm' }, { id: 'cap', label: 'Cap' }
]
export const SCOPE_COUPLING_OPTIONS = ['DC', 'AC'] as const

/** Selectable ranges; the workshop targets are 500K ohm, 5 microfarad, 20 V/div, 200 mV/div and 10 microseconds. */
export const OHM_RANGES = [{ label: '500 Ω', max: 500 }, { label: '5 kΩ', max: 5e3 }, { label: '50 kΩ', max: 50e3 }, { label: '500K', max: 500e3 }, { label: '5 MΩ', max: 5e6 }, { label: '30 MΩ', max: 30e6 }]
export const CAP_RANGES = [{ label: '50 nF', max: 50e-9 }, { label: '500 nF', max: 500e-9 }, { label: '5 µF', max: 5e-6 }, { label: '50 µF', max: 50e-6 }, { label: '500 µF', max: 500e-6 }]
export const VDC_RANGES = [1, 2, 5, 10, 20, 50, 100, 200, 500].map(v => ({ label: `${v}V/d`, volts: v }))
export const VOLT_DIV_MV = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
export const TIME_DIV_US = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]

export interface MeterState {
  on: boolean
  screen: MeterScreen
  cursor: number
  stage: number
  mode: MeterMode
  coupling: 'DC' | 'AC'
  /** Index into the range list of the current mode (ohm, cap, vdc). */
  rangeIndex: number
  voltIndex: number
  timeIndex: number
  hold: boolean
  heldAt: number | null
  /** The two leads: Input A and COM. */
  leadA: TestPoint | null
  leadCom: TestPoint | null
  leadsSetAt: number
}

export interface Measurement {
  id: number
  mode: MeterMode
  range: string
  coupling: 'DC' | 'AC' | null
  timeDiv: number | null
  held: boolean
  a: TestPoint
  com: TestPoint
  /** The Mother Board segment connector was removed (isolated field wiring) when the reading was taken. */
  isolated: boolean
  value: number | null
  display: string
}

export interface FieldbusRig {
  plugs: Record<RigEnd, string | null>
  /** The terminator switch of the P&F power hub (the second terminator of the segment). */
  hubTerminator: boolean
  /** The 3144P transmitter's serial number, the physical device id Diagnostics shows. */
  transmitterSerial: string
  transmitterAddress: number
  meter: MeterState
  measurements: Measurement[]
}

export function defaultMeter(): MeterState {
  return { on: false, screen: 'main', cursor: 0, stage: 0, mode: 'scope', coupling: 'DC', rangeIndex: 0, voltIndex: 9, timeIndex: 9, hold: false, heldAt: null, leadA: null, leadCom: null, leadsSetAt: 0 }
}

export function defaultRig(): FieldbusRig {
  return {
    plugs: {
      'supply-ac': null, 'supply-brown': null, 'supply-blue': null, 'host-plus': null, 'host-minus': null, 'host-shield': null,
      'trunk-mb': 'mb-seg', 'trunk-jb': null, 'spur-jb': null, terminator: null, terminator2: null
    },
    hubTerminator: true,
    transmitterSerial: '0011513102',
    transmitterAddress: 33,
    meter: defaultMeter(),
    measurements: []
  }
}

/** The error for plugging an end into a terminal, or null. */
export function rigPlugError(rig: FieldbusRig, end: RigEnd, terminal: string | null): string | null {
  const def = RIG_END_DEFS.find(d => d.id === end)
  if (!def) return `Unknown connection ${end}`
  if (terminal === null) return null
  if (!def.allowed.includes(terminal)) return `${def.label} does not plug into ${RIG_TERMINAL_LABEL[terminal] ?? terminal}`
  const holder = (Object.entries(rig.plugs) as [RigEnd, string | null][]).find(([id, t]) => id !== end && t === terminal)
  if (holder && terminal !== 'strip') return `${RIG_TERMINAL_LABEL[terminal] ?? terminal} is already used by ${RIG_END_DEFS.find(d => d.id === holder[0])?.label}`
  return null
}

export interface RigEvaluation {
  /** The supply is plugged into the power strip and its plug is on the Mother Board with the right polarity. */
  powered: boolean
  reversedSupply: boolean
  /** The H1 port the host cable reaches (3(+)/4(-) = P01, 5(+)/6(-) = P02) or null when wrong or missing. */
  hostPort: H1PortId | null
  hostProblem: string | null
  trunkConnected: boolean
  spurConnected: boolean
  /** Terminators on the field side (junction box ports), the hub terminator excluded. */
  fieldTerminators: number
  totalTerminators: number
  /** The 3144P is powered and answering on the segment. */
  transmitterOnBus: boolean
  /** The Mother Board segment connector is unplugged: the field wiring is isolated from the supply and the H1 card. */
  isolated: boolean
}

export function evalRig(rig: FieldbusRig): RigEvaluation {
  const p = rig.plugs
  const strip = p['supply-ac'] === 'strip'
  const powered = strip && p['supply-brown'] === 'mb-pwr+' && p['supply-blue'] === 'mb-pwr-'
  const reversedSupply = strip && p['supply-brown'] === 'mb-pwr-' && p['supply-blue'] === 'mb-pwr+'
  let hostPort: H1PortId | null = null
  let hostProblem: string | null = null
  const plus = p['host-plus'], minus = p['host-minus']
  if (!plus || !minus) hostProblem = 'The host cable is not connected to the H1 terminals'
  else if (plus === 'h1-3' && minus === 'h1-4') hostPort = 'P01'
  else if (plus === 'h1-5' && minus === 'h1-6') hostPort = 'P02'
  else if (plus === 'h1-4' && minus === 'h1-3' || plus === 'h1-6' && minus === 'h1-5') hostProblem = 'The host cable polarity is reversed (+ goes to 3 or 5, - to 4 or 6)'
  else hostProblem = 'The host cable must go to terminals 3(+) and 4(-) (port 1) or 5(+) and 6(-) (port 2)'
  const trunkConnected = p['trunk-mb'] === 'mb-seg' && p['trunk-jb'] === 'jb-P1'
  const spurConnected = !!p['spur-jb']
  const fieldTerminators = [p.terminator, p.terminator2].filter(t => t && t !== p['spur-jb']).length
  const totalTerminators = fieldTerminators + (rig.hubTerminator ? 1 : 0)
  const isolated = p['trunk-mb'] === null
  return {
    powered, reversedSupply, hostPort, hostProblem, trunkConnected, spurConnected, fieldTerminators, totalTerminators, isolated,
    transmitterOnBus: powered && hostPort !== null && trunkConnected && spurConnected
  }
}

/** Keeps the 3144P physical device of the H1 cards in step with the wiring: it answers only on a complete, powered segment. */
export function syncRigToCards(cards: Record<string, H1Card>, rig: FieldbusRig, rigSlots: Record<string, number[]>): Record<string, H1Card> {
  const evaluation = evalRig(rig)
  const out: Record<string, H1Card> = {}
  for (const [id, card] of Object.entries(cards)) {
    if (!(rigSlots[card.controllerTag] ?? []).includes(card.slot)) { out[id] = card; continue }
    const deviceId = `RM-3144P-${rig.transmitterSerial}`
    const port: H1PortId = evaluation.hostPort ?? 'P01'
    const previous = card.field[deviceId]
    const next = {
      id: deviceId, port, address: rig.transmitterAddress, catalogId: 'RM-3144P', serial: rig.transmitterSerial, deviceRevision: 2, ddRevision: 2,
      communicating: evaluation.transmitterOnBus, sensorValue: previous?.sensorValue ?? 21.5,
      faults: previous?.faults ?? { failed: false, maintenance: false, advisory: false, abnormal: false }
    }
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) { out[id] = card; continue }
    out[id] = { ...card, field: { ...card.field, [deviceId]: next } }
  }
  return out
}

/** Slots of each controller where a Series 2 H1 interface is physically installed (the rig's card). */
export function rigInstalledSlots(hw: HardwareState): Record<string, number[]> {
  return Object.fromEntries(Object.values(hw.controllers).filter(c => c.installedH1?.length).map(c => [c.tag, (c.installedH1 ?? []).map(x => x.slot)]))
}

/** The hardware with the rig's 3144P brought in step with the wiring (a no-op when there is no rig or no H1 card on its slot). */
export function applyRig(hw: HardwareState): HardwareState {
  if (!hw.h1Cards || !Object.keys(hw.h1Cards).length) return hw
  const cards = syncRigToCards(hw.h1Cards, hw.fieldbusRig ?? defaultRig(), rigInstalledSlots(hw))
  return cards === hw.h1Cards || Object.entries(cards).every(([id, c]) => c === hw.h1Cards![id]) ? hw : { ...hw, h1Cards: cards }
}

// --- the Fluke 123 test tool --------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** One button press on the Fluke 123; returns the next meter state (unchanged when the meter is off). */
export function meterPress(m: MeterState, button: MeterButton, now: number): MeterState {
  if (button === 'power') return m.on ? { ...defaultMeter(), leadA: m.leadA, leadCom: m.leadCom, leadsSetAt: m.leadsSetAt } : { ...m, on: true }
  if (!m.on) return m
  switch (button) {
    case 'inputA': return { ...m, screen: 'inputSetup', cursor: Math.max(0, INPUT_SETUP_OPTIONS.findIndex(o => o.id === m.mode)), stage: 0 }
    case 'scopeMenu': return { ...m, screen: 'scopeMenu', cursor: m.coupling === 'AC' ? 1 : 0, stage: 0 }
    case 'up': case 'left': case 'down': case 'right': {
      const step = button === 'up' || button === 'left' ? -1 : 1
      if (m.screen === 'inputSetup') return { ...m, cursor: clamp(m.cursor + step, 0, INPUT_SETUP_OPTIONS.length - 1) }
      if (m.screen === 'scopeMenu' && m.stage === 0) return { ...m, cursor: clamp(m.cursor + step, 0, SCOPE_COUPLING_OPTIONS.length - 1) }
      return m
    }
    case 'F4': {
      if (m.screen === 'inputSetup') {
        const mode = INPUT_SETUP_OPTIONS[m.cursor].id
        return { ...m, screen: 'main', mode, rangeIndex: mode === 'ohm' ? OHM_RANGES.length - 1 : mode === 'cap' ? CAP_RANGES.length - 1 : 0, voltIndex: mode === 'vdc' ? 3 : m.voltIndex, hold: false, heldAt: null, leadsSetAt: now }
      }
      if (m.screen === 'scopeMenu') {
        // Step 3 selects the coupling and polarity (normal); Step 4 presses F4 twice more to reach the scope screen.
        if (m.stage === 0) return { ...m, stage: 1, coupling: SCOPE_COUPLING_OPTIONS[m.cursor] }
        if (m.stage === 1) return { ...m, stage: 2 }
        return { ...m, screen: 'main', mode: 'scope', stage: 0, hold: false, heldAt: null }
      }
      return m
    }
    case 'mV': case 'V': {
      const step = button === 'V' ? 1 : -1
      if (m.screen !== 'main') return m
      if (m.mode === 'ohm' || m.mode === 'cap') return { ...m, rangeIndex: clamp(m.rangeIndex + step, 0, (m.mode === 'ohm' ? OHM_RANGES : CAP_RANGES).length - 1), leadsSetAt: now }
      if (m.mode === 'vdc') return { ...m, voltIndex: clamp(m.voltIndex + step, 0, VDC_RANGES.length - 1) }
      if (m.mode === 'scope') return { ...m, voltIndex: clamp(m.voltIndex + step, 0, VOLT_DIV_MV.length - 1) }
      return m
    }
    case 'timeUp': case 'timeDown':
      return m.screen === 'main' && m.mode === 'scope' ? { ...m, timeIndex: clamp(m.timeIndex + (button === 'timeUp' ? 1 : -1), 0, TIME_DIV_US.length - 1) } : m
    case 'hold': return { ...m, hold: !m.hold, heldAt: m.hold ? null : now }
  }
}

export function meterRangeLabel(m: MeterState): string {
  if (m.mode === 'ohm') return OHM_RANGES[m.rangeIndex].label
  if (m.mode === 'cap') return CAP_RANGES[m.rangeIndex].label
  if (m.mode === 'vdc') return VDC_RANGES[Math.min(m.voltIndex, VDC_RANGES.length - 1)].label
  if (m.mode === 'scope') return `${VOLT_DIV_MV[m.voltIndex] >= 1000 ? VOLT_DIV_MV[m.voltIndex] / 1000 + ' V' : VOLT_DIV_MV[m.voltIndex] + ' mV'}/div`
  return ''
}

const samePair = (m: MeterState, x: TestPoint, y: TestPoint): boolean => (m.leadA === x && m.leadCom === y) || (m.leadA === y && m.leadCom === x)

export interface MeterReading { value: number | null; display: string; unit: string }

/** The meter's reading for the leads and the wiring at time `now` (ms). The resistance reading rises like a charging capacitor. */
export function meterReading(m: MeterState, rig: FieldbusRig, now: number): MeterReading {
  const none: MeterReading = { value: null, display: m.on ? '----' : '', unit: '' }
  if (!m.on || !m.leadA || !m.leadCom || m.screen !== 'main') return none
  const ev = evalRig(rig)
  const fieldWiringReachable = rig.plugs['trunk-jb'] === 'jb-P1'
  const reachableTerms = fieldWiringReachable ? ev.fieldTerminators : 0
  const plusMinus = samePair(m, 'sig+', 'sig-')
  if (m.mode === 'ohm') {
    // Only the field wiring is measured: the Mother Board connector must be removed; a live segment gives an overload reading.
    if (!ev.isolated) return { value: null, display: 'OL', unit: 'Ω' }
    const limit = OHM_RANGES[m.rangeIndex].max
    let ohms = Number.POSITIVE_INFINITY
    if (plusMinus && reachableTerms > 0) ohms = Math.min(480e3, 55e3 + 14e3 * Math.max(0, (now - m.leadsSetAt) / 1000))
    if (!Number.isFinite(ohms) || ohms > limit) return { value: null, display: 'OL', unit: 'Ω' }
    return { value: ohms, display: `${(ohms / 1000).toFixed(1)} k`, unit: 'Ω' }
  }
  if (m.mode === 'cap') {
    if (!ev.isolated) return { value: null, display: 'OL', unit: 'F' }
    const cable = fieldWiringReachable ? 0.012e-6 : 0.004e-6
    let farads: number
    if (plusMinus) farads = reachableTerms * 1e-6 + cable
    else farads = (fieldWiringReachable ? 0.11e-6 : 0.04e-6) + (samePair(m, 'shield', 'ground') ? -0.02e-6 : 0)
    if (farads > CAP_RANGES[m.rangeIndex].max) return { value: null, display: 'OL', unit: 'F' }
    return { value: farads, display: farads >= 1e-6 ? `${(farads * 1e6).toFixed(2)} µ` : `${(farads * 1e9).toFixed(0)} n`, unit: 'F' }
  }
  if (m.mode === 'vdc') {
    if (ev.isolated || !plusMinus) return { value: 0, display: '0.0', unit: 'V' }
    const volts = ev.powered ? 28.7 : 0
    const signed = m.leadA === 'sig+' ? volts : -volts
    return { value: signed, display: signed.toFixed(1), unit: 'V' }
  }
  if (m.mode === 'scope') {
    if (m.coupling !== 'AC' || !plusMinus || ev.isolated || !ev.powered) return { value: 0, display: '0 mV', unit: 'mV' }
    // Peak-to-peak signal of the segment; fewer terminators give a bigger, more distorted signal and more give a smaller one.
    const pp = [1500, 1050, 700, 470, 330][Math.min(ev.totalTerminators, 4)]
    return { value: pp, display: `${pp} mV pk-pk`, unit: 'mV' }
  }
  return { value: 0, display: '0.0', unit: 'V' }
}

/** A recorded reading is acceptable for the checkout form row when the meter is configured as the procedure requires. */
export function measurementSetup(m: MeterState): { ok: boolean; why: string } {
  if (!m.on) return { ok: false, why: 'The meter is off' }
  if (m.mode === 'ohm') return m.rangeIndex === OHM_RANGES.findIndex(r => r.label === '500K') ? { ok: true, why: '' } : { ok: false, why: 'Adjust the range to read 500K Ohm with the mV - V button' }
  if (m.mode === 'cap') return m.rangeIndex === CAP_RANGES.findIndex(r => r.label === '5 µF') ? { ok: true, why: '' } : { ok: false, why: 'Adjust the range to 5 micro farads with the mV - V button' }
  if (m.mode === 'vdc') return VDC_RANGES[Math.min(m.voltIndex, VDC_RANGES.length - 1)].volts === 20 ? { ok: true, why: '' } : { ok: false, why: 'Adjust the range to read 20V/d with the mV - V button' }
  if (m.mode === 'scope') {
    if (m.coupling !== 'AC') return { ok: false, why: 'Select AC in the scope input window (Scope Menu)' }
    if (VOLT_DIV_MV[m.voltIndex] !== 200) return { ok: false, why: 'Adjust to 200mV/division with the mV - V button' }
    if (TIME_DIV_US[m.timeIndex] !== 10) return { ok: false, why: 'Adjust to 10 micro seconds with the time button' }
    if (!m.hold) return { ok: false, why: 'Press HOLD to capture the waveform' }
    return { ok: true, why: '' }
  }
  return { ok: false, why: 'Select ohm, Cap or VDC with Input A Setup, or AC with Scope Menu' }
}

/** The six conductor pairings of the resistance and capacitance checkout forms (pp 12-43, 12-45). */
export const CHECKOUT_PAIRS: { key: string; a: TestPoint; b: TestPoint; label: string }[] = [
  { key: 'pm', a: 'sig+', b: 'sig-', label: '+ signal conductor to - signal conductor' },
  { key: 'ps', a: 'sig+', b: 'shield', label: '+ signal conductor to drain/shield wire' },
  { key: 'ms', a: 'sig-', b: 'shield', label: '- signal conductor to drain/shield wire' },
  { key: 'pg', a: 'sig+', b: 'ground', label: '+ signal conductor to instrument ground bar' },
  { key: 'mg', a: 'sig-', b: 'ground', label: '- signal conductor to instrument ground bar' },
  { key: 'sg', a: 'shield', b: 'ground', label: 'drain/shield wire to instrument ground bar' }
]

export const pairMatches = (m: Measurement, a: TestPoint, b: TestPoint): boolean => (m.a === a && m.com === b) || (m.a === b && m.com === a)

/** Expected-result verdict for a recorded checkout reading (the manual's tables, pp 12-43, 12-45, 12-49, 12-51). */
export function expectedResult(m: Measurement, pair: { a: TestPoint; b: TestPoint } | null): boolean {
  if (m.mode === 'ohm') return pair?.a === 'sig+' && pair.b === 'sig-' ? m.value !== null && m.value > 50e3 : m.value === null
  if (m.mode === 'cap') return pair?.a === 'sig+' && pair.b === 'sig-' ? m.value !== null && m.value >= 0.8e-6 && m.value <= 1.2e-6 : m.value !== null && m.value < 300e-9
  if (m.mode === 'vdc') return m.value !== null && m.value >= 28 && m.value <= 30
  if (m.mode === 'scope') return m.value !== null && m.value >= 500 && m.value <= 900
  return false
}
