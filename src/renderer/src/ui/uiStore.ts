import { bannerThresholdError, loadBannerThresholds, saveBannerThresholds, type BannerThresholds } from '../engine/deviceAlarms'
import { create } from 'zustand'
import { useStore } from '../engine/store'
import { resolvePictureTarget, usePictures } from '../engine/pictureStore'

export type DisplayId =
  | 'alarms'
  | 'trend'
  | 'journal'
  | 'explorer'
  | 'studio'
  | 'sfc'
  | 'builder'
  | 'workshops'
  | 'users'
  | 'system'
  | 'applications'
  | 'hardware'
  | 'process'
  | 'batchhelp'

export interface OpenFaceplate {
  tag: string
  x: number
  y: number
  /** Monotonic stacking token; the highest-token faceplate renders on top. */
  z: number
}

interface UiState {
  navigationOpen: boolean
  toggleNavigation: () => void
  processViewRevision: number
  resetProcessView: () => void
  display: DisplayId
  history: DisplayId[]
  histIndex: number
  pictureHistory: (string | null)[]
  builderPicture: string | null
  builderRun: boolean
  faceplates: OpenFaceplate[]
  pidDetailTag: string | null
  closePidDetail: () => void
  selectedTag: string | null
  studioTag: string | null
  /** Course 7016: Control Module Class open in Control Studio (with an optional class-based instance). */
  studioClass: string | null
  studioInstance: string | null
  openClassStudio: (className: string, instance?: string) => void
  closeClassStudio: () => void
  /** Course 7016 Ch 4: Phase Class open in Control Studio (optionally drilled into a composite). */
  studioPhase: string | null
  studioComposite: string | null
  openPhaseStudio: (phaseClass: string, composite?: string) => void
  closePhaseStudio: () => void
  sfcName: string | null
  /** FBD canvas node positions, keyed by module tag (Control Studio drag-and-drop layout). */
  studioLayout: Record<string, { x: number; y: number }>
  setStudioLayout: (tag: string, x: number, y: number) => void
  /** Pen to isolate when the Trend display next mounts/updates; consumed then cleared. */
  trendFocusTag: string | null
  /** Module tag to filter the Alarm List to; consumed then cleared. */
  alarmFocusTag: string | null
  navigate: (d: DisplayId) => void
  back: () => void
  forward: () => void
  openFaceplate: (tag: string, x?: number, y?: number) => void
  closeFaceplate: (tag: string) => void
  moveFaceplate: (tag: string, x: number, y: number) => void
  /** Raise a faceplate to the top of the stack and select it (click-to-front). */
  focusFaceplate: (tag: string) => void
  select: (tag: string | null) => void
  openStudio: (tag: string) => void
  openSfc: (name: string) => boolean
  /** Close every open faceplate and return to Overview — used when switching projects. */
  resetToOverview: () => void
  /** Faceplate "Explorer" link: jump to DeltaV Explorer with this module selected. */
  focusExplorer: (tag: string) => void
  /** Faceplate "Trend" link: jump to the Historian Trend with this tag's pen isolated. */
  focusTrend: (tag: string) => void
  /** Faceplate "Alarms" link: jump to the Alarm List filtered to this tag. */
  focusAlarms: (tag: string) => void
  clearTrendFocus: () => void
  clearAlarmFocus: () => void
  openPicture: (name: string) => boolean
  openModuleDisplay: (tag: string, kind: 'primary' | 'detail') => boolean
  /** DV09-044 workstation area subscription: null means subscribed to every
   * area (the existing unrestricted default); an array restricts this
   * workstation's alarm banner/audio/acknowledge-all to those areas only. */
  subscribedAreas: string[] | null
  /** DV09-125/126: banner priority thresholds (strictly greater than), separate for process and device alarms. */
  bannerThresholds: BannerThresholds
  /** Validates, applies and saves the thresholds; returns an error message or null. */
  setBannerThresholds: (t: BannerThresholds) => string | null
  setSubscribedAreas: (areas: string[] | null) => void
}

let cascade = 0
let faceTop = 0

