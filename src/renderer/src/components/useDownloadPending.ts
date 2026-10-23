import { useStore } from '../engine/store'
import { useLibrary } from '../engine/libraryStore'
import { useBatch } from '../engine/batchStore'
import { useEm } from '../engine/emStore'
import { computeDownloadPending, type DownloadPending } from '../engine/downloadPending'

/** Re-renders when anything that decides a download triangle changes, then reads the current picture. */
export function useDownloadPending(): DownloadPending {
  useStore(s => s.modules); useStore(s => s.sfcs); useStore(s => s.moduleLifecycle); useStore(s => s.pidLifecycle)
  useStore(s => s.deviceLifecycle); useStore(s => s.sfcLifecycle); useStore(s => s.downloadStatusChecks); useStore(s => s.hardware)
  useLibrary(s => s.instances); useLibrary(s => s.classes); useLibrary(s => s.assignments); useLibrary(s => s.deployed)
  useBatch(s => s.units); useBatch(s => s.unitAssignments); useBatch(s => s.deployedUnits); useBatch(s => s.phaseClasses)
  useBatch(s => s.contained); useBatch(s => s.processCells)
  useEm(s => s.instances); useEm(s => s.classes); useEm(s => s.deployed)
  return computeDownloadPending()
}
