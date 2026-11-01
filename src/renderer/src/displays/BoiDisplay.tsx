import { useEffect, useState } from 'react'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { alertResult } from '../components/LibraryExplorer'
import { useBatch } from '../engine/batchStore'
import { useStore } from '../engine/store'
import { STATE_LABEL, type PhaseCommand } from '../engine/batchConfig'
import { useExecutive, type Batch, type Prompt } from '../engine/executive'
import { useExecUi, type BoiScreen } from '../ui/executiveUi'

const fmt = (t: number | null): string => (t === null ? '' : new Date(t).toLocaleTimeString('en-US'))
const elapsed = (b: Batch, now: number): string => {
  if (b.started === null) return ''
  const s = Math.max(0, Math.round(((b.ended ?? now) - b.started) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const Err = ({ error }: { error: string | null }): JSX.Element | null => (error ? <p role="alert" className="lib-dlg-error">{error}</p> : null)

function AddBatchDialog({ operate, onClose }: { operate: boolean; onClose: () => void }): JSX.Element {
  const downloaded = useExecutive(s => s.downloaded)
  const names = Object.keys(downloaded).sort()
  const [recipe, setRecipe] = useState(names[0] ?? '')
  const [id, setId] = useState('')
  const [formula, setFormula] = useState('')
  const [error, setError] = useState<string | null>(null)
  const formulas = Object.values(downloaded[recipe]?.recipe.formulas ?? {}).filter(f => f.operatorCanLoad)
  const submit = (): void => {
    const r = useExecutive.getState().addBatch(recipe, id, formula || null)
    if (r.ok) { useExecUi.getState().selectBatch(r.value); onClose() } else setError(r.error)
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Recipe List" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Create user: ADMINISTRATOR</p>
      {operate ? <label>Recipe:<select aria-label="Recipe" value={recipe} onChange={e => { setRecipe(e.target.value); setFormula('') }}>
        {names.map(n => <option key={n} value={n}>{n}</option>)}</select></label> :
        <table className="dvx-details" aria-label="Recipe list"><thead><tr><th>Identifier</th><th>Procedure Description</th></tr></thead><tbody>
          {names.map(n => <tr key={n} className={n === recipe ? 'sel' : ''} data-recipe-choice={n} onClick={() => { setRecipe(n); setFormula('') }}><td>{n}</td><td>{downloaded[n].recipe.description}</td></tr>)}
          {!names.length && <tr><td colSpan={2} className="dvx-empty">No recipes are downloaded to the Batch Executive.</td></tr>}</tbody></table>}
      <label>Batch ID:<input aria-label="Batch ID" autoFocus value={id} onChange={e => setId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
      <label>Load Formula:<select aria-label="Load Formula" value={formula} onChange={e => setFormula(e.target.value)}><option value="">(none: recipe defaults)</option>
        {formulas.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}</select></label>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" disabled={!recipe} onClick={submit}>Create</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    <Err error={error} />
  </SimulatorDialog>
}

function BatchTable({ onDouble }: { onDouble?: (id: string) => void }): JSX.Element {
  const batches = useExecutive(s => s.batches)
  const downloaded = useExecutive(s => s.downloaded)
  const sel = useExecUi(s => s.selectedBatch)
  const now = useStore(s => s.time)
  const b = useBatch.getState()
  return <table className="dvx-details boi-table" role="grid" aria-label="Batch list"><thead><tr>{['Batch ID', 'Recipe', 'Description', 'Start Time', 'Elapsed Time', 'State', 'Mode', 'Area', 'Process Cell', 'Unit'].map(h => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{batches.map(x => { const r = downloaded[x.recipe]?.recipe; const unit = r?.equipment.name ?? ''; const cell = b.units[unit]?.processCell ?? ''
      return <tr key={x.id} className={sel === x.id ? 'sel' : ''} data-batch-id={x.id} data-batch-state={x.state} onClick={() => useExecUi.getState().selectBatch(x.id)} onDoubleClick={() => onDouble?.(x.id)}>
        <td>{x.id}</td><td>{x.recipe}</td><td>{r?.description ?? ''}</td><td>{fmt(x.started)}</td><td>{elapsed(x, now)}</td><td>{x.state}{x.failure ? ' (failure)' : ''}</td><td>Automatic</td><td>{b.processCells[cell]?.area ?? ''}</td><td>{cell}</td><td>{unit}</td></tr> })}
      {!batches.length && <tr><td colSpan={10} className="dvx-empty">No batches. Use Add Batch.</td></tr>}</tbody></table>
}

function BatchCommands({ operate }: { operate: boolean }): JSX.Element {
  const sel = useExecUi(s => s.selectedBatch)
  const [adding, setAdding] = useState(false)
  const run = (cmd: 'START' | 'HOLD' | 'RESTART' | 'STOP' | 'ABORT' | 'CLEAR_FAILURES'): void => { if (sel) alertResult(useExecutive.getState().batchCommand(sel, cmd)); else window.alert('Select a batch first.') }
  return <div className="boi-commands" role="toolbar" aria-label="Batch control toolbar">
    <button className="tbtn sm" onClick={() => setAdding(true)}>Add Batch</button>
    <button className="tbtn sm" onClick={() => { if (sel) alertResult(useExecutive.getState().removeBatch(sel)); else window.alert('Select a batch first.') }}>Remove Batch</button>
    <button className="tbtn sm" onClick={() => run('START')}>Start</button>
    <button className="tbtn sm" onClick={() => run('HOLD')}>Hold</button>
    <button className="tbtn sm" onClick={() => run('RESTART')}>Restart</button>
    <button className="tbtn sm" onClick={() => run('STOP')}>Stop</button>
    <button className="tbtn sm" onClick={() => run('ABORT')}>Abort</button>
    <button className="tbtn sm" onClick={() => run('CLEAR_FAILURES')}>{operate ? 'Clear All Failures' : 'Clear Failures'}</button>
    {adding && <AddBatchDialog operate={operate} onClose={() => setAdding(false)} />}
  </div>
}

function CommentBox({ batch }: { batch: string | null }): JSX.Element {
  const [text, setText] = useState('')
  return <div className="boi-comment"><label>Comment:<textarea aria-label="Comment" rows={4} value={text} onChange={e => setText(e.target.value)} /></label>
    <button className="tbtn sm" onClick={() => { if (!batch) { window.alert('Select a batch first.'); return } if (alertResult(useExecutive.getState().addComment(batch, text))) setText('') }}>Submit</button></div>
}

function PfcScreen(): JSX.Element {
  const sel = useExecUi(s => s.selectedBatch)
  const batches = useExecutive(s => s.batches)
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
  return <div className="boi-pfc" data-pfc-batch={b.id}>
    <div className="boi-tabs" role="tablist"><button role="tab" aria-selected={tab === 'PFC'} className={tab === 'PFC' ? 'on' : ''} onClick={() => setTab('PFC')}>PFC</button>
      <button role="tab" aria-selected={tab === 'Comment'} className={tab === 'Comment' ? 'on' : ''} onClick={() => setTab('Comment')}>Comment</button></div>
    {tab === 'Comment' ? <CommentBox batch={b.id} /> : <div className="rs-diagram boi-diagram">
      <div className="rs-start">START</div>
      {[0, ...r.steps.map((_, i) => i + 1)].map(i => <div key={i} className="rs-chain">
        <div className={`rs-trans${b.pos === i && i === 0 ? ' on' : ''}`}><span className="rs-bar" /><span className="rs-tname">{r.transitions[i]?.name}</span></div>
        {i < r.steps.length && <div className={`rs-step pfc-${state(i + 1)}`} data-pfc-step={r.steps[i].name}>{r.steps[i].name}
          <small>{b.pos === i + 1 ? (b.waiting ? `Waiting to acquire ${b.waiting}` : active[`${r.equipment.name}/${r.steps[i].phaseClass}`] ? STATE_LABEL[active[`${r.equipment.name}/${r.steps[i].phaseClass}`].rt.state] : '') : b.pos > i + 1 ? 'Complete' : ''}</small></div>}
      </div>)}
      <p className="boi-batch-status" role="status">Batch {b.id}: {b.state}{b.failure ? ` — ${b.failure}` : ''}</p>
    </div>}
  </div>
}

function JournalScreen(): JSX.Element {
  const journal = useExecutive(s => s.journal)
  const batches = useExecutive(s => s.batches)
  const [filter, setFilter] = useState('')
  const rows = journal.filter(j => !filter || j.batch === filter)
  return <div className="boi-journal"><label>Batch:<select aria-label="Journal batch" value={filter} onChange={e => setFilter(e.target.value)}><option value="">(all)</option>{batches.map(b => <option key={b.id} value={b.id}>{b.id}</option>)}</select></label>
    <table className="dvx-details" aria-label="Batch event journal"><thead><tr><th>Time</th><th>Batch ID</th><th>Unit/Phase</th><th>Type</th><th>Event</th><th>User</th></tr></thead>
      <tbody>{[...rows].reverse().map((j, i) => <tr key={i}><td>{fmt(j.at)}</td><td>{j.batch}</td><td>{j.key}</td><td>{j.kind}</td><td>{j.text}</td><td>{j.user}</td></tr>)}</tbody></table></div>
}

function PromptDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }): JSX.Element {
  const [value, setValue] = useState('')
  const answer = (v: string): void => { if (alertResult(useExecutive.getState().answerPrompt(prompt.id, v))) onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label="Operator Prompt" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel"><p role="status">{prompt.text}</p><p className="exp-hint">{prompt.key}{prompt.batch ? ` · batch ${prompt.batch}` : ''}</p>
      {prompt.kind !== 'Boolean' && <label>Response:<input aria-label="Prompt response" autoFocus value={value} onChange={e => setValue(e.target.value)} /></label>}</div>
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
  const [showUnits, setShowUnits] = useState(true)
  const [unit, setUnit] = useState('')
  const [phase, setPhase] = useState('')
  const [ask, setAsk] = useState<'acquire' | 'start' | null>(null)
  const [batchId, setBatchId] = useState('')
  const list = Object.values(units).filter(u => areas.includes(processCells[u.processCell]?.area ?? '')).sort((a, b) => a.name.localeCompare(b.name))
  const u = units[unit]
  const key = unit && phase ? `${unit}/${phase}` : ''
  const a = key ? active[key] : undefined
  const exec = useExecutive.getState
  const cmd = (c: PhaseCommand): void => { if (key) alertResult(exec().manualCommand(unit, phase, c)); else window.alert('Select a unit phase first.') }
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
        <button className="tbtn sm" onClick={() => (key ? setAsk('acquire') : window.alert('Select a unit phase first.'))}>Acquire</button>
        <button className="tbtn sm" onClick={() => { if (!key) { window.alert('Select a unit phase first.'); return } alertResult(exec().releasePhase(unit, phase)) }}>Release</button>
        <button className="tbtn sm" onClick={() => (key ? setAsk('start') : window.alert('Select a unit phase first.'))}>Start Phase</button>
        {(['HOLD', 'RESTART', 'STOP', 'ABORT', 'RESET', 'CLEAR_FAILURES'] as PhaseCommand[]).map(c => <button key={c} className="tbtn sm" onClick={() => cmd(c)}>{c === 'CLEAR_FAILURES' ? 'Clear Failures' : c.charAt(0) + c.slice(1).toLowerCase()}</button>)}
      </div>
      {a && <table className="dvx-details" aria-label="Phase parameters"><thead><tr><th>Parameter</th><th>Value</th></tr></thead>
        <tbody>{Object.entries(a.rt.params).filter(([k]) => !['REQDATA1', 'REQDATA2', 'REQDATA3', 'REQDATA4', 'REQDATA5'].includes(k)).map(([k, v]) => <tr key={k}><td>{k}</td><td>{String(v)}</td></tr>)}</tbody></table>}
    </div>
    {ask === 'acquire' && <SimulatorDialog className="module-download-dialog dvd" label="Request" onClose={() => setAsk(null)}>
      <div className="dvd-panel"><p role="status">Acquire {key} for the OPERATOR?</p></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { alertResult(exec().acquirePhase(unit, phase)); setAsk(null) }}>OK</button><button className="tbtn sm" onClick={() => setAsk(null)}>Cancel</button></div></SimulatorDialog>}
    {ask === 'start' && <SimulatorDialog className="module-download-dialog dvd" label="Start Phase" onClose={() => setAsk(null)}>
      <div className="lib-dlg-fields dvd-panel"><label>Batch ID:<input aria-label="Phase batch ID" autoFocus value={batchId} onChange={e => setBatchId(e.target.value)} /></label>
        <p className="exp-hint">The Batch ID is used for tracking the phase in the Batch Event Journal.</p></div>
      <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { if (alertResult(exec().manualCommand(unit, phase, 'START', batchId))) setAsk(null) }}>OK</button><button className="tbtn sm" onClick={() => setAsk(null)}>Cancel</button></div></SimulatorDialog>}
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
  return <div className="boi-arb"><table className="dvx-details" aria-label="Arbitration"><thead><tr><th>Unit/Phase</th><th>Owner</th><th>Needed by</th></tr></thead>
    <tbody>{keys.map(k => <tr key={k} className={k === sel ? 'sel' : ''} data-arb-key={k} data-arb-owner={owners[k] ?? ''} onClick={() => setSel(k)}><td>{k}</td><td>{owners[k] ?? ''}</td><td>{needed(k)}</td></tr>)}</tbody></table>
    <div className="boi-commands"><button className="tbtn sm" onClick={() => (sel ? alertResult(useExecutive.getState().acquirePhase(unit, phase)) : window.alert('Select a unit phase first.'))}>Acquire</button>
      <button className="tbtn sm" onClick={() => (sel ? alertResult(useExecutive.getState().releasePhase(unit, phase)) : window.alert('Select a unit phase first.'))}>Release</button></div></div>
}

function AlarmsScreen(): JSX.Element {
  const batches = useExecutive(s => s.batches)
  const owners = useExecutive(s => s.owners)
  const active = useBatch(s => s.active)
  const rows = [...batches.filter(b => b.failure).map(b => ({ k: `b${b.id}`, who: `Batch ${b.id}`, text: b.failure ?? '' })),
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

const SCREENS: { id: BoiScreen; label: string }[] = [
  { id: 'list', label: 'Batch List' }, { id: 'pfc', label: 'PFC' }, { id: 'journal', label: 'Batch Event Journal' }, { id: 'prompts', label: 'Unacknowledged Prompts' },
  { id: 'phases', label: 'Phase Control' }, { id: 'arbitration', label: 'Arbitration' }, { id: 'alarms', label: 'Batch Alarm Summary' }, { id: 'active', label: 'Active Phase Summary' }]
const TITLE: Record<BoiScreen, string> = { list: 'BATCH LIST', pfc: 'PROCEDURE AS PFC', journal: 'BATCH EVENT JOURNAL', prompts: 'UNACKNOWLEDGED PROMPTS', phases: 'PHASE CONTROL', arbitration: 'ARBITRATION', alarms: 'BATCH ALARM SUMMARY', active: 'ACTIVE PHASE SUMMARY' }

/** DeltaV Batch Operator Interface (pp 10-36 .. 10-100). */
export function BoiDisplay(): JSX.Element {
  const screen = useExecUi(s => s.screen)
  const service = useExecutive(s => s.service)
  const failures = useExecutive(s => s.batches.filter(b => b.failure).length)
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
        {screen === 'journal' && <JournalScreen />}
        {screen === 'prompts' && <PromptsScreen />}
        {screen === 'phases' && <PhaseControlScreen />}
        {screen === 'arbitration' && <ArbitrationScreen />}
        {screen === 'alarms' && <AlarmsScreen />}
        {screen === 'active' && <ActiveScreen />}
      </div>
      {(screen === 'list' || screen === 'pfc') && <BatchCommands operate={false} />}
    </div>
    <div className="rs-status"><span>For Help, press F1</span><span data-boi-service={service} className={service === 'RUNNING' ? 'boi-ok' : 'boi-bad'}>DELTAV</span><span>PROPLUS &lt; Local &gt;</span><span>{new Date(time).toLocaleTimeString('en-US')}</span></div>
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
