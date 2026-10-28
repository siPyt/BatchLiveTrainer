/**
 * The DeltaV standard function blocks as the Control Studio palette groups them (Function Block Reference, "Guide to
 * Function Blocks"). The palette lists all of them; only the blocks the Course 7016 workshops use are fully modeled.
 */
export interface PaletteBlock {
  /** Block abbreviation shown on the palette icon. */
  abbr: string
  name: string
  description: string
}

export interface PaletteGroup {
  group: string
  blocks: PaletteBlock[]
}

const b = (abbr: string, name: string, description: string): PaletteBlock => ({ abbr, name, description })

export const FUNCTION_BLOCK_GROUPS: PaletteGroup[] = [
  { group: 'Advanced Control', blocks: [
    b('DIAG', 'Diagnostic', 'Monitors device alerts from nonfieldbus assets.'),
    b('FLC', 'Fuzzy Logic Control', 'PID-style control with improved response to set point changes and load disturbances.'),
    b('INSPECT', 'Inspect', 'Receives statistics data to view, plot and historize performance values.'),
    b('LE', 'Lab Entry', 'Operator entry of offline lab analysis results.'),
    b('MPC', 'Model Predictive Control', 'Controls interactive processes within measurable operating constraints.'),
    b('MPCPRO', 'Model Predictive Control Professional', 'Model predictive control for large interactive processes, with an optimizer.'),
    b('MPCSIM', 'MPC Process Simulator', 'Simulates the process for use with the MPC block in operator training.'),
    b('NN', 'Neural Network', 'Predicts a process output from measured process inputs.')
  ] },
  { group: 'Advanced Function', blocks: [
    b('AVTR', 'Analog Voter', 'Trips its output when enough of the monitored inputs vote to trip.'),
    b('CEM', 'Cause & Effect Matrix', 'Interlock and permissive logic tying up to 16 inputs to 16 outputs.'),
    b('DVTR', 'Discrete Voter', 'Trips its output when enough of the monitored inputs vote to trip.'),
    b('STD', 'State Transition Diagram', 'A user-defined state machine of states and transitions.'),
    b('SEQ', 'Step Sequencer', 'Associates system states with actions that drive outputs.')
  ] },
  { group: 'Analog Control', blocks: [
    b('BG', 'Bias/Gain', 'Computes an output from a bias set point, an input and a gain.'),
    b('CALC', 'Calculation/Logic', 'Evaluates an expression that determines the block outputs (up to 16 inputs and 16 outputs).'),
    b('CTLSL', 'Control Selector', 'Selects one of three control signals for override control of a PID block.'),
    b('DT', 'Deadtime', 'Introduces a pure time delay in a signal path.'),
    b('ISELX', 'Fieldbus Input Selector Extended', 'Chooses an output based on up to 8 inputs.'),
    b('FLTR', 'Filter', 'Smooths changes in an input signal.'),
    b('ISEL', 'Input Selector', 'Chooses an output based on up to 4 inputs.'),
    b('LL', 'Lead/Lag', 'Dynamic compensation of an input value.'),
    b('LIM', 'Limit', 'Limits an input value between two reference values.'),
    b('MANLD', 'Manual Loader', 'Lets an operator set the block output.'),
    b('PID', 'PID', 'Analog input processing, PID control and analog output processing in one block.'),
    b('RAMP', 'Ramp', 'Ramps an output toward a target value at a defined rate.'),
    b('RTLM', 'Rate Limit', 'Limits the rate of change of the output.'),
    b('RTO', 'Ratio', 'Applies an adjustable ratio set point.'),
    b('SCLR', 'Scaler', 'Scales a value between two engineering-unit ranges.'),
    b('SGCR', 'Signal Characterizer', 'Approximates any input/output function from configured coordinates.'),
    b('SGGN', 'Signal Generator', 'Produces a simulated process signal.'),
    b('SGSL', 'Signal Selector', 'Selects the maximum, minimum or average of up to 16 inputs.'),
    b('SPLTR', 'Splitter', 'Calculates two outputs from a single input.')
  ] },
  { group: 'Energy Metering', blocks: [
    b('AGA', 'Flow Metering (AGA_SI and AGA_US)', 'American Gas Association flow calculations for natural gas.'),
    b('ISE', 'Isentropic Expansion', 'Final enthalpy for isentropic expansion of steam.'),
    b('SDR', 'Steam Density Ratio', 'Square root of the steam density ratio at the meter calibration conditions.'),
    b('SST', 'Saturated Steam Properties at Temperature', 'Saturated steam properties for a given temperature.'),
    b('STM', 'Steam Properties', 'Steam enthalpy, entropy and specific volume for a gauge pressure.'),
    b('TSS', 'Saturated Temperature', 'Steam temperature at saturation for a steam pressure.'),
    b('WTH', 'Water Enthalpy', 'Enthalpy of water at a temperature.'),
    b('WTS', 'Water Entropy', 'Entropy of water at a temperature.')
  ] },
  { group: 'I/O', blocks: [
    b('ALARM', 'Alarm Detection', 'Alarms on parameters from I/O or from other block calculations.'),
    b('AI', 'Analog Input', 'Reads a single analog measurement and its status from an I/O channel.'),
    b('AO', 'Analog Output', 'Writes an analog output value to a field device channel.'),
    b('DI', 'Discrete Input', 'Reads a single discrete measurement from a two-state field device.'),
    b('DO', 'Discrete Output', 'Writes a binary set point to an I/O channel.'),
    b('FFMDI', 'H1 Carrier Multiple Discrete Input', 'The eight channels of a discrete input card as an 8-bit input.'),
    b('FFMDO', 'H1 Carrier Multiple Discrete Output', 'An 8-bit set point written to a discrete output card.'),
    b('FFMDI_STD', 'Multiple Discrete Input', 'Eight discrete input values from two-state field devices.'),
    b('FFMDO_STD', 'Multiple Discrete Output', 'Eight inputs made available to the I/O subsystem.'),
    b('FFMAI_RMT', 'Multiplexed Analog Input', 'Connects higher density transmitters to a fieldbus segment.'),
    b('FFMAO', 'Multiplexed Analog Output', 'Eight inputs made available to the I/O subsystem.'),
    b('PIN', 'Pulse Input', 'Analog input values from Pulse Input channels.')
  ] },
  { group: 'Logical', blocks: [
    b('ACT', 'Action', 'Evaluates a single-line expression based on an input value.'),
    b('AND', 'And', 'Logical AND of two to sixteen discrete inputs.'),
    b('BDE', 'Bi-directional Edge Trigger', 'A pulse when the input goes False to True or True to False.'),
    b('BFI', 'Boolean Fan Input', 'Weighted binary sum, BCD, first-out trap or logical OR of one to sixteen discrete inputs.'),
    b('BFO', 'Boolean Fan Output', 'Decodes a binary weighted input to up to sixteen discrete outputs.'),
    b('CND', 'Condition', 'Sets a discrete output when an expression has been True for longer than a set time.'),
    b('DC', 'Device Control', 'Set point control for multistate discrete devices, with interlocks.'),
    b('MLTX', 'Multiplexer', 'Selects one of up to sixteen input values.'),
    b('NDE', 'Negative Edge Trigger', 'A pulse when the input goes True to False.'),
    b('NOT', 'Not', 'Inverts a discrete input.'),
    b('OR', 'Or', 'Logical OR of two to sixteen discrete inputs.'),
    b('PDE', 'Positive Edge Trigger', 'A pulse when the input goes False to True.'),
    b('RS', 'Reset/Set Flip-flop', 'Output from NOR logic of the reset and set inputs.'),
    b('SR', 'Set/Reset Flip-flop', 'Output from NAND logic of the set and reset inputs.'),
    b('XFR', 'Transfer', 'Transfers one of two analog inputs to the output with a smooth ramp.')
  ] },
  { group: 'Math', blocks: [
    b('ABS', 'Absolute Value', 'Absolute value of an input.'),
    b('ADD', 'Add', 'Sum of two to sixteen inputs.'),
    b('ARITH', 'Arithmetic', 'Range extension of a primary input plus nine arithmetic compensation types.'),
    b('CMP', 'Comparator', 'Compares two values and sets a Boolean output.'),
    b('DIV', 'Divide', 'Divides one input by another.'),
    b('INT', 'Integrator', 'Integrates a variable over time against pre-trip and trip limits.'),
    b('MLTY', 'Multiply', 'Product of two to sixteen inputs.'),
    b('SUB', 'Subtract', 'Subtracts one input from another.')
  ] },
  { group: 'Timer Counter', blocks: [
    b('CTR', 'Counter', 'Counts up or down and sets its output at a trip value.'),
    b('DTE', 'Date Time Event', 'Time of day timer functions and scheduled events.'),
    b('OFFD', 'Off-delay Timer', 'Delays the transfer of a False input to the output.'),
    b('OND', 'On-delay Timer', 'Delays the transfer of a True input to the output.'),
    b('RET', 'Retentive Timer', 'Output goes True after the input has been True for a set time; reset by its reset input.'),
    b('TP', 'Timed Pulse', 'A True output of a set duration on a False-to-True input transition.')
  ] }
]

/** The blocks the Course 7016 workshops build in FAIL_MONITOR; the rest of the palette is listed but not modeled. */
export const MODELED_FUNCTION_BLOCKS: readonly string[] = ['CND', 'BFI', 'CALC']

/** The palette group a block is listed under. */
export const paletteGroupOf = (abbr: string): string | undefined => FUNCTION_BLOCK_GROUPS.find(g => g.blocks.some(x => x.abbr === abbr))?.group
