import { create } from 'zustand'
import { useStore } from './store'
import { usePictures, pictureSignature, type Picture, type PicElement } from './pictureStore'
import { libraryHooks } from './libraryStore'
import { useUi } from '../ui/uiStore'
import { ALARM_COLUMNS, DEFAULT_ALARM_COLUMNS, type AlarmColumnKey } from '../utils/format'

// Course DV-09 chapter 13: the pieces of DeltaV Operate that decide what the Alarm List shows and which alarms reach the banner.
//  - User_Ref.grf (Standard folder): a picture with a VB script; Save As UserSettings.grf and edit the script to initialize the alarm banner thresholds
//    when DeltaV Operate starts (pp 13-27 .. 13-35).
//  - alarmList.grf: the Alarm List display whose Alarm Summary object columns are configured with Quick Edit > Properties > Columns (pp 13-20 .. 13-26).
// The script is read as text: only the lines the student leaves uncommented count, the way the VB #Const / Const lines would.

export const USER_REF = 'USER_REF'
export const USER_SETTINGS = 'USERSETTINGS'

export const USER_REF_SCRIPT = [
  "'====================================",
  "'Alarm threshold initialization",
  "'                          NOTE",
  "'Uncomment only ONE of the following #Const lines at a time",
  "'To Disable - uncomment the '=0' line and comment the '=1' line.",
  "'To Enable - uncomment the '=1' line and comment the '=0' line.",
  "'",
  "'Uncomment the following line to disable the initialization of the Alarm Threshold default values",
  '#Const INIT_ALARM_THRESHOLD = 0   \'Disables Initialzation of Alarm Threshold Defaults',
  "'",
  "'Uncomment the following line to enable the initialization of the Alarm Threshold default values",
  "'#Const INIT_ALARM_THRESHOLD = 1   'Enables Initialzation of Alarm Threshold Defaults",
  "'",
  "'These values control the alarms that will be displayed",
  "'Uncomment the following lines, and set the value to the desired threshold.",
  "'in the alarm banner.",
  "'default values :",
  "'Const PROCESS_THRESHOLD_DEFAULT = 3",
  "'Const DEVICE_THRESHOLD_DEFAULT = 7",
  "'Const HARDWARE_THRESHOLD_DEFAULT = 7",
  "'Const SIS_PROCESS_THRESHOLD_DEFAULT = 3",
  "'Const SIS_DEVICE_THRESHOLD_DEFAULT = 7",
  "'Const SIS_HARDWARE_THRESHOLD_DEFAULT = 3",
  ''
].join('\r\n')

export interface UserSettingsResult {
  /** The #Const INIT_ALARM_THRESHOLD = 1 line is the only active INIT line. */
  enabled: boolean
  /** Both or neither INIT line is active: DeltaV needs exactly one. */
  error: string | null
  process: number | null
  device: number | null
}

