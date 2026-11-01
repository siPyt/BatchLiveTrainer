import { create } from 'zustand'
import { useStore } from './store'
import { useBatch } from './batchStore'
import { useExecutive } from './executive'
import { useSecurity } from './security'
import { useSystem } from './systemPreferences'
import { vcHooks } from './vcHooks'
import { libraryHooks } from './libraryStore'
import type { Recipe } from './executive'

// DeltaV Version Control (Course 7016 chapter 13, slides 13-4 .. 13-86). A simulated version control database: every configuration item
// (control modules, phase classes, unit classes, recipes) has a list of versions created by Check In, Synchronize Database and Rollback,
// and a check-out state. Item content is the configuration of the item as text, so Show Differences works on lines.

export type VcKind = 'Module' | 'PhaseClass' | 'UnitClass' | 'Recipe'
export type VcPreference = 'Manual' | 'Auto Check Out' | 'Auto Check Out and In'
export interface VcVersion { n: number; at: number; user: string; comment: string; label: string; content: string }
export interface VcItem { key: string; kind: VcKind; name: string; versions: VcVersion[]; checkedOutBy: string | null; checkedOutAt: number | null; deleted: boolean }
export interface VcSnapshot { name: string; at: number; user: string; contents: Record<string, string> }
export interface VcSigner { name: string; lock: string }
export interface VcSignature { signer: string; approved: boolean; user: string; at: number; comment: string }
export interface VcMessage { at: number; user: string; text: string }
export interface DiffLine { kind: 'same' | 'added' | 'removed'; text: string }
export interface VcDiff { left: string; right: string; lines: DiffLine[]; same: boolean }

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never>(error: string): Result<T> => ({ ok: false, error })

export const VC_LOCKS = ['VC_ADMINISTRATOR', 'VC_CHECKOUT_CHECKIN', 'VC_DOWNLOAD_CHECKOUT', 'VC_DOWNLOAD_UNAUTHORIZED', 'VC_PURGE_RECOVER_ITEMS', 'VC_ROLLBACK_ITEMS', 'VC_SET_LABEL'] as const
export const keyOf = (kind: VcKind, name: string): string => `${kind}:${name}`
export const kindOf = (key: string): VcKind => key.split(':')[0] as VcKind
export const nameOf = (key: string): string => key.slice(key.indexOf(':') + 1)

const MODULE_KEYS = ['description', 'area', 'unit', 'pvMin', 'pvMax', 'decimals', 'gain', 'reset', 'rate', 'direct', 'spLow', 'spHigh', 'outputAction', 'primaryDisplay', 'detailDisplay', 'inputParams'] as const
const now = (): number => useStore.getState().time
const user = (): string => { const u = useSecurity.getState().currentUser; return u.toLowerCase() === 'admin' ? 'ADMINISTRATOR' : u.toUpperCase() }
const pretty = (o: unknown): string => JSON.stringify(o, null, 2)

/** Every configuration item the Version Control database tracks, with its present configuration text. */
export function catalog(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of Object.values(useStore.getState().modules)) {
    const cfg: Record<string, unknown> = {}
    for (const k of MODULE_KEYS) { const v = (m as unknown as Record<string, unknown>)[k]; if (v !== undefined) cfg[k] = v }
    out[keyOf('Module', m.tag)] = pretty({ tag: m.tag, type: m.type, ...cfg })
  }
  const b = useBatch.getState()
  for (const [n, c] of Object.entries(b.phaseClasses)) out[keyOf('PhaseClass', n)] = pretty(c)
  for (const [n, c] of Object.entries(b.unitClasses)) out[keyOf('UnitClass', n)] = pretty(c)
  for (const [n, r] of Object.entries(useExecutive.getState().recipes)) { const { modified: _m, ...rest } = r; out[keyOf('Recipe', n)] = pretty(rest) }
  return out
}

/** Subordinate items of an item (Check Out Recursive): the phase classes of a unit class, the recipes inside a procedure. */
export function subordinates(key: string): string[] {
  const name = nameOf(key)
  if (kindOf(key) === 'UnitClass') return (useBatch.getState().unitClasses[name]?.phaseClasses ?? []).map(p => keyOf('PhaseClass', p))
  if (kindOf(key) === 'Recipe') {
    const r = useExecutive.getState().recipes[name]
    return r && r.level !== 'Operation' ? r.steps.map(s => keyOf('Recipe', s.phaseClass)) : []
  }
  return []
}

