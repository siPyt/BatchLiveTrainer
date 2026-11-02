import { useState } from 'react'
import { SimulatorDialog } from './SimulatorDialog'
import { useStore } from '../engine/store'
import { createBlankModule, nameInUse } from '../engine/dv09Cm'
import { moduleNameError } from '../engine/naming'
import { useUi } from '../ui/uiStore'
import { openOperate } from '../ui/dv09Operate'

// Course DV-09 chapter 3 in DeltaV Explorer: the New Control Module dialog (Object name), the Operate toolbar buttons (p3-20, p3-21).

/** Right-click a plant area > New > Control Module: the Object name of an empty control module (p3-14, step 1). */
export function Dv09NewModuleDialog({ area, onClose, onCreated }: { area: string; onClose: () => void; onCreated: (tag: string) => void }): JSX.Element {
  const areas = useStore(s => s.areas)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [areaName, setAreaName] = useState(area)
  const [error, setError] = useState<string | null>(null)
  const tag = name.trim().toUpperCase()
  const problem = tag ? moduleNameError(tag) ?? (nameInUse(tag) ? `The name ${tag} is already used` : null) : null
  const submit = (): void => {
    if (!tag || problem) { setError(problem ?? 'Enter the Object name'); return }
    const e = createBlankModule(tag, areaName, description)
    if (e) { setError(e); return }
    onCreated(tag)
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="New Control Module" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Object name:<input aria-label="Object name" maxLength={16} autoFocus value={name} onChange={e => { setName(e.target.value); setError(null) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} /></label>
      <label>Description:<input aria-label="Description" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Area:<select aria-label="Area" value={areaName} onChange={e => setAreaName(e.target.value)}>{areas.map(a => <option key={a}>{a}</option>)}</select></label>
      {(error ?? problem) && <p role="alert" className="lib-dlg-error">{error ?? problem}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** The Explorer toolbar buttons that launch DeltaV Operate (Run) and DeltaV Operate (Configure). */
export function Dv09OperateButtons(): JSX.Element {
  const course = useUi(s => s.course)
  if (course !== 'DV-09') return <></>
  return <>
    <span className="dvx-tsep" />
    <button className="dvx-tool" title="DeltaV Operate (Run)" aria-label="DeltaV Operate (Run)" onClick={() => openOperate('run')}>
      <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><rect x={1} y={2} width={6} height={9} fill="#c0452f" stroke="#3f444b" /><rect x={9} y={2} width={6} height={9} fill="#34338c" stroke="#3f444b" /><path d="M2,14 H14" stroke="#3f444b" strokeWidth={1.5} /></svg>
    </button>
    <button className="dvx-tool" title="DeltaV Operate (Configure)" aria-label="DeltaV Operate (Configure)" onClick={() => openOperate('configure')}>
      <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><rect x={1} y={1} width={14} height={14} fill="#fff" stroke="#3f444b" /><path d="M1,5 H15 M5,5 V15 M9,9 H15" stroke="#4f6fa8" strokeWidth={1.2} /></svg>
    </button>
  </>
}
