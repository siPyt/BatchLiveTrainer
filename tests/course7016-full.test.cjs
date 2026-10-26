const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText, filename)
  }
}
// The whole of Course 7016 Chapters 1 to 5 in course order on ONE DV_School database, exactly as a student
// works through it, with every workshop's live checks (the Workshops display) verified at the end of its chapter.
const { useStore } = require('../src/renderer/src/engine/store.ts')
const { useSecurity } = require('../src/renderer/src/engine/security.ts')
const lib = require('../src/renderer/src/engine/libraryStore.ts')
const { useBatch } = require('../src/renderer/src/engine/batchStore.ts')
const { useEm, stateName } = require('../src/renderer/src/engine/emStore.ts')
const { useSystem } = require('../src/renderer/src/engine/systemPreferences.ts')
const cfg = require('../src/renderer/src/engine/batchConfig.ts')
const { checkCourse7016Ch1 } = require('../src/renderer/src/engine/course7016Checks.ts')
const { checkCourse7016ManualOp } = require('../src/renderer/src/engine/course7016Ch2Checks.ts')
const ch4 = require('../src/renderer/src/engine/course7016Ch4Checks.ts')
const ch5 = require('../src/renderer/src/engine/course7016Ch5Checks.ts')
const { COURSE } = require('../src/renderer/src/engine/workshops.ts')

const L = () => lib.useLibrary.getState()
const M = () => useStore.getState()
const B = () => useBatch.getState()
const E = () => useEm.getState()
const S = () => useSystem.getState()
const value = (r) => { assert.equal(r.ok, true, r.error); return r.value }
const run = (n = 5) => { for (let i = 0; i < n; i++) M().tick(0.1) }
const until = (fn, n = 3000) => { for (let i = 0; i < n && !fn(); i++) run(1); assert.ok(fn(), 'condition reached') }
const pending = (checks) => checks.filter(c => c.verdict !== 'verified').map(c => `${c.id}: ${c.detail}`)

const seq = (rows) => {
  const sfc = cfg.insertSequence(cfg.defaultSfc(), 0, rows.length - 1)
  return {
    steps: sfc.steps.map((s, i) => ({ ...s, name: rows[i][0], actions: rows[i][1].map((e, j) => ({ name: `A${j + 1}`, description: '', type: 'Assignment', qualifier: 'N', time: 0, expression: e })) })),
    transitions: sfc.transitions.map((t, i) => ({ ...t, name: rows[i][2], condition: rows[i][3] }))
  }
}

/** Every live check the Workshops display shows, keyed by workshop id. */
function liveChecks() {
  const l = L(), b = B(), e = E(), m = M()
  const ch5State = { emCategories: e.categories, emClasses: e.classes, emDrafts: e.drafts, emInstances: e.instances, emDeployed: e.deployed,
    batchCategories: b.categories, unitClasses: b.unitClasses, units: b.units, contained: b.contained, assignments: l.assignments, modules: m.modules,
    transfers: l.transfers, sims: l.sims, runSince: ch5.blendersDownloadedAt(e.deployed) }
  const c1 = checkCourse7016Ch1(l, m.modules, lib.makeReader(l))
  return {
    '7016-ch1-level-indicator': c1.filter(c => c.id.startsWith('7016-1-')),
    '7016-ch1-instances': c1.filter(c => c.id.startsWith('7016-2-')),
    '7016-ch2-manual': checkCourse7016ManualOp(l.transfers),
    '7016-ch3-sysprefs': ch4.checkCourse7016Ch3(S()),
    '7016-ch4-fill': ch4.checkCourse7016Ch4(b, m.eventLog),
    '7016-ch4-hold-restart': ch4.checkCourse7016HoldRestart(b),
    '7016-ch4-verify': ch4.checkCourse7016Verify(m.eventLog),
    '7016-ch4-optional': ch4.checkCourse7016Optional(b, m.eventLog),
    '7016-ch5-blender-color': ch5.checkCourse7016BlenderColor(ch5State),
    '7016-ch5-blender-outlet': ch5.checkCourse7016BlenderOutlet(ch5State),
    '7016-ch5-blenders-unit': ch5.checkCourse7016BlendersUnit(ch5State),
    '7016-ch5-run-process': ch5.checkCourse7016RunProcess(ch5State),
    '7016-ch5-verify-ems': ch5.checkCourse7016VerifyEms(m.eventLog),
    '7016-ch5-optional': ch5.checkCourse7016Ch5Optional(ch5State, m.eventLog)
  }
}
const expectVerified = (...ids) => { const all = liveChecks(); for (const id of ids) assert.deepEqual(pending(all[id]), [], id) }

