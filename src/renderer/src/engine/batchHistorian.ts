import { create } from 'zustand'
import { useStore } from './store'
import { useExecutive } from './executive'
import type { Batch, JournalEntry } from './executive'
import { libraryHooks } from './libraryStore'

// DeltaV Batch Historian (Course 7016 chapter 14, slides 14-4 .. 14-56). A simulated Batch Historian Executive: it receives batch events
// from the Batch Executive and process events from the Event Chronicle while its XP service runs, keeps them in the main database
// DVHisDB, and offers the Historian Administration Tool operations (connect, start/stop, archives, folders, maintenance) and the Batch History
// View data (batch tree, batch events, comments, process events, process trend, comparisons).

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never>(error: string): Result<T> => ({ ok: false, error })

export type HistLevel = 'Batch' | 'Procedure' | 'Unit Procedure' | 'Operation' | 'Unit Phase'
export interface HistNode { id: string; name: string; level: HistLevel; unit: string; start: number | null; end: number | null; state: string; children: HistNode[] }
export interface HistEvent { at: number; kind: string; key: string; text: string; user: string }
export interface HistSamples { t0: number; dt: number; v: Record<string, number[]> }
export interface HistBatch {
  id: string; recipe: string; formula: string; start: number | null; end: number | null; state: string; active: boolean
  tree: HistNode; events: HistEvent[]; samples: HistSamples; archivedIn: string[]
}
export interface ChronEvent { id: string; time: number; category: string; tag: string; description: string; user: string }
export interface HistArchive { name: string; path: string; folder: string; createdAt: number; batches: Record<string, HistBatch>; events: ChronEvent[] }
export interface HistConfig { enabled: boolean; description: string; inputs: string[]; outputs: { path: string; sizeMb: number }[] }
export interface HistMaintenance { autoArchive: boolean; archiveAfterDays: number; autoBackup: boolean; autoDelete: boolean; deleteAfterDays: number }
export interface CompareRow { path: string; level: string; durationA: number | null; durationB: number | null; delta: number | null }

export const HISTORIAN_INPUTS = ['Batch Executive', 'Alarms And Events'] as const
const SAMPLE_MODULES = ['XV-101', 'XV-102', 'XV-201', 'XV-202', 'XV-301', 'XV-302', 'XV-501', 'XV-502', 'XV-503', 'XV-504', 'XV-601', 'XV-602', 'XV-603', 'XV-604', 'MTR-403', 'MTR-505', 'MTR-605', 'AGIT-503', 'AGIT-603', 'FIC-404', 'LI-104', 'LI-204', 'LI-304', 'LI-504', 'LI-604']
const SAMPLE_DT = 2000
const now = (): number => useStore.getState().time
const user = (): string => 'ADMINISTRATOR'

export const DEFAULT_MAINTENANCE: HistMaintenance = { autoArchive: false, archiveAfterDays: 30, autoBackup: false, autoDelete: false, deleteAfterDays: 90 }