function applyContent(key: string, content: string): string | null {
  const name = nameOf(key)
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(content) as Record<string, unknown> } catch { return 'The stored version cannot be read' }
  switch (kindOf(key)) {
    case 'Module': {
      const m = useStore.getState().modules[name]
      if (!m) return `${name} does not exist in the configuration database`
      const patch: Record<string, unknown> = {}
      for (const k of MODULE_KEYS) patch[k] = parsed[k]
      useStore.setState(s => ({ modules: { ...s.modules, [name]: { ...s.modules[name], ...patch } as typeof m }, rev: s.rev + 1 }))
      return null
    }
    case 'PhaseClass': useBatch.setState(s => ({ phaseClasses: { ...s.phaseClasses, [name]: parsed as never }, phaseDrafts: Object.fromEntries(Object.entries(s.phaseDrafts).filter(([n]) => n !== name)) })); return null
    case 'UnitClass': useBatch.setState(s => ({ unitClasses: { ...s.unitClasses, [name]: parsed as never } })); return null
    case 'Recipe': {
      const old = useExecutive.getState().recipes[name]
      useExecutive.setState(s => ({ recipes: { ...s.recipes, [name]: { ...(parsed as unknown as Recipe), modified: now(), revision: (old?.revision ?? 0) + 1 } }, drafts: Object.fromEntries(Object.entries(s.drafts).filter(([n]) => n !== name)) }))
      return null
    }
  }
}

/** A line difference (longest common subsequence) of two configuration texts. */
export function diffText(a: string, b: string): DiffLine[] {
  const x = a.split('\n'), y = b.split('\n')
  const lcs: number[][] = Array.from({ length: x.length + 1 }, () => Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ kind: 'same', text: x[i] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: 'removed', text: x[i++] })
    else out.push({ kind: 'added', text: y[j++] })
  }
  while (i < x.length) out.push({ kind: 'removed', text: x[i++] })
  while (j < y.length) out.push({ kind: 'added', text: y[j++] })
  return out
}

export interface VcState {
  /** Version Control Configuration (Database Administrator, slides 13-5 .. 13-11). */
  enabled: boolean
  displays: boolean
  preference: VcPreference
  authorization: boolean
  signers: VcSigner[]
  propagate: boolean
  items: Record<string, VcItem>
  snapshots: VcSnapshot[]
  messages: VcMessage[]
  signatures: Record<string, Record<string, VcSignature>>

  configure: (cfg: { enabled: boolean; displays: boolean }) => Result<string>
  setPreference: (p: VcPreference) => void
  setAuthorization: (enabled: boolean, signers: VcSigner[], propagate: boolean) => Result<string>
  /** Database Administrator > Synchronize Database (slides 13-16, 13-17). */
  synchronize: () => Result<string>
  ensureItem: (key: string) => VcItem | undefined
  checkOut: (key: string, recursive?: boolean) => Result<string>
  checkIn: (key: string, comment: string, recursive?: boolean) => Result<string>
  undoCheckOut: (key: string) => Result<string>
  isCheckedOut: (key: string) => string | null
  history: (key: string) => VcVersion[]
  /** Differences between the configuration database ('current') and a version, or between two versions. */
  diff: (key: string, a: number | 'current', b: number | 'current') => Result<VcDiff>
  rollback: (key: string, version: number) => Result<string>
  setLabel: (key: string, label: string, comment: string, recursive?: boolean) => Result<string>
  createSnapshot: (name: string) => Result<string>
  restoreSnapshot: (name: string) => Result<string>
  recover: (key: string) => Result<string>
  purge: (key: string) => Result<string>
  search: (q: { checkedOut: 'all' | string; scope: 'selected' | 'sub' | 'all'; key?: string }) => { key: string; user: string }[]
  historyReport: (q: { key: string; recursive: boolean; from?: number; to?: number; user?: string }) => { key: string; version: VcVersion }[]
  approvalReport: (unapprovedOnly: boolean) => { recipe: string; authorized: boolean; signatures: string }[]
  isAuthorized: (recipe: string) => boolean
  sign: (recipe: string, signer: string, approved: boolean, comment: string) => Result<string>
  clearSignature: (recipe: string, signer: string) => Result<string>
  reset: () => void
}

const empty = (): Pick<VcState, 'enabled' | 'displays' | 'preference' | 'authorization' | 'signers' | 'propagate' | 'items' | 'snapshots' | 'messages' | 'signatures'> => ({
  enabled: false, displays: false, preference: 'Manual', authorization: false, signers: [], propagate: false, items: {}, snapshots: [], messages: [], signatures: {}
})

