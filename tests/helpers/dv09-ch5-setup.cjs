// Chapter 5: the motor control module MTR-102 (MTR-11_ILOCK template), its pump on Tank101 and the operating verification of the interlocks
// (course DV-09 pp 5-12 .. 5-19). Performed with the store API only (the UI passes drive the same steps through the screens).
module.exports = function dv09Ch5Setup(ctx) {
  const M = ctx.M
  const C = ctx.eng('dv09Cm'), A = ctx.eng('dv09Loops'), O = ctx.eng('dv09Operate'), X = ctx.eng('dv09OperateEx'), P = ctx.eng('pictureStore')
  const must = (what, err) => { if (err) throw new Error(what + ': ' + err) }
  ctx.useStore.setState({ running: true })
  const ctl = Object.values(M().hardware.controllers).find(c => c.trackDownload && c.commissioned).tag
  const scan = n => { for (let i = 0; i < n; i++) M().tick(0.1) }
  const pic = () => P.usePictures.getState().pictures.TANK101
  const link = (tag, path) => pic().elements.find(e => e.type === 'datalink' && e.tag === tag && e.path === path)
  const level = v => { if (!M().setAoParameter('LEVEL-101', 'CAS_SP', v)) throw new Error('CAS_SP write failed: ' + v); scan(15) }
  const valve = v => { must('XV-101', C.writeSpD('XV-101', v)); scan(10) }
  const speed = on => { if (!P.usePictures.getState().writeDiscreteValue('TANK101', link('MTR-102', 'DC1/SP_D').id, on)) throw new Error('SP_D write failed'); scan(40) }

  // Creating a Motor Control Module
  const made = A.createFromTemplate('MTR-11_ILOCK', 'PLANT_AREA_A')
  if (made.error) throw new Error('template: ' + made.error)
  must('rename', C.renameModule(made.tag, 'MTR-102'))
  C.studioOpened('MTR-102')
  must('IO_IN_1', A.setLoopIo('MTR-102', 'IO_IN_1', 'XI-2'))
  must('IO_OUT_1', A.setLoopIo('MTR-102', 'IO_OUT_1', 'ZX-2'))
  for (const [option, on] of [['Passive on Active Timeout', false], ['Passive when confirmed', false], ['Trip', false], ['Reset required', true], ['Permissive', true], ['SP Track', false], ['Interlock', true]]) must(option, A.setDeviceOption('MTR-102', option, on))
  must('CND1', A.setCondition('MTR-102', 'CND1', { description: 'XVSTAT-101 is closed', expr: "'//XVSTAT-101/DI1/PV_D'=0" }))
  must('CND2', A.setCondition('MTR-102', 'CND2', { description: 'Tank101 level is <50', delaySec: 4, expr: "'//LI-101/AI1/PV'<50" }))
  must('assign', C.assignToNode('MTR-102', ctl))
  A.propertiesOpened('MTR-102')
  must('displays', C.setPrimaryDisplay('MTR-102', 'Tank101', 'ILOCK2_DETAIL'))
  must('save', C.saveModule('MTR-102'))
  must('download', C.downloadModule('MTR-102'))
  C.studioOnline('MTR-102')
  scan(20)

  // Modifying an Operator Display
  O.logOperate('DeltaV Operate launched')
  O.logOperate('Operate switched to Configure')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Configure (File > Open)')
  must('PV_D', O.addDatalink('TANK101', { source: 'DVSYS.MTR-102/DC1/PV_D.A_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 520, color: '#0000ff' }))
  must('SP_D', O.addDatalink('TANK101', { source: 'DVSYS.MTR-102/DC1/SP_D.A_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 570, color: '#0000ff' }))
  X.expertOpened('TANK101', 'Data Entry Expert')
  must('multi-item select', X.setDataEntry('TANK101', link('MTR-102', 'DC1/SP_D').id, { kind: 'multi' }))
  must('ALARMS[1]', O.addDatalink('TANK101', { source: 'DVSYS.MTR-102/ALARMS[1].A_LAALM', inPlace: false, refreshSeconds: 1, x: 520, y: 570, color: '#aa0000' }))
  X.expertOpened('TANK101', 'Visibility Expert')
  must('visibility', X.setVisibility('TANK101', link('MTR-102', 'ALARMS[1].A_LAALM').id, 'MTR-102/ALARMS[1].F_LAALM', true))
  must('pump', X.addAnimDynamo('TANK101', 'PUMPS_ANIM', 520, 330, 'MTR-102'))
  const pump = pic().elements.find(e => e.dynamoSet === 'PUMPS_ANIM').id
  must('color by', X.setPumpColorBy('TANK101', pump, { source: 'DVSYS.MTR-102/DC1/PV_D.F_CV', threshold: 'Exact Match', entries: [{ value: 0, color: '#ffffff' }, { value: 1, color: '#ffff00' }] }))
  must('save picture', O.savePicture('TANK101'))
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture closed (File > Close)')

  // Operating the Motor Control Module
  O.logOperate('Window > Close All')
  O.logOperate('Operate switched to Run')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Run (Open Main Display)')
  valve(1)
  level(500)
  speed(true)
  speed(false)
  speed(true)
  valve(0)
  scan(20)
  valve(1)
  must('reset', (M().resetDevice('MTR-102'), null))
  scan(10)
  speed(true)
  level(10)
  scan(60)
  level(500)
  must('reset', (M().resetDevice('MTR-102'), null))
  scan(10)
}
module.exports.needs = ['dv09Cm', 'dv09Loops', 'dv09Operate', 'dv09OperateEx', 'pictureStore']
