import { useState } from 'react'
import { useUi, type DisplayId } from '../ui/uiStore'
import { useProgress } from '../engine/progressStore'
import { COURSE, type Workshop } from '../engine/workshops'
import { useStore } from '../engine/store'
import type { StepCheck } from '../engine/workshopChecks'
import { checkCourse7016Ch1 } from '../engine/course7016Checks'
import { checkCourse7016Ch3, checkCourse7016Ch4, checkCourse7016HoldRestart, checkCourse7016Optional, checkCourse7016Verify } from '../engine/course7016Ch4Checks'
import { useLibrary, makeReader } from '../engine/libraryStore'
import { useBatch } from '../engine/batchStore'
import { useSystem } from '../engine/systemPreferences'
import { useEm } from '../engine/emStore'
import { checkCourse7016BlenderColor, checkCourse7016BlenderOutlet, checkCourse7016BlendersUnit, checkCourse7016Ch5Optional, checkCourse7016RunProcess, checkCourse7016VerifyEms, blendersDownloadedAt, type Ch5State } from '../engine/course7016Ch5Checks'
import { checkCourse7016ManualOp } from '../engine/course7016Ch2Checks'
import { checkCourse7016Ch6 } from '../engine/course7016Ch6Checks'

function stepIds(w: Workshop): string[] {
  return w.steps.map((s) => s.id)
}

