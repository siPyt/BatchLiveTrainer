// Chapter 13 (course DV-09 pp 13-26 and 13-35): add the Category column to the Alarm List and set the device banner threshold to 6 in UserSettings.grf.
// Store API only, so it also runs in the browser; the UI passes do the same steps through the real screens.
module.exports = function dv09Ch13Setup(ctx) {
  const M = ctx.M
  const settings = ctx.eng('dv09Settings')
  const operate = ctx.eng('dv09Operate')
  const pictures = ctx.eng('pictureStore').usePictures
  const must = (e, what) => { if (e) throw new Error(what + ': ' + e) }

  // Workshop - Adding a Column to Alarm List
  M().logEvent('DIAGNOSTIC', 'alarmList', 'Alarm List opened (DeltaV Operate Run)')
  settings.startQuickEdit()
  M().logEvent('DIAGNOSTIC', 'alarmList', 'Alarm Summary Configuration opened (DeltaV.DVAlarmSummary Object Properties)')
  M().logEvent('DIAGNOSTIC', 'alarmList', 'Alarm Summary Configuration: Columns tab')
  const columns = [...settings.effectiveAlarmColumns(settings.useDv09Ops.getState())]
  M().logEvent('DIAGNOSTIC', 'alarmList', 'Alarm Summary Configuration: Category added to Displayed Columns')
  columns.splice(2, 0, 'category')
  must(settings.applyAlarmColumns(columns), 'apply columns')
  must(settings.saveAlarmList(), 'save alarm list')
  settings.closeQuickEdit()
  M().logEvent('DIAGNOSTIC', 'alarmList', 'Alarm List opened (DeltaV Operate Run)')

  // Workshop - Adding Device Alarms to Banner
  M().logEvent('DIAGNOSTIC', 'DeltaV Operate', 'Operate switched to Configure')
  operate.ensureStandardPictures()
  must(settings.saveAsPicture('USER_REF', 'UserSettings'), 'save as UserSettings')
  M().logEvent('DIAGNOSTIC', 'USERSETTINGS', 'Script editor opened: UserSettings.grf (Edit Script)')
  M().logEvent('DIAGNOSTIC', 'USERSETTINGS', 'Script editor Find: alarms')
  const lines = pictures.getState().pictures.USERSETTINGS.script.split(/\r?\n/).map(l => {
    if (/^#Const INIT_ALARM_THRESHOLD = 0/.test(l)) return "'" + l
    if (/^'#Const INIT_ALARM_THRESHOLD = 1/.test(l)) return l.slice(1)
    if (/^'Const DEVICE_THRESHOLD_DEFAULT = 7/.test(l)) return l.slice(1).replace('= 7', '= 6')
    return l
  })
  must(settings.setPictureScript('USERSETTINGS', lines.join('\r\n')), 'script')
  must(operate.savePicture('USERSETTINGS'), 'save picture')
  M().logEvent('DIAGNOSTIC', 'DeltaV Operate', 'Operate switched to Run')
  const run = settings.runUserSettings()
  if (!run.applied) throw new Error('UserSettings did not run: ' + run.reason)
}
module.exports.needs = ['dv09Settings', 'dv09Operate', 'pictureStore']
