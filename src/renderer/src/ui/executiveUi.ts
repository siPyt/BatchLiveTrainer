import { create } from 'zustand'
import { useExecutive, type ConfirmAction, type RecipeLevel } from '../engine/executive'

export type ExecDialog =
  | { t: 'newRecipe'; level: RecipeLevel }
  | { t: 'recipeProps'; name: string; tab?: string }
  | { t: 'rename'; name: string }
  | { t: 'execProps'; tab?: string }
  | { t: 'clientConfig' }
  | { t: 'oiConfig' }
  | { t: 'downloadEquipment' }
  | { t: 'assignArea' }

export type BoiScreen = 'list' | 'pfc' | 'table' | 'journal' | 'prompts' | 'phases' | 'arbitration' | 'alarms' | 'active' | 'config'

export interface ActionGate { action: ConfirmAction; subject: string; batchId: string; run: () => void }

interface ExecUi {
  dialog: ExecDialog | null
  openDialog: (d: ExecDialog | null) => void
  /** The prompt / confirm / verify dialog of a configured operator action. */
  gate: ActionGate | null
  openGate: (g: ActionGate | null) => void
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
  gate: null,
  openGate: gate => set({ gate }),
  studio: null,
  openStudio: studio => set({ studio }),
  screen: 'list',
  setScreen: screen => set({ screen }),
  selectedBatch: null,
  selectBatch: selectedBatch => set({ selectedBatch }),
  phaseCtl: { showUnits: false, unit: '', phase: '' },
  setPhaseCtl: p => set(s => ({ phaseCtl: { ...s.phaseCtl, ...p } }))
}))

/**
 * Runs an operator action after the confirmation the Batch Executive's Action Confirmation tab asks for it.
 * `asked` means the screen already put a dialog of its own in front of the operator, so a bare Prompt adds nothing.
 */
export function guarded(action: ConfirmAction, subject: string, run: () => void, opts: { batchId?: string; asked?: boolean } = {}): void {
  const x = useExecutive.getState()
  if (!x.actionEnabled(action)) { window.alert(`${action} is not enabled on this client (Batch Executive Client Configuration).`); return }
  const c = x.actionConfirm[action]
  if (!c.confirm && !c.verify && (!c.prompt || opts.asked)) { run(); return }
  useExecUi.getState().openGate({ action, subject, batchId: opts.batchId ?? '', run })
}