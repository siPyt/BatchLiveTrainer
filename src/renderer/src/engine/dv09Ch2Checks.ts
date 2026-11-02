import { controllerHardwarePending } from './controllerConfig'
import type { HardwareState } from './hardware'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** Chapter 2 (p2-91): channels 1 and 2 of cards 1 to 4. */
export const DV09_DST_PLAN: { slot: number; type: 'AI' | 'AO' | 'DI' | 'DO'; dsts: [string, string] }[] = [
  { slot: 1, type: 'AI', dsts: ['LT-1', 'FT-2'] },
  { slot: 2, type: 'AO', dsts: ['LY-1', 'FY-2'] },
  { slot: 3, type: 'DI', dsts: ['LSO-1', 'XI-2'] },
  { slot: 4, type: 'DO', dsts: ['XV-1', 'ZX-2'] }
]

/** Course DV-09 Chapter 2 (pp 2-87, 2-88, 2-91, 2-99 .. 2-104): plant areas, DSTs, a total download and Diagnostics. */
export function checkDv09Ch2(areas: string[], hw: HardwareState, events: EventLogEntry[]): StepCheck[] {
  const c = Object.values(hw.controllers).find(x => x.trackDownload && x.commissioned)
  const cards = Object.values(hw.traditionalCards ?? {}).filter(card => !!c && card.controllerTag === c.tag)
  const configured = (plan: (typeof DV09_DST_PLAN)[number]): boolean => {
    const card = cards.find(x => x.slot === plan.slot)
    return !!card && card.type === plan.type && plan.dsts.every((dst, i) => { const ch = card.channels.find(x => x.channel === i + 1); return !!ch && ch.dst === dst && ch.enabled })
  }
  const all = DV09_DST_PLAN.every(configured)
  const downloadAt = c ? events.findIndex(e => e.tag === c.tag && /^Total controller download complete/.test(e.description)) : -1
  const sent = !!c && !!c.downloadedConfig && DV09_DST_PLAN.flatMap(p => p.dsts).every(dst => c.downloadedConfig!.includes(`"${dst}"`))
  const diag = events.findIndex((e, i) => i > downloadAt && downloadAt >= 0 && /^DeltaV Diagnostics launched/.test(e.description))
  return [
    check('dv09-2a-1', areas.includes('PLANT_AREA_A') && !areas.includes('AREA_A'), 'Step 1. AREA_A was renamed PLANT_AREA_A (Control Strategies > AREA_A > Rename)'),
    check('dv09-2a-2', areas.includes('PLANT_AREA_B'), 'Step 2. PLANT_AREA_B was added (Control Strategies > New Area)'),
    ...DV09_DST_PLAN.map(p => check(`dv09-2b-${p.slot}`, configured(p),
      `Card ${p.slot} (C0${p.slot}, ${p.type}): CH01 ${p.dsts[0]} and CH02 ${p.dsts[1]} are named and enabled`)),
    check('dv09-2d-1', downloadAt >= 0 && sent, 'The controller was downloaded (CTLR > Download > Controller) after the DSTs were configured'),
    check('dv09-2d-2', !!c && downloadAt >= 0 && !controllerHardwarePending(c, hw) && all, 'The blue download triangle is gone: the controller matches the configuration database'),
    check('dv09-2e-1', diag >= 0, 'DeltaV Diagnostics was launched after the download and the controller status checked')
  ]
}
