import { useEffect, useRef, useState } from 'react'
import { useBatchUi, type BatchWindow } from '../ui/batchUi'
import { useUi } from '../ui/uiStore'
import { useStore } from '../engine/store'
import { useBatch, activeKey, type ActivePhase } from '../engine/batchStore'
import { COMMANDS_FOR, COMMAND_LABEL, STATE_LABEL, stepIndex, phaseHasFailure, type PhaseCommand, type PhaseParamDef } from '../engine/batchConfig'
import { askValue } from './AppNotices'

// DeltaV Operate unit and phase faceplates (course 7016 pp 4-34/4-35): the unit faceplate lists up to
// ten active phases and loads phases by name; the phase faceplate ("Faceplate FB") shows phase state,
// time in state, step index and watchdog, the Phase Command selector and the Phase Owner toggle.
// Drawn with BatchLive's standard faceplate chrome.

const ALL_COMMANDS: PhaseCommand[] = ['START', 'HOLD', 'RESTART', 'STOP', 'ABORT', 'RESET', 'CLEAR_FAILURES']

function alertResult(r: { ok: boolean; error?: string }): boolean {
  if (!r.ok && r.error) window.alert(r.error)
  return r.ok
}

/** Load order of the unit's active phases (slot P1..P10). */
export function activePhasesOf(active: Record<string, ActivePhase>, unit: string): ActivePhase[] {
  return Object.values(active).filter(a => a.unit === unit)
}

export function BatchWindows(): JSX.Element {
  const windows = useBatchUi(s => s.windows)
  return <>{windows.map(w => <BatchWindowFrame key={w.id} w={w} />)}</>
}

