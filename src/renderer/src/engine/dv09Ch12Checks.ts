import { checkoutRecordings } from './fieldbusRig'
import { defaultRig, evalRig, expectedResult, CHECKOUT_PAIRS, type FieldbusRig } from './fieldbusRigModel'
import type { Dv09Ctx } from './dv09Registry'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** The slot of the Series 2 H1 interface of the training simulator (Workshop - Adding an H1 Card, Step 5: Download Card 5). */
export const H1_SLOT = 5

/** Everything a Chapter 12 check reads that is not a store: pure so the tests can call it with plain state. */
export function checkDv09Ch12(ctx: Dv09Ctx): StepCheck[] {
  const { eventLog: events, hardware } = ctx.main
  const system = ctx.system
  const rig: FieldbusRig = hardware.fieldbusRig ?? defaultRig()
  const ev = evalRig(rig)
  const idx = (re: RegExp): number => events.findIndex(e => re.test(e.description))
  const prefsOpened = idx(/^DeltaV System Preferences opened/)
  const dbOpened = events.findIndex((e, i) => i > prefsOpened && prefsOpened >= 0 && /^DeltaV Database Administrator opened/.test(e.description))
  const fieldbusOn = !!system.features.fieldbus
  const fieldbusSelected = fieldbusOn || system.pending.fieldbus === true
  const card = Object.values(hardware.h1Cards ?? {}).find(c => c.slot === H1_SLOT && !!hardware.controllers[c.controllerTag]?.commissioned)
  const port = card?.ports.P01
  const physical = card ? card.field[`RM-3144P-${rig.transmitterSerial}`] : undefined
  const live = !!card && !!physical && physical.communicating && card.runtime[physical.port].liveList.includes(physical.address)
  const downloadedAt = card ? events.findIndex(e => e.tag === card.id && /^H1 card downloaded/.test(e.description)) : -1
  const rescanOk = card ? events.findIndex((e, i) => i > downloadedAt && downloadedAt >= 0 && e.tag === card.id && /^Rescan Port \(Auto-Sense Devices\) P0\d: \d+ device\(s\) found, [1-9]\d* communicating/.test(e.description)) : -1
  const ohm = checkoutRecordings(rig, 'ohm')
  const cap = checkoutRecordings(rig, 'cap')
  const six = (r: Record<string, unknown>): boolean => CHECKOUT_PAIRS.every(p => !!r[p.key])
  const volts = rig.measurements.some(m => m.mode === 'vdc' && !m.isolated && m.a !== m.com && ((m.a === 'sig+' && m.com === 'sig-') || (m.a === 'sig-' && m.com === 'sig+')) && expectedResult(m, null))
  const wave = rig.measurements.some(m => m.mode === 'scope' && !m.isolated && m.held && m.coupling === 'AC' && ((m.a === 'sig+' && m.com === 'sig-') || (m.a === 'sig-' && m.com === 'sig+')) && expectedResult(m, null))
  const p = rig.plugs
  return [
    check('dv09-12p-1', prefsOpened >= 0, 'Step 1. System Preferences was opened (Start > DeltaV > Engineering > System Preferences)'),
    check('dv09-12p-2', fieldbusSelected, 'Step 2. Enable Fieldbus is checked in System Preferences and OK was clicked'),
    check('dv09-12p-3', fieldbusOn || (system.acknowledged && system.pending.fieldbus === true), 'Step 3. The restart message box was answered with OK (the change is acknowledged)'),
    check('dv09-12p-4', dbOpened >= 0, 'Step 4. The Database Administrator was opened (Start > DeltaV > Engineering > Database Administrator) after System Preferences'),
    check('dv09-12p-5', system.serverState === 'STOPPED' || fieldbusOn, 'Step 5. File > Shutdown Server was answered with OK: the database server was shut down (the preference only becomes active after a shutdown and reconnect)'),
    check('dv09-12p-6', fieldbusOn && system.serverState === 'RUNNING', 'Step 6. File > Connect to Server re-connected the server: Fieldbus is active'),
    check('dv09-12p-7', fieldbusOn && system.serverState === 'RUNNING' && Object.keys(system.pending).length === 0, 'Task 3. DeltaV Explorer shows Library > Device Definitions > Fieldbus Devices: the Fieldbus system preference is enabled and added to the library'),

    check('dv09-12w-1', p['supply-brown'] === 'mb-pwr+' && p['supply-blue'] === 'mb-pwr-', 'Step 1. The 24VDC power supply plug is on the P&F Power Supply connection of the Mother Board: brown positive, blue negative'),
    check('dv09-12w-2', p['host-plus'] === 'h1-3' && p['host-minus'] === 'h1-4', 'Step 2. The Mother Board Host cable is on H1 Fieldbus Interface terminals 3(+) and 4(-)'),
    check('dv09-12w-3', p['trunk-jb'] === 'jb-P1', 'Step 3. The P&F trunk cable is on Quick Disconnect Junction Box P1'),
    check('dv09-12w-4', p['spur-jb'] === 'jb-S2', 'Step 4. Quick Disconnect Junction Box S2 is connected to the 3144P'),
    check('dv09-12w-5', p.terminator === 'jb-S0' || p.terminator2 === 'jb-S0', 'Step 5. The Fieldbus terminator is plugged into S0'),
    check('dv09-12w-6', ev.powered && p['supply-ac'] === 'strip', 'Step 6. The Fieldbus power supply is plugged into the power strip: power is applied to the segment (DC OK)'),
    check('dv09-12w-7', rig.measurements.some(m => m.isolated), 'Task 2. The Fieldbus segment cable was removed from the power supply connector for the resistance and capacitance checks (isolated field wiring)'),
    check('dv09-12w-8', six(ohm), 'Task 2. Resistance: Input A Setup > ohm > F4 > 500K; all six conductor pairings were measured and recorded with the expected result'),
    check('dv09-12w-9', six(cap), 'Task 2. Capacitance: Input A Setup > Cap > F4 > 5 microfarad; all six conductor pairings were measured and recorded with the expected result'),
    check('dv09-12w-10', ev.totalTerminators === 2, 'Task 2. Termination: exactly two terminators on the segment (power hub switch and the junction box terminator)'),
    check('dv09-12w-11', volts && p['trunk-mb'] === 'mb-seg', 'Task 2. DC voltage: the segment connector was reconnected and the output DC voltage at the power supply terminals (28-30 VDC, 20V/d) was measured and recorded'),
    check('dv09-12w-12', wave && p['trunk-mb'] === 'mb-seg', 'Task 2. AC waveform: Scope Menu > AC, F4, F4 F4, 200 mV/div, 10 microseconds, HOLD; the waveform (500-900 mV) was captured and recorded'),
    check('dv09-12w-13', rescanOk >= 0 && live, 'Task 3. Verify communications: after the H1 card download, Diagnostics > Rescan Port lists the 3144P as communicating (Standby, Good integrity)'),

    check('dv09-12h-1', !!card, 'Step 1. I/O > Auto-Sense I/O Cards (or New Card) added the Series 2 H1 card C05 to the controller I/O'),
    check('dv09-12h-2', !!port && port.enabled, 'Step 2. P01 > Properties > General: Enabled is checked (the description is optional)'),
    check('dv09-12h-5', !!card && card.downloaded && downloadedAt >= 0, 'Step 5. Card 5 (C05) was downloaded (right-click the card > Download > Card)')
  ]
}
