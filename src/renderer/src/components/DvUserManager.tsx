import { useState } from 'react'
import { SimulatorDialog } from './SimulatorDialog'
import { ContextMenu } from './LibraryExplorer'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { ALL_LOCKS, LOCK_HINT, LOCK_LABEL, SITEWIDE_ONLY_LOCKS, useSecurity, type DvGroup, type DvUser, type LockType } from '../engine/security'

// Course DV-09 chapter 8: the DeltaV User Manager window (p8-14: Users, Groups and Locks windows) with the New User dialog
// (General / Advanced / Groups / Keys, pp 8-16 .. 8-23) and Properties for Group (General / Members / Keys, pp 8-24 .. 8-29).

/** null = Sitewide, otherwise the Plant Areas the grant is limited to. */
type Scope = string[] | null
const SITEWIDE = '<Sitewide>'
const scopeLabel = (s: Scope): string => (s === null ? SITEWIDE : s.join(', '))

interface UserDraft {
  name: string; fullName: string; password: string; confirm: string; windowsDesktop: boolean
  disabled: boolean; mustChange: boolean; neverExpires: boolean
  groups: Record<string, Scope>
  keys: Partial<Record<LockType, Scope>>
}
interface GroupDraft { name: string; description: string; members: Record<string, Scope>; keys: LockType[] }

const userDraft = (user: DvUser | undefined, groups: DvGroup[]): UserDraft => ({
  name: user?.name ?? '', fullName: user?.fullName ?? '', password: '', confirm: '', windowsDesktop: !!user?.windowsDesktopAccess,
  disabled: !!user?.disabled, mustChange: !!user?.mustChangePassword, neverExpires: !!user?.passwordNeverExpires,
  groups: Object.fromEntries(groups.filter(g => user && g.members.includes(user.name)).map(g => [g.name, user?.groupScopes?.[g.name] ?? null])),
  keys: Object.fromEntries((user?.locks ?? []).map(l => [l, user?.keyScopes?.[l] ?? null]))
})

function PlantAreaDialog({ areas, note, onOk, onCancel }: { areas: string[]; note?: string; onOk: (area: string | null) => string | null; onCancel: () => void }): JSX.Element {
  const [area, setArea] = useState(SITEWIDE)
  const [error, setError] = useState<string | null>(null)
  return <SimulatorDialog className="module-download-dialog dvum-dialog" label="Plant Area" onClose={onCancel}>
    <div className="dvum-panel" style={{ minHeight: 0, flexDirection: 'column' }}>
      <label className="dvum-col" style={{ flex: 'none' }}>Plant Area:
        <select aria-label="Plant Area" value={area} onChange={e => { setArea(e.target.value); setError(null) }}>
          <option value={SITEWIDE}>{SITEWIDE}</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      <p className="dvum-note">Note: The following keys must be assigned to Sitewide to take effect:<br />&nbsp;&nbsp;Can Configure<br />&nbsp;&nbsp;Can Download<br />&nbsp;&nbsp;Can Calibrate<br />&nbsp;&nbsp;Diagnostic<br />&nbsp;&nbsp;System Admin</p>
      {note && <p className="dvum-note">{note}</p>}
      {error && <p role="alert" className="dvum-error">{error}</p>}
    </div>
    <div className="dvum-foot">
      <button className="dvum-btn" onClick={() => { const e = onOk(area === SITEWIDE ? null : area); if (e) setError(e) }}>OK</button>
      <button className="dvum-btn" onClick={onCancel}>Cancel</button>
    </div>
  </SimulatorDialog>
}

