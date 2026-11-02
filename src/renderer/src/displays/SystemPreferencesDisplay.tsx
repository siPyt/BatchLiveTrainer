import { useEffect, useState } from 'react'
import { useSystem, SYSTEM_FEATURES, type SystemFeature } from '../engine/systemPreferences'
import { useSecurity } from '../engine/security'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { SimulatorPanel } from '../components/SimulatorPanel'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { useVc } from '../engine/versionControl'
import { useVcUi } from '../components/VersionControlUi'
import '../dv09-chapters.css'

// Course 7016 pp 3-6..3-9 (DV09-108/109): the DeltaV System Preferences dialog (DeltaV -> Engineering -> System
// Preferences) and the DeltaV Database Administrator (File -> Shutdown Server / Connect to Server, status bar).
// Course DV-09 pp 12-4 .. 12-14: the Start > DeltaV > Engineering menu opens each application; the OK button of System
// Preferences shows the restart message box and the Database Administrator asks before it shuts the server down.

const HELP = [
  'Enabling or disabling a function will cause the DeltaV applications to reveal or conceal the applicable menus and choices. Any configuration that may exist for an item that is disabled will become inaccessible, but the data will be retained in the database.',
  'DeltaV database server must be restarted for the changes to be effective. The Operator Stations and Application Stations will synchronize the setting with this workstation during DeltaV login.',
  'For DeltaV Version Control users: if you enable functionality after enabling Version Control, you need to run Version Control Sync Database in DeltaV Database Administrator.'
]

const HELP_DV09 = [
  'Enabling or disabling a feature will cause the DeltaV applications to reveal or conceal the applicable menus and choices. Any configuration that may exist for a disabled feature will remain visible and the data will be retained in the database.',
  'The DeltaV database server must be restarted for the changes to be effective. The DeltaV workstations will synchronize their settings with the ProPlus at login.',
  'For DeltaV Version Control users: If you enable a feature, after enabling Version Control, you need to run Version Control Sync Database from the Database Administration panel.'
]

/** The dialog's check boxes in slide order; null = shown for fidelity but not modeled by BatchLiveTrainer. */
const ENTRIES: [string, SystemFeature | null][] = [
  ['Enable Batch', 'batch'],
  ['Enable Advanced Unit Management', 'advancedUnitManagement'],
  ['Enable Fieldbus', 'fieldbus'],
  ['Enable Profibus DP', null],
  ['Enable AS-Interface', null],
  ['Enable DeviceNet', null],
  ['Enable RS3 I/O', null],
  ['Enable Provox I/O', null],
  ['Enable Asset Optimization Alarms', null],
  ['Enable Remote I/O', null],
  ['Enable Electronic Signatures', 'signaturePolicies'],
  ['Enable DeltaV SIS', null]
]

/** Course DV-09 p12-10: the dialog as the manual shows it. */
const ENTRIES_DV09: [string, SystemFeature | null][] = [
  ['Enable Batch', 'batch'],
  ['Enable Advanced Unit Management', 'advancedUnitManagement'],
  ['Enable Fieldbus', 'fieldbus'],
  ['Enable Profibus DP', null],
  ['Enable AS-Interface', null],
  ['Enable DeviceNet', null],
  ['Enable RS3 I/O', null],
  ['Enable Provox I/O', null],
  ['Enable Asset Optimization Alarms', null],
  ['Enable Remote I/O', null],
  ['Enable Signature Policies', 'signaturePolicies'],
  ['Enable DeltaV SIS', null],
  ['Enable Zones', null],
  ['Enable Wireless I/O', null],
  ['Enable Simulation Download', null]
]

const DB_ICONS = ['Create Database', 'Delete Database', 'Copy Database', 'Rename Database', 'Sync Workstations', 'Backup & Restore', 'Set Server Host', 'Set Active Database',
  'Register Database from File', 'Clean Database', 'Database Connections', 'Version Control Configuration', 'Version Control Snapshot', 'Version Control Synchronize', 'Daily Export Enable or Disable', 'Migrate Configuration']

