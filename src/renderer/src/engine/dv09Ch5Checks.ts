import type { Dv09Ctx } from './dv09Registry'
import type { StepCheck } from './workshopChecks'
import type { EventLogEntry, MotorModule } from './types'
import { useDv09Cm } from './dv09Cm'
import { usePictures } from './pictureStore'
import { savedPicture, sameName } from './dv09Operate'
import { deviceOptions } from './dv09Loops'
import { datalink } from './dv09Ch4Checks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const find = (events: EventLogEntry[], tag: string | null, re: RegExp, after = -1): number =>
  events.findIndex((e, i) => i > after && (tag === null || e.tag === tag) && re.test(e.description))
const ext = (text: string | undefined): Record<string, unknown> | null => { try { return text ? (JSON.parse(text) as { ext?: Record<string, unknown> }).ext ?? null : null } catch { return null } }
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const squash = (text: string): string => text.replace(/\s+/g, '')
const numberIn = (e: EventLogEntry | undefined): number => Number(/set to (-?[\d.]+)/.exec(e?.description ?? '')?.[1] ?? NaN)

/**
 * Course DV-09 chapter 5 (pp 5-12 .. 5-19): the motor control module MTR-102 from the MTR-11_ILOCK template (I/O, device options, CND1 / CND2 conditions,
 * displays, Save, Download), its datalinks and pump dynamo on Tank101 and the operating verification of the interlocks. Everything is read from the live
 * module, controller, picture and Event Journal state.
 */
