// Prerequisites for the Course 7016 Chapter 7 workshop: the state a student has after Chapter 5 (BLENDERS unit class bound to the real
// blender equipment) and Chapter 6 (phase_failures messages 4-8 downloaded). Plain script: it runs under node:test and is also
// evaluated inside the running browser app, so it takes everything it needs through `ctx` and uses no require().
module.exports = function course7016Prereq(ctx) {
  const { B, L, E, M, cfg, value, useStore } = ctx
  const sequence = rows => {
    const sfc = cfg.insertSequence(cfg.defaultSfc(), 0, rows.length - 1)
    return {
      steps: sfc.steps.map((s, i) => ({ ...s, name: rows[i][0], actions: rows[i][1].map((e, j) => ({ name: `A${j + 1}`, description: '', type: 'Assignment', qualifier: 'N', time: 0, expression: e })) })),
      transitions: sfc.transitions.map((t, i) => ({ ...t, name: rows[i][2], condition: rows[i][3] }))
    }
  }
  const VLV = p => `'^/COLOR_IN_VLV/${p}'`
  const COMMANDS = {
    1: [['CLOSE_VLV', [`${VLV('MODE.TARGET')} := CAS;`, `${VLV('CAS_SP.CV')} := 'vlvnc2stage-sp:CLOSE';`], 'VLV_CLOSED', `${VLV('PV.CV')} = 'vlvnc2stage-pv:CLOSED'`]],
    2: [['DRIBBLE_SP', [`${VLV('MODE.TARGET')} := CAS;`, `${VLV('CAS_SP.CV')} := 'vlvnc2stage-sp:DRIBBLE';`], 'VLV_DRIBBLE', `${VLV('PV.CV')} = 'vlvnc2stage-pv:DRIBBLE'`]],
    3: [['BULK_SP', [`${VLV('MODE.TARGET')} := CAS;`, `${VLV('CAS_SP.CV')} := 'vlvnc2stage-sp:BULK';`], 'VLV_BULK', `${VLV('PV.CV')} = 'vlvnc2stage-pv:BULK'`]],
    4: [['AUTO_MODE', [`${VLV('MODE.TARGET')} := AUTO;`], 'ACTUAL_AUTO', `${VLV('MODE.ACTUAL')} = AUTO`]]
  }
  const ITEMS = [
    { name: 'PRODUCT_MODE', write: 'PRODUCT_VLV/MODE.TARGET', readback: 'PRODUCT_VLV/MODE.ACTUAL' },
    { name: 'WASTE_MODE', write: 'WASTE_VLV/MODE.TARGET', readback: 'WASTE_VLV/MODE.ACTUAL' },
    { name: 'PRODUCT_SP', write: 'PRODUCT_VLV/CAS_SP.CV', readback: 'PRODUCT_VLV/PV.CV' },
    { name: 'WASTE_SP', write: 'WASTE_VLV/CAS_SP.CV', readback: 'WASTE_VLV/PV.CV' }
  ]
  const STATES = {
    1: { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'CLOSE', WASTE_SP: 'CLOSE' },
    2: { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'CLOSE', WASTE_SP: 'OPEN' },
    3: { PRODUCT_MODE: 'Cascade', WASTE_MODE: 'Cascade', PRODUCT_SP: 'OPEN', WASTE_SP: 'CLOSE' },
    4: { PRODUCT_MODE: 'Auto', WASTE_MODE: 'Auto', PRODUCT_SP: 'CLOSE', WASTE_SP: 'CLOSE' }
  }

  // Chapter 1: LEVEL_INDICATOR with LI-504 / LI-604.
  value(L().renameCategory(value(L().newCategory(null)), 'AnalogInput'))
  value(L().renameClass(value(L().createClassFromTemplate('ANALOG', 'AnalogInput')), 'LEVEL_INDICATOR'))
  value(L().editDraft('LEVEL_INDICATOR', d => {
    d.blocks.AI1.params.OUT_SCALE.value = { hi: 1000, lo: 0, units: 'gal', decimals: 1 }
    d.blocks.AI1.params.L_TYPE.value = 'Direct'
    d.blocks.AI1.params.SIMULATE.value = { enabled: true, value: 0 }
    d.params.LEVEL_IN = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: '', special: { item: 'INPUT', x: 40, y: 90 } }
  }))
  value(L().connect('LEVEL_INDICATOR', 'LEVEL_IN', 'AI1/SIMULATE_IN'))
  value(L().saveClass('LEVEL_INDICATOR'))
  for (const n of [...(ctx.colorTanks ? [1, 2, 3] : []), 5, 6]) {
    value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), `LI-${n}04`))
    value(L().setOverride(`LI-${n}04`, 'LEVEL_IN', n < 4 ? `TANKSIM/TKLEV${n}00` : `LEV${n}00-SIM/${n}00_LEV`))
  }

  // Chapter 5: equipment module classes.
  value(E().renameCategory(value(E().newCategory(null)), 'CommandDriven'))
  value(E().newClass('CommandDriven', 'BLENDER_COLOR', 'Command driven', 'EM-vlvnc-2stage'))
  value(E().renameChild('BLENDER_COLOR', value(E().addChild('BLENDER_COLOR', '2STAGE_VALVE')), 'COLOR_IN_VLV'))
  value(E().editDraft('BLENDER_COLOR', d => { for (const [v, rows] of Object.entries(COMMANDS)) d.commands[v].sfc = sequence(rows) }))
  value(E().saveClass('BLENDER_COLOR'))
  value(E().renameCategory(value(E().newCategory(null)), 'StateDriven'))
  value(E().newClass('StateDriven', 'BLENDER_OUTLET', 'State driven', 'EM_Outlet_State'))
  value(E().renameChild('BLENDER_OUTLET', value(E().addChild('BLENDER_OUTLET', 'NC_VALVE')), 'PRODUCT_VLV'))
  value(E().renameChild('BLENDER_OUTLET', value(E().addChild('BLENDER_OUTLET', 'NC_VALVE')), 'WASTE_VLV'))
  value(E().editDraft('BLENDER_OUTLET', d => { d.items = ITEMS; for (const [v, row] of Object.entries(STATES)) d.states[v] = row }))
  value(E().saveClass('BLENDER_OUTLET'))

  // Chapter 4 (only when asked for): process cell, COLORTANKS unit class with FILL, and UM_COLOR_100/200/300.
  if (ctx.colorTanks) {
    value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'BlenderClasses'))
    value(B().renameClass('pcell', value(B().newProcessCellClass('General')), 'PRODUCTION'))
    value(B().renameProcessCell(value(B().createProcessCell('PRODUCTION', 'ED_CENTER_BATCH')), 'PAINT_PRODUCTION'))
    value(B().renameCategory('unit', value(B().newCategory('unit', null)), 'ChargeTankUnits'))
    value(B().newUnitClass('ChargeTankUnits', 'COLORTANKS'))
    for (const a of ['INLET_VLV', 'OUTLET_VLV', 'TANK_LEVEL']) value(B().addAlias('COLORTANKS', a, ''))
    value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'TankClasses'))
    value(B().newPhaseClass('TankClasses', 'FILL'))
    value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', {}), name: 'R_FILL_LEVEL', group: 'Operating', type: 'Real', direction: 'Input', low: 0, high: 500, defaultValue: 250, units: 'gal' }))
    value(B().savePhaseParam('FILL', { ...cfg.newParam('batch', B().phaseClasses.FILL.params), name: 'RPT_FNL_LVL', group: 'Report', type: 'Real', direction: 'Report', units: 'gal' }))
    const fill = [
      ['INIT', ["'//#OUTLET_VLV#/MODE.TARGET' := CAS;", "'//#OUTLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'OUTLET_CLOSED', "'//#OUTLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"],
      ['OPEN_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:OPEN';"], 'LEVEL_MET', "'//#TANK_LEVEL#' >= '^/R_FILL_LEVEL.CV'"],
      ['CLOSE_INLET', ["'//#INLET_VLV#/MODE.TARGET' := CAS;", "'//#INLET_VLV#/CAS_SP.CV' := 'vlvnc-sp:CLOSE';"], 'INLET_CLOSED', "'//#INLET_VLV#/PV.CV' = 'vlvnc-pv:CLOSED'"],
      ['COMPLETE', ["'^/RPT_FNL_LVL.CV' := '//#TANK_LEVEL#';", "'//#INLET_VLV#/MODE.TARGET' := AUTO;", "'//#OUTLET_VLV#/MODE.TARGET' := AUTO;"], 'COMPLETE_2', 'TRUE']
    ]
    value(B().editPhaseDraft('FILL', d => { d.logic.RUN_LOGIC = sequence(fill) }))
    value(B().savePhaseClass('FILL'))
    value(B().assignPhaseClass('COLORTANKS', 'FILL'))
    for (const n of [1, 2, 3]) {
      const um = value(B().createUnitModule('COLORTANKS', 'PAINT_PRODUCTION'))
      value(B().renameUnitModule(um, `UM_COLOR_${n}00`))
      const u = `UM_COLOR_${n}00`
      value(B().resolveAlias(u, 'INLET_VLV', { path: `XV-${n}01`, ignore: false, description: '' }))
      value(B().resolveAlias(u, 'OUTLET_VLV', { path: `XV-${n}02`, ignore: false, description: '' }))
      value(B().resolveAlias(u, 'TANK_LEVEL', { path: `LI-${n}04/AI1/PV.CV`, ignore: false, description: '' }))
      for (const t of [`XV-${n}01`, `XV-${n}02`, `LI-${n}04`]) value(B().containModule(t, u))
      value(B().setUnitProps(u, { primaryDisplay: 'Process' }))
      value(B().setUnitPhaseProps(u, 'FILL', { phaseType: 'Controller' }))
    }
    value(B().addToCell('TANKSIM', 'PAINT_PRODUCTION'))
  }

  // Chapter 5: BLENDERS unit class, UM_BL_500 / UM_BL_600, bound to the real blender equipment.
  const old = ['AGIT-503', 'AGIT-603', 'MTR-505', 'MTR-605', 'XV-501', 'XV-601', 'XV-502', 'XV-602', 'XV-503', 'XV-603', 'XV-504', 'XV-604']
  for (const t of old) value(B().unassignModule(t))
  for (const t of old) value(B().deleteCourseModule(t))
  if (!B().processCells.PAINT_PRODUCTION) {
    value(B().renameClass('pcell', value(B().newProcessCellClass('General')), 'PRODUCTION'))
    value(B().renameProcessCell(value(B().createProcessCell('PRODUCTION', 'ED_CENTER_BATCH')), 'PAINT_PRODUCTION'))
  }
  value(B().renameCategory('unit', value(B().newCategory('unit', null)), 'BlenderUnits'))
  value(B().newUnitClass('BlenderUnits', 'BLENDERS'))
  for (const [cls, first, renamed] of [['BLENDER_COLOR', 'BLENDER_COL_1', 'BLNDR_COLOR'], ['BLENDER_OUTLET', 'BLENDER_OUT_1', 'BLNDR_OUTLET'],
    ['AGIT_MTR', 'AGIT_MTR_1', 'AGITATOR'], ['OUT_PMP', 'OUT_PMP_1', 'OUT_PUMP'], ['NC_VALVE', 'NC_VALVE_1', 'BASE_IN_VLV']]) {
    value(B().addModuleBlock('BLENDERS', cls, 'Private', true))
    value(B().renameModuleBlock('BLENDERS', first, renamed))
  }
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
  value(L().downloadController('CTLR1'))

  // Chapter 6: the AGITATE failure messages 4-8 are in phase_failures on the workstation and controller.
  const names = ['AGITATOR_STOPPED', 'PRODUCT_VLV_OPEN', 'WASTE_VLV_OPEN', 'BASE_VLV_OPEN', 'COLOR_VLV_OPEN']
  const ns = M().namedSets
  useStore.setState({ namedSets: { ...ns, configured: { ...ns.configured, phase_failures: { ...ns.configured.phase_failures,
    entries: [...ns.configured.phase_failures.entries, ...names.map((name, i) => ({ name, value: i + 4, visible: true, userSelectable: true }))] } } } })
  M().downloadChangedNamedSets({ kind: 'workstation' })
  M().downloadChangedNamedSets({ kind: 'controller', tag: 'CTLR1' })

  // Chapter 6 (only when asked for): a working AGITATE phase on both blenders, with the failure monitor, Hold and Restart logic.
  if (ctx.agitate) {
    if (!B().categories['phase:BlenderClasses']) value(B().renameCategory('phase', value(B().newCategory('phase', null)), 'BlenderClasses'))
    value(B().newPhaseClass('BlenderClasses', 'AGITATE'))
    value(B().savePhaseParam('AGITATE', { ...cfg.newParam('batch', {}), name: 'R_BLEND_TIME', type: 'Integer', direction: 'Input', group: 'Operating', units: 'sec', low: 0, high: 300, defaultValue: 30 }))
    value(B().savePhaseParam('AGITATE', { ...cfg.newParam('batch', B().phaseClasses.AGITATE.params), name: 'RPT_BLEND_TIME', type: 'Integer', direction: 'Report', group: 'Report', units: 'sec', low: 0, high: 300, defaultValue: 0 }))
    const al = (n, p) => `'//#${n}#/${p}'`
    const CN = ['AGITATOR_STOPPED', 'PRODUCT_VLV_OPEN', 'WASTE_VLV_OPEN', 'BASE_VLV_OPEN', 'COLOR_VLV_OPEN']
    const DIS = (n, v) => `'^/FAIL_MONITOR/${n}/DISABLE.CV' := ${v};`
    const DISALL = v => CN.map(n => DIS(n, v))
    const idx = n => `'^/STEP_INDEX.CV' := ${n};`
    const mode = (n, v) => `${al(n, 'DC1/MODE.TARGET')} := ${v};`
    const BASE_MODE = v => `${al('BASE_IN_VLV', 'MODE.TARGET')} := ${v};`
    const AGIT_START = `${al('AGITATOR', 'CAS_SP.CV')} := 'mtr2-sp:START';`, AGIT_STOP = `${al('AGITATOR', 'CAS_SP.CV')} := 'mtr2-sp:STOP';`
    const AGIT_RUNNING = `${al('AGITATOR', 'DC1/PV_D.CV')} = 'mtr2-pv:RUNNING'`, AGIT_STOPPED = `${al('AGITATOR', 'DC1/PV_D.CV')} = 'mtr2-pv:STOPPED'`
    const PUMP_STOP = `${al('OUT_PUMP', 'CAS_SP.CV')} := 'mtr2-sp:STOP';`, PUMP_STOPPED = `${al('OUT_PUMP', 'DC1/PV_D.CV')} = 'mtr2-pv:STOPPED'`
    const BASE_CLOSE = `${al('BASE_IN_VLV', 'CAS_SP.CV')} := 'vlvnc-sp:CLOSE';`, BASE_CLOSED = `${al('BASE_IN_VLV', 'PV.CV')} = 'vlvnc-pv:CLOSED'`
    value(B().editPhaseDraft('AGITATE', d => {
      d.logic.RUN_LOGIC = sequence([
        ['INITIALIZE', [idx(1), mode('OUT_PUMP', 'CAS'), BASE_MODE('CAS'), mode('AGITATOR', 'CAS')], 'INIT_DONE', 'TRUE'],
        ['SEAL', [idx(2), PUMP_STOP, BASE_CLOSE], 'SEALED', `${PUMP_STOPPED} AND ${BASE_CLOSED}`],
        ['START_AGIT', [idx(3), AGIT_START, ...DISALL(0).slice(1)], 'AGIT_RUNNING', AGIT_RUNNING],
        ['BLEND', [idx(4), DIS('AGITATOR_STOPPED', 0)], 'BLEND_DONE', "'/BLEND/TIME.CV' >= '^/R_BLEND_TIME.CV'"],
        ['STOP_AGIT', [idx(5), DIS('AGITATOR_STOPPED', 1), AGIT_STOP], 'AGIT_STOPPED', AGIT_STOPPED],
        ['RESET_EQUIP', [idx(0), mode('OUT_PUMP', 'AUTO'), BASE_MODE('AUTO'), mode('AGITATOR', 'AUTO'), "'^/RPT_BLEND_TIME.CV' := '^/R_BLEND_TIME.CV';", ...DISALL(1)], 'DONE', "'/RESET_EQUIP/TIME.CV' >= 3"]
      ])
      const conditions = [AGIT_STOPPED, `${al('BLNDR_OUTLET', 'PRODUCT_VLV/PV.CV')} = 'vlvnc-pv:OPEN'`, `${al('BLNDR_OUTLET', 'WASTE_VLV/PV.CV')} = 'vlvnc-pv:OPEN'`,
        `${al('BASE_IN_VLV', 'PV.CV')} = 'vlvnc-pv:OPEN'`, `${al('BLNDR_COLOR', 'COLOR_IN_VLV/PV.CV')} != 'vlvnc-2stage-pv:CLOSED'`]
      const fm = Object.fromEntries(CN.map((name, i) => [name, { type: 'CND', expression: conditions[i], inputs: [], disabled: true }]))
      fm.BFI1 = { type: 'BFI', expression: '', disabled: false, inputs: CN.map(n => `/${n}/OUT_D.CV`) }
      fm.MESSAGE = { type: 'CALC', inputs: ['/BFI1/FIRST_OUT.CV'], disabled: false, expression: "'OUT1.CV' := 'IN1.CV' != 0 ? LOG2(2, 'IN1.CV') + 4 : 0;" }
      fm.BLOCK1 = { type: 'CALC', inputs: [], disabled: false, expression: "if ( '^/BFI1/OUT_D.CV' != 0 ) and ( '/+/FAIL_INDEX.CV' = 0 ) then\n  '/+/FAIL_INDEX.CV' := '^/MESSAGE/OUT1.CV';\nendif;" }
      d.logic.FAIL_MONITOR.blocks = fm
      d.logic.HOLD_LOGIC = sequence([
        ['HOLD_STATE', DISALL(1), 'T_HS', 'TRUE'],
        ['NULL', [], 'T_NULL', 'TRUE'],
        ['FAIL_SAFE', [BASE_MODE('CAS'), mode('OUT_PUMP', 'CAS'), mode('AGITATOR', 'CAS'), BASE_CLOSE, PUMP_STOP, AGIT_STOP], 'T_FS', `${AGIT_STOPPED} AND ${BASE_CLOSED}`],
        ['STOP_AGITATOR', [mode('AGITATOR', 'CAS'), AGIT_STOP], 'T_SA', AGIT_STOPPED],
        ['HELD', [], 'T_HELD', 'TRUE']
      ])
      d.logic.HOLD_LOGIC.routes = [
        { from: 'NULL', to: 'FAIL_SAFE', condition: "'^/FAIL_INDEX.CV' != 0" },
        { from: 'NULL', to: 'STOP_AGITATOR', condition: "'^/STEP_INDEX.CV' = 3 OR '^/STEP_INDEX.CV' = 4" },
        { from: 'NULL', to: 'HELD', condition: 'TRUE' },
        { from: 'FAIL_SAFE', to: 'HELD', condition: `${AGIT_STOPPED} AND ${BASE_CLOSED}` }
      ]
      d.logic.RESTART_LOGIC = sequence([
        ['RESTARTING', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:Continue';", "'^/FAIL_MONITOR/BFI1/RESET_IN.CV' := 1;"], 'T_R', 'TRUE'],
        ['RESTART_TOP', ["'^/RESTART_TYPE.CV' := '$phase_restart_types:From_Start';"], 'T_RT', 'TRUE'],
        ['START_AGITATOR', [mode('AGITATOR', 'CAS'), AGIT_START], 'T_SA2', AGIT_RUNNING],
        ['ENABLE_PC', DISALL(0), 'T_EN', 'TRUE'],
        ['NULL', [], 'T_N', 'TRUE']
      ])
      d.logic.RESTART_LOGIC.routes = [
        { from: 'RESTARTING', to: 'RESTART_TOP', condition: "'^/STEP_INDEX.CV' = 1 OR '^/STEP_INDEX.CV' = 2" },
        { from: 'RESTARTING', to: 'START_AGITATOR', condition: "'^/STEP_INDEX.CV' = 3 OR '^/STEP_INDEX.CV' = 4" },
        { from: 'RESTARTING', to: 'NULL', condition: 'TRUE' },
        { from: 'RESTART_TOP', to: null, condition: 'TRUE' }
      ]
      for (const c of ['STOP_LOGIC', 'ABORT_LOGIC']) d.logic[c] = sequence([['SAFE', [...DISALL(1), mode('AGITATOR', 'CAS'), AGIT_STOP], 'T_SAFE', AGIT_STOPPED]])
    }))
    value(B().savePhaseClass('AGITATE'))
    value(B().assignPhaseClass('BLENDERS', 'AGITATE'))
    for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().setUnitPhaseProps(u, 'AGITATE', { phaseType: 'Controller' }))
    value(L().downloadController('CTLR1'))
    for (const u of ['UM_BL_500', 'UM_BL_600']) value(B().downloadUnit(u, true))
  }
}
