import { useState, useEffect, type ReactNode } from 'react'
import { SimulatorDialog } from './SimulatorDialog'
import { TreeRow, ContextMenu, ContentsList, alertResult } from './LibraryExplorer'
import { BatchIcon, type BatchSel } from './BatchExplorer'
import { useBatch } from '../engine/batchStore'
import { useStore } from '../engine/store'
import { useExecutive, recipeNameError, type Recipe, type RecipeLevel } from '../engine/executive'
import { useExecUi } from '../ui/executiveUi'
import { useUi } from '../ui/uiStore'
import { useWindows } from '../ui/windowStore'
import { askConfirm } from './AppNotices'

type MenuItem = { label: string; onClick?: () => void; disabled?: string; separator?: boolean; danger?: boolean }
type Menu = { x: number; y: number; label: string; items: MenuItem[] }
const sep: MenuItem = { label: '', separator: true }

/** Recipe Studio is its own application: the Explorer window is minimized behind it and comes back on Close. */
export function openRecipeStudio(name: string): void { useExecUi.getState().openStudio(name); useWindows.getState().minimize('explorer'); useUi.getState().navigate('recipestudio') }
export function openExecutiveApp(display: 'boi' | 'batchmgr' | 'recipestudio'): void { useWindows.getState().minimize('explorer'); useUi.getState().navigate(display) }

function useCtx(): [Menu | null, (m: Menu | null) => void] {
  const [menu, setMenu] = useState<Menu | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true) }
  }, [menu])
  return [menu, setMenu]
}

const FOLDERS: { name: string; level: RecipeLevel }[] = [{ name: 'Procedures', level: 'Procedure' }, { name: 'Unit Procedures', level: 'Unit Procedure' }, { name: 'Operations', level: 'Operation' }]
const CH11 = 'Unit procedures and procedures are Course 7016 Chapter 11; only operations are modeled'
const fmtTime = (t: number): string => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

// ---------------------------------------------------------------------------
// Explorer tree: System Configuration > Recipes > Procedures / Unit Procedures / Operations

export function RecipesTree({ depth, selection, onSelect }: { depth: number; selection: { kind: string; sel?: BatchSel } | null; onSelect: (s: { kind: 'batch'; sel: BatchSel }) => void }): JSX.Element {
  const recipes = useExecutive(s => s.recipes)
  const drafts = useExecutive(s => s.drafts)
  const ui = useExecUi()
  const [open, setOpen] = useState<Record<string, boolean>>({ root: true, Operations: true })
  const [menu, setMenu] = useCtx()
  const sel = selection?.kind === 'batch' ? selection.sel : undefined
  const pick = (s: BatchSel): void => onSelect({ kind: 'batch', sel: s })
  const folderMenu = (name: string, level: RecipeLevel, e: React.MouseEvent): void => setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
    { label: 'Explore', onClick: () => pick({ t: 'recipes', folder: name }) },
    { label: 'New ▸ Operation...', onClick: () => ui.openDialog({ t: 'newRecipe', level: 'Operation' }), disabled: level === 'Operation' ? undefined : CH11 },
    { label: 'New ▸ Recipe Folder', disabled: 'Recipe folders are not modeled' },
    sep,
    { label: 'Assign to Batch Executive...', disabled: 'Assign each recipe from its Properties > Tools tab' },
    { label: "What's this?", onClick: () => window.alert(`${name} — recipes of this level. Operations are configured in Recipe Studio and executed by the Batch Executive.`) }
  ] })
  const recipeMenu = (r: Recipe, e: React.MouseEvent): void => setMenu({ x: e.clientX, y: e.clientY, label: r.name, items: [
    { label: 'Explore', onClick: () => pick({ t: 'recipe', name: r.name }) },
    { label: 'Open with Recipe Studio', onClick: () => openRecipeStudio(r.name) },
    { label: 'Assign to Batch Executive...', onClick: () => { alertResult(useExecutive.getState().assignRecipe(r.name)) } },
    sep,
    { label: 'Delete', danger: true, onClick: () => { void askConfirm(`Delete ${r.name}?`).then(ok => { if (ok) alertResult(useExecutive.getState().deleteRecipe(r.name)) }) } },
    { label: 'Rename', onClick: () => ui.openDialog({ t: 'rename', name: r.name }) },
    sep,
    { label: "What's this?", onClick: () => window.alert('Operation — a collection of phases, transitions and parameters that executes a sequence of phases on a unit.') },
    { label: 'Properties', onClick: () => ui.openDialog({ t: 'recipeProps', name: r.name }) }
  ] })
  return <div data-library="recipes">
    <TreeRow depth={depth} open={open.root} onToggle={() => setOpen(o => ({ ...o, root: !o.root }))} icon={<BatchIcon kind="folder" />} label={<span>Recipes</span>}
      selected={sel?.t === 'recipes' && sel.folder === 'Recipes'} dataAttr={{ 'data-recipes-root': '' }} onClick={() => pick({ t: 'recipes', folder: 'Recipes' })}>
      {FOLDERS.map(f => <TreeRow key={f.name} depth={depth + 1} open={!!open[f.name]} onToggle={() => setOpen(o => ({ ...o, [f.name]: !o[f.name] }))}
        icon={<BatchIcon kind="folder" />} label={<span>{f.name}</span>} dataAttr={{ 'data-recipe-folder': f.name }} selected={sel?.t === 'recipes' && sel.folder === f.name}
        onClick={() => pick({ t: 'recipes', folder: f.name })} onContextMenu={e => { pick({ t: 'recipes', folder: f.name }); folderMenu(f.name, f.level, e) }}>
        {Object.values(recipes).filter(r => r.level === f.level).sort((a, b) => a.name.localeCompare(b.name)).map(r => <TreeRow key={r.name} depth={depth + 2}
          icon={<BatchIcon kind="phaseClass" />} label={<span>{r.name}{drafts[r.name] ? ' *' : ''}</span>} sub={`${r.level}${r.equipment.name ? ` · ${r.equipment.name}` : ''}`}
          dataAttr={{ 'data-recipe': r.name }} selected={sel?.t === 'recipe' && sel.name === r.name}
          onClick={() => pick({ t: 'recipe', name: r.name })} onDoubleClick={() => openRecipeStudio(r.name)}
          onContextMenu={e => { pick({ t: 'recipe', name: r.name }); recipeMenu(r, e) }} />)}
      </TreeRow>)}
    </TreeRow>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </div>
}

