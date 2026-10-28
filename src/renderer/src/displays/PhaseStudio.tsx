import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useUi } from '../ui/uiStore'
import { useBatchUi } from '../ui/batchUi'
import { useStore } from '../engine/store'
import { useLibrary } from '../engine/libraryStore'
import { EM_PARAMETER_NAMES, useBatch, moduleParamNames, phaseCheckEnv, systemParam } from '../engine/batchStore'
import { PhaseFbd, DRAG_FB } from '../components/PhaseFbd'
import { addBranch, connectEdge, convergeBranches, deleteBranch, edgeAt, editEdge, insertOnEdge, isBranched, layoutPhaseSfc, type EdgeRef } from '../engine/phaseGraph'
import { connectBlocks, deleteBlock, disconnectInput, inputCount, newDiagramBlock, outputCount, phaseBlockDefaults, renameBlock, setBlockCounts, BLOCK_MAX_PINS, DIAGRAM_BLOCK_TYPES, type DiagramBlockType, type PhaseBlock } from '../engine/phaseBlocks'
import {
  COMPOSITES, COMPOSITE_PARAMS, NAME_RULE, QUALIFIER_LABEL, STATE_LABEL, SYSTEM_PHASE_PARAMS, activeStepName, checkExpression, compositeOf,
  deleteStep, insertSequence, isNameValid, nonBooleanErrors, renameError,
  type ActionDef, type ActionQualifier, type ActionType, type CheckEnv, type CompositeName, type PhaseClass, type PhaseSfc, type PhaseState, type UnitClass
} from '../engine/batchConfig'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { ContextMenu } from '../components/LibraryExplorer'
import { BatchIcon } from '../components/BatchExplorer'
import { PaneResizer, usePersistentSize } from '../components/PaneResizer'
import { Btn, Group, Stack } from './ControlStudioDisplay'
import { askConfirm, askValue } from '../components/AppNotices'
import { confirmCloseStudio } from '../components/StudioSaveReminder'
import { ensureTrailingSemicolon } from '../engine/phaseExpr'
import { defaultConfirmExpression } from '../engine/phaseConfirm'

// Control Studio on a Phase Class (course 7016 pp 4-16..4-21): the S88 phase state diagram,
// one Sequential Function Chart per composite state, the "All SFC Items" palette with the
// Add Sequence Of Steps And Transitions dialog, step/action/transition properties and the
// expression editor with its Insert Internal/External Parameter, Named State, SELSTR,
// LOGEVENT and Insert Alias browse buttons. Drawn on BatchLive's Control Studio ribbon/panes.

type Menu = { x: number; y: number; label: string; items: { label: string; onClick?: () => void; danger?: boolean; disabled?: string; separator?: boolean }[] }
/** `r` selects an alternate-branch transition (index into sfc.routes); without it a transition is a step's ordinary one. */
type Sel = { k: 'step' | 'transition'; i: number; r?: number } | null
type ExprKind = 'action' | 'condition' | 'block'
/** A Non-Boolean action's expression ('block') names a composite block instead of assigning a value. */
const checkText = (text: string, kind: ExprKind, env: CheckEnv): string[] => (kind === 'block' ? nonBooleanErrors(text, env) : checkExpression(text, kind, env))

/** What the expression editor can browse and how it validates: a phase class or an equipment module class. */
export interface ExprCtx {
  check: CheckEnv
  internal: { key: string; text: string; note?: string; insert: string }[]
  internalNote: string
  /** Composite blocks (BLEND_TIMER ...) a Non-Boolean action can start; each inserts as a bare block reference. */
  blocks?: { key: string; text: string; note?: string; insert: string }[]
  aliases: { name: string; note?: string; params: string[] }[] | null
  aliasNote: string
}

export function phaseExprCtx(pc: PhaseClass, unitClasses: Record<string, UnitClass>, composite?: CompositeName | null): ExprCtx {
  const owners = Object.values(unitClasses).filter(u => u.phaseClasses.includes(pc.name))
  const pool = owners.length ? owners : Object.values(unitClasses)
  const aliases = [...new Map(pool.flatMap(u => Object.values(u.aliases).map(a => {
    const block = Object.values(u.modules ?? {}).find(b => b.name === a.name)
    return [a.name, { name: a.name, note: a.description || u.name, params: block?.kind === 'em' ? EM_PARAMETER_NAMES : ALIAS_FIELDS }] as const
  }))).values()]
  // DeltaV paths: '/' is the composite being edited, '^/' goes up to the phase (and back down to another composite).
  const rel = (c: CompositeName, path: string, field = '.CV'): string => (c === composite ? `'/${path}${field}'` : `'^/${c}/${path}${field}'`)
  const where = (c: CompositeName, path: string): string => (c === composite ? path : `${c}/${path}`)
  const logicRows = COMPOSITES.flatMap(c => {
    const sfc = pc.logic[c]
    return [
      { key: `${c}/CONFIRM_FAIL`, text: where(c, 'CONFIRM_FAIL'), note: 'Composite parameter', insert: rel(c, 'CONFIRM_FAIL') },
      ...sfc.steps.flatMap(s => ['TIME', 'PENDING_CONFIRMS', 'FAILED_CONFIRMS', 'CONFIRM_FAIL'].map(p => ({
        key: `${c}/${s.name}/${p}`, text: where(c, `${s.name}/${p}`), note: `Step parameter (${c})`, insert: rel(c, `${s.name}/${p}`) }))),
      ...Object.entries(sfc.blocks ?? {}).flatMap(([b, blk]) => Object.keys(phaseBlockDefaults(blk)).map(p => ({
        key: `${c}/${b}/${p}`, text: where(c, `${b}/${p}`), note: `Block parameter (${c})`, insert: rel(c, `${b}/${p}`) })))
    ]
  })
  return {
    check: phaseCheckEnv(pc.name, pc, composite),
    internal: [...Object.values(pc.params).map(p => ({ key: p.name, text: p.name, note: `${p.kind === 'batch' ? `Batch ${p.direction.toLowerCase()}` : p.kind} · ${p.type}${p.units ? ` · ${p.units}` : ''}`, insert: `'^/${p.name}.CV'` })),
      ...SYSTEM_PHASE_PARAMS.map(([n]) => ({ key: n, text: n, note: 'Phase system parameter', insert: `'^/${n}.CV'` })),
      ...logicRows],
    internalNote: `Parameters of phase class ${pc.name}. '/' is ${composite ?? 'the composite you are editing'}; '^/' goes up one level to the phase, for example '^/STEP_INDEX.CV'.`,
    blocks: COMPOSITES.flatMap(c => Object.keys(pc.logic[c].blocks ?? {}).map(n => ({ key: `${c}/${n}`, text: where(c, n), note: `Composite block in ${c}`, insert: c === composite ? `'/${n}'` : `'^/${c}/${n}'` }))),
    aliases,
    aliasNote: owners.length ? `Aliases of unit class ${owners.map(o => o.name).join(', ')} (owners of ${pc.name}). Each unit module resolves the alias to its own module.` :
      `${pc.name} is not assigned to a unit class yet; showing every unit class alias.`
  }
}

const DRAG_SFC = 'application/x-bl-sfc-item'
const MAX_ITEMS = 127
const STEP_W = 130
const STEP_H = 34
const PITCH = 116
const ACTION_LINE = 11
// Action lines that fit beside a step before the chart needs to grow taller.
const ACTION_LINES_FIT = 8
/** Transition conditions are wrapped onto stacked lines of at most `n` characters so the whole expression is readable. */
function wrapText(text: string, n: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word
    while (w.length > n) { if (cur) { lines.push(cur); cur = '' } lines.push(w.slice(0, n)); w = w.slice(n) }
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= n) cur += ' ' + w
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}
const COND_WRAP = 64
const COND_LINES_FIT = 4
const stepPitch = (s: { actions: unknown[] }, tr?: { condition: string }): number =>
  PITCH + Math.max(Math.max(0, s.actions.length - ACTION_LINES_FIT), tr ? Math.max(0, wrapText(tr.condition, COND_WRAP).length - COND_LINES_FIT) : 0) * ACTION_LINE
function stepTops(sfc: PhaseSfc): number[] {
  let y = 30
  return sfc.steps.map((s, i) => { const top = y; y += stepPitch(s, sfc.transitions[i]); return top })
}
// The step column sits in the middle of the canvas: transition conditions run to its left, action text to its right.
const CX = 450
const SFC_W = 980
const ACTION_X = CX + 150

const STATE_COMPOSITE: Partial<Record<PhaseState, CompositeName>> = {
  RUNNING: 'RUN_LOGIC', HOLDING: 'HOLD_LOGIC', RESTARTING: 'RESTART_LOGIC', STOPPING: 'STOP_LOGIC', ABORTING: 'ABORT_LOGIC'
}

function useOnline(phaseClass: string): { key: string; unit: string; phase: string; state: PhaseState; composite?: CompositeName; step: string; message: string }[] {
  const active = useBatch(s => s.active)
  const deployed = useBatch(s => s.deployedUnits)
  return Object.entries(active).flatMap(([key, a]) => {
    const dep = deployed[a.unit]
    if (dep?.unit.phases[a.phase]?.phaseClass !== phaseClass || !dep.logic[a.phase]) return []
    return [{ key, unit: a.unit, phase: a.phase, state: a.rt.state, composite: compositeOf(a.rt.state), step: activeStepName(a.rt, dep.logic[a.phase]), message: a.rt.message }]
  })
}

