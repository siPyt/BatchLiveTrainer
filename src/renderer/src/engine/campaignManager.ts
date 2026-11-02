import { create } from 'zustand'
import { useStore } from './store'
import { useExecutive } from './executive'
import { useBatch } from './batchStore'
import { libraryHooks } from './libraryStore'

// DeltaV Batch Campaign Manager (Course 7016 chapter 15, slides 15-4 .. 15-35). A campaign is a sequence of identical or nearly identical
// batches run on one equipment line. The Campaign Manager server releases the batches of a campaign to the Batch Executive (Add to
// Executive), starts them and follows their state; the modes are Manual, Auto Release and Auto Start.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never>(error: string): Result<T> => ({ ok: false, error })

export type CampaignMode = 'Manual' | 'Auto Release' | 'Auto Start'
export type CampBatchKind = 'Setup' | 'Batch' | 'Cleanup'
export interface CampRecipe { recipe: string; formula: string; bindings: Record<string, string>; scale: number }
export interface CampBatch extends CampRecipe { id: string; seq: number; kind: CampBatchKind; released: boolean; removed: boolean }
export interface Campaign extends CampRecipe {
  name: string; nBatches: number; maxActive: number; mode: CampaignMode; terminated: boolean; createdAt: number
  setup: CampRecipe | null; cleanup: CampRecipe | null; batches: CampBatch[]; comments: { at: number; user: string; text: string }[]
}
export interface AutoRemove { enabled: boolean; delayMin: number }
export const CAMPAIGN_ACTIONS = ['New Campaign', 'Remove Campaign', 'Terminate Campaign', 'Add Campaign Comment', 'New Batch', 'Delete Batch', 'Edit Batch', 'Add Batch to Executive', 'Start Batch', 'Remove Batch from Executive', 'Set Campaign Mode'] as const
export type CampaignAction = typeof CAMPAIGN_ACTIONS[number]
export const CAMPAIGN_STATES = ['Defined', 'Active - Ready', 'Active - Running', 'Active - Held', 'Active - Complete', 'Complete', 'Stopped', 'Aborted'] as const
const FINISHED = ['Complete', 'Active - Complete']

export interface CampaignState {
  enabled: boolean
  description: string
  batchExecutiveNode: string
  autoRemove: { manual: AutoRemove; autoRelease: AutoRemove; autoStart: AutoRemove }
  journalDays: number
  actionConfirm: Record<string, { prompt: boolean; confirm: boolean; verify: boolean }>
  client: { allowLocal: boolean; sequenceLength: number; hideCompleted: boolean; enabledActions: Record<string, boolean>; columns: string[]; colors: Record<string, string> }
  service: 'STOPPED' | 'RUNNING'
  campaigns: Record<string, Campaign>
  journal: { at: number; campaign: string; text: string }[]

  setProps: (p: { enabled?: boolean; description?: string; batchExecutiveNode?: string; autoRemove?: CampaignState['autoRemove']; journalDays?: number; actionConfirm?: CampaignState['actionConfirm'] }) => Result<string>
  setClientConfig: (c: Partial<CampaignState['client']>) => Result<string>
  toggleService: () => Result<string>
  purge: () => Result<string>
  createCampaign: (c: { name: string; nBatches: number; maxActive: number; recipe: string; formula: string; bindings: Record<string, string>; scale?: number; setup?: CampRecipe | null; cleanup?: CampRecipe | null }) => Result<string>
  removeCampaign: (name: string) => Result<string>
  terminateCampaign: (name: string) => Result<string>
  setMode: (name: string, mode: CampaignMode) => Result<string>
  newBatch: (name: string) => Result<string>
  deleteBatch: (name: string, id: string) => Result<string>
  editBatch: (name: string, id: string, patch: Partial<CampRecipe>) => Result<string>
  release: (name: string, id: string) => Result<string>
  startBatch: (name: string, id: string) => Result<string>
  removeFromExecutive: (name: string, id: string) => Result<string>
  addComment: (name: string, text: string) => Result<string>
  stateOf: (name: string, id: string) => string
  actionEnabled: (a: CampaignAction) => boolean
  step: () => void
  reset: () => void
}