/** Children of PROPLUS > Batch Executive and the menus of the executive node. */
export function ExecutiveRows({ depth, selection, onSelect }: { depth: number; selection: { kind: string; sel?: BatchSel } | null; onSelect: (s: { kind: 'batch'; sel: BatchSel }) => void }): JSX.Element {
  const ui = useExecUi()
  const enabled = useExecutive(s => s.enabled)
  const [menu, setMenu] = useCtx()
  const sel = selection?.kind === 'batch' ? selection.sel : undefined
  const pick = (name: string): void => onSelect({ kind: 'batch', sel: { t: 'subsystem', name } })
  const on = (name: string): boolean => sel?.t === 'subsystem' && sel.name === name
  return <>
    <TreeRow depth={depth} open icon={<BatchIcon kind="subsystem" />} label={<span>Batch Executive</span>} sub={enabled ? 'Enabled' : 'Disabled'}
      dataAttr={{ 'data-subsystem': 'Batch Executive' }} selected={on('Batch Executive')} onClick={() => pick('Batch Executive')}
      onContextMenu={e => { pick('Batch Executive'); setMenu({ x: e.clientX, y: e.clientY, label: 'Batch Executive', items: [
        { label: 'Explore', onClick: () => pick('Batch Executive') },
        { label: 'Download ▸ Equipment...', onClick: () => ui.openDialog({ t: 'downloadEquipment' }) },
        { label: 'Verify without download', disabled: 'Use Verify Now on the recipe Tools tab' },
        { label: 'Client Configuration', disabled: 'Not modeled: every BatchLive client shows all batch commands' },
        sep,
        { label: "What's this?", onClick: () => window.alert('Batch Executive — the subsystem that executes recipes. Enable it, assign plant areas and recipes to it, download the equipment, and start its service in the Batch Application Manager.') },
        { label: 'Properties', onClick: () => ui.openDialog({ t: 'execProps' }) }
      ] }) }}>
      <TreeRow depth={depth + 1} icon={<BatchIcon kind="folder" />} label={<span>Assigned Areas</span>} dataAttr={{ 'data-subsystem': 'Assigned Areas' }}
        selected={on('Assigned Areas')} onClick={() => pick('Assigned Areas')}
        onContextMenu={e => { pick('Assigned Areas'); setMenu({ x: e.clientX, y: e.clientY, label: 'Assigned Areas', items: [
          { label: 'Explore', onClick: () => pick('Assigned Areas') }, { label: 'Assign Area...', onClick: () => ui.openDialog({ t: 'assignArea' }) }] }) }} />
      <TreeRow depth={depth + 1} icon={<BatchIcon kind="folder" />} label={<span>Assigned Recipes</span>} dataAttr={{ 'data-subsystem': 'Assigned Recipes' }}
        selected={on('Assigned Recipes')} onClick={() => pick('Assigned Recipes')} />
    </TreeRow>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </>
}

