// Chapter 11 (course DV-09 p11-19): the DeltaV Logon of the Logging On workshop, journaled the way the FlexLock Log On does.
module.exports = function dv09Ch11Setup(ctx) {
  ctx.M().logEvent('SECURITY', 'administrator', 'User logged on')
}
module.exports.needs = []
