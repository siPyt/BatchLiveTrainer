const assert = require('node:assert/strict')
const test = require('node:test')
const { fixture } = require('./helpers/dv09-fixture.cjs')
const { DV09_CHAPTER4 } = require('../src/renderer/src/engine/dv09Ch4Workshops.ts')
const { DV09_CH4 } = require('../src/renderer/src/engine/dv09Ch4.ts')
const { DV09_COURSE } = require('../src/renderer/src/engine/dv09Course.ts')

const CTL = 'CTLR_PAINT'
const eng = ctx => ({ C: ctx.eng('dv09Cm'), A: ctx.eng('dv09Loops'), O: ctx.eng('dv09Operate'), X: ctx.eng('dv09OperateEx'), P: ctx.eng('pictureStore') })
const verdicts = ctx => Object.fromEntries(DV09_CH4.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => [c.id, c.verdict]))
const scan = (ctx, n = 15) => { ctx.useStore.setState({ running: true }); for (let i = 0; i < n; i++) ctx.M().tick(0.1) }
const events = (ctx, re) => ctx.M().eventLog.filter(e => re.test(e.description))
const alerts = []
const quiet = fn => { const before = global.window.alert; global.window.alert = m => alerts.push(m); try { return fn() } finally { global.window.alert = before } }
const withStores = (through, fn) => fixture(through, ctx => { const e = eng(ctx); return fn(ctx, e.C, e.A, e.O, e.X, e.P) })