/** Two lists with an Add / Remove pair, used by the Groups tab, the Keys tab and the group Members tab. */
function Picker({ title, items, heading, rows, grantLabel, removeLabel, withArea, areas, onGrant, onRemove, areaNote, ariaPrefix }: {
  title: string; items: string[]; heading: string
  rows: { key: string; label: string; area?: string }[]
  grantLabel: string; removeLabel: string; withArea: boolean; areas: string[]
  onGrant: (item: string, area: string | null) => string | null; onRemove: (key: string) => void
  areaNote?: (item: string) => string | undefined; ariaPrefix: string
}): JSX.Element {
  const [left, setLeft] = useState<string | null>(null)
  const [right, setRight] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const grant = (area: string | null): string | null => { const e = onGrant(left as string, area); if (!e) { setAsk(false); setError(null) } else setError(e); return e }
  const doGrant = (): void => { if (!left) return; if (withArea) setAsk(true); else grant(null) }
  return <>
    <div className="dvum-pick"><div className="dvum-scroll" aria-label={`${ariaPrefix} ${title}`}><table className="dvum-table"><thead><tr><th>{title}</th></tr></thead><tbody>
      {items.map(i => <tr key={i} className={left === i ? 'sel' : undefined} data-pick={i} onClick={() => setLeft(i)} onDoubleClick={() => { setLeft(i); if (withArea) setAsk(true); else onGrant(i, null) }}><td>{i}</td></tr>)}
    </tbody></table></div></div>
    <div className="dvum-mid">
      <button className="dvum-btn" disabled={!left} onClick={doGrant}>{grantLabel}</button>
      <button className="dvum-btn" disabled={!right} onClick={() => { if (right) { onRemove(right); setRight(null) } }}>{removeLabel}</button>
      {error && !ask && <span role="alert" className="dvum-error">{error}</span>}
    </div>
    <div className="dvum-pick"><div className="dvum-scroll" aria-label={`${ariaPrefix} ${heading}`}><table className="dvum-table"><thead><tr><th>{heading}</th>{withArea && <th>Plant Area</th>}</tr></thead><tbody>
      {rows.map(r => <tr key={r.key} className={right === r.key ? 'sel' : undefined} data-has={r.key} onClick={() => setRight(r.key)}><td>{r.label}</td>{withArea && <td>{r.area}</td>}</tr>)}
    </tbody></table></div></div>
    {ask && left && <PlantAreaDialog areas={areas} note={areaNote?.(left)} onOk={grant} onCancel={() => setAsk(false)} />}
  </>
}

