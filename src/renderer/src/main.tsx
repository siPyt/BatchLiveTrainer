import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useLibrary } from './engine/libraryStore'
import './engine/batchStore'
import { useStore } from './engine/store'
import { restoreCourseDatabase, startCourseAutosave } from './engine/courseSave'
import './styles.css'

// BatchLiveTrainer opens on the Course 7016 DV_School training database (ED_CENTER_BATCH): the student's saved
// database when there is one, otherwise a fresh copy. It is autosaved while the app runs.
useLibrary.getState().installCourseProject()
if (restoreCourseDatabase()) useStore.getState().logEvent('CONFIGURE', 'DV_School', 'Saved Course 7016 database restored')
startCourseAutosave()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)