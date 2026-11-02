// Chapter 7: Sequential Function Charts. Named Set NS-T101, the SFC SFC-T101 (startup, then startup and shutdown with divergent paths),
// the MESSAGE datalink on the picture Tank101 and the operation of the sequence (course DV-09 pp 7-15 .. 7-25).
// Performed with the store API only (the UI passes drive the same steps through Explorer, Control Studio and DeltaV Operate).
// Chapters 4, 5 and 6 build the level LEVEL-101, the motor MTR-102 and the flow loop FIC-102; until a database has them this setup
// creates the same-named modules through the store API (ensurePrereqs) so the chapter can run on its own.
function ensurePrereqs(ctx) {
  const M = ctx.M, L = ctx.L
  const ctl = Object.values(M().hardware.controllers).find(c => c.commissioned).tag
  const area = M().areas.includes('PLANT_AREA_A') ? 'PLANT_AREA_A' : M().areas[0]
  const make = (tag, type, extra) => {
    if (M().modules[tag]) return
    if (!M().createModule({ tag, type, area, description: tag, ...extra })) throw new Error('prerequisite ' + tag)
    L().assignModule(tag, ctl)
  }
  make('LEVEL-101', 'AO', { unit: 'gal', pvMin: 0, pvMax: 1000 })
  make('LI-101', 'AI', { unit: 'gal', pvMin: 0, pvMax: 1000 })
  make('MTR-102', 'MOTOR', {})
  make('FIC-102', 'PID', { unit: 'GPM', pvMin: 0, pvMax: 100 })
  if (!M().hardware.analogBindings || !M().hardware.analogBindings['FIC-102']) {
    M().bindAnalogDst('FIC-102', 'input', 'FT-2')
    M().bindAnalogDst('FIC-102', 'output', 'FY-2')
  }
  const sets = {
    'mtr2-sp': [['STOP', 0], ['START', 1]],
    'mtr2-pv': [['STOPPED', 0], ['RUNNING', 1], ['TRAVEL', 2]]
  }
  for (const [name, entries] of Object.entries(sets)) {
    if (M().namedSets.configured[name]) continue
    M().createNamedSet(name)
    M().applyNamedSetProperties(M().namedSets.configured[name], { name, description: '', entries: entries.map(([n, value]) => ({ name: n, value, visible: true, userSelectable: true })) })
  }
  M().downloadChangedNamedSets({ kind: 'workstation' })
  M().downloadChangedNamedSets({ kind: 'controller', tag: ctl })
  return ctl
}