function BatchWindowFrame({ w }: { w: BatchWindow }): JSX.Element {
  const { moveWindow, focusWindow, closeWindow } = useBatchUi.getState()
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  useEffect(() => {
    const move = (e: MouseEvent): void => { if (drag.current) moveWindow(w.id, Math.max(0, e.clientX - drag.current.dx), Math.max(0, e.clientY - drag.current.dy)) }
    const up = (): void => { drag.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [w.id, moveWindow])
  const title = w.kind === 'unit' ? 'Faceplate' : 'Faceplate FB'
  return <div className={'faceplate batch-fp ' + (w.kind === 'unit' ? 'batch-fp-unit' : 'batch-fp-phase')} style={{ left: w.x, top: w.y, zIndex: 900 + w.z }}
    onMouseDown={() => focusWindow(w.id)} role="dialog" aria-label={w.kind === 'unit' ? `${w.unit} unit faceplate` : `${w.unit}/${w.phase} phase faceplate`}>
    <div className="fp-header" onMouseDown={e => { drag.current = { dx: e.clientX - w.x, dy: e.clientY - w.y } }}>
      <span className="fp-tag">{title}</span>
      <span className="fp-desc" />
      <button className="fp-close" onClick={() => closeWindow(w.id)} title="Close" aria-label="Close">✕</button>
    </div>
    {w.kind === 'unit' ? <UnitFaceplate unit={w.unit} /> : <PhaseFaceplate unit={w.unit} phase={w.phase!} />}
  </div>
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'state' | 'dark' }): JSX.Element {
  return <div className="bfp-field"><span className="bfp-label">{label}</span><span className={'bfp-value' + (tone ? ` ${tone}` : '')}>{value}</span></div>
}

export function UnitFaceplate({ unit }: { unit: string }): JSX.Element {
  const u = useBatch(s => s.units[unit])
  const dep = useBatch(s => s.deployedUnits[unit])
  const active = useBatch(s => s.active)
  const phases = activePhasesOf(active, unit)
  const [page, setPage] = useState(0)
  if (!u) return <div className="fp-body"><p>Unit module {unit} no longer exists.</p></div>
  const slots = Array.from({ length: 5 }, (_, i) => phases[page * 5 + i])
  return <div className="fp-body bfp-body" data-unit-faceplate={unit}>
    <div className="bfp-title">{unit}</div>
    <div className="bfp-sub">{(dep?.unit.description || u.description) || `Unit class ${u.unitClass}`}</div>
    {!dep && <div className="bfp-warn" role="status">Not downloaded — download the unit module from DeltaV Explorer.</div>}
    {['Batch ID', 'Operation', 'Unit Procedure', 'Procedure'].map(l => <div key={l} className="bfp-block"><span className="bfp-engraved">{l}</span><span className="bfp-black" /></div>)}
    <div className="bfp-tabs" role="tablist">
      {['1...5', '6...10'].map((t, i) => <button key={t} role="tab" aria-selected={page === i} className={page === i ? 'on' : ''} onClick={() => setPage(i)}>{t}</button>)}
      <span className="bfp-engraved">Active Phases</span>
    </div>
    <div className="bfp-slots" aria-label="Active phases">
      {slots.map((a, i) => <div key={i} className="bfp-slot" data-slot={page * 5 + i + 1}>
        {a && <>
          <span className="bfp-slot-name">{a.phase}</span>
          <span className="bfp-slot-owner">{a.owner === 'EXTERNAL' ? 'EXT' : 'BATCH'}</span>
          <button className="bfp-slot-btn" title={`Open the ${a.phase} phase faceplate`} aria-label={`Open ${a.phase} phase faceplate`}
            onClick={() => useBatchUi.getState().openPhase(unit, a.phase)}>▥</button>
          <span className={'bfp-slot-state' + (phaseHasFailure(a.rt) ? ' failed' : '')}>{STATE_LABEL[a.rt.state]}</span>
        </>}
      </div>)}
    </div>
    <div className="bfp-load"><span className="bfp-engraved">Load a Phase</span>
      <button className="tbtn sm" aria-label="Load a Phase" onClick={() => useBatchUi.getState().openDialog({ t: 'loadPhase', unit })} disabled={!dep} title={dep ? 'Load a unit phase by name' : 'Download the unit module first'}>...</button></div>
    <div className="bfp-footer">
      <button className="fp-link-btn" onClick={() => useUi.getState().navigate('process')}
        title={`Primary control display: ${dep?.unit.primaryDisplay || u.primaryDisplay || 'not configured'}`}>{dep?.unit.primaryDisplay || u.primaryDisplay || 'Process'}</button>
      <button className="fp-link-btn" onClick={() => useUi.getState().navigate('batchhelp')}>BatchHelp</button>
      <button className="fp-link-btn" onClick={() => useUi.getState().navigate('explorer')}>Explorer</button>
    </div>
  </div>
}

export function PhaseFaceplate({ unit, phase }: { unit: string; phase: string }): JSX.Element {
  const a = useBatch(s => s.active[activeKey(unit, phase)])
  const active = useBatch(s => s.active)
  const params = useBatch(s => s.deployedUnits[unit]?.params[phase])
  const [selector, setSelector] = useState(false)
  const slot = activePhasesOf(active, unit).findIndex(x => x.phase === phase) + 1
  if (!a) return <div className="fp-body bfp-body"><div className="bfp-title">{unit}/{phase}</div>
    <p className="bfp-warn">{phase} is not loaded on {unit}. Use Load a Phase on the unit faceplate.</p></div>
  const rt = a.rt
  const valid = COMMANDS_FOR[rt.state]
  const send = (cmd: PhaseCommand): void => { if (alertResult(useBatch.getState().command(unit, phase, cmd))) setSelector(false) }
  const current = rt.lastCommand ? COMMAND_LABEL[rt.lastCommand] : 'Reset'
  const editParam = (p: PhaseParamDef): void => {
    void askValue(`${p.name} (${p.low} to ${p.high} ${p.units})`, String(rt.params[p.name] ?? p.defaultValue)).then(v => {
      if (v === null) return
      alertResult(useBatch.getState().setOnlineParam(unit, phase, p.name, p.type === 'String' ? v : Number(v)))
    })
  }
  return <div className="fp-body bfp-body" data-phase-faceplate={`${unit}/${phase}`}>
    <div className="bfp-title">{unit}/P{slot}</div>
    <div className="bfp-block"><span className="bfp-engraved">Phase Name</span>
      <button className="tbtn sm bfp-unload" onClick={() => { if (alertResult(useBatch.getState().unloadPhase(unit, phase))) useBatchUi.getState().closeWindow(`phase:${unit}/${phase}`) }}>Unload</button></div>
    <span className="bfp-black bfp-name">{phase}</span>
    <div className="bfp-engraved">Phase Status</div>
    <Field label="Phase State" value={STATE_LABEL[rt.state]} tone="state" />
    <Field label="Time in State" value={String(Math.floor(rt.stateTime))} tone="state" />
    <Field label="Step Index" value={String(stepIndex(rt))} tone="state" />
    <Field label="Watchdog State" value="OK" tone="state" />
    {phaseHasFailure(rt) && <div className="bfp-warn" role="alert">Fail Index {rt.failIndex}{rt.message ? `: ${rt.message}` : ''}</div>}
    <div className="bfp-engraved">Phase Command</div>
    <div className="bfp-inline"><span className="bfp-black bfp-cmd">{current}</span>
      <button className="tbtn sm" aria-label="Phase command selections" onClick={() => setSelector(v => !v)}>...</button></div>
    <div className="bfp-inline"><span className="bfp-engraved">Phase Owner</span>
      <button className="tbtn sm" onClick={() => alertResult(useBatch.getState().toggleOwner(unit, phase))}>Toggle</button></div>
    <div className="bfp-owner" aria-label="Phase owner">
      <span className={a.owner === 'BATCH' ? 'on' : ''}>DeltaV Batch</span>
      <span className={a.owner === 'EXTERNAL' ? 'on' : ''}>External</span>
    </div>
    {params && Object.values(params).some(p => p.kind === 'batch') && <>
      <div className="bfp-engraved">Batch Parameters</div>
      {Object.values(params).filter(p => p.kind === 'batch').map(p => <div key={p.name} className="bfp-field" data-param={p.name}>
        <span className="bfp-label">{p.name}</span>
        {p.direction === 'Input'
          ? <button className="bfp-value input" title="Click to change the value" onClick={() => editParam(p)}>{String(rt.params[p.name] ?? '')} {p.units}</button>
          : <span className="bfp-value report">{typeof rt.params[p.name] === 'number' ? Number(rt.params[p.name]).toFixed(1) : String(rt.params[p.name] ?? '')} {p.units}</span>}
      </div>)}
    </>}
    <div className="bfp-footer">
      <button className="fp-link-btn" onClick={() => useUi.getState().openPhaseStudio(useBatch.getState().deployedUnits[unit]?.unit.phases[phase]?.phaseClass ?? phase)}>Control Studio</button>
      <button className="fp-link-btn" onClick={() => useUi.getState().navigate('journal')}>Event Journal</button>
    </div>
    {selector && <div className="bfp-selector" role="dialog" aria-label={`${unit}/P${slot} phase command`}>
      <div className="bfp-prompt-title">{unit}/P{slot}<button className="fp-close" onClick={() => setSelector(false)} aria-label="Close">✕</button></div>
      <div className="bfp-engraved">Current Value:</div>
      <span className="bfp-black bfp-cmd">{current}</span>
      <div className="bfp-engraved">Selections:</div>
      {ALL_COMMANDS.map(c => <button key={c} className={'bfp-sel' + (c === 'START' ? ' start' : '')} disabled={!valid.includes(c) || a.owner !== 'EXTERNAL'}
        title={a.owner !== 'EXTERNAL' ? 'The phase is owned by DeltaV Batch; toggle the owner to External' : valid.includes(c) ? COMMAND_LABEL[c] : `${COMMAND_LABEL[c]} is not valid while ${STATE_LABEL[rt.state]}`}
        onClick={() => send(c)}>{c === 'START' ? '▶ ' : ''}{COMMAND_LABEL[c]}</button>)}
    </div>}
  </div>
}

/** BatchHelp picture (p4-52): every unit module's phases, state, owner and batch parameters, with R_FILL_LEVEL editable. */
export function BatchHelpDisplay(): JSX.Element {
  const units = useBatch(s => s.units)
  const deployed = useBatch(s => s.deployedUnits)
  const active = useBatch(s => s.active)
  const time = useStore(s => s.time)
  const names = Object.keys(units).sort()
  const edit = (unit: string, phase: string, p: PhaseParamDef, current: string): void => {
    void askValue(`${unit}/${phase} ${p.name} (${p.low} to ${p.high} ${p.units})`, current).then(v => {
      if (v === null) return
      alertResult(useBatch.getState().setOnlineParam(unit, phase, p.name, p.type === 'String' ? v : Number(v)))
    })
  }
  return <div className="display batchhelp-display" data-display="BatchHelp" data-time={time}>
    <div className="bh-head">
      <button className="bh-nav" onClick={() => useUi.getState().navigate('process')}>Process</button>
      <h1>Batch Help</h1>
      <span className="bh-note">Load a phase from its unit faceplate, then change batch input parameters here before Start.</span>
    </div>
    {!names.length && <p className="bh-empty" role="status">No unit modules yet. Course 7016 Chapter 4 creates UM_COLOR_100/200/300 in process cell PAINT_PRODUCTION.</p>}
    <div className="bh-units">
      {names.map(unit => {
        const dep = deployed[unit]
        const phases = Object.keys(dep?.unit.phases ?? units[unit].phases)
        return <section key={unit} className="bh-unit" data-batchhelp-unit={unit}>
          <div className="bh-unit-head">
            <button className="bh-unit-name" onClick={() => useBatchUi.getState().openUnit(unit)} title="Open the unit faceplate">{unit}</button>
            <span>{units[unit].description}</span>
            <span className={'bh-dl' + (dep ? ' ok' : '')}>{dep ? `Downloaded to ${dep.controller}` : 'Not downloaded'}</span>
          </div>
          <table className="bh-table" aria-label={`${unit} phases`}>
            <thead><tr><th>Phase</th><th>Owner</th><th>State</th><th>Step</th><th>Parameter</th><th>Value</th><th /></tr></thead>
            <tbody>{phases.flatMap(phase => {
              const a = active[activeKey(unit, phase)]
              const defs = Object.values(dep?.params[phase] ?? {}).filter(p => p.kind === 'batch')
              const rows = defs.length ? defs : [null]
              return rows.map((p, i) => <tr key={`${phase}-${p?.name ?? 'none'}`} data-phase={phase} data-param={p?.name}>
                {i === 0 && <>
                  <td rowSpan={rows.length}><b>{phase}</b></td>
                  <td rowSpan={rows.length}>{a ? (a.owner === 'EXTERNAL' ? 'External' : 'DeltaV Batch') : '—'}</td>
                  <td rowSpan={rows.length} className={a ? 'bh-state' : 'bh-dim'}>{a ? STATE_LABEL[a.rt.state] : 'Not loaded'}</td>
                  <td rowSpan={rows.length}>{a ? stepIndex(a.rt) : ''}</td>
                </>}
                <td>{p ? `${p.name}${p.direction === 'Report' ? ' (report)' : ''}` : 'No batch parameters'}</td>
                <td>{p && a ? (p.direction === 'Input'
                  ? <button className="bh-value" aria-label={`${unit} ${p.name}`} onClick={() => edit(unit, phase, p, String(a.rt.params[p.name] ?? ''))}>{String(a.rt.params[p.name] ?? '')} {p.units}</button>
                  : <span className="bh-report">{typeof a.rt.params[p.name] === 'number' ? Number(a.rt.params[p.name]).toFixed(1) : String(a.rt.params[p.name] ?? '')} {p.units}</span>)
                  : p ? <span className="bh-dim" title={p.direction === 'Input' ? `Load ${phase} on the ${unit} unit faceplate (Load a Phase ...) to change this value` : undefined}>{p.direction === 'Input' ? `${dep?.unit.phases[phase]?.paramValues[p.name] ?? p.defaultValue} ${p.units} (configured)` : ''}</span> : ''}</td>
                {i === 0 && <td rowSpan={rows.length}>{a
                  ? <button className="tbtn sm" onClick={() => useBatchUi.getState().openPhase(unit, phase)}>Phase faceplate</button>
                  : <button className="tbtn sm" onClick={() => useBatchUi.getState().openUnit(unit)}>Unit faceplate</button>}</td>}
              </tr>)
            })}</tbody>
          </table>
        </section>
      })}
    </div>
  </div>
}
