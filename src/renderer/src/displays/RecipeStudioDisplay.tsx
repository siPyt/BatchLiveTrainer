import { useState } from 'react'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { useBatch } from '../engine/batchStore'
import { useExecutive, checkRecipeExpr, defaultTransition, type Formula, type Recipe, type RecipeParam } from '../engine/executive'
import { useExecUi } from '../ui/executiveUi'
import { useUi } from '../ui/uiStore'
import { askConfirm } from '../components/AppNotices'
import { alertResult } from '../components/LibraryExplorer'

type Sel = { kind: 'step' | 'trans'; i: number } | null
type Dlg = { t: 'step' } | { t: 'stepProps'; i: number } | { t: 'trans'; i: number } | { t: 'defer'; step: string; param: string } | { t: 'formula'; name: string | null } | null

const Buttons = ({ onOk, onClose, disabled }: { onOk: () => void; onClose: () => void; disabled?: boolean }): JSX.Element =>
  <div className="dvd-buttons"><button className="tbtn sm" disabled={disabled} onClick={onOk}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)

function StepDialog({ name, onClose }: { name: string; onClose: () => void }): JSX.Element {
  const classes = useBatch(s => s.phaseClasses)
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const unit = useBatch(s => (recipe?.equipment.mode === 'Unit' ? s.units[recipe.equipment.name] : undefined))
  const options = Object.keys(classes).filter(c => !unit || unit.phases[c]).sort()
  const [cls, setCls] = useState(options[0] ?? '')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const r = useExecutive.getState().editDraft(name, d => {
      const n = d.steps.filter(s => s.phaseClass === cls).length + 1
      d.steps.push({ name: `${cls}:${n}`, phaseClass: cls, description: '' })
      d.transitions.push({ name: `T${d.transitions.length + 1}`, condition: 'TRUE' })
    })
    if (r.ok) onClose(); else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Add Step" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Phase class:<select aria-label="Phase class" value={cls} onChange={e => setCls(e.target.value)}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
      <p className="exp-hint">{unit ? `Phase classes that are unit phases of ${unit.name}.` : 'Set the recipe equipment to a unit to list only its unit phases.'} The step is named class:number, for example {cls || 'AGITATE'}:1.</p>
    </div>
    <Buttons disabled={!cls} onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

function StepPropsDialog({ name, i, onClose }: { name: string; i: number; onClose: () => void }): JSX.Element {
  const step = useExecutive(s => (s.drafts[name] ?? s.recipes[name])?.steps[i - 1])
  const [description, setDescription] = useState(step?.description ?? '')
  if (!step) return <></>
  return <SimulatorDialog className="module-download-dialog dvd" label={`${step.name} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Step name:<input aria-label="Step name" disabled value={step.name} /></label>
      <label>Phase class:<input aria-label="Step phase class" disabled value={step.phaseClass} /></label>
      <label>Description:<input aria-label="Step description" value={description} onChange={e => setDescription(e.target.value)} /></label>
    </div>
    <Buttons onOk={() => { useExecutive.getState().editDraft(name, d => { d.steps[i - 1].description = description }); onClose() }} onClose={onClose} />
  </SimulatorDialog>
}

function TransitionDialog({ name, i, onClose }: { name: string; i: number; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const t = recipe?.transitions[i]
  const [tn, setTn] = useState(t?.name ?? '')
  const [cond, setCond] = useState(t?.condition ?? 'TRUE')
  const [error, setError] = useState<string | null>(null)
  if (!recipe || !t) return <></>
  const prev = recipe.steps[i - 1]
  const submit = (): void => {
    if (i > 0) { const errs = checkRecipeExpr(cond, recipe.steps); if (errs.length) { setError(errs[0]); return } }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tn)) { setError('Transition names use letters, digits and underscores'); return }
    if (recipe.transitions.some((x, j) => j !== i && x.name.toUpperCase() === tn.toUpperCase())) { setError(`The name ${tn} is already used by another transition`); return }
    useExecutive.getState().editDraft(name, d => { d.transitions[i] = { name: tn, condition: i === 0 ? 'TRUE' : cond } })
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${t.name} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Transition name:<input aria-label="Transition name" value={tn} onChange={e => setTn(e.target.value.toUpperCase())} /></label>
      <label>Expression:<textarea aria-label="Transition expression" rows={3} disabled={i === 0} value={i === 0 ? 'TRUE' : cond} onChange={e => setCond(e.target.value)} /></label>
      {i > 0 && prev && <button className="tbtn sm" onClick={() => setCond(defaultTransition(prev))}>Default_Transition Conditions</button>}
      <p className="exp-hint">{i === 0 ? 'The first transition after START is TRUE by default and is not configured.' : `Wait for ${prev?.name ?? 'the step'} to complete: ${prev ? defaultTransition(prev) : ''}`}</p>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Deferring a batch input parameter to the recipe level (pp 10-77 .. 10-82). */
function DeferDialog({ name, step, param, onClose }: { name: string; step: string; param: string; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const stepDef = recipe?.steps.find(s => s.name === step)
  const def = useBatch(s => (stepDef ? s.phaseClasses[stepDef.phaseClass]?.params[param] : undefined))
  const existing = Object.values(recipe?.params ?? {}).find(p => p.step === step && p.phaseParam === param)
  const [origin, setOrigin] = useState<'Value' | 'Defer to recipe'>(existing ? 'Defer to recipe' : 'Value')
  const [rname, setRname] = useState(existing?.name ?? param)
  const [ask, setAsk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!recipe || !def) return <></>
  const apply = (): void => {
    const r = useExecutive.getState().editDraft(name, d => {
      for (const [k, p] of Object.entries(d.params)) if (p.step === step && p.phaseParam === param) delete d.params[k]
      if (origin === 'Defer to recipe') {
        const base: RecipeParam = d.params[rname] ?? { name: rname, step, phaseParam: param, type: def.type, defaultValue: def.defaultValue, low: def.low, high: def.high, units: def.units }
        d.params[rname] = { ...base, step, phaseParam: param }
        for (const f of Object.values(d.formulas)) f.values[rname] ??= { useDefault: true, value: base.defaultValue }
      }
    })
    if (r.ok) onClose(); else setError(r.error)
  }
  const submit = (): void => {
    if (origin === 'Defer to recipe') {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(rname)) { setError('Recipe parameter names use letters, digits and underscores (16 characters at most)'); return }
      const other = recipe.params[rname]
      if (other && (other.step !== step || other.phaseParam !== param)) { setError(`${rname} is already deferred from ${other.step}/${other.phaseParam}`); return }
      if (!other) { setAsk(true); return }
    }
    apply()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${param} Properties`} onClose={onClose}>
    {!ask ? <div className="lib-dlg-fields dvd-panel">
      <label>Batch input parameter:<input aria-label="Batch input parameter" disabled value={`${step}/${param}`} /></label>
      <label>Origin:<select aria-label="Origin" value={origin} onChange={e => setOrigin(e.target.value as typeof origin)}><option>Value</option><option>Defer to recipe</option></select></label>
      {origin === 'Defer to recipe' && <label>Recipe parameter name:<input aria-label="Recipe parameter name" value={rname} onChange={e => setRname(e.target.value.toUpperCase())} /></label>}
      <p className="exp-hint">Recipe parameter names do not have to match the batch input parameter name. Deferred parameters can be given values in formulas.</p>
    </div> : <div className="dvd-panel"><p role="alert">The recipe parameter {rname} does not exist in {name}. Create it on the operation?</p></div>}
    {!ask ? <Buttons onOk={submit} onClose={onClose} /> : <div className="dvd-buttons"><button className="tbtn sm" onClick={apply}>Yes</button><button className="tbtn sm" onClick={() => setAsk(false)}>No</button></div>}
    <Err error={error} />
  </SimulatorDialog>
}

function FormulaDialog({ name, formula, onClose }: { name: string; formula: string | null; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const params = Object.values(recipe?.params ?? {})
  const existing = formula ? recipe?.formulas[formula] : undefined
  const [fname, setFname] = useState(existing?.name ?? '')
  const [load, setLoad] = useState(existing?.operatorCanLoad ?? true)
  const [vals, setVals] = useState<Record<string, { useDefault: boolean; value: string }>>(() =>
    Object.fromEntries(params.map(p => { const v = existing?.values[p.name]; return [p.name, { useDefault: v ? v.useDefault : true, value: String(v?.value ?? p.defaultValue) }] })))
  const [error, setError] = useState<string | null>(null)
  if (!recipe) return <></>
  const submit = (): void => {
    const n = fname.trim()
    if (!/^[A-Za-z][A-Za-z0-9_ ]{0,15}$/.test(n)) { setError('Enter a formula name (letters, digits and underscores)'); return }
    if (n !== formula && Object.keys(recipe.formulas).some(k => k.toUpperCase() === n.toUpperCase())) { setError(`Formula ${n} already exists`); return }
    const values: Formula['values'] = {}
    for (const p of params) {
      const v = vals[p.name]
      const num = p.type === 'String' ? v.value : Number(v.value)
      if (!v.useDefault) {
        if (p.type !== 'String' && (!Number.isFinite(num) || (num as number) < p.low || (num as number) > p.high)) { setError(`${p.name} must be between ${p.low} and ${p.high}`); return }
      }
      values[p.name] = { useDefault: v.useDefault, value: v.useDefault ? p.defaultValue : num }
    }
    const r = useExecutive.getState().editDraft(name, d => {
      if (formula && formula !== n) delete d.formulas[formula]
      d.formulas[n] = { name: n, operatorCanLoad: load, values }
    })
    if (r.ok) onClose(); else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={formula ? `${formula} Formula Properties` : 'New Formula'} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Formula name:<input aria-label="Formula name" autoFocus value={fname} onChange={e => setFname(e.target.value)} /></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Operator can load" checked={load} onChange={e => setLoad(e.target.checked)} /> Operator can load</label>
      <table className="dvx-details"><thead><tr><th>Recipe parameter</th><th>Use default value</th><th>Value</th></tr></thead><tbody>
        {params.map(p => <tr key={p.name}><td>{p.name} ({p.units})</td>
          <td><input type="checkbox" aria-label={`Use default value for ${p.name}`} checked={vals[p.name].useDefault} onChange={e => setVals({ ...vals, [p.name]: { ...vals[p.name], useDefault: e.target.checked } })} /></td>
          <td><input aria-label={`Value of ${p.name}`} disabled={vals[p.name].useDefault} value={vals[p.name].useDefault ? String(p.defaultValue) : vals[p.name].value}
            onChange={e => setVals({ ...vals, [p.name]: { ...vals[p.name], value: e.target.value } })} /></td></tr>)}
        {!params.length && <tr><td colSpan={3} className="dvx-empty">Defer batch input parameters to the operation first (select a step, double-click a parameter).</td></tr>}
      </tbody></table>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Recipe Studio (pp 10-26 .. 10-34, 10-76 .. 10-89): the PFC of an operation, its parameters and formulas. */
export function RecipeStudioDisplay(): JSX.Element {
  const target = useExecUi(s => s.studio)
  const recipes = useExecutive(s => s.recipes)
  const draftNames = useExecutive(s => s.drafts)
  const name = target && recipes[target] ? target : null
  const r: Recipe | undefined = useExecutive(s => (name ? (s.drafts[name] ?? s.recipes[name]) : undefined))
  const classes = useBatch(s => s.phaseClasses)
  const [sel, setSel] = useState<Sel>(null)
  const [dlg, setDlg] = useState<Dlg>(null)
  const dirty = !!name && !!draftNames[name]
  const close = (): void => setDlg(null)
  const save = (): void => { if (name) alertResult(useExecutive.getState().saveRecipe(name)) }
  const leave = (): void => {
    const go = (): void => useUi.getState().navigate('explorer')
    if (dirty && name) void askConfirm(`Save changes to ${name}?`).then(yes => { if (yes) save(); else useExecutive.getState().discardDraft(name); go() })
    else go()
  }
  if (!r || !name) return <div className="display recipe-studio"><div className="rs-title">Recipe Studio</div>
    <div className="rs-empty"><p>No recipe is open. Right-click an operation in DeltaV Explorer (System Configuration &gt; Recipes &gt; Operations) and choose Open with Recipe Studio, or choose one here.</p>
      <select aria-label="Open recipe" value="" onChange={e => useExecUi.getState().openStudio(e.target.value || null)}><option value="">(select a recipe)</option>{Object.keys(recipes).map(n => <option key={n} value={n}>{n}</option>)}</select></div></div>
  const step = sel?.kind === 'step' ? r.steps[sel.i - 1] : undefined
  const stepParams = step ? Object.values(classes[step.phaseClass]?.params ?? {}).filter(p => p.kind === 'batch' && p.direction === 'Input') : []
  const origin = (stepName: string, p: string): RecipeParam | undefined => Object.values(r.params).find(x => x.step === stepName && x.phaseParam === p)
  const props = (): void => { if (sel?.kind === 'step') setDlg({ t: 'stepProps', i: sel.i }); else if (sel?.kind === 'trans') setDlg({ t: 'trans', i: sel.i }) }
  const del = (): void => {
    if (sel?.kind !== 'step') { window.alert('Select a step to delete.'); return }
    const stepName = r.steps[sel.i - 1].name
    useExecutive.getState().editDraft(name, d => {
      d.steps.splice(sel.i - 1, 1); d.transitions.splice(sel.i, 1)
      for (const [k, p] of Object.entries(d.params)) if (p.step === stepName) delete d.params[k]
    })
    setSel(null)
  }
  return <div className="display recipe-studio" tabIndex={0} data-display="RecipeStudio" onKeyDown={e => { if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save() } }}>
    <div className="rs-title">[Recipes/{r.level === 'Operation' ? 'Operations' : r.level === 'Unit Procedure' ? 'Unit Procedures' : 'Procedures'}/{r.name}] - Recipe Studio{dirty ? ' *' : ''}</div>
    <div className="rs-toolbar" role="toolbar" aria-label="Recipe Studio toolbar">
      <button className="tbtn sm" onClick={save} disabled={!dirty}>Save</button>
      <button className="tbtn sm" onClick={() => setDlg({ t: 'step' })}>Add Step</button>
      <button className="tbtn sm" onClick={del}>Delete Step</button>
      <button className="tbtn sm" onClick={props}>Properties...</button>
      <button className="tbtn sm" onClick={() => useExecUi.getState().openDialog({ t: 'recipeProps', name, tab: 'Equipment' })}>Equipment...</button>
      <button className="tbtn sm" onClick={() => setDlg({ t: 'formula', name: null })}>New Formula...</button>
      <button className="tbtn sm" onClick={leave}>Close</button>
    </div>
    <div className="rs-body">
      <div className="rs-diagram" role="group" aria-label="Procedure function chart">
        <div className="rs-start" data-rstart="">START</div>
        {[0, ...r.steps.map((_, i) => i + 1)].map(i => <div key={i} className="rs-chain">
          <div className={`rs-trans${sel?.kind === 'trans' && sel.i === i ? ' on' : ''}`} data-rtrans={i} onClick={() => setSel({ kind: 'trans', i })} onDoubleClick={() => setDlg({ t: 'trans', i })}>
            <span className="rs-bar" /><span className="rs-tname">{r.transitions[i]?.name}</span><span className="rs-texpr">{i === 0 ? '' : r.transitions[i]?.condition}</span></div>
          {i < r.steps.length && <div className={`rs-step${sel?.kind === 'step' && sel.i === i + 1 ? ' on' : ''}`} data-rstep={r.steps[i].name}
            onClick={() => setSel({ kind: 'step', i: i + 1 })} onDoubleClick={() => setDlg({ t: 'stepProps', i: i + 1 })}>{r.steps[i].name}</div>}
        </div>)}
      </div>
      <div className="rs-side">
        <div className="rs-pane-head">Parameter{step ? ` — ${step.name}` : ''}</div>
        <table className="dvx-details rs-params" aria-label="Step parameters"><thead><tr><th>Parameter</th><th>Value</th><th>Origin</th></tr></thead><tbody>
          {stepParams.map(p => { const o = step ? origin(step.name, p.name) : undefined; return <tr key={p.name} data-rparam={p.name} onDoubleClick={() => step && setDlg({ t: 'defer', step: step.name, param: p.name })}>
            <td>{p.name}</td><td>{String(p.defaultValue)} {p.units}</td><td>{o ? `Recipe: ${o.name}` : 'Phase'}</td></tr> })}
          {!step && <tr><td colSpan={3} className="dvx-empty">Select a step to see its batch input parameters. Double-click one to defer it to the recipe.</td></tr>}
        </tbody></table>
        <div className="rs-pane-head">Formula</div>
        <table className="dvx-details rs-formulas" aria-label="Formulas"><thead><tr><th>Recipe parameter</th>{Object.keys(r.formulas).map(f => <th key={f} data-rformula={f} onDoubleClick={() => setDlg({ t: 'formula', name: f })}>{f}{r.formulas[f].operatorCanLoad ? '' : ' (hidden)'}</th>)}</tr></thead><tbody>
          {Object.values(r.params).map(p => <tr key={p.name}><td>{p.name} (default {String(p.defaultValue)})</td>{Object.keys(r.formulas).map(f => { const v = r.formulas[f].values[p.name]; return <td key={f}>{v ? (v.useDefault ? `${v.value} (default)` : String(v.value)) : ''}</td> })}</tr>)}
          {!Object.keys(r.params).length && <tr><td className="dvx-empty">No recipe parameters. Defer a batch input parameter first.</td></tr>}
        </tbody></table>
      </div>
    </div>
    <div className="rs-status"><span>For Help, press F1</span><button className="tbtn sm" aria-label="Recipe equipment" onClick={() => useExecUi.getState().openDialog({ t: 'recipeProps', name, tab: 'Equipment' })}>Equipment: {r.equipment.name || '<unassigned>'}</button><span>{r.steps.length} step(s)</span></div>
    {dlg?.t === 'step' && <StepDialog name={name} onClose={close} />}
    {dlg?.t === 'stepProps' && <StepPropsDialog name={name} i={dlg.i} onClose={close} />}
    {dlg?.t === 'trans' && <TransitionDialog name={name} i={dlg.i} onClose={close} />}
    {dlg?.t === 'defer' && <DeferDialog name={name} step={dlg.step} param={dlg.param} onClose={close} />}
    {dlg?.t === 'formula' && <FormulaDialog name={name} formula={dlg.name} onClose={close} />}
  </div>
}
