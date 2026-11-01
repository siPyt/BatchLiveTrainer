// The Chapter 11 workshops (slides 11-7 .. 11-49) through the executive store, as the student does them in Recipe Studio and Explorer.
// Pure data so the engine tests and the walkthrough seed build the same recipes.
const PHASE_DONE = (s, level) => `${s.name}/BSTATUS = ${level === 'Operation' ? '$phase_state:Complete' : '$recipe_state:Complete'}`

function step(name, ref, extra = {}) { return { name, phaseClass: ref, description: '', ...extra } }

/** Creates (or replaces the steps of) a recipe; transitions[i] follows step i unless groups are given. */
function build(c, name, level, equipment, steps, transitionNames, opts = {}) {
  const { X, value } = c
  if (!X().recipes[name]) value(X().newRecipe(name, level))
  value(X().editDraft(name, r => {
    r.steps = steps
    const groups = []
    steps.forEach((s, i) => { const g = s.group ?? i + 1; if (!groups.includes(g)) groups.push(g) })
    r.transitions = [{ name: 'T1', condition: 'TRUE' }, ...groups.map((g, gi) => {
      const members = steps.filter((s, i) => (s.group ?? i + 1) === g)
      return { name: transitionNames[gi], condition: members.map(s => PHASE_DONE(s, level)).join(' AND ') }
    })]
    Object.assign(r, opts)
  }))
  value(X().saveRecipe(name))
  if (equipment) value(X().setRecipeProps(name, { equipment }))
  value(X().setRecipeProps(name, { product: { author: 'STUDENT', version: '1.0' } }))
}

const op = (c, name, equipment, phases, transitionNames, partnered = []) => build(c, name, 'Operation', equipment,
  phases.map(p => step(`${p}:1`, p, partnered.includes(p) ? { partners: 1 } : {})), transitionNames)

/** Slide 11-7. */
exports.operations = c => {
  op(c, 'OP_CHARGE_500', { mode: 'Unit', name: 'UM_BL_500' }, ['CHG_BASE', 'CHG_COLOR'], ['CHG_BASE_DONE', 'CHG_COLOR_DONE'], ['CHG_COLOR'])
  op(c, 'OP_COLOR_100', { mode: 'Unit', name: 'UM_COLOR_100' }, ['FILL', 'DUMP'], ['FILL_DONE', 'DUMP_DONE'], ['DUMP'])
}

/** Slides 11-9 and 11-10. */
exports.unitProcedures = c => {
  build(c, 'UP_BL_500', 'Unit Procedure', { mode: 'Unit', name: 'UM_BL_500' }, [step('OP_CHARGE_500:1', 'OP_CHARGE_500'), step('OP_FINISH_500:1', 'OP_FINISH_500')], ['OP_CHG_COMPLETE', 'OP_FIN_COMPLETE'])
  build(c, 'UP_COLOR_100', 'Unit Procedure', { mode: 'Unit', name: 'UM_COLOR_100' }, [step('OP_COLOR_100:1', 'OP_COLOR_100')], ['OP_CLR_100_COMP'])
}

/** Slides 11-11 and 11-18: UP_COLOR_100 and UP_BL_500 in parallel, and the link group LINK_COLOR. */
exports.paintProcedure = (c, { linkGroup = true, partners = true } = {}) => {
  const { X, value } = c
  build(c, 'PRC_PAINT', 'Procedure', null, [step('UP_COLOR_100:1', 'UP_COLOR_100', { group: 1 }), step('UP_BL_500:1', 'UP_BL_500', { group: 1 })], ['ALL_UP_DONE'],
    { linkGroups: linkGroup ? { LINK_COLOR: ['UP_COLOR_100:1/OP_COLOR_100:1/DUMP:1', 'UP_BL_500:1/OP_CHARGE_500:1/CHG_COLOR:1'] } : {} })
  const wanted = partners ? 1 : 0
  for (const [name, phase] of [['OP_CHARGE_500', 'CHG_COLOR'], ['OP_COLOR_100', 'DUMP'], ['OP_CHARGE', 'CHG_COLOR'], ['OP_COLOR', 'DUMP']]) {
    if (!X().recipes[name]) continue
    value(X().editDraft(name, r => { for (const s of r.steps) if (s.phaseClass === phase) s.partners = wanted }))
    value(X().saveRecipe(name))
  }
}

