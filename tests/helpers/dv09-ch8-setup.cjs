// Chapter 8: Defining Users and Export (course DV-09 pp 8-32 .. 8-34 and 8-56 .. 8-62). Store API only, so it also runs inside the browser app.
// Needs PLANT_AREA_A (chapter 2). The optional Electronic Signatures workshop is not part of the setup: it turns on a system-wide
// preference and gates the SFC MESSAGE writes of the later chapters.
const must = (r, what) => { if (r !== null && r !== true && r !== undefined) throw new Error(what + ': ' + r) }

module.exports = function dv09Ch8Setup(ctx) {
  const M = ctx.M
  const S = ctx.eng('security').useSecurity
  const sec = () => S.getState()
  const logon = (name, password) => {
    if (!sec().login(name, password)) throw new Error('logon ' + name + ': ' + sec().lastDenied)
    M().logEvent('SECURITY', name, 'User logged on')
  }
  // Step 1: OperatorA = the Operate group for PLANT_AREA_A only.
  if (!sec().addUser({ name: 'OperatorA', fullName: 'Alpha Operator', password: 'operatora', locks: [] })) throw new Error('OperatorA: ' + sec().lastDenied)
  must(sec().addGroupMember('Operate', 'OperatorA', 'PLANT_AREA_A'), 'OperatorA group')
  // Step 2: Supervisor1 = the Tune group (sitewide) and the sitewide Can Download key.
  if (!sec().addUser({ name: 'Supervisor1', fullName: 'Sarge Supervisor', password: 'supervisor1', locks: [] })) throw new Error('Supervisor1: ' + sec().lastDenied)
  must(sec().addGroupMember('Tune', 'Supervisor1', null), 'Supervisor1 group')
  must(sec().grantUserKey('Supervisor1', 'CAN_DOWNLOAD', null), 'Supervisor1 key')
  // Step 3: PROPLUS > Download > Workstation.
  must(sec().downloadWorkstation(), 'workstation download')
  M().logEvent('CONFIGURE', 'PROPLUS', `Workstation download complete: ${sec().users.length} user(s), ${sec().groups.length} group(s), 0 lock assignment(s)`)
  // Steps 4-5: log on as each new user, then back as the administrator.
  logon('OperatorA', 'operatora')
  logon('Supervisor1', 'supervisor1')
  logon('admin', 'admin123')

  // Export workshop: the named sets and the pictures of the earlier chapters (created here when the database lacks them).
  for (const name of ['NS-T101', 'phase_failures']) if (!M().namedSets.configured[name] && !M().createNamedSet(name)) throw new Error('named set ' + name)
  const P = ctx.eng('pictureStore').usePictures
  for (const name of ['OVW_REF', 'TANK101', 'TANK201']) if (!P.getState().pictures[name]) P.getState().createPicture(name)
  const T = ctx.eng('projectTransfer')
  for (const [kind, names] of [['physical-network', []], ['control-strategies', []], ['named-sets', ['NS-T101']], ['named-sets', ['phase_failures']], ['pictures', ['OVW_REF', 'TANK101', 'TANK201']]]) {
    const r = T.exportConfiguration(kind, names)
    if (r.error) throw new Error('export ' + kind + ': ' + r.error)
  }
}
module.exports.needs = ['security', 'pictureStore', 'projectTransfer']
