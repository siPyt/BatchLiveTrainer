import { useState } from 'react'
import { SimulatorDialog } from './SimulatorDialog'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { moduleNameError } from '../engine/naming'
import { nameInUse } from '../engine/dv09Cm'
import { downloadSfc, newUntitledSfc, recordBrowse, saveSfcAs } from '../engine/dv09Sfc'
import { sfcModulePaths } from '../engine/dv09SfcPaths'
import type { AnyModule } from '../engine/types'
import type { SfcParameter } from '../engine/sfcParameters'
import type { SfcConfiguration } from '../engine/sfcLifecycle'

// Course DV-09 chapter 7 dialogs of the Control Studio SFC editor: New (p7-20), Save As, parameter properties (p7-21), Assign To Node,
// Download and Check results, plus the Expression Assistant Browser of Action / Transition Properties (p7-13, p7-14).

/** File > New: Object name UNTITLED, Object type, Create New with the Algorithm type list (slide 7-20). */
export function Dv09StudioNewDialog({ onClose, onOtherAlgorithm }: { onClose: () => void; onOtherAlgorithm?: () => void }): JSX.Element {
  const [algorithm, setAlgorithm] = useState('Function Block Diagram')
  const [message, setMessage] = useState('')
  const submit = (): void => {
    if (algorithm !== 'Sequential Function Chart') {
      if (algorithm === 'Function Block Diagram' && onOtherAlgorithm) { onOtherAlgorithm(); return }
      setMessage(algorithm === 'Function Block Diagram' ?
        'In this simulator Function Block Diagram control modules are created in DeltaV Explorer: right-click a plant area, New, Control Module.' :
        `${algorithm} algorithms are not modeled; choose Sequential Function Chart.`)
      return
    }
    const name = newUntitledSfc()
    if (!name) { setMessage('The SFC could not be created (see the Event Journal)'); return }
    onClose()
    useUi.getState().openStudio(name)
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="New" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Object name:<input aria-label="Object name" value="UNTITLED" disabled readOnly /></label>
      <label>Object type:<select aria-label="Object type" defaultValue="Control Module or Template">
        <option>Control Module or Template</option></select></label>
      <fieldset className="dvd-panel">
        <label className="lib-dlg-check"><input type="radio" name="dv09-new-from" disabled />Start From Existing</label>
        <label className="lib-dlg-check"><input type="radio" name="dv09-new-from" checked readOnly />Create New</label>
        <label>Algorithm type:<select aria-label="Algorithm type" value={algorithm} onChange={e => { setAlgorithm(e.target.value); setMessage('') }}>
          <option>Function Block Diagram</option><option>Sequential Function Chart</option>
          <option>Command driven</option><option>State driven</option></select></label>
      </fieldset>
      {message && <p role="alert" className="lib-dlg-error">{message}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** Save of an UNTITLED SFC: the Object name and the plant area. */
export function Dv09SaveAsDialog({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: (name: string) => void }): JSX.Element {
  const areas = useStore(s => s.areas)
  const [objectName, setObjectName] = useState('')
  const [area, setArea] = useState(useStore.getState().sfcs[name]?.area ?? areas[0] ?? '')
  const [error, setError] = useState('')
  const key = objectName.trim().toUpperCase()
  const problem = key ? moduleNameError(key) ?? (key !== name && nameInUse(key) ? `The name ${key} is already used` : null) : null
  const submit = (): void => {
    if (!key || problem) { setError(problem ?? 'Enter the Object name'); return }
    const e = saveSfcAs(name, key, area)
    if (e) { setError(e); return }
    onClose()
    onSaved(key)
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Save As" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Object name:<input aria-label="Object name" autoFocus maxLength={16} value={objectName}
        onChange={e => { setObjectName(e.target.value); setError('') }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} /></label>
      <label>Save in:<select aria-label="Save in area" value={area} onChange={e => setArea(e.target.value)}>
        {areas.map(a => <option key={a}>{a}</option>)}</select></label>
      {(error || problem) && <p role="alert" className="lib-dlg-error">{error || problem}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** Assign To Node: the controllers of the Physical Network. */
export function Dv09AssignDialog({ name, onClose, onMessage }: { name: string; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const controllers = useStore(s => s.hardware.controllers)
  const lifecycle = useStore(s => s.sfcLifecycle[name])
  const nodes = Object.values(controllers).filter(c => c.commissioned)
  const [node, setNode] = useState(lifecycle?.draft.controllerTag || nodes[0]?.tag || '')
  const [error, setError] = useState('')
  const submit = (): void => {
    if (!lifecycle) return
    if (!useStore.getState().configureSfcController(name, node, lifecycle.draft)) { setError('The SFC could not be assigned (see the Event Journal)'); return }
    onMessage(`${name} assigned to ${node}`)
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Assign To Node" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Node:<select aria-label="Node" value={node} onChange={e => setNode(e.target.value)}>
        {nodes.map(c => <option key={c.tag}>{c.tag}</option>)}</select></label>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={!node} onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** Download > Control Module. */
export function Dv09SfcDownloadDialog({ name, onClose, onMessage }: { name: string; onClose: () => void; onMessage: (m: string) => void }): JSX.Element {
  const lifecycle = useStore(s => s.sfcLifecycle[name])
  const [error, setError] = useState('')
  const controller = lifecycle?.saved?.controllerTag || lifecycle?.draft.controllerTag
  const submit = (): void => {
    const e = downloadSfc(name)
    if (e) { setError(e); return }
    onMessage(`${name} downloaded to ${controller}`)
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Download ${name}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Download control module {name} to {controller || '(no node assigned)'}?</p>
      <p>The controller's copy of the SFC is replaced and starts executing from its first step.</p>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>Download</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

export function Dv09MessageDialog({ title, lines, onClose }: { title: string; lines: string[]; onClose: () => void }): JSX.Element {
  return <SimulatorDialog className="module-download-dialog dvd" label={title} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel" role="status">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button></div>
  </SimulatorDialog>
}

/** Rename... of a step. */
export function Dv09RenameDialog({ title, value, onClose, onOk }: { title: string; value: string; onClose: () => void; onOk: (next: string) => string | null }): JSX.Element {
  const [text, setText] = useState(value)
  const [error, setError] = useState('')
  const submit = (): void => { const e = onOk(text.trim()); if (e) setError(e); else onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label={title} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>New name:<input aria-label="New name" autoFocus value={text} onChange={e => { setText(e.target.value); setError('') }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} /></label>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

/** Parameter Properties (slide 7-21): name, type Named Set, Named set (Browse...), Named state. */
export function Dv09ParamDialog({ name, configuration, parameter, defaultName, onClose }: {
  name: string; configuration: SfcConfiguration; parameter?: string; defaultName: string; onClose: () => void
}): JSX.Element {
  const sets = useStore(s => s.namedSets.configured)
  const existing = parameter ? configuration.parameters?.[parameter] : undefined
  const [paramName, setParamName] = useState(parameter ?? '')
  const [type, setType] = useState<'Named Set' | 'Boolean'>(existing?.type === 'BOOLEAN' ? 'Boolean' : 'Named Set')
  const [setName, setSetName] = useState(existing?.type === 'NAMED_SET' ? existing.namedSet : '')
  const [state, setState] = useState(() => {
    if (existing?.type !== 'NAMED_SET') return ''
    return sets[existing.namedSet]?.entries.find(e => e.value === existing.value)?.name ?? ''
  })
  const [bool, setBool] = useState(existing?.type === 'BOOLEAN' ? existing.value : false)
  const [browse, setBrowse] = useState(false)
  const [error, setError] = useState('')
  const definition = Object.hasOwn(sets, setName) ? sets[setName] : undefined
  const submit = (): void => {
    const key = paramName.trim().toUpperCase()
    if (!key) { setError('Enter the Parameter name'); return }
    let binding: SfcParameter
    if (type === 'Boolean') binding = { type: 'BOOLEAN', value: bool }
    else {
      if (!definition) { setError(setName.trim() ? `Named set ${setName} does not exist (names are case sensitive)` : 'Enter or Browse for the Named set'); return }
      const entry = definition.entries.find(e => e.name === state)
      if (!entry) { setError('Select the Named state'); return }
      binding = { type: 'NAMED_SET', namedSet: definition.name, value: entry.value }
    }
    if (!parameter && Object.hasOwn(configuration.parameters ?? {}, key)) { setError(`Parameter ${key} already exists`); return }
    if (!useStore.getState().configureSfcParameter(name, key, binding, configuration)) { setError('The parameter was not applied (see the Event Journal)'); return }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${parameter ?? defaultName} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Parameter name:<input aria-label="Parameter name" autoFocus disabled={!!parameter} value={paramName}
        onChange={e => { setParamName(e.target.value); setError('') }} /></label>
      <label>Parameter type:<select aria-label="Parameter type" value={type} onChange={e => setType(e.target.value === 'Boolean' ? 'Boolean' : 'Named Set')}>
        <option>Named Set</option><option>Boolean</option></select></label>
      <label>Parameter category:<select aria-label="Parameter category" defaultValue=""><option value="" /></select></label>
      <fieldset className="dvd-panel"><legend>Properties</legend>
        {type === 'Named Set' ? <>
          <div className="dvd-inline">
            <label>Named set:<input aria-label="Named set" value={setName} onChange={e => { setSetName(e.target.value); setState(''); setError('') }} /></label>
            <button className="tbtn sm" onClick={() => setBrowse(true)}>Browse...</button>
          </div>
          <label>Named state:<select aria-label="Named state" value={state} onChange={e => setState(e.target.value)}>
            <option value="" />{definition?.entries.map(e => <option key={e.value}>{e.name}</option>)}</select></label>
        </> : <label>Default value:<select aria-label="Boolean default" value={bool ? '1' : '0'} onChange={e => setBool(e.target.value === '1')}>
          <option value="0">FALSE</option><option value="1">TRUE</option></select></label>}
      </fieldset>
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    {browse && <SimulatorDialog className="module-download-dialog dvd" label="Select Named Set" onClose={() => setBrowse(false)}>
      <div className="lib-dlg-fields dvd-panel">
        {Object.keys(sets).length === 0 && <p>No named sets are configured.</p>}
        {Object.keys(sets).map(n => <button key={n} className="ctx-item" data-named-set={n}
          onClick={() => { setSetName(n); setState(''); setBrowse(false) }}>{n}</button>)}
      </div>
    </SimulatorDialog>}
  </SimulatorDialog>
}

/** The Expression Assistant launches the Browser: module / block / parameter paths and the local parameters of the SFC. */
export function Dv09ExpressionBrowser({ sfcName, modules, localParameters, onInsert, onClose }: {
  sfcName: string; modules: Record<string, AnyModule>; localParameters: Record<string, SfcParameter>
  onInsert: (text: string, append?: boolean) => void; onClose: () => void
}): JSX.Element {
  const tags = Object.keys(modules).sort()
  const [tag, setTag] = useState(tags[0] ?? '')
  const [pick, setPick] = useState('')
  const module = modules[tag]
  const paths = module ? sfcModulePaths(module) : []
  const submit = (): void => {
    if (!pick) return
    recordBrowse(sfcName, pick)
    onInsert(pick.startsWith("'") ? pick : `'${pick}'`, true)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Browser" onClose={onClose}>
    <div className="dvd-split">
      <div className="dvd-panel" aria-label="Modules">
        <b>Modules</b>
        {tags.map(t => <button key={t} className={'ctx-item' + (t === tag ? ' on' : '')} data-browser-module={t} aria-pressed={t === tag}
          onClick={() => { setTag(t); setPick('') }}>{t}</button>)}
        {Object.keys(localParameters).length > 0 && <>
          <b>This module</b>
          {Object.keys(localParameters).map(p => <button key={p} className={'ctx-item' + (pick === `'${p}.CV'` ? ' on' : '')} data-browser-local={p}
            onClick={() => { setTag(''); setPick(`'${p}.CV'`) }}>{p}</button>)}
        </>}
      </div>
      <div className="dvd-panel" aria-label="Parameters">
        <b>{tag ? `//${tag}` : 'Local parameters'}</b>
        {paths.map(p => <button key={p.path} className={'ctx-item' + (pick === `//${tag}/${p.path}` ? ' on' : '')} data-browser-path={`//${tag}/${p.path}`}
          title={p.note} onClick={() => setPick(`//${tag}/${p.path}`)}>{p.path} <span className="exp-hint">{p.note}</span></button>)}
        {tag && !paths.length && <p>No parameters of this module can be used in an SFC expression.</p>}
        {pick && <p>Selected: <code>{pick}</code></p>}
      </div>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={!pick} onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

