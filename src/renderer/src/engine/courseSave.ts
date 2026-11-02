import { useStore } from './store'
import { useLibrary, courseNamedSets } from './libraryStore'
import { useBatch } from './batchStore'
import { useEm } from './emStore'
import { useExecutive } from './executive'
import { useVc } from './versionControl'
import { useHistorian } from './batchHistorian'
import { useCampaigns } from './campaignManager'
import { useSecurity } from './security'
import { useDv09Cm } from './dv09Cm'
import { usePictures } from './pictureStore'
import { useDv09Ops } from './dv09Settings'
import { useFlowColors } from './flowColorStore'

// BatchLiveTrainer keeps the student's Course 7016 DV_School database between sessions: the configuration
// built in Chapters 1-5 (classes, modules, unit/phase/EM configuration, assignments, downloads) and the
// running plant are saved to local storage every few seconds and when the window closes, and restored on start.
// File -> New Course 7016 Project replaces the saved database with a fresh copy.

export const COURSE_SAVE_KEY = 'batchlivetrainer.course7016.database.v1'
const DV09_SAVE_KEY = 'batchlivetrainer.dv09.database.v1'
const VERSION = 1

/** The class whose project is loaded; the 7016 project keeps its original storage key so existing saves still load. */
export type ProjectCourse = '7016' | 'DV-09'
let activeProject: ProjectCourse = '7016'
export const setActiveProject = (c: ProjectCourse): void => { activeProject = c }
export const getActiveProject = (): ProjectCourse => activeProject
export const saveKeyFor = (c: ProjectCourse): string => (c === 'DV-09' ? DV09_SAVE_KEY : COURSE_SAVE_KEY)

type Store = { getState: () => object; setState: (partial: Record<string, unknown>) => void }
const STORES: Record<'main' | 'library' | 'batch' | 'em' | 'executive' | 'vc' | 'historian' | 'campaigns' | 'dv09cm' | 'pictures' | 'dv09ops' | 'dv09flow', Store> = {
  main: useStore as unknown as Store,
  library: useLibrary as unknown as Store,
  batch: useBatch as unknown as Store,
  em: useEm as unknown as Store,
  executive: useExecutive as unknown as Store,
  vc: useVc as unknown as Store,
  historian: useHistorian as unknown as Store,
  campaigns: useCampaigns as unknown as Store,
  dv09cm: useDv09Cm as unknown as Store,
  pictures: usePictures as unknown as Store,
  dv09ops: useDv09Ops as unknown as Store,
  dv09flow: useFlowColors as unknown as Store
}

export interface CourseSave { version: number; savedAt: number; stores: Record<string, Record<string, unknown>> }

/** Course DV-09 keeps the users, groups and key assignments of its security database in the project save (Defining Users workshop). */
const SECURITY_FIELDS = ['users', 'groups', 'lockAssignments', 'workstation', 'passwordPolicy'] as const
const securityData = (): Record<string, unknown> => Object.fromEntries(Object.entries(useSecurity.getState()).filter(([k]) => (SECURITY_FIELDS as readonly string[]).includes(k)))

/** Data fields of a store (actions are code and are not saved). */
function dataOf(state: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(state).filter(([, v]) => typeof v !== 'function'))
}

export function courseSnapshot(): CourseSave {
  // The operator pictures of the DV-09 project (workshop pictures) are part of its database; the 7016 save is unchanged.
  const entries = Object.entries(STORES).filter(([k]) => (k !== 'pictures' && k !== 'dv09ops' && k !== 'dv09flow') || activeProject === 'DV-09')
  const stores = Object.fromEntries(entries.map(([k, s]) => [k, dataOf(s.getState())]))
  if (activeProject === 'DV-09') stores.security = securityData()
  return { version: VERSION, savedAt: Date.now(), stores }
}

export function saveCourseDatabase(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(saveKeyFor(activeProject), JSON.stringify(courseSnapshot()))
    return true
  } catch {
    return false
  }
}

/** Restore a saved database; false when there is none (or it is unreadable), so the caller installs a fresh DV_School. */
export function restoreCourseDatabase(text?: string | null): boolean {
  try {
    const raw = text ?? (typeof localStorage === 'undefined' ? null : localStorage.getItem(saveKeyFor(activeProject)))
    if (!raw) return false
    const saved = JSON.parse(raw) as CourseSave
    if (saved.version !== VERSION || !saved.stores?.main || !saved.stores.library) return false
    if (activeProject === '7016' && !saved.stores.library.process) return false
    for (const [k, s] of Object.entries(STORES)) {
      const data = saved.stores[k]
      if (!data) continue
      // Only restore fields the current code still has, so an older save cannot inject stale shapes.
      const known = new Set(Object.keys(dataOf(s.getState())))
      s.setState(Object.fromEntries(Object.entries(data).filter(([f]) => known.has(f))))
    }
    const state = useStore.getState()
    if (activeProject === 'DV-09' && saved.stores.security) {
      useSecurity.setState(Object.fromEntries(Object.entries(saved.stores.security).filter(([f]) => (SECURITY_FIELDS as readonly string[]).includes(f))))
    }
    if (activeProject !== '7016') return true
    const defaults = courseNamedSets()
    const builtIns = ['phase_failures', '$phase_restart_types']
    const additions = Object.fromEntries(builtIns.filter(name => !state.namedSets.configured[name]).map(name => [name, defaults[name]]))
    // Saves made before these built-in sets existed never had them downloaded; the phases read the deployed copy.
    const deployed = { ...state.namedSets.deployed }
    for (const target of new Set([...Object.keys(deployed), 'WORKSTATION'])) {
      const current = deployed[target] ?? {}
      const missing = builtIns.filter(name => !current[name])
      if (missing.length) deployed[target] = { ...current, ...Object.fromEntries(missing.map(name => [name, defaults[name]])) }
    }
    useStore.setState({ namedSets: { ...state.namedSets, configured: { ...state.namedSets.configured, ...additions }, deployed } })
    return true
  } catch {
    return false
  }
}

export function clearCourseDatabase(): void {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(saveKeyFor(activeProject)) } catch { /* nothing saved */ }
}

let timer: ReturnType<typeof setInterval> | null = null
/** Autosave every 5 s and when the window is hidden or closed. */
export function startCourseAutosave(): void {
  if (timer || typeof window === 'undefined') return
  timer = setInterval(saveCourseDatabase, 5000)
  window.addEventListener('beforeunload', () => { saveCourseDatabase() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveCourseDatabase() })
}
