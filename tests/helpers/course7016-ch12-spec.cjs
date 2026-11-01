// Course 7016 Chapter 12 workshop (slides 12-9 .. 12-19): dynamic references, operator prompts, the AGITATE_AGAIN unit parameter, the
// modified AGITATE logic and the OP_FINISH loop. Pure data plus a store-level builder, so the engine tests and the browser
// automation that authors the same thing through Explorer / Control Studio / Recipe Studio agree.
const alias = (name, p) => `'//#${name}#/${p}'`
const A = (expression, extra = {}) => ({ expression, qualifier: 'P', ...extra })
const REQUEST = n => `'^/REQUEST.CV' := ${n};`
const WAIT_REQUEST = "'^/REQUEST.CV' = 0"
const HEADER_ID = 20
const DYN = ['DYN_CLR_VLV_MODE', 'DYN_CLR_VLV_SP', 'DYN_CLR_VLV_PV']
const PATH = { DYN_CLR_VLV_MODE: 'MODE', DYN_CLR_VLV_SP: 'CAS_SP', DYN_CLR_VLV_PV: 'PV' }
const SELSTR = name => `SELSTR('^/PROMPT_INT.CV', "//XV-102/${PATH[name]}", "//XV-202/${PATH[name]}", "//XV-302/${PATH[name]}", "", "")`
const BLNDR_CMD = state => `${alias('BLNDR_COLOR', 'A_COMMAND.CV')} := 'EM-vlvnc-2stage:${state}';`
const BLNDR_PV = state => `${alias('BLNDR_COLOR', 'A_PV.CV')} = 'EM-vlvnc-2stage:${state}'`
const UNIT_AGAIN = "'//^/UNIT.CV/AGITATE_AGAIN'"

const MESSAGES = [
  { name: 'ADD_COLOR_MSG', id: 1, text: 'Add more color???' },
  { name: 'WHICH_COLOR_MSG', id: 2, text: 'Which color - Enter 1 for Color_100, 2 for Color_200, or 3 for Color_300' },
  { name: 'HOW_MUCH_MSG', id: 3, text: 'How much color do you want to add? (in gallons)' }
]

// Steps added after RESET_EQUIP, in trunk order (slides 12-12 .. 12-17).
const NEW_STEPS = [
  { name: 'ADD_MORE_COLOR', actions: [A(REQUEST(3401))], transition: { name: 'YES2', condition: `${WAIT_REQUEST} AND '^/PROMPT_BOOL.CV' = TRUE` } },
  { name: 'WHICH_COLOR', actions: [A(REQUEST(3202)), A(`${UNIT_AGAIN} := TRUE;`)], transition: { name: 'REQ_RCVD1', condition: WAIT_REQUEST } },
  { name: 'ASSIGN_DYN_REF', actions: [A(REQUEST(4000 + HEADER_ID)), ...DYN.map(n => A(`'^/${n}.$REF' := ${SELSTR(n)};`))],
    transition: { name: 'REQ_AND_CST', condition: `${WAIT_REQUEST} AND ${DYN.map(n => `'^/${n}.CST' = 0`).join(' AND ')}` } },
  { name: 'HOW_MUCH', actions: [A(REQUEST(3303))], transition: { name: 'REQ_RCVD2', condition: WAIT_REQUEST } },
  { name: 'OPEN_COLOR_VLVS', actions: [A("'^/INIT_LEVEL.CV' := '//#TANK_LEVEL#';"), A("'^/DYN_CLR_VLV_MODE.TARGET' := CAS;"), A("'^/DYN_CLR_VLV_SP.CV' := 'vlvnc-sp:OPEN';"), A(BLNDR_CMD('Dribble'))],
    transition: { name: 'VLVS_CNFRMD_OPEN', condition: `${BLNDR_PV('Dribble')} AND '^/DYN_CLR_VLV_PV.CV' = 'vlvnc-pv:OPEN'` } },
  { name: 'NULL_WAIT_STEP', actions: [], transition: { name: 'WU_LEVEL_MET', condition: "'//#TANK_LEVEL#' >= '^/INIT_LEVEL.CV' + '^/PROMPT_FLOAT.CV'" } },
  { name: 'CLOSE_CLR_VLVS', actions: [A("'^/DYN_CLR_VLV_SP.CV' := 'vlvnc-sp:CLOSE';"), A(BLNDR_CMD('Close')),
    A(REQUEST(4200 + HEADER_ID), { delayExpression: `${BLNDR_PV('Close')} AND '^/DYN_CLR_VLV_PV.CV' = 'vlvnc-pv:CLOSED'` }),
    A("'^/DYN_CLR_VLV_MODE.TARGET' := AUTO;", { delayExpression: "'^/DYN_CLR_VLV_PV.CV' = 'vlvnc-pv:CLOSED'" }),
    A(BLNDR_CMD('Auto Mode'), { delayExpression: BLNDR_PV('Close') })],
    transition: { name: 'COLOR_IN_CLOSED', condition: `${BLNDR_PV('Auto Mode')} AND '^/DYN_CLR_VLV_MODE.ACTUAL' = AUTO AND ${WAIT_REQUEST}` } },
  { name: 'MODES_AUTO', actions: [A("'^/STEP_INDEX.CV' := 0;"), ...['AGITATOR_STOPPED', 'PRODUCT_VLV_OPEN', 'WASTE_VLV_OPEN', 'BASE_VLV_OPEN', 'COLOR_VLV_OPEN'].map(n => A(`'^/FAIL_MONITOR/${n}/DISABLE.CV' := 1;`))],
    transition: { name: 'AGITATE_COMPLETE', condition: 'TRUE' } }
]
const NO_LEG = { step: { name: 'NO_AGITATE_AGAIN', actions: [A(`${UNIT_AGAIN} := FALSE;`)] }, branch: { name: 'NO2', condition: `${WAIT_REQUEST} AND '^/PROMPT_BOOL.CV' = FALSE` },
  transition: { name: 'TRUE1', condition: 'TRUE' } }

