import { useState } from 'react'
import { create } from 'zustand'
import { SimulatorDialog } from './SimulatorDialog'
import { useStore } from '../engine/store'
import { useSecurity } from '../engine/security'
import { exportConfiguration } from '../engine/projectTransfer'
import { EXPORT_KIND_LABEL, type ExportKind } from '../engine/projectExport'

// Course DV-09 chapter 8 in DeltaV Explorer: Physical Network / Control Strategies / Named Set > Export (pp 8-56 .. 8-60, the file is
// saved to the removable drive chosen in the Save dialog) and Control Network > PROPLUS > Download > Workstation (Defining Users, Step 3).

export type SecDlg = { t: 'export'; kind: ExportKind; names: string[] } | { t: 'workstation' } | { t: 'esig'; tag: string } | null
export const useSecUi = create<{ dlg: SecDlg; open: (d: NonNullable<SecDlg>) => void; close: () => void }>(set => ({ dlg: null, open: dlg => set({ dlg }), close: () => set({ dlg: null }) }))

export function saveExportFile(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const DRIVES = ['Removable Disk (E:)', 'Removable Disk (A:)', 'Local Disk (C:)']
const objectName = (kind: ExportKind, names: string[]): string => kind === 'physical-network' ? 'Physical Network' : kind === 'control-strategies' ? 'Control Strategies' : names.join(', ')

/** The Save dialog of the export workshop: choose the destination drive and click Save. */
function ExportDialog({ kind, names, onClose }: { kind: ExportKind; names: string[]; onClose: () => void }): JSX.Element {
  const [drive, setDrive] = useState(DRIVES[0])
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const label = kind === 'named-sets' ? `Named Sets ${names.join(', ')}` : EXPORT_KIND_LABEL[kind]
  const save = (): void => {
    const r = exportConfiguration(kind, names)
    if ('error' in r) { setResult({ ok: false, text: r.error }); return }
    saveExportFile(r.text, r.fileName)
    setResult({ ok: true, text: `${label} exported to ${drive}\\${r.fileName}` })
  }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Export ${objectName(kind, names)}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Export <b>{label}</b> from the configuration database.</p>
      <label>Save in:<select aria-label="Save in" value={drive} onChange={e => setDrive(e.target.value)}>{DRIVES.map(d => <option key={d}>{d}</option>)}</select></label>
      <label>File name:<input aria-label="File name" readOnly value={`${objectName(kind, names).replace(/[\s,]+/g, kind === 'named-sets' ? '+' : '')}.batchlive-export.json`} /></label>
      <label>Save as type:<select aria-label="Save as type" disabled><option>BatchLive export package (*.batchlive-export.json)</option></select></label>
      <p className="exp-hint">The package is a BatchLive file, not a native DeltaV .fhx export; choose a removable drive as the destination.</p>
      {result && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? undefined : 'lib-dlg-error'} data-export-result>{result.text}</p>}
    </div>
    <div className="dvd-buttons">{result?.ok ? <button className="tbtn sm" onClick={onClose}>Close</button> : <><button className="tbtn sm" onClick={save}>Save</button><button className="tbtn sm" onClick={onClose}>Cancel</button></>}</div>
  </SimulatorDialog>
}

/** PROPLUS > Download > Workstation: the security data (users, groups, key assignments) is copied to the workstation. */
function WorkstationDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const logEvent = useStore(s => s.logEvent)
  const pending = useSecurity(s => s.workstationPending())
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (): void => {
    const e = useSecurity.getState().downloadWorkstation()
    if (e) { setResult({ ok: false, text: useSecurity.getState().lastDenied?.replace(/^Access Denied — /, '') ?? e }); return }
    const s = useSecurity.getState()
    logEvent('CONFIGURE', 'PROPLUS', `Workstation download complete: ${s.users.length} user(s), ${s.groups.length} group(s), ${Object.keys(s.lockAssignments).length} lock assignment(s)`)
    setResult({ ok: true, text: `Download of PROPLUS completed: ${s.users.length} user(s) and ${s.groups.length} group(s), 0 Error(s).` })
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Download Workstation PROPLUS" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      {result ? <p role={result.ok ? 'status' : 'alert'} className={result.ok ? undefined : 'lib-dlg-error'} data-download-done={result.ok ? '' : undefined}>{result.text}</p> : <>
        <p>Download the workstation <b>PROPLUS</b>? The users, groups and key assignments of the User Manager are sent to the workstation; a user created or changed afterwards cannot log on until the next download.</p>
        <p className="exp-hint" data-workstation-pending={pending}>{pending ? 'The workstation does not match the configured security data (download required).' : 'The workstation already matches the configured security data.'}</p></>}
    </div>
    <div className="dvd-buttons">{result?.ok ? <button className="tbtn sm" onClick={onClose}>Close</button> : <><button className="tbtn sm" onClick={run}>Yes</button><button className="tbtn sm" onClick={onClose}>No</button></>}</div>
  </SimulatorDialog>
}

/** Right-click a module > Electronic Signature (p8-41): browse for the policy that is tied to the module. */
function SignatureDialog({ tag, onClose }: { tag: string; onClose: () => void }): JSX.Element {
  const signature = useStore(s => s.signature)
  const setPolicy = useStore(s => s.setModuleSignaturePolicy)
  const [policy, setPick] = useState(signature.modules[tag] ?? '')
  const [error, setError] = useState<string | null>(null)
  const names = Object.keys(signature.policies)
  const submit = (): void => { if (!setPolicy(tag, policy || undefined)) { setError(useSecurity.getState().lastDenied?.replace(/^Access Denied — /, '') ?? 'The policy could not be associated'); return }; onClose() }
  return <SimulatorDialog className="module-download-dialog dvd" label={`Electronic Signature ${tag}`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <p>Select the signature policy that applies to <b>{tag}</b>.</p>
      <ul className="dvd-list" aria-label="Signature policies" style={{ listStyle: 'none', margin: 0, padding: 2 }}>
        <li><label className="lib-dlg-check"><input type="radio" name="policy" checked={policy === ''} onChange={() => setPick('')} /> (none)</label></li>
        {names.map(n => <li key={n}><label className="lib-dlg-check"><input type="radio" name="policy" aria-label={n} checked={policy === n} onChange={() => setPick(n)} /> {n}</label></li>)}
      </ul>
      {names.length === 0 && <p className="exp-hint">No signature policy exists yet: create one under Setup &gt; Electronic Signatures.</p>}
      {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    </div>
    <div className="dvd-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
  </SimulatorDialog>
}

export function SecurityDialogHost(): JSX.Element | null {
  const dlg = useSecUi(s => s.dlg)
  const close = useSecUi(s => s.close)
  if (!dlg) return null
  return <>
    {dlg.t === 'export' && <ExportDialog key={`${dlg.kind}:${dlg.names.join(',')}`} kind={dlg.kind} names={dlg.names} onClose={close} />}
    {dlg.t === 'workstation' && <WorkstationDialog onClose={close} />}
    {dlg.t === 'esig' && <SignatureDialog key={dlg.tag} tag={dlg.tag} onClose={close} />}
  </>
}
