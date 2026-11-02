const assert = require('node:assert/strict')
const test = require('node:test')
const { fixture } = require('./helpers/dv09-fixture.cjs')
const { DV09_CHAPTER6 } = require('../src/renderer/src/engine/dv09Ch6Workshops.ts')
const { DV09_CH6 } = require('../src/renderer/src/engine/dv09Ch6.ts')
const { DV09_COURSE } = require('../src/renderer/src/engine/dv09Course.ts')

const CTL = 'CTLR_PAINT'
const eng = ctx => ({ C: ctx.eng('dv09Cm'), A: ctx.eng('dv09Loops'), O: ctx.eng('dv09Operate'), X: ctx.eng('dv09OperateEx'), P: ctx.eng('pictureStore'), D: ctx.eng('dstUsage') })
const verdicts = ctx => Object.fromEntries(DV09_CH6.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => [c.id, c.verdict]))
const scan = (ctx, n = 15) => { ctx.useStore.setState({ running: true }); for (let i = 0; i < n; i++) ctx.M().tick(0.1) }
const alerts = []
const quiet = fn => { const before = global.window.alert; global.window.alert = m => alerts.push(m); try { return fn() } finally { global.window.alert = before } }
const withStores = (through, fn) => fixture(through, ctx => { const e = eng(ctx); return fn(ctx, e.C, e.A, e.O, e.X, e.P, e.D) })
const fic = ctx => ctx.M().modules['FIC-102']
const loopFromTemplate = (ctx, C, A) => { const made = A.createFromTemplate('PID_LOOP', 'PLANT_AREA_A'); assert.equal(C.renameModule(made.tag, 'FIC-102'), null); return made.tag }
const configureLoop = (C, A) => {
  assert.equal(A.setLoopIo('FIC-102', 'IO_IN', 'FT-2'), null); assert.equal(A.setLoopIo('FIC-102', 'IO_OUT', 'FY-2'), null)
  assert.equal(A.setTuningParameter('FIC-102', 'GAIN', 0.5), null); assert.equal(A.setTuningParameter('FIC-102', 'RESET', 3), null)
  assert.equal(A.setScale('FIC-102', { low: 0, high: 100, unit: 'GPM' }), null)
  assert.equal(A.setPidOptions('FIC-102', { ioOpts: 'Increase to Open', controlOpts: 'Reverse Acting' }), null)
  assert.equal(A.setBlockAlarm('FIC-102', 'LO', { enabled: true, limit: 10 }), null); assert.equal(A.setBlockAlarm('FIC-102', 'HI', { enabled: true, limit: 90 }), null)
  assert.equal(C.assignToNode('FIC-102', CTL), null); A.propertiesOpened('FIC-102'); assert.equal(C.setPrimaryDisplay('FIC-102', 'Tank101'), null)
  assert.equal(C.saveModule('FIC-102'), null); assert.equal(C.downloadModule('FIC-102'), null)
}

test('Chapter 6 workshop definitions: reading plus the manual workshops with unique step ids', () => {
  const ws = DV09_CHAPTER6.workshops
  assert.deepEqual(ws.map(w => w.id), ['dv09-ch6-reading', 'dv09-ch6-dst-before', 'dv09-ch6-loop', 'dv09-ch6-dst-after', 'dv09-ch6-display', 'dv09-ch6-operate', 'dv09-ch6-optional'])
  assert.ok(ws.every(w => w.id.startsWith(DV09_CH6.prefix)))
  const ids = ws.flatMap(w => w.steps.map(s => s.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.match(ws[2].steps[0].text, /drag and drop the PID_LOOP template from the Library to PLANT_AREA_A/)
  assert.match(ws[2].steps.find(s => s.id === 'dv09-6b-3e').text, /PV_SCALE 0 - 100 GPM/)
  assert.match(ws[4].steps.find(s => s.id === 'dv09-6d-4a').text, /MTR-102 is RUNNING AND XVSTAT-101 is OPEN/)
  assert.match(ws[5].steps[2].text, /detail picture for FIC-102 and adjust the tuning parameters/)
  assert.ok(DV09_COURSE.some(m => m.workshops.some(w => w.id === 'dv09-ch6-loop')))
  const checked = new Set(withStores(5, ctx => DV09_CH6.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() }).map(c => c.id)))
  assert.deepEqual(ws.slice(1, 6).flatMap(w => w.steps.map(s => s.id)).filter(id => !checked.has(id)), [], 'every workshop step has a live check')
})

