import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { useLibrary } from '../engine/libraryStore'
import { sfcEditorDefinition, sfcDraftDirty, sfcNeedsDownload } from '../engine/sfcLifecycle'
import { assignmentExpression } from '../engine/sfcExpressions'
import type { SfcStep } from '../engine/sfc'
import { deleteStepHealing } from '../engine/sfcGraph'
import {
  checkSfc, dv09ExpressionText, goEdit, goOnline, isUntitled, paletteStep, paletteTermination, paletteTransition, saveStudioSfc
} from '../engine/dv09Sfc'
import { SfcChart } from './SfcDisplay'
import { SfcPropertiesDialog, type SfcPropertiesTarget } from '../components/SfcPropertiesDialog'
import { SfcModuleProperties } from '../components/SfcLifecycleControls'
import {
  Dv09AssignDialog, Dv09MessageDialog, Dv09ParamDialog, Dv09RenameDialog, Dv09SaveAsDialog, Dv09SfcDownloadDialog, Dv09StudioNewDialog
} from '../components/Dv09SfcUi'
import { ModuleIcon } from '../components/EngineeringIcons'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { SfcBlockAlarmControls } from '../components/SfcBlockAlarmControls'
import { PaneResizer, usePersistentSize } from '../components/PaneResizer'
import { Btn, Group, Stack } from './ControlStudioDisplay'

// Course DV-09 chapter 7: Control Studio for a control module SFC (SFC-T101). File > New with the Algorithm type Sequential Function Chart,
// the All SFC Items palette (Step, Transition, Termination), the Action window (right-click > Add...), Action and Transition Properties,
// the Parameter window (right-click > Add...), Properties, Assign To Node, Save, Download and View > Check (pp 7-12 .. 7-24).

const DND_ITEM = 'application/x-dv09-sfc-item'
const PALETTE: { id: 'step' | 'transition' | 'termination' | 'inputParameter' | 'readParameter' | 'writeParameter'; label: string; note: string; enabled: boolean }[] = [
  { id: 'inputParameter', label: 'Input Parameter', note: 'Not modeled; module parameters are added in the Parameter window', enabled: false },
  { id: 'readParameter', label: 'Internal Read Parameter', note: 'Not modeled', enabled: false },
  { id: 'writeParameter', label: 'Internal Write Parameter', note: 'Not modeled', enabled: false },
  { id: 'step', label: 'Step', note: 'Adds a step after the selected step', enabled: true },
  { id: 'transition', label: 'Transition', note: 'Adds a divergent path (a new transition and step) after the selected step', enabled: true },
  { id: 'termination', label: 'Termination', note: 'Ends the sequence after the selected step', enabled: true }
]
const TABS = ['File', 'Home', 'Diagram', 'View', 'Settings']

type Dialog = null | 'new' | 'saveAs' | 'props' | 'assign' | 'download' | 'param' | 'alarm'
interface Menu { x: number; y: number; kind: 'step' | 'transition' | 'action' | 'actionBlank' | 'param' | 'paramBlank'; index?: number; param?: string; alternate?: number }

