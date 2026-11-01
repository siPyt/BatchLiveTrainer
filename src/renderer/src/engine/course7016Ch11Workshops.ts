import type { WModule } from './workshops'

export const CHAPTER11: WModule = {
  module: '7016 · Ch 11 Unit Procedures & Procedures',
  workshops: [
    {
      id: '7016-ch11-operations',
      title: 'Operations Recipe (OP_CHARGE_500, OP_COLOR_100)',
      objective: 'Create the unit based operations OP_CHARGE_500 and OP_COLOR_100 in Recipe Studio (Course 7016 p 11-7).',
      note: 'Explorer > System Configuration > Recipes > Operations > New ▸ Operation...; open each in Recipe Studio, add its steps in order (Add Step), set Default_Transition Conditions on each transition, set the equipment to the Unit (Equipment...) and Save. For the link groups later, open the CHG_COLOR:1 step of OP_CHARGE_500 and the DUMP:1 step of OP_COLOR_100 (Step Properties...) and set Number of phase partners to 1.',
      steps: [
        { id: '7016-11a-1', text: 'Step 1. OP_CHARGE_500 (UM_BL_500): 1) CHG_BASE 2) CHG_COLOR. Save it.', goto: 'recipestudio' },
        { id: '7016-11a-2', text: 'Step 1. OP_COLOR_100 (UM_COLOR_100): 1) FILL 2) DUMP. Save it.', goto: 'recipestudio' }
      ]
    },
    {
      id: '7016-ch11-unitprocs',
      title: 'Unit Procedures (UP_BL_500, UP_COLOR_100)',
      objective: 'Create the unit procedures that run the operations on one unit each (Course 7016 pp 11-9, 11-10).',
      note: 'Right-click Unit Procedures > New ▸ Unit Procedure... UP_BL_500: Add Step OP_CHARGE_500 (named OP_CHARGE_500:1) then OP_FINISH_500 (OP_FINISH_500:1); transitions OP_CHG_COMPLETE (OP_CHARGE_500:1/BSTATUS = $recipe_state:Complete) and OP_FIN_COMPLETE; equipment Unit UM_BL_500; Save. UP_COLOR_100: Add Step OP_COLOR_100, transition OP_CLR_100_COMP, equipment Unit UM_COLOR_100; Save.',
      steps: [
        { id: '7016-11u-1', text: 'Steps 1-2. UP_BL_500 runs OP_CHARGE_500:1 and then OP_FINISH_500:1 on UM_BL_500; save it.', goto: 'recipestudio' },
        { id: '7016-11u-2', text: 'Steps 1-2. UP_COLOR_100 runs OP_COLOR_100:1 on UM_COLOR_100; save it.', goto: 'recipestudio' }
      ]
    },
    {
      id: '7016-ch11-paint',
      title: 'PRC_PAINT Link Group Recipe',
      objective: 'Create the procedure PRC_PAINT with both unit procedures running at once, a link group that synchronizes DUMP with CHG_COLOR, and run it from the BOI (Course 7016 pp 11-11 to 11-19).',
      note: 'Right-click Procedures > New ▸ Procedure... PRC_PAINT. Add Step UP_COLOR_100, select it and use Add Simultaneous Step for UP_BL_500; the transition ALL_UP_DONE waits for both (Default_Transition Conditions). Step Properties... of a unit procedure shows Acquire unit / Retain unit / Key Parameter (slide 11-12/11-13). Link Groups... > Add LINK_COLOR > choose UP_COLOR_100:1/OP_COLOR_100:1/DUMP:1 and UP_BL_500:1/OP_CHARGE_500:1/CHG_COLOR:1 (Add Phase). Save. Both phases need one phase partner (Step 4; set in OP_COLOR_100 and OP_CHARGE_500). Properties > Tools: Assign Now, Verify Now and Download Now (the contained recipes are downloaded and system assigned). In the BOI Add Batch PRC_PAINT, Start and watch both units in the PFC, the Process picture and BatchHelp.',
      steps: [
        { id: '7016-11p-1', text: 'Step 1. Add the procedure PRC_PAINT with UP_COLOR_100:1 and UP_BL_500:1 starting together (ALL_UP_DONE waits for both).', goto: 'recipestudio' },
        { id: '7016-11p-2', text: 'Step 2. Add the link group LINK_COLOR with the DUMP and CHG_COLOR phases and save the procedure.', goto: 'recipestudio' },
        { id: '7016-11p-3', text: 'Step 4. Define each phase of the link group for one phase partner.', goto: 'recipestudio' },
        { id: '7016-11p-4', text: 'Steps 5-7. Download the phases, assign PRC_PAINT to the Batch Executive and download it.', goto: 'explorer' },
        { id: '7016-11p-5', text: 'Verify Functionality. Add a batch of PRC_PAINT, start it and verify that all phases execute completely and in the correct order (BatchHelp shows the phase-to-phase communication).', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch11-formulas',
      title: 'PRC_PAINT Recipe Formulas',
      objective: 'Defer the batch input parameters up through the operations, unit procedures and procedure, create formulas and run each (Course 7016 pp 11-20 to 11-22).',
      note: 'In Recipe Studio select a step and double-click its parameter to Defer to recipe. Operations defer phase parameters (R_FILL_LEVEL; R_BASE_AMNT, R_BASE_RATE, R_CLR_AMNT); unit procedures defer the operation parameters (UP_BL_500 also R_BLEND_TIME and R_DRAIN_LEVEL of OP_FINISH_500); PRC_PAINT defers the unit procedure parameters. Add formulas (for example Sky Blue, Baby Blue, Navy Blue) with Use default value cleared. Save every changed recipe, download PRC_PAINT again, add a batch for each formula in the BOI.',
      steps: [
        { id: '7016-11f-1', text: 'Steps 1-2. Defer the phase parameters to OP_COLOR_100 (R_FILL_LEVEL) and OP_CHARGE_500 (R_BASE_AMNT, R_BASE_RATE, R_CLR_AMNT).', goto: 'recipestudio' },
        { id: '7016-11f-2', text: 'Steps 3-4. Defer the operation parameters to UP_BL_500 (including R_BLEND_TIME and R_DRAIN_LEVEL) and UP_COLOR_100.', goto: 'recipestudio' },
        { id: '7016-11f-3', text: 'Steps 5-6. Defer the six unit procedure parameters to PRC_PAINT and add formulas such as Sky Blue, Baby Blue and Navy Blue.', goto: 'recipestudio' },
        { id: '7016-11f-4', text: 'Steps 7-8. Save all changed recipes, download the Batch Executive and verify each formula from the BOI.', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch11-classbased',
      title: 'PRC_PAINT Class-based Recipe',
      objective: 'Rename the recipes, make them Unit Class based and run PRC_PAINT with units bound at creation and when prompted (Course 7016 pp 11-23 to 11-27).',
      note: 'Explorer: right-click each recipe > Rename: UP_BL_500 to UP_BLEND, UP_COLOR_100 to UP_COLOR, OP_CHARGE_500 to OP_CHARGE, OP_FINISH_500 to OP_FINISH, OP_COLOR_100 to OP_COLOR (the steps and link groups that use them are renamed too). Properties > Equipment: choose Unit Class and BLENDERS for UP_BLEND, OP_CHARGE and OP_FINISH, COLORTANKS for UP_COLOR and OP_COLOR. Download PRC_PAINT again. BOI > Add Batch PRC_PAINT: the Unit Binding area lists BLENDERS and COLORTANKS; choose units, or {Defer} and answer the Bind prompts in the Unacknowledged Prompts list.',
      steps: [
        { id: '7016-11c-1', text: 'Step 1. Rename UP_BL_500, UP_COLOR_100, OP_CHARGE_500, OP_FINISH_500 and OP_COLOR_100 to UP_BLEND, UP_COLOR, OP_CHARGE, OP_FINISH and OP_COLOR.', goto: 'explorer' },
        { id: '7016-11c-2', text: 'Step 2. Change each renamed recipe to Unit Class (BLENDERS or COLORTANKS) on its Properties > Equipment tab.', goto: 'explorer' },
        { id: '7016-11c-3', text: 'Steps 3-4. Download the Batch Executive and add a batch of PRC_PAINT, selecting a formula, blender unit and color unit when creating the batch.', goto: 'boi' },
        { id: '7016-11c-4', text: 'Step 5. Add a batch of PRC_PAINT, defer binding the units when creating it, and bind them when prompted.', goto: 'boi' }
      ]
    },
    {
      id: '7016-ch11-mix',
      title: 'Procedure with Unit Aliasing (PRC_MIX_COLORS)',
      objective: 'Build PRC_MIX_COLORS with a #BLENDER# unit alias, link groups and the GREEN, ORANGE and PURPLE formulas, then run it (Course 7016 pp 11-28 to 11-49).',
      note: 'Create operations OP_CHG_COLOR and OP_CHG_BASE (BLENDERS) and OP_COLOR_100/200/300 (their tank units); unit procedures UP_CHG_COLOR, UP_CHG_BASE, UP_FINISH (BLENDERS) and UP_COLOR_100/200/300. PRC_MIX_COLORS: Unit Aliases... add BLENDER (unit class BLENDERS, Defer). Steps: UP_CHG_BASE:1, then UP_COLOR_100:1 with UP_CHG_COLOR:1, UP_COLOR_200:1 with UP_CHG_COLOR:2, UP_COLOR_300:1 with UP_CHG_COLOR:3, then UP_FINISH:1 (Add Simultaneous Step for the pairs). Step Properties...: Unit alias BLENDER on UP_CHG_BASE:1, UP_CHG_COLOR:1-3 and UP_FINISH:1 and Retain unit where needed. Transitions: UP_CHG_BASE_DONE, 100_ALL_DONE, 200_ALL_DONE, 300_ALL_DONE and a last one. Link Groups: COLOR_100 (UP_CHG_COLOR:1/OP_CHG_COLOR:1/CHG_COLOR:1 and UP_COLOR_100:1/OP_COLOR_100:1/DUMP:1), COLOR_200, COLOR_300. Defer the parameters as on slides 11-42 to 11-44 and create the formulas of slide 11-45. Assign and download, then in the BOI bind #BLENDER# to UM_BL_600, or defer it and bind it when prompted.',
      steps: [
        { id: '7016-11m-1', text: 'Step 1. Create the operations OP_CHG_COLOR and OP_CHG_BASE (BLENDERS) and OP_COLOR_100, OP_COLOR_200, OP_COLOR_300; save each.', goto: 'recipestudio' },
        { id: '7016-11m-2', text: 'Steps 3-4. Create the unit procedures UP_CHG_COLOR, UP_CHG_BASE, UP_FINISH, UP_COLOR_100, UP_COLOR_200 and UP_COLOR_300; save each.', goto: 'recipestudio' },
        { id: '7016-11m-3', text: 'Steps 5-8. Add the procedure PRC_MIX_COLORS with the unit alias BLENDER and the steps and transitions of slides 11-39 and 11-40.', goto: 'recipestudio' },
        { id: '7016-11m-4', text: 'Steps 9-12. Add the link groups COLOR_100, COLOR_200 and COLOR_300 and save the procedure.', goto: 'recipestudio' },
        { id: '7016-11m-5', text: 'Formulas. Defer the parameters up the hierarchy and create the formulas GREEN, ORANGE and PURPLE (slide 11-45).', goto: 'recipestudio' },
        { id: '7016-11m-6', text: 'Steps 3-4 and BOI Steps 1-4. Assign and download PRC_MIX_COLORS; add a batch, bind #BLENDER# to UM_BL_600 and verify it from the Process picture.', goto: 'boi' },
        { id: '7016-11m-7', text: 'BOI Steps 5-10. Add another batch, defer the #BLENDER# binding, start it and bind #BLENDER# when prompted.', goto: 'boi' }
      ]
    }
  ]
}