export function PhaseStudio(): JSX.Element {
  const name = useUi(s => s.studioPhase) ?? ''
  const composite = useUi(s => s.studioComposite) as CompositeName | null
  const openPhaseStudio = useUi(s => s.openPhaseStudio)
  const saved = useBatch(s => s.phaseClasses[name])
  const draft = useBatch(s => s.phaseDrafts[name])
  const pc = draft ?? saved
  const dirty = !!draft
  const online = useOnline(name)
  const unitClasses = useBatch(s => s.unitClasses)
  const [onlineKey, setOnlineKey] = useState<string | null>(null)
  const [tab, setTab] = useState('Home')
  const [sel, setSel] = useState<Sel>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [panes, setPanes] = useState({ hierarchy: true, palette: true, parameters: true })
  const [zoom, setZoom] = useState(1)
  const [seqAfter, setSeqAfter] = useState<number | null>(null)
  const [stepDlg, setStepDlg] = useState<number | null>(null)
  const [trDlg, setTrDlg] = useState<number | null>(null)
  const [actionDlg, setActionDlg] = useState<{ step: number; index: number | null } | null>(null)
  const [edgeDlg, setEdgeDlg] = useState<EdgeRef | null>(null)
  const [seqEdge, setSeqEdge] = useState<EdgeRef | null>(null)
  const [selBlock, setSelBlock] = useState<string | null>(null)
  const [blockDlg, setBlockDlg] = useState<string | null>(null)
  const [extDlg, setExtDlg] = useState<string | null>(null)
  const [compDlg, setCompDlg] = useState(false)
  const [hierWidth, setHierWidth] = usePersistentSize('phaseStudio.hierWidth', 320)
  const [paletteWidth, setPaletteWidth] = usePersistentSize('phaseStudio.paletteWidth', 190)
  const [bottomHeight, setBottomHeight] = usePersistentSize('phaseStudio.bottomHeight', 170)

  useEffect(() => { setSel(null); setSelBlock(null) }, [composite])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useUi.getState().display !== 'studio') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!pc) {
    return <div className="display studio class-studio"><div className="exp-empty">Phase class {name} does not exist.
      <button className="tbtn sm" onClick={() => { useUi.getState().closePhaseStudio(); useUi.getState().navigate('explorer') }}>Close</button></div></div>
  }

  const live = online.find(o => o.key === onlineKey) ?? null
  const ctx = phaseExprCtx(pc, unitClasses, composite)
  const sfc: PhaseSfc | null = composite ? pc.logic[composite] : null
  const edit = (fn: (d: PhaseClass) => string | null | void): boolean => {
    const r = useBatch.getState().editPhaseDraft(name, fn)
    if (!r.ok) window.alert(r.error)
    return r.ok
  }
  const editSfc = (fn: (s: PhaseSfc) => PhaseSfc | string): boolean => composite ? edit(d => {
    const r = fn(d.logic[composite])
    if (typeof r === 'string') return r
    d.logic[composite] = r
  }) : false
  function save(): void {
    if (!useBatch.getState().phaseDrafts[name]) return
    const r = useBatch.getState().savePhaseClass(name)
    if (!r.ok) window.alert(r.error)
  }
  const close = (): void => {
    const leave = (): void => { useUi.getState().closePhaseStudio(); useUi.getState().navigate('explorer') }
    if (!useBatch.getState().phaseDrafts[name]) { leave(); return }
    void confirmCloseStudio().then(ok => { if (ok) leave() })
  }
  const itemCount = sfc ? sfc.steps.length + sfc.transitions.length : 0
  const sequenceComposite = !!sfc && composite !== 'FAIL_MONITOR'
  const branched = sequenceComposite && isBranched(sfc!)
  const chartEdges = sequenceComposite ? layoutPhaseSfc(sfc!).edges : []
  const afterIndex = (): number => sel ? sel.i : (sfc ? sfc.steps.length - 1 : 0)
  const edgeOfSel = (): EdgeRef | null => {
    if (!sfc || !sel) return null
    if (sel.k === 'transition') return { i: sel.i, route: sel.r ?? null }
    const e = chartEdges.find(x => x.from === sel.i)
    return e ? { i: sel.i, route: e.route } : null
  }
  const addSequence = (after: number, edge?: EdgeRef | null): void => {
    if (!sfc) { window.alert('Drill down into a composite state (for example RUN_LOGIC) to add steps and transitions.'); return }
    const target = branched ? edge ?? edgeOfSel() : null
    if (branched && !target) { window.alert('Select the step or transition to add after.'); return }
    setSeqEdge(target)
    setSeqAfter(after)
  }
  const addPair = (after: number, edge?: EdgeRef | null): void => {
    if (!sfc) { window.alert('Drill down into a composite state to add steps and transitions.'); return }
    if (itemCount + 2 > MAX_ITEMS) { window.alert(`Do not configure more than ${MAX_ITEMS} steps and transitions in any level.`); return }
    if (branched) {
      const target = edge ?? edgeOfSel()
      if (!target) { window.alert('Select the step or transition to add after.'); return }
      if (editSfc(s => insertOnEdge(s, target, 1))) setSel({ k: 'step', i: sfc.steps.length })
      return
    }
    if (editSfc(s => insertSequence(s, after, 1))) setSel({ k: 'step', i: Math.min(after + 1, sfc.steps.length) })
  }
  const branch = (i: number, side: 'left' | 'right' = 'right'): void => {
    if (!sfc) return
    // The parent stays selected so Branch Left/Right can be repeated on the same step.
    if (editSfc(s => addBranch(s, i, side))) setSel({ k: 'step', i })
  }
  // Joins every open branch end to the selected step (slide 6-28).
  const converge = (i: number): void => {
    if (!sfc) return
    editSfc(s => convergeBranches(s, i))
  }
  const removeStep = (i: number): void => {
    if (!sfc) return
    const step = sfc.steps[i]
    void askConfirm(`Delete step ${step.name} and transition ${sfc.transitions[i]?.name ?? ''}?`).then(ok => { if (ok && editSfc(s => deleteStep(s, i))) setSel(null) })
  }
  const openTransition = (i: number, r?: number): void => {
    if (branched || r !== undefined) setEdgeDlg({ i, route: r ?? null })
    else setTrDlg(i)
  }
  const stepMenu = (i: number, e: React.MouseEvent): void => {
    e.preventDefault()
    setSel({ k: 'step', i })
    const first = chartEdges.find(x => x.from === i)
    setMenu({ x: e.clientX, y: e.clientY, label: sfc!.steps[i].name, items: [
      { label: 'Properties...', onClick: () => setStepDlg(i) },
      { label: 'Add Action...', onClick: () => setActionDlg({ step: i, index: null }) },
      { separator: true, label: '' },
      { label: 'Add Sequence After...', onClick: () => addSequence(i, first ? { i, route: first.route } : null) },
      { label: 'Add Alternate Branch Left', onClick: () => branch(i, 'left') },
      { label: 'Add Alternate Branch Right', onClick: () => branch(i, 'right') },
      { label: 'Converge Open Branches Here', onClick: () => converge(i) },
      { label: 'Delete', danger: true, onClick: () => removeStep(i), disabled: sfc!.steps.length <= 1 ? 'A sequence needs at least its initial step' : undefined }
    ] })
  }
  const edgeMenu = (ref: EdgeRef, e: React.MouseEvent): void => {
    e.preventDefault()
    setSel({ k: 'transition', i: ref.i, ...(ref.route === null ? {} : { r: ref.route }) })
    const edge = edgeAt(sfc!, ref)
    setMenu({ x: e.clientX, y: e.clientY, label: edge?.name ?? sfc!.transitions[ref.i]?.name ?? '', items: [
      { label: 'Properties...', onClick: () => openTransition(ref.i, ref.route ?? undefined) },
      { label: 'Connect To...', onClick: () => setEdgeDlg(ref) },
      { separator: true, label: '' },
      { label: 'Add Sequence After...', onClick: () => addSequence(ref.i, ref) },
      { label: 'Add Alternate Branch Left', onClick: () => branch(ref.i, 'left') },
      { label: 'Add Alternate Branch Right', onClick: () => branch(ref.i, 'right') },
      { label: 'Delete Branch', danger: true, disabled: ref.route === null ? 'Only alternate branches can be deleted' : undefined,
        onClick: () => { if (editSfc(s => deleteBranch(s, ref))) setSel(null) } }
    ] })
  }
  const trMenu = (i: number, e: React.MouseEvent): void => edgeMenu({ i, route: null }, e)
  const dropPalette = (e: React.DragEvent): void => {
    const item = e.dataTransfer.getData(DRAG_SFC)
    if (!item || !sfc) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - rect.top + (e.currentTarget as HTMLElement).scrollTop) / zoom
    const after = branched ? afterIndex() : Math.max(0, stepTops(sfc).filter(top => top <= y).length - 1)
    if (item === 'Branch' && sel) {
      const x = (e.clientX - rect.left + (e.currentTarget as HTMLElement).scrollLeft) / zoom
      branch(sel.i, x < (branched ? branchStepX(sfc, sel.i) : CX) ? 'left' : 'right')
      return
    }
    paletteAction(item, after)
  }
  const paletteAction = (item: string, after: number): void => {
    if (item === 'Sequence') addSequence(after)
    else if (item === 'Step' || item === 'Transition') addPair(after)
    else if (item === 'Branch') { if (sel) branch(sel.i); else window.alert('Select the step or transition to branch from.') }
    else if (item === 'Termination') {
      const target = edgeOfSel()
      if (branched && target) editSfc(s => connectEdge(s, target, null))
      else window.alert(branched ? 'Select the transition that should end in a termination.' : 'Every composite sequence terminates after its last transition; the termination is already drawn.')
    }
  }
  const editBlocks = (fn: (b: Record<string, PhaseBlock>) => Record<string, PhaseBlock> | string): boolean =>
    editSfc(s => { const r = fn(s.blocks ?? {}); return typeof r === 'string' ? r : { ...s, blocks: r } })
  const addFunctionBlock = (type: DiagramBlockType, x?: number, y?: number): void => {
    const made = newDiagramBlock(type, sfc?.blocks ?? {}, x, y)
    if (editBlocks(b => ({ ...b, [made.name]: made.block }))) setSelBlock(made.name)
  }
  const blockMenu = (target: { block: string } | { wire: { block: string; slot: number; label: string } }, e: React.MouseEvent): void => {
    if ('wire' in target) {
      setMenu({ x: e.clientX, y: e.clientY, label: target.wire.label, items: [
        { label: 'Delete connection', danger: true, onClick: () => editBlocks(b => disconnectInput(b, target.wire.block, target.wire.slot)) }] })
      return
    }
    const extensible = sfc?.blocks?.[target.block] && ['BFI', 'CALC'].includes(sfc.blocks[target.block].type)
    setMenu({ x: e.clientX, y: e.clientY, label: target.block, items: [
      { label: 'Properties...', onClick: () => setBlockDlg(target.block) },
      ...(extensible ? [{ label: 'Extensible Parameters...', onClick: () => setExtDlg(target.block) }] : []),
      { label: 'Delete', danger: true, onClick: () => { void askConfirm(`Delete function block ${target.block}?`).then(ok => { if (ok && editBlocks(b => deleteBlock(b, target.block))) setSelBlock(null) }) } }
    ] })
  }
  const title = composite ? `Library/Phase Classes/${pc.category}/${name}/${composite}` : `Library/Phase Classes/${pc.category}/${name}`
  const notModeled = 'This command is not implemented in the simulator'
  const drill = (c: CompositeName | null): void => openPhaseStudio(name, c ?? undefined)
  const selStep = sel?.k === 'step' && sfc ? sfc.steps[sel.i] : undefined
  const selEdge = sel?.k === 'transition' && sfc && composite !== 'FAIL_MONITOR' ? edgeAt(sfc, { i: sel.i, route: sel.r ?? null }) : undefined

  return <div className="display studio class-studio phase-studio" data-phase-studio={name} data-composite={composite ?? ''}>
    <div className="ribbon">
      <div className="studio-caption"><BatchIcon kind="phaseClass" />
        <span>[{title}] — Control Studio{dirty ? ' *' : ''}</span>
        <span className="studio-caption-status">{live ? `On-line: ${live.unit}/${live.phase} ${STATE_LABEL[live.state]}` : `Phase class revision ${pc.revision}${dirty ? ' · unsaved changes' : ' · saved'}`}</span>
      </div>
      <div className="ribbon-tabs">
        <div className="rb-quick" role="toolbar" aria-label="Quick access">
          <Btn glyph="save" label="Save" size="tiny" onClick={dirty ? save : undefined} unavailable={dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="undo" label="Undo" size="tiny" unavailable="Undo is not implemented" />
          <Btn glyph="redo" label="Redo" size="tiny" unavailable="Redo is not implemented" />
        </div>
        {['File', 'Home', 'Diagram', 'View'].map(t => <button key={t} type="button" className={'ribbon-tab' + (t === 'File' ? ' file' : t === tab ? ' active' : '')}
          aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>)}
        <span className="ribbon-title">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="ribbon-body rb-body">
        {tab === 'File' && <Group label="File">
          <Btn glyph="save" label="Save" onClick={dirty ? save : undefined} unavailable={dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="reset" label="Discard Changes" onClick={dirty ? () => { void askConfirm('Discard unsaved changes?').then(ok => { if (ok) { useBatch.getState().discardPhaseDraft(name) } })} : undefined}
            unavailable={dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="backOut" label="Close" onClick={close} />
        </Group>}
        {tab === 'Home' && <>
          <Group label="Clipboard">
            <Btn glyph="paste" label="Paste" unavailable="Step clipboard operations are not implemented" />
            <Stack>
              <Btn glyph="cut" label="Cut" size="small" unavailable="Step clipboard operations are not implemented" />
              <Btn glyph="copy" label="Copy" size="small" unavailable="Step clipboard operations are not implemented" />
            </Stack>
          </Group>
          <Group label="Insert">
            <Btn glyph="new" label="Sequence" onClick={sequenceComposite ? () => addSequence(afterIndex()) : undefined} unavailable={sequenceComposite ? undefined : 'Select a sequence composite first'} />
            <Stack>
              <Btn glyph="stateItem" label="Step" size="small" onClick={sequenceComposite ? () => addPair(afterIndex()) : undefined} unavailable={sequenceComposite ? undefined : 'Select a sequence composite first'} />
              <Btn glyph="logic" label="Action" size="small" onClick={selStep ? () => setActionDlg({ step: sel!.i, index: null }) : undefined} unavailable={selStep ? undefined : 'Select a step first'} />
              <Btn glyph="logic" label="Branch" size="small" onClick={sequenceComposite && sel ? () => branch(sel.i) : undefined}
                unavailable={sequenceComposite ? (sel ? undefined : 'Select the step or transition to branch from') : 'Select a sequence composite first'} />
            </Stack>
            <Stack>
              <Btn glyph="logic" label="Branch Left" size="small" onClick={sequenceComposite && sel ? () => branch(sel.i, 'left') : undefined}
                unavailable={sequenceComposite ? (sel ? undefined : 'Select the step or transition to branch from') : 'Select a sequence composite first'} />
              <Btn glyph="logic" label="Branch Right" size="small" onClick={sequenceComposite && sel ? () => branch(sel.i, 'right') : undefined}
                unavailable={sequenceComposite ? (sel ? undefined : 'Select the step or transition to branch from') : 'Select a sequence composite first'} />
              <Btn glyph="logic" label="Converge" size="small" onClick={sequenceComposite && sel?.k === 'step' ? () => converge(sel.i) : undefined}
                unavailable={sequenceComposite ? (sel?.k === 'step' ? undefined : 'Select the step the open branches should join') : 'Select a sequence composite first'} />
            </Stack>
          </Group>
          <Group label="Algorithm">
            <Btn glyph="editObject" label="Edit Object" onClick={selStep ? () => setStepDlg(sel!.i) : selEdge ? () => openTransition(sel!.i, sel!.r) : selBlock && composite === 'FAIL_MONITOR' ? () => setBlockDlg(selBlock) : undefined}
              unavailable={sel || selBlock ? undefined : 'Select a step, transition or function block'} />
            <Btn glyph="drillDown" label="Drill Down" onClick={!composite ? () => drill('RUN_LOGIC') : undefined} unavailable={composite ? 'Steps have no nested level' : undefined} />
            <Btn glyph="backOut" label="Back Out" onClick={composite ? () => drill(null) : undefined} unavailable={composite ? undefined : 'Already at the phase class level'} />
          </Group>
          <Group label="Diagram Mode">
            <Btn glyph="onlineDebug" label="On-Line" active={!!live} onClick={online.length ? () => setOnlineKey(live ? null : online[0].key) : undefined}
              unavailable={online.length ? undefined : 'Load this phase on a downloaded unit module (unit faceplate ▸ Load a Phase) to watch it on-line'} />
            <Btn glyph="edit" label="Edit" active={!live} onClick={() => setOnlineKey(null)} />
          </Group>
          <Group label="Phase">
            <Stack>
              <Btn glyph="parameters" label="New Batch Parameter" size="small" onClick={() => useBatchUi.getState().openDialog({ t: 'param', phaseClass: name, kind: 'batch' })} />
              <Btn glyph="namedSet" label="Named Set" size="small" unavailable="Named sets are configured in DeltaV Explorer Setup" />
              <Btn glyph="download" label="Download" size="small" unavailable="Download the unit phase from DeltaV Explorer (unit module ▸ phase ▸ Download)" />
            </Stack>
          </Group>
          <Group label="Version Control">
            <Btn glyph="checkOut" label="Check Out" unavailable="Configuration Audit Trail (Version Control) is an optional licensed feature; phase saves are recorded in the Event Journal" />
          </Group>
        </>}
        {tab === 'Diagram' && <Group label="Layout">
          <Btn glyph="reset" label="Arrange" unavailable="Steps and transitions are laid out automatically" />
        </Group>}
        {tab === 'View' && <Group label="Windows">
          <Btn glyph="hierarchy" label="Hierarchy" active={panes.hierarchy} onClick={() => setPanes(p => ({ ...p, hierarchy: !p.hierarchy }))} />
          <Btn glyph="parameters" label="Parameters" active={panes.parameters} onClick={() => setPanes(p => ({ ...p, parameters: !p.parameters }))} />
          <Btn glyph="palette" label="Palette" active={panes.palette} onClick={() => setPanes(p => ({ ...p, palette: !p.palette }))} />
        </Group>}
        {(tab === 'Diagram' || tab === 'View') && <Group label="Zoom">
          <Btn glyph="zoomIn" label="Zoom In" onClick={() => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))} unavailable={zoom >= 1.5 ? 'Maximum zoom is 150%' : undefined} />
          <Btn glyph="zoomOut" label="Zoom Out" onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} unavailable={zoom <= 0.5 ? 'Minimum zoom is 50%' : undefined} />
          <Btn glyph="reset" label="100%" onClick={() => setZoom(1)} />
        </Group>}
      </div>
    </div>

    <div className="studio-main">
      {panes.hierarchy && <div className="studio-pane studio-hier ps-hier" style={{ width: hierWidth, minWidth: hierWidth, flex: `0 0 ${hierWidth}px` }}>
        {/* Split hierarchy (p4-17): tree on the left, contents of the selected item on the right. */}
        <div className="ps-hier-split">
          <div className="studio-tree ps-tree ps-tree-left" role="tree" aria-label="Phase class hierarchy">
            <div className={'studio-tree-root' + (!composite ? ' cs-sel' : '')} role="treeitem" aria-selected={!composite} onClick={() => drill(null)}>
              <BatchIcon kind="phaseClass" /> {name}
            </div>
            {COMPOSITES.map(c => <button key={c} type="button" role="treeitem" aria-selected={c === composite} data-composite-node={c}
              className={'studio-tree-node studio-block-select' + (c === composite ? ' active' : '') + (live?.composite === c ? ' ps-live' : '')}
              title={c} onClick={() => drill(c)}><BatchIcon kind="composite" />{c}</button>)}
          </div>
          <div className="studio-tree ps-tree ps-tree-right" role="list" aria-label={`Contents of ${composite ?? name}`}
            onContextMenu={composite && sfc && !live ? e => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, label: composite, items: composite === 'FAIL_MONITOR'
                ? DIAGRAM_BLOCK_TYPES.map(t => ({ label: `Add ${t} Function Block`, onClick: () => addFunctionBlock(t) }))
                : [{ label: 'Add Composite Block...', onClick: () => setCompDlg(true) }] })
            } : undefined}>
            {!composite ? COMPOSITES.map(c => <button key={c} type="button" role="listitem" data-content-node={c}
              className={'studio-tree-node ps-tree-item' + (live?.composite === c ? ' ps-live' : '')}
              title={`${c} — double-click to drill down`} onDoubleClick={() => drill(c)}><BatchIcon kind="composite" />{c}</button>) :
              sequenceComposite && sfc?.steps.map((s, i) => <div key={s.id}>
                <button type="button" role="listitem" className={'studio-tree-node ps-tree-item' + (sel?.k === 'step' && sel.i === i ? ' active' : '')}
                  onClick={() => { setSel({ k: 'step', i }); setSelBlock(null) }} onDoubleClick={() => setStepDlg(i)}><span className="ps-ico-step" />{s.name}</button>
                {chartEdges.filter(e => e.from === i).map(e => <button key={`${e.route}`} type="button" role="listitem"
                  className={'studio-tree-node ps-tree-item' + (sel?.k === 'transition' && sel.i === i && (sel.r ?? null) === e.route ? ' active' : '')}
                  onClick={() => { setSel({ k: 'transition', i, ...(e.route === null ? {} : { r: e.route }) }); setSelBlock(null) }}
                  onDoubleClick={() => openTransition(i, e.route ?? undefined)}><span className="ps-ico-tr" />{e.name}</button>)}
              </div>)}
            {composite && Object.entries(sfc?.blocks ?? {}).map(([block, def]) => <button key={block} type="button" role="listitem" data-content-block={block}
              className={'studio-tree-node ps-tree-item' + (selBlock === block ? ' active' : '')}
              onClick={() => { setSelBlock(block); setSel(null) }} onDoubleClick={composite === 'FAIL_MONITOR' && !live ? () => setBlockDlg(block) : undefined}>
              <BatchIcon kind="composite" />{block} ({def.type === 'TIMER_SEC' ? `linked: ${def.type}` : def.type})</button>)}
          </div>
        </div>
        {panes.parameters && <ParamPane pc={pc} composite={composite} name={name} live={live?.key ?? null} block={composite && selBlock ? sfc?.blocks?.[selBlock] ? { name: selBlock, def: sfc.blocks[selBlock] } : null : null} />}
        <div className="studio-pane-label">Hierarchy View</div>
      </div>}
      {panes.hierarchy && <PaneResizer axis="x" sign={1} value={hierWidth} min={160} max={520} onChange={setHierWidth} label="Resize hierarchy panel" />}

      <div className="studio-center">
        <div className="studio-canvas cs-diagram-wrap ps-canvas" aria-label={composite ? `${composite} ${composite === 'FAIL_MONITOR' ? 'function block diagram' : 'sequential function chart'}` : `${name} phase state diagram`}
          onDragOver={e => { if (sfc && e.dataTransfer.types.includes(DRAG_SFC)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
          onDrop={dropPalette} onMouseDown={() => setSel(null)}>
          {!composite ? <StateDiagram zoom={zoom} live={live?.state ?? null} onOpen={c => drill(c)} /> :
            composite === 'FAIL_MONITOR' ? <PhaseFbd key={name} blocks={(live ? useBatch.getState().deployedUnits[live.unit]?.logic[live.phase]?.FAIL_MONITOR.blocks : sfc?.blocks) ?? {}}
              zoom={zoom} selected={selBlock} scope="FAIL_MONITOR" readOnly={!!live} params={live ? useBatch.getState().active[live.key]?.rt.params : undefined}
              onSelect={setSelBlock} onOpen={b => { if (!live) setBlockDlg(b) }} onMenu={blockMenu}
              onMove={(b, x, y) => editBlocks(all => ({ ...all, [b]: { ...all[b], x, y } }))}
              onConnect={(from, to) => { const r = connectBlocks(sfc?.blocks ?? {}, from, to); if (typeof r === 'string') return r; editBlocks(() => r); return null }}
              onDisconnect={(b, slot) => editBlocks(all => disconnectInput(all, b, slot))}
              onAdd={addFunctionBlock} /> :
            branched ? <SfcBranchDiagram sfc={sfc!} zoom={zoom} sel={sel} liveStep={live && live.composite === composite ? live.step : null}
              onSelect={s => { setSel(s); setSelBlock(null) }} onStepOpen={setStepDlg} onEdgeOpen={ref => setEdgeDlg(ref)} onStepMenu={stepMenu} onEdgeMenu={edgeMenu} /> :
            <SfcDiagram sfc={sfc!} zoom={zoom} sel={sel} liveStep={live && live.composite === composite ? live.step : null}
              onSelect={s => { setSel(s); setSelBlock(null) }} onStepOpen={setStepDlg} onTrOpen={i => openTransition(i)} onStepMenu={stepMenu} onTrMenu={trMenu} />}
        </div>
        {sequenceComposite && <PaneResizer axis="y" sign={-1} value={bottomHeight} min={90} max={420} onChange={setBottomHeight} label="Resize action panel" />}
        {sequenceComposite && <div className="studio-bottom ps-bottom" style={{ height: bottomHeight, flex: `0 0 ${bottomHeight}px` }}>
          {selEdge ? <div className="studio-pane ps-expr-pane">
            <table className="studio-param-table" aria-label="Transition">
              <thead><tr><th>Transition</th><th>Expression</th><th>Description</th><th>Leads to</th></tr></thead>
              <tbody><tr onDoubleClick={() => openTransition(sel!.i, sel!.r)}><td>{selEdge.name}</td><td className="ps-code">{selEdge.condition}</td>
                <td>{selEdge.route === null ? sfc!.transitions[selEdge.from]?.description : ''}</td>
                <td>{selEdge.to === null ? 'Termination' : sfc!.steps[selEdge.to].name}</td></tr></tbody>
            </table>
            <div className="dvd-buttons"><button className="tbtn sm" onClick={() => openTransition(sel!.i, sel!.r)}>Properties...</button></div>
          </div> : <div className="studio-pane ps-expr-pane">
            <table className="studio-param-table" aria-label="Actions">
              <thead><tr><th>Action</th><th>Text</th><th>Description</th><th>Type</th><th>Qualifier</th><th>Time</th></tr></thead>
              <tbody>
                {selStep ? selStep.actions.map((a, ai) => <tr key={a.name} data-action={a.name} onDoubleClick={() => setActionDlg({ step: sel!.i, index: ai })}
                  onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: a.name, items: [
                    { label: 'Properties...', onClick: () => setActionDlg({ step: sel!.i, index: ai }) },
                    { label: 'Delete', danger: true, onClick: () => editSfc(s => ({ ...s, steps: s.steps.map((st, si) => si === sel!.i ? { ...st, actions: st.actions.filter((_, x) => x !== ai) } : st) })) }] }) }}>
                  <td>{a.name}</td><td className="ps-code">{a.expression}</td><td>{a.description}</td><td>{a.type}</td><td>{a.qualifier}</td><td>{a.qualifier === 'D' || a.qualifier === 'L' ? `${a.time} s` : ''}</td>
                </tr>) : <tr><td colSpan={6}>Select a step to see its actions, or a transition to see its expression.</td></tr>}
                {selStep && !selStep.actions.length && <tr><td colSpan={6}>No actions. Right-click the step ▸ Add Action..., or use Insert ▸ Action.</td></tr>}
              </tbody>
            </table>
            {selStep && <div className="dvd-buttons"><button className="tbtn sm" onClick={() => setActionDlg({ step: sel!.i, index: null })}>New Action...</button>
              <button className="tbtn sm" onClick={() => setStepDlg(sel!.i)}>Step Properties...</button></div>}
          </div>}
        </div>}
      </div>

      {panes.palette && <PaneResizer axis="x" sign={-1} value={paletteWidth} min={150} max={360} onChange={setPaletteWidth} label="Resize palette panel" />}
      {panes.palette && composite === 'FAIL_MONITOR' && <div className="studio-pane studio-palette ps-palette" aria-label="Palette" style={{ width: paletteWidth, minWidth: paletteWidth, flex: `0 0 ${paletteWidth}px` }}>
        <select className="ps-pal-filter" aria-label="Palette filter" value="Calculation/Logic" onChange={() => {}}><option>Calculation/Logic</option></select>
        <div className="ps-pal-grid">
          {DIAGRAM_BLOCK_TYPES.map(t =>
            <div key={t} className={'ps-pal-item' + (live ? ' disabled' : '')} data-palette={t} draggable={!live} role="button" tabIndex={0}
              title={live ? 'Go to Edit mode to add function blocks' : `Click, or drag onto the diagram, to add a ${t} function block`}
              onDragStart={e => { e.dataTransfer.setData(DRAG_FB, t); e.dataTransfer.setData('text/plain', t); e.dataTransfer.effectAllowed = 'copy' }}
              onClick={() => { if (!live) addFunctionBlock(t) }}>
              <PaletteGlyph item={t} /><span>{t}</span></div>)}
        </div>
        <div className="studio-pane-label">Palette</div>
      </div>}
      {panes.palette && composite !== 'FAIL_MONITOR' && <div className="studio-pane studio-palette ps-palette" aria-label="Palette" style={{ width: paletteWidth, minWidth: paletteWidth, flex: `0 0 ${paletteWidth}px` }}>
        <select className="ps-pal-filter" aria-label="Palette filter" value="All SFC Items" onChange={() => {}}><option>All SFC Items</option></select>
        <div className="ps-pal-grid">
          {(['Input Parameter', 'Internal Read Parameter', 'Internal Write Parameter', 'Output Parameter'] as const).map(x =>
            <div key={x} className="ps-pal-item disabled" title="Phase logic in Course 7016 Chapter 4 reads and writes through aliases and batch parameters; this palette item is not modeled">
              <PaletteGlyph item={x} /><span>{x}</span></div>)}
          {(['Sequence', 'Step', 'Termination', 'Transition', 'Branch'] as const).map(x =>
            <div key={x} className={'ps-pal-item' + (sfc ? '' : ' disabled')} data-palette={x} draggable={!!sfc} role="button" tabIndex={0}
              title={sfc ? (x === 'Sequence' ? 'Adds multiple connected steps and transitions (click, or drag onto the diagram)' : 'Click, or drag onto the diagram') : 'Drill down into a composite state first'}
              onDragStart={e => { e.dataTransfer.setData(DRAG_SFC, x); e.dataTransfer.setData('text/plain', x); e.dataTransfer.effectAllowed = 'copy' }}
              onClick={() => sfc && paletteAction(x, afterIndex())}>
              <PaletteGlyph item={x} /><span>{x}</span></div>)}
        </div>
        <div className="studio-pane-label">Palette</div>
      </div>}
    </div>

    <div className="studio-statusbar">
      <span>For Help, press F1</span>
      <span>{live ? `${live.unit}/${live.phase}: ${STATE_LABEL[live.state]}${live.step ? ` · step ${live.step}` : ''}${live.message ? ` · ${live.message}` : ''}` :
        online.length ? `Loaded on: ${online.map(o => `${o.unit} (${STATE_LABEL[o.state]})`).join(', ')}` : 'Assigned to: <unassigned>'}</span>
      {online.length > 1 && <select aria-label="On-line unit phase" value={onlineKey ?? ''} onChange={e => setOnlineKey(e.target.value || null)}>
        <option value="">Edit mode</option>{online.map(o => <option key={o.key} value={o.key}>{o.unit}/{o.phase}</option>)}</select>}
      {composite === 'FAIL_MONITOR' && <span>Failure monitoring executes while the phase is active (not Idle)</span>}
      <span>{sequenceComposite ? `${sfc!.steps.length} steps, ${sfc!.transitions.length} transitions` : composite === 'FAIL_MONITOR' ? `${Object.keys(sfc?.blocks ?? {}).length} function blocks` : ''}</span>
      <span className="studio-status-zoom">{Math.round(zoom * 100)}%</span>
    </div>

    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    {seqAfter !== null && sfc && composite && <SequenceDialog itemCount={itemCount} onClose={() => { setSeqAfter(null); setSeqEdge(null) }}
      onOk={count => {
        if (seqEdge) {
          if (editSfc(s => insertOnEdge(s, seqEdge, count))) { setSeqAfter(null); setSeqEdge(null); setSel({ k: 'step', i: sfc.steps.length }) }
        } else if (editSfc(s => insertSequence(s, seqAfter, count))) { setSeqAfter(null); setSel({ k: 'step', i: Math.min(seqAfter + 1, sfc.steps.length) }) }
      }} />}
    {edgeDlg && sfc && composite && sequenceComposite && sfc.steps[edgeDlg.i] && edgeAt(sfc, edgeDlg) && <EdgeDialog key={`${edgeDlg.i}:${edgeDlg.route}`} sfc={sfc} edge={edgeDlg} composite={composite} ctx={ctx}
      onClose={() => setEdgeDlg(null)} onOk={(patch, target) => {
        const ok = editSfc(s => {
          const named = editEdge(s, edgeDlg, patch)
          if (typeof named === 'string') return named
          const current = edgeAt(s, edgeDlg)
          return current && (current.to === null ? null : s.steps[current.to].name) === target ? named : connectEdge(named, edgeDlg, target)
        })
        if (ok) setEdgeDlg(null)
      }} />}
    {blockDlg && sfc && composite === 'FAIL_MONITOR' && sfc.blocks?.[blockDlg] && <BlockDialog key={blockDlg} name={blockDlg} sfc={sfc} ctx={ctx}
      onClose={() => setBlockDlg(null)} onOk={(next, rename) => {
        const ok = editBlocks(all => {
          const renamed = rename !== blockDlg ? renameBlock(all, blockDlg, rename) : all
          return { ...renamed, [rename]: next }
        })
        if (ok) { setBlockDlg(null); setSelBlock(rename) }
      }} />}
    {extDlg && sfc && composite === 'FAIL_MONITOR' && sfc.blocks?.[extDlg] && <ExtensibleDialog key={extDlg} name={extDlg} block={sfc.blocks[extDlg]}
      onClose={() => setExtDlg(null)} onOk={counts => { if (editBlocks(all => setBlockCounts(all, extDlg, counts))) setExtDlg(null) }} />}
    {compDlg && sfc && composite && sequenceComposite && <CompositeBlockDialog existing={[...Object.keys(sfc.blocks ?? {}), ...sfc.steps.map(s => s.name)]}
      onClose={() => setCompDlg(false)} onOk={(blockName, linkTo) => {
        if (editBlocks(all => ({ ...all, [blockName]: { type: linkTo, expression: '', inputs: [], disabled: false } }))) { setCompDlg(false); setSelBlock(blockName) }
      }} />}
    {stepDlg !== null && sfc && composite && sfc.steps[stepDlg] && <StepDialog key={sfc.steps[stepDlg].id} sfc={sfc} index={stepDlg} composite={composite} ctx={ctx}
      onClose={() => setStepDlg(null)} onOk={next => { if (editSfc(s => ({ ...s, steps: s.steps.map((st, i) => i === stepDlg ? next : st),
        routes: s.routes?.map(r => ({ ...r, from: r.from === s.steps[stepDlg].name ? next.name : r.from, to: r.to === s.steps[stepDlg].name ? next.name : r.to })) }))) setStepDlg(null) }} />}
    {trDlg !== null && sfc && composite && sfc.transitions[trDlg] && <TransitionDialog key={sfc.transitions[trDlg].id} sfc={sfc} index={trDlg} composite={composite} ctx={ctx}
      onClose={() => setTrDlg(null)} onOk={next => { if (editSfc(s => ({ ...s, transitions: s.transitions.map((t, i) => i === trDlg ? next : t) }))) setTrDlg(null) }} />}
    {actionDlg && sfc && composite && sfc.steps[actionDlg.step] && <ActionDialog step={sfc.steps[actionDlg.step].name} composite={composite} ctx={ctx}
      action={actionDlg.index === null ? null : sfc.steps[actionDlg.step].actions[actionDlg.index]} existing={sfc.steps[actionDlg.step].actions.map(a => a.name)}
      onClose={() => setActionDlg(null)} onOk={a => {
        const { step, index } = actionDlg
        if (editSfc(s => ({ ...s, steps: s.steps.map((st, i) => i !== step ? st : { ...st, actions: index === null ? [...st.actions, a] : st.actions.map((x, j) => j === index ? a : x) }) }))) setActionDlg(null)
      }} />}
  </div>
}

