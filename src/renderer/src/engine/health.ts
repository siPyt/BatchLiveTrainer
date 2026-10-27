// Detects and recovers from the "grey blank screen after sitting idle" problem, and records why it happened.
//  - A page the browser killed or discarded never ran its unload handlers, so the next start knows it was not closed cleanly.
//  - A page the browser froze (timers stop) shows up as a long gap between two ticks of a 1 s timer.
//  - An empty #root means a render error unmounted the app; the page reloads itself (restoring the open screen).
// Everything is written to localStorage ('batchlive-health') so the cause can be read back instead of guessed.

const CLEAN = 'batchlive-clean-exit'
const BEAT = 'batchlive-heartbeat'
const LOG = 'batchlive-health'
const RELOADS = 'batchlive-health-reloads'
export const FROZEN_GAP_MS = 15000

export interface HealthEntry { at: string; kind: 'killed' | 'frozen' | 'blank' | 'error'; detail: string }

/** Message for the next start when the previous run did not end cleanly (killed, discarded or crashed); null for a normal start. */
export function unexpectedExitNotice(lastBeat: number | null, cleanExit: boolean, now: number): string | null {
  if (!lastBeat || cleanExit) return null
  const away = Math.max(0, Math.round((now - lastBeat) / 1000))
  return `The page was reloaded after the browser stopped it without closing it (last active ${away < 90 ? `${away} s` : `${Math.round(away / 60)} min`} before). Your screen and database were restored.`
}

/** Message when a 1 s timer fires much later than it should, i.e. the browser had frozen the page. */
export function frozenNotice(gapMs: number): string | null {
  return gapMs > FROZEN_GAP_MS ? `The browser paused this page for ${gapMs < 90000 ? `${Math.round(gapMs / 1000)} s` : `${Math.round(gapMs / 60000)} min`} (power saving). It has resumed.` : null
}

function record(kind: HealthEntry['kind'], detail: string): void {
  try {
    const list: HealthEntry[] = JSON.parse(localStorage.getItem(LOG) ?? '[]')
    list.push({ at: new Date().toISOString(), kind, detail: detail.slice(0, 400) })
    localStorage.setItem(LOG, JSON.stringify(list.slice(-20)))
  } catch { /* storage unavailable */ }
}
export const recordCrash = (detail: string): void => record('error', detail)

export function startHealthMonitor(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  const now = Date.now()
  const last = Number(localStorage.getItem(BEAT)) || null
  const exitMessage = unexpectedExitNotice(last, localStorage.getItem(CLEAN) === '1', now)
  if (exitMessage) record('killed', exitMessage)
  localStorage.setItem(CLEAN, '0')

  const beat = (): void => { try { localStorage.setItem(BEAT, String(Date.now())) } catch { /* ignore */ } }
  beat()
  setInterval(beat, 5000)
  const clean = (): void => { try { localStorage.setItem(CLEAN, '1') } catch { /* ignore */ } }
  window.addEventListener('beforeunload', clean)
  window.addEventListener('pagehide', clean)

  let tickAt = Date.now()
  setInterval(() => {
    const t = Date.now()
    const message = frozenNotice(t - tickAt)
    tickAt = t
    if (message) record('frozen', message)
  }, 1000)

  window.addEventListener('error', e => record('error', `${e.message} (${e.filename ?? ''}:${e.lineno ?? ''})`))
  window.addEventListener('unhandledrejection', e => record('error', `Unhandled rejection: ${String((e.reason as Error)?.message ?? e.reason)}`))

  // An empty #root means the app unmounted after an error: reload (at most 3 times a minute) instead of leaving a blank page.
  const rootEmpty = (): boolean => (document.getElementById('root')?.childElementCount ?? 1) === 0
  const recover = (): void => {
    if (!rootEmpty()) return
    try {
      const stamps: number[] = JSON.parse(sessionStorage.getItem(RELOADS) ?? '[]').filter((s: number) => Date.now() - s < 60000)
      if (stamps.length >= 3) return
      sessionStorage.setItem(RELOADS, JSON.stringify([...stamps, Date.now()]))
    } catch { /* ignore */ }
    record('blank', 'The page was blank; reloaded automatically.')
    window.location.reload()
  }
  setInterval(recover, 3000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recover() })
}
