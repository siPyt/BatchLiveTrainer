import { useStore } from './store'
import { useLibrary, downloadState } from './libraryStore'
import { useBatch, unitDownloadState } from './batchStore'
import { useEm, emDownloadState } from './emStore'
import { moduleDownloadStatus } from './downloadStatus'

/**
 * Where DeltaV Explorer shows the blue "download required" triangle: on every changed object and on all of its
 * containers (unit module, process cell, plant area, Control Strategies, controller, Assigned Modules ...).
 */
export interface DownloadPending {
  /** Row-level state: what the object's own row shows (unassigned class instances show it too). */
  tag: (tag: string) => boolean
  unit: (name: string) => boolean
  cell: (name: string) => boolean
  area: (name: string) => boolean
  /** A module or unit assigned to this controller differs from what was downloaded. */
  controller: (tag: string) => boolean
  anyArea: boolean
  anyController: boolean
}

const SHOWN = ['NO_CONFIGURATION', 'UNKNOWN', 'DIFFERENT']

export function computeDownloadPending(): DownloadPending {
  const main = useStore.getState()
  const lib = useLibrary.getState()
  const batch = useBatch.getState()
  const em = useEm.getState()

  const rowTags = new Set<string>()
  const assignedTags = new Set<string>()
  const tagArea: Record<string, string> = {}
  const mark = (tag: string, area: string | undefined, pending: boolean): void => {
    if (area) tagArea[tag] = area
    if (!pending) return
    rowTags.add(tag)
    if (lib.assignments[tag]) assignedTags.add(tag)
  }

  for (const m of Object.values(main.modules)) {
    const pending = lib.instances[m.tag] ? downloadState(lib, m.tag) !== 'current'
      : SHOWN.includes(moduleDownloadStatus(main, m.tag).status)
    mark(m.tag, m.area, pending)
  }
  for (const sfc of Object.values(main.sfcs)) mark(sfc.name, sfc.area, SHOWN.includes(moduleDownloadStatus(main, sfc.name).status))
  for (const i of Object.values(em.instances)) {
    const st = emDownloadState(i.tag, lib.assignments[i.tag])
    mark(i.tag, i.area, st === 'not-downloaded' || st === 'pending')
  }

  const unitOwn = new Set<string>()
  for (const u of Object.values(batch.units)) {
    const st = unitDownloadState(batch, u.name)
    if (st === 'not-downloaded' || st === 'pending') unitOwn.add(u.name)
  }
  const unitPending = new Set(unitOwn)
  for (const [tag, unit] of Object.entries(batch.contained)) if (rowTags.has(tag)) unitPending.add(unit)

  const cellPending = new Set<string>()
  const areaPending = new Set<string>()
  for (const u of Object.values(batch.units)) {
    if (unitPending.has(u.name)) { cellPending.add(u.processCell); const a = batch.processCells[u.processCell]?.area; if (a) areaPending.add(a) }
  }
  for (const tag of rowTags) if (tagArea[tag]) areaPending.add(tagArea[tag])

  const controllers = new Set<string>()
  for (const tag of assignedTags) controllers.add(lib.assignments[tag])
  for (const u of unitOwn) { const c = batch.unitAssignments[u]; if (c) controllers.add(c) }

  return {
    tag: t => rowTags.has(t),
    unit: n => unitPending.has(n),
    cell: n => cellPending.has(n),
    area: n => areaPending.has(n),
    controller: t => controllers.has(t),
    anyArea: areaPending.size > 0,
    anyController: controllers.size > 0
  }
}
