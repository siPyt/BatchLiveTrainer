import type { Dv09Ctx } from './dv09Registry'
import type { StepCheck } from './workshopChecks'
import type { EventLogEntry, PidModule } from './types'
import { useDv09Cm } from './dv09Cm'
import { usePictures } from './pictureStore'
import { useFlowColors } from './flowColorStore'
import { savedPicture, sameName } from './dv09Operate'
import { pidControlOpts, pidIoOpts } from './dv09Loops'
import { datalink } from './dv09Ch4Checks'
import type { FlowAnimation } from './pictureFlow'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const find = (events: EventLogEntry[], tag: string | null, re: RegExp, after = -1): number =>
  events.findIndex((e, i) => i > after && (tag === null || e.tag === tag) && re.test(e.description))
const ext = (text: string | undefined): Record<string, unknown> | null => { try { return text ? (JSON.parse(text) as { ext?: Record<string, unknown> }).ext ?? null : null } catch { return null } }
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const TYPES = ['AO', 'AI', 'DO', 'DI'] as const
const countsOf = (e: EventLogEntry | undefined): Record<typeof TYPES[number], number> | null => {
  const m = /AO (\d+), AI (\d+), DO (\d+), DI (\d+)/.exec(e?.description ?? '')
  return m ? { AO: Number(m[1]), AI: Number(m[2]), DO: Number(m[3]), DI: Number(m[4]) } : null
}
const sources = (a: FlowAnimation | undefined): string[] => (a?.conditions ?? []).map(c => `${c.tag}/${c.path}`).sort()

/**
 * Course DV-09 chapter 6 (pp 6-14 .. 6-21): the DST usage before and after, the regulatory loop FIC-102 from the PID_LOOP template (I/O, tuning,
 * scale, options, alarms, displays, Save, Download), its datalinks / valve dynamo / pipes on Tank101 and the operating verification. Everything is
 * read from the live module, controller, picture and Event Journal state.
 */