export function checkDv09Ch5(ctx: Dv09Ctx): StepCheck[] {
  const { main, library } = ctx
  const cm = useDv09Cm.getState().cms['MTR-102']
  const pictures = usePictures.getState().pictures
  const events = main.eventLog
  const ctl = Object.values(main.hardware.controllers).find(c => c.trackDownload && c.commissioned)?.tag ?? ''
  const out: StepCheck[] = []
  const m = main.modules['MTR-102']?.type === 'MOTOR' ? main.modules['MTR-102'] as MotorModule : undefined
  const opts = m ? deviceOptions(m, cm) : undefined
  const cnd = (name: string) => m?.ownedBlocks?.[name]
  const binding = main.hardware.deviceBindings?.['MTR-102']
  const savedOf = ext(cm?.saved)
  const deployedOf = ext(cm?.deployed)
  const savedMeta = (() => { try { return JSON.parse(cm?.saved ?? '') as { controller?: string; primary?: string } } catch { return {} as { controller?: string; primary?: string } } })()
  const detailOk = (text: string | undefined): boolean => !!text && /(^|\D)2(\D|$)/.test(text) && !/16/.test(text) && text !== 'ILOCK16_DETAIL'
  const motorOk = (e: Record<string, unknown> | null): boolean => {
    const c = (e?.conditions ?? []) as [string, string, number, string][]
    const one = c.find(x => x[0] === 'CND1'), two = c.find(x => x[0] === 'CND2')
    return !!e && same(e.io, ['XI-2', 'ZX-2']) && same(e.options, [false, false, true, true, false, true]) && !!one && one[1] === 'XVSTAT-101 is closed' && squash(one[3]) === squash("'//XVSTAT-101/DI1/PV_D'=0") &&
      !!two && two[1] === 'Tank101 level is <50' && two[2] === 4 && squash(two[3]) === squash("'//LI-101/AI1/PV'<50") && detailOk(e.detail as string | undefined) && same((e.loop as { passiveWhenConfirmed?: boolean } | undefined)?.passiveWhenConfirmed, false)
  }

  // ---- Creating a Motor Control Module ------------------------------------------------------------------------------------------
  out.push(check('dv09-5a-1', !!cm && cm.template === 'MTR-11_ILOCK' && cm.area === 'PLANT_AREA_A', 'Step 1. A module copied from the MTR-11_ILOCK module template is in PLANT_AREA_A'))
  out.push(check('dv09-5a-2', !!cm && cm.template === 'MTR-11_ILOCK', `Step 2. The module was renamed MTR-102${cm ? '' : ' (no module with that name)'}`))
  out.push(check('dv09-5a-3', !!cm && find(events, 'MTR-102', /^Control Studio opened/) >= 0, 'Step 3. MTR-102 was opened with Control Studio'))
  out.push(check('dv09-5a-3a', binding?.input === 'XI-2', `IO_IN_1 of MTR-102 is ${binding?.input ?? 'not set'} (XI-2, card 3 channel 2)`))
  out.push(check('dv09-5a-3b', binding?.output === 'ZX-2', `IO_OUT_1 of MTR-102 is ${binding?.output ?? 'not set'} (ZX-2, card 4 channel 2)`))
  out.push(check('dv09-5a-3c', !!opts && !opts['Passive on Active Timeout'] && !opts['Passive when confirmed'] && !opts.Trip && !opts['SP Track'] && find(events, 'MTR-102', /DEVICE_OPTS .* unchecked/) >= 0,
    `DEVICE_OPTS: Passive on Active Timeout ${opts?.['Passive on Active Timeout'] ? 'checked' : 'not checked'}, Passive when confirmed ${opts?.['Passive when confirmed'] ? 'checked' : 'not checked'}, Trip ${opts?.Trip ? 'checked' : 'not checked'}, SP Track ${opts?.['SP Track'] ? 'checked' : 'not checked'} (all not checked)`))
  out.push(check('dv09-5a-3d', !!opts && opts['Reset required'] && opts.Permissive && opts.Interlock && find(events, 'MTR-102', /DEVICE_OPTS Reset required checked/) >= 0,
    `DEVICE_OPTS: Reset required ${opts?.['Reset required'] ? 'checked' : 'not checked'}, Permissive ${opts?.Permissive ? 'checked' : 'not checked'}, Interlock ${opts?.Interlock ? 'checked' : 'not checked'} (all checked)`))
  const one = cnd('CND1'), two = cnd('CND2')
  out.push(check('dv09-5a-4a', !!one && one.description === 'XVSTAT-101 is closed' && squash(one.expr) === squash("'//XVSTAT-101/DI1/PV_D'=0"), `CND1: DESC "${one?.description ?? ''}", Expression ${one?.expr ?? ''}`))
  out.push(check('dv09-5a-4b', !!two && two.description === 'Tank101 level is <50' && two.delaySec === 4 && squash(two.expr) === squash("'//LI-101/AI1/PV'<50"), `CND2: DESC "${two?.description ?? ''}", Time_Duration ${two?.delaySec ?? '?'} s, Expression ${two?.expr ?? ''}`))
  out.push(check('dv09-5a-5', !!ctl && library.assignments['MTR-102'] === ctl, `MTR-102 is assigned to ${ctl || 'the controller'} (${library.assignments['MTR-102'] ?? 'not assigned'})`))
  out.push(check('dv09-5a-6a', !!m && sameName(m.primaryDisplay, 'Tank101'), `Module Properties: primary display of MTR-102 is ${m?.primaryDisplay ?? '(none)'}`))
  out.push(check('dv09-5a-6b', !!m && detailOk(m.detailDisplay), `Module Properties: Detail display is ${m?.detailDisplay ?? '(none)'} (the detail for the 2 defined condition blocks, not the 16-condition default)`))
  out.push(check('dv09-5a-7a', !!cm && motorOk(savedOf) && savedMeta.controller === ctl && ctl !== '' && sameName(savedMeta.primary, 'Tank101'), 'MTR-102 was saved with its I/O, device options, conditions, displays and node assignment'))
  const dl = find(events, 'MTR-102', /^Module downloaded to /)
  out.push(check('dv09-5a-7b', !!cm && motorOk(deployedOf) && m?.downloaded === true && dl >= 0, `MTR-102 was downloaded to ${ctl || 'the controller'}${cm && cm.deployed && cm.saved !== cm.deployed ? ' (the saved configuration differs from the downloaded one)' : ''}`))

  // ---- Modifying an Operator Display --------------------------------------------------------------------------------------------
  const now = pictures.TANK101
  const saved = savedPicture(now)
  const cfg = dl >= 0 ? find(events, 'TANK101', /^Picture opened in Configure/, dl) : -1
  const pv = datalink(now, 'MTR-102', 'DC1/PV_D')
  const sp = datalink(now, 'MTR-102', 'DC1/SP_D')
  const al = datalink(now, 'MTR-102', 'ALARMS[1].A_LAALM')
  const pump = now?.elements.find(e => e.type === 'dynamo' && e.dynamoSet === 'PUMPS_ANIM' && e.tag === 'MTR-102')
  out.push(check('dv09-5b-1', cfg >= 0, 'Step 1. DeltaV Operate (Configure) was launched and the Tank101 display opened after MTR-102 was downloaded'))
  out.push(check('dv09-5b-2a', !!pv, `Step 2. ${pv ? 'Tank101 has the datalink MTR-102/DC1/PV_D.A_CV' : 'Tank101 does not have the datalink MTR-102/DC1/PV_D.A_CV yet'}`))
  out.push(check('dv09-5b-2b', sp?.entry?.method === 'DISCRETE' && find(events, 'TANK101', /^Data Entry Expert opened/, cfg) >= 0, `The datalink MTR-102/DC1/SP_D.A_CV ${sp ? (sp.entry?.method === 'DISCRETE' ? 'has Multi-Item Select data entry' : 'has no Multi-Item Select data entry yet') : 'is not on the picture yet'}`))
  out.push(check('dv09-5b-2c', !!al?.alarmVisibility && find(events, 'TANK101', /^Visibility Expert opened/, cfg) >= 0, `The datalink MTR-102/ALARMS[1].A_LAALM ${al ? (al.alarmVisibility ? 'is visible only when an alarm is active' : 'is not yet conditioned on the alarm') : 'is not on the picture yet'}`))
  out.push(check('dv09-5b-3', !!pump, `Step 3. ${pump ? 'The dynamo PumpAnimC1 of PumpsAnim is on the picture' : 'No PumpAnimC1 dynamo for MTR-102 on the picture yet'}`))
  const colorAt = find(events, 'TANK101', /^Pump color animation: /)
  const colorText = events[colorAt]?.description ?? ''
  out.push(check('dv09-5b-4', !!pump?.dynamoColors && colorAt >= 0, `Step 4. The Color By dialog of the pump was used${pump?.dynamoColors ? '' : ' (no pump color animation yet)'}`))
  out.push(check('dv09-5b-5a', /MTR-102\/DC1\/PV_D\.F_CV/.test(colorText) && !!pump?.dynamoColors, `Step 5. Color By Data Source: ${/MTR-102\/DC1\/PV_D\.F_CV/.test(colorText) ? 'MTR-102/DC1/PV_D.F_CV' : '(not set)'}`))
  out.push(check('dv09-5b-5b', /Current Value, Exact Match/.test(colorText) && !!pump?.dynamoColors, `Color By: ${/Current Value, Exact Match/.test(colorText) ? 'Current Value, Exact Match' : '(not set)'}`))
  out.push(check('dv09-5b-5c', pump?.dynamoColors?.inactive === '#ffffff', `Value 0: ${pump?.dynamoColors?.inactive ?? '(no color)'} (White)`))
  out.push(check('dv09-5b-5d', pump?.dynamoColors?.active === '#ffff00', `Value 1: ${pump?.dynamoColors?.active ?? '(no color)'} (Yellow)`))
  const save = cfg >= 0 ? find(events, 'TANK101', /^Picture saved/, Math.max(cfg, colorAt)) : -1
  out.push(check('dv09-5b-6', save >= 0 && !!datalink(saved, 'MTR-102', 'DC1/PV_D') && !!datalink(saved, 'MTR-102', 'DC1/SP_D')?.entry && !!datalink(saved, 'MTR-102', 'ALARMS[1].A_LAALM')?.alarmVisibility &&
    !!saved?.elements.some(e => e.dynamoSet === 'PUMPS_ANIM' && e.tag === 'MTR-102' && !!e.dynamoColors), 'Step 6. Tank101 was saved with the MTR-102 datalinks and the animated pump'))

  // ---- Operating the Motor Control Module ---------------------------------------------------------------------------------------
  const run = save >= 0 ? find(events, null, /^(Operate switched to Run|Picture opened in Run)/, save) : -1
  const open = run >= 0 ? find(events, 'XV-101', /^XV-101\/DO1\/SP_D set to 1$/, run) : -1
  const fillAt = run >= 0 ? events.findIndex((e, i) => i > run && e.tag === 'LEVEL-101' && /^CAS_SP\.CV set to /.test(e.description) && numberIn(e) === 500) : -1
  const start = fillAt >= 0 ? find(events, 'MTR-102', /^Start command issued/, fillAt) : -1
  const running = start >= 0 ? find(events, 'MTR-102', /DC1\/PV_D changed to RUNNING/, start) : -1
  const stop = running >= 0 ? find(events, 'MTR-102', /^Stop command issued/, running) : -1
  const stopped = stop >= 0 ? find(events, 'MTR-102', /DC1\/PV_D changed to STOPPED/, stop) : -1
  const closeAt = stopped >= 0 ? find(events, 'XV-101', /^XV-101\/DO1\/SP_D set to 0$/, stopped) : -1
  const trip1 = closeAt >= 0 ? find(events, 'MTR-102', /INTERLOCK_D tripped \(first out CND1/, closeAt) : -1
  const lowAt = trip1 >= 0 ? events.findIndex((e, i) => i > trip1 && e.tag === 'LEVEL-101' && /^CAS_SP\.CV set to /.test(e.description) && numberIn(e) < 50) : -1
  const trip2 = lowAt >= 0 ? find(events, 'MTR-102', /INTERLOCK_D tripped \(first out CND2/, lowAt) : -1
  out.push(check('dv09-5c-1', run >= 0, 'Step 1. DeltaV Operate was switched to Run after Tank101 was saved'))
  out.push(check('dv09-5c-2', open >= 0 || start >= 0, `Step 2. XV-101 was energized (open) in Run${open < 0 && start >= 0 ? ' (it was already energized)' : ''}${main.modules['XVSTAT-101']?.type === 'DI' ? `; XVSTAT-101 reads ${main.modules['XVSTAT-101'].state ? 'open' : 'closed'}` : ''}`))
  out.push(check('dv09-5c-3', fillAt >= 0, `Step 3. The level of Tank101 was set to 500 gallons${main.modules['LI-101']?.type === 'AI' ? ` (LI-101 now ${main.modules['LI-101'].pv.toFixed(0)})` : ''}`))
  out.push(check('dv09-5c-4', running >= 0 && stopped >= 0, `Step 4. MTR-102 ${running >= 0 ? 'was started (RUNNING)' : 'has not been started by its SP_D yet'}${stopped >= 0 ? ' and stopped again (STOPPED)' : ''}`))
  out.push(check('dv09-5c-5', trip1 >= 0, `Step 5. XV-101 was de-energized and the interlock ${trip1 >= 0 ? 'tripped (first out CND1: XVSTAT-101 is closed)' : 'did not occur yet'}`))
  out.push(check('dv09-5c-6', trip2 >= 0, `Step 6. The level was lowered below 50 gallons and the interlock ${trip2 >= 0 ? 'tripped (first out CND2: Tank101 level is <50)' : 'did not occur yet'}`))
  return out
}
