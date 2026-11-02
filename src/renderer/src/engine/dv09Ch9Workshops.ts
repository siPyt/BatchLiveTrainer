import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 9, DeltaV Serial Interface, pages 9-1 .. 9-47.

export const DV09_CHAPTER9: WModule = {
  module: 'DV-09 · Ch 9 DeltaV Serial Interface',
  workshops: [
    {
      id: 'dv09-ch9-reading',
      title: 'DeltaV Serial Interface (reading), pp 9-3 to 9-30',
      objective: 'Interface DeltaV with serial devices, define the wiring connections and the capabilities, and configure the Serial Interface (objectives, p9-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The Serial card is configured in DeltaV Explorer under your controller > I/O; the Physical Network (Diagnostics) display shows the card, its tie-back cable and the live dataset status.',
      steps: [
        { id: 'dv09-9r-1', text: 'Serial Interface (pp 9-4, 9-5): communication to serial devices and PLCs with Modbus (master or slave) in RTU or ASCII; the card supports RS232, RS422/485 half duplex or RS422/485 full duplex. The Serial Card needs a Serial Terminal Block for the wiring (the figure shows RS232 to a Modicon 984: GND, TXD, RXD, DTR, DSR).', goto: 'hardware' },
        { id: 'dv09-9r-2', text: 'Capabilities (pp 9-7, 9-8): a card has 2 ports; a port talks to one device over RS232 or to as many as 16 devices over RS422/485; 16 datasets per port, 100 registers or coils per dataset; 500 DSTs or 3200 SCADA points per card. Coils 00001, input status 10001, input registers 30001, holding registers 40001.', goto: 'hardware' },
        { id: 'dv09-9r-3', text: 'Serial Card configuration (pp 9-9, 9-10): plug the card into a vacant I/O carrier slot and auto-sense it, or configure a placeholder first: Physical Network > Control Network > I/O > New Card.', goto: 'explorer' },
        { id: 'dv09-9r-4', text: 'Serial Port Properties (pp 9-11 to 9-16): Physical Network > Control Network > I/O > P01 > Properties. Port tab: Description and Enabled. Advanced tab: Protocol Type (RTU or ASCII), Mode (master or slave), Retry Count, Message time out, Transmit Delay, Send outputs on startup. Communications tab: Port type (RS232, RS422/485 full or half duplex), Baud rate (300 to 115 K), Parity, Data bits, Stop bits.', goto: 'explorer' },
        { id: 'dv09-9r-5', text: 'Adding a Serial Device (pp 9-17, 9-18): each port communicates with as many as 16 devices; right-click P01 > New Serial Device, enter the device address and click OK.', goto: 'explorer' },
        { id: 'dv09-9r-6', text: 'Dataset Definition (pp 9-19 to 9-26): right-click DEV01 > New Dataset. General tab: Description, Data Direction, Output mode (complete block or single value), Output read back. DeltaV tab: DeltaV data type and Dataset Tag. PLC tab: PLC data type, PLC base register address, PLC register offset, Number of values.', goto: 'explorer' },
        { id: 'dv09-9r-7', text: 'Module Configuration (pp 9-27 to 9-30): a flow transmitter in Holding register 40001 is brought into a module with a PID block: modify IO_IN to use a Dataset Tag from the PLC, browse for the dataset (FT_MODICON) and select R40001 as the PID input.', goto: 'studio' }
      ]
    },
    {
      id: 'dv09-ch9-modbus',
      title: 'Workshop 1 – Modbus Tie-Back (pp 9-31 to 9-45)',
      objective: 'Configure Port 1 as the Modbus Master and Port 2 as the Modbus Slave; with a hardwire tie-back MTR-MODBUS and FIC-MODBUS pass their outputs to Port 1 and receive their inputs on Port 2.',
      note: 'MTR-MODBUS: IO_OUT_1 = MTR-OUT R2 (Port 1, Dataset 2, coil 00002) and IO_IN_1 = MTR-IN R2 (Port 2, Dataset 2). FIC-MODBUS: IO_OUT = FLOW-OUT R40001 (Port 1, Dataset 1) and IO_IN = FLOW-IN R40001 (Port 2, Dataset 1, holding register 40001). Use the controller you commissioned in Chapter 1. The cable of step 1 is simulated: Diagnostics > Physical Network > Serial Interface Cards > "Wire Port 1 to Port 2". Step 2 (inserting the card and terminal block) is physical and stays tick-only. A new card in slot 5 is a placeholder (I/O > New Card). Control Studio modifies the I/O parameters in the course; in the trainer the I/O bindings of the motor and the PID loop are set in their Explorer properties (Draft IO_IN_1 / IO_OUT_1, PID_LOOP input and output DST) and the dynamos are placed with Display Builder (pump dynamo and loop dynamo bound to the module).',
      steps: [
        { id: 'dv09-9w-1', text: 'Task 1 / Step 1. Wire Port 1 to Port 2 (Port 1: GND 1, TXD 3, RXD 5, DTR 7, DSR 8 to Port 2: GND 9, RXD 13, TXD 11, DSR 16, DTR 15).', goto: 'hardware' },
        { id: 'dv09-9w-2', text: 'Task 2 / Step 2. Insert the Serial Card and Termination block in slot 5 (physical; tick when done).' },
        { id: 'dv09-9w-3', text: 'Task 3 / Step 3. Add the Serial Card from the DeltaV Explorer: your controller > I/O > define the Serial Card in slot 5.', goto: 'explorer' },
        { id: 'dv09-9w-4', text: 'Step 4. Port 1 Properties (the Serial Card > Port 1 > Properties): Port tab - Enabled; Advanced tab - Protocol Type RTU, Mode Master, Retry Count 1, Message time out 1000 (ms), Transmit Delay 0, Send outputs on startup your choice; Communications tab - Port Type RS232, Baud Rate 9600, Parity even, Data bits 8, Stop bits 1.', goto: 'explorer' },
        { id: 'dv09-9w-5', text: 'Step 5. Port 2 Properties: Port tab - Enabled; Advanced tab - Protocol Type RTU, Mode Slave, Transmit Delay 0; Communications tab - Port Type RS232, Baud Rate 9600, Parity even, Data bits 8, Stop bits 1.', goto: 'explorer' },
        { id: 'dv09-9w-6', text: 'Step 6. Define the Serial Device for Port 1: Port 1 > New Serial Device, Device Address 1.', goto: 'explorer' },
        { id: 'dv09-9w-7', text: 'Step 7. Define two datasets (DEV01 > New Dataset): DS01 = output, 16 bit int w/status, Dataset Tag FLOW-OUT, PLC Data Type holding registers, PLC Register Offset 0, Number of Values 1; DS02 = output, Boolean w/status, Dataset Tag MTR-OUT, PLC Data Type coils, PLC Register Offset 1, Number of Values 1.', goto: 'explorer' },
        { id: 'dv09-9w-8', text: 'Step 8. Define the Serial Device for Port 2: Port 2 > New Serial Device, Device Address 1.', goto: 'explorer' },
        { id: 'dv09-9w-9', text: 'Step 9. Define two datasets (DEV01 > New Dataset): DS01 = input, 16 bit int w/status, Dataset Tag FLOW-IN, holding registers, offset 0, 1 value; DS02 = input, Boolean w/status, Dataset Tag MTR-IN, coils, offset 1, 1 value.', goto: 'explorer' },
        { id: 'dv09-9w-10', text: 'Step 10. Download the Serial Card (right-click the card > Download).', goto: 'explorer' },
        { id: 'dv09-9m-1', text: 'MTR-MODBUS Step 1. From DeltaV Explorer drag and drop the MTR-11 Module Template from the Library to PLANT_AREA_A. Step 2. Rename the Module MTR-MODBUS (checked together).', goto: 'explorer' },
        { id: 'dv09-9m-3', text: 'MTR-MODBUS Step 3. Launch Control Studio and modify the I/O parameters on the Device Control block: IO_IN_1 = MTR-IN R2, IO_OUT_1 = MTR-OUT R2.', goto: 'studio' },
        { id: 'dv09-9m-4', text: 'MTR-MODBUS Step 4. Assign to the Controller.', goto: 'explorer' },
        { id: 'dv09-9m-5', text: 'MTR-MODBUS Step 5. Save and download the Module.', goto: 'explorer' },
        { id: 'dv09-9m-6', text: 'MTR-MODBUS Step 6. Launch DeltaV Operate (Configure) and add the pump dynamo DL_PMP_HLR_ from the frsModules dynamo set to an existing picture (Dynamo Properties: DVSYS.MTR-MODBUS).', goto: 'builder' },
        { id: 'dv09-9m-7', text: 'MTR-MODBUS Step 7. Save the display.', goto: 'builder' },
        { id: 'dv09-9m-8', text: 'MTR-MODBUS Step 8. Switch to DeltaV Operate (Run), view the picture with MTR-MODBUS and verify that you can START and STOP the motor.', goto: 'process' },
        { id: 'dv09-9f-1', text: 'FIC-MODBUS Step 1. From DeltaV Explorer drag and drop the PID_LOOP Module Template from the Library to PLANT_AREA_A. Step 2. Rename the Module FIC-MODBUS (checked together).', goto: 'explorer' },
        { id: 'dv09-9f-3', text: 'FIC-MODBUS Step 3. Launch Control Studio and modify the I/O parameters on the PID block: IO_IN = FLOW-IN R40001, IO_OUT = FLOW-OUT R40001.', goto: 'studio' },
        { id: 'dv09-9f-4', text: 'FIC-MODBUS Step 4. Assign to the Controller.', goto: 'explorer' },
        { id: 'dv09-9f-5', text: 'FIC-MODBUS Step 5. Save and download the module.', goto: 'explorer' },
        { id: 'dv09-9f-6', text: 'FIC-MODBUS Step 6. Launch DeltaV Operate (Configure) and add the loop dynamo PID_LOOP_1_ from the frsModules dynamo set to an existing picture (Dynamo Properties: DVSYS.FIC-MODBUS).', goto: 'builder' },
        { id: 'dv09-9f-7', text: 'FIC-MODBUS Step 7. Save the display.', goto: 'builder' },
        { id: 'dv09-9f-8', text: 'FIC-MODBUS Step 8. Switch to DeltaV Operate (Run), view the picture with FIC-MODBUS and verify that the loop controls.', goto: 'process' }
      ]
    }
  ]
}