// ---------------------------------------------------------------------------
// Parameter view (p4-17/4-18: Filtered by, Alphabetic / Categorized)

function ParamPane({ pc, composite, name, live, block }: {
  pc: PhaseClass; composite: CompositeName | null; name: string; live: string | null; block: { name: string; def: PhaseBlock } | null
}): JSX.Element {
  const [view, setView] = useState<'Alphabetic' | 'Categorized'>('Alphabetic')
  const active = useBatch(s => (live ? s.active[live] : undefined))
  const params = active?.rt.params
  const user = Object.values(pc.params)
  const writeBlock = (key: string, current: string): void => {
    if (!active) return
    void askValue(key, current).then(value => {
      if (value === null) return
      const r = useBatch.getState().setOnlineParam(active.unit, active.phase, key, Number(value))
      if (!r.ok) window.alert(r.error)
    })
  }
  const blockRows = composite && block ? Object.entries(phaseBlockDefaults(block.def)).map(([p, v]) => {
    const key = `${composite}/${block.name}/${p}`
    const value = String(params?.[key] ?? v)
    return { name: p, value, group: 'Block', open: active ? () => writeBlock(key, value) : undefined }
  }) : null
  const rows: { name: string; value: string; group: string; open?: () => void }[] = blockRows ?? (composite === 'FAIL_MONITOR' ? [] : composite
    ? COMPOSITE_PARAMS.map(([n, v]) => ({ name: n, value: v, group: 'Composite' }))
    : [...SYSTEM_PHASE_PARAMS.map(([n, v]) => ({ name: n, value: active ? String(systemParam(active, n) ?? v) : v, group: 'System' })),
      ...user.map(p => ({ name: p.name, value: params && p.name in params ? String(params[p.name]) : String(p.defaultValue ?? ''), group: p.group,
        open: () => useBatchUi.getState().openDialog({ t: 'param', phaseClass: name, kind: p.kind, original: p.name }) }))])
  const sorted = blockRows ? rows : view === 'Alphabetic' ? [...rows].sort((a, b) => a.name.localeCompare(b.name)) : [...rows].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
  return <div className="ps-params">
    <div className="cs-params-filter">{block ? `${composite}/${block.name}` : <>Filtered by: <span className="ps-filter-boxes">☑☑☑ ☑☑☑☑☑</span></>}</div>
    <div className="cs-tabs" role="tablist">{(['Alphabetic', 'Categorized'] as const).map(t => <button key={t} role="tab" aria-selected={t === view}
      className={t === view ? 'on' : ''} onClick={() => setView(t)}>{t}</button>)}</div>
    <div className="ps-param-scroll">
      <table className="studio-param-table" aria-label={block ? `${block.name} parameters` : 'Phase parameters'}>
        <thead><tr><th>Parameter</th><th>{live ? 'Value' : 'Default'}</th>{view === 'Categorized' && <th>Category</th>}</tr></thead>
        <tbody>{sorted.map(r => <tr key={r.name} data-param={r.name} onDoubleClick={r.open} title={r.open && block ? 'Double-click to change the on-line value' : undefined}
          className={r.group !== 'System' && r.group !== 'Composite' && r.group !== 'Block' ? 'ps-user-param' : undefined}>
          <td>{r.name}</td><td>{r.value}</td>{view === 'Categorized' && <td>{r.group}</td>}</tr>)}
          {composite === 'FAIL_MONITOR' && !block && <tr><td colSpan={view === 'Categorized' ? 3 : 2}>Select a function block to see its parameters.</td></tr>}</tbody>
      </table>
    </div>
  </div>
}

