import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { usePictures } from '../engine/pictureStore'
import { useOperate } from '../engine/dv09Operate'
import { useStore } from '../engine/store'
import { USER_REF, USER_SETTINGS, saveAsPicture, setPictureScript, runUserSettings } from '../engine/dv09Settings'
import { SimulatorDialog } from './SimulatorDialog'
import { askConfirm } from './AppNotices'

// Course DV-09 chapter 13 (pp 13-27 .. 13-35) in DeltaV Operate (Configure): File > Save As (Standard folder), right-click the picture > Edit Script,
// the script editor with its Find, Save and Workspace Application buttons. Leaving Configure for Run executes the saved UserSettings script
// (DeltaV Operate initialization).

export type UsDialog = 'saveas' | 'script' | null
export const useUsUi = create<{ dlg: UsDialog; open: (d: NonNullable<UsDialog>) => void; close: () => void }>(set => ({ dlg: null, open: dlg => set({ dlg }), close: () => set({ dlg: null }) }))

// Operate initialization: switching from Configure to Run starts DeltaV Operate afresh, so the saved UserSettings picture is executed.
let wired = false
function wireInit(): void {
  if (wired) return
  wired = true
  useOperate.subscribe((s, prev) => { if (prev.mode === 'configure' && s.mode === 'run') runUserSettings() })
}
wireInit()

const label = (key: string): string => (key === USER_REF ? 'User_ref' : key === USER_SETTINGS ? 'UserSettings' : key.charAt(0) + key.slice(1).toLowerCase())

function SaveAsDialog({ from, onClose }: { from: string; onClose: () => void }): JSX.Element {
  const pictures = usePictures(s => s.pictures)
  const [name, setName] = useState(label(from))
  const [error, setError] = useState<string | null>(null)
  const names = Object.keys(pictures).sort()
  const submit = (): void => {
    const e = saveAsPicture(from, name)
    if (e) { setError(e); return }
    const key = name.trim().replace(/\.grf$/i, '').toUpperCase()
    useOperate.setState(s => ({ open: s.open.map(k => (k === from ? key : k)).filter((k, i, a) => a.indexOf(k) === i), active: key }))
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Save As" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Save in:<select aria-label="Save in" value="Standard" onChange={() => undefined}><option>Standard</option></select></label>
      <ul className="us-files" aria-label="Standard folder">{names.map(n => <li key={n}>{label(n)}.grf</li>)}</ul>
      <label>File name:<input aria-label="File name" value={name} onChange={e => { setName(e.target.value); setError(null) }} /></label>
      <label>Save as type:<select aria-label="Save as type" value="Picture(*.grf)" onChange={() => undefined}><option>Picture(*.grf)</option></select></label>
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>Save</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
  </SimulatorDialog>
}

function ScriptEditor({ pic, onClose }: { pic: string; onClose: () => void }): JSX.Element | null {
  const picture = usePictures(s => s.pictures[pic])
  const [text, setText] = useState(picture?.script ?? '')
  const [saved, setSaved] = useState(picture?.script ?? '')
  const [find, setFind] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const from = useRef(0)
  useEffect(() => { useStore.getState().logEvent('DIAGNOSTIC', pic, `Script editor opened: ${label(pic)}.grf (Edit Script)`) }, [pic])
  if (!picture) return null
  const save = (): void => { const e = setPictureScript(pic, text); if (!e) { setSaved(text); setMessage('Script saved') } else setMessage(e) }
  const findNext = (): void => {
    const what = (document.getElementById('us-find-what') as HTMLInputElement | null)?.value ?? ''
    if (!what) return
    const at = text.toLowerCase().indexOf(what.toLowerCase(), from.current)
    const hit = at >= 0 ? at : text.toLowerCase().indexOf(what.toLowerCase())
    if (hit < 0) { setMessage(`Cannot find "${what}"`); return }
    from.current = hit + what.length
    area.current?.focus()
    area.current?.setSelectionRange(hit, hit + what.length)
    setMessage(`Found "${what}"`)
    useStore.getState().logEvent('DIAGNOSTIC', pic, `Script editor Find: ${what}`)
  }
  const workspace = async (): Promise<void> => {
    if (text !== saved && (await askConfirm('The script has been modified. Save the changes?'))) setPictureScript(pic, text)
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide us-script" label={`Script - ${label(pic)}.grf`} onClose={() => void workspace()}>
    <div className="us-toolbar" role="toolbar" aria-label="Script editor toolbar">
      <button className="tbtn sm" aria-label="Save script" title="Save" onClick={save}>💾</button>
      <button className="tbtn sm" aria-label="Find" title="Find" onClick={() => setFind(f => (f === null ? 'options' : null))}>🔍</button>
      <button className="tbtn sm" aria-label="Workspace Application" title="Workspace Application" onClick={() => void workspace()}>Workspace Application</button>
    </div>
    {find !== null && <div className="us-find" role="dialog" aria-label="Find">
      <label>Find what:<input id="us-find-what" aria-label="Find what" value={find} onChange={e => { setFind(e.target.value); from.current = 0 }} /></label>
      <button className="tbtn sm" onClick={findNext}>Find Next</button><button className="tbtn sm" onClick={() => setFind(null)}>Cancel</button>
    </div>}
    <textarea ref={area} className="us-code" aria-label="Script" spellCheck={false} value={text} onChange={e => setText(e.target.value)} rows={26} />
    <p className="exp-hint" role="status" data-script-status>{message || 'Comment lines start with a single quote.'}</p>
  </SimulatorDialog>
}

/** Mount once in DeltaV Operate: the picture context menu entries, Save As and the script editor. */
export function UserSettingsHost({ active, configure, menuAt, closeMenu }: { active: string | null; configure: boolean; menuAt: { x: number; y: number } | null; closeMenu: () => void }): JSX.Element | null {
  const dlg = useUsUi(s => s.dlg)
  const close = useUsUi(s => s.close)
  const open = useUsUi(s => s.open)
  if (!configure || !active) return null
  const item = (text: string, onClick?: () => void, disabled?: string): JSX.Element =>
    <button className="ctx-item" role="menuitem" disabled={!!disabled || !onClick} title={disabled} onClick={() => { closeMenu(); onClick?.() }}>{text}</button>
  return <>
    {menuAt && <div className="ctx-menu dv09-op-ctx" role="menu" aria-label="Picture menu" style={{ left: menuAt.x, top: menuAt.y, position: 'fixed' }} onMouseDown={e => e.stopPropagation()}>
      {item('Animations...', undefined, 'Not modeled')}
      {item('Undo', undefined, 'Nothing to undo')}
      {item('Paste', undefined, 'Not modeled')}
      {item('Select All', undefined, 'Not modeled')}
      {item('Refresh', () => undefined)}
      {item('Property Window...', undefined, 'Select an object first')}
      {item('Edit Script ...', () => open('script'))}
      {item('Enable Scripts', undefined, 'Scripts are always enabled in the trainer')}
    </div>}
    {dlg === 'saveas' && <SaveAsDialog from={active} onClose={close} />}
    {dlg === 'script' && <ScriptEditor key={active} pic={active} onClose={close} />}
  </>
}