module.exports = function dv09Ch7Setup(ctx) {
  const M = ctx.M
  const D = ctx.eng('dv09Sfc'), X = ctx.eng('sfcExpressions'), S = ctx.eng('store'), O = ctx.eng('dv09Operate'), P = ctx.eng('pictureStore')
  const must = (what, err) => { if (err) throw new Error(what + ': ' + err) }
  ctx.useStore.setState({ running: true })
  const ctl = ensurePrereqs(ctx)
  const scan = n => { for (let i = 0; i < n; i++) M().tick(0.1) }
  const entries = list => list.map(([name, value, visible, userSelectable]) => ({ name, value, visible, userSelectable }))

  // Using SFC-T101, steps 1 and 2: Named Set NS-T101 (Explorer > System Configuration > Setup > Named Sets)
  if (!M().createNamedSet('NS-T101')) throw new Error('NS-T101')
  must('NS-T101 properties', M().applyNamedSetProperties(M().namedSets.configured['NS-T101'], { name: 'NS-T101', description: '',
    entries: entries([['STARTUP', 1, true, true], ['SELECT SEQUENCE', 255, true, false]]) }) ? '' : 'rejected')

  // Step 3: Control Studio > File > New > Sequential Function Chart (UNTITLED), Step 4: parameter MESSAGE
  const untitled = D.newUntitledSfc()
  if (!untitled) throw new Error('New SFC')
  must('MESSAGE', M().configureSfcParameter(untitled, 'MESSAGE', { type: 'NAMED_SET', namedSet: 'NS-T101', value: 255 }, M().sfcLifecycle[untitled].draft) ? '' : 'rejected')

  const context = () => S.sfcExpressionContext(M(), untitled)
  const action = (text, extra) => { const r = X.parseSfcAssignment(text, M().modules, context()); if (r.error) throw new Error(text + ': ' + r.error); return { ...r.value, ...extra } }
  const condition = text => { const r = X.parseSfcCondition(text, M().modules, context()); if (r.error) throw new Error(text + ': ' + r.error); return r.value }
  const startupSteps = () => [
    { id: 'hold', name: 'HOLD_SFC', actions: [action("'MESSAGE.CV' := 'NS-T101:SELECT SEQUENCE'", { qualifier: 'P', seconds: 0 })], transition: condition("'MESSAGE.CV' = 'NS-T101:STARTUP'") },
    { id: 'open', name: 'OPEN_BLK_VLV', actions: [action("'//XV-101/DO1/SP_D.CV' := 1")], transition: condition("'//XVSTAT-101/DI1/PV_D.CV' = 1") },
    { id: 'flow', name: 'SET_FLOW_RATE', actions: [action("'//FIC-102/PID1/SP.CV' := 50")], transition: condition("'//FIC-102/PID1/OUT.CV' > 30") },
    { id: 'start', name: 'START_PUMP', actions: [action("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:START'")],
      transition: condition("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:RUNNING'"), nextStep: 'hold' }
  ]
  // Step 5: the chart from the All SFC Items palette
  must('steps', M().setSfcSteps(untitled, startupSteps()) ?? '')
  // Step 6: Module Properties > controller, Step 7: Save (Save As SFC-T101 in PLANT_AREA_A) and Download
  must('controller', M().configureSfcProperties(untitled, { controllerTag: ctl }, M().sfcLifecycle[untitled].draft) ? '' : 'rejected')
  must('save as', D.saveSfcAs(untitled, 'SFC-T101', 'PLANT_AREA_A'))
  must('download', D.downloadSfc('SFC-T101'))
  must('check', D.checkSfc('SFC-T101').ok ? '' : D.checkSfc('SFC-T101').text)

  // The Parameter Paths workshop: the Expression Assistant Browser lists the paths (the pick is journaled)
  for (const path of ['//FIC-102/PID1/MODE.ACTUAL', '//FIC-102/PID1/PV.CV']) M().logEvent('CONFIGURE', 'SFC-T101', 'Expression Assistant: browsed ' + path)

  // Step 9: MESSAGE on Tank101 with data entry, and Changed Setup Data to the workstation
  must('workstation setup data', M().downloadChangedNamedSets({ kind: 'workstation' }) ? '' : 'rejected')
  const pictures = () => P.usePictures.getState().pictures
  if (!pictures().TANK101) { must('picture', O.createMainPicture('Tank101', 'main')) }
  must('MESSAGE datalink', O.addDatalink('TANK101', { source: 'DVSYS.SFC-T101/MESSAGE.F_CV', inPlace: true, refreshSeconds: 1, x: 300, y: 340, color: '#0000ff' }))
  must('save picture', O.savePicture('TANK101'))
  const link = () => pictures().TANK101.elements.find(e => e.type === 'datalink' && e.tag === 'SFC-T101')
  const operate = value => { if (!P.usePictures.getState().writeNamedValue('TANK101', link().id, value)) throw new Error('MESSAGE entry ' + value); }
  const settle = (limit = 600) => { for (let i = 0; i < limit; i++) { M().tick(0.1); const s = M().sfcs['SFC-T101']; if (s.active === 0 && s.parameters.MESSAGE.value === 255 && i > 5) return } throw new Error('the sequence did not return to HOLD_SFC') }

  // Step 10: operate STARTUP
  scan(5)
  O.logOperate && O.logOperate('Operate switched to Run')
  operate(1)
  settle()

  // Modifying SFC-T101: SHUTDOWN in NS-T101, divergent paths, Download, operate
  const named = M().namedSets.configured['NS-T101']
  must('SHUTDOWN', M().applyNamedSetProperties(named, { ...named, entries: [...named.entries, { name: 'SHUTDOWN', value: 2, visible: true, userSelectable: true }] }) ? '' : 'rejected')
  D.goEdit('SFC-T101')
  const modified = () => {
    const c = S.sfcExpressionContext(M(), 'SFC-T101')
    const a = (text, extra) => { const r = X.parseSfcAssignment(text, M().modules, c); if (r.error) throw new Error(text + ': ' + r.error); return { ...r.value, ...extra } }
    const t = text => { const r = X.parseSfcCondition(text, M().modules, c); if (r.error) throw new Error(text + ': ' + r.error); return r.value }
    return [
      { id: 'hold', name: 'HOLD_SFC', actions: [a("'MESSAGE.CV' := 'NS-T101:SELECT SEQUENCE'", { qualifier: 'P', seconds: 0 })], transition: t("'MESSAGE.CV' = 'NS-T101:STARTUP'"), nextStep: 'open',
        alternatives: [{ condition: t("'MESSAGE.CV' = 'NS-T101:SHUTDOWN'"), nextStep: 'stop' }] },
      { id: 'open', name: 'OPEN_BLK_VLV', actions: [a("'//XV-101/DO1/SP_D.CV' := 1")], transition: t("'//XVSTAT-101/DI1/PV_D.CV' = 1"), nextStep: 'flow' },
      { id: 'flow', name: 'SET_FLOW_RATE', actions: [a("'//FIC-102/PID1/MODE.TARGET' := AUTO"), a("'//FIC-102/PID1/SP.CV' := 50")], transition: t("'//FIC-102/PID1/OUT.CV' > 30"), nextStep: 'start' },
      { id: 'start', name: 'START_PUMP', actions: [a("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:START'")], transition: t("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:RUNNING'"), nextStep: 'end' },
      { id: 'stop', name: 'STOP_PUMP', actions: [a("'//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:STOP'")], transition: t("'//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'"), nextStep: 'close' },
      { id: 'close', name: 'CLOSE_BLK_VLV', actions: [a("'//XV-101/DO1/SP_D.CV' := 0")], transition: t("'//XVSTAT-101/DI1/PV_D.CV' = 0"), nextStep: 'flowclose' },
      { id: 'flowclose', name: 'CLOSE_FLOW_VLV', actions: [a("'//FIC-102/PID1/MODE.TARGET' := MAN"), a("'//FIC-102/PID1/OUT.CV' := 0")], transition: t("'//FIC-102/PID1/OUT.CV' < 2"), nextStep: 'end' },
      { id: 'end', name: 'END_SEQUENCE', actions: [], transition: t('TRUE'), nextStep: 'hold' }
    ]
  }
  must('modified steps', M().setSfcSteps('SFC-T101', modified()) ?? '')
  must('save', D.saveStudioSfc('SFC-T101'))
  must('download', D.downloadSfc('SFC-T101'))
  must('check', D.checkSfc('SFC-T101').ok ? '' : D.checkSfc('SFC-T101').text)
  must('workstation setup data', M().downloadChangedNamedSets({ kind: 'workstation' }) ? '' : 'rejected')
  scan(5)
  operate(1)
  settle()
  operate(2)
  settle()
}
module.exports.needs = ['dv09Sfc', 'sfcExpressions', 'store', 'dv09Operate', 'pictureStore']
module.exports.ensurePrereqs = ensurePrereqs