// ---------------------------------------------------------------------------
// Phase state diagram (S88.01, p4-17 / p4-53). Coordinates are slide 4-53 scaled onto a grid:
// columns Idle/Aborted, Running/Holding/Aborting/Complete, Stopping/Held/Stopped, Restarting.

type Box = { id: string; label: string; x: number; y: number; w?: number; composite?: CompositeName; state?: PhaseState }
const COL = [27, 225, 390, 554]
const ROW = [100, 232, 365, 474]
const BOXES: Box[] = [
  { id: 'fm', label: 'Failure_Monitor', x: 12, y: 12, w: 121, composite: 'FAIL_MONITOR' },
  { id: 'aborted', label: 'Aborted', x: COL[0], y: ROW[0], state: 'ABORTED' },
  { id: 'aborting', label: 'Aborting', x: COL[1], y: ROW[0], composite: 'ABORT_LOGIC', state: 'ABORTING' },
  { id: 'holding', label: 'Holding', x: COL[1], y: ROW[1], composite: 'HOLD_LOGIC', state: 'HOLDING' },
  { id: 'held', label: 'Held', x: COL[2], y: ROW[1], state: 'HELD' },
  { id: 'restarting', label: 'Restarting', x: COL[3], y: ROW[1], composite: 'RESTART_LOGIC', state: 'RESTARTING' },
  { id: 'idle', label: 'Idle', x: COL[0], y: ROW[2], state: 'IDLE' },
  { id: 'running', label: 'Running', x: COL[1], y: ROW[2], composite: 'RUN_LOGIC', state: 'RUNNING' },
  { id: 'stopping', label: 'Stopping', x: COL[2], y: ROW[2], composite: 'STOP_LOGIC', state: 'STOPPING' },
  { id: 'complete', label: 'Complete', x: COL[1], y: ROW[3], state: 'COMPLETE' },
  { id: 'stopped', label: 'Stopped', x: COL[2], y: ROW[3], state: 'STOPPED' }
]
const BW = 92
const BH = 34
const DIAGRAM_W = 690
const DIAGRAM_H = 550
/** Orthogonal connectors as on p4-53; a label may span two lines ('Sequence\nDone') like the course. */
type Arrow = { pts: [number, number][]; label: string; lx: number; ly: number }
const ARROWS: Arrow[] = [
  { pts: [[248, 100], [248, 74], [73, 74], [73, 100]], label: 'Sequence\nDone', lx: 160, ly: 70 },
  { pts: [[73, 134], [73, 365]], label: 'Reset', lx: 73, ly: 246 },
  { pts: [[119, 382], [225, 382]], label: 'Start &\nnot fail', lx: 172, ly: 378 },
  { pts: [[271, 399], [271, 474]], label: 'Sequence\nDone', lx: 271, ly: 437 },
  { pts: [[225, 491], [97, 491], [97, 399]], label: 'Reset', lx: 160, ly: 487 },
  { pts: [[436, 508], [436, 536], [50, 536], [50, 399]], label: 'Reset', lx: 241, ly: 532 },
  { pts: [[271, 365], [271, 266]], label: 'Fail/\nHold', lx: 271, ly: 306 },
  { pts: [[248, 365], [248, 338], [172, 338], [172, 117], [225, 117]], label: 'Abort', lx: 172, ly: 222 },
  { pts: [[577, 266], [577, 338], [294, 338], [294, 365]], label: 'Sequence\nDone', lx: 577, ly: 296 },
  { pts: [[623, 232], [623, 117], [317, 117]], label: 'Abort', lx: 623, ly: 165 },
  { pts: [[577, 232], [577, 162], [271, 162], [271, 232]], label: 'Fail/\nHold', lx: 577, ly: 190 },
  { pts: [[623, 266], [623, 382], [482, 382]], label: 'Stop', lx: 623, ly: 320 },
  { pts: [[317, 249], [390, 249]], label: 'Sequence\nDone', lx: 353, ly: 245 },
  { pts: [[482, 249], [554, 249]], label: 'Restart &\nnot fail', lx: 518, ly: 245 },
  { pts: [[248, 232], [248, 134]], label: 'Abort', lx: 248, ly: 186 },
  { pts: [[412, 232], [412, 206], [294, 206], [294, 134]], label: 'Abort', lx: 353, ly: 202 },
  { pts: [[294, 266], [294, 294], [412, 294], [412, 365]], label: 'Stop', lx: 353, ly: 290 },
  { pts: [[436, 266], [436, 365]], label: 'Stop', lx: 436, ly: 316 },
  { pts: [[317, 382], [390, 382]], label: 'Stop', lx: 353, ly: 378 },
  { pts: [[436, 399], [436, 474]], label: 'Sequence\nDone', lx: 436, ly: 437 },
  { pts: [[459, 399], [459, 426], [667, 426], [667, 74], [294, 74], [294, 100]], label: 'Abort', lx: 565, ly: 422 }
]

