const assert = require('node:assert/strict')
const test = require('node:test')
const { fixture, M, engine, useSecurity, useSystem } = require('./helpers/dv09-fixture.cjs')
const { DV09_COURSE } = engine('dv09Course')
const { dv09ChapterFor } = engine('dv09Registry')
const { useLibrary } = engine('libraryStore')

test('Chapter 10 has no workshop: one reading workshop, no live checks, every item ticked by the student', () => {
  const module10 = DV09_COURSE[9]
  assert.deepEqual(module10.workshops.map(w => w.id), ['dv09-ch10-reading'])
  const steps = module10.workshops[0].steps
  assert.equal(steps.length, 12)
  assert.ok(steps.every(s => /^dv09-10r-\d+$/.test(s.id)))
  assert.ok(steps.filter(s => s.goto).every(s => ['hardware', 'explorer'].includes(s.goto)))
  const ids = DV09_COURSE.flatMap(m => m.workshops).flatMap(w => w.steps).map(s => s.id)
  assert.equal(new Set(ids).size, ids.length)
  fixture(2, () => assert.deepEqual(dv09ChapterFor('dv09-ch10-reading').check({ main: M(), security: useSecurity.getState(), system: useSystem.getState(), library: useLibrary.getState() }), []))
})
