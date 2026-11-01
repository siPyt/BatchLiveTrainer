import type { StepCheck } from './workshopChecks'
import type { Ch10State } from './course7016Ch10Checks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const BLENDERS = ['UM_BL_500', 'UM_BL_600']

export type Ch12State = Ch10State & {
  unitClasses: Record<string, { params?: Record<string, { name: string; type: string }> }>
  unitParamValues: Record<string, Record<string, boolean | number | string>>
}

/** Course 7016 Chapter 12 (pp 12-9 .. 12-19): dynamic references, operator prompts, a Unit Parameter Definition and the OP_FINISH loop. */
export function checkCourse7016Ch12(s: Ch12State): StepCheck[] {
  const agitate = s.phaseClasses.AGITATE
  const run = agitate?.logic.RUN_LOGIC
  const exprs = (run?.steps.flatMap(st => st.actions.map(a => a.expression)) ?? []).join('\n')
  const conds = (run?.transitions.map(t => t.condition) ?? []).concat(run?.routes?.map(r => r.condition) ?? []).join('\n')
  const all = `${exprs}\n${conds}`
  const dyn = (n: string): boolean => agitate?.params[n]?.kind === 'algorithm' && agitate.params[n].type === 'Dynamic Reference'
  const message = (id: number, re: RegExp): boolean => Object.values(agitate?.params ?? {}).some(p => p.kind === 'message' && p.id === id && re.test(String(p.defaultValue)))
  const saved = !!agitate && !s.phaseDrafts.AGITATE
  const finish = s.recipes.OP_FINISH_500 ?? s.recipes.OP_FINISH
  const finishName = finish?.name ?? ''
  const agitateStep = finish?.steps.find(x => x.phaseClass === 'AGITATE')
  const loop = finish?.branches?.find(b => agitateStep && b.from === agitateStep.name && b.to === agitateStep.name)
  const agitateIdx = finish && agitateStep ? finish.steps.indexOf(agitateStep) + 1 : 0
  const trunk = finish?.transitions[agitateIdx]?.condition ?? ''
  const unitsCurrent = saved && BLENDERS.every(u => JSON.stringify(s.deployedUnits[u]?.logic.AGITATE) === JSON.stringify(agitate.logic) &&
    JSON.stringify(s.deployedUnits[u]?.params.AGITATE) === JSON.stringify(agitate.params))
  const text = (re: RegExp): boolean => s.journal.some(j => re.test(j.text))
  const roots = s.batches.filter(b => !b.parent && /^OP_FINISH/.test(b.recipe))
  const completed = roots.filter(b => b.state === 'COMPLETE')
  const answered = (kind: string, re?: RegExp): boolean => s.prompts.some(p => p.answered && p.kind === kind && (!re || re.test(p.response)))
  return [
    check('7016-12a-1', dyn('DYN_CLR_VLV_SP') && dyn('DYN_CLR_VLV_PV') && dyn('DYN_CLR_VLV_MODE'), 'AGITATE has the Dynamic Reference algorithm parameters DYN_CLR_VLV_SP, DYN_CLR_VLV_PV and DYN_CLR_VLV_MODE'),
    check('7016-12a-2', message(1, /add more color/i) && message(2, /which color/i) && message(3, /how much color/i), 'AGITATE has the three phase messages: add more color, which color and how much color'),
    check('7016-12a-3', s.unitClasses.BLENDERS?.params?.AGITATE_AGAIN?.type === 'Boolean', 'the BLENDERS unit class has the Boolean Unit Parameter Definition AGITATE_AGAIN'),

    check('7016-12a-4', saved && /STEP_INDEX\.CV'\s*:=\s*6/.test(exprs) && /REQUEST\.CV'\s*:=\s*34\d\d/.test(exprs) && /PROMPT_BOOL\.CV'\s*=\s*(TRUE|1)/i.test(conds) &&
      /PROMPT_BOOL\.CV'\s*=\s*(FALSE|0)/i.test(conds), 'RESET_EQUIP sets STEP_INDEX to 6 and a Boolean prompt asks whether to add more color; YES and NO transitions follow'),
    check('7016-12a-5', /REQUEST\.CV'\s*:=\s*32\d\d/.test(exprs) && /AGITATE_AGAIN'\s*:=\s*(TRUE|1)/i.test(exprs) && /AGITATE_AGAIN'\s*:=\s*(FALSE|0)/i.test(exprs) && /UNIT/.test(exprs),
      'YES: an integer prompt picks the color tank and AGITATE_AGAIN is set TRUE for the unit in use; NO: AGITATE_AGAIN is set FALSE'),
    check('7016-12a-6', /REQUEST\.CV'\s*:=\s*40\d\d/.test(exprs) && ['DYN_CLR_VLV_MODE', 'DYN_CLR_VLV_SP', 'DYN_CLR_VLV_PV'].every(n => new RegExp(`${n}\\.\\$REF'\\s*:=\\s*SELSTR`, 'i').test(exprs)),
      'COLOR_HEADER is acquired and the path of each dynamic reference is set with SELSTR from the integer response'),
    check('7016-12a-7', ['DYN_CLR_VLV_MODE', 'DYN_CLR_VLV_SP', 'DYN_CLR_VLV_PV'].every(n => new RegExp(`${n}\\.CST'\\s*=\\s*0`).test(conds)) && /REQUEST\.CV'\s*=\s*0/.test(conds),
      'a transition waits for REQUEST = 0 and CST = 0 of all three dynamic references'),
    check('7016-12a-8', /REQUEST\.CV'\s*:=\s*33\d\d/.test(exprs) && /INIT_LEVEL\.CV'\s*:=/.test(exprs) && /DYN_CLR_VLV_MODE\.TARGET'\s*:=\s*CAS/i.test(exprs) && /DYN_CLR_VLV_SP\.CV'\s*:=/.test(exprs) &&
      /A_COMMAND\.CV'\s*:=\s*'EM-vlvnc-2stage:Dribble/i.test(exprs) && /DYN_CLR_VLV_PV\.CV'/.test(conds) && /PROMPT_FLOAT\.CV'/.test(conds),
      'a float prompt asks how much; the valves are opened (MODE CAS, SP open, BLNDR_COLOR Dribble) and the level is waited for'),
    check('7016-12a-9', /DYN_CLR_VLV_SP\.CV'\s*:=\s*'vlvnc-sp:CLOSE/i.test(exprs) && /A_COMMAND\.CV'\s*:=\s*'EM-vlvnc-2stage:Close/i.test(exprs) && /REQUEST\.CV'\s*:=\s*42\d\d/.test(exprs) &&
      /DYN_CLR_VLV_MODE\.TARGET'\s*:=\s*AUTO/i.test(exprs) && /STEP_INDEX\.CV'\s*:=\s*0/.test(exprs), 'the valves are closed, COLOR_HEADER released, the modes returned to AUTO and STEP_INDEX set to 0'),

    check('7016-12b-1', !!finish && !!agitateStep && !!loop && /AGITATE_AGAIN'?\s*=\s*1/.test(loop.condition) && /BSTATUS/.test(loop.condition), `${finishName || 'OP_FINISH_500'} has a transition after AGITATE that goes back to AGITATE when AGITATE_AGAIN = 1`),
    check('7016-12b-2', /BSTATUS/.test(trunk) && /AGITATE_AGAIN'?\s*=\s*0/.test(trunk), 'the transition to DRAIN waits for AGITATE to be complete and AGITATE_AGAIN = 0'),

    check('7016-12v-1', unitsCurrent && !!finish && !s.drafts[finishName] && !!s.downloaded[finishName] && s.downloaded[finishName].recipe.revision === finish.revision &&
      !!s.downloaded[finishName].recipe.branches?.length, 'Step 1. AGITATE is downloaded to both blender unit modules and the modified OP_FINISH_500 to the Batch Executive'),
    check('7016-12v-2', completed.length > 0 && text(/AGITATE acquired/), 'Step 2. A batch of OP_FINISH_500 ran to COMPLETE'),
    check('7016-12v-3', answered('Integer', /^1$/) && answered('Integer', /^2$/) && answered('Integer', /^3$/) && answered('Float'), 'Step 3. More color was added from Color_100, Color_200 and Color_300 (integer responses 1, 2 and 3 and a float amount)'),
    check('7016-12v-4', roots.some(b => (s.journal.filter(j => j.batch === b.id && /AGITATE acquired/.test(j.text)).length >= 2) && text(/returns \S+ to AGITATE/)), 'Step 4. AGITATE ran again when more color was added'),
    check('7016-12v-5', completed.some(b => s.journal.filter(j => j.batch === b.id && /AGITATE acquired/.test(j.text)).length === 1) && answered('Boolean', /^No$/), 'Step 5. AGITATE did not run again when no additional color was added')
  ]
}
