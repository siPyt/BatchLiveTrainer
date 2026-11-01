import type { WModule } from './workshops'

export const CHAPTER9: WModule = {
  module: '7016 · Ch 9 CHARGE BASE',
  workshops: [
    {
      id: '7016-ch9-header',
      title: 'BASE_HEADER Resource (equipment arbitration)',
      objective: 'Make the two base block valves and a new BASE_HEADER module arbitration resources, so only one CHG_BASE phase can use BASE 400 at a time (Course 7016 p 9-4).',
      note: 'The valves are XV-501 and XV-601, the BASE_IN_VLV modules under UM_BL_500 and UM_BL_600 in Explorer: right-click one > Properties > Arbitration tab (check Participate in equipment arbitration; keep the default Equipment ID and Maximum owners 1). Download them (right-click CTLR1 > Download ▸ Controller). Create BASE_HEADER with right-click PAINT_PRODUCTION > New ▸ Control Module...; open its Properties > Arbitration tab, check Participate, set Equipment ID 30 and use Add... to put XV-501 and XV-601 in Equipment needed. Then right-click BASE_HEADER > Assign ▸ CTLR1 and Download ▸ Control Module.... The REQUEST code to acquire BASE_HEADER is 4030 and 4230 releases it.',
      steps: [
        { id: '7016-9h-1', text: 'Steps 1-3. Modify the properties of XV-501 and XV-601: on the Arbitration tab check Participate in equipment arbitration and keep the default Equipment ID (Maximum owners = 1).', goto: 'explorer' },
        { id: '7016-9h-2', text: 'Step 4. Download both XV-501 and XV-601.', goto: 'explorer' },
        { id: '7016-9h-3', text: 'Step 5. Create a new module in PAINT_PRODUCTION called BASE_HEADER (right-click the process cell > New ▸ Control Module...).', goto: 'explorer' },
        { id: '7016-9h-4', text: 'Step 6. In BASE_HEADER Properties > Arbitration: check Participate, Equipment ID 30, and add XV-501 and XV-601 to the Equipment needed list.', goto: 'explorer' },
        { id: '7016-9h-5', text: 'Step 7. Assign BASE_HEADER to your controller and download it.', goto: 'explorer' }
      ]
    },
    {
      id: '7016-ch9-shared',
      title: 'Shared Control Module Class (HEADER)',
      objective: 'Create the Control Module Class HEADER, add it to BLENDERS as a Shared module block, and bind the block to BASE_HEADER on both blenders (Course 7016 pp 9-5 to 9-8).',
      note: 'Library > Control Module Class Categories: right-click the category General > New Control Module Class..., name it HEADER (Function Block Diagram; the class is empty). In Explorer right-click the unit class BLENDERS and choose Add Module Class...: Class name HEADER (Browse lists it), Ownership type Shared, Allow variant module to be substituted on module instances checked. The block is created as HEADER_1; rename it BASE_HDR (F2 or right-click > Rename). Under UM_BL_500 the row <unbound> (BASE_HDR) appears: right-click > Properties..., type BASE_HEADER as the Bound module name (or Browse...), OK. Repeat for UM_BL_600. Variant substitution is what lets BASE_HEADER, which was not created from HEADER, be bound.',
      steps: [
        { id: '7016-9s-1', text: 'Step 1. Right-click the category General and choose New Control Module Class...; name it HEADER.', goto: 'explorer' },
        { id: '7016-9s-2', text: 'Step 2. Select the unit class BLENDERS and add the Control Module Class HEADER with Ownership Shared and Allow variant module to be substituted on module instances checked.', goto: 'explorer' },
        { id: '7016-9s-3', text: 'Step 3. Rename HEADER_1 to BASE_HDR.', goto: 'explorer' },
        { id: '7016-9s-4', text: 'Steps 4-6. Right-click the <unbound> BASE_HDR under UM_BL_500 > Properties, bind it to the control module BASE_HEADER, and repeat for UM_BL_600.', goto: 'explorer' }
      ]
    },
    {
      id: '7016-ch9-chg-base',
      title: 'CHG_BASE Phase',
      objective: 'Import the CHG_BASE phase class, add its failure messages, add it to the BLENDERS unit class, download it and verify it on both blenders (Course 7016 pp 9-9 and 9-10).',
      note: 'Import: Explorer > Library > Advanced Definitions, right-click Phase Classes (or BlenderClasses) > Import Phase Class..., choose CHG_BASE.fhx. The new failures are numbered 12-15 on slide 9-9 (MTR_403 stopped, FIC_404 closed, BASE_IN_VLV closed, OUT_PUMP running); the other conditions are already messages 5, 6, 8 and 9. Add them in Explorer > System Configuration > Setup > Named Sets > phase_failures (double-click, Add...), then Changed Setup Data > Download Changed Setup Data... to the workstation AND the controller. After Add To Unit Class, set the CHG_BASE unit phase type on both blenders to Controller (the imported unit phase starts Disabled) and download both unit modules. To verify, load CHG_BASE on a blender from its unit faceplate, set R_BASE_AMNT (and R_BASE_RATE), start it from the phase command selector (owner External) and answer the REQUEST like the Batch Executive: 4030 acquires BASE_HEADER (the faceplate Clear request button), 4230 releases it. CHG_BASE reads FIC-404 and MTR-403 directly. BLENDER 500 starts at 250 gal, BLENDER 600 at 120 gal and BASE 400 holds 1500 gal. Starting both blenders shows the shared header: the second 4030 cannot be cleared until the first phase has released BASE_HEADER.',
      steps: [
        { id: '7016-9p-1', text: 'Step 1. Import the phase class CHG_BASE (category BlenderClasses; R_BASE_AMNT 0-1000 gal, R_BASE_RATE 0-100 gpm, RPT_FEED_AMNT gal).', goto: 'explorer' },
        { id: '7016-9p-2', text: 'Step 2. Add the new failure conditions to the phase_failures named set (12 = MTR_403 stopped, 13 = FIC_404 closed, 14 = BASE_IN_VLV closed, 15 = OUT_PUMP running) and download Changed Setup Data to the workstation and the controller.', goto: 'explorer' },
        { id: '7016-9p-3', text: 'Step 3. Add CHG_BASE to the Blenders unit class.', goto: 'explorer' },
        { id: '7016-9p-4', text: 'Step 4. Verify that CHG_BASE was added to the unit modules for the Blenders.', goto: 'explorer' },
        { id: '7016-9p-5', text: 'Step 5. Assign properties to the CHG_BASE unit phase (phase type Controller) on both Blender unit modules and download.', goto: 'explorer' },
        { id: '7016-9v-1', text: 'Step 6. Verify CHG_BASE operates correctly on both BLENDER_500 and BLENDER_600. Hint: remember to acquire (4030) and release (4230) the BASE_HEADER.', goto: 'process' }
      ]
    }
  ]
}