export function WorkshopsDisplay(): JSX.Element {
  const done = useProgress((s) => s.done)
  const navigate = useUi((s) => s.navigate)
  const all = COURSE.flatMap((m) => m.workshops)
  const [selId, setSelId] = useState<string>(all[0]?.id ?? '')
  const sel = all.find((w) => w.id === selId)

  const pct = (w: Workshop): number => {
    const ids = stepIds(w)
    const n = ids.filter((i) => done[i]).length
    return ids.length ? Math.round((n / ids.length) * 100) : 0
  }

  const totalSteps = all.reduce((a, w) => a + w.steps.length, 0)
  const doneSteps = all.reduce((a, w) => a + stepIds(w).filter((i) => done[i]).length, 0)
  const overall = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0

  return (
    <div className="display workshops">
      <div className="ws-list">
        <div className="ws-overall">
          <div className="ws-overall-top">
            <b>Exercise Checklist</b>
            <span>{overall}%</span>
          </div>
          <div className="ws-bar">
            <div className="ws-bar-fill" style={{ width: overall + '%' }} />
          </div>
          <div className="ws-overall-sub">
            {doneSteps} / {totalSteps} steps ticked. Steps marked Verified are checked live against the simulator.
          </div>
        </div>
        {COURSE.map((m) => (
          <div key={m.module}>
            <div className="ws-module">{m.module}</div>
            {m.workshops.map((w) => (
              <div
                key={w.id}
                className={'ws-item' + (selId === w.id ? ' sel' : '')}
                onClick={() => setSelId(w.id)}
              >
                <span className="ws-check" style={{ opacity: pct(w) === 100 ? 1 : 0.25 }}>
                  ✓
                </span>
                <span className="ws-item-title">{w.title}</span>
                <span className="ws-item-pct">{pct(w)}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="ws-detail">
        {!sel ? (
          <div className="exp-empty">Select a workshop.</div>
        ) : (
          <WorkshopPanel workshop={sel} onNavigate={navigate} />
        )}
      </div>
    </div>
  )
}

function WorkshopPanel({
  workshop: w,
  onNavigate
}: {
  workshop: Workshop
  onNavigate: (d: DisplayId) => void
}): JSX.Element {
  const done = useProgress((s) => s.done)
  const toggle = useProgress((s) => s.toggle)
  const reset = useProgress((s) => s.reset)
  const eventLog = useStore((s) => s.eventLog)
  const modules = useStore((s) => s.modules)
  const namedSets = useStore((s) => s.namedSets)
  const library = useLibrary()
  const batch = useBatch()
  const system = useSystem()
  const em = useEm()
  const ch5: Ch5State = {
    emCategories: em.categories, emClasses: em.classes, emDrafts: em.drafts, emInstances: em.instances, emDeployed: em.deployed,
    batchCategories: batch.categories, unitClasses: batch.unitClasses, units: batch.units, contained: batch.contained,
    assignments: library.assignments, modules, transfers: library.transfers, sims: library.sims, runSince: blendersDownloadedAt(em.deployed)
  }
  const checks: StepCheck[] | null =
    w.id.startsWith('7016-ch6-') && w.id !== '7016-ch6-optional' ? checkCourse7016Ch6(batch, eventLog, namedSets) :
    w.id === '7016-ch1-level-indicator' || w.id === '7016-ch1-instances' ? checkCourse7016Ch1(library, modules, makeReader(library)) :
    w.id === '7016-ch2-manual' ? checkCourse7016ManualOp(library.transfers) :
    w.id === '7016-ch3-sysprefs' ? checkCourse7016Ch3(system) :
    w.id === '7016-ch4-fill' ? checkCourse7016Ch4(batch, eventLog) :
    w.id === '7016-ch4-hold-restart' ? checkCourse7016HoldRestart(batch) :
    w.id === '7016-ch4-verify' ? checkCourse7016Verify(eventLog) :
    w.id === '7016-ch4-optional' ? checkCourse7016Optional(batch, eventLog) :
    w.id === '7016-ch5-blender-color' ? checkCourse7016BlenderColor(ch5) :
    w.id === '7016-ch5-blender-outlet' ? checkCourse7016BlenderOutlet(ch5) :
    w.id === '7016-ch5-blenders-unit' ? checkCourse7016BlendersUnit(ch5) :
    w.id === '7016-ch5-run-process' ? checkCourse7016RunProcess(ch5) :
    w.id === '7016-ch5-verify-ems' ? checkCourse7016VerifyEms(eventLog) :
    w.id === '7016-ch5-optional' ? checkCourse7016Ch5Optional(ch5, eventLog) : null
  const verdictFor = (id: string): StepCheck | undefined => checks?.find((s) => s.id === id)

  return (
    <div className="ws-panel">
      <div className="ws-panel-head">
        <h2>{w.title}</h2>
        <button className="tbtn sm" onClick={() => reset(stepIds(w))}>
          Reset
        </button>
      </div>
      <p className="ws-objective">{w.objective}</p>
      {w.note && <div className="ws-note">{w.note}</div>}
      {checks && (
        <div className="ws-note" role="status">
          Steps below are checked against the simulator: Verified comes from real state (the DV_School library and batch configuration, the controller download and the Event Journal).
        </div>
      )}
      <ol className="ws-steps">
        {w.steps.map((st) => (
          <li key={st.id} className={'ws-step' + (done[st.id] ? ' done' : '')}>
            <button className={'ws-step-box' + (done[st.id] ? ' on' : '')} onClick={() => toggle(st.id)}>
              {done[st.id] ? '✓' : ''}
            </button>
            <span className="ws-step-text">{st.text}</span>
            {verdictFor(st.id) && (
              <span className="ws-verdict" data-verdict={verdictFor(st.id)!.verdict} title={verdictFor(st.id)!.detail}
                style={{ marginLeft: 8, fontSize: 11, whiteSpace: 'nowrap', color: verdictFor(st.id)!.verdict === 'verified' ? '#37d36b' : 'var(--dv-text-mute)' }}>
                {verdictFor(st.id)!.verdict === 'verified' ? '✓ Verified' : verdictFor(st.id)!.verdict === 'manual' ? 'Manual' : 'Not yet'} — {verdictFor(st.id)!.detail}
              </span>
            )}
            {st.goto && (
              <button className="tbtn sm" onClick={() => onNavigate(st.goto!)}>
                Open ↗
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
