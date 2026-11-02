const assert = require('node:assert/strict')
const test = require('node:test')
const { fixture, M, engine, useSecurity, useSystem } = require('./helpers/dv09-fixture.cjs')
const { DV09_COURSE } = engine('dv09Course')
const { dv09ChapterFor } = engine('dv09Registry')
const { useLibrary } = engine('libraryStore')

const ctxOf = () => ({ main: M(), security: useSecurity.getState(), system: useSystem.getState(), library: useLibrary.getState() })
const verdicts = ch => Object.fromEntries(dv09ChapterFor(ch).check(ctxOf()).map(c => [c.id, c.verdict]))

test('Chapter 11 definitions: reading workshop plus Workshop - Logging On with the manual steps; ids unique across DV-09', () => {
  const module11 = DV09_COURSE[10]
  assert.deepEqual(module11.workshops.map(w => w.id), ['dv09-ch11-reading', 'dv09-ch11-logon'])
  assert.match(module11.workshops[1].title, /^Workshop \u2013 Logging On/)
  assert.deepEqual(module11.workshops[1].steps.map(s => s.id), ['dv09-11a-1', 'dv09-11a-2', 'dv09-11a-3', 'dv09-11a-4'])
  const ids = DV09_COURSE.flatMap(m => m.workshops).flatMap(w => w.steps).map(s => s.id)
  assert.equal(new Set(ids).size, ids.length)
  fixture(2, () => assert.deepEqual(Object.keys(verdicts('dv09-ch11-logon')), ['dv09-11a-3']))
})

test('Logging On: the DeltaV Logon needs a new administrator log on after the Chapter 1 one; other users do not count', () => fixture(2, () => {
  assert.equal(verdicts('dv09-ch11-logon')['dv09-11a-3'], 'pending', 'the Chapter 1 log on alone is not enough')
  M().logEvent('SECURITY', 'OperatorA', 'User logged on')
  assert.equal(verdicts('dv09-ch11-logon')['dv09-11a-3'], 'pending')
  M().logEvent('SECURITY', 'administrator', 'Password changed')
  assert.equal(verdicts('dv09-ch11-logon')['dv09-11a-3'], 'pending')
  M().logEvent('SECURITY', 'Administrator', 'User logged on')
  assert.equal(verdicts('dv09-ch11-logon')['dv09-11a-3'], 'verified', 'the user name is case-insensitive like the Windows log on')
}))

test('Logging On through the real security store: lock the workstation and log on as administrator / deltav', () => fixture(2, () => {
  const sec = useSecurity.getState()
  sec.lockWorkstation()
  assert.equal(useSecurity.getState().locked, true)
  assert.equal(useSecurity.getState().login('administrator', 'DELTAV'), false, 'the password is case sensitive: deltav in lower case')
  assert.equal(useSecurity.getState().login('administrator', 'deltav'), true)
  M().logEvent('SECURITY', 'administrator', 'User logged on')
  assert.equal(useSecurity.getState().currentUser, 'administrator')
  assert.equal(verdicts('dv09-ch11-logon')['dv09-11a-3'], 'verified')
}))

test('Chapter 11 setup helper performs the log on', () => fixture(2, ctx => {
  require('./helpers/dv09-ch11-setup.cjs')(ctx)
  assert.equal(verdicts('dv09-ch11-logon')['dv09-11a-3'], 'verified')
}))
