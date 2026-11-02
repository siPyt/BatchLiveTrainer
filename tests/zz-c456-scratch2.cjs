const { fixture } = require('./helpers/dv09-fixture.cjs')
const { DV09_CH4 } = require('../src/renderer/src/engine/dv09Ch4.ts')
global.__alerts = []
fixture(4, ctx => {
  const r = DV09_CH4.check({ main: ctx.M(), security: {}, system: {}, library: ctx.L() })
  console.log(r.filter(c => c.verdict !== 'verified').map(c => c.id + ' ' + c.detail).join('\n') || 'all verified', r.length)
  const m = ctx.M()
  console.log(m.eventLog.slice(-25).map(e => e.category + ' ' + e.tag + ' ' + e.description).join('\n'))
})
