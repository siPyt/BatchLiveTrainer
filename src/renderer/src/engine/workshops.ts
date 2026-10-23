import type { DisplayId } from '../ui/uiStore'

// Emerson Course 7016 (DeltaV Batch) workshops performed with BatchLiveTrainer's tools,
// step by step as written in the course book; "goto" jumps the learner to the display
// that stands in for the DeltaV application.

export interface WStep {
  id: string
  text: string
  goto?: DisplayId
}

export interface Workshop {
  id: string
  title: string
  objective: string
  note?: string
  steps: WStep[]
}

export interface WModule {
  module: string
  workshops: Workshop[]
}

export const COURSE: WModule[] = [
  {
    module: '7016 · Ch 1 Batch Process Overview',
    workshops: [
      {
        id: '7016-ch1-definitions',
        title: 'Batch Definitions (S88) — reading, pp 1-3 to 1-15',
        objective: 'Define ISA S88 batch terminology: the Physical Model (Enterprise > Site > Area > Process Cell > Unit > Equipment Module > Control Module) and the Procedural Control Model (Procedure > Unit Procedure > Operation > Phase), class-based objects, and the DeltaV Batch applications (summary p1-28).',
        note: 'Reference material — there are no configuration steps on these pages. Tick each item when you have read it and located the matching place in BatchLive. The Control Activity and Process models are not covered in this class (p1-4). Batch Executive services, Campaign Manager, Batch Historian and Version Control are not simulated.',
        steps: [
          { id: '7016-0-1', text: 'S88 objectives and the four models (p1-4); Physical vs Procedural hierarchy (p1-5). Explorer → System Configuration → Setup → Equipment Hierarchy shows Area > Process Cell > Unit > Equipment Module > Control Module.', goto: 'explorer' },
          { id: '7016-0-2', text: 'Class-based objects (p1-6): a class is a template; each instance has the same structure. Process cells, units, phases, equipment modules and control modules exist at class and instance level. In Explorer, classes live under Library → Advanced Definitions; instances under Control Strategies.' },
          { id: '7016-0-3', text: 'Process Cell Class / Process Cell (p1-7), Unit Class / Unit Module with aliases (p1-8, UM_BL_500 and UM_BL_600), Equipment Module and Control Module classes (p1-9).' },
          { id: '7016-0-4', text: 'Phase Class and Unit Phase — up to ten unit phases running on one unit (p1-10, 1-11); Operation, Unit Procedure and Procedure (p1-11 to 1-13). In Chapter 4 a unit phase is loaded and run from its unit faceplate (Process and BatchHelp pictures).', goto: 'batchhelp' },
          { id: '7016-0-5', text: 'Batch Executive (maximum four per network) and the ProfessionalPLUS architecture (p1-13, 1-14); applications (p1-15): Control Studio, Recipe Studio, Batch Operator Interface and Batch History View (Recipe Studio and the Batch Operator Interface are not used in Chapters 1 and 4; the Event Journal records batch events).', goto: 'studio' }
        ]
      },
      {
        id: '7016-ch1-level-indicator',
        title: 'Workshop – LEVEL_INDICATOR (Control Module Class)',
        objective: 'Create the AnalogInput Control Module Class Category and the LEVEL_INDICATOR class from the ANALOG module template, then configure its common logic in Control Studio (Course 7016 pp 1-16 to 1-25).',
        note: 'Start with File → New Course 7016 Project (DV_School). It loads plant area ED_CENTER_BATCH (TANKSIM, LEV500-SIM, LEV600-SIM, XV/MTR/AGIT/FIC modules) and controller CTLR1. Physical, procedural, control-activity and process S88 models, Batch Executive and the ProfessionalPLUS architecture (pp 1-3 to 1-15) are reference material; this workshop exercises the class-based configuration.',
        steps: [
          { id: '7016-1-1', text: 'In DeltaV Explorer expand DV_School → Library → Advanced Definitions. Right-click Control Module Classes → New Category and name it AnalogInput.', goto: 'explorer' },
          { id: '7016-1-2', text: 'Expand Library → ModuleTemplates → Monitoring. Drag the ANALOG template onto Control Module Classes → AnalogInput and name the new class LEVEL_INDICATOR.' },
          { id: '7016-1-3', text: 'Right-click LEVEL_INDICATOR → Open with Control Studio. Select AI1, right-click OUT_SCALE → Properties: 0-500 gal and check Allow instance value to be configured.' },
          { id: '7016-1-4', text: 'Modify L_TYPE to Direct.' },
          { id: '7016-1-5', text: 'In the Alarm View disable HI_ALM and LO_ALM.' },
          { id: '7016-1-6', text: 'Modify SIMULATE to Enabled with value 0.' },
          { id: '7016-1-7', text: 'Drag an Input Parameter from the Special Items palette onto the diagram. Name it LEVEL_IN, parameter type External reference. DO NOT BROWSE for the external parameter path.' },
          { id: '7016-1-8', text: 'Connect the LEVEL_IN output to SIMULATE_IN on the AI1 function block (drag from the LEVEL_IN pin to the SIMULATE_IN pin).' },
          { id: '7016-1-9', text: 'File → Properties (Module Properties): set the Primary control display to Process.' },
          { id: '7016-1-10', text: 'Save your work (Ctrl+S) and close Control Studio.' }
        ]
      },
      {
        id: '7016-ch1-instances',
        title: 'Workshop – Creating Control Modules from a Control Module Class',
        objective: 'Create LI-104, LI-204, LI-304, LI-504 and LI-604 from LEVEL_INDICATOR, configure their instance values, assign ED_CENTER_BATCH to the controller and download (Course 7016 pp 1-26 to 1-27).',
        note: 'Only parameters with Allow instance value to be configured (plus external references) appear in the right-hand Contents pane of a class-based module. Open a parameter\'s Properties (right-click or double-click) and uncheck Use default value from library object to give that module its own value. Verify on the Process display (the LEVEL_INDICATOR primary display): open XV-101 to fill Color 100 and watch LI-104 follow TANKSIM/TKLEV100.',
        steps: [
          { id: '7016-2-1', text: 'Drag the Control Module Class LEVEL_INDICATOR onto the Plant Area ED_CENTER_BATCH (System Configuration → Control Strategies). Expand the area and rename LEVEL_INDIC_1 to LI-104 (right-click → Rename, or F2).', goto: 'explorer' },
          { id: '7016-2-2', text: 'Repeat for LI-204, LI-304, LI-504 and LI-604.' },
          { id: '7016-2-3', text: 'Set the External parameter path for LEVEL_IN: LI-104 → TANKSIM/TKLEV100, LI-204 → TANKSIM/TKLEV200, LI-304 → TANKSIM/TKLEV300.' },
          { id: '7016-2-4', text: 'LI-504: LEVEL_IN → LEV500-SIM/500_LEV; AI1$OUT_SCALE → 0-1000 gal (uncheck Use default value from library object).' },
          { id: '7016-2-5', text: 'LI-604: LEVEL_IN → LEV600-SIM/600_LEV; AI1$OUT_SCALE → 0-1000 gal.' },
          { id: '7016-2-6', text: 'Drag the plant area ED_CENTER_BATCH onto the controller CTLR1 under Physical Network.' },
          { id: '7016-2-7', text: 'Right-click CTLR1 → Download ▸ Controller. There is no need to perform an upload.' },
          { id: '7016-2-8', text: 'Verify your configuration: no unresolved reference warnings, and every LI shows a live level on the Process display.', goto: 'process' }
        ]
      }
    ]
  },
  {
    module: '7016 · Ch 2 Defining the DeltaV Batch Process',
    workshops: [
      {
        id: '7016-ch2-process',
        title: 'Defining the Batch Process — reading, pp 2-4 to 2-12',
        objective: 'Know the classroom system (ProfessionalPLUS + one controller, DV_School, Process and BatchHelp pictures, simulated I/O), the two plant areas and the parameter paths the phases and equipment modules use.',
        note: 'Reference pages; tick each item after locating it in BatchLiveTrainer. Every path example on pp 2-8 to 2-11 is accepted by the Control Studio expression editor and executes against the simulated modules: \'//LI-104/AI1/PV.CV\' >= 250, \'//XV-101/CAS_SP.CV\' := \'vlvnc-sp:OPEN\', \'//XV-101/MODE.TARGET\' := CAS, \'//XV-502/CAS_SP.CV\' := \'vlvnc-2stage-sp:DRIBBLE\', \'//MTR-505/CAS_SP.CV\' := \'mtr2-sp:START\', \'//MTR-505/DC1/MODE.TARGET\' := CAS, \'//MTR-505/DC1/PV_D.CV\' = \'mtr2-pv:RUNNING\'.',
        steps: [
          { id: '7016-2r-1', text: 'System Architecture (p2-4): ProfessionalPLUS workstation and controller CTLR1 (commissioned and downloaded); database DV_School; pictures Process and BatchHelp; all control modules use simulated I/O. Explorer → Physical Network → Control Network shows PROPLUS and CTLR1.', goto: 'explorer' },
          { id: '7016-2r-2', text: 'Plant Areas (p2-5): FEED_TANK_AREA holds BASE 400 (LI-401, MTR-403, FIC-404); ED_CENTER_BATCH holds Color 100/200/300 (XV-n01, XV-n02, LI-n04), Blender 500/600 (XV-n01..n04, AGIT-n03, MTR-n05, LI-n04). Compare with the Process picture.', goto: 'process' },
          { id: '7016-2r-3', text: 'Level indication (p2-8): level indicators use the AI1 block — \'//LI-104/AI1/PV.CV\' >= 250, or through the alias \'//#TANK_LEVEL#\' >= \'^/R_FILL_LEVEL.CV\' (TANK_LEVEL resolves to the full parameter path).' },
          { id: '7016-2r-4', text: 'Normally closed block valves (p2-9): DC1 block, module level CAS_SP, MODE and PV with named sets vlvnc-sp / vlvnc-pv (Explorer → System Configuration → Setup → Named Sets).' },
          { id: '7016-2r-5', text: '2 stage block valves (p2-10): XV-502 and XV-602 use vlvnc-2stage-sp (CLOSE, DRIBBLE, BULK) and vlvnc-2stage-pv (CLOSED, DRIBBLE, BULK, TRAVEL).' },
          { id: '7016-2r-6', text: 'Motors (p2-11, 2-12): module level CAS_SP (mtr2-sp START/STOP), DC1/MODE and DC1/PV_D (mtr2-pv RUNNING/STOPPED). In CAS the DC1 block follows CAS_SP; return it to AUTO at the end of the phase logic. Motor and block valve aliases resolve to the module name only.' }
        ]
      },
      {
        id: '7016-ch2-manual',
        title: 'Workshop – Manual Operation',
        objective: 'Run the ED_CENTER_BATCH process by hand from DeltaV Operate\'s PROCESS picture, then repeat it and compare how accurately you reproduced the first run (Course 7016 p2-6).',
        note: 'Click a valve, motor, LI or FIC-404 on the Process picture to open its faceplate. Fill: open XV-101 and close it at 60 gal on LI-104. Base transfer: on the FIC-404 faceplate enter SP 90 in the Setpoint box (editable in MAN or AUTO) and select AUTO, then open XV-501, start MTR-403, stop at +100 gal on LI-504 (or −100 on LI-401). Dump: open XV-102 with XV-502 in Bulk (two stage valve). Agitate: start AGIT-503 for 60 s. Drain: open XV-503 (Product) or XV-504 (Waste) and start MTR-505. Valves take 2 s to travel and the pump a few seconds to stop, so close a little early. Each step below shows the measured amount; Step 6 compares your two runs.',
        steps: [
          { id: '7016-2m-1', text: 'Step 1. Fill COLOR 100 to 60 gallons.', goto: 'process' },
          { id: '7016-2m-2', text: 'Step 2. Transfer 100 gallons from BASE 400 to BLENDER 500 at a flow rate of 90 GPM.' },
          { id: '7016-2m-3', text: 'Step 3. Dump 50 gallons from COLOR 100 to BLENDER 500.' },
          { id: '7016-2m-4', text: 'Step 4. Start and run AGIT-503 for 1 minute.' },
          { id: '7016-2m-5', text: 'Step 5. Drain 125 gallons from BLENDER 500 to Product or Waste.' },
          { id: '7016-2m-6', text: 'Step 6. Repeat the entire process and check how accurately you reproduced the results from your first attempt.' }
        ]
      }
    ]
  },
  {
    module: '7016 · Ch 3 System Preferences (prerequisite for Ch 4)',
    workshops: [
      {
        id: '7016-ch3-licensing',
        title: 'Batch Licensing & System Preferences — reading, pp 3-4 to 3-7',
        objective: 'Know the controller and workstation licensing needed for batch and what Enable Batch / Enable Advanced Unit Management reveal.',
        note: 'Reference pages; tick each item after locating it in BatchLiveTrainer.',
        steps: [
          { id: '7016-3l-1', text: 'System-wide licenses (p3-4): controller DSTs for DI, DO, AI and AO; Advanced Unit Management DSTs = the DSTs assigned to class based units; Basic / Advanced / Professional Batch application licenses are assigned to the ProfessionalPLUS and checked before a download. Explorer → Physical Network → Control Network → PROPLUS shows the Licensing Properties.', goto: 'explorer' },
          { id: '7016-3l-2', text: 'Batch licensing levels (p3-5): Basic = Batch Executive; Advanced adds Batch Historian; Professional adds Campaign Manager and Soft-Phase Server (same node as the Batch Executive). Batch Operator Interface licenses are node specific.' },
          { id: '7016-3l-3', text: 'Enabling/Hiding functionality (p3-6, 3-7): System Preferences (DeltaV → Engineering → System Preferences; here Utilities → System Preferences). Enable Batch enables the Batch Executive, BOI, Recipe Studio and Recipe Simulator and selects Advanced Unit Management. Disabling hides the configuration but keeps it in the database; the database services must be stopped and restarted.', goto: 'system' }
        ]
      },
      {
        id: '7016-ch3-sysprefs',
        title: 'Workshop – System Preferences (Enable Batch)',
        objective: 'Enable batch functionality and restart the DeltaV database services so the batch objects appear in DeltaV Explorer (Course 7016 pp 3-8, 3-9).',
        note: 'Enable Batch also selects Advanced Unit Management. The change stays pending until the database server is shut down and reconnected. The Chapter 2 named sets (vlvnc-sp, vlvnc-pv, vlvnc-2stage-sp/pv, mtr2-sp/pv) are already part of the DV_School database.',
        steps: [
          { id: '7016-3-1', text: 'Access the DeltaV System Preferences dialog box (Utilities → System Preferences; in DeltaV: DeltaV → Engineering → System Preferences).', goto: 'system' },
          { id: '7016-3-2', text: 'Check the Enable Batch entry (Enable Advanced Unit Management is selected with it) and click OK to continue.' },
          { id: '7016-3-3', text: 'Access the DeltaV Database Administrator (the window below the System Preferences dialog). All database clients must be closed — close DeltaV Explorer and the other listed clients.' },
          { id: '7016-3-4', text: 'Select File → Shutdown Server. Wait until the status bar in the bottom right corner reads Database Server is Shutdown.' },
          { id: '7016-3-5', text: 'Select File → Connect to Server (the status bar returns to Database Server is Running).' },
          { id: '7016-3-6', text: 'Launch DeltaV Explorer and note the new items: Process Cell Classes, Unit Classes and Phase Classes under Advanced Definitions; Recipes under System Configuration; Batch Executive and Batch Historian subsystems under the ProfessionalPLUS workstation.', goto: 'explorer' }
        ]
      }
    ]
  },
  {
    module: '7016 · Ch 4 FILL Unit Phase',
    workshops: [
      {
        id: '7016-ch4-fill',
        title: 'Workshop – FILL Phase',
        objective: 'Create a process cell, the COLORTANKS unit class with aliases, the FILL phase class with its batch parameters and RUN_LOGIC, three unit modules with resolved aliases and contained modules, download, and run the unit phase (Course 7016 pp 4-37 to 4-52).',
        note: 'Requires Chapter 1 (LI-104/204/304 from LEVEL_INDICATOR) and Chapter 3 (Enable Batch). RUN_LOGIC (p4-44/4-45): INIT [a: \'//#OUTLET_VLV#/MODE.TARGET\' := CAS; b: \'//#OUTLET_VLV#/CAS_SP.CV\' := \'vlvnc-sp:CLOSE\'] → OUTLET_CLOSED [c: \'//#OUTLET_VLV#/PV.CV\' = \'vlvnc-pv:CLOSED\'] → OPEN_INLET [d, e: INLET_VLV CAS, \'vlvnc-sp:OPEN\'] → LEVEL_MET [f: \'//#TANK_LEVEL#\' >= \'^/R_FILL_LEVEL.CV\'] → CLOSE_INLET [g, h: INLET_VLV CAS, \'vlvnc-sp:CLOSE\'] → INLET_CLOSED [i: \'//#INLET_VLV#/PV.CV\' = \'vlvnc-pv:CLOSED\'] → COMPLETE [j: \'^/RPT_FNL_LVL.CV\' := \'//#TANK_LEVEL#\'; k, l: both valves MODE.TARGET := AUTO] → COMPLETE_2 [m: TRUE]. Use Palette → Sequence (3 steps) to add the connected steps, then rename them in Properties.',
        steps: [
          { id: '7016-4-1-1', text: 'Task 1, Step 1. In DeltaV Explorer expand Library → Advanced Definitions → Process Cell Classes → General.', goto: 'explorer' },
          { id: '7016-4-1-2', text: 'Step 2. Right-click the General category → New Process Cell Class and name it PRODUCTION.' },
          { id: '7016-4-1-3', text: 'Step 3. Drag and drop PRODUCTION onto the plant area ED_CENTER_BATCH and name the new process cell PAINT_PRODUCTION.' },
          { id: '7016-4-2-1', text: 'Task 2, Step 1. Right-click Unit Classes → New Category and name it ChargeTankUnits.' },
          { id: '7016-4-2-2', text: 'Step 2. Right-click ChargeTankUnits → New Unit Class called COLORTANKS.' },
          { id: '7016-4-2-3', text: 'Step 3. Right-click COLORTANKS → New → Alias to create INLET_VLV, OUTLET_VLV and TANK_LEVEL.' },
          { id: '7016-4-3-1', text: 'Task 3, Step 1. Right-click Phase Classes → New Category and name it TankClasses.' },
          { id: '7016-4-3-2', text: 'Step 2. Right-click TankClasses → New Phase Class called FILL.' },
          { id: '7016-4-3-3', text: 'Step 3. Right-click FILL → New → Batch Input/Report Parameter R_FILL_LEVEL: Parameter category Operating, Type Real, Category Input, Low 0, Default 250, High 500, Engineering Units gal.' },
          { id: '7016-4-3-4', text: 'Step 4. Add Batch Input/Report Parameter RPT_FNL_LVL: Parameter category Report (type it in to create the category), Type Real, Category Report, Engineering Units gal.' },
          { id: '7016-4-4-1', text: 'Task 4, Step 1. Open Control Studio to edit FILL (right-click FILL → Open with Control Studio).' },
          { id: '7016-4-4-2', text: 'Step 2. Drill down into RUN_LOGIC and add the steps and transitions INIT → OUTLET_CLOSED → OPEN_INLET → LEVEL_MET → CLOSE_INLET → INLET_CLOSED → COMPLETE → COMPLETE_2 with actions a-m (see the note above). Use the Insert Alias, Insert Internal Parameter and Insert Named State buttons in the expression editor.' },
          { id: '7016-4-4-3', text: 'Step 3. Save the Phase Logic.' },
          { id: '7016-4-4-4', text: 'Step 4. Drag and drop the Phase Class FILL onto the Unit Class COLORTANKS.', goto: 'explorer' },
          { id: '7016-4-5-1', text: 'Task 5, Step 1. Drag and drop the Unit Class COLORTANKS onto the process cell PAINT_PRODUCTION.' },
          { id: '7016-4-5-2', text: 'Step 2. Expand the process cell and rename COLORTANKS_1 to UM_COLOR_100.' },
          { id: '7016-4-5-3', text: 'Step 3. Repeat Step 1 and rename COLORTANKS_1 to UM_COLOR_200.' },
          { id: '7016-4-5-4', text: 'Step 4. Repeat Step 1 and rename COLORTANKS_1 to UM_COLOR_300.' },
          { id: '7016-4-5-5', text: 'Step 5. Expand UM_COLOR_100 and select Aliases.' },
          { id: '7016-4-5-6', text: 'Step 6. Double-click INLET_VLV and resolve the alias to XV-101.' },
          { id: '7016-4-5-7', text: 'Step 7. Double-click OUTLET_VLV and resolve the alias to XV-102.' },
          { id: '7016-4-5-8', text: 'Step 8. Double-click TANK_LEVEL and resolve the alias to LI-104/AI1/PV.CV.' },
          { id: '7016-4-5-9', text: 'Step 9. Resolve UM_COLOR_200: INLET_VLV — XV-201, OUTLET_VLV — XV-202, TANK_LEVEL — LI-204/AI1/PV.CV.' },
          { id: '7016-4-5-10', text: 'Step 10. Resolve UM_COLOR_300: INLET_VLV — XV-301, OUTLET_VLV — XV-302, TANK_LEVEL — LI-304/AI1/PV.CV.' },
          { id: '7016-4-6-1', text: 'Task 6, Step 1. Drag and drop the control modules XV-101, XV-102 and LI-104 onto UM_COLOR_100.' },
          { id: '7016-4-6-2', text: 'Step 2. Drag and drop XV-201, XV-202 and LI-204 onto UM_COLOR_200.' },
          { id: '7016-4-6-3', text: 'Step 3. Drag and drop XV-301, XV-302 and LI-304 onto UM_COLOR_300.' },
          { id: '7016-4-7-1', text: 'Task 7, Step 1. Unit module properties (UM_COLOR_100/200/300): Display tab → Primary Control Display = Process.' },
          { id: '7016-4-7-2', text: 'Step 2. Unit phase FILL properties on all three color tank unit modules: Phase Type = Controller.' },
          { id: '7016-4-7-3', text: 'Step 3. Drag and drop TANKSIM onto the process cell PAINT_PRODUCTION.' },
          { id: '7016-4-7-4', text: 'Step 4. Drag and drop the process cell PAINT_PRODUCTION onto the controller CTLR1.' },
          { id: '7016-4-7-5', text: 'Step 5. Download your controller (no upload is needed) and verify your configuration.' },
          { id: '7016-4-8-1', text: 'Task 8, Step 1. In DeltaV Operate use the Process and BatchHelp displays: load FILL on UM_COLOR_100 (click Color 100 → unit faceplate → Load a Phase ... → FILL).', goto: 'process' },
          { id: '7016-4-8-2', text: 'Modify the value of R_FILL_LEVEL using the BatchHelp picture.', goto: 'batchhelp' },
          { id: '7016-4-8-3', text: 'Manually run FILL on UM_COLOR_100: phase faceplate → Phase Command ... → Start (phase owner External).' },
          { id: '7016-4-8-4', text: 'Step 2. Unload FILL from the unit module after resetting the phase.' },
          { id: '7016-4-8-5', text: 'Step 3. Repeat Steps 1 and 2 for UM_COLOR_200 and UM_COLOR_300.' }
        ]
      },
      {
        id: '7016-ch4-hold-restart',
        title: 'Workshop – Hold & Restart',
        objective: 'Create HOLD_LOGIC and RESTART_LOGIC for FILL and download the unit phase (Course 7016 pp 4-55 to 4-57).',
        steps: [
          { id: '7016-4h-1', text: 'Hold, Step 1. In Control Studio drill down into HOLD_LOGIC: step CLOSE_INLET [a: \'//#INLET_VLV#/MODE.TARGET\' := CAS; b: \'//#INLET_VLV#/CAS_SP.CV\' := \'vlvnc-sp:CLOSE\'] and transition HOLD [c: \'//#INLET_VLV#/PV.CV\' = \'vlvnc-pv:CLOSED\'].', goto: 'explorer' },
          { id: '7016-4h-2', text: 'Step 2. Save the phase logic.' },
          { id: '7016-4r-1', text: 'Restart, Step 1. Drill down into RESTART_LOGIC: step OPEN_INLET [a: INLET_VLV MODE.TARGET := CAS; b: CAS_SP.CV := \'vlvnc-sp:OPEN\'] and transition RESTART [c: \'//#INLET_VLV#/PV.CV\' = \'vlvnc-pv:OPEN\'].' },
          { id: '7016-4r-2', text: 'Step 2. Save the phase logic.' },
          { id: '7016-4r-3', text: 'Step 3. Download the unit phase FILL on UM_COLOR_100 (right-click FILL under UM_COLOR_100 → Download ▸ Unit Phase).', goto: 'explorer' }
        ]
      },
      {
        id: '7016-ch4-verify',
        title: 'Workshop – Verify Functionality',
        objective: 'Verify HOLD closes the inlet and RESTART reopens it and resumes filling (Course 7016 p4-58).',
        note: 'Download UM_COLOR_200 and UM_COLOR_300 too (controller download or Download ▸ Unit Phase) before Step 6 so they carry the new Hold and Restart logic.',
        steps: [
          { id: '7016-4v-1', text: 'Step 1. Manually start the unit phase on UM_COLOR_100 and wait for the tank to begin filling.', goto: 'process' },
          { id: '7016-4v-2', text: 'Step 2. Send a HOLD command to the unit phase.' },
          { id: '7016-4v-3', text: 'Step 3. Verify the unit phase transitions to HELD and INLET_VLV is CLOSED.' },
          { id: '7016-4v-4', text: 'Step 4. Send a RESTART command to the unit phase.' },
          { id: '7016-4v-5', text: 'Step 5. Verify INLET_VLV opens, the unit phase returns to RUNNING and COLOR_100 resumes filling.' },
          { id: '7016-4v-6', text: 'Step 6. Repeat Steps 1 through 5 for UM_COLOR_200 and UM_COLOR_300.' }
        ]
      },
      {
        id: '7016-ch4-optional',
        title: 'Optional Exercises – STOP_LOGIC, ABORT_LOGIC, overshoot compensation',
        objective: 'Add STOP_LOGIC and ABORT_LOGIC and verify them; compensate RUN_LOGIC for color overshoot with a hard coded value and/or unique values per color tank (Course 7016 pp 4-60 to 4-62).',
        note: 'Each color tank has a different inlet flow (Color 100 6 gal/s, Color 200 8 gal/s, Color 300 5 gal/s) and the XV valves take a few seconds to close, so every tank overshoots R_FILL_LEVEL by a different amount — compare RPT_FNL_LVL with R_FILL_LEVEL. For unique values add a phase parameter (for example OVERSHOOT, Batch Input, Real) used in LEVEL_MET, e.g. \'//#TANK_LEVEL#\' >= \'^/R_FILL_LEVEL.CV\' - \'^/OVERSHOOT.CV\', and give each unit module its own value: Explorer → UM_COLOR_n00 → FILL → parameter → Properties (uncheck Use default value). Download after each change.',
        steps: [
          { id: '7016-4o-1', text: 'STOP_LOGIC: in Control Studio add steps and transitions (for example close INLET_VLV and OUTLET_VLV and wait for both CLOSED). Save.', goto: 'explorer' },
          { id: '7016-4o-2', text: 'Verify your STOP_LOGIC: Start FILL, send Stop, watch Stopping → Stopped and the valves close.', goto: 'process' },
          { id: '7016-4o-3', text: 'ABORT_LOGIC: add steps and transitions (for example drive both valves closed immediately). Save.' },
          { id: '7016-4o-4', text: 'Verify your ABORT_LOGIC: Start FILL, send Abort, watch Aborting → Aborted.' },
          { id: '7016-4o-5', text: 'RUN_LOGIC: compensate for overshoot with a hard coded value in LEVEL_MET (for example \'//#TANK_LEVEL#\' >= \'^/R_FILL_LEVEL.CV\' - 20).' },
          { id: '7016-4o-6', text: 'Allow unique values for COLOR 100, 200 and 300 (valve characteristics vary): use a phase parameter in LEVEL_MET and configure a different value on each unit module.' }
        ]
      }
    ]
  },
  {
    module: '7016 · Ch 5 Unit Classes, Equipment & Control Module Classes',
    workshops: [
      {
        id: '7016-ch5-blender-color',
        title: 'Workshop – BLENDER_COLOR (Command Driven EM Class)',
        objective: 'Create the command-driven Equipment Module Class BLENDER_COLOR with the named set EM-vlvnc-2stage and the 2STAGE_VALVE child COLOR_IN_VLV, and write the four command SFCs (Course 7016 pp 5-11 to 5-17).',
        note: 'Task 1 (Named Sets): EM-vlvnc-2stage (Close 1, Dribble 2, Bulk 3, Auto Mode 4, Idle 255) and EM_Outlet_State are already in DV_School under Library → Named Sets; you may also create your own there (New Named Set...). A command-driven named set needs the mandatory 255 entry. In Control Studio, Insert Internal Reference inserts paths such as \'^/COLOR_IN_VLV/MODE.TARGET\'; the valve set point uses named set vlvnc2stage-sp (CLOSE 0, DRIBBLE 1, BULK 2) and its PV vlvnc2stage-pv (CLOSED, DRIBBLE, BULK, TRAVEL).',
        steps: [
          { id: '7016-5c-1', text: 'Step 1. Right-click Library → Advanced Definitions → Equipment Module Classes → New Category: CommandDriven.', goto: 'explorer' },
          { id: '7016-5c-2', text: 'Step 2. Right-click CommandDriven → New Equipment Module Class: BLENDER_COLOR (Create New → Algorithm type Command driven).' },
          { id: '7016-5c-3', text: 'Step 3. Browse for the Named Set EM-vlvnc-2stage and click OK.' },
          { id: '7016-5c-4', text: 'Step 4. Drag Control Module Classes → NC_Valves → 2STAGE_VALVE onto BLENDER_COLOR and rename 2STAGE_VALV_1 to COLOR_IN_VLV.' },
          { id: '7016-5c-5', text: 'Step 5. Right-click BLENDER_COLOR → Open with Control Studio.' },
          { id: '7016-5c-6', text: 'Step 6. Double-click a command function block (COMMAND_00001 ...) to drill down and define its logic.' },
          { id: '7016-5c-7', text: 'Step 7. COMMAND_00001: step CLOSE_VLV [a \'^/COLOR_IN_VLV/MODE.TARGET\' := CAS; b \'^/COLOR_IN_VLV/CAS_SP.CV\' := \'vlvnc2stage-sp:CLOSE\'], transition VLV_CLOSED [\'^/COLOR_IN_VLV/PV.CV\' = \'vlvnc2stage-pv:CLOSED\'].' },
          { id: '7016-5c-8', text: 'Step 8. COMMAND_00002: step DRIBBLE_SP [CAS; CAS_SP := \'vlvnc2stage-sp:DRIBBLE\'], transition VLV_DRIBBLE [PV = \'vlvnc2stage-pv:DRIBBLE\'].' },
          { id: '7016-5c-9', text: 'Step 9. COMMAND_00003: step BULK_SP [CAS; CAS_SP := \'vlvnc2stage-sp:BULK\'], transition VLV_BULK [PV = \'vlvnc2stage-pv:BULK\'].' },
          { id: '7016-5c-10', text: 'Step 10. COMMAND_00004: step AUTO_MODE [\'^/COLOR_IN_VLV/MODE.TARGET\' := AUTO], transition ACTUAL_AUTO [\'^/COLOR_IN_VLV/MODE.ACTUAL\' = AUTO].' },
          { id: '7016-5c-11', text: 'Step 11. Save (File → Save) and close Control Studio.' }
        ]
      },
      {
        id: '7016-ch5-blender-outlet',
        title: 'Workshop – BLENDER_OUTLET (State Driven EM Class)',
        objective: 'Create the state-driven Equipment Module Class BLENDER_OUTLET with named set EM_Outlet_State, children PRODUCT_VLV and WASTE_VLV, its items and the state values (Course 7016 pp 5-19 to 5-24).',
        note: 'Only module level parameters are available for the write and readback paths. In the Items grid each state column is a named set state (right-click a cell → Modify Value...): Closed - CAS (both Cascade, CLOSE/CLOSE), Draining Waste - CAS (Cascade, PRODUCT CLOSE, WASTE OPEN), Releasing Product - CAS (Cascade, PRODUCT OPEN, WASTE CLOSE), Auto Mode (both Auto).',
        steps: [
          { id: '7016-5o-1', text: 'Step 1. Right-click Equipment Module Classes → New Category: StateDriven.', goto: 'explorer' },
          { id: '7016-5o-2', text: 'Step 2. Right-click StateDriven → New Equipment Module Class: BLENDER_OUTLET (Algorithm type State driven).' },
          { id: '7016-5o-3', text: 'Step 3. Browse for the Named Set EM_Outlet_State.' },
          { id: '7016-5o-4', text: 'Step 4. Drag Library → Advanced Definitions → Control Module Classes → NC_Valves → NC_VALVE onto BLENDER_OUTLET and rename NC_VALVE_1 to PRODUCT_VLV.' },
          { id: '7016-5o-5', text: 'Step 5. Repeat and rename NC_VALVE_1 to WASTE_VLV.' },
          { id: '7016-5o-6', text: 'Step 6. Open BLENDER_OUTLET with Control Studio.' },
          { id: '7016-5o-7', text: 'Step 7. Right-click in the Items area → Add.' },
          { id: '7016-5o-8', text: 'Step 8. Items: PRODUCT_MODE (PRODUCT_VLV/MODE.TARGET, PRODUCT_VLV/MODE.ACTUAL), WASTE_MODE (WASTE_VLV/MODE.TARGET, WASTE_VLV/MODE.ACTUAL), PRODUCT_SP (PRODUCT_VLV/CAS_SP.CV, PRODUCT_VLV/PV.CV), WASTE_SP (WASTE_VLV/CAS_SP.CV, WASTE_VLV/PV.CV).' },
          { id: '7016-5o-9', text: 'Step 9. Modify the state values as needed (right-click a state cell in the Items grid → Modify Value..., or double-click it).' },
          { id: '7016-5o-10', text: 'Step 10. Save and close Control Studio.' }
        ]
      },
      {
        id: '7016-ch5-blenders-unit',
        title: 'Workshop – BLENDERS Unit Class',
        objective: 'Replace the stand-alone blender modules with UM_BL_500 / UM_BL_600 created from the BLENDERS unit class, its equipment module blocks and control module blocks (Course 7016 pp 5-28 to 5-36).',
        note: 'Requires the Chapter 1 LI-504 / LI-604 modules and the Chapter 4 process cell PAINT_PRODUCTION. Dropping a module class on a unit class opens the Module block dialog (Class name, Ownership type Private/Shared, Allow variant module ...); an alias is created for each block. Private blocks become module instances (AGITATOR1, COLOR_IN_VLV1 ...) when the unit module is created. Rename instances with F2 or right-click → Rename under the unit module.',
        steps: [
          { id: '7016-5u-1', text: 'Step 1. Delete the assigned modules from the controller: Physical Network → Control Network → CTLR1 → select it, right-click each module in the contents → Delete Assignment.', goto: 'explorer' },
          { id: '7016-5u-2', text: 'Step 2. Delete AGIT-503, AGIT-603, MTR-505, MTR-605, XV-501, XV-601, XV-502, XV-602, XV-503, XV-603, XV-504, XV-604 from ED_CENTER_BATCH. DO NOT delete LI-504, LI-604, LEV500-SIM or LEV600-SIM.' },
          { id: '7016-5u-3', text: 'Step 3. Create a Unit Class Category BlenderUnits.' },
          { id: '7016-5u-4', text: 'Step 4. Create the Unit Class BLENDERS under BlenderUnits.' },
          { id: '7016-5u-5', text: 'Step 5. Add the Equipment Module Classes CommandDriven → BLENDER_COLOR and StateDriven → BLENDER_OUTLET (Ownership Private, Allow variant checked) — drag them onto BLENDERS.' },
          { id: '7016-5u-6', text: 'Step 6. Add the Control Module Classes 2StateMotor → AGIT_MTR, 2StateMotor → OUT_PMP and NC_Valves → NC_VALVE (Private, Allow variant checked).' },
          { id: '7016-5u-7', text: 'Step 7. Rename BLENDER_COL_1 → BLNDR_COLOR, BLENDER_OUT_1 → BLNDR_OUTLET, AGIT_MTR_1 → AGITATOR, OUT_PMP_1 → OUT_PUMP, NC_VALVE_1 → BASE_IN_VLV.' },
          { id: '7016-5u-8', text: 'Step 8. Create the alias TANK_LEVEL under BLENDERS.' },
          { id: '7016-5u-9', text: 'Step 9. Drag the Unit Class BLENDERS onto PAINT_PRODUCTION in ED_CENTER_BATCH.' },
          { id: '7016-5u-10', text: 'Step 10. Rename the new unit module BLENDERS_1 to UM_BL_500.' },
          { id: '7016-5u-11', text: 'Step 11. Repeat Step 9 and rename the new unit module UM_BL_600.' },
          { id: '7016-5u-12', text: 'Step 12. Under UM_BL_500 rename AGITATOR1 → AGIT-503, BASE_IN_VLV1 → XV-501, BLNDR_COLOR1 → BL_500_COLOR_IN, COLOR_IN_VLV1 → XV-502, BLNDR_OUTLET1 → BL_500_OUTLET, PRODUCT_VLV1 → XV-503, WASTE_VLV1 → XV-504, OUT_PUMP1 → MTR-505.' },
          { id: '7016-5u-13', text: 'Step 13. Under UM_BL_600 rename AGITATOR2 → AGIT-603, BASE_IN_VLV2 → XV-601, BLNDR_COLOR2 → BL_600_COLOR_IN, COLOR_IN_VLV2 → XV-602, BLNDR_OUTLET2 → BL_600_OUTLET, PRODUCT_VLV2 → XV-603, WASTE_VLV2 → XV-604, OUT_PUMP2 → MTR-605.' },
          { id: '7016-5u-14', text: 'Step 14. Resolve TANK_LEVEL: UM_BL_500 = LI-504/AI1/PV.CV, UM_BL_600 = LI-604/AI1/PV.CV.' },
          { id: '7016-5u-15', text: 'Step 15. Unit module Properties: Process is the Primary control display (UM_BL_500 and UM_BL_600).' },
          { id: '7016-5u-16', text: 'Step 16. Drag the remaining control modules (LI-504, LI-604) onto their unit modules.' },
          { id: '7016-5u-17', text: 'Step 17. Drag ED_CENTER_BATCH and FEED_TANK_AREA onto the controller.' },
          { id: '7016-5u-18', text: 'Step 18. Download the controller.' }
        ]
      },
      {
        id: '7016-ch5-run-process',
        title: 'Workshop – Verify you can run the process',
        objective: 'Operate the ED_CENTER_BATCH plant from the PROCESS picture: fills, base transfer under FIC-404, color dumps, agitation and drains (Course 7016 pp 5-38 / 5-39).',
        note: 'Click a valve, motor or FIC-404 on the Process picture to open its faceplate. Base transfer: on the FIC-404 faceplate select AUTO, then enter SP 90 GPM; open XV-501 (or XV-601), start MTR-403. Color dump: open XV-n02 on the color tank and put the blender color valve (XV-502 / XV-602, two stage) in Bulk. Drain: open XV-n03 (Product) or XV-n04 (Waste) and start the outlet pump. Valves take 2 s to travel, so stop a little early. Each transfer is measured and shown below.',
        steps: [
          { id: '7016-5r-1', text: 'Step 1. Fill COLOR 100 to 60 gallons.', goto: 'process' },
          { id: '7016-5r-2', text: 'Step 2. Transfer 100 gallons from BASE 400 to BLENDER 500 at a flow rate of 90 GPM.' },
          { id: '7016-5r-3', text: 'Step 3. Dump 50 gallons from COLOR 100 to BLENDER 500.' },
          { id: '7016-5r-4', text: 'Step 4. Start and run AGIT-503 for 1 minute.' },
          { id: '7016-5r-5', text: 'Step 5. Drain 125 gallons from BLENDER 500 to Product.' },
          { id: '7016-5r-6', text: 'Step 6. Fill COLOR 200 to 60 gallons.' },
          { id: '7016-5r-7', text: 'Step 7. Dump 50 gallons from COLOR 200 to BLENDER 500.' },
          { id: '7016-5r-8', text: 'Step 8. Drain 125 gallons from BLENDER 500 to Waste.' },
          { id: '7016-5r-9', text: 'Step 9. Fill COLOR 300 to 60 gallons.' },
          { id: '7016-5r-10', text: 'Step 10. Transfer 100 gallons from BASE 400 to BLENDER 600 at a flow rate of 90 GPM.' },
          { id: '7016-5r-11', text: 'Step 11. Dump 50 gallons from COLOR 300 to BLENDER 600.' },
          { id: '7016-5r-12', text: 'Step 12. Drain 100 gallons from BLENDER 600 to Product.' },
          { id: '7016-5r-13', text: 'Step 13. Drain 25 gallons from BLENDER 600 to Waste.' }
        ]
      },
      {
        id: '7016-ch5-verify-ems',
        title: 'Workshop – Verify Equipment Modules',
        objective: 'Command BL_500_COLOR_IN / BL_600_COLOR_IN and BL_500_OUTLET / BL_600_OUTLET from Control Studio On-line and verify A_PV, the command block status and the child valves (Course 7016 pp 5-40 to 5-50).',
        note: 'Right-click an equipment module under UM_BL_500 → Open with Control Studio, then On-line. Set A_COMMAND from the parameter list (right-click A_COMMAND → Set Value..., pick the Named state, OK; p5-44); A_PV shows Idle (255) while a command runs, then the command name. A_ABT_ON_NEW_CMD False (default) finishes the running command before the new one; True aborts it. Open XV-502 / XV-503 / XV-504 faceplates from the Process picture to see the mode and position.',
        steps: [
          { id: '7016-5v-1', text: 'Step 1. Open BL_500_COLOR_IN with Control Studio On-line.', goto: 'explorer' },
          { id: '7016-5v-2', text: 'Steps 2–4. Set A_COMMAND to Dribble; COMMAND_00002 is Complete and A_PV is Dribble; COLOR_IN_VLV is CAS and DRIBBLE.' },
          { id: '7016-5v-3', text: 'Steps 5–7. Set A_COMMAND to Bulk; COMMAND_00003 Complete, A_PV Bulk; COLOR_IN_VLV CAS and BULK.' },
          { id: '7016-5v-4', text: 'Steps 8–10. Set A_COMMAND to Close; COMMAND_00001 Complete, A_PV Close; COLOR_IN_VLV CAS and CLOSED.' },
          { id: '7016-5v-5', text: 'Steps 11–13. Set A_COMMAND to Auto Mode; A_PV Auto Mode; COLOR_IN_VLV in AUTO.' },
          { id: '7016-5v-6', text: 'Step 14. Repeat steps 1 through 13 for BL_600_COLOR_IN.' },
          { id: '7016-5v-7', text: 'Outlet Steps 1–4. Open BL_500_OUTLET On-line; set A_COMMAND to Draining Waste - CAS; A_PV Draining Waste - CAS; both valves CAS, PRODUCT CLOSED, WASTE OPEN.' },
          { id: '7016-5v-8', text: 'Outlet Steps 5–7. Releasing Product - CAS: PRODUCT OPEN, WASTE CLOSED.' },
          { id: '7016-5v-9', text: 'Outlet Steps 8–10. Closed - CAS: both CLOSED in CAS.' },
          { id: '7016-5v-10', text: 'Outlet Steps 11–13. Auto Mode: both valves AUTO.' },
          { id: '7016-5v-11', text: 'Outlet Step 14. Repeat for BL_600_OUTLET.' }
        ]
      },
      {
        id: '7016-ch5-optional',
        title: 'Optional Exercises – descriptions, outlet pump interlocks',
        objective: 'Add descriptions to each blender unit module and its control modules; add interlocks and permissives to MTR-505 and MTR-605 so the outlet pumps cannot run against closed block valves (Course 7016 pp 5-52 / 5-53).',
        note: 'Descriptions: right-click the unit module → Properties (General) and right-click each module under it → Properties. Interlocks: right-click MTR-505 → Open with Control Studio. The pump may run when XV-503 OR XV-504 is open, so drag an OR block from Logical Blocks (for example MTR-505-PERM), set its IN1 = XV-503 and IN2 = XV-504, choose it as MTR-505\'s PERMISSIVE_SOURCE and check the Permissive device option (DEVICE_OPTS; also on the faceplate under Device Options). Single-valve rules can use the Interlock / Permissive condition lists instead. Then try starting MTR-505 from the Process picture with both valves closed (it must refuse), open XV-503 or XV-504 and start it again. Repeat for MTR-605 with XV-603 / XV-604.',
        steps: [
          { id: '7016-5x-1', text: 'Using DeltaV Explorer, add descriptions for each blender unit module and its control modules.', goto: 'explorer' },
          { id: '7016-5x-2', text: 'Using Control Studio, add interlocks and permissives as needed for MTR-505 and MTR-605.' }
        ]
      }
    ]
  }
]