import type { ExecutiveState, Recipe } from './executive'
import { stepGroups } from './executive'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** Course 7016 Chapter 11 (pp 11-7 .. 11-49): operations, unit procedures, procedures, link groups, formulas, class-based recipes and unit aliasing. */
export function checkCourse7016Ch11(s: ExecutiveState): StepCheck[] {
  const rec = (...names: string[]): Recipe | undefined => names.map(n => s.recipes[n]).find(Boolean)
  const refs = (r: Recipe | undefined): string[] => r?.steps.map(x => x.phaseClass) ?? []
  const either = (list: string[], ...alts: string[][]): boolean => alts.some(a => a.length === list.length && a.every((n, i) => n === list[i]))
  const saved = (n: string): boolean => !!s.recipes[n] && !s.drafts[n]
  const text = (re: RegExp): boolean => s.journal.some(j => re.test(j.text))
  const roots = s.batches.filter(b => !b.parent)
  const doneBatch = (recipe: string, formula?: string): boolean => roots.some(b => b.recipe === recipe && b.state === 'COMPLETE' && (!formula || b.formula?.toUpperCase() === formula.toUpperCase()))
  const unitClass = (r: Recipe | undefined, cls: string): boolean => r?.equipment.mode === 'Unit Class' && r.equipment.name === cls

  const charge = rec('OP_CHARGE_500', 'OP_CHARGE'), color100 = rec('OP_COLOR_100', 'OP_COLOR')
  const upBl = rec('UP_BL_500', 'UP_BLEND'), upColor = rec('UP_COLOR_100', 'UP_COLOR')
  const paint = s.recipes.PRC_PAINT
  const g = paint ? stepGroups(paint) : []
  const paintParams = Object.keys(paint?.params ?? {}).sort().join()
  const paintFormulas = Object.values(paint?.formulas ?? {})
  const mix = s.recipes.PRC_MIX_COLORS
  const mixGroups = mix ? stepGroups(mix) : []
  const mixF = (n: string, v: Record<string, number>): boolean => {
    const f = Object.values(mix?.formulas ?? {}).find(x => x.name.toUpperCase() === n)
    return !!f && f.operatorCanLoad && Object.entries(v).every(([k, x]) => f.values[k]?.value === x && !f.values[k].useDefault)
  }
  const downloadedCurrent = (n: string): boolean => !!s.recipes[n] && !s.drafts[n] && !!s.downloaded[n] && s.downloaded[n].recipe.revision === s.recipes[n].revision
  const boundPrompted = (id: string): boolean => text(new RegExp(`Operator bound #BLENDER# to \\S+ for batch ${id}`))
  const mixBatch = (deferred: boolean): boolean => roots.some(b => b.recipe === 'PRC_MIX_COLORS' && b.state === 'COMPLETE' && (deferred ? boundPrompted(b.id) : !!b.bindings?.['#BLENDER#'] && !boundPrompted(b.id)))

  return [
    check('7016-11a-1', !!charge && charge.level === 'Operation' && saved(charge.name) && refs(charge).join() === 'CHG_BASE,CHG_COLOR' && (charge.equipment.name === 'UM_BL_500' || unitClass(charge, 'BLENDERS')), 'OP_CHARGE_500 runs CHG_BASE then CHG_COLOR on UM_BL_500'),
    check('7016-11a-2', !!color100 && color100.level === 'Operation' && saved(color100.name) && refs(color100).join() === 'FILL,DUMP' && (color100.equipment.name === 'UM_COLOR_100' || unitClass(color100, 'COLORTANKS')), 'OP_COLOR_100 runs FILL then DUMP on UM_COLOR_100'),

    check('7016-11u-1', !!upBl && upBl.level === 'Unit Procedure' && saved(upBl.name) && either(refs(upBl), ['OP_CHARGE_500', 'OP_FINISH_500'], ['OP_CHARGE', 'OP_FINISH']) && upBl.steps.length === 2 &&
      upBl.transitions.length === 3, 'UP_BL_500 runs OP_CHARGE_500 and then OP_FINISH_500 with a transition after each'),
    check('7016-11u-2', !!upColor && upColor.level === 'Unit Procedure' && saved(upColor.name) && either(refs(upColor), ['OP_COLOR_100'], ['OP_COLOR']) && (upColor.equipment.name === 'UM_COLOR_100' || unitClass(upColor, 'COLORTANKS')), 'UP_COLOR_100 runs OP_COLOR_100 on UM_COLOR_100'),

    check('7016-11p-1', !!paint && paint.level === 'Procedure' && g.length === 1 && g[0].length === 2 && either(refs(paint).slice().sort(), ['UP_COLOR_100', 'UP_BL_500'].sort(), ['UP_BLEND', 'UP_COLOR']) &&
      (paint.transitions[1]?.condition.match(/\$recipe_state:Complete/g)?.length ?? 0) === 2, 'PRC_PAINT starts UP_COLOR_100 and UP_BL_500 together and waits for both unit procedures'),
    check('7016-11p-2', !!paint && Object.entries(paint.linkGroups ?? {}).some(([name, m]) => name === 'LINK_COLOR' && m.length === 2 && m.some(x => /DUMP/.test(x)) && m.some(x => /CHG_COLOR/.test(x))), 'the link group LINK_COLOR contains DUMP and CHG_COLOR'),
    check('7016-11p-3', ['OP_CHARGE_500', 'OP_CHARGE'].some(n => s.recipes[n]?.steps.some(x => x.phaseClass === 'CHG_COLOR' && (x.partners ?? 0) >= 1)) && ['OP_COLOR_100', 'OP_COLOR'].some(n => s.recipes[n]?.steps.some(x => x.phaseClass === 'DUMP' && (x.partners ?? 0) >= 1)),
      'DUMP and CHG_COLOR each have one phase partner defined'),
    check('7016-11p-4', !!paint && !s.drafts.PRC_PAINT && !!s.assigned.PRC_PAINT && !!s.downloaded.PRC_PAINT, 'PRC_PAINT is saved, assigned and downloaded to the Batch Executive (with the recipes it contains)'),
    check('7016-11p-5', roots.some(b => b.recipe === 'PRC_PAINT' && b.state === 'COMPLETE') && text(/UM_COLOR_100\/DUMP acquired/) && text(/UM_BL_500\/CHG_COLOR acquired/) && text(/UM_BL_500\/DRAIN acquired/), 'a batch of PRC_PAINT ran every phase to COMPLETE on both units'),

    check('7016-11f-1', ['OP_COLOR_100', 'OP_COLOR'].some(n => s.recipes[n]?.params.R_FILL_LEVEL?.step === 'FILL:1') && ['OP_CHARGE_500', 'OP_CHARGE'].some(n => Object.keys(s.recipes[n]?.params ?? {}).sort().join() === 'R_BASE_AMNT,R_BASE_RATE,R_CLR_AMNT'),
      'the phase batch input parameters are deferred to OP_COLOR_100 and OP_CHARGE_500'),
    check('7016-11f-2', Object.keys(rec('UP_BL_500', 'UP_BLEND')?.params ?? {}).sort().join() === 'R_BASE_AMNT,R_BASE_RATE,R_BLEND_TIME,R_CLR_AMNT,R_DRAIN_LEVEL' && !!rec('UP_COLOR_100', 'UP_COLOR')?.params.R_FILL_LEVEL,
      'the operation parameters are deferred to UP_BL_500 and UP_COLOR_100'),
    check('7016-11f-3', paintParams === 'R_BASE_AMNT,R_BASE_RATE,R_BLEND_TIME,R_CLR_AMNT,R_DRAIN_LEVEL,R_FILL_LEVEL' && paintFormulas.length >= 2 && paintFormulas.every(f => f.operatorCanLoad && Object.values(f.values).some(v => !v.useDefault)),
      'PRC_PAINT has the six recipe parameters and formulas of your own with Operator can load'),
    check('7016-11f-4', !!paint && !!s.downloaded.PRC_PAINT && JSON.stringify(s.downloaded.PRC_PAINT.recipe.formulas) === JSON.stringify(paint.formulas) && paintFormulas.length >= 2 && paintFormulas.every(f => doneBatch('PRC_PAINT', f.name)),
      'PRC_PAINT with its formulas is downloaded and a batch of each formula completed'),

    check('7016-11c-1', ['UP_BLEND', 'UP_COLOR', 'OP_CHARGE', 'OP_FINISH', 'OP_COLOR'].every(n => !!s.recipes[n]) && ['UP_BL_500', 'OP_CHARGE_500', 'OP_FINISH_500'].every(n => !s.recipes[n]), 'the recipes were renamed UP_BLEND, UP_COLOR, OP_CHARGE, OP_FINISH and OP_COLOR'),
    check('7016-11c-2', ['UP_BLEND', 'OP_CHARGE', 'OP_FINISH'].every(n => unitClass(s.recipes[n], 'BLENDERS')) && ['UP_COLOR', 'OP_COLOR'].every(n => unitClass(s.recipes[n], 'COLORTANKS')), 'every renamed recipe uses its Unit Class (BLENDERS or COLORTANKS)'),
    check('7016-11c-3', !!s.downloaded.PRC_PAINT && s.downloaded.PRC_PAINT.recipe.steps.some(x => x.phaseClass === 'UP_BLEND') && roots.some(b => b.recipe === 'PRC_PAINT' && b.state === 'COMPLETE' && !!b.bindings?.BLENDERS && !!b.bindings.COLORTANKS && !text(new RegExp(`Operator bound \\S+ to \\S+ for batch ${b.id}`))),
      'a class-based PRC_PAINT batch completed with the blender and color unit chosen when the batch was created'),
    check('7016-11c-4', roots.some(b => b.recipe === 'PRC_PAINT' && b.state === 'COMPLETE' && text(new RegExp(`Operator bound BLENDERS to \\S+ for batch ${b.id}`)) && text(new RegExp(`Operator bound COLORTANKS to \\S+ for batch ${b.id}`))),
      'a class-based PRC_PAINT batch completed with the units bound when the operator was prompted'),

    check('7016-11m-1', ['OP_CHG_COLOR', 'OP_CHG_BASE'].every(n => unitClass(s.recipes[n], 'BLENDERS') && saved(n)) && [100, 200, 300].every(n => s.recipes[`OP_COLOR_${n}`]?.equipment.name === `UM_COLOR_${n}` && refs(s.recipes[`OP_COLOR_${n}`]).join() === 'FILL,DUMP'),
      'the operations OP_CHG_COLOR, OP_CHG_BASE (BLENDERS) and OP_COLOR_100/200/300 exist'),
    check('7016-11m-2', ['UP_CHG_COLOR', 'UP_CHG_BASE', 'UP_FINISH'].every(n => unitClass(s.recipes[n], 'BLENDERS') && saved(n)) && [100, 200, 300].every(n => s.recipes[`UP_COLOR_${n}`]?.equipment.name === `UM_COLOR_${n}` && refs(s.recipes[`UP_COLOR_${n}`]).join() === `OP_COLOR_${n}`),
      'the unit procedures UP_CHG_COLOR, UP_CHG_BASE, UP_FINISH and UP_COLOR_100/200/300 exist'),
    check('7016-11m-3', !!mix && mix.level === 'Procedure' && mix.aliases?.BLENDER?.unitClass === 'BLENDERS' && mixGroups.length === 5 && mix.steps.filter(x => x.unitAlias === 'BLENDER').length === 5 &&
      mix.steps.filter(x => x.phaseClass === 'UP_CHG_COLOR').length === 3, 'PRC_MIX_COLORS has the unit alias BLENDER on the five blender unit procedure steps'),
    check('7016-11m-4', !!mix && ['COLOR_100', 'COLOR_200', 'COLOR_300'].every(n => (mix.linkGroups?.[n]?.length ?? 0) === 2), 'the link groups COLOR_100, COLOR_200 and COLOR_300 each pair CHG_COLOR with DUMP'),
    check('7016-11m-5', mixF('GREEN', { R_BASE_AMNT: 200, R_BASE_RATE: 75, R_BLEND_TIME: 30, R_CLR_AMNT_100: 100, R_CLR_AMNT_200: 0, R_CLR_AMNT_300: 100, R_DRAIN_LEVEL: 250, R_FILL_LEVEL_100: 100, R_FILL_LEVEL_200: 0, R_FILL_LEVEL_300: 100 }) &&
      mixF('ORANGE', { R_CLR_AMNT_100: 0, R_CLR_AMNT_200: 100, R_CLR_AMNT_300: 100 }) && mixF('PURPLE', { R_CLR_AMNT_100: 100, R_CLR_AMNT_200: 100, R_CLR_AMNT_300: 0 }), 'the formulas GREEN, ORANGE and PURPLE have the values of slide 11-45'),
    check('7016-11m-6', downloadedCurrent('PRC_MIX_COLORS') && mixBatch(false), 'PRC_MIX_COLORS is downloaded and a batch with #BLENDER# bound at creation completed'),
    check('7016-11m-7', mixBatch(true), 'a PRC_MIX_COLORS batch with #BLENDER# deferred completed after the operator bound it when prompted')
  ]
}