export const useVc = create<VcState>((set, get) => {
  const msg = (text: string): void => set(s => ({ messages: [...s.messages, { at: now(), user: user(), text }].slice(-300) }))
  const serverError = (): string | null => {
    if (!get().enabled) return 'Version Control is not enabled (DeltaV Database Administrator > Version Control Configuration)'
    return useSystem.getState().serverState === 'RUNNING' ? null : 'The database server is stopped; connect to the server first (File > Connect to Server)'
  }
  const cat = (): Record<string, string> => catalog()
  const addVersion = (key: string, content: string, comment: string, label = ''): VcVersion => {
    const it = get().items[key] ?? { key, kind: kindOf(key), name: nameOf(key), versions: [], checkedOutBy: null, checkedOutAt: null, deleted: false }
    const v: VcVersion = { n: (it.versions[it.versions.length - 1]?.n ?? 0) + 1, at: now(), user: user(), comment, label, content }
    set(s => ({ items: { ...s.items, [key]: { ...it, deleted: false, versions: [...it.versions, v] } } }))
    return v
  }
  const patchItem = (key: string, patch: Partial<VcItem>): void => set(s => ({ items: { ...s.items, [key]: { ...s.items[key], ...patch } } }))
  const withSubs = (key: string, recursive?: boolean): string[] => (recursive ? [key, ...subordinates(key)] : [key])

  return {
    ...empty(),

    configure: ({ enabled, displays }) => {
      const s = get()
      const sys = useSystem.getState()
      if (sys.serverState !== 'RUNNING') return fail('The database server is stopped; connect to the server first')
      if (sys.clients.length) return fail(`All database clients must be closed before Version Control can be enabled or disabled: ${sys.clients.join(', ')}`)
      if (enabled === s.enabled && displays === s.displays) return ok('No change')
      set({ enabled, displays: enabled && displays })
      if (enabled && !s.enabled) {
        // Enabling creates the SQL database and synchronizes it with the configuration database, then shuts the Database Server down.
        const c = cat()
        for (const [key, content] of Object.entries(c)) if (!get().items[key]) addVersion(key, content, 'Initial version created by synchronization', 'Sync')
        msg(`Version Control enabled; database synchronized (${Object.keys(c).length} items)`)
        useSystem.setState({ serverState: 'STOPPED' })
      } else if (!enabled && s.enabled) {
        msg('Version Control disabled')
        useSystem.setState({ serverState: 'STOPPED' })
      } else msg(`Version Control for DeltaV displays ${displays ? 'enabled' : 'disabled'}; download the ProfessionalPLUS workstation`)
      return ok(enabled ? 'enabled' : 'disabled')
    },
    setPreference: p => { set({ preference: p }); msg(`Check out preference changed to ${p}`) },
    setAuthorization: (enabled, signers, propagate) => {
      if (signers.length > 5) return fail('You may configure up to five signers')
      const names = signers.map(x => x.name.trim().toUpperCase())
      if (new Set(names).size !== names.length) return fail('Signer names must be unique')
      if (signers.some(x => !x.name.trim())) return fail('Enter a name for every signer')
      const locks = signers.map(x => x.lock).filter(Boolean)
      if (new Set(locks).size !== locks.length) return fail('A function lock can be assigned to only one signer')
      const s = get()
      const added = names.some(n => !s.signers.some(o => o.name.toUpperCase() === n))
      set({ authorization: enabled, signers: signers.map(x => ({ name: x.name.trim(), lock: x.lock })), propagate, ...(added ? { signatures: {} } : {}) })
      msg(`Recipe authorization ${enabled ? 'enabled' : 'disabled'} with ${signers.length} signer(s)${added ? '; all recipes are unauthorized until the new signer approves them' : ''}`)
      return ok('saved')
    },
    synchronize: () => {
      const e = serverError()
      if (e) return fail(e)
      const c = cat()
      let created = 0, changed = 0, removed = 0
      for (const [key, content] of Object.entries(c)) {
        const it = get().items[key]
        if (!it) { addVersion(key, content, 'Created by synchronization', 'Sync'); created++ }
        else if (it.versions[it.versions.length - 1]?.content !== content && !it.checkedOutBy) { addVersion(key, content, 'Changed in the configuration database; created by synchronization', 'Sync'); changed++ }
        else if (it.deleted) patchItem(key, { deleted: false })
      }
      for (const [key, it] of Object.entries(get().items)) if (!(key in c) && !it.deleted) { patchItem(key, { deleted: true, checkedOutBy: null }); removed++ }
      msg(`Synchronize Database: ${created} item(s) created, ${changed} changed, ${removed} no longer in the configuration database`)
      return ok(`${created} created, ${changed} changed, ${removed} removed`)
    },
    ensureItem: key => {
      if (!get().enabled) return undefined
      const content = cat()[key]
      if (content !== undefined && !get().items[key]) addVersion(key, content, 'Created by synchronization', 'Sync')
      return get().items[key]
    },
    isCheckedOut: key => get().items[key]?.checkedOutBy ?? null,
    checkOut: (key, recursive) => {
      const e = serverError()
      if (e) return fail(e)
      for (const k of withSubs(key, recursive)) {
        const it = get().ensureItem(k)
        if (!it) return fail(`${nameOf(k)} does not exist`)
        if (it.checkedOutBy && it.checkedOutBy !== user()) return fail(`${nameOf(k)} is checked out by ${it.checkedOutBy}; only one person at a time can have an item checked out`)
        if (!it.checkedOutBy) { patchItem(k, { checkedOutBy: user(), checkedOutAt: now() }); msg(`${nameOf(k)} checked out by ${user()}`) }
      }
      useStore.getState().logEvent('CONFIGURE', nameOf(key), `Version Control: ${nameOf(key)} checked out by ${user()}`)
      return ok(nameOf(key))
    },
    checkIn: (key, comment, recursive) => {
      const e = serverError()
      if (e) return fail(e)
      const c = cat()
      let created = 0
      for (const k of withSubs(key, recursive)) {
        const it = get().items[k]
        if (!it?.checkedOutBy) { if (k === key) return fail(`${nameOf(k)} is not checked out`); continue }
        if (it.checkedOutBy !== user()) { if (k === key) return fail(`${nameOf(k)} is checked out by ${it.checkedOutBy}; the VC_CHECKOUT_CHECKIN function lock is needed to check in items checked out by others`); continue }
        const content = c[k]
        if (content === undefined) return fail(`${nameOf(k)} no longer exists in the configuration database`)
        if (it.versions[it.versions.length - 1]?.content !== content) { const v = addVersion(k, content, comment); created++; msg(`${nameOf(k)} checked in as version ${v.n}${comment ? ` (${comment})` : ''}`) }
        else msg(`${nameOf(k)} checked in; no changes, no new version`)
        patchItem(k, { checkedOutBy: null, checkedOutAt: null })
      }
      useStore.getState().logEvent('CONFIGURE', nameOf(key), `Version Control: ${nameOf(key)} checked in${comment ? ` - ${comment}` : ''}`)
      return ok(created ? `${nameOf(key)} version ${get().items[key].versions.length}` : 'no changes')
    },
    undoCheckOut: key => {
      const e = serverError()
      if (e) return fail(e)
      const it = get().items[key]
      if (!it?.checkedOutBy) return fail(`${nameOf(key)} is not checked out`)
      if (it.checkedOutBy !== user()) return fail(`${nameOf(key)} is checked out by ${it.checkedOutBy}; VC_ADMINISTRATOR is needed to undo it`)
      const err = applyContent(key, it.versions[it.versions.length - 1].content)
      if (err) return fail(err)
      patchItem(key, { checkedOutBy: null, checkedOutAt: null })
      msg(`Check out of ${nameOf(key)} undone; the last checked-in version was restored`)
      return ok(nameOf(key))
    },
    history: key => [...(get().items[key]?.versions ?? [])].reverse(),
    diff: (key, a, b) => {
      const e = serverError()
      if (e) return fail(e)
      const it = get().ensureItem(key)
      if (!it) return fail(`${nameOf(key)} does not exist`)
      const text = (v: number | 'current'): { label: string; content: string } | null => {
        if (v === 'current') { const c = cat()[key]; return c === undefined ? null : { label: 'Configuration database (current)', content: c } }
        const ver = it.versions.find(x => x.n === v)
        return ver ? { label: `Version ${ver.n}${ver.label ? ` (${ver.label})` : ''}`, content: ver.content } : null
      }
      const l = text(a), r = text(b)
      if (!l || !r) return fail('That version does not exist')
      const lines = diffText(l.content, r.content)
      return ok({ left: l.label, right: r.label, lines, same: lines.every(x => x.kind === 'same') })
    },
    rollback: (key, version) => {
      const e = serverError()
      if (e) return fail(e)
      const it = get().items[key]
      const ver = it?.versions.find(x => x.n === version)
      if (!it || !ver) return fail('That version does not exist')
      if (it.checkedOutBy && it.checkedOutBy !== user()) return fail(`${nameOf(key)} is checked out by ${it.checkedOutBy}`)
      const err = applyContent(key, ver.content)
      if (err) return fail(err)
      patchItem(key, { checkedOutBy: user(), checkedOutAt: now() })
      msg(`${nameOf(key)} rolled back to version ${version}; the item is checked out, check it in to record the change`)
      useStore.getState().logEvent('CONFIGURE', nameOf(key), `Version Control: ${nameOf(key)} rolled back to version ${version}`)
      return ok(nameOf(key))
    },
    setLabel: (key, label, comment, recursive) => {
      const e = serverError()
      if (e) return fail(e)
      if (!label.trim()) return fail('Enter a label name')
      for (const k of withSubs(key, recursive)) {
        const it = get().ensureItem(k)
        if (!it) continue
        const versions = it.versions.map((v, i) => (i === it.versions.length - 1 ? { ...v, label: label.trim(), comment: comment ? `${v.comment}${v.comment ? ' | ' : ''}${comment}` : v.comment } : v))
        patchItem(k, { versions })
      }
      msg(`Label ${label.trim()} set on ${nameOf(key)}${recursive ? ' and its subordinate items' : ''}`)
      return ok(label.trim())
    },
    createSnapshot: name => {
      const e = serverError()
      if (e) return fail(e)
      const n = name.trim() || `Snapshot ${get().snapshots.length + 1}`
      if (get().snapshots.some(s => s.name.toUpperCase() === n.toUpperCase())) return fail(`The snapshot ${n} already exists`)
      set(s => ({ snapshots: [...s.snapshots, { name: n, at: now(), user: user(), contents: cat() }] }))
      msg(`Snapshot ${n} created`)
      return ok(n)
    },
    restoreSnapshot: name => {
      const e = serverError()
      if (e) return fail(e)
      const snap = get().snapshots.find(s => s.name === name)
      if (!snap) return fail('Select a snapshot')
      const out = Object.values(get().items).filter(i => i.checkedOutBy)
      if (out.length) return fail(`All items must be checked in before you restore a snapshot: ${out.slice(0, 4).map(i => i.name).join(', ')}${out.length > 4 ? ' ...' : ''}`)
      let changed = 0
      const current = cat()
      for (const [key, content] of Object.entries(snap.contents)) {
        if (current[key] === content) continue
        const err = applyContent(key, content)
        if (err) return fail(err)
        addVersion(key, content, `Restored from snapshot ${name}`, `Snapshot ${name}`)
        changed++
      }
      msg(`Snapshot ${name} restored: ${changed} item(s) changed; the Version Control database was synchronized and labeled`)
      return ok(`${changed} item(s) restored`)
    },
    recover: key => {
      const e = serverError()
      if (e) return fail(e)
      const it = get().items[key]
      if (!it?.deleted) return fail(`${nameOf(key)} is not a deleted item`)
      const err = applyContent(key, it.versions[it.versions.length - 1].content)
      if (err) return fail(err)
      patchItem(key, { deleted: false })
      msg(`${nameOf(key)} recovered`)
      return ok(nameOf(key))
    },
    purge: key => {
      const e = serverError()
      if (e) return fail(e)
      const it = get().items[key]
      if (!it?.deleted) return fail('Only deleted items can be purged')
      set(s => { const items = { ...s.items }; delete items[key]; return { items } })
      msg(`${nameOf(key)} purged from the Version Control database`)
      return ok(nameOf(key))
    },
    search: ({ checkedOut, scope, key }) => {
      const scoped = scope === 'all' || !key ? Object.keys(get().items) : scope === 'selected' ? [key] : [key, ...subordinates(key)]
      return scoped.map(k => get().items[k]).filter((i): i is VcItem => !!i?.checkedOutBy && (checkedOut === 'all' || i.checkedOutBy === checkedOut.toUpperCase())).map(i => ({ key: i.key, user: i.checkedOutBy! }))
    },
    historyReport: ({ key, recursive, from, to, user: u }) => {
      const keys = withSubs(key, recursive)
      return keys.flatMap(k => (get().items[k]?.versions ?? []).map(version => ({ key: k, version })))
        .filter(x => (from === undefined || x.version.at >= from) && (to === undefined || x.version.at <= to) && (!u || x.version.user.toUpperCase() === u.toUpperCase()))
    },
    isAuthorized: recipe => {
      const s = get()
      return !s.authorization || (s.signers.length > 0 && s.signers.every(sg => s.signatures[recipe]?.[sg.name]?.approved))
    },
    approvalReport: unapprovedOnly => Object.keys(useExecutive.getState().recipes).sort().map(r => {
      const sg = get().signatures[r] ?? {}
      return { recipe: r, authorized: get().isAuthorized(r), signatures: get().signers.map(s => `${s.name}: ${sg[s.name] ? (sg[s.name].approved ? 'Approved' : 'Rejected') : 'Pending'}`).join('; ') }
    }).filter(x => !unapprovedOnly || !x.authorized),
    sign: (recipe, signer, approved, comment) => {
      const s = get()
      if (!s.authorization) return fail('Recipe authorization is not enabled (Version Control Configuration)')
      if (!useExecutive.getState().recipes[recipe]) return fail(`${recipe} does not exist`)
      if (!s.signers.some(x => x.name === signer)) return fail(`${signer} is not a configured signer`)
      if (!approved && useExecutive.getState().downloaded[recipe]) return fail('You are not allowed to reject a recipe that has already been downloaded to a Batch Executive')
      if (!comment.trim()) return fail('Enter a comment for the signature')
      set(st => ({ signatures: { ...st.signatures, [recipe]: { ...(st.signatures[recipe] ?? {}), [signer]: { signer, approved, user: user(), at: now(), comment } } } }))
      msg(`${recipe} ${approved ? 'approved' : 'rejected'} by signer ${signer} (${user()})`)
      return ok(get().isAuthorized(recipe) ? 'authorized' : 'pending')
    },
    clearSignature: (recipe, signer) => {
      if (useExecutive.getState().downloaded[recipe]) return fail('You are not allowed to clear a signature of a recipe that has already been downloaded to a Batch Executive')
      if (!get().signatures[recipe]?.[signer]) return fail(`${signer} has not signed ${recipe}`)
      set(st => { const r = { ...(st.signatures[recipe] ?? {}) }; delete r[signer]; return { signatures: { ...st.signatures, [recipe]: r } } })
      msg(`Signature of ${signer} cleared on ${recipe}`)
      return ok(signer)
    },
    reset: () => set(empty())
  }
})

