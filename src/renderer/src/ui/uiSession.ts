import { useUi, type DisplayId } from './uiStore'
import { useWindows, WINDOW_IDS, isWindowId, type WindowId, type WindowRect } from './windowStore'

// Remembers which display and Explorer / Control Studio windows are open, so a page reload (a browser waking a
// sleeping tab, a refresh, restarting the app) returns to the same screen instead of Process. Only the position is
// stored; the course database has its own autosave (courseSave.ts).

const KEY = 'batchlive-ui-session'
const UI_FIELDS = ['display', 'history', 'histIndex', 'pictureHistory', 'builderPicture', 'builderRun', 'selectedTag', 'studioTag',
  'studioClass', 'studioInstance', 'studioPhase', 'studioComposite', 'studioEm', 'sfcName', 'studioLayout'] as const
const DISPLAYS: DisplayId[] = ['alarms', 'trend', 'journal', 'explorer', 'studio', 'sfc', 'builder', 'workshops', 'users', 'system', 'applications', 'hardware', 'process', 'batchhelp']

interface SavedWindow { open: boolean; minimized: boolean; maximized: boolean; rect: WindowRect | null; z: number }
interface Saved { ui: Record<string, unknown>; base: DisplayId; wins: Record<WindowId, SavedWindow> }

export function snapshotUiSession(): Saved {
  const ui = useUi.getState() as unknown as Record<string, unknown>
  const w = useWindows.getState()
  return {
    ui: Object.fromEntries(UI_FIELDS.map(f => [f, ui[f]])),
    base: w.base,
    wins: Object.fromEntries(WINDOW_IDS.map(id => [id, w.wins[id]])) as Record<WindowId, SavedWindow>
  }
}

export function restoreUiSession(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const saved = JSON.parse(raw) as Saved
    const display = saved.ui?.display as DisplayId
    const base = saved.base
    if (!DISPLAYS.includes(display) || !DISPLAYS.includes(base) || !Array.isArray(saved.ui.history) || !(saved.ui.history as unknown[]).every(d => DISPLAYS.includes(d as DisplayId))) return false
    useUi.setState(Object.fromEntries(UI_FIELDS.filter(f => saved.ui[f] !== undefined).map(f => [f, saved.ui[f]])))
    const wins = Object.fromEntries(WINDOW_IDS.map(id => {
      const s = saved.wins?.[id]
      return [id, { open: !!s?.open, minimized: !!s?.minimized, maximized: !!s?.maximized, rect: s?.rect ?? null, z: 0 }]
    })) as Record<WindowId, SavedWindow>
    useWindows.setState({ base, wins })
    // Re-stack in the saved order; show() hands out fresh z values.
    for (const id of [...WINDOW_IDS].sort((a, b) => (saved.wins?.[a]?.z ?? 0) - (saved.wins?.[b]?.z ?? 0))) {
      if (wins[id].open && !wins[id].minimized) useWindows.getState().show(id)
    }
    if (isWindowId(display) && !wins[display].open) useWindows.getState().show(display)
    return true
  } catch {
    return false
  }
}

export function startUiSessionSave(): void {
  if (typeof window === 'undefined') return
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = (): void => {
    timer = null
    try { localStorage.setItem(KEY, JSON.stringify(snapshotUiSession())) } catch { /* storage full or blocked */ }
  }
  const schedule = (): void => { if (!timer) timer = setTimeout(save, 400) }
  useUi.subscribe(schedule)
  useWindows.subscribe(schedule)
  window.addEventListener('beforeunload', save)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save() })
  schedule()
}
