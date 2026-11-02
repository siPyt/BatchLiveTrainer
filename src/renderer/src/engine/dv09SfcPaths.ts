import type { AnyModule } from './types'

/** The block parameters of a module an SFC expression can read or write (the Browser of the Expression Assistant lists these). */
export function sfcModulePaths(module: AnyModule): { path: string; note: string }[] {
  switch (module.type) {
    case 'PID':
      return [
        { path: 'PID1/MODE.TARGET', note: 'mode - write it to set the mode of the loop' },
        { path: 'PID1/MODE.ACTUAL', note: 'mode - read the actual mode' },
        { path: 'PID1/SP.CV', note: 'setpoint' },
        { path: 'PID1/OUT.CV', note: 'output' },
        { path: 'PID1/PV.CV', note: 'process variable (measured value)' },
        { path: 'AI1/PV.CV', note: 'measured value of the input block' }
      ]
    case 'AO':
      return [
        { path: 'AO1/MODE.TARGET', note: 'mode - write' }, { path: 'AO1/MODE.ACTUAL', note: 'mode - read' },
        { path: 'AO1/SP.CV', note: 'setpoint' }, { path: 'AO1/OUT.CV', note: 'output' }, { path: 'AO1/PV.CV', note: 'process variable' }
      ]
    case 'AI':
      return [{ path: 'AI1/PV.CV', note: 'measured value' }]
    case 'DO':
      return [{ path: 'DO1/SP_D.CV', note: 'discrete setpoint - the command (0 or 1)' }]
    case 'DI':
      return [{ path: 'DI1/PV_D.CV', note: 'discrete value - the feedback (0 or 1)' }]
    case 'MOTOR':
    case 'VALVE':
      return [
        { path: 'DC1/SP_D.CV', note: 'device setpoint - the command' },
        { path: 'DC1/PV_D.CV', note: 'device state - the feedback' },
        { path: 'DC1/RESET_D.CV', note: 'reset the device' }
      ]
    default:
      return []
  }
}
