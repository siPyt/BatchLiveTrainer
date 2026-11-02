import type { DisplayId } from './uiStore'
import type { CourseId } from './courses'

export const DISPLAY_NAVIGATION: { id: DisplayId; label: string; operator: boolean }[] = [
  { id: 'process', label: 'Process (ED_CENTER_BATCH)', operator: true },
  { id: 'batchhelp', label: 'BatchHelp', operator: true },
  { id: 'batchlist', label: 'Batch List View', operator: true },
  { id: 'unackprompts', label: 'Unacknowledged Prompts (UnacknowledgedPr)', operator: true },
  { id: 'histadmin', label: 'Historian Administration Tool', operator: false },
  { id: 'histview', label: 'Batch History View', operator: false },
  { id: 'campaigns', label: 'Campaign Manager Operator Interface', operator: false },
  { id: 'boi', label: 'Batch Operator Interface', operator: true },
  { id: 'alarms', label: 'Alarm List', operator: false },
  { id: 'trend', label: 'Historian Trends', operator: false },
  { id: 'journal', label: 'Event Journal', operator: false },
  { id: 'explorer', label: 'DeltaV Explorer', operator: false },
  { id: 'studio', label: 'Control Studio', operator: false },
  { id: 'recipestudio', label: 'Recipe Studio', operator: false },
  { id: 'batchmgr', label: 'Batch Application Manager', operator: false },
  { id: 'sfc', label: 'SFC Charts', operator: false },
  { id: 'builder', label: 'Display Builder', operator: false },
  { id: 'workshops', label: 'Course 7016 Workshops', operator: false },
  { id: 'users', label: 'User Manager', operator: false },
  { id: 'system', label: 'System Preferences', operator: false },
  { id: 'applications', label: 'DeltaV Applications', operator: false },
  { id: 'hardware', label: 'Physical Network', operator: false }
]

/** Displays that only make sense with the 7016 Batch plant; class DV-09 hides them. */
const BATCH_ONLY: DisplayId[] = ['process', 'batchhelp', 'batchlist', 'unackprompts', 'histadmin', 'histview', 'campaigns', 'boi', 'recipestudio', 'batchmgr']

export function navigationFor(course: CourseId): { id: DisplayId; label: string; operator: boolean }[] {
  return DISPLAY_NAVIGATION
    .filter(n => course !== 'DV-09' || !BATCH_ONLY.includes(n.id))
    .map(n => (n.id === 'workshops' ? { ...n, label: `Course ${course} Workshops` } : n))
}

/** The display a class opens to and returns to with Home / Up. */
export const homeDisplayFor = (course: CourseId): DisplayId => (course === 'DV-09' ? 'workshops' : 'process')
