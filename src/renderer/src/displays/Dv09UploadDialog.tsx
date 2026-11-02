import { useState } from 'react'
import { useStore } from '../engine/store'
import { uploadDifferences, uploadOpened, uploadParameters } from '../engine/dv09Loops'
import { SimulatorDialog } from '../components/SimulatorDialog'

/**
 * Course DV-09 chapter 6 (pp 6-22 .. 6-27): right-click the module > Upload, or the Upload prompt of a download after an on-line change.
 * By default no parameter is selected; clicking OK with none selected still shows "Upload complete" and writes nothing.
 */
export function Dv09UploadDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element {
  useStore(s => s.modules[tag])
  const [opened] = useState(() => { uploadOpened(tag); return true })
  const diff = uploadDifferences(tag)
  const [picked, setPicked] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const toggle = (name: string, on: boolean): void => setPicked(p => (on ? [...p, name] : p.filter(n => n !== name)))
  if (done) {
    return <SimulatorDialog className="module-download-dialog dvd" label="Upload" onClose={onClose}>
      <div className="lib-dlg-fields dvd-panel"><p role="status" data-upload-result="complete">Upload complete.</p></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button></div>
    </SimulatorDialog>
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Upload ${tag}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel" data-upload-opened={opened}>
      <p>Select the parameters you want written back to the configuration database.</p>
      {diff.length === 0 && <p className="exp-hint">The on-line values of {tag} match the database.</p>}
      <ul aria-label="Parameters to upload" style={{ listStyle: 'none', padding: 0 }}>
        {diff.map(d => <li key={d.name}><label><input type="checkbox" aria-label={`Upload ${d.name}`} checked={picked.includes(d.name)} onChange={e => toggle(d.name, e.target.checked)} />
          {d.name}: on-line {d.online} / database {d.database}</label></li>)}
      </ul>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons">
      <button className="tbtn sm" onClick={() => { const e = uploadParameters(tag, picked); if (e) setError(e); else setDone(true) }}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}