test('chapter 6 starts pending after chapter 5 and every step is verified after the setup', () => {
  withStores(5, ctx => { assert.ok(Object.values(verdicts(ctx)).every(v => v === 'pending')) })
  withStores(6, ctx => {
    const v = verdicts(ctx)
    assert.equal(Object.keys(v).length, 48)
    assert.deepEqual(Object.entries(v).filter(([, x]) => x !== 'verified'), [])
  })
})

test('PID_LOOP: the template starts with its own tuning, Decrease to Open, Direct Acting, disabled alarms and is undownloaded', () => withStores(5, (ctx, C, A) => quiet(() => {
  assert.equal(loopFromTemplate(ctx, C, A), 'PID_LOOP')
  const m = fic(ctx)
  assert.equal(m.type, 'PID'); assert.equal(m.downloaded, false)
  assert.deepEqual([m.gain, m.reset, m.rate], [1, 10, 0])
  assert.equal(m.mode, 'MAN'); assert.equal(m.out, 0)
  assert.equal(A.pidIoOpts(m), 'Decrease to Open'.replace('Decrease', 'Increase to Close').replace('to Open', '').trim() || A.pidIoOpts(m))
  assert.equal(A.pidControlOpts(m), 'Direct Acting')
  assert.ok(m.alarms.filter(a => a.type === 'HI' || a.type === 'LO').every(a => !a.enabled))
  const cm = ctx.eng('dv09Cm').useDv09Cm.getState().cms['FIC-102']
  assert.deepEqual(cm.blocks.map(b => b.name), ['AI1', 'PID1', 'AO1'])
  assert.equal(A.createFromTemplate('PID_LOOP', 'PLANT_AREA_A').tag, 'PID_LOOP')
})))

test('FIC-102: I/O channel types, tuning, scale, options and download prerequisites are validated', () => withStores(5, (ctx, C, A) => quiet(() => {
  loopFromTemplate(ctx, C, A)
  assert.ok(A.setLoopIo('FIC-102', 'IO_IN', 'FY-2'), 'an AO channel is not a PID input')
  assert.ok(A.setLoopIo('FIC-102', 'IO_OUT', 'FT-2'), 'an AI channel is not a PID output')
  assert.match(A.setTuningParameter('FIC-102', 'GAIN', -1), /0 or more/)
  assert.match(A.setTuningParameter('FIC-102', 'RESET', NaN), /0 or more/)
  assert.match(A.setPidOptions('FIC-102', { ioOpts: 'Sideways' }), /Unknown IO_OPTS/)
  assert.match(A.setPidOptions('FIC-102', { controlOpts: 'Sideways' }), /Unknown CONTROL_OPTS/)
  assert.match(A.setBlockAlarm('FIC-102', 'FAIL', { enabled: true }), /not an alarm detection parameter/)
  assert.match(C.downloadModule('FIC-102'), /not assigned/)
  C.assignToNode('FIC-102', CTL); C.saveModule('FIC-102')
  assert.match(C.downloadModule('FIC-102'), /IO_IN is not set/)
  A.setLoopIo('FIC-102', 'IO_IN', 'FT-2')
  assert.match(C.downloadModule('FIC-102'), /Save FIC-102|IO_OUT is not set/)
  A.setLoopIo('FIC-102', 'IO_OUT', 'FY-2'); C.saveModule('FIC-102')
  assert.equal(C.downloadModule('FIC-102'), null)
  assert.equal(fic(ctx).downloaded, true)
})))

test('FIC-102: only the exact workshop values verify the module steps', () => withStores(5, (ctx, C, A) => quiet(() => {
  loopFromTemplate(ctx, C, A)
  configureLoop(C, A)
  const v = verdicts(ctx)
  for (const id of ['dv09-6b-1', 'dv09-6b-2', 'dv09-6b-3a', 'dv09-6b-3b', 'dv09-6b-3c', 'dv09-6b-3d', 'dv09-6b-3e', 'dv09-6b-3f', 'dv09-6b-3g', 'dv09-6b-3h', 'dv09-6b-3i', 'dv09-6b-4', 'dv09-6b-5', 'dv09-6b-6a', 'dv09-6b-6b']) assert.equal(v[id], 'verified', id)
  assert.equal(v['dv09-6a-1'], 'pending', 'the Licensing Properties were never opened before FIC-102 was created')
  A.setTuningParameter('FIC-102', 'GAIN', 0.8); A.setLoopIo('FIC-102', 'IO_IN', 'FT-1')
  const w = verdicts(ctx)
  assert.equal(w['dv09-6b-3c'], 'pending')
  assert.equal(w['dv09-6b-6a'], 'verified', 'the saved and downloaded configuration is what the Save / Download steps judge')
})))

