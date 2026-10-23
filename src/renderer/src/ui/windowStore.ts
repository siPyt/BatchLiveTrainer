import { create } from 'zustand'
import { useUi, windowHooks, type DisplayId } from './uiStore'

/**
 * DeltaV Explorer and Control Studio are separate applications in DeltaV: they open in their own windows that can be
 * moved, resized, minimized and closed while the Operate picture stays behind them. `useUi.display` keeps meaning
 * "the active display" (so navigation, history and the display selector are unchanged); this store only decides which
 * of those two displays are open as windows and what the main area shows behind them.
 */
export type WindowId = 'explorer' | 'studio'
export const WINDOW_IDS: WindowId[] = ['explorer', 'studio']
export const isWindowId = (d: DisplayId): d is WindowId => d === 'explorer' || d === 'studio'

export interface WindowRect { x: number; y: number; w: number; h: number }
interface WindowState { open: boolean; minimized: boolean; maximized: boolean; rect: WindowRect | null; z: number }

interface WindowStoreState {
  /** The non-window display shown in the main area behind the windows. */
  base: DisplayId
  wins: Record<WindowId, WindowState>
  /** Open (or restore) a window and bring it to the front. */
  show: (id: WindowId) => void
  /** Bring an open window to the front and make it the active display. */
  focus: (id: WindowId) => void
  minimize: (id: WindowId) => void
  toggleMaximize: (id: WindowId) => void
  close: (id: WindowId) => void
  setRect: (id: WindowId, rect: WindowRect) => void
  closeAll: () => void
}

const closed = (): WindowState => ({ open: false, minimized: false, maximized: false, rect: null, z: 0 })
let top = 0

export const useWindows = create<WindowStoreState>((set, get) => {
  /** After a window goes away, activate the next visible window, or fall back to the display behind them. */
  const activateNext = (leaving: WindowId): void => {
    const { wins, base } = get()
    const others = WINDOW_IDS.filter(w => w !== leaving && wins[w].open && !wins[w].minimized).sort((a, b) => wins[b].z - wins[a].z)
    if (useUi.getState().display === leaving) useUi.setState({ display: others[0] ?? base })
  }
  const patch = (id: WindowId, p: Partial<WindowState>): void => set(s => ({ wins: { ...s.wins, [id]: { ...s.wins[id], ...p } } }))

  return {
    base: 'process',
    wins: { explorer: closed(), studio: closed() },
    show: id => patch(id, { open: true, minimized: false, z: ++top }),
    focus: id => {
      const w = get().wins[id]
      if (!w.open || w.minimized) return
      if (w.z !== top) patch(id, { z: ++top })
      if (useUi.getState().display !== id) useUi.setState({ display: id })
    },
    minimize: id => { patch(id, { minimized: true }); activateNext(id) },
    toggleMaximize: id => patch(id, { maximized: !get().wins[id].maximized }),
    close: id => { patch(id, { open: false, minimized: false }); activateNext(id) },
    setRect: (id, rect) => patch(id, { rect, maximized: false }),
    closeAll: () => set({ wins: { explorer: closed(), studio: closed() } })
  }
})

// Any way of reaching a display (ribbon, display selector, Back/Forward, Explorer links) opens its window.
useUi.subscribe((s, p) => {
  if (s.display !== p.display) {
    if (isWindowId(s.display)) useWindows.getState().show(s.display)
    else useWindows.setState({ base: s.display })
  }
  // Switching projects resets navigation to a single "process" entry: close every window with it.
  if (s.history !== p.history && s.history.length === 1) useWindows.getState().closeAll()
})

// The in-studio Close / Exit closes the Control Studio window.
windowHooks.onStudioClosed = () => useWindows.getState().close('studio')
