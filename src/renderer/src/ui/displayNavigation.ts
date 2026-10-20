import type { DisplayId } from './uiStore'

export const DISPLAY_NAVIGATION: { id: DisplayId; label: string; operator: boolean }[] = [
  { id: 'process', label: 'Process (ED_CENTER_BATCH)', operator: true },
  { id: 'batchhelp', label: 'BatchHelp', operator: true },
  { id: 'alarms', label: 'Alarm List', operator: false },
  { id: 'trend', label: 'Historian Trends', operator: false },
  { id: 'journal', label: 'Event Journal', operator: false },
  { id: 'explorer', label: 'DeltaV Explorer', operator: false },
  { id: 'studio', label: 'Control Studio', operator: false },
  { id: 'sfc', label: 'SFC Charts', operator: false },
  { id: 'builder', label: 'Display Builder', operator: false },
  { id: 'workshops', label: 'Course 7016 Workshops', operator: false },
  { id: 'users', label: 'User Manager', operator: false },
  { id: 'system', label: 'System Preferences', operator: false },
  { id: 'applications', label: 'DeltaV Applications', operator: false },
  { id: 'hardware', label: 'Physical Network', operator: false }
]
