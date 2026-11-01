import { create } from 'zustand'
import type { RecipeLevel } from '../engine/executive'

export type ExecDialog =
  | { t: 'newRecipe'; level: RecipeLevel }
  | { t: 'recipeProps'; name: string; tab?: string }
  | { t: 'rename'; name: string }
  | { t: 'execProps' }
  | { t: 'downloadEquipment' }
  | { t: 'assignArea' }

export type BoiScreen = 'list' | 'pfc' | 'journal' | 'prompts' | 'phases' | 'arbitration' | 'alarms' | 'active'

interface ExecUi {
  dialog: ExecDialog | null
  openDialog: (d: ExecDialog | null) => void
  /** Recipe open in Recipe Studio. */
  studio: string | null
  openStudio: (name: string | null) => void
  screen: BoiScreen
  setScreen: (s: BoiScreen) => void
  selectedBatch: string | null
  selectBatch: (id: string | null) => void
  phaseCtl: { showUnits: boolean; unit: string; phase: string }
  setPhaseCtl: (p: Partial<{ showUnits: boolean; unit: string; phase: string }>) => void
}

export const useExecUi = create<ExecUi>(set => ({
  dialog: null,
  openDialog: dialog => set({ dialog }),
  studio: null,
  openStudio: studio => set({ studio }),
  screen: 'list',
  setScreen: screen => set({ screen }),
  selectedBatch: null,
  selectBatch: selectedBatch => set({ selectedBatch }),
  phaseCtl: { showUnits: false, unit: '', phase: '' },
  setPhaseCtl: p => set(s => ({ phaseCtl: { ...s.phaseCtl, ...p } }))
}))
