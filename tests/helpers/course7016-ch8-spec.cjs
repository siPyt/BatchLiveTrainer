// Course 7016 Chapter 8 workshop (slides 8-12 .. 8-18): the DUMP and CHG_COLOR phases. Pure data, so the engine tests and the
// browser automation that authors the phases in Control Studio build exactly the same thing.
const alias = (name, p) => `'//#${name}#/${p}'`
const REQUEST = n => `'^/REQUEST.CV' := ${n};`
const WAIT_REQUEST = "'^/REQUEST.CV' = 0"
const A = (expression, extra = {}) => ({ expression, qualifier: 'P', ...extra })
const COLOR = state => `${alias('BLNDR_COLOR', 'A_COMMAND.CV')} := 'EM-vlvnc-2stage:${state}';`
const COLOR_PV = state => `${alias('BLNDR_COLOR', 'A_PV.CV')} = 'EM-vlvnc-2stage:${state}'`

const HEADER_ID = 20

const DUMP = {
  name: 'DUMP', category: 'TankClasses', unitClass: 'COLORTANKS', params: [],
  steps: [
    { name: 'INIT', actions: [A(`${alias('OUTLET_VLV', 'MODE.TARGET')} := CAS;`)], transition: { name: 'TRUE', condition: 'TRUE' } },
    { name: 'REQUEST_DUMP', actions: [A(REQUEST(5501))], transition: { name: 'WU_REQ_RECVD', condition: WAIT_REQUEST } },
    { name: 'OPEN_OUTLET', actions: [A(`${alias('OUTLET_VLV', 'CAS_SP.CV')} := 'vlvnc-sp:OPEN';`)],
      transition: { name: 'WU_VLV_OPEN', condition: `${alias('OUTLET_VLV', 'PV.CV')} = 'vlvnc-pv:OPEN'` } },
    { name: 'SEND_CONFIRM', actions: [A(REQUEST(5202))], transition: { name: 'WU_REQ_RECVD2', condition: WAIT_REQUEST } },
    { name: 'REQ_CLOSE_VLV', actions: [A(REQUEST(5503))], transition: { name: 'WU_REQ_RECVD3', condition: WAIT_REQUEST } },
    { name: 'CLOSE_OUTLET', actions: [
      A(`${alias('OUTLET_VLV', 'CAS_SP.CV')} := 'vlvnc-sp:CLOSE';`),
      A(`${alias('OUTLET_VLV', 'MODE.TARGET')} := AUTO;`, { delayExpression: `${alias('OUTLET_VLV', 'PV.CV')} = 'vlvnc-pv:CLOSED'` })
    ], transition: { name: 'COMPLETE', condition: `${alias('OUTLET_VLV', 'MODE.ACTUAL')} = AUTO` } }
  ]
}

