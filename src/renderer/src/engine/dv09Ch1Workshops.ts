import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 1, DeltaV Overview, pages 1-1 .. 1-70.

export const DV09_CHAPTER1: WModule = {
  module: 'DV-09 · Ch 1 DeltaV Overview',
  workshops: [
    {
      id: 'dv09-ch1-reading',
      title: 'DeltaV Overview (reading), pp 1-4 to 1-50 and 1-65 to 1-70',
      objective: 'Define the DeltaV system architecture, software components, capacities and PlantWeb (objectives, p1-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The hardware (switches, power supplies, I/O cards, workstations) is described in the book only; the trainer simulates controllers and their I/O cards in DeltaV Explorer (Physical Network) and the Physical Network display.',
      steps: [
        { id: 'dv09-1r-1', text: 'System architecture (pp 1-4 to 1-7): workstations and controllers join a control network through a primary and a secondary switch (10/100BaseT, 100 m / 330 ft cables). Maximums: 120 nodes, 100 controllers (simplex or redundant pairs), 65 workstations.', goto: 'explorer' },
        { id: 'dv09-1r-2', text: 'I/O interface and card types (pp 1-8 to 1-13): I/O card, I/O terminal block, 8-wide I/O interface carrier and 2-wide power/controller carrier on a DIN rail. Card families: analog input, discrete input, analog output, discrete output. Physical Network shows the simulated cards of a controller.', goto: 'hardware' },
        { id: 'dv09-1r-3', text: 'Communication interfaces, remote I/O and SIS (pp 1-14 to 1-20): FOUNDATION fieldbus, DeviceNet, Profibus DP, AS-i and Modbus serial interfaces; remote I/O with a Remote Interface Unit; the SLS 1508 logic solver of DeltaV SIS.' },
        { id: 'dv09-1r-4', text: 'Controller, switches and power (pp 1-22 to 1-29): the controller mounts in the right slot of the 2-wide power/controller carrier; unmanaged versus DeltaV Smart switches (FP20, MD20/30, RM100); system power supply and bulk power supply.' },
        { id: 'dv09-1r-5', text: 'User station hardware, capacities and licensing (pp 1-30 to 1-34): workstation versus server, system sizing, Device Signal Tag (DST) licensing and the workstation types (ProfessionalPLUS, Professional, Operator, Maintenance, Base, Application).' },
        { id: 'dv09-1r-6', text: 'Software components (pp 1-35 to 1-50): DeltaV Operate (button toolbar, working area, alarm banner; Run and Configure), the control module (hierarchy, displays, alarms, conditionals, algorithm, I/O, parameters), Configuration Suite (DeltaV Explorer, Control Studio) and Diagnostics. Open each from the display list or the DeltaV Applications launcher.', goto: 'applications' },
        { id: 'dv09-1r-7', text: 'DeltaV Explorer indicators and Help (p1-65): right-click a controller and choose What\'s This? to open Help on its indicators.', goto: 'explorer' },
        { id: 'dv09-1r-8', text: 'PlantWeb architectural model and summary (pp 1-68 to 1-70): intelligent field devices, scalable platforms, integrated modular software (AMS), management execution (OPC), integrated smart SIS and Smart Wireless.' }
      ]
    },
    {
      id: 'dv09-ch1-logon',
      title: 'Workshop – Logging on (p 1-50)',
      objective: 'Log on to the DeltaV workstation as administrator (password deltav).',
      note: 'The Windows XP part of the workshop (power up, Windows log-on, FlexLock Windows Desktop) is not simulated; the trainer is already running on the workstation. For Step 4, lock the workstation with the Lock Workstation (FlexLock) button in the ribbon, then log on with the name administrator (lower case) and the password deltav.',
      steps: [
        { id: 'dv09-1a-1', text: 'Step 1. Power up the DeltaV monitor and workstation (Windows log-on appears in about a minute). Not simulated: tick when done.' },
        { id: 'dv09-1a-2', text: 'Steps 2-3. Enter administrator and deltav (lower case) in the Windows log-on and click OK. Not simulated: tick when done.' },
        { id: 'dv09-1a-3', text: 'Do not select Windows Desktop until the DeltaV log-on is complete (note after Step 3). Not simulated: tick when done.' },
        { id: 'dv09-1a-4', text: 'Step 4. Log on to DeltaV with the same user name and password: click Lock Workstation (FlexLock) in the ribbon, then log on as administrator / deltav.' },
        { id: 'dv09-1a-5', text: 'Step 5. Select Windows Desktop from the FlexLock menu bar. Not simulated: tick when done.' }
      ]
    },
    {
      id: 'dv09-ch1-commission',
      title: 'Workshop – Commissioning the Controller (p 1-66)',
      objective: 'Commission the decommissioned controller CTLR-02F896 from DeltaV Explorer: identify it, commission it with a name and network redundancy, auto-sense its I/O and set Cold Restart to 5 minutes.',
      note: 'DeltaV Explorer > Physical Network > Decommissioned Nodes lists CTLR-02F896 (p1-52). Step 1: right-click it > Properties > Flash lights; the Identify dialog opens and the controller indicators flash; close the dialog or choose Stop Flashing. Step 2: drag it onto Control Network. The Properties window asks for the Name (at most 16 characters, at least one letter, $ - and _ allowed), Description, area, Enable System Hardware Alarms, Enable network redundancy for this node (tick it), Show integrity error when not in time sync and Node is redundant (greyed out: simplex controller). OK, then answer Yes to the Auto-Sense I/O prompt. Step 3: right-click the controller under Control Network > Properties > Controller tab: Cold Restart > Enabled Within A Time Limit, 0 days 0 hours 5 minutes. The manual recommends at least two minutes and a UPS.',
      steps: [
        { id: 'dv09-1c-1', text: 'Step 1. Identify the controller using the Identify state (Properties > Flash lights).', goto: 'explorer' },
        { id: 'dv09-1c-2', text: 'Step 2. Commission the controller (drag and drop it onto the Control Network) and name it.', goto: 'explorer' },
        { id: 'dv09-1c-3', text: 'Step 2. Enable network redundancy for the node.', goto: 'explorer' },
        { id: 'dv09-1c-4', text: 'Step 2. Auto-sense the I/O cards (answer Yes when prompted).', goto: 'explorer' },
        { id: 'dv09-1c-5', text: 'Step 3. Set Cold Restart to 5 minutes (Properties > Controller tab).', goto: 'explorer' }
      ]
    }
  ]
}