exports.downloadPaint = c => { const { X, value } = c; value(X().assignRecipe('PRC_PAINT')); value(X().downloadRecipe('PRC_PAINT')) }

const defer = (c, recipe, spec) => {
  const { X, B, value } = c
  value(X().editDraft(recipe, r => {
    for (const [stepName, param, as] of spec) {
      const st = r.steps.find(s => s.name === stepName)
      const child = X().recipes[st.phaseClass]
      const def = child ? child.params[param] : B().phaseClasses[st.phaseClass].params[param]
      const name = as ?? param
      r.params[name] = { name, step: stepName, phaseParam: param, type: def.type, defaultValue: def.defaultValue, low: def.low, high: def.high, units: def.units }
      for (const f of Object.values(r.formulas)) f.values[name] ??= { useDefault: true, value: def.defaultValue }
    }
  }))
  value(X().saveRecipe(recipe))
}
exports.defer = defer

const formula = (c, recipe, name, values) => {
  const { X, value } = c
  value(X().editDraft(recipe, r => {
    r.formulas[name] = { name, operatorCanLoad: true, values: Object.fromEntries(Object.values(r.params).map(p => [p.name, values[p.name] === undefined ? { useDefault: true, value: p.defaultValue } : { useDefault: false, value: values[p.name] }])) }
  }))
  value(X().saveRecipe(recipe))
}
exports.formula = formula

/** Slides 11-21 and 11-22: defer the parameters up the hierarchy and create the PRC_PAINT formulas. */
exports.paintFormulas = c => {
  defer(c, 'OP_COLOR_100', [['FILL:1', 'R_FILL_LEVEL']])
  defer(c, 'OP_CHARGE_500', [['CHG_BASE:1', 'R_BASE_AMNT'], ['CHG_BASE:1', 'R_BASE_RATE'], ['CHG_COLOR:1', 'R_CLR_AMNT']])
  defer(c, 'UP_BL_500', [['OP_CHARGE_500:1', 'R_BASE_AMNT'], ['OP_CHARGE_500:1', 'R_BASE_RATE'], ['OP_CHARGE_500:1', 'R_CLR_AMNT'], ['OP_FINISH_500:1', 'R_BLEND_TIME'], ['OP_FINISH_500:1', 'R_DRAIN_LEVEL']])
  defer(c, 'UP_COLOR_100', [['OP_COLOR_100:1', 'R_FILL_LEVEL']])
  defer(c, 'PRC_PAINT', [['UP_BL_500:1', 'R_BASE_AMNT'], ['UP_BL_500:1', 'R_BASE_RATE'], ['UP_BL_500:1', 'R_CLR_AMNT'], ['UP_BL_500:1', 'R_BLEND_TIME'], ['UP_BL_500:1', 'R_DRAIN_LEVEL'], ['UP_COLOR_100:1', 'R_FILL_LEVEL']])
  formula(c, 'PRC_PAINT', 'Sky Blue', { R_BASE_AMNT: 100, R_BASE_RATE: 80, R_CLR_AMNT: 50, R_BLEND_TIME: 20, R_DRAIN_LEVEL: 100, R_FILL_LEVEL: 200 })
  formula(c, 'PRC_PAINT', 'Baby Blue', { R_BASE_AMNT: 80, R_BASE_RATE: 90, R_CLR_AMNT: 30, R_BLEND_TIME: 15, R_DRAIN_LEVEL: 75, R_FILL_LEVEL: 150 })
  formula(c, 'PRC_PAINT', 'Navy Blue', { R_BASE_AMNT: 120, R_BASE_RATE: 60, R_CLR_AMNT: 70, R_BLEND_TIME: 25, R_DRAIN_LEVEL: 120, R_FILL_LEVEL: 250 })
  exports.downloadPaint(c)
}

