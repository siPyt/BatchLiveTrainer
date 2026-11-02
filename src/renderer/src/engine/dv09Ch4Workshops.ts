import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 4, Configuring DeltaV Alarms, pages 4-1 .. 4-58 (PDF pages 158-215).

export const DV09_CHAPTER4: WModule = {
  module: 'DV-09 · Ch 4 Configuring DeltaV Alarms',
  workshops: [
    {
      id: 'dv09-ch4-reading',
      title: 'Configuring DeltaV Alarms (reading), pp 4-3 to 4-7, 4-12 to 4-14, 4-22 to 4-37, 4-40 to 4-51 and 4-56',
      objective: 'Define basic alarm characteristics, cold restart and partial download behavior, alarm priorities, alarm types, the alarm fields and the Event Chronicle (objectives, p4-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The workshops follow in the order of the manual.',
      steps: [
        { id: 'dv09-4r-1', text: 'DeltaV Alarms (pp 4-4 to 4-6): a module created from a Module Template may include pre-assigned alarms. Right-click a selected function block > Assign Alarm opens the Block Alarms dialog (Alarm Detection Parameters, Enabled, Alarm name, Alarm type, Alarm priority, Limit value, Alarm message). A DeltaV alarm is a Boolean evaluation of a pre-defined process state (for example LI-101 > 950) and is specific to a module (LI-101/HI_ALM.A_CV). Open it in Control Studio with File > Open > LI-101.', goto: 'studio' },
        { id: 'dv09-4r-2', text: 'Restore Parameter Value After Restart (p4-12): the Default Value of a parameter (for example 500) is applied on a Cold Restart of the controller. Check the parameter\'s Restore parameter value after restart and the module level Restore parameter values after restart (module Properties > General) and the current operating value is stored in NVM and restored on a Cold Restart.', goto: 'studio' },
        { id: 'dv09-4r-3', text: 'Parameter Download Behavior (p4-13): module Properties also define the partial download behavior for user-defined parameters (CAS_SP) and critical block parameters (MODE, SP). Configuration database CAS / 500, On-line value AUTO / 555. Preserve critical block values: AUTO / 500. Preserve user-defined and critical block values: AUTO / 555. Use configured values: CAS / 500.', goto: 'studio' },
        { id: 'dv09-4r-4', text: 'Using Analog Module Templates (p4-14): the analog module LI-101 (the ANALOG template) reads the DST LT-1 on controller CTLR; LT-1 is wired to LY-1, the output of LEVEL-101, in the simulated process.', goto: 'explorer' },
        { id: 'dv09-4r-5', text: 'DeltaV Alarm Priorities (pp 4-22, 4-23): the priority indicates the importance of an alarm and orders the Alarm Banner and the Alarm List. At most 12 alarm priority levels, numeric values from 4 (lowest) to 15 (highest) and a log-only level of 3. The default alarms are CRITICAL (15), WARNING (11), ADVISORY (7) and LOG (3).', goto: 'explorer' },
        { id: 'dv09-4r-6', text: 'DeltaV Alarm Ranking (p4-24): unacknowledged alarms outrank acknowledged ones; then active outranks inactive; then the higher numeric priority; then the newer time stamp.', goto: 'alarms' },
        { id: 'dv09-4r-7', text: 'DeltaV Alarm List Display and the Alarm Summary (pp 4-26, 4-27): the Alarm List Display is reached with the bell icon. Valid alarm fields: Ack, Alarm, Area, Category, Description, Message, Module, Module/Param, Node, Param, Part of, Priority, Time In, Time Last, Unit and Zone.', goto: 'alarms' },
        { id: 'dv09-4r-8', text: 'DeltaV Explorer Alarm Priorities (pp 4-28, 4-29): System Configuration → Setup → Alarm Preferences → Alarm Priorities → Alarm Priorities (for example Advisory) → Properties: Value, Auto Acknowledge New Alarms, Auto Acknowledge When Inactive, Alarm Banner Shows (Not Hidden, Module or Unit/Equipment Module) and Wave File.', goto: 'explorer' },
        { id: 'dv09-4r-9', text: 'DeltaV Explorer Alarm Types (pp 4-30 to 4-33, 4-36): System Configuration → Setup → Alarm Preferences → Alarm Types → Alarm Type (for example High Alarm) → Properties. The Alarm Word appears in DeltaV Operate, the Category in the Event Chronicle and the Message in the Alarm List; a maximum of 255 alarm types may be added. Parameter 1 (%P1) and Parameter 2 (%P2) are established when an alarm is associated with an alarm on a function block. Default alarm type floating point values: 1 Communication Error, 2 High High, 3 Low Low, 4 Rate of Change, 5 High, 6 Low, 7 Deviation, 8 Adapt Alarm Active, 9 Inspect Limit Active, 10 Change From Normal, 11 Change of State, 12 Open Circuit, 13 General I/O Failure, 14 Floating Point Error, 15 Over Range, 16 Under Range, 17 Statistical Error, 18 New Alarm.', goto: 'explorer' },
        { id: 'dv09-4r-10', text: 'DeltaV Alarm Fields (pp 4-34, 4-35): Module/Alarm.Format_Field, for example LI-101/HI_ALM.A_CV. CUALM current alarm, LAALM latched alarm, CV (same as LAALM), NALM new unacknowledged, PRI priority (CRITICAL...LOG, 15...3), ENAB enabled, INV invert input, OPSUP alarm suppression, SUPTMO suppression timeout and SUPTMR suppression timer. A_ is the ASCII form (OK / HIGH), F_ the floating point form (0 / 16).', goto: 'builder' },
        { id: 'dv09-4r-11', text: 'ALARMS[1-5] Parameter and the ALARMS control fields (pp 4-40 to 4-42): ALARMS[1] shows the highest priority alarm that is active for a module (LI-101/ALARMS[1].A_LAALM). A_LAALM, A_NALM, A_PRI, A_ATTR (alarm name) and A_TIN (time in). ALARMS.F_MACK acknowledges all alarms of the module and returns to 0, ALARMS.F_ENAB set to 0 disables every alarm of the module and ALARMS.F_PRIAD adjusts the effective priority of all alarms (0 to 12; 0 = the pre-configured priority).', goto: 'builder' },
        { id: 'dv09-4r-12', text: 'Workstation Alarm Consolidation and Alarms by Plant Area (pp 4-44 to 4-46): the workstation keeps the most important alarms for the Alarm Banner of THISUSER from the eligible plant areas: areas in the workstation\'s Alarms and Events subsystem and areas where the current user holds a write key. Every alarm parameter is part of a module and every module is assigned to a plant area; the workstations tell each controller which plant areas they listen to.', goto: 'explorer' },
        { id: 'dv09-4r-13', text: 'DeltaV Event Chronicle (pp 4-48 to 4-51): a journal of system, process and user events, time stamped in the controller. Open it with the Process History View button in DeltaV Operate or Start → DeltaV → Operator → Process History View → Event. Configure it in DeltaV Explorer: Physical Network → Control Network → Workstation → Alarms And Events → Properties: Enable Event Chronicle, System SOE Collector and Name; the Event Chronicle starts capturing after the workstation node is downloaded.', goto: 'explorer' },
        { id: 'dv09-4r-14', text: 'Optional Exercise (p4-56): create a custom alarm with an advisory priority and an alarm word of Unsafe Practice that warns the operator when LI-101 is greater than 900 gallons and XVSTAT-101 is closed for more than 20 seconds. Hints: create a new alarm type, use a condition block, right-click the alarm area in LI-101 to create a custom alarm. (Not a workshop step: tick when done or skipped.)', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch4-analog',
      title: 'Workshop – Creating Analog Modules & Defining Analog Alarms (pp 4-8 to 4-20)',
      objective: 'Task 1. Create an Analog Output control module. Task 2. Create an Analog Input control module. Task 3. Define Analog alarms. Task 4. Add a tank Dynamo.',
      note: 'Create the empty control module LEVEL-101 in Plant_Area_A (right-click Plant_Area_A > New > Control Module) and open it with Control Studio (right-click > Open > Open with Control Studio). The IO palette now has Analog Input and Analog Output; the Special Items palette has Input Parameter. Wire by dragging from the CAS_SP parameter to the Cas_In pin. The ribbon buttons are Assign To Node, Properties, Save and Download. LI-101 comes from Library > ModuleTemplates > Monitoring > ANALOG: drag it onto PLANT_AREA_A, right-click it > Rename. The alarms of the AI block are in the Alarm View and in the Block Alarms dialog (right-click the AI1 block > Assign Alarm). The simulated process wires LY-1 (card 2 channel 1) to LT-1 (card 1 channel 1): the output of LEVEL-101 is the tank level that LI-101 reads. Operate: the Datalink Stamper, the Data Entry Expert and Visibility Expert buttons and the dynamo set Tanks are in the DeltaV_ToolBox and the System Tree of DeltaV Operate (Configure); the rectangle button draws the rectangle; right-click the rectangle > Color... / Animations....',
      steps: [
        { id: 'dv09-4a-1', text: 'Define the Analog Output Module. Step 1. Drag and drop Analog Output from the IO palette.', goto: 'studio' },
        { id: 'dv09-4a-2a', text: 'Step 2. Select the Parameter Window and modify the following: IO_OUT to DST LY-1', goto: 'studio' },
        { id: 'dv09-4a-2b', text: 'PV_SCALE 0-1000 gal', goto: 'studio' },
        { id: 'dv09-4a-2c', text: 'SP_HI_LIM 1000', goto: 'studio' },
        { id: 'dv09-4a-2d', text: 'SP_LO_LIM 0', goto: 'studio' },
        { id: 'dv09-4a-3', text: 'Step 3. Drag and drop Input Parameter from the Special Items palette and name the parameter CAS_SP. The parameter type is Floating Point.', goto: 'studio' },
        { id: 'dv09-4a-4', text: 'Step 4. Connect the CAS_SP parameter to Cas_In on the AO function block.', goto: 'studio' },
        { id: 'dv09-4a-5', text: 'Step 5. Click the Assign To Node button to assign to controller.', goto: 'studio' },
        { id: 'dv09-4a-6a', text: 'Step 6. Click the Properties button to modify properties', goto: 'studio' },
        { id: 'dv09-4a-6b', text: 'and the Save button to save.', goto: 'studio' },
        { id: 'dv09-4a-7', text: 'Step 7. Click the Download button to download controller.', goto: 'studio' },
        { id: 'dv09-4b-1', text: 'Using Analog Module Templates. Step 1. Using the DeltaV Explorer, drag and drop the Monitoring - ANALOG Module Template from the Library to PLANT_AREA_A.', goto: 'explorer' },
        { id: 'dv09-4b-2', text: 'Step 2. Rename the module LI-101.', goto: 'explorer' },
        { id: 'dv09-4b-3', text: 'Step 3. Launch Control Studio and modify the module as follows:', goto: 'explorer' },
        { id: 'dv09-4b-3a', text: 'a. Modify IO_IN to use DST LT-1.', goto: 'studio' },
        { id: 'dv09-4b-3b', text: 'b. Modify OUT_SCALE to 0-1000 gal.', goto: 'studio' },
        { id: 'dv09-4b-3c', text: 'c. Modify HI_ALM limit to 950.', goto: 'studio' },
        { id: 'dv09-4b-3d', text: 'd. Modify LO_ALM limit to 100.', goto: 'studio' },
        { id: 'dv09-4b-3e', text: 'e. Assign to the controller and modify the primary display to TANK101.', goto: 'studio' },
        { id: 'dv09-4b-3f', text: 'f. Save the module.', goto: 'studio' },
        { id: 'dv09-4b-3g', text: 'g. Download the module to the controller.', goto: 'studio' },
        { id: 'dv09-4c-1', text: 'Modifying the Operator Display. Step 1. Launch the DeltaV Operate (Configure) application and open the Tank101 display.', goto: 'builder' },
        { id: 'dv09-4c-2', text: 'Step 2. Add the Data Link LI-101/AI1/PV.F_CV.', goto: 'builder' },
        { id: 'dv09-4c-3', text: 'Step 3. Add another datalink to your picture for LEVEL-101/CAS_SP.F_CV.', goto: 'builder' },
        { id: 'dv09-4c-4', text: 'Step 4. Leave Data Entry, on the Datalink dialog, set to None and click OK.', goto: 'builder' },
        { id: 'dv09-4c-5', text: 'Step 5. Click the Data Entry Expert button in the DeltaV_ToolBox with the new datalink selected.', goto: 'builder' },
        { id: 'dv09-4c-6', text: 'Step 6. When the Data Entry Expert dialog box appears, choose the Numeric/Alpha tab from the Entry Method frame, select Numeric Entry, uncheck Fetch Limits from the Data Source and set the limits to 0 - 1000. Click OK to continue.', goto: 'builder' },
        { id: 'dv09-4c-7', text: 'Step 7. Modify the color of the datalink as necessary.', goto: 'builder' },
        { id: 'dv09-4c-8', text: 'Step 8. Add a Tank from the dynamo set Tanks.', goto: 'builder' },
        { id: 'dv09-4c-9', text: 'Step 9. Add a rectangle to the picture using the rectangle button from the DeltaV_ToolBox.', goto: 'builder' },
        { id: 'dv09-4c-10', text: 'Step 10. Right click on the rectangle and select color to choose a foreground / background color.', goto: 'builder' },
        { id: 'dv09-4c-11', text: 'Step 11. Select the rectangle and right click to select Animations from the pop-up window. Check the Fill Percentage box on the basic animation dialog.', goto: 'builder' },
        { id: 'dv09-4c-12', text: 'Step 12. Modify the Data Source to point to the module LI-101 and parameter PV.', goto: 'builder' },
        { id: 'dv09-4c-13', text: 'Step 13. Check the Vertical Direction and Fetch Limits from Data Source box.', goto: 'builder' },
        { id: 'dv09-4c-14', text: 'Step 14. Save the picture. Important: Remember to close all pictures and dynamo sets.', goto: 'builder' },
        { id: 'dv09-4d-1', text: 'Operating the Analog Module. Step 1. Run the DeltaV Operate application.', goto: 'builder' },
        { id: 'dv09-4d-2', text: 'Step 2. Verify LEVEL-101 output manipulates LI-101 input.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch4-display',
      title: 'Workshop – Modifying the Operator Display (p 4-38)',
      objective: 'Add the HI_ALM and LO_ALM alarm datalinks of LI-101 to the Tank101 display.',
      note: 'Datalink Stamper > ellipsis > DeltaV > Browse DeltaV Control Parameters > LI-101 > HI_ALM > A_CV. Place the datalink, repeat for LO_ALM, then File > Save and File > Close.',
      steps: [
        { id: 'dv09-4e-1', text: 'Step 1. Launch the DeltaV Operate (Configure) application and open the Tank101 display.', goto: 'builder' },
        { id: 'dv09-4e-2a', text: 'Step 2. Add the following Data Links: LI-101/HI_ALM.A_CV', goto: 'builder' },
        { id: 'dv09-4e-2b', text: 'LI-101/LO_ALM.A_CV', goto: 'builder' },
        { id: 'dv09-4e-3', text: 'Step 3. Save and close the display.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch4-operate',
      title: 'Workshop – Operating the Analog Module (p 4-39)',
      objective: 'Operate LEVEL-101 and monitor LI-101.',
      note: 'Write the CAS_SP datalink of LEVEL-101 above 950 (the HIGH alarm) and below 100 (the LOW alarm), then 500 again. Acknowledge with the acknowledge button on the alarm banner (the bell icon opens the Alarm List).',
      steps: [
        { id: 'dv09-4f-1', text: 'Step 1. Run the DeltaV Operate application.', goto: 'builder' },
        { id: 'dv09-4f-2', text: 'Step 2. Verify that LI-101\'s HIGH and LOW alarms function properly. Note: Now that alarm data links have been added to the display, the alarms can be acknowledged by selecting the acknowledge button on the alarm banner.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch4-display2',
      title: 'Workshop – Modifying the Operator Display (pp 4-52, 4-53)',
      objective: 'Replace the HI_ALM and LO_ALM datalinks with the ALARMS[1] datalink and a Visibility Expert.',
      note: 'Select the HI_ALM and LO_ALM datalinks and use Edit > Delete (or the Delete key). Add LI-101/ALARMS[1].A_LAALM, select it and click the Visibility Expert button of the DeltaV_ToolBox, enter the data source LI-101/ALARMS[1].F_LAALM and the condition, then File > Save.',
      steps: [
        { id: 'dv09-4g-1', text: 'Step 1. Launch the DeltaV Operate (Configure) application and open the Tank101 display.', goto: 'builder' },
        { id: 'dv09-4g-2', text: 'Step 2. Delete the HI_ALM and LO_ALM data links on the display.', goto: 'builder' },
        { id: 'dv09-4g-3', text: 'Step 3. Add the Data Link . . . . LI-101/ALARMS[1].A_LAALM', goto: 'builder' },
        { id: 'dv09-4g-4', text: 'Step 4. Select the alarm datalink and click the Visibility Expert button from DeltaV_Toolbox.', goto: 'builder' },
        { id: 'dv09-4g-5', text: 'Step 5. Set the Data Source to . . . LI-101/ALARMS[1].F_LAALM', goto: 'builder' },
        { id: 'dv09-4g-6', text: 'Step 6. Set the condition so that the datalink is visible only when an alarm is active.', goto: 'builder' },
        { id: 'dv09-4g-7', text: 'Step 7. Close all dialogs and return to the picture.', goto: 'builder' },
        { id: 'dv09-4g-8', text: 'Step 8. Save Tank101 display.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch4-operate2',
      title: 'Workshop – Operating the Analog Module (p 4-54)',
      objective: 'Operate LEVEL-101 and monitor LI-101 with the ALARMS[1] datalink and the Event Chronicle.',
      note: 'Run, write the CAS_SP datalink of LEVEL-101 to raise and clear an LI-101 alarm and watch the ALARMS[1] datalink appear and disappear. The Process History View button of the DeltaV Operate Run toolbar opens the Event Chronicle (the Event Journal display). The workstation\'s Event Chronicle (Explorer: Physical Network > Control Network > Workstation > Alarms And Events > Properties: Enable Event Chronicle, Name, SOE) is configured in the panel at the top of that display: check Enable Event Chronicle, click Download Event Chronicle, then raise an LI-101 alarm again: the records appear in the archive.',
      steps: [
        { id: 'dv09-4h-1', text: 'Step 1. Run the DeltaV Operate application.', goto: 'builder' },
        { id: 'dv09-4h-2', text: 'Step 2. Verify that LI-101/ALARMS[1].A_LAALM functions properly.', goto: 'builder' },
        { id: 'dv09-4h-3', text: 'Step 3. Verify that the Event Chronicle is logging alarms and events.', goto: 'builder' }
      ]
    }
  ]
}
