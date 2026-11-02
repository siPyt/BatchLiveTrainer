import { useUi } from './uiStore'
import { useWindows } from './windowStore'
import { useOperate, logOperate, ensureStandardPictures, pictureKey } from '../engine/dv09Operate'
import { resolvePictureTarget, usePictures } from '../engine/pictureStore'
import { useStore } from '../engine/store'

// Course DV-09 chapter 3: launching DeltaV Operate. In class DV-09 the 7016 Process display is hidden, so every "Operate" button
// (Explorer toolbar, Applications > DeltaV Operate, the Process ribbon button) opens DeltaV Operate (Run) on the student's pictures.

/** Launch DeltaV Operate as its own window: the Explorer window is minimized (still in the tray) like a separate application. */
export function openOperate(mode: 'run' | 'configure', picture?: string): void {
  ensureStandardPictures()
  const windows = useWindows.getState()
  if (windows.wins.explorer.open && !windows.wins.explorer.minimized) windows.minimize('explorer')
  if (windows.wins.studio.open && !windows.wins.studio.minimized) windows.minimize('studio')
  logOperate('DeltaV Operate launched')
  if (mode === 'configure') logOperate('Operate switched to Configure')
  useOperate.setState({ mode })
  const key = picture ? pictureKey(picture) : null
  if (key && usePictures.getState().pictures[key]) useOperate.setState(s => ({ open: s.open.includes(key) ? s.open : [...s.open, key], active: key }))
  useUi.getState().navigate('builder')
}

/** Run mode: follow a Previous / Next Picture link of a picture (or the Overview / alarmList targets). */
export function followPictureLink(from: string, which: 'Previous' | 'Next', name: string | undefined): void {
  const pictures = usePictures.getState().pictures
  const target = resolvePictureTarget(name ?? '', pictures)
  if (!name || !target) {
    const message = `Navigation picture not found: ${name || '(not configured)'}`
    useStore.getState().logEvent('DIAGNOSTIC', from, message)
    window.alert(message)
    return
  }
  useStore.getState().logEvent('DIAGNOSTIC', from, `Picture navigation: ${which} Picture to ${name}`)
  if (target.kind === 'display') { useUi.getState().navigate(target.display); return }
  useOperate.setState(s => ({ mode: 'run', open: s.open.includes(target.name) ? s.open : [...s.open, target.name], active: target.name }))
}
