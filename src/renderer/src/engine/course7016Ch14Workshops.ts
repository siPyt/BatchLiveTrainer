import type { WModule } from './workshops'

export const CHAPTER14: WModule = {
  module: '7016 · Ch 14 Batch Historian',
  workshops: [
    {
      id: '7016-ch14-setup',
      title: 'Configure the Batch Historian and run batches',
      objective: 'Enable and configure the Batch Historian, start it and collect data from batches (Course 7016 pp 14-36 to 14-38).',
      note: 'Explorer > PROPLUS > Batch Historian > right-click > Properties. General: tick Enabled. Input: tick Batch Executive and Alarms And Events. Output: add C:\\DVBatchHistory\\Batch_Historian_Databases\\db1 and ...\\db2, 10 Mb each. Download the PROPLUS workstation (right-click PROPLUS > Download). Historian Administration Tool (right-click Batch Historian > Historian Administration Tool, or the display list): Connect, then Server > Start/Stop Historian. The service must be running while the batches run, otherwise nothing is collected. Run at least two OP_FINISH_500 batches in the Batch Operator Interface and answer every prompt.',
      steps: [
        { id: '7016-14a-1', text: 'Step 1. Open the Batch Historian Properties and enable it.', goto: 'explorer' },
        { id: '7016-14a-2', text: 'Step 2. Select both Batch Executive and Alarms And Events as inputs.', goto: 'explorer' },
        { id: '7016-14a-3', text: 'Step 3. Add the output database ...\\db1 of 10 Mb.', goto: 'explorer' },
        { id: '7016-14a-4', text: 'Step 4. Add the second output database ...\\db2 of 10 Mb.', goto: 'explorer' },
        { id: '7016-14a-5', text: 'Steps 5-6. Download the workstation and connect the Historian Administration Tool to the server.', goto: 'histadmin' },
        { id: '7016-14a-6', text: 'Step 7. Start the Batch Historian service (Server > Start/Stop Historian), then run two batches in the BOI.', goto: 'histadmin' }
      ]
    },
    {
      id: '7016-ch14-view',
      title: 'Batch History View',
      objective: 'Browse batch data, add a comment, compare two batches and trend a unit phase (Course 7016 pp 14-39 to 14-49).',
      note: 'Batch History View: select a batch and expand its chart to the unit-phase level; Details. Select the AGITATE unit phase and open Batch Events; select an event and add a comment. Select two batches and Compare Batches. Select the DRAIN unit phase of both batches and open Process Trend to compare the product valve XV-503.',
      steps: [
        { id: '7016-14b-1', text: 'Steps 8-9. Select a batch, show Details and expand the chart to the unit phase level.', goto: 'histview' },
        { id: '7016-14b-2', text: 'Steps 10-11. Open the Batch Events of AGITATE and add a comment to an event.', goto: 'histview' },
        { id: '7016-14b-3', text: 'Step 12. Select two batches and compare them.', goto: 'histview' },
        { id: '7016-14b-4', text: 'Step 13. Select DRAIN of both batches and trend the product valve XV-503 in a Process Trend.', goto: 'histview' }
      ]
    },
    {
      id: '7016-ch14-archive',
      title: 'Archiving',
      objective: 'Create an archive database and archive a completed batch (Course 7016 pp 14-50 to 14-51).',
      note: 'Historian Administration Tool: Create Archive named OldBatches in C:\\Batch_Archive_Databases. A batch still in the Batch Executive list cannot be archived: remove it in the BOI (Batch List), then right-click it in the Administration Tool > Archive and select OldBatches. Expand OldBatches to see it.',
      steps: [
        { id: '7016-14c-1', text: 'Steps 1-4. Create the archive database OldBatches in C:\\Batch_Archive_Databases.', goto: 'histadmin' },
        { id: '7016-14c-2', text: 'Steps 5-6. Remove a completed batch from the Batch List and archive it to OldBatches.', goto: 'histadmin' },
        { id: '7016-14c-3', text: 'Step 7. Expand OldBatches and see the archived batch.', goto: 'histadmin' }
      ]
    },
    {
      id: '7016-ch14-optional',
      title: 'Optional: folders and maintenance',
      objective: 'Organize archives in a folder and configure maintenance (Course 7016 pp 14-52 to 14-60).',
      note: 'Historian Administration Tool: Server > New Folder; Maintenance: AutoArchive, AutoBackup or AutoDelete.',
      steps: [
        { id: '7016-14d-1', text: 'Create a folder to organize archives.', goto: 'histadmin' },
        { id: '7016-14d-2', text: 'Configure AutoArchive, AutoBackup or AutoDelete maintenance.', goto: 'histadmin' }
      ]
    }
  ]
}
