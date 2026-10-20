import { useEffect, useRef } from 'react'
import { useStore } from './engine/store'
import { useUi } from './ui/uiStore'
import { compareAlarmRank } from './utils/format'
import { AlarmBanner } from './components/AlarmBanner'
import { TopBar } from './components/TopBar'
import { NavSidebar } from './components/NavSidebar'
import { StatusBar } from './components/StatusBar'
import { FlexLockOverlay } from './components/FlexLockOverlay'
import { SignatureDialog } from './components/SignatureDialog'
import './engine/eventChronicle'
import './engine/licensing'
import { AccessDeniedToast } from './components/AccessDeniedToast'
import { AlarmAudio } from './components/AlarmAudio'
import { FaceplateHost } from './faceplates/FaceplateHost'
import { AlarmSummary } from './displays/AlarmSummary'
import { EventJournalDisplay } from './displays/EventJournalDisplay'
import { TrendDisplay } from './displays/TrendDisplay'
import { ExplorerDisplay } from './displays/ExplorerDisplay'
import { ControlStudioDisplay } from './displays/ControlStudioDisplay'
import { ClassStudio } from './displays/ClassStudio'
import { PhaseStudio } from './displays/PhaseStudio'
import { BatchDialogHost } from './components/BatchDialogs'
import { BatchHelpDisplay, BatchWindows } from './components/BatchFaceplates'
import { ProcessDisplay } from './displays/ProcessDisplay'
import { SfcDisplay } from './displays/SfcDisplay'
import { DisplayBuilder } from './displays/DisplayBuilder'
import { WorkshopsDisplay } from './displays/WorkshopsDisplay'
import { UserManagerDisplay } from './displays/UserManagerDisplay'
import { SystemPreferencesDisplay } from './displays/SystemPreferencesDisplay'
import { ApplicationsDisplay } from './displays/ApplicationsDisplay'
import { PhysicalNetworkDisplay } from './displays/PhysicalNetworkDisplay'

export function App(): JSX.Element {
  const tick = useStore((s) => s.tick)
  const display = useUi((s) => s.display)
  const navigationOpen = useUi((s) => s.navigationOpen)
  const processViewRevision = useUi((s) => s.processViewRevision)
  const studioClass = useUi((s) => s.studioClass)
  const studioPhase = useUi((s) => s.studioPhase)
  const last = useRef<number>(performance.now())

  // Fixed-rate simulation loop (~10 Hz) decoupled from render.
  useEffect(() => {
    let raf = 0
    let acc = 0
    const STEP = 0.1 // seconds
    const loop = (now: number): void => {
      const dt = Math.min(0.5, (now - last.current) / 1000)
      last.current = now
      acc += dt
      while (acc >= STEP) {
        tick(STEP)
        acc -= STEP
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tick])

  // Operator console hotkeys: F8 Silence Horn, F9 Acknowledge top alarm.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'F8') {
        e.preventDefault()
        useStore.getState().silenceHorn()
      } else if (e.key === 'F9') {
        e.preventDefault()
        const top = [...useStore.getState().alarms].sort(compareAlarmRank)[0]
        if (top) useStore.getState().ackAlarm(top.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-body">
        {navigationOpen && <NavSidebar />}
        <div className="main-area">
          {display === 'alarms' && <AlarmSummary />}
          {display === 'journal' && <EventJournalDisplay />}
          {display === 'trend' && <TrendDisplay />}
          {display === 'explorer' && <ExplorerDisplay />}
          {display === 'studio' && (studioPhase ? <PhaseStudio key={studioPhase} /> : studioClass ? <ClassStudio key={studioClass} /> : <ControlStudioDisplay />)}
          {display === 'process' && <ProcessDisplay key={processViewRevision} />}
          {display === 'batchhelp' && <BatchHelpDisplay />}
          {display === 'sfc' && <SfcDisplay />}
          {display === 'builder' && <DisplayBuilder />}
          {display === 'workshops' && <WorkshopsDisplay />}
          {display === 'users' && <UserManagerDisplay />}
          {display === 'system' && <SystemPreferencesDisplay />}
          {display === 'applications' && <ApplicationsDisplay />}
          {display === 'hardware' && <PhysicalNetworkDisplay />}
        </div>
      </div>
      <AlarmBanner />
      <StatusBar />
      <FaceplateHost />
      <BatchWindows />
      <BatchDialogHost />
      <AccessDeniedToast />
      <FlexLockOverlay />
      <SignatureDialog />
      <AlarmAudio />
    </div>
  )
}