export function checkDv09Ch6(ctx: Dv09Ctx): StepCheck[] {
  const { main, library } = ctx
  const cm = useDv09Cm.getState().cms['FIC-102']
  const pictures = usePictures.getState().pictures
  const tables = useFlowColors.getState().tables
  const events = main.eventLog
  const ctl = Object.values(main.hardware.controllers).find(c => c.trackDownload && c.commissioned)?.tag ?? ''
  const out: StepCheck[] = []
  const m = main.modules['FIC-102']?.type === 'PID' ? main.modules['FIC-102'] as PidModule : undefined
  const binding = main.hardware.analogBindings?.['FIC-102']
  const savedOf = ext(cm?.saved)
  const deployedOf = ext(cm?.deployed)
  const savedMeta = (() => { try { return JSON.parse(cm?.saved ?? '') as { controller?: string; primary?: string } } catch { return {} as { controller?: string; primary?: string } } })()
  const alarm = (e: Record<string, unknown> | null, type: string): { limit?: number; enabled?: boolean } | undefined => ((e?.alarms ?? []) as { type: string; limit?: number; enabled?: boolean }[]).find(a => a.type === type)
  const uploadedAt = find(events, 'FIC-102', /^Upload complete: .* written to the configuration database/)
  const uploaded = uploadedAt >= 0
  const cfgSet = (name: string, key: string, value: number): boolean => Number(cm?.loop?.[key] ?? NaN) === value || (uploaded && find(events, 'FIC-102', new RegExp(`^PID1/${name} set to ${value}$`)) >= 0)
  // An Upload (pp 6-22 .. 6-27) writes on-line tuning values over the configured ones: the tuning of the workshop then stays verified by its own entry.
  const loopOk = (e: Record<string, unknown> | null): boolean => !!e && same(e.io, ['FT-2', 'FY-2']) && (uploaded || same(e.tuning, [0.5, 3, 0])) && same(e.scale, [0, 100, 'GPM']) && e.direct === false && e.action === 'INCREASE_TO_OPEN' &&
    alarm(e, 'LO')?.enabled === true && alarm(e, 'LO')?.limit === 10 && alarm(e, 'HI')?.enabled === true && alarm(e, 'HI')?.limit === 90
  const unitOk = (u: string | undefined): boolean => (u ?? '').toLowerCase() === 'gpm'

  // ---- Creating a Regulatory Loop: Task 1, DST usage before ----------------------------------------------------------------------
  const createdAt = find(events, null, /^Module created from template PID_LOOP/)
  const viewed = (after: number): number => find(events, 'PROPLUS', /^Licensing Properties viewed:/, after)
  const beforeAt = viewed(-1)
  const beforeOk = beforeAt >= 0 && (createdAt < 0 || beforeAt < createdAt)
  const before = beforeOk ? countsOf(events[beforeAt]) : null
  const note = (c: ReturnType<typeof countsOf>, t: typeof TYPES[number]): string => (c ? `${c[t]}` : '(not viewed yet)')
  out.push(check('dv09-6a-1', beforeOk, 'Step 1. The DeltaV Explorer was launched and the Licensing Properties opened before FIC-102 was configured'))
  out.push(check('dv09-6a-2', beforeOk, 'Step 2. Licensing → Licensing Properties of the workstation was opened before FIC-102 was created'))
  const labels: Record<typeof TYPES[number], string> = { AO: 'Analog Outputs', AI: 'Analog Inputs', DO: 'Discrete Outputs', DI: 'Discrete Inputs' }
  for (const [i, t] of TYPES.entries()) out.push(check(`dv09-6a-3${'abcd'[i]}`, before !== null, `Step 3. ${labels[t]} configured before FIC-102: ${note(before, t)}`))

  // ---- Using the PID_LOOP Template ------------------------------------------------------------------------------------------------
  out.push(check('dv09-6b-1', !!cm && cm.template === 'PID_LOOP' && cm.area === 'PLANT_AREA_A', 'Step 1. A module copied from the PID_LOOP module template is in PLANT_AREA_A'))
  out.push(check('dv09-6b-2', !!cm && cm.template === 'PID_LOOP', `Step 2. The module was renamed FIC-102${cm ? '' : ' (no module with that name)'}`))
  out.push(check('dv09-6b-3', !!cm && find(events, 'FIC-102', /^Control Studio opened/) >= 0, 'Step 3. FIC-102 was opened with Control Studio'))
  out.push(check('dv09-6b-3a', binding?.input === 'FT-2', `IO_IN of FIC-102 is ${binding?.input ?? 'not set'} (FT-2, card 1 channel 2)`))
  out.push(check('dv09-6b-3b', binding?.output === 'FY-2', `IO_OUT of FIC-102 is ${binding?.output ?? 'not set'} (FY-2, card 2 channel 2)`))
  out.push(check('dv09-6b-3c', !!cm && cfgSet('GAIN', 'cfgGain', 0.5), `GAIN is ${cm?.loop?.cfgGain ?? '?'} (0.5)`))
  out.push(check('dv09-6b-3d', !!cm && cfgSet('RESET', 'cfgReset', 3), `RESET is ${cm?.loop?.cfgReset ?? '?'} seconds/repeat (3)`))
  out.push(check('dv09-6b-3e', !!m && m.pvMin === 0 && m.pvMax === 100 && unitOk(m.unit), `PV_SCALE is ${m ? `${m.pvMin} - ${m.pvMax} ${m.unit}` : '(no module)'} (0 - 100 GPM)`))
  out.push(check('dv09-6b-3f', !!m && pidIoOpts(m) === 'Increase to Open', `IO_OPTS is ${m ? pidIoOpts(m) : '(no module)'} (Increase to Open)`))
  out.push(check('dv09-6b-3g', !!m && pidControlOpts(m) === 'Reverse Acting', `CONTROL_OPTS is ${m ? pidControlOpts(m) : '(no module)'} (Reverse Acting)`))
  const lo = m?.alarms.find(a => a.type === 'LO'), hi = m?.alarms.find(a => a.type === 'HI')
  out.push(check('dv09-6b-3h', !!lo && lo.enabled && lo.limit === 10, `Alarm LOW is ${lo?.enabled ? `enabled at ${lo.limit}` : 'not enabled'} (LOW = 10)`))
  out.push(check('dv09-6b-3i', !!hi && hi.enabled && hi.limit === 90, `Alarm HIGH is ${hi?.enabled ? `enabled at ${hi.limit}` : 'not enabled'} (HIGH = 90)`))
  out.push(check('dv09-6b-4', !!ctl && library.assignments['FIC-102'] === ctl, `FIC-102 is assigned to ${ctl || 'the controller'} (${library.assignments['FIC-102'] ?? 'not assigned'})`))
  out.push(check('dv09-6b-5', !!m && sameName(m.primaryDisplay, 'Tank101') && find(events, 'FIC-102', /^Module Properties opened/) >= 0, `Module Properties: primary display of FIC-102 is ${m?.primaryDisplay ?? '(none)'}`))
  out.push(check('dv09-6b-6a', !!cm && loopOk(savedOf) && savedMeta.controller === ctl && ctl !== '' && sameName(savedMeta.primary, 'Tank101'), 'FIC-102 was saved with its I/O, tuning, scale, options, alarms, display and node assignment'))
  const dl = find(events, 'FIC-102', /^Module downloaded to /)
  out.push(check('dv09-6b-6b', !!cm && loopOk(deployedOf) && m?.downloaded === true && dl >= 0, `FIC-102 was downloaded to ${ctl || 'the controller'}${cm && cm.deployed && cm.saved !== cm.deployed ? ' (the saved configuration differs from the downloaded one)' : ''}`))

  // ---- Creating a Regulatory Loop: Task 5, DST usage after ------------------------------------------------------------------------
  let afterAt = -1
  for (let i = dl >= 0 ? dl : events.length; (i = viewed(i)) >= 0; afterAt = i) { /* the last view after the download */ }
  const after = dl >= 0 && afterAt >= 0 ? countsOf(events[afterAt]) : null
  const grew = (t: typeof TYPES[number]): boolean => !!before && !!after && after[t] === before[t] + (t === 'AO' || t === 'AI' ? 1 : 0)
  out.push(check('dv09-6c-1', after !== null, 'Step 1. The DeltaV Explorer was launched and the Licensing Properties opened after FIC-102 was downloaded'))
  out.push(check('dv09-6c-2', after !== null, 'Step 2. Licensing → Licensing Properties of the workstation was opened after FIC-102 was downloaded'))
  const expect: Record<typeof TYPES[number], string> = { AO: 'one more than before', AI: 'one more than before', DO: 'unchanged', DI: 'unchanged' }
  for (const [i, t] of TYPES.entries()) {
    out.push(check(`dv09-6c-3${'abcd'[i]}`, grew(t), `Step 3. ${labels[t]} configured after FIC-102: ${note(after, t)} (${expect[t]}${before ? `; before ${before[t]}` : ''})`))
  }

  // ---- Modifying an Operator Display ------------------------------------------------------------------------------------------------
  const now = pictures.TANK101
  const saved = savedPicture(now)
  const cfg = dl >= 0 ? find(events, 'TANK101', /^Picture opened in Configure/, dl) : -1
  const sp = datalink(now, 'FIC-102', 'PID1/SP')
  const pv = datalink(now, 'FIC-102', 'PID1/PV')
  const outLink = datalink(now, 'FIC-102', 'PID1/OUT')
  const target = datalink(now, 'FIC-102', 'PID1/MODE.A_TARGET')
  const actual = datalink(now, 'FIC-102', 'PID1/MODE.A_ACTUAL')
  const al = datalink(now, 'FIC-102', 'ALARMS[1].A_LAALM')
  const valve = now?.elements.find(e => e.type === 'dynamo' && e.dynamoSet === 'VALVE_HORIZONTAL_CONTROL_D1' && e.tag === 'FIC-102')
  const expertAt = (name: string): number => find(events, 'TANK101', new RegExp(`^${name} opened`), cfg)
  out.push(check('dv09-6d-1', cfg >= 0, 'Step 1. DeltaV Operate (Configure) was launched and the Tank101 display opened after FIC-102 was downloaded'))
  out.push(check('dv09-6d-2a', sp?.entry?.method === 'NUMERIC' && expertAt('Data Entry Expert') >= 0, `Step 2. The datalink FIC-102/PID1/SP ${sp ? (sp.entry?.method === 'NUMERIC' ? 'has Numeric data entry' : 'has no Numeric data entry yet') : 'is not on the picture yet'}`))
  out.push(check('dv09-6d-2b', !!pv, `The datalink FIC-102/PID1/PV ${pv ? 'is on the picture' : 'is not on the picture yet'}`))
  out.push(check('dv09-6d-2c', outLink?.entry?.method === 'RAMP' && expertAt('Data Entry Expert') >= 0, `The datalink FIC-102/PID1/OUT ${outLink ? (outLink.entry?.method === 'RAMP' ? `has Ramp data entry (${outLink.entry.rate} % per second)` : 'has no Ramp data entry yet') : 'is not on the picture yet'}`))
  out.push(check('dv09-6d-2d', target?.entry?.method === 'PID_MODE' && expertAt('Data Entry Expert') >= 0, `The datalink FIC-102/PID1/MODE.A_TARGET ${target ? (target.entry?.method === 'PID_MODE' ? 'has Multiple-Item Select data entry' : 'has no Multiple-Item Select data entry yet') : 'is not on the picture yet'}`))
  out.push(check('dv09-6d-2e', !!actual, `The datalink FIC-102/PID1/MODE.A_ACTUAL ${actual ? 'is on the picture' : 'is not on the picture yet'}`))
  out.push(check('dv09-6d-2f', !!al?.alarmVisibility && expertAt('Visibility Expert') >= 0, `The datalink FIC-102/ALARMS[1].A_LAALM ${al ? (al.alarmVisibility ? 'is visible only when an alarm is active' : 'is not yet conditioned on the alarm') : 'is not on the picture yet'}`))
  out.push(check('dv09-6d-3', !!valve, `Step 3. ${valve ? 'The dynamo ValveHorizontalControlD1 of ValvesAnim (FIC-102) is on the picture' : 'No ValveHorizontalControlD1 dynamo for FIC-102 on the picture yet'}`))
  const valveSources = sources(valve?.flowAnimation)
  const valveTable = valve?.flowAnimation ? tables[valve.flowAnimation.table] : undefined
  const valveOk = same(valveSources, ['MTR-102/STATE', 'XVSTAT-101/STATE']) && valve?.flowAnimation?.conditions.every(c => c.greaterThan === 0)
  out.push(check('dv09-6d-4a', !!valveOk, `Step 4. Valve color animation: ${valveSources.length ? valveSources.join(' AND ') : '(none)'} (MTR-102 is RUNNING AND XVSTAT-101 is OPEN)`))
  out.push(check('dv09-6d-4b', !!valveOk && valveTable?.flowColor === '#ffff00', `1 - True: ${valveTable?.flowColor ?? '(no color)'} (Yellow)`))
  out.push(check('dv09-6d-4c', !!valveOk && valveTable?.noFlowColor === '#00aa00', `0 - False: ${valveTable?.noFlowColor ?? '(no color)'} (Green)`))
  const actSources = sources(valve?.actuatorFlowAnimation)
  const actTable = valve?.actuatorFlowAnimation ? tables[valve.actuatorFlowAnimation.table] : undefined
  const actOk = actSources.length === 1 && /^FIC-102\/(PID1|AO1)\/OUT$/.test(actSources[0]) && valve?.actuatorFlowAnimation?.conditions.every(c => c.greaterThan === 0)
  out.push(check('dv09-6d-5a', !!actOk, `Step 5. Actuator color animation: ${actSources.length ? actSources.join(' AND ') : '(none)'} (FIC-102 is OPEN)`))
  out.push(check('dv09-6d-5b', !!actOk && actTable?.flowColor === '#ffff00', `1 - True: ${actTable?.flowColor ?? '(no color)'} (Yellow)`))
  out.push(check('dv09-6d-5c', !!actOk && actTable?.noFlowColor === '#00aa00', `0 - False: ${actTable?.noFlowColor ?? '(no color)'} (Green)`))
  const pipes = now?.elements.filter(e => e.type === 'dynamo' && e.dynamoSet === 'PIPES_ANIM').length ?? 0
  out.push(check('dv09-6d-6', pipes >= 2, `Step 6. ${pipes} PipesAnim pipe dynamos connect the tank, pump and valves (at least 2 are needed)`))
  const save = cfg >= 0 ? find(events, 'TANK101', /^Picture saved/, cfg) : -1
  const sv = (tag: string, path: string) => datalink(saved, tag, path)
  out.push(check('dv09-6d-7', save >= 0 && !!sv('FIC-102', 'PID1/SP')?.entry && !!sv('FIC-102', 'PID1/PV') && sv('FIC-102', 'PID1/OUT')?.entry?.method === 'RAMP' && sv('FIC-102', 'PID1/MODE.A_TARGET')?.entry?.method === 'PID_MODE' &&
    !!sv('FIC-102', 'PID1/MODE.A_ACTUAL') && !!sv('FIC-102', 'ALARMS[1].A_LAALM')?.alarmVisibility && !!saved?.elements.some(e => e.dynamoSet === 'VALVE_HORIZONTAL_CONTROL_D1' && e.tag === 'FIC-102' && !!e.flowAnimation && !!e.actuatorFlowAnimation) &&
    (saved?.elements.filter(e => e.dynamoSet === 'PIPES_ANIM').length ?? 0) >= 2, 'Step 7. Tank101 was saved with the FIC-102 datalinks, the animated valve and the pipes'))

  // ---- Operating & Verifying ----------------------------------------------------------------------------------------------------------
  const run = save >= 0 ? find(events, null, /^(Operate switched to Run|Picture opened in Run)/, save) : -1
  const auto = run >= 0 ? find(events, 'FIC-102', /^Mode set to AUTO/, run) : -1
  const spAt = auto >= 0 ? find(events, 'FIC-102', /^SP set to /, auto) : -1
  const settled = spAt >= 0 ? find(events, 'FIC-102', /\/PID1\/PV reached the setpoint/, spAt) : -1
  const detail = run >= 0 ? find(events, 'FIC-102', /^Detail picture opened/, run) : -1
  const tuned = detail >= 0 ? find(events, 'FIC-102', /^Tuning changed: /, detail) : -1
  const trend = run >= 0 ? find(events, 'FIC-102', /^Real-time trend opened/, run) : -1
  out.push(check('dv09-6e-1', run >= 0, 'Step 1. DeltaV Operate was switched to Run after Tank101 was saved'))
  out.push(check('dv09-6e-2', settled >= 0, `Step 2. ${auto >= 0 ? 'FIC-102 was put in AUTO' : 'FIC-102 has not been put in AUTO yet'}${spAt >= 0 ? ', the SP was changed' : ''}${settled >= 0 ? ` and the PV followed it: ${events[settled].description.replace(/^FIC-102\/PID1\/PV reached the setpoint /, '')}` : ' (no PV reached the new SP yet)'}`))
  out.push(check('dv09-6e-3', tuned >= 0, `Step 3. The detail picture of FIC-102 was opened${detail >= 0 ? '' : ' (not yet)'} and the tuning parameters were ${tuned >= 0 ? `adjusted (${events[tuned].description.replace(/^Tuning changed: /, '')})` : 'not adjusted yet'}`))
  out.push(check('dv09-6e-3n', trend >= 0, `Note. The real-time trend was ${trend >= 0 ? 'opened from the faceplate of FIC-102' : 'not opened from the faceplate of FIC-102 yet'}`))
  return out
}
