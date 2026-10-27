/**
 * Keeps the display from sleeping while BatchLiveTrainer is open. A browser that puts an idle tab to sleep (or discards
 * it to save memory) reloads the page, and the display falls back to Process; holding a screen wake lock and a Web Lock
 * for the life of the page prevents both. The Electron app does the same through powerSaveBlocker (src/main/index.ts).
 */
export function startKeepAwake(): void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return

  let sentinel: WakeLockSentinel | null = null
  const acquire = async (): Promise<void> => {
    if (document.visibilityState !== 'visible' || !navigator.wakeLock || (sentinel && !sentinel.released)) return
    try { sentinel = await navigator.wakeLock.request('screen') } catch { /* denied (battery saver, no permission): try again on the next visibility change */ }
  }
  void acquire()
  document.addEventListener('visibilitychange', () => { void acquire() })

  // A page holding a Web Lock is not frozen or discarded by Chrome/Edge memory saver.
  navigator.locks?.request('batchlive-keep-alive', () => new Promise<void>(() => {})).catch(() => {})
}