// ---- Chapter 1 ---------------------------------------------------------------------------------------------
function chapter1() {
  value(L().renameCategory(value(L().newCategory(null)), 'AnalogInput'))
  value(L().renameClass(value(L().createClassFromTemplate('ANALOG', 'AnalogInput')), 'LEVEL_INDICATOR'))
  value(L().editDraft('LEVEL_INDICATOR', d => {
    const ai = d.blocks.AI1.params
    ai.OUT_SCALE.value = { hi: 500, lo: 0, units: 'gal', decimals: 1 }
    ai.OUT_SCALE.allowInstance = true
    ai.L_TYPE.value = 'Direct'
    d.alarms.HI_ALM.enabled = false
    d.alarms.LO_ALM.enabled = false
    ai.SIMULATE.value = { enabled: true, value: 0 }
    d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: 'Level input', special: { item: 'INPUT', x: 40, y: 90 } }
    d.primaryDisplay = 'Process'
  }))
  value(L().connect('LEVEL_INDICATOR', 'LEVEL_IN', 'AI1/SIMULATE_IN'))
  value(L().saveClass('LEVEL_INDICATOR'))
  for (const [name, path, scale] of [['LI-104', 'TANKSIM/TKLEV100'], ['LI-204', 'TANKSIM/TKLEV200'], ['LI-304', 'TANKSIM/TKLEV300'],
    ['LI-504', 'LEV500-SIM/500_LEV', 1000], ['LI-604', 'LEV600-SIM/600_LEV', 1000]]) {
    value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), name))
    value(L().setOverride(name, 'LEVEL_IN', path))
    if (scale) value(L().setOverride(name, 'AI1/OUT_SCALE', { hi: scale, lo: 0, units: 'gal', decimals: 1 }))
  }
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  value(L().downloadController('CTLR1'))
  run(5)
}

// ---- Chapter 2 Manual Operation, operated from the Process picture faceplates -------------------------------------------------
function manualRun() {
  const s = M()
  s.openValve('XV-101'); until(() => L().process.tk100 >= 50); s.closeValve('XV-101'); run(40)
  const bl = L().process.bl500
  s.setSetpoint('FIC-404', 90); s.setMode('FIC-404', 'AUTO'); s.openValve('XV-501'); s.startMotor('MTR-403')
  until(() => L().process.bl500 - bl >= 95); s.stopMotor('MTR-403'); s.closeValve('XV-501'); run(40)
  value(B().setTwoStage('XV-502', 'BULK')); s.openValve('XV-102')
  const tk = L().process.tk100
  until(() => tk - L().process.tk100 >= 45); s.closeValve('XV-102'); value(B().setTwoStage('XV-502', 'CLOSE')); run(40)
  s.startMotor('AGIT-503'); run(610); s.stopMotor('AGIT-503'); run(80)
  s.openValve('XV-503'); s.startMotor('MTR-505')
  const b5 = L().process.bl500
  until(() => b5 - L().process.bl500 >= 115); s.stopMotor('MTR-505'); s.closeValve('XV-503'); run(80)
}

