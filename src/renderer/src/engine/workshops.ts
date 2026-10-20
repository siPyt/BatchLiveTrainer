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
    module: '7016 · Ch 3 System Preferences (prerequisite for Ch 4)',
    workshops: [
      {
        id: '7016-ch3-sysprefs',
        title: 'Workshop – System Preferences (Enable Batch)',
        objective: 'Enable batch functionality and restart the DeltaV database services so the batch objects appear in DeltaV Explorer (Course 7016 pp 3-8, 3-9).',
        note: 'Enable Batch also selects Advanced Unit Management. The change stays pending until the database server is shut down and reconnected. The Chapter 2 named sets (vlvnc-sp, vlvnc-pv, vlvnc-2stage-sp/pv, mtr2-sp/pv) are already part of the DV_School database.',
        steps: [
          { id: '7016-3-1', text: 'Access the DeltaV System Preferences dialog box (Utilities → System Preferences).', goto: 'system' },
          { id: '7016-3-2', text: 'Check the Enable Batch entry and click OK to continue.' },
          { id: '7016-3-3', text: 'Access the DeltaV Database Administrator (Database server section). All database clients must be closed.' },
          { id: '7016-3-4', text: 'Select File → Shutdown Server. Wait until the status reads Database Server is Shutdown.' },
          { id: '7016-3-5', text: 'Select File → Connect to Server.' },
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
  }
]