import { useLibrary } from '../engine/libraryStore'
import { useSecurity } from '../engine/security'
import { getActiveProject, restoreCourseDatabase, saveCourseDatabase, setActiveProject, type ProjectCourse } from '../engine/courseSave'
import { COURSES, type CourseId } from './courses'
import { useUi } from './uiStore'
import { homeDisplayFor } from './displayNavigation'

// Each built class has its own project (7016: DV_School; DV-09: the DV-09 training plant) and its own autosaved database.
// Choosing a class that is not built yet only changes the selected class; the loaded project stays as it was.

const ACTIVE_KEY = 'batchlivetrainer.activeProject'

const isProject = (v: unknown): v is ProjectCourse => v === '7016' || v === 'DV-09'

export function installProject(c: ProjectCourse): boolean {
  if (c === '7016') useSecurity.getState().enterSecurityScope('7016')
  return c === 'DV-09' ? useLibrary.getState().installDv09Project() : useLibrary.getState().installCourseProject()
}

/** The project that was open when the app last closed (7016 when nothing is stored). */
export function savedProject(): ProjectCourse {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_KEY)
    return isProject(v) ? v : '7016'
  } catch { return '7016' }
}

const rememberProject = (c: ProjectCourse): void => { try { localStorage.setItem(ACTIVE_KEY, c) } catch { /* storage blocked */ } }

/** Start-up: install the remembered class's project and restore its saved database. Returns true when a saved database was restored. */
export function bootProject(): boolean {
  const c = savedProject()
  setActiveProject(c)
  installProject(c)
  return restoreCourseDatabase()
}

/** Chooses a class in the class selector. Built classes swap the whole project; the old one is saved first. */
export function openCourse(next: CourseId): boolean {
  const info = COURSES.find(c => c.id === next)
  if (!info) return false
  if (!info.built || !isProject(next)) { useUi.getState().setCourse(next); return true }
  if (next !== getActiveProject()) {
    saveCourseDatabase()
    const previous = getActiveProject()
    setActiveProject(next)
    if (!installProject(next)) { setActiveProject(previous); return false }
    restoreCourseDatabase()
    rememberProject(next)
    useUi.getState().resetToOverview()
    useUi.getState().navigate(homeDisplayFor(next))
  }
  useUi.getState().setCourse(next)
  return true
}

/** File > New Project for whichever class is loaded. */
export function newProjectForActiveClass(): boolean {
  return installProject(getActiveProject())
}
