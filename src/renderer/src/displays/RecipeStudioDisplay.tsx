import { useState } from 'react'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { useBatch } from '../engine/batchStore'
import { useExecutive, checkRecipeExpr, defaultTransition, groupTransition, stepGroups, stepParamDefs, childLevel, type Formula, type Recipe, type RecipeParam, type UnitAlias } from '../engine/executive'
import { useExecUi } from '../ui/executiveUi'
import { useUi } from '../ui/uiStore'
import { askConfirm } from '../components/AppNotices'
import { alertResult } from '../components/LibraryExplorer'

type Sel = { kind: 'step' | 'trans'; i: number } | null
type Dlg = { t: 'step'; simul?: boolean } | { t: 'stepProps'; i: number } | { t: 'trans'; i: number } | { t: 'defer'; step: string; param: string } | { t: 'formula'; name: string | null } | { t: 'aliases' } | { t: 'links' } | { t: 'branches' } | null

const Buttons = ({ onOk, onClose, disabled }: { onOk: () => void; onClose: () => void; disabled?: boolean }): JSX.Element =>
  <div className="dvd-buttons"><button className="tbtn sm" disabled={disabled} onClick={onOk}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)

function StepDialog({ name, simul, sel, onClose }: { name: string; simul?: boolean; sel: number | null; onClose: () => void }): JSX.Element {
  const classes = useBatch(s => s.phaseClasses)
  const recipes = useExecutive(s => s.recipes)
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const unit = useBatch(s => (recipe?.equipment.mode === 'Unit' ? s.units[recipe.equipment.name] : undefined))
  const unitClass = useBatch(s => (recipe?.equipment.mode === 'Unit Class' ? s.unitClasses[recipe.equipment.name] : undefined))
  const below = recipe ? childLevel(recipe.level) : null
  const options = recipe?.level === 'Operation'
    ? Object.keys(classes).filter(c => (!unit || unit.phases[c]) && (!unitClass || unitClass.phaseClasses.includes(c))).sort()
    : Object.values(recipes).filter(r => r.level === below).map(r => r.name).sort()
  const [cls, setCls] = useState(options[0] ?? '')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const r = useExecutive.getState().editDraft(name, d => {
      const n = d.steps.filter(s => s.phaseClass === cls).length + 1
      const step = { name: `${cls}:${n}`, phaseClass: cls, description: '' } as Recipe['steps'][number]
      if (d.level === 'Operation') { d.steps.push(step); d.transitions.push({ name: `T${d.transitions.length + 1}`, condition: 'TRUE' }); return }
      d.steps.forEach((s, i) => { if (s.group === undefined) s.group = i + 1 })
      if (simul && sel !== null && d.steps[sel - 1]) {
        step.group = d.steps[sel - 1].group
        d.steps.push(step)
        const gi = stepGroups(d).findIndex(g => g.includes(sel))
        const t = d.transitions[gi + 1]
        if (t) t.condition = `${t.condition} AND ${groupTransition([step], d.level)}`
      } else {
        step.group = Math.max(0, ...d.steps.map(s => s.group ?? 0)) + 1
        d.steps.push(step)
        d.transitions.push({ name: `T${d.transitions.length + 1}`, condition: groupTransition([step], d.level) })
      }
    })
    if (r.ok) onClose(); else setError(r.error)
  }
  const what = recipe?.level === 'Operation' ? 'Phase class' : below === 'Operation' ? 'Operation' : 'Unit procedure'
  return <SimulatorDialog className="module-download-dialog dvd" label={simul ? 'Add Simultaneous Step' : 'Add Step'} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>{what}:<select aria-label={what} value={cls} onChange={e => setCls(e.target.value)}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
      <p className="exp-hint">{recipe?.level === 'Operation'
        ? `${unit ? `Phase classes that are unit phases of ${unit.name}.` : unitClass ? `Phase classes of unit class ${unitClass.name}.` : 'Set the recipe equipment to a unit to list only its unit phases.'} The step is named class:number, for example ${cls || 'AGITATE'}:1.`
        : `Pick a saved ${what.toLowerCase()}. ${simul ? 'The step starts together with the selected step and the transition waits for both.' : 'The step follows the last transition.'}`}</p>
    </div>
    <Buttons disabled={!cls} onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

