import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 3, DeltaV Control Modules, pages 3-1 .. 3-52 (PDF pages 106-157).

export const DV09_CHAPTER3: WModule = {
  module: 'DV-09 · Ch 3 DeltaV Control Modules',
  workshops: [
    {
      id: 'dv09-ch3-reading',
      title: 'DeltaV Control Modules (reading), pp 3-3 to 3-11, 3-20 to 3-28, 3-32 to 3-37 and 3-46, 3-47',
      objective: 'Define DeltaV Control Module characteristics and meet Control Studio, DeltaV Operate, pictures, datalinks and dynamos (objectives, p3-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The workshops follow in the order of the manual.',
      steps: [
        { id: 'dv09-3r-1', text: 'Control Module characteristics (pp 3-4, 3-5): a unique name of 16 characters maximum (one alpha, alphanumeric, $, - or _), executes control algorithms, is the smallest entity that may be downloaded to the controller, flexible size, may be taken out of service independently, independent scan rate per module, references a primary, detail and faceplate display, executes a function block every 1 to 255 module scans, and the function block execution order is automatic or manual.', goto: 'explorer' },
        { id: 'dv09-3r-2', text: 'Parameter path (pp 3-6, 3-7): Data Server.Module/Block/Parameter.Type_Field, for example DVSYS.FIC-20X/PID1/OUT.F_CV. Type is F (floating) or A (ASCII text); the common fields are CV (current value) and ST (status).' },
        { id: 'dv09-3r-3', text: 'Module Templates (p3-8): start from a template by selecting DeltaV Explorer > Library > Module Templates.', goto: 'explorer' },
        { id: 'dv09-3r-4', text: 'DeltaV Control Studio (pp 3-9 to 3-11): launch it from DeltaV Explorer with the Control Studio button. 1 Hierarchy View, 2 Diagram View, 3 Palette, 4 Parameter View, 5 Alarm View.', goto: 'studio' },
        { id: 'dv09-3r-5', text: 'DeltaV Operate (pp 3-20 to 3-23): Run launches from the Explorer toolbar button; Configure opens from the Explorer button or from Run with a right-click, Quick Edit. Configure has the Button Bars, the DeltaV_ToolBox, the System Tree and the Work Area. Modes: Configure builds pictures, Run runs the Operator Interface.', goto: 'builder' },
        { id: 'dv09-3r-6', text: 'Creating a New Picture (pp 3-24 to 3-28): New Picture from template. Pictures made from the main template already have objects on them, grouped (click + in the System Tree). Object terminology: Object, Properties (colour, size, fill), Methods (scaling, moving) and Events (mouse click, timers expire, values change).', goto: 'builder' },
        { id: 'dv09-3r-7', text: 'Datalink and Expression Builder / Browser (pp 3-32 to 3-37): Source (typed in, most-recently-used list or the browse button), Data Entry (None / In-Place, Confirm), Error Configuration (Use Error Table; never use Current Output), Formatting (Alpha-Numeric / Numeric chosen from the data format A / F, Lines, Characters/Line). The Browse DeltaV Control Parameters button gives DVSYS.MODULE/BLOCK/PARAMETER.TYPE_FIELD, for example DVSYS.XV-101/DO1/SP_D.F_CV; Help on Display Parameters lists workstation parameters such as DVSYS.THISUSER/USERNAME.A_CV. Set the Refresh Rate to a realistic value. The expression builder tabs: FIX Database, Pictures (not recommended), Globals and Data Servers (for example OPC).', goto: 'builder' },
        { id: 'dv09-3r-8', text: 'Dynamos (pp 3-46, 3-47): a dynamo is a group of objects that represents a pump, valve or transmitter. Dynamos with dynamic properties are stored in dynamo sets with the Anim suffix (for example PumpsAnim); others are AGA, frsAdvCFncblk, frsFncblk, frsModGrp, frsModules, frsPopups and frsValves_Xmit.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch3-xv101',
      title: 'Workshop – Creating Module XV-101 (pp 3-12 to 3-15)',
      objective: 'Task 1. Define a new Discrete Output control module. Task 2. Download the Control Module.',
      note: 'In DeltaV Explorer right-click Plant_Area_A > New > Control Module and type the Object name. Open it with Control Studio (Explorer: right-click the module > Open > Open with Control Studio). Drag Discrete Output from the IO palette into the diagram; the block DO1 appears. In the Parameter View double-click Filtered by and tick Quick Configuration and Common Configuration: IO_OUT and MODE then appear. The ribbon buttons are Assign To Node, Properties, Save, Download and On-Line Debug. The module must be assigned to the commissioned controller (CTLR_PAINT from chapter 1), saved and downloaded before the on-line view can write SP_D. Card 4 channel 1 is the DST XV-1 (chapter 2); the simulated process wires XV-1 to LSO-1.',
      steps: [
        { id: 'dv09-3a-1', text: 'Step 1. Right-click on Plant_Area_A → New → Control Module. Enter XV-101 as the Object name.', goto: 'explorer' },
        { id: 'dv09-3a-2', text: 'Step 2. Right-click on XV-101 → Open → Open with Control Studio.', goto: 'explorer' },
        { id: 'dv09-3a-3', text: 'Step 3. Drag and drop Discrete Output from the IO palette.', goto: 'studio' },
        { id: 'dv09-3a-4', text: 'Step 4. Double-click Filtered by in the parameter window.', goto: 'studio' },
        { id: 'dv09-3a-5', text: 'Step 5. Check Quick Configuration and Common Configuration.', goto: 'studio' },
        { id: 'dv09-3a-6', text: 'Step 6. Modify IO_OUT to use the DST XV-1.', goto: 'studio' },
        { id: 'dv09-3a-7', text: 'Step 7. Modify the Mode parameter. Change the Target from Cascade to Auto.', goto: 'studio' },
        { id: 'dv09-3a-8', text: 'Step 8. Select the Assign to Node button to assign the control module to the controller.', goto: 'studio' },
        { id: 'dv09-3a-9', text: 'Step 9. Select the Properties button to modify the module properties primary control display Tank101.', goto: 'studio' },
        { id: 'dv09-3a-10', text: 'Step 10. Select the Save button to save the module.', goto: 'studio' },
        { id: 'dv09-3a-11', text: 'Step 11. Select Download button to download the module from Control Studio.', goto: 'studio' },
        { id: 'dv09-3a-12', text: 'Step 12. Select the On-Line button for the on-line view.', goto: 'studio' },
        { id: 'dv09-3a-13', text: 'Step 13. Select the DO function block.', goto: 'studio' },
        { id: 'dv09-3a-14', text: 'Step 14. Change the SP_D parameter to 1 and verify that Card 4 Channel 1 is on.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch3-xvstat101',
      title: 'Workshop – Creating Module XVSTAT-101 (pp 3-16 to 3-19)',
      objective: 'Task 1. Copy a module template from the library. Task 2. Define a Discrete Input control module.',
      note: 'In DeltaV Explorer expand Library > ModuleTemplates > Monitoring and drag the DISCRETE module template onto PLANT_AREA_A (the copy is named DISCRETE). Right-click it > Rename and type XVSTAT-101. Right-click it > Open > Open with Control Studio. In the Parameter View (Filtered by) pick IO_IN = LSO-1; in the Alarm View set the Discrete Alarm to alarm on a value of 0. Then use the Assign To Node, Properties, Save, Download and On-Line Debug buttons. Card 3 channel 1 is the DST LSO-1 (chapter 2).',
      steps: [
        { id: 'dv09-3b-1', text: 'Step 1. From the DeltaV Explorer select … Library → Module Templates → Monitoring', goto: 'explorer' },
        { id: 'dv09-3b-2', text: 'Step 2. Drag and drop the DISCRETE Module Template from the Library to PLANT_AREA_A.', goto: 'explorer' },
        { id: 'dv09-3b-3', text: 'Step 3. Rename the module XVSTAT-101.', goto: 'explorer' },
        { id: 'dv09-3b-4', text: 'Step 4. Launch the Control Studio by selecting … XVSTAT-101 → Open → Open with Control Studio', goto: 'explorer' },
        { id: 'dv09-3b-5a', text: 'Step 5a. Modify IO_IN to use DST LSO-1.', goto: 'studio' },
        { id: 'dv09-3b-5b', text: 'Step 5b. Modify the Discrete Alarm to alarm on a value of 0.', goto: 'studio' },
        { id: 'dv09-3b-5c', text: 'Step 5c. Select the Assign to Node button to assign to your controller.', goto: 'studio' },
        { id: 'dv09-3b-5d', text: 'Step 5d. Select the Properties button to modify Module Properties displays Primary control to Tank101.', goto: 'studio' },
        { id: 'dv09-3b-5e', text: 'Step 5e. Select the Save button to save.', goto: 'studio' },
        { id: 'dv09-3b-5f', text: 'Step 5f. Select the Download button to download the module to the controller.', goto: 'studio' },
        { id: 'dv09-3b-5g', text: 'Step 5g. Select the On-Line button and verify that XVSTAT-101 works.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch3-newpicture',
      title: 'Workshop – Creating a New Picture (pp 3-29 to 3-31)',
      objective: 'Define a display with Previous and Next navigation: the operator display Tank101.',
      note: 'Launch DeltaV Operate from the DeltaV Explorer toolbar (the Operate button) or Applications > DeltaV Operate, switch to Configure with Ctrl+W (or Workspace > Switch to Configure), then use the New Picture toolbar button (the first button). The main template is already selected in the Template list. In Operate (Configure) the Edit menu has Picture... for the background colour. The Previous/Next buttons are at the top left of the picture; double-click them for the Previous/Next Picture dialog. File > Save saves the picture.',
      steps: [
        { id: 'dv09-3c-1', text: 'Step 1. Launch DeltaV Operate by selecting the button from the Explorer window.', goto: 'explorer' },
        { id: 'dv09-3c-2', text: 'Step 2. Switch to DeltaV Operate (Configure) by pressing CTRL-W.', goto: 'builder' },
        { id: 'dv09-3c-3', text: 'Step 3. Select the DeltaV tool bar’s New Picture button. Select the main template and specify Tank101 as the Picture Name. Click OK to continue.', goto: 'builder' },
        { id: 'dv09-3c-4', text: 'Step 4. Select Edit/Picture... and make the following change. Background Color: Select a color of your choice from the dialog box’s color palette.', goto: 'builder' },
        { id: 'dv09-3c-5', text: 'Step 5. Select the text in the middle of the picture and delete it.', goto: 'builder' },
        { id: 'dv09-3c-6', text: 'Step 6. Double-click the Previous/Next buttons. The Previous/Next Picture dialog box appears. Enter the following Previous and Next Picture names: Previous Picture Name: Ovw_ref.grf; Next Picture name: alarmList.grf. Click OK to continue.', goto: 'builder' },
        { id: 'dv09-3c-7', text: 'Step 7. Save Tank101.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch3-datalink',
      title: 'Workshop – Adding a Datalink (pp 3-38, 3-39)',
      objective: 'Add datalinks for XV-101/DO1/SP_D.F_CV and XVSTAT-101/DI1/PV_D.F_CV to the picture Tank101.',
      note: 'With Tank101 open in Configure, pick the Datalink Stamper in the DeltaV_ToolBox. The Datalink dialog has Source (with the ellipsis button), Data Entry (None / In-Place), Error Configuration and Formatting. The ellipsis opens the Expression Builder: on the DeltaV tab the Browse DeltaV Control Parameters button starts the browser (module, block, parameter, then Refresh Rate and OK). Dialog OK, then click on the picture to stamp the datalink. View > Color Selections changes its colour.',
      steps: [
        { id: 'dv09-3d-1', text: 'Step 1. With picture Tank101 open, select the Datalink Stamper button from the DeltaV_ToolBox.', goto: 'builder' },
        { id: 'dv09-3d-2', text: 'Step 2. When the Datalink dialog opens, click the ellipsis button to start the Expression Builder.', goto: 'builder' },
        { id: 'dv09-3d-3', text: 'Step 3. When the Expression Builder opens, select the DeltaV tab and click the Browse DeltaV Control Parameters button to start the browser.', goto: 'builder' },
        { id: 'dv09-3d-4', text: 'Step 4. Browse to XV-101/DO1/SP_D.F_CV. Check the Refresh Rate. Click OK to continue.', goto: 'builder' },
        { id: 'dv09-3d-5', text: 'Step 5. In the Data Entry portion of the dialog, change the Type from None to In-Place.', goto: 'builder' },
        { id: 'dv09-3d-6', text: 'Step 6. Check the format information to make sure the display format is acceptable before clicking the OK button.', goto: 'builder' },
        { id: 'dv09-3d-7', text: 'Step 7. Move the stamper to the desired position and click the left mouse button to complete.', goto: 'builder' },
        { id: 'dv09-3d-8', text: 'Step 8. Modify the color of the datalink as necessary from the menu bar by selecting … View → Color Selections', goto: 'builder' },
        { id: 'dv09-3d-9', text: 'Step 9. Add a datalink for XVSTAT-101/DI1/PV_D.F_CV. Remember to check the Refresh Rate.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch3-text',
      title: 'Workshop – Creating Static Objects / Text (pp 3-40 to 3-44)',
      objective: 'Add text to identify your datalinks.',
      note: 'In Configure pick the Text button in the DeltaV_ToolBox, click on the picture and type the text (click on another object or an open area when done). View > Color Selections changes the colour of the selected text; View > Property Window shows the Caption, FontName, FontSize and FontStyle properties; the Text Caption Editor button has Read Caption / Write Caption / Close; right-click the text > Font opens the Font dialog.',
      steps: [
        { id: 'dv09-3e-1', text: 'Step 1. Select the Text button from DeltaV_ToolBox and click on the picture where the text is to be placed. Begin typing the text. When done typing, click on another object or on an open area of the picture.', goto: 'builder' },
        { id: 'dv09-3e-2', text: 'Step 2. Modify the color of the text by selecting … View → Color Selections from the menu bar and select the desired color.', goto: 'builder' },
        { id: 'dv09-3e-3', text: 'Step 3. Modify the text, as illustrated below, by selecting the text on the picture before selecting … View → Property Window from the menu bar and changing the window’s Caption property.', goto: 'builder' },
        { id: 'dv09-3e-4', text: 'Step 4. Another option to modify the text is to use the Text Caption Editor button from the DeltaV_ToolBox.', goto: 'builder' },
        { id: 'dv09-3e-5', text: 'Step 5. Select the text to be modified, click on the button, modify the selected text, and click on Write Caption. To modify other text fields, select the field, click on Read Caption, make the modifications and click on Write Caption. Click Close when done.', goto: 'builder' },
        { id: 'dv09-3e-6', text: 'Step 6. If you wish to modify the text’s font, select the text, right-click and select Font from the pop-up list. The Font dialog box appears.', goto: 'builder' },
        { id: 'dv09-3e-7', text: 'Step 7. An alternative method of modifying text is to select the text, open the Properties window and modify the FontName, FontSize and FontStyle properties for the text object.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch3-dynamo',
      title: 'Workshop – Adding a Dynamo (pp 3-48, 3-49)',
      objective: 'Add a dynamo to your picture.',
      note: 'The System Tree (left of the picture window in Configure) lists Dynamo Sets and Pictures. Double-click Valves2 to open the set, expand it and drag Valve17 onto the picture. Ovw_ref is the overview picture that ships with DeltaV Operate; it is in the Pictures list of the System Tree and opens for editing with a double-click. The Previous/Next buttons of Ovw_ref open the Previous/Next Picture dialog.',
      steps: [
        { id: 'dv09-3f-1', text: 'Step 1. Expand Dynamo Sets in the System Tree. Double click on Valves2 to display the valve selections in Valves2.fds.', goto: 'builder' },
        { id: 'dv09-3f-2', text: 'Step 2. Expand Valves2 and select the Valve17 and drag it onto the picture.', goto: 'builder' },
        { id: 'dv09-3f-3', text: 'Step 3. Save your picture.', goto: 'builder' },
        { id: 'dv09-3f-4', text: 'Step 4. Close Tank101 by selecting … File → Close', goto: 'builder' },
        { id: 'dv09-3f-5', text: 'Step 5. Open Ovw_ref and modify Next Picture to be Tank101.', goto: 'builder' },
        { id: 'dv09-3f-6', text: 'Step 6. Save Ovw_ref.', goto: 'builder' }
      ]
    },
    {
      id: 'dv09-ch3-operate',
      title: 'Workshop – Operating & Verifying (p 3-50)',
      objective: 'Verify the operation of the module XV-101 and monitor XVSTAT-101.',
      note: 'Window > Close All, then Workspace > Switch to Run. The Open Main Display toolbar button lists the pictures: select Tank101 and press Enter (or OK). In Run the in-place datalink of XV-101/DO1/SP_D lets you write 1 or 0; the simulated process wires XV-1 (card 4 channel 1) to LSO-1 (card 3 channel 1), so XVSTAT-101 follows XV-101. XVSTAT-101 alarms on a value of 0. The Previous / Next buttons at the top left of Tank101 open Ovw_ref and alarmList.',
      steps: [
        { id: 'dv09-3g-1', text: 'Step 1. Close all open pictures and dynamo sets by selecting … Window → Close All', goto: 'builder' },
        { id: 'dv09-3g-2', text: 'Step 2. Launch DeltaV Operate (Run) by selecting from the menu bar … Workspace → Switch to Run', goto: 'builder' },
        { id: 'dv09-3g-3', text: 'Step 3. Open Tank101 by selecting the Open Main Display button. Scroll down and select Tank101 and press the Enter button.', goto: 'builder' },
        { id: 'dv09-3g-4', text: 'Step 4. Verify that XV-101’s output manipulates XVSTAT-101’s input.', goto: 'builder' },
        { id: 'dv09-3g-5', text: 'Step 5. Verify the alarm on XVSTAT-101.', goto: 'alarms' },
        { id: 'dv09-3g-6', text: 'Step 6. Verify Previous and Next Picture navigation.', goto: 'builder' }
      ]
    }
  ]
}
