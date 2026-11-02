const assert = require('node:assert/strict')
const test = require('node:test')
const { fixture } = require('./helpers/dv09-fixture.cjs')
const { DV09_CHAPTER5 } = require('../src/renderer/src/engine/dv09Ch5Workshops.ts')
const { DV09_CH5 } = require('../src/renderer/src/engine/dv09Ch5.ts')
const { DV09_COURSE } = require('../src/renderer/src/engine/dv09Course.ts')

const CTL = 'CTLR_PAINT'
const eng = ctx => ({ C: ctx.eng('dv09Cm'), A: ctx.eng('dv09Loops'), O: ctx.eng('dv09Operate'), X: ctx.eng('dv09OperateEx'), P: ctx.eng('pictureStore') })
const verdicts = ctx => Object.fromEntries(DV09_CH5.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => [c.id, c.verdict]))
const scan = (ctx, n = 15) => { ctx.useStore.setState({ running: true }); for (let i = 0; i < n; i++) ctx.M().tick(0.1) }
const alerts = []
const quiet = fn => { const before = global.window.alert; global.window.alert = m => alerts.push(m); try { return fn() } finally { global.window.alert = before } }
const withStores = (through, fn) => fixture(through, ctx => { const e = eng(ctx); return fn(ctx, e.C, e.A, e.O, e.X, e.P) })
const mtr = ctx => ctx.M().modules['MTR-102']
const motorFromTemplate = (ctx, C, A) => { const made = A.createFromTemplate('MTR-11_ILOCK', 'PLANT_AREA_A'); assert.equal(C.renameModule(made.tag, 'MTR-102'), null); return made.tag }
const configureMotor = (C, A) => {
  assert.equal(A.setLoopIo('MTR-102', 'IO_IN_1', 'XI-2'), null); assert.equal(A.setLoopIo('MTR-102', 'IO_OUT_1', 'ZX-2'), null)
  assert.equal(A.setDeviceOption('MTR-102', 'Reset required', true), null)
  assert.equal(A.setCondition('MTR-102', 'CND1', { description: 'XVSTAT-101 is closed', expr: "'//XVSTAT-101/DI1/PV_D'=0" }), null)
  assert.equal(A.setCondition('MTR-102', 'CND2', { description: 'Tank101 level is <50', delaySec: 4, expr: "'//LI-101/AI1/PV'<50" }), null)
  assert.equal(C.assignToNode('MTR-102', CTL), null); assert.equal(C.setPrimaryDisplay('MTR-102', 'Tank101', 'ILOCK2_DETAIL'), null)
  assert.equal(C.saveModule('MTR-102'), null); assert.equal(C.downloadModule('MTR-102'), null)
}

