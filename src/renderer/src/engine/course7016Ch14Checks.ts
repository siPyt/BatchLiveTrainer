import type { HistorianState } from './batchHistorian'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

export type Ch14State = Pick<HistorianState, 'config' | 'downloaded' | 'connected' | 'service' | 'batches' | 'adminLog' | 'archives' | 'folders' | 'maintenance' | 'views'>

/** Course 7016 Chapter 14 (pp 14-36 .. 14-38, 14-50 .. 14-51): the Batch Historian, Batch History View and archiving workshops. */
export function checkCourse7016Ch14(s: Ch14State): StepCheck[] {
  const admin = (re: RegExp): boolean => s.adminLog.some(a => re.test(a.text))
  const view = (re: RegExp): boolean => s.views.some(v => re.test(v))
  const batches = Object.values(s.batches)
  const withPhases = batches.filter(b => b.tree.children.some(c => c.level === 'Unit Phase' || c.children.length))
  const out = (suffix: string): boolean => s.config.outputs.some(o => o.path.toLowerCase().endsWith(suffix) && o.path.toLowerCase().includes('c:\\dvbatchhistory\\batch_historian_databases') && o.sizeMb === 10)
  const old = s.archives.OldBatches ?? Object.values(s.archives)[0]
  return [
    check('7016-14a-1', s.config.enabled, 'Step 1. The Batch Historian is enabled on the workstation (Properties > General)'),
    check('7016-14a-2', s.config.inputs.includes('Alarms And Events') && s.config.inputs.includes('Batch Executive'), 'Step 2. Alarms And Events and the Batch Executive are inputs of the Batch Historian'),
    check('7016-14a-3', out('\\db1'), 'Step 3. An output database C:\\DVBatchHistory\\Batch_Historian_Databases\\db1 of 10 Mb was added'),
    check('7016-14a-4', out('\\db2'), 'Step 4. A second output database ...\\db2 was added'),
    check('7016-14a-5', s.downloaded && admin(/Connected to the Batch Historian server/), 'Steps 5-6. The workstation was downloaded and the Historian Administration Tool connected to the server'),
    check('7016-14a-6', admin(/service started/) || s.service === 'RUNNING', 'Step 7. The Batch Historian service was started (Server > Start/Stop Historian)'),
    check('7016-14b-1', withPhases.length > 0 && view(/^details /), 'Steps 8-9. A batch was selected in Batch History View and its chart expanded to the unit phase level'),
    check('7016-14b-2', view(/^events .*AGITATE/i) && batches.some(b => b.events.some(e => e.kind === 'Comment' && /AGITATE/.test(e.key))), 'Steps 10-11. Batch Events of the AGITATE unit phase were opened and a comment was added'),
    check('7016-14b-3', view(/^compare /), 'Step 12. Two batches were selected and compared'),
    check('7016-14b-4', view(/^trend-compare .*DRAIN.*XV-503|^trend-compare .*XV-503.*DRAIN/), 'Step 13. The DRAIN unit phase of both batches was compared in a Process Trend of the product valve'),
    check('7016-14c-1', !!old && /batch_archive_databases/i.test(old.path), 'Archiving Steps 1-4. An archive database (OldBatches) was created in C:\\Batch_Archive_Databases'),
    check('7016-14c-2', !!old && Object.keys(old.batches).length > 0, 'Archiving Steps 5-6. A completed batch was archived to it (a batch that is still in the Batch List cannot be archived)'),
    check('7016-14c-3', !!old && Object.values(old.batches).every(b => b.state === 'Complete' || b.state === 'Stopped' || b.state === 'Aborted') && Object.keys(old.batches).length > 0 && view(/^archive-expanded /), 'Archiving Step 7. OldBatches was expanded and the archived batch is listed there'),
    check('7016-14d-1', s.folders.length > 0, 'Optional. A folder was created to organize archives (Server > New Folder)'),
    check('7016-14d-2', s.maintenance.autoArchive || s.maintenance.autoBackup || s.maintenance.autoDelete, 'Optional. AutoArchive, AutoBackup or AutoDelete maintenance was configured')
  ]
}