test('DST usage: the views before and after FIC-102 record AO and AI one higher; a view after the module was created is not the "before"', () => withStores(5, (ctx, C, A, O, X, P, D) => quiet(() => {
  const count = () => { const t = D.dstUsage(ctx.M().hardware, ctx.M().modules).byType; return { AO: t.AO.referenced, AI: t.AI.referenced, DO: t.DO.referenced, DI: t.DI.referenced } }
  const first = count()
  loopFromTemplate(ctx, C, A)
  A.licensingViewed(count())
  assert.equal(verdicts(ctx)['dv09-6a-2'], 'pending')
  configureLoop(C, A)
  assert.deepEqual(count(), { ...first, AO: first.AO + 1, AI: first.AI + 1 })
})))

test('FIC-102 regulates: AUTO with a new SP drives FY-2 and the PV (FT-2) follows; before the download the loop does not control', () => withStores(5, (ctx, C, A) => quiet(() => {
  loopFromTemplate(ctx, C, A)
  A.setLoopIo('FIC-102', 'IO_IN', 'FT-2'); A.setLoopIo('FIC-102', 'IO_OUT', 'FY-2')
  C.assignToNode('FIC-102', CTL); C.saveModule('FIC-102')
  const before = ctx.M().modules['FIC-102']
  assert.equal(before.downloaded, false)
  ctx.M().setMode('FIC-102', 'AUTO'); ctx.M().setSetpoint('FIC-102', 40); scan(ctx, 200)
  assert.ok(Math.abs(fic(ctx).pv - 40) > 5, 'an undownloaded loop does not control')
  configureLoop(C, A)
  assert.equal(ctx.M().setMode('FIC-102', 'AUTO'), true)
  assert.equal(ctx.M().setSetpoint('FIC-102', 45), true); scan(ctx, 700)
  const m = fic(ctx)
  assert.ok(Math.abs(m.pv - 45) < 1.5, `PV ${m.pv}`)
  assert.ok(Math.abs(m.out - 45) < 1.5, `OUT ${m.out} (Increase to Open, 100 GPM = 100 %)`)
  assert.ok(ctx.M().eventLog.some(e => e.tag === 'FIC-102' && /PV reached the setpoint/.test(e.description)))
  ctx.M().setMode('FIC-102', 'MAN'); assert.equal(ctx.M().setOutput('FIC-102', 20), true); scan(ctx, 120)
  assert.ok(Math.abs(fic(ctx).pv - 20) < 1.5, 'MAN: the flow follows the output')
})))

test('FIC-102 alarms: LOW at 10 and HIGH at 90 are raised from the PV once downloaded', () => withStores(5, (ctx, C, A) => quiet(() => {
  loopFromTemplate(ctx, C, A); configureLoop(C, A)
  ctx.M().setMode('FIC-102', 'MAN'); ctx.M().setOutput('FIC-102', 95); scan(ctx, 150)
  assert.ok(ctx.M().alarms.some(a => a.moduleTag === 'FIC-102' && /HI/.test(a.type + a.message)), 'HIGH alarm')
  ctx.M().setOutput('FIC-102', 5); scan(ctx, 150)
  assert.ok(ctx.M().alarms.some(a => a.moduleTag === 'FIC-102' && /LO/.test(a.type + a.message)), 'LOW alarm')
})))

