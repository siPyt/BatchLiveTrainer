import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 7, Sequential Function Charts (SFCs), pages 7-1 .. 7-30 (PDF pages 270-299).

export const DV09_CHAPTER7: WModule = {
  module: 'DV-09 · Ch 7 Sequential Function Charts (SFCs)',
  workshops: [
    {
      id: 'dv09-ch7-reading',
      title: 'Sequential Function Charts (reading), pp 7-3 to 7-14',
      objective: 'Define the application and the execution of a Sequential Function Chart, its steps, actions, action qualifiers, transitions and Named Sets (objectives, p7-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer: DeltaV Control Studio (File > New, Algorithm type Sequential Function Chart) has the All SFC Items palette, the Action window and the Parameter window. The workshops follow in the order of the manual.',
      steps: [
        { id: 'dv09-7r-1', text: 'Sequential Function Charts (p7-4): SFCs control time/event sequences, for example the startup/shutdown sequence of a piece of equipment. They consist of Steps (execute action(s)), Transitions (decide when to proceed to the next step: the expression is evaluated TRUE) and a Termination (the special symbol that ends a sequence).', goto: 'studio' },
        { id: 'dv09-7r-2', text: 'Step Actions (p7-5): there are three types: Assignment (assigns the result of an expression to a destination), Boolean (references a module-level Boolean parameter) and Non-Boolean (references a function block).', goto: 'studio' },
        { id: 'dv09-7r-3', text: 'Action Qualifiers (pp 7-6 to 7-8), the non-stored qualifiers: N (Non-Stored, active only while the step is active), R (Reset, active on the first scan through a step; stops a stored action), L (Time Limited, active while the step is active for a maximum time or until an expression), D (Delayed, active after a delay time or expression while the step is active) and P (Pulse, executes the action once after a delay time or an expression).', goto: 'studio' },
        { id: 'dv09-7r-4', text: 'Action Qualifiers (p7-9), the stored qualifiers: S (Set, active when the step becomes active and until it is reset), SD (Stored and Delayed), DS (Delayed and Stored: if the step goes inactive before the delay is up the action does not go active) and SL (Stored and Time Limited: active until the configured time has elapsed or the expression is TRUE).', goto: 'studio' },
        { id: 'dv09-7r-5', text: 'SFC Execution (pp 7-10, 7-11): valid divergence and convergence are the sequence select (alternate paths: the first TRUE transition is taken) and the parallel (simultaneous paths: every path executes and the convergence waits for all of them).', goto: 'studio' },
        { id: 'dv09-7r-6', text: 'Adding an Action to a Step (p7-12): add actions by selecting the Step, placing the positioning selector in the Action window, clicking the right mouse button and selecting Add from the pop-up menu.', goto: 'studio' },
        { id: 'dv09-7r-7', text: 'Defining Action Properties (p7-13): select the Action, click the right mouse button and select Properties. The A1 Properties dialog has the Type (Assignment), the Qualifier (for example P Pulse), the Delay (Time value or Expression) and the Action expression; the Expression Assistant launches the Browser.', goto: 'studio' },
        { id: 'dv09-7r-8', text: 'Defining Transition Properties (p7-14): select the Transition, click the right mouse button and select Properties. The T1 Properties dialog has the Transition Condition, for example \'MESSAGE.CV\' = \'NS-T101:STARTUP\'.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch7-using-sfcs',
      title: 'Workshop – Using SFCs (p 7-15)',
      objective: 'Task 1. Define parameter paths required to manipulate Tank101 equipment. Task 2. Create a Named Set which will be used for operator interface to the SFC. Task 3. Create an SFC which will Startup Tank101. Task 4. Display Named Set to the operator.',
      note: 'This is the overview of the workshops that follow. Each task is verified from the work of the detailed workshops: Parameter Paths (task 1), Using SFC-T101 steps 1 and 2 (task 2), steps 3 to 8 (task 3) and step 9 (task 4). The chapter builds on XV-101 and XVSTAT-101 (chapter 3), MTR-102 (chapter 5) and FIC-102 (chapter 6).',
      steps: [
        { id: 'dv09-7a-1', text: 'Task 1. Define parameter paths required to manipulate Tank101 equipment.', goto: 'workshops' },
        { id: 'dv09-7a-2', text: 'Task 2. Create a Named Set which will be used for operator interface to the SFC.', goto: 'explorer' },
        { id: 'dv09-7a-3', text: 'Task 3. Create an SFC which will Startup Tank101.', goto: 'studio' },
        { id: 'dv09-7a-4', text: 'Task 4. Display Named Set to the operator.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch7-parameter-paths',
      title: 'Workshop – Parameter Paths (p 7-16)',
      objective: 'List the parameter paths required to operate the block valve XV-101, the motor MTR-102 and the flow loop FIC-102.',
      note: 'The answers are written on paper in the manual. In the trainer the paths are the ones you use in the SFC: open an action or a transition Properties dialog in Control Studio and press Expression Assistant: the Browser lists the module, block and parameter paths (//MODULE/BLOCK/PARAMETER). A line is verified when its path is used in an expression of SFC-T101 (action or transition) or when you picked it in the Browser (the pick is written to the Event Journal).',
      steps: [
        { id: 'dv09-7b-1', text: 'Open or close the block valve ____________________', goto: 'studio' },
        { id: 'dv09-7b-2', text: 'Determine if the block valve is open or closed ____________________', goto: 'studio' },
        { id: 'dv09-7b-3', text: 'Start or stop the motor ____________________', goto: 'studio' },
        { id: 'dv09-7b-4', text: 'Determine if the motor is running or stopped ____________________', goto: 'studio' },
        { id: 'dv09-7b-5', text: 'Set the mode of the flow loop ____________________', goto: 'studio' },
        { id: 'dv09-7b-6', text: 'Set the setpoint of the flow loop ____________________', goto: 'studio' },
        { id: 'dv09-7b-7', text: 'Manipulate the output of the flow loop ____________________', goto: 'studio' },
        { id: 'dv09-7b-8', text: 'Determine the mode of the flow loop ____________________', goto: 'studio' },
        { id: 'dv09-7b-9', text: 'Determine the flow rate ____________________', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch7-sfc-t101',
      title: 'Workshop – Using SFC-T101 (pp 7-17 to 7-23)',
      objective: 'Create Named Set NS-T101, the Sequential Function Chart SFC-T101 with its MESSAGE parameter, download it and operate it from the operator display Tank101.',
      note: 'Named Set (DeltaV Explorer): System Configuration > Setup > Named Sets, right-click > New > Named Set; then Properties > Add... (name, value, Visible, User Selectable). SFC (DeltaV Control Studio): File > New, change the Algorithm type to Sequential Function Chart; Save names it (type SFC-T101, the area is PLANT_AREA_A). Parameter window: right-click > Add... (Parameter type Named Set, Named set NS-T101, Named state SELECT SEQUENCE). Palette All SFC Items: drag Step, Transition and Termination onto the diagram (select the step the new item follows); Rename... a step by its pop-up menu; right-click the Action window > Add... for an action; right-click a transition > Properties for its condition and the step it leads to (the last transition leads back to HOLD_SFC). Settings > Properties assigns the controller; Download sends the Named Set and the SFC to the controller and the SFC starts at HOLD_SFC. The workstation needs the Named Set too: Explorer > Named Sets > Download Changed Setup Data (workstation). Operate (Configure): Datalink DVSYS.SFC-T101/MESSAGE.F_CV with Data Entry In-Place. In Run click the datalink and select STARTUP: SELECT SEQUENCE is not user selectable.',
      steps: [
        { id: 'dv09-7c-1', text: 'Step 1. Create Named Set NS-T101 using DeltaV Explorer.', goto: 'explorer' },
        { id: 'dv09-7c-2', text: 'Step 2. Modify Properties and add names and values as shown below. Named Set NS-T101 (Name- Case sensitive): 1 = STARTUP, Visible Yes, User Selectable Yes; 255 = SELECT SEQUENCE, Visible Yes, User Selectable No.', goto: 'explorer' },
        { id: 'dv09-7c-3', text: 'Step 3. Use Control Studio to create Sequential Function Chart SFC-T101. Select New and change the Algorithm Type to Sequential Function Chart.', goto: 'studio' },
        { id: 'dv09-7c-4', text: 'Step 4. Create parameter MESSAGE (Named Set, NS-T101).', goto: 'studio' },
        { id: 'dv09-7c-5a', text: 'Step 5. Create Sequential Function Chart using Steps, Transitions and Terminations from the All SFC Items Palette. HOLD_SFC: \'MESSAGE\' := \'NS-T101:SELECT SEQUENCE\' (Pulse).', goto: 'studio' },
        { id: 'dv09-7c-5b', text: 'Step 5. The transition after HOLD_SFC: \'MESSAGE\' = \'NS-T101:STARTUP\'.', goto: 'studio' },
        { id: 'dv09-7c-5c', text: 'Step 5. OPEN_BLK_VLV: Open the block valve XV-101.', goto: 'studio' },
        { id: 'dv09-7c-5d', text: 'Step 5. Wait for the block valve to open XVSTAT-101.', goto: 'studio' },
        { id: 'dv09-7c-5e', text: 'Step 5. SET_FLOW_RATE: Set the flow rate to 50 GPM FIC-102.', goto: 'studio' },
        { id: 'dv09-7c-5f', text: 'Step 5. Wait for flow valve to be > 30 % open.', goto: 'studio' },
        { id: 'dv09-7c-5g', text: 'Step 5. START_PUMP: Start pump MTR-102.', goto: 'studio' },
        { id: 'dv09-7c-5h', text: 'Step 5. Wait for pump to start (the sequence then returns to HOLD_SFC).', goto: 'studio' },
        { id: 'dv09-7c-6', text: 'Step 6. Modify Module Properties and assign the SFC to your controller.', goto: 'studio' },
        { id: 'dv09-7c-7', text: 'Step 7. Save and download the SFC.', goto: 'studio' },
        { id: 'dv09-7c-8', text: 'Step 8. If an algorithm error occurs, use the Check button to check the SFC.', goto: 'studio' },
        { id: 'dv09-7c-9', text: 'Step 9. Add the MESSAGE parameter to operator display Tank101 with Data Entry capability.', goto: 'builder' },
        { id: 'dv09-7c-9n', text: 'Note: Remember to download Changed Setup Data.', goto: 'explorer' },
        { id: 'dv09-7c-10', text: 'Step 10. Verify that the sequence executes properly.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch7-modify-sfc-t101',
      title: 'Workshop – Modifying SFC-T101 (p 7-24)',
      objective: 'Modify NS-T101 to include shutdown as an option and SFC-T101 so it will Startup and Shutdown Tank101 using divergent paths.',
      note: 'Named Set: Explorer > Named Sets > NS-T101 > Properties > Add... (SHUTDOWN, value 2). In Control Studio switch to Edit (the running SFC is stopped), select HOLD_SFC and drag the Transition palette item onto the diagram: a divergent path (a new transition and step) leaves HOLD_SFC. Build both paths as drawn on p7-25 (see the workshop Startup & Shutdown); two transitions lead to END_SEQUENCE: in T Properties choose the step the transition leads to. Save, Download (the changed Named Set goes to the controller with it; download Changed Setup Data to the workstation for the operator display) and operate it from Tank101: first STARTUP, then SHUTDOWN. After the shutdown FIC-102 is in MAN; to run STARTUP again add an action that sets the mode of FIC-102 to AUTO in SET_FLOW_RATE.',
      steps: [
        { id: 'dv09-7d-1', text: 'Step 1. Modify NS-T101 to include shutdown as an option.', goto: 'explorer' },
        { id: 'dv09-7d-2', text: 'Step 2. Modify SFC-T101 so it will Startup and Shutdown Tank101 using divergent paths as shown below.', goto: 'studio' },
        { id: 'dv09-7d-3', text: 'Step 3. Download the SFC.', goto: 'studio' },
        { id: 'dv09-7d-4', text: 'Step 4. If an algorithm error occurs, use the check button to check the SFC.', goto: 'studio' },
        { id: 'dv09-7d-5', text: 'Step 5. Verify that the sequence executes properly.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch7-startup-shutdown',
      title: 'Workshop – Startup & Shutdown (p 7-25)',
      objective: 'Build the divergent chart HOLD_SFC, the startup path, the shutdown path and END_SEQUENCE exactly as drawn.',
      note: 'The figure of p7-25 has no numbered steps: each line below is one box of the chart. Actions: Control Studio, select the step, right-click the Action window > Add...; the manual writes them as \'//XV-101/DO1/SP_D.CV\' := 1, \'//FIC-102/PID1/SP.CV\' := 50, \'//MTR-102/DC1/SP_D.CV\' := \'mtr2-sp:START\' (Start) and the like. Transitions: right-click the transition > Properties: \'//XVSTAT-101/DI1/PV_D.CV\' = 1, \'//FIC-102/PID1/OUT.CV\' > 30, \'//MTR-102/DC1/PV_D.CV\' = \'mtr2-pv:RUNNING\'; the shutdown path reads them back (stopped, closed, OUT < 2).',
      steps: [
        { id: 'dv09-7e-1', text: 'HOLD_SFC: Wait for STARTUP message (left path) and wait for SHUTDOWN message (right path).', goto: 'studio' },
        { id: 'dv09-7e-2', text: 'OPEN_BLK_VLV: Open the block valve XV-101.', goto: 'studio' },
        { id: 'dv09-7e-3', text: 'Wait for block valve to open XVSTAT-101.', goto: 'studio' },
        { id: 'dv09-7e-4', text: 'SET_FLOW_RATE: Set the flow rate to 50 GPM FIC-102.', goto: 'studio' },
        { id: 'dv09-7e-5', text: 'Wait for flow valve to be > 30 % open.', goto: 'studio' },
        { id: 'dv09-7e-6', text: 'START_PUMP: Start pump MTR-102.', goto: 'studio' },
        { id: 'dv09-7e-7', text: 'Wait for pump to start (the left path ends in END_SEQUENCE).', goto: 'studio' },
        { id: 'dv09-7e-8', text: 'STOP_PUMP: Stop pump MTR-102.', goto: 'studio' },
        { id: 'dv09-7e-9', text: 'Wait for pump to stop.', goto: 'studio' },
        { id: 'dv09-7e-10', text: 'CLOSE_BLK_VLV: Close block valve XV-101.', goto: 'studio' },
        { id: 'dv09-7e-11', text: 'Wait for block valve XVSTAT-101 to close.', goto: 'studio' },
        { id: 'dv09-7e-12', text: 'CLOSE_FLOW_VLV: Set the mode of FIC-102 to MAN. Set OUT of FIC-102 to 0%.', goto: 'studio' },
        { id: 'dv09-7e-13', text: 'Wait for flow valve to be < 2 % open (the right path ends in END_SEQUENCE).', goto: 'studio' },
        { id: 'dv09-7e-14', text: 'END_SEQUENCE: No Action; the transition True leads back to HOLD_SFC.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch7-optional-messages',
      title: 'Optional Exercise – operator messages (p 7-26)',
      objective: 'Update the operator with a message pertaining to what the SFC is waiting for in each transition.',
      note: 'Hints: 1. Add values to the Named Set NS-T101 (and download Changed Setup Data). 2. Add actions in the appropriate steps to update the MESSAGE parameter. Each step between the prompt and END_SEQUENCE gets an action \'MESSAGE\' := \'NS-T101:<what the step waits for>\'. The user-selectable choices on the datalink stay STARTUP and SHUTDOWN: new states are visible but not user selectable.',
      steps: [
        { id: 'dv09-7f-1', text: 'Hint 1. Add values to the Named Set NS-T101.', goto: 'explorer' },
        { id: 'dv09-7f-2', text: 'Hint 2. Add actions in the appropriate steps to update the MESSAGE parameter.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch7-optional-level',
      title: 'Optional Exercise – level and lock (p 7-27)',
      objective: 'Modify the SFC so that Startup will make sure the level in Tank101 is high enough to allow MTR-102 to start and MTR-102\'s lock is reset if necessary.',
      note: 'The motor lock (chapter 5) trips when the level is low: make the startup wait for the level (a transition reading the level module, for example \'//LI-101/AI1/PV.CV\' > 50) and reset the device lock before the pump is started (an action \'//MTR-102/DC1/RESET_D.CV\' := 1 in START_PUMP, or in a step before it).',
      steps: [
        { id: 'dv09-7g-1', text: 'The startup waits for the level in Tank101 to be high enough for MTR-102 to start.', goto: 'studio' },
        { id: 'dv09-7g-2', text: 'The startup resets the lock of MTR-102 if necessary.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch7-optional-alarm',
      title: 'Optional Exercise – SFC execution time alarm (p 7-28)',
      objective: 'Cause an alarm to be displayed in DeltaV Operate (Run) when the SFC exceeds a specified time (i.e., over 30 seconds) to execute.',
      note: 'Hints: 1. Add an Alarm Type. 2. Add an alarm to the SFC. 3. Add a function block to the SFC to trigger the alarm. 4. Start the function block (Non-Boolean action). In Control Studio (Edit mode) press Home > Insert > Alarm: Add Alarm Type..., Add SFC Alarm... and Add Function Block... (an ALARM block that trips when the action time exceeds 30 s). Then add a Non-Boolean action that references the block (Action Properties, Type Non-Boolean function block) in the first step, with the qualifier S so that it keeps running until the sequence is over (R in the last step). Save, Download and watch the alarm list in DeltaV Operate (Run) when the sequence runs longer than the limit.',
      steps: [
        { id: 'dv09-7h-1', text: 'Hint 1. Add an Alarm Type.', goto: 'studio' },
        { id: 'dv09-7h-2', text: 'Hint 2. Add an alarm to the SFC.', goto: 'studio' },
        { id: 'dv09-7h-3', text: 'Hint 3. Add a function block to the SFC to trigger the alarm.', goto: 'studio' },
        { id: 'dv09-7h-4', text: 'Hint 4. Start the function block (Non-Boolean action).', goto: 'studio' }
      ]
    }
  ]
}
