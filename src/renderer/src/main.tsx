import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './engine/batchStore'
import { useStore } from './engine/store'
import { startCourseAutosave } from './engine/courseSave'
import { bootProject, savedProject } from './ui/courseSwitch'
import { startKeepAwake } from './engine/keepAwake'
import { startHealthMonitor } from './engine/health'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { restoreUiSession, startUiSessionSave } from './ui/uiSession'
import { useUi } from './ui/uiStore'
import { homeDisplayFor } from './ui/displayNavigation'
import { useNotices } from './components/AppNotices'

// Messages appear inside the app (some hosts, such as automated/embedded browsers, suppress native alert popups).
window.alert = (message?: unknown): void => { useNotices.getState().push(String(message ?? '')) }
import './styles.css'
import './dv09-chapters.css'
import './dv09-loops.css'

// BatchLiveTrainer opens on the Course 7016 DV_School training database (ED_CENTER_BATCH): the student's saved
// database when there is one, otherwise a fresh copy. It is autosaved while the app runs.
const bootedProject = savedProject()
if (bootProject()) useStore.getState().logEvent('CONFIGURE', bootedProject === 'DV-09' ? 'DV-09' : 'DV_School', `Saved Course ${bootedProject} database restored`)
startCourseAutosave()
// Stay on the same screen across reloads and keep the display awake (an idle tab that sleeps reloads to Process).
// A saved DV-09 project with no saved screen position opens on the DV-09 home display, not the hidden Batch Process picture.
if (!restoreUiSession() && bootedProject === 'DV-09') {
  useUi.getState().setCourse('DV-09')
  useUi.getState().navigate(homeDisplayFor('DV-09'))
}
startUiSessionSave()
startKeepAwake()
startHealthMonitor()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
)