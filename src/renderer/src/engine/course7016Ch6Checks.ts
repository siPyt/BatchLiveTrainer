import type { PhaseClass } from './batchConfig'
import type { UnitDeployment } from './batchStore'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'
import type { NamedSetState } from './namedSets'

export interface Ch6State {
  phaseClasses: Record<string, PhaseClass>
  phaseDrafts: Record<string, PhaseClass>
  deployedUnits: Record<string, UnitDeployment>
}

const check = (id: string, ok: boolean, detail: string): StepCheck => ({
  id, verdict: ok ? 'verified' : 'pending', detail: ok ? 'Verified: ' + detail : 'Not yet: ' + detail
})

export function checkCourse7016Ch6(s: Ch6State, events: EventLogEntry[], namedSets: NamedSetState): StepCheck[] {
  const pc = s.phaseClasses.AGITATE
  const run = pc?.logic.RUN_LOGIC
  const actions = run?.steps.flatMap(s => s.actions) ?? []
  const text = actions.map(a => a.expression).join('\n').toUpperCase()
  const conditions = run?.transitions.map(t => t.condition).join('\n').toUpperCase() ?? ''
  const fm = Object.values(pc?.logic.FAIL_MONITOR.blocks ?? {})
  const params = pc?.params
  const deployed = ['UM_BL_500', 'UM_BL_600'].every(u => JSON.stringify(s.deployedUnits[u]?.logic.AGITATE) === JSON.stringify(pc?.logic) && !!pc)
  const seen = (unit: string, desc: string): boolean => events.some(e => e.tag === `${unit}/AGITATE` && e.description.includes(desc))
  const both = (desc: string): boolean => ['UM_BL_500', 'UM_BL_600'].every(u => seen(u, desc))
  const messagesDownloaded = ['WORKSTATION', ...new Set(Object.values(s.deployedUnits).map(d => `CONTROLLER:${d.controller}`))]
    .every(target => [4, 5, 6, 7, 8].every(value => namedSets.deployed[target]?.phase_failures?.entries.some(e => e.value === value)))
  const recoveries = (unit: string): boolean => [4, 5, 6, 7, 8].every(index => {
    const rows = events.filter(e => e.tag === `${unit}/AGITATE`)
    return rows.some((e, i) => {
      if (!e.description.startsWith(`Phase failure ${index}:`)) return false
      const nextFailure = rows.findIndex((r, j) => j > i && r.description.startsWith('Phase failure '))
      const after = rows.slice(i + 1, nextFailure < 0 ? undefined : nextFailure)
      const held = after.findIndex(r => r.description.startsWith('Phase state Held'))
      const clear = after.findIndex((r, j) => j > held && r.description.startsWith('Command Clear Failures'))
      const restart = after.findIndex((r, j) => j > clear && r.description.startsWith('Command Restart'))
      return held >= 0 && clear > held && restart > clear && after.some((r, j) => j > restart && r.description.startsWith('Phase state Running'))
    })
  })
  return [
    check('7016-6-1', !!pc && pc.category === 'BlenderClasses' && params?.R_BLEND_TIME?.type === 'Integer' &&
      params.R_BLEND_TIME.direction === 'Input' && params.R_BLEND_TIME.low === 0 && params.R_BLEND_TIME.high === 300 &&
      params.R_BLEND_TIME.defaultValue === 30 && params.R_BLEND_TIME.units === 'sec' &&
      params.RPT_BLEND_TIME?.direction === 'Report' && params.RPT_BLEND_TIME.type === 'Integer' && params.RPT_BLEND_TIME.units === 'sec',
    'AGITATE and the specified input/report parameters'),
    check('7016-6-2', run?.blocks?.BLEND_TIMER?.type === 'TIMER_SEC', 'RUN_LOGIC contains BLEND_TIMER linked to TIMER_SEC'),
    check('7016-6-3', actions.filter(a => a.qualifier === 'P' && a.confirm?.trim()).length >= 4 && text.includes('STEP_INDEX') && conditions.includes('PENDING_CONFIRMS'),
      'initialization uses confirmed pulses, STEP_INDEX and a pending-confirm transition'),
    check('7016-6-4', deployed && !s.phaseDrafts.AGITATE && text.includes('RPT_BLEND_TIME') && text.includes('ELAPSED_TIME') && conditions.includes('/TIME'),
      'saved timing/report logic is downloaded on both unit phases'),
    check('7016-6-5', both('Phase state Complete'), 'both blenders have completed AGITATE'),
    check('7016-6h-1', !!pc?.logic.HOLD_LOGIC.steps.some(s => s.actions.some(a => /BLEND_TIMER\/START/i.test(a.expression))),
      'HOLD_LOGIC controls the retentive timer'),
    check('7016-6h-2', !!pc?.logic.RESTART_LOGIC.routes?.length && pc.logic.RESTART_LOGIC.steps.some(s => s.actions.some(a => /RESTART_TYPE/i.test(a.expression))),
      'RESTART_LOGIC has selective branches and sets RESTART_TYPE'),
    check('7016-6h-3', both('Phase state Held') && both('Phase state Running') && both('Command Restart'), 'Hold/Restart exercised on both blenders'),
    check('7016-6f-1', fm.filter(b => b.type === 'CND' && b.disabled).length === 5 && fm.some(b => b.type === 'BFI' && b.inputs.length === 5) &&
      fm.filter(b => b.type === 'CALC').length >= 2, 'five disabled conditions, wired BFI and calculation blocks configured'),
    check('7016-6f-2', messagesDownloaded && fm.some(b => b.type === 'CALC' && /FAIL_INDEX/i.test(b.expression)),
      'failure-monitor calculation writes FAIL_INDEX and five messages are downloaded to workstation/controller'),
    check('7016-6f-3', text.includes('FAIL_MONITOR') && text.includes('DISABLE') && actions.some(a => !!a.delayExpression),
      'RUN_LOGIC enables/disables monitoring and delays a pulse by condition'),
    check('7016-6f-4', deployed && !!pc?.logic.HOLD_LOGIC.routes?.length && !!pc.logic.RESTART_LOGIC.routes?.length,
      'branched hold/restart logic downloaded on both units'),
    check('7016-6f-5', recoveries('UM_BL_500'), 'all five failures followed by Held, Clear Failures, Restart and Running on UM_BL_500'),
    check('7016-6f-6', recoveries('UM_BL_600'), 'all five failures followed by Held, Clear Failures, Restart and Running on UM_BL_600')
  ]
}
