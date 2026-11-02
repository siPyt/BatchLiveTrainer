import { useStore } from './store'
import { useLibrary } from './libraryStore'
import { controllerIsDown, type Controller, type HardwareState } from './hardware'

// Course DV-09 chapter 2 (pp 2-93 .. 2-103): a total download of a controller sends its configuration; Explorer keeps showing
// the blue "download required" triangle until what is in the controller matches the configuration database.

/** What a total download carries for the controller itself: cold restart, redundancy and its I/O cards with their DSTs. */
export function controllerConfigSignature(c: Controller, hw: HardwareState): string {
  const cards = Object.values(hw.traditionalCards ?? {}).filter(card => card.controllerTag === c.tag).sort((a, b) => a.slot - b.slot)
  return JSON.stringify({
    cold: c.coldRestartMinutes, redundant: c.redundant, network: c.networkRedundant, alarms: !!c.hardwareAlarms, sync: !!c.timeSyncIntegrity,
    cards: cards.map(card => ({ slot: card.slot, type: card.type,
      ch: card.channels.map(ch => [ch.channel, ch.dst, ch.enabled, ch.description ?? '', ch.outputOption ?? null, ch.tiebackDst ?? ''])
    }))
  })
}

/** True while a commissioned, tracked controller differs from what was last downloaded to it. */
export function controllerHardwarePending(c: Controller, hw: HardwareState): boolean {
  return !!c.trackDownload && c.commissioned && c.downloadedConfig !== controllerConfigSignature(c, hw)
}

export interface VerifyResult { problems: string[]; cards: number; dsts: number }

/** "Verify the configuration" (p2-100): enabled channels without a DST and module bindings to DSTs that no longer exist. */
export function verifyControllerConfig(tag: string): VerifyResult {
  const hw = useStore.getState().hardware
  const cards = Object.values(hw.traditionalCards ?? {}).filter(card => card.controllerTag === tag)
  const problems: string[] = []
  for (const card of cards) {
    for (const ch of card.channels) if (ch.enabled && !ch.dst) problems.push(`${card.id.split('/').pop()} CH${String(ch.channel).padStart(2, '0')} is enabled without a Device Tag`)
  }
  const bound = [...Object.entries(hw.discreteBindings ?? {}).map(([m, dst]) => [m, dst]),
    ...Object.entries(hw.analogBindings ?? {}).flatMap(([m, b]) => Object.values(b).map(dst => [m, dst])),
    ...Object.entries(hw.deviceBindings ?? {}).flatMap(([m, b]) => Object.values(b).map(dst => [m, dst]))]
  for (const [module, dst] of bound) if (dst && !Object.values(hw.traditionalCards ?? {}).some(card => card.channels.some(ch => ch.dst === dst))) problems.push(`${module} refers to ${dst}, which does not exist`)
  return { problems, cards: cards.length, dsts: cards.reduce((n, card) => n + card.channels.filter(ch => ch.dst).length, 0) }
}

export interface DownloadItem { label: string; needed: boolean }

/** The progress list of the Downloading Selected Objects dialog (p2-102); stippled items are not needed for this download. */
export function downloadItems(tag: string): DownloadItem[] {
  const v = verifyControllerConfig(tag)
  const modules = Object.values(useLibrary.getState().assignments).filter(c => c === tag).length
  return [
    { label: 'Creating Log File', needed: true },
    { label: 'Performing Upload Checks', needed: true },
    { label: 'Performing Pre-download Checks', needed: true },
    { label: 'Performing Dependency Checks', needed: false },
    { label: 'Downloading controller setup data (cold restart, redundancy)', needed: true },
    { label: `Downloading I/O cards (${v.cards} card(s), ${v.dsts} DST(s))`, needed: v.cards > 0 },
    { label: `Downloading control modules (${modules})`, needed: modules > 0 }
  ]
}

/** Total/full controller download: refuses with a message, or records the download and returns the items that were sent. */
export function downloadControllerTotal(tag: string): { ok: true; items: DownloadItem[] } | { ok: false; error: string } {
  const c = useStore.getState().hardware.controllers[tag]
  if (!c) return { ok: false, error: `Controller ${tag} does not exist` }
  if (!c.commissioned) return { ok: false, error: `Controller ${tag} is not commissioned: commission it before downloading` }
  if (controllerIsDown(c)) return { ok: false, error: `Controller ${tag} is not communicating` }
  const items = downloadItems(tag)
  const r = useLibrary.getState().downloadController(tag)
  if (!r.ok) return { ok: false, error: r.error }
  const main = useStore.getState()
  const current = main.hardware.controllers[tag]
  const signature = controllerConfigSignature(current, main.hardware)
  useStore.setState(s => ({ hardware: { ...s.hardware, controllers: { ...s.hardware.controllers, [tag]: { ...s.hardware.controllers[tag], downloadedConfig: signature, downloadedAt: s.time } } }, rev: s.rev + 1 }))
  const v = verifyControllerConfig(tag)
  main.logEvent('CONFIGURE', tag, `Total controller download complete: ${v.cards} I/O card(s), ${v.dsts} DST(s), cold restart ${current.coldRestartMinutes} min`)
  return { ok: true, items }
}
