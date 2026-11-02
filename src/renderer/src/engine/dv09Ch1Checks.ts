import type { HardwareState } from './hardware'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** The controller every new DV-09 project starts with (course p1-53). */
export const DV09_START_CONTROLLER = 'CTLR-02F896'

/** Course DV-09 Chapter 1 (pp 1-50 and 1-66): log on to DeltaV and commission the decommissioned controller. */
export function checkDv09Ch1(hw: HardwareState, events: EventLogEntry[]): StepCheck[] {
  const idx = (re: RegExp, tag?: string): number => events.findIndex(e => re.test(e.description) && (tag === undefined || e.tag === tag))
  const commissionedAt = events.findIndex(e => /^Controller commissioned and added to the control network/.test(e.description))
  const named = commissionedAt >= 0 ? events[commissionedAt].tag : ''
  const c = named ? hw.controllers[named] : undefined
  const startedAt = idx(/identify flashing started/, DV09_START_CONTROLLER)
  const stoppedAt = events.findIndex((e, i) => i > startedAt && startedAt >= 0 && e.tag === DV09_START_CONTROLLER && /identify flashing stopped/.test(e.description))
  const senseAt = events.findIndex((e, i) => i > commissionedAt && commissionedAt >= 0 && e.tag === named && /^I\/O auto-sense complete/.test(e.description))
  const logon = events.some(e => e.category === 'SECURITY' && /^User logged on/.test(e.description) && e.tag.toLowerCase() === 'administrator')
  return [
    check('dv09-1a-4', logon, 'Step 4. The workstation was locked (FlexLock) and the user administrator logged on to DeltaV with the password deltav'),
    check('dv09-1c-1', startedAt >= 0 && stoppedAt > startedAt, 'Step 1. The decommissioned controller CTLR-02F896 was identified (Flash lights, then Stop Flashing or closing the Identify dialog)'),
    check('dv09-1c-2', !!c && c.commissioned && named !== DV09_START_CONTROLLER, 'Step 2. The controller was commissioned and given its own name (dragged onto the Control Network)'),
    check('dv09-1c-3', !!c && c.commissioned && c.networkRedundant, 'Step 2. Enable network redundancy for this node is checked'),
    check('dv09-1c-4', !!c && senseAt > commissionedAt && !!c.lastAutoSense && c.lastAutoSense.channelsDetected > 0, 'Step 2. I/O cards were auto-sensed after commissioning (answer Yes to the Auto-Sense prompt)'),
    check('dv09-1c-5', !!c && c.coldRestartMinutes === 5, 'Step 3. Cold Restart is set to 5 minutes (Properties > Controller tab, Enabled Within A Time Limit)')
  ]
}