// ---------------------------------------------------------------------------
// Right-hand panes

const Actions = ({ children }: { children: ReactNode }): JSX.Element => <div className="dvx-actions">{children}</div>

export function RecipeDetail({ sel }: { sel: Extract<BatchSel, { t: 'recipes' | 'recipe' }> }): JSX.Element {
  const recipes = useExecutive(s => s.recipes)
  const assigned = useExecutive(s => s.assigned)
  const downloaded = useExecutive(s => s.downloaded)
  const ui = useExecUi()
  if (sel.t === 'recipe') {
    const r = recipes[sel.name]
    if (!r) return <div className="exp-empty">Not found.</div>
    return <div className="dvx-contents"><Actions>
      <button className="tbtn sm" onClick={() => openRecipeStudio(r.name)}>Open with Recipe Studio</button>
      <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'recipeProps', name: r.name })}>Properties...</button></Actions>
      <ContentsList rows={[...r.steps.map((s, i) => ({ key: s.name, icon: <BatchIcon kind="uphase" />, name: s.name, type: `Step ${i + 1} · phase class ${s.phaseClass}` })),
        ...Object.values(r.params).map(p => ({ key: `p${p.name}`, icon: <BatchIcon kind="param" />, name: p.name, type: `Recipe parameter (${p.step}/${p.phaseParam})` })),
        ...Object.values(r.formulas).map(f => ({ key: `f${f.name}`, icon: <BatchIcon kind="param" />, name: f.name, type: `Formula${f.operatorCanLoad ? ' (operator can load)' : ''}` }))]} empty="Empty recipe." /></div>
  }
  const level = FOLDERS.find(f => f.name === sel.folder)?.level
  const list = Object.values(recipes).filter(r => !level || r.level === level)
  return <div className="dvx-contents">{(sel.folder === 'Operations') && <Actions><button className="tbtn sm" onClick={() => ui.openDialog({ t: 'newRecipe', level: 'Operation' })}>New Operation...</button></Actions>}
    <ContentsList rows={sel.folder === 'Recipes' ? FOLDERS.map(f => ({ key: f.name, icon: <BatchIcon kind="folder" />, name: f.name, type: 'Recipe folder' })) :
      list.map(r => ({ key: r.name, icon: <BatchIcon kind="phaseClass" />, name: r.name, type: r.level, data: { 'data-recipe-row': r.name }, onOpen: () => openRecipeStudio(r.name) }))}
      extraColumn={sel.folder === 'Recipes' ? undefined : { title: 'Batch Executive', value: r => (assigned[r.name] ? `${assigned[r.name]} assigned${downloaded[r.name] ? ', downloaded' : ', not downloaded'}` : 'Not assigned') }}
      empty={sel.folder === 'Recipes' ? undefined : 'No recipes. Right-click the folder > New ▸ Operation...'} /></div>
}

