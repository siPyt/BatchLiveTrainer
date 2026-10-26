import { newId, nextName, type PhaseRoute, type PhaseSfc, type StepDef, type TransitionDef } from './batchConfig'

/**
 * Control Studio draws a phase composite as an SFC with alternate (selective) branches: a step fans out to several
 * transitions, each leading to its own sequence, and legs rejoin at a later step or end in a termination.
 * The model stays steps[i] + transitions[i]; a step with routes uses them instead of its ordinary transition,
 * and the first TRUE route wins.
 */
export interface PhaseEdge {
  from: number
  /** null terminates the composite. */
  to: number | null
  /** Index into sfc.routes, or null for the step's ordinary transition. */
  route: number | null
  name: string
  condition: string
  back: boolean
}

export interface PhaseLayout {
  row: number[]
  col: number[]
  /** Column of the vertical leg each edge leaves its step on. */
  leg: number[]
  edges: PhaseEdge[]
  rows: number
  cols: number
}

export const routeName = (r: PhaseRoute, k: number): string => r.name ?? `${r.from}_T${k + 1}`

export function phaseEdges(sfc: PhaseSfc): Omit<PhaseEdge, 'back'>[] {
  const out: Omit<PhaseEdge, 'back'>[] = []
  sfc.steps.forEach((step, i) => {
    const routed = (sfc.routes ?? []).map((r, route) => ({ r, route })).filter(x => x.r.from === step.name)
    if (routed.length) {
      routed.forEach(({ r, route }, k) => {
        const to = r.to === null ? -1 : sfc.steps.findIndex(s => s.name === r.to)
        out.push({ from: i, to: r.to === null || to < 0 ? null : to, route, name: routeName(r, k), condition: r.condition })
      })
      return
    }
    const tr = sfc.transitions[i]
    if (tr) out.push({ from: i, to: i + 1 < sfc.steps.length ? i + 1 : null, route: null, name: tr.name, condition: tr.condition })
  })
  return out
}

export function layoutPhaseSfc(sfc: PhaseSfc): PhaseLayout {
  const raw = phaseEdges(sfc)
  const n = sfc.steps.length
  const state: (0 | 1 | 2)[] = Array(n).fill(0)
  const back = new Set<number>()
  const post: number[] = []
  const visit = (i: number): void => {
    state[i] = 1
    raw.forEach((e, k) => {
      if (e.from !== i || e.to === null) return
      if (state[e.to] === 1) back.add(k)
      else if (!state[e.to]) visit(e.to)
    })
    state[i] = 2
    post.push(i)
  }
  if (n) visit(0)
  const order = [...post].reverse()
  const row = Array<number>(n).fill(0)
  for (const i of order) raw.forEach((e, k) => { if (e.from === i && e.to !== null && !back.has(k)) row[e.to] = Math.max(row[e.to], row[i] + 1) })

  const col = Array<number | undefined>(n).fill(undefined)
  const leg = Array<number>(raw.length).fill(0)
  if (n) col[0] = 0
  let nextCol = 1
  for (const i of order) {
    const outs = raw.map((e, k) => ({ e, k })).filter(x => x.e.from === i && !back.has(x.k))
    outs.forEach(({ e, k }, j) => {
      leg[k] = j === 0 ? col[i] ?? 0 : nextCol++
      if (e.to !== null && col[e.to] === undefined) col[e.to] = leg[k]
    })
  }
  const incoming = (i: number): number[] => raw.flatMap((e, k) => (e.to === i && !back.has(k) ? [e.from] : []))
  for (const i of order) {
    const parents = incoming(i)
    if (parents.length > 1) col[i] = Math.min(...parents.map(p => col[p] ?? 0))
  }
  // Steps unreachable from the initial step are stacked below the chart.
  const maxRow = Math.max(-1, ...order.map(i => row[i]))
  let extra = 0
  sfc.steps.forEach((_, i) => { if (!state[i]) { row[i] = maxRow + 1 + extra++; col[i] = 0 } })
  const finalCol = col.map(c => c ?? 0)
  raw.forEach((e, k) => { if (back.has(k)) leg[k] = finalCol[e.from] })
  return { row, col: finalCol, leg, edges: raw.map((e, k) => ({ ...e, back: back.has(k) })), rows: Math.max(1, ...row.map(r => r + 1)),
    cols: Math.max(1, ...finalCol.map(c => c + 1), ...leg.map(c => c + 1)) }
}

export const isBranched = (sfc: PhaseSfc): boolean => !!sfc.routes?.length

export type EdgeRef = { i: number; route: number | null }

/** Make a step's ordinary transition an explicit route so it can be redirected or sit beside alternates. */
function explicit(sfc: PhaseSfc, i: number): PhaseSfc {
  const step = sfc.steps[i]
  if (sfc.routes?.some(r => r.from === step.name)) return sfc
  const tr = sfc.transitions[i]
  const route: PhaseRoute = { from: step.name, to: sfc.steps[i + 1]?.name ?? null, condition: tr?.condition ?? 'TRUE', name: tr?.name }
  return { ...sfc, routes: [...(sfc.routes ?? []), route] }
}

/** Without a route of its own, the last step would flow into steps appended after it. */
function freezeLast(sfc: PhaseSfc): PhaseSfc {
  return sfc.steps.length ? explicit(sfc, sfc.steps.length - 1) : sfc
}

