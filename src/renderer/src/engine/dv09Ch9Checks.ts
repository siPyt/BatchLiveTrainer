import type { HardwareState } from './hardware'
import type { EventLogEntry } from './types'
import type { StepCheck } from './workshopChecks'
import type { SerialCard, SerialDatasetConfig, SerialPortConfig, SerialPortId } from './serialIo'
import type { DeviceLifecycle } from './deviceLifecycle'
import type { PidLifecycle } from './pidLifecycle'
import type { AnyModule } from './types'
import type { Picture } from './pictureStore'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** The slice of the main store the chapter 9 checks read. */
export interface Dv09Ch9State {
  hardware: HardwareState
  modules: Record<string, AnyModule>
  deviceLifecycle: Record<string, DeviceLifecycle>
  pidLifecycle: Record<string, PidLifecycle>
  eventLog: EventLogEntry[]
}

/** Workshop 1 (pp 9-33 .. 9-45): the datasets of the p9-39 and p9-41 tables, per port. */
export const DV09_SERIAL_DATASETS: Record<SerialPortId, { name: string; direction: SerialDatasetConfig['direction']; dataType: SerialDatasetConfig['dataType']; tag: string; plcTable: SerialDatasetConfig['plcTable']; offset: number }[]> = {
  P01: [
    { name: 'DS01', direction: 'OUTPUT', dataType: 'INT16', tag: 'FLOW-OUT', plcTable: 'HOLDING_REGISTERS', offset: 0 },
    { name: 'DS02', direction: 'OUTPUT', dataType: 'BOOLEAN', tag: 'MTR-OUT', plcTable: 'COILS', offset: 1 }
  ],
  P02: [
    { name: 'DS01', direction: 'INPUT', dataType: 'INT16', tag: 'FLOW-IN', plcTable: 'HOLDING_REGISTERS', offset: 0 },
    { name: 'DS02', direction: 'INPUT', dataType: 'BOOLEAN', tag: 'MTR-IN', plcTable: 'COILS', offset: 1 }
  ]
}

const commonComms = (p: SerialPortConfig): boolean => p.portType === 'RS232' && p.baud === 9600 && p.parity === 'EVEN' && p.dataBits === 8 && p.stopBits === 1

/** Port 1 (p9-36): enabled, RTU, master, retry 1, time out 1000, delay 0; communications RS232 9600 even 8 1. Send outputs on startup is the student's choice. */
export const port1Ok = (p?: SerialPortConfig): boolean => !!p && p.enabled && p.protocol === 'RTU' && p.mode === 'MASTER' && p.retryCount === 1 && p.timeoutMs === 1000 && p.transmitDelayMs === 0 && commonComms(p)
/** Port 2 (p9-37): enabled, RTU, slave, transmit delay 0; communications RS232 9600 even 8 1. */
export const port2Ok = (p?: SerialPortConfig): boolean => !!p && p.enabled && p.protocol === 'RTU' && p.mode === 'SLAVE' && p.transmitDelayMs === 0 && commonComms(p)

const datasetsOk = (p: SerialPortConfig | undefined, port: SerialPortId): boolean => {
  const dev = p ? Object.values(p.devices).find(d => d.address === 1) : undefined
  if (!dev) return false
  return DV09_SERIAL_DATASETS[port].every(want => {
    const ds = Object.values(dev.datasets).find(d => d.tag === want.tag)
    return !!ds && ds.name === want.name && ds.direction === want.direction && ds.dataType === want.dataType && ds.plcTable === want.plcTable && ds.plcOffset === want.offset && ds.count === 1
  })
}

const eventIndex = (events: EventLogEntry[], tag: string, re: RegExp, after = -1): number => events.findIndex((e, i) => i > after && e.tag === tag && re.test(e.description))
const lastIndex = (events: EventLogEntry[], tag: string, re: RegExp): number => { for (let i = events.length - 1; i >= 0; i--) if (events[i].tag === tag && re.test(events[i].description)) return i; return -1 }

/** True when a picture holds an element (a dynamo, pump or datalink) bound to the module. */
const pictureHas = (pictures: Record<string, Picture>, tag: string): string | null =>
  Object.values(pictures).find(p => p.elements.some(e => e.tag === tag && (e.type === 'dynamo' || e.type === 'pump' || e.type === 'valve')))?.name ?? null
const pictureSaved = (events: EventLogEntry[], pictures: Record<string, Picture>, tag: string): boolean => {
  const name = pictureHas(pictures, tag)
  return !!name && events.some(e => e.tag === name && /^Picture saved/.test(e.description))
}