function StateDiagram({ zoom, live, onOpen }: { zoom: number; live: PhaseState | null; onOpen: (c: CompositeName) => void }): JSX.Element {
  return <svg className="cs-diagram ps-state-diagram" width={DIAGRAM_W * zoom} height={DIAGRAM_H * zoom} viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`} role="img" aria-label="Phase state diagram">
    <defs>
      <marker id="psArrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="ps-arrowhead" /></marker>
      <pattern id="psGrid" width={20} height={20} patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7e9eb" strokeWidth={0.7} /></pattern>
    </defs>
    <rect width={DIAGRAM_W} height={DIAGRAM_H} fill="url(#psGrid)" />
    {ARROWS.map((a, i) => <polyline key={i} points={a.pts.map(p => p.join(',')).join(' ')} className="ps-edge" markerEnd="url(#psArrow)" />)}
    {ARROWS.map((a, i) => <text key={i} x={a.lx} y={a.ly} className="ps-edge-label" textAnchor="middle">
      {a.label.split('\n').map((line, j) => <tspan key={j} x={a.lx} dy={j === 0 ? 0 : 14}>{line}</tspan>)}
    </text>)}
    {BOXES.map(b => {
      const on = !!live && b.state === live
      const w = b.w ?? BW
      return <g key={b.id} transform={`translate(${b.x},${b.y})`} data-state-box={b.label} className={b.composite ? 'ps-composite-box' : undefined}
        onDoubleClick={b.composite ? () => onOpen(b.composite!) : undefined} onMouseDown={e => e.stopPropagation()}>
        <title>{b.composite ? `${b.composite} — double-click to drill down` : `${b.label} (no composite logic)`}</title>
        <rect width={w} height={BH} className={'ps-state' + (on ? ' live' : '') + (b.composite ? ' composite' : '')} />
        <text x={b.composite ? 8 : w / 2} y={BH / 2 + 4} textAnchor={b.composite ? 'start' : 'middle'} className="ps-state-label">{b.label}</text>
        {b.composite && <g transform={`translate(${w - 21},${BH / 2 - 8})`}><BatchIcon kind="composite" /></g>}
      </g>
    })}
  </svg>
}

// ---------------------------------------------------------------------------
// Sequential function chart for one composite state (p4-18)

export function SfcDiagram({ sfc, zoom, sel, liveStep, onSelect, onStepOpen, onTrOpen, onStepMenu, onTrMenu }: {
  sfc: PhaseSfc; zoom: number; sel: Sel; liveStep: string | null
  onSelect: (s: Sel) => void; onStepOpen: (i: number) => void; onTrOpen: (i: number) => void
  onStepMenu: (i: number, e: React.MouseEvent) => void; onTrMenu: (i: number, e: React.MouseEvent) => void
}): JSX.Element {
  const tops = stepTops(sfc)
  const last = sfc.steps.length - 1
  const height = last < 0 ? 100 : tops[last] + stepPitch(sfc.steps[last], sfc.transitions[last]) + 70
  const W = SFC_W
  const clip = (s: string): string => (s.length > 64 ? s.slice(0, 61) + '...' : s)
  return <svg className="cs-diagram ps-sfc" width={W * zoom} height={height * zoom} viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Sequential function chart">
    <defs><pattern id="psGrid2" width={20} height={20} patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7e9eb" strokeWidth={0.7} /></pattern></defs>
    <rect width={W} height={height} fill="url(#psGrid2)" />
    {sfc.steps.map((s, i) => {
      const y = tops[i]
      const pitch = stepPitch(s, sfc.transitions[i])
      const tr = sfc.transitions[i]
      const ty = y + STEP_H + 38
      const stepSel = sel?.k === 'step' && sel.i === i
      const trSel = sel?.k === 'transition' && sel.i === i
      const live = liveStep === s.name
      return <g key={s.id}>
        <line x1={CX} y1={y - (i === 0 ? 10 : 30)} x2={CX} y2={y} className="ps-link" />
        <g data-step={s.name} onMouseDown={e => { e.stopPropagation(); onSelect({ k: 'step', i }) }} onDoubleClick={() => onStepOpen(i)} onContextMenu={e => onStepMenu(i, e)}>
          <rect x={CX - STEP_W / 2} y={y} width={STEP_W} height={STEP_H} className={'ps-step' + (stepSel ? ' sel' : '') + (live ? ' live' : '')} />
          {i === 0 && <rect x={CX - STEP_W / 2 + 4} y={y + 4} width={STEP_W - 8} height={STEP_H - 8} className="ps-step-inner" />}
          <text x={CX} y={y + 21} textAnchor="middle" className="ps-step-label">{s.name}</text>
          {s.actions.length > 0 && <text x={ACTION_X} y={y + 14} className="ps-step-actions">{s.actions.length} action{s.actions.length === 1 ? '' : 's'}</text>}
          {s.actions.map((a, ai) => <text key={a.name} x={ACTION_X} y={y + 26 + ai * ACTION_LINE} className="ps-step-action-text">{clip(`${a.name}: ${a.expression}`)}</text>)}
        </g>
        {tr && <>
          <line x1={CX} y1={y + STEP_H} x2={CX} y2={y + pitch - 30 + (i === sfc.steps.length - 1 ? 10 : 30)} className="ps-link" />
          <g data-transition={tr.name} onMouseDown={e => { e.stopPropagation(); onSelect({ k: 'transition', i }) }} onDoubleClick={() => onTrOpen(i)} onContextMenu={e => onTrMenu(i, e)}>
            <rect x={CX - 26} y={ty - 9} width={52} height={18} fill="transparent" />
            <line x1={CX - 16} y1={ty} x2={CX + 16} y2={ty} className={'ps-trans' + (trSel ? ' sel' : '')} />
            <text x={CX + 24} y={ty + 4} className="ps-trans-label">{tr.name}</text>
            {wrapText(tr.condition, COND_WRAP).map((line, k) => <text key={k} x={CX - 28} y={ty + 4 + k * ACTION_LINE} textAnchor="end" className="ps-trans-cond">{line}</text>)}
          </g>
        </>}
        {i === sfc.steps.length - 1 && <g className="ps-termination" aria-label="Termination">
          <line x1={CX - 12} y1={y + pitch - 20 + 10} x2={CX + 12} y2={y + pitch - 20 + 10} className="ps-term" />
          <line x1={CX - 7} y1={y + pitch - 16 + 10} x2={CX + 7} y2={y + pitch - 16 + 10} className="ps-term" />
        </g>}
      </g>
    })}
  </svg>
}

const BR_COL = 330
const BR_ROW = 124
const BR_TOP = 30
// Conditions wrap to the width between one leg's label and the next leg's step; three lines fit under a divergence.
const BR_COND_WRAP = 30
const BR_COND_FIT = 3
// Action text (name: expression) is stacked beside its step; the leg below moves down once more than four lines are shown.
const BR_ACTION_WRAP = 34
const BR_ACTION_FIT = 4
const trimTo = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 3) + '...' : s)

const branchX0 = (layout: ReturnType<typeof layoutPhaseSfc>): number => 120 + layout.edges.filter(e => e.back).length * 12
/** Horizontal centre of a step in SfcBranchDiagram coordinates. */
export const branchStepX = (sfc: PhaseSfc, i: number): number => { const l = layoutPhaseSfc(sfc); return branchX0(l) + (l.col[i] ?? 0) * BR_COL }

/** The chart of a composite that has alternate branches: legs fan out from a step, rejoin at a later step or terminate. */
export function SfcBranchDiagram({ sfc, zoom, sel, liveStep, onSelect, onStepOpen, onEdgeOpen, onStepMenu, onEdgeMenu }: {
  sfc: PhaseSfc; zoom: number; sel: Sel; liveStep: string | null
  onSelect: (s: Sel) => void; onStepOpen: (i: number) => void; onEdgeOpen: (ref: EdgeRef) => void
  onStepMenu: (i: number, e: React.MouseEvent) => void; onEdgeMenu: (ref: EdgeRef, e: React.MouseEvent) => void
}): JSX.Element {
  const layout = useMemo(() => layoutPhaseSfc(sfc), [sfc])
  const X0 = branchX0(layout)
  const cx = (c: number): number => X0 + c * BR_COL
  // Conditions are stacked beside their transition; a row grows when one needs more lines than fit.
  const condLines = layout.edges.map(e => wrapText(e.condition, BR_COND_WRAP))
  const actionLines = sfc.steps.map(s => s.actions.flatMap(a => wrapText(`${a.name}: ${a.expression}`, BR_ACTION_WRAP).map((text, k) => ({ text, cont: k > 0 }))))
  const stepExtra = (i: number): number => Math.max(0, actionLines[i].length - BR_ACTION_FIT) * ACTION_LINE
  const rowExtra = Array<number>(layout.rows).fill(0)
  sfc.steps.forEach((_, i) => {
    const cond = Math.max(0, ...layout.edges.flatMap((e, k) => (e.from === i ? [Math.max(0, condLines[k].length - BR_COND_FIT) * ACTION_LINE] : [])))
    const r = layout.row[i]
    rowExtra[r] = Math.max(rowExtra[r], stepExtra(i) + cond)
  })
  const rowTop = (r: number): number => BR_TOP + r * BR_ROW + rowExtra.slice(0, r).reduce((a, b) => a + b, 0)
  const top = (i: number): number => rowTop(layout.row[i])
  const W = cx(layout.cols - 1) + 330
  const H = rowTop(layout.rows) + 30
  let backSeen = 0
  return <svg className="cs-diagram ps-sfc" width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sequential function chart with alternate branches" data-branched="true">
    <defs><pattern id="psGrid3" width={20} height={20} patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7e9eb" strokeWidth={0.7} /></pattern></defs>
    <rect width={W} height={H} fill="url(#psGrid3)" />
    {layout.edges.map((e, k) => {
      const sx = cx(layout.col[e.from])
      const sy = top(e.from) + STEP_H + stepExtra(e.from)
      const forward = layout.edges.filter(x => x.from === e.from && !x.back)
      const diverges = forward.length > 1
      const railOut = sy + 16
      const legX = cx(layout.leg[k])
      const crossY = e.back ? sy + 26 : diverges ? railOut + 24 : sy + 26
      const crossX = e.back ? sx : legX
      let d: string
      let ends: { x: number; y: number } | null = null
      // Leaves the bottom of the step box and runs down to where the transition area starts.
      const from = `M ${sx} ${top(e.from) + STEP_H} V ${sy}`
      if (e.to === null) {
        const endY = (diverges ? railOut : sy) + 54
        d = diverges ? `${from} V ${railOut} H ${legX} V ${endY}` : `${from} V ${endY}`
        ends = { x: legX, y: endY }
      } else if (e.back) {
        const gx = 30 + (backSeen++) * 12
        d = `${from} V ${sy + 40} H ${gx} V ${top(e.to) - 16} H ${cx(layout.col[e.to])} V ${top(e.to)}`
      } else {
        const tx = cx(layout.col[e.to])
        const ty = top(e.to)
        const converge = layout.edges.filter(x => x.to === e.to && !x.back).length > 1
        d = (diverges ? `${from} V ${railOut} H ${legX}` : from) + (legX === tx && !converge ? ` V ${ty}` : ` V ${ty - 22} H ${tx} V ${ty}`)
      }
      const ref: EdgeRef = { i: e.from, route: e.route }
      const selected = sel?.k === 'transition' && sel.i === e.from && (sel.r ?? null) === e.route
      return <g key={`${e.from}:${e.route}:${k}`} data-edge={`${sfc.steps[e.from].name}>${e.to === null ? 'END' : sfc.steps[e.to].name}`}>
        <path d={d} fill="none" className="ps-link" />
        {ends && <g className="ps-termination" aria-label="Termination">
          <line x1={ends.x - 12} y1={ends.y} x2={ends.x + 12} y2={ends.y} className="ps-term" />
          <line x1={ends.x - 7} y1={ends.y + 4} x2={ends.x + 7} y2={ends.y + 4} className="ps-term" />
        </g>}
        <g data-transition={e.name} onMouseDown={ev => { ev.stopPropagation(); onSelect({ k: 'transition', i: e.from, ...(e.route === null ? {} : { r: e.route }) }) }}
          onDoubleClick={() => onEdgeOpen(ref)} onContextMenu={ev => onEdgeMenu(ref, ev)}>
          <rect x={crossX - 18} y={crossY - 10} width={190} height={32 + Math.max(0, condLines[k].length - 1) * ACTION_LINE} fill="transparent" />
          <line x1={crossX - 16} y1={crossY} x2={crossX + 16} y2={crossY} className={'ps-trans' + (selected ? ' sel' : '')} />
          <text x={crossX + 22} y={crossY + 4} className="ps-trans-label">{e.name}</text>
          {condLines[k].map((line, j) => <text key={j} x={crossX + 22} y={crossY + 15 + j * ACTION_LINE} className="ps-trans-cond">{line}</text>)}
        </g>
      </g>
    })}
    {sfc.steps.map((s, i) => {
      const x = cx(layout.col[i])
      const y = top(i)
      const stepSel = sel?.k === 'step' && sel.i === i
      return <g key={s.id} data-step={s.name} onMouseDown={ev => { ev.stopPropagation(); onSelect({ k: 'step', i }) }}
        onDoubleClick={() => onStepOpen(i)} onContextMenu={ev => onStepMenu(i, ev)}>
        <rect x={x - STEP_W / 2} y={y} width={STEP_W} height={STEP_H} className={'ps-step' + (stepSel ? ' sel' : '') + (liveStep === s.name ? ' live' : '')} />
        {i === 0 && <rect x={x - STEP_W / 2 + 4} y={y + 4} width={STEP_W - 8} height={STEP_H - 8} className="ps-step-inner" />}
        <text x={x} y={y + 21} textAnchor="middle" className="ps-step-label">{trimTo(s.name, 18)}</text>
        {actionLines[i].map((l, k) => <text key={k} x={x + STEP_W / 2 + 8 + (l.cont ? 8 : 0)} y={y + 12 + k * ACTION_LINE} className="ps-step-action-text">{l.text}</text>)}
      </g>
    })}
  </svg>
}

export function PaletteGlyph({ item }: { item: string }): JSX.Element {
  const purple = item.includes('Parameter')
  return <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden className="ps-pal-glyph">
    <rect x={1} y={1} width={28} height={28} rx={2} className={purple ? 'ps-pal-bg purple' : 'ps-pal-bg teal'} />
    {item === 'Input Parameter' && <path d="M15,5 V16 M10,11 L15,16 L20,11 M8,19 H22 V25 H8 Z" className="ps-pal-ink" />}
    {item === 'Output Parameter' && <path d="M15,25 V12 M10,17 L15,12 L20,17 M8,5 H22 V9 H8 Z" className="ps-pal-ink" />}
    {item === 'Internal Read Parameter' && <><circle cx={15} cy={15} r={9} className="ps-pal-ink" /><path d="M15,9 V20 M11,16 L15,20 L19,16" className="ps-pal-ink" /></>}
    {item === 'Internal Write Parameter' && <><circle cx={15} cy={15} r={9} className="ps-pal-ink" /><path d="M15,21 V10 M11,14 L15,10 L19,14" className="ps-pal-ink" /></>}
    {item === 'Sequence' && <path d="M9,4 H21 V9 H9 Z M15,9 V22 M10,14 H20 M9,22 H21 V26 H9 Z" className="ps-pal-ink" />}
    {item === 'Step' && <path d="M7,9 H23 V19 H7 Z M15,4 V9 M15,19 V26" className="ps-pal-ink" />}
    {item === 'Transition' && <path d="M15,4 V26 M9,15 H21 M21,10 L24,13" className="ps-pal-ink" />}
    {item === 'Termination' && <path d="M15,4 V16 M9,12 H21 M9,20 H21 M11,24 H19" className="ps-pal-ink" />}
    {item === 'Branch' && <path d="M15,3 V8 M6,8 H24 M6,8 V14 M24,8 V14 M3,14 H9 M21,14 H27 M6,14 V27 M24,14 V27" className="ps-pal-ink" />}
    {(item === 'CND' || item === 'BFI' || item === 'CALC') && <><path d="M6,5 H24 V25 H6 Z M6,10 H24 M2,17 H6 M24,17 H28" className="ps-pal-ink" />
      <text x={15} y={21} fontSize={6} textAnchor="middle" fill="#f2d33a" stroke="none">{item}</text></>}
  </svg>
}

// ---------------------------------------------------------------------------
// Dialogs

function DlgButtons({ onOk, onClose, extra }: { onOk: () => void; onClose: () => void; extra?: ReactNode }): JSX.Element {
  return <div className="dvd-buttons">{extra}<button className="tbtn sm" onClick={onOk}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
}

/** Add Sequence Of Steps And Transitions (p4-19). */
export function SequenceDialog({ itemCount, onOk, onClose }: { itemCount: number; onOk: (count: number) => void; onClose: () => void }): JSX.Element {
  const [count, setCount] = useState('1')
  const [spacing, setSpacing] = useState('120')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1) { setError('Enter the number of steps to create (1 or more)'); return }
    if (!Number.isInteger(Number(spacing)) || Number(spacing) < 40) { setError('Spacing between steps and transitions must be a whole number of at least 40'); return }
    if (itemCount + 2 * n > MAX_ITEMS) { setError(`Do not configure more than ${MAX_ITEMS} steps and transitions in any level (${itemCount} already used)`); return }
    onOk(n)
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Add Sequence Of Steps And Transitions" onClose={onClose}>
    <div className="dvd-split">
      <div className="lib-dlg-fields">
        <label>Number of steps to create:<input aria-label="Number of steps to create" type="number" min={1} autoFocus value={count}
          onChange={e => setCount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
        <label>Spacing between steps and transitions:<input aria-label="Spacing between steps and transitions" type="number" min={40} step={10} value={spacing}
          onChange={e => setSpacing(e.target.value)} /></label>
      </div>
      <div className="lib-dlg-buttons"><button className="tbtn sm" onClick={submit}>OK</button><button className="tbtn sm" onClick={onClose}>Cancel</button></div>
    </div>
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
  </SimulatorDialog>
}

/** Step Properties: General (name, description) and Actions. */
export function StepDialog({ sfc, index, composite, ctx, onOk, onClose }: {
  sfc: PhaseSfc; index: number; composite: string; ctx: ExprCtx
  onOk: (s: PhaseSfc['steps'][number]) => void; onClose: () => void
}): JSX.Element {
  const step = sfc.steps[index]
  const [tab, setTab] = useState<'General' | 'Actions'>('General')
  const [v, setV] = useState(step)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<{ index: number | null } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const deleteSelected = (): void => {
    if (selected === null || !v.actions[selected]) return
    const gone = v.actions[selected].name
    void askConfirm(`Delete action ${gone} from step ${v.name}?`).then(ok => {
      if (!ok) return
      setV(cur => ({ ...cur, actions: cur.actions.filter(a => a.name !== gone) }))
      setSelected(null)
    })
  }
  const submit = (): void => {
    const name = v.name.trim().toUpperCase()
    const e = renameError(sfc, step.name, name)
    if (e) { setError(e); return }
    onOk({ ...v, name })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${composite}/${step.name} Step Properties`} onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{(['General', 'Actions'] as const).map(t => <button key={t} role="tab" aria-selected={t === tab}
      className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === 'General' ? <div className="lib-dlg-fields dvd-panel">
      <label>Name:<input aria-label="Step name" autoFocus value={v.name} onChange={e => setV({ ...v, name: e.target.value.toUpperCase() })}
        onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
      <label>Description:<input aria-label="Step description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
      <p className="exp-hint">{index === 0 ? 'Initial step of the sequence.' : `Step ${index + 1} of ${sfc.steps.length}.`} {NAME_RULE}</p>
    </div> : <div className="dvd-panel">
      <table className="studio-param-table" aria-label="Step actions">
        <thead><tr><th>Action</th><th>Type</th><th>Qualifier</th><th>Expression</th></tr></thead>
        <tbody>{v.actions.map((a, i) => <tr key={a.name} className={i === selected ? 'sel' : undefined} aria-selected={i === selected} onClick={() => setSelected(i)}
          onDoubleClick={() => { setSelected(i); setAction({ index: i }) }}><td>{a.name}</td><td>{a.type}</td><td>{a.qualifier}</td><td className="ps-code">{a.expression}</td></tr>)}
          {!v.actions.length && <tr><td colSpan={4}>No actions.</td></tr>}</tbody>
      </table>
      <p className="exp-hint">Click an action to select it, then Edit or Delete. Double-click also edits.</p>
      <div className="dvd-buttons">
        <button className="tbtn sm" onClick={() => setAction({ index: null })}>Add...</button>
        <button className="tbtn sm" disabled={selected === null} onClick={() => selected !== null && setAction({ index: selected })}>Edit...</button>
        <button className="tbtn sm" disabled={selected === null} onClick={deleteSelected}>Delete</button>
      </div>
    </div>}
    <DlgButtons onOk={submit} onClose={onClose} />
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    {action && <ActionDialog step={v.name} composite={composite} ctx={ctx}
      action={action.index === null ? null : v.actions[action.index]} existing={v.actions.map(a => a.name)} onClose={() => setAction(null)}
      onOk={a => { setV({ ...v, actions: action.index === null ? [...v.actions, a] : v.actions.map((x, j) => (j === action.index ? a : x)) }); setAction(null) }} />}
  </SimulatorDialog>
}