export function SystemPreferencesDisplay(): JSX.Element {
  const dv09 = useUi((s) => s.course) === 'DV-09'
  const entries = dv09 ? ENTRIES_DV09 : ENTRIES
  const helpText = dv09 ? HELP_DV09 : HELP
  const features = useSystem((s) => s.features)
  const pending = useSystem((s) => s.pending)
  const serverState = useSystem((s) => s.serverState)
  const restarts = useSystem((s) => s.restarts)
  const clients = useSystem((s) => s.clients)
  const setPending = useSystem((s) => s.setPendingFeature)
  const acknowledge = useSystem((s) => s.acknowledgePending)
  const shutdown = useSystem((s) => s.shutdownServer)
  const connect = useSystem((s) => s.connectServer)
  const closeClient = useSystem((s) => s.closeClient)
  const closeAll = useSystem((s) => s.closeAllClients)
  const isAdmin = useSecurity((s) => s.hasLock('SYSTEM_ADMIN'))
  const vcEnabled = useVc((s) => s.enabled)
  const vcOpen = useVcUi((s) => s.open)
  const selected = (f: SystemFeature): boolean => pending[f] ?? features[f]
  const current = (): Record<SystemFeature, boolean> => Object.fromEntries(SYSTEM_FEATURES.map(f => [f, selected(f)])) as Record<SystemFeature, boolean>
  const [draft, setDraft] = useState<Record<SystemFeature, boolean>>(current)
  const [message, setMessage] = useState<string | null>(null)
  const [fileMenu, setFileMenu] = useState(false)
  // Course DV-09: the applications are opened from Start > DeltaV > Engineering; the restart message box and the shutdown question are dialogs of their own.
  const [startMenu, setStartMenu] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(!dv09)
  const [dbOpen, setDbOpen] = useState(!dv09)
  const [msgBox, setMsgBox] = useState(false)
  const [shutdownAsk, setShutdownAsk] = useState(false)
  const [force, setForce] = useState(false)
  const logEvent = useStore((s) => s.logEvent)
  const launch = (which: 'prefs' | 'db'): void => {
    setStartMenu(false)
    if (which === 'prefs') { setPrefsOpen(true); logEvent('DIAGNOSTIC', 'System Preferences', 'DeltaV System Preferences opened') }
    else { setDbOpen(true); logEvent('DIAGNOSTIC', 'Database Administrator', 'DeltaV Database Administrator opened') }
  }
  const key = JSON.stringify([features, pending])
  useEffect(() => { setDraft(current()) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (f: SystemFeature, on: boolean): void => {
    if (f === 'advancedUnitManagement' && !on && draft.batch) { setMessage('Advanced Unit Management is required while Enable Batch is selected'); return }
    // p3-7: selecting Enable Batch automatically selects Advanced Unit Management.
    setDraft(d => ({ ...d, [f]: on, ...(f === 'batch' && on ? { advancedUnitManagement: true } : {}) }))
    setMessage(null)
  }
  const ok = (): void => {
    const order: SystemFeature[] = ['batch', ...SYSTEM_FEATURES.filter(f => f !== 'batch')]
    for (const f of order) {
      if (draft[f] === selected(f)) continue
      const e = setPending(f, draft[f])
      if (e) { setMessage(e); return }
    }
    if (Object.keys(useSystem.getState().pending).length) {
      // Course DV-09 Step 3 (p12-11): the message box must be answered with OK; that acknowledges the change.
      if (dv09) { setMsgBox(true); setMessage(null); return }
      const e = acknowledge()
      setMessage(e ?? 'The DeltaV database server must be restarted for the changes to be effective: DeltaV Database Administrator → File → Shutdown Server, then File → Connect to Server.')
    } else setMessage(null)
  }
  const pendingNames = entries.filter(([, f]) => f && f in pending).map(([label]) => label)
  const run = (fn: () => string | null): void => { setFileMenu(false); setMessage(fn()) }
  const confirmShutdown = (): void => {
    setShutdownAsk(false)
    if (force) closeAll()
    setMessage(shutdown())
    setForce(false)
  }

  return (
    <div className="display system-preferences sp-page">
      {dv09 && <div className="sp-menu sp-start" data-start-menu>
        <button className="tbtn sm" aria-haspopup="menu" aria-expanded={startMenu} onClick={() => setStartMenu(v => !v)}>Start ▸ DeltaV ▸ Engineering</button>
        {startMenu && <div className="sp-menu-pop" role="menu" aria-label="Start DeltaV Engineering">
          <button role="menuitem" onClick={() => launch('prefs')}>System Preferences</button>
          <button role="menuitem" onClick={() => launch('db')}>Database Administrator</button>
        </div>}
      </div>}
      {!isAdmin && <p role="note" className="sp-note">Read-only: changing preferences or the server requires the System Admin key.</p>}
      {message && <p role="alert" className="sp-note" data-system-message>{message}</p>}

      {prefsOpen && <section className="sp-window" role="dialog" aria-label="System Preferences" data-system-preferences>
        <div className="sp-titlebar"><span className="sp-title-icon">⚠</span> System Preferences<span className="sp-title-buttons"><span>?</span>
          <span role="button" aria-label="Close System Preferences" onClick={() => dv09 && setPrefsOpen(false)}>×</span></span></div>
        <div className="sp-body">
          <div className="sp-help">{helpText.map(p => <p key={p.slice(0, 20)}>{p}</p>)}</div>
          <div className="sp-checks">
            {entries.map(([label, f]) => (
              <label key={label} className={'sp-check' + (f ? '' : ' sp-unmodeled')} data-feature={f ?? undefined}
                title={f ? undefined : `${label.replace('Enable ', '')} is not modeled in BatchLiveTrainer`}>
                <input type="checkbox" aria-label={label} checked={f ? draft[f] : false} disabled={!f || !isAdmin}
                  onChange={e => f && toggle(f, e.target.checked)} />
                {label}
                {f && f in pending && <span className="sp-pending"> (pending restart)</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="sp-buttons">
          <button className="tbtn sm" disabled={!isAdmin} onClick={ok}>OK</button>
          <button className="tbtn sm" onClick={() => { setDraft(current()); setMessage(null) }}>Cancel</button>
          <button className="tbtn sm" onClick={() => setMessage(helpText.join(' '))}>Help</button>
        </div>
        <div className="sp-state" data-feature-state>
          Active: {entries.filter(([, f]) => f && features[f]).map(([l]) => l.replace('Enable ', '')).join(', ') || 'none'}
          {pendingNames.length > 0 && <> · Pending — takes effect after the server is restarted: {pendingNames.map(l => l.replace('Enable ', '')).join(', ')}</>}
        </div>
      </section>}
      {msgBox && <SimulatorDialog className="module-download-dialog dvd" label="System Preferences" onClose={() => setMsgBox(false)}>
        <div className="lib-dlg-fields dvd-panel"><p>⚠ For these changes to take effect, you must restart the DeltaV Database Server. The Operator Stations and Application Stations will synchronize the setting with this workstation during DeltaV login.</p></div>
        <div className="dvd-buttons"><button className="tbtn sm" onClick={() => { setMsgBox(false); setMessage(acknowledge()) }}>OK</button></div>
      </SimulatorDialog>}
      {shutdownAsk && <SimulatorDialog className="module-download-dialog dvd" label="Shutdown Server" onClose={() => setShutdownAsk(false)}>
        <div className="lib-dlg-fields dvd-panel">
          <p>Shutdown the database server ?</p>
          <label className="lib-dlg-check"><input type="checkbox" aria-label="Force shutdown even if clients are connected" checked={force} onChange={e => setForce(e.target.checked)} /> Force shutdown even if clients are connected</label>
        </div>
        <div className="dvd-buttons"><button className="tbtn sm" onClick={confirmShutdown}>OK</button><button className="tbtn sm" onClick={() => setShutdownAsk(false)}>Cancel</button></div>
      </SimulatorDialog>}

      {dbOpen && <section className="sp-window sp-dbadmin" aria-label="DeltaV Database Administrator" data-database-administrator>
        <div className="sp-titlebar">{dv09 ? 'DeltaV - Database Administration' : 'DeltaV Database Administrator'}</div>
        <div className="sp-menubar">
          <div className="sp-menu">
            <button className="sp-menu-btn" aria-haspopup="menu" aria-expanded={fileMenu} onClick={() => setFileMenu(v => !v)}>File</button>
            {fileMenu && <div className="sp-menu-pop" role="menu" aria-label="File">
              {dv09 && <button role="menuitem" disabled={!isAdmin || serverState !== 'STOPPED'} onClick={() => run(connect)}>Connect to Server</button>}
              <button role="menuitem" disabled={!isAdmin || serverState !== 'RUNNING'} onClick={() => dv09 ? (setFileMenu(false), setShutdownAsk(true)) : run(shutdown)}>{dv09 ? 'Shutdown Server...' : 'Shutdown Server'}</button>
              {!dv09 && <button role="menuitem" disabled={!isAdmin || serverState !== 'STOPPED'} onClick={() => run(connect)}>Connect to Server</button>}
              {dv09 && <button role="menuitem" onClick={() => { setFileMenu(false); setDbOpen(false) }}>Exit</button>}
            </div>}
          </div>
        </div>
        <div className="sp-body sp-db-body">
          {dv09 ? <div className="sp-dbicons" data-db-icons>{DB_ICONS.map(name => <span key={name} title={`${name} is not simulated`}>{name}</span>)}</div>
            : <div>Database: <b>DV_School</b> · restarts this session: {restarts}</div>}
          <div className="sp-clients">
            <div><b>Open database clients</b> — all database clients must be closed to shut down the server.</div>
            {clients.length === 0 ? <div data-clients>None. The database server can be shut down.</div> : <>
              <ul data-clients>{clients.map(name => <li key={name}>{name} <button className="tbtn sm" onClick={() => closeClient(name)}>Close</button></li>)}</ul>
              <button className="tbtn sm" onClick={closeAll}>Close all database clients</button>
            </>}
          </div>
          {serverState === 'STOPPED' && <div>Configuration, download and Explorer changes are unavailable until you connect to the server.</div>}
          {!dv09 && <div className="sp-vc" data-vc-icons>
            <b>Version Control</b> (Database Administrator icons, slides 13-5 .. 13-27)
            <div className="dvd-buttons">
              <button className="tbtn sm" onClick={() => vcOpen({ t: 'config' })}>Version Control Configuration</button>
              <button className="tbtn sm" disabled={!vcEnabled || serverState !== 'RUNNING'} onClick={() => vcOpen({ t: 'snapshot' })}>Version Control Snapshot</button>
              <button className="tbtn sm" disabled={!vcEnabled || serverState !== 'RUNNING'} onClick={() => { const r = useVc.getState().synchronize(); setMessage(r.ok ? `Synchronize Database: ${r.value}` : r.error) }}>Version Control Synchronize Database</button>
              <button className="tbtn sm" disabled={!vcEnabled} onClick={() => vcOpen({ t: 'messages' })}>Version Control Messages</button>
              <button className="tbtn sm" disabled title="Archive, Restore and CleanUpDatabase move Version Control data to archive files; not simulated">Archive / Restore / CleanUp Database</button>
            </div>
          </div>}
        </div>
        <div className="sp-statusbar"><span data-server-state>{dv09 ? (serverState === 'RUNNING' ? 'Database Server is Running.' : 'Database Server is  shutdown.') : serverState === 'RUNNING' ? 'Database Server is Running' : 'Database Server is Shutdown'}</span></div>
      </section>}

      <SimulatorPanel />
    </div>
  )
}