function StepPropsDialog({ name, i, onClose }: { name: string; i: number; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const step = recipe?.steps[i - 1]
  const child = useExecutive(s => (step ? s.recipes[step.phaseClass] : undefined))
  const [description, setDescription] = useState(step?.description ?? '')
  const [alias, setAlias] = useState(step?.unitAlias ?? '')
  const [acquire, setAcquire] = useState(!!step?.acquireUnit)
  const [retain, setRetain] = useState(!!step?.retainUnit)
  const [key, setKey] = useState(step?.keyParam ?? '')
  const [partners, setPartners] = useState(String(step?.partners ?? 0))
  if (!step || !recipe) return <></>
  const proc = recipe.level === 'Procedure'
  const phase = recipe.level === 'Operation'
  const aliases = Object.keys(recipe.aliases ?? {})
  const save = (): void => {
    useExecutive.getState().editDraft(name, d => {
      const s = d.steps[i - 1]
      s.description = description
      if (proc) { s.unitAlias = alias || undefined; s.acquireUnit = acquire; s.retainUnit = retain; s.keyParam = key || undefined }
      if (phase) s.partners = Math.max(0, Math.min(8, Math.floor(Number(partners) || 0)))
    })
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`${step.name} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Step name:<input aria-label="Step name" disabled value={step.name} /></label>
      <label>{phase ? 'Phase class' : recipe.level === 'Procedure' ? 'Unit procedure' : 'Operation'}:<input aria-label="Step phase class" disabled value={step.phaseClass} /></label>
      <label>Description:<input aria-label="Step description" value={description} onChange={e => setDescription(e.target.value)} /></label>
      {proc && <>
        <label>Unit alias:<select aria-label="Unit alias" value={alias} onChange={e => setAlias(e.target.value)}><option value="">(the unit of the unit procedure)</option>{aliases.map(a => <option key={a} value={a}>#{a}#</option>)}</select></label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Acquire unit prior to starting unit procedure" checked={acquire} onChange={e => setAcquire(e.target.checked)} /> Acquire unit prior to starting unit procedure?</label>
        <label className="lib-dlg-check"><input type="checkbox" aria-label="Retain unit after completing unit procedure" checked={retain} onChange={e => setRetain(e.target.checked)} /> Retain unit after completing unit procedure?</label>
        <label>Key Parameter:<select aria-label="Key Parameter" value={key} onChange={e => setKey(e.target.value)}><option value="" />{Object.keys(child?.params ?? {}).map(p => <option key={p} value={p}>{p}</option>)}</select></label>
        <p className="exp-hint">The key parameter's name and value are shown in the step box of the Batch Operator Interface PFC view. The two unit options are stored; this simulator starts each unit procedure as soon as its unit is bound.</p></>}
      {phase && <><label>Number of phase partners:<input aria-label="Number of phase partners" type="number" min={0} max={8} value={partners} onChange={e => setPartners(e.target.value)} /></label>
        <p className="exp-hint">A phase can only exchange messages (52nn / 55nn) with its partners in a link group when the number of phase partners is defined (slide 11-17).</p></>}
    </div>
    <Buttons onOk={save} onClose={onClose} />
  </SimulatorDialog>
}

function TransitionDialog({ name, i, onClose }: { name: string; i: number; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const t = recipe?.transitions[i]
  const [tn, setTn] = useState(t?.name ?? '')
  const [cond, setCond] = useState(t?.condition ?? 'TRUE')
  const [error, setError] = useState<string | null>(null)
  if (!recipe || !t) return <></>
  const groupSteps = i > 0 ? (stepGroups(recipe)[i - 1] ?? []).map(n => recipe.steps[n - 1]) : []
  const prev = groupSteps[0]
  const dflt = groupTransition(groupSteps, recipe.level)
  const submit = (): void => {
    if (i > 0) { const errs = checkRecipeExpr(cond, recipe.steps); if (errs.length) { setError(errs[0]); return } }
    if (!/^[A-Za-z0-9][A-Za-z0-9_]*$/.test(tn)) { setError('Transition names use letters, digits and underscores'); return }
    if (recipe.transitions.some((x, j) => j !== i && x.name.toUpperCase() === tn.toUpperCase())) { setError(`The name ${tn} is already used by another transition`); return }
    useExecutive.getState().editDraft(name, d => { d.transitions[i] = { name: tn, condition: i === 0 ? 'TRUE' : cond } })
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${t.name} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Transition name:<input aria-label="Transition name" value={tn} onChange={e => setTn(e.target.value.toUpperCase())} /></label>
      <label>Expression:<textarea aria-label="Transition expression" rows={3} disabled={i === 0} value={i === 0 ? 'TRUE' : cond} onChange={e => setCond(e.target.value)} /></label>
      {i > 0 && prev && <button className="tbtn sm" onClick={() => setCond(dflt)}>Default_Transition Conditions</button>}
      <p className="exp-hint">{i === 0 ? 'The first transition after START is TRUE by default and is not configured.' : `Wait for ${groupSteps.map(s => s.name).join(' and ') || 'the step'} to complete: ${dflt}`}</p>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Deferring a batch input parameter to the recipe level (pp 10-77 .. 10-82). */
function DeferDialog({ name, step, param, onClose }: { name: string; step: string; param: string; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const def = recipe ? stepParamDefs(recipe, step).find(p => p.name === param) : undefined
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
      <label>{recipe.level === 'Operation' ? 'Batch input parameter' : 'Recipe parameter'}:<input aria-label="Batch input parameter" disabled value={`${step}/${param}`} /></label>
      <label>Origin:<select aria-label="Origin" value={origin} onChange={e => setOrigin(e.target.value as typeof origin)}><option>Value</option><option>Defer to recipe</option></select></label>
      {origin === 'Defer to recipe' && <label>Recipe parameter name:<input aria-label="Recipe parameter name" value={rname} onChange={e => setRname(e.target.value.toUpperCase())} /></label>}
      <p className="exp-hint">Recipe parameter names do not have to match the batch input parameter name. Deferred parameters can be given values in formulas.</p>
    </div> : <div className="dvd-panel"><p role="alert">The recipe parameter {rname} does not exist in {name}. Create it on the {recipe.level.toLowerCase()}?</p></div>}
    {!ask ? <Buttons onOk={submit} onClose={onClose} /> : <div className="dvd-buttons"><button className="tbtn sm" onClick={apply}>Yes</button><button className="tbtn sm" onClick={() => setAsk(false)}>No</button></div>}
    <Err error={error} />
  </SimulatorDialog>
}

/** Procedure File > Unit Aliases (slides 11-30 .. 11-32): name, unit class and resolution (Defer to the operator or a Fixed unit). */
function AliasesDialog({ name, onClose }: { name: string; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const classes = useBatch(s => s.unitClasses)
  const units = useBatch(s => s.units)
  const [rows, setRows] = useState<UnitAlias[]>(() => Object.values(recipe?.aliases ?? {}).map(a => ({ ...a })))
  const [error, setError] = useState<string | null>(null)
  if (!recipe) return <></>
  const patch = (i: number, p: Partial<UnitAlias>): void => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const submit = (): void => {
    const seen = new Set<string>()
    for (const a of rows) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(a.name)) { setError('Unit alias names start with a letter and use letters, digits and underscores (16 characters at most)'); return }
      if (seen.has(a.name.toUpperCase())) { setError(`The unit alias ${a.name} is defined twice`); return }
      seen.add(a.name.toUpperCase())
      if (!classes[a.unitClass]) { setError(`Choose the unit class of ${a.name}`); return }
      if (a.resolution === 'Fixed' && units[a.unit]?.unitClass !== a.unitClass) { setError(`Choose a ${a.unitClass} unit for the fixed alias ${a.name}`); return }
    }
    const r = useExecutive.getState().editDraft(name, d => {
      d.aliases = Object.fromEntries(rows.map(a => [a.name, { ...a, unit: a.resolution === 'Fixed' ? a.unit : '' }]))
      for (const s of d.steps) if (s.unitAlias && !d.aliases[s.unitAlias]) s.unitAlias = undefined
    })
    if (r.ok) onClose(); else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Unit Aliases" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <table className="dvx-details" aria-label="Unit aliases"><thead><tr><th>Name</th><th>Unit class</th><th>Resolution</th><th>Unit</th><th /></tr></thead><tbody>
        {rows.map((a, i) => <tr key={i} data-alias-row={a.name}>
          <td><input aria-label={`Alias name ${i + 1}`} value={a.name} onChange={e => patch(i, { name: e.target.value.toUpperCase() })} /></td>
          <td><select aria-label={`Alias unit class ${i + 1}`} value={a.unitClass} onChange={e => patch(i, { unitClass: e.target.value, unit: '' })}>{Object.keys(classes).sort().map(c => <option key={c}>{c}</option>)}</select></td>
          <td><select aria-label={`Alias resolution ${i + 1}`} value={a.resolution} onChange={e => patch(i, { resolution: e.target.value as UnitAlias['resolution'] })}><option>Defer</option><option>Fixed</option></select></td>
          <td><select aria-label={`Alias unit ${i + 1}`} disabled={a.resolution !== 'Fixed'} value={a.unit} onChange={e => patch(i, { unit: e.target.value })}><option value="" />{Object.values(units).filter(u => u.unitClass === a.unitClass).map(u => <option key={u.name}>{u.name}</option>)}</select></td>
          <td><button className="tbtn sm" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>Delete</button></td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="dvx-empty">No unit aliases. Add one to run unit procedures on a unit chosen when the batch is created or started.</td></tr>}
      </tbody></table>
      <button className="tbtn sm" onClick={() => setRows(rs => [...rs, { name: '', unitClass: Object.keys(classes).sort()[0] ?? '', resolution: 'Defer', unit: '' }])}>Add</button>
      <p className="exp-hint">Unit procedure steps tied to an alias are all bound to the same unit at once. A # sign before and after the name marks an alias in the Batch Creation dialog.</p>
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Procedure Edit > Link Groups (slides 11-14 .. 11-18): the phases that must be synchronized with each other. */
function LinkGroupsDialog({ name, onClose }: { name: string; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const recipes = useExecutive(s => s.recipes)
  const [groups, setGroups] = useState<Record<string, string[]>>(() => JSON.parse(JSON.stringify(recipe?.linkGroups ?? {})) as Record<string, string[]>)
  const [gname, setGname] = useState('')
  const [pick, setPick] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  if (!recipe) return <></>
  const paths = recipe.steps.flatMap(up => (recipes[up.phaseClass]?.steps ?? []).flatMap(op => (recipes[op.phaseClass]?.steps ?? []).map(ph => `${up.name}/${op.name}/${ph.name}`)))
  const addGroup = (): void => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(gname)) { setError('Link group names start with a letter and use letters, digits and underscores (16 characters at most)'); return }
    if (groups[gname]) { setError(`The link group ${gname} already exists`); return }
    setGroups({ ...groups, [gname]: [] }); setGname(''); setError(null)
  }
  const submit = (): void => {
    const r = useExecutive.getState().editDraft(name, d => { d.linkGroups = groups })
    if (r.ok) onClose(); else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-action-dialog" label="Link Groups" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel rs-linkgroups">
      <div className="rs-linkadd"><label>Link group name:<input aria-label="Link group name" value={gname} onChange={e => setGname(e.target.value.toUpperCase())} /></label>
        <button className="tbtn sm" onClick={addGroup}>Add</button></div>
      {Object.entries(groups).map(([g, members]) => <fieldset key={g} className="lib-dlg-props" data-link-group={g}><legend>{g}</legend>
        <ul aria-label={`${g} phases`}>{members.map((m, i) => <li key={m}>{i + 1}) {m} <button className="tbtn sm" onClick={() => setGroups({ ...groups, [g]: members.filter(x => x !== m) })}>Remove</button></li>)}</ul>
        <label>Phase:<select aria-label={`Phase for ${g}`} value={pick[g] ?? ''} onChange={e => setPick({ ...pick, [g]: e.target.value })}><option value="" />{paths.filter(p => !members.includes(p)).map(p => <option key={p} value={p}>{p}</option>)}</select></label>
        <button className="tbtn sm" disabled={!pick[g]} onClick={() => { setGroups({ ...groups, [g]: [...members, pick[g]] }); setPick({ ...pick, [g]: '' }) }}>Add Phase</button>
        <button className="tbtn sm" onClick={() => { const next = { ...groups }; delete next[g]; setGroups(next) }}>Delete Group</button></fieldset>)}
      {!Object.keys(groups).length && <p className="exp-hint">No link groups. Phases that must communicate (52nn / 55nn messages) must be in the same link group, and each phase needs a phase partner defined.</p>}
    </div>
    <Buttons onOk={submit} onClose={onClose} /><Err error={error} />
  </SimulatorDialog>
}

/** Operation > Add Branch Transition (slide 12-18): an alternate transition after a step that loops back to an earlier step. */
function BranchesDialog({ name, onClose }: { name: string; onClose: () => void }): JSX.Element {
  const recipe = useExecutive(s => s.drafts[name] ?? s.recipes[name])
  const [from, setFrom] = useState(recipe?.steps[0]?.name ?? '')
  const [to, setTo] = useState(recipe?.steps[0]?.name ?? '')
  const [bn, setBn] = useState('')
  const [cond, setCond] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!recipe) return <></>
  const branches = recipe.branches ?? []
  const add = (): void => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_]*$/.test(bn)) { setError('Transition names use letters, digits and underscores'); return }
    if (recipe.transitions.some(t => t.name.toUpperCase() === bn.toUpperCase()) || branches.some(b => b.name.toUpperCase() === bn.toUpperCase())) { setError(`The name ${bn} is already used by another transition`); return }
    const fi = recipe.steps.findIndex(s => s.name === from), ti = recipe.steps.findIndex(s => s.name === to)
    if (fi < 0 || ti < 0) { setError('Choose the step the branch leaves and the step it connects to'); return }
    if (ti > fi) { setError('A branch can only loop back to the same step or an earlier one'); return }
    const errs = checkRecipeExpr(cond, recipe.steps)
    if (errs.length) { setError(errs[0]); return }
    const r = useExecutive.getState().editDraft(name, d => { d.branches = [...(d.branches ?? []), { name: bn, from, to, condition: cond }] })
    if (r.ok) { setBn(''); setCond(''); setError(null) } else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-action-dialog" label="Branch Transitions" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <ul aria-label="Branch transitions">{branches.map(b => <li key={b.name} data-branch={b.name}>{b.name}: after {b.from} &rarr; {b.to} when {b.condition}{' '}
        <button className="tbtn sm" onClick={() => useExecutive.getState().editDraft(name, d => { d.branches = (d.branches ?? []).filter(x => x.name !== b.name) })}>Remove</button></li>)}</ul>
      {!branches.length && <p className="exp-hint">No branch transitions. The trunk transition after a step is the one on the diagram; a branch is checked first and sends the recipe back to run an earlier step again.</p>}
      <label>Branch after step:<select aria-label="Branch from step" value={from} onChange={e => setFrom(e.target.value)}>{recipe.steps.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
      <label>Connect to step:<select aria-label="Branch connect to" value={to} onChange={e => setTo(e.target.value)}>{recipe.steps.map(s => <option key={s.name}>{s.name}</option>)}</select></label>
      <label>Transition name:<input aria-label="Branch transition name" value={bn} onChange={e => setBn(e.target.value.toUpperCase())} /></label>
      <label>Expression:<textarea aria-label="Branch expression" rows={3} value={cond} onChange={e => setCond(e.target.value)} /></label>
      <button className="tbtn sm" onClick={add}>Add Branch</button>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={onClose}>Close</button></div><Err error={error} />
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
  const stepParams = step ? stepParamDefs(r, step.name) : []
  const groups = stepGroups(r)
  const origin = (stepName: string, p: string): RecipeParam | undefined => Object.values(r.params).find(x => x.step === stepName && x.phaseParam === p)
  const props = (): void => { if (sel?.kind === 'step') setDlg({ t: 'stepProps', i: sel.i }); else if (sel?.kind === 'trans') setDlg({ t: 'trans', i: sel.i }) }
  const del = (): void => {
    if (sel?.kind !== 'step') { window.alert('Select a step to delete.'); return }
    const stepName = r.steps[sel.i - 1].name
    useExecutive.getState().editDraft(name, d => {
      const gi = stepGroups(d).findIndex(g => g.includes(sel.i))
      const alone = (stepGroups(d)[gi] ?? []).length === 1
      d.steps.splice(sel.i - 1, 1)
      if (alone) d.transitions.splice(gi + 1, 1)
      else d.transitions[gi + 1].condition = d.transitions[gi + 1].condition.split(' AND ').filter(t => !t.startsWith(`${stepName}/`)).join(' AND ') || 'TRUE'
      for (const [k, p] of Object.entries(d.params)) if (p.step === stepName) delete d.params[k]
      if (d.branches) d.branches = d.branches.filter(b => b.from !== stepName && b.to !== stepName)
    })
    setSel(null)
  }
  const proc = r.level !== 'Operation'
  return <div className="display recipe-studio" tabIndex={0} data-display="RecipeStudio" onKeyDown={e => { if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save() } }}>
    <div className="rs-title">[Recipes/{r.level === 'Operation' ? 'Operations' : r.level === 'Unit Procedure' ? 'Unit Procedures' : 'Procedures'}/{r.name}] - Recipe Studio{dirty ? ' *' : ''}</div>
    <div className="rs-toolbar" role="toolbar" aria-label="Recipe Studio toolbar">
      <button className="tbtn sm" onClick={save} disabled={!dirty}>Save</button>
      <button className="tbtn sm" onClick={() => setDlg({ t: 'step' })}>Add Step</button>
      {proc && <button className="tbtn sm" onClick={() => (sel?.kind === 'step' ? setDlg({ t: 'step', simul: true }) : window.alert('Select the step the new step starts together with.'))}>Add Simultaneous Step</button>}
      <button className="tbtn sm" onClick={del}>Delete Step</button>
      <button className="tbtn sm" onClick={props}>Step Properties...</button>
      <button className="tbtn sm" onClick={() => useExecUi.getState().openDialog({ t: 'recipeProps', name })}>Recipe Properties...</button>
      {r.level !== 'Procedure' && <button className="tbtn sm" onClick={() => useExecUi.getState().openDialog({ t: 'recipeProps', name, tab: 'Equipment' })}>Equipment...</button>}
      {r.level === 'Operation' && <button className="tbtn sm" onClick={() => setDlg({ t: 'branches' })}>Add Branch Transition...</button>}
      {r.level === 'Procedure' && <button className="tbtn sm" onClick={() => setDlg({ t: 'aliases' })}>Unit Aliases...</button>}
      {r.level === 'Procedure' && <button className="tbtn sm" onClick={() => setDlg({ t: 'links' })}>Link Groups...</button>}
      <button className="tbtn sm" onClick={() => setDlg({ t: 'formula', name: null })}>New Formula...</button>
      <button className="tbtn sm" onClick={leave}>Close</button>
    </div>
    <div className="rs-body">
      <div className="rs-diagram" role="group" aria-label="Procedure function chart">
        <div className="rs-start" data-rstart="">START</div>
        {[0, ...groups.map((_, gi) => gi + 1)].map(i => <div key={i} className="rs-chain">
          <div className={`rs-trans${sel?.kind === 'trans' && sel.i === i ? ' on' : ''}`} data-rtrans={i} onClick={() => setSel({ kind: 'trans', i })} onDoubleClick={() => setDlg({ t: 'trans', i })}>
            <span className="rs-bar" /><span className="rs-tname">{r.transitions[i]?.name}</span><span className="rs-texpr">{i === 0 ? '' : r.transitions[i]?.condition}</span></div>
          {i < groups.length && <div className="rs-group" data-rgroup={i + 1} style={groups[i].length > 1 ? { display: 'flex', gap: 8 } : undefined}>
            {groups[i].map(n => <div key={n} className={`rs-step${sel?.kind === 'step' && sel.i === n ? ' on' : ''}`} data-rstep={r.steps[n - 1].name}
              onClick={() => setSel({ kind: 'step', i: n })} onDoubleClick={() => setDlg({ t: 'stepProps', i: n })}>{r.steps[n - 1].name}
              {r.steps[n - 1].unitAlias && <small> #{r.steps[n - 1].unitAlias}#</small>}</div>)}</div>}
          {i < groups.length && (r.branches ?? []).filter(b => groups[i].some(n => r.steps[n - 1].name === b.from)).map(b => <div key={b.name} className="rs-trans rs-branch" data-rbranch={b.name}>
            <span className="rs-bar" /><span className="rs-tname">&#8635; {b.name}</span><span className="rs-texpr">{b.condition} &rarr; {b.to}</span></div>)}
        </div>)}
      </div>
      <div className="rs-side">
        <div className="rs-pane-head">Parameter{step ? ` — ${step.name}` : ''}</div>
        <table className="dvx-details rs-params" aria-label="Step parameters"><thead><tr><th>Parameter</th><th>Value</th><th>Origin</th></tr></thead><tbody>
          {stepParams.map(p => { const o = step ? origin(step.name, p.name) : undefined; return <tr key={p.name} data-rparam={p.name} onDoubleClick={() => step && setDlg({ t: 'defer', step: step.name, param: p.name })}>
            <td>{p.name}</td><td>{String(p.defaultValue)} {p.units}</td><td>{o ? `Recipe: ${o.name}` : (r.level === 'Operation' ? 'Phase' : r.level === 'Unit Procedure' ? 'Operation' : 'Unit procedure')}</td></tr> })}
          {!step && <tr><td colSpan={3} className="dvx-empty">Select a step to see its {r.level === 'Operation' ? 'batch input' : 'recipe'} parameters. Double-click one to defer it to the recipe.</td></tr>}
        </tbody></table>
        <div className="rs-pane-head">Formula</div>
        <table className="dvx-details rs-formulas" aria-label="Formulas"><thead><tr><th>Recipe parameter</th>{Object.keys(r.formulas).map(f => <th key={f} data-rformula={f} onDoubleClick={() => setDlg({ t: 'formula', name: f })}>{f}{r.formulas[f].operatorCanLoad ? '' : ' (hidden)'}</th>)}</tr></thead><tbody>
          {Object.values(r.params).map(p => <tr key={p.name}><td>{p.name} (default {String(p.defaultValue)})</td>{Object.keys(r.formulas).map(f => { const v = r.formulas[f].values[p.name]; return <td key={f}>{v ? (v.useDefault ? `${v.value} (default)` : String(v.value)) : ''}</td> })}</tr>)}
          {!Object.keys(r.params).length && <tr><td className="dvx-empty">No recipe parameters. Defer a parameter of a step first.</td></tr>}
        </tbody></table>
      </div>
    </div>
    <div className="rs-status"><span>For Help, press F1</span>{r.level !== 'Procedure' && <button className="tbtn sm" aria-label="Recipe equipment" onClick={() => useExecUi.getState().openDialog({ t: 'recipeProps', name, tab: 'Equipment' })}>Equipment: {r.equipment.name || '<unassigned>'}</button>}<span>{r.steps.length} step(s)</span></div>
    {dlg?.t === 'step' && <StepDialog name={name} simul={dlg.simul} sel={sel?.kind === 'step' ? sel.i : null} onClose={close} />}
    {dlg?.t === 'stepProps' && <StepPropsDialog name={name} i={dlg.i} onClose={close} />}
    {dlg?.t === 'trans' && <TransitionDialog name={name} i={dlg.i} onClose={close} />}
    {dlg?.t === 'defer' && <DeferDialog name={name} step={dlg.step} param={dlg.param} onClose={close} />}
    {dlg?.t === 'formula' && <FormulaDialog name={name} formula={dlg.name} onClose={close} />}
    {dlg?.t === 'aliases' && <AliasesDialog name={name} onClose={close} />}
    {dlg?.t === 'links' && <LinkGroupsDialog name={name} onClose={close} />}
    {dlg?.t === 'branches' && <BranchesDialog name={name} onClose={close} />}
  </div>
}
