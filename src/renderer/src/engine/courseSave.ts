import { useStore } from './store'
import { useLibrary, courseNamedSets } from './libraryStore'
import { useBatch } from './batchStore'
import { useEm } from './emStore'

// BatchLiveTrainer keeps the student's Course 7016 DV_School database between sessions: the configuration
// built in Chapters 1-5 (classes, modules, unit/phase/EM configuration, assignments, downloads) and the
// running plant are saved to local storage every few seconds and when the window closes, and restored on start.
// File -> New Course 7016 Project replaces the saved database with a fresh copy.

export const COURSE_SAVE_KEY = 'batchlivetrainer.course7016.database.v1'
const VERSION = 1

type Store = { getState: () => object; setState: (partial: Record<string, unknown>) => void }
const STORES: Record<'main' | 'library' | 'batch' | 'em', Store> = {
  main: useStore as unknown as Store,
  library: useLibrary as unknown as Store,
  batch: useBatch as unknown as Store,
  em: useEm as unknown as Store
}

export interface CourseSave { version: number; savedAt: number; stores: Record<string, Record<string, unknown>> }

/** Data fields of a store (actions are code and are not saved). */
function dataOf(state: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(state).filter(([, v]) => typeof v !== 'function'))
}

export function courseSnapshot(): CourseSave {
  return { version: VERSION, savedAt: Date.now(), stores: Object.fromEntries(Object.entries(STORES).map(([k, s]) => [k, dataOf(s.getState())])) }
}

export function saveCourseDatabase(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(COURSE_SAVE_KEY, JSON.stringify(courseSnapshot()))
    return true
  } catch {
    return false
  }
}

/** Restore a saved database; false when there is none (or it is unreadable), so the caller installs a fresh DV_School. */
export function restoreCourseDatabase(text?: string | null): boolean {
  try {
    const raw = text ?? (typeof localStorage === 'undefined' ? null : localStorage.getItem(COURSE_SAVE_KEY))
    if (!raw) return false
    const saved = JSON.parse(raw) as CourseSave
    if (saved.version !== VERSION || !saved.stores?.main || !saved.stores.library?.process) return false
    for (const [k, s] of Object.entries(STORES)) {
      const data = saved.stores[k]
      if (!data) continue
      // Only restore fields the current code still has, so an older save cannot inject stale shapes.
      const known = new Set(Object.keys(dataOf(s.getState())))
      s.setState(Object.fromEntries(Object.entries(data).filter(([f]) => known.has(f))))
    }
    const state = useStore.getState()
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
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(COURSE_SAVE_KEY) } catch { /* nothing saved */ }
}

let timer: ReturnType<typeof setInterval> | null = null
/** Autosave every 5 s and when the window is hidden or closed. */
export function startCourseAutosave(): void {
  if (timer || typeof window === 'undefined') return
  timer = setInterval(saveCourseDatabase, 5000)
  window.addEventListener('beforeunload', () => { saveCourseDatabase() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveCourseDatabase() })
}
