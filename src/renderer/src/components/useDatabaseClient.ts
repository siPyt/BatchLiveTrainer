import { useEffect } from 'react'
import { useSystem } from '../engine/systemPreferences'
import { useUi } from '../ui/uiStore'

/** DV09-108/109: a database application is open while its window is; in class 7016 it stays open until closed in System Preferences. */
export function useDatabaseClient(name: string): void {
  const register = useSystem((s) => s.registerClient)
  const close = useSystem((s) => s.closeClient)
  useEffect(() => {
    register(name)
    // Class DV-09: closing the application's window disconnects it from the database, as in DeltaV.
    return () => { if (useUi.getState().course === 'DV-09') close(name) }
  }, [name, register, close])
}