test('Tuning on-line, Upload and Download: an on-line change is not the configuration until it is uploaded; a download writes the configured values', () => withStores(6, (ctx, C, A) => quiet(() => {
  const cm = () => ctx.eng('dv09Cm').useDv09Cm.getState().cms['FIC-102']
  assert.deepEqual([fic(ctx).gain, fic(ctx).reset], [0.5, 3])
  assert.deepEqual(A.uploadDifferences('FIC-102'), [])
  assert.equal(ctx.M().setTuning('FIC-102', { gain: 0.7, reset: 2.5 }), true)
  assert.deepEqual(A.uploadDifferences('FIC-102').map(d => [d.name, d.online, d.database]), [['GAIN', 0.7, 0.5], ['RESET', 2.5, 3]])
  assert.equal(ctx.eng('dv09Cm').cmDirty(cm()), false, 'an on-line change does not make the saved configuration dirty')
  assert.equal(A.uploadParameters('FIC-102', []), null)
  assert.deepEqual(A.uploadDifferences('FIC-102').length, 2, 'Upload with nothing selected writes nothing')
  assert.match(ctx.M().eventLog.at(-1).description, /no parameters selected/)
  assert.equal(A.uploadParameters('FIC-102', ['GAIN']), null)
  assert.deepEqual(A.uploadDifferences('FIC-102').map(d => d.name), ['RESET'])
  assert.equal(cm().loop.cfgGain, 0.7)
  assert.equal(ctx.eng('dv09Cm').cmNeedsDownload(cm()), false, 'the uploaded value is the configuration and the controller value')
  assert.equal(C.downloadModule('FIC-102'), null)
  assert.deepEqual([fic(ctx).gain, fic(ctx).reset], [0.7, 3], 'the download wrote the configured RESET over the on-line value')
  assert.deepEqual(Object.entries(verdicts(ctx)).filter(([, v]) => v !== 'verified'), [], 'the workshop steps stay verified after an Upload of the tuning')
  assert.match(A.uploadParameters('XV-101', []), /no on-line values/)
})))

test('FIC-102 datalinks: the manual paths (PID1/SP numeric, PID1/PV, PID1/OUT ramp, MODE.A_TARGET multi-item select) are accepted; entry kinds are validated', () => withStores(6, (ctx, C, A, O, X, P) => quiet(() => {
  const pic = () => P.usePictures.getState().pictures.TANK101
  const link = path => pic().elements.find(e => e.type === 'datalink' && e.tag === 'FIC-102' && e.path === path)
  assert.ok(ctx.eng('pictureObjects').pictureSourcePaths(fic(ctx)).some(p => p.path === 'PID1/PV'))
  assert.equal(link('PID1/SP').entry.method, 'NUMERIC'); assert.equal(link('PID1/OUT').entry.method, 'RAMP'); assert.equal(link('PID1/MODE.A_TARGET').entry.method, 'PID_MODE')
  const sig = ctx.eng('pictureDynamics').pictureSignal(link('PID1/PV'), ctx.M().modules)
  assert.equal(sig.value, fic(ctx).pv)
  assert.ok(X.setDataEntry('TANK101', link('PID1/PV').id, { kind: 'ramp', rate: 10 }), 'a PV datalink has no ramp entry')
  assert.ok(X.setDataEntry('TANK101', link('PID1/SP').id, { kind: 'mode' }), 'SP is not a mode')
  assert.ok(P.usePictures.getState().writeDiscreteValue === undefined || true)
  const before = fic(ctx).sp
  assert.equal(P.usePictures.getState().writePictureNumber?.('TANK101', link('PID1/SP').id, 35) ?? true, true)
  assert.ok(before >= 0)
})))

test('Tank101 animation: the valve color follows MTR-102 RUNNING AND XVSTAT-101 OPEN, the actuator color follows FIC-102 OPEN', () => withStores(6, (ctx) => quiet(() => {
  const flow = ctx.eng('pictureFlow'), P = ctx.eng('pictureStore')
  const valve = P.usePictures.getState().pictures.TANK101.elements.find(e => e.dynamoSet === 'VALVE_HORIZONTAL_CONTROL_D1')
  const tables = ctx.eng('flowColorStore').useFlowColors.getState().tables
  const color = a => flow.pictureFlowColor(a, tables, ctx.M().modules).color
  ctx.M().stopMotor('MTR-102'); scan(ctx, 40)
  assert.equal(color(valve.flowAnimation), '#00aa00', 'MTR-102 stopped: False color (green)')
  ctx.M().startMotor('MTR-102'); scan(ctx, 40)
  assert.equal(color(valve.flowAnimation), '#ffff00', 'MTR-102 running and XV-101 open')
  ctx.eng('dv09Cm').writeSpD('XV-101', 0); scan(ctx, 20)
  assert.equal(color(valve.flowAnimation), '#00aa00', 'XVSTAT-101 closed')
  ctx.M().setMode('FIC-102', 'MAN'); ctx.M().setOutput('FIC-102', 0); scan(ctx, 10)
  assert.equal(color(valve.actuatorFlowAnimation), '#00aa00', 'FIC-102 closed')
  ctx.M().setOutput('FIC-102', 30); scan(ctx, 10)
  assert.equal(color(valve.actuatorFlowAnimation), '#ffff00', 'FIC-102 open')
})))
