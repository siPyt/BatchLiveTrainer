import { useState } from 'react'
import { useUi } from '../ui/uiStore'
import { useStore } from '../engine/store'
import type { AnyModule } from '../engine/types'
import { useLibrary } from '../engine/libraryStore'
import { insertSequence, deleteStep, QUALIFIER_LABEL, type PhaseSfc } from '../engine/batchConfig'
import {
  DEVICE_PARAMS, EM_PARAMS, IDLE, emCheckEnv, emDisplay, emDownloadState, itemChoices, itemError, namedSetOf, stateName, useEm,
  type EmClass, type EmItem
} from '../engine/emStore'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { ContextMenu } from '../components/LibraryExplorer'
import { BatchIcon } from '../components/BatchExplorer'
import { ModuleIcon } from '../components/EngineeringIcons'
import { PaneResizer, usePersistentSize } from '../components/PaneResizer'
import { Btn, Group, Stack } from './ControlStudioDisplay'
import { ActionDialog, PaletteGlyph, SequenceDialog, SfcDiagram, StepDialog, TransitionDialog, type ExprCtx } from './PhaseStudio'
import { askConfirm } from '../components/AppNotices'

// Control Studio on an Equipment Module Class (course 7016 pp 5-14..5-24) and on-line on an
// equipment module instance (pp 5-40..5-50): command-driven COMMAND_0000n sequences or the
// state-driven Items / States table, the A_COMMAND / A_PV parameters and the module blocks.

type Menu = { x: number; y: number; label: string; items: { label: string; onClick?: () => void; danger?: boolean; disabled?: string; separator?: boolean }[] }
type Sel = { k: 'step' | 'transition'; i: number } | null
const DRAG_SFC = 'application/x-bl-em-sfc'

/** Status bar word for a module block's instance: two stage valves report CLOSED / DRIBBLE / BULK. */
function childState(m: AnyModule | undefined, className: string): string {
  if (m?.type === 'VALVE') return m.dcState.startsWith('GOING') ? 'TRAVEL' : !m.open ? 'CLOSED' : m.twoStage ? (m.bulk ? 'BULK' : 'DRIBBLE') : 'OPEN'
  if (m?.type === 'MOTOR') return m.running ? 'RUNNING' : 'STOPPED'
  return className
}

export function emExprCtx(cls: EmClass): ExprCtx {
  return {
    check: emCheckEnv(cls),
    internal: [
      ...Object.values(cls.children).flatMap(ch => DEVICE_PARAMS.slice(0, 6).map(p => ({ key: `${ch.name}/${p}`, text: `${ch.name}/${p}`, note: `Module block (${ch.className})`, insert: `'^/${ch.name}/${p}'` }))),
      ...EM_PARAMS.map(([n]) => ({ key: n, text: n, note: 'Equipment module parameter', insert: `'^/${n}.CV'` }))
    ],
    internalNote: `Module blocks and parameters of ${cls.name}. ^/ refers one level up, from the command block to the equipment module.`,
    aliases: null,
    aliasNote: 'Equipment module classes have no unit aliases; use Insert Internal Parameter for their module blocks'
  }
}