export function Dv09SfcStudio({ name }: { name: string }): JSX.Element {
  const runtime = useStore(s => s.sfcs[name])
  const lifecycle = useStore(s => s.sfcLifecycle[name])
  const modules = useStore(s => s.modules)
  const sets = useStore(s => s.namedSets.configured)
  const controller = useLibrary(s => s.assignments[name])
  useStore(s => s.rev)
  const [tab, setTab] = useState('Home')
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedAction, setSelectedAction] = useState<number | null>(null)
  const [selectedParam, setSelectedParam] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [properties, setProperties] = useState<SfcPropertiesTarget | null>(null)
  const [rename, setRename] = useState<{ kind: 'step' | 'action'; index: number } | null>(null)
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null)
  const [paramEdit, setParamEdit] = useState<string | null | undefined>(undefined)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [message, setMessage] = useState('')
  const [dropping, setDropping] = useState(false)
  const [panes, setPanes] = useState({ hierarchy: true, parameter: true, action: true, palette: true })
  const [actionHeight, setActionHeight] = usePersistentSize('dv09sfc.actionHeight', 150)
  const sfc = runtime ? sfcEditorDefinition(runtime, lifecycle) : undefined
  const online = !!lifecycle?.online
  const editable = !!lifecycle && !online && (runtime?.status === 'READY' || runtime?.status === 'COMPLETE')
  const draftSteps = sfc?.steps ?? []
  const step = selected !== null ? draftSteps[selected] : undefined

  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('.ctx-menu')) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => { if (selected !== null && selected >= draftSteps.length) setSelected(null) }, [selected, draftSteps.length])

  const status = useMemo(() => {
    if (!lifecycle) return ''
    if (online) return `ON-LINE · ${runtime?.status ?? ''}`
    return `EDIT · ${sfcDraftDirty(lifecycle) ? 'unsaved changes' : sfcNeedsDownload(lifecycle) ? 'Download required' : lifecycle.deployed ? 'Downloaded' : 'Not downloaded'}`
  }, [lifecycle, online, runtime?.status])

  if (!runtime || !sfc) return <div className="display studio"><div className="exp-empty">{name} was not found.</div></div>
  if (!lifecycle) {
    return <div className="display studio"><div className="exp-empty">{name} is not a control module SFC created in Control Studio.{' '}
      <button className="tbtn" onClick={() => useStore.getState().enableSfcLifecycle(name)}>Use Save/Download</button></div></div>
  }

  const update = (steps: SfcStep[]): void => useStore.getState().setSfcSteps(name, steps)
  const unavailableOnline = online ? 'Go to Edit before changing the SFC' : undefined
  const save = (): void => {
    if (isUntitled(name)) { setDialog('saveAs'); return }
    const e = saveStudioSfc(name)
    setMessage(e ?? `${name} saved`)
  }
  const doCheck = (): void => { const result = checkSfc(name); setCheck(result); setMessage(result.ok ? 'Check: no errors' : `Check: ${result.text}`) }
  const palette = (id: string): void => {
    if (!editable) { setMessage(unavailableOnline ?? 'Go to Edit before changing the SFC'); return }
    const result = id === 'step' ? paletteStep(draftSteps, selected) : id === 'transition' ? paletteTransition(draftSteps, selected) :
      id === 'termination' ? paletteTermination(draftSteps, selected) : { error: 'This palette item is not modeled' }
    if ('error' in result) { setMessage(result.error); return }
    update(result.steps)
    setSelected(result.selected)
    setMessage('')
  }
  const textOf = (index: number): string => {
    const action = step?.actions[index]
    return action ? dv09ExpressionText(assignmentExpression(action, modules[action.tag]), modules, sets) : ''
  }
  const deleteStep = (index: number): void => {
    const target = draftSteps[index]
    if (!target) return
    const result = deleteStepHealing(draftSteps, target.id)
    if ('error' in result) { setMessage(result.error); return }
    update(result.steps)
    setSelected(null)
  }
  const deleteAction = (index: number): void => {
    if (!step) return
    if (!useStore.getState().applySfcStepProperties(name, step, { actions: step.actions.filter((_, i) => i !== index) })) setMessage('The action was not deleted (see the Event Journal)')
    setSelectedAction(null)
  }
  const parameters = online ? runtime.parameters : lifecycle.draft.parameters
  const parameterRows = Object.entries(parameters ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const defaultText = (parameter: NonNullable<typeof parameters>[string]): string =>
    parameter.type === 'BOOLEAN' ? (parameter.value ? 'TRUE' : 'FALSE') : sets[parameter.namedSet]?.entries.find(e => e.value === parameter.value)?.name ?? String(parameter.value)
  const ctx = (event: ReactMouseEvent, next: Omit<Menu, 'x' | 'y'>): void => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 190), ...next })
  }
  const item = (label: string, onClick?: () => void, disabled?: boolean): JSX.Element =>
    <button role="menuitem" className="ctx-item" disabled={disabled || (!onClick)} onClick={() => { setMenu(null); onClick?.() }}>{label}</button>
  const needEdit = (fn: () => void): (() => void) => () => { if (!editable) setMessage(unavailableOnline ?? 'Go to Edit before changing the SFC'); else fn() }

  return (
    <div className="display studio dv09-sfc-studio" data-dv09-sfc-studio={name}>
      <div className="ribbon">
        <div className="studio-caption"><ModuleIcon kind="control" size={16} /><span>[{sfc.area}/{name}] — Control Studio</span>
          <span className="studio-caption-status">{status}</span></div>
        <div className="ribbon-tabs">
          <div className="rb-quick" role="toolbar" aria-label="Quick access">
            <Btn glyph="save" label="Save" size="tiny" onClick={save} unavailable={unavailableOnline} />
          </div>
          {TABS.map(t => <button key={t} type="button" className={'ribbon-tab' + (t === 'File' ? ' file' : t === tab ? ' active' : '')}
            aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        <div className="ribbon-body rb-body">
          {tab === 'File' && <>
            <Group label="Create"><Btn glyph="new" label="New..." onClick={() => setDialog('new')} /></Group>
            <Group label="Save"><Btn glyph="save" label="Save" onClick={save} unavailable={unavailableOnline} /></Group>
            <Group label="Module"><Btn glyph="download" label="Download" onClick={() => setDialog('download')} unavailable={unavailableOnline} /></Group>
          </>}
          {tab === 'Home' && <>
            <Group label="Module">
              <Btn glyph="download" label="Download" onClick={() => setDialog('download')} unavailable={unavailableOnline} />
              <Btn glyph="assign" label="Assign To Node" onClick={() => setDialog('assign')} unavailable={unavailableOnline} />
            </Group>
            <Group label="Insert">
              <Btn glyph="alarm" label="Alarm" onClick={needEdit(() => setDialog('alarm'))} unavailable={unavailableOnline} />
              <Btn glyph="moduleParameter" label="Module Parameter" onClick={needEdit(() => setParamEdit(null))} unavailable={unavailableOnline} />
            </Group>
            <Group label="Algorithm">
              <Stack>
                <Btn glyph="editObject" label="Edit Object" size="small" unavailable="Select a step or transition and use its pop-up menu" />
                <Btn glyph="drillDown" label="Drill Down" size="small" unavailable="Not modeled" />
                <Btn glyph="backOut" label="Back Out" size="small" unavailable="Not modeled" />
              </Stack>
            </Group>
            <Group label="Diagram Mode">
              <Btn glyph="onlineDebug" label="On-Line" active={online} onClick={() => { const e = goOnline(name); setMessage(e ?? ''); setSelected(null) }} />
              <Stack>
                <Btn glyph="onlineDebug" label="Debug" size="small" unavailable="Debug mode is not modeled; On-Line shows the active step" />
                <Btn glyph="edit" label="Edit" size="small" active={!online} onClick={() => { goEdit(name); setMessage('') }} />
              </Stack>
            </Group>
          </>}
          {tab === 'Diagram' && <Group label="Diagram"><span className="exp-hint">Use the All SFC Items palette to add steps, transitions and terminations.</span></Group>}
          {tab === 'View' && <>
            <Group label="SFC">
              <Stack>
                <Btn glyph="functionBlock" label="Show as FBD" size="small" unavailable="An SFC has no function block diagram" />
                <Btn glyph="logic" label="Show as SFC" size="small" active />
                <Btn glyph="properties" label="Check" size="small" onClick={doCheck} />
              </Stack>
            </Group>
            <Group label="Windows">
              <div className="dv09-sfc-windows">
                {([['hierarchy', 'Hierarchy View'], ['parameter', 'Parameter View'], ['action', 'Action View'], ['palette', 'Palette View']] as const).map(([key, label]) =>
                  <label key={key}><input type="checkbox" checked={panes[key]} onChange={e => setPanes(p => ({ ...p, [key]: e.target.checked }))} />{label}</label>)}
              </div>
            </Group>
          </>}
          {tab === 'Settings' && <Group label="Edit">
            <Btn glyph="properties" label="Properties" onClick={() => setDialog('props')} unavailable={unavailableOnline} />
            <Stack>
              <Btn glyph="edit" label="Rename" size="small" onClick={needEdit(() => selected !== null && setRename({ kind: 'step', index: selected }))} unavailable={selected === null ? 'Select a step' : unavailableOnline} />
              <Btn glyph="cut" label="Delete" size="small" onClick={needEdit(() => selected !== null && deleteStep(selected))} unavailable={selected === null ? 'Select a step' : unavailableOnline} />
            </Stack>
          </Group>}
        </div>
      </div>
      <div className="studio-main">
        {(panes.hierarchy || panes.parameter) && <div className="studio-pane dv09-sfc-left">
          {panes.hierarchy && <div className="studio-tree dv09-sfc-hier" aria-label="Hierarchy View">
            <div className="studio-tree-root" role="button" tabIndex={0} onClick={() => setSelected(null)}><ModuleIcon kind="control" /> {name}</div>
            {draftSteps.map((s, i) => <button key={s.id} type="button" className={'studio-tree-node' + (selected === i ? ' active' : '')} data-hier-step={s.name}
              onClick={() => setSelected(i)}>{s.name}</button>)}
            <div className="studio-pane-label">Hierarchy View</div>
          </div>}
          {panes.parameter && <div className="dv09-sfc-params" aria-label="Parameter View"
            onContextMenu={e => ctx(e, { kind: 'paramBlank' })}>
            <div className="dv09-filterbar"><span>Filtered by:</span></div>
            <div className="dvd-tabs"><button className="on">Alphabetic</button><button disabled>Categorized</button></div>
            <table className="studio-param-table" aria-label={`${name} parameters`}>
              <thead><tr><th>Parameter</th><th>{online ? 'Value' : 'Default'}</th><th>Linked</th></tr></thead>
              <tbody>{parameterRows.map(([parameter, binding]) => <tr key={parameter} data-param={parameter} className={selectedParam === parameter ? 'sel' : ''}
                onClick={() => setSelectedParam(parameter)} onContextMenu={e => { setSelectedParam(parameter); ctx(e, { kind: 'param', param: parameter }) }}>
                <td>{parameter}</td><td>{defaultText(binding)}</td><td /></tr>)}
              </tbody>
            </table>
            <div className="studio-pane-label">Parameter View</div>
          </div>}
        </div>}
        <div className="studio-center">
          <div className={'studio-page dv09-sfc-diagram' + (dropping ? ' over' : '')} role="document" aria-label={`${name} diagram`} data-sfc-diagram
            onDragOver={e => { if (editable && e.dataTransfer.types.includes(DND_ITEM)) { e.preventDefault(); setDropping(true) } }}
            onDragLeave={() => setDropping(false)}
            onDrop={e => { const id = e.dataTransfer.getData(DND_ITEM); setDropping(false); if (id) { e.preventDefault(); palette(id) } }}>
            {draftSteps.length === 0 ? <div className="dv09-diagram-empty" data-diagram-empty>
              Diagram View — drag Step from the All SFC Items palette here (or double-click it)</div> :
              <SfcChart sfc={sfc} selected={selected} endTransition onSelect={i => { setSelected(i); setSelectedAction(null) }}
                onContext={(target, x, y) => {
                  const index = draftSteps.findIndex(s => s.id === target.step.id)
                  setSelected(index)
                  setMenu({ x: Math.min(x, window.innerWidth - 210), y: Math.min(y, window.innerHeight - 190), kind: target.kind === 'transition' ? 'transition' : 'step', index,
                    alternate: target.kind === 'transition' ? target.alternate : undefined })
                }}
                onProperties={target => { if (target.kind === 'transition') { if (editable) setProperties(target) } }} />}
          </div>
          {panes.action && <>
            <PaneResizer axis="y" sign={-1} value={actionHeight} min={80} max={400} onChange={setActionHeight} label="Resize Action View" />
            <div className="studio-bottom dv09-sfc-actions" style={{ height: actionHeight }} aria-label="Action View"
              onContextMenu={e => ctx(e, { kind: 'actionBlank' })}>
              <table className="studio-param-table" aria-label={`${name} actions`}>
                <thead><tr><th>Alarm</th><th>Action</th><th>Text</th><th>Description</th><th>Qualifier</th></tr></thead>
                <tbody>{(step?.actions ?? []).map((action, i) => <tr key={i} data-action-row={i} className={selectedAction === i ? 'sel' : ''}
                  onClick={() => setSelectedAction(i)} onDoubleClick={() => editable && step && setProperties({ kind: 'action', step, index: i })}
                  onContextMenu={e => { setSelectedAction(i); ctx(e, { kind: 'action', index: i }) }}>
                  <td /><td>{action.name || `A${i + 1}`}</td><td>{textOf(i)}</td><td>{action.description ?? ''}</td><td>{action.qualifier ?? 'N'}</td></tr>)}
                  {!step && <tr><td colSpan={5} className="exp-hint">Select a step to see its actions.</td></tr>}
                </tbody>
              </table>
              <div className="studio-pane-label">Action View{step ? ` — ${step.name}` : ''}</div>
            </div>
          </>}
        </div>
        {panes.palette && <div className="studio-pane studio-palette dv09-sfc-palette" style={{ width: 170, minWidth: 170, flex: '0 0 170px' }}>
          <div className="studio-palette-body">
            <div className="studio-pal-group">
              <div className="studio-pal-head">All SFC Items</div>
              {PALETTE.map(p => <div key={p.id} className="studio-pal-item" data-palette={p.label} aria-disabled={!p.enabled} title={p.note}
                draggable={p.enabled && editable}
                onDragStart={e => { if (p.enabled) { e.dataTransfer.setData(DND_ITEM, p.id); e.dataTransfer.setData('text/plain', p.label); e.dataTransfer.effectAllowed = 'copy' } }}
                onDoubleClick={() => p.enabled && palette(p.id)}>
                <span className={'dv09-sfc-glyph ' + p.id} aria-hidden /><span>{p.label}</span></div>)}
            </div>
          </div>
          <div className="studio-pane-label">Palette · All SFC Items</div>
        </div>}
      </div>
      <div className="studio-statusbar">
        <span>Assigned to: {lifecycle.draft.controllerTag || controller || '<unassigned>'}</span>
        {message && <span role="status" className="dv09-studio-message">{message}</span>}
      </div>

      {menu && <div className="ctx-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
        {(menu.kind === 'action' || menu.kind === 'actionBlank' || menu.kind === 'step') && <>
          {item('Add...', needEdit(() => step ? setProperties({ kind: 'action', step, index: null }) : setMessage('Select a step first')), !step)}
          {item('Properties...', menu.kind === 'action' && menu.index !== undefined && step ? needEdit(() => setProperties({ kind: 'action', step, index: menu.index as number })) : undefined)}
          {item('Rename...', menu.kind === 'action' && menu.index !== undefined ? needEdit(() => setRename({ kind: 'action', index: menu.index as number })) :
            menu.kind === 'step' && menu.index !== undefined ? needEdit(() => setRename({ kind: 'step', index: menu.index as number })) : undefined)}
          {item('Delete', menu.kind === 'action' && menu.index !== undefined ? needEdit(() => deleteAction(menu.index as number)) :
            menu.kind === 'step' && menu.index !== undefined ? needEdit(() => deleteStep(menu.index as number)) : undefined)}
        </>}
        {menu.kind === 'transition' && <>
          {item('Properties...', needEdit(() => step && setProperties({ kind: 'transition', step, ...(menu.alternate !== undefined ? { alternate: menu.alternate } : {}) })))}
          {item('Rename...')}
          {item('Delete')}
        </>}
        {(menu.kind === 'param' || menu.kind === 'paramBlank') && <>
          {item('Add...', needEdit(() => setParamEdit(null)))}
          {item('Properties...', menu.param ? () => setParamEdit(menu.param as string) : undefined)}
          {item('Rename...')}
          {item('Delete')}
          {item('Show Parameter...')}
          {item('Hide Parameter...')}
          {item('Add History Recorder...')}
          {item('Assign Alarm')}
          {item('Filter Parameter List...')}
        </>}
      </div>}

      {dialog === 'new' && <Dv09StudioNewDialog onClose={() => setDialog(null)} />}
      {dialog === 'saveAs' && <Dv09SaveAsDialog name={name} onClose={() => setDialog(null)}
        onSaved={saved => { setMessage(`${saved} saved`); useUi.getState().openStudio(saved) }} />}
      {dialog === 'props' && lifecycle && <SfcModuleProperties configuration={lifecycle.draft} onClose={() => setDialog(null)} />}
      {dialog === 'assign' && <Dv09AssignDialog name={name} onClose={() => setDialog(null)} onMessage={setMessage} />}
      {dialog === 'download' && <Dv09SfcDownloadDialog name={name} onClose={() => setDialog(null)} onMessage={m => { setMessage(m); setSelected(null) }} />}
      {dialog === 'alarm' && <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="SFC Alarms" onClose={() => setDialog(null)}>
        <SfcBlockAlarmControls name={name} />
        <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setDialog(null)}>Close</button></div>
      </SimulatorDialog>}
      {paramEdit !== undefined && <Dv09ParamDialog name={name} configuration={lifecycle.draft} parameter={paramEdit ?? undefined}
        defaultName={`PARAM${Object.keys(lifecycle.draft.parameters ?? {}).length + 1}`} onClose={() => setParamEdit(undefined)} />}
      {properties && <SfcPropertiesDialog name={name} target={properties} onClose={() => setProperties(null)} />}
      {rename && <Dv09RenameDialog title="Rename" value={rename.kind === 'step' ? draftSteps[rename.index]?.name ?? '' : step?.actions[rename.index]?.name ?? `A${rename.index + 1}`}
        onClose={() => setRename(null)} onOk={next => {
          if (!next) return 'Enter a name'
          const target = rename.kind === 'step' ? draftSteps[rename.index] : step
          if (!target) return 'Nothing to rename'
          const patch = rename.kind === 'step' ? { name: next } : { actions: target.actions.map((a, i) => i === rename.index ? { ...a, name: next } : a) }
          return useStore.getState().applySfcStepProperties(name, target, patch) ? null : 'The name was not applied (see the Event Journal)'
        }} />}
      {check && <Dv09MessageDialog title="Check" lines={[check.ok ? `${check.text}.` : `Check failed: ${check.text}`]} onClose={() => setCheck(null)} />}
    </div>
  )
}

