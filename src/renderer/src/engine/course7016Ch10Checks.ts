import type { PhaseClass, UnitModule } from './batchConfig'
import type { UnitDeployment } from './batchStore'
import type { ExecutiveState } from './executive'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'

export type Ch10State = ExecutiveState & {
  phaseClasses: Record<string, PhaseClass>
  phaseDrafts: Record<string, PhaseClass>
  units: Record<string, UnitModule>
  deployedUnits: Record<string, UnitDeployment>
}

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const OP = 'OP_FINISH_500'
const BLENDERS = ['UM_BL_500', 'UM_BL_600']

/** Course 7016 Chapter 10 (pp 10-33 .. 10-100): the OP_FINISH_500 operation, Batch Executive, Batch Operator Interface, formulas, prompts and arbitration. */
export function checkCourse7016Ch10(s: Ch10State, _events: EventLogEntry[]): StepCheck[] {
  const r = s.recipes[OP]
  const text = (re: RegExp, kind?: string): boolean => s.journal.some(j => re.test(j.text) && (!kind || j.kind === kind))
  const idx = (re: RegExp): number => s.journal.findIndex(j => re.test(j.text))
  const batchesOf = (f: (b: ExecutiveState['batches'][number]) => boolean) => s.batches.filter(b => b.recipe === OP && f(b))
  const createdVia = (b: { id: string }, client: string): boolean => text(new RegExp(`Batch ${b.id} created from ${OP}.*\\[${client}\\]`))
  const completed = (b: { id: string }): boolean => text(new RegExp(`Batch ${b.id} complete`))
  const agitate = s.phaseClasses.AGITATE
  const agitateText = (agitate?.logic.RUN_LOGIC.steps.flatMap(st => st.actions.map(a => a.expression)).join('\n') ?? '') + ' ' +
    (agitate?.logic.RUN_LOGIC.transitions.map(t => t.condition).join(' ') ?? '')
  const msg = Object.values(agitate?.params ?? {}).find(p => p.kind === 'message' && p.id === 1)
  const done = r && !s.drafts[OP]
  const formulaOk = (name: string, t: number, l: number): boolean => {
    const f = Object.values(r?.formulas ?? {}).find(x => x.name.toUpperCase() === name)
    return !!f && f.operatorCanLoad && f.values.R_BLEND_TIME?.value === t && !f.values.R_BLEND_TIME.useDefault && f.values.R_DRAIN_LEVEL?.value === l && !f.values.R_DRAIN_LEVEL.useDefault
  }
  const answered = s.prompts.find(p => p.answered && p.response === 'Yes')
  const unitsCurrent = (phase: string): boolean => !!s.phaseClasses[phase] && !s.phaseDrafts[phase] && BLENDERS.every(u => s.units[u]?.phases[phase]?.phaseType === 'Controller' &&
    JSON.stringify(s.deployedUnits[u]?.logic[phase]) === JSON.stringify(s.phaseClasses[phase].logic) && JSON.stringify(s.deployedUnits[u]?.params[phase]) === JSON.stringify(s.phaseClasses[phase].params))
  return [
    check('7016-10a-1', !!r && r.level === 'Operation', 'OP_FINISH_500 exists under Recipes > Operations'),
    check('7016-10a-2', !!r && r.steps.length === 2 && r.steps[0].name === 'AGITATE:1' && r.steps[0].phaseClass === 'AGITATE' && r.steps[1].name === 'DRAIN:1' && r.steps[1].phaseClass === 'DRAIN' &&
      /AGITATE:1\/BSTATUS\s*=\s*\$phase_state:Complete/i.test(r.transitions[1]?.condition ?? '') && /DRAIN:1\/BSTATUS\s*=\s*\$phase_state:Complete/i.test(r.transitions[2]?.condition ?? '') &&
      r.equipment.mode === 'Unit' && r.equipment.name === 'UM_BL_500', 'AGITATE:1 and DRAIN:1 steps wait for the phases to complete on unit UM_BL_500'),
    check('7016-10a-3', !!done && r.steps.length > 0, 'OP_FINISH_500 is saved (Recipe Studio has no unsaved changes)'),
    check('7016-10a-4', s.enabled, 'the Batch Executive is enabled'),
    check('7016-10a-5', s.assignedAreas.includes('ED_CENTER_BATCH'), 'ED_CENTER_BATCH is in the Batch Executive Assigned Areas'),
    check('7016-10a-6', s.equipmentAt !== null, 'the ProfessionalPLUS workstation (Batch Executive equipment) is downloaded'),
    check('7016-10a-7', !!r && !!r.product.author.trim() && !!r.product.version.trim(), 'the Product tab has an author and a version'),
    check('7016-10a-8', !!r && !!s.assigned[OP] && !!s.downloaded[OP] && s.downloaded[OP].recipe.steps.length === 2 && s.downloaded[OP].recipe.revision === r.revision && s.verifyRecipe(OP).errors.length === 0,
      'OP_FINISH_500 is assigned, verified and downloaded to the Batch Executive'),

    check('7016-10v-1', text(/Batch Executive service started/), 'the Batch Executive service was started (Batch Application Manager)'),
    check('7016-10v-2', !!s.verify && s.verify.bad === 0 && s.verify.total > 0, `Verify Phases found ${s.verify?.total ?? 0} phases and 0 bad phases`),
    check('7016-10v-3', batchesOf(b => createdVia(b, 'BOI')).length > 0, 'a batch of OP_FINISH_500 was created in the Batch Operator Interface'),
    check('7016-10v-4', batchesOf(b => createdVia(b, 'BOI') && text(new RegExp(`Batch ${b.id} started`)) && text(new RegExp(`UM_BL_500/AGITATE acquired by ${OP} and started \\(batch ${b.id}\\)`))).length > 0,
      'the batch was started and the operation became active (AGITATE acquired and started)'),
    check('7016-10v-5', batchesOf(b => createdVia(b, 'BOI') && b.state === 'COMPLETE' && completed(b) && text(new RegExp(`UM_BL_500/DRAIN acquired by ${OP}.*batch ${b.id}`))).length > 0,
      'the operation completed both phases and the batch state is COMPLETE'),
    check('7016-10v-6', batchesOf(b => createdVia(b, 'Operate') && b.state === 'COMPLETE').length > 0, 'a batch created and started from the DeltaV Operate BatchListView also completed'),

    check('7016-10f-1', s.journal.some(j => j.kind === 'Failure' && /UM_BL_500\/AGITATE/.test(j.text)), 'a phase failure was detected and reported in the Batch Alarm Summary'),
    check('7016-10f-2', text(/Failures cleared on batch/), 'the failures were cleared with Clear Failures'),
    check('7016-10f-3', s.batches.some(b => b.state === 'COMPLETE' && s.journal.some(j => j.kind === 'Failure' && j.batch === b.id) && text(new RegExp(`Failures cleared on batch ${b.id}`)) && text(new RegExp(`Batch ${b.id} restarted`))),
      'the failed batch was restarted and completed'),

    check('7016-10l-1', s.journal.some(j => j.kind === 'Comment' && j.text.startsWith('[BOI]')), 'a comment was submitted to the Electronic Operator Log from the Batch Operator Interface'),
    check('7016-10l-2', s.journal.some(j => j.kind === 'Comment' && j.text.startsWith('[Operate]')), 'a comment was added from the DeltaV Operate BatchListView'),

    check('7016-10o-1', !!msg && /OK to begin agitation\?/.test(String(msg.defaultValue)), 'AGITATE has the phase message "OK to begin agitation?" with Message ID 1'),
    check('7016-10o-2', /REQUEST\.CV'\s*:=\s*3[2-5]01\b/.test(agitateText) && /PROMPT_/.test(agitateText), 'AGITATE RUN_LOGIC requests operator prompt message 1 and waits for the response'),
    check('7016-10o-3', !!msg && unitsCurrent('AGITATE'), 'the AGITATE changes are downloaded to both blender unit modules'),
    check('7016-10o-4', !!s.verify && s.verify.bad === 0 && BLENDERS.every(u => (s.deployedUnits[u]?.at ?? 0) <= s.verify!.at), 'the equipment was downloaded to the Batch Executive (Verify Phases reports 0 bad phases)'),
    check('7016-10o-5', !!answered && s.batches.some(b => b.state === 'COMPLETE' && (b.ended ?? 0) > answered.at && b.id === answered.batch), 'the operator prompt was answered Yes and the phase continued'),

    check('7016-10r-1', r?.params.R_BLEND_TIME?.step === 'AGITATE:1' && r.params.R_BLEND_TIME.phaseParam === 'R_BLEND_TIME', 'R_BLEND_TIME is deferred from AGITATE:1 to the operation'),
    check('7016-10r-2', r?.params.R_DRAIN_LEVEL?.step === 'DRAIN:1' && r.params.R_DRAIN_LEVEL.phaseParam === 'R_DRAIN_LEVEL', 'R_DRAIN_LEVEL is deferred from DRAIN:1 to the operation'),
    check('7016-10r-3', formulaOk('LARGE', 55, 50) && formulaOk('MEDIUM', 45, 75) && formulaOk('SMALL', 30, 100), 'the formulas Large, Medium and Small have the course values and Operator can load'),
    check('7016-10r-4', !!r && !!s.downloaded[OP] && JSON.stringify(s.downloaded[OP].recipe.formulas) === JSON.stringify(r.formulas) && Object.keys(r.formulas).length >= 3, 'OP_FINISH_500 with its formulas is downloaded'),
    check('7016-10r-5', ['LARGE', 'MEDIUM', 'SMALL'].every(f => s.batches.some(b => b.recipe === OP && b.formula?.toUpperCase() === f && b.state === 'COMPLETE')), 'a batch completed with each formula (Large, Medium and Small)'),

    check('7016-10x-1', text(/UM_BL_500\/AGITATE acquired by OPERATOR/), 'AGITATE was acquired manually in the BOI Phase Control screen (owner OPERATOR)'),
    check('7016-10x-2', s.journal.some(j => /Start issued to UM_BL_500\/AGITATE by OPERATOR/.test(j.text) && j.batch !== ''), 'the phase was started manually with a Batch ID'),
    check('7016-10x-3', text(new RegExp(`is waiting to acquire UM_BL_500/AGITATE \\(owned by OPERATOR\\)`)), 'a batch waited to acquire AGITATE while the OPERATOR owned it'),
    check('7016-10x-4', idx(/UM_BL_500\/AGITATE released by OPERATOR/) >= 0 && s.journal.findIndex((j, i) => i > idx(/UM_BL_500\/AGITATE released by OPERATOR/) && new RegExp(`UM_BL_500/AGITATE acquired by ${OP}`).test(j.text)) > idx(/UM_BL_500\/AGITATE released by OPERATOR/),
      'after the OPERATOR released AGITATE the recipe became its owner')
  ]
}
