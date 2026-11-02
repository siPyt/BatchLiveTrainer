import type { WModule } from './workshops'

// Course DV-09 chapter 13, Fieldbus Device Alarm Overview, pages 13-1 .. 13-40: device alarms and PlantWeb alerts (reading), the alarm list
// column workshop (p13-26) and the alarm banner workshop (p13-35).

export const DV09_CHAPTER13: WModule = {
  module: 'DV-09 \u00b7 Ch 13 Fieldbus Device Alarm Overview',
  workshops: [
    {
      id: 'dv09-ch13-reading',
      title: 'Fieldbus Device Alarm Overview (reading), pp 13-3 to 13-25, 13-27 to 13-34 and 13-36 to 13-40',
      objective: 'Describe fieldbus device alarms and PlantWeb alerts and how to enable fieldbus device alarms (objectives, p13-3).',
      note: 'Reference material: these slides have no steps of their own. Tick each item when you have read it and, where a link is given, found the matching place in the trainer. The device screens need FOUNDATION fieldbus enabled and the H1 card downloaded (Chapter 12); commission the 3144P from DeltaV Explorer (Decommissioned Fieldbus Devices > Commission...) to see its Fieldbus Device Alarms. The trainer simulates the device conditions with its generic virtual device.',
      steps: [
        { id: 'dv09-13r-1', text: 'Fieldbus device alarms (pp 13-4 to 13-6): the DeltaV system records system, user-defined and device events in the Event Chronicle; alarms embedded in a fieldbus device are device alarms. DeltaV reports two categories, Not Communicating and Abnormal; Abnormal is not enabled by default and its meaning depends on the device. They are visible through the DeltaV Operate alarm banner and the Alarm Summary and need an MD DeltaV controller, a Series 2 H1 card (simplex or redundant) and DeltaV 6.3 or greater.', goto: 'alarms' },
        { id: 'dv09-13r-2', text: 'Enable the Abnormal alarm (pp 13-8, 13-9): in DeltaV Explorer select Fieldbus Device Alarms under the device, right-click > Properties; the Enabled box turns the Abnormal alarm on and the Priority drop-down menu (ADVISORY, CRITICAL, LOG, WARNING) sets its priority.', goto: 'explorer' },
        { id: 'dv09-13r-3', text: 'PlantWeb Alerts (pp 13-10 to 13-15): devices that support PlantWeb alerts have four alarms: Advisory (ADVISE_ALM), Not Communicating (COMM_ALM), Failed (FAILED_ALM, immediate action) and Maintenance (MAINT_ALM, prompt action). All PlantWeb alert priorities are enabled by default; change the priority of one by selecting it in DeltaV Explorer > Properties > Priority.', goto: 'explorer' },
        { id: 'dv09-13r-4', text: 'Device alarm configuration (pp 13-16 to 13-19): select the device in DeltaV Explorer > Properties; the General tab shows the same information as earlier versions, the Alarms & Displays tab has Enable Device Alarms (enabled by default), Enable Device Alert Re-annunciation (only for devices that support it), Manually select object used for area association (the area of the chosen control module), All device alarms associated with area (from the controller\'s properties or the chosen module; it can be seen in the Event Chronicle) and the Displays: Primary control and the Faceplate FFDEV_FP.', goto: 'explorer' },
        { id: 'dv09-13r-5', text: 'Device alarm configuration for DeltaV Operate (pp 13-20 to 13-25): the Alarm List, Alarm Summary, Alarm Filter and Alarm Suppress displays use the Alarm Summary ActiveX object. Launch DeltaV Operate (Configure), open AlarmList.grf and configure the object (double-click the working area or Properties from the pop-up menu): the Alarm Summary Configuration dialog has the tabs General, Layout, Columns, Sorting, Filters, Colors, Time Format and Actions. The Displayed Columns are listed top-to-bottom in the dialog and displayed left-to-right in the Alarm List; with a Category column you can see whether an alarm is a process or a device alarm.', goto: 'alarms' },
        { id: 'dv09-13r-6', text: 'Configuration for the Alarm banner (pp 13-27 to 13-34): the workstation alarm banner uses thresholds: the default ProcessAlarmThreshold is 3 and DeviceAlarmThreshold 7, and alarms with a priority greater than the threshold appear on the banner. Abnormal and Advisory device alarms have the default priority Advisory (7). The display environment is customized in UserSettings.grf, created by opening user_ref.grf and saving as UserSettings.grf in the Standard folder; its VB script runs when DeltaV Operate initializes. Lines starting with a single quote are comments; comment the #Const INIT_ALARM_THRESHOLD = 0 line, uncomment the = 1 line and uncomment and edit Const DEVICE_THRESHOLD_DEFAULT (6 or less) so that advisory device alarms reach the banner.', goto: 'builder' },
        { id: 'dv09-13r-7', text: 'Device compare (pp 13-36 to 13-39): right-click a device in DeltaV Explorer > Compare. The Compare Devices dialog\'s Compare field holds the selected device tag and To: the same tag by default (type another tag or Browse); the Compare Configurations dialog (Resource and Transducer blocks) lists the parameters of two devices or placeholders of the same type and revision, or two configurations of one device (current and historical); green tabs show differences and modified fields are highlighted in yellow.', goto: 'explorer' },
        { id: 'dv09-13r-8', text: 'Summary (p13-40): you can describe fieldbus device alarms, PlantWeb alerts and how to enable fieldbus device alarms.' }
      ]
    },
    {
      id: 'dv09-ch13-column',
      title: 'Workshop \u2013 Adding a Column to Alarm List (p 13-26)',
      objective: 'Add the Category column to the Alarm List and position it fourth from the left.',
      note: 'In class DV-09 the Alarm List is the alarmList.grf display (open it with the Alarm List button / the Alarm List display). Right-click the "Alarm List" banner > Quick Edit opens AlarmList.grf in DeltaV Operate (Configure) with its Alarm Summary object (sample rows 1234567890). Double-click the display area, or right-click > Properties... DeltaV.DVAlarmSummary Object: the DeltaV Alarm Summary Configuration dialog. Columns tab: Add >>, Move Up, Apply, OK. Then File > Save (or the floppy button), File > Close (or WorkSpace > Switch to Run) and open the Alarm List again in Run. The columns are saved with the display, not with the browser.',
      steps: [
        { id: 'dv09-13c-1', text: 'Step 1. Click the Alarm List button on the DeltaV Operate tool bar.', goto: 'alarms' },
        { id: 'dv09-13c-2', text: 'Step 2. Place the cursor on the Alarm List banner, click the right mouse button and select Quick Edit.', goto: 'alarms' },
        { id: 'dv09-13c-3', text: 'Step 3. Configure the object by double clicking on the display area or clicking the right mouse button then selecting Properties.', goto: 'alarms' },
        { id: 'dv09-13c-4', text: 'Step 4. Select the Columns tab.', goto: 'alarms' },
        { id: 'dv09-13c-5', text: 'Step 5. Select Category from the Available Columns list and click the Add >> button.', goto: 'alarms' },
        { id: 'dv09-13c-6', text: 'Step 6. Select Category in the Displayed Columns list. Using the Move Up button, position Category fourth from the top. Click the Apply button to save your changes and click the OK button to close the dialog box.', goto: 'alarms' },
        { id: 'dv09-13c-7', text: 'Step 7. Save the display, close the display and run DeltaV Operate.', goto: 'alarms' },
        { id: 'dv09-13c-8', text: 'Step 8. Open the Alarm List and verify that the Category column has been added to the display (fourth column from the left, after Ack, Time In and Module/Param).', goto: 'alarms' }
      ]
    },
    {
      id: 'dv09-ch13-banner',
      title: 'Workshop \u2013 Adding Device Alarms to Banner (p 13-35)',
      objective: 'Set the device alarm threshold of the workstation alarm banner to 6 in UserSettings.grf so that advisory device alarms (priority 7) appear on the banner.',
      note: 'DeltaV Operate (Configure) is the Applications > DeltaV Operate (Configure) window (Chapter 3). File > Open... lists the pictures of the Standard folder: User_ref (shipped with DeltaV Operate). File > Save As... saves it as UserSettings in the Standard folder; right-click the picture > Edit Script ... opens the script editor (toolbar: Save, Find (binoculars), Workspace Application). Edit the text yourself: put a single quote in front of #Const INIT_ALARM_THRESHOLD = 0, remove the quote from #Const INIT_ALARM_THRESHOLD = 1, remove the quote from Const DEVICE_THRESHOLD_DEFAULT = 7 and replace 7 with 6 or less. Save the script, click Workspace Application, File > Save and File > Close the picture, then WorkSpace > Switch to Run: DeltaV Operate initializes and runs the saved script (the thresholds are applied to the banner). The Banner settings panel of the alarm banner is a simulator shortcut that does not satisfy this workshop.',
      steps: [
        { id: 'dv09-13b-1', text: 'Step 1. Open DeltaV Operate (Configure) and close the picture that is open.', goto: 'builder' },
        { id: 'dv09-13b-2', text: 'Step 2. Open the picture User_Ref.grf that is located in the Standard folder.', goto: 'builder' },
        { id: 'dv09-13b-3', text: 'Step 3. Save As UserSettings.grf, right mouse click, select Edit Script from the menu.', goto: 'builder' },
        { id: 'dv09-13b-4', text: 'Step 4. Select the Find (binoculars) button from the toolbar window, delete the text options and type alarms in the Find what window.', goto: 'builder' },
        { id: 'dv09-13b-5', text: 'Step 5. Comment (single quote) #Const INIT_ALARM_Threshold = 0 and remove the comment from #Const INIT_ALARM_Threshold = 1.', goto: 'builder' },
        { id: 'dv09-13b-6', text: 'Step 6. Remove the comment from Const DEVICE THRESHOLD DEFAULT = 7 and replace the number 7 with 6 or less.', goto: 'builder' },
        { id: 'dv09-13b-7', text: 'Step 7. Click the Save (floppy disk) button on the toolbar, click the Workspace Application button on the toolbar. Save and Close the UserSettings.grf in DeltaV Operate (Configure). Run the DeltaV Operate application.', goto: 'builder' }
      ]
    }
  ]
}
