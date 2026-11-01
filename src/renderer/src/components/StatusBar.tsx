import { useStore } from '../engine/store'
import { useExecutive } from '../engine/executive'
import { useExecUi } from '../ui/executiveUi'
import { useUi } from '../ui/uiStore'
import { useWindows } from '../ui/windowStore'

export function StatusBar(): JSX.Element {
  const running = useStore((s) => s.running)
  const alarms = useStore((s) => s.alarms)
  const speed = useStore((s) => s.speed)
  const version = typeof window !== 'undefined' && window.deltav ? window.deltav.version : '1.0.0'

  const failures = useExecutive(s => s.batches.filter(b => b.failure && !b.parent).length)
  const prompts = useExecutive(s => s.prompts.filter(p => !p.answered).length)
  const service = useExecutive(s => s.service)
  const openBoi = (screen: 'alarms'): void => { useExecUi.getState().setScreen(screen); useWindows.getState().minimize('explorer'); useUi.getState().navigate('boi') }
  const openPrompts = (): void => { useWindows.getState().minimize('explorer'); useUi.getState().navigate('unackprompts') }
  const active = alarms.filter((a) => a.active).length
  const unack = alarms.filter((a) => !a.acknowledged).length

  return (
    <div className="statusbar">
      <span className="seg">
        <span
          className="dot"
          style={{ background: running ? 'var(--dv-ok)' : 'var(--dv-warning)' }}
        />
        Simulation {running ? 'RUNNING' : 'ON HOLD'} · {speed}×
      </span>
      <span className="seg">
        <span
          className="dot"
          style={{ background: active ? 'var(--dv-critical)' : 'var(--dv-ok)' }}
        />
        {active} active · {unack} unacknowledged
      </span>
      <span className="seg">Node: PRIMARY · Comm: GOOD</span>
      {service === 'RUNNING' && <span className="seg"><button className={`statusbar-batch`} data-batch-failures={failures} aria-label="Batch failures" onClick={() => openBoi('alarms')}>Batch failures: {failures}</button>
        <button className={`statusbar-batch`} data-batch-prompts={prompts} aria-label="Batch prompts" onClick={openPrompts}>Prompts: {prompts}</button></span>}
      <span className="spacer" />
      <span className="seg">BatchLiveTrainer v{version}</span>
    </div>
  )
}
