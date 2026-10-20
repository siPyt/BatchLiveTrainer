import { create } from 'zustand'
import type { BatchClassKind, PhaseParamKind } from '../engine/batchConfig'

export type BatchDialog =
  | { t: 'newUnitClass'; category: string }
  | { t: 'newPhaseClass'; category: string }
  | { t: 'newAlias'; unitClass: string }
  | { t: 'alias'; unit: string; alias: string }
  | { t: 'param'; phaseClass: string; kind: PhaseParamKind; original?: string }
  | { t: 'unitProps'; unit: string; tab?: string }
  | { t: 'phaseProps'; unit: string; phase: string }
  | { t: 'uphaseParam'; unit: string; phase: string; param: string }
  | { t: 'assignPhase'; unitClass: string }
  | { t: 'addToUnit'; phaseClass: string }
  | { t: 'assignNode'; unit: string; contained: boolean; controller?: string }
  | { t: 'download'; unit: string; contained: boolean }
  | { t: 'loadPhase'; unit: string }

export type Renaming = { kind: 'cat'; cls: BatchClassKind; name: string } | { kind: 'class'; cls: BatchClassKind; name: string } | { kind: 'cell'; name: string } | { kind: 'unit'; name: string }

export interface BatchWindow { id: string; kind: 'unit' | 'phase'; unit: string; phase?: string; x: number; y: number; z: number }

interface BatchUi {
  dialog: BatchDialog | null
  openDialog: (d: BatchDialog | null) => void
  renaming: Renaming | null
  setRenaming: (r: Renaming | null) => void
  windows: BatchWindow[]
  openUnit: (unit: string, x?: number, y?: number) => void
  openPhase: (unit: string, phase: string) => void
  closeWindow: (id: string) => void
  moveWindow: (id: string, x: number, y: number) => void
  focusWindow: (id: string) => void
}

let top = 0
let cascade = 0

export const useBatchUi = create<BatchUi>((set, get) => ({
  dialog: null,
  openDialog: dialog => set({ dialog }),
  renaming: null,
  setRenaming: renaming => set({ renaming }),
  windows: [],
  openUnit: (unit, x, y) => {
    const id = `unit:${unit}`
    if (get().windows.some(w => w.id === id)) { get().focusWindow(id); return }
    const o = (cascade++ % 5) * 24
    set(s => ({ windows: [...s.windows, { id, kind: 'unit', unit, x: x ?? 160 + o, y: y ?? 70 + o, z: ++top }] }))
  },
  openPhase: (unit, phase) => {
    const id = `phase:${unit}/${phase}`
    if (get().windows.some(w => w.id === id)) { get().focusWindow(id); return }
    const o = (cascade++ % 5) * 24
    set(s => ({ windows: [...s.windows, { id, kind: 'phase', unit, phase, x: 460 + o, y: 90 + o, z: ++top }] }))
  },
  closeWindow: id => set(s => ({ windows: s.windows.filter(w => w.id !== id) })),
  moveWindow: (id, x, y) => set(s => ({ windows: s.windows.map(w => (w.id === id ? { ...w, x, y } : w)) })),
  focusWindow: id => set(s => ({ windows: s.windows.map(w => (w.id === id ? { ...w, z: ++top } : w)) }))
}))
