import type { WModule } from './workshops'

// Course DV-09 chapter 10, FOUNDATION fieldbus Overview, pages 10-1 .. 10-46. The chapter has no workshop (every slide was read): it is
// concepts only, so it is one tick-only reading workshop with links to the places in the trainer that show the same things.

export const DV09_CHAPTER10: WModule = {
  module: 'DV-09 \u00b7 Ch 10 FOUNDATION fieldbus Overview',
  workshops: [
    {
      id: 'dv09-ch10-reading',
      title: 'FOUNDATION fieldbus Overview (reading), pp 10-3 to 10-46',
      objective: 'Define FOUNDATION fieldbus, discuss its benefits, describe the Fieldbus Foundation and the AMS Intelligent Device Manager (objectives, p10-3).',
      note: 'Reference material: the chapter has no workshop and no configuration steps. Tick each item when you have read it and, where a link is given, found the matching place in the trainer. The fieldbus parts of the trainer (H1 cards, devices, macrocycles, audit trail) appear once FOUNDATION fieldbus is enabled in System Preferences (Chapter 12); the trainer models generic virtual devices, not real FOUNDATION devices, a device description service or AMS.',
      steps: [
        { id: 'dv09-10r-1', text: 'PlantWeb and the definition of FOUNDATION fieldbus (pp 10-4, 10-5): PlantWeb is a digital plant architecture; FOUNDATION fieldbus is an all digital, serial, two-way communication system that interconnects intelligent measurement and control devices, essentially a LAN for field devices, and it allows PID control in the field (control anywhere).' },
        { id: 'dv09-10r-2', text: 'The Fieldbus Foundation (pp 10-6, 10-7): a not-for-profit organization of about 350 controls and instrumentation suppliers and end users, established September 1994 by the merger of WorldFIP North America and the Interoperable Systems Project (ISP); the goal is a single international, interoperable Fieldbus standard.' },
        { id: 'dv09-10r-3', text: 'PlantWeb architectural model (pp 10-8 to 10-10): intelligent field devices (remote configuration and calibration, diagnostics through PlantWeb alerts), scalable platforms, integrated modular software (AMS Device Manager), management execution through OPC, integrated smart SIS (SIL 3) and Smart Wireless integration.' },
        { id: 'dv09-10r-4', text: 'Fieldbus benefits (pp 10-12 to 10-14): traditional 4-20 mA passes one variable in one direction on two wires per device; fieldbus communicates several variables bi-directionally, adds fieldbus device alarms and PlantWeb alerts and needs one twisted pair from the field devices to the H1 interface. Interoperability: certification confirms minimum functionality only.', goto: 'hardware' },
        { id: 'dv09-10r-5', text: 'Communication technology (pp 10-15 to 10-17): the physical layer (field devices and wiring), the communication stack (fieldbus message specification, fieldbus access sublayer, data link layer) and the user application (blocks and communication management: scheduling, what data goes to which device).' },
        { id: 'dv09-10r-6', text: 'Fieldbus blocks (pp 10-18 to 10-22): every device has a resource block (device characteristics such as name, manufacturer, serial number, mode and write lock), transducer blocks (interface to the sensor: calibration and configuration; set to Out of Service to calibrate) and function blocks (AI, AO, DI, DO, PID and about 30 more) configured by the host. The resource, transducer and function blocks of the trainer\'s virtual devices are on the H1 panel.', goto: 'hardware' },
        { id: 'dv09-10r-7', text: 'Role of function blocks and extended (shadow) blocks (pp 10-23 to 10-27): control modules link the function blocks of devices, the H1 card and the controller; Control Studio shadow blocks are the extended blocks (prefix FF, for example FFAI_RMT1); the manufacturer specific parameter blocks of Emerson devices end in _RMT (FFAI_RMT, FFAO_RMT, FFMAI_RMT, FFPID_RMT).' },
        { id: 'dv09-10r-8', text: 'Device descriptions and DeltaV tested devices (pp 10-28 to 10-32): the DD defines the standard and supplier unique parameters, is unique for every device and its revision must match the device revision; Library > Device Definitions > Fieldbus Devices lists the manufacturers of tested devices (Unknown Manufacturer is for imported devices).', goto: 'explorer' },
        { id: 'dv09-10r-9', text: 'Communication scheduling (pp 10-34 to 10-36): scheduled execution (inside the device, no bus time), scheduled communication (bus time, data to other devices) and unscheduled communication (alarms, time synchronization, probe nodes, live list maintenance, token passing). The macrocycle sets how often the blocks of the port execute: a user-specified rate (150, 250, 500 ms, 1, 2 or 5 s) or module-driven.', goto: 'hardware' },
        { id: 'dv09-10r-10', text: 'Device types (pp 10-38 to 10-40): the DeltaV H1 card is the Link Master (link active scheduler): it maintains the live list (probe node, PN), manages the macrocycle (compel data, CD) and issues pass token (PT); basic devices respond to PN, CD and PT; publisher and subscriber devices exchange data on a CD.', goto: 'hardware' },
        { id: 'dv09-10r-11', text: 'AMS Intelligent Device Manager audit trail (pp 10-42 to 10-45): right-click a fieldbus device > Audit Trail lists date and time, user, event type and the reason (user configuration change, field change, a method performed) for every change to the resource or transducer block; double-clicking an event opens a read-only Configuration Change Detail.', goto: 'explorer' },
        { id: 'dv09-10r-12', text: 'Summary (p10-46): you can define FOUNDATION fieldbus, discuss its benefits, describe the Fieldbus Foundation and describe AMS Intelligent Device Manager.' }
      ]
    }
  ]
}
