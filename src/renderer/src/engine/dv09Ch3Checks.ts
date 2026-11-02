import type { Dv09Ctx } from './dv09Registry'
import type { StepCheck } from './workshopChecks'
import type { EventLogEntry } from './types'
import { signatureFor, useDv09Cm, type Dv09Cm } from './dv09Cm'
import { usePictures, type Picture } from './pictureStore'
import { PICTURE_TEMPLATES } from './pictureObjects'
import { MAIN_TEMPLATE_TEXT, OVW_REF, savedPicture, sameName } from './dv09Operate'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** First event index (chronological) that matches, searching after `after`. */
const find = (events: EventLogEntry[], tag: string, re: RegExp, after = -1): number =>
  events.findIndex((e, i) => i > after && e.tag === tag && re.test(e.description))
const findAny = (events: EventLogEntry[], re: RegExp, after = -1): number => events.findIndex((e, i) => i > after && re.test(e.description))

interface Saved { ioDst: string; modeTarget: string | null; alarmOn: boolean | null; primary: string; controller: string }
const parse = (text: string | undefined): Saved | null => { try { return text ? JSON.parse(text) as Saved : null } catch { return null } }

/** The Tank101 picture and what its last File > Save stored (null while nothing was saved). */
const tank = (pictures: Record<string, Picture>): { now?: Picture; saved: Picture | null } => ({ now: pictures.TANK101, saved: savedPicture(pictures.TANK101) })

/**
 * Course DV-09 chapter 3 (pp 3-12 .. 3-50): modules XV-101 and XVSTAT-101 (Explorer + Control Studio), the picture Tank101
 * (DeltaV Operate Configure), a datalink, text and a dynamo, and operating it in Run. Everything is read from the live
 * module, controller, picture and Event Journal state; the Operate and Studio windows leave Event Journal entries.
 */
