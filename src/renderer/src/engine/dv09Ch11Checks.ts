import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** Number of recorded DeltaV log ons of the administrator account (FlexLock Log On journals "User logged on"). */
export const administratorLogons = (events: EventLogEntry[]): number =>
  events.filter(e => e.category === 'SECURITY' && /^User logged on/.test(e.description) && e.tag.trim().toLowerCase() === 'administrator').length

/**
 * Course DV-09 Chapter 11 (pp 11-17 .. 11-20): the Windows steps are tick-only; the DeltaV Logon is verified from the Event Journal.
 * Chapter 1 already logged one administrator log on, so the Chapter 11 log on is the second one.
 */
export function checkDv09Ch11(events: EventLogEntry[]): StepCheck[] {
  return [
    check('dv09-11a-3', administratorLogons(events) >= 2, 'DeltaV Logon: a second log on as administrator (after the Chapter 1 log on) was recorded: Lock Workstation, then log on with the password deltav')
  ]
}
