import type { Dv09Ctx } from './dv09Registry'
import type { StepCheck } from './workshopChecks'
import type { EventLogEntry, AnalogIndicator, AnalogOutputModule } from './types'
import { useDv09Cm, type Dv09Cm } from './dv09Cm'
import { usePictures, type PicElement, type Picture } from './pictureStore'
import { savedPicture, sameName } from './dv09Operate'
import { useChronicle } from './eventChronicle'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const find = (events: EventLogEntry[], tag: string | null, re: RegExp, after = -1): number =>
  events.findIndex((e, i) => i > after && (tag === null || e.tag === tag) && re.test(e.description))
const findCategory = (events: EventLogEntry[], category: string, tag: string, re: RegExp, after = -1): number =>
  events.findIndex((e, i) => i > after && e.category === category && e.tag === tag && re.test(e.description))
const ext = (text: string | undefined): Record<string, unknown> | null => { try { return text ? (JSON.parse(text) as { ext?: Record<string, unknown> }).ext ?? null : null } catch { return null } }
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A datalink of the picture: module, path. */
export const datalink = (p: Picture | null | undefined, tag: string, path: string): PicElement | undefined =>
  p?.elements.find(e => e.type === 'datalink' && e.tag === tag && e.path === path)
const alarmLink = (p: Picture | null | undefined): PicElement | undefined => datalink(p, 'LI-101', 'ALARMS[1].A_LAALM')

/**
 * Course DV-09 chapter 4 (pp 4-8 .. 4-54): LEVEL-101 (Analog Output), LI-101 (ANALOG template, HI 950 / LO 100), the Tank101 operator display
 * (datalinks, Data Entry Expert, tank, rectangle fill, alarm datalinks, Visibility Expert) and operating them. Everything is read from the
 * live module, controller, picture and Event Journal state.
 */
