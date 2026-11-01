import type { WModule } from './workshops'

export const CHAPTER7: WModule = {
  module: '7016 · Ch 7 DRAIN Unit Phase',
  workshops: [
    {
      id: '7016-ch7-drain',
      title: 'DRAIN Phase',
      objective: 'Import the DRAIN phase class, add it to the BLENDERS unit class, download both unit phases and verify DRAIN on BLENDER_500 and BLENDER_600 (Course 7016 pp 7-4 and 7-5).',
      note: 'Needs the Chapter 5 BLENDERS unit class and the Chapter 6 phase_failures messages 4-8. Import: in DeltaV Explorer expand Library > Advanced Definitions, right-click Phase Classes (or a phase class category) > Import Phase Class..., choose DRAIN.fhx; it is created in the BlenderClasses category. The new failures are numbered 9-11 on slide 7-4; BASE_IN_VLV open and COLOR_IN_VLV open are already messages 7 and 8 from AGITATE. Add the messages in Explorer > System Configuration > Setup > Named Sets > phase_failures (double-click, Add...), then select Named Sets and use Changed Setup Data > Download Changed Setup Data... for the workstation AND the controller. The new unit phase starts as Disabled: open its Properties and set the phase type to Controller before downloading the unit module. To see the drain, put liquid in the blender first (BLENDER 500 starts with 250 gal, BLENDER 600 with 120 gal) and set R_DRAIN_LEVEL below the current level: the default of 250 gal is already reached by BLENDER 500. The level settles a little below the target because the pump and valve take a few seconds to stop; RPT_AMNT_DRAINED is the amount actually drained.',
      steps: [
        { id: '7016-7-1', text: 'Step 1. Import the DRAIN phase class. Check its parameters: R_DRAIN_LEVEL real input 0-250-1000 gal and report RPT_AMNT_DRAINED gal. Open DRAIN in Control Studio to see the FAIL_MONITOR conditions: BASE_IN_VLV is OPEN, COLOR_IN_VLV is OPEN, AGITATOR is RUNNING, OUT_PUMP is STOPPED, PRODUCT_VLV is CLOSED.', goto: 'explorer' },
        { id: '7016-7-2', text: 'Step 2. Add the new failure conditions to the phase_failures named set (9 = agitator running, 10 = outlet pump stopped, 11 = product valve closed) and download Changed Setup Data to the workstation and the controller.', goto: 'explorer' },
        { id: '7016-7-3', text: 'Step 3. Add DRAIN to the BLENDERS unit class (right-click DRAIN > Add To Unit Class..., or right-click BLENDERS > Assign Phase Class...).', goto: 'explorer' },
        { id: '7016-7-4', text: 'Step 4. Verify that DRAIN was added to the unit modules UM_BL_500 and UM_BL_600 (select each unit module in the Explorer; DRAIN is listed as a Unit Phase).', goto: 'explorer' },
        { id: '7016-7-5', text: 'Step 5. Assign properties to the DRAIN unit phase on both blender unit modules (phase type Controller) and download the unit modules.', goto: 'explorer' },
        { id: '7016-7-6', text: 'Step 6. Verify DRAIN on BLENDER_500 and BLENDER_600: from the Process picture open each unit, load DRAIN, set R_DRAIN_LEVEL below the current level, Start, and watch the level fall, the pump stop and the phase Complete with RPT_AMNT_DRAINED.', goto: 'process' }
      ]
    },
    {
      id: '7016-ch7-failures',
      title: 'Optional - DRAIN failure conditions',
      objective: 'Trip each of the five DRAIN failure conditions and recover (not part of the printed workshop).',
      note: 'While DRAIN is draining (step 5), force a condition from the equipment faceplates: open XV-501 or the blender color valve XV-502, start AGIT-503, stop MTR-505 or close XV-503 (set the module to AUTO first). The phase goes Held with the matching message and the blender safe; Clear Failures, then Restart.',
      steps: [
        { id: '7016-7x-1', text: 'Trip each failure on UM_BL_500, read the message, Clear Failures and Restart. Repeat on UM_BL_600.', goto: 'process' }
      ]
    }
  ]
}
