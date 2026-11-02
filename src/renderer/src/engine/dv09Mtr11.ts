import { useStore } from './store'
import { useDv09Cm, nameInUse, log, fail, patchModule, type Dv09Cm } from './dv09Cm'
import { requireUnlockedKey } from './security'

// Course DV-09 chapter 9 (Modbus tie-back, MTR-MODBUS): Library > ModuleTemplates > Motors-2State > MTR-11 dropped on a plant area.
// MTR-11 is the single-speed motor starter without the interlock blocks of MTR-11_ILOCK: one Device Control block (DC1) with
// IO_IN_1 / IO_OUT_1, so the motor starts from the operator without a permissive.

export const MTR11 = 'MTR-11'

export function createMtr11(area: string): { tag: string } | { error: string } {
  const s = useStore.getState()
  if (!s.areas.includes(area)) return { error: fail(MTR11, `Area ${area} does not exist`) }
  let tag = MTR11
  for (let n = 1; nameInUse(tag); n++) tag = `${MTR11}${n}`
  if (!requireUnlockedKey('CAN_CONFIGURE', `Create module ${tag}`)) return { error: 'Requires the Can Configure key' }
  if (!s.createModule({ tag, type: 'MOTOR', description: 'Two-state motor', area })) return { error: 'The module could not be created (see the Event Journal)' }
  patchModule(tag, { downloaded: false, permissiveRequired: false, resetRequired: false })
  const inherited = Object.values(useDv09Cm.getState().cms).find(c => c.filters.length)?.filters ?? ['Quick Configuration', 'Common Configuration']
  const cm: Dv09Cm = { tag, description: 'Two-state motor', area, template: MTR11, blocks: [{ name: 'DC1', type: 'DC' }], filters: inherited, loop: { passiveWhenConfirmed: false, interlockOption: false, detailDefault: '' } }
  useDv09Cm.setState(st => ({ cms: { ...st.cms, [tag]: cm } }))
  log(tag, `Module created from template ${MTR11}`)
  return { tag }
}