// OP_FINISH: after AGITATE, loop back when AGITATE_AGAIN is 1 (slide 12-18).
const FINISH_LOOP = { name: 'AGITATE_AGAIN_T', from: 'AGITATE:1', to: 'AGITATE:1',
  condition: "'AGITATE:1/BSTATUS' = '$phase_state:Complete' AND 'BLENDERS/AGITATE_AGAIN' = 1" }
const FINISH_TRUNK = { name: 'AGITATE_COMPLETE', condition: "'AGITATE:1/BSTATUS' = '$phase_state:Complete' AND 'BLENDERS/AGITATE_AGAIN' = 0" }

const act = (a, j) => ({ name: `A${j + 1}`, description: '', type: 'Assignment', time: 0, ...a })
const renameStep = (sfc, from, to) => ({
  ...sfc, steps: sfc.steps.map(s => (s.name === from ? { ...s, name: to } : s)),
  routes: (sfc.routes ?? []).map(r => ({ ...r, from: r.from === from ? to : r.from, to: r.to === from ? to : r.to }))
})

/** Task 1-4 through the stores: parameters, messages, unit parameter and the modified AGITATE RUN_LOGIC. */
function modifyAgitate(ctx) {
  const { B, cfg, graph, value } = ctx
  const add = def => value(B().savePhaseParam('AGITATE', { ...cfg.newParam(def.kind, B().phaseClasses.AGITATE.params), ...def }))
  for (const n of DYN) add({ name: n, kind: 'algorithm', type: 'Dynamic Reference', group: 'Algorithm', defaultValue: '' })
  add({ name: 'INIT_LEVEL', kind: 'algorithm', type: 'Real', group: 'Algorithm', low: 0, high: 1000, defaultValue: 0, units: 'gal' })
  for (const m of MESSAGES) add({ name: m.name, kind: 'message', type: 'String', group: 'Messages', id: m.id, defaultValue: m.text })
  value(B().saveUnitParam('BLENDERS', { name: 'AGITATE_AGAIN', type: 'Boolean', category: 'Operating', defaultValue: false }))
  value(B().editPhaseDraft('AGITATE', d => {
    let sfc = d.logic.RUN_LOGIC
    const reset = sfc.steps.length - 1
    sfc = { ...sfc, steps: sfc.steps.map((s, i) => (i === reset ? { ...s, actions: s.actions.map(a => (/STEP_INDEX/.test(a.expression) ? { ...a, expression: "'^/STEP_INDEX.CV' := 6;" } : a)) } : s)),
      transitions: sfc.transitions.map((t, i) => (i === reset ? { ...t, name: 'WAIT_3_SEC' } : t)) }
    sfc = cfg.insertSequence(sfc, reset, NEW_STEPS.length)
    NEW_STEPS.forEach((n, k) => {
      const i = reset + 1 + k
      sfc.steps[i] = { ...sfc.steps[i], name: n.name, actions: n.actions.map(act) }
      sfc.transitions[i] = { ...sfc.transitions[i], name: n.transition.name, condition: n.transition.condition }
    })
    const from = reset + 1
    sfc = graph.addBranch(sfc, from, 'right')
    const leg = graph.phaseEdges(sfc).filter(e => e.from === from && e.to === null && e.route !== null).pop()
    sfc = graph.insertOnEdge(sfc, { i: from, route: leg.route }, 1)
    const created = sfc.steps.length - 1
    sfc = renameStep(sfc, sfc.steps[created].name, NO_LEG.step.name)
    sfc.steps[created] = { ...sfc.steps[created], actions: NO_LEG.step.actions.map(act) }
    sfc = graph.editEdge(sfc, { i: from, route: leg.route }, NO_LEG.branch)
    const onward = graph.phaseEdges(sfc).find(e => e.from === created)
    sfc = graph.editEdge(sfc, { i: created, route: onward.route }, NO_LEG.transition)
    sfc = graph.connectEdge(sfc, { i: created, route: onward.route }, 'MODES_AUTO')
    d.logic.RUN_LOGIC = sfc
  }))
  value(B().savePhaseClass('AGITATE'))
}

/** Task 5: OP_FINISH_500 loops back to AGITATE while AGITATE_AGAIN is set. */
function modifyFinish(ctx, name = 'OP_FINISH_500') {
  const { X, value } = ctx
  value(X().editDraft(name, r => {
    r.transitions = r.transitions.map((t, i) => (i === 1 ? { ...t, ...FINISH_TRUNK } : t))
    r.branches = [{ ...FINISH_LOOP }]
  }))
  value(X().saveRecipe(name))
}

module.exports = { DYN, MESSAGES, NEW_STEPS, NO_LEG, FINISH_LOOP, FINISH_TRUNK, HEADER_ID, modifyAgitate, modifyFinish }
