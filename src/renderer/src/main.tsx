import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { useLibrary } from './engine/libraryStore'
import './engine/batchStore'
import './styles.css'

// BatchLiveTrainer opens on the Course 7016 DV_School training database (ED_CENTER_BATCH).
useLibrary.getState().installCourseProject()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)