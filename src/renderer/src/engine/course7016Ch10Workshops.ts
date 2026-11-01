import type { WModule } from './workshops'

export const CHAPTER10: WModule = {
  module: '7016 · Ch 10 Batch Operations',
  workshops: [
    {
      id: '7016-ch10-op-finish',
      title: 'OP_FINISH_500 Operation (Recipe Studio)',
      objective: 'Create the unit based operation OP_FINISH_500 in Recipe Studio, enable the Batch Executive, and assign, verify and download the recipe (Course 7016 pp 10-26 to 10-35).',
      note: 'Explorer > System Configuration > Recipes > Operations: right-click Operations > New ▸ Operation..., name it OP_FINISH_500, then right-click it > Open with Recipe Studio. In Recipe Studio use Add Step to add AGITATE:1 (phase class AGITATE) and DRAIN:1 (DRAIN); double-click a transition to name it AGITATE_COMPLETE / DRAIN_COMPLETE and press Default_Transition Conditions to fill in AGITATE:1/BSTATUS = $phase_state:Complete; set the equipment to Unit UM_BL_500 (status bar Equipment or Diagram > Properties); Save. Explorer > Physical Network > Control Network > PROPLUS > Batch Executive: right-click > Properties > General > Enabled. Assign ED_CENTER_BATCH to Assigned Areas (right-click Assigned Areas > Assign Area...). Right-click PROPLUS > Download ▸ Workstation... Then right-click OP_FINISH_500 > Properties: Product tab (author and version), Tools tab: Assign Now, Verify Now and Download Now.',
      steps: [
        { id: '7016-10a-1', text: 'Step 1. Expand Recipes in Explorer, right-click Operations and add a New Operation called OP_FINISH_500.', goto: 'explorer' },
        { id: '7016-10a-2', text: 'Step 1 (Recipe Studio). Add steps AGITATE:1 (phase class AGITATE) and DRAIN:1 (DRAIN); the transitions wait for each phase to complete (AGITATE_COMPLETE: AGITATE:1/BSTATUS = $phase_state:Complete, DRAIN_COMPLETE); set the equipment to Unit UM_BL_500.', goto: 'recipestudio' },
        { id: '7016-10a-3', text: 'Step 2. Save changes to OP_FINISH_500 and close Recipe Studio.', goto: 'recipestudio' },
        { id: '7016-10a-4', text: 'Step 3. Enable the Batch Executive (PROPLUS > Batch Executive > Properties > General > Enabled).', goto: 'explorer' },
        { id: '7016-10a-5', text: 'Step 4. Assign the ED_CENTER_BATCH plant area to the Assigned Areas of the Batch Executive.', goto: 'explorer' },
        { id: '7016-10a-6', text: 'Step 5. Download the ProfessionalPLUS workstation.', goto: 'explorer' },
        { id: '7016-10a-7', text: 'Step 6a. From Explorer select OP_FINISH_500 > Properties and, on the Product tab, supply at least an author and version number.', goto: 'explorer' },
        { id: '7016-10a-8', text: 'Step 6b. On the Tools tab, Assign, Verify and Download OP_FINISH_500.', goto: 'explorer' }
      ]
    },
    {
      id: '7016-ch10-verify',
      title: 'Verify Functionality (Batch Operator Interface)',
      objective: 'Start the Batch Executive service, verify the phases, and run OP_FINISH_500 from the Batch Operator Interface and from DeltaV Operate (Course 7016 pp 10-36 to 10-50).',
      note: 'Open the Batch Application Manager (Applications > Batch Application Manager, or the display list): Start the Batch Executive, then Verify Phases and wait for the Bad Phase Count to be 0. Open the Batch Operator Interface: Batch List screen > Add Batch icon > select OP_FINISH_500 > Batch ID > Create; select the batch and press the Start icon. The Batch List shows RUNNING, and the Process / BatchHelp pictures show AGITATE then DRAIN active on UM_BL_500; the batch ends COMPLETE. In DeltaV Operate open the Batch List View display (Course 7016 Workshops > Open, or the display list), choose Add Batch, the recipe, a Batch ID and Create, then Start. BLENDER 500 starts with 250 gal, so DRAIN (default level 250) drains nothing until a formula sets R_DRAIN_LEVEL.',
      steps: [
        { id: '7016-10v-1', text: 'Steps 1-2. Start the Batch Application Manager and start the Batch Executive service from the Executive tab.', goto: 'batchmgr' },
        { id: '7016-10v-2', text: 'Steps 3-4. Verify Phases and verify that the number of Bad Phases is 0 before proceeding.', goto: 'batchmgr' },
        { id: '7016-10v-3', text: 'Steps 5-7. Launch the Batch Operator Interface, choose Add Batch, select OP_FINISH_500 from the available recipes, enter a Batch ID and select Create.', goto: 'boi' },
        { id: '7016-10v-4', text: 'Steps 8-9. Select the batch and start it with the Start Batch icon; verify the Batch List shows RUNNING and the operation is active in DeltaV Operate.', goto: 'boi' },
        { id: '7016-10v-5', text: 'Step 10. Confirm the operation completes both phases and the batch state is COMPLETE on the Batch List screen.', goto: 'boi' },
        { id: '7016-10v-6', text: 'DeltaV Operate. Open the BatchListView picture, add a batch for OP_FINISH_500, start it, and confirm it runs to COMPLETE.', goto: 'batchlist' }
      ]
    },
    {
      id: '7016-ch10-failure',
      title: 'OP_FINISH_500 Failure Handling',
      objective: 'Trip a phase condition during a batch, read the alarm in the Batch Alarm Summary, clear the failure, restart and complete the batch (Course 7016 pp 10-52 and 10-53).',
      note: 'Add another batch and start it. While AGITATE runs open an outlet valve (for example XV-503 on the Process picture: set it to Auto and open it) so PRODUCT_VLV_OPEN trips. The failure button at the bottom right of the screen shows the number of failures; press it to open the Batch Alarm Summary in the Batch Operator Interface and read the message. Close the valve, then press Clear Failures on the batch control toolbar (PFC screen) and Restart the batch. The AGITATE restart logic starts agitating again and the batch completes.',
      steps: [
        { id: '7016-10f-1', text: 'Steps 1-4. Add another batch for OP_FINISH_500, trip a phase condition in DeltaV Operate causing a failure, and verify the alarm message in the Batch Alarm Summary.', goto: 'process' },
        { id: '7016-10f-2', text: 'Step 5. Acknowledge the alarm by pressing Clear Failures on the batch control toolbar.', goto: 'boi' },
        { id: '7016-10f-3', text: 'Step 6. Restart your batch and verify that the batch completes successfully.', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch10-log',
      title: 'OP_FINISH_500 Electronic Operator Log',
      objective: 'Add comments to a batch from the Batch Operator Interface and from DeltaV Operate; they are recorded in the batch event journal (Course 7016 pp 10-54 to 10-58).',
      note: 'Add another batch for OP_FINISH_500. In the Batch Operator Interface open the PFC screen for the batch, select the Comment tab and Submit an entry. In the Batch List View in DeltaV Operate select the batch and use the Comment button. Both appear in the Batch Event Journal.',
      steps: [
        { id: '7016-10l-1', text: 'Steps 1-3. Add another batch, select the PFC screen for it, and submit an entry from the Comment tab of the Batch Operator Interface.', goto: 'boi' },
        { id: '7016-10l-2', text: 'Steps 4-5. Add a comment to the same batch from the Batch List View in DeltaV Operate and verify both entries were submitted (Batch Event Journal).', goto: 'batchlist' }
      ]
    },
    {
      id: '7016-ch10-prompts',
      title: 'OP_FINISH_500 Operator Prompts',
      objective: 'Add a Phase Message and an operator prompt to AGITATE, download, and verify the prompt holds the phase until the operator answers Yes (Course 7016 pp 10-66 to 10-75).',
      note: 'Explorer > Library > Phase Classes > BlenderClasses > right-click AGITATE > New ▸ Phase Message: name it, Message ID 1, Default value (the text) "OK to begin agitation?" (dynamic data in single quotes, such as \'R_BLEND_TIME\', is replaced by the parameter value). In RUN_LOGIC of AGITATE insert a first step with a Pulse (P) action \'^/REQUEST.CV\' := 3401; (3201 integer, 3301 floating point, 3401 Boolean, 3501 string prompt; 30nn sends a message and 3100 clears it) and a transition that waits for the answer: \'^/REQUEST.CV\' = 0 AND \'^/PROMPT_BOOL.CV\' = TRUE. The response is written to PROMPT_BOOL (PROMPT_INT, PROMPT_FLOAT, PROMPT_STRING). Save, download both blender unit modules, then right-click PROPLUS > Download ▸ Workstation... (or Batch Executive > Download ▸ Equipment...) so the Batch Executive knows the changed phase, and Verify Phases in the Batch Application Manager. Run a batch: the Unacknowledged Prompts button flashes in the BOI (and a prompt count button appears in DeltaV Operate); double-click the prompt and answer Yes.',
      steps: [
        { id: '7016-10o-1', text: 'Step 1. Create a new Phase Message in the AGITATE phase class: Message Text "OK to begin agitation?", Message ID 1.', goto: 'explorer' },
        { id: '7016-10o-2', text: 'Step 2. Create an Operator Prompt in the Run_Logic of AGITATE requesting message #1 (REQUEST := 3401) and wait for the response.', goto: 'studio' },
        { id: '7016-10o-3', text: 'Step 3. Download the AGITATE phase (the unit modules).', goto: 'explorer' },
        { id: '7016-10o-4', text: 'Step 4. Download the equipment to the Batch Executive and Verify Phases.', goto: 'explorer' },
        { id: '7016-10o-5', text: 'Step 5. Verify that your message works: your phase does not continue until a response of Yes is received.', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch10-formulas',
      title: 'Recipe Parameters and Formulas',
      objective: 'Defer batch input parameters to the operation, create the Large, Medium and Small formulas and run each from the Batch Operator Interface (Course 7016 pp 10-76 to 10-89).',
      note: 'In Recipe Studio select the AGITATE:1 step: the parameter window lists its batch input parameters. Double-click R_BLEND_TIME, set Origin to Defer to recipe, keep the name R_BLEND_TIME and answer Yes to create it on the operation. Do the same for R_DRAIN_LEVEL on DRAIN:1. In the Formula window use New Formula... for Large (R_BLEND_TIME 55, R_DRAIN_LEVEL 50), Medium (45, 75) and Small (30, 100): clear Use default value to type each value, and keep Operator can load checked so the BOI shows it. Save, Download OP_FINISH_500 again, then in the BOI Add Batch use Load Formula and run a batch for each formula. BLENDER 500 starts at 250 gal; each run drains it further.',
      steps: [
        { id: '7016-10r-1', text: 'Step 1. Select the AGITATE phase of OP_FINISH_500 and defer R_BLEND_TIME (keep the name R_BLEND_TIME, respond Yes to create it on the operation).', goto: 'recipestudio' },
        { id: '7016-10r-2', text: 'Step 2. Select the DRAIN phase and defer R_DRAIN_LEVEL, keeping the original name.', goto: 'recipestudio' },
        { id: '7016-10r-3', text: 'Step 1 (formulas). Create the formulas Large (55 / 50), Medium (45 / 75) and Small (30 / 100) for OP_FINISH_500 with Operator can load checked.', goto: 'recipestudio' },
        { id: '7016-10r-4', text: 'Step 2. Download OP_FINISH_500.', goto: 'explorer' },
        { id: '7016-10r-5', text: 'Step 3. Verify each formula by running the operation from the BOI for each formula created (Load Formula).', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch10-arbitration',
      title: 'Recipe Arbitration (Phase Control)',
      objective: 'Run AGITATE manually from the BOI Phase Control screen, see the OPERATOR own it, and watch a batch wait until you release it (Course 7016 pp 10-90 to 10-100).',
      note: 'Batch Operator Interface > Phase Control > Display Units > select UM_BL_500 > AGITATE > Acquire (OK on the request dialog). The Arbitration screen shows the phase owned by OPERATOR. Back on Phase Control press Start and enter a Batch ID; answer the prompt, wait for Complete and Reset the phase; do not release it. Add a batch of OP_FINISH_500 and start it: the PFC screen shows it waiting to acquire AGITATE and the Arbitration screen shows the phase needed by OP_FINISH_500. Release the phase from the Arbitration screen: the owner becomes OP_FINISH_500 (DVB on Phase Control). The Batch Event Journal shows the time between starting the batch and the acquisition.',
      steps: [
        { id: '7016-10x-1', text: 'Steps 1-3. In Phase Control select UM_BL_500 and Acquire AGITATE; the Arbitration screen shows it owned by OPERATOR.', goto: 'boi' },
        { id: '7016-10x-2', text: 'Steps 4-6. Start the phase with a Batch ID, acknowledge the prompt, RESET the phase when Complete and DO NOT release it.', goto: 'boi' },
        { id: '7016-10x-3', text: 'Steps 7-10. Add a batch for OP_FINISH_500 and start it; the PFC screen shows it waiting to acquire and the Arbitration screen shows OPERATOR as owner and the phase needed by OP_FINISH_500.', goto: 'boi' },
        { id: '7016-10x-4', text: 'Steps 11-12. Release the phase as the OPERATOR; the owner becomes OP_FINISH_500. View the Batch Event Journal for the batch.', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch10-confirm',
      title: 'Optional: Confirm and Verify the Operator Prompt',
      objective: 'Require a Confirm and Verify for the operator prompt "OK to begin agitation" (Course 7016 p10-74, Batch Executive Action Confirmation tab, p10-60).',
      note: 'Explorer > System Configuration > right-click Batch Executive > Properties > Action Confirmation: tick Confirm and Verify on the Prompts row (Allow Confirmer and Verifier to be the same person stays checked unless you want two people). Run a batch; when you answer the prompt (BOI Unacknowledged Prompts, or the UnacknowledgedPr picture in DeltaV Operate) an identification dialog asks for the confirmer and the verifier user name and password. The confirmer needs the key of the function lock behind the action (Function Security, BATCH_ACK_PROMPT, default Batch Operate) and the verifier the key of BATCH_ACTION_VERIFY. The Batch Event Journal records who confirmed and verified.',
      steps: [
        { id: '7016-10c-1', text: 'Set Confirm and Verify for Prompts on the Batch Executive Action Confirmation tab.', goto: 'explorer' },
        { id: '7016-10c-2', text: 'Run a batch and answer the "OK to begin agitation" prompt with a confirmer and a verifier.', goto: 'boi' },
        { id: '7016-10c-3', text: 'Check the Batch Event Journal: the confirmation is recorded and the phase continued only after it.', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch10-esign',
      title: 'Optional: Electronic Signature on XV-501 MODE',
      objective: 'Build an Electronic Signature policy that requires Confirm and Verify for MODE, associate it with XV-501 and test it in DeltaV Operate (Course 7016 pp 10-9 to 10-20).',
      note: 'System Preferences: tick Enable Electronic Signatures. DeltaV Explorer > System Configuration > Setup > Electronic Signatures: enable the application for DeltaV Operate, create a policy (for example MODE_CHANGE) with MODE set to Two signatures (confirm and verify), enable Electronic Signature on the plant area that contains XV-501 and associate the policy with XV-501 (Module association). In DeltaV Operate change the mode of XV-501 from its faceplate: the signature dialog asks for a comment, the confirmer and the verifier. In Process History View (Historian Trends > Events) the confirmer and verifier are logged. In this simulator the setup takes effect at once (no download step).',
      steps: [
        { id: '7016-10e-1', text: 'Enable Electronic Signatures (System Preferences) and for DeltaV Operate.', goto: 'system' },
        { id: '7016-10e-2', text: 'Create a signature policy with a Parameter Confirmation entry MODE = Confirm and Verify.', goto: 'explorer' },
        { id: '7016-10e-3', text: 'Enable Electronic Signature on the plant area that contains XV-501.', goto: 'explorer' },
        { id: '7016-10e-4', text: 'Associate the policy with the module XV-501.', goto: 'explorer' },
        { id: '7016-10e-5', text: 'In DeltaV Operate change the mode of XV-501 and sign it; check Process History View for the logged signatures.', goto: 'process' }
      ]
    }
  ]
}
