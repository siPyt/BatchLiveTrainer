import type { WModule } from './workshops'

// Course DV-09 chapter 12, Assembling an H1 Segment, pages 12-1 .. 12-54: System Preferences, Wire Fieldbus Segment (with the
// segment checkout of pp 12-36 .. 12-53) and Adding an H1 Card.

export const DV09_CHAPTER12: WModule = {
  module: 'DV-09 \u00b7 Ch 12 Assembling an H1 Segment',
  workshops: [
    {
      id: 'dv09-ch12-reading',
      title: 'Assembling an H1 Segment (reading), pp 12-3 to 12-7, 12-18 to 12-32 and 12-34 to 12-35',
      objective: 'Use DeltaV System Preferences, wire a FOUNDATION fieldbus segment and verify communications, perform the segment checkout procedures (objectives, p12-3).',
      note: 'Reference material: the slides below have no steps of their own; the workshops that follow use them. Tick each item when you have read it and, where a link is given, found the matching place in the trainer.',
      steps: [
        { id: 'dv09-12r-1', text: 'System Preferences (pp 12-4 to 12-7): some DeltaV functionality (AS-Interface, Profibus, Fieldbus, DeviceNet, Batch, Advanced Unit Control, DeltaV SIS) is hidden until you enable it with Start > DeltaV > Engineering > System Preferences. Open DeltaV database applications must be closed and the DeltaV services shut down and restarted (Database Administrator > File > Shutdown/Connect to server). The enabled preference then appears in DeltaV Explorer under Library > Device Definitions.', goto: 'system' },
        { id: 'dv09-12r-2', text: 'H1 Fieldbus Interface LEDs and capacity (pp 12-18 to 12-20): green = powered and self tests good; red = failed and/or not communicating to the controller; yellow (port 1, port 2) = off (not enabled or not communicating), blinking (communicating without any function blocks configured on the segment, or a communication problem) or on (good communications and at least one function block). The card supports 96 function blocks: 64 device and 32 H1 card blocks. Screw terminals 1, 7 (24 VIN+) and 2, 8 (24 VIN-) are not presently available; port 1 is 3(+) and 4(-), port 2 is 5(+) and 6(-).', goto: 'hardware' },
        { id: 'dv09-12r-3', text: 'Adding a new H1 fieldbus interface (pp 12-21, 12-22): right-click the I/O icon > New Card (the Add Card dialog: Card class, Card type, Card series, Slot position matching the physical location on the carrier, Card is redundant: the next available odd-numbered slot appears; redundancy is for Series 2 cards only), or Auto Sense the I/O.', goto: 'explorer' },
        { id: 'dv09-12r-4', text: 'Enabling H1 ports (pp 12-23 to 12-25): Properties > General tab: Enabled, an optional Description, Requested macrocycle (150 ms, 250 ms, 500 ms, 1 sec, 2 sec, 5 sec or Module-driven; the default is a user-specified one second) and the Calculated macrocycle calculated by the H1 card (the actual execution time plus any publisher CD time).', goto: 'explorer' },
        { id: 'dv09-12r-5', text: 'Communication scheduling (pp 12-26, 12-27): the actual macrocycle is the requested macrocycle when the calculated one is less than or equal to it, otherwise the calculated macrocycle (1 s/0.6 s gives 1 s; 1 s/1.2 s gives 1.2 s; 0.5 s/1 s gives 1 s; 0.5 s/0.8 s gives 0.8 s). Module-driven maps a block scan rate of 0-500 ms to 500 ms, over 500 to 1000 ms to 1000 ms, over 1000 to 2000 ms to 2000 ms and over 2000 ms to 4000 ms; up to four macrocycles run concurrently.', goto: 'hardware' },
        { id: 'dv09-12r-6', text: 'Resource limits, Advanced tab (pp 12-28 to 12-30): minimum schedule spacing between consecutive compel data messages (change only on Emerson advice), configured and maximum publishers, subscribers and total VCRs per port, configured device blocks and H1 card blocks per port and per card, and the View Schedule button for the macrocycle of each segment.', goto: 'explorer' },
        { id: 'dv09-12r-7', text: 'Scheduled transfers (pp 12-31, 12-32): a port supports up to 35 publisher VCRs and 50 subscriber VCRs as long as the total does not exceed 50 (35 + 15 or 5 + 45). A publisher VCR is an output from a controller or H1 card to the input of a device; a subscriber VCR is an output from a device to an input in the controller, the H1 card or another device.' },
        { id: 'dv09-12r-8', text: 'Diagnostics auto-sense devices (pp 12-34, 12-35): expand the fieldbus H1 card, select the port and right-click Rescan Port; the Name column lists the devices sensed with integrity, status and number of devices; State, DevID (manufacturer serial number), Node Address and DevRev (revision when Standby or Commissioned) follow.', goto: 'hardware' },
        { id: 'dv09-12r-9', text: 'Segment checkout with the Fluke 123 meter (pp 12-36 to 12-53): attach the AC adapter and power up, then use Input A Setup, Power On/Off, mV - V, Scope Menu, F4 (Enter), Time and the arrow buttons. Remove the segment cable at the power supply connector (the connector to the H1 card stays), measure resistance, capacitance and the termination switch, reconnect, then measure DC voltage and the AC waveform. The checkout is done in Workshop - Wire Fieldbus Segment on the Fieldbus Segment panel of Diagnostics.', goto: 'hardware' },
        { id: 'dv09-12r-10', text: 'Summary (p12-54): you can use DeltaV System Preferences, wire a FOUNDATION fieldbus segment and verify communications, perform the segment checkout procedures and verify communications.' }
      ]
    },
    {
      id: 'dv09-ch12-prefs',
      title: 'Workshop \u2013 System Preferences (pp 12-8 to 12-14)',
      objective: 'Enable System Preferences for Fieldbus, shut down and restart the DeltaV database applications and verify in DeltaV Explorer that Fieldbus has been added to the library.',
      note: 'Tasks: 1. Enable System Preferences for Fieldbus. 2. Shutdown and restart DeltaV Database applications. 3. Verify, in DeltaV Explorer, that Fieldbus system preferences have been enabled and added to the library. On the System Preferences display the Start > DeltaV > Engineering button opens the two applications. Database applications that are open (DeltaV Explorer, Control Studio, DeltaV Operate Configure) block the change and the shutdown: close them first (the Database Administrator lists the open clients and has a Close button for each; the Force shutdown box closes them for you). You need the System Admin key (log on as administrator).',
      steps: [
        { id: 'dv09-12p-1', text: 'Step 1. Access DeltaV System Preferences by selecting Start \u2192 DeltaV \u2192 Engineering \u2192 System Preferences.', goto: 'system' },
        { id: 'dv09-12p-2', text: 'Step 2. Enable, or check, the necessary choices in the System Preferences dialog box (Enable Fieldbus) and click the OK button to continue.', goto: 'system' },
        { id: 'dv09-12p-3', text: 'Step 3. Click the message box\u2019s OK button to continue.', goto: 'system' },
        { id: 'dv09-12p-4', text: 'Step 4. Open the Database Administrator by selecting DeltaV \u2192 Engineering \u2192 Database Administrator. (You must have administrative privilege.) A message at the bottom of the dialog box indicates the database server is running.', goto: 'system' },
        { id: 'dv09-12p-5', text: 'Step 5. Select the DeltaV Database Administration dialog box\u2019s File \u2192 Shutdown Server. Click the Shutdown Server message box\u2019s OK button to shutdown the database server. (The message at the bottom indicates the database server is shutdown.)', goto: 'system' },
        { id: 'dv09-12p-6', text: 'Step 6. Select File \u2192 Connect to Server to re-connect the server.', goto: 'system' },
        { id: 'dv09-12p-7', text: 'Task 3. Verify, in DeltaV Explorer, that Fieldbus system preferences have been enabled and added to the library: Library \u2192 Device Definitions now contains Fieldbus Devices.', goto: 'explorer' }
      ]
    },
    {
      id: 'dv09-ch12-wire',
      title: 'Workshop \u2013 Wire Fieldbus Segment (pp 12-15 to 12-17, segment checkout pp 12-36 to 12-53)',
      objective: 'Wire a Fieldbus segment to the 3144P, perform the segment checkout procedure and verify communications.',
      note: 'Tasks: 1. Wire a Fieldbus segment to the 3144P. 2. Perform the Segment Checkout procedure. 3. Verify communications. The Fieldbus Segment panel on Diagnostics (Physical Network display) is the training simulator bench: pick where each cable end is plugged (the manual\'s connections are listed beside each end), plug the Fieldbus power supply into the power strip, then use the on-screen Fluke 123 (Power On/Off, Input A Setup, Scope Menu, F4, arrows, mV - V, Time, HOLD), place the two leads on the conductors and Record each reading in the checkout form; the readings follow the wiring state. The resistance and capacitance checks need the Mother Board segment cable (trunk, Mother Board end) removed; reconnect it for the voltage and waveform checks. Task 3 needs the H1 card of Workshop - Adding an H1 Card (enabled port, downloaded) and then Diagnostics > the port > Rescan Port. Not simulated: the AC adapter and the physical cables, the checkout is a lesson model and certifies no real installation.',
      steps: [
        { id: 'dv09-12w-1', text: 'Step 1. Connect the 24VDC power supply plug to the P&F Power Supply connection on the Mother Board. Polarity: Blue is negative and Brown is positive.', goto: 'hardware' },
        { id: 'dv09-12w-2', text: 'Step 2. Connect the Mother Board Host cable to H1 Fieldbus Interface terminals 3(+) and 4(-).', goto: 'hardware' },
        { id: 'dv09-12w-3', text: 'Step 3. Connect the P&F trunk cable to Quick Disconnect Junction Box P1.', goto: 'hardware' },
        { id: 'dv09-12w-4', text: 'Step 4. Connect Quick Disconnect Junction Box S2 to the 3144P.', goto: 'hardware' },
        { id: 'dv09-12w-5', text: 'Step 5. Plug the Fieldbus terminator into S0, if not already installed.', goto: 'hardware' },
        { id: 'dv09-12w-6', text: 'Step 6. Apply power to the Fieldbus segment by plugging the Fieldbus power supply into the power strip at the bottom of the simulator.', goto: 'hardware' },
        { id: 'dv09-12w-7', text: 'Task 2, before the checkout (p12-40). Remove the Fieldbus segment cable (+, - and shield) at the connector location from the Fieldbus power supply (only the connector to the field wiring; not the connector to the H1 card). Do not touch the leads with bare hands.', goto: 'hardware' },
        { id: 'dv09-12w-8', text: 'Task 2, measuring resistance (pp 12-42, 12-43). Press Input A Setup, select ohm with the arrow buttons, press F4, adjust the range to 500K Ohm with the mV - V button; measure and record the six pairings: + to - signal conductor (> 50 K ohms, increasing), and + signal, - signal and drain/shield to each other conductor and to the instrument ground bar (open circuit, > 20 M ohms).', goto: 'hardware' },
        { id: 'dv09-12w-9', text: 'Task 2, measuring capacitance (pp 12-44, 12-45). Press Input A Setup, select Cap, press F4, adjust the range to 5 micro farads with the mV - V button; measure and record the six pairings: + to - signal conductor 1 \u00b5F (0.80 to 1.20 \u00b5F acceptable), every pairing with the drain/shield wire or the instrument ground bar < 300 nF.', goto: 'hardware' },
        { id: 'dv09-12w-10', text: 'Task 2, termination switch (p12-46). Verify the power supply terminator switch and the device connection (junction box) terminator: switch ON or OFF depending on the application so that there are 2 terminators total per segment.', goto: 'hardware' },
        { id: 'dv09-12w-11', text: 'Task 2, measuring DC voltage (pp 12-48, 12-49). Reconnect the previously removed connector to the power supply; press Input A Setup, select VDC, press F4, adjust the range to read 20V/d; measure and record the output DC voltage at the power supply terminals (P+F Fieldbus Power Hub 28-30 VDC).', goto: 'hardware' },
        { id: 'dv09-12w-12', text: 'Task 2, measuring the AC waveform (pp 12-50, 12-51). Press Scope Menu, select AC for Input A with the arrow buttons, press F4 to select normal, press F4 twice, adjust to 200mV/division with the mV - V button and to 10 micro seconds with the time button, press HOLD to capture the waveform (500 mV and 900 mV peak) and record it.', goto: 'hardware' },
        { id: 'dv09-12w-13', text: 'Task 3. Verify communications: with the H1 card downloaded, expand the H1 card on Diagnostics, select the port, right-click Rescan Port (Auto-Sense Devices) and see the 3144P listed as communicating (State Standby, integrity Good).', goto: 'hardware' }
      ]
    },
    {
      id: 'dv09-ch12-h1card',
      title: 'Workshop \u2013 Adding an H1 Card (p 12-33)',
      objective: 'Add the H1 card with Auto-Sense I/O Cards, enable port P01, document its macrocycle and resource limits and download Card 5.',
      note: 'FOUNDATION fieldbus must be enabled first (Workshop - System Preferences). Right-click I/O under the controller in DeltaV Explorer: Auto-Sense I/O Cards (Yes) adds the Series 2 H1 card C05; New Card (Add Card dialog) is the alternative method. Expand C05 and right-click P01 > Properties: the General tab (Enabled, Description, Requested and Calculated macrocycle) and the Advanced tab (Configured and Maximum Publisher, Subscriber, Total VCRs and Block, View Schedule). Right-click C05 > Download > Card. Steps 3 and 4 only ask you to write values down: tick them when you have noted them.',
      steps: [
        { id: 'dv09-12h-1', text: 'Step 1. Select I/O \u2192 Auto-Sense I/O Cards.', goto: 'explorer' },
        { id: 'dv09-12h-2', text: 'Step 2. From the General tab select P01 and right-click Properties. Enable the port by checking Enable. Type an optional description in the Description field.', goto: 'explorer' },
        { id: 'dv09-12h-3', text: 'Step 3. Document the Requested macrocycle and the Calculated macrocycle (General tab). Writing the values down is not checked: tick when done.', goto: 'explorer' },
        { id: 'dv09-12h-4', text: 'Step 4. Select the Advanced tab and document the Configured and Maximum Publisher, Subscriber, Total VCR\u2019s and Block. Writing the values down is not checked: tick when done.', goto: 'explorer' },
        { id: 'dv09-12h-5', text: 'Step 5. Download Card 5.', goto: 'explorer' }
      ]
    }
  ]
}