export function outputPathError(path: string): string | null {
  const p = path.trim()
  if (!p) return 'Enter the directory path of the output database'
  if (/^\\\\/.test(p)) return 'The output directory must be on the Batch Historian local drive: do not use a network path'
  if (!/^[A-Za-z]:\\[^<>"|?*]+$/.test(p)) return 'Enter a local path such as C:\\DVBatchHistory\\Batch_Historian_Databases\\db1'
  if (/\\(DeltaV|DVData)(\\|$)/i.test(p)) return 'The output directory should not be in the DeltaV or DVData paths: a DeltaV upgrade renames or deletes them'
  return null
}

function sampleValue(tag: string): number | undefined {
  const m = useStore.getState().modules[tag] as unknown as Record<string, unknown> | undefined
  if (!m) return undefined
  if (m.type === 'VALVE') return m.open ? 1 : 0
  if (m.type === 'MOTOR') return m.running ? 1 : 0
  return typeof m.pv === 'number' ? Math.round((m.pv as number) * 100) / 100 : undefined
}

function phasesOf(events: JournalEntry[], unit: string, phaseClass: string, from: number, to: number): { start: number; end: number | null }[] {
  const key = `${unit}/${phaseClass}`
  const out: { start: number; end: number | null }[] = []
  for (const e of events) {
    if (e.key !== key || e.at < from || e.at > to) continue
    if (/acquired by .* and started/.test(e.text)) out.push({ start: e.at, end: null })
    else if (/complete; .* released/.test(e.text)) { const open = out.find(x => x.end === null); if (open) open.end = e.at }
  }
  return out
}

const LEVEL: Record<string, HistLevel> = { Procedure: 'Procedure', 'Unit Procedure': 'Unit Procedure', Operation: 'Operation' }
const STATE: Record<string, string> = { IDLE: 'Idle', RUNNING: 'Running', HELD: 'Held', COMPLETE: 'Complete', STOPPED: 'Stopped', ABORTED: 'Aborted' }

/** The batch tree the Batch History View expands: batch > unit procedures > operations > unit phases. */
function buildTree(root: Batch, all: Batch[], journal: JournalEntry[]): HistNode {
  const ex = useExecutive.getState()
  const recipeOf = (b: Batch): ReturnType<typeof useExecutive.getState>['recipes'][string] | undefined => ex.downloaded[b.recipe]?.recipe ?? ex.recipes[b.recipe]
  const make = (b: Batch): HistNode => {
    const r = recipeOf(b)
    const isOp = !b.level || b.level === 'Operation'
    const node: HistNode = { id: b.id, name: b.parent ? (b.step ?? b.recipe) : b.id, level: b.parent ? (LEVEL[b.level ?? 'Operation'] ?? 'Operation') : 'Batch', unit: b.unit ?? r?.equipment.name ?? '',
      start: b.started, end: b.ended, state: STATE[b.state] ?? b.state, children: [] }
    if (!b.parent && isOp) node.level = 'Batch'
    const kids = all.filter(k => k.parent === b.id)
    node.children = kids.map(make)
    if (isOp && r && b.unit) {
      const evs = journal.filter(e => e.at >= (b.started ?? 0))
      for (const s of r.steps) {
        for (const ph of phasesOf(evs, b.unit, s.phaseClass, b.started ?? 0, b.ended ?? Number.MAX_SAFE_INTEGER)) {
          node.children.push({ id: `${b.id}/${s.name}@${ph.start}`, name: s.phaseClass, level: 'Unit Phase', unit: b.unit, start: ph.start, end: ph.end, state: ph.end === null ? 'Running' : 'Complete', children: [] })
        }
      }
      node.children.sort((x, y) => (x.start ?? 0) - (y.start ?? 0))
    }
    return node
  }
  return make(root)
}

export function flatten(n: HistNode, prefix = ''): { path: string; level: string; start: number | null; end: number | null }[] {
  const path = `${prefix}${prefix ? '/' : ''}${n.level === 'Batch' ? 'Batch' : n.name}`
  const seen = new Map<string, number>()
  return [{ path, level: n.level, start: n.start, end: n.end }, ...n.children.flatMap(c => {
    const k = c.name; const i = (seen.get(k) ?? 0) + 1; seen.set(k, i)
    return flatten({ ...c, name: i > 1 ? `${c.name}#${i}` : c.name }, path)
  })]
}

export interface HistorianState {
  config: HistConfig
  downloaded: boolean
  connected: boolean
  service: 'STOPPED' | 'RUNNING'
  batches: Record<string, HistBatch>
  chronicle: ChronEvent[]
  adminLog: { at: number; text: string }[]
  archives: Record<string, HistArchive>
  folders: string[]
  maintenance: HistMaintenance
  lastSample: number
  /** What the Batch History View was used for (details, events, comparison, trend), for the workshop checks. */
  views: string[]

  noteView: (text: string) => void
  setEnabled: (enabled: boolean, description?: string) => Result<string>
  addInput: (name: string) => Result<string>
  removeInput: (name: string) => Result<string>
  addOutput: (path: string, sizeMb: number) => Result<string>
  removeOutput: (path: string) => Result<string>
  markDownloaded: () => void
  connect: () => Result<string>
  disconnect: () => void
  toggleService: () => Result<string>
  collect: () => void
  addComment: (batchId: string, text: string, eventIndex?: number) => Result<string>
  newFolder: (name: string) => Result<string>
  createArchive: (name: string, path: string, folder?: string) => Result<string>
  archiveBatch: (batchId: string, archive: string) => Result<string>
  archiveEvents: (archive: string, from: number, to: number) => Result<string>
  setMaintenance: (patch: Partial<HistMaintenance>) => Result<string>
  runMaintenance: () => Result<string>
  compare: (a: string, b: string) => Result<CompareRow[]>
  processEvents: (batchId: string) => ChronEvent[]
  trend: (batchId: string, module: string) => { t: number; v: number }[]
  reset: () => void
}

const empty = (): Pick<HistorianState, 'config' | 'downloaded' | 'connected' | 'service' | 'batches' | 'chronicle' | 'adminLog' | 'archives' | 'folders' | 'maintenance' | 'lastSample' | 'views'> => ({
  config: { enabled: false, description: '', inputs: [], outputs: [] }, downloaded: false, connected: false, service: 'STOPPED', batches: {}, chronicle: [], adminLog: [],
  archives: {}, folders: [], maintenance: { ...DEFAULT_MAINTENANCE }, lastSample: 0, views: []
})

export const useHistorian = create<HistorianState>((set, get) => {
  const log = (text: string): void => set(s => ({ adminLog: [...s.adminLog, { at: now(), text }].slice(-300) }))
  const needServer = (): string | null => (get().connected ? null : 'Connect to the Batch Historian server first (Server > Connect)')
  return {
    ...empty(),

    noteView: text => set(s => (s.views.includes(text) ? {} : { views: [...s.views, text].slice(-200) })),
    setEnabled: (enabled, description) => {
      set(s => ({ config: { ...s.config, enabled, description: description ?? s.config.description }, downloaded: false }))
      if (!enabled) set({ connected: false, service: 'STOPPED' })
      useStore.getState().logEvent('CONFIGURE', 'Batch Historian', `Batch Historian ${enabled ? 'enabled' : 'disabled'}; download the workstation`)
      return ok(enabled ? 'enabled' : 'disabled')
    },
    addInput: name => {
      if (!HISTORIAN_INPUTS.includes(name as typeof HISTORIAN_INPUTS[number])) return fail(`${name} is not a Batch Historian input`)
      if (get().config.inputs.includes(name)) return fail(`${name} is already an input`)
      set(s => ({ config: { ...s.config, inputs: [...s.config.inputs, name] }, downloaded: false }))
      return ok(name)
    },
    removeInput: name => { set(s => ({ config: { ...s.config, inputs: s.config.inputs.filter(i => i !== name) }, downloaded: false })); return ok(name) },
    addOutput: (path, sizeMb) => {
      const e = outputPathError(path)
      if (e) return fail(e)
      if (!Number.isFinite(sizeMb) || sizeMb < 1) return fail('The size of an output database is at least 1 Mb')
      const p = path.trim().replace(/\\+$/, '')
      if (get().config.outputs.some(o => o.path.toUpperCase() === p.toUpperCase())) return fail(`${p} is already an output`)
      set(s => ({ config: { ...s.config, outputs: [...s.config.outputs, { path: p, sizeMb }] }, downloaded: false }))
      return ok(p)
    },
    removeOutput: path => { set(s => ({ config: { ...s.config, outputs: s.config.outputs.filter(o => o.path !== path) }, downloaded: false })); return ok(path) },
    markDownloaded: () => { if (get().config.enabled && !get().downloaded) set({ downloaded: true }) },
    connect: () => {
      const c = get().config
      if (!c.enabled) return fail('The Batch Historian is not enabled (Explorer > Batch Historian > Properties > General)')
      if (!get().downloaded) return fail('Download the ProfessionalPLUS workstation so the Batch Historian configuration reaches the server')
      if (!c.inputs.length) return fail('The Batch Historian has no inputs (Properties > Input)')
      if (!c.outputs.length) return fail('The Batch Historian has no output database (Properties > Output)')
      set({ connected: true })
      log('Connected to the Batch Historian server')
      return ok('connected')
    },
    disconnect: () => { set({ connected: false }); log('Disconnected from the Batch Historian server') },
    toggleService: () => {
      const e = needServer()
      if (e) return fail(e)
      const next = get().service === 'RUNNING' ? 'STOPPED' : 'RUNNING'
      set({ service: next })
      log(`Batch Historian service ${next === 'RUNNING' ? 'started' : 'stopped'}`)
      return ok(next)
    },
    collect: () => {
      const s = get()
      if (s.service !== 'RUNNING') return
      const t = now()
      const ex = useExecutive.getState()
      const fromBatches = s.config.inputs.includes('Batch Executive')
      if (fromBatches) {
        const batches = { ...s.batches }
        for (const root of ex.batches.filter(b => !b.parent)) {
          const prev = batches[root.id]
          if (prev?.archivedIn.length && !prev.active) continue
          const active = root.state === 'RUNNING' || root.state === 'HELD'
          if (prev && !prev.active && !active && prev.end === root.ended) continue
          const mine = ex.journal.filter(j => j.batch === root.id)
          const seen = new Set((prev?.events ?? []).map(e => `${e.at}|${e.key}|${e.text}`))
          const events = [...(prev?.events ?? []), ...mine.filter(j => !seen.has(`${j.at}|${j.key}|${j.text}`)).map(j => ({ at: j.at, kind: j.kind, key: j.key, text: j.text, user: j.user }))]
          const all = [root, ...ex.batches.filter(b => b.parent && b.id.startsWith(`${root.id}/`))]
          const samples: HistSamples = prev?.samples ?? { t0: root.started ?? t, dt: SAMPLE_DT, v: {} }
          if (active && t - s.lastSample >= SAMPLE_DT) {
            for (const tag of SAMPLE_MODULES) { const v = sampleValue(tag); if (v !== undefined) (samples.v[tag] ??= []).push(v) }
          }
          batches[root.id] = { id: root.id, recipe: root.recipe, formula: root.formula ?? '', start: root.started, end: root.ended, state: STATE[root.state] ?? root.state, active,
            tree: buildTree(root, all, mine), events, samples: { ...samples, v: { ...samples.v } }, archivedIn: prev?.archivedIn ?? [] }
        }
        set({ batches, ...(t - s.lastSample >= SAMPLE_DT ? { lastSample: t } : {}) })
      }
      if (s.config.inputs.includes('Alarms And Events')) {
        const have = new Set(get().chronicle.map(c => c.id))
        const fresh = useStore.getState().eventLog.filter(e => !have.has(e.id)).map(e => ({ id: e.id, time: e.time, category: e.category, tag: e.tag, description: e.description, user: e.user }))
        if (fresh.length) set(st => ({ chronicle: [...st.chronicle, ...fresh].slice(-5000) }))
      }
    },
    addComment: (batchId, text, eventIndex) => {
      const b = get().batches[batchId]
      if (!b) return fail(`Batch ${batchId} is not in the Batch Historian`)
      if (!text.trim()) return fail('Enter the comment')
      const ev = eventIndex !== undefined ? b.events[eventIndex] : undefined
      const entry: HistEvent = { at: now(), kind: 'Comment', key: ev?.key ?? '', text: text.trim(), user: user() }
      set(s => ({ batches: { ...s.batches, [batchId]: { ...b, events: [...b.events, entry] } } }))
      log(`Comment added to batch ${batchId}`)
      return ok('added')
    },
    newFolder: name => {
      const e = needServer()
      if (e) return fail(e)
      const n = name.trim()
      if (!n) return fail('Enter a folder name')
      if (get().folders.some(f => f.toUpperCase() === n.toUpperCase())) return fail(`The folder ${n} already exists`)
      set(s => ({ folders: [...s.folders, n] }))
      log(`Folder ${n} created`)
      return ok(n)
    },
    createArchive: (name, path, folder = '') => {
      const e = needServer()
      if (e) return fail(e)
      const n = name.trim()
      if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(n)) return fail('Archive names start with a letter and use letters, digits and underscores')
      if (get().archives[n]) return fail(`The archive ${n} already exists`)
      const pe = outputPathError(path)
      if (pe) return fail(pe)
      set(s => ({ archives: { ...s.archives, [n]: { name: n, path: path.trim(), folder, createdAt: now(), batches: {}, events: [] } } }))
      log(`Archive database ${n} created in ${path.trim()}`)
      return ok(n)
    },
    archiveBatch: (batchId, archive) => {
      const e = needServer()
      if (e) return fail(e)
      const a = get().archives[archive]
      const b = get().batches[batchId]
      if (!a) return fail(`The archive ${archive} does not exist`)
      if (!b) return fail(`Batch ${batchId} is not in the Batch Historian`)
      if (b.active || useExecutive.getState().batches.some(x => x.id === batchId)) return fail(`Batch ${batchId} cannot be archived while it is active: complete it and remove it from the Batch List in the Batch Operator Interface first`)
      if (b.archivedIn.includes(archive)) return fail(`Batch ${batchId} is already in ${archive}`)
      set(s => ({ archives: { ...s.archives, [archive]: { ...a, batches: { ...a.batches, [batchId]: { ...b, archivedIn: [...b.archivedIn, archive] } } } },
        batches: { ...s.batches, [batchId]: { ...b, archivedIn: [...b.archivedIn, archive] } } }))
      log(`Batch ${batchId} archived to ${archive}`)
      return ok(batchId)
    },
    archiveEvents: (archive, from, to) => {
      const e = needServer()
      if (e) return fail(e)
      const a = get().archives[archive]
      if (!a) return fail(`The archive ${archive} does not exist`)
      if (!(to > from)) return fail('The end time must be after the beginning time')
      const evs = get().chronicle.filter(c => c.time >= from && c.time <= to && !a.events.some(x => x.id === c.id))
      set(s => ({ archives: { ...s.archives, [archive]: { ...a, events: [...a.events, ...evs] } } }))
      log(`${evs.length} event(s) archived to ${archive}`)
      return ok(`${evs.length} events`)
    },
    setMaintenance: patch => {
      const e = needServer()
      if (e) return fail(e)
      const next = { ...get().maintenance, ...patch }
      if (next.autoDelete && !next.autoArchive) return fail('AutoDelete only deletes archived batches: enable AutoArchive too')
      set({ maintenance: next })
      log('Batch Historian maintenance settings changed')
      return ok('saved')
    },
    runMaintenance: () => {
      const e = needServer()
      if (e) return fail(e)
      const m = get().maintenance
      const day = 86400000
      let archived = 0, deleted = 0
      const arch = Object.keys(get().archives)[0]
      for (const b of Object.values(get().batches)) {
        if (b.active || b.end === null) continue
        if (m.autoArchive && arch && !b.archivedIn.length && now() - b.end >= m.archiveAfterDays * day) { if (get().archiveBatch(b.id, arch).ok) archived++ }
      }
      if (m.autoDelete) for (const b of Object.values(get().batches)) {
        if (b.archivedIn.length && b.end !== null && now() - b.end >= m.deleteAfterDays * day) { set(s => { const batches = { ...s.batches }; delete batches[b.id]; return { batches } }); deleted++ }
      }
      log(`Maintenance run: ${archived} batch(es) archived, ${deleted} deleted`)
      return ok(`${archived} archived, ${deleted} deleted`)
    },
    compare: (a, b) => {
      const x = get().batches[a], y = get().batches[b]
      if (!x || !y) return fail('Select two batches that are in the Batch Historian')
      const fx = flatten(x.tree), fy = flatten(y.tree)
      const dur = (r: { start: number | null; end: number | null } | undefined): number | null => (r && r.start !== null ? Math.round(((r.end ?? now()) - r.start) / 100) / 10 : null)
      const paths = Array.from(new Set([...fx.map(r => r.path), ...fy.map(r => r.path)]))
      return ok(paths.map(path => {
        const ra = fx.find(r => r.path === path), rb = fy.find(r => r.path === path)
        const da = dur(ra), db = dur(rb)
        return { path, level: (ra ?? rb)!.level, durationA: da, durationB: db, delta: da !== null && db !== null ? Math.round((db - da) * 10) / 10 : null }
      }))
    },
    processEvents: batchId => {
      const b = get().batches[batchId]
      if (!b || b.start === null) return []
      return get().chronicle.filter(c => c.time >= b.start! && c.time <= (b.end ?? now()))
    },
    trend: (batchId, module) => {
      const b = get().batches[batchId]
      const v = b?.samples.v[module]
      return v ? v.map((value, i) => ({ t: b!.samples.t0 + i * b!.samples.dt, v: value })) : []
    },
    reset: () => set(empty())
  }
})

useStore.subscribe((s, p) => { if (s.time !== p.time) useHistorian.getState().collect() })
// A workstation download of the ProfessionalPLUS (Batch Executive > Download > Equipment) also sends the Batch Historian configuration.
useExecutive.subscribe((s, p) => { if (s.equipment !== p.equipment && s.equipmentAt !== null) useHistorian.getState().markDownloaded() })
libraryHooks.reset.push(() => useHistorian.getState().reset())