test('Chapter 4 workshop definitions: reading plus the five manual workshops with unique step ids', () => {
  const ws = DV09_CHAPTER4.workshops
  assert.deepEqual(ws.map(w => w.id), ['dv09-ch4-reading', 'dv09-ch4-analog', 'dv09-ch4-display', 'dv09-ch4-operate', 'dv09-ch4-display2', 'dv09-ch4-operate2'])
  assert.ok(ws.every(w => w.id.startsWith(DV09_CH4.prefix)))
  const ids = ws.flatMap(w => w.steps.map(s => s.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.match(ws[1].title, /Creating Analog Modules & Defining Analog Alarms/)
  assert.match(ws[1].steps[0].text, /Drag and drop Analog Output from the IO palette/)
  assert.match(ws[1].steps.find(s => s.id === 'dv09-4a-3').text, /name the parameter CAS_SP\. The parameter type is Floating Point/)
  assert.match(ws[1].steps.find(s => s.id === 'dv09-4b-3c').text, /Modify HI_ALM limit to 950/)
  assert.match(ws[1].steps.find(s => s.id === 'dv09-4c-6').text, /uncheck Fetch Limits from the Data Source and set the limits to 0 - 1000/)
  assert.match(ws[4].steps[4].text, /LI-101\/ALARMS\[1\]\.F_LAALM/)
  assert.ok(DV09_COURSE.some(m => m.workshops.some(w => w.id === 'dv09-ch4-analog')), 'the course module list contains chapter 4')
  // every step except the reading items and the optional colour step is checked by a live check
  const checked = new Set(withStores(3, ctx => DV09_CH4.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => c.id)))
  const unchecked = ws.slice(1).flatMap(w => w.steps.map(s => s.id)).filter(id => !checked.has(id))
  assert.deepEqual(unchecked, ['dv09-4c-7', 'dv09-4g-7'], 'only the colour "as necessary" and "close all dialogs" steps are tick-only')
})

test('chapter 4 starts pending after chapter 3 and every step is verified after the setup', () => {
  withStores(3, ctx => { assert.ok(Object.values(verdicts(ctx)).every(v => v === 'pending')) })
  withStores(4, ctx => {
    const v = verdicts(ctx)
    assert.equal(Object.keys(v).length, 52)
    assert.deepEqual(Object.entries(v).filter(([, x]) => x !== 'verified'), [])
  })
})

test('LEVEL-101: a blank module takes the Analog Output block from the palette; scale and SP limits are validated', () => withStores(3, (ctx, C, A) => quiet(() => {
  assert.equal(C.createBlankModule('LEVEL-101', 'PLANT_AREA_A'), null)
  assert.match(A.setLoopIo('LEVEL-101', 'IO_OUT', 'LY-1'), /no function block/)
  assert.equal(A.addLoopBlock('LEVEL-101', 'AO'), null)
  assert.match(A.addLoopBlock('LEVEL-101', 'AI'), /already contains/)
  const m = () => ctx.M().modules['LEVEL-101']
  assert.equal(m().type, 'AO'); assert.equal(m().downloaded, false)
  assert.equal(m().spHigh, 100, 'the template value is 0-100')
  assert.match(A.setScale('LEVEL-101', { low: 10, high: 10, unit: 'gal' }), /low value below the high/)
  assert.equal(A.setScale('LEVEL-101', { low: 0, high: 1000, unit: 'gal' }), null)
  assert.match(A.setSpLimits('LEVEL-101', { high: 1200 }), /SP limits/)
  assert.equal(A.setSpLimits('LEVEL-101', { high: 1000 }), null)
  assert.equal(m().spHigh, 1000)
  // IO_OUT must be an analog output channel
  assert.ok(A.setLoopIo('LEVEL-101', 'IO_OUT', 'LT-1'))
  assert.equal(A.setLoopIo('LEVEL-101', 'IO_OUT', 'LY-1'), null)
  assert.equal(ctx.M().hardware.analogBindings['LEVEL-101'].output, 'LY-1')
  // only a Floating Point parameter, only on the AO block, wired only to Cas_In
  assert.match(A.addInputParameter('LEVEL-101', 'CAS_SP', 'Integer'), /Floating Point/)
  assert.match(A.addInputParameter('LEVEL-101', ''), /name/)
  assert.equal(A.addInputParameter('LEVEL-101', 'cas_sp'), null)
  assert.match(A.addInputParameter('LEVEL-101', 'CAS_SP'), /rejected|not added/)
  assert.match(A.connectWire('LEVEL-101', 'CAS_SP', 'AO1.OUT'), /Cas_In/)
  assert.match(A.connectWire('LEVEL-101', 'NOPE', 'AO1.CAS_IN'), /not a parameter/)
  assert.equal(A.connectWire('LEVEL-101', 'CAS_SP', 'AO1.CAS_IN'), null)
  assert.equal(m().casParameter, 'CAS_SP')
})))

test('LEVEL-101: Save before Download, Assign To Node first, I/O needed; nothing runs before the download', () => withStores(3, (ctx, C, A) => quiet(() => {
  C.createBlankModule('LEVEL-101', 'PLANT_AREA_A'); A.addLoopBlock('LEVEL-101', 'AO')
  assert.match(C.downloadModule('LEVEL-101'), /not assigned to a controller/)
  C.assignToNode('LEVEL-101', CTL)
  assert.match(C.downloadModule('LEVEL-101'), /Save LEVEL-101 before/)
  C.saveModule('LEVEL-101')
  assert.match(C.downloadModule('LEVEL-101'), /IO_OUT is not set/)
  A.setLoopIo('LEVEL-101', 'IO_OUT', 'LY-1')
  assert.match(C.downloadModule('LEVEL-101'), /Save LEVEL-101/, 'a change after Save needs a new Save')
  C.saveModule('LEVEL-101')
  assert.equal(C.downloadModule('LEVEL-101'), null)
  assert.equal(ctx.M().modules['LEVEL-101'].downloaded, true)
  const lock = { ...ctx.M().modules['LEVEL-101'] }
  assert.equal(lock.controllerTag, CTL)
})))

test('LI-101: the ANALOG template is copied, renamed, scaled, alarmed, saved and downloaded; it reads what LEVEL-101 writes', () => withStores(4, (ctx, C, A) => quiet(() => {
  const li = () => ctx.M().modules['LI-101']
  const lv = () => ctx.M().modules['LEVEL-101']
  assert.deepEqual(li().alarms.filter(a => a.enabled).map(a => [a.type, a.limit]), [['HI', 950], ['LO', 100]])
  assert.equal(li().downloaded, true)
  const write = v => { assert.ok(ctx.M().setAoParameter('LEVEL-101', 'CAS_SP', v)); scan(ctx) }
  write(500)
  assert.ok(Math.abs(li().pv - 500) < 0.5, 'LI-101 follows LEVEL-101 through LY-1 / LT-1: ' + li().pv)
  assert.equal(lv().out, 50)
  write(750.5); assert.ok(Math.abs(li().pv - 750.5) < 0.5)
  assert.ok(!ctx.M().alarms.some(a => a.moduleTag === 'LI-101' && a.active))
  write(951); assert.ok(ctx.M().alarms.some(a => a.id === 'LI-101.HI' && a.active))
  write(100); assert.ok(ctx.M().alarms.some(a => a.id === 'LI-101.LO' && a.active), 'LOW at the limit of 100')
  write(101); assert.ok(!ctx.M().alarms.find(a => a.id === 'LI-101.LO')?.active)
  // CAS_SP above SP_HI_LIM is clamped by the AO block
  write(1000); assert.equal(lv().sp, 1000)
  // a second copy of the template takes the next free name and starts undownloaded, without alarms
  const again = A.createFromTemplate('ANALOG', 'PLANT_AREA_A')
  assert.equal(again.tag, 'ANALOG')
  scan(ctx)
  assert.equal(ctx.M().modules.ANALOG.downloaded, false)
  assert.ok(!ctx.M().alarms.some(a => a.moduleTag === 'ANALOG'), 'an undownloaded module raises no alarm')
  assert.equal(A.createFromTemplate('ANALOG', 'PLANT_AREA_A').tag, 'ANALOG1')
  assert.match(A.createFromTemplate('NO_SUCH_TEMPLATE', 'PLANT_AREA_A').error, /not modeled/)
  assert.match(A.createFromTemplate('ANALOG', 'NO_AREA').error, /does not exist/)
})))

test('LI-101: HI/LO limits, enable and priority are validated; the alarm needs the right DST on the assigned controller', () => withStores(3, (ctx, C, A) => quiet(() => {
  const made = A.createFromTemplate('ANALOG', 'PLANT_AREA_A')
  assert.equal(C.renameModule(made.tag, 'LI-101'), null)
  assert.match(A.setBlockAlarm('LI-101', 'HI', { limit: NaN }), /number/)
  assert.match(A.setBlockAlarm('LI-101', 'DV_HI', { limit: 1 }), /not an alarm detection/)
  assert.equal(A.setBlockAlarm('LI-101', 'HI', { limit: 950, priority: 'CRITICAL' }), null)
  assert.equal(ctx.M().modules['LI-101'].alarms.find(a => a.type === 'HI').priority, 'CRITICAL')
  assert.match(A.alarmMessage(ctx.M().modules['LI-101'].alarms.find(a => a.type === 'HI')), /High Alarm Value 0 Limit 950/)
  assert.equal(A.setLoopIo('LI-101', 'IO_IN', 'LT-1'), null)
  assert.ok(A.setLoopIo('LI-101', 'IO_IN', 'LY-1'), 'an AO channel is not an input')
  C.assignToNode('LI-101', CTL); C.saveModule('LI-101')
  assert.equal(C.downloadModule('LI-101'), null)
  assert.match(A.setBlockAlarm('LEVEL-101', 'HI', {}), /no analog block/)
})))

test('Tank101 datalinks: alarm CV paths, ALARMS[1] visibility and the Data Entry Expert numeric limits', () => withStores(4, (ctx, C, A, O, X, P) => quiet(() => {
  const pic = () => P.usePictures.getState().pictures.TANK101
  const link = (tag, path) => pic().elements.find(e => e.type === 'datalink' && e.tag === tag && e.path === path)
  assert.ok(link('LI-101', 'ALARMS[1].A_LAALM').alarmVisibility)
  assert.equal(link('LEVEL-101', 'CAS_SP').entry.method, 'NUMERIC')
  const id = link('LEVEL-101', 'CAS_SP').id
  const write = v => P.usePictures.getState().writeNumericValue('TANK101', id, v)
  assert.equal(write(1001), false, 'above the Data Entry Expert limit')
  assert.equal(write(-1), false)
  assert.equal(write(600), true); scan(ctx)
  assert.ok(Math.abs(ctx.M().modules['LI-101'].pv - 600) < 0.5)
  // the HI_ALM.A_CV datalink shows OK / HIGH
  const pd = ctx.eng('pictureDynamics')
  const m = ctx.M()
  assert.deepEqual(pd.pictureAlarmCvSignal({ tag: 'LI-101', path: 'HI_ALM' }, m.modules, m.alarms), { text: 'OK' })
  write(960); scan(ctx)
  assert.deepEqual(pd.pictureAlarmCvSignal({ tag: 'LI-101', path: 'HI_ALM' }, ctx.M().modules, ctx.M().alarms), { text: 'HIGH' })
  assert.deepEqual(pd.pictureAlarmCvSignal({ tag: 'LI-101', path: 'LO_ALM' }, ctx.M().modules, ctx.M().alarms), { text: 'OK' })
  assert.ok('error' in pd.pictureAlarmCvSignal({ tag: 'LEVEL-101', path: 'HI_ALM' }, ctx.M().modules, ctx.M().alarms))
  // Visibility Expert: wrong source rejected, the datalink shows ALARM/RTN states
  const al = link('LI-101', 'ALARMS[1].A_LAALM').id
  assert.match(X.setVisibility('TANK101', al, 'LEVEL-101/ALARMS[1].F_LAALM', true), /must be LI-101/)
  assert.match(X.setVisibility('TANK101', al, 'LI-101/AI1/PV', true), /must be LI-101/)
  assert.equal(X.setVisibility('TANK101', al, 'LI-101/ALARMS[1].F_LAALM', true), null)
  assert.equal(pd.highestRankedAlarmState('LI-101', ctx.M().alarms), 'ACTIVE_UNACK')
  // entry limits: Fetch Limits uses the source range, an explicit range must be ordered
  assert.ok(X.setDataEntry('TANK101', id, { kind: 'numeric', low: 5, high: 5, fetchLimits: false }))
  assert.equal(X.setDataEntry('TANK101', id, { kind: 'numeric', low: 0, high: 1000, fetchLimits: false }), null)
  assert.ok(X.setDataEntry('TANK101', link('LI-101', 'AI1/PV').id, { kind: 'numeric', low: 0, high: 1000, fetchLimits: false }), 'a read-only PV cannot be written')
})))

test('Tank101 fill: the rectangle follows LI-101 using the limits of its scale, vertical or horizontal', () => withStores(4, (ctx, C, A, O, X, P) => quiet(() => {
  const pd = ctx.eng('pictureDynamics')
  const rect = () => P.usePictures.getState().pictures.TANK101.elements.find(e => e.type === 'rectangle')
  assert.ok(ctx.M().setAoParameter('LEVEL-101', 'CAS_SP', 250)); scan(ctx)
  const fill = pd.pictureFill(rect(), ctx.M().modules)
  assert.ok(Math.abs(fill.percent - 25) < 0.1, 'fill percent ' + fill.percent)
  assert.match(X.setFill('TANK101', rect().id, { source: 'DVSYS.NO-SUCH/AI1/PV.F_CV', vertical: true, fetchLimits: true }), /does not exist/)
  assert.match(X.setFill('TANK101', rect().id, { source: 'DVSYS.LI-101/AI1/PV.F_CV', vertical: true, fetchLimits: false, low: 10, high: 10 }), /not applied/)
  assert.equal(X.setFill('TANK101', rect().id, { source: 'DVSYS.LI-101/AI1/PV.F_CV', vertical: false, fetchLimits: false, low: 0, high: 500 }), null)
  assert.ok(Math.abs(pd.pictureFill(rect(), ctx.M().modules).percent - 50) < 0.1)
  assert.match(X.setFill('TANK101', ctx.eng('pictureStore').usePictures.getState().pictures.TANK101.elements.find(e => e.type === 'tank').id, { source: 'DVSYS.LI-101/AI1/PV.F_CV', vertical: true, fetchLimits: true }), /rectangle/)
})))

test('checks move from pending to verified step by step and read real state', () => withStores(3, (ctx, C, A, O, X, P) => quiet(() => {
  ctx.useStore.setState({ running: true })
  const v0 = verdicts(ctx)
  assert.equal(v0['dv09-4a-1'], 'pending')
  C.createBlankModule('LEVEL-101', 'PLANT_AREA_A'); A.addLoopBlock('LEVEL-101', 'AO')
  assert.equal(verdicts(ctx)['dv09-4a-1'], 'verified')
  assert.equal(verdicts(ctx)['dv09-4a-2a'], 'pending')
  A.setLoopIo('LEVEL-101', 'IO_OUT', 'LY-1')
  assert.equal(verdicts(ctx)['dv09-4a-2a'], 'verified')
  A.setScale('LEVEL-101', { low: 0, high: 1000, unit: 'gal' })
  assert.equal(verdicts(ctx)['dv09-4a-2b'], 'verified')
  assert.equal(verdicts(ctx)['dv09-4a-2c'], 'pending')
  A.setSpLimits('LEVEL-101', { high: 1000, low: 0 })
  assert.equal(verdicts(ctx)['dv09-4a-2c'], 'verified'); assert.equal(verdicts(ctx)['dv09-4a-2d'], 'verified')
  assert.equal(verdicts(ctx)['dv09-4a-3'], 'pending'); assert.equal(verdicts(ctx)['dv09-4a-4'], 'pending')
  A.addInputParameter('LEVEL-101', 'CAS_SP')
  assert.equal(verdicts(ctx)['dv09-4a-3'], 'verified'); assert.equal(verdicts(ctx)['dv09-4a-4'], 'pending')
  A.connectWire('LEVEL-101', 'CAS_SP', 'AO1.CAS_IN')
  assert.equal(verdicts(ctx)['dv09-4a-4'], 'verified')
  C.assignToNode('LEVEL-101', CTL)
  assert.equal(verdicts(ctx)['dv09-4a-5'], 'verified'); assert.equal(verdicts(ctx)['dv09-4a-6b'], 'pending')
  A.propertiesOpened('LEVEL-101'); C.saveModule('LEVEL-101')
  assert.equal(verdicts(ctx)['dv09-4a-6a'], 'verified'); assert.equal(verdicts(ctx)['dv09-4a-6b'], 'verified'); assert.equal(verdicts(ctx)['dv09-4a-7'], 'pending')
  C.downloadModule('LEVEL-101')
  assert.equal(verdicts(ctx)['dv09-4a-7'], 'verified')
  // a later change that is not saved and downloaded again makes the step pending: the check compares with the saved / downloaded configuration
  A.setSpLimits('LEVEL-101', { high: 900 })
  assert.equal(verdicts(ctx)['dv09-4a-2c'], 'pending')
  assert.equal(verdicts(ctx)['dv09-4a-7'], 'verified', 'the downloaded configuration is still the one with 1000')
  A.setSpLimits('LEVEL-101', { high: 1000 })
  // an LI-101 with the wrong limit or DST fails its own step only
  const made = A.createFromTemplate('ANALOG', 'PLANT_AREA_A'); C.renameModule(made.tag, 'LI-101')
  assert.equal(verdicts(ctx)['dv09-4b-2'], 'verified')
  A.setBlockAlarm('LI-101', 'HI', { limit: 900, enabled: true })
  assert.equal(verdicts(ctx)['dv09-4b-3c'], 'pending')
  A.setBlockAlarm('LI-101', 'HI', { limit: 950 })
  assert.equal(verdicts(ctx)['dv09-4b-3c'], 'verified')
  assert.ok(A.setLoopIo('LI-101', 'IO_IN', 'LY-1'))
  assert.equal(verdicts(ctx)['dv09-4b-3a'], 'pending')
})))

test('the simulated process wires LY-1 to LT-1: the AI channel follows the AO channel only on the DV-09 rig', () => withStores(4, ctx => {
  scan(ctx)
  const ch = dst => Object.values(ctx.M().hardware.traditionalCards).flatMap(c => c.channels).find(c => c.dst === dst)
  assert.equal(ch('LT-1').value, ch('LY-1').value)
  assert.ok(ch('LY-1').value > 0)
}))