function UserDialog({ existing, onClose }: { existing?: DvUser; onClose: () => void }): JSX.Element {
  const sec = useSecurity.getState
  const groups = useSecurity(s => s.groups)
  const areas = useStore(s => s.areas)
  const [tab, setTab] = useState('General')
  const [d, setD] = useState<UserDraft>(() => userDraft(existing, groups))
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<UserDraft>): void => { setD(x => ({ ...x, ...patch })); setError(null) }
  const submit = (): void => {
    const name = d.name.trim()
    if (!name) { setError('Enter a user name'); return }
    if (!existing && sec().users.some(u => u.name.toLowerCase() === name.toLowerCase())) { setError(`User ${name} already exists`); return }
    if (d.password !== d.confirm) { setError('The password and its confirmation do not match'); return }
    if (!existing && !d.password) { setError('Enter a password'); return }
    const fail = (e: string | null): boolean => { if (e) setError(e); return !!e }
    const sitewideKeys = (Object.keys(d.keys) as LockType[]).filter(l => d.keys[l] === null)
    const scoped = (Object.keys(d.keys) as LockType[]).filter(l => d.keys[l] !== null)
    if (!existing) {
      const ok = sec().addUser({ name, fullName: d.fullName, password: d.password, locks: sitewideKeys, windowsDesktopAccess: d.windowsDesktop,
        disabled: d.disabled || undefined, mustChangePassword: d.mustChange || undefined, passwordNeverExpires: d.neverExpires || undefined })
      if (!ok) { setError((sec().lastDenied ?? 'The user could not be created').replace(/^Access Denied — /, '')); return }
    } else {
      if (d.fullName !== existing.fullName && fail(sec().setUserFullName(name, d.fullName))) return
      if (fail(sec().setUserStatus(name, { disabled: d.disabled, mustChangePassword: d.mustChange, passwordNeverExpires: d.neverExpires }))) return
      sec().setUserLocks(name, sitewideKeys)
      sitewideKeys.forEach(l => sec().grantUserKey(name, l, null))
      for (const g of groups) if (g.members.includes(name) && !(g.name in d.groups) && fail(sec().removeGroupMember(g.name, name))) return
    }
    for (const l of scoped) for (const a of d.keys[l] as string[]) if (fail(sec().grantUserKey(name, l, a))) return
    for (const [g, scope] of Object.entries(d.groups)) {
      const member = sec().groups.find(x => x.name === g)?.members.includes(name)
      if (!member && fail(sec().addGroupMember(g, name, null))) return
      if (fail(sec().setMemberAreas(g, name, scope))) return
    }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvum-dialog" label={existing ? `Properties For User: ${existing.name}` : 'New User'} onClose={onClose}>
    <div className="dvum-tabs" role="tablist">{['General', 'Advanced', 'Groups', 'Keys'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="dvum-panel">
      {tab === 'General' && <>
        <div className="dvum-col">
          <label>Name:<input type="text" aria-label="Name" maxLength={20} value={d.name} readOnly={!!existing} onChange={e => set({ name: e.target.value })} /></label>
          <label>Full Name:<input type="text" aria-label="Full Name" value={d.fullName} onChange={e => set({ fullName: e.target.value })} /></label>
          <label>Password:<input type="password" aria-label="Password" value={d.password} disabled={!!existing} onChange={e => set({ password: e.target.value })} /></label>
          <label>Confirm Password:<input type="password" aria-label="Confirm Password" value={d.confirm} disabled={!!existing} onChange={e => set({ confirm: e.target.value })} /></label>
          <label>Operating System (Windows) Description:<textarea aria-label="Operating System (Windows) Description" rows={6} disabled title="The Windows account is not simulated" /></label>
        </div>
        <div className="dvum-col">
          <fieldset className="dvum-group"><legend>Computer/Domain:</legend><select disabled aria-label="Computer/Domain"><option>&lt;Unspecified&gt;</option></select>
            <button className="dvum-btn" disabled style={{ alignSelf: 'flex-end' }}>Manage Domains...</button></fieldset>
          <fieldset className="dvum-group"><legend>Account Type</legend>
            <label className="chk"><input type="checkbox" checked disabled readOnly /> Operating System (Windows) Account</label>
            <label>Role:<select disabled aria-label="Role"><option>Default Role</option></select></label>
            {['DeltaV Administrator', 'DeltaV Batch Historian Administrator', 'DeltaV Batch Historian User', 'DeltaV Event Chronicle Administrator'].map(r =>
              <label key={r} className="chk"><input type="checkbox" disabled title="Windows roles are not simulated" /> {r}</label>)}
            <label className="chk"><input type="checkbox" aria-label="Windows Desktop Access" checked={d.windowsDesktop} onChange={e => set({ windowsDesktop: e.target.checked })} /> Windows Desktop Access</label>
            {['Windows Administrator', 'Allow Terminal Server Logon'].map(r => <label key={r} className="chk"><input type="checkbox" disabled title="Windows roles are not simulated" /> {r}</label>)}
            <label className="chk"><input type="checkbox" checked disabled readOnly aria-label="DeltaV Database Account" /> DeltaV Database Account</label>
          </fieldset>
        </div>
      </>}
      {tab === 'Advanced' && <div className="dvum-col">
        <label>Logon Script:<input type="text" disabled aria-label="Logon Script" /></label>
        <div style={{ display: 'flex', gap: 14 }}>
          <fieldset className="dvum-group" style={{ flex: 1 }}><legend>Account and Password Status</legend>
            <label className="chk"><input type="checkbox" disabled /> Disable Operating System Account</label>
            <label className="chk"><input type="checkbox" aria-label="Disable DeltaV Database Account" checked={d.disabled} onChange={e => set({ disabled: e.target.checked })} /> Disable DeltaV Database Account</label>
            <label className="chk"><input type="checkbox" aria-label="Password Must Change at Next Logon" checked={d.mustChange} onChange={e => set({ mustChange: e.target.checked })} /> Password Must Change at Next Logon</label>
            <label className="chk"><input type="checkbox" disabled /> User Can&apos;t Change Password</label>
            <label className="chk"><input type="checkbox" aria-label="Password Never Expires" checked={d.neverExpires} onChange={e => set({ neverExpires: e.target.checked })} /> Password Never Expires</label>
          </fieldset>
          <fieldset className="dvum-group" style={{ flex: 1 }}><legend>Home Directory</legend>
            <label className="chk"><input type="radio" checked disabled readOnly /> Local <input type="text" disabled /></label>
            <label className="chk"><input type="radio" disabled /> Connect <select disabled><option /></select> To <input type="text" disabled /></label>
          </fieldset>
        </div>
      </div>}
      {tab === 'Groups' && <Picker title="All Groups" heading="Belongs To" ariaPrefix="User" items={groups.map(g => g.name)} withArea areas={areas}
        rows={Object.entries(d.groups).map(([g, s]) => ({ key: g, label: g, area: scopeLabel(s) }))} grantLabel="Add -->" removeLabel="<-- Remove"
        onGrant={(g, area) => { set({ groups: { ...d.groups, [g]: area === null ? null : Array.from(new Set([...(d.groups[g] ?? []), area])) } }); return null }}
        onRemove={g => { const next = { ...d.groups }; delete next[g]; set({ groups: next }) }} />}
      {tab === 'Keys' && <Picker title="All Locks" heading="Has Key for" ariaPrefix="User" items={ALL_LOCKS.map(l => LOCK_LABEL[l]).sort((a, b) => a.localeCompare(b))} withArea areas={areas}
        rows={(Object.keys(d.keys) as LockType[]).sort((a, b) => ALL_LOCKS.indexOf(a) - ALL_LOCKS.indexOf(b)).map(l => ({ key: l, label: LOCK_LABEL[l], area: scopeLabel(d.keys[l] ?? null) }))}
        grantLabel="Grant Key -->" removeLabel="<-- Remove Key"
        onGrant={(label, area) => {
          const lock = ALL_LOCKS.find(l => LOCK_LABEL[l] === label) as LockType
          if (area !== null && SITEWIDE_ONLY_LOCKS.includes(lock)) return `${label} only takes effect when it is assigned Sitewide`
          const have = d.keys[lock]
          set({ keys: { ...d.keys, [lock]: area === null ? null : have === null ? null : Array.from(new Set([...(have ?? []), area])) } })
          return null
        }}
        onRemove={l => { const next = { ...d.keys }; delete next[l as LockType]; set({ keys: next }) }} />}
    </div>
    {error && <p role="alert" className="dvum-error">{error}</p>}
    <div className="dvum-foot">
      <button className="dvum-btn" onClick={submit}>OK</button><button className="dvum-btn" onClick={onClose}>Cancel</button><button className="dvum-btn" disabled title="Not modeled">Help</button>
    </div>
  </SimulatorDialog>
}

function GroupDialog({ existing, onClose }: { existing?: DvGroup; onClose: () => void }): JSX.Element {
  const sec = useSecurity.getState
  const users = useSecurity(s => s.users)
  const areas = useStore(s => s.areas)
  const [tab, setTab] = useState('General')
  const [d, setD] = useState<GroupDraft>(() => ({ name: existing?.name ?? '', description: existing?.description ?? '', keys: existing ? [...existing.locks] : [],
    members: Object.fromEntries((existing?.members ?? []).map(m => [m, users.find(u => u.name === m)?.groupScopes?.[existing?.name ?? ''] ?? null])) }))
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<GroupDraft>): void => { setD(x => ({ ...x, ...patch })); setError(null) }
  const submit = (): void => {
    const name = d.name.trim()
    const fail = (e: string | null): boolean => { if (e) setError(e); return !!e }
    if (!name) { setError('Enter a group name'); return }
    if (!existing && fail(sec().createGroup(name, d.description))) return
    if (existing && d.description !== existing.description && fail(sec().updateGroup(name, { description: d.description }))) return
    if (fail(sec().setGroupLocks(name, ALL_LOCKS.filter(l => d.keys.includes(l))))) return
    for (const m of existing?.members ?? []) if (!(m in d.members) && fail(sec().removeGroupMember(name, m))) return
    for (const [m, scope] of Object.entries(d.members)) {
      if (!sec().groups.find(g => g.name === name)?.members.includes(m) && fail(sec().addGroupMember(name, m, null))) return
      if (fail(sec().setMemberAreas(name, m, scope))) return
    }
    onClose()
  }
  return <SimulatorDialog className="module-download-dialog dvum-dialog" label={existing ? `Properties For Group: ${existing.name}` : 'New Group'} onClose={onClose}>
    <div className="dvum-tabs" role="tablist">{['General', 'Members', 'Keys'].map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="dvum-panel">
      {tab === 'General' && <div className="dvum-col">
        <label>Name:<input type="text" aria-label="Name" value={d.name} readOnly={!!existing} disabled={!!existing} onChange={e => set({ name: e.target.value })} /></label>
        <label>Description:<textarea aria-label="Description" rows={7} value={d.description} onChange={e => set({ description: e.target.value })} /></label>
      </div>}
      {tab === 'Members' && <Picker title="All User" heading="Members" ariaPrefix="Group" items={users.map(u => u.name)} withArea areas={areas}
        rows={Object.entries(d.members).map(([m, s]) => ({ key: m, label: m, area: scopeLabel(s) }))} grantLabel="Add -->" removeLabel="<-- Remove"
        onGrant={(m, area) => { set({ members: { ...d.members, [m]: area === null ? null : Array.from(new Set([...(d.members[m] ?? []), area])) } }); return null }}
        onRemove={m => { const next = { ...d.members }; delete next[m]; set({ members: next }) }} />}
      {tab === 'Keys' && <Picker title="All Locks" heading="Has Key for" ariaPrefix="Group" items={ALL_LOCKS.map(l => LOCK_LABEL[l]).sort((a, b) => a.localeCompare(b))} withArea={false} areas={areas}
        rows={d.keys.map(l => ({ key: l, label: LOCK_LABEL[l] }))} grantLabel="Grant Key -->" removeLabel="<-- Remove"
        onGrant={label => { const lock = ALL_LOCKS.find(l => LOCK_LABEL[l] === label) as LockType; if (!d.keys.includes(lock)) set({ keys: [...d.keys, lock] }); return null }}
        onRemove={l => set({ keys: d.keys.filter(k => k !== l) })} />}
    </div>
    {error && <p role="alert" className="dvum-error">{error}</p>}
    <div className="dvum-foot">
      <button className="dvum-btn" onClick={submit}>OK</button><button className="dvum-btn" onClick={onClose}>Cancel</button><button className="dvum-btn" disabled title="Not modeled">Help</button>
    </div>
  </SimulatorDialog>
}

type Dlg = { t: 'user'; name?: string } | { t: 'group'; name?: string } | null
type CtxMenu = { x: number; y: number; label: string; items: { label: string; onClick?: () => void; disabled?: string; separator?: boolean; danger?: boolean }[] } | null

/** The DeltaV User Manager window of the DV-09 class. */
export function DvUserManager(): JSX.Element {
  const users = useSecurity(s => s.users)
  const groups = useSecurity(s => s.groups)
  const currentUser = useSecurity(s => s.currentUser)
  const workstation = useSecurity(s => s.workstation)
  const [dlg, setDlg] = useState<Dlg>(null)
  const [menu, setMenu] = useState<CtxMenu>(null)
  const [sel, setSel] = useState<{ kind: 'user' | 'group'; name: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const del = (kind: 'user' | 'group', name: string): void => {
    if (!window.confirm(`Delete ${kind} ${name}?`)) return
    if (kind === 'user') {
      if (name === currentUser) { setMessage('The logged-on user cannot be deleted'); return }
      useSecurity.getState().deleteUser(name)
      if (useSecurity.getState().users.some(u => u.name === name)) setMessage((useSecurity.getState().lastDenied ?? 'The user was not deleted').replace(/^Access Denied — /, ''))
    } else setMessage(useSecurity.getState().deleteGroup(name))
  }
  const blank = (kind: 'user' | 'group') => (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('tr[data-name]')) return
    e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: kind === 'user' ? 'Users' : 'Groups', items: [
      { label: 'New', onClick: () => setDlg({ t: kind }) }, { separator: true, label: '' }, { label: 'Properties', disabled: 'Select a ' + kind + ' first' }] })
  }
  const row = (kind: 'user' | 'group', name: string) => ({
    'data-name': name, className: sel?.kind === kind && sel.name === name ? 'sel' : undefined,
    onClick: () => setSel({ kind, name }), onDoubleClick: () => setDlg({ t: kind, name }),
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setSel({ kind, name }); setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
      { label: 'Properties', onClick: () => setDlg({ t: kind, name }) }, { label: 'Delete', danger: true, onClick: () => del(kind, name) }] }) }
  })
  const menus: { label: string; items: { label: string; onClick?: () => void; disabled?: boolean }[] }[] = [
    { label: 'File', items: [{ label: 'New User...', onClick: () => setDlg({ t: 'user' }) }, { label: 'New Group...', onClick: () => setDlg({ t: 'group' }) }, { label: 'Close', onClick: () => useUi.getState().navigate('explorer') }] },
    { label: 'Edit', items: [{ label: 'Properties', onClick: () => sel && setDlg({ t: sel.kind, name: sel.name }), disabled: !sel }, { label: 'Delete', onClick: () => sel && del(sel.kind, sel.name), disabled: !sel }] },
    { label: 'View', items: [{ label: 'Refresh' }] }, { label: 'Reports', items: [{ label: 'Not modeled', disabled: true }] },
    { label: 'Window', items: [{ label: 'Tile' }] }, { label: 'Help', items: [{ label: 'Not modeled', disabled: true }] }
  ]
  return <div className="display dvum" onMouseDown={() => setOpen(null)}>
    <div className="dvum-title">DeltaV User Manager WORKSTATION</div>
    <div className="dvum-menubar">{menus.map(m => <div key={m.label} className="dvum-menu"><button className={open === m.label ? 'open' : ''}
      onMouseDown={e => { e.stopPropagation(); setOpen(open === m.label ? null : m.label) }}>{m.label}</button>
      {open === m.label && <div className="dvum-drop" onMouseDown={e => e.stopPropagation()}>{m.items.map(i => <button key={i.label} disabled={i.disabled} onClick={() => { setOpen(null); i.onClick?.() }}>{i.label}</button>)}</div>}</div>)}</div>
    {message && <div className="dvum-error" role="alert" onClick={() => setMessage(null)}>{message}</div>}
    <div className="dvum-body">
      <div className="dvum-left">
        <div className="dvum-win users active"><div className="dvum-wintitle">Users</div>
          <div className="dvum-scroll" aria-label="Users" onContextMenu={blank('user')}><table className="dvum-table"><thead><tr><th>User Name</th><th>Full Name</th><th>Description</th></tr></thead><tbody>
            {users.map(u => <tr key={u.name} {...row('user', u.name)}><td>{u.name}</td><td>{u.fullName}</td><td>{u.name === currentUser ? 'Logged on' : u.disabled ? 'Account disabled' : ''}</td></tr>)}
          </tbody></table></div></div>
        <div className="dvum-win groups"><div className="dvum-wintitle">Groups</div>
          <div className="dvum-scroll" aria-label="Groups" onContextMenu={blank('group')}><table className="dvum-table"><thead><tr><th>Groups</th><th>Description</th></tr></thead><tbody>
            {groups.map(g => <tr key={g.name} {...row('group', g.name)}><td>{g.name}</td><td>{g.description}</td></tr>)}
          </tbody></table></div></div>
      </div>
      <div className="dvum-right"><div className="dvum-win locks" style={{ flex: 1 }}><div className="dvum-wintitle">Locks</div>
        <div className="dvum-scroll" aria-label="Locks"><table className="dvum-table"><thead><tr><th>Locks</th><th>Type</th><th>Description</th></tr></thead><tbody>
          {[...ALL_LOCKS].sort((a, b) => LOCK_LABEL[a].localeCompare(LOCK_LABEL[b])).map(l => <tr key={l}><td>{LOCK_LABEL[l]}</td><td>Write</td><td>{LOCK_HINT[l]}</td></tr>)}
        </tbody></table></div></div></div>
    </div>
    <div className="dvum-status">For Help, press F1<span style={{ flex: 1 }} /><span data-workstation-status>{workstation ? `Workstation downloaded ${new Date(workstation.downloadedAt).toLocaleTimeString()}` : 'Workstation: not downloaded'}</span></div>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    {dlg?.t === 'user' && <UserDialog key={dlg.name ?? '+'} existing={dlg.name ? users.find(u => u.name === dlg.name) : undefined} onClose={() => setDlg(null)} />}
    {dlg?.t === 'group' && <GroupDialog key={dlg.name ?? '+'} existing={dlg.name ? groups.find(g => g.name === dlg.name) : undefined} onClose={() => setDlg(null)} />}
  </div>
}
