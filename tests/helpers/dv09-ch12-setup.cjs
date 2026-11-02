// Chapter 12 (course DV-09 pp 12-8 .. 12-33): enable Fieldbus in System Preferences and restart the server, wire the Fieldbus segment and do
// the segment checkout, add the H1 card by auto-sense, enable P01, download Card 5 and rescan the port. Store API only, so it also runs in the browser.
module.exports = function dv09Ch12Setup(ctx) {
  const M = ctx.M
  const sys = ctx.eng('systemPreferences').useSystem
  const rig = ctx.eng('fieldbusRig')
  const model = ctx.eng('fieldbusRigModel')
  const act = ctx.eng('fieldbusActions')
  const must = (e, what) => { if (e) throw new Error(what + ': ' + e) }

  // Workshop - System Preferences
  M().logEvent('DIAGNOSTIC', 'System Preferences', 'DeltaV System Preferences opened')
  must(sys.getState().setPendingFeature('fieldbus', true), 'enable fieldbus')
  must(sys.getState().acknowledgePending(), 'acknowledge')
  M().logEvent('DIAGNOSTIC', 'Database Administrator', 'DeltaV Database Administrator opened')
  must(sys.getState().shutdownServer(), 'shutdown')
  must(sys.getState().connectServer(), 'connect')

  // Workshop - Wire Fieldbus Segment, Steps 1-6
  must(rig.rigPlug('supply-brown', 'mb-pwr+'), 'brown')
  must(rig.rigPlug('supply-blue', 'mb-pwr-'), 'blue')
  must(rig.rigPlug('host-plus', 'h1-3'), 'host +')
  must(rig.rigPlug('host-minus', 'h1-4'), 'host -')
  must(rig.rigPlug('host-shield', 'gnd-1'), 'shield')
  must(rig.rigPlug('trunk-jb', 'jb-P1'), 'trunk')
  must(rig.rigPlug('spur-jb', 'jb-S2'), 'spur')
  must(rig.rigPlug('terminator', 'jb-S0'), 'terminator')
  must(rig.rigPlug('supply-ac', 'strip'), 'power strip')

  // Segment checkout: the segment cable comes off the Mother Board for resistance and capacitance
  const meter = () => rig.getRig().meter
  const press = (b, n = 1) => { for (let i = 0; i < n; i++) rig.rigMeterPress(b, 0) }
  const stepTo = (reached, button) => { for (let i = 0; i < 20 && !reached(); i++) press(button) }
  const record = (a, com, t) => { rig.rigSetLead('a', a, t); const r = rig.rigRecord(t + 3000); if (typeof r === 'string') throw new Error('record ' + a + '/' + com + ': ' + r) }
  const recordPair = (a, b, t) => { rig.rigSetLead('a', a, t); rig.rigSetLead('com', b, t); record(a, b, t) }
  const pairs = [['sig+', 'sig-'], ['sig+', 'shield'], ['sig-', 'shield'], ['sig+', 'ground'], ['sig-', 'ground'], ['shield', 'ground']]
  must(rig.rigPlug('trunk-mb', null), 'remove segment cable')
  press('power')
  press('inputA'); press('down', 4); press('F4')
  stepTo(() => meter().rangeIndex === 3, 'mV')
  pairs.forEach(([a, b], i) => recordPair(a, b, 10000 + i))
  press('inputA'); press('down', 1); press('F4')
  stepTo(() => meter().rangeIndex === 2, 'mV')
  pairs.forEach(([a, b], i) => recordPair(a, b, 20000 + i))
  must(rig.rigPlug('trunk-mb', 'mb-seg'), 'reconnect segment cable')
  press('inputA'); press('up', 10); press('down', 1); press('F4')
  stepTo(() => meter().voltIndex === 4, 'V')
  recordPair('sig+', 'sig-', 30000)
  press('scopeMenu'); press('down', 1); press('F4', 3)
  stepTo(() => model.VOLT_DIV_MV[meter().voltIndex] === 200, model.VOLT_DIV_MV[meter().voltIndex] > 200 ? 'mV' : 'V')
  stepTo(() => model.TIME_DIV_US[meter().timeIndex] === 10, 'timeDown')
  press('hold')
  recordPair('sig+', 'sig-', 40000)

  // Workshop - Adding an H1 Card: the controller commissioned in Chapter 1
  const ctl = Object.values(M().hardware.controllers).find(c => c.commissioned && c.installedH1)
  if (!ctl) throw new Error('no commissioned controller with an H1 interface')
  if (!M().autoSenseController(ctl.tag)) throw new Error('auto-sense failed')
  const cardId = ctl.tag + '/C05'
  must(act.configureH1Port(cardId, 'P01', { enabled: true, description: 'Fieldbus Interface Port' }), 'enable P01')
  must(act.downloadH1Card(cardId), 'download card 5')
  ctx.useStore.setState({ running: true })
  for (let i = 0; i < 120; i++) M().tick(0.1)
  must(act.rescanPort(cardId, 'P01'), 'rescan')
}
module.exports.needs = ['systemPreferences', 'fieldbusRig', 'fieldbusRigModel', 'fieldbusActions']
