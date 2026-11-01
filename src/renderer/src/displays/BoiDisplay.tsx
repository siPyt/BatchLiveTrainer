import { useEffect, useState } from 'react'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { alertResult } from '../components/LibraryExplorer'
import { useBatch } from '../engine/batchStore'
import { useStore } from '../engine/store'
import { STATE_LABEL, type PhaseCommand } from '../engine/batchConfig'
import { useExecutive, CONFIRM_ACTIONS, NOT_SIMULATED_ACTIONS, stepGroups, type Batch, type ConfirmAction, type Prompt, type Recipe } from '../engine/executive'
import { useExecUi, guarded, type BoiScreen } from '../ui/executiveUi'

const isProc = (b: Batch): boolean => !!b.level && b.level !== 'Operation'

/** Whether this client offers an action (Batch Executive Client Configuration plus, if allowed, the local Config Tool). */
function useActionOn(): (a: ConfirmAction) => boolean {
  const server = useExecutive(s => s.clientEnabled)
  const allowLocal = useExecutive(s => s.clientAllowLocal)
  const local = useExecutive(s => s.localEnabled)
  return a => server[a] && (!allowLocal || local[a])
}

const fmt = (t: number | null): string => (t === null ? '' : new Date(t).toLocaleTimeString('en-US'))
const elapsed = (b: Batch, now: number): string => {
  if (b.started === null) return ''
  const s = Math.max(0, Math.round(((b.ended ?? now) - b.started) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)

function AddBatchDialog({ operate, onClose }: { operate: boolean; onClose: () => void }): JSX.Element {
  const downloaded = useExecutive(s => s.downloaded)
  const assigned = useExecutive(s => s.assigned)
  const units = useBatch(s => s.units)
  const names = Object.keys(downloaded).filter(n => assigned[n] !== 'System').sort()
  const [recipe, setRecipe] = useState(names[0] ?? '')
  const [id, setId] = useState('')
  const [formula, setFormula] = useState('')
  const [bind, setBind] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const formulas = Object.values(downloaded[recipe]?.recipe.formulas ?? {}).filter(f => f.operatorCanLoad)
  const needs = recipe ? useExecutive.getState().bindingsNeeded(recipe) : []
  const pickRecipe = (n: string): void => { setRecipe(n); setFormula(''); setBind({}) }
  const submit = (): void => {
    guarded('Add Batch', `${recipe} ${id.trim()}`, () => {
      const r = useExecutive.getState().addBatch(recipe, id, formula || null, bind)
      if (r.ok) { useExecUi.getState().selectBatch(r.value); onClose() } else setError(r.error)
    }, { batchId: id.trim() })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Recipe List" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Create user: ADMINISTRATOR</p>
      {operate ? <label>Recipe:<select aria-label="Recipe" value={recipe} onChange={e => pickRecipe(e.target.value)}>
        {names.map(n => <option key={n} value={n}>{n}</option>)}</select></label> :
        <table className="dvx-details" aria-label="Recipe list"><thead><tr><th>Identifier</th><th>Procedure Description</th></tr></thead><tbody>
          {names.map(n => <tr key={n} className={n === recipe ? 'sel' : ''} data-recipe-choice={n} onClick={() => pickRecipe(n)}><td>{n}</td><td>{downloaded[n].recipe.description}</td></tr>)}
          {!names.length && <tr><td colSpan={2} className="dvx-empty">No recipes are downloaded to the Batch Executive.</td></tr>}</tbody></table>}
      <label>Batch ID:<input aria-label="Batch ID" autoFocus value={id} onChange={e => setId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
      <label>Load Formula:<select aria-label="Load Formula" value={formula} onChange={e => setFormula(e.target.value)}><option value="">(none: recipe defaults)</option>
        {formulas.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}</select></label>
      {!!needs.length && <fieldset className="lib-dlg-props" aria-label="Unit Binding"><legend>Unit Binding</legend>
        <table className="dvx-details" aria-label="Unit binding"><thead><tr><th>Binding</th><th>Unit class</th><th>Unit</th></tr></thead><tbody>
          {needs.map(n => <tr key={n.key} data-binding={n.key}><td>{n.label}</td><td>{n.unitClass}</td><td>{n.fixed ? n.fixed :
            <select aria-label={`Bind ${n.label}`} value={bind[n.key] ?? ''} onChange={e => setBind({ ...bind, [n.key]: e.target.value })}>
              <option value="">{'{Defer}'}</option>{Object.values(units).filter(u => u.unitClass === n.unitClass).map(u => <option key={u.name} value={u.name}>{u.name}</option>)}</select>}</td></tr>)}</tbody></table>
        <p className="exp-hint">A # sign before and after the name marks a unit alias. Choose {'{Defer}'} to bind the unit when the Batch Executive prompts for it.</p></fieldset>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={!recipe} onClick={submit}>Create</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    <Err error={error} />
  </SimulatorDialog>
}

function BatchTable({ onDouble }: { onDouble?: (id: string) => void }): JSX.Element {
  const all = useExecutive(s => s.batches)
  const batches = all.filter(x => !x.parent)
  const downloaded = useExecutive(s => s.downloaded)
  const sel = useExecUi(s => s.selectedBatch)
  const now = useStore(s => s.time)
  const b = useBatch.getState()
  return <table className="dvx-details boi-table" role="grid" aria-label="Batch list"><thead><tr>{['Batch ID', 'Recipe', 'Description', 'Start Time', 'Elapsed Time', 'State', 'Mode', 'Area', 'Process Cell', 'Unit'].map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{batches.map(x => { const r = downloaded[x.recipe]?.recipe; const unit = x.unit ?? (r?.equipment.mode === 'Unit' ? r.equipment.name : ''); const cell = b.units[unit]?.processCell ?? ''
      const units = isProc(x) ? [...new Set(all.filter(k => k.parent && k.unit && (k.id === `${x.id}/${k.step}` || k.id.startsWith(`${x.id}/`))).map(k => k.unit))].join(', ') : unit
      return <tr key={x.id} className={sel === x.id ? 'sel' : ''} data-batch-id={x.id} data-batch-state={x.state} onClick={() => useExecUi.getState().selectBatch(x.id)} onDoubleClick={() => onDouble?.(x.id)}>
        <td>{x.id}</td><td>{x.recipe}</td><td>{r?.description ?? ''}</td><td>{fmt(x.started)}</td><td>{elapsed(x, now)}</td><td>{x.state}{x.failure ? ' (failure)' : ''}</td><td>Automatic</td><td>{b.processCells[cell]?.area ?? (isProc(x) ? 'ED_CENTER_BATCH' : '')}</td><td>{cell}</td><td>{units}</td></tr> })}
      {!batches.length && <tr><td colSpan={10} className="dvx-empty">No batches. Use Add Batch.</td></tr>}</tbody></table>
}

function BatchCommands({ operate }: { operate: boolean }): JSX.Element {
  const sel = useExecUi(s => s.selectedBatch)
  const [adding, setAdding] = useState(false)
  const on = useActionOn()
  const run = (action: ConfirmAction, cmd: 'START' | 'HOLD' | 'RESTART' | 'STOP' | 'ABORT' | 'CLEAR_FAILURES'): void => {
    if (!sel) { window.alert('Select a batch first.'); return }
    guarded(action, `batch ${sel}`, () => { alertResult(useExecutive.getState().batchCommand(sel, cmd)) }, { batchId: sel })
  }
  const btn = (action: ConfirmAction, label: string, onClick: () => void): JSX.Element => <button className="tbtn sm" disabled={!on(action)} title={on(action) ? undefined : `${action} is disabled in Client Configuration`} onClick={onClick}>{label}</button>
  return <div className="boi-commands" role="toolbar" aria-label="Batch control toolbar">
    {btn('Add Batch', 'Add Batch', () => setAdding(true))}
    {btn('Remove Batch', 'Remove Batch', () => { if (sel) guarded('Remove Batch', `batch ${sel}`, () => { alertResult(useExecutive.getState().removeBatch(sel)) }, { batchId: sel }); else window.alert('Select a batch first.') })}
    {btn('Start', 'Start', () => run('Start', 'START'))}
    {btn('Hold', 'Hold', () => run('Hold', 'HOLD'))}
    {btn('Restart', 'Restart', () => run('Restart', 'RESTART'))}
    {btn('Stop', 'Stop', () => run('Stop', 'STOP'))}
    {btn('Abort', 'Abort', () => run('Abort', 'ABORT'))}
    {btn('Clear Failures', operate ? 'Clear All Failures' : 'Clear Failures', () => run('Clear Failures', 'CLEAR_FAILURES'))}
    {adding && <AddBatchDialog operate={operate} onClose={() => setAdding(false)} />}
  </div>
}

function CommentBox({ batch }: { batch: string | null }): JSX.Element {
  const [text, setText] = useState('')
  const on = useActionOn()
  return <div className="boi-comment"><label>Comment:<textarea aria-label="Comment" rows={4} value={text} onChange={e => setText(e.target.value)} /></label>
    <button className="tbtn sm" disabled={!on('User Comments')} onClick={() => { if (!batch) { window.alert('Select a batch first.'); return } guarded('User Comments', `batch ${batch}`, () => { if (alertResult(useExecutive.getState().addComment(batch, text))) setText('') }, { batchId: batch, asked: true }) }}>Submit</button></div>
}

function ProcPfc({ b, depth = 0 }: { b: Batch; depth?: number }): JSX.Element {
  const batches = useExecutive(s => s.batches)
  const downloaded = useExecutive(s => s.downloaded)
  const active = useBatch(s => s.active)
  const r = downloaded[b.recipe]?.recipe
  if (!r) return <></>
  const groups = stepGroups(r)
  const kidState = (k?: Batch): string => (!k ? 'pending' : k.state === 'COMPLETE' ? 'done' : k.failure ? 'failed' : k.state === 'RUNNING' ? 'active' : k.state === 'HELD' ? 'waiting' : 'pending')
  const detail = (k: Batch | undefined, kr: Recipe | undefined): string => {
    if (!k) return b.state === 'RUNNING' && b.pos > 0 ? 'Waiting for unit' : ''
    if (isProc(k)) return `${k.state}${k.unit ? ` · ${k.unit}` : ''}`
    const phase = kr && k.pos >= 1 && k.pos <= kr.steps.length ? kr.steps[k.pos - 1] : undefined
    const live = phase ? active[`${k.unit ?? kr?.equipment.name}/${phase.phaseClass}`] : undefined
    return k.state === 'COMPLETE' ? 'Complete' : `${k.unit ?? ''}${phase ? ` · ${phase.name}${k.waiting ? ` (waiting to acquire ${k.waiting})` : live ? ` ${STATE_LABEL[live.rt.state]}` : ''}` : ''}`
  }
  return <div className={`rs-diagram boi-diagram${depth ? ' boi-nested' : ''}`} data-pfc-proc={b.id} style={depth ? { marginLeft: 12 } : undefined}>
    {depth === 0 && <div className="rs-start">START</div>}
    {[0, ...groups.map((_, i) => i + 1)].map(i => <div key={i} className="rs-chain">
      <div className={`rs-trans${b.pos === i && i === 0 ? ' on' : ''}`}><span className="rs-bar" /><span className="rs-tname">{r.transitions[i]?.name}</span></div>
      {i < groups.length && <div className="rs-group" data-rgroup={i + 1} style={groups[i].length > 1 ? { display: 'flex', gap: 8 } : undefined}>
        {groups[i].map(n => { const st = r.steps[n - 1]; const kid = batches.find(x => x.parent === b.id && x.step === st.name); const kr = kid ? downloaded[kid.recipe]?.recipe : downloaded[st.phaseClass]?.recipe
          const key = st.keyParam && kid ? ` ${st.keyParam} = ${String(kid.params[st.keyParam] ?? '')}` : ''
          return <div key={n} className={`rs-step pfc-${kidState(kid)}`} data-pfc-step={st.name} data-pfc-state={kid?.state ?? 'PENDING'}>{st.name}{st.unitAlias ? <small> #{st.unitAlias}#</small> : null}
            <small>{detail(kid, kr)}{key}</small>
            {kid && isProc(kid) && <ProcPfc b={kid} depth={depth + 1} />}</div> })}</div>}
    </div>)}
  </div>
}

function PfcScreen(): JSX.Element {
  const sel = useExecUi(s => s.selectedBatch)
  const all = useExecutive(s => s.batches)
  const batches = all.filter(x => !x.parent)
  const downloaded = useExecutive(s => s.downloaded)
  const active = useBatch(s => s.active)
  const [tab, setTab] = useState<'PFC' | 'Comment'>('PFC')
  const b = batches.find(x => x.id === sel) ?? batches[0]
  const r = b ? downloaded[b.recipe]?.recipe : undefined
  if (!b || !r) return <div className="boi-empty">Select a batch on the Batch List screen.</div>
  const state = (i: number): string => {
    if (b.pos > i) return 'done'
    if (b.pos === i) return b.stage === 'acquire' ? (b.waiting ? 'waiting' : 'starting') : (b.failure ? 'failed' : 'active')
    return 'pending'
  }
  const unit = b.unit ?? r.equipment.name
  return <div className="boi-pfc" data-pfc-batch={b.id}>
    <div className="boi-tabs" role="tablist"><button role="tab" aria-selected={tab === 'PFC'} className={tab === 'PFC' ? 'on' : ''} onClick={() => setTab('PFC')}>PFC</button>
      <button role="tab" aria-selected={tab === 'Comment'} className={tab === 'Comment' ? 'on' : ''} onClick={() => setTab('Comment')}>Comment</button></div>
    {tab === 'Comment' ? <CommentBox batch={b.id} /> : isProc(b) ? <div><ProcPfc b={b} /><p className="boi-batch-status" role="status">Batch {b.id}: {b.state}{b.failure ? ` — ${b.failure}` : ''}</p></div> : <div className="rs-diagram boi-diagram">
      <div className="rs-start">START</div>
      {[0, ...r.steps.map((_, i) => i + 1)].map(i => <div key={i} className="rs-chain">
        <div className={`rs-trans${b.pos === i && i === 0 ? ' on' : ''}`}><span className="rs-bar" /><span className="rs-tname">{r.transitions[i]?.name}</span></div>
        {i < r.steps.length && <div className={`rs-step pfc-${state(i + 1)}`} data-pfc-step={r.steps[i].name}>{r.steps[i].name}
          <small>{b.pos === i + 1 ? (b.waiting ? `Waiting to acquire ${b.waiting}` : active[`${unit}/${r.steps[i].phaseClass}`] ? STATE_LABEL[active[`${unit}/${r.steps[i].phaseClass}`].rt.state] : '') : b.pos > i + 1 ? 'Complete' : ''}</small></div>}
      </div>)}
      <p className="boi-batch-status" role="status">Batch {b.id}: {b.state}{b.failure ? ` — ${b.failure}` : ''}</p>
    </div>}
  </div>
}

function JournalScreen(): JSX.Element {
  const journal = useExecutive(s => s.journal)
  const batches = useExecutive(s => s.batches).filter(b => !b.parent)
  const [filter, setFilter] = useState('')
  const rows = journal.filter(j => !filter || j.batch === filter)
  return <div className="boi-journal"><label>Batch:<select aria-label="Journal batch" value={filter} onChange={e => setFilter(e.target.value)}><option value="">(all)</option>{batches.map(b => <option key={b.id} value={b.id}>{b.id}</option>)}</select></label>
    <table className="dvx-details" aria-label="Batch event journal"><thead><tr><th>Time</th><th>Batch ID</th><th>Unit/Phase</th><th>Type</th><th>Event</th><th>User</th></tr></thead>
      <tbody>{[...rows].reverse().map((j, i) => <tr key={i}><td>{fmt(j.at)}</td><td>{j.batch}</td><td>{j.key}</td><td>{j.kind}</td><td>{j.text}</td><td>{j.user}</td></tr>)}</tbody></table></div>
}

function PromptDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }): JSX.Element {
  const [value, setValue] = useState(prompt.choices?.[0] ?? '')
  const answer = (v: string): void => guarded('Prompts', `"${prompt.text}"`, () => { if (alertResult(useExecutive.getState().answerPrompt(prompt.id, v))) onClose() }, { batchId: prompt.batch, asked: true })
  return <SimulatorDialog className="module-download-dialog dvd" label="Operator Prompt" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel"><p role="status">{prompt.text}</p><p className="exp-hint">{prompt.key}{prompt.batch ? ` · batch ${prompt.batch}` : ''}</p>
      {prompt.kind === 'Bind' && <label>Unit:<select aria-label="Bind unit" value={value} onChange={e => setValue(e.target.value)}>{(prompt.choices ?? []).map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
      {prompt.kind !== 'Boolean' && prompt.kind !== 'Bind' && <label>Response:<input aria-label="Prompt response" autoFocus value={value} onChange={e => setValue(e.target.value)} /></label>}</div>
    {prompt.kind === 'Boolean' ? <div className="dvd-buttons"><button className="tbtn sm" onClick={() => answer('Yes')}>Yes</button><button className="tbtn sm" onClick={() => answer('No')}>No</button></div> :
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => answer(value)}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>}
  </SimulatorDialog>
}

function PromptsScreen(): JSX.Element {
  const prompts = useExecutive(s => s.prompts)
  const [open, setOpen] = useState<Prompt | null>(null)
  return <div className="boi-prompts"><table className="dvx-details" aria-label="Unacknowledged prompts"><thead><tr><th>Time</th><th>Batch ID</th><th>Unit/Phase</th><th>Prompt</th><th>Response</th></tr></thead>
    <tbody>{[...prompts].reverse().map(p => <tr key={p.id} data-prompt-id={p.id} data-prompt-answered={p.answered} onDoubleClick={() => !p.answered && setOpen(p)}>
      <td>{fmt(p.at)}</td><td>{p.batch}</td><td>{p.key}</td><td>{p.text}</td><td>{p.answered ? p.response : <button className="tbtn sm" onClick={() => setOpen(p)}>Respond...</button>}</td></tr>)}
      {!prompts.length && <tr><td colSpan={5} className="dvx-empty">No prompts.</td></tr>}</tbody></table>
    {open && <PromptDialog prompt={open} onClose={() => setOpen(null)} />}</div>
}

function PhaseControlScreen(): JSX.Element {
  const units = useBatch(s => s.units)
  const active = useBatch(s => s.active)
  const owners = useExecutive(s => s.owners)
  const manual = useExecutive(s => s.manualBatch)
  const areas = useExecutive(s => s.assignedAreas)
  const processCells = useBatch(s => s.processCells)
  const { showUnits, unit, phase } = useExecUi(s => s.phaseCtl)
  const setShowUnits = (f: (v: boolean) => boolean): void => useExecUi.getState().setPhaseCtl({ showUnits: f(useExecUi.getState().phaseCtl.showUnits) })
  const setUnit = (x: string): void => useExecUi.getState().setPhaseCtl({ unit: x })
  const setPhase = (x: string): void => useExecUi.getState().setPhaseCtl({ phase: x })
  const [ask, setAsk] = useState<'acquire' | 'start' | null>(null)
  const [batchId, setBatchId] = useState('')
  const list = Object.values(units).filter(u => areas.includes(processCells[u.processCell]?.area ?? '')).sort((a, b) => a.name.localeCompare(b.name))
  const u = units[unit]
  const key = unit && phase ? `${unit}/${phase}` : ''
  const a = key ? active[key] : undefined
  const exec = useExecutive.getState
  const on = useActionOn()
  const phaseAction: Record<PhaseCommand, ConfirmAction> = { START: 'Start', HOLD: 'Hold', RESTART: 'Restart', STOP: 'Stop', ABORT: 'Abort', RESET: 'Reset', CLEAR_FAILURES: 'Clear Failures' }
  const cmd = (c: PhaseCommand): void => { if (key) guarded(phaseAction[c], key, () => { alertResult(exec().manualCommand(unit, phase, c)) }, { batchId: manual[key] ?? '' }); else window.alert('Select a unit phase first.') }
  const btn = (action: ConfirmAction, label: string, onClick: () => void): JSX.Element => <button className="tbtn sm" disabled={!on(action)} title={on(action) ? undefined : `${action} is disabled in Client Configuration`} onClick={onClick}>{label}</button>
  return <div className="boi-phases">
    <div className="boi-phase-units"><button className="tbtn sm" onClick={() => setShowUnits(v => !v)}>Display Units</button>
      {showUnits && <ul aria-label="Unit modules">{list.map(x => <li key={x.name}><button className={`tbtn sm${x.name === unit ? ' on' : ''}`} data-unit={x.name} onClick={() => { setUnit(x.name); setPhase('') }}>{x.name}</button></li>)}</ul>}</div>
    <div className="boi-phase-main">
      <table className="dvx-details" aria-label="Phases"><thead><tr><th>Phase</th><th>State</th><th>Owner</th><th>Acquired by</th><th>Batch ID</th></tr></thead>
        <tbody>{u && Object.values(u.phases).filter(p => p.phaseType === 'Controller').map(p => { const k = `${unit}/${p.name}`; const act = active[k]
          return <tr key={p.name} className={p.name === phase ? 'sel' : ''} data-phase={p.name} data-phase-state={act ? STATE_LABEL[act.rt.state] : 'Not loaded'} onClick={() => setPhase(p.name)}>
            <td>{p.name}</td><td>{act ? STATE_LABEL[act.rt.state] : ''}</td><td>{act ? (act.owner === 'BATCH' ? 'DVB' : 'External') : ''}</td><td>{owners[k] ?? ''}</td><td>{manual[k] && owners[k] === 'OPERATOR' ? manual[k] : ''}</td></tr> })}
          {!u && <tr><td colSpan={5} className="dvx-empty">Select a unit module (Display Units).</td></tr>}</tbody></table>
      <div className="boi-commands" role="toolbar" aria-label="Phase control toolbar">
        {btn('Acquire', 'Acquire', () => (key ? setAsk('acquire') : window.alert('Select a unit phase first.')))}
        {btn('Release', 'Release', () => { if (!key) { window.alert('Select a unit phase first.'); return } guarded('Release', key, () => { alertResult(exec().releasePhase(unit, phase)) }) })}
        {btn('Start', 'Start Phase', () => (key ? setAsk('start') : window.alert('Select a unit phase first.')))}
        {(['HOLD', 'RESTART', 'STOP', 'ABORT', 'RESET', 'CLEAR_FAILURES'] as PhaseCommand[]).map(c => <span key={c}>{btn(phaseAction[c], c === 'CLEAR_FAILURES' ? 'Clear Failures' : c.charAt(0) + c.slice(1).toLowerCase(), () => cmd(c))}</span>)}
      </div>
      {a && <table className="dvx-details" aria-label="Phase parameters"><thead><tr><th>Parameter</th><th>Value</th></tr></thead>
        <tbody>{Object.entries(a.rt.params).filter(([k]) => !['REQDATA1', 'REQDATA2', 'REQDATA3', 'REQDATA4', 'REQDATA5'].includes(k)).map(([k, v]) => <tr key={k}><td>{k}</td><td>{String(v)}</td></tr>)}</tbody></table>}
    </div>
    {ask === 'acquire' && <SimulatorDialog className="module-download-dialog dvd" label="Request" onClose={() => setAsk(null)}>
      <div className="dvd-panel"><p role="status">Acquire {key} for the OPERATOR?</p></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => guarded('Acquire', key, () => { alertResult(exec().acquirePhase(unit, phase)); setAsk(null) }, { asked: true })}>OK</button><button className="tbtn sm" onClick={() => setAsk(null)}>Cancel</button></div></SimulatorDialog>}
    {ask === 'start' && <SimulatorDialog className="module-download-dialog dvd" label="Start Phase" onClose={() => setAsk(null)}>
      <div className="lib-dlg-fields dvd-panel"><label>Batch ID:<input aria-label="Phase batch ID" autoFocus value={batchId} onChange={e => setBatchId(e.target.value)} /></label>
        <p className="exp-hint">The Batch ID is used for tracking the phase in the Batch Event Journal.</p></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => guarded('Start', key, () => { if (alertResult(exec().manualCommand(unit, phase, 'START', batchId))) setAsk(null) }, { batchId, asked: true })}>OK</button><button className="tbtn sm" onClick={() => setAsk(null)}>Cancel</button></div></SimulatorDialog>}
  </div>
}

function ArbitrationScreen(): JSX.Element {
  const equipment = useExecutive(s => s.equipment)
  const owners = useExecutive(s => s.owners)
  const batches = useExecutive(s => s.batches)
  const downloaded = useExecutive(s => s.downloaded)
  const [sel, setSel] = useState('')
  const keys = Object.keys(equipment).sort((a, b) => a.split('/')[1].localeCompare(b.split('/')[1]) || a.localeCompare(b))
  const needed = (k: string): string => batches.filter(b => b.waiting === k).map(b => downloaded[b.recipe]?.recipe.name ?? b.recipe).join(', ')
  const [unit, phase] = sel.split('/')
  const on = useActionOn()
  return <div className="boi-arb"><table className="dvx-details" aria-label="Arbitration"><thead><tr><th>Unit/Phase</th><th>Owner</th><th>Needed by</th></tr></thead>
    <tbody>{keys.map(k => <tr key={k} className={k === sel ? 'sel' : ''} data-arb-key={k} data-arb-owner={owners[k] ?? ''} onClick={() => setSel(k)}><td>{k}</td><td>{owners[k] ?? ''}</td><td>{needed(k)}</td></tr>)}</tbody></table>
    <div className="boi-commands"><button className="tbtn sm" disabled={!on('Acquire')} onClick={() => (sel ? guarded('Acquire', sel, () => { alertResult(useExecutive.getState().acquirePhase(unit, phase)) }) : window.alert('Select a unit phase first.'))}>Acquire</button>
      <button className="tbtn sm" disabled={!on('Release')} onClick={() => (sel ? guarded('Release', sel, () => { alertResult(useExecutive.getState().releasePhase(unit, phase)) }) : window.alert('Select a unit phase first.'))}>Release</button></div></div>
}

function AlarmsScreen(): JSX.Element {
  const batches = useExecutive(s => s.batches)
  const owners = useExecutive(s => s.owners)
  const active = useBatch(s => s.active)
  const rows = [...batches.filter(b => b.failure && !b.parent).map(b => ({ k: `b${b.id}`, who: `Batch ${b.id}`, text: b.failure ?? '' })),
    ...Object.entries(active).filter(([k, a]) => owners[k] === 'OPERATOR' && a.rt.failIndex !== 0).map(([k, a]) => ({ k, who: k, text: a.rt.message || `Phase failure ${a.rt.failIndex}` }))]
  return <div className="boi-alarms"><table className="dvx-details" aria-label="Batch alarm summary"><thead><tr><th>Source</th><th>Message</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.k} data-alarm-source={r.who}><td>{r.who}</td><td>{r.text}</td></tr>)}{!rows.length && <tr><td colSpan={2} className="dvx-empty">No batch failures.</td></tr>}</tbody></table></div>
}

function ActiveScreen(): JSX.Element {
  const active = useBatch(s => s.active)
  const owners = useExecutive(s => s.owners)
  return <div className="boi-active"><table className="dvx-details" aria-label="Active phase summary"><thead><tr><th>Unit/Phase</th><th>State</th><th>Owner</th><th>Acquired by</th><th>Step</th><th>Request</th></tr></thead>
    <tbody>{Object.entries(active).map(([k, a]) => <tr key={k}><td>{k}</td><td>{STATE_LABEL[a.rt.state]}</td><td>{a.owner === 'BATCH' ? 'DVB' : 'External'}</td><td>{owners[k] ?? ''}</td><td>{String(a.rt.params.STEP_INDEX ?? 0)}</td><td>{String(a.rt.params.REQUEST ?? 0)}</td></tr>)}
      {!Object.keys(active).length && <tr><td colSpan={6} className="dvx-empty">No active phases.</td></tr>}</tbody></table></div>
}

/** Procedure as Table (slide 10-40): the steps of the selected batch's recipe with their state. */
function TableScreen(): JSX.Element {
  const sel = useExecUi(s => s.selectedBatch)
  const all = useExecutive(s => s.batches)
  const batches = all.filter(x => !x.parent)
  const downloaded = useExecutive(s => s.downloaded)
  const active = useBatch(s => s.active)
  const b = batches.find(x => x.id === sel) ?? batches[0]
  const r = b ? downloaded[b.recipe]?.recipe : undefined
  if (!b || !r) return <div className="boi-empty">Select a batch on the Batch List screen.</div>
  if (isProc(b)) {
    const rows = all.filter(k => k.id.startsWith(`${b.id}/`))
    return <div className="boi-table-screen" data-table-batch={b.id}>
      <table className="dvx-details" aria-label="Procedure as table"><thead><tr><th>Step</th><th>Recipe</th><th>Unit</th><th>State</th><th>Failure</th></tr></thead>
        <tbody>{rows.map(k => <tr key={k.id} data-table-step={k.id.slice(b.id.length + 1)}><td>{k.id.slice(b.id.length + 1)}</td><td>{k.recipe}</td><td>{k.unit ?? ''}</td><td>{k.state}{k.waiting ? ` (waiting to acquire ${k.waiting})` : ''}</td><td>{k.failure ?? ''}</td></tr>)}
          {!rows.length && <tr><td colSpan={5} className="dvx-empty">No steps have started yet.</td></tr>}</tbody></table>
      <p className="boi-batch-status" role="status">Batch {b.id} ({b.recipe}): {b.state}{b.failure ? ` — ${b.failure}` : ''}</p></div>
  }
  const unit = b.unit ?? r.equipment.name
  const state = (i: number): string => {
    if (b.pos > i) return 'Complete'
    if (b.pos === i) return b.stage === 'acquire' ? (b.waiting ? `Waiting to acquire ${b.waiting}` : 'Starting') : (b.failure ? 'Failed' : 'Running')
    return b.state === 'IDLE' ? 'Idle' : 'Pending'
  }
  return <div className="boi-table-screen" data-table-batch={b.id}>
    <table className="dvx-details" aria-label="Procedure as table"><thead><tr><th>Step</th><th>Phase Class</th><th>Unit</th><th>State</th><th>Transition</th><th>Phase State</th></tr></thead>
      <tbody>{r.steps.map((s, i) => { const a = active[`${unit}/${s.phaseClass}`]
        return <tr key={s.name} data-table-step={s.name}><td>{s.name}</td><td>{s.phaseClass}</td><td>{unit}</td><td>{state(i + 1)}</td><td>{r.transitions[i + 1]?.name}: {r.transitions[i + 1]?.condition}</td><td>{b.pos === i + 1 && a ? STATE_LABEL[a.rt.state] : ''}</td></tr> })}</tbody></table>
    <p className="boi-batch-status" role="status">Batch {b.id} ({b.recipe}): {b.state}{b.failure ? ` — ${b.failure}` : ''}</p>
  </div>
}

const CONFIG_TABS = ['Operations Table', 'Procedure Prompts', 'Procedure Parameters', 'Procedure Reports', 'Journal', 'Batch List', 'Hierarchical Step List', 'PFC View', 'Procedures Table',
  'Unit Procedures Table', 'Unacknowledged Prompts', 'Phase Control', 'Alarm Summary', 'Active Phase Summary', 'General']

/** System Configuration and Defaults (slides 10-62 .. 10-64): the General tab shows the Batch Executive's action settings and opens the Config Tool. */
function ConfigScreen(): JSX.Element {
  const [tab, setTab] = useState('General')
  const x = useExecutive()
  const on = useActionOn()
  return <div className="boi-config" data-boi-config>
    <div className="dvd-tabs" role="tablist">{CONFIG_TABS.map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab !== 'General' ? <p className="exp-hint">Display options for the {tab} screen (columns, sort order) are not simulated.</p> : <div className="dvd-panel lib-dlg-fields">
      <p>Status Bar Font: Arial, 10, Bold · Screen Size: 100% horizontal, 100% vertical · Splitter Bar Size: 6 / 6</p>
      <label>Executive Name:<select aria-label="Executive Name" value="PROPLUS"><option>PROPLUS &lt; Local &gt;</option></select></label>
      <label>Number of Decimal Places:<select aria-label="Number of Decimal Places" defaultValue="6">{[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="lib-dlg-check"><input type="checkbox" aria-label="Local Configuration Allowed" checked={x.clientAllowLocal} disabled readOnly /> Local Configuration Allowed</label>
      <div className="boi-commands"><button className="tbtn sm" onClick={() => useExecUi.getState().openDialog({ t: 'oiConfig' })}>Config Tool</button><button className="tbtn sm" onClick={() => undefined}>Refresh</button></div>
      <table className="dvx-details" aria-label="Actions"><thead><tr><th>Actions</th><th>Enable</th><th>Prompts</th><th>Confirm</th><th>Verify</th></tr></thead>
        <tbody>{CONFIRM_ACTIONS.map(a => <tr key={a} data-config-action={a} data-enabled={on(a)} title={NOT_SIMULATED_ACTIONS.includes(a) ? `${a} is not simulated` : undefined}><td>{a}</td>
          <td><input type="checkbox" disabled checked={on(a)} readOnly aria-label={`${a} enabled`} /></td>
          <td><input type="checkbox" disabled checked={x.actionConfirm[a].prompt} readOnly aria-label={`${a} prompts`} /></td>
          <td><input type="checkbox" disabled checked={x.actionConfirm[a].confirm} readOnly aria-label={`${a} confirm`} /></td>
          <td><input type="checkbox" disabled checked={x.actionConfirm[a].verify} readOnly aria-label={`${a} verify`} /></td></tr>)}</tbody></table>
    </div>}
  </div>
}

const SCREENS: { id: BoiScreen; label: string }[] = [
  { id: 'list', label: 'Batch List' }, { id: 'pfc', label: 'PFC' }, { id: 'table', label: 'Procedure as Table' }, { id: 'journal', label: 'Batch Event Journal' }, { id: 'prompts', label: 'Unacknowledged Prompts' },
  { id: 'phases', label: 'Phase Control' }, { id: 'arbitration', label: 'Arbitration' }, { id: 'alarms', label: 'Batch Alarm Summary' }, { id: 'active', label: 'Active Phase Summary' },
  { id: 'config', label: 'System Configuration and Defaults' }]
const TITLE: Record<BoiScreen, string> = { list: 'BATCH LIST', pfc: 'PROCEDURE AS PFC', table: 'PROCEDURE AS TABLE', journal: 'BATCH EVENT JOURNAL', prompts: 'UNACKNOWLEDGED PROMPTS', phases: 'PHASE CONTROL', arbitration: 'ARBITRATION', alarms: 'BATCH ALARM SUMMARY', active: 'ACTIVE PHASE SUMMARY', config: 'SYSTEM CONFIGURATION AND DEFAULTS' }

/** DeltaV Batch Operator Interface (pp 10-36 .. 10-100). */
export function BoiDisplay(): JSX.Element {
  const screen = useExecUi(s => s.screen)
  const service = useExecutive(s => s.service)
  const failures = useExecutive(s => s.batches.filter(b => b.failure && !b.parent).length)
  const prompts = useExecutive(s => s.prompts.filter(p => !p.answered).length)
  const time = useStore(s => s.time)
  useEffect(() => { useExecutive.getState().setClient('BOI') }, [])
  return <div className="display boi" data-display="BatchOperatorInterface">
    <div className="rs-title">DeltaV Batch Operator Interface - [{TITLE[screen]}]</div>
    <div className="boi-toolbar" role="toolbar" aria-label="Main toolbar">
      {SCREENS.map(s => <button key={s.id} className={`tbtn sm${screen === s.id ? ' on' : ''}${s.id === 'prompts' && prompts ? ' flash' : ''}`} data-boi-screen={s.id}
        onClick={() => useExecUi.getState().setScreen(s.id)}>{s.label}{s.id === 'prompts' && prompts ? ` (${prompts})` : ''}{s.id === 'alarms' && failures ? ` (${failures})` : ''}</button>)}
    </div>
    <div className="boi-main">
      <div className="boi-screen">
        {service !== 'RUNNING' && <p className="boi-banner" role="alert">The Batch Executive service is not running. Start it in the Batch Application Manager.</p>}
        {screen === 'list' && <BatchTable onDouble={id => { useExecUi.getState().selectBatch(id); useExecUi.getState().setScreen('pfc') }} />}
        {screen === 'pfc' && <PfcScreen />}
        {screen === 'table' && <TableScreen />}
        {screen === 'journal' && <JournalScreen />}
        {screen === 'prompts' && <PromptsScreen />}
        {screen === 'phases' && <PhaseControlScreen />}
        {screen === 'arbitration' && <ArbitrationScreen />}
        {screen === 'alarms' && <AlarmsScreen />}
        {screen === 'active' && <ActiveScreen />}
        {screen === 'config' && <ConfigScreen />}
      </div>
      {(screen === 'list' || screen === 'pfc' || screen === 'table') && <BatchCommands operate={false} />}
    </div>
    <div className="rs-status"><span>For Help, press F1</span><span data-boi-service={service} className={service === 'RUNNING' ? 'boi-ok' : 'boi-bad'}>DELTAV</span><span>PROPLUS &lt; Local &gt;</span><span>{new Date(time).toLocaleTimeString('en-US')}</span></div>
  </div>
}

/** DeltaV Operate: the UnacknowledgedPr picture (slides 10-66 .. 10-68) that the prompt button at the bottom right opens. */
export function UnacknowledgedPrDisplay(): JSX.Element {
  const service = useExecutive(s => s.service)
  useEffect(() => { useExecutive.getState().setClient('Operate'); return () => useExecutive.getState().setClient('BOI') }, [])
  return <div className="display boi unackprompts-view" data-display="UnacknowledgedPr">
    <div className="rs-title">UnacknowledgedPr</div>
    {service !== 'RUNNING' && <p className="boi-banner" role="alert">The Batch Executive service is not running.</p>}
    <div className="boi-main"><div className="boi-screen"><PromptsScreen /></div></div>
  </div>
}

/** DeltaV Operate: the Batch List View picture (pp 10-48 .. 10-50, 10-56). */
export function BatchListViewDisplay(): JSX.Element {
  const sel = useExecUi(s => s.selectedBatch)
  const [comment, setComment] = useState(false)
  const service = useExecutive(s => s.service)
  useEffect(() => { useExecutive.getState().setClient('Operate'); return () => useExecutive.getState().setClient('BOI') }, [])
  return <div className="display boi batchlist-view" data-display="BatchListView">
    <div className="rs-title">BatchListView</div>
    {service !== 'RUNNING' && <p className="boi-banner" role="alert">The Batch Executive service is not running.</p>}
    <div className="boi-main"><div className="boi-screen"><BatchTable /></div>
      <div className="boi-commands"><BatchCommands operate />
        <button className="tbtn sm" onClick={() => (sel ? setComment(true) : window.alert('Select a batch first.'))}>Comment</button></div></div>
    {comment && sel && <SimulatorDialog className="module-download-dialog dvd" label="Comment" onClose={() => setComment(false)}><div className="dvd-panel"><CommentBox batch={sel} /></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setComment(false)}>Close</button></div></SimulatorDialog>}
  </div>
}