export function checkDv09Ch4(ctx: Dv09Ctx): StepCheck[] {
  const { main, library } = ctx
  const cms = useDv09Cm.getState().cms
  const pictures = usePictures.getState().pictures
  const events = main.eventLog
  const ctl = Object.values(main.hardware.controllers).find(c => c.trackDownload && c.commissioned)?.tag ?? ''
  const out: StepCheck[] = []
  const now = pictures.TANK101
  const saved = savedPicture(now)
  const savedController = (cm: Dv09Cm): string | undefined => { try { return (JSON.parse(cm.saved ?? '') as { controller?: string }).controller } catch { return undefined } }
  const savedPrimary = (cm: Dv09Cm): string => { try { return (JSON.parse(cm.saved ?? '') as { primary?: string }).primary ?? '' } catch { return '' } }

  // ---- Creating the Analog Output module LEVEL-101 -------------------------------------------------------------------------
  const lv = cms['LEVEL-101']
  const ao = main.modules['LEVEL-101']?.type === 'AO' ? main.modules['LEVEL-101'] as AnalogOutputModule : undefined
  const aoSaved = ext(lv?.saved)
  const aoDeployed = ext(lv?.deployed)
  const aoOk = (e: Record<string, unknown> | null): boolean => !!e && e.io === 'LY-1' && same(e.scale, [0, 1000, 'gal']) && same(e.limits, [0, 1000]) && e.cas === 'CAS_SP'
  out.push(check('dv09-4a-1', !!lv && lv.area === 'PLANT_AREA_A' && lv.blocks.some(b => b.type === 'AO') && !!ao, `Step 1. LEVEL-101 in PLANT_AREA_A contains the Analog Output block AO1 from the IO palette${lv ? '' : ' (no module LEVEL-101 yet)'}`))
  out.push(check('dv09-4a-2a', main.hardware.analogBindings?.['LEVEL-101']?.output === 'LY-1', `IO_OUT of LEVEL-101 is ${main.hardware.analogBindings?.['LEVEL-101']?.output ?? 'not set'} (DST LY-1)`))
  out.push(check('dv09-4a-2b', !!ao && ao.pvMin === 0 && ao.pvMax === 1000 && ao.unit.trim().toLowerCase() === 'gal', `PV_SCALE of LEVEL-101 is ${ao ? `${ao.pvMin} - ${ao.pvMax} ${ao.unit}` : 'not available'} (0 - 1000 gal)`))
  out.push(check('dv09-4a-2c', !!ao && ao.spHigh === 1000, `SP_HI_LIM of LEVEL-101 is ${ao?.spHigh ?? 'not available'} (1000)`))
  out.push(check('dv09-4a-2d', !!ao && ao.spLow === 0 && ao.spHigh === 1000 && find(events, 'LEVEL-101', /^AO1 SP limits set to 0 - 1000/) >= 0, `SP_LO_LIM of LEVEL-101 is ${ao?.spLow ?? 'not available'} (0)`))
  out.push(check('dv09-4a-3', !!lv && !!lv.params?.some(p => p.name === 'CAS_SP' && p.type === 'Floating Point') && !!ao?.parameters.CAS_SP, `The Floating Point input parameter CAS_SP ${ao?.parameters.CAS_SP ? 'exists' : 'does not exist yet'} on LEVEL-101`))
  out.push(check('dv09-4a-4', !!ao && ao.casParameter === 'CAS_SP' && !!lv?.wires?.some(w => w.from === 'CAS_SP' && w.to === 'AO1.CAS_IN'), `CAS_SP is connected to Cas_In of AO1 (${ao?.casParameter ?? 'not connected'})`))
  out.push(check('dv09-4a-5', !!ctl && library.assignments['LEVEL-101'] === ctl, `LEVEL-101 is assigned to ${ctl || 'the controller'} (${library.assignments['LEVEL-101'] ?? 'not assigned'})`))
  out.push(check('dv09-4a-6a', find(events, 'LEVEL-101', /^Module Properties opened/) >= 0, 'The module Properties of LEVEL-101 were opened'))
  out.push(check('dv09-4a-6b', !!lv && aoOk(aoSaved) && savedController(lv) === ctl && ctl !== '', 'LEVEL-101 was saved with its I/O, scale, SP limits, CAS_SP wire and node assignment'))
  const dlAo = find(events, 'LEVEL-101', /^Module downloaded to /)
  out.push(check('dv09-4a-7', !!lv && aoOk(aoDeployed) && ao?.downloaded === true && dlAo >= 0, `LEVEL-101 was downloaded to ${ctl || 'the controller'}${lv && lv.deployed && lv.saved !== lv.deployed ? ' (the saved configuration differs from the downloaded one)' : ''}`))

  // ---- Using the ANALOG module template: LI-101 -----------------------------------------------------------------------------
  const li = cms['LI-101']
  const ai = main.modules['LI-101']?.type === 'AI' ? main.modules['LI-101'] as AnalogIndicator : undefined
  const alarm = (type: string) => ai?.alarms.find(a => a.type === type)
  const aiSaved = ext(li?.saved)
  const aiDeployed = ext(li?.deployed)
  const aiOk = (e: Record<string, unknown> | null): boolean => {
    const alarms = (e?.alarms ?? []) as { type: string; limit?: number; enabled: boolean }[]
    return !!e && e.io === 'LT-1' && same(e.scale, [0, 1000, 'gal']) && alarms.some(a => a.type === 'HI' && a.limit === 950 && a.enabled) && alarms.some(a => a.type === 'LO' && a.limit === 100 && a.enabled)
  }
  out.push(check('dv09-4b-1', !!li && li.template === 'ANALOG' && li.area === 'PLANT_AREA_A', 'Step 1. A module copied from the ANALOG module template is in PLANT_AREA_A'))
  out.push(check('dv09-4b-2', !!li && li.template === 'ANALOG', `Step 2. The module was renamed LI-101${li ? '' : ' (no module with that name)'}`))
  out.push(check('dv09-4b-3', !!li && find(events, 'LI-101', /^Control Studio opened/) >= 0, 'Step 3. LI-101 was opened with Control Studio'))
  out.push(check('dv09-4b-3a', main.hardware.analogBindings?.['LI-101']?.input === 'LT-1', `IO_IN of LI-101 is ${main.hardware.analogBindings?.['LI-101']?.input ?? 'not set'} (DST LT-1)`))
  out.push(check('dv09-4b-3b', !!ai && ai.pvMin === 0 && ai.pvMax === 1000 && ai.unit.trim().toLowerCase() === 'gal', `OUT_SCALE of LI-101 is ${ai ? `${ai.pvMin} - ${ai.pvMax} ${ai.unit}` : 'not available'} (0 - 1000 gal)`))
  out.push(check('dv09-4b-3c', alarm('HI')?.limit === 950 && !!alarm('HI')?.enabled, `HI_ALM limit of LI-101 is ${alarm('HI')?.limit ?? 'not available'}${alarm('HI')?.enabled ? '' : ' (alarm not enabled)'} (950)`))
  out.push(check('dv09-4b-3d', alarm('LO')?.limit === 100 && !!alarm('LO')?.enabled, `LO_ALM limit of LI-101 is ${alarm('LO')?.limit ?? 'not available'}${alarm('LO')?.enabled ? '' : ' (alarm not enabled)'} (100)`))
  out.push(check('dv09-4b-3e', !!ctl && library.assignments['LI-101'] === ctl && !!ai && sameName(ai.primaryDisplay, 'TANK101'), `LI-101 is assigned to ${ctl || 'the controller'} (${library.assignments['LI-101'] ?? 'not assigned'}) with the primary display ${ai?.primaryDisplay ?? '(none)'}`))
  out.push(check('dv09-4b-3f', !!li && aiOk(aiSaved) && savedPrimary(li).toUpperCase() === 'TANK101' && savedController(li) === ctl && ctl !== '', 'LI-101 was saved with its DST, scale, alarm limits, primary display and node assignment'))
  const dlAi = find(events, 'LI-101', /^Module downloaded to /)
  out.push(check('dv09-4b-3g', !!li && aiOk(aiDeployed) && ai?.downloaded === true && dlAi >= 0, `LI-101 was downloaded to ${ctl || 'the controller'}${li && li.deployed && li.saved !== li.deployed ? ' (the saved configuration differs from the downloaded one)' : ''}`))

  // ---- Modifying the Operator Display (Tank101): level, tank and fill ---------------------------------------------------------
  const after = Math.max(dlAo, dlAi)
  const cfg1 = after >= 0 ? find(events, 'TANK101', /^Picture opened in Configure/, after) : -1
  const piDl = datalink(now, 'LI-101', 'AI1/PV')
  const spDl = datalink(now, 'LEVEL-101', 'CAS_SP')
  const rect = now?.elements.find(e => e.type === 'rectangle' && e.path === 'AI1/PV' && e.tag === 'LI-101') ?? now?.elements.find(e => e.type === 'rectangle')
  const tank = now?.elements.find(e => e.type === 'tank')
  out.push(check('dv09-4c-1', cfg1 >= 0 && find(events, 'DeltaV Operate', /^Operate switched to Configure/, after) >= 0, 'Step 1. DeltaV Operate (Configure) was launched and the Tank101 display opened after the modules were downloaded'))
  out.push(check('dv09-4c-2', !!piDl, `Step 2. Tank101 has the datalink LI-101/AI1/PV.F_CV${piDl ? '' : ' (not on the picture yet)'}`))
  out.push(check('dv09-4c-3', !!spDl, `Step 3. Tank101 has the datalink LEVEL-101/CAS_SP.F_CV${spDl ? '' : ' (not on the picture yet)'}`))
  out.push(check('dv09-4c-4', find(events, 'TANK101', /^Datalink DVSYS\.LEVEL-101\/CAS_SP\.F_CV added \(data entry None/) >= 0, 'Step 4. The LEVEL-101/CAS_SP datalink was created with Data Entry set to None'))
  const expertAt = find(events, 'TANK101', /^Data Entry Expert opened/, cfg1)
  out.push(check('dv09-4c-5', cfg1 >= 0 && expertAt >= 0, 'Step 5. The Data Entry Expert was opened with the datalink selected'))
  const entry = spDl?.entry
  out.push(check('dv09-4c-6', entry?.method === 'NUMERIC' && entry.fetchLimits === false && entry.low === 0 && entry.high === 1000, `Step 6. Data Entry Expert of CAS_SP: ${entry?.method === 'NUMERIC' ? `Numeric Entry, ${entry.fetchLimits ? 'limits fetched from the data source' : `limits ${entry.low} - ${entry.high}`}` : 'no entry method set'}`))
  out.push(check('dv09-4c-8', !!tank, `Step 8. ${tank ? 'A tank from the dynamo set Tanks is on the picture' : 'No tank dynamo on the picture yet'}`))
  out.push(check('dv09-4c-9', !!rect, `Step 9. ${rect ? 'A rectangle is on the picture' : 'No rectangle on the picture yet'}`))
  out.push(check('dv09-4c-10', !!rect && (rect.color !== undefined || rect.backgroundColor !== undefined), `Step 10. The rectangle ${rect && (rect.color || rect.backgroundColor) ? `has the colors ${rect.color ?? '-'} / ${rect.backgroundColor ?? '-'}` : 'has no color chosen yet'}`))
  out.push(check('dv09-4c-11', !!rect?.fill, `Step 11. The Fill Percentage animation ${rect?.fill ? 'is on' : 'is not checked'} for the rectangle`))
  out.push(check('dv09-4c-12', !!rect?.fill && rect.tag === 'LI-101' && rect.path === 'AI1/PV', `Step 12. Fill data source: ${rect?.fill ? `${rect.tag}/${rect.path}` : '(none)'} (LI-101/AI1/PV)`))
  out.push(check('dv09-4c-13', !!rect?.fill && rect.fill.vertical && rect.fill.fetchLimits, `Step 13. Vertical Direction ${rect?.fill?.vertical ? 'is' : 'is not'} checked and Fetch Limits from Data Source ${rect?.fill?.fetchLimits ? 'is' : 'is not'} checked`))
  const save1 = cfg1 >= 0 ? find(events, 'TANK101', /^Picture saved/, cfg1) : -1
  const sRect = saved?.elements.find(e => e.type === 'rectangle' && e.tag === 'LI-101' && e.path === 'AI1/PV' && !!e.fill?.vertical && !!e.fill.fetchLimits)
  out.push(check('dv09-4c-14', save1 >= 0 && !!datalink(saved, 'LI-101', 'AI1/PV') && !!datalink(saved, 'LEVEL-101', 'CAS_SP')?.entry && !!sRect && !!saved?.elements.some(e => e.type === 'tank'), 'Step 14. Tank101 was saved with the datalinks, the tank and the filled rectangle'))

  // ---- Operating the Analog Module (p4-20) -------------------------------------------------------------------------------------
  const run1 = save1 >= 0 ? find(events, null, /^(Operate switched to Run|Picture opened in Run)/, save1) : -1
  const wrote1 = run1 >= 0 ? find(events, 'LEVEL-101', /^CAS_SP\.CV set to /, run1) : -1
  const tracks = !!ao && !!ai && !ai.pvBad && Math.abs(ai.pv - ao.pv) < 1
  out.push(check('dv09-4d-1', run1 >= 0, 'Step 1. DeltaV Operate was switched to Run after the picture was saved'))
  out.push(check('dv09-4d-2', wrote1 >= 0 && tracks, `Step 2. LEVEL-101 CAS_SP was written in Run and LI-101 follows it${ai && ao ? ` (LEVEL-101 ${ao.pv.toFixed(1)}, LI-101 ${ai.pv.toFixed(1)} ${ai.unit})` : ''}`))

  // ---- Modifying the Operator Display (p4-38): HI_ALM and LO_ALM datalinks --------------------------------------------------
  const cfg2 = run1 >= 0 ? find(events, 'TANK101', /^Picture opened in Configure/, run1) : -1
  const hiDl = datalink(now, 'LI-101', 'HI_ALM')
  const loDl = datalink(now, 'LI-101', 'LO_ALM')
  const addedHi = cfg2 >= 0 ? find(events, 'TANK101', /^Datalink DVSYS\.LI-101\/HI_ALM(?:\.\w+)? added/, cfg2) : -1
  const addedLo = cfg2 >= 0 ? find(events, 'TANK101', /^Datalink DVSYS\.LI-101\/LO_ALM(?:\.\w+)? added/, cfg2) : -1
  const save2 = addedHi >= 0 && addedLo >= 0 ? find(events, 'TANK101', /^Picture saved/, Math.max(addedHi, addedLo)) : -1
  const close2 = save2 >= 0 ? find(events, 'TANK101', /^Picture closed/, save2) : -1
  out.push(check('dv09-4e-1', cfg2 >= 0, 'Step 1. DeltaV Operate (Configure) was launched again and the Tank101 display opened'))
  out.push(check('dv09-4e-2a', addedHi >= 0, 'Step 2. The datalink LI-101/HI_ALM.A_CV was added'))
  out.push(check('dv09-4e-2b', addedLo >= 0, 'The datalink LI-101/LO_ALM.A_CV was added'))
  out.push(check('dv09-4e-3', save2 >= 0 && close2 >= 0, 'Step 3. Tank101 was saved with both alarm datalinks and closed'))

  // ---- Operating the Analog Module (p4-39) ------------------------------------------------------------------------------------
  const run2 = close2 >= 0 ? find(events, null, /^(Operate switched to Run|Picture opened in Run)/, close2) : -1
  const hiAt = run2 >= 0 ? findCategory(events, 'ALARM', 'LI-101', /^HI alarm/, run2) : -1
  const loAt = run2 >= 0 ? findCategory(events, 'ALARM', 'LI-101', /^LO alarm/, run2) : -1
  const hiAck = hiAt >= 0 ? findCategory(events, 'ACK', 'LI-101', /^HI alarm acknowledged/, hiAt) : -1
  const loAck = loAt >= 0 ? findCategory(events, 'ACK', 'LI-101', /^LO alarm acknowledged/, loAt) : -1
  out.push(check('dv09-4f-1', run2 >= 0, 'Step 1. DeltaV Operate was switched to Run'))
  out.push(check('dv09-4f-2', hiAt >= 0 && loAt >= 0 && hiAck >= 0 && loAck >= 0, `Step 2. LI-101's HIGH alarm ${hiAt >= 0 ? 'occurred' : 'has not occurred'}${hiAck >= 0 ? ' and was acknowledged' : ''}; its LOW alarm ${loAt >= 0 ? 'occurred' : 'has not occurred'}${loAck >= 0 ? ' and was acknowledged' : ''}`))

  // ---- Modifying the Operator Display (pp 4-52, 4-53): ALARMS[1] and the Visibility Expert -------------------------------------
  const cfg3 = run2 >= 0 ? find(events, 'TANK101', /^Picture opened in Configure/, run2) : -1
  const del = cfg3 >= 0 ? find(events, 'TANK101', /^Object deleted/, cfg3) : -1
  const al = alarmLink(now)
  const addedAl = cfg3 >= 0 ? find(events, 'TANK101', /^Datalink DVSYS\.LI-101\/ALARMS\[1\]\.A_LAALM(?:\.F_CV)? added/, cfg3) : -1
  const expert2 = addedAl >= 0 ? find(events, 'TANK101', /^Visibility Expert opened/, addedAl) : -1
  const vis = expert2 >= 0 ? find(events, 'TANK101', /^Visibility Expert: LI-101\/ALARMS\[1\]\.F_LAALM/, expert2) : -1
  const save3 = cfg3 >= 0 ? find(events, 'TANK101', /^Picture saved/, Math.max(vis, cfg3)) : -1
  out.push(check('dv09-4g-1', cfg3 >= 0, 'Step 1. DeltaV Operate (Configure) was launched again and the Tank101 display opened'))
  out.push(check('dv09-4g-2', del >= 0 && !hiDl && !loDl, `Step 2. The HI_ALM and LO_ALM datalinks ${!hiDl && !loDl ? 'are deleted' : 'are still on the display'}`))
  out.push(check('dv09-4g-3', addedAl >= 0 && !!al, `Step 3. ${al ? 'The datalink LI-101/ALARMS[1].A_LAALM is on the display' : 'The datalink LI-101/ALARMS[1].A_LAALM is not on the display'}`))
  out.push(check('dv09-4g-4', expert2 >= 0, 'Step 4. The Visibility Expert was opened with the alarm datalink selected'))
  out.push(check('dv09-4g-5', vis >= 0, 'Step 5. The Visibility Expert data source is LI-101/ALARMS[1].F_LAALM'))
  out.push(check('dv09-4g-6', !!al?.alarmVisibility, `Step 6. The alarm datalink is ${al?.alarmVisibility ? 'visible only when an alarm is active' : 'not yet conditioned on the alarm'}`))
  out.push(check('dv09-4g-8', save3 >= 0 && !!alarmLink(saved)?.alarmVisibility, 'Step 8. Tank101 was saved with the alarm datalink and its Visibility Expert condition'))

  // ---- Operating the Analog Module (p4-54) ------------------------------------------------------------------------------------
  const run3 = save3 >= 0 ? find(events, null, /^(Operate switched to Run|Picture opened in Run)/, save3) : -1
  const alarm3 = run3 >= 0 ? findCategory(events, 'ALARM', 'LI-101', /alarm/, run3) : -1
  const history = run3 >= 0 ? find(events, null, /^Process History View \(Event Chronicle\) opened/, run3) : -1
  out.push(check('dv09-4h-1', run3 >= 0, 'Step 1. DeltaV Operate was switched to Run after Tank101 was saved'))
  out.push(check('dv09-4h-2', run3 >= 0 && alarm3 >= 0 && !!alarmLink(saved)?.alarmVisibility, `Step 2. An LI-101 alarm occurred in Run with the ALARMS[1].A_LAALM datalink on the display${alarm3 >= 0 ? '' : ' (raise one by writing the CAS_SP datalink)'}`))
  const chronicle = useChronicle.getState()
  const recorded = chronicle.archive.records.filter(r => r.tag === 'LI-101' && r.category === 'ALARM').length
  out.push(check('dv09-4h-3', history >= 0 && !!chronicle.deployed?.enabled && recorded > 0, `Step 3. The Event Chronicle (Process History View) ${history < 0 ? 'was not opened yet' : !chronicle.deployed?.enabled ? 'is not recording: enable it and download it, then raise an alarm again' : recorded > 0 ? `records the alarms (${recorded} LI-101 alarm record(s))` : 'is recording but has no LI-101 alarm yet; raise one'}`))
  return out
}
