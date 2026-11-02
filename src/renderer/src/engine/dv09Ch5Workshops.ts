import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 5, DeltaV Motor Control, pages 5-1 .. 5-22 (PDF pages 216-237).

export const DV09_CHAPTER5: WModule = {
  module: 'DV-09 · Ch 5 DeltaV Motor Control',
  workshops: [
    {
      id: 'dv09-ch5-reading',
      title: 'DeltaV Motor Control (reading), pp 5-3 to 5-11 and 5-20',
      objective: 'Identify the module template for motor control; define state masks, named sets, device options and condition expressions (objectives, p5-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The workshops follow in the order of the manual.',
      steps: [
        { id: 'dv09-5r-1', text: 'Module MTR-102 (p5-4): a motor control module with a DI (XI-2, the run confirmation) and a DO (ZX-2, the start command) on the controller; the simulated process wires ZX-2 to XI-2.', goto: 'explorer' },
        { id: 'dv09-5r-2', text: 'Motor-2 State Templates (p5-5): access the two-state motors from DeltaV Explorer: Library → Module Templates → Motors-2State.', goto: 'explorer' },
        { id: 'dv09-5r-3', text: 'MTR-11_ILOCK (p5-6): the driving force behind motor control is the Device Control block (DC). The parameter window shows the common configuration parameters (CFM_ACT1_TIME, CFM_ACT2_TIME, CFM_PASS_TIME, DEVICE_OPTS, STATE_MASKS, FV_D, MODE, PV_D, SP_D, IO_IN_1, IO_IN_2, IO_OUT_1, IO_OUT_2). Selecting STATE_MASKS displays the STATE_MASKS Properties box.', goto: 'studio' },
        { id: 'dv09-5r-4', text: 'State Masks (p5-7): empty = 0 value on the I/O channel; check mark = 1 value on the I/O; stippled check mark on a light gray background = don\'t care; stippled check mark on a dark gray background = not available. Passive = 0 in the named set; Active1 = 1 in the named set.', goto: 'studio' },
        { id: 'dv09-5r-5', text: 'Named Sets (pp 5-8, 5-9): access the Named Set Properties (for example mtr2-sp) from DeltaV Explorer: Setup → Named Sets. Not all default named sets can be modified; new named sets can be created as needed. The SP_D properties of the DC block browse the available named sets: the names in the named set become the setpoint names of your DC block.', goto: 'explorer' },
        { id: 'dv09-5r-6', text: 'Device Options (p5-10): modify the DEVICE_OPTS properties of the DC block so that it satisfies the control strategy and the safety requirements of the operation: Passive on Active Timeout, Passive when confirmed, Trip, Reset required, Permissive, SP Track and Interlock.', goto: 'studio' },
        { id: 'dv09-5r-7', text: 'Interlocking (p5-11): interlocking is provided by condition blocks that evaluate an Expression. The Boolean Fan Input (BFI) block provides a first-out trap for operator indication and the OR block provides operator indication of bypassed conditions.', goto: 'studio' },
        { id: 'dv09-5r-8', text: 'Optional Exercise (p5-20): create a module XV-OPTION controlled by a device control block (the typical way to control open/close valves) with the setpoint names Flush(1) and Hold(0) and the process variable names Flushing(1) and Holding(0). Hints: module templates; new named sets (must have 4 names). (Not a workshop step: tick when done or skipped.)', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch5-motor',
      title: 'Workshop – Creating a Motor Control Module (pp 5-12 to 5-15)',
      objective: 'Task 1. Create the motor control module MTR-102 using a module template. Task 2. Define interlocks. Task 3. Display a pump dynamo. Task 4. Create Datalinks and add Expert functionality.',
      note: 'In DeltaV Explorer expand Library > ModuleTemplates > Motors-2State and drag MTR-11_ILOCK onto PLANT_AREA_A, then right-click it > Rename. Right-click it > Open > Open with Control Studio. In the Parameter View (Filtered by Quick Configuration and Common Configuration) pick IO_IN_1 = XI-2 and IO_OUT_1 = ZX-2; the DEVICE_OPTS button opens the DEVICE_OPTS Properties dialog with the seven option bits. Select the CND1 / CND2 blocks in the Hierarchy View or the diagram: their DESC, TIME_DURATION and EXPRESSION are in the Parameter View. The Properties button has the Displays tab (Primary control and Detail). Card 3 channel 2 is the DST XI-2 and card 4 channel 2 is ZX-2 (chapter 2). The Detail display of the template is the 16-condition detail picture: change it to the detail picture for 2 condition blocks (a name that carries the number 2, for example ILOCK2_DETAIL; the real detail display names are not reproduced).',
      steps: [
        { id: 'dv09-5a-1', text: 'Step 1. From the DeltaV Explorer, drag and drop the MTR-11_ILOCK template from the Library to PLANT_AREA_A.', goto: 'explorer' },
        { id: 'dv09-5a-2', text: 'Step 2. Rename the module MTR-102.', goto: 'explorer' },
        { id: 'dv09-5a-3', text: 'Step 3. Launch Control Studio and modify the module as indicated below:', goto: 'explorer' },
        { id: 'dv09-5a-3a', text: 'I/O: IO_IN_1 XI-2 (Card 3 Channel 2)', goto: 'studio' },
        { id: 'dv09-5a-3b', text: 'IO_OUT_1 ZX-2 (Card 4 Channel 2)', goto: 'studio' },
        { id: 'dv09-5a-3c', text: 'Device_Opts: not checked: Passive on Active Timeout, Passive when confirmed, Trip, SP Track', goto: 'studio' },
        { id: 'dv09-5a-3d', text: 'Device_Opts: checked: Reset required, Permissive, Interlock', goto: 'studio' },
        { id: 'dv09-5a-4a', text: 'Step 4. Provide Permissive and Interlock conditions. CND1: DESC XVSTAT-101 is closed, Expression \'//XVSTAT-101/DI1/PV_D\'=0', goto: 'studio' },
        { id: 'dv09-5a-4b', text: 'CND2: DESC Tank101 level is <50, Time_Duration 4 Secs, Expression \'//LI-101/AI1/PV\'<50', goto: 'studio' },
        { id: 'dv09-5a-5', text: 'Step 5. Assign the module to the controller.', goto: 'studio' },
        { id: 'dv09-5a-6a', text: 'Step 6. Select the Properties button to modify module properties primary display Tank101', goto: 'studio' },
        { id: 'dv09-5a-6b', text: 'and modify Detail to match the number of defined condition blocks.', goto: 'studio' },
        { id: 'dv09-5a-7a', text: 'Step 7. Select the Save button to save', goto: 'studio' },
        { id: 'dv09-5a-7b', text: 'and the Download button to download the module.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch5-display',
      title: 'Workshop – Modifying an Operator Display (pp 5-16 to 5-18)',
      objective: 'Add motor control module MTR-102 to the Tank101 display: datalinks with experts and the PumpAnimC1 dynamo with its color animation.',
      note: 'Datalink Stamper > ellipsis > DeltaV > Browse DeltaV Control Parameters > MTR-102 > DC1 > PV_D (SP_D) and MTR-102 > ALARMS[1].A_LAALM. Select the SP_D datalink and click the Data Entry Expert button: Multi-Item Select tab, Get names. Select the alarm datalink and click the Visibility Expert button. Open the dynamo set PumpsAnim in the System Tree (Dynamo Sets) and drag PumpAnimC1 onto the picture: the Pump Dynamo dialog has Animate Pump Color and a Color button for the Color By dialog.',
      steps: [
        { id: 'dv09-5b-1', text: 'Step 1. Launch the DeltaV Operate (Configure) application and open the Tank101 display.', goto: 'builder' },
        { id: 'dv09-5b-2a', text: 'Step 2. Add Datalinks with the following characteristics: MTR-102/DC1/PV_D.A_CV', goto: 'builder' },
        { id: 'dv09-5b-2b', text: 'MTR-102/DC1/SP_D.A_CV (Data Entry Expert/Multi-Item Select)', goto: 'builder' },
        { id: 'dv09-5b-2c', text: 'MTR-102/ALARMS[1].A_LAALM (Visible only when an alarm is active)', goto: 'builder' },
        { id: 'dv09-5b-3', text: 'Step 3. Add the Dynamo PumpAnimC1 from Dynamo set PumpsAnim.', goto: 'builder' },
        { id: 'dv09-5b-4', text: 'Step 4. Animate the pump\'s color by checking the Animate Pump Color or clicking the Color button on the Pump Dynamo dialog box. The Color By dialog box appears.', goto: 'builder' },
        { id: 'dv09-5b-5a', text: 'Step 5. Enter the following parameters in the Color By dialog box shown above. Data Source: MTR-102/DC1/PV_D.F_CV', goto: 'builder' },
        { id: 'dv09-5b-5b', text: 'Color By: Current Value. Color Threshold: Exact Match', goto: 'builder' },
        { id: 'dv09-5b-5c', text: 'Value: 0 Color: White', goto: 'builder' },
        { id: 'dv09-5b-5d', text: 'Value: 1 Color: Yellow', goto: 'builder' },
        { id: 'dv09-5b-6', text: 'Step 6. Save the display.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch5-operate',
      title: 'Workshop – Operating the Motor Control Module (p 5-19)',
      objective: 'Verify the operation of motor control module MTR-102 and its interlocks.',
      note: 'Run: write the SP_D datalink of XV-101 (In-Place entry) to energize and de-energize the valve, the CAS_SP datalink of LEVEL-101 to set the level of Tank101 (LI-101), and the SP_D datalink of MTR-102 (Multi-Item Select: START / STOP) to run the pump. The condition CND2 needs the level below 50 for 4 seconds. The device option Reset required keeps MTR-102 locked after an interlock: click Reset in the faceplate of MTR-102 (click the pump dynamo) before starting it again.',
      steps: [
        { id: 'dv09-5c-1', text: 'Step 1. Run the DeltaV Operate application.', goto: 'builder' },
        { id: 'dv09-5c-2', text: 'Step 2. Energize (open) XV-101.', goto: 'builder' },
        { id: 'dv09-5c-3', text: 'Step 3. Fill Tank101 to 500 gallons.', goto: 'builder' },
        { id: 'dv09-5c-4', text: 'Step 4. Verify that motor control module MTR-102 is operating properly by manipulating the SP_D.', goto: 'builder' },
        { id: 'dv09-5c-5', text: 'Step 5. De-energize (close) XV-101 and verify that the interlock occurs.', goto: 'builder' },
        { id: 'dv09-5c-6', text: 'Step 6. Adjust Tank101\'s level to 10 gallons and verify that the interlock occurs.', goto: 'builder' }
      ]
    }
  ]
}