const now = (): number => useStore.getState().time
const user = (): string => 'ADMINISTRATOR'
const pad = (n: number, w: number): string => String(n).padStart(w, '0')
const defaultActionConfirm = (): CampaignState['actionConfirm'] => Object.fromEntries(CAMPAIGN_ACTIONS.map(a => [a, { prompt: true, confirm: false, verify: false }]))
const defaultColors = (): Record<string, string> => ({ 'Active - Running': '#1b8f3a', 'Active - Ready': '#2f6db5', 'Active - Held': '#d19b00', Complete: '#555555', Defined: '#888888', Stopped: '#b36b00', Aborted: '#b3261e' })
const empty = (): Pick<CampaignState, 'enabled' | 'description' | 'batchExecutiveNode' | 'autoRemove' | 'journalDays' | 'actionConfirm' | 'client' | 'service' | 'campaigns' | 'journal'> => ({
  enabled: false, description: '', batchExecutiveNode: 'PROPLUS',
  autoRemove: { manual: { enabled: false, delayMin: 5 }, autoRelease: { enabled: false, delayMin: 5 }, autoStart: { enabled: false, delayMin: 5 } },
  journalDays: 30, actionConfirm: defaultActionConfirm(),
  client: { allowLocal: true, sequenceLength: 2, hideCompleted: false, enabledActions: Object.fromEntries(CAMPAIGN_ACTIONS.map(a => [a, true])), columns: ['Name', 'State', 'Recipe', 'Formula', 'Units'], colors: defaultColors() },
  service: 'STOPPED', campaigns: {}, journal: []
})

