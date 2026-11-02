// Chapter 4: LEVEL-101 (Analog Output) and LI-101 (ANALOG template), the Tank101 level display with the alarm datalinks and the operating
// verification (course DV-09 pp 4-8 .. 4-20, 4-38, 4-39, 4-52 .. 4-54). Performed with the store API only (the UI passes drive the same steps through the screens).
module.exports = function dv09Ch4Setup(ctx) {
  const M = ctx.M, L = ctx.L
  const C = ctx.eng('dv09Cm'), A = ctx.eng('dv09Loops'), O = ctx.eng('dv09Operate'), X = ctx.eng('dv09OperateEx'), P = ctx.eng('pictureStore')
  const must = (what, err) => { if (err) throw new Error(what + ': ' + err) }
  ctx.useStore.setState({ running: true })
  const EC = ctx.eng('eventChronicle')
  EC.useChronicle.setState({ configured: EC.defaultChronicleConfig(), deployed: null, archive: EC.emptyArchive() })
  const ctl = Object.values(M().hardware.controllers).find(c => c.trackDownload && c.commissioned).tag
  const scan = n => { for (let i = 0; i < n; i++) M().tick(0.1) }
  const pic = () => P.usePictures.getState().pictures.TANK101
  const link = (tag, path) => pic().elements.find(e => e.type === 'datalink' && e.tag === tag && e.path === path)
  const ack = () => { for (const a of M().alarms.filter(x => x.moduleTag === 'LI-101' && !x.acknowledged)) M().ackAlarm(a.id) }
  const write = value => { if (!M().setAoParameter('LEVEL-101', 'CAS_SP', value)) throw new Error('CAS_SP write failed: ' + value); scan(15) }

  // Creating the Analog Output module LEVEL-101
  must('create LEVEL-101', C.createBlankModule('LEVEL-101', 'PLANT_AREA_A'))
  C.studioOpened('LEVEL-101')
  must('AO block', A.addLoopBlock('LEVEL-101', 'AO'))
  must('filters', C.setFilters('LEVEL-101', ['Quick Configuration', 'Common Configuration']))
  must('IO_OUT', A.setLoopIo('LEVEL-101', 'IO_OUT', 'LY-1'))
  must('PV_SCALE', A.setScale('LEVEL-101', { low: 0, high: 1000, unit: 'gal' }))
  must('SP limits', A.setSpLimits('LEVEL-101', { high: 1000, low: 0 }))
  must('CAS_SP', A.addInputParameter('LEVEL-101', 'CAS_SP'))
  must('wire', A.connectWire('LEVEL-101', 'CAS_SP', 'AO1.CAS_IN'))
  must('assign', C.assignToNode('LEVEL-101', ctl))
  A.propertiesOpened('LEVEL-101')
  must('save', C.saveModule('LEVEL-101'))
  must('download', C.downloadModule('LEVEL-101'))
  C.studioOnline('LEVEL-101')

  // Using the ANALOG module template: LI-101
  const made = A.createFromTemplate('ANALOG', 'PLANT_AREA_A')
  if (made.error) throw new Error('template: ' + made.error)
  must('rename', C.renameModule(made.tag, 'LI-101'))
  C.studioOpened('LI-101')
  must('IO_IN', A.setLoopIo('LI-101', 'IO_IN', 'LT-1'))
  must('OUT_SCALE', A.setScale('LI-101', { low: 0, high: 1000, unit: 'gal' }))
  must('HI_ALM', A.setBlockAlarm('LI-101', 'HI', { limit: 950, enabled: true }))
  must('LO_ALM', A.setBlockAlarm('LI-101', 'LO', { limit: 100, enabled: true }))
  must('assign', C.assignToNode('LI-101', ctl))
  must('primary display', C.setPrimaryDisplay('LI-101', 'Tank101'))
  must('save', C.saveModule('LI-101'))
  must('download', C.downloadModule('LI-101'))
  scan(15)

  // Modifying the Operator Display: level, tank and fill
  O.logOperate('DeltaV Operate launched')
  O.logOperate('Operate switched to Configure')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Configure (File > Open)')
  O.logOperate('Datalink Stamper selected')
  must('datalink LI-101', O.addDatalink('TANK101', { source: 'DVSYS.LI-101/AI1/PV.F_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 330, color: '#0000ff' }))
  must('datalink CAS_SP', O.addDatalink('TANK101', { source: 'DVSYS.LEVEL-101/CAS_SP.F_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 380, color: '#0000ff' }))
  X.expertOpened('TANK101', 'Data Entry Expert')
  must('data entry', X.setDataEntry('TANK101', link('LEVEL-101', 'CAS_SP').id, { kind: 'numeric', low: 0, high: 1000, fetchLimits: false }))
  must('tank', X.addTank('TANK101', 700, 60))
  must('rectangle', X.addRectangle('TANK101', 732, 100))
  const rect = pic().elements.find(e => e.type === 'rectangle').id
  must('color', X.setShapeColor('TANK101', rect, { foreground: '#0000ff', background: '#cfe2f3' }))
  must('fill', X.setFill('TANK101', rect, { source: 'DVSYS.LI-101/AI1/PV.F_CV', vertical: true, fetchLimits: true }))
  must('save picture', O.savePicture('TANK101'))
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture closed (File > Close)')

  // Operating the Analog Module (p4-20)
  O.logOperate('Window > Close All')
  O.logOperate('Operate switched to Run')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Run (Open Main Display)')
  write(750)

  // Modifying the Operator Display (p4-38): HI_ALM and LO_ALM datalinks
  O.logOperate('Operate switched to Configure')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Configure (File > Open)')
  must('HI_ALM', O.addDatalink('TANK101', { source: 'DVSYS.LI-101/HI_ALM.A_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 430, color: '#aa0000' }))
  must('LO_ALM', O.addDatalink('TANK101', { source: 'DVSYS.LI-101/LO_ALM.A_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 470, color: '#aa0000' }))
  must('save picture', O.savePicture('TANK101'))
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture closed (File > Close)')

  // Operating the Analog Module (p4-39): the HIGH and LOW alarms
  O.logOperate('Operate switched to Run')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Run (Open Main Display)')
  write(960); ack(); write(500)
  write(90); ack(); write(500)

  // Modifying the Operator Display (pp 4-52, 4-53): ALARMS[1] with a Visibility Expert
  O.logOperate('Operate switched to Configure')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Configure (File > Open)')
  O.deleteElement('TANK101', link('LI-101', 'HI_ALM').id)
  O.deleteElement('TANK101', link('LI-101', 'LO_ALM').id)
  must('ALARMS[1]', O.addDatalink('TANK101', { source: 'DVSYS.LI-101/ALARMS[1].A_LAALM', inPlace: false, refreshSeconds: 1, x: 300, y: 430, color: '#aa0000' }))
  X.expertOpened('TANK101', 'Visibility Expert')
  must('visibility', X.setVisibility('TANK101', link('LI-101', 'ALARMS[1].A_LAALM').id, 'LI-101/ALARMS[1].F_LAALM', true))
  must('save picture', O.savePicture('TANK101'))

  // Operating the Analog Module (p4-54)
  O.logOperate('Operate switched to Run')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Run (Open Main Display)')
  write(960); ack(); write(500)
  M().logEvent('DIAGNOSTIC', 'DeltaV Operate', 'Process History View (Event Chronicle) opened')
  ack()
  // The Event Chronicle of the workstation: Enable Event Chronicle, Download, then the alarms are recorded.
  const chron = EC.useChronicle.getState()
  must('chronicle', chron.configure({ ...chron.configured, enabled: true }))
  must('chronicle download', chron.download())
  write(960); ack(); write(500)
  M().logEvent('DIAGNOSTIC', 'DeltaV Operate', 'Process History View (Event Chronicle) opened')
}
module.exports.needs = ['dv09Cm', 'dv09Loops', 'dv09Operate', 'dv09OperateEx', 'pictureStore', 'eventChronicle']
