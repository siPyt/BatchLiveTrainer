import type { WModule } from './workshops'

export const CHAPTER6: WModule = {
  module: '7016 · Ch 6 AGITATE Unit Phase',
  workshops: [
    {
      id: '7016-ch6-agitate',
      title: 'AGITATE - configuration and timed operation',
      objective: 'Build a timed agitation phase for both blender units, using the classes and equipment configured in Chapter 5.',
      note: 'Use your course book for the diagrams and expressions (pp 6-14 to 6-21). This checklist summarizes the work rather than supplying a completed phase. In Control Studio, right-click the right side of the Hierarchy window and choose Add Composite Block to add a block linked to TIMER_SEC.',
      steps: [
        { id: '7016-6-1', text: 'Create BlenderClasses under Phase Classes, then create AGITATE. Add integer input R_BLEND_TIME: Operating, limits 0-300, default 30 sec. Add integer report RPT_BLEND_TIME in Report, units sec.', goto: 'explorer' },
        { id: '7016-6-2', text: 'Open AGITATE in Control Studio and drill down into RUN_LOGIC. Right-click the right side of the Hierarchy window, Add Composite Block, name it BLEND_TIMER and link it to TIMER_SEC. Its START flag runs the retentive timer; RESET clears elapsed time and then clears itself.', goto: 'studio' },
        { id: '7016-6-3', text: 'Build the initialization, start, timing, stop and cleanup steps from your course diagram. Write STEP_INDEX explicitly with a quoted reference, for example \'^/STEP_INDEX.CV\' := 1; (a bare STEP_INDEX := 1; is not valid). Pulse actions support a time delay, a delay condition and a Confirm expression. Wait for INITIALIZE_EQUIP/PENDING_CONFIRMS = 0 before proceeding. Start the BLEND_TIMER composite from START_TIMER with a Non-Boolean, N (Non-Stored) action whose expression is \'/BLEND_TIMER\'.' },
        { id: '7016-6-4', text: 'Measure agitation with BLEND_TIMER/ELAPSED_TIME; copy it to RPT_BLEND_TIME before resetting the timer. Return the equipment to AUTO. Gate cleanup with RESET_EQUIP/TIME >= 3. Save, assign AGITATE to BLENDERS, set each unit phase type to Controller, and download both unit phases.', goto: 'explorer' },
        { id: '7016-6-5', text: 'From Process, load AGITATE on UM_BL_500 and UM_BL_600. Set R_BLEND_TIME through BatchHelp, start each phase, and verify completion and a report matching the requested duration.', goto: 'process' }
      ]
    },
    {
      id: '7016-ch6-hold-restart',
      title: 'AGITATE - Hold and Restart',
      objective: 'Pause agitation without losing accumulated blend time, then resume or restart initialization as appropriate.',
      note: 'Refer to pp 6-24 to 6-29 and 6-46 to 6-51. Select a step and use Insert > Branch Left / Branch Right (or right-click > Add Alternate Branch Left/Right, or drag the palette Branch item to either side of the step) to draw an alternate branch; legs are evaluated left to right. Double-click a transition to set its name, expression and the step it connects to (Connect to); Palette > Termination ends a leg. Right-click > Add Sequence After extends a leg. A step takes its first TRUE transition.',
      steps: [
        { id: '7016-6h-1', text: 'Build HOLD_LOGIC to stop BLEND_TIMER, put AGITATOR in CAS, stop it, and wait for stopped feedback. Save.', goto: 'studio' },
        { id: '7016-6h-2', text: 'Build RESTART_LOGIC with STEP_INDEX branches. Use $phase_restart_types:Continue to resume the saved RUN_LOGIC position or From_Start to rerun initialization. Restart the agitator, verify feedback and resume the timer. Save and download.' },
        { id: '7016-6h-3', text: 'On each blender, start AGITATE, Hold during timing, verify Held with the agitator stopped and elapsed time retained, then Restart and verify Running and completion.', goto: 'process' }
      ]
    },
    {
      id: '7016-ch6-failures',
      title: 'AGITATE - failure monitoring and recovery',
      objective: 'Detect all five equipment failures, drive the phase to Holding, make the equipment safe, clear failures, and resume on both blenders.',
      note: 'Refer to pp 6-38 to 6-52. FAIL_MONITOR is a function block diagram: drag CND, BFI and CALC from the palette, double-click a block for its properties (name and expression), and drag from an output pin to an input pin to wire it; select a wire and press Delete to remove it. CALC supports IF/THEN/ELSE/ENDIF and has its own IN1 and OUT1 pins. For MESSAGE, wire BFI1/FIRST_OUT to IN1 and write /OUT1.CV; BLOCK1 writes ^/FAIL_INDEX.CV only when no failure is already latched. While On-Line, double-click a parameter in the Parameters pane to enable conditions and reset BFI.',
      steps: [
        { id: '7016-6f-1', text: 'In FAIL_MONITOR add five CNDs (AGITATOR_STOPPED, PRODUCT_VLV_OPEN, WASTE_VLV_OPEN, BASE_VLV_OPEN, COLOR_VLV_OPEN), BFI1, MESSAGE and BLOCK1 CALCs. Default each condition DISABLE to 1; wire conditions to the BFI inputs and FIRST_OUT to MESSAGE/IN1.', goto: 'studio' },
        { id: '7016-6f-2', text: 'Configure each condition using the matching unit alias, including nested EM child paths. Convert binary FIRST_OUT values to failure indexes 4-8 in MESSAGE, then latch MESSAGE/OUT1 into FAIL_INDEX in BLOCK1. Add the five messages to phase_failures and download Changed Setup Data.', goto: 'explorer' },
        { id: '7016-6f-3', text: 'Enable valve monitoring after initialization and agitator monitoring only once running. Before the normal stop, disable the agitator condition; delay the stop pulse until DISABLE is true. Disable valve monitoring in cleanup.', goto: 'studio' },
        { id: '7016-6f-4', text: 'Add HOLD_LOGIC branches for failure, timing/start, and other STEP_INDEX values. Disable all conditions and stop the timer. On failure, close valves and stop pumps/agitation with confirmations. In RESTART_LOGIC reset BFI1/RESET_IN, restart equipment, re-enable conditions at the correct point, and resume the timer. Save and download both phases.' },
        { id: '7016-6f-5', text: 'For UM_BL_500: during agitation, force each of the five failure conditions in turn using the equipment faceplates. Verify the message and fail-safe equipment positions, Clear Failures in the phase command selector, Restart and verify Running. Restore AUTO/CAS as required for each test.', goto: 'process' },
        { id: '7016-6f-6', text: 'Repeat all five failure/clear/restart tests on UM_BL_600. Confirm the other blender is unaffected.' }
      ]
    },
    {
      id: '7016-ch6-optional',
      title: 'Optional - Stop, Abort and held agitation',
      objective: 'Practice alternative safe shutdown and held-state behavior (pp 6-22, 6-23 and 6-31).',
      note: 'Manual checks: choose safe equipment behavior for your exercise. Branches can loop back to previous steps, and step TIME can pace pulses.',
      steps: [
        { id: '7016-6x-1', text: 'Configure STOP_LOGIC and ABORT_LOGIC, save/download, and exercise Stop/Abort while agitating. Verify the equipment reaches your intended safe state.', goto: 'studio' },
        { id: '7016-6x-2', text: 'Optionally add a timed agitation loop to HOLD_LOGIC to prevent settling. Verify timing while held and safe behavior on Stop/Abort.' }
      ]
    }
  ]
}
