import { usePictures } from './pictureStore'
import { useUi } from '../ui/uiStore'
import { USER_REF, USER_SETTINGS, parseUserSettings, userSettingsSaved, useDv09Ops } from './dv09Settings'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** Fourth column from the left: after Ack and two more columns, so the third entry of the configurable columns. */
export const CATEGORY_POSITION = 2

/** Course DV-09 Chapter 13 (pp 13-26 and 13-35): the Alarm List Category column and the UserSettings banner threshold. State is read from the stores. */
export function checkDv09Ch13(events: EventLogEntry[]): StepCheck[] {
  const find = (re: RegExp, after = -1, tag?: string): number => events.findIndex((e, i) => i > after && re.test(e.description) && (tag === undefined || e.tag === tag))
  const last = (re: RegExp, tag?: string): number => { for (let i = events.length - 1; i >= 0; i--) if (re.test(events[i].description) && (tag === undefined || events[i].tag === tag)) return i; return -1 }
  const ops = useDv09Ops.getState()
  const pictures = usePictures.getState().pictures
  const settings = pictures[USER_SETTINGS]
  const current = settings?.script !== undefined ? parseUserSettings(settings.script) : null
  const saved = userSettingsSaved(pictures)
  const savedParsed = saved ? parseUserSettings(saved.script) : null
  const thresholds = useUi.getState().bannerThresholds

  const working = ops.alarmListApplied ?? ops.alarmListColumns
  const categoryAt = (columns: string[] | null): boolean => !!columns && columns.indexOf('category') === CATEGORY_POSITION
  const savedAt = last(/^AlarmList\.grf saved/, 'alarmList')
  const closedAt = last(/^AlarmList\.grf closed/, 'alarmList')
  const reopened = closedAt >= 0 && find(/^Alarm List opened/, closedAt) >= 0
  const execAt = last(/^UserSettings\.grf executed at DeltaV Operate initialization/, USER_SETTINGS)

  return [
    check('dv09-13c-1', find(/^Alarm List opened/) >= 0, 'Step 1. The Alarm List was opened from the DeltaV Operate tool bar'),
    check('dv09-13c-2', find(/^Alarm List Quick Edit: AlarmList\.grf opened/) >= 0, 'Step 2. Quick Edit was chosen from the Alarm List banner menu: AlarmList.grf is open in DeltaV Operate (Configure)'),
    check('dv09-13c-3', find(/^Alarm Summary Configuration opened/) >= 0, 'Step 3. The Alarm Summary object Properties (DeltaV Alarm Summary Configuration) were opened'),
    check('dv09-13c-4', find(/^Alarm Summary Configuration: Columns tab/) >= 0, 'Step 4. The Columns tab was selected'),
    check('dv09-13c-5', find(/^Alarm Summary Configuration: Category added to Displayed Columns/) >= 0 && !!working && working.includes('category'), 'Step 5. Category was selected in Available Columns and added with Add >> (it is in the Displayed Columns)'),
    check('dv09-13c-6', categoryAt(working) && find(/^Alarm Summary Configuration applied/) >= 0, 'Step 6. Category is fourth from the top of the Displayed Columns (after Ack, Time In and Module/Param) and the change was applied (Apply or OK)'),
    check('dv09-13c-7', categoryAt(ops.alarmListColumns) && savedAt >= 0 && closedAt > savedAt && !ops.quickEdit, 'Step 7. The display was saved (AlarmList.grf) and closed: DeltaV Operate is back in Run'),
    check('dv09-13c-8', categoryAt(ops.alarmListColumns) && reopened && !ops.quickEdit, 'Step 8. The Alarm List was opened again in Run and shows the saved Category column fourth from the left'),

    check('dv09-13b-1', find(/^Operate switched to Configure/) >= 0 || find(/^DeltaV Operate launched/) >= 0, 'Step 1. DeltaV Operate (Configure) was opened'),
    check('dv09-13b-2', !!pictures[USER_REF] && !!settings, 'Step 2. User_Ref.grf from the Standard folder was opened and saved as UserSettings.grf (the picture exists)'),
    check('dv09-13b-3', !!settings && find(/^Script editor opened: UserSettings\.grf/, -1, USER_SETTINGS) >= 0, 'Step 3. UserSettings.grf: right-click > Edit Script opened the script editor'),
    check('dv09-13b-4', find(/^Script editor Find: alarms/i, -1, USER_SETTINGS) >= 0, 'Step 4. The Find button of the script editor was used with the text alarms'),
    check('dv09-13b-5', !!current && current.error === null && current.enabled, 'Step 5. In the script #Const INIT_ALARM_THRESHOLD = 0 is commented and #Const INIT_ALARM_THRESHOLD = 1 is active'),
    check('dv09-13b-6', !!current && current.device !== null && current.device <= 6, `Step 6. In the script Const DEVICE_THRESHOLD_DEFAULT is active with a value of 6 or less (now ${current?.device ?? 'still commented'})`),
    check('dv09-13b-7', !!savedParsed && savedParsed.enabled && savedParsed.device !== null && savedParsed.device <= 6 && execAt >= 0 && thresholds.device === savedParsed.device,
      `Step 7. The script was saved with UserSettings.grf and DeltaV Operate was run: the workstation banner device threshold is now ${thresholds.device} (default 7)`)
  ]
}
