// Chapter 9: Workshop 1 - Modbus Tie-Back (course DV-09 pp 9-31 .. 9-45). Store API only, so it also runs inside the browser app.
// Needs the chapter 1 controller CTLR_PAINT and the plant area PLANT_AREA_A of chapter 2.
const CTL = 'CTLR_PAINT'
const CARD = CTL + '/C05'
const ok = (r, what) => { if (r !== null && r !== true) throw new Error(what + ': ' + r) }
const run = (ctx, seconds) => { ctx.useStore.setState({ running: true }); for (let i = 0; i < Math.round(seconds / 0.1); i++) ctx.M().tick(0.1) }
const dataset = over => ({ name: 'DS01', description: '', direction: 'OUTPUT', outputMode: 'COMPLETE_BLOCK', outputReadback: false, dataType: 'INT16', tag: 'FLOW-OUT',
  plcTable: 'HOLDING_REGISTERS', plcBase: 0, plcOffset: 0, count: 1, ...over })

module.exports = function dv09Ch9Setup(ctx) {
  const M = ctx.M
  // Tasks 1-5: serial card in slot 5, P01 master / P02 slave, RTU RS232 9600 even 8 1, tie-back, DEV01 at address 1 on both ports.
  ok(M().addSerialCard(CTL, 5, true), 'serial card')
  ok(M().configureSerialCard(CARD, { tieback: true }), 'tie-back')
  ok(M().configureSerialPort(CARD, 'P01', { enabled: true, protocol: 'RTU', mode: 'MASTER', retryCount: 1, timeoutMs: 1000, transmitDelayMs: 0, sendOutputsOnStartup: true,
    portType: 'RS232', baud: 9600, parity: 'EVEN', dataBits: 8, stopBits: 1 }), 'P01')
  ok(M().configureSerialPort(CARD, 'P02', { enabled: true, protocol: 'RTU', mode: 'SLAVE', transmitDelayMs: 0, portType: 'RS232', baud: 9600, parity: 'EVEN', dataBits: 8, stopBits: 1 }), 'P02')
  for (const port of ['P01', 'P02']) ok(M().addSerialDevice(CARD, port, 'DEV01', 1), 'device ' + port)
  const sets = [
    ['P01', dataset({ name: 'DS01', tag: 'FLOW-OUT' })],
    ['P01', dataset({ name: 'DS02', tag: 'MTR-OUT', dataType: 'BOOLEAN', plcTable: 'COILS', plcOffset: 1 })],
    ['P02', dataset({ name: 'DS01', tag: 'FLOW-IN', direction: 'INPUT' })],
    ['P02', dataset({ name: 'DS02', tag: 'MTR-IN', direction: 'INPUT', dataType: 'BOOLEAN', plcTable: 'COILS', plcOffset: 1 })]
  ]
  for (const [port, ds] of sets) ok(M().saveSerialDataset(CARD, port, 'DEV01', ds), 'dataset ' + ds.tag)
  ok(M().downloadSerialCard(CARD), 'download serial card')
  run(ctx, 3)
  // Task 8: MTR-MODBUS (motor, IO_IN_1 = MTR-IN/R2, IO_OUT_1 = MTR-OUT/R2), assigned to the controller, saved, downloaded, online.
  ok(M().createModule({ tag: 'MTR-MODBUS', type: 'MOTOR', area: 'PLANT_AREA_A', description: 'Pump on Modbus coils' }), 'MTR-MODBUS')
  ok(M().enableDeviceLifecycle('MTR-MODBUS'), 'MTR lifecycle')
  ok(M().editDeviceDraft('MTR-MODBUS', { controllerTag: CTL, inputDst: 'MTR-IN/R2', outputDst: 'MTR-OUT/R2', resetRequired: false }), 'MTR draft')
  ok(M().saveDeviceConfiguration('MTR-MODBUS'), 'MTR save')
  ok(M().downloadDeviceConfiguration('MTR-MODBUS'), 'MTR download')
  ok(M().setDeviceOnline('MTR-MODBUS', true), 'MTR online')
  run(ctx, 2)
  M().startMotor('MTR-MODBUS'); run(ctx, 2)
  M().stopMotor('MTR-MODBUS'); run(ctx, 2)
  // Task 9: FIC-MODBUS (PID_LOOP, IO_IN = FLOW-IN/R40001, IO_OUT = FLOW-OUT/R40001).
  ok(M().createModule({ tag: 'FIC-MODBUS', type: 'PID', templateId: 'PID_LOOP', area: 'PLANT_AREA_A', description: 'MODBUS loop' }), 'FIC-MODBUS')
  ok(M().bindAnalogDst('FIC-MODBUS', 'input', 'FLOW-IN/R40001'), 'FIC input')
  ok(M().bindAnalogDst('FIC-MODBUS', 'output', 'FLOW-OUT/R40001'), 'FIC output')
  ok(M().enablePidLifecycle('FIC-MODBUS'), 'PID lifecycle')
  ok(M().savePidConfiguration('FIC-MODBUS'), 'PID save')
  ok(M().downloadPidModule('FIC-MODBUS'), 'PID download')
  ok(M().setPidLifecycleOnline('FIC-MODBUS', true), 'PID online')
  run(ctx, 1)
  M().setMode('FIC-MODBUS', 'MAN'); run(ctx, 0.5)
  M().setOutput('FIC-MODBUS', 40); run(ctx, 3)
  // Steps 6-7 of both modules: a pump dynamo and a loop dynamo on an existing picture (TANK101), saved.
  const P = ctx.eng('pictureStore').usePictures
  if (!P.getState().pictures.TANK101) P.getState().createPicture('TANK101')
  if (!P.getState().addElement('TANK101', { type: 'pump', x: 560, y: 420, tag: 'MTR-MODBUS' })) throw new Error('pump dynamo')
  if (!P.getState().addElement('TANK101', { type: 'dynamo', x: 700, y: 420, tag: 'FIC-MODBUS' })) throw new Error('loop dynamo')
  if (!P.getState().savePicture('TANK101')) throw new Error('save picture')
}
module.exports.needs = ['pictureStore']