export function EmStudio(): JSX.Element {
  const target = useUi(s => s.studioEm)
  const className = target?.className ?? ''
  const instance = target?.instance ?? null
  const block = target?.block ?? null
  const saved = useEm(s => s.classes[className])
  const draft = useEm(s => s.drafts[className])
  const inst = useEm(s => (instance ? s.instances[instance] : undefined))
  const dep = useEm(s => (instance ? s.deployed[instance] : undefined))
  const rt = useEm(s => (instance ? s.runtime[instance] : undefined))
  const assigned = useLibrary(s => (instance ? s.assignments[instance] : undefined))
  const modules = useStore(s => s.modules)
  const [tab, setTab] = useState('Home')
  const [view, setView] = useState<'Items' | 'States'>('Items')
  const [sel, setSel] = useState<Sel>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [panes, setPanes] = useState({ hierarchy: true, palette: true, parameters: true })
  const [seqAfter, setSeqAfter] = useState<number | null>(null)
  const [stepDlg, setStepDlg] = useState<number | null>(null)
  const [trDlg, setTrDlg] = useState<number | null>(null)
  const [actionDlg, setActionDlg] = useState<{ step: number; index: number | null } | null>(null)
  const [itemDlg, setItemDlg] = useState<{ index: number | null } | null>(null)
  const [commandDlg, setCommandDlg] = useState(false)
  const [hierWidth, setHierWidth] = usePersistentSize('emStudio.hierWidth', 240)
  const [paletteWidth, setPaletteWidth] = usePersistentSize('emStudio.paletteWidth', 170)

  const online = !!instance
  // On-line shows the downloaded configuration; Edit shows the class (with unsaved changes).
  const cls: EmClass | undefined = online ? dep?.cls ?? saved : draft ?? saved
  if (!cls) return <div className="display studio class-studio"><div className="exp-empty">Equipment module class {className} does not exist.
    <button className="tbtn sm" onClick={() => { useUi.getState().closeEmStudio(); useUi.getState().navigate('explorer') }}>Close</button></div></div>

  const dirty = !online && !!draft
  const cmd = block ? cls.commands[Object.keys(cls.commands).find(k => cls.commands[k].block === block) ?? ''] : undefined
  const sfc: PhaseSfc | undefined = cmd?.sfc
  const ctx = emExprCtx(cls)
  const commandDriven = cls.algorithm === 'Command driven'
  const childTag = (b: string): string | undefined => (online ? (dep?.children ?? inst?.children)?.[b] : undefined)
  const edit = (fn: (d: EmClass) => string | null | void): boolean => {
    if (online) { window.alert('On-line view: open the class to change its configuration'); return false }
    const r = useEm.getState().editDraft(className, fn)
    if (!r.ok) window.alert(r.error)
    return r.ok
  }
  const editSfc = (fn: (s: PhaseSfc) => PhaseSfc | string): boolean => cmd ? edit(d => {
    const key = String(cmd.value)
    const r = fn(d.commands[key].sfc)
    if (typeof r === 'string') return r
    d.commands[key].sfc = r
  }) : false
  const save = (): void => { if (!useEm.getState().drafts[className]) return; const r = useEm.getState().saveClass(className); if (!r.ok) window.alert(r.error) }
  const close = (): void => {
    const leave = (): void => { useUi.getState().closeEmStudio(); useUi.getState().navigate('explorer') }
    if (online || !useEm.getState().drafts[className]) { leave(); return }
    void (async () => {
      if (await askConfirm(`Save changes to ${className}?`)) save()
      else if (await askConfirm(`Discard the unsaved changes to ${className}?`)) useEm.getState().discardDraft(className)
      else return
      leave()
    })()
  }
  const drill = (b: string | null): void => useUi.getState().openEmStudio(className, instance, b)
  const afterIndex = (): number => (sel ? sel.i : sfc ? sfc.steps.length - 1 : 0)
  const addPair = (after: number): void => { if (sfc && editSfc(s => insertSequence(s, after, 1))) setSel({ k: 'step', i: Math.min(after + 1, sfc.steps.length) }) }
  const paletteAction = (item: string, after: number): void => {
    if (item === 'Sequence') setSeqAfter(after)
    else if (item === 'Step' || item === 'Transition') addPair(after)
    else window.alert('Every command sequence terminates after its last transition; the termination is already drawn.')
  }
  const status = (b: string): string => rt?.blocks[b] ?? 'Idle'
  const liveStep = online && rt?.running && cmd && rt.running.value === cmd.value && rt.running.seq ? cmd.sfc.steps[rt.running.seq.step]?.name ?? null : null
  const title = online ? `${inst?.area ?? ''}/${inst?.unit ?? ''}/${instance}` : `Advanced Definitions/Equipment Module Classes/${cls.category}/${className}`
  const dl = online ? emDownloadState(instance!, assigned) : null
  const selStep = sel?.k === 'step' && sfc ? sfc.steps[sel.i] : undefined
  const set = namedSetOf(cls.namedSet)
  const stateCols = (set?.entries ?? []).filter(e => e.value !== IDLE)

  return <div className="display studio class-studio em-studio" data-em-studio={className} data-em-instance={instance ?? ''} data-command-block={block ?? ''}>
    <div className="ribbon">
      <div className="studio-caption"><ModuleIcon kind="equipment" size={16} />
        <span>[{title}{block ? `/${block}` : ''}] — Control Studio{online ? ' (On-Line)' : dirty ? ' *' : ''}</span>
        <span className="studio-caption-status">{online ? `${dl === 'current' ? 'Downloaded' : dl === 'pending' ? 'Download pending' : dl === 'not-downloaded' ? 'Not downloaded' : 'Not assigned'} · A_PV ${emDisplay(dep, rt, 'A_PV')}` :
          `${cls.algorithm} · named set ${cls.namedSet} · revision ${cls.revision}${dirty ? ' · unsaved changes' : ''}`}</span>
      </div>
      <div className="ribbon-tabs">
        <div className="rb-quick" role="toolbar" aria-label="Quick access">
          <Btn glyph="save" label="Save" size="tiny" onClick={dirty ? save : undefined} unavailable={dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="undo" label="Undo" size="tiny" unavailable="Undo is not implemented" />
          <Btn glyph="redo" label="Redo" size="tiny" unavailable="Redo is not implemented" />
        </div>
        {['File', 'Home', 'View'].map(t => <button key={t} type="button" className={'ribbon-tab' + (t === 'File' ? ' file' : t === tab ? ' active' : '')}
          aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="ribbon-body rb-body">
        {tab === 'File' && <Group label="File">
          <Btn glyph="save" label="Save" onClick={dirty ? save : undefined} unavailable={dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="reset" label="Discard Changes" onClick={dirty ? () => { void askConfirm('Discard unsaved changes?').then(ok => { if (ok) { useEm.getState().discardDraft(className) } })} : undefined} unavailable={dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="backOut" label="Close" onClick={close} />
        </Group>}
        {tab === 'Home' && <>
          <Group label="Insert">
            {commandDriven ? <>
              <Btn glyph="new" label="Sequence" onClick={sfc && !online ? () => setSeqAfter(afterIndex()) : undefined} unavailable={online ? 'On-line view' : sfc ? undefined : 'Drill down into a command block first'} />
              <Stack>
                <Btn glyph="stateItem" label="Step" size="small" onClick={sfc && !online ? () => addPair(afterIndex()) : undefined} unavailable={online ? 'On-line view' : sfc ? undefined : 'Drill down into a command block first'} />
                <Btn glyph="logic" label="Action" size="small" onClick={selStep && !online ? () => setActionDlg({ step: sel!.i, index: null }) : undefined} unavailable={selStep && !online ? undefined : 'Select a step first'} />
              </Stack>
            </> : <Btn glyph="new" label="Item" onClick={!online ? () => setItemDlg({ index: null }) : undefined} unavailable={online ? 'On-line view' : undefined} />}
          </Group>
          <Group label="Algorithm">
            <Btn glyph="drillDown" label="Drill Down" onClick={commandDriven && !block ? () => drill(Object.values(cls.commands)[0]?.block ?? null) : undefined} unavailable={commandDriven && !block ? undefined : 'Select a command block in the hierarchy'} />
            <Btn glyph="backOut" label="Back Out" onClick={block ? () => drill(null) : undefined} unavailable={block ? undefined : 'Already at the equipment module level'} />
          </Group>
          <Group label="Diagram Mode">
            <Btn glyph="onlineDebug" label="On-Line" active={online} unavailable={online ? undefined : 'Open an equipment module instance (Explorer ▸ unit module ▸ equipment module ▸ Open with Control Studio) to go on-line'} />
            <Btn glyph="edit" label="Edit" active={!online} onClick={online ? () => useUi.getState().openEmStudio(className, null, block) : undefined} />
          </Group>
          {online && <Group label="Equipment Module">
            <Btn glyph="configure" label="Set A_COMMAND" onClick={() => setCommandDlg(true)} unavailable={dep ? undefined : 'Download the equipment module first'} />
            <Btn glyph="properties" label={`A_ABT_ON_NEW_CMD ${rt?.abortOnNew ? 'True' : 'False'}`}
              onClick={dep ? () => { const r = useEm.getState().setAbortOnNew(instance!, !rt?.abortOnNew); if (!r.ok) window.alert(r.error) } : undefined} unavailable={dep ? undefined : 'Download the equipment module first'} />
          </Group>}
          <Group label="Class">
            <Btn glyph="namedSet" label="Named Set" unavailable={`Named set ${cls.namedSet}; change it in Explorer ▸ class ▸ Properties`} />
          </Group>
        </>}
        {tab === 'View' && <Group label="Windows">
          <Btn glyph="hierarchy" label="Hierarchy" active={panes.hierarchy} onClick={() => setPanes(p => ({ ...p, hierarchy: !p.hierarchy }))} />
          <Btn glyph="parameters" label="Parameters" active={panes.parameters} onClick={() => setPanes(p => ({ ...p, parameters: !p.parameters }))} />
          <Btn glyph="palette" label="Palette" active={panes.palette} onClick={() => setPanes(p => ({ ...p, palette: !p.palette }))} />
        </Group>}
      </div>
    </div>

    <div className="studio-main">
      {panes.hierarchy && <div className="studio-pane studio-hier ps-hier" style={{ width: hierWidth, minWidth: hierWidth, flex: `0 0 ${hierWidth}px` }}>
        <div className="studio-tree ps-tree" role="tree" aria-label="Equipment module hierarchy">
          <div className={'studio-tree-root' + (!block ? ' cs-sel' : '')} role="treeitem" onClick={() => drill(null)}><ModuleIcon kind="equipment" /> {instance ?? className}</div>
          {commandDriven && Object.values(cls.commands).map(c => <button key={c.block} type="button" role="treeitem" data-command-node={c.block}
            className={'studio-tree-node studio-block-select' + (c.block === block ? ' active' : '') + (online && status(c.block) === 'Running' ? ' ps-live' : '')}
            onClick={() => drill(c.block)}><BatchIcon kind="composite" />{c.block}</button>)}
          {commandDriven && <div className="studio-tree-node disabled" title="MONITOR is not executed by the simulator"><BatchIcon kind="composite" />MONITOR</div>}
          {Object.values(cls.children).map(ch => <div key={ch.name} className="studio-tree-node" data-module-block={ch.name}>
            <ModuleIcon kind="control" />{childTag(ch.name) ? `${childTag(ch.name)} (${ch.name})` : ch.name}<span className="ps-pick-note"> {ch.className}</span></div>)}
        </div>
        {panes.parameters && <div className="ps-params">
          <div className="cs-params-filter">Filtered by: <span className="ps-filter-boxes">☑☑☑ ☑☑☑☑☑</span></div>
          <div className="ps-param-scroll">
            <table className="studio-param-table" aria-label="Equipment module parameters">
              <thead><tr><th>Parameter</th><th>{online ? 'Value' : 'Default'}</th><th>Connection</th></tr></thead>
              <tbody>{EM_PARAMS.map(([n, d]) => <tr key={n} data-param={n} className={n === 'A_COMMAND' || n === 'A_PV' ? 'ps-user-param' : undefined}
                onDoubleClick={online && n === 'A_COMMAND' ? () => setCommandDlg(true) : online && n === 'A_ABT_ON_NEW_CMD' ? () => useEm.getState().setAbortOnNew(instance!, !rt?.abortOnNew) : undefined}>
                <td>{n}</td><td>{online ? emDisplay(dep, rt, n) : d}</td><td>Internal</td></tr>)}</tbody>
            </table>
          </div>
        </div>}
        <div className="studio-pane-label">Hierarchy View</div>
      </div>}
      {panes.hierarchy && <PaneResizer axis="x" sign={1} value={hierWidth} min={160} max={520} onChange={setHierWidth} label="Resize hierarchy panel" />}

      <div className="studio-center">
        <div className="studio-canvas cs-diagram-wrap ps-canvas" onMouseDown={() => setSel(null)}
          onDragOver={e => { if (sfc && !online && e.dataTransfer.types.includes(DRAG_SFC)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
          onDrop={e => { const item = e.dataTransfer.getData(DRAG_SFC); if (item && sfc) { e.preventDefault(); paletteAction(item, afterIndex()) } }}>
          {sfc ? <SfcDiagram sfc={sfc} zoom={1} sel={sel} liveStep={liveStep} onSelect={setSel} onStepOpen={i => setStepDlg(i)} onTrOpen={i => setTrDlg(i)}
            onStepMenu={(i, e) => { e.preventDefault(); setSel({ k: 'step', i }); if (!online) setMenu({ x: e.clientX, y: e.clientY, label: sfc.steps[i].name, items: [
              { label: 'Properties...', onClick: () => setStepDlg(i) }, { label: 'Add Action...', onClick: () => setActionDlg({ step: i, index: null }) },
              { label: 'Add Sequence After...', onClick: () => setSeqAfter(i) },
              { label: 'Delete', danger: true, onClick: () => editSfc(s => deleteStep(s, i)), disabled: sfc.steps.length <= 1 ? 'A sequence needs at least its initial step' : undefined }] }) }}
            onTrMenu={(i, e) => { e.preventDefault(); setSel({ k: 'transition', i }); if (!online) setMenu({ x: e.clientX, y: e.clientY, label: sfc.transitions[i].name, items: [{ label: 'Properties...', onClick: () => setTrDlg(i) }] }) }} /> :
            commandDriven ? <table className="studio-param-table em-cmd-table" aria-label="Command function blocks">
              <thead><tr><th>Command Function Block</th><th>State Name</th><th>Maximum Time</th><th>Enabled</th>{online && <th>Status</th>}</tr></thead>
              <tbody>{Object.values(cls.commands).map(c => <tr key={c.block} data-command={c.block} onDoubleClick={() => drill(c.block)}
                className={online && status(c.block) === 'Running' ? 'em-running' : undefined}>
                <td>{c.block}</td><td>{c.state}</td>
                <td>{online ? c.maxTime : <input aria-label={`${c.block} maximum time`} type="number" min={0} value={c.maxTime} className="em-cell-input"
                  onChange={e => edit(d => { d.commands[String(c.value)].maxTime = Math.max(0, Number(e.target.value) || 0) })} />}</td>
                <td>{online ? (c.enabled ? 'True' : 'False') : <select aria-label={`${c.block} enabled`} value={c.enabled ? 'True' : 'False'}
                  onChange={e => edit(d => { d.commands[String(c.value)].enabled = e.target.value === 'True' })}><option>True</option><option>False</option></select>}</td>
                {online && <td data-status={status(c.block)}>{status(c.block)}</td>}
              </tr>)}</tbody>
            </table> : <div className="em-state-driven">
              <div className="dvd-tabs" role="tablist">{(['Items', 'States'] as const).map(t => <button key={t} role="tab" aria-selected={t === view} className={t === view ? 'on' : ''} onClick={() => setView(t)}>{t}</button>)}</div>
              {view === 'Items' ? <table className="studio-param-table em-items" aria-label="Items"
                onContextMenu={e => { e.preventDefault(); if (!online) setMenu({ x: e.clientX, y: e.clientY, label: 'Items', items: [{ label: 'Add', onClick: () => setItemDlg({ index: null }) }] }) }}>
                <thead><tr><th>Item</th><th>Write parameter path</th><th>Readback parameter path</th>{stateCols.map(s => <th key={s.value}>{s.name} ({s.value})</th>)}</tr></thead>
                <tbody>{cls.items.map((it, i) => <tr key={it.name} data-item={it.name}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!online) setMenu({ x: e.clientX, y: e.clientY, label: it.name, items: [
                    { label: 'Add', onClick: () => setItemDlg({ index: null }) }, { label: 'Modify...', onClick: () => setItemDlg({ index: i }) },
                    { label: 'Delete', danger: true, onClick: () => edit(d => { d.items.splice(i, 1); for (const row of Object.values(d.states)) delete row[it.name] }) }] }) }}
                  onDoubleClick={() => !online && setItemDlg({ index: i })}>
                  <td>{it.name}</td><td>{it.write}</td><td>{it.readback}</td>
                  {stateCols.map(s => { const v = cls.states[String(s.value)]?.[it.name] ?? ''; return <td key={s.value}>{online ? (v ? `= ${v}/` : '') :
                    <select aria-label={`${it.name} ${s.name}`} value={v} onChange={e => edit(d => { d.states[String(s.value)] = { ...(d.states[String(s.value)] ?? {}), [it.name]: e.target.value } })}>
                      <option value="">(no change)</option>{itemChoices(cls, it).map(c => <option key={c} value={c}>= {c}</option>)}</select>}</td> })}
                </tr>)}
                {!cls.items.length && <tr><td colSpan={3 + stateCols.length}>Right-click in the Items area and select Add.</td></tr>}</tbody>
              </table> : <table className="studio-param-table" aria-label="States">
                <thead><tr><th>State</th><th>Value</th><th>User selectable</th>{online && <th>Status</th>}</tr></thead>
                <tbody>{(set?.entries ?? []).map(s => <tr key={s.value}><td>{s.name}</td><td>{s.value}</td><td>{s.userSelectable === false ? 'No' : 'Yes'}</td>
                  {online && <td>{rt?.pv === s.value ? 'Current (A_PV)' : rt?.running?.value === s.value ? 'Driving' : ''}</td>}</tr>)}</tbody>
              </table>}
            </div>}
        </div>
        {sfc && <div className="studio-bottom ps-bottom" style={{ height: 150, flex: '0 0 150px' }}>
          <div className="studio-pane ps-expr-pane">
            <table className="studio-param-table" aria-label="Actions">
              <thead><tr><th>Action</th><th>Text</th><th>Type</th><th>Qualifier</th></tr></thead>
              <tbody>{selStep ? selStep.actions.map((a, ai) => <tr key={a.name} onDoubleClick={() => !online && setActionDlg({ step: sel!.i, index: ai })}>
                <td>{a.name}</td><td className="ps-code">{a.expression}</td><td>{a.type}</td><td>{QUALIFIER_LABEL[a.qualifier]}</td></tr>) :
                <tr><td colSpan={4}>{sel?.k === 'transition' ? `Transition ${sfc.transitions[sel.i]?.name}: ${sfc.transitions[sel.i]?.condition}` : 'Select a step to see its actions.'}</td></tr>}</tbody>
            </table>
          </div>
        </div>}
      </div>

      {panes.palette && sfc && <PaneResizer axis="x" sign={-1} value={paletteWidth} min={140} max={320} onChange={setPaletteWidth} label="Resize palette panel" />}
      {panes.palette && sfc && <div className="studio-pane studio-palette ps-palette" aria-label="Palette" style={{ width: paletteWidth, minWidth: paletteWidth, flex: `0 0 ${paletteWidth}px` }}>
        <select className="ps-pal-filter" aria-label="Palette filter" value="All SFC Items" onChange={() => {}}><option>All SFC Items</option></select>
        <div className="ps-pal-grid">
          {(['Sequence', 'Step', 'Termination', 'Transition'] as const).map(x => <div key={x} className={'ps-pal-item' + (online ? ' disabled' : '')} draggable={!online} role="button" tabIndex={0}
            onDragStart={e => { e.dataTransfer.setData(DRAG_SFC, x) }} onClick={() => !online && paletteAction(x, afterIndex())}><PaletteGlyph item={x} /><span>{x}</span></div>)}
        </div>
        <div className="studio-pane-label">Palette</div>
      </div>}
    </div>

    <div className="studio-statusbar">
      <span>For Help, press F1</span>
      <span>{online ? `Assigned to: ${assigned ?? '<unassigned>'} · A_COMMAND ${emDisplay(dep, rt, 'A_COMMAND')} · A_TARGET ${emDisplay(dep, rt, 'A_TARGET')} · A_PV ${emDisplay(dep, rt, 'A_PV')}${rt?.error ? ` · ${rt.error}` : ''}` : 'Assigned to: <unassigned>'}</span>
      <span>{Object.values(cls.children).map(ch => `${ch.name}: ${childState(childTag(ch.name) ? modules[childTag(ch.name)!] : undefined, ch.className)}`).join(' · ')}</span>
    </div>

    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    {seqAfter !== null && sfc && <SequenceDialog itemCount={sfc.steps.length + sfc.transitions.length} onClose={() => setSeqAfter(null)}
      onOk={count => { if (editSfc(s => insertSequence(s, seqAfter, count))) setSeqAfter(null) }} />}
    {stepDlg !== null && sfc?.steps[stepDlg] && <StepDialog key={sfc.steps[stepDlg].id} sfc={sfc} index={stepDlg} composite={block!} ctx={ctx}
      onClose={() => setStepDlg(null)} onOk={next => { if (online || editSfc(s => ({ ...s, steps: s.steps.map((st, i) => (i === stepDlg ? next : st)) }))) setStepDlg(null) }} />}
    {trDlg !== null && sfc?.transitions[trDlg] && <TransitionDialog key={sfc.transitions[trDlg].id} sfc={sfc} index={trDlg} composite={block!} ctx={ctx}
      onClose={() => setTrDlg(null)} onOk={next => { if (online || editSfc(s => ({ ...s, transitions: s.transitions.map((t, i) => (i === trDlg ? next : t)) }))) setTrDlg(null) }} />}
    {actionDlg && sfc?.steps[actionDlg.step] && <ActionDialog step={sfc.steps[actionDlg.step].name} composite={block!} ctx={ctx}
      action={actionDlg.index === null ? null : sfc.steps[actionDlg.step].actions[actionDlg.index]} existing={sfc.steps[actionDlg.step].actions.map(a => a.name)}
      onClose={() => setActionDlg(null)} onOk={a => {
        const { step, index } = actionDlg
        if (editSfc(s => ({ ...s, steps: s.steps.map((st, i) => (i !== step ? st : { ...st, actions: index === null ? [...st.actions, a] : st.actions.map((x, j) => (j === index ? a : x)) })) }))) setActionDlg(null)
      }} />}
    {itemDlg && <ItemDialog cls={cls} index={itemDlg.index} onClose={() => setItemDlg(null)} onOk={item => {
      const i = itemDlg.index
      if (edit(d => {
        const others = d.items.filter((_, j) => j !== i)
        const err = itemError(d, item, others)
        if (err) return err
        if (i === null) d.items.push(item)
        else {
          const old = d.items[i].name
          d.items[i] = item
          if (old !== item.name) for (const row of Object.values(d.states)) { row[item.name] = row[old]; delete row[old] }
        }
      })) setItemDlg(null)
    }} />}
    {commandDlg && instance && dep && <CommandDialog tag={instance} namedSet={dep.cls.namedSet} current={rt?.command ?? IDLE} onClose={() => setCommandDlg(false)} />}
  </div>
}

function ItemDialog({ cls, index, onOk, onClose }: { cls: EmClass; index: number | null; onOk: (item: EmItem) => void; onClose: () => void }): JSX.Element {
  const cur = index === null ? undefined : cls.items[index]
  const [v, setV] = useState<EmItem>(cur ?? { name: '', write: '', readback: '' })
  const [error, setError] = useState<string | null>(null)
  const paths = Object.values(cls.children).flatMap(ch => DEVICE_PARAMS.slice(0, 6).map(p => `${ch.name}/${p}`))
  const submit = (): void => {
    const item = { name: v.name.trim().toUpperCase(), write: v.write.trim().toUpperCase(), readback: v.readback.trim().toUpperCase() }
    const err = itemError(cls, item, cls.items.filter((_, j) => j !== index))
    if (err) { setError(err); return }
    onOk(item)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={cur ? `Modify Item ${cur.name}` : 'Add Item'} onClose={onClose}>
    <datalist id="em-item-paths">{paths.map(p => <option key={p} value={p} />)}</datalist>
    <div className="lib-dlg-fields dvd-panel">
      <label>Item name:<input aria-label="Item name" autoFocus value={v.name} onChange={e => setV({ ...v, name: e.target.value.toUpperCase() })} /></label>
      <label>Write parameter path:<input aria-label="Write parameter path" list="em-item-paths" value={v.write} onChange={e => setV({ ...v, write: e.target.value })} /></label>
      <label>Readback parameter path:<input aria-label="Readback parameter path" list="em-item-paths" value={v.readback} onChange={e => setV({ ...v, readback: e.target.value })} /></label>
      <p className="exp-hint">Only module level parameters are available for the Write and Readback parameter paths (for example PRODUCT_VLV/MODE.TARGET and PRODUCT_VLV/MODE.ACTUAL).</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
  </SimulatorDialog>
}

function CommandDialog({ tag, namedSet, current, onClose }: { tag: string; namedSet: string; current: number; onClose: () => void }): JSX.Element {
  const set = namedSetOf(namedSet)
  const choices = (set?.entries ?? []).filter(e => e.value !== IDLE && e.userSelectable !== false)
  const [v, setV] = useState(choices.find(c => c.value === current)?.name ?? choices[0]?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const r = useEm.getState().setCommand(tag, v); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${tag}/A_COMMAND`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <span>Current value: <b>{stateName(namedSet, current)}</b></span>
      <label>New value:<select aria-label="A_COMMAND value" autoFocus value={v} onChange={e => setV(e.target.value)}>{choices.map(c => <option key={c.value} value={c.name}>{c.name}</option>)}</select></label>
      <p className="exp-hint">Named set {namedSet}. Idle (255) is not user selectable.</p>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
  </SimulatorDialog>
}

