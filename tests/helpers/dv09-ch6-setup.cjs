// Chapter 6: the regulatory loop FIC-102 (PID_LOOP template), its datalinks, valve dynamo and pipes on Tank101, the DST usage before and after,
// and the operating verification (course DV-09 pp 6-14 .. 6-21). Performed with the store API only (the UI passes drive the same steps through the screens).
module.exports = function dv09Ch6Setup(ctx) {
  const M = ctx.M
  const C = ctx.eng('dv09Cm'), A = ctx.eng('dv09Loops'), O = ctx.eng('dv09Operate'), X = ctx.eng('dv09OperateEx'), P = ctx.eng('pictureStore'), D = ctx.eng('dstUsage')
  const must = (what, err) => { if (err) throw new Error(what + ': ' + err) }
  ctx.useStore.setState({ running: true })
  const ctl = Object.values(M().hardware.controllers).find(c => c.trackDownload && c.commissioned).tag
  const scan = n => { for (let i = 0; i < n; i++) M().tick(0.1) }
  const pic = () => P.usePictures.getState().pictures.TANK101
  const link = (tag, path) => pic().elements.find(e => e.type === 'datalink' && e.tag === tag && e.path === path)
  const dsts = () => { const t = D.dstUsage(M().hardware, M().modules).byType; return { AO: t.AO.referenced, AI: t.AI.referenced, DO: t.DO.referenced, DI: t.DI.referenced } }

  // Creating a Regulatory Loop: Task 1, DST usage before
  A.licensingViewed(dsts())

  // Using the PID_LOOP Template
  const made = A.createFromTemplate('PID_LOOP', 'PLANT_AREA_A')
  if (made.error) throw new Error('template: ' + made.error)
  must('rename', C.renameModule(made.tag, 'FIC-102'))
  C.studioOpened('FIC-102')
  must('IO_IN', A.setLoopIo('FIC-102', 'IO_IN', 'FT-2'))
  must('IO_OUT', A.setLoopIo('FIC-102', 'IO_OUT', 'FY-2'))
  must('GAIN', A.setTuningParameter('FIC-102', 'GAIN', 0.5))
  must('RESET', A.setTuningParameter('FIC-102', 'RESET', 3))
  must('PV_SCALE', A.setScale('FIC-102', { low: 0, high: 100, unit: 'GPM' }))
  must('IO_OPTS', A.setPidOptions('FIC-102', { ioOpts: 'Increase to Open' }))
  must('CONTROL_OPTS', A.setPidOptions('FIC-102', { controlOpts: 'Reverse Acting' }))
  must('LOW alarm', A.setBlockAlarm('FIC-102', 'LO', { enabled: true, limit: 10 }))
  must('HIGH alarm', A.setBlockAlarm('FIC-102', 'HI', { enabled: true, limit: 90 }))
  must('assign', C.assignToNode('FIC-102', ctl))
  A.propertiesOpened('FIC-102')
  must('primary display', C.setPrimaryDisplay('FIC-102', 'Tank101'))
  must('save', C.saveModule('FIC-102'))
  must('download', C.downloadModule('FIC-102'))
  C.studioOnline('FIC-102')
  scan(20)

  // Task 5: DST usage after
  A.licensingViewed(dsts())

  // Modifying an Operator Display
  O.logOperate('DeltaV Operate launched')
  O.logOperate('Operate switched to Configure')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Configure (File > Open)')
  must('SP', O.addDatalink('TANK101', { source: 'DVSYS.FIC-102/PID1/SP.F_CV', inPlace: false, refreshSeconds: 1, x: 800, y: 200, color: '#0000ff' }))
  X.expertOpened('TANK101', 'Data Entry Expert')
  must('numeric entry', X.setDataEntry('TANK101', link('FIC-102', 'PID1/SP').id, { kind: 'numeric', low: 0, high: 100, fetchLimits: true }))
  must('PV', O.addDatalink('TANK101', { source: 'DVSYS.FIC-102/PID1/PV.F_CV', inPlace: false, refreshSeconds: 1, x: 800, y: 250, color: '#0000ff' }))
  must('OUT', O.addDatalink('TANK101', { source: 'DVSYS.FIC-102/PID1/OUT.F_CV', inPlace: false, refreshSeconds: 1, x: 800, y: 300, color: '#0000ff' }))
  X.expertOpened('TANK101', 'Data Entry Expert')
  must('ramp entry', X.setDataEntry('TANK101', link('FIC-102', 'PID1/OUT').id, { kind: 'ramp', rate: 10 }))
  must('MODE.A_TARGET', O.addDatalink('TANK101', { source: 'DVSYS.FIC-102/PID1/MODE.A_TARGET', inPlace: false, refreshSeconds: 1, x: 800, y: 350, color: '#0000ff' }))
  X.expertOpened('TANK101', 'Data Entry Expert')
  must('multi-item select', X.setDataEntry('TANK101', link('FIC-102', 'PID1/MODE.A_TARGET').id, { kind: 'mode' }))
  must('MODE.A_ACTUAL', O.addDatalink('TANK101', { source: 'DVSYS.FIC-102/PID1/MODE.A_ACTUAL', inPlace: false, refreshSeconds: 1, x: 800, y: 400, color: '#0000ff' }))
  must('ALARMS[1]', O.addDatalink('TANK101', { source: 'DVSYS.FIC-102/ALARMS[1].A_LAALM', inPlace: false, refreshSeconds: 1, x: 800, y: 450, color: '#aa0000' }))
  X.expertOpened('TANK101', 'Visibility Expert')
  must('visibility', X.setVisibility('TANK101', link('FIC-102', 'ALARMS[1].A_LAALM').id, 'FIC-102/ALARMS[1].F_LAALM', true))
  must('valve dynamo', X.addAnimDynamo('TANK101', 'VALVE_HORIZONTAL_CONTROL_D1', 640, 330, 'FIC-102'))
  const valve = pic().elements.find(e => e.dynamoSet === 'VALVE_HORIZONTAL_CONTROL_D1' && e.tag === 'FIC-102').id
  must('valve color', X.setColorAnimation('TANK101', valve, 'valve', [{ tag: 'MTR-102', path: 'STATE', greaterThan: 0 }, { tag: 'XVSTAT-101', path: 'STATE', greaterThan: 0 }], '#ffff00', '#00aa00'))
  must('actuator color', X.setColorAnimation('TANK101', valve, 'actuator', [{ tag: 'FIC-102', path: 'PID1/OUT', greaterThan: 0 }], '#ffff00', '#00aa00'))
  must('pipe 1', X.addAnimDynamo('TANK101', 'PIPES_ANIM', 420, 364))
  must('pipe 2', X.addAnimDynamo('TANK101', 'PIPES_ANIM', 580, 364))
  must('save picture', O.savePicture('TANK101'))
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture closed (File > Close)')

  // Operating & Verifying
  O.logOperate('Window > Close All')
  O.logOperate('Operate switched to Run')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Run (Open Main Display)')
  must('XV-101', C.writeSpD('XV-101', 1))
  scan(10)
  if (!M().setAoParameter('LEVEL-101', 'CAS_SP', 500)) throw new Error('CAS_SP write failed')
  scan(15)
  if (!P.usePictures.getState().writeDiscreteValue('TANK101', link('MTR-102', 'DC1/SP_D').id, true)) throw new Error('MTR-102 start failed')
  scan(40)
  if (!M().setMode('FIC-102', 'AUTO')) throw new Error('MODE failed')
  for (const sp of [30, 60]) { if (!M().setSetpoint('FIC-102', sp)) throw new Error('SP failed'); scan(120) }
  M().logEvent('DIAGNOSTIC', 'FIC-102', 'Detail picture opened')
  if (!M().setTuning('FIC-102', { gain: 0.7, reset: 2.5 })) throw new Error('tuning failed')
  scan(60)
  M().logEvent('DIAGNOSTIC', 'FIC-102', 'Real-time trend opened')
  // The student leaves the loop with the configured tuning (chapter 7 seeds from this state).
  if (!M().setTuning('FIC-102', { gain: 0.5, reset: 3 })) throw new Error('tuning restore failed')
}
module.exports.needs = ['dv09Cm', 'dv09Loops', 'dv09Operate', 'dv09OperateEx', 'pictureStore', 'dstUsage']