export function checkDv09Ch3(ctx: Dv09Ctx): StepCheck[] {
  const { main, library } = ctx
  const cms = useDv09Cm.getState().cms
  const pictures = usePictures.getState().pictures
  const events = main.eventLog
  const controller = Object.values(main.hardware.controllers).find(c => c.trackDownload && c.commissioned)
  const ctl = controller?.tag ?? ''
  const sig = (cm: Dv09Cm | undefined): string => signatureFor(main, library.assignments, cm)
  const out: StepCheck[] = []

  /** The steps shared by the two modules: bound DST, assignment, Properties, Save, Download, On-Line. */
  const common = (tag: string, cm: Dv09Cm | undefined, ids: Record<'io' | 'assign' | 'props' | 'save' | 'download', string>, dst: string, label: string): number => {
    const m = main.modules[tag]
    const saved = parse(cm?.saved)
    const deployed = parse(cm?.deployed)
    out.push(check(ids.io, main.hardware.discreteBindings?.[tag] === dst && !!m, `${label} is bound to the DST ${dst} (${m ? 'now ' + (main.hardware.discreteBindings?.[tag] || 'unbound') : 'the block does not exist yet'})`))
    out.push(check(ids.assign, !!ctl && library.assignments[tag] === ctl, `${tag} is assigned to the controller ${ctl || '(none commissioned)'} (${library.assignments[tag] ?? 'not assigned'})`))
    out.push(check(ids.props, !!m && 'primaryDisplay' in m && sameName(m.primaryDisplay, 'Tank101'), `Module Properties: primary control display of ${tag} is ${m && 'primaryDisplay' in m && m.primaryDisplay ? m.primaryDisplay : '(none)'}`))
    out.push(check(ids.save, !!cm && !!saved && saved.ioDst === dst && saved.primary.toUpperCase() === 'TANK101' && saved.controller === ctl && ctl !== '',
      `${tag} was saved with its DST, node assignment and primary control display${cm && sig(cm) !== cm.saved ? ' (later changes are not saved yet)' : ''}`))
    const downloadAt = find(events, tag, /^Module downloaded to /)
    out.push(check(ids.download, !!cm && !!deployed && deployed.ioDst === dst && deployed.controller === ctl && ctl !== '' && main.modules[tag]?.type !== undefined && (main.modules[tag] as { downloaded?: boolean }).downloaded === true && downloadAt >= 0,
      `${tag} was downloaded to ${ctl || 'the controller'} from Control Studio${cm && cm.deployed !== sig(cm) ? ' (changed since; download again)' : ''}`))
    return downloadAt
  }

  // ---- Workshop - Creating Module XV-101 -------------------------------------------------------------------------
  {
    const tag = 'XV-101'
    const cm = cms[tag]
    const m = main.modules[tag]
    out.push(check('dv09-3a-1', !!cm && cm.area === 'PLANT_AREA_A', `Step 1. ${tag} exists in PLANT_AREA_A (right-click Plant_Area_A > New > Control Module)${cm ? ` (area ${cm.area})` : ''}`))
    out.push(check('dv09-3a-2', !!cm && find(events, tag, /^Control Studio opened/) >= 0, `Step 2. ${tag} was opened with Control Studio`))
    out.push(check('dv09-3a-3', !!cm && cm.blocks.some(b => b.type === 'DO') && m?.type === 'DO', `Step 3. ${tag} contains the Discrete Output block DO1 from the IO palette`))
    out.push(check('dv09-3a-4', !!cm && cm.filters.length > 0, 'Step 4. The Filtered by dialog of the parameter window was used'))
    out.push(check('dv09-3a-5', !!cm && cm.filters.includes('Quick Configuration') && cm.filters.includes('Common Configuration'), `Step 5. Filtered by: ${cm?.filters.join(', ') || 'nothing'} (Quick Configuration and Common Configuration)`))
    const downloadAt = common(tag, cm, { io: 'dv09-3a-6', assign: 'dv09-3a-8', props: 'dv09-3a-9', save: 'dv09-3a-10', download: 'dv09-3a-11' }, 'XV-1', 'IO_OUT')
    out.push(check('dv09-3a-7', m?.type === 'DO' && m.modeTarget === 'AUTO', `Step 7. DO1 MODE target is ${m?.type === 'DO' ? m.modeTarget ?? 'AUTO' : 'not available'} (Cascade changed to Auto)`))
    const onlineAt = downloadAt >= 0 ? find(events, tag, /^On-Line view selected in Control Studio/, downloadAt) : -1
    out.push(check('dv09-3a-12', onlineAt >= 0, `Step 12. The On-Line view of ${tag} was selected after the download`))
    const blockAt = onlineAt >= 0 ? find(events, tag, /^DO1 function block selected in Control Studio/, onlineAt) : -1
    out.push(check('dv09-3a-13', blockAt >= 0, 'Step 13. The DO function block was selected in the on-line view'))
    const writeAt = blockAt >= 0 ? find(events, tag, /^XV-101\/DO1\/SP_D set to 1$/, blockAt) : -1
    const onAt = writeAt >= 0 ? find(events, tag, /^XV-101\/DO1\/OUT_D: card 4 channel 1 \(XV-1/, writeAt) : -1
    out.push(check('dv09-3a-14', writeAt >= 0 && onAt >= 0, `Step 14. SP_D was set to 1 and card 4 channel 1 (XV-1) is on${writeAt >= 0 && onAt < 0 ? ' (the channel did not turn on)' : ''}`))
  }

  // ---- Workshop - Creating Module XVSTAT-101 ---------------------------------------------------------------------
  {
    const tag = 'XVSTAT-101'
    const cm = cms[tag]
    const m = main.modules[tag]
    const downloadedAt = find(events, tag, /^Module downloaded to /)
    out.push(check('dv09-3b-2', !!cm && cm.template === 'DISCRETE' && cm.area === 'PLANT_AREA_A', 'Step 2. A module copied from the DISCRETE module template is in PLANT_AREA_A'))
    out.push(check('dv09-3b-3', !!cm && cm.template === 'DISCRETE', `Step 3. The module was renamed XVSTAT-101${cm ? '' : ' (no module with that name)'}`))
    out.push(check('dv09-3b-4', !!cm && find(events, tag, /^Control Studio opened/) >= 0, `Step 4. ${tag} was opened with Control Studio`))
    common(tag, cm, { io: 'dv09-3b-5a', assign: 'dv09-3b-5c', props: 'dv09-3b-5d', save: 'dv09-3b-5e', download: 'dv09-3b-5f' }, 'LSO-1', 'IO_IN')
    out.push(check('dv09-3b-5b', m?.type === 'DI' && m.alarmOnValue === false, `Step 5b. The Discrete Alarm of ${tag} alarms on a value of ${m?.type === 'DI' ? Number(m.alarmOnValue ?? true) : '?'}`))
    const onlineAt = downloadedAt >= 0 ? find(events, tag, /^On-Line view selected in Control Studio/, downloadedAt) : -1
    out.push(check('dv09-3b-5g', onlineAt >= 0 && m?.type === 'DI' && !m.ioBad, `Step 5g. The On-Line view of ${tag} shows a good value${m?.type === 'DI' ? ` (PV_D ${Number(m.state)}, ${m.ioBad ? 'bad' : 'good'})` : ''}`))
  }

  // ---- Workshop - Creating a New Picture ----------------------------------------------------------------------------
  const { now, saved } = tank(pictures)
  const launchAt = findAny(events, /^DeltaV Operate launched/)
  const configureAt = findAny(events, /^Operate switched to Configure/, launchAt)
  out.push(check('dv09-3c-1', launchAt >= 0, 'Step 1. DeltaV Operate was launched (the Operate button of the Explorer window)'))
  out.push(check('dv09-3c-2', launchAt >= 0 && configureAt >= 0, 'Step 2. DeltaV Operate was switched to Configure (CTRL-W)'))
  out.push(check('dv09-3c-3', !!now && now.template === 'MAIN', 'Step 3. The picture Tank101 was created from the main template (New Picture)'))
  out.push(check('dv09-3c-4', !!now && now.background !== undefined && now.background !== PICTURE_TEMPLATES.MAIN.background,
    `Step 4. Edit > Picture: the background color is ${now?.background ?? '(no picture)'} (the template colour is ${PICTURE_TEMPLATES.MAIN.background})`))
  out.push(check('dv09-3c-5', !!now && now.template === 'MAIN' && !now.elements.some(e => e.type === 'text' && e.content === MAIN_TEMPLATE_TEXT), 'Step 5. The text in the middle of the picture (the template text) was deleted'))
  out.push(check('dv09-3c-6', !!now && sameName(now.previousPicture, 'Ovw_ref') && sameName(now.nextPicture, 'alarmList'),
    `Step 6. Previous Picture Name: ${now?.previousPicture || '(none)'}; Next Picture name: ${now?.nextPicture || '(none)'}`))
  out.push(check('dv09-3c-7', !!saved && saved.template === 'MAIN' && sameName(saved.previousPicture, 'Ovw_ref') && sameName(saved.nextPicture, 'alarmList') && !saved.elements.some(e => e.content === MAIN_TEMPLATE_TEXT),
    'Step 7. Tank101 was saved (File > Save) with its background and Previous/Next links'))

  // ---- Workshop - Adding a Datalink ---------------------------------------------------------------------------------
  const stamperAt = findAny(events, /^Datalink Stamper selected/)
  const builderAt = stamperAt >= 0 ? findAny(events, /^Expression Builder opened/, stamperAt) : -1
  const browseAt = builderAt >= 0 ? findAny(events, /^Browse DeltaV Control Parameters started/, builderAt) : -1
  out.push(check('dv09-3d-1', stamperAt >= 0, 'Step 1. The Datalink Stamper button of the DeltaV_ToolBox was selected'))
  out.push(check('dv09-3d-2', builderAt >= 0, 'Step 2. The ellipsis button of the Datalink dialog started the Expression Builder'))
  out.push(check('dv09-3d-3', browseAt >= 0, 'Step 3. On the DeltaV tab the Browse DeltaV Control Parameters button started the browser'))
  const dlSet = (p: Picture | null | undefined, tag: string, path: string) => p?.elements.find(e => e.type === 'datalink' && e.tag === tag && e.path?.toUpperCase() === path)
  const xvLink = dlSet(now, 'XV-101', 'DO1/SP_D')
  const statLink = dlSet(now, 'XVSTAT-101', 'DI1/PV_D')
  out.push(check('dv09-3d-4', !!xvLink && xvLink.refreshSeconds !== undefined, `Step 4. A datalink for DVSYS.XV-101/DO1/SP_D.F_CV exists (refresh rate ${xvLink?.refreshSeconds ?? '?'} s)`))
  out.push(check('dv09-3d-5', !!xvLink && xvLink.entry?.method === 'DISCRETE', 'Step 5. The Data Entry Type of the XV-101 datalink is In-Place'))
  out.push(check('dv09-3d-7', !!xvLink && !!now && now.elements.some(e => e.id === xvLink.id), 'Step 7. The datalink was stamped on the picture'))
  out.push(check('dv09-3d-8', !!xvLink && xvLink.color !== undefined, 'Step 8. The datalink colour was modified (View > Color Selections)'))
  out.push(check('dv09-3d-9', !!statLink && statLink.refreshSeconds !== undefined, `Step 9. A datalink for DVSYS.XVSTAT-101/DI1/PV_D.F_CV exists (refresh rate ${statLink?.refreshSeconds ?? '?'} s)`))

  // ---- Workshop - Creating Static Objects / Text --------------------------------------------------------------------
  const texts = now?.elements.filter(e => e.type === 'text' && !!e.content && e.group !== 'TITLE' && e.content !== MAIN_TEMPLATE_TEXT) ?? []
  out.push(check('dv09-3e-1', texts.length >= 2, `Step 1. Text objects identify the datalinks (${texts.length} text object(s) on the picture)`))
  out.push(check('dv09-3e-2', texts.some(e => e.color !== undefined), 'Step 2. The colour of a text was modified (View > Color Selections)'))
  out.push(check('dv09-3e-3', find(events, 'TANK101', /Text caption changed to .* \(Property Window\)/) >= 0, 'Step 3. A text Caption was changed in the Property Window'))
  out.push(check('dv09-3e-4', findAny(events, /^Text Caption Editor opened/) >= 0, 'Step 4. The Text Caption Editor button of the DeltaV_ToolBox was used'))
  out.push(check('dv09-3e-5', find(events, 'TANK101', /^Text Caption Editor: Write Caption/) >= 0, 'Step 5. A text was changed with Write Caption in the Text Caption Editor'))
  out.push(check('dv09-3e-6', find(events, 'TANK101', /^Text font set in the Font dialog/) >= 0, 'Step 6. The Font dialog of a text was used (right-click > Font)'))
  out.push(check('dv09-3e-7', find(events, 'TANK101', /^Text FontName \/ FontSize \/ FontStyle set in the Property Window/) >= 0, 'Step 7. FontName, FontSize and FontStyle were modified in the Properties window'))

  // ---- Workshop - Adding a Dynamo -----------------------------------------------------------------------------------
  const valve = (p: Picture | null | undefined): boolean => !!p && p.elements.some(e => e.type === 'dynamo' && e.dynamoSet === 'VALVE17')
  out.push(check('dv09-3f-1', findAny(events, /^Dynamo set Valves2 opened/) >= 0, 'Step 1. The dynamo set Valves2 (Valves2.fds) was opened from Dynamo Sets in the System Tree'))
  out.push(check('dv09-3f-2', valve(now), 'Step 2. The dynamo Valve17 is on the picture'))
  out.push(check('dv09-3f-3', valve(saved), 'Step 3. The picture was saved with the dynamo'))
  const savedAt = (() => { let last = -1; events.forEach((e, i) => { if (e.tag === 'TANK101' && /^Picture saved/.test(e.description)) last = i }); return last })()
  const closedAt = find(events, 'TANK101', /^Picture closed \(File > Close\)/)
  out.push(check('dv09-3f-4', closedAt >= 0 && savedAt >= 0 && closedAt > savedAt && valve(saved), 'Step 4. Tank101 was closed with File > Close after saving'))
  const ovw = pictures[OVW_REF]
  out.push(check('dv09-3f-5', !!ovw && sameName(ovw.nextPicture, 'Tank101'), `Step 5. Ovw_ref Next Picture is ${ovw?.nextPicture || '(none)'}`))
  const ovwSaved = savedPicture(ovw)
  out.push(check('dv09-3f-6', !!ovwSaved && sameName(ovwSaved.nextPicture, 'Tank101'), 'Step 6. Ovw_ref was saved with Next Picture Tank101'))

  // ---- Workshop - Operating & Verifying -----------------------------------------------------------------------------
  const closeAllAt = findAny(events, /^Window > Close All/)
  const runAt = findAny(events, /^Operate switched to Run/, closeAllAt)
  const openAt = runAt >= 0 ? find(events, 'TANK101', /^Picture opened in Run \(Open Main Display\)/, runAt) : -1
  out.push(check('dv09-3g-1', closeAllAt >= 0, 'Step 1. All open pictures and dynamo sets were closed (Window > Close All)'))
  out.push(check('dv09-3g-2', closeAllAt >= 0 && runAt >= 0, 'Step 2. DeltaV Operate was switched to Run (Workspace > Switch to Run)'))
  out.push(check('dv09-3g-3', openAt >= 0, 'Step 3. Tank101 was opened in Run with the Open Main Display button'))
  const writeAt = openAt >= 0 ? find(events, 'XV-101', /^XV-101\/DO1\/SP_D set to 1$/, openAt) : -1
  const statAt = writeAt >= 0 ? find(events, 'XVSTAT-101', /^XVSTAT-101\/DI1\/PV_D changed to 1/, writeAt) : -1
  out.push(check('dv09-3g-4', writeAt >= 0 && statAt >= 0, `Step 4. In Run, writing SP_D of XV-101 changed the PV_D of XVSTAT-101${writeAt >= 0 && statAt < 0 ? ' (XVSTAT-101 did not follow)' : ''}`))
  const alarmAt = openAt >= 0 ? events.findIndex((e, i) => i > openAt && e.tag === 'XVSTAT-101' && e.category === 'ALARM') : -1
  out.push(check('dv09-3g-5', alarmAt >= 0, 'Step 5. The alarm of XVSTAT-101 (alarm on a value of 0) is in the Event Journal'))
  const nextAt = openAt >= 0 ? find(events, 'TANK101', /^Picture navigation: Next Picture to alarmList/, openAt) : -1
  const prevAt = openAt >= 0 ? find(events, 'TANK101', /^Picture navigation: Previous Picture to Ovw_ref/, openAt) : -1
  out.push(check('dv09-3g-6', nextAt >= 0 && prevAt >= 0, `Step 6. Previous and Next Picture navigation was used in Run (Previous ${prevAt >= 0 ? 'yes' : 'no'}, Next ${nextAt >= 0 ? 'yes' : 'no'})`))
  return out
}
