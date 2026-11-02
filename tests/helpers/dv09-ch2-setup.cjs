// Chapter 2: plant areas, the eight DSTs and a total download of the controller (course DV-09 pp 2-87 .. 2-103).
module.exports = function dv09Ch2Setup(ctx) {
  const M = ctx.M
  if (!M().renameArea('AREA_A', 'PLANT_AREA_A')) throw new Error('rename area failed')
  if (!M().createArea('PLANT_AREA_B')) throw new Error('create area failed')
  const plan = [[1, ['LT-1', 'FT-2']], [2, ['LY-1', 'FY-2']], [3, ['LSO-1', 'XI-2']], [4, ['XV-1', 'ZX-2']]]
  for (const [slot, dsts] of plan) dsts.forEach((dst, i) => {
    if (!M().configureTraditionalChannel('CTLR_PAINT/C0' + slot, i + 1, { dst, enabled: true, description: dst })) throw new Error('DST ' + dst + ' failed')
  })
  const r = ctx.eng('controllerConfig').downloadControllerTotal('CTLR_PAINT')
  if (!r.ok) throw new Error('download: ' + r.error)
  M().logEvent('DIAGNOSTIC', 'DeltaV Diagnostics', 'DeltaV Diagnostics launched')
}
module.exports.needs = ['controllerConfig']
