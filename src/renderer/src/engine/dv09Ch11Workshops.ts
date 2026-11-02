import type { WModule } from './workshops'

// Course DV-09 chapter 11, FOUNDATION fieldbus Wiring & Installation, pages 11-1 .. 11-24: the segment design rules and the Logging On workshop.

export const DV09_CHAPTER11: WModule = {
  module: 'DV-09 \u00b7 Ch 11 FOUNDATION fieldbus Wiring & Installation',
  workshops: [
    {
      id: 'dv09-ch11-reading',
      title: 'FOUNDATION fieldbus Wiring & Installation (reading), pp 11-3 to 11-16 and 11-21 to 11-23',
      objective: 'Design a FOUNDATION fieldbus segment, designate terminator locations, specify cable type, grounding and shielding practices and access DeltaV Books Online (objectives, p11-3).',
      note: 'Reference material: these slides have no configuration steps. Tick each item when you have read it. The Fieldbus Segment panel on Diagnostics (Physical Network display) is the bench of Chapter 12, and the H1 panel has a training calculator for the cable length budget; neither certifies an installation. DeltaV Books Online and the segment design tools are separate Emerson products and are not part of the trainer.',
      steps: [
        { id: 'dv09-11r-1', text: 'From analog wiring to a fieldbus segment (pp 11-4, 11-5): the single pair of wires becomes a segment by replacing the control system\'s analog card with an H1 fieldbus interface, replacing the analog device with a fieldbus device, adding 24 VDC and a power supply (a power conditioner with a specific impedance profile) and adding terminators.', goto: 'hardware' },
        { id: 'dv09-11r-2', text: 'Terminators (pp 11-6 to 11-8): terminators (1 µF in series with 100 ohms) prevent distortion and signal loss; there are only two terminators per segment, at or near each end of the transmission line. After expanding a segment the terminator is moved to the last device only when the added cable is a long stretch (more than 100 m); the terminator belongs at the device with the longest spur.' },
        { id: 'dv09-11r-3', text: 'Cable length restrictions (p11-9): the total segment length is limited to 1900 meters and is the trunk plus all spurs (example: trunk 800 m, spurs 50 + 20 + 20 + 60 = total 950 m).', goto: 'hardware' },
        { id: 'dv09-11r-4', text: 'Mixing cable types (pp 11-10, 11-11): LX/MAXX + LY/MAXY must be less than 1, with maximum lengths A 1900 m, B 1200 m, C 400 m, D 200 m. 100 m of type D and 940 m of type B gives 1.28, not recommended; 100 m of type D and 940 m of type A gives 0.99, acceptable. The H1 panel has a cable budget calculator for this.', goto: 'hardware' },
        { id: 'dv09-11r-5', text: 'Power requirements (pp 11-12, 11-13): the DeltaV 24 VDC bulk supply is tested; third party supplies need an isolated DC return when the power conditioner has no isolation transformer, impedance matching with the power conditioner and acceptable noise. Two-wire fieldbus devices drawing power from the bus need 9-32 VDC; size the supply from the current of each device, its location, the supply location, the resistance of each cable section and the supply voltage.' },
        { id: 'dv09-11r-6', text: 'Grounding and shielding (p11-14): follow plant standards and local safety codes; do not ground either conductor of the fieldbus twisted pair; shielded cable is preferred; connect the shield to ground at one end only, connect each spur\'s shield to the trunk shield and ground the overall shield at one point.' },
        { id: 'dv09-11r-7', text: 'DeltaV Books Online (pp 11-15, 11-16): Start > DeltaV > Help > Books Online; the Fieldbus Installation Manual is in the Site Preparation and Hardware Installation book. Commonly used manuals: Intrinsically Safe, High Availability and Non-Incendive Fieldbus Applications, Appendix A Fieldbus Segment Checkout, Troubleshooting with DeltaV System, Troubleshooting Common Fieldbus Problems and Fieldbus Third Party Products. Books Online is not part of the trainer.' },
        { id: 'dv09-11r-8', text: 'Review (p11-21), answers: four items needed for a segment are an H1 interface, a fieldbus device, 24 VDC with a power supply (power conditioner) and terminators; a segment is the single wire pair turned into a fieldbus; only two terminators per segment; total segment length = trunk + all spurs; the maximum for cable type A is 1900 m; two cable types are acceptable when LX/MAXX + LY/MAXY < 1; the shield is grounded at one point only.' },
        { id: 'dv09-11r-9', text: 'Segment design tools (pp 11-22, 11-23): downloadable from the Emerson Process Management web site for new or existing installations; not part of the trainer. Summary (p11-24): you can design a FOUNDATION fieldbus segment, designate terminator locations, specify cable type, grounding and shielding practices and access DeltaV Books Online.' }
      ]
    },
    {
      id: 'dv09-ch11-logon',
      title: 'Workshop \u2013 Logging On (pp 11-17 to 11-20)',
      objective: 'Log on to the DeltaV workstation as Administrator (password deltav) so that you can monitor and control the process.',
      note: 'The Windows part of the workshop (power up the workstation, the Windows XP log on, the FlexLock Windows Desktop button) is not simulated: the trainer already runs on the workstation, so those steps are tick-only. For the DeltaV Logon, lock the workstation with Lock Workstation (FlexLock) in the ribbon and log on again with the same user name and password (administrator, password deltav in lower case): the log on is journaled as User logged on and checked from the Event Journal.',
      steps: [
        { id: 'dv09-11a-1', text: 'Step 1. Power-up the DeltaV Workstation and monitor. Not simulated: tick when done.' },
        { id: 'dv09-11a-2', text: 'Steps 2-3. Enter the Username Administrator and the Password deltav in the Windows log on and click OK to continue. Not simulated: tick when done.' },
        { id: 'dv09-11a-3', text: 'DeltaV Logon, Steps 1-2. Enter your Username and Password once again in the DeltaV Logon dialog box and click OK: lock the workstation (FlexLock) and log on as administrator with the password deltav.' },
        { id: 'dv09-11a-4', text: 'Click on the Windows Desktop button of the FlexLock window. Not simulated: tick when done.' }
      ]
    }
  ]
}