// ---- Hooks used by the configuration stores -----------------------------------------------------------------------------------
libraryHooks.reset.push(() => useVc.getState().reset())
vcHooks.gate = key => {
  const s = useVc.getState()
  if (!s.enabled) return null
  if (useSystem.getState().serverState !== 'RUNNING') return null
  const it = s.ensureItem(key)
  if (!it) return null
  const who = it.checkedOutBy
  if (who === user()) return null
  if (who) return `${nameOf(key)} is checked out by ${who}: it can be edited only by that user`
  if (s.preference === 'Manual') return `${nameOf(key)} is not checked out. Check it out (Version Control > Check Out) before you save changes`
  const r = s.checkOut(key)
  return r.ok ? null : r.error
}
vcHooks.saved = key => {
  const s = useVc.getState()
  if (s.enabled && s.preference === 'Auto Check Out and In' && s.items[key]?.checkedOutBy === user()) s.checkIn(key, 'Automatic check in')
}
vcHooks.downloadCheck = (recipes, opts) => {
  const s = useVc.getState()
  if (!s.enabled) return null
  const unauth = s.authorization ? recipes.filter(r => !s.isAuthorized(r)) : []
  if (unauth.length && !opts?.proceedUnauthorized) return `${unauth.join(', ')} ${unauth.length === 1 ? 'is' : 'are'} not authorized: all signers must approve the recipe, or use "Proceed with download if items are unauthorized" with the VC_DOWNLOAD_UNAUTHORIZED lock`
  const out = recipes.filter(r => s.items[keyOf('Recipe', r)]?.checkedOutBy)
  if (out.length && !opts?.proceedCheckedOut) return `${out.join(', ')} ${out.length === 1 ? 'is' : 'are'} checked out: check the recipe in first, or use "Proceed with download if items are checked out" with the VC_DOWNLOAD_CHECKOUT lock`
  return null
}