/** The active (not commented) lines of the script decide; a leading single quote comments a line out. */
export function parseUserSettings(script: string): UserSettingsResult {
  const active = script.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("'"))
  const init = active.flatMap(l => { const m = /^#Const\s+INIT_ALARM_THRESHOLD\s*=\s*(\d+)/i.exec(l); return m ? [Number(m[1])] : [] })
  const value = (name: string): number | null => {
    for (const l of active) { const m = new RegExp(`^Const\\s+${name}\\s*=\\s*(-?\\d+)`, 'i').exec(l); if (m) return Number(m[1]) }
    return null
  }
  const error = init.length === 0 ? 'No INIT_ALARM_THRESHOLD line is active' : init.length > 1 ? 'Uncomment only ONE of the INIT_ALARM_THRESHOLD lines at a time' : null
  return { enabled: !error && init[0] === 1, error, process: value('PROCESS_THRESHOLD_DEFAULT'), device: value('DEVICE_THRESHOLD_DEFAULT') }
}

const log = (tag: string, description: string): void => useStore.getState().logEvent('DIAGNOSTIC', tag, description)

const text = (id: string, x: number, y: number, content: string, size: number, bold = false, color = '#ffffff'): PicElement =>
  ({ id, type: 'text', x, y, content, fontSize: size, bold, color })

/** User_ref.grf ships with DeltaV Operate in the Standard folder; it is created on first use. */
export function ensureUserRef(): void {
  const pictures = usePictures.getState().pictures
  if (pictures[USER_REF]) return
  const picture: Picture = {
    name: USER_REF, template: 'MAIN', background: '#007a00', width: 1000, height: 640,
    elements: [
      text('UR1', 400, 40, 'User_Ref', 26, true),
      text('UR2', 60, 110, 'This template is for a system-wide UserSettings picture, that applies to all workstations. Save as UserSettings in the Standard directory before editing.', 13),
      text('UR3', 60, 190, 'This template is also for a workstation-specific UserSettings picture, in that case, save as <ComputerName>_Settings.grf in the Standard directory before editing.', 13),
      text('UR4', 60, 300, 'You may have both system-wide and workstation-specific UserSettings pictures. The system-wide settings are applied before the workstation-specific settings. You may have no UserSettings pictures at all, or only a system-wide version, or only workstation-specific version(s).', 13)
    ],
    script: USER_REF_SCRIPT
  }
  usePictures.setState(s => ({ pictures: { ...s.pictures, [USER_REF]: picture } }))
}

/** File > Save As (Standard folder): the picture is copied to a new name with its script and the copy is what the student edits. */
export function saveAsPicture(from: string, name: string): string | null {
  const key = name.trim().replace(/\.grf$/i, '').toUpperCase()
  const source = usePictures.getState().pictures[from]
  if (!source) return `Picture ${from} does not exist`
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return 'File names use letters, digits and underscore and start with a letter'
  if (usePictures.getState().pictures[key]) return `${name.trim()}.grf already exists in the Standard folder`
  const { saved: _saved, ...rest } = source
  void _saved
  usePictures.setState(s => ({ pictures: { ...s.pictures, [key]: { ...JSON.parse(JSON.stringify(rest)) as Picture, name: key } } }))
  log(key, `Picture saved as ${name.trim().replace(/\.grf$/i, '')}.grf in the Standard folder (from ${source.name})`)
  return null
}

/** The script editor's Save button: the text becomes the script of the picture (it is part of the picture until File > Save). */
export function setPictureScript(pic: string, script: string): string | null {
  if (!usePictures.getState().pictures[pic]) return `Picture ${pic} does not exist`
  usePictures.setState(s => ({ pictures: { ...s.pictures, [pic]: { ...s.pictures[pic], script } } }))
  log(pic, 'Script saved in the script editor')
  return null
}

export function savedScript(pic: Picture | undefined): string | null {
  if (!pic?.saved) return null
  try { return (JSON.parse(pic.saved) as Picture).script ?? null } catch { return null }
}

/** DeltaV Operate initialization: the saved UserSettings picture sets the alarm banner thresholds. Returns what was applied (or why not). */
export function runUserSettings(): { applied: boolean; process?: number; device?: number; reason?: string } {
  const picture = usePictures.getState().pictures[USER_SETTINGS]
  const script = savedScript(picture)
  if (script === null) return { applied: false, reason: picture ? 'UserSettings.grf has unsaved changes only' : 'There is no UserSettings picture' }
  const parsed = parseUserSettings(script)
  if (parsed.error) { log(USER_SETTINGS, `UserSettings.grf script error at DeltaV Operate initialization: ${parsed.error}`); return { applied: false, reason: parsed.error } }
  const defaults = { process: 3, device: 7 }
  const next = parsed.enabled ? { process: parsed.process ?? defaults.process, device: parsed.device ?? defaults.device } : defaults
  const error = useUi.getState().setBannerThresholds(next)
  if (error) { log(USER_SETTINGS, `UserSettings.grf thresholds rejected: ${error}`); return { applied: false, reason: error } }
  log(USER_SETTINGS, `UserSettings.grf executed at DeltaV Operate initialization: alarm banner thresholds process ${next.process}, device ${next.device}${parsed.enabled ? '' : ' (initialization disabled: defaults)'}`)
  return { applied: true, ...next }
}

export const userSettingsSaved = (pictures: Record<string, Picture>): { picture: Picture; script: string } | null => {
  const picture = pictures[USER_SETTINGS]
  const script = savedScript(picture)
  return picture && script !== null ? { picture, script } : null
}

// --- Alarm List display (alarmList.grf) configuration ----------------------------------------------------

export interface Dv09OpsState {
  /** Columns saved with alarmList.grf (null = the defaults). */
  alarmListColumns: AlarmColumnKey[] | null
  /** Columns applied in the open Quick Edit session, not yet saved with the display. */
  alarmListApplied: AlarmColumnKey[] | null
  /** The Alarm List is open in DeltaV Operate (Configure) (Quick Edit). */
  quickEdit: boolean
}

export const useDv09Ops = create<Dv09OpsState>(() => ({ alarmListColumns: null, alarmListApplied: null, quickEdit: false }))
libraryHooks.reset.push(() => useDv09Ops.setState({ alarmListColumns: null, alarmListApplied: null, quickEdit: false }))

export const effectiveAlarmColumns = (s: Pick<Dv09OpsState, 'alarmListColumns'>): AlarmColumnKey[] => s.alarmListColumns ?? DEFAULT_ALARM_COLUMNS

export function startQuickEdit(): void {
  const s = useDv09Ops.getState()
  useDv09Ops.setState({ quickEdit: true, alarmListApplied: [...effectiveAlarmColumns(s)] })
  log('alarmList', 'Alarm List Quick Edit: AlarmList.grf opened in DeltaV Operate (Configure)')
}

/** Apply (or OK) in the Alarm Summary Configuration dialog: the session columns change, the saved display does not. */
export function applyAlarmColumns(columns: AlarmColumnKey[]): string | null {
  const known = new Set(ALARM_COLUMNS.map(c => c.key))
  if (!columns.length) return 'The Alarm Summary needs at least one displayed column'
  if (columns.some(c => !known.has(c))) return 'Unknown alarm summary column'
  useDv09Ops.setState({ alarmListApplied: [...columns] })
  log('alarmList', `Alarm Summary Configuration applied: columns ${columns.join(', ')}`)
  return null
}

export function saveAlarmList(): string | null {
  const s = useDv09Ops.getState()
  if (!s.quickEdit) return 'Open the Alarm List with Quick Edit first'
  useDv09Ops.setState({ alarmListColumns: [...(s.alarmListApplied ?? effectiveAlarmColumns(s))] })
  log('alarmList', 'AlarmList.grf saved in DeltaV Operate (Configure)')
  return null
}

export const alarmListDirty = (s: Dv09OpsState): boolean => JSON.stringify(s.alarmListApplied ?? effectiveAlarmColumns(s)) !== JSON.stringify(effectiveAlarmColumns(s))

export function closeQuickEdit(): void {
  useDv09Ops.setState({ quickEdit: false, alarmListApplied: null })
  log('alarmList', 'AlarmList.grf closed; DeltaV Operate returns to Run')
}

export { pictureSignature }
