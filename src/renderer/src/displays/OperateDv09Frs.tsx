import { useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../engine/store'
import { usePictures } from '../engine/pictureStore'
import { addAnimDynamo } from '../engine/dv09OperateEx'
import { SimulatorDialog } from '../components/SimulatorDialog'

// Course DV-09 chapter 9: the frsModules dynamo set. Dropping DL_PMP_HLR_ (pump) or PID_LOOP_1_ (loop) on a picture asks for the
// Dynamo Properties substitution DVSYS.<module>; OK places the dynamo bound to that module.

export const FRS_ITEMS = ['DL_PMP_HLR_', 'PID_LOOP_1_']

interface Pending { pic: string; item: string; x: number; y: number }
export const useFrsUi = create<{ pending: Pending | null }>(() => ({ pending: null }))

export const askFrsProperties = (p: Pending): void => useFrsUi.setState({ pending: p })

export function FrsDynamoDialog({ onMessage, onPlaced }: { onMessage: (m: string) => void; onPlaced: (pic: string) => void }): JSX.Element | null {
  const pending = useFrsUi(s => s.pending)
  const [text, setText] = useState('DVSYS.')
  const [error, setError] = useState<string | null>(null)
  if (!pending) return null
  const close = (): void => { useFrsUi.setState({ pending: null }); setText('DVSYS.'); setError(null) }
  const pump = pending.item === 'DL_PMP_HLR_'
  const ok = (): void => {
    const m = /^DVSYS\.([^/\s]+)$/i.exec(text.trim())
    if (!m) { setError('Enter the module as DVSYS.<module name>'); return }
    const mod = useStore.getState().modules[m[1].toUpperCase()]
    if (!mod) { setError(`Module ${m[1]} does not exist in the database`); return }
    if (pump ? mod.type !== 'MOTOR' : mod.type !== 'PID') { setError(`${pending.item} needs a ${pump ? 'motor' : 'PID loop'} module`); return }
    let e: string | null
    if (pump) e = addAnimDynamo(pending.pic, 'PUMPS_ANIM', pending.x, pending.y, mod.tag)
    else {
      const id = usePictures.getState().addElement(pending.pic, { type: 'dynamo', x: pending.x, y: pending.y, tag: mod.tag })
      e = id ? null : 'The dynamo was not added (see the Event Journal)'
      if (!e) useStore.getState().logEvent('CONFIGURE', pending.pic, `Dynamo ${pending.item} added (DVSYS.${mod.tag})`)
    }
    if (e) { setError(e); return }
    useStore.getState().logEvent('CONFIGURE', pending.pic, `Dynamo ${pending.item} from the frsModules set: Dynamo Properties DVSYS.${mod.tag}`)
    onMessage(`${pending.item} added (DVSYS.${mod.tag})`)
    onPlaced(pending.pic)
    close()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Dynamo Properties" onClose={close}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Dynamo {pending.item} (frsModules)</p>
      <label>Substitution (module):<input aria-label="Substitution" value={text} autoFocus onChange={e => { setText(e.target.value); setError(null) }} placeholder="DVSYS.MODULE" /></label>
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={ok}>OK</button><button className="tbtn sm" onClick={close}>Cancel</button></div>
  </SimulatorDialog>
}
