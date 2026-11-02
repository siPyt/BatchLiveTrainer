// Chapters 1: commission the decommissioned controller (course DV-09 pp 1-56 .. 1-66). Store API only, so it also runs inside the browser app.
module.exports = function dv09Ch1Setup(ctx) {
  const M = ctx.M
  M().logEvent('SECURITY', 'administrator', 'User logged on')
  if (!M().identifyController('CTLR-02F896', true) || !M().identifyController('CTLR-02F896', false)) throw new Error('identify failed')
  const props = { name: 'CTLR_PAINT', description: 'DV-09 workshop controller', area: null, hardwareAlarms: false, networkRedundant: true, timeSyncIntegrity: false, redundant: false }
  const err = M().commissionControllerWithProperties('CTLR-02F896', props)
  if (err) throw new Error('commission: ' + err)
  if (!M().autoSenseController('CTLR_PAINT')) throw new Error('auto-sense failed')
  if (!M().setControllerConfiguration('CTLR_PAINT', { coldRestartMinutes: 5 })) throw new Error('cold restart failed')
}
module.exports.needs = []