/** Course DV-09 Chapter 9 (pp 9-31 .. 9-45): Workshop 1, Modbus Tie-Back, port 1 master to port 2 slave with a serial card in slot 5. */
export function checkDv09Ch9(s: Dv09Ch9State, pictures: Record<string, Picture>): StepCheck[] {
  const hw = s.hardware
  const ctl = Object.values(hw.controllers).find(x => x.trackDownload && x.commissioned)
  const card: SerialCard | undefined = ctl ? Object.values(hw.serialCards ?? {}).find(c => c.controllerTag === ctl.tag && c.slot === 5) : undefined
  const cfg = card?.configured
  const dep = card?.deployed
  const p1 = cfg?.ports.P01, p2 = cfg?.ports.P02
  const dev1 = (p?: SerialPortConfig): boolean => !!p && Object.values(p.devices).some(d => d.address === 1)
  const published = !!dep && ['FLOW-OUT/R40001', 'MTR-OUT/R2', 'FLOW-IN/R40001', 'MTR-IN/R2'].every(name =>
    Object.values(hw.traditionalCards ?? {}).some(c => c.serial?.cardId === card!.id && c.channels.some(ch => ch.dst === name)))
  const downloaded = !!card && !!dep && JSON.stringify(dep) === JSON.stringify(cfg) && published

  const mtr = s.modules['MTR-MODBUS']
  const mtrRec = s.deviceLifecycle['MTR-MODBUS']
  const mtrBound = hw.deviceBindings?.['MTR-MODBUS']
  const mtrIo = !!mtrBound && mtrBound.input === 'MTR-IN/R2' && mtrBound.output === 'MTR-OUT/R2'
  const mtrDeployedAt = eventIndex(s.eventLog, 'MTR-MODBUS', /Full downloaded to/)
  const start = mtrDeployedAt >= 0 ? eventIndex(s.eventLog, 'MTR-MODBUS', /^Start command issued/, mtrDeployedAt) : -1
  const stop = start >= 0 ? eventIndex(s.eventLog, 'MTR-MODBUS', /^Stop command issued/, start) : -1

  const fic = s.modules['FIC-MODBUS']
  const ficRec = s.pidLifecycle['FIC-MODBUS']
  const ficBound = hw.analogBindings?.['FIC-MODBUS']
  const ficIo = !!ficBound && ficBound.input === 'FLOW-IN/R40001' && ficBound.output === 'FLOW-OUT/R40001'
  const ficOnlineAt = lastIndex(s.eventLog, 'FIC-MODBUS', /^PID_LOOP placed Online/)
  const ficWrite = ficOnlineAt >= 0 ? s.eventLog.findIndex((e, i) => i > ficOnlineAt && e.tag === 'FIC-MODBUS' && /^(OUT set to|Setpoint|SP set|Mode set to)/.test(e.description)) : -1
  const reg = card?.runtime.memory.P02?.['1']?.['HOLDING_REGISTERS:0']
  const flowIn = Object.values(hw.traditionalCards ?? {}).filter(c => c.serial?.cardId === card?.id).flatMap(c => c.channels).find(ch => ch.dst === 'FLOW-IN/R40001')
  const ficLoop = ficWrite >= 0 && !!flowIn && !flowIn.bad && reg !== undefined && flowIn.value === reg && !!fic && (fic as { pvBad?: boolean }).pvBad === false

  return [
    check('dv09-9w-1', !!cfg?.tieback, cfg?.tieback ? 'Port 1 is wired to Port 2 (tie-back cable)' : 'Wire Port 1 to Port 2 (Physical Network display, serial card, Wire Port 1 to Port 2)'),
    check('dv09-9w-3', !!card && !!ctl, card ? `Serial card ${card.id} is defined in slot 5` : 'Define the Serial card in slot 5 of your controller (I/O > New Card)'),
    check('dv09-9w-4', port1Ok(p1), port1Ok(p1) ? 'P01: enabled, RTU, master, retry 1, time out 1000 ms, delay 0, RS232 9600 even 8 1' : 'P01 properties do not match the p9-36 list yet'),
    check('dv09-9w-5', port2Ok(p2), port2Ok(p2) ? 'P02: enabled, RTU, slave, delay 0, RS232 9600 even 8 1' : 'P02 properties do not match the p9-37 list yet'),
    check('dv09-9w-6', dev1(p1), dev1(p1) ? 'Port 1 has a serial device at address 1' : 'Port 1 needs a serial device at address 1'),
    check('dv09-9w-7', datasetsOk(p1, 'P01'), datasetsOk(p1, 'P01') ? 'P01/DEV01: DS01 FLOW-OUT (holding registers, offset 0) and DS02 MTR-OUT (coils, offset 1), outputs' : 'The two output datasets of p9-39 are not defined on the Port 1 device yet'),
    check('dv09-9w-8', dev1(p2), dev1(p2) ? 'Port 2 has a serial device at address 1' : 'Port 2 needs a serial device at address 1'),
    check('dv09-9w-9', datasetsOk(p2, 'P02'), datasetsOk(p2, 'P02') ? 'P02/DEV01: DS01 FLOW-IN and DS02 MTR-IN, inputs' : 'The two input datasets of p9-41 are not defined on the Port 2 device yet'),
    check('dv09-9w-10', downloaded, downloaded ? 'Serial card downloaded; FLOW-OUT/R40001, MTR-OUT/R2, FLOW-IN/R40001 and MTR-IN/R2 are published' : 'Download the serial card after configuring it (the downloaded configuration must equal the configured one)'),
    check('dv09-9m-1', !!mtr && mtr.type === 'MOTOR' && mtr.area === 'PLANT_AREA_A', mtr ? `${mtr.tag} is a motor module in ${mtr.area}` : 'MTR-MODBUS does not exist in PLANT_AREA_A yet'),
    check('dv09-9m-3', mtrIo, mtrIo ? 'IO_IN_1 = MTR-IN/R2 and IO_OUT_1 = MTR-OUT/R2' : 'IO_IN_1 / IO_OUT_1 of MTR-MODBUS are not bound to MTR-IN/R2 and MTR-OUT/R2 yet'),
    check('dv09-9m-4', !!mtrRec && (mtrRec.deployed?.controllerTag ?? mtrRec.draft.controllerTag) === ctl?.tag && !!ctl, 'MTR-MODBUS is assigned to the controller'),
    check('dv09-9m-5', !!mtrRec?.saved && !!mtrRec.deployed && mtrIo, mtrRec?.deployed ? 'MTR-MODBUS saved and downloaded' : 'Save and download MTR-MODBUS'),
    check('dv09-9m-6', !!pictureHas(pictures, 'MTR-MODBUS'), pictureHas(pictures, 'MTR-MODBUS') ? `Display ${pictureHas(pictures, 'MTR-MODBUS')} holds a pump dynamo for MTR-MODBUS` : 'No display holds a dynamo bound to MTR-MODBUS yet'),
    check('dv09-9m-7', pictureSaved(s.eventLog, pictures, 'MTR-MODBUS'), 'The display with the MTR-MODBUS dynamo was saved'),
    check('dv09-9m-8', start >= 0 && stop >= 0, start >= 0 && stop >= 0 ? 'MTR-MODBUS was started and stopped after its download' : 'Start and stop MTR-MODBUS from the display after it is downloaded'),
    check('dv09-9f-1', !!fic && fic.type === 'PID' && fic.area === 'PLANT_AREA_A', fic ? `${fic.tag} is a PID loop in ${fic.area}` : 'FIC-MODBUS does not exist in PLANT_AREA_A yet'),
    check('dv09-9f-3', ficIo, ficIo ? 'IO_IN = FLOW-IN/R40001 and IO_OUT = FLOW-OUT/R40001' : 'IO_IN / IO_OUT of FIC-MODBUS are not bound to FLOW-IN/R40001 and FLOW-OUT/R40001 yet'),
    check('dv09-9f-4', !!ficRec && (ficRec.deployed?.controllerTag ?? ficRec.draft.controllerTag) === ctl?.tag && !!ctl, 'FIC-MODBUS is assigned to the controller'),
    check('dv09-9f-5', !!ficRec?.saved && !!ficRec.deployed && ficIo, ficRec?.deployed ? 'FIC-MODBUS saved and downloaded' : 'Save and download FIC-MODBUS'),
    check('dv09-9f-6', !!pictureHas(pictures, 'FIC-MODBUS'), pictureHas(pictures, 'FIC-MODBUS') ? `Display ${pictureHas(pictures, 'FIC-MODBUS')} holds a loop dynamo for FIC-MODBUS` : 'No display holds a dynamo bound to FIC-MODBUS yet'),
    check('dv09-9f-7', pictureSaved(s.eventLog, pictures, 'FIC-MODBUS'), 'The display with the FIC-MODBUS dynamo was saved'),
    check('dv09-9f-8', ficLoop, ficLoop ? `FIC-MODBUS is online, an operator write was made and the PV (register ${reg}) follows the holding register 40001 written through the tie-back` : 'Operate FIC-MODBUS (mode, SP or OUT) so that its output travels through holding register 40001 and returns as the PV')
  ]
}