/** Action properties (p4-20, p6-5, p6-7): General tab with the Delay and Action expression, Confirm tab for Pulse actions. */
export function ActionDialog({ step, composite, ctx, action, existing, onOk, onClose, initialTab = 'General' }: {
  step: string; composite: string; ctx: ExprCtx; action: ActionDef | null; existing: string[]
  onOk: (a: ActionDef) => void; onClose: () => void; initialTab?: 'General' | 'Confirm'
}): JSX.Element {
  const nextName = (): string => { for (let n = 1; ; n++) if (!existing.includes(`A${n}`)) return `A${n}` }
  const [v, setV] = useState<ActionDef>(action ?? { name: nextName(), description: '', type: 'Assignment', qualifier: 'N', time: 0, expression: '' })
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'General' | 'Confirm'>(initialTab)
  const [delayMode, setDelayMode] = useState<'none' | 'time' | 'expression'>(
    action?.delayExpression ? 'expression' : action && (action.qualifier === 'D' || action.qualifier === 'L' || (action.qualifier === 'P' && action.time > 0)) ? 'time' : 'none')
  const [editor, setEditor] = useState(false)
  const [condEditor, setCondEditor] = useState<'confirm' | 'delay' | 'timeout' | null>(null)
  const pulse = v.qualifier === 'P'
  const actionKind: ExprKind = v.type === 'Non-Boolean' ? 'block' : 'action'
  const timed = pulse || v.qualifier === 'D' || v.qualifier === 'L'
  const [confirmOn, setConfirmOn] = useState(action?.confirm !== undefined)
  const [timeoutMode, setTimeoutMode] = useState<'time' | 'expression'>(action?.confirmTimeoutExpression ? 'expression' : 'time')
  const namedSets = useStore(s => s.namedSets.configured)
  const [defaultNote, setDefaultNote] = useState<string | null>(null)
  const defaultConfirm = (): void => {
    const r = defaultConfirmExpression(v.expression, namedSets)
    if (!r.ok) { setDefaultNote(v.expression.trim() ? r.error : 'Enter the action expression on the General tab first; the default confirm expression is built from it.'); return }
    setDefaultNote(null)
    setError(null)
    setV({ ...v, confirm: r.expression, confirmTimeout: v.confirmTimeout ?? 0 })
  }
  const submit = (): void => {
    const name = v.name.trim().toUpperCase()
    if (!isNameValid(name)) { setError(NAME_RULE); return }
    if (name !== action?.name && existing.includes(name)) { setError(`${name} already exists in step ${step}`); return }
    if ((v.qualifier === 'D' || v.qualifier === 'L') && !(v.time >= 0)) { setError('Enter the delay/limit time in seconds'); return }
    if (pulse && delayMode === 'time' && (!Number.isFinite(v.time) || v.time < 0)) { setError('Enter a finite pulse delay >= 0'); return }
    const delayExpr = pulse && delayMode === 'expression' ? v.delayExpression?.trim() : ''
    if (pulse && delayMode === 'expression' && !delayExpr) { setError('Enter a delay expression on the General tab, or choose Time value'); setTab('General'); return }
    if (confirmOn && !pulse) { setError('Only Pulse actions offer confirmation'); return }
    if (confirmOn && !v.confirm?.trim()) { setError('Enter a confirm expression on the Confirm tab, or clear "Confirm action for pulse qualifier"'); setTab('Confirm'); return }
    if (confirmOn && timeoutMode === 'time' && (!Number.isFinite(v.confirmTimeout) || (v.confirmTimeout ?? 0) < 0)) { setError('Enter a confirmation timeout >= 0 (0 waits indefinitely)'); setTab('Confirm'); return }
    const timeoutExpr = confirmOn && timeoutMode === 'expression' ? v.confirmTimeoutExpression?.trim() : ''
    if (confirmOn && timeoutMode === 'expression' && !timeoutExpr) { setError('Enter a confirm timeout expression, or choose Time value'); setTab('Confirm'); return }
    for (const expression of [confirmOn ? v.confirm : undefined, delayExpr, timeoutExpr]) {
      const errors = expression?.trim() ? checkExpression(expression, 'condition', ctx.check) : []
      if (errors.length) { setError(errors.join('\n')); return }
    }
    const saved: ActionDef = { ...v, name, time: pulse && delayMode !== 'time' ? 0 : v.time, delayExpression: delayExpr || undefined,
      confirm: confirmOn ? v.confirm?.trim() : undefined,
      confirmTimeout: confirmOn && timeoutMode === 'time' ? v.confirmTimeout ?? 0 : undefined, confirmTimeoutExpression: timeoutExpr || undefined }
    const problems = v.expression.trim() ? checkText(v.expression, actionKind, ctx.check) : []
    if (!problems.length) { onOk(saved); return }
    void askConfirm(`The expression has errors:\n${problems.join('\n')}\n\nSave the action anyway?`).then(ok => { if (ok) onOk(saved) })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-action-dialog" label={`${composite}/${step}/${v.name || 'A1'} Action`} onClose={onClose}>
    <div className="dvd-tabs" role="tablist">{(['General', 'Confirm'] as const).map(t => <button key={t} role="tab" aria-selected={t === tab}
      className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === 'General' ? <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-inline">
        <label style={{ flex: 1 }}>Name:<input aria-label="Action name" autoFocus value={v.name} onChange={e => setV({ ...v, name: e.target.value.toUpperCase() })} /></label>
        <label style={{ flex: 2 }}>Description:<input aria-label="Action description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
      </div>
      <div className="dvd-inline">
        <label>Action type:<select aria-label="Action type" value={v.type} onChange={e => setV({ ...v, type: e.target.value as ActionType })}>
          <option>Assignment</option><option>Boolean</option><option>Non-Boolean</option></select></label>
        <label>Qualifier:<select aria-label="Action qualifier" value={v.qualifier} onChange={e => {
          const q = e.target.value as ActionQualifier
          if (q !== 'P') { setConfirmOn(false); setTimeoutMode('time') }
          setDelayMode(q === 'D' || q === 'L' ? 'time' : 'none')
          setV({ ...v, qualifier: q, ...(q !== 'P' ? { confirm: undefined, confirmTimeout: undefined, confirmTimeoutExpression: undefined, delayExpression: undefined } : {}) })
        }}>
          {(Object.keys(QUALIFIER_LABEL) as ActionQualifier[]).map(q => <option key={q} value={q}>{QUALIFIER_LABEL[q]}</option>)}</select></label>
      </div>
      <fieldset className="dvd-group" disabled={!timed}>
        <legend>Delay</legend>
        <div className="dvd-radio-row">
          <label className="dvd-radio"><input type="radio" name="action-delay-mode" aria-label="Delay as time value" checked={delayMode === 'time'} readOnly
            onClick={() => setDelayMode(delayMode === 'time' && pulse ? 'none' : 'time')} /> Time value (s)</label>
          <input aria-label="Delay time" type="number" min={0} value={v.time} disabled={!timed || delayMode !== 'time'} onChange={e => setV({ ...v, time: Number(e.target.value) })} />
        </div>
        <div className="dvd-radio-row">
          <label className="dvd-radio"><input type="radio" name="action-delay-mode" aria-label="Delay as expression" checked={delayMode === 'expression'} disabled={!pulse} readOnly
            onClick={() => setDelayMode(delayMode === 'expression' ? 'none' : 'expression')} /> Expression</label>
          <input aria-label="Pulse delay condition" value={v.delayExpression ?? ''} disabled={!pulse || delayMode !== 'expression'} onChange={e => setV({ ...v, delayExpression: e.target.value })} />
          <button type="button" className="tbtn sm" disabled={!pulse || delayMode !== 'expression'} onClick={() => setCondEditor('delay')}>Expression Assistant...</button>
        </div>
        <p className="exp-hint">{timed ? 'No delay unless Time value or Expression is selected. Click the selected one again to clear it.' : 'The delay applies to Pulse, Time delayed and Time limited actions.'}</p>
      </fieldset>
      {v.type === 'Non-Boolean' && <p className="exp-hint">A composite block only executes while an active step starts it with a Non-Boolean action. Enter the block as the action expression: inside RUN_LOGIC a block of that state is '/BLEND_TIMER' ('/' is the state you are editing, '^/' goes up to the phase). Use Edit Expression..., then Insert Internal Parameter to pick it, with qualifier N (Non-Stored). An action named after the block with no expression also works.</p>}
      <label>Expression:<textarea aria-label="Action expression" className="ps-code ps-expr-text" rows={4} value={v.expression}
        onChange={e => setV({ ...v, expression: e.target.value })} /></label>
      <ParserOutput text={v.expression} kind={actionKind} ctx={ctx} />
    </div> : <div className="lib-dlg-fields dvd-panel">
      <label><input type="checkbox" aria-label="Confirm action for pulse qualifier" checked={confirmOn} disabled={!pulse}
        onChange={e => { setConfirmOn(e.target.checked); setV({ ...v, confirm: e.target.checked ? v.confirm ?? '' : v.confirm, confirmTimeout: v.confirmTimeout ?? 0 }) }} /> Confirm action for pulse qualifier</label>
      {!pulse && <p className="exp-hint">Only Pulse (P) actions offer confirmation. Set the qualifier to P - Pulse on the General tab.</p>}
      <div className="dvd-inline"><label style={{ flex: 1 }}>Confirm expression:<input aria-label="Confirm expression" value={v.confirm ?? ''} disabled={!confirmOn}
        onChange={e => setV({ ...v, confirm: e.target.value, confirmTimeout: v.confirmTimeout ?? 0 })} /></label>
        <button type="button" className="tbtn sm" disabled={!confirmOn} title={confirmOn ? undefined : 'Tick "Confirm action for pulse qualifier" first'} onClick={defaultConfirm}>Default Expression</button>
        <button type="button" className="tbtn sm" disabled={!confirmOn} onClick={() => setCondEditor('confirm')}>Expression Assistant...</button></div>
      {defaultNote && <p role="alert" className="lib-dlg-error">{defaultNote}</p>}
      <fieldset className="dvd-group" disabled={!confirmOn}>
        <legend>Confirm Timeout</legend>
        <div className="dvd-radio-row">
          <label className="dvd-radio"><input type="radio" name="action-confirm-timeout" aria-label="Timeout as time value" checked={timeoutMode === 'time'} onChange={() => setTimeoutMode('time')} /> Time value (s, 0 = no timeout)</label>
          <input aria-label="Confirm timeout" type="number" min={0} value={v.confirmTimeout ?? 0} disabled={!confirmOn || timeoutMode !== 'time'}
            onChange={e => setV({ ...v, confirmTimeout: Number(e.target.value) })} />
        </div>
        <div className="dvd-radio-row">
          <label className="dvd-radio"><input type="radio" name="action-confirm-timeout" aria-label="Timeout as expression" checked={timeoutMode === 'expression'} onChange={() => setTimeoutMode('expression')} /> Expression</label>
          <input aria-label="Confirm timeout expression" value={v.confirmTimeoutExpression ?? ''} disabled={!confirmOn || timeoutMode !== 'expression'}
            onChange={e => setV({ ...v, confirmTimeoutExpression: e.target.value })} />
          <button type="button" className="tbtn sm" disabled={!confirmOn || timeoutMode !== 'expression'} onClick={() => setCondEditor('timeout')}>Expression Assistant...</button>
        </div>
        <p className="exp-hint">With an expression the confirm fails as soon as the expression is TRUE before the confirm expression is, for example '/INITIALIZE_EQUIP/TIME.CV' &gt; 10.</p>
      </fieldset>
    </div>}
    <DlgButtons onOk={submit} onClose={onClose} extra={<button className="tbtn sm" onClick={() => setEditor(true)}>Edit Expression...</button>} />
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    {editor && <ExpressionDialog title={`${composite}/${step}/${v.name} Action Expression`} kind={actionKind} ctx={ctx}
      value={v.expression} onClose={() => setEditor(false)} onOk={expression => { setV({ ...v, expression }); setEditor(false) }} />}
    {condEditor && <ExpressionDialog title={`${composite}/${step}/${v.name} ${condEditor === 'confirm' ? 'Confirm' : condEditor === 'timeout' ? 'Confirm Timeout' : 'Pulse Delay'} Expression`} kind="condition" ctx={ctx}
      value={(condEditor === 'confirm' ? v.confirm : condEditor === 'timeout' ? v.confirmTimeoutExpression : v.delayExpression) ?? ''} onClose={() => setCondEditor(null)}
      onOk={text => {
        const value = text.trim().replace(/;$/, '')
        setV(condEditor === 'confirm' ? { ...v, confirm: value, confirmTimeout: v.confirmTimeout ?? 0 } : condEditor === 'timeout' ? { ...v, confirmTimeoutExpression: value } : { ...v, delayExpression: value })
        setCondEditor(null)
      }} />}
  </SimulatorDialog>
}

export function TransitionDialog({ sfc, index, composite, ctx, onOk, onClose }: {
  sfc: PhaseSfc; index: number; composite: string; ctx: ExprCtx
  onOk: (t: PhaseSfc['transitions'][number]) => void; onClose: () => void
}): JSX.Element {
  const tr = sfc.transitions[index]
  const [v, setV] = useState(tr)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState(false)
  const submit = (): void => {
    const name = v.name.trim().toUpperCase()
    const e = renameError(sfc, tr.name, name)
    if (e) { setError(e); return }
    const problems = v.condition.trim() ? checkExpression(v.condition, 'condition', ctx.check) : []
    if (!problems.length) { onOk({ ...v, name }); return }
    void askConfirm(`The expression has errors:\n${problems.join('\n')}\n\nSave the transition anyway?`).then(ok => { if (ok) onOk({ ...v, name }) })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${composite}/${tr.name} Transition Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-inline">
        <label style={{ flex: 1 }}>Name:<input aria-label="Transition name" autoFocus value={v.name} onChange={e => setV({ ...v, name: e.target.value.toUpperCase() })} /></label>
        <label style={{ flex: 2 }}>Description:<input aria-label="Transition description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>
      </div>
      <label>Expression:<textarea aria-label="Transition expression" className="ps-code ps-expr-text" rows={3} value={v.condition}
        onChange={e => setV({ ...v, condition: e.target.value })} /></label>
      <ParserOutput text={v.condition} kind="condition" ctx={ctx} />
    </div>
    <DlgButtons onOk={submit} onClose={onClose} extra={<button className="tbtn sm" onClick={() => setEditor(true)}>Edit Expression...</button>} />
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    {editor && <ExpressionDialog title={`${composite}/${v.name} Transition Expression`} kind="condition" ctx={ctx}
      value={v.condition} onClose={() => setEditor(false)} onOk={condition => { setV({ ...v, condition }); setEditor(false) }} />}
  </SimulatorDialog>
}

/** Properties of a transition inside a branched chart: name, expression and the step or termination it leads to. */
export function EdgeDialog({ sfc, edge, composite, ctx, onOk, onClose }: {
  sfc: PhaseSfc; edge: EdgeRef; composite: string; ctx: ExprCtx
  onOk: (patch: { name: string; condition: string; description?: string }, target: string | null) => void; onClose: () => void
}): JSX.Element {
  const current = edgeAt(sfc, edge)!
  const [v, setV] = useState({ name: current.name, condition: current.condition,
    description: edge.route === null ? sfc.transitions[edge.i]?.description ?? '' : '' })
  const [target, setTarget] = useState(current.to === null ? '' : sfc.steps[current.to].name)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState(false)
  const submit = (): void => {
    const name = v.name.trim().toUpperCase()
    const e = renameError(sfc, current.name, name)
    if (e) { setError(e); return }
    const patch = { name, condition: v.condition, ...(edge.route === null ? { description: v.description } : {}) }
    const problems = v.condition.trim() ? checkExpression(v.condition, 'condition', ctx.check) : []
    if (!problems.length) { onOk(patch, target || null); return }
    void askConfirm(`The expression has errors:\n${problems.join('\n')}\n\nSave the transition anyway?`).then(ok => { if (ok) onOk(patch, target || null) })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`${composite}/${current.name} Transition Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-inline">
        <label style={{ flex: 1 }}>Name:<input aria-label="Transition name" autoFocus value={v.name} onChange={e => setV({ ...v, name: e.target.value.toUpperCase() })} /></label>
        {edge.route === null && <label style={{ flex: 2 }}>Description:<input aria-label="Transition description" value={v.description} onChange={e => setV({ ...v, description: e.target.value })} /></label>}
      </div>
      <label>Expression:<textarea aria-label="Transition expression" className="ps-code ps-expr-text" rows={3} value={v.condition}
        onChange={e => setV({ ...v, condition: e.target.value })} /></label>
      <ParserOutput text={v.condition} kind="condition" ctx={ctx} />
      <label>Connect to:<select aria-label="Connect to" value={target} onChange={e => setTarget(e.target.value)}>
        <option value="">Termination</option>
        {sfc.steps.filter((_, i) => i !== edge.i).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></label>
      <p className="exp-hint">The first transition of a step whose expression is TRUE is taken; transitions are evaluated in the order they were added.</p>
    </div>
    <DlgButtons onOk={submit} onClose={onClose} extra={<button className="tbtn sm" onClick={() => setEditor(true)}>Edit Expression...</button>} />
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    {editor && <ExpressionDialog title={`${composite}/${v.name} Transition Expression`} kind="condition" ctx={ctx}
      value={v.condition} onClose={() => setEditor(false)} onOk={condition => { setV({ ...v, condition }); setEditor(false) }} />}
  </SimulatorDialog>
}

/** Properties of a CND, BFI or CALC function block in FAIL_MONITOR. */
export function BlockDialog({ name, sfc, ctx, onOk, onClose }: {
  name: string; sfc: PhaseSfc; ctx: ExprCtx; onOk: (b: PhaseBlock, name: string) => void; onClose: () => void
}): JSX.Element {
  const block = sfc.blocks![name]
  const [n, setN] = useState(name)
  const [v, setV] = useState(block)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState(false)
  const kind: ExprKind = v.type === 'CND' ? 'condition' : 'action'
  // A Calculation/Logic block reads its own pins bare (IN1, OUT1) and cannot write an input or use a pin it does not have.
  const bctx: ExprCtx = v.type === 'CALC'
    ? { ...ctx, check: { ...ctx.check, calc: true, checkRef: (ref, write) => {
      const m = /^\/?(?:IN_?(\d+)|OUT(\d+))\.CV$/i.exec(ref)
      if (!m) return ctx.check.checkRef(ref, write)
      if (m[1] && write) return `IN${m[1]} is an input of this block and cannot be assigned`
      if (m[1] && Number(m[1]) > inputCount(v)) return `This block has no IN${m[1]}. Add inputs with Extensible Parameters (right-click the block).`
      if (m[2] && Number(m[2]) > outputCount(v)) return `This block has no OUT${m[2]}. Add outputs with Extensible Parameters (right-click the block).`
      return null
    } } }
    : ctx
  const submit = (): void => {
    const next = n.trim().toUpperCase()
    if (!isNameValid(next)) { setError(NAME_RULE); return }
    if (next !== name && (sfc.blocks?.[next] || COMPOSITES.includes(next as CompositeName))) { setError(`${next} already exists`); return }
    if (v.type === 'CND' && !v.expression.trim()) { setError('Enter the condition expression (an empty expression is a configuration error)'); return }
    if (v.type === 'CND' && !(Number(v.timeDuration ?? 0) >= 0)) { setError('TIME_DURATION must be zero or more seconds'); return }
    const problems = v.type !== 'BFI' && v.expression.trim() ? checkExpression(v.expression, kind, bctx.check) : []
    if (!problems.length) { onOk(v, next); return }
    void askConfirm(`The expression has errors:\n${problems.join('\n')}\n\nSave the block anyway?`).then(ok => { if (ok) onOk(v, next) })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label={`FAIL_MONITOR/${name} ${v.type} Properties`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <div className="dvd-inline">
        <label style={{ flex: 1 }}>Name:<input aria-label="Block name" autoFocus value={n} onChange={e => setN(e.target.value.toUpperCase())} /></label>
        <label style={{ flex: 1 }}>Function block:<input aria-label="Function block type" readOnly value={v.type} /></label>
      </div>
      {v.type !== 'BFI' && <>
        <label>Expression:<textarea aria-label="Block expression" className="ps-code ps-expr-text" rows={v.type === 'CALC' ? 5 : 3} value={v.expression}
          onChange={e => setV({ ...v, expression: e.target.value })} /></label>
        <ParserOutput text={v.expression} kind={kind} ctx={bctx} empty="Empty expression: the block reports a configuration error and OUT_D stays False." />
      </>}
      {v.type === 'CND' && <>
        <label className="dvd-check"><input type="checkbox" aria-label="DISABLE default" checked={v.disabled}
          onChange={e => setV({ ...v, disabled: e.target.checked })} /> DISABLE = 1 by default (True bypasses the block: OUT_D stays False while the logic has it disabled)</label>
        <label>TIME_DURATION (s):<input aria-label="Time duration" type="number" min={0} step="any" value={v.timeDuration ?? 0}
          onChange={e => setV({ ...v, timeDuration: Number(e.target.value) })} /></label>
        <p className="exp-hint">OUT_D is set when the expression has been True for longer than TIME_DURATION. PRE_OUT_D follows the expression and ignores DISABLE.</p>
      </>}
      {v.type === 'BFI' && <p className="exp-hint">Right-click the block &gt; Extensible Parameters to set the number of inputs (IN_D1...IN_D16). Drag from a condition's OUT_D pin to an IN_Dn pin. OUT_INT is the binary weighted sum of the inputs (IN_D1 = 1, IN_D2 = 2, IN_D3 = 4 ...). FIRST_OUT traps OUT_INT when the inputs go from all False to one or more True (while ARM_TRAP is non-zero) and holds it until RESET_IN is set to 1.</p>}
      {v.type === 'CALC' && <p className="exp-hint">IN1, IN2 ... and OUT1, OUT2 ... are this block's own pins; write them bare, for example OUT1 := IN1;. Use Extensible Parameters (right-click the block) for more than two. Other parameters are read with their full path, for example '/BFI1/OUT_D.CV' or '/+/FAIL_INDEX.CV'.</p>}
    </div>
    <DlgButtons onOk={submit} onClose={onClose} extra={v.type !== 'BFI' ? <button className="tbtn sm" onClick={() => setEditor(true)}>Edit Expression...</button> : undefined} />
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
    {editor && <ExpressionDialog title={`FAIL_MONITOR/${n} Expression`} kind={kind} ctx={bctx}
      value={v.expression} onClose={() => setEditor(false)} onOk={expression => { setV({ ...v, expression }); setEditor(false) }} />}
  </SimulatorDialog>
}

/** Add Composite Block: a named block linked to an existing composite template (p6-15). */
/** Extensible Parameters: the number of BFI inputs, or of CALC inputs and outputs (the Function Block Reference allows 1 to 16). */
export function ExtensibleDialog({ name, block, onOk, onClose }: {
  name: string; block: PhaseBlock; onOk: (counts: { inCount: number; outCount?: number }) => void; onClose: () => void
}): JSX.Element {
  const [ins, setIns] = useState(inputCount(block))
  const [outs, setOuts] = useState(outputCount(block))
  const calc = block.type === 'CALC'
  const bad = (n: number): boolean => !Number.isInteger(n) || n < 1 || n > BLOCK_MAX_PINS
  const lost = block.inputs.filter((ref, i) => ref && i >= ins).length
  return <SimulatorDialog className="module-download-dialog dvd" label={`FAIL_MONITOR/${name} Extensible Parameters`} onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Number of inputs ({block.type === 'BFI' ? 'IN_D1 to IN_Dn' : 'IN1 to INn'}):
        <input aria-label="Number of inputs" type="number" min={1} max={BLOCK_MAX_PINS} autoFocus value={ins} onChange={e => setIns(Number(e.target.value))} /></label>
      {calc && <label>Number of outputs (OUT1 to OUTn):
        <input aria-label="Number of outputs" type="number" min={1} max={BLOCK_MAX_PINS} value={outs} onChange={e => setOuts(Number(e.target.value))} /></label>}
      <p className="exp-hint">The default is two. A block can have up to {BLOCK_MAX_PINS}.{lost ? ` ${lost} connection(s) to inputs beyond ${ins} will be removed.` : ''}</p>
    </div>
    <DlgButtons onOk={() => { if (!bad(ins) && (!calc || !bad(outs))) onOk({ inCount: ins, ...(calc ? { outCount: outs } : {}) }) }} onClose={onClose} />
  </SimulatorDialog>
}

/** Add Composite Block: a named block linked to an existing composite template (p6-15). */
export function CompositeBlockDialog({ existing, onOk, onClose }: {
  existing: string[]; onOk: (name: string, linkTo: 'TIMER_SEC') => void; onClose: () => void
}): JSX.Element {
  const [n, setN] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (): void => {
    const name = n.trim().toUpperCase()
    if (!isNameValid(name)) { setError(NAME_RULE); return }
    if (existing.some(x => x.toUpperCase() === name) || COMPOSITES.includes(name as CompositeName)) { setError(`${name} is already used in this composite`); return }
    onOk(name, 'TIMER_SEC')
  }
  return <SimulatorDialog className="module-download-dialog dvd" label="Add Composite Block" onClose={onClose}>
    <div className="lib-dlg-fields dvd-panel">
      <label>Name:<input aria-label="Composite block name" autoFocus value={n} onChange={e => setN(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') submit() }} /></label>
      <label>Link to existing composite:<select aria-label="Link to composite" defaultValue="TIMER_SEC"><option value="TIMER_SEC">TIMER_SEC</option></select></label>
      <p className="exp-hint">The block is a linked composite: it uses the TIMER_SEC template. Its START, RESET, TIME_DURATION and ELAPSED_TIME parameters are read and written with the block name, for example BLEND_TIMER/START.</p>
    </div>
    <DlgButtons onOk={submit} onClose={onClose} />
    {error && <p role="alert" className="lib-dlg-error">{error}</p>}
  </SimulatorDialog>
}

function ParserOutput({ text, kind, ctx, empty }: { text: string; kind: ExprKind; ctx: ExprCtx; empty?: string }): JSX.Element {
  const problems = text.trim() ? checkText(text, kind, ctx.check) : []
  return <div className="ps-parser" role="status" aria-label="Parser output">
    <span className="ps-parser-head">Parser output:</span>
    {!text.trim() ? <span>{empty ?? (kind === 'condition' ? 'An empty transition is TRUE.' : kind === 'block' ? 'Empty: the action name is the composite block.' : 'Empty expression.')}</span> :
      problems.length ? problems.map((p, i) => <div key={i} className="ps-parser-err">Error: {p}</div>) : <span className="ps-parser-ok">0 error(s), 0 warning(s)</span>}
  </div>
}

const OP_BUTTONS = ['+', '-', '*', '/', '(', ')', '<', '>', '<=', '>=', '=', '!=', ':=', 'NOT', 'AND', 'OR']

/** Expression editor (p4-20/4-21): operator buttons, browse buttons, Expression and Parser output. */
function ExpressionDialog({ title, kind, ctx, value, onOk, onClose }: {
  title: string; kind: ExprKind; ctx: ExprCtx; value: string; onOk: (v: string) => void; onClose: () => void
}): JSX.Element {
  const [text, setText] = useState(value)
  const [browse, setBrowse] = useState<'internal' | 'external' | 'named' | 'alias' | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const insert = (s: string): void => {
    const el = area.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const pad = (k: string): string => (/^[A-Z]+$/.test(k) ? ` ${k} ` : k)
    const ins = pad(s)
    const next = text.slice(0, start) + ins + text.slice(end)
    setText(next)
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = start + ins.length } })
  }
  const submit = (): void => {
    const final = kind === 'block' ? text.trim() : ensureTrailingSemicolon(text)
    const problems = final.trim() ? checkText(final, kind, ctx.check) : []
    if (!problems.length) { onOk(final); return }
    void askConfirm(`The expression has errors:\n${problems.join('\n')}\n\nKeep the expression anyway?`).then(ok => { if (ok) onOk(final) })
  }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide ps-expr-dialog" label={title} onClose={onClose}>
    <div className="ps-expr-body">
      <div className="ps-expr-buttons">
        <div className="ps-op-grid">{OP_BUTTONS.map(op => <button key={op} type="button" className="tbtn sm" onClick={() => insert(op)}>{op}</button>)}</div>
        <div className="ps-browse-buttons">
          <button type="button" className="tbtn sm" onClick={() => setBrowse('internal')}>Insert Internal Parameter...</button>
          <button type="button" className="tbtn sm" onClick={() => setBrowse('external')}>Insert External Parameter...</button>
          <button type="button" className="tbtn sm" onClick={() => setBrowse('named')}>Insert Named State...</button>
          <button type="button" className="tbtn sm" onClick={() => insert('SELSTR("default", "string1", condition1)')}>SELSTR...</button>
          <button type="button" className="tbtn sm" onClick={() => insert('LOGEVENT("text");')}>LOGEVENT...</button>
          <button type="button" className="tbtn sm" disabled={!ctx.aliases} title={ctx.aliases ? undefined : ctx.aliasNote} onClick={() => setBrowse('alias')}>Insert Alias...</button>
        </div>
      </div>
      <div className="ps-expr-main">
        <label>Expression:<textarea ref={area} aria-label="Expression" className="ps-code ps-expr-text tall" autoFocus value={text} onChange={e => setText(e.target.value)} /></label>
        <ParserOutput text={text} kind={kind} ctx={ctx} />
      </div>
    </div>
    <DlgButtons onOk={submit} onClose={onClose} />
    {browse === 'internal' && <InternalBrowser ctx={ctx} kind={kind} onClose={() => setBrowse(null)} onPick={s => { insert(s); setBrowse(null) }} />}
    {browse === 'external' && <ExternalBrowser onClose={() => setBrowse(null)} onPick={s => { insert(s); setBrowse(null) }} />}
    {browse === 'named' && <NamedStateBrowser onClose={() => setBrowse(null)} onPick={s => { insert(s); setBrowse(null) }} />}
    {browse === 'alias' && ctx.aliases && <AliasBrowser ctx={ctx} onClose={() => setBrowse(null)} onPick={s => { insert(s); setBrowse(null) }} />}
  </SimulatorDialog>
}

function ListPick({ label, items, value, onChange, onDouble }: { label: string; items: { key: string; text: string; note?: string }[]; value: string | null; onChange: (k: string) => void; onDouble?: (k: string) => void }): JSX.Element {
  return <div className="ps-pick-list" role="listbox" aria-label={label}>
    {items.map(i => <button key={i.key} type="button" role="option" aria-selected={i.key === value} className={'ctx-item' + (i.key === value ? ' on' : '')}
      onClick={() => onChange(i.key)} onDoubleClick={() => onDouble?.(i.key)}><b>{i.text}</b>{i.note && <span className="ps-pick-note">{i.note}</span>}</button>)}
    {!items.length && <span className="exp-hint">Nothing to browse.</span>}
  </div>
}

function InternalBrowser({ ctx, kind, onPick, onClose }: { ctx: ExprCtx; kind: ExprKind; onPick: (s: string) => void; onClose: () => void }): JSX.Element {
  // A Non-Boolean action starts a composite block, so it picks a block (inserted without .CV) rather than a parameter.
  const rows = kind === 'block' && ctx.blocks?.length ? ctx.blocks : ctx.internal
  const [v, setV] = useState<string | null>(rows[0]?.key ?? null)
  const pick = (k = v): void => { const row = rows.find(r => r.key === k); if (row) onPick(row.insert) }
  return <SimulatorDialog className="module-download-dialog dvd" label={kind === 'block' ? 'Insert Composite Block' : 'Insert Internal Parameter'} onClose={onClose}>
    <p className="exp-hint">{kind === 'block' ? 'Composite blocks of this phase class. A Non-Boolean action starts the block itself, so no parameter (.CV) is added.' : ctx.internalNote}</p>
    <ListPick label={kind === 'block' ? 'Composite blocks' : 'Internal parameters'} items={rows.map(r => ({ key: r.key, text: r.text, note: r.note }))} value={v} onChange={setV} onDouble={k => pick(k)} />
    <p className="exp-hint ps-code">{rows.find(r => r.key === v)?.insert ?? ''}</p>
    <DlgButtons onOk={() => pick()} onClose={onClose} />
  </SimulatorDialog>
}

function ExternalBrowser({ onPick, onClose }: { onPick: (s: string) => void; onClose: () => void }): JSX.Element {
  const modules = useStore(s => s.modules)
  const sims = useLibrary(s => s.sims)
  const tags = [...Object.keys(modules), ...Object.keys(sims)].sort()
  const [tag, setTag] = useState<string | null>(null)
  const [param, setParam] = useState<string | null>(null)
  const simParams = tag && sims[tag] ? Object.keys(sims[tag].params).map(p => `${p}.CV`) : undefined
  const params = tag ? moduleParamNames(modules[tag], simParams) : []
  const pick = (p = param): void => { if (tag && p) onPick(`'//${tag}/${p}'`) }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Insert External Parameter" onClose={onClose}>
    <div className="dvd-split ps-ext">
      <div><div className="exp-props-subhead">Module</div><ListPick label="Modules" items={tags.map(t => ({ key: t, text: t, note: modules[t]?.description ?? 'Simulation module' }))}
        value={tag} onChange={t => { setTag(t); setParam(null) }} /></div>
      <div><div className="exp-props-subhead">Parameter</div><ListPick label="Parameters" items={params.map(p => ({ key: p, text: p }))} value={param} onChange={setParam} onDouble={p => pick(p)} /></div>
    </div>
    <p className="exp-hint">{tag && param ? `'//${tag}/${param}'` : 'Select a module and a parameter. For unit phases use Insert Alias so each unit resolves its own modules.'}</p>
    <DlgButtons onOk={() => pick()} onClose={onClose} />
  </SimulatorDialog>
}

function NamedStateBrowser({ onPick, onClose }: { onPick: (s: string) => void; onClose: () => void }): JSX.Element {
  const sets = useStore(s => s.namedSets.configured)
  const names = Object.values(sets).map(s => s.name).sort()
  const [set, setSet] = useState<string | null>(names[0] ?? null)
  const [state, setState] = useState<string | null>(null)
  const def = Object.values(sets).find(s => s.name === set)
  const pick = (st = state): void => { if (set && st) onPick(`'${set}:${st}'`) }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Insert Named State" onClose={onClose}>
    <div className="dvd-split ps-ext">
      <div><div className="exp-props-subhead">Named Set</div><ListPick label="Named sets" items={names.map(n => ({ key: n, text: n, note: Object.values(sets).find(s => s.name === n)?.description }))}
        value={set} onChange={n => { setSet(n); setState(null) }} /></div>
      <div><div className="exp-props-subhead">State</div><ListPick label="Named states" items={(def?.entries ?? []).map(e => ({ key: e.name, text: e.name, note: String(e.value) }))}
        value={state} onChange={setState} onDouble={st => pick(st)} /></div>
    </div>
    <DlgButtons onOk={() => pick()} onClose={onClose} />
  </SimulatorDialog>
}

const ALIAS_FIELDS = ['(alias path only)', 'MODE.TARGET', 'MODE.ACTUAL', 'CAS_SP.CV', 'PV.CV', 'PV_D.CV', 'SP_D.CV', 'DC1/MODE.TARGET', 'DC1/PV_D.CV', 'DC1/SP_D.CV']

function AliasBrowser({ ctx, onPick, onClose }: { ctx: ExprCtx; onPick: (s: string) => void; onClose: () => void }): JSX.Element {
  const aliases = ctx.aliases ?? []
  const [alias, setAlias] = useState<string | null>(aliases[0]?.name ?? null)
  const [field, setField] = useState<string | null>(null)
  const fields = aliases.find(x => x.name === alias)?.params ?? ALIAS_FIELDS
  const pick = (f = field): void => { if (alias && f) onPick(f === ALIAS_FIELDS[0] ? `'//#${alias}#'` : `'//#${alias}#/${f}'`) }
  return <SimulatorDialog className="module-download-dialog dvd dvd-wide" label="Insert Alias" onClose={onClose}>
    <p className="exp-hint">{ctx.aliasNote}</p>
    <div className="dvd-split ps-ext">
      <div><div className="exp-props-subhead">Alias</div><ListPick label="Aliases" items={aliases.map(x => ({ key: x.name, text: x.name, note: x.note }))}
        value={alias} onChange={a => { setAlias(a); setField(null) }} /></div>
      <div><div className="exp-props-subhead">Parameter</div><ListPick label="Alias parameters" items={fields.map(f => ({ key: f, text: f }))}
        value={field} onChange={setField} onDouble={f => pick(f)} /></div>
    </div>
    <DlgButtons onOk={() => pick()} onClose={onClose} />
  </SimulatorDialog>
}

export { STATE_COMPOSITE }
