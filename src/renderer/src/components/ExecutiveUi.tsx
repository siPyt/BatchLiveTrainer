import { useState, useEffect, type ReactNode } from 'react'
import { SimulatorDialog } from './SimulatorDialog'
import { TreeRow, ContextMenu, ContentsList, alertResult } from './LibraryExplorer'
import { BatchIcon, type BatchSel } from './BatchExplorer'
import { useBatch } from '../engine/batchStore'
import { useStore } from '../engine/store'
import { useExecutive, recipeNameError, CONFIRM_ACTIONS, NOT_SIMULATED_ACTIONS, ACTION_FUNCTION, defaultActionSettings, defaultClientActions, type ActionSetting, type ConfirmAction, type Recipe, type RecipeLevel } from '../engine/executive'
import { useSecurity } from '../engine/security'
import { useExecUi } from '../ui/executiveUi'
import { useUi } from '../ui/uiStore'
import { useWindows } from '../ui/windowStore'
import { askConfirm } from './AppNotices'
import { vcMenuItems, recipeAuthItems } from './VersionControlUi'

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
    { label: `New ▸ ${level === 'Unit Procedure' ? 'Unit Procedure' : level}...`, onClick: () => ui.openDialog({ t: 'newRecipe', level }) },
    { label: 'New ▸ Recipe Folder', disabled: 'Recipe folders are not modeled' },
    sep,
    { label: 'Assign to Batch Executive...', disabled: 'Assign each recipe from its Properties > Tools tab' },
    { label: "What's this?", onClick: () => window.alert(`${name} — recipes of this level. Operations are configured in Recipe Studio and executed by the Batch Executive.`) }
  ] })
  const recipeMenu = (r: Recipe, e: React.MouseEvent): void => setMenu({ x: e.clientX, y: e.clientY, label: r.name, items: [
    { label: 'Explore', onClick: () => pick({ t: 'recipe', name: r.name }) },
    { label: 'Open with Recipe Studio', onClick: () => openRecipeStudio(r.name) },
    { label: 'Assign to Batch Executive...', onClick: () => { alertResult(useExecutive.getState().assignRecipe(r.name)) } },
    ...vcMenuItems(`Recipe:${r.name}`),
    ...recipeAuthItems(r.name),
    sep,
    { label: 'Delete', danger: true, onClick: () => { void askConfirm(`Delete ${r.name}?`).then(ok => { if (ok) alertResult(useExecutive.getState().deleteRecipe(r.name)) }) } },
    { label: 'Rename', onClick: () => ui.openDialog({ t: 'rename', name: r.name }) },
    sep,
    { label: "What's this?", onClick: () => window.alert(`${r.level} — ${r.level === 'Operation' ? 'a collection of phases, transitions and parameters that executes a sequence of phases on a unit.' : r.level === 'Unit Procedure' ? 'a collection of operations, transitions and parameters that executes a sequence of operations on a unit.' : 'the highest level of the procedural hierarchy: a collection of unit procedures, transitions and parameters used to perform a function across one or more units.'}`) },
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
        { label: 'Verify without download', onClick: () => { const x = useExecutive.getState(); const names = Object.keys(x.assigned); window.alert(names.length ? names.map(n => { const v = x.verifyRecipe(n); return v.errors.length ? `${n}: ${v.errors.join('; ')}` : `${n}: verified${v.warnings.length ? ` (${v.warnings.join('; ')})` : ''}` }).join('\n') : 'No recipes are assigned to this Batch Executive.') } },
        { label: 'Client Configuration', onClick: () => ui.openDialog({ t: 'clientConfig' }) },
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
  return <div className="dvx-contents">{!!sel.folder && sel.folder !== 'Recipes' && level && <Actions><button className="tbtn sm" onClick={() => ui.openDialog({ t: 'newRecipe', level })}>New {level}...</button></Actions>}
    <ContentsList rows={sel.folder === 'Recipes' ? FOLDERS.map(f => ({ key: f.name, icon: <BatchIcon kind="folder" />, name: f.name, type: 'Recipe folder' })) :
      list.map(r => ({ key: r.name, icon: <BatchIcon kind="phaseClass" />, name: r.name, type: r.level, data: { 'data-recipe-row': r.name }, onOpen: () => openRecipeStudio(r.name) }))}
      extraColumn={sel.folder === 'Recipes' ? undefined : { title: 'Batch Executive', value: r => (assigned[r.name] ? `${assigned[r.name]} assigned${downloaded[r.name] ? ', downloaded' : ', not downloaded'}` : 'Not assigned') }}
      empty={sel.folder === 'Recipes' ? undefined : `No recipes. Right-click the folder > New ▸ ${level}...`} /></div>
}

export function ExecutiveDetail({ name }: { name: string }): JSX.Element {
  const x = useExecutive()
  const ui = useExecUi()
  if (name === 'Batch Historian') return <div className="dvx-contents"><p className="exp-hint">Batch Historian subsystem on the ProfessionalPLUS workstation. Right-click > Properties to enable it and configure its inputs and output databases; then download the workstation and use the Historian Administration Tool and Batch History View (display list).</p></div>
  if (name === 'Campaign Manager') return <div className="dvx-contents"><p className="exp-hint">Campaign Manager subsystem on the ProfessionalPLUS workstation. Right-click > Properties to enable it, start it on the Campaign Manager tab of the Batch Application Manager and use the Campaign Manager Operator Interface (display list).</p></div>
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
  const [v, setV] = useState(() => ({ description: r?.description ?? '', workInProgress: !!r?.workInProgress, notes: r?.notes ?? '', batchSize: { min: r?.batchSize?.min ?? 1, def: r?.batchSize?.def ?? 100, max: r?.batchSize?.max ?? 100 }, units: r?.units ?? '', duration: r?.duration ?? '', product: { ...r?.product }, equipment: { ...r?.equipment } }))
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string[]>([])
  if (!r) return <></>
  const apply = (): boolean => {
    const bs = v.batchSize
    if (![bs.min, bs.def, bs.max].every(Number.isFinite) || bs.min > bs.def || bs.def > bs.max) { setError('Batch size: Minimum <= Default <= Maximum'); return false }
    const res = useExecutive.getState().setRecipeProps(name, { description: v.description, workInProgress: v.workInProgress, notes: v.notes, batchSize: v.batchSize, units: v.units, duration: v.duration, product: v.product, equipment: v.equipment as Recipe['equipment'] })
    if (!res.ok) { setError(res.error); return false }
    setError(null)
    return true
  }
  const submit = (): void => { if (apply()) onClose() }
  const field = (label: string, key: keyof Recipe['product']): JSX.Element =>
    <label>{label}:<input aria-label={label} value={v.product[key] ?? ''} onChange={e => setV({ ...v, product: { ...v.product, [key]: e.target.value } })} /></label>
  const options = v.equipment.mode === 'Unit Class' ? Object.keys(unitClasses).sort() : Object.keys(units).sort()
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${name} Properties`} onClose={onClose}>
    <Tabs tabs={['General', 'Product', 'Recipe', ...(r.level === 'Procedure' ? [] : ['Equipment']), 'Tools']} active={tab} onChange={setTab} />
    <div className="dvd-panel">
      {tab === 'General' && <div className="lib-dlg-fields">
        <p>Object type: {r.level}</p><p>Modified: {fmtTime(r.modified)}</p>
        <label>Description:<input aria-label="Recipe description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Work in progress" checked={v.workInProgress} onChange={e => setV({ ...v, workInProgress: e.target.checked })} /> Work in progress</label></div>}
      {tab === 'Product' && <div className="lib-dlg-fields">{field('Product name', 'name')}{field('Product code', 'code')}{field('Version', 'version')}{field('Author', 'author')}{field('Approved by', 'approvedBy')}
        <p className="exp-hint">The DeltaV Batch system expects a Version and Author for each recipe; a warning is given when downloading if they are blank.</p></div>}
      {tab === 'Recipe' && <div className="lib-dlg-fields">
        <fieldset className="lib-dlg-props"><legend>Batch Size</legend>
          <label>Minimum:<input aria-label="Batch size minimum" type="number" value={v.batchSize.min} onChange={e => setV({ ...v, batchSize: { ...v.batchSize, min: Number(e.target.value) } })} /></label>
          <label>Default:<input aria-label="Batch size default" type="number" value={v.batchSize.def} onChange={e => setV({ ...v, batchSize: { ...v.batchSize, def: Number(e.target.value) } })} /></label>
          <label>Maximum:<input aria-label="Batch size maximum" type="number" value={v.batchSize.max} onChange={e => setV({ ...v, batchSize: { ...v.batchSize, max: Number(e.target.value) } })} /></label></fieldset>
        <label>Units of measure:<select aria-label="Units of measure" value={v.units} onChange={e => setV({ ...v, units: e.target.value })}><option value="" />{['gallon', 'liter', 'kg', 'lb', 'each'].map(u => <option key={u}>{u}</option>)}</select></label>
        <label>Estimated duration:<input aria-label="Estimated duration" value={v.duration} onChange={e => setV({ ...v, duration: e.target.value })} /></label>
        <label>Abstract:<textarea aria-label="Recipe notes" rows={5} value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} /></label>
        <p className="exp-hint">These fields do not affect the recipe's execution.</p></div>}
      {tab === 'Equipment' && <div className="lib-dlg-fields">
        <label className="lib-dlg-check"><input type="radio" name="eqmode" aria-label="Unit" checked={v.equipment.mode === 'Unit'} onChange={() => setV({ ...v, equipment: { mode: 'Unit', name: '' } })} /> Unit</label>
        <label className="lib-dlg-check"><input type="radio" name="eqmode" aria-label="Unit Class" checked={v.equipment.mode === 'Unit Class'} onChange={() => setV({ ...v, equipment: { mode: 'Unit Class', name: '' } })} /> Unit Class</label>
        <label>Name:<select aria-label="Equipment name" value={v.equipment.name ?? ''} onChange={e => setV({ ...v, equipment: { mode: v.equipment.mode ?? 'Unit', name: e.target.value } })}>
          <option value="">(unassigned)</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
        <p className="exp-hint">A unit based recipe runs on the selected unit. A Unit Class based recipe runs on any unit of the class: the unit is chosen in the Unit Binding area when the batch is created, or when the operator is prompted for it.</p></div>}
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

/** Slides 10-25 / 10-60: Prompt, Confirm and Verify per Batch Executive action. Verify needs a confirmer, so ticking Verify ticks Confirm. */
function ActionConfirmationPanel({ settings, onChange, same, onSame }: { settings: Record<ConfirmAction, ActionSetting>; onChange: (s: Record<ConfirmAction, ActionSetting>) => void; same: boolean; onSame: (v: boolean) => void }): JSX.Element {
  const set = (a: ConfirmAction, patch: Partial<ActionSetting>): void => {
    const next = { ...settings[a], ...patch }
    if (patch.verify) next.confirm = true
    if (patch.confirm === false) next.verify = false
    onChange({ ...settings, [a]: next })
  }
  return <div className="lib-dlg-fields">
    <label className="lib-dlg-check"><input type="checkbox" aria-label="Allow Confirmer and Verifier to be the same person" checked={same} onChange={e => onSame(e.target.checked)} /> Allow Confirmer and Verifier to be the same person</label>
    <table className="dvx-details" aria-label="Action Confirmation Settings"><thead><tr><th>Action</th><th>Prompt</th><th>Confirm</th><th>Verify</th></tr></thead>
      <tbody>{CONFIRM_ACTIONS.map(a => <tr key={a} data-action-row={a} title={NOT_SIMULATED_ACTIONS.includes(a) ? `${a} is listed as on the course screen; this simulator has no ${a} command` : ACTION_FUNCTION[a]}>
        <td>{a}</td>
        <td><input type="checkbox" aria-label={`${a} Prompt`} checked={settings[a].prompt} onChange={e => set(a, { prompt: e.target.checked })} /></td>
        <td><input type="checkbox" aria-label={`${a} Confirm`} checked={settings[a].confirm} onChange={e => set(a, { confirm: e.target.checked })} /></td>
        <td><input type="checkbox" aria-label={`${a} Verify`} checked={settings[a].verify} onChange={e => set(a, { verify: e.target.checked })} /></td></tr>)}</tbody></table>
    <button className="tbtn sm" onClick={() => { onChange(defaultActionSettings()); onSame(true) }}>Restore Defaults</button>
    <p className="exp-hint">The Confirmer needs the key for the function lock of the action (Function Security, default Batch Operate); the Verifier needs the key for BATCH_ACTION_VERIFY.</p></div>
}

/** Batch Executive Properties (p10-23 .. 10-25): General, Server, Action Confirmation. */
function ExecutivePropsDialog({ initialTab, onClose }: { initialTab?: string; onClose: () => void }): JSX.Element {
  const x = useExecutive()
  const [tab, setTab] = useState(initialTab ?? 'General')
  const [v, setV] = useState({ enabled: x.enabled, description: x.description, restart: x.restart, holdPropagation: x.holdPropagation, removeEventFilesDays: x.removeEventFilesDays, revision: x.revision })
  const [confirm, setConfirm] = useState(() => JSON.parse(JSON.stringify(x.actionConfirm)) as Record<ConfirmAction, ActionSetting>)
  const [same, setSame] = useState(x.allowSamePerson)
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    if (v.enabled !== x.enabled) { const r = useExecutive.getState().setEnabled(v.enabled); if (!r.ok) { setError(r.error); return } }
    useExecutive.getState().setServerProps({ description: v.description, restart: v.restart, holdPropagation: v.holdPropagation, removeEventFilesDays: Number(v.removeEventFilesDays) || 30, revision: v.revision })
    if (JSON.stringify(confirm) !== JSON.stringify(x.actionConfirm) || same !== x.allowSamePerson) useExecutive.getState().setActionConfirmation(confirm, same)
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Batch Executive Properties" onClose={onClose}>
    <Tabs tabs={['General', 'Server', 'Action Confirmation']} active={tab} onChange={setTab} />
    <div className="dvd-panel">
      {tab === 'General' && <div className="lib-dlg-fields"><p>Object type: Batch Executive</p>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Enabled" checked={v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} /> Enabled</label>
        <label>Description:<input aria-label="Batch Executive description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label></div>}
      {tab === 'Server' && <div className="lib-dlg-fields">
        <label>Revision:<input aria-label="Revision" value={v.revision} onChange={e => setV({ ...v, revision: e.target.value })} /></label>
        <label>Remove event files older than (days):<input aria-label="Remove event files older than" type="number" value={v.removeEventFilesDays} onChange={e => setV({ ...v, removeEventFilesDays: Number(e.target.value) })} /></label>
        <label>Restart behavior:<select aria-label="Restart behavior" value={v.restart} onChange={e => setV({ ...v, restart: e.target.value as typeof v.restart })}><option>Query User</option><option>Warm Restart</option><option>Cold Restart</option></select></label>
        <label>Hold propagation limit:<select aria-label="Hold propagation limit" value={v.holdPropagation} onChange={e => setV({ ...v, holdPropagation: e.target.value })}><option>Procedure</option><option>Unit Procedure</option><option>Operation</option></select></label>
        <p className="exp-hint">A hold is always propagated up the recipe to the top level. These settings are stored but only the single operation level is simulated.</p></div>}
      {tab === 'Action Confirmation' && <ActionConfirmationPanel settings={confirm} onChange={setConfirm} same={same} onSame={setSame} />}
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Executive right-click > Client Configuration (slide 10-61): the commands the Batch Operator Interface and DeltaV Operate offer. */
function ClientConfigDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const x = useExecutive()
  const [allow, setAllow] = useState(x.clientAllowLocal)
  const [enabled, setEnabled] = useState({ ...x.clientEnabled })
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Client Configuration" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Allow settings to be configured at the local client" checked={allow} onChange={e => setAllow(e.target.checked)} /> Allow settings to be configured at the local client</label>
      <fieldset className="lib-dlg-props"><legend>Local Client Actions</legend>
        <table className="dvx-details" aria-label="Local Client Actions"><thead><tr><th>Action</th><th>Enable</th></tr></thead>
          <tbody>{CONFIRM_ACTIONS.map(a => <tr key={a}><td>{a}</td><td><input type="checkbox" aria-label={`${a} Enable`} checked={enabled[a]} onChange={e => setEnabled({ ...enabled, [a]: e.target.checked })} /></td></tr>)}</tbody></table></fieldset>
      <button className="tbtn sm" onClick={() => { setEnabled(defaultClientActions()); setAllow(true) }}>Restore Defaults</button>
    </div>
    <Buttons onOk={() => { useExecutive.getState().setClientConfig(allow, enabled); onClose() }} onClose={onClose} />
  </SimulatorDialog>
}

/** The Batch Operator Interface's Config Tool (slide 10-64): which commands this workstation offers, when the Batch Executive allows it. */
function OiConfigDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const x = useExecutive()
  const [enabled, setEnabled] = useState({ ...x.localEnabled })
  const editable = x.clientAllowLocal
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="DeltaV Batch OI Config" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Default Batch Executive Node for Prompts Control: PROPLUS</p>
      {!editable && <p className="exp-hint" role="status">Allow settings to be configured at the local client is not enabled on the Batch Executive (Client Configuration): the local client cannot override the Batch Executive server's options.</p>}
      <fieldset className="lib-dlg-props"><legend>Actions</legend>
        <table className="dvx-details" aria-label="OI Actions"><thead><tr><th>Action</th><th>Enable</th></tr></thead>
          <tbody>{CONFIRM_ACTIONS.map(a => <tr key={a}><td>{a}</td><td><input type="checkbox" aria-label={`${a} OI Enable`} disabled={!editable || !x.clientEnabled[a]} checked={enabled[a] && x.clientEnabled[a]} onChange={e => setEnabled({ ...enabled, [a]: e.target.checked })} /></td></tr>)}</tbody></table></fieldset>
    </div>
    <Buttons disabled={!editable} onOk={() => { const r = useExecutive.getState().setLocalEnabled(enabled); if (r.ok) onClose() }} onClose={onClose} />
  </SimulatorDialog>
}

/** Prompt / Confirm / Verify for an operator action, as set on the Batch Executive's Action Confirmation tab (slides 10-60, 10-74). */
function ActionGateDialog({ onClose }: { onClose: () => void }): JSX.Element | null {
  const gate = useExecUi(s => s.gate)
  const cfg = useExecutive(s => (gate ? s.actionConfirm[gate.action] : undefined))
  const me = useSecurity(s => s.currentUser)
  const [comment, setComment] = useState('')
  const [confirmUser, setConfirmUser] = useState(me)
  const [confirmPw, setConfirmPw] = useState('')
  const [verifyUser, setVerifyUser] = useState('')
  const [verifyPw, setVerifyPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!gate || !cfg) return null
  const needId = cfg.confirm || cfg.verify
  const submit = (): void => {
    if (needId) {
      const r = useExecutive.getState().authorizeAction(gate.action, gate.subject, { comment, confirm: { user: confirmUser, password: confirmPw }, verify: cfg.verify ? { user: verifyUser, password: verifyPw } : undefined }, gate.batchId)
      if (!r.ok) { setError(r.error); return }
    }
    const run = gate.run
    onClose()
    run()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={needId ? 'Batch Operator Identification' : 'Confirm Action'} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel" data-action-gate={gate.action}>
      <p role="status">{gate.action}: {gate.subject}</p>
      {!needId && <p>Are you sure you want to do this?</p>}
      {needId && <>
        <label>Comment:<textarea aria-label="Gate comment" rows={2} value={comment} onChange={e => setComment(e.target.value)} /></label>
        <fieldset className="lib-dlg-props"><legend>Confirm</legend>
          <label>User Name:<input aria-label="Confirm user name" value={confirmUser} onChange={e => setConfirmUser(e.target.value)} /></label>
          <label>Password:<input aria-label="Confirm password" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !cfg.verify) submit() }} /></label></fieldset>
        {cfg.verify && <fieldset className="lib-dlg-props"><legend>Verify</legend>
          <label>User Name:<input aria-label="Verify user name" value={verifyUser} onChange={e => setVerifyUser(e.target.value)} /></label>
          <label>Password:<input aria-label="Verify password" type="password" value={verifyPw} onChange={e => setVerifyPw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label></fieldset>}</>}
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
  const gate = useExecUi(s => s.gate)
  const close = (): void => useExecUi.getState().openDialog(null)
  const gateDialog = gate ? <ActionGateDialog key={`${gate.action}:${gate.subject}`} onClose={() => useExecUi.getState().openGate(null)} /> : null
  if (!dialog) return gateDialog
  return <>{(() => {
    switch (dialog.t) {
      case 'newRecipe': return <NewRecipeDialog level={dialog.level} onClose={close} />
      case 'rename': return <RenameDialog name={dialog.name} onClose={close} />
      case 'recipeProps': return <RecipePropsDialog name={dialog.name} initialTab={dialog.tab} onClose={close} />
      case 'execProps': return <ExecutivePropsDialog initialTab={dialog.tab} onClose={close} />
      case 'clientConfig': return <ClientConfigDialog onClose={close} />
      case 'oiConfig': return <OiConfigDialog onClose={close} />
      case 'downloadEquipment': return <DownloadEquipmentDialog onClose={close} />
      case 'assignArea': return <AssignAreaDialog onClose={close} />
    }
  })()}{gateDialog}</>
}