export function ExecutiveDetail({ name }: { name: string }): JSX.Element {
  const x = useExecutive()
  const ui = useExecUi()
  if (name === 'Batch Historian') return <div className="dvx-contents"><p className="exp-hint">Batch Historian subsystem on the ProfessionalPLUS workstation: batch history collection is not simulated in BatchLive; the Batch Event Journal in the Batch Operator Interface records batch events.</p></div>
  if (name === 'Assigned Areas') return <div className="dvx-contents"><Actions><button className="tbtn sm" onClick={() => ui.openDialog({ t: 'assignArea' })}>Assign Area...</button></Actions>
    <ContentsList rows={x.assignedAreas.map(a => ({ key: a, icon: <BatchIcon kind="folder" />, name: a, type: 'Assigned plant area', data: { 'data-assigned-area': a } }))} empty="No areas are assigned. A Batch Executive controls only the equipment in its assigned areas." /></div>
  if (name === 'Assigned Recipes') return <div className="dvx-contents">
    <ContentsList rows={Object.entries(x.assigned).map(([r, how]) => ({ key: r, icon: <BatchIcon kind="phaseClass" />, name: r, type: `${how} assignment` }))}
      extraColumn={{ title: 'Download', value: r => (x.downloaded[r.name] ? `Downloaded revision ${x.downloaded[r.name].recipe.revision}` : 'Not downloaded') }} empty="No recipes are assigned. Use Assign Now on the recipe Properties > Tools tab." /></div>
  return <div className="dvx-contents"><Actions>
    <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'execProps' })}>Properties...</button>
    <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'downloadEquipment' })}>Download Equipment...</button></Actions>
    <ContentsList rows={[
      { key: 'en', icon: <BatchIcon kind="param" />, name: `Enabled: ${x.enabled ? 'Yes' : 'No'}`, type: 'Batch Executive property' },
      { key: 'sv', icon: <BatchIcon kind="param" />, name: `Service: ${x.service}`, type: 'Batch Executive status' },
      { key: 'eq', icon: <BatchIcon kind="param" />, name: `Equipment downloaded: ${x.equipmentAt === null ? 'No' : `Yes (${Object.keys(x.equipment).length} unit phases)`}`, type: 'Batch Executive status' },
      { key: 'ar', icon: <BatchIcon kind="folder" />, name: 'Assigned Areas', type: `${x.assignedAreas.length} area(s)` },
      { key: 'rc', icon: <BatchIcon kind="folder" />, name: 'Assigned Recipes', type: `${Object.keys(x.assigned).length} recipe(s)` }]} />
    <p className="exp-hint">A maximum of four Batch Executives can be enabled on a DeltaV network; BatchLive has the one on PROPLUS.</p></div>
}

// ---------------------------------------------------------------------------
// Dialogs

function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }): JSX.Element {
  return <div className="dvd-tabs" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={t === active} className={t === active ? 'on' : ''} onClick={() => onChange(t)}>{t}</button>)}</div>
}
const Buttons = ({ onOk, onClose, disabled }: { onOk: () => void; onClose: () => void; disabled?: boolean }): JSX.Element =>
  <div className="dvd-buttons"><button className="tbtn sm" disabled={disabled} onClick={onOk}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)

