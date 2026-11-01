import type { WModule } from './workshops'

export const CHAPTER8: WModule = {
  module: '7016 · Ch 8 DUMP & CHARGE COLOR',
  workshops: [
    {
      id: '7016-ch8-header',
      title: 'COLOR_HEADER Resource (equipment arbitration)',
      objective: 'Make the two blender color inlets and a new COLOR_HEADER module arbitration resources, so only one CHG_COLOR phase can use the color header at a time (Course 7016 pp 8-5, 8-6 and 8-11).',
      note: 'Equipment modules BL_500_COLOR_IN and BL_600_COLOR_IN are under their unit modules in Explorer: right-click one > Properties > Arbitration tab (check Participate in equipment arbitration; keep the default Equipment ID and Maximum owners 1). The settings reach the controller only when the module is downloaded: right-click CTLR1 > Download ▸ Controller, or download the unit module and its contained modules. COLOR_HEADER is created with right-click PAINT_PRODUCTION > New ▸ Control Module...; open its Properties > Arbitration tab, check Participate, set Equipment ID 20 and use Add... to put both color inlets in Equipment needed (only modules that already participate can be added). Then right-click COLOR_HEADER > Assign ▸ CTLR1 and Download ▸ Control Module.... The REQUEST code 4020 used later is 40 followed by this Equipment ID (4220 releases it).',
      steps: [
        { id: '7016-8h-1', text: 'Steps 1-3. Modify the properties of BL_500_COLOR_IN and BL_600_COLOR_IN: on the Arbitration tab check Participate in equipment arbitration and keep the default Equipment ID (Maximum owners = 1).', goto: 'explorer' },
        { id: '7016-8h-2', text: 'Step 4. Download both BL_500_COLOR_IN and BL_600_COLOR_IN (controller download, or unit module download with contained modules).', goto: 'explorer' },
        { id: '7016-8h-3', text: 'Step 5. Create a new module in PAINT_PRODUCTION called COLOR_HEADER (right-click the process cell > New ▸ Control Module...).', goto: 'explorer' },
        { id: '7016-8h-4', text: 'Step 6. In COLOR_HEADER Properties > Arbitration: check Participate, Equipment ID 20, and add BL_500_COLOR_IN and BL_600_COLOR_IN to the Equipment needed list.', goto: 'explorer' },
        { id: '7016-8h-5', text: 'Step 7. Assign COLOR_HEADER to your controller and download it.', goto: 'explorer' }
      ]
    },
    {
      id: '7016-ch8-phases',
      title: 'DUMP / CHG_COLOR Phases',
      objective: 'Create the DUMP and CHG_COLOR phase classes, build their RUN_LOGIC with the REQUEST handshakes, add them to the unit classes, and download them (Course 7016 pp 8-12 to 8-18).',
      note: 'Every action below is a Pulse (P) assignment. REQUEST is a phase parameter, written as \'^/REQUEST.CV\' := 5501;  and waited on with the transition condition \'^/REQUEST.CV\' = 0. Codes: 40nn acquire resource nn, 42nn release it, 52nn send message nn, 55nn wait for message nn. Equipment uses the unit aliases: \'//#OUTLET_VLV#/CAS_SP.CV\' := \'vlvnc-sp:OPEN\';  \'//#OUTLET_VLV#/PV.CV\' = \'vlvnc-pv:OPEN\';  \'//#BLNDR_COLOR#/A_COMMAND.CV\' := \'EM-vlvnc-2stage:Bulk\';  and \'//#BLNDR_COLOR#/A_PV.CV\' = \'EM-vlvnc-2stage:Close\' (the equipment module states are Close, Dribble, Bulk and Auto Mode). INIT_LEVEL is a Phase algorithm parameter (New ▸ Phase algorithm parameter): Real, so \'^/INIT_LEVEL.CV\' := \'//#TANK_LEVEL#\'; records the starting level. Use Insert > Sequence for the steps, double-click a step to name it and add its actions (Add...), and double-click a transition for its name and condition. In CHG_COLOR, right-click CAPT_INIT_LVL > Add Alternate Branch Right for the small-charge leg, then right-click that transition > Connect To... SLOW_CHARGE; the trunk is the R_CLR_AMNT_BIG leg through RECEIVE_CHARGE. In DUMP the last action of CLOSE_OUTLET sets MODE.TARGET to AUTO as a Pulse whose delay Expression is the valve PV = CLOSED.',
      steps: [
        { id: '7016-8p-1', text: 'Step 1. Create a new phase class DUMP in the category TankClasses (right-click TankClasses > New Phase Class).', goto: 'explorer' },
        { id: '7016-8p-2', text: 'Step 2. Create CHG_COLOR in the category BlenderClasses and add the batch parameter R_CLR_AMNT: Real, Input, category Operating, low 0, default 70, high 500, gal.', goto: 'explorer' },
        { id: '7016-8p-3', text: 'Step 3. Add the batch report parameter RPT_AMNT_CHARGED to CHG_COLOR: Real, Report, category Report, gal.', goto: 'explorer' },
        { id: '7016-8p-4', text: 'Step 4 (DUMP, slides 8-14 to 8-17). INIT: OUTLET_VLV MODE to CAS; REQUEST_DUMP: REQUEST := 5501 (wait REQUEST = 0, WU_REQ_RECVD); OPEN_OUTLET: CAS_SP OPEN (wait PV = OPEN, WU_VLV_OPEN); SEND_CONFIRM: REQUEST := 5202 (WU_REQ_RECVD2); REQ_CLOSE_VLV: REQUEST := 5503 (WU_REQ_RECVD3); CLOSE_OUTLET: CAS_SP CLOSE, then MODE AUTO after a delay that verifies the valve is closed; wait MODE = AUTO (COMPLETE).', goto: 'studio' },
        { id: '7016-8p-5', text: 'Step 4 (CHG_COLOR). ACQ_HEADER: REQUEST := 4020 (WU_HDR_ACQD); REQUEST_CHARGE: 5201 (WU_REQ_RECVD); REQ_CONFIRM: 5502 (WU_REQ_RECVD2); CAPT_INIT_LVL: INIT_LEVEL := TANK_LEVEL, then R_CLR_AMNT > 30 (R_CLR_AMNT_BIG) to RECEIVE_CHARGE: A_COMMAND Bulk, wait TANK_LEVEL >= INIT_LEVEL + R_CLR_AMNT - 30 (BULK_CHG_CMPT), or R_CLR_AMNT <= 30 (R_CLR_AMNT_SMALL) straight to SLOW_CHARGE: Dribble, wait TANK_LEVEL >= INIT_LEVEL + R_CLR_AMNT (WU_CHG_COMPLETE); REQ_CLOSE_VLV: 5203 (WU_REQ_RECVD3); CLOSE_CLR_VLV: A_COMMAND Close, wait A_PV = Close (WU_VLV_CLOSED); RELEASE_HEADER: A_COMMAND Auto Mode, REQUEST := 4220, RPT_AMNT_CHARGED := TANK_LEVEL - INIT_LEVEL; wait REQUEST = 0 (COMPLETE).', goto: 'studio' },
        { id: '7016-8p-6', text: 'Step 5. Save the changes for both DUMP and CHG_COLOR (Ctrl+S in Control Studio).', goto: 'studio' },
        { id: '7016-8p-7', text: 'Steps 6-7. Add CHG_COLOR to the unit class BLENDERS and DUMP to the unit class COLORTANKS (right-click the phase class > Add To Unit Class..., or drag it onto the unit class).', goto: 'explorer' },
        { id: '7016-8p-8', text: 'Steps 8-9. Set the CHG_COLOR unit phase type to Controller on UM_BL_500 and UM_BL_600 and download both unit modules.', goto: 'explorer' },
        { id: '7016-8p-9', text: 'Steps 10-11. Set the DUMP unit phase type to Controller on UM_COLOR_100, UM_COLOR_200 and UM_COLOR_300 and download the three unit modules.', goto: 'explorer' }
      ]
    },
    {
      id: '7016-ch8-verify',
      title: 'Verify DUMP and CHG_COLOR (act as the Batch Executive)',
      objective: 'Run DUMP on a color tank together with CHG_COLOR on a blender, answering each phase REQUEST yourself like the Batch Executive (Course 7016 p 8-19).',
      note: 'From the Process picture open a color tank unit (for example UM_COLOR_100) and a blender (UM_BL_500) and Load a Phase: DUMP and CHG_COLOR. Set R_CLR_AMNT on CHG_COLOR before Start; the color tank must hold at least that much (the tanks start with 40, 30 and 50 gal - fill one first with FILL, or use an amount of 40 gal or less; amounts of 30 gal or less take the short branch). Start both from the phase command selector (the phase owner must be External). Each phase faceplate shows a Request value and what it means; the Clear button answers it. The header request (4020) is arbitrated when you clear it: CHG_COLOR acquires COLOR_HEADER if its Equipment ID is downloaded and the color inlets are free; a second CHG_COLOR cannot clear its 4020 (it is told who owns the header) until the first releases it at 4220. The three message pairs are 5201/5501, 5202/5502 and 5203/5503: clear one phase\'s request, then the other\'s, only after both have posted their half - do not clear DUMP\'s 5503 before the blender has charged. RESET and UNLOAD each phase when it is Complete.',
      steps: [
        { id: '7016-8v-1', text: 'Step 1. Start a DUMP and a CHG_COLOR unit phase from their unit module faceplates.', goto: 'process' },
        { id: '7016-8v-2', text: 'Step 2. Verify that DUMP waits with 5501 in its REQUEST parameter and CHG_COLOR waits to acquire COLOR_HEADER with 4020.', goto: 'process' },
        { id: '7016-8v-3', text: 'Step 3. Clear the REQUEST for CHG_COLOR and verify it acquires the header and then sends 5201 to synchronize with DUMP.', goto: 'process' },
        { id: '7016-8v-4', text: 'Step 4. Step through the rest of the sequence by clearing the REQUEST parameters as each phase posts its coordinating message (three synchronization points).', goto: 'process' },
        { id: '7016-8v-5', text: 'Step 5. Verify DUMP on all three color tanks and CHG_COLOR on both blenders (RESET and UNLOAD the phases when they are Complete).', goto: 'process' }
      ]
    }
  ]
}