/** Slide 11-27: rename the recipes and make them unit class based. */
exports.classBased = c => {
  const { X, value } = c
  for (const [from, to] of [['UP_BL_500', 'UP_BLEND'], ['UP_COLOR_100', 'UP_COLOR'], ['OP_CHARGE_500', 'OP_CHARGE'], ['OP_FINISH_500', 'OP_FINISH'], ['OP_COLOR_100', 'OP_COLOR']]) value(X().renameRecipe(from, to))
  for (const [n, cls] of [['UP_BLEND', 'BLENDERS'], ['OP_CHARGE', 'BLENDERS'], ['OP_FINISH', 'BLENDERS'], ['UP_COLOR', 'COLORTANKS'], ['OP_COLOR', 'COLORTANKS']]) value(X().setRecipeProps(n, { equipment: { mode: 'Unit Class', name: cls } }))
  exports.downloadPaint(c)
}

/** Slides 11-33 .. 11-48: PRC_MIX_COLORS with the BLENDER unit alias, three link groups and the GREEN / ORANGE / PURPLE formulas. */
exports.mixColors = c => {
  const { X, value } = c
  op(c, 'OP_CHG_COLOR', { mode: 'Unit Class', name: 'BLENDERS' }, ['CHG_COLOR'], ['CHG_COLOR_DONE'], ['CHG_COLOR'])
  op(c, 'OP_CHG_BASE', { mode: 'Unit Class', name: 'BLENDERS' }, ['CHG_BASE'], ['CHG_BASE_DONE'])
  for (const n of [100, 200, 300]) op(c, `OP_COLOR_${n}`, { mode: 'Unit', name: `UM_COLOR_${n}` }, ['FILL', 'DUMP'], ['FILL_DONE', 'DUMP_DONE'], ['DUMP'])
  build(c, 'UP_CHG_COLOR', 'Unit Procedure', { mode: 'Unit Class', name: 'BLENDERS' }, [step('OP_CHG_COLOR:1', 'OP_CHG_COLOR')], ['OP_CHG_COLOR_DONE'])
  build(c, 'UP_CHG_BASE', 'Unit Procedure', { mode: 'Unit Class', name: 'BLENDERS' }, [step('OP_CHG_BASE:1', 'OP_CHG_BASE')], ['OP_CHG_BASE_DONE'])
  for (const n of [100, 200, 300]) build(c, `UP_COLOR_${n}`, 'Unit Procedure', { mode: 'Unit', name: `UM_COLOR_${n}` }, [step(`OP_COLOR_${n}:1`, `OP_COLOR_${n}`)], [`OP_CLR_${n}_COMP`])
  build(c, 'UP_FINISH', 'Unit Procedure', { mode: 'Unit Class', name: 'BLENDERS' }, [step('OP_FINISH:1', 'OP_FINISH')], ['OP_FINISH_DONE'])
  value(X().newRecipe('PRC_MIX_COLORS', 'Procedure'))
  const alias = { unitAlias: 'BLENDER', retainUnit: true }
  build(c, 'PRC_MIX_COLORS', 'Procedure', null, [
    step('UP_CHG_BASE:1', 'UP_CHG_BASE', { group: 1, ...alias }),
    step('UP_COLOR_100:1', 'UP_COLOR_100', { group: 2 }), step('UP_CHG_COLOR:1', 'UP_CHG_COLOR', { group: 2, ...alias }),
    step('UP_COLOR_200:1', 'UP_COLOR_200', { group: 3 }), step('UP_CHG_COLOR:2', 'UP_CHG_COLOR', { group: 3, ...alias }),
    step('UP_COLOR_300:1', 'UP_COLOR_300', { group: 4 }), step('UP_CHG_COLOR:3', 'UP_CHG_COLOR', { group: 4, ...alias }),
    step('UP_FINISH:1', 'UP_FINISH', { group: 5, ...alias })
  ], ['UP_CHG_BASE_DONE', '100_ALL_DONE', '200_ALL_DONE', '300_ALL_DONE', 'UP_FINISH_DONE'], {
    aliases: { BLENDER: { name: 'BLENDER', unitClass: 'BLENDERS', resolution: 'Defer', unit: '' } },
    linkGroups: Object.fromEntries([100, 200, 300].map((n, i) => [`COLOR_${n}`, [`UP_CHG_COLOR:${i + 1}/OP_CHG_COLOR:1/CHG_COLOR:1`, `UP_COLOR_${n}:1/OP_COLOR_${n}:1/DUMP:1`]]))
  })
  // Slides 11-42 .. 11-44: defer the parameters up the hierarchy.
  defer(c, 'OP_CHG_COLOR', [['CHG_COLOR:1', 'R_CLR_AMNT']])
  defer(c, 'OP_CHG_BASE', [['CHG_BASE:1', 'R_BASE_AMNT'], ['CHG_BASE:1', 'R_BASE_RATE']])
  for (const n of [100, 200, 300]) { defer(c, `OP_COLOR_${n}`, [['FILL:1', 'R_FILL_LEVEL']]); defer(c, `UP_COLOR_${n}`, [[`OP_COLOR_${n}:1`, 'R_FILL_LEVEL']]) }
  defer(c, 'UP_CHG_COLOR', [['OP_CHG_COLOR:1', 'R_CLR_AMNT']])
  defer(c, 'UP_CHG_BASE', [['OP_CHG_BASE:1', 'R_BASE_AMNT'], ['OP_CHG_BASE:1', 'R_BASE_RATE']])
  defer(c, 'UP_FINISH', [['OP_FINISH:1', 'R_BLEND_TIME'], ['OP_FINISH:1', 'R_DRAIN_LEVEL']])
  defer(c, 'PRC_MIX_COLORS', [['UP_CHG_BASE:1', 'R_BASE_AMNT'], ['UP_CHG_BASE:1', 'R_BASE_RATE'], ['UP_COLOR_100:1', 'R_FILL_LEVEL', 'R_FILL_LEVEL_100'], ['UP_COLOR_200:1', 'R_FILL_LEVEL', 'R_FILL_LEVEL_200'],
    ['UP_COLOR_300:1', 'R_FILL_LEVEL', 'R_FILL_LEVEL_300'], ['UP_CHG_COLOR:1', 'R_CLR_AMNT', 'R_CLR_AMNT_100'], ['UP_CHG_COLOR:2', 'R_CLR_AMNT', 'R_CLR_AMNT_200'], ['UP_CHG_COLOR:3', 'R_CLR_AMNT', 'R_CLR_AMNT_300'],
    ['UP_FINISH:1', 'R_BLEND_TIME'], ['UP_FINISH:1', 'R_DRAIN_LEVEL']])
  // Slide 11-45 (GREEN, ORANGE, PURPLE).
  const f = (a, b, d) => ({ R_BASE_AMNT: 200, R_BASE_RATE: 75, R_BLEND_TIME: 30, R_DRAIN_LEVEL: 250, R_CLR_AMNT_100: a, R_CLR_AMNT_200: b, R_CLR_AMNT_300: d, R_FILL_LEVEL_100: a, R_FILL_LEVEL_200: b, R_FILL_LEVEL_300: d })
  formula(c, 'PRC_MIX_COLORS', 'GREEN', f(100, 0, 100))
  formula(c, 'PRC_MIX_COLORS', 'ORANGE', f(0, 100, 100))
  formula(c, 'PRC_MIX_COLORS', 'PURPLE', f(100, 100, 0))
}

exports.downloadMix = c => { const { X, value } = c; value(X().assignRecipe('PRC_MIX_COLORS')); value(X().downloadRecipe('PRC_MIX_COLORS')) }