function NewRecipeDialog({ level, onClose }: { level: RecipeLevel; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const r = useExecutive.getState().newRecipe(name, level); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`New ${level}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Object name:<input aria-label="Object name" autoFocus value={name} onChange={e => setName(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
      <label>Object type:<input aria-label="Object type" disabled value={level} /></label>
      {recipeNameError(name) && name && <p className="exp-hint">{recipeNameError(name)}</p>}
    </div>
    <Buttons disabled={!name.trim()} onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

function RenameDialog({ name, onClose }: { name: string; onClose: () => void }): JSX.Element {
  const [next, setNext] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const r = useExecutive.getState().renameRecipe(name, next); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Rename ${name}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel"><label>New name:<input aria-label="New name" autoFocus value={next} onChange={e => setNext(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label></div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Recipe Properties (pp 10-28 .. 10-32): General, Product, Recipe, Equipment, Tools. */
function RecipePropsDialog({ name, initialTab, onClose }: { name: string; initialTab?: string; onClose: () => void }): JSX.Element {
  const r = useExecutive(s => s.recipes[name])
  const assigned = useExecutive(s => s.assigned[name])
  const downloaded = useExecutive(s => s.downloaded[name])
  const units = useBatch(s => s.units)
  const unitClasses = useBatch(s => s.unitClasses)
  const [tab, setTab] = useState(initialTab ?? 'General')
  const [v, setV] = useState(() => ({ description: r?.description ?? '', workInProgress: !!r?.workInProgress, notes: r?.notes ?? '', product: { ...r?.product }, equipment: { ...r?.equipment } }))
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string[]>([])
  if (!r) return <></>
  const apply = (): boolean => {
    const res = useExecutive.getState().setRecipeProps(name, { description: v.description, workInProgress: v.workInProgress, notes: v.notes, product: v.product, equipment: v.equipment as Recipe['equipment'] })
    if (!res.ok) { setError(res.error); return false }
    setError(null)
    return true
  }
  const submit = (): void => { if (apply()) onClose() }
  const field = (label: string, key: keyof Recipe['product']): JSX.Element =>
    <label>{label}:<input aria-label={label} value={v.product[key] ?? ''} onChange={e => setV({ ...v, product: { ...v.product, [key]: e.target.value } })} /></label>
  const options = v.equipment.mode === 'Unit Class' ? Object.keys(unitClasses).sort() : Object.keys(units).sort()
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${name} Properties`} onClose={onClose}>
    <Tabs tabs={['General', 'Product', 'Recipe', 'Equipment', 'Tools']} active={tab} onChange={setTab} />
    <div className="dvd-panel">
      {tab === 'General' && <div className="lib-dlg-fields">
        <p>Object type: {r.level}</p><p>Modified: {fmtTime(r.modified)}</p>
        <label>Description:<input aria-label="Recipe description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Work in progress" checked={v.workInProgress} onChange={e => setV({ ...v, workInProgress: e.target.checked })} /> Work in progress</label></div>}
      {tab === 'Product' && <div className="lib-dlg-fields">{field('Product name', 'name')}{field('Product code', 'code')}{field('Version', 'version')}{field('Author', 'author')}{field('Approved by', 'approvedBy')}
        <p className="exp-hint">The DeltaV Batch system expects a Version and Author for each recipe; a warning is given when downloading if they are blank.</p></div>}
      {tab === 'Recipe' && <div className="lib-dlg-fields"><label>Notes:<textarea aria-label="Recipe notes" rows={5} value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></label>
        <p className="exp-hint">These fields do not affect the recipe's execution.</p></div>}
      {tab === 'Equipment' && <div className="lib-dlg-fields">
        <label className="lib-dlg-check"><input type="radio" name="eqmode" aria-label="Unit" checked={v.equipment.mode === 'Unit'} onChange={() => setV({ ...v, equipment: { mode: 'Unit', name: '' } })} /> Unit</label>
        <label className="lib-dlg-check"><input type="radio" name="eqmode" aria-label="Unit Class" checked={v.equipment.mode === 'Unit Class'} onChange={() => setV({ ...v, equipment: { mode: 'Unit Class', name: '' } })} /> Unit Class</label>
        <label>Name:<select aria-label="Equipment name" value={v.equipment.name ?? ''} onChange={e => setV({ ...v, equipment: { mode: v.equipment.mode ?? 'Unit', name: e.target.value } })}>
          <option value="">(unassigned)</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
        <p className="exp-hint">A unit based operation runs on the selected unit. A class based recipe selects the unit when it runs (not modeled).</p></div>}
      {tab === 'Tools' && <div className="lib-dlg-fields">
        <fieldset className="lib-dlg-props"><legend>Assign Recipe</legend>
          <p>Currently assigned to: <b>{assigned ? `PROPLUS Batch Executive (${assigned} assignment)` : '(none)'}</b></p>
          <button className="tbtn sm" onClick={() => { if (!apply()) return; const res = useExecutive.getState().assignRecipe(name); setResult([res.ok ? `${name} assigned to the Batch Executive.` : res.error]) }}>Assign Now...</button></fieldset>
        <fieldset className="lib-dlg-props"><legend>Verify Recipe</legend>
          <button className="tbtn sm" onClick={() => { if (!apply()) return; const x = useExecutive.getState().verifyRecipe(name); setResult(x.errors.length ? x.errors.map(e => `Error: ${e}`) : [`${name} verified: the algorithm is capable of execution.`, ...x.warnings.map(w => `Warning: ${w}`)]) }}>Verify Now...</button></fieldset>
        <fieldset className="lib-dlg-props"><legend>Download Recipe</legend>
          <p>{downloaded ? `Downloaded revision ${downloaded.recipe.revision}` : 'Not downloaded'}</p>
          <button className="tbtn sm" onClick={() => { if (!apply()) return; const res = useExecutive.getState().downloadRecipe(name); setResult(res.ok ? [`${name} downloaded to the Batch Executive.`, ...res.value.warnings.map(w => `Warning: ${w}`)] : [res.error]) }}>Download Now...</button></fieldset>
        <div className="exp-hint" role="status" aria-label="Tools result">{result.map((l, i) => <div key={i}>{l}</div>)}</div></div>}
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Batch Executive Properties (p10-23 .. 10-25): General, Server, Action Confirmation. */
function ExecutivePropsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const x = useExecutive()
  const [tab, setTab] = useState('General')
  const [v, setV] = useState({ enabled: x.enabled, description: x.description, restart: x.restart, holdPropagation: x.holdPropagation, removeEventFilesDays: x.removeEventFilesDays })
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    if (v.enabled !== x.enabled) { const r = useExecutive.getState().setEnabled(v.enabled); if (!r.ok) { setError(r.error); return } }
    useExecutive.getState().setServerProps({ description: v.description, restart: v.restart, holdPropagation: v.holdPropagation, removeEventFilesDays: Number(v.removeEventFilesDays) || 30 })
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Batch Executive Properties" onClose={onClose}>
    <Tabs tabs={['General', 'Server', 'Action Confirmation']} active={tab} onChange={setTab} />
    <div className="dvd-panel">
      {tab === 'General' && <div className="lib-dlg-fields"><p>Object type: Batch Executive</p>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enabled" checked={v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} /> Enabled</label>
        <label>Description:<input aria-label="Batch Executive description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label></div>}
      {tab === 'Server' && <div className="lib-dlg-fields">
        <label>Remove event files older than (days):<input aria-label="Remove event files older than" type="number" value={v.removeEventFilesDays} onChange={e => setV({ ...v, removeEventFilesDays: Number(e.target.value) })} /></label>
        <label>Restart behavior:<select aria-label="Restart behavior" value={v.restart} onChange={e => setV({ ...v, restart: e.target.value as typeof v.restart })}><option>Query User</option><option>Warm Restart</option><option>Cold Restart</option></select></label>
        <label>Hold propagation limit:<select aria-label="Hold propagation limit" value={v.holdPropagation} onChange={e => setV({ ...v, holdPropagation: e.target.value })}><option>Procedure</option><option>Unit Procedure</option><option>Operation</option></select></label>
        <p className="exp-hint">A hold is always propagated up the recipe to the top level. These settings are stored but only the single operation level is simulated.</p></div>}
      {tab === 'Action Confirmation' && <table className="dvx-details"><thead><tr><th>Action</th><th>Prompt</th><th>Confirm</th><th>Verify</th></tr></thead>
        <tbody>{['Add Batch', 'Start', 'Hold', 'Restart', 'Stop', 'Abort', 'Clear Failures', 'Acquire Phase', 'Release Phase', 'Start Phase', 'Answer Prompt'].map(a => <tr key={a}><td>{a}</td><td><input type="checkbox" disabled /></td><td><input type="checkbox" disabled /></td><td><input type="checkbox" disabled /></td></tr>)}</tbody></table>}
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

function DownloadEquipmentDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const areas = useExecutive(s => s.assignedAreas)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog lib-download-dialog" label="Download ProfessionalPLUS workstation" onClose={onClose}>
    {result === null ? <>
      <p>Download the equipment configuration (the unit phases, parameters and messages of the assigned areas: {areas.join(', ') || 'none assigned'}) to the Batch Executive on PROPLUS?</p>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { const r = useExecutive.getState().downloadEquipment(); if (r.ok) setResult(`Download of PROPLUS completed: ${r.value} unit phase(s) known to the Batch Executive.`); else setError(r.error) }}>Download</button>
        <button className="tbtn sm" onClick={onClose}>Cancel</button></div><Err error={error} /></> :
      <><p role="status">{result}</p><div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>OK</button></div></>}
  </SimulatorDialog>
}

function AssignAreaDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const areas = useStore(s => s.areas)
  const assigned = useExecutive(s => s.assignedAreas)
  const free = areas.filter(a => !assigned.includes(a))
  const [area, setArea] = useState(free[0] ?? '')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => { const r = useExecutive.getState().assignArea(area); if (r.ok) onClose(); else setError(r.error) }
  return <SimulatorDialog className="module-download-dialog dvd" label="Assign Area" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel"><label>Select the plant area to assign to the Batch Executive:<select aria-label="Plant area" value={area} onChange={e => setArea(e.target.value)}>
      {free.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      <p className="exp-hint">Assigning an area also assigns the equipment it contains. An area can be assigned to one Batch Executive at a time.</p></div>
    <Buttons disabled={!area} onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

export function ExecutiveDialogHost(): JSX.Element | null {
  const dialog = useExecUi(s => s.dialog)
  const close = (): void => useExecUi.getState().openDialog(null)
  if (!dialog) return null
  switch (dialog.t) {
    case 'newRecipe': return <NewRecipeDialog level={dialog.level} onClose={close} />
    case 'rename': return <RenameDialog name={dialog.name} onClose={close} />
    case 'recipeProps': return <RecipePropsDialog name={dialog.name} initialTab={dialog.tab} onClose={close} />
    case 'execProps': return <ExecutivePropsDialog onClose={close} />
    case 'downloadEquipment': return <DownloadEquipmentDialog onClose={close} />
    case 'assignArea': return <AssignAreaDialog onClose={close} />
  }
}