export const useUi = create<UiState>((set, get) => ({
  navigationOpen: false,
  toggleNavigation: () => set(s => ({ navigationOpen: !s.navigationOpen })),
  processViewRevision: 0,
  resetProcessView: () => set(s => ({ processViewRevision: s.processViewRevision + 1 })),
  display: 'process',
  history: ['process'],
  histIndex: 0,
  pictureHistory: [null],
  builderPicture: null,
  builderRun: false,
  faceplates: [],
  pidDetailTag: null,
  closePidDetail: () => set({ pidDetailTag: null }),
  selectedTag: null,
  studioTag: null,
  studioClass: null,
  studioInstance: null,
  openClassStudio: (className, instance) =>
    set((s) => {
      const history = s.display === 'studio' ? s.history : s.history.slice(0, s.histIndex + 1).concat('studio')
      const pictureHistory = s.display === 'studio' ? s.pictureHistory : s.pictureHistory.slice(0, s.histIndex + 1).concat(null)
      return { studioClass: className, studioInstance: instance ?? null, studioPhase: null, selectedTag: instance ?? s.selectedTag,
        display: 'studio', history, pictureHistory, histIndex: history.length - 1 }
    }),
  closeClassStudio: () => set({ studioClass: null, studioInstance: null }),
  studioPhase: null,
  studioComposite: null,
  openPhaseStudio: (phaseClass, composite) =>
    set((s) => {
      const history = s.display === 'studio' ? s.history : s.history.slice(0, s.histIndex + 1).concat('studio')
      const pictureHistory = s.display === 'studio' ? s.pictureHistory : s.pictureHistory.slice(0, s.histIndex + 1).concat(null)
      return { studioPhase: phaseClass, studioComposite: composite ?? null, studioClass: null, studioInstance: null,
        display: 'studio', history, pictureHistory, histIndex: history.length - 1 }
    }),
  closePhaseStudio: () => set({ studioPhase: null, studioComposite: null }),
  sfcName: null,
  studioLayout: {},
  setStudioLayout: (tag, x, y) => set((s) => ({ studioLayout: { ...s.studioLayout, [tag]: { x, y } } })),
  trendFocusTag: null,
  alarmFocusTag: null,

  navigate: (display) =>
    set((s) => {
      if (display === s.display) return {}
      const history = s.history.slice(0, s.histIndex + 1)
      history.push(display)
      const pictureHistory = s.pictureHistory.slice(0, s.histIndex + 1).concat(null)
      return { display, history, pictureHistory, histIndex: history.length - 1,
        ...(display === 'builder' ? { builderPicture: null, builderRun: false } : {}) }
    }),

  back: () =>
    set((s) => (s.histIndex > 0 ? { histIndex: s.histIndex - 1, display: s.history[s.histIndex - 1],
      builderPicture: s.pictureHistory[s.histIndex - 1] ?? null, builderRun: !!s.pictureHistory[s.histIndex - 1] } : {})),

  forward: () =>
    set((s) =>
      s.histIndex < s.history.length - 1
        ? { histIndex: s.histIndex + 1, display: s.history[s.histIndex + 1],
          builderPicture: s.pictureHistory[s.histIndex + 1] ?? null, builderRun: !!s.pictureHistory[s.histIndex + 1] }
        : {}
    ),

  openFaceplate: (tag, x, y) => {
    const existing = get().faceplates.find((f) => f.tag === tag)
    if (existing) {
      get().focusFaceplate(tag)
      return
    }
    const offset = (cascade++ % 6) * 26
    const px = x ?? 120 + offset
    const py = y ?? 56 + Math.round(offset / 2)
    set((s) => ({
      faceplates: [...s.faceplates, { tag, x: px, y: py, z: ++faceTop }],
      selectedTag: tag
    }))
  },

  closeFaceplate: (tag) =>
    set((s) => ({ faceplates: s.faceplates.filter((f) => f.tag !== tag) })),

  moveFaceplate: (tag, x, y) =>
    set((s) => ({
      faceplates: s.faceplates.map((f) => (f.tag === tag ? { ...f, x, y } : f))
    })),

  focusFaceplate: (tag) =>
    set((s) => {
      const target = s.faceplates.find((f) => f.tag === tag)
      // Already on top: just select, avoid a needless token bump/re-render.
      if (target && target.z === Math.max(...s.faceplates.map((f) => f.z))) {
        return { selectedTag: tag }
      }
      return {
        selectedTag: tag,
        faceplates: s.faceplates.map((f) => (f.tag === tag ? { ...f, z: ++faceTop } : f))
      }
    }),

  select: (selectedTag) => set({ selectedTag }),

  openStudio: (tag) =>
    set((s) => {
      const history = s.display === 'studio' ? s.history : s.history.slice(0, s.histIndex + 1).concat('studio')
      const pictureHistory = s.display === 'studio' ? s.pictureHistory : s.pictureHistory.slice(0, s.histIndex + 1).concat(null)
      const module = useStore.getState().modules[tag]
      const classInstance = module?.type === 'AI' ? module.classInstance : undefined
      return {
        studioTag: classInstance ? s.studioTag : tag,
        studioPhase: null,
        studioClass: classInstance ?? null,
        studioInstance: classInstance ? tag : null,
        selectedTag: tag,
        display: 'studio',
        history,
        pictureHistory,
        histIndex: history.length - 1
      }
    }),

  openSfc: name => {
    const key = name.trim().toUpperCase()
    if (!useStore.getState().sfcs[key]) {
      const message = `SFC not found: ${key || '(unassigned)'}`
      useStore.getState().logEvent('DIAGNOSTIC', key, message)
      window.alert(message)
      return false
    }
    set({ sfcName: key, selectedTag: key })
    get().navigate('sfc')
    return true
  },

  resetToOverview: () =>
    set({
      faceplates: [],
      pidDetailTag: null,
      selectedTag: null,
      studioTag: null,
      studioClass: null,
      studioInstance: null,
      studioPhase: null,
      studioComposite: null,
      sfcName: null,
      display: 'process',
      history: ['process'],
      histIndex: 0,
      pictureHistory: [null], builderPicture: null, builderRun: false
    }),

  focusExplorer: (tag) => {
    set({ selectedTag: tag })
    get().navigate('explorer')
  },

  focusTrend: (tag) => {
    set({ trendFocusTag: tag })
    get().navigate('trend')
  },

  focusAlarms: (tag) => {
    set({ alarmFocusTag: tag })
    get().navigate('alarms')
  },

  clearTrendFocus: () => set({ trendFocusTag: null }),
  clearAlarmFocus: () => set({ alarmFocusTag: null }),

  openPicture: (name) => {
    const target = resolvePictureTarget(name, usePictures.getState().pictures)
    if (!target) {
      const message = `Picture not found: ${name || '(unassigned)'}`
      useStore.getState().logEvent('DIAGNOSTIC', name, message)
      window.alert(message)
      return false
    }
    if (target.kind === 'display') get().navigate(target.display)
    else set(s => {
      if (s.display === 'builder' && s.builderPicture === target.name && s.builderRun) return {}
      const history = s.history.slice(0, s.histIndex + 1).concat('builder')
      const pictureHistory = s.pictureHistory.slice(0, s.histIndex + 1).concat(target.name)
      return { display: 'builder', builderPicture: target.name, builderRun: true,
        history, pictureHistory, histIndex: history.length - 1 }
    })
    return true
  },

  openModuleDisplay: (tag, kind) => {
    const m = useStore.getState().modules[tag]
    const name = kind === 'primary' ? m?.primaryDisplay : m?.detailDisplay
    if (kind === 'detail' && m?.type === 'PID' && !name) {
      set({ pidDetailTag: tag })
      return true
    }
    if (!m || !name) {
      const message = !m ? `Module ${tag} does not exist` : `${tag} has no assigned ${kind} display`
      useStore.getState().logEvent('DIAGNOSTIC', tag, message)
      window.alert(message)
      return false
    }
    return get().openPicture(name)
  },

  subscribedAreas: null,
  bannerThresholds: loadBannerThresholds(),
  setBannerThresholds: (t) => {
    const error = bannerThresholdError(t)
    if (error) return error
    if (!saveBannerThresholds(t)) return 'The banner settings could not be saved in this browser profile'
    set({ bannerThresholds: { ...t } })
    return null
  },
  setSubscribedAreas: (areas) => set({ subscribedAreas: areas })
}))
