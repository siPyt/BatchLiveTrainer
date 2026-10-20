import type { StepCheck } from './workshopChecks'
import type { TransferEpisode, TransferLog } from './libraryStore'

/** Evidence-based checking of the Course 7016 Chapter 2 Workshop – Manual Operation (p2-6), from the measured process transfers. */

type Band = { keys: string[]; pick: (e: TransferEpisode) => number; range: [number, number]; extra?: (e: TransferEpisode) => boolean; unit: string }

const BANDS: Record<'fill' | 'base' | 'dump' | 'agit' | 'drain', Band> = {
  fill: { keys: ['TK100 FILL'], pick: e => e.endLevel, range: [55, 80], unit: 'gal in COLOR 100' },
  base: { keys: ['BASE>BL500'], pick: e => e.amount, range: [85, 135], extra: e => Math.abs(e.avgSp - 90) <= 5, unit: 'gal BASE 400 → BLENDER 500' },
  dump: { keys: ['TK100>BL500'], pick: e => e.amount, range: [42, 75], unit: 'gal COLOR 100 → BLENDER 500' },
  agit: { keys: ['AGIT-503 RUN'], pick: e => e.amount, range: [55, 1e9], unit: 's AGIT-503 running' },
  drain: { keys: ['BL500>PRODUCT', 'BL500>WASTE'], pick: e => e.amount, range: [105, 170], unit: 'gal BLENDER 500 → Product/Waste' }
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString()

function hits(t: Record<string, TransferLog>, b: Band): TransferEpisode[] {
  return b.keys.flatMap(k => t[k]?.episodes ?? []).filter(e => b.pick(e) >= b.range[0] && b.pick(e) <= b.range[1] && (!b.extra || b.extra(e))).sort((a, c) => a.at - c.at)
}
function last(t: Record<string, TransferLog>, b: Band): string {
  const all = b.keys.flatMap(k => t[k]?.episodes ?? []).sort((a, c) => a.at - c.at)
  const e = all.at(-1)
  return e ? `last ${r1(b.pick(e))} ${b.unit}${b.keys[0].startsWith('BASE>') ? ` at ${r1(e.avgSp)} GPM SP` : ''}` : 'not seen yet'
}

export function checkCourse7016ManualOp(transfers: Record<string, TransferLog>): StepCheck[] {
  const v = (id: string, b: Band, good: string, how: string): StepCheck => {
    const h = hits(transfers, b)
    return { id, verdict: h.length ? 'verified' : 'pending', detail: h.length ? `${good} (${r1(b.pick(h[0]))} ${b.unit})` : `${how} (${last(transfers, b)})` }
  }
  const twice = (Object.keys(BANDS) as (keyof typeof BANDS)[]).map(k => ({ k, h: hits(transfers, BANDS[k]) }))
  const repeated = twice.every(x => x.h.length >= 2)
  const compare = twice.filter(x => x.h.length >= 2).map(x => `${x.k} ${r1(BANDS[x.k].pick(x.h[0]))} → ${r1(BANDS[x.k].pick(x.h[1]))}`).join(', ')
  const missing = twice.filter(x => x.h.length < 2).map(x => x.k).join(', ')
  return [
    v('7016-2m-1', BANDS.fill, 'COLOR 100 filled to about 60 gal', 'Open XV-101 and close it at 60 gal on LI-104'),
    v('7016-2m-2', BANDS.base, '100 gal transferred at 90 GPM', 'FIC-404 AUTO, then SP 90; open XV-501, start MTR-403; stop at +100 gal'),
    v('7016-2m-3', BANDS.dump, '50 gal dumped', 'Open XV-102 and put XV-502 in Bulk; close both at −50 gal'),
    v('7016-2m-4', BANDS.agit, 'AGIT-503 ran 1 minute', 'Start AGIT-503 and stop it after 60 s'),
    v('7016-2m-5', BANDS.drain, '125 gal drained', 'Open XV-503 (Product) or XV-504 (Waste) and start MTR-505; stop at −125 gal'),
    { id: '7016-2m-6', verdict: repeated ? 'verified' : 'pending',
      detail: repeated ? `Second run done — 1st → 2nd: ${compare}` : `Repeat the whole process (second run still needed for: ${missing})${compare ? ` — so far ${compare}` : ''}` }
  ]
}
