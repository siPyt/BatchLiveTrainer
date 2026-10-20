import { useEffect, useState } from 'react'
import { useSystem, SYSTEM_FEATURES, type SystemFeature } from '../engine/systemPreferences'
import { useSecurity } from '../engine/security'
import { SimulatorPanel } from '../components/SimulatorPanel'

// Course 7016 pp 3-6..3-9 (DV09-108/109): the DeltaV System Preferences dialog (DeltaV -> Engineering -> System
// Preferences) and the DeltaV Database Administrator (File -> Shutdown Server / Connect to Server, status bar).

const HELP = [
  'Enabling or disabling a function will cause the DeltaV applications to reveal or conceal the applicable menus and choices. Any configuration that may exist for an item that is disabled will become inaccessible, but the data will be retained in the database.',
  'DeltaV database server must be restarted for the changes to be effective. The Operator Stations and Application Stations will synchronize the setting with this workstation during DeltaV login.',
  'For DeltaV Version Control users: if you enable functionality after enabling Version Control, you need to run Version Control Sync Database in DeltaV Database Administrator.'
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

export function SystemPreferencesDisplay(): JSX.Element {
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
  const selected = (f: SystemFeature): boolean => pending[f] ?? features[f]
  const current = (): Record<SystemFeature, boolean> => Object.fromEntries(SYSTEM_FEATURES.map(f => [f, selected(f)])) as Record<SystemFeature, boolean>
  const [draft, setDraft] = useState<Record<SystemFeature, boolean>>(current)
  const [message, setMessage] = useState<string | null>(null)
  const [fileMenu, setFileMenu] = useState(false)
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
      const e = acknowledge()
      setMessage(e ?? 'The DeltaV database server must be restarted for the changes to be effective: DeltaV Database Administrator → File → Shutdown Server, then File → Connect to Server.')
    } else setMessage(null)
  }
  const pendingNames = ENTRIES.filter(([, f]) => f && f in pending).map(([label]) => label)
  const run = (fn: () => string | null): void => { setFileMenu(false); setMessage(fn()) }

  return (
    <div className="display system-preferences sp-page">
      {!isAdmin && <p role="note" className="sp-note">Read-only: changing preferences or the server requires the System Admin key.</p>}
      {message && <p role="alert" className="sp-note" data-system-message>{message}</p>}

      <section className="sp-window" role="dialog" aria-label="System Preferences" data-system-preferences>
        <div className="sp-titlebar"><span className="sp-title-icon">⚠</span> System Preferences<span className="sp-title-buttons"><span>?</span><span>×</span></span></div>
        <div className="sp-body">
          <div className="sp-help">{HELP.map(p => <p key={p.slice(0, 20)}>{p}</p>)}</div>
          <div className="sp-checks">
            {ENTRIES.map(([label, f]) => (
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
          <button className="tbtn sm" onClick={() => setMessage(HELP.join(' '))}>Help</button>
        </div>
        <div className="sp-state" data-feature-state>
          Active: {ENTRIES.filter(([, f]) => f && features[f]).map(([l]) => l.replace('Enable ', '')).join(', ') || 'none'}
          {pendingNames.length > 0 && <> · Pending — takes effect after the server is restarted: {pendingNames.map(l => l.replace('Enable ', '')).join(', ')}</>}
        </div>
      </section>

      <section className="sp-window sp-dbadmin" aria-label="DeltaV Database Administrator" data-database-administrator>
        <div className="sp-titlebar">DeltaV Database Administrator</div>
        <div className="sp-menubar">
          <div className="sp-menu">
            <button className="sp-menu-btn" aria-haspopup="menu" aria-expanded={fileMenu} onClick={() => setFileMenu(v => !v)}>File</button>
            {fileMenu && <div className="sp-menu-pop" role="menu" aria-label="File">
              <button role="menuitem" disabled={!isAdmin || serverState !== 'RUNNING'} onClick={() => run(shutdown)}>Shutdown Server</button>
              <button role="menuitem" disabled={!isAdmin || serverState !== 'STOPPED'} onClick={() => run(connect)}>Connect to Server</button>
            </div>}
          </div>
        </div>
        <div className="sp-body sp-db-body">
          <div>Database: <b>DV_School</b> · restarts this session: {restarts}</div>
          <div className="sp-clients">
            <div><b>Open database clients</b> — all database clients must be closed to shut down the server.</div>
            {clients.length === 0 ? <div data-clients>None. The database server can be shut down.</div> : <>
              <ul data-clients>{clients.map(name => <li key={name}>{name} <button className="tbtn sm" onClick={() => closeClient(name)}>Close</button></li>)}</ul>
              <button className="tbtn sm" onClick={closeAll}>Close all database clients</button>
            </>}
          </div>
          {serverState === 'STOPPED' && <div>Configuration, download and Explorer changes are unavailable until you connect to the server.</div>}
        </div>
        <div className="sp-statusbar"><span data-server-state>{serverState === 'RUNNING' ? 'Database Server is Running' : 'Database Server is Shutdown'}</span></div>
      </section>

      <SimulatorPanel />
    </div>
  )
}
