// Chapter 3: Control modules XV-101 and XVSTAT-101 and the operator picture Tank101 (course DV-09 pp 3-12 .. 3-50).
// Performed with the store API only (the UI passes drive the same steps through the screens).
module.exports = function dv09Ch3Setup(ctx) {
  const M = ctx.M, L = ctx.L
  const C = ctx.eng('dv09Cm'), O = ctx.eng('dv09Operate'), P = ctx.eng('pictureStore')
  const must = (what, err) => { if (err) throw new Error(what + ': ' + err) }
  ctx.useStore.setState({ running: true })
  const ctl = Object.values(M().hardware.controllers).find(c => c.trackDownload && c.commissioned).tag
  const scan = n => { for (let i = 0; i < n; i++) M().tick(0.1) }

  // Creating Module XV-101
  must('create XV-101', C.createBlankModule('XV-101', 'PLANT_AREA_A'))
  C.studioOpened('XV-101')
  must('DO block', C.addBlock('XV-101', 'DO'))
  must('filters', C.setFilters('XV-101', ['Quick Configuration', 'Common Configuration']))
  must('IO_OUT', C.setIoDst('XV-101', 'XV-1'))
  must('mode', C.setModeTarget('XV-101', 'AUTO'))
  must('assign', C.assignToNode('XV-101', ctl))
  must('primary display', C.setPrimaryDisplay('XV-101', 'Tank101'))
  must('save', C.saveModule('XV-101'))
  must('download', C.downloadModule('XV-101'))
  C.studioOnline('XV-101')
  C.studioBlockSelected('XV-101', 'DO1')
  must('SP_D', C.writeSpD('XV-101', 1))
  scan(5)

  // Creating Module XVSTAT-101
  const made = C.createFromTemplate('DISCRETE', 'PLANT_AREA_A')
  if (made.error) throw new Error('template: ' + made.error)
  must('rename', C.renameModule(made.tag, 'XVSTAT-101'))
  C.studioOpened('XVSTAT-101')
  must('IO_IN', C.setIoDst('XVSTAT-101', 'LSO-1'))
  must('alarm', C.setDiscreteAlarm('XVSTAT-101', false))
  must('assign', C.assignToNode('XVSTAT-101', ctl))
  must('primary display', C.setPrimaryDisplay('XVSTAT-101', 'Tank101'))
  must('save', C.saveModule('XVSTAT-101'))
  must('download', C.downloadModule('XVSTAT-101'))
  C.studioOnline('XVSTAT-101')
  scan(5)

  // Creating a New Picture
  O.logOperate('DeltaV Operate launched')
  O.logOperate('Operate switched to Configure')
  O.ensureStandardPictures()
  must('new picture', O.createMainPicture('Tank101', 'main'))
  must('background', O.setBackgroundColor('TANK101', '#c9e4c5'))
  const pic = () => P.usePictures.getState().pictures.TANK101
  O.deleteElement('TANK101', pic().elements.find(e => e.content === O.MAIN_TEMPLATE_TEXT).id)
  must('navigation', O.setPictureNavigation('TANK101', 'Ovw_ref.grf', 'alarmList.grf'))
  must('save picture', O.savePicture('TANK101'))

  // Adding a Datalink
  O.logOperate('Datalink Stamper selected')
  O.logOperate('Expression Builder opened')
  O.logOperate('Browse DeltaV Control Parameters started')
  must('datalink XV-101', O.addDatalink('TANK101', { source: 'DVSYS.XV-101/DO1/SP_D.F_CV', inPlace: true, refreshSeconds: 1, x: 300, y: 200, color: '#0000ff' }))
  must('datalink XVSTAT-101', O.addDatalink('TANK101', { source: 'DVSYS.XVSTAT-101/DI1/PV_D.F_CV', inPlace: false, refreshSeconds: 1, x: 300, y: 260, color: '#0000ff' }))

  // Creating Static Objects / Text
  must('text 1', O.addText('TANK101', 160, 200, 'XV-101 command', '#aa0000'))
  must('text 2', O.addText('TANK101', 160, 260, 'XVSTAT-101 status'))
  const texts = pic().elements.filter(e => e.type === 'text')
  must('caption (Property Window)', O.setTextCaption('TANK101', texts[0].id, 'XV-101 SP_D', 'Property Window') ? '' : 'failed')
  O.logOperate('Text Caption Editor opened')
  must('caption (Text Caption Editor)', O.setTextCaption('TANK101', texts[1].id, 'XVSTAT-101 PV_D', 'Text Caption Editor') ? '' : 'failed')
  must('font dialog', O.setTextFont('TANK101', texts[0].id, { fontFamily: 'Arial', bold: true }, 'Font dialog') ? '' : 'failed')
  must('font property window', O.setTextFont('TANK101', texts[1].id, { fontFamily: 'Verdana', fontSize: 16, italic: true }, 'Property Window') ? '' : 'failed')

  // Adding a Dynamo
  O.logOperate('Dynamo set Valves2 opened')
  must('dynamo', O.addDynamo('TANK101', 'VALVE17', 520, 200, 'XV-101'))
  must('save picture', O.savePicture('TANK101'))
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture closed (File > Close)')
  must('Ovw_ref link', O.setPictureNavigation('OVW_REF', '', 'Tank101'))
  must('save Ovw_ref', O.savePicture('OVW_REF'))

  // Operating & Verifying
  O.logOperate('Window > Close All')
  O.logOperate('Operate switched to Run')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture opened in Run (Open Main Display)')
  const id = pic().elements.find(e => e.type === 'datalink' && e.tag === 'XV-101').id
  must('SP_D 0', P.usePictures.getState().writeDiscreteValue('TANK101', id, false) ? '' : 'write 0 failed')
  scan(5)
  must('SP_D 1', P.usePictures.getState().writeDiscreteValue('TANK101', id, true) ? '' : 'write 1 failed')
  scan(5)
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture navigation: Next Picture to alarmList.grf')
  M().logEvent('DIAGNOSTIC', 'TANK101', 'Picture navigation: Previous Picture to Ovw_ref.grf')
}
module.exports.needs = ['dv09Cm', 'dv09Operate', 'pictureStore']
