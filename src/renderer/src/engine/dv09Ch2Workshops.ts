import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 2, The Simulated Process, pages 2-1 .. 2-34.

export const DV09_CHAPTER2: WModule = {
  module: 'DV-09 · Ch 2 The Simulated Process',
  workshops: [
    {
      id: 'dv09-ch2-reading',
      title: 'The Simulated Process (reading), pp 2-3 to 2-22 and 2-23 to 2-30',
      objective: 'Define the process to be controlled, the plant areas, Device Signal Tags and downloads (objectives, p2-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The control modules of PLANT_AREA_A and PLANT_AREA_B are created in the following chapters.',
      steps: [
        { id: 'dv09-2r-1', text: 'PLANT_AREA_A (pp 2-4, 2-5): Tank101 with LI-101 and LEVEL-101, the inlet valve XV-101 with its status module XVSTAT-101, pump MTR-102, flow loop FIC-102 to Tank201, the SFC-T101 sequence for startup and shutdown, and the operator display Tank101.' },
        { id: 'dv09-2r-2', text: 'PLANT_AREA_B (pp 2-6, 2-7): Tank201 with level loop LIC-20X, flow loop FIC-20X, pump MTR-203, the level simulation LEV2-SIM, the phase logic module PLM-SHUTDOWN and the operator display Tank201.' },
        { id: 'dv09-2r-3', text: 'Plant areas (p2-8): an area contains control modules, defines user privilege boundaries and defines workstation alarm boundaries. Control Strategies lists them in DeltaV Explorer.', goto: 'explorer' },
        { id: 'dv09-2r-4', text: 'Equipment hierarchy (pp 2-10 to 2-12): Area > Process Cell > Unit Module > Equipment Module > Control Module. DeltaV Batch needs a full hierarchy of area, cell and unit.', goto: 'explorer' },
        { id: 'dv09-2r-5', text: 'Device Signal Tags (pp 2-14, 2-15): a named item that attaches an I/O channel to a control module, normally named like the instrument (for example FT-2); it defines I/O properties such as analog input versus HART or DO Latching, Momentary or Continuous Pulse.' },
        { id: 'dv09-2r-6', text: 'Downloads (pp 2-22 to 2-27): a total/full download sends the whole configuration of a node, a partial download only a module or card. Triangles: a question mark means unknown (Update Download Status), blue means the node differs from the database, yellow means no configuration. Options: Update Download Status, Download Subsets (setup data), Controller Cold Restart Memory and Re-send Last Known Good Download (never after re-commissioning).' }
      ]
    },
    {
      id: 'dv09-ch2-areas',
      title: 'Workshop – Defining Plant Areas (pp 2-87, 2-88)',
      objective: 'Rename AREA_A as PLANT_AREA_A and add PLANT_AREA_B.',
      note: 'DeltaV Explorer > Control Strategies: right-click AREA_A > Rename (the name is highlighted in the Contents window; type the new name and press Enter). Then right-click Control Strategies > New Area (AREA1 appears highlighted: type PLANT_AREA_B and press Enter).',
      steps: [
        { id: 'dv09-2a-1', text: 'Step 1. Rename AREA_A as PLANT_AREA_A (Control Strategies > AREA_A > Rename).', goto: 'explorer' },
        { id: 'dv09-2a-2', text: 'Step 2. Add PLANT_AREA_B (Control Strategies > New Area).', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch2-dsts',
      title: 'Workshop – Configuring DSTs (p 2-91)',
      objective: 'Configure channels 1 and 2 on cards 1 through 4 with the Device Signal Tags of the course table.',
      note: 'The controller must be commissioned and its I/O auto-sensed first (Chapter 1): the cards C01 to C04 then appear under the controller in DeltaV Explorer. CTLR > I/O > card (C01) > channel (CH01) > Properties: enter the Description, the Channel type (it follows the card) and the Device Tag, and check Enable to activate the channel. Table: C01 (analog input) CH01 LT-1, CH02 FT-2; C02 (analog output) CH01 LY-1, CH02 FY-2; C03 (discrete input) CH01 LSO-1, CH02 XI-2; C04 (discrete output) CH01 XV-1, CH02 ZX-2. The Physical Network display (Diagnostics) shows the same channels.',
      steps: [
        { id: 'dv09-2b-1', text: 'Card 1 (C01, analog input): CH01 = LT-1, CH02 = FT-2, both enabled.', goto: 'explorer' },
        { id: 'dv09-2b-2', text: 'Card 2 (C02, analog output): CH01 = LY-1, CH02 = FY-2, both enabled.', goto: 'explorer' },
        { id: 'dv09-2b-3', text: 'Card 3 (C03, discrete input): CH01 = LSO-1, CH02 = XI-2, both enabled.', goto: 'explorer' },
        { id: 'dv09-2b-4', text: 'Card 4 (C04, discrete output): CH01 = XV-1, CH02 = ZX-2, both enabled.', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch2-download',
      title: 'Workshop – Downloading the Controller (pp 2-99 to 2-103)',
      objective: 'Download the controller from DeltaV Explorer and see the blue triangle removed.',
      note: 'Right-click the controller > Download > Controller. Answer the options: leave Verify the configuration checked (it looks for unresolved references and other problems), OK, Continue, and click Yes at the cautionary note. The Downloading Selected Objects list shows a check mark beside each finished item (stippled items are not needed for this download). Click Close when the download is complete: the blue triangle beside the controller, I/O and the other containers is removed.',
      steps: [
        { id: 'dv09-2d-1', text: 'CTLR > Download > Controller: verify the configuration, continue and answer Yes at the cautionary note.', goto: 'explorer' },
        { id: 'dv09-2d-2', text: 'The blue triangles are removed after the download is complete.', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch2-check',
      title: 'Workshop – Checking the System (p 2-104)',
      objective: 'Launch Diagnostics and check out the system.',
      note: 'In DeltaV Explorer choose Applications > Diagnostics (or use Utilities > Physical Network, or the Physical Network ribbon button). The controller panel shows its state (commissioned, indicators, scan time and CPU load) and its I/O cards. Launch it after the download.',
      steps: [
        { id: 'dv09-2e-1', text: 'Launch Diagnostics from DeltaV Explorer and check out your system.', goto: 'hardware' }
      ]
    }
  ]
}
