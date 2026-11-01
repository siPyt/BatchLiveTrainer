// Course 7016 through Chapter 10, as the student leaves the project before Chapter 11: Chapters 1-5 (prerequisite fixture with the color
// tanks and AGITATE), DRAIN, the COLOR_HEADER arbitration with DUMP and CHG_COLOR (Chapter 8), BASE_HEADER, the shared HEADER class and
// CHG_BASE (Chapter 9), and OP_FINISH_500 assigned and downloaded to an enabled Batch Executive (Chapter 10; the service is not started).
// Used by the engine tests and, evaluated inside the running app, to seed the browser walkthroughs.
module.exports = function course7016ThroughChapter10(ctx) {
  const { B, L, E, M, cfg, graph, value, useStore, prereq, ch8, X, CHG_BASE_NEW_FAILURES } = ctx
  const tick = (seconds = 0.1) => { for (let i = 0; i < Math.round(seconds * 10); i++) M().tick(0.1) }
  const addFailures = list => {
    const ns = M().namedSets
    useStore.setState({ namedSets: { ...ns, configured: { ...ns.configured, phase_failures: { ...ns.configured.phase_failures,
      entries: [...ns.configured.phase_failures.entries, ...list.map(([name, v]) => ({ name, value: v, visible: true, userSelectable: true }))] } } } })
    M().downloadChangedNamedSets({ kind: 'workstation' }); M().downloadChangedNamedSets({ kind: 'controller', tag: 'CTLR1' })
  }
  const BL = ['UM_BL_500', 'UM_BL_600'], CT = ['UM_COLOR_100', 'UM_COLOR_200', 'UM_COLOR_300']
  prereq({ B, L, E, M, cfg, value, useStore, colorTanks: true, agitate: true })
  // Chapter 7: DRAIN with its messages 9-11.
  value(B().importPhaseClass('DRAIN.fhx'))
  addFailures([['AGITATOR_RUNNING', 9], ['PUMP_STOPPED', 10], ['PRODUCT_VLV_CLOSED', 11]])
  value(B().assignPhaseClass('BLENDERS', 'DRAIN'))
  for (const u of BL) value(B().setUnitPhaseProps(u, 'DRAIN', { phaseType: 'Controller' }))
  // Chapter 8: COLOR_HEADER, DUMP and CHG_COLOR.
  for (const t of ['BL_500_COLOR_IN', 'BL_600_COLOR_IN']) { const c = value(B().ensureArbitration(t)); value(B().setArbitration(t, { ...c, participate: true })) }
  value(L().downloadController('CTLR1'))
  value(B().createResourceModule('PAINT_PRODUCTION', 'COLOR_HEADER', 'Color header'))
  const h = value(B().ensureArbitration('COLOR_HEADER'))
  value(B().setArbitration('COLOR_HEADER', { ...h, participate: true, equipmentId: 20, needed: ['BL_500_COLOR_IN', 'BL_600_COLOR_IN'] }))
  value(L().assignModule('COLOR_HEADER', 'CTLR1')); value(L().downloadModule('COLOR_HEADER'))
  const c = { B, cfg, graph, value }
  ch8.buildPhase(ch8.DUMP, c); ch8.buildPhase(ch8.CHG_COLOR, c)
  value(B().assignPhaseClass('BLENDERS', 'CHG_COLOR')); value(B().assignPhaseClass('COLORTANKS', 'DUMP'))
  for (const u of BL) value(B().setUnitPhaseProps(u, 'CHG_COLOR', { phaseType: 'Controller' }))
  for (const u of CT) value(B().setUnitPhaseProps(u, 'DUMP', { phaseType: 'Controller' }))
  // Chapter 9: BASE_HEADER, the shared HEADER class and CHG_BASE.
  for (const t of ['XV-501', 'XV-601']) { const a = value(B().ensureArbitration(t)); value(B().setArbitration(t, { ...a, participate: true })) }
  value(L().downloadController('CTLR1'))
  value(B().createResourceModule('PAINT_PRODUCTION', 'BASE_HEADER', 'Base header'))
  const bh = value(B().ensureArbitration('BASE_HEADER'))
  value(B().setArbitration('BASE_HEADER', { ...bh, participate: true, equipmentId: 30, needed: ['XV-501', 'XV-601'] }))
  value(L().assignModule('BASE_HEADER', 'CTLR1')); value(L().downloadModule('BASE_HEADER'))
  value(L().createBlankClass('General', 'HEADER'))
  value(B().addModuleBlock('BLENDERS', 'HEADER', 'Shared', true))
  value(B().renameModuleBlock('BLENDERS', 'HEADER_1', 'BASE_HDR'))
  for (const u of BL) value(B().bindBlock(u, 'BASE_HDR', 'BASE_HEADER'))
  value(B().importPhaseClass('CHG_BASE.fhx'))
  addFailures(CHG_BASE_NEW_FAILURES.map(([n, v]) => [n, v]))
  value(B().assignPhaseClass('BLENDERS', 'CHG_BASE'))
  for (const u of BL) value(B().setUnitPhaseProps(u, 'CHG_BASE', { phaseType: 'Controller' }))
  value(L().downloadController('CTLR1'))
  for (const u of [...BL, ...CT]) value(B().downloadUnit(u, true))
  tick(1)
  // Chapter 10: OP_FINISH_500 on an enabled Batch Executive with the equipment downloaded.
  value(X().setEnabled(true)); value(X().assignArea('ED_CENTER_BATCH')); value(X().downloadEquipment())
  value(X().newRecipe('OP_FINISH_500'))
  value(X().editDraft('OP_FINISH_500', r => {
    r.steps = [{ name: 'AGITATE:1', phaseClass: 'AGITATE', description: '' }, { name: 'DRAIN:1', phaseClass: 'DRAIN', description: '' }]
    r.transitions = [{ name: 'T1', condition: 'TRUE' }, { name: 'AGITATE_COMPLETE', condition: 'AGITATE:1/BSTATUS = $phase_state:Complete' }, { name: 'DRAIN_COMPLETE', condition: 'DRAIN:1/BSTATUS = $phase_state:Complete' }]
  }))
  value(X().saveRecipe('OP_FINISH_500'))
  value(X().setRecipeProps('OP_FINISH_500', { equipment: { mode: 'Unit', name: 'UM_BL_500' }, product: { author: 'STUDENT', version: '1.0' } }))
  const bt = B().phaseClasses.AGITATE.params.R_BLEND_TIME, dl = B().phaseClasses.DRAIN.params.R_DRAIN_LEVEL
  value(X().editDraft('OP_FINISH_500', r => {
    r.params = {
      R_BLEND_TIME: { name: 'R_BLEND_TIME', step: 'AGITATE:1', phaseParam: 'R_BLEND_TIME', type: bt.type, defaultValue: bt.defaultValue, low: bt.low, high: bt.high, units: bt.units },
      R_DRAIN_LEVEL: { name: 'R_DRAIN_LEVEL', step: 'DRAIN:1', phaseParam: 'R_DRAIN_LEVEL', type: dl.type, defaultValue: dl.defaultValue, low: dl.low, high: dl.high, units: dl.units }
    }
    for (const [n, t, l] of [['Large', 55, 50], ['Medium', 45, 75], ['Small', 30, 100]]) r.formulas[n] = { name: n, operatorCanLoad: true, values: { R_BLEND_TIME: { useDefault: false, value: t }, R_DRAIN_LEVEL: { useDefault: false, value: l } } }
  }))
  value(X().saveRecipe('OP_FINISH_500'))
  value(X().assignRecipe('OP_FINISH_500')); value(X().downloadRecipe('OP_FINISH_500'))
}
