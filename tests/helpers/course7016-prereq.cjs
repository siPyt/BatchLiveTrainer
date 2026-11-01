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
  for (const n of [5, 6]) {
    value(L().renameInstance(value(L().createInstance('LEVEL_INDICATOR', 'ED_CENTER_BATCH')), `LI-${n}04`))
    value(L().setOverride(`LI-${n}04`, 'LEVEL_IN', `LEV${n}00-SIM/${n}00_LEV`))
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

  // Chapter 5: BLENDERS unit class, UM_BL_500 / UM_BL_600, bound to the real blender equipment.
  const old = ['AGIT-503', 'AGIT-603', 'MTR-505', 'MTR-605', 'XV-501', 'XV-601', 'XV-502', 'XV-602', 'XV-503', 'XV-603', 'XV-504', 'XV-604']
  for (const t of old) value(B().unassignModule(t))
  for (const t of old) value(B().deleteCourseModule(t))
  value(B().renameClass('pcell', value(B().newProcessCellClass('General')), 'PRODUCTION'))
  value(B().renameProcessCell(value(B().createProcessCell('PRODUCTION', 'ED_CENTER_BATCH')), 'PAINT_PRODUCTION'))
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
}