export const useCampaigns = create<CampaignState>((set, get) => {
  const log = (campaign: string, text: string): void => {
    set(s => ({ journal: [...s.journal, { at: now(), campaign, text }].slice(-600) }))
    useStore.getState().logEvent('BATCH', campaign || 'CAMPAIGN MANAGER', text)
  }
  const camp = (name: string): Campaign | undefined => get().campaigns[name]
  const patchCamp = (name: string, patch: Partial<Campaign>): void => set(s => ({ campaigns: { ...s.campaigns, [name]: { ...s.campaigns[name], ...patch } } }))
  const patchBatch = (name: string, id: string, patch: Partial<CampBatch>): void => {
    const c = camp(name)
    if (c) patchCamp(name, { batches: c.batches.map(b => (b.id === id ? { ...b, ...patch } : b)) })
  }
  const needService = (): string | null => (get().service === 'RUNNING' ? null : 'The Campaign Manager service is not running (Batch Application Manager > Campaign Manager > Start)')
  const idFor = (c: { name: string }, seq: number): string => `${c.name}_${pad(seq, get().client.sequenceLength)}`
  const validateRecipe = (r: CampRecipe): string | null => {
    const x = useExecutive.getState()
    if (!x.downloaded[r.recipe]) return `${r.recipe} has not been downloaded to the Batch Executive`
    const rec = x.downloaded[r.recipe].recipe
    if (r.formula && !rec.formulas[r.formula]) return `Formula ${r.formula} does not exist in ${r.recipe}`
    for (const need of x.bindingsNeeded(r.recipe)) {
      const unit = need.fixed || r.bindings[need.key]
      if (!unit) return `Bind ${need.label} to a unit of class ${need.unitClass}`
      if (useBatch.getState().units[unit]?.unitClass !== need.unitClass) return `${unit} is not a unit of class ${need.unitClass} (binding ${need.label})`
    }
    return null
  }
  const execBatch = (id: string): ReturnType<typeof useExecutive.getState>['batches'][number] | undefined => useExecutive.getState().batches.find(b => b.id === id)

  return {
    ...empty(),

    setProps: p => {
      set(s => ({ ...(p.enabled !== undefined ? { enabled: p.enabled } : {}), ...(p.description !== undefined ? { description: p.description } : {}),
        ...(p.batchExecutiveNode !== undefined ? { batchExecutiveNode: p.batchExecutiveNode } : {}), ...(p.autoRemove ? { autoRemove: p.autoRemove } : {}),
        ...(p.journalDays !== undefined ? { journalDays: p.journalDays } : {}), ...(p.actionConfirm ? { actionConfirm: p.actionConfirm } : {}),
        ...(p.enabled === false ? { service: 'STOPPED' as const } : {}) , campaigns: s.campaigns }))
      log('', `Campaign Manager properties changed${p.enabled !== undefined ? ` (${p.enabled ? 'enabled' : 'disabled'})` : ''}`)
      return ok('saved')
    },
    setClientConfig: c => {
      if (c.sequenceLength !== undefined && (!Number.isInteger(c.sequenceLength) || c.sequenceLength < 1 || c.sequenceLength > 6)) return fail('The sequence length is 1 to 6 digits')
      set(s => ({ client: { ...s.client, ...c } }))
      log('', 'Campaign Manager Client Configuration changed')
      return ok('saved')
    },
    toggleService: () => {
      const s = get()
      if (s.service === 'RUNNING') { set({ service: 'STOPPED' }); log('', 'Campaign Manager service stopped'); return ok('STOPPED') }
      if (!s.enabled) return fail('The Campaign Manager is not enabled (Explorer > PROPLUS > Campaign Manager > Properties > General)')
      if (useExecutive.getState().service !== 'RUNNING') return fail('The Campaign Manager must run on the same node as the Batch Executive: start the Batch Executive first')
      set({ service: 'RUNNING' })
      log('', 'Campaign Manager service started')
      return ok('RUNNING')
    },
    purge: () => {
      if (get().service === 'RUNNING') return fail('Stop the Campaign Manager service before you purge it')
      set({ campaigns: {}, journal: [] })
      return ok('purged')
    },
    createCampaign: c => {
      const e = needService()
      if (e) return fail(e)
      const name = c.name.trim()
      const w = get().client.sequenceLength
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return fail('Campaign names start with a letter and use letters, digits and underscores')
      if (name.length + 1 + w > 16) return fail(`The campaign name plus the ${w}-digit sequence number makes a Batch ID of more than 16 characters: shorten the name`)
      if (get().campaigns[name]) return fail(`The campaign ${name} already exists`)
      if (!Number.isInteger(c.nBatches) || c.nBatches < 1 || c.nBatches >= 10 ** w) return fail(`The number of batches is 1 to ${10 ** w - 1} for a ${w}-digit sequence`)
      if (!Number.isInteger(c.maxActive) || c.maxActive < 1 || c.maxActive > c.nBatches) return fail('The number of active batches is at least 1 and not more than the number of batches')
      const base: CampRecipe = { recipe: c.recipe, formula: c.formula, bindings: { ...c.bindings }, scale: c.scale ?? 1 }
      for (const r of [base, c.setup, c.cleanup]) { if (!r) continue; const err = validateRecipe(r); if (err) return fail(err) }
      const batches: CampBatch[] = []
      let seq = 1
      if (c.setup) batches.push({ ...c.setup, id: idFor({ name }, seq), seq: seq++, kind: 'Setup', released: false, removed: false })
      for (let i = 0; i < c.nBatches; i++) batches.push({ ...base, bindings: { ...base.bindings }, id: idFor({ name }, seq), seq: seq++, kind: 'Batch', released: false, removed: false })
      if (c.cleanup) batches.push({ ...c.cleanup, id: idFor({ name }, seq), seq: seq++, kind: 'Cleanup', released: false, removed: false })
      set(s => ({ campaigns: { ...s.campaigns, [name]: { ...base, name, nBatches: c.nBatches, maxActive: c.maxActive, mode: 'Manual', terminated: false, createdAt: now(), setup: c.setup ?? null, cleanup: c.cleanup ?? null, batches, comments: [] } } }))
      log(name, `Campaign ${name} created with ${c.nBatches} batch(es) of ${c.recipe}; maximum active batches ${c.maxActive}; base formula ${c.formula || '(none)'}; units ${Object.values(c.bindings).join(', ') || '(none)'}`)
      const sb = batches.find(b => b.kind === 'Setup'), cb = batches.find(b => b.kind === 'Cleanup')
      if (sb || cb) log(name, `Campaign ${name} has setup batch ${sb?.id ?? '(none)'} (${sb?.recipe ?? '-'}) and cleanup batch ${cb?.id ?? '(none)'} (${cb?.recipe ?? '-'})`)
      return ok(name)
    },
    removeCampaign: name => {
      const c = camp(name)
      if (!c) return fail(`The campaign ${name} does not exist`)
      const active = c.batches.some(b => b.released && !b.removed && ['Active - Ready', 'Active - Running', 'Active - Held'].includes(get().stateOf(name, b.id)))
      const done = c.batches.every(b => FINISHED.includes(get().stateOf(name, b.id)))
      if (active) return fail('The campaign has active batches')
      if (!done && !c.terminated) return fail('A campaign can be removed after all its batches complete, or after it was terminated and has no active batches')
      set(s => { const campaigns = { ...s.campaigns }; delete campaigns[name]; return { campaigns } })
      log(name, `Campaign ${name} removed`)
      return ok(name)
    },
    terminateCampaign: name => {
      const c = camp(name)
      if (!c) return fail(`The campaign ${name} does not exist`)
      if (c.terminated) return fail(`The campaign ${name} is already terminated`)
      patchCamp(name, { terminated: true, mode: 'Manual' })
      log(name, `Campaign ${name} terminated: no more batches are released; released batches stay under the control of the Batch Executive`)
      return ok(name)
    },
    setMode: (name, mode) => {
      const c = camp(name)
      if (!c) return fail(`The campaign ${name} does not exist`)
      if (c.terminated) return fail('A terminated campaign cannot change mode')
      patchCamp(name, { mode })
      log(name, `Campaign ${name} mode changed to ${mode}`)
      return ok(mode)
    },
    newBatch: name => {
      const c = camp(name)
      if (!c) return fail(`The campaign ${name} does not exist`)
      if (c.terminated) return fail('A terminated campaign cannot get new batches')
      const seq = Math.max(0, ...c.batches.map(b => b.seq)) + 1
      if (seq >= 10 ** get().client.sequenceLength) return fail('The sequence number has no more digits: increase the sequence length in the Client Configuration')
      const b: CampBatch = { recipe: c.recipe, formula: c.formula, bindings: { ...c.bindings }, scale: c.scale, id: idFor(c, seq), seq, kind: 'Batch', released: false, removed: false }
      const batches = [...c.batches]
      const cleanup = batches.findIndex(x => x.kind === 'Cleanup')
      if (cleanup >= 0) batches.splice(cleanup, 0, b); else batches.push(b)
      patchCamp(name, { batches, nBatches: c.nBatches + 1 })
      log(name, `Batch ${b.id} added to campaign ${name}`)
      return ok(b.id)
    },
    deleteBatch: (name, id) => {
      const c = camp(name)
      const b = c?.batches.find(x => x.id === id)
      if (!c || !b) return fail('That batch does not exist')
      if (b.released) return fail(`Batch ${id} was released to the Batch Executive: remove it from the Batch Executive first`)
      patchCamp(name, { batches: c.batches.filter(x => x.id !== id), nBatches: b.kind === 'Batch' ? c.nBatches - 1 : c.nBatches })
      log(name, `Batch ${id} deleted from campaign ${name}`)
      return ok(id)
    },
    editBatch: (name, id, patch) => {
      const c = camp(name)
      const b = c?.batches.find(x => x.id === id)
      if (!c || !b) return fail('That batch does not exist')
      if (b.released) return fail('Batches can be edited only before they are released to the Batch Executive')
      const next = { ...b, ...patch, bindings: { ...b.bindings, ...(patch.bindings ?? {}) } }
      const err = validateRecipe(next)
      if (err) return fail(err)
      if (!(next.scale > 0)) return fail('The scale must be greater than zero')
      patchBatch(name, id, { recipe: next.recipe, formula: next.formula, bindings: next.bindings, scale: next.scale })
      log(name, `Batch ${id} edited (${next.recipe}${next.formula ? `, formula ${next.formula}` : ''}, scale ${next.scale})`)
      return ok(id)
    },
    release: (name, id) => {
      const e = needService()
      if (e) return fail(e)
      const c = camp(name)
      const b = c?.batches.find(x => x.id === id)
      if (!c || !b) return fail('That batch does not exist')
      if (c.terminated) return fail('No additional batches can be released after a campaign is terminated')
      if (b.released) return fail(`Batch ${id} was already released`)
      const r = useExecutive.getState().addBatch(b.recipe, b.id, b.formula, b.bindings)
      if (!r.ok) return fail(r.error)
      patchBatch(name, id, { released: true, removed: false })
      log(name, `Batch ${id} released to the Batch Executive`)
      return ok(id)
    },
    startBatch: (name, id) => {
      const e = needService()
      if (e) return fail(e)
      const b = camp(name)?.batches.find(x => x.id === id)
      if (!b?.released || b.removed) return fail(`Batch ${id} has not been released to the Batch Executive`)
      const r = useExecutive.getState().batchCommand(id, 'START')
      if (!r.ok) return fail(r.error)
      log(name, `Batch ${id} started`)
      return ok(id)
    },
    removeFromExecutive: (name, id) => {
      const b = camp(name)?.batches.find(x => x.id === id)
      if (!b?.released || b.removed) return fail(`Batch ${id} is not in the Batch Executive`)
      const r = useExecutive.getState().removeBatch(id)
      if (!r.ok) return fail(r.error)
      patchBatch(name, id, { removed: true })
      log(name, `Batch ${id} removed from the Batch Executive`)
      return ok(id)
    },
    addComment: (name, text) => {
      const c = camp(name)
      if (!c) return fail(`The campaign ${name} does not exist`)
      if (!text.trim()) return fail('Enter the comment')
      patchCamp(name, { comments: [...c.comments, { at: now(), user: user(), text: text.trim() }] })
      log(name, `Comment: ${text.trim()}`)
      return ok('added')
    },
    stateOf: (name, id) => {
      const b = camp(name)?.batches.find(x => x.id === id)
      if (!b || !b.released) return 'Defined'
      const x = execBatch(id)
      if (!x) return b.removed ? 'Complete' : 'Defined'
      return ({ IDLE: 'Active - Ready', RUNNING: 'Active - Running', HELD: 'Active - Held', COMPLETE: 'Active - Complete', STOPPED: 'Stopped', ABORTED: 'Aborted' } as const)[x.state]
    },
    actionEnabled: a => get().client.enabledActions[a] !== false,
    step: () => {
      const s = get()
      if (s.service !== 'RUNNING') return
      if (useExecutive.getState().service !== 'RUNNING') return
      for (const c of Object.values(s.campaigns)) {
        if (c.terminated) continue
        const st = (id: string): string => get().stateOf(c.name, id)
        const live = c.batches.filter(b => b.released && !b.removed)
        const running = live.filter(b => ['Active - Running', 'Active - Held'].includes(st(b.id))).length
        const ready = live.filter(b => st(b.id) === 'Active - Ready')
        if (c.mode !== 'Manual') {
          const pending = c.batches.filter(b => !b.released)
          const setup = c.batches.find(b => b.kind === 'Setup')
          const gate = (b: CampBatch): boolean => (b.kind === 'Setup') || (setup ? FINISHED.includes(st(setup.id)) : true)
          const baseDone = c.batches.filter(b => b.kind === 'Batch').every(b => FINISHED.includes(st(b.id)))
          const eligible = pending.filter(b => (b.kind === 'Cleanup' ? baseDone : gate(b)))
          const inFlight = running + ready.length
          if (eligible.length && inFlight < c.maxActive + 1 && (c.mode === 'Auto Release' || c.mode === 'Auto Start')) get().release(c.name, eligible[0].id)
        }
        if (c.mode === 'Auto Start') {
          const nowReady = c.batches.filter(b => b.released && !b.removed && st(b.id) === 'Active - Ready')
          const nowRunning = c.batches.filter(b => b.released && !b.removed && ['Active - Running', 'Active - Held'].includes(st(b.id))).length
          if (nowReady.length && nowRunning < c.maxActive) get().startBatch(c.name, nowReady[0].id)
        }
        const rule = c.mode === 'Manual' ? s.autoRemove.manual : c.mode === 'Auto Release' ? s.autoRemove.autoRelease : s.autoRemove.autoStart
        if (rule.enabled) {
          for (const b of c.batches.filter(x => x.released && !x.removed && st(x.id) === 'Active - Complete')) {
            const ended = execBatch(b.id)?.ended
            if (ended && now() - ended >= rule.delayMin * 60000) get().removeFromExecutive(c.name, b.id)
          }
        }
      }
    },
    reset: () => set(empty())
  }
})

useStore.subscribe((s, p) => { if (s.time !== p.time) useCampaigns.getState().step() })
libraryHooks.reset.push(() => useCampaigns.getState().reset())