// ---- Chapter 4 ---------------------------------------------------------------------------------------------
const RUN_LOGIC = [
  ['INIT', ["'//#OUTLET_VLV#/MODE.TARGET' := CAS;", "'//#OUTLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'OUTLET_CLOSED', "'//#OUTLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"],
  ['OPEN_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:OPEN';"], 'LEVEL_MET', "'//#TANK_LEVEL#' >= '^/R_FILL_LEVEL.CV'"],
  ['CLOSE_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'INLET_CLOSED', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"],
  ['COMPLETE', ["'^/RPT_FNL_LVL.CV' := '//#TANK_LEVEL#';", "'//#INLET_VLV#/MODE.TARGET' := AUTO;", "'//#OUTLET_VLV#/MODE.TARGET' := AUTO;"], 'COMPLETE_2', 'TRUE']
]
function chapter4Fill() {
  value(B().renameClass('pcell', value(B().newProcessCellClass('General')), 'PRODUCTION'))
  value(B().renameProcessCell(value(B().createProcessCell('PRODUCTION', 'ED_CENTER_BATCH')), 'PAINT_PRODUCTION'))
  value(B().renameCategory('unit', value(B().newCategory('unit', null)), 'ChargeTankUnits'))
  value(B().newUnitClass('ChargeTankUnits', 'COLORTANKS'))
  for (const a of ['INLET_VLV', 'OUTLET_VLV', 'TANK_LEVEL']) value(B().addAlias('COLORTANKS', a, ''))
  value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'TankClasses'))
  value(B().newPhaseClass('TankClasses', 'FILL'))
  value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', {}), name: 'R_FILL_LEVEL', group: 'Operating', type: 'Real', direction: 'Input', low: 0, high: 500, defaultValue: 250, units: 'gal' }))
  value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', B().phaseClasses.FILL.params), name: 'RPT_FNL_LVL', group: 'Report', type: 'Real', direction: 'Report', units: 'gal' }))
  value(B().editPhaseDraft('FILL', d => { d.logic.RUN_LOGIC = seq(RUN_LOGIC) }))
  value(B().savePhaseClass('FILL'))
  value(B().assignPhaseClass('COLORTANKS', 'FILL'))
  for (const n of [1, 2, 3]) {
    const u = `UM_COLOR_${n}00`
    value(B().renameUnitModule(value(B().createUnitModule('COLORTANKS', 'PAINT_PRODUCTION')), u))
    value(B().resolveAlias(u, 'INLET_VLV', { path: `XV-${n}01`, ignore: false, description: '' }))
    value(B().resolveAlias(u, 'OUTLET_VLV', { path: `XV-${n}02`, ignore: false, description: '' }))
    value(B().resolveAlias(u, 'TANK_LEVEL', { path: `LI-${n}04/AI1/PV.CV`, ignore: false, description: '' }))
    for (const t of [`XV-${n}01`, `XV-${n}02`, `LI-${n}04`]) value(B().containModule(t, u))
    value(B().setUnitProps(u, { primaryDisplay: 'Process' }))
    value(B().setUnitPhaseProps(u, 'FILL', { phaseType: 'Controller' }))
  }
  value(B().addToCell('TANKSIM', 'PAINT_PRODUCTION'))
  value(B().assignCell('PAINT_PRODUCTION', 'CTLR1'))
  value(L().downloadController('CTLR1'))
  run(2)
}
function runFill(n, level = 60) {
  const u = `UM_COLOR_${n}00`
  value(B().loadPhase(u, 'FILL'))
  value(B().setOnlineParam(u, 'FILL', 'R_FILL_LEVEL', level))
  value(B().command(u, 'FILL', 'START'))
  until(() => B().active[`${u}/FILL`].rt.state !== 'RUNNING', 600)
  assert.equal(B().active[`${u}/FILL`].rt.state, 'COMPLETE', B().active[`${u}/FILL`].rt.message)
  value(B().command(u, 'FILL', 'RESET'))
  until(() => B().active[`${u}/FILL`].rt.state === 'IDLE', 100)
  value(B().unloadPhase(u, 'FILL'))
}
function chapter4HoldRestartOptional() {
  value(B().editPhaseDraft('FILL', d => {
    d.logic.HOLD_LOGIC = seq([['CLOSE_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'HOLD', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"]])
    d.logic.RESTART_LOGIC = seq([['OPEN_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:OPEN';"], 'RESTART', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:OPEN'"]])
    const close = ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';", "'//#OUTLET_VLV#/MODE.TARGET' := CAS;", "'//#OUTLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"]
    d.logic.STOP_LOGIC = seq([['CLOSE_ALL', close, 'CLOSED', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED' AND '//#OUTLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"]])
    d.logic.ABORT_LOGIC = seq([['CLOSE_ALL', close, 'DONE', 'TRUE']])
    d.logic.RUN_LOGIC.transitions[1].condition = "'//#TANK_LEVEL#' >= '^/R_FILL_LEVEL.CV' - '^/OVERSHOOT.CV'"
  }))
  value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', B().phaseClasses.FILL.params), name: 'OVERSHOOT', group: 'Operating', type: 'Real', direction: 'Input', low: 0, high: 50, defaultValue: 0, units: 'gal' }))
  value(B().savePhaseClass('FILL'))
  for (const [n, o] of [[1, 12], [2, 16], [3, 10]]) value(B().setUnitPhaseParam(`UM_COLOR_${n}00`, 'FILL', 'OVERSHOOT', o))
  value(L().downloadController('CTLR1'))
  run(2)
  for (const n of [1, 2, 3]) {
    const u = `UM_COLOR_${n}00`
    value(B().loadPhase(u, 'FILL'))
    value(B().setOnlineParam(u, 'FILL', 'R_FILL_LEVEL', 200))
    value(B().command(u, 'FILL', 'START'))
    until(() => M().modules[`XV-${n}01`].open, 100)
    value(B().command(u, 'FILL', 'HOLD'))
    until(() => B().active[`${u}/FILL`].rt.state === 'HELD', 100)
    assert.equal(M().modules[`XV-${n}01`].open, false, 'HOLD closed the inlet')
    value(B().command(u, 'FILL', 'RESTART'))
    until(() => B().active[`${u}/FILL`].rt.state === 'RUNNING' && M().modules[`XV-${n}01`].open, 100)
  }
  value(B().command('UM_COLOR_100', 'FILL', 'STOP'))
  value(B().command('UM_COLOR_200', 'FILL', 'ABORT'))
  value(B().command('UM_COLOR_300', 'FILL', 'STOP'))
  until(() => ['STOPPED', 'ABORTED', 'STOPPED'].every((st, i) => B().active[`UM_COLOR_${i + 1}00/FILL`].rt.state === st), 200)
  for (const n of [1, 2, 3]) {
    const u = `UM_COLOR_${n}00`
    value(B().command(u, 'FILL', 'RESET'))
    until(() => B().active[`${u}/FILL`].rt.state === 'IDLE', 100)
    value(B().unloadPhase(u, 'FILL'))
  }
  // STOP_LOGIC / ABORT_LOGIC above leave the valves in CAS: the operator returns them to AUTO from the faceplate (Req. Mode).
  M().openValve('XV-202'); run(30)
  assert.equal(M().modules['XV-202'].open, false, 'in CAS the operator cannot open it')
  for (const n of [1, 2, 3]) for (const t of [`XV-${n}01`, `XV-${n}02`]) if (B().dc[t]?.mode === 'CAS') value(B().setDeviceMode(t, 'AUTO'))
  M().openValve('XV-202'); run(30)
  assert.equal(M().modules['XV-202'].open, true, 'operable again in AUTO')
  M().closeValve('XV-202'); run(30)
}

// ---- Chapter 5 ---------------------------------------------------------------------------------------------
const V = (p) => `'^/COLOR_IN_VLV/${p}'`
const COMMANDS = {
  1: [['CLOSE_VLV', [`${V('MODE.TARGET')} := CAS;`, `${V('CAS_SP.CV')} := 'vlvnc2stage-sp:CLOSE';`], 'VLV_CLOSED', `${V('PV.CV')} = 'vlvnc2stage-pv:CLOSED'`]],
  2: [['DRIBBLE_SP', [`${V('MODE.TARGET')} := CAS;`, `${V('CAS_SP.CV')} := 'vlvnc2stage-sp:DRIBBLE';`], 'VLV_DRIBBLE', `${V('PV.CV')} = 'vlvnc2stage-pv:DRIBBLE'`]],
  3: [['BULK_SP', [`${V('MODE.TARGET')} := CAS;`, `${V('CAS_SP.CV')} := 'vlvnc2stage-sp:BULK';`], 'VLV_BULK', `${V('PV.CV')} = 'vlvnc2stage-pv:BULK'`]],
  4: [['AUTO_MODE', [`${V('MODE.TARGET')} := AUTO;`], 'ACTUAL_AUTO', `${V('MODE.ACTUAL')} = AUTO`]]
}
function chapter5Classes() {
  value(E().renameCategory(value(E().newCategory(null)), 'CommandDriven'))
  value(E().newClass('CommandDriven', 'BLENDER_COLOR', 'Command driven', 'EM-vlvnc-2stage'))
  value(E().renameChild('BLENDER_COLOR', value(E().addChild('BLENDER_COLOR', '2STAGE_VALVE')), 'COLOR_IN_VLV'))
  value(E().editDraft('BLENDER_COLOR', d => { for (const [v, rows] of Object.entries(COMMANDS)) d.commands[v].sfc = seq(rows) }))
  value(E().saveClass('BLENDER_COLOR'))
  value(E().renameCategory(value(E().newCategory(null)), 'StateDriven'))
  value(E().newClass('StateDriven', 'BLENDER_OUTLET', 'State driven', 'EM_Outlet_State'))
  value(E().renameChild('BLENDER_OUTLET', value(E().addChild('BLENDER_OUTLET', 'NC_VALVE')), 'PRODUCT_VLV'))
  value(E().renameChild('BLENDER_OUTLET', value(E().addChild('BLENDER_OUTLET', 'NC_VALVE')), 'WASTE_VLV'))
  value(E().editDraft('BLENDER_OUTLET', d => {
    d.items = [
      { name: 'PRODUCT_MODE', write: 'PRODUCT_VLV/MODE.TARGET', readback: 'PRODUCT_VLV/MODE.ACTUAL' },
      { name: 'WASTE_MODE', write: 'WASTE_VLV/MODE.TARGET', readback: 'WASTE_VLV/MODE.ACTUAL' },
      { name: 'PRODUCT_SP', write: 'PRODUCT_VLV/CAS_SP.CV', readback: 'PRODUCT_VLV/PV.CV' },
      { name: 'WASTE_SP', write: 'WASTE_VLV/CAS_SP.CV', readback: 'WASTE_VLV/PV.CV' }]
    d.states[1] = { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'CLOSE', WASTE_SP: 'CLOSE' }
    d.states[2] = { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'CLOSE', WASTE_SP: 'OPEN' }
    d.states[3] = { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'OPEN', WASTE_SP: 'CLOSE' }
    d.states[4] = { PRODUCT_MODE: 'Auto', WASTE_MODE: 'Auto', PRODUCT_SP: 'CLOSE', WASTE_SP: 'CLOSE' }
  }))
  value(E().saveClass('BLENDER_OUTLET'))
}
function chapter5Blenders() {
  const old = ['AGIT-503', 'AGIT-603', 'MTR-505', 'MTR-605', 'XV-501', 'XV-601', 'XV-502', 'XV-602', 'XV-503', 'XV-603', 'XV-504', 'XV-604']
  for (const t of old) value(B().unassignModule(t))
  for (const t of old) value(B().deleteCourseModule(t))
  value(B().renameCategory('unit', value(B().newCategory('unit', null)), 'BlenderUnits'))
  value(B().newUnitClass('BlenderUnits', 'BLENDERS'))
  for (const [cls, n] of [['BLENDER_COLOR', 'BLNDR_COLOR'], ['BLENDER_OUTLET', 'BLNDR_OUTLET'], ['AGIT_MTR', 'AGITATOR'], ['OUT_PMP', 'OUT_PUMP'], ['NC_VALVE', 'BASE_IN_VLV']])
    value(B().renameModuleBlock('BLENDERS', value(B().addModuleBlock('BLENDERS', cls, 'Private', true)), n))
  value(B().addAlias('BLENDERS', 'TANK_LEVEL', ''))
  value(B().renameUnitModule(value(B().createUnitModule('BLENDERS', 'PAINT_PRODUCTION')), 'UM_BL_500'))
  value(B().renameUnitModule(value(B().createUnitModule('BLENDERS', 'PAINT_PRODUCTION')), 'UM_BL_600'))
  for (const [n, i] of [[5, 1], [6, 2]]) {
    for (const [from, to] of [['AGITATOR', `AGIT-${n}03`], ['BASE_IN_VLV', `XV-${n}01`], ['BLNDR_COLOR', `BL_${n}00_COLOR_IN`], ['COLOR_IN_VLV', `XV-${n}02`],
      ['BLNDR_OUTLET', `BL_${n}00_OUTLET`], ['PRODUCT_VLV', `XV-${n}03`], ['WASTE_VLV', `XV-${n}04`], ['OUT_PUMP', `MTR-${n}05`]]) value(B().renameCourseModule(`${from}${i}`, to))
    const u = `UM_BL_${n}00`
    value(B().resolveAlias(u, 'TANK_LEVEL', { path: `LI-${n}04/AI1/PV.CV`, ignore: false, description: '' }))
    value(B().setUnitProps(u, { primaryDisplay: 'Process' }))
    value(B().containModule(`LI-${n}04`, u))
  }
  value(L().assignArea('ED_CENTER_BATCH', 'CTLR1'))
  value(L().assignArea('FEED_TANK_AREA', 'CTLR1'))
  const report = value(L().downloadController('CTLR1'))
  assert.deepEqual(report.warnings, [], 'clean controller download after Chapter 5')
  run(5)
}
function chapter5RunProcess() {
  const s = M()
  const fill = (n) => { s.openValve(`XV-${n}01`); until(() => L().process[`tk${n}00`] >= 50); s.closeValve(`XV-${n}01`); run(40) }
  const base = (bl, xv) => { const b0 = L().process[bl]; s.setSetpoint('FIC-404', 90); s.setMode('FIC-404', 'AUTO'); s.openValve(xv); s.startMotor('MTR-403')
    until(() => L().process[bl] - b0 >= 95); s.stopMotor('MTR-403'); s.closeValve(xv); run(40) }
  const dump = (n, two) => { value(B().setTwoStage(two, 'BULK')); s.openValve(`XV-${n}02`); const t0 = L().process[`tk${n}00`]
    until(() => t0 - L().process[`tk${n}00`] >= 45); s.closeValve(`XV-${n}02`); value(B().setTwoStage(two, 'CLOSE')); run(40) }
  const drain = (bl, xv, mtr, gal) => { s.openValve(xv); s.startMotor(mtr); const b0 = L().process[bl]
    until(() => b0 - L().process[bl] >= gal); s.stopMotor(mtr); s.closeValve(xv); run(80) }
  // The color tanks are well above 60 gal after Chapter 4; lower them first (dump to the blenders, drain to waste).
  value(B().setTwoStage('XV-502', 'BULK'))
  for (const n of [1, 2, 3]) { s.openValve(`XV-${n}02`); until(() => L().process[`tk${n}00`] <= 30); s.closeValve(`XV-${n}02`); run(40) }
  value(B().setTwoStage('XV-502', 'CLOSE'))
  for (const [bl, xv, mtr] of [['bl500', 'XV-504', 'MTR-505'], ['bl600', 'XV-604', 'MTR-605']]) { s.openValve(xv); s.startMotor(mtr); until(() => L().process[bl] <= 150); s.stopMotor(mtr); s.closeValve(xv); run(80) }
  fill(1); base('bl500', 'XV-501'); dump(1, 'XV-502')
  s.startMotor('AGIT-503'); run(610); s.stopMotor('AGIT-503'); run(80)
  drain('bl500', 'XV-503', 'MTR-505', 115)
  fill(2); dump(2, 'XV-502'); drain('bl500', 'XV-504', 'MTR-505', 115)
  fill(3); base('bl600', 'XV-601'); dump(3, 'XV-602')
  drain('bl600', 'XV-603', 'MTR-605', 92); drain('bl600', 'XV-604', 'MTR-605', 22)
}
function chapter5VerifyEms() {
  const pv = (t) => stateName(E().deployed[t].cls.namedSet, E().runtime[t].pv)
  for (const n of [5, 6]) {
    for (const c of ['Dribble', 'Bulk', 'Close', 'Auto Mode']) { value(E().setCommand(`BL_${n}00_COLOR_IN`, c)); until(() => pv(`BL_${n}00_COLOR_IN`) === c, 200) }
    for (const st of ['Draining Waste - CAS', 'Releasing Product - CAS', 'Closed - CAS', 'Auto Mode']) { value(E().setCommand(`BL_${n}00_OUTLET`, st)); until(() => pv(`BL_${n}00_OUTLET`) === st, 200) }
  }
}
function chapter5Optional() {
  for (const n of [5, 6]) {
    value(B().setUnitProps(`UM_BL_${n}00`, { description: `Blender ${n}00` }))
    for (const [t, d] of [[`XV-${n}01`, 'Base inlet'], [`XV-${n}02`, 'Color inlet'], [`XV-${n}03`, 'Product outlet'], [`XV-${n}04`, 'Waste outlet'], [`AGIT-${n}03`, 'Agitator'], [`MTR-${n}05`, 'Outlet pump']])
      value(B().setModuleDescription(t, `Blender ${n}00 ${d}`))
    // Control Studio palette: OR block, IN1 = XV-n03, IN2 = XV-n04, wired to the pump's PERMISSIVE_SOURCE.
    const or = `MTR-${n}05-PERM`
    assert.equal(M().createModule({ tag: or, type: 'FB', fbType: 'OR', description: 'OR block', area: 'ED_CENTER_BATCH' }), true)
    M().setFbInput(or, 'in1', { kind: 'ref', value: 0, tag: `XV-${n}03` })
    M().setFbInput(or, 'in2', { kind: 'ref', value: 0, tag: `XV-${n}04` })
    assert.equal(M().setPermissiveSource(`MTR-${n}05`, or), true)
    assert.equal(liveChecks()['7016-ch5-optional'][1].verdict, 'pending', 'PERMISSIVE_D is ignored until the Permissive device option is set')
    M().setDeviceOptions(`MTR-${n}05`, { permissiveRequired: true })
  }
  run(5)
  // Both outlet valves closed: the pump must refuse to start; open one and it runs.
  M().startMotor('MTR-505'); run(60)
  assert.equal(M().modules['MTR-505'].running, false, 'MTR-505 refused to run with XV-503 and XV-504 closed')
  M().stopMotor('MTR-505'); run(5)
  M().openValve('XV-504'); run(40); M().startMotor('MTR-505'); run(60)
  assert.equal(M().modules['MTR-505'].running, true, 'MTR-505 runs once a block valve is open')
  M().stopMotor('MTR-505'); M().closeValve('XV-504'); run(60)
}

test('Course 7016 Chapters 1-5 in course order on one database: every workshop and optional exercise verifies', () => {
  const before = { store: M(), security: useSecurity.getState(), library: L(), batch: B(), em: E(), system: S(), window: global.window }
  global.localStorage = { getItem: () => null, setItem: () => {} }
  global.window = { alert: () => {}, localStorage: global.localStorage, confirm: () => true }
  try {
    useSecurity.setState({ currentUser: 'admin', locked: false, lockAssignments: {}, lastDenied: null, workstation: null })
    assert.equal(L().installCourseProject(), true)
    useSystem.setState({ features: { ...S().features, batch: false, advancedUnitManagement: false }, pending: {}, serverState: 'RUNNING', restarts: 0 })
    run(5)
    const all0 = liveChecks()
    for (const [id, list] of Object.entries(all0)) if (id !== '7016-ch4-verify') assert.ok(list.some(c => c.verdict === 'pending'), `${id} is not verified on a fresh database`)

    chapter1()
    expectVerified('7016-ch1-level-indicator', '7016-ch1-instances')

    manualRun(); manualRun()
    expectVerified('7016-ch2-manual')
    assert.match(liveChecks()['7016-ch5-run-process'][0].detail, /BLENDERS Unit Class/, 'Chapter 2 runs do not count for Chapter 5')

    assert.equal(S().setPendingFeature('batch', true), null)
    assert.equal(S().acknowledgePending(), null)
    assert.equal(S().shutdownServer(), null)
    assert.equal(S().connectServer(), null)
    expectVerified('7016-ch3-sysprefs')

    chapter4Fill()
    for (const n of [1, 2, 3]) runFill(n)
    expectVerified('7016-ch4-fill')
    chapter4HoldRestartOptional()
    expectVerified('7016-ch4-hold-restart', '7016-ch4-verify', '7016-ch4-optional')

    chapter5Classes()
    expectVerified('7016-ch5-blender-color', '7016-ch5-blender-outlet')
    chapter5Blenders()
    expectVerified('7016-ch5-blenders-unit')
    // the Chapter 4 color tank units still run FILL after the blender rework
    runFill(1, 120)
    chapter5RunProcess()
    expectVerified('7016-ch5-run-process')
    chapter5VerifyEms()
    expectVerified('7016-ch5-verify-ems')
    chapter5Optional()
    expectVerified('7016-ch5-optional')

    // Everything stays verified at the end of the course.
    const all = liveChecks()
    for (const [id, list] of Object.entries(all)) assert.deepEqual(pending(list), [], id)
    // Chapter 6 has its own timed-operation and failure-recovery integration suite.
    const checked = COURSE.flatMap(m => m.workshops).filter(w => !/definitions|reading|ch2-process|ch3-licensing|ch6-/.test(w.id) && !w.title.includes('reading'))
    for (const w of checked) assert.ok(all[w.id], `${w.id} has live checks in the whole-course run`)
  } finally {
    useStore.setState(before.store, true)
    useSecurity.setState(before.security, true)
    lib.useLibrary.setState(before.library, true)
    useBatch.setState(before.batch, true)
    useEm.setState(before.em, true)
    useSystem.setState(before.system, true)
    delete global.localStorage
    if (before.window === undefined) delete global.window
    else global.window = before.window
  }
})