/** Alternate Branch: another transition leaves the step and starts a new leg that terminates until it is connected. */
export function addBranch(sfc: PhaseSfc, i: number): PhaseSfc | string {
  const step = sfc.steps[i]
  if (!step) return 'Select a step or transition first'
  if (sfc.steps.length + sfc.transitions.length + 2 > 127) return 'Do not configure more than 127 steps and transitions in any level'
  let next = freezeLast(explicit(sfc, i))
  const stepDef: StepDef = { id: newId('s'), name: nextName(next, 'S'), description: '', actions: [] }
  next = { ...next, steps: [...next.steps, stepDef] }
  const trDef: TransitionDef = { id: newId('t'), name: nextName(next, 'T'), description: '', condition: 'TRUE' }
  next = { ...next, transitions: [...next.transitions, trDef] }
  const legName = nextName(next, 'T')
  return { ...next, routes: [...(next.routes ?? []),
    { from: step.name, to: stepDef.name, condition: 'TRUE', name: legName },
    { from: stepDef.name, to: null, condition: trDef.condition, name: trDef.name }] }
}

/** Add Sequence/Step inside a branched chart: splice new steps onto the transition so the chain stays connected. */
export function insertOnEdge(sfc: PhaseSfc, ref: EdgeRef, count: number): PhaseSfc | string {
  if (!sfc.steps[ref.i]) return 'Select a step or transition first'
  if (sfc.steps.length + sfc.transitions.length + 2 * count > 127) return 'Do not configure more than 127 steps and transitions in any level'
  let next = freezeLast(ref.route === null ? explicit(sfc, ref.i) : sfc)
  const step = next.steps[ref.i]
  const index = ref.route ?? (next.routes ?? []).findIndex(r => r.from === step.name)
  const oldTarget = next.routes?.[index]?.to ?? null
  const created: { step: StepDef; tr: TransitionDef }[] = []
  for (let k = 0; k < count; k++) {
    const s: StepDef = { id: newId('s'), name: nextName(next, 'S'), description: '', actions: [] }
    next = { ...next, steps: [...next.steps, s] }
    const t: TransitionDef = { id: newId('t'), name: nextName(next, 'T'), description: '', condition: 'TRUE' }
    next = { ...next, transitions: [...next.transitions, t] }
    created.push({ step: s, tr: t })
  }
  const routes = (next.routes ?? []).map((r, k) => (k === index ? { ...r, to: created[0].step.name } : r))
  created.forEach(({ step: s, tr }, k) => routes.push({ from: s.name, to: created[k + 1]?.step.name ?? oldTarget, condition: tr.condition, name: tr.name }))
  return { ...next, routes }
}

export function edgeAt(sfc: PhaseSfc, ref: EdgeRef): PhaseEdge | undefined {
  return layoutPhaseSfc(sfc).edges.find(e => e.from === ref.i && e.route === ref.route)
}

/** Redirect a transition to another step, or to a termination (null). */
export function connectEdge(sfc: PhaseSfc, ref: EdgeRef, target: string | null): PhaseSfc | string {
  if (target !== null && !sfc.steps.some(s => s.name === target)) return `Step ${target} does not exist`
  const base = ref.route === null ? explicit(sfc, ref.i) : sfc
  const step = sfc.steps[ref.i]
  const index = ref.route ?? (base.routes ?? []).findIndex(r => r.from === step.name)
  const routes = (base.routes ?? []).map((r, k) => (k === index ? { ...r, to: target } : r))
  return { ...base, routes }
}

export function editEdge(sfc: PhaseSfc, ref: EdgeRef, patch: { name: string; condition: string; description?: string }): PhaseSfc | string {
  if (ref.route === null) {
    return { ...sfc, transitions: sfc.transitions.map((t, k) => (k === ref.i ? { ...t, name: patch.name, condition: patch.condition, description: patch.description ?? t.description } : t)) }
  }
  const old = sfc.routes?.[ref.route]
  if (!old) return 'That transition no longer exists'
  const shadow = sfc.steps.findIndex(s => s.name === old.from)
  return { ...sfc,
    transitions: sfc.transitions.map((t, k) => (k === shadow && t.name === old.name ? { ...t, name: patch.name, condition: patch.condition } : t)),
    routes: (sfc.routes ?? []).map((r, k) => (k === ref.route ? { ...r, name: patch.name, condition: patch.condition } : r)) }
}

/** Remove one alternate. The step keeps at least one route so it never silently falls through to another step. */
export function deleteBranch(sfc: PhaseSfc, ref: EdgeRef): PhaseSfc | string {
  if (ref.route === null) return 'Only alternate branches can be deleted; delete the step to remove its transition'
  const route = sfc.routes?.[ref.route]
  if (!route) return 'That branch no longer exists'
  if ((sfc.routes ?? []).filter(r => r.from === route.from).length <= 1) return 'A step needs at least one transition'
  return { ...sfc, routes: (sfc.routes ?? []).filter((_, k) => k !== ref.route) }
}

export function routeNames(sfc: PhaseSfc): string[] {
  return (sfc.routes ?? []).flatMap(r => (r.name ? [r.name] : []))
}