const TANK_LEVEL = "'//#TANK_LEVEL#'"
const CHG_COLOR = {
  name: 'CHG_COLOR', category: 'BlenderClasses', unitClass: 'BLENDERS',
  params: [
    { name: 'R_CLR_AMNT', kind: 'batch', type: 'Real', direction: 'Input', group: 'Operating', low: 0, defaultValue: 70, high: 500, units: 'gal' },
    { name: 'RPT_AMNT_CHARGED', kind: 'batch', type: 'Real', direction: 'Report', group: 'Report', low: 0, defaultValue: 0, high: 100, units: 'gal' },
    { name: 'INIT_LEVEL', kind: 'algorithm', type: 'Real', direction: 'Input', group: 'Algorithm', low: 0, defaultValue: 0, high: 1000, units: 'gal' }
  ],
  steps: [
    { name: 'ACQ_HEADER', actions: [A(REQUEST(4000 + HEADER_ID))], transition: { name: 'WU_HDR_ACQD', condition: WAIT_REQUEST } },
    { name: 'REQUEST_CHARGE', actions: [A(REQUEST(5201))], transition: { name: 'WU_REQ_RECVD', condition: WAIT_REQUEST } },
    { name: 'REQ_CONFIRM', actions: [A(REQUEST(5502))], transition: { name: 'WU_REQ_RECVD2', condition: WAIT_REQUEST } },
    // The trunk continues to RECEIVE_CHARGE when R_CLR_AMNT > 30; the alternate branch joins SLOW_CHARGE directly when it is 30 or less.
    { name: 'CAPT_INIT_LVL', actions: [A(`'^/INIT_LEVEL.CV' := ${TANK_LEVEL};`)], transition: { name: 'R_CLR_AMNT_BIG', condition: "'^/R_CLR_AMNT.CV' > 30" } },
    { name: 'RECEIVE_CHARGE', actions: [A(COLOR('Bulk'))],
      transition: { name: 'BULK_CHG_CMPT', condition: `${TANK_LEVEL} >= '^/INIT_LEVEL.CV' + '^/R_CLR_AMNT.CV' - 30` } },
    { name: 'SLOW_CHARGE', actions: [A(COLOR('Dribble'))],
      transition: { name: 'WU_CHG_COMPLETE', condition: `${TANK_LEVEL} >= '^/INIT_LEVEL.CV' + '^/R_CLR_AMNT.CV'` } },
    { name: 'REQ_CLOSE_VLV', actions: [A(REQUEST(5203))], transition: { name: 'WU_REQ_RECVD3', condition: WAIT_REQUEST } },
    { name: 'CLOSE_CLR_VLV', actions: [A(COLOR('Close'))], transition: { name: 'WU_VLV_CLOSED', condition: COLOR_PV('Close') } },
    { name: 'RELEASE_HEADER', actions: [A(COLOR('Auto Mode')), A(REQUEST(4200 + HEADER_ID)), A(`'^/RPT_AMNT_CHARGED.CV' := ${TANK_LEVEL} - '^/INIT_LEVEL.CV';`)],
      transition: { name: 'COMPLETE', condition: WAIT_REQUEST } }
  ],
  branches: [{ from: 'CAPT_INIT_LVL', side: 'right', name: 'R_CLR_AMNT_SMALL', condition: "'^/R_CLR_AMNT.CV' <= 30", to: 'SLOW_CHARGE' }]
}

/** Builds a phase class straight through the stores (the engine-level twin of what the UI automation does). */
function buildPhase(spec, ctx) {
  const { B, cfg, graph, value } = ctx
  if (!B().categories[`phase:${spec.category}`]) value(B().renameCategory('phase', value(B().newCategory('phase', null)), spec.category))
  value(B().newPhaseClass(spec.category, spec.name))
  for (const p of spec.params) value(B().savePhaseParam(spec.name, { ...cfg.newParam(p.kind, B().phaseClasses[spec.name].params), ...p }))
  value(B().editPhaseDraft(spec.name, d => {
    let sfc = cfg.insertSequence(cfg.defaultSfc(), 0, spec.steps.length - 1)
    sfc = {
      steps: sfc.steps.map((s, i) => ({ ...s, name: spec.steps[i].name, actions: spec.steps[i].actions.map((a, j) => ({ name: `A${j + 1}`, description: '', type: 'Assignment', time: 0, ...a })) })),
      transitions: sfc.transitions.map((t, i) => ({ ...t, name: spec.steps[i].transition.name, condition: spec.steps[i].transition.condition }))
    }
    for (const b of spec.branches ?? []) {
      const from = sfc.steps.findIndex(s => s.name === b.from)
      sfc = graph.addBranch(sfc, from, b.side)
      const leg = graph.phaseEdges(sfc).filter(e => e.from === from && e.to === null && e.route !== null).pop()
      sfc = graph.connectEdge(sfc, { i: from, route: leg.route }, b.to)
      sfc = graph.editEdge(sfc, { i: from, route: leg.route }, { name: b.name, condition: b.condition })
    }
    d.logic.RUN_LOGIC = sfc
  }))
  value(B().savePhaseClass(spec.name))
}

module.exports = { DUMP, CHG_COLOR, HEADER_ID, buildPhase }