test('Chapter 5 workshop definitions: reading plus the three manual workshops with unique step ids', () => {
  const ws = DV09_CHAPTER5.workshops
  assert.deepEqual(ws.map(w => w.id), ['dv09-ch5-reading', 'dv09-ch5-motor', 'dv09-ch5-display', 'dv09-ch5-operate'])
  assert.ok(ws.every(w => w.id.startsWith(DV09_CH5.prefix)))
  const ids = ws.flatMap(w => w.steps.map(s => s.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.match(ws[1].steps[0].text, /drag and drop the MTR-11_ILOCK template from the Library to PLANT_AREA_A/)
  assert.match(ws[1].steps.find(s => s.id === 'dv09-5a-4b').text, /Tank101 level is <50, Time_Duration 4 Secs/)
  assert.match(ws[2].steps.find(s => s.id === 'dv09-5b-3').text, /PumpAnimC1 from Dynamo set PumpsAnim/)
  assert.match(ws[3].steps[5].text, /10 gallons/)
  assert.ok(DV09_COURSE.some(m => m.workshops.some(w => w.id === 'dv09-ch5-motor')))
  const checked = new Set(withStores(4, ctx => DV09_CH5.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => c.id)))
  assert.deepEqual(ws.slice(1).flatMap(w => w.steps.map(s => s.id)).filter(id => !checked.has(id)), [], 'every workshop step has a live check')
})

test('chapter 5 starts pending after chapter 4 and every step is verified after the setup', () => {
  withStores(4, ctx => { assert.ok(Object.values(verdicts(ctx)).every(v => v === 'pending')) })
  withStores(5, ctx => {
    const v = verdicts(ctx)
    assert.equal(Object.keys(v).length, 31)
    assert.deepEqual(Object.entries(v).filter(([, x]) => x !== 'verified'), [])
  })
})

test('MTR-11_ILOCK: the template starts with the slide 5-10 device options, blank conditions, 16-condition detail and is undownloaded', () => withStores(4, (ctx, C, A) => quiet(() => {
  const tag = motorFromTemplate(ctx, C, A)
  assert.equal(tag, 'MTR-11_ILOCK')
  const m = mtr(ctx)
  const cm = ctx.eng('dv09Cm').useDv09Cm.getState().cms['MTR-102']
  assert.deepEqual(A.deviceOptions(m, cm), { 'Passive on Active Timeout': true, 'Passive when confirmed': false, Trip: false, 'Reset required': false, Permissive: true, 'SP Track': true, Interlock: true })
  assert.deepEqual(Object.keys(m.ownedBlocks), ['CND1', 'CND2', 'BFI1', 'OR1', 'NOT1', 'AND1'])
  assert.deepEqual(Object.values(m.ownedBlocks).map(b => b.tag), ['MTR-102/CND1', 'MTR-102/CND2', 'MTR-102/BFI1', 'MTR-102/OR1', 'MTR-102/NOT1', 'MTR-102/AND1'], 'the owned blocks follow the rename')
  assert.equal(m.interlockSource, 'MTR-102/NOT1'); assert.equal(m.permissiveSource, 'MTR-102/AND1')
  assert.equal(m.ownedBlocks.BFI1.in1.tag, 'MTR-102/CND1', 'the wires follow the rename')
  assert.equal(m.downloaded, false); assert.equal(m.detailDisplay, 'ILOCK16_DETAIL')
  assert.equal(m.ownedBlocks.CND1.description, '')
  assert.equal(A.createFromTemplate('MTR-11_ILOCK', 'PLANT_AREA_A').tag, 'MTR-11_ILOCK')
  assert.equal(A.createFromTemplate('MTR-11_ILOCK', 'PLANT_AREA_A').tag, 'MTR-11_ILOCK1')
})))

test('MTR-102: I/O types, device options, condition expressions and download prerequisites are validated', () => withStores(4, (ctx, C, A) => quiet(() => {
  motorFromTemplate(ctx, C, A)
  assert.ok(A.setLoopIo('MTR-102', 'IO_IN_1', 'ZX-2'), 'a DO channel is not a confirmation input')
  assert.ok(A.setLoopIo('MTR-102', 'IO_OUT_1', 'XI-2'), 'a DI channel is not a command output')
  assert.match(A.setDeviceOption('MTR-102', 'Nonsense', true), /Unknown device option/)
  assert.match(A.setCondition('MTR-102', 'CND1', { expr: "'//NO-SUCH/DI1/PV_D'=0" }), /CND1/)
  assert.match(A.setCondition('MTR-102', 'CND1', { expr: 'IN1 +' }), /CND1/)
  assert.match(A.setCondition('MTR-102', 'CND2', { delaySec: -1 }), /Time_Duration/)
  assert.match(A.setCondition('MTR-102', 'CND2', { description: 'x'.repeat(25) }), /24 characters/)
  assert.match(A.setCondition('MTR-102', 'BFI1', {}), /no BFI1 condition/)
  assert.match(A.setCondition('XV-101', 'CND1', {}), /no CND1/)
  assert.match(C.downloadModule('MTR-102'), /not assigned/)
  C.assignToNode('MTR-102', CTL); C.saveModule('MTR-102')
  assert.match(C.downloadModule('MTR-102'), /IO_IN_1 is not set/)
  A.setLoopIo('MTR-102', 'IO_IN_1', 'XI-2')
  C.saveModule('MTR-102')
  assert.match(C.downloadModule('MTR-102'), /IO_OUT_1 is not set/)
  A.setLoopIo('MTR-102', 'IO_OUT_1', 'ZX-2'); C.saveModule('MTR-102')
  assert.equal(C.downloadModule('MTR-102'), null)
  assert.equal(mtr(ctx).downloaded, true)
})))

test('MTR-102 operates: starts and stops through ZX-2 / XI-2, trips on CND1 (valve closed) and on CND2 only after 4 seconds below 50', () => withStores(4, (ctx, C, A) => quiet(() => {
  motorFromTemplate(ctx, C, A); configureMotor(C, A)
  const M = ctx.M
  const level = v => { assert.ok(M().setAoParameter('LEVEL-101', 'CAS_SP', v)); scan(ctx) }
  const trips = () => M().eventLog.filter(e => e.tag === 'MTR-102' && /INTERLOCK_D tripped/.test(e.description)).map(e => e.description)
  // closed valve and an empty tank: interlocked
  level(0)
  assert.equal(C.writeSpD('XV-101', 1), null); scan(ctx, 10)
  level(500)
  M().resetDevice('MTR-102'); scan(ctx, 10)
  assert.equal(mtr(ctx).interlock, false)
  M().startMotor('MTR-102'); scan(ctx, 40)
  assert.equal(mtr(ctx).running, true, 'MTR-102 runs when XV-101 is open and the level is above 50')
  const dst = id => Object.values(M().hardware.traditionalCards).flatMap(c => c.channels).find(c => c.dst === id)
  assert.equal(dst('ZX-2').value, 1, 'card 4 channel 2 is on'); assert.equal(dst('XI-2').value, 1, 'card 3 channel 2 follows it')
  M().stopMotor('MTR-102'); scan(ctx, 40)
  assert.equal(mtr(ctx).running, false)
  M().startMotor('MTR-102'); scan(ctx, 40)
  const before = trips().length
  assert.equal(C.writeSpD('XV-101', 0), null); scan(ctx, 10)
  assert.equal(mtr(ctx).interlock, true); assert.equal(mtr(ctx).running, false)
  assert.equal(trips().length, before + 1); assert.match(trips()[before], /first out CND1: XVSTAT-101 is closed/)
  // Reset required: stays locked after the cause is gone until Reset
  assert.equal(C.writeSpD('XV-101', 1), null); scan(ctx, 20)
  assert.equal(mtr(ctx).locked, true)
  M().resetDevice('MTR-102'); scan(ctx, 10); M().startMotor('MTR-102'); scan(ctx, 40)
  assert.equal(mtr(ctx).running, true)
  // CND2: the level must stay below 50 for 4 seconds
  level(10); scan(ctx, 15)
  assert.equal(mtr(ctx).interlock, false, 'after 3 seconds nothing has tripped')
  scan(ctx, 15)
  assert.equal(mtr(ctx).interlock, true); assert.match(trips().pop(), /first out CND2: Tank101 level is <50/)
  // exactly 50 does not trip
  M().resetDevice('MTR-102'); level(50); scan(ctx, 70)
  assert.equal(mtr(ctx).interlock, false)
})))

test('MTR-102 device options: without Reset required the motor is free again as soon as the interlock clears', () => withStores(4, (ctx, C, A) => quiet(() => {
  motorFromTemplate(ctx, C, A); configureMotor(C, A)
  assert.equal(A.setDeviceOption('MTR-102', 'Reset required', false), null)
  assert.equal(C.saveModule('MTR-102'), null); assert.equal(C.downloadModule('MTR-102'), null)
  const M = ctx.M
  assert.equal(C.writeSpD('XV-101', 1), null); assert.ok(M().setAoParameter('LEVEL-101', 'CAS_SP', 500)); scan(ctx, 20)
  M().startMotor('MTR-102'); scan(ctx, 40)
  assert.equal(mtr(ctx).running, true)
  C.writeSpD('XV-101', 0); scan(ctx, 20)
  assert.equal(mtr(ctx).running, false)
  C.writeSpD('XV-101', 1); scan(ctx, 20)
  assert.equal(mtr(ctx).locked, false)
  assert.equal(A.setDeviceOption('MTR-102', 'Interlock', false), null)
  assert.equal(mtr(ctx).interlockSource, undefined, 'the Interlock option off removes the interlock wiring')
  assert.equal(A.setDeviceOption('MTR-102', 'Interlock', true), null)
  assert.equal(mtr(ctx).interlockSource, 'MTR-102/NOT1')
})))

test('Tank101 pump and datalinks: Multi-Item Select SP_D, alarm visibility and the Color By pump animation', () => withStores(5, (ctx, C, A, O, X, P) => quiet(() => {
  const pic = () => P.usePictures.getState().pictures.TANK101
  const link = (tag, path) => pic().elements.find(e => e.type === 'datalink' && e.tag === tag && e.path === path)
  const pump = pic().elements.find(e => e.dynamoSet === 'PUMPS_ANIM')
  assert.deepEqual(pump.dynamoColors, { inactive: '#ffffff', active: '#ffff00' })
  assert.equal(link('MTR-102', 'DC1/SP_D').entry.method, 'DISCRETE')
  const ob = ctx.eng('pictureObjects')
  ctx.M().stopMotor('MTR-102'); scan(ctx, 40)
  assert.equal(ob.dynamoState(pump, ctx.M().modules).color, '#ffffff', 'stopped pump is white')
  ctx.M().resetDevice('MTR-102'); ctx.M().startMotor('MTR-102'); scan(ctx, 40)
  assert.equal(ob.dynamoState(pump, ctx.M().modules).color, '#ffff00', 'running pump is yellow')
  // Color By validation
  assert.match(X.setPumpColorBy('TANK101', pump.id, { source: 'DVSYS.XV-101/DO1/PV_D.F_CV', threshold: 'Exact Match', entries: [{ value: 0, color: '#ffffff' }, { value: 1, color: '#ffff00' }] }), /must be MTR-102/)
  assert.match(X.setPumpColorBy('TANK101', pump.id, { source: 'DVSYS.MTR-102/DC1/PV_D.F_CV', threshold: 'Exact Match', entries: [{ value: 0, color: '#ffffff' }] }), /0 and 1/)
  assert.match(X.setPumpColorBy('TANK101', link('MTR-102', 'DC1/SP_D').id, { source: 'DVSYS.MTR-102/DC1/PV_D.F_CV', threshold: 'Exact Match', entries: [] }), /pump dynamo/)
  // the PumpsAnim dynamo needs a motor module
  assert.match(X.addAnimDynamo('TANK101', 'PUMPS_ANIM', 10, 10, 'LI-101'), /MOTOR|not added/)
  // SP_D data entry writes the DC1 command
  const id = link('MTR-102', 'DC1/SP_D').id
  assert.equal(P.usePictures.getState().writeDiscreteValue('TANK101', id, false), true); scan(ctx, 40)
  assert.equal(ctx.M().modules['MTR-102'].running, false)
  // Visibility Expert source must be the module's own ALARMS[1]
  assert.match(X.setVisibility('TANK101', link('MTR-102', 'ALARMS[1].A_LAALM').id, 'LI-101/ALARMS[1].F_LAALM', true), /must be MTR-102/)
})))

test('checks move from pending to verified step by step and read real state', () => withStores(4, (ctx, C, A, O, X, P) => quiet(() => {
  ctx.useStore.setState({ running: true })
  assert.equal(verdicts(ctx)['dv09-5a-1'], 'pending')
  motorFromTemplate(ctx, C, A)
  assert.equal(verdicts(ctx)['dv09-5a-1'], 'verified'); assert.equal(verdicts(ctx)['dv09-5a-3a'], 'pending')
  A.setLoopIo('MTR-102', 'IO_IN_1', 'XI-2'); assert.equal(verdicts(ctx)['dv09-5a-3a'], 'verified')
  A.setLoopIo('MTR-102', 'IO_OUT_1', 'ZX-2'); assert.equal(verdicts(ctx)['dv09-5a-3b'], 'verified')
  assert.equal(verdicts(ctx)['dv09-5a-3c'], 'pending', 'the template has Passive on Active Timeout and SP Track checked')
  A.setDeviceOption('MTR-102', 'Passive on Active Timeout', false); assert.equal(verdicts(ctx)['dv09-5a-3c'], 'pending')
  A.setDeviceOption('MTR-102', 'SP Track', false); assert.equal(verdicts(ctx)['dv09-5a-3c'], 'verified')
  assert.equal(verdicts(ctx)['dv09-5a-3d'], 'pending'); A.setDeviceOption('MTR-102', 'Reset required', true); assert.equal(verdicts(ctx)['dv09-5a-3d'], 'verified')
  A.setCondition('MTR-102', 'CND1', { description: 'XVSTAT-101 is closed', expr: "'//XVSTAT-101/DI1/PV_D'=0" }); assert.equal(verdicts(ctx)['dv09-5a-4a'], 'verified')
  A.setCondition('MTR-102', 'CND2', { description: 'Tank101 level is <50', expr: "'//LI-101/AI1/PV'<50" }); assert.equal(verdicts(ctx)['dv09-5a-4b'], 'pending', 'no 4 second duration yet')
  A.setCondition('MTR-102', 'CND2', { delaySec: 4 }); assert.equal(verdicts(ctx)['dv09-5a-4b'], 'verified')
  C.assignToNode('MTR-102', CTL); assert.equal(verdicts(ctx)['dv09-5a-5'], 'verified')
  assert.equal(verdicts(ctx)['dv09-5a-6b'], 'pending'); C.setPrimaryDisplay('MTR-102', 'Tank101', 'ILOCK16_DETAIL'); assert.equal(verdicts(ctx)['dv09-5a-6b'], 'pending')
  C.setPrimaryDisplay('MTR-102', 'Tank101', 'ILOCK2_DETAIL'); assert.equal(verdicts(ctx)['dv09-5a-6a'], 'verified'); assert.equal(verdicts(ctx)['dv09-5a-6b'], 'verified')
  A.propertiesOpened('MTR-102'); C.saveModule('MTR-102'); assert.equal(verdicts(ctx)['dv09-5a-7a'], 'verified'); assert.equal(verdicts(ctx)['dv09-5a-7b'], 'pending')
  C.downloadModule('MTR-102'); assert.equal(verdicts(ctx)['dv09-5a-7b'], 'verified')
  A.setDeviceOption('MTR-102', 'Trip', true)
  assert.equal(verdicts(ctx)['dv09-5a-3c'], 'pending'); assert.equal(verdicts(ctx)['dv09-5a-7a'], 'verified', 'the saved configuration is still the correct one')
})))
