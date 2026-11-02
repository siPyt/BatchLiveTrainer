import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 6, DeltaV Regulatory Control, pages 6-1 .. 6-32 (PDF pages 238-269).

export const DV09_CHAPTER6: WModule = {
  module: 'DV-09 · Ch 6 DeltaV Regulatory Control',
  workshops: [
    {
      id: 'dv09-ch6-reading',
      title: 'DeltaV Regulatory Control (reading), pp 6-3 to 6-13 and 6-22 to 6-27',
      objective: 'Determine DST license requirements; define a Regulatory Control module using the PID_LOOP template; define modes and fields (objectives, p6-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The workshops follow in the order of the manual. Licensing Properties: Explorer > right-click the PROPLUS workstation > Licensing > Licensing Properties. Upload: Explorer > right-click FIC-102 > Upload.',
      steps: [
        { id: 'dv09-6r-1', text: 'DST Licensing (p6-4): DST licensing is based on the number of inputs and outputs: Analog Output, Analog Input, Discrete Output, Discrete Input. DeltaV keeps track of DSTs as you use them. LI-101 references one Analog Input channel; as a result, it uses one DST. DSTs can be substituted for less functional DSTs: an Analog Output DST license could be used for an Analog Input DST.', goto: 'explorer' },
        { id: 'dv09-6r-2', text: 'Total System DSTs (p6-5): view a system summary of DST usage from the DeltaV Explorer: ProfessionalPLUS workstation → Licensing → Licensing Properties.', goto: 'explorer' },
        { id: 'dv09-6r-3', text: 'DeltaV Licenses (pp 6-6 to 6-8): licenses are provided as license file(s) on a mini CD and a unique System Identifier (ID) Key; they only work with a matching System ID Key, which must remain on a DeltaV workstation to permit configuration downloads. Licenses are loaded into the DeltaV database (the file number must match the number on the key) and can be assigned to nodes by drag and drop (the License manager of the Licensing Properties shows the key, the license files and their capacity).', goto: 'explorer' },
        { id: 'dv09-6r-4', text: 'Modes (pp 6-9, 6-10): Manual (MAN) the output is set by the operator; Automatic (AUTO) the setpoint is adjusted by an external source and the loop calculates the output; Cascade (CAS) the setpoint comes from another function block through CAS_IN; Initialize Manual (IMAN) the output follows BKCAL_IN (prevents windup); Out of Service (OOS) the block does not execute and its status is bad; Remote Cascade (RCAS) the setpoint comes from RCAS_IN; Remote Out (ROUT) the OUT value comes from ROUT_IN; Local Override (LO) tracking is active. Numeric values: IMAN 2, MAN 8, CAS 48 (target) / 32 (actual), AUTO 16, OOS 1, RCAS 80 / 64, ROUT 144 / 128, LO 4 (actual). Always use the numeric value, not the word, when writing the mode to Fieldbus devices.', goto: 'studio' },
        { id: 'dv09-6r-5', text: 'Modes (p6-11): the secondary loop (FIC-102 as the flow loop) back-calculates BKCAL_OUT to the BKCAL_IN of the primary (level) loop; when the secondary is not in Cascade the primary goes to IMAN.', goto: 'studio' },
        { id: 'dv09-6r-6', text: 'Mode Fields (p6-12): Target is the mode requested by the operator (only from the permitted list); Actual is the current mode of the block; Normal is the mode the block should be in during normal operation (configured and read, not used by the algorithm); Permitted is the list of valid mode choices.', goto: 'studio' },
        { id: 'dv09-6r-7', text: 'Regulatory Control Module FIC-102 (p6-13): AI FT-2 (card 1, channel 2) → PID (P, I; PV, SP) → AO FY-2 (card 2, channel 2); 0-100 GPM, Gain 0.5, Reset 3, Rate 0, Reverse Acting, Increase to Open.', goto: 'studio' },
        { id: 'dv09-6r-8', text: 'Uploading Parameter Changes (pp 6-22, 6-23): on-line values can be changed from Control Studio or DeltaV Operate; the Upload option writes the on-line values back to the configuration database (for example Gain 0.7 / Reset 2.5 on-line against Gain 0.5 / Reset 3 in the database). The Upload option is accessed by right-clicking the module of interest.', goto: 'explorer' },
        { id: 'dv09-6r-9', text: 'Uploading Parameter Changes (pp 6-24, 6-25): select the parameters you want written back to the database and click the OK button; the Upload complete confirmation box appears once the selected data has been uploaded.', goto: 'explorer' },
        { id: 'dv09-6r-10', text: 'Downloading with an Upload (pp 6-26, 6-27): selecting a download prompts you with an Upload option if external changes have been made to the on-line data. If an Upload is not necessary, click the OK button because, by default, no parameters are selected; no parameters are uploaded even though the Upload appears to execute (internal housekeeping).', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch6-dst-before',
      title: 'Workshop – Creating a Regulatory Loop: Task 1, DST usage before FIC-102 (pp 6-14, 6-15)',
      objective: 'Task 1. Record DST usage prior to configuring FIC-102. (Tasks 2 to 5 of the workshop follow on the next pages: Using the PID_LOOP Template, Modifying an Operator Display, Operating & Verifying, and Task 5 DST usage after.)',
      note: 'Explorer > right-click PROPLUS (your workstation) > Licensing > Licensing Properties. The table of System DST usage lists the number of DSTs referenced per type (Analog Output, Analog Input, Discrete Output, Discrete Input); each time the Licensing Properties are shown the Event Journal records the numbers. Write the numbers down: AO, AI, DO, DI.',
      steps: [
        { id: 'dv09-6a-1', text: 'Step 1. Launch the DeltaV Explorer.', goto: 'explorer' },
        { id: 'dv09-6a-2', text: 'Step 2. Right click on your Workstation and select . . . Licensing → Licensing Properties', goto: 'explorer' },
        { id: 'dv09-6a-3a', text: 'Step 3. Record the number of DSTs configured for: Analog Outputs ______', goto: 'explorer' },
        { id: 'dv09-6a-3b', text: 'Analog Inputs ______', goto: 'explorer' },
        { id: 'dv09-6a-3c', text: 'Discrete Outputs ______', goto: 'explorer' },
        { id: 'dv09-6a-3d', text: 'Discrete Inputs ______', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch6-loop',
      title: 'Workshop – Using the PID_LOOP Template (pp 6-16, 6-17)',
      objective: 'Task 2. Configure the regulatory loop FIC-102 using the PID_LOOP module template.',
      note: 'In DeltaV Explorer expand Library > Module Templates and drag PID_LOOP onto PLANT_AREA_A, then right-click > Rename. Right-click it > Open > Open with Control Studio. In the Parameter View pick IO_IN = FT-2 and IO_OUT = FY-2, enter GAIN, RESET (seconds/repeat), RATE, the PV_SCALE button (0-100, units GPM), IO_OPTS and CONTROL_OPTS (the drop-downs). Right-click the PID1 block > Assign Alarm opens the Block Alarms dialog: tick Low Alarm and High Alarm and enter the limits. The template starts with the values GAIN 1, RESET 10, Decrease to Open, Direct Acting and the alarms disabled. Card 1 channel 2 is the DST FT-2 and card 2 channel 2 is FY-2 (chapter 2). The Properties button has the Displays tab (Primary control).',
      steps: [
        { id: 'dv09-6b-1', text: 'Step 1. From the DeltaV Explorer, drag and drop the PID_LOOP template from the Library to PLANT_AREA_A.', goto: 'explorer' },
        { id: 'dv09-6b-2', text: 'Step 2. Rename the module FIC-102.', goto: 'explorer' },
        { id: 'dv09-6b-3', text: 'Step 3. Launch Control Studio and modify the module as indicated below:', goto: 'explorer' },
        { id: 'dv09-6b-3a', text: 'IO_IN FT-2 Card 1 Channel 2', goto: 'studio' },
        { id: 'dv09-6b-3b', text: 'IO_OUT FY-2 Card 2 Channel 2', goto: 'studio' },
        { id: 'dv09-6b-3c', text: 'GAIN 0.5', goto: 'studio' },
        { id: 'dv09-6b-3d', text: 'RESET 3 seconds/repeat', goto: 'studio' },
        { id: 'dv09-6b-3e', text: 'PV_SCALE 0 - 100 GPM', goto: 'studio' },
        { id: 'dv09-6b-3f', text: 'IO_OPTS Increase to OPEN', goto: 'studio' },
        { id: 'dv09-6b-3g', text: 'CONTROL_OPTS Reverse Acting', goto: 'studio' },
        { id: 'dv09-6b-3h', text: 'Alarms LOW = 10', goto: 'studio' },
        { id: 'dv09-6b-3i', text: 'Alarms HIGH = 90', goto: 'studio' },
        { id: 'dv09-6b-4', text: 'Step 4. Click the Assign to Node button to assign the module to the controller.', goto: 'studio' },
        { id: 'dv09-6b-5', text: 'Step 5. Click the Properties button to modify Module Properties primary display Tank101.', goto: 'studio' },
        { id: 'dv09-6b-6a', text: 'Step 6. Click the Save button to save', goto: 'studio' },
        { id: 'dv09-6b-6b', text: 'and the Download button to download the module.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch6-dst-after',
      title: 'Workshop – Creating a Regulatory Loop: Task 5, DST usage after FIC-102 (p 6-18)',
      objective: 'Task 5. Record DST usage after configuring FIC-102.',
      note: 'Open the Licensing Properties again (Explorer > right-click PROPLUS > Licensing > Licensing Properties) and compare with the numbers you recorded before: FIC-102 references FT-2 (an Analog Input) and FY-2 (an Analog Output), so one more of each is in use.',
      steps: [
        { id: 'dv09-6c-1', text: 'Step 1. Launch the DeltaV Explorer.', goto: 'explorer' },
        { id: 'dv09-6c-2', text: 'Step 2. Right click on your Workstation and select . . . Licensing → Licensing Properties', goto: 'explorer' },
        { id: 'dv09-6c-3a', text: 'Step 3. Record the number of DSTs configured for: Analog Outputs ______ (one more than before)', goto: 'explorer' },
        { id: 'dv09-6c-3b', text: 'Analog Inputs ______ (one more than before)', goto: 'explorer' },
        { id: 'dv09-6c-3c', text: 'Discrete Outputs ______ (unchanged)', goto: 'explorer' },
        { id: 'dv09-6c-3d', text: 'Discrete Inputs ______ (unchanged)', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch6-display',
      title: 'Workshop – Modifying an Operator Display (pp 6-19, 6-20)',
      objective: 'Tasks 3 and 4. Add Regulatory Control module FIC-102 to the Tank101 display: loop datalinks with data entry, the valve dynamo with its color animation and the PipesAnim connection of the tank, pump and valves.',
      note: 'Datalink Stamper > ellipsis > DeltaV > Browse DeltaV Control Parameters > FIC-102 > PID1 > SP / PV / OUT / MODE.A_TARGET / MODE.A_ACTUAL and FIC-102 > ALARMS[1].A_LAALM. Data Entry Expert: Numeric Entry (SP), Ramp (OUT, with a rate in % per second), Multiple-Item Select (MODE.A_TARGET; click get names to allow data entry on the Mode parameter). Visibility Expert (alarm). Dynamo set ValvesAnim > ValveHorizontalControlD1: the Valve Dynamo dialog has Animate Valve Color and Animate Actuator Color buttons: each opens a condition dialog (Data Source, operator and value per condition, all conditions must be true) with a True and a False color. Dynamo set PipesAnim: drag pipes between the tank, the pump and the valves.',
      steps: [
        { id: 'dv09-6d-1', text: 'Step 1. Launch the DeltaV Operate (Configure) application and open the Tank101 display.', goto: 'builder' },
        { id: 'dv09-6d-2a', text: 'Step 2. Add Datalinks with the following characteristics: FIC-102/PID1/SP (data entry – numeric)', goto: 'builder' },
        { id: 'dv09-6d-2b', text: 'FIC-102/PID1/PV', goto: 'builder' },
        { id: 'dv09-6d-2c', text: 'FIC-102/PID1/OUT (data entry – ramp)', goto: 'builder' },
        { id: 'dv09-6d-2d', text: 'FIC-102/PID1/MODE.A_TARGET (data entry – Multiple-Item Select)', goto: 'builder' },
        { id: 'dv09-6d-2e', text: 'FIC-102/PID1/MODE.A_ACTUAL', goto: 'builder' },
        { id: 'dv09-6d-2f', text: 'FIC-102/ALARMS[1].A_LAALM (Visible when an alarm is active)', goto: 'builder' },
        { id: 'dv09-6d-3', text: 'Step 3. Add the Dynamo ValveHorizontalControlD1 from Dynamo set ValvesAnim.', goto: 'builder' },
        { id: 'dv09-6d-4a', text: 'Step 4. Animate the Valve color: MTR-102 is RUNNING AND XVSTAT-101 is OPEN', goto: 'builder' },
        { id: 'dv09-6d-4b', text: '1 - True YELLOW', goto: 'builder' },
        { id: 'dv09-6d-4c', text: '0 - False GREEN', goto: 'builder' },
        { id: 'dv09-6d-5a', text: 'Step 5. Animate the Actuator color: FIC-102 is OPEN', goto: 'builder' },
        { id: 'dv09-6d-5b', text: '1 - True YELLOW', goto: 'builder' },
        { id: 'dv09-6d-5c', text: '0 - False GREEN', goto: 'builder' },
        { id: 'dv09-6d-6', text: 'Step 6. Connect the TANK, PUMP and VALVES together using PipesAnim.', goto: 'builder' },
        { id: 'dv09-6d-7', text: 'Step 7. Save the display.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch6-operate',
      title: 'Workshop – Operating & Verifying (p 6-21)',
      objective: 'Verify the operation of Regulatory Control loop FIC-102.',
      note: 'Run: energize XV-101, fill Tank101 and start MTR-102 as in chapter 5, then write the MODE.A_TARGET datalink of FIC-102 (AUTO) and its SP datalink (Numeric Entry): the PV follows the SP because the simulated process wires FY-2 to FT-2 (flow in GPM = OUT %). Click the valve dynamo to open the faceplate of FIC-102: the Detail button opens the detail picture with the tuning parameters (GAIN, RESET, RATE) and the Real-Time Trend button opens the real-time trend.',
      steps: [
        { id: 'dv09-6e-1', text: 'Step 1. Run the DeltaV Operate application.', goto: 'builder' },
        { id: 'dv09-6e-2', text: 'Step 2. Verify Regulatory Control loop FIC-102’s functionality by manipulating the SP.', goto: 'builder' },
        { id: 'dv09-6e-3', text: 'Step 3. Open the detail picture for FIC-102 and adjust the tuning parameters.', goto: 'builder' },
        { id: 'dv09-6e-3n', text: 'Note: Open the real-time trend from FIC-102’s faceplate.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch6-optional',
      title: 'Optional Exercises (pp 6-28 to 6-30)',
      objective: 'Optional exercises of the chapter (not part of the numbered workshops).',
      note: 'Optional exercise 1 (p6-28): tune FIC-102 using DeltaV Tune. First apply a 2.6 second filter on FT-2 (Card 1 Channel 2: Explorer > I/O > Card 1 > channel 2 > Properties) and download Card 1; launch DeltaV Tune from the detail picture of FIC-102 (Tune Process); first test the process, then update with the new tuning parameters. Optional exercise 2 (p6-29): create a global user threshold table named flow_color with two colors (product flow, no flow) in the System Tree of Operate (Configure) and use it for the piping, pump and valve animation. Optional exercise 3 (p6-30): FIC-102 is designed to operate in AUTO; make the datalink FIC-102/PID1/MODE.A_ACTUAL flash red whenever the actual mode is not AUTO, otherwise invisible (use the ISAN, Is Actual Normal, field). Tick each exercise when done or skipped.',
      steps: [
        { id: 'dv09-6o-1', text: 'Optional Exercise (p6-28): apply a 2.6 second filter on Card 1 Channel 2 (FT-2) and download Card 1; tune FIC-102 using DeltaV Tune from its detail picture (first Test the process, then Update with the new tuning parameters).', goto: 'explorer' },
        { id: 'dv09-6o-2', text: 'Optional Exercise (p6-29): create a global user threshold table named flow_color with two colors, one to indicate product flow and a second color for no flow; modify the piping, pump and valve animation to use the threshold table and verify that a new flow color appears on all the objects.', goto: 'builder' },
        { id: 'dv09-6o-3', text: 'Optional Exercise (p6-30): make the datalink FIC-102/PID1/MODE.A_ACTUAL flash red any time FIC-102’s actual mode is not AUTO, otherwise make it invisible (ISAN field).', goto: 'builder' }
      ]
    }
  ]
}
