import type { WModule } from './workshops'

export const CHAPTER12: WModule = {
  module: '7016 · Ch 12 Dynamic Referencing',
  workshops: [
    {
      id: '7016-ch12-dynref',
      title: 'Dynamic Reference: AGITATE and the AGITATE_AGAIN unit parameter',
      objective: 'Add three Dynamic Reference parameters, three operator messages and a Unit Parameter Definition, then change the AGITATE logic so the operator can add more color from any color tank (Course 7016 pp 12-9 to 12-17).',
      note: 'Explorer > Library > Phase Classes > BlenderClasses > right-click AGITATE > New ▸ Phase algorithm parameter: choose the type "Dynamic Reference" (DYN_CLR_VLV_SP, DYN_CLR_VLV_PV, DYN_CLR_VLV_MODE) and add INIT_LEVEL (Real) for the blender level. New ▸ Phase Message: IDs 1, 2 and 3 (Boolean, integer and float prompts: REQUEST 3401, 3202 and 3303). Unit Classes > BLENDERS > right-click > New ▸ Unit Parameter Definition: AGITATE_AGAIN, Boolean, category Operating. A dynamic reference has the fields $REF (the path), ST, CST (0 = resolved) and AWST (0 = last write good): write the path with \'^/DYN_CLR_VLV_SP.$REF\' := SELSTR(\'^/PROMPT_INT.CV\', "//XV-102/CAS_SP", "//XV-202/CAS_SP", "//XV-302/CAS_SP", "", "");, wait for \'^/DYN_CLR_VLV_SP.CST\' = 0, then use \'^/DYN_CLR_VLV_SP.CV\' (and .TARGET on the MODE reference) like any other parameter. The unit parameter is written for the unit in use as \'//^/UNIT.CV/AGITATE_AGAIN\' := TRUE; (the UNIT phase parameter holds the unit module name). In RUN_LOGIC change RESET_EQUIP to set STEP_INDEX to 6, then use Add Sequence After to add: ADD_MORE_COLOR (REQUEST 3401; trunk transition YES2: REQUEST = 0 AND PROMPT_BOOL = TRUE), WHICH_COLOR (REQUEST 3202, AGITATE_AGAIN TRUE; REQ_RCVD1), ASSIGN_DYN_REF (REQUEST 4020 acquires COLOR_HEADER, then the three $REF assignments; REQ_AND_CST), HOW_MUCH (REQUEST 3303; REQ_RCVD2), OPEN_COLOR_VLVS (INIT_LEVEL := \'//#TANK_LEVEL#\', DYN_CLR_VLV_MODE.TARGET := CAS, DYN_CLR_VLV_SP.CV := open, BLNDR_COLOR Dribble; VLVS_CNFRMD_OPEN), NULL_WAIT_STEP (WU_LEVEL_MET: \'//#TANK_LEVEL#\' >= INIT_LEVEL + PROMPT_FLOAT), CLOSE_CLR_VLVS (close both valves, REQUEST 4220 releases the header, modes back to AUTO; COLOR_IN_CLOSED) and MODES_AUTO (STEP_INDEX := 0). Right-click ADD_MORE_COLOR > Add Alternate Branch Right for the NO leg (transition NO2: REQUEST = 0 AND PROMPT_BOOL = FALSE), add one step NO_AGITATE_AGAIN that sets AGITATE_AGAIN FALSE, and Connect To... MODES_AUTO from its transition TRUE1. Save.',
      steps: [
        { id: '7016-12a-1', text: 'Steps 1-3. Create the Dynamic Reference phase algorithm parameters DYN_CLR_VLV_SP, DYN_CLR_VLV_PV and DYN_CLR_VLV_MODE in AGITATE.', goto: 'explorer' },
        { id: '7016-12a-2', text: 'Steps 4-6. Create the phase messages "Add more color???", "Which color - Enter 1 for Color_100, 2 for Color_200, or 3 for Color_300" and "How much color do you want to add? (in gallons)".', goto: 'explorer' },
        { id: '7016-12a-3', text: 'Step 7. Add the Unit Parameter Definition AGITATE_AGAIN (Boolean) to the BLENDERS unit class.', goto: 'explorer' },
        { id: '7016-12a-4', text: 'Logic Steps 1-3. RESET_EQUIP sets STEP_INDEX to 6, then a Boolean prompt asks "Add more color???"; transitions YES2 and NO2 follow.', goto: 'explorer' },
        { id: '7016-12a-5', text: 'Logic Steps 2-3. YES: an integer prompt picks the tank and AGITATE_AGAIN is set TRUE for the unit in use (UNIT phase parameter). NO: AGITATE_AGAIN is set FALSE.', goto: 'explorer' },
        { id: '7016-12a-6', text: 'Logic Step 4. Acquire COLOR_HEADER and set the path ($REF) of the three dynamic references with SELSTR from the integer response.', goto: 'explorer' },
        { id: '7016-12a-7', text: 'Logic Step 5. Wait until REQUEST = 0 and the three dynamic references are resolved (CST = 0).', goto: 'explorer' },
        { id: '7016-12a-8', text: 'Logic Steps 6-11. Prompt for the amount (float), capture the blender level, open the valves (MODE.TARGET CAS, SP open, BLNDR_COLOR Dribble), wait for the open confirmation, a null wait step, then wait until the level is met.', goto: 'explorer' },
        { id: '7016-12a-9', text: 'Logic Steps 12-15. Close the valves, release COLOR_HEADER, return the modes to AUTO and set STEP_INDEX to 0; save the phase logic.', goto: 'explorer' }
      ]
    },
    {
      id: '7016-ch12-finish',
      title: 'OP_FINISH_500 loops back to AGITATE',
      objective: 'Add a transition after AGITATE that runs the AGITATE phase again when the unit parameter AGITATE_AGAIN is TRUE (Course 7016 p 12-18).',
      note: 'Recipe Studio > OP_FINISH_500: double-click the transition after AGITATE:1 and enter \'AGITATE:1/BSTATUS\' = \'$phase_state:Complete\' AND \'BLENDERS/AGITATE_AGAIN\' = 0 (the unit class parameter is typed UNITCLASS/PARAMETER; in the DeltaV expression editor change Object type from Local to Unit Classes). Add Branch Transition...: after AGITATE:1, connect to AGITATE:1, with the expression \'AGITATE:1/BSTATUS\' = \'$phase_state:Complete\' AND \'BLENDERS/AGITATE_AGAIN\' = 1. The branch is checked first. Save.',
      steps: [
        { id: '7016-12b-1', text: 'Add a transition after AGITATE that goes back to AGITATE when its BSTATUS is Complete and AGITATE_AGAIN = 1.', goto: 'recipestudio' },
        { id: '7016-12b-2', text: 'The transition to DRAIN waits for AGITATE to be complete and AGITATE_AGAIN = 0.', goto: 'recipestudio' }
      ]
    },
    {
      id: '7016-ch12-verify',
      title: 'Verify Dynamic Reference',
      objective: 'Download everything that was modified and test that color can be added from all three tanks (Course 7016 p 12-19).',
      note: 'Download both blender unit modules (right-click each unit > Download ▸ Unit with Contained Modules...), right-click PROPLUS > Download ▸ Workstation... so the Batch Executive knows the changed AGITATE, and Download Now the recipe on the Tools tab of OP_FINISH_500. Add a batch of OP_FINISH_500 (formula Small), start it and respond to the prompts from Unacknowledged Prompts: Add more color: Yes; Which color: 1, 2 or 3; How much: for example 20 (gallons, the amount is added to the blender level). AGITATE then runs again and asks again; answer No to finish.',
      steps: [
        { id: '7016-12v-1', text: 'Step 1. Download all items that were modified: the AGITATE unit phases on both blenders and OP_FINISH_500.', goto: 'explorer' },
        { id: '7016-12v-2', text: 'Step 2. Run OP_FINISH_500.', goto: 'boi' },
        { id: '7016-12v-3', text: 'Step 3. Add additional color; test that color can be added from all three color tanks.', goto: 'boi' },
        { id: '7016-12v-4', text: 'Step 4. Verify that AGITATE runs again when more color is added.', goto: 'boi' },
        { id: '7016-12v-5', text: 'Step 5. Verify that AGITATE does not run again when no additional color is added.', goto: 'boi' }
      ]
    }
  ]
}
