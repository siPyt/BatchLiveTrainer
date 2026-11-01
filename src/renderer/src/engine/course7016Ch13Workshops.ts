import type { WModule } from './workshops'

export const CHAPTER13: WModule = {
  module: '7016 · Ch 13 Version Control',
  workshops: [
    {
      id: '7016-ch13-enable',
      title: 'Enable Version Control',
      objective: 'Enable Version Control in the DeltaV Database Administrator and reconnect to the Database Server (Course 7016 p 13-60).',
      note: 'DeltaV Explorer, Control Studio and the other database clients must be closed first (System Preferences > Database Administrator lists them with Close buttons). Database Administrator > Version Control Configuration: tick Enable Version Control and OK: the Version Control database is created and synchronized with the configuration database, and the Database Server shuts down. File > Connect to Server starts it again.',
      steps: [
        { id: '7016-13a-1', text: 'Steps 1-3. In the Database Administrator open Version Control Configuration, select Enable Version Control and click OK (the database synchronizes automatically).', goto: 'system' },
        { id: '7016-13a-2', text: 'Steps 4-5. File > Connect to Server; close the Database Administrator when the Database Server is running.', goto: 'system' }
      ]
    },
    {
      id: '7016-ch13-history',
      title: 'Show History, Show Differences and Rollback (FIC-404)',
      objective: 'Check out FIC-404, change it in Control Studio, compare versions, check it in and roll it back (Course 7016 pp 13-61 to 13-64).',
      note: 'Explorer > FEED_TANK_AREA > right-click FIC-404 > Open with Control Studio and answer OK when asked to check the module out (the same is Version Control > Check Out). In the palette Special Items click Input Parameter, name it (for example EXTRA_IN1) and do not wire it; Save. Show History and Show Differences are buttons in the ribbon Version Control group (and Version Control entries of the Explorer context menu). The differences dialog shows what is compared in its first line: the configuration database (current) with the last checked-in version. Add another Input Parameter, save and compare again. Check In (comment). Show History: the new version; Details shows the comment; select the previous version and use Differences; Rollback restores it and leaves FIC-404 checked out; check it in again and look for the new version in the history.',
      steps: [
        { id: '7016-13b-1', text: 'Step 1. Open FIC-404 with Control Studio and check the module out when prompted.', goto: 'explorer' },
        { id: '7016-13b-2', text: 'Steps 2-6. Drop two Input Parameters on the diagram (not wired), saving after each; Show History and Show Differences after each save.', goto: 'studio' },
        { id: '7016-13b-3', text: 'Steps 8-11. Check in FIC-404 with a comment; Show Differences (none); Show History and Details of the newest version show the comment.', goto: 'studio' },
        { id: '7016-13b-4', text: 'Steps 12-13. Select the previous version in the history window, check its Differences and Rollback.', goto: 'studio' },
        { id: '7016-13b-5', text: 'Steps 14-18. Check in FIC-404 again (comment); the history has a newer version; compare each previous version with the current configuration database.', goto: 'studio' }
      ]
    },
    {
      id: '7016-ch13-snapshot',
      title: 'Take a snapshot of the configuration',
      objective: 'Create a Version Control snapshot and disable Version Control (Course 7016 p 13-65).',
      note: 'Database Administrator > Version Control Snapshot > Create (name it); close the database clients, then Version Control Configuration > clear Enable Version Control > OK and File > Connect to Server. A snapshot can be restored from the same dialog once every item is checked in.',
      steps: [
        { id: '7016-13c-1', text: 'Steps 1-3. Open the Version Control Snapshot icon and select Create.', goto: 'system' },
        { id: '7016-13c-2', text: 'Steps 4-5. Open Version Control Configuration, uncheck Enable Version Control and click OK.', goto: 'system' }
      ]
    },
    {
      id: '7016-ch13-optional',
      title: 'Optional: recipe authorization and check out preferences',
      objective: 'Require signatures before a recipe can be downloaded (pp 13-10, 13-11, 13-52 to 13-58) and try the Auto Check Out preference.',
      note: 'Version Control Configuration: tick Recipes must be authorized before downloading, Signers... > Add a signer and assign a function lock (each lock once; adding a signer un-authorizes recipes). Right-click a recipe > Recipe Authorization > Approve... (signer and comment); Reject and Clear are refused once the recipe was downloaded. A recipe that is not authorized cannot be downloaded unless the user has the VC_DOWNLOAD_UNAUTHORIZED key. Version Control > Preferences: Manual or Prompt, Auto Check Out, Auto Check Out and In. Keep Version Control enabled while you do this, and disable it again afterwards if you wish.',
      steps: [
        { id: '7016-13r-1', text: 'Enable Recipes must be authorized before downloading and add a signer (Signers... > Add).', goto: 'system' },
        { id: '7016-13r-2', text: 'Approve a recipe with every signer and download it to the Batch Executive.', goto: 'explorer' },
        { id: '7016-13p-1', text: 'Change the check out preference to Auto Check Out (Version Control > Preferences).', goto: 'explorer' }
      ]
    }
  ]
}
