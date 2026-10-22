import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../engine/store'
import { useLibrary } from '../engine/libraryStore'
import { useSystem } from '../engine/systemPreferences'
import { useUi } from '../ui/uiStore'
import { useBatchUi } from '../ui/batchUi'
import { useBatch, aliasesResolved, activeKey, unitDownloadState } from '../engine/batchStore'
import {
  COMPOSITES, COMPOSITE_PARAMS, STATE_LABEL, SYSTEM_PHASE_PARAMS, UNIT_CLASS_PARAMS, UNIT_MODULE_PARAMS,
  type BatchClassKind, type CompositeName
} from '../engine/batchConfig'
import { TreeRow, ContextMenu, ContentsList, alertResult, type ContentsRow } from './LibraryExplorer'
import { ModuleIcon } from './EngineeringIcons'
import { EmDetail, ModuleInstanceRows } from './EmExplorer'
import { useEm } from '../engine/emStore'
import { fmt } from '../utils/format'
import { askConfirm } from './AppNotices'

export const DRAG_PCELL_CLASS = 'application/x-bl-pcell-class'
export const DRAG_UNIT_CLASS = 'application/x-bl-unit-class'
export const DRAG_PHASE_CLASS = 'application/x-bl-phase-class'
export const DRAG_MODULE = 'application/x-bl-module'
export const DRAG_PCELL = 'application/x-bl-pcell'
export const DRAG_UNIT = 'application/x-bl-unit'
export const DRAG_EM_CLASS = 'application/x-bl-em-class'
export const DRAG_CM_DEVICE = 'application/x-bl-cm-device'
const CLASS_DRAG: Record<BatchClassKind, string> = { pcell: DRAG_PCELL_CLASS, unit: DRAG_UNIT_CLASS, phase: DRAG_PHASE_CLASS }

export type BatchSel =
  | { t: 'root'; cls: BatchClassKind }
  | { t: 'cat'; cls: BatchClassKind; name: string }
  | { t: 'class'; cls: BatchClassKind; name: string }
  | { t: 'composite'; phase: string; composite: CompositeName }
  | { t: 'cell'; name: string }
  | { t: 'unit'; name: string }
  | { t: 'uphase'; unit: string; phase: string }
  | { t: 'aliases'; unit: string }
  | { t: 'external' }
  | { t: 'subsystem'; name: string }
  | { t: 'emRoot' }
  | { t: 'emCat'; name: string }
  | { t: 'emClass'; name: string }
  | { t: 'emInstance'; tag: string }
  | { t: 'cmDevice'; name: string }
  | { t: 'ucBlock'; unitClass: string; name: string }

export const ROOT_LABEL: Record<BatchClassKind, string> = { pcell: 'Process Cell Classes', unit: 'Unit Classes', phase: 'Phase Classes' }
const CLASS_TYPE: Record<BatchClassKind, string> = { pcell: 'Process Cell Class', unit: 'Unit Class', phase: 'Phase Class' }

export function batchLabel(s: BatchSel): string {
  switch (s.t) {
    case 'root': return ROOT_LABEL[s.cls]
    case 'cat': case 'class': case 'cell': case 'unit': case 'subsystem': return s.name
    case 'composite': return s.composite
    case 'uphase': return s.phase
    case 'aliases': return 'Aliases'
    case 'external': return 'External Phases'
    case 'emRoot': return 'Equipment Module Classes'
    case 'emCat': case 'emClass': case 'cmDevice': return s.name
    case 'emInstance': return s.tag
    case 'ucBlock': return s.name
  }
}

export function useBatchEnabled(): { batch: boolean; aum: boolean } {
  const batch = useSystem(s => !!s.features.batch)
  const aum = useSystem(s => !!s.features.advancedUnitManagement)
  return { batch, aum: aum || batch }
}

const NOT_MODELED = 'Not part of the Chapter 4 workshop; not modeled in BatchLive'
const sep = { label: '', separator: true }
type MenuItem = { label: string; onClick?: () => void; disabled?: string; separator?: boolean; danger?: boolean }
type Menu = { x: number; y: number; label: string; items: MenuItem[] }

export function BatchIcon({ kind }: { kind: 'pcellClass' | 'pcell' | 'unitClass' | 'unit' | 'phaseClass' | 'uphase' | 'alias' | 'aliases' | 'composite' | 'param' | 'input' | 'report' | 'roots' | 'external' | 'folder' | 'subsystem' }): JSX.Element {
  return <svg width={16} height={16} viewBox="0 0 16 16" className="lib-ico" aria-hidden data-batch-icon={kind}>
    {(kind === 'pcellClass' || kind === 'pcell') && <>{kind === 'pcellClass' && <rect x={0.5} y={0.5} width={15} height={15} fill="#fff" stroke="#3f444b" />}
      <circle cx={4} cy={5} r={2.3} fill="#c0452f" /><circle cx={11} cy={5} r={2.3} fill="#2f5ca8" /><path d="M4,8 V14 M11,8 V14 M4,11 H11" stroke="#3f9b45" strokeWidth={1.6} /></>}
    {(kind === 'unitClass' || kind === 'unit') && <>{kind === 'unitClass' && <rect x={0.5} y={0.5} width={15} height={15} fill="#fff" stroke="#3f444b" />}
      <rect x={3} y={2} width={10} height={12} rx={3} fill="#c9cdd4" stroke="#3f444b" /><path d="M6,4 V12 M10,4 V12" stroke="#3f444b" strokeWidth={1.4} /></>}
    {(kind === 'phaseClass' || kind === 'uphase') && <>{kind === 'phaseClass' && <rect x={0.5} y={0.5} width={15} height={15} fill="#fff" stroke="#3f444b" />}
      <path d="M8,14 L2.5,8 A3,3 0 0 1 8,4.2 A3,3 0 0 1 13.5,8 Z" fill="#e0447c" stroke="#8a1f45" /></>}
    {(kind === 'alias' || kind === 'aliases') && <><circle cx={4.5} cy={8} r={3} fill="none" stroke="#1b1f24" strokeWidth={1.8} /><circle cx={11.5} cy={8} r={3} fill="none" stroke="#1b1f24" strokeWidth={1.8} />
      {kind === 'aliases' && <rect x={0.5} y={0.5} width={15} height={15} fill="none" stroke="#3f444b" />}</>}
    {kind === 'composite' && <><rect x={1} y={1} width={7} height={7} fill="#2f5ca8" /><rect x={8} y={1} width={7} height={7} fill="#e5c22b" /><rect x={1} y={8} width={7} height={7} fill="#c0452f" /><rect x={8} y={8} width={7} height={7} fill="#3f9b45" /></>}
    {(kind === 'param' || kind === 'input' || kind === 'report') && <><rect x={1} y={2} width={14} height={12} fill={kind === 'input' ? '#4caf50' : kind === 'report' ? '#f2d33a' : '#fff'} stroke="#2f5ca8" /><path d="M3,6 H13 M3,9 H13 M3,12 H9" stroke="#2f5ca8" /></>}
    {kind === 'roots' && <><rect x={1} y={2} width={6} height={6} fill="#c0452f" /><rect x={9} y={2} width={6} height={6} fill="#2f5ca8" /><rect x={5} y={9} width={6} height={6} fill="#3f9b45" /></>}
    {kind === 'external' && <><path d="M8,1 L15,8 L8,15 L1,8 Z" fill="#e0447c" /><path d="M8,4 L12,8 L8,12 L4,8 Z" fill="#6bb4e8" /></>}
    {kind === 'folder' && <path d="M1,4 H6 L7.5,6 H15 V14 H1 Z" fill="#e4c45b" stroke="#7b6a35" strokeWidth={0.7} />}
    {kind === 'subsystem' && <><rect x={2} y={3} width={12} height={10} fill="#5f6f7f" /><rect x={4} y={5} width={8} height={2} fill="#e4c45b" /></>}
  </svg>
}

const CLASS_ICON: Record<BatchClassKind, 'pcellClass' | 'unitClass' | 'phaseClass'> = { pcell: 'pcellClass', unit: 'unitClass', phase: 'phaseClass' }

function InlineName({ value, onCommit, onCancel, label }: { value: string; onCommit: (v: string) => void; onCancel: () => void; label: string }): JSX.Element {
  const [text, setText] = useState(value)
  return <input aria-label={label} className="exp-area-editor" autoFocus value={text}
    onFocus={e => e.target.select()} onClick={e => e.stopPropagation()} onChange={e => setText(e.target.value)}
    onBlur={() => onCommit(text)}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); onCommit(text) } else if (e.key === 'Escape') { e.preventDefault(); onCancel() } }} />
}

function useMenu(): [Menu | null, (m: Menu | null) => void] {
  const [menu, setMenu] = useState<Menu | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true) }
  }, [menu])
  return [menu, setMenu]
}

const same = (a: BatchSel | null, b: BatchSel): boolean => !!a && JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------------------
// Library ▸ Advanced Definitions ▸ Process Cell / Unit / Phase Classes

export function BatchClassTree({ cls, depth, sel, onSelect }: { cls: BatchClassKind; depth: number; sel: BatchSel | null; onSelect: (s: BatchSel) => void }): JSX.Element {
  const b = useBatch()
  const ui = useBatchUi()
  const openPhaseStudio = useUi(s => s.openPhaseStudio)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useMenu()
  const toggle = (k: string): void => setOpen(o => ({ ...o, [k]: !o[k] }))
  const pool: Record<string, { name: string; category: string }> = cls === 'pcell' ? b.pcellClasses : cls === 'unit' ? b.unitClasses : b.phaseClasses
  const cats = Object.values(b.categories).filter(c => c.kind === cls)
  const renamingCat = (n: string): boolean => ui.renaming?.kind === 'cat' && ui.renaming.cls === cls && ui.renaming.name === n
  const renamingClass = (n: string): boolean => ui.renaming?.kind === 'class' && ui.renaming.cls === cls && ui.renaming.name === n
  const commit = (next: string): void => {
    const r = ui.renaming
    if (r?.kind === 'ucBlock') { if (alertResult(b.renameModuleBlock(r.unitClass, r.name, next))) ui.setRenaming(null); return }
    if (!r || (r.kind !== 'cat' && r.kind !== 'class')) return
    const res = r.kind === 'cat' ? b.renameCategory(cls, r.name, next) : b.renameClass(cls, r.name, next)
    if (!alertResult(res)) return
    ui.setRenaming(null)
    onSelect(r.kind === 'cat' ? { t: 'cat', cls, name: res.value } : { t: 'class', cls, name: res.value })
  }
  const newCategory = (parent: string | null): void => {
    const r = b.newCategory(cls, parent)
    if (!alertResult(r)) return
    setOpen(o => ({ ...o, root: true, ...(parent ? { [`cat:${parent}`]: true } : {}) }))
    onSelect({ t: 'cat', cls, name: r.value })
    ui.setRenaming({ kind: 'cat', cls, name: r.value })
  }
  const newClass = (category: string): void => {
    setOpen(o => ({ ...o, [`cat:${category}`]: true }))
    if (cls === 'pcell') {
      const r = b.newProcessCellClass(category)
      if (!alertResult(r)) return
      onSelect({ t: 'class', cls, name: r.value })
      ui.setRenaming({ kind: 'class', cls, name: r.value })
    } else ui.openDialog(cls === 'unit' ? { t: 'newUnitClass', category } : { t: 'newPhaseClass', category })
  }
  const classMenu = (name: string, e: React.MouseEvent): void => {
    onSelect({ t: 'class', cls, name })
    const common: MenuItem[] = [sep, { label: 'References...', onClick: () => onSelect({ t: 'class', cls, name }) }, sep,
      { label: 'Delete', danger: true, onClick: () => { void askConfirm(`Delete ${name}?`).then(ok => { if (ok) { alertResult(b.deleteClass(cls, name)) } })} },
      { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'class', cls, name }) }, sep,
      { label: "What's this?", onClick: () => window.alert(cls === 'pcell' ? 'Process Cell Class — common properties for a class of process cells.' : cls === 'unit' ? 'Unit Class — logical grouping of like equipment. Aliases are created here and resolved on each unit module.' : 'Phase Class — common properties and phase logic. Phase logic is created at the Phase Class.') },
      { label: 'Properties', onClick: () => onSelect({ t: 'class', cls, name }) }]
    const items: MenuItem[] = cls === 'pcell' ? [{ label: 'Explore', onClick: () => onSelect({ t: 'class', cls, name }) }, ...common] :
      cls === 'unit' ? [
        { label: 'Explore', onClick: () => onSelect({ t: 'class', cls, name }) },
        { label: 'Open with Control Studio', disabled: 'Unit class algorithm type is <None>' },
        { label: 'Assign Phase Class...', onClick: () => ui.openDialog({ t: 'assignPhase', unitClass: name }) },
        { label: 'Configure', disabled: NOT_MODELED },
        { label: 'Add ▸', disabled: NOT_MODELED },
        { label: 'Unused aliases...', onClick: () => window.alert(unusedAliases(name)) },
        sep,
        { label: 'New ▸ Unit Parameter Definition', disabled: NOT_MODELED },
        { label: 'New ▸ Alias', onClick: () => ui.openDialog({ t: 'newAlias', unitClass: name }) },
        ...common] : [
        { label: 'Explore', onClick: () => onSelect({ t: 'class', cls, name }) },
        { label: 'Open with Control Studio', onClick: () => openPhaseStudio(name) },
        { label: 'Add To Unit Class...', onClick: () => ui.openDialog({ t: 'addToUnit', phaseClass: name }) },
        { label: 'Hide Internal Structure', disabled: NOT_MODELED },
        { label: 'Show Internal Structure', disabled: NOT_MODELED },
        sep,
        { label: 'New ▸ Phase Message', onClick: () => ui.openDialog({ t: 'param', phaseClass: name, kind: 'message' }) },
        { label: 'New ▸ Batch input/report parameter', onClick: () => ui.openDialog({ t: 'param', phaseClass: name, kind: 'batch' }) },
        { label: 'New ▸ Phase algorithm parameter', onClick: () => ui.openDialog({ t: 'param', phaseClass: name, kind: 'algorithm' }) },
        ...common]
    setMenu({ x: e.clientX, y: e.clientY, label: name, items })
  }
  const renderCat = (cat: string, d: number): JSX.Element => {
    const key = `cat:${cat}`
    const kids = cats.filter(c => c.parent === cat).map(c => c.name).sort()
    const members = Object.values(pool).filter(c => c.category === cat).map(c => c.name).sort()
    return <TreeRow key={cat} depth={d} open={!!open[key]} onToggle={() => toggle(key)} selected={same(sel, { t: 'cat', cls, name: cat })}
      icon={<BatchIcon kind="folder" />} dataAttr={{ [`data-batch-cat-${cls}`]: cat }}
      label={renamingCat(cat) ? <InlineName label="Category name" value={cat} onCommit={commit} onCancel={() => ui.setRenaming(null)} /> : <span>{cat}</span>}
      onClick={() => onSelect({ t: 'cat', cls, name: cat })}
      onContextMenu={e => { onSelect({ t: 'cat', cls, name: cat }); setMenu({ x: e.clientX, y: e.clientY, label: cat, items: [
        { label: 'Explore', onClick: () => onSelect({ t: 'cat', cls, name: cat }) },
        { label: cls === 'pcell' ? 'New Process Cell Class' : cls === 'unit' ? 'New Unit Class' : 'New Phase Class', onClick: () => newClass(cat) },
        { label: 'New Category', onClick: () => newCategory(cat) },
        sep,
        { label: 'Unprotect', disabled: NOT_MODELED }, { label: 'Protect', disabled: NOT_MODELED },
        sep,
        { label: 'Delete', danger: true, onClick: () => alertResult(b.deleteCategory(cls, cat)) },
        { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'cat', cls, name: cat }) },
        sep,
        { label: "What's this?", onClick: () => window.alert('Categories are organizational groupings of classes. They do not influence your control strategy in any way.') }
      ] }) }}>
      {kids.map(k => renderCat(k, d + 1))}
      {members.map(name => {
        const ck = `class:${name}`
        const children: ReactNode = cls === 'unit' ? <>{Object.values(b.unitClasses[name]?.modules ?? {}).map(m => <TreeRow key={`m${m.name}`} depth={d + 2}
          icon={<ModuleIcon kind={m.kind === 'em' ? 'equipment' : 'control'} size={16} />} dataAttr={{ 'data-unit-block': `${name}/${m.name}` }}
          label={ui.renaming?.kind === 'ucBlock' && ui.renaming.unitClass === name && ui.renaming.name === m.name ? <InlineName label="Module block name" value={m.name} onCommit={commit} onCancel={() => ui.setRenaming(null)} /> : <span>{m.name}</span>}
          sub={`${m.className} · ${m.ownership}${m.allowVariant ? ' · variant allowed' : ''}`}
          selected={same(sel, { t: 'ucBlock', unitClass: name, name: m.name })}
          onClick={() => onSelect({ t: 'ucBlock', unitClass: name, name: m.name })}
          onKeyDown={e => { if (e.key === 'F2') ui.setRenaming({ kind: 'ucBlock', unitClass: name, name: m.name }) }}
          onContextMenu={e => { onSelect({ t: 'ucBlock', unitClass: name, name: m.name }); setMenu({ x: e.clientX, y: e.clientY, label: m.name, items: [
            { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'ucBlock', unitClass: name, name: m.name }) },
            { label: 'Delete', danger: true, onClick: () => { void askConfirm(`Delete module block ${m.name} and its alias?`).then(ok => { if (ok) { alertResult(b.removeModuleBlock(name, m.name)) } })} },
            sep,
            { label: 'Properties', onClick: () => window.alert(`${m.name}: ${m.kind === 'em' ? 'Equipment' : 'Control'} Module Class ${m.className}\nOwnership type: ${m.ownership}\nAllow variant module to be substituted on module instances: ${m.allowVariant ? 'Yes' : 'No'}`) }
          ] }) }} />)}
          {(b.unitClasses[name]?.phaseClasses ?? []).map(p => <TreeRow key={p} depth={d + 2}
          icon={<BatchIcon kind="phaseClass" />} label={<span>{p}</span>} sub="Assigned phase class" onClick={() => onSelect({ t: 'class', cls: 'phase', name: p })} />)}</> :
          cls === 'phase' ? COMPOSITES.map(c => <TreeRow key={c} depth={d + 2} icon={<BatchIcon kind="composite" />} label={<span>{c}</span>}
            selected={same(sel, { t: 'composite', phase: name, composite: c })} onClick={() => onSelect({ t: 'composite', phase: name, composite: c })}
            onDoubleClick={() => openPhaseStudio(name, c)} />) : null
        const hasKids = cls === 'phase' || (cls === 'unit' && ((b.unitClasses[name]?.phaseClasses.length ?? 0) > 0 || Object.keys(b.unitClasses[name]?.modules ?? {}).length > 0))
        return <TreeRow key={name} depth={d + 1} open={!!open[ck]} onToggle={hasKids ? () => toggle(ck) : undefined}
          selected={same(sel, { t: 'class', cls, name })} icon={<BatchIcon kind={CLASS_ICON[cls]} />}
          dataAttr={{ [`data-batch-class-${cls}`]: name }}
          label={renamingClass(name) ? <InlineName label="Class name" value={name} onCommit={commit} onCancel={() => ui.setRenaming(null)} /> :
            <span>{name}{cls === 'phase' && b.phaseDrafts[name] ? ' *' : ''}</span>}
          sub={CLASS_TYPE[cls]}
          drag={{ type: CLASS_DRAG[cls], value: name }}
          drop={cls === 'unit' ? { accepts: [DRAG_PHASE_CLASS, DRAG_EM_CLASS, DRAG_CM_DEVICE], onDrop: (t, p) => {
            if (t === DRAG_PHASE_CLASS) { if (alertResult(b.assignPhaseClass(name, p))) setOpen(o => ({ ...o, [ck]: true })) }
            else { setOpen(o => ({ ...o, [ck]: true })); ui.openDialog({ t: 'moduleBlock', unitClass: name, className: p }) }
          } } : undefined}
          onClick={() => onSelect({ t: 'class', cls, name })}
          onDoubleClick={cls === 'phase' ? () => openPhaseStudio(name) : undefined}
          onContextMenu={e => classMenu(name, e)}>
          {children}
        </TreeRow>
      })}
    </TreeRow>
  }
  return <div data-library={`batch-${cls}`}>
    <TreeRow depth={depth} open={!!open.root} onToggle={() => toggle('root')} selected={same(sel, { t: 'root', cls })}
      icon={<BatchIcon kind={cls === 'unit' ? 'unitClass' : cls === 'phase' ? 'phaseClass' : 'pcellClass'} />} label={<span>{ROOT_LABEL[cls]}</span>}
      dataAttr={{ 'data-batch-root': cls }}
      onClick={() => onSelect({ t: 'root', cls })}
      onContextMenu={e => { onSelect({ t: 'root', cls }); setMenu({ x: e.clientX, y: e.clientY, label: ROOT_LABEL[cls], items: [
        { label: 'Explore', onClick: () => onSelect({ t: 'root', cls }) },
        { label: 'New Category', onClick: () => newCategory(null) },
        sep,
        { label: "What's this?", onClick: () => window.alert(`${ROOT_LABEL[cls]} — right-click to create a New Category, then right-click the category to create a class.`) }
      ] }) }}>
      {cats.filter(c => c.parent === null).map(c => c.name).sort((a, b2) => a.localeCompare(b2)).map(c => renderCat(c, depth + 1))}
    </TreeRow>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </div>
}

function unusedAliases(unitClass: string): string {
  const s = useBatch.getState()
  const uc = s.unitClasses[unitClass]
  if (!uc) return ''
  const used = new Set<string>()
  for (const p of uc.phaseClasses) {
    const pc = s.phaseClasses[p]
    for (const sfc of Object.values(pc?.logic ?? {})) for (const step of sfc.steps) {
      for (const a of step.actions) for (const m of a.expression.matchAll(/#([^#]+)#/g)) used.add(m[1].toUpperCase())
    }
    for (const sfc of Object.values(pc?.logic ?? {})) for (const t of sfc.transitions) for (const m of t.condition.matchAll(/#([^#]+)#/g)) used.add(m[1].toUpperCase())
  }
  const unused = Object.keys(uc.aliases).filter(a => !used.has(a))
  return unused.length ? `Aliases of ${unitClass} not used by its phase classes: ${unused.join(', ')}` : `Every alias of ${unitClass} is used by its phase logic.`
}

// ---------------------------------------------------------------------------
// Control Strategies ▸ area ▸ process cell ▸ unit module (unit phases, Aliases, contained modules)

export function ProcessCellRows({ area, depth, sel, onSelect, renderModule, onModuleSelect, moduleSelected }: {
  area: string; depth: number; sel: BatchSel | null; onSelect: (s: BatchSel) => void; renderModule: (tag: string, depth: number) => ReactNode
  /** Select / highlight a control module under a unit module the same way as the rest of the Explorer tree. */
  onModuleSelect?: (tag: string) => void; moduleSelected?: (tag: string) => boolean
}): JSX.Element | null {
  const b = useBatch()
  const ui = useBatchUi()
  const lib = useLibrary()
  const openPhaseStudio = useUi(s => s.openPhaseStudio)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useMenu()
  const cells = Object.values(b.processCells).filter(c => c.area === area)
  if (!cells.length) return null
  const toggle = (k: string): void => setOpen(o => ({ ...o, [k]: !o[k] }))
  const commit = (next: string): void => {
    const r = ui.renaming
    if (!r || (r.kind !== 'cell' && r.kind !== 'unit')) return
    const res = r.kind === 'cell' ? b.renameProcessCell(r.name, next) : b.renameUnitModule(r.name, next)
    if (!alertResult(res)) return
    ui.setRenaming(null)
    onSelect(r.kind === 'cell' ? { t: 'cell', name: res.value } : { t: 'unit', name: res.value })
  }
  const unitMenu = (unit: string, e: React.MouseEvent): void => {
    onSelect({ t: 'unit', name: unit })
    const assigned = b.unitAssignments[unit]
    setMenu({ x: e.clientX, y: e.clientY, label: unit, items: [
      { label: 'Explore', onClick: () => onSelect({ t: 'unit', name: unit }) },
      { label: 'Open ▸ Faceplate', onClick: () => useBatchUi.getState().openUnit(unit) },
      { label: 'Open ▸ Primary Display', onClick: () => { const d = b.units[unit]?.primaryDisplay; if (d) useUi.getState().openPicture(d); else window.alert(`${unit} has no primary control display (Properties ▸ Displays)`) } },
      { label: 'Configure ▸', disabled: NOT_MODELED },
      sep,
      { label: 'New ▸', disabled: 'Unit phases come from the unit class; drag control modules onto the unit module' },
      sep,
      { label: 'References...', onClick: () => onSelect({ t: 'unit', name: unit }) },
      { label: 'History Collection...', disabled: NOT_MODELED },
      { label: 'System Alarm Management', disabled: NOT_MODELED },
      { label: 'Tune', disabled: NOT_MODELED },
      { label: 'Advanced Control ▸', disabled: NOT_MODELED },
      { label: 'Configure I/O', disabled: NOT_MODELED },
      { label: 'Filtered Parameter List', disabled: NOT_MODELED },
      { label: 'Download ▸ Unit Module', onClick: () => ui.openDialog({ t: 'download', unit, contained: false }), disabled: assigned ? undefined : 'Assign the unit module to a node first' },
      { label: 'Download ▸ Unit Module and contained modules', onClick: () => ui.openDialog({ t: 'download', unit, contained: true }), disabled: assigned ? undefined : 'Assign the unit module to a node first' },
      { label: 'Assign... ▸ Unit Module to Node', onClick: () => ui.openDialog({ t: 'assignNode', unit, contained: false }) },
      { label: 'Assign... ▸ Unit And All Contained Modules to Node', onClick: () => ui.openDialog({ t: 'assignNode', unit, contained: true }) },
      sep,
      { label: 'Print', disabled: NOT_MODELED }, { label: 'Export', disabled: NOT_MODELED },
      sep,
      { label: 'Cut', disabled: NOT_MODELED }, { label: 'Copy', disabled: NOT_MODELED }, { label: 'Paste', disabled: NOT_MODELED },
      sep,
      { label: 'Delete', danger: true, onClick: () => { void askConfirm(`Delete ${unit}?`).then(ok => { if (ok) { alertResult(b.deleteUnitModule(unit)) } })} },
      { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'unit', name: unit }) },
      sep,
      { label: "What's this?", onClick: () => window.alert('Unit Module — created when a Unit Class is assigned to a Process Cell. It runs its unit phases in the controller.') },
      { label: 'Properties', onClick: () => ui.openDialog({ t: 'unitProps', unit }) }
    ] })
  }
  return <div data-library="batch-cells">
    {cells.map(cell => {
      const ck = `cell:${cell.name}`
      const units = Object.values(b.units).filter(u => u.processCell === cell.name)
      const members = Object.entries(b.cellMembers).filter(([, c]) => c === cell.name).map(([t]) => t).sort()
      return <TreeRow key={cell.name} depth={depth} open={open[ck] !== false} onToggle={() => setOpen(o => ({ ...o, [ck]: o[ck] === false }))}
        selected={same(sel, { t: 'cell', name: cell.name })} icon={<BatchIcon kind="pcell" />}
        dataAttr={{ 'data-process-cell': cell.name }}
        label={ui.renaming?.kind === 'cell' && ui.renaming.name === cell.name ? <InlineName label="Process cell name" value={cell.name} onCommit={commit} onCancel={() => ui.setRenaming(null)} /> : <span>{cell.name}</span>}
        sub={`Process Cell (${cell.className})`}
        drag={{ type: DRAG_PCELL, value: cell.name }}
        drop={{ accepts: [DRAG_UNIT_CLASS, DRAG_MODULE], onDrop: (t, v) => {
          if (t === DRAG_UNIT_CLASS) {
            const r = b.createUnitModule(v, cell.name)
            if (!alertResult(r)) return
            setOpen(o => ({ ...o, [ck]: true }))
            onSelect({ t: 'unit', name: r.value })
            ui.setRenaming({ kind: 'unit', name: r.value })
          } else alertResult(b.addToCell(v, cell.name))
        } }}
        onClick={() => onSelect({ t: 'cell', name: cell.name })}
        onContextMenu={e => { onSelect({ t: 'cell', name: cell.name }); setMenu({ x: e.clientX, y: e.clientY, label: cell.name, items: [
          { label: 'Explore', onClick: () => onSelect({ t: 'cell', name: cell.name }) },
          { label: 'New ▸ Unit Module', disabled: 'Drag a Unit Class onto the process cell' },
          sep,
          { label: 'Assign ▸ Process Cell and Contained Modules to Node', onClick: () => {
            const ctl = Object.keys(useStore.getState().hardware.controllers)[0]
            if (ctl) void askConfirm(`Assign ${cell.name}, its unit modules and contained modules to ${ctl}?`).then(ok => { if (ok) { alertResult(b.assignCell(cell.name, ctl)) } })
          } },
          sep,
          { label: 'Delete', danger: true, onClick: () => alertResult(b.deleteProcessCell(cell.name)) },
          { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'cell', name: cell.name }) },
          sep,
          { label: "What's this?", onClick: () => window.alert('Process Cell — all equipment needed to create a batch. It typically resides in one plant area.') }
        ] }) }}>
        {units.map(u => {
          const uk = `unit:${u.name}`
          const blockTags = new Set(Object.values(u.blocks ?? {}).filter((t): t is string => !!t))
          const contained = Object.entries(b.contained).filter(([t, x]) => x === u.name && !blockTags.has(t)).map(([t]) => t).sort()
          const dl = unitDownloadState(b, u.name)
          return <TreeRow key={u.name} depth={depth + 1} open={!!open[uk]} onToggle={() => toggle(uk)} selected={same(sel, { t: 'unit', name: u.name })}
            icon={<BatchIcon kind="unit" />} dataAttr={{ 'data-unit-module': u.name }}
            pending={dl === 'not-downloaded' || dl === 'pending' ? <span className="tv-pending" title={dl === 'pending' ? 'Configuration changed — download required' : 'Not downloaded'}>▲</span> : undefined}
            label={ui.renaming?.kind === 'unit' && ui.renaming.name === u.name ? <InlineName label="Unit module name" value={u.name} onCommit={commit} onCancel={() => ui.setRenaming(null)} /> : <span>{u.name}</span>}
            sub={`Unit Module (${u.unitClass})${b.unitAssignments[u.name] ? ` · ${b.unitAssignments[u.name]}` : ''}`}
            drag={{ type: DRAG_UNIT, value: u.name }}
            drop={{ accepts: [DRAG_MODULE], onDrop: (_t, tag) => { if (alertResult(b.containModule(tag, u.name))) setOpen(o => ({ ...o, [uk]: true })) } }}
            onClick={() => onSelect({ t: 'unit', name: u.name })}
            onDoubleClick={() => useBatchUi.getState().openUnit(u.name)}
            onContextMenu={e => unitMenu(u.name, e)}>
            {Object.values(u.phases).map(ph => <TreeRow key={ph.name} depth={depth + 2} selected={same(sel, { t: 'uphase', unit: u.name, phase: ph.name })}
              icon={<BatchIcon kind="uphase" />} label={<span>{ph.name}</span>} sub={`Unit Phase · ${ph.phaseType}`}
              dataAttr={{ 'data-unit-phase': `${u.name}/${ph.name}` }}
              onClick={() => onSelect({ t: 'uphase', unit: u.name, phase: ph.name })}
              onDoubleClick={() => ui.openDialog({ t: 'phaseProps', unit: u.name, phase: ph.name })}
              onContextMenu={e => { onSelect({ t: 'uphase', unit: u.name, phase: ph.name }); setMenu({ x: e.clientX, y: e.clientY, label: `${u.name}/${ph.name}`, items: [
                { label: 'Explore', onClick: () => onSelect({ t: 'uphase', unit: u.name, phase: ph.name }) },
                { label: 'Open with Control Studio', onClick: () => openPhaseStudio(ph.phaseClass) },
                { label: 'Open ▸ Faceplate', onClick: () => useBatchUi.getState().openPhase(u.name, ph.name) },
                { label: 'Download ▸ Unit Phase', onClick: () => { const r = b.downloadUnitPhase(u.name, ph.name); if (alertResult(r)) window.alert(r.value.warnings.length ? `Downloaded with warnings:\n${r.value.warnings.join('\n')}` : `${u.name}/${ph.name} downloaded.`) } },
                sep,
                { label: "What's this?", onClick: () => window.alert('Unit Phase — the instance of a Phase Class associated with a particular Unit Module.') },
                { label: 'Properties', onClick: () => ui.openDialog({ t: 'phaseProps', unit: u.name, phase: ph.name }) }
              ] }) }} />)}
            <TreeRow depth={depth + 2} selected={same(sel, { t: 'aliases', unit: u.name })} icon={<BatchIcon kind="aliases" />}
              label={<span>Aliases</span>} sub={aliasesResolved(u) ? 'All aliases resolved' : 'Unresolved aliases'} dataAttr={{ 'data-aliases': u.name }}
              onClick={() => onSelect({ t: 'aliases', unit: u.name })} />
            <ModuleInstanceRows unit={u.name} depth={depth + 2} sel={sel} onSelect={onSelect} onModuleSelect={onModuleSelect} moduleSelected={moduleSelected} />
            {contained.map(t => renderModule(t, depth + 2))}
          </TreeRow>
        })}
        {members.map(t => lib.sims[t] ? <TreeRow key={t} depth={depth + 1} icon={<ModuleIcon kind="control" size={16} />} label={<span>{t}</span>}
          sub={lib.sims[t].description} dataAttr={{ 'data-sim-module': t }} drag={{ type: DRAG_MODULE, value: t }} /> : renderModule(t, depth + 1))}
      </TreeRow>
    })}
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </div>
}

// ---------------------------------------------------------------------------
// Contents of '...' (right-hand pane)

const icon = (k: Parameters<typeof BatchIcon>[0]['kind']): JSX.Element => <BatchIcon kind={k} />

export function BatchDetail({ sel, onSelect }: { sel: BatchSel; onSelect: (s: BatchSel) => void }): JSX.Element {
  const b = useBatch()
  const ui = useBatchUi()
  const modules = useStore(s => s.modules)
  const openPhaseStudio = useUi(s => s.openPhaseStudio)
  const [menu, setMenu] = useMenu()
  const pane = (body: ReactNode, actions?: ReactNode): JSX.Element => <div className="dvx-contents">{actions && <div className="dvx-actions">{actions}</div>}{body}
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}</div>
  const classRows = (cls: BatchClassKind, cat: string): ContentsRow[] => {
    const pool: Record<string, { name: string; category: string }> = cls === 'pcell' ? b.pcellClasses : cls === 'unit' ? b.unitClasses : b.phaseClasses
    return [
      ...Object.values(b.categories).filter(c => c.kind === cls && c.parent === cat).map(c => ({ key: `c${c.name}`, icon: icon('folder'), name: c.name, type: 'Category', onOpen: () => onSelect({ t: 'cat', cls, name: c.name }) })),
      ...Object.values(pool).filter(c => c.category === cat).map(c => ({ key: c.name, icon: icon(CLASS_ICON[cls]), name: c.name, type: CLASS_TYPE[cls],
        drag: { type: CLASS_DRAG[cls], value: c.name }, data: { [`data-contents-${cls}`]: c.name },
        onClick: () => onSelect({ t: 'class', cls, name: c.name }), onOpen: () => (cls === 'phase' ? openPhaseStudio(c.name) : onSelect({ t: 'class', cls, name: c.name })) }))
    ]
  }
  switch (sel.t) {
    case 'root':
      return pane(<ContentsList rows={Object.values(b.categories).filter(c => c.kind === sel.cls && c.parent === null).map(c => ({
        key: c.name, icon: icon('folder'), name: c.name, type: 'Category', onOpen: () => onSelect({ t: 'cat', cls: sel.cls, name: c.name }) }))} />)
    case 'cat':
      return pane(<ContentsList rows={classRows(sel.cls, sel.name)} empty={sel.cls === 'pcell' ? 'Right-click the category ▸ New Process Cell Class.' : sel.cls === 'unit' ? 'Right-click the category ▸ New Unit Class.' : 'Right-click the category ▸ New Phase Class.'} />)
    case 'class': {
      if (sel.cls === 'pcell') {
        const pc = b.pcellClasses[sel.name]
        if (!pc) return <div className="exp-empty">Not found.</div>
        return pane(<ContentsList rows={Object.values(b.processCells).filter(c => c.className === sel.name).map(c => ({ key: c.name, icon: icon('pcell'), name: c.name, type: `Process Cell (${c.area})`, onOpen: () => onSelect({ t: 'cell', name: c.name }) }))}
          empty={`No process cells yet. Drag ${sel.name} onto a plant area (for example ED_CENTER_BATCH).`} />)
      }
      if (sel.cls === 'unit') {
        const uc = b.unitClasses[sel.name]
        if (!uc) return <div className="exp-empty">Not found.</div>
        return pane(<ContentsList rows={[
          ...UNIT_CLASS_PARAMS.map(p => ({ key: p, icon: icon('param'), name: p, type: 'Unit parameter' })),
          ...Object.values(uc.modules ?? {}).map(m => ({ key: `m${m.name}`, icon: <ModuleIcon kind={m.kind === 'em' ? 'equipment' : 'control'} size={16} />, name: m.name,
            type: `Module block: ${m.className} (${m.ownership})`, data: { 'data-contents-block': m.name },
            onClick: () => onSelect({ t: 'ucBlock', unitClass: uc.name, name: m.name }), onOpen: () => onSelect({ t: 'ucBlock', unitClass: uc.name, name: m.name }) })),
          ...Object.values(uc.aliases).map(a => ({ key: `a${a.name}`, icon: icon('alias'), name: a.name, type: `Alias${a.description ? ` — ${a.description}` : ''}`, data: { 'data-alias-def': a.name },
            onContextMenu: (e: React.MouseEvent) => setMenu({ x: e.clientX, y: e.clientY, label: a.name, items: [{ label: 'Delete', danger: true, onClick: () => alertResult(b.deleteAlias(uc.name, a.name)) }] }) })),
          ...uc.phaseClasses.map(p => ({ key: `p${p}`, icon: icon('phaseClass'), name: p, type: 'Phase class', onOpen: () => onSelect({ t: 'class', cls: 'phase', name: p }),
            onContextMenu: (e: React.MouseEvent) => setMenu({ x: e.clientX, y: e.clientY, label: p, items: [{ label: 'Remove from unit class', danger: true, onClick: () => alertResult(b.removePhaseClass(uc.name, p)) }] }) }))
        ]} />, <>
          <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'newAlias', unitClass: uc.name })}>New ▸ Alias...</button>
          <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'assignPhase', unitClass: uc.name })}>Assign Phase Class...</button>
        </>)
      }
      const pc = b.phaseClasses[sel.name]
      if (!pc) return <div className="exp-empty">Not found.</div>
      const user = Object.values(pc.params).sort((x, y) => x.id - y.id)
      return pane(<ContentsList rows={[
        ...COMPOSITES.map(c => ({ key: c, icon: icon('composite'), name: c, type: 'Composite (phase logic)', onOpen: () => openPhaseStudio(pc.name, c) })),
        ...SYSTEM_PHASE_PARAMS.map(([n]) => ({ key: n, icon: icon('param'), name: n, type: 'Phase parameter' })),
        ...user.map(p => ({ key: `u${p.name}`, icon: icon(p.kind === 'batch' ? (p.direction === 'Input' ? 'input' : 'report') : 'param'), name: p.name,
          type: p.kind === 'batch' ? `Batch ${p.direction.toLowerCase()} parameter (${p.group})` : p.kind === 'message' ? 'Phase message' : 'Phase algorithm parameter',
          data: { 'data-phase-param': p.name },
          onOpen: () => ui.openDialog({ t: 'param', phaseClass: pc.name, kind: p.kind, original: p.name }),
          onContextMenu: (e: React.MouseEvent) => setMenu({ x: e.clientX, y: e.clientY, label: p.name, items: [
            { label: 'Properties', onClick: () => ui.openDialog({ t: 'param', phaseClass: pc.name, kind: p.kind, original: p.name }) },
            { label: 'Delete', danger: true, onClick: () => alertResult(b.deletePhaseParam(pc.name, p.name)) }] }) }))
      ]} extraColumn={{ title: 'Default', value: r => { const p = pc.params[r.name]; return p ? `${String(p.defaultValue)}${p.units ? ' ' + p.units : ''}` : SYSTEM_PHASE_PARAMS.find(([n]) => n === r.name)?.[1] ?? '' } }} />,
      <><button className="tbtn sm" onClick={() => openPhaseStudio(pc.name)}>Open with Control Studio</button>
        <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'param', phaseClass: pc.name, kind: 'batch' })}>New ▸ Batch input/report parameter...</button>
        <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'addToUnit', phaseClass: pc.name })}>Add To Unit Class...</button></>)
    }
    case 'composite': {
      const pc = b.phaseDrafts[sel.phase] ?? b.phaseClasses[sel.phase]
      const sfc = pc?.logic[sel.composite]
      if (!sfc) return <div className="exp-empty">Not found.</div>
      return pane(<ContentsList rows={[
        ...sfc.steps.map((s, i) => ({ key: s.id, icon: icon('composite'), name: s.name, type: `Step${i === 0 ? ' (initial)' : ''} · ${s.actions.length} action(s)` })),
        ...sfc.transitions.map(t => ({ key: t.id, icon: icon('param'), name: t.name, type: `Transition: ${t.condition}` })),
        ...COMPOSITE_PARAMS.map(([n, d]) => ({ key: n, icon: icon('param'), name: n, type: `Parameter (${d})` }))
      ]} />, <button className="tbtn sm" onClick={() => openPhaseStudio(sel.phase, sel.composite)}>Open with Control Studio</button>)
    }
    case 'cell': {
      const units = Object.values(b.units).filter(u => u.processCell === sel.name)
      const members = Object.entries(b.cellMembers).filter(([, c]) => c === sel.name).map(([t]) => t)
      return pane(<ContentsList rows={[
        ...units.map(u => ({ key: u.name, icon: icon('unit'), name: u.name, type: `Unit Module (${u.unitClass})`, onOpen: () => onSelect({ t: 'unit', name: u.name }) })),
        ...members.map(t => ({ key: t, icon: <ModuleIcon kind="control" size={16} />, name: t, type: 'Control Module' }))
      ]} empty="Drag a Unit Class (for example COLORTANKS) onto this process cell to create a unit module." />)
    }
    case 'unit': {
      const u = b.units[sel.name]
      if (!u) return <div className="exp-empty">Not found.</div>
      const dl = unitDownloadState(b, u.name)
      return pane(<>
        <ContentsList rows={[
          ...UNIT_MODULE_PARAMS.map(p => ({ key: p, icon: icon('param'), name: p, type: 'Unit parameter' })),
          ...Object.values(u.phases).map(ph => ({ key: `p${ph.name}`, icon: icon('uphase'), name: ph.name, type: `Unit Phase (${ph.phaseType})`, onOpen: () => onSelect({ t: 'uphase', unit: u.name, phase: ph.name }) })),
          { key: 'aliases', icon: icon('aliases'), name: 'Aliases', type: 'Aliases', onOpen: () => onSelect({ t: 'aliases', unit: u.name }) },
          ...Object.entries(b.contained).filter(([, x]) => x === u.name).map(([t]) => {
            const block = Object.entries(u.blocks ?? {}).find(([, v]) => v === t)?.[0]
            const emi = useEm.getState().instances[t]
            return { key: t, icon: <ModuleIcon kind={emi ? 'equipment' : 'control'} size={16} />, name: block ? `${t} (${block})` : t,
              type: emi ? `Equipment Module (${emi.className})` : `Control Module${modules[t] ? ` (${modules[t].description})` : ''}`,
              onOpen: emi ? () => onSelect({ t: 'emInstance', tag: t }) : undefined }
          })
        ]} />
        <table className="exp-props-table lib-instance-summary"><tbody>
          <tr><td className="k">Unit class</td><td className="v">{u.unitClass}</td></tr>
          <tr><td className="k">Description</td><td className="v">{u.description}</td></tr>
          <tr><td className="k">Primary display</td><td className="v">{u.primaryDisplay || '(none)'}</td></tr>
          <tr><td className="k">Controller</td><td className="v">{b.unitAssignments[u.name] ?? 'Not assigned'}</td></tr>
          <tr><td className="k">Download state</td><td className="v" data-unit-download-state={dl}>{dl === 'current' ? 'Downloaded' : dl === 'pending' ? 'Download pending' : dl === 'not-downloaded' ? 'Not downloaded' : 'Not assigned'}</td></tr>
        </tbody></table>
      </>, <>
        <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'unitProps', unit: u.name })}>Properties...</button>
        <button className="tbtn sm" onClick={() => useBatchUi.getState().openUnit(u.name)}>Faceplate</button>
        <button className="tbtn sm" disabled={!b.unitAssignments[u.name]} onClick={() => ui.openDialog({ t: 'download', unit: u.name, contained: true })}>Download...</button>
      </>)
    }
    case 'uphase': {
      const u = b.units[sel.unit]
      const ph = u?.phases[sel.phase]
      const pc = ph && b.phaseClasses[ph.phaseClass]
      if (!u || !ph || !pc) return <div className="exp-empty">Not found.</div>
      const a = b.active[activeKey(sel.unit, sel.phase)]
      return pane(<>
        <ContentsList rows={Object.values(pc.params).map(p => ({ key: p.name, icon: icon(p.kind === 'batch' ? (p.direction === 'Input' ? 'input' : 'report') : 'param'), name: p.name,
          type: p.kind === 'batch' ? `Batch ${p.direction.toLowerCase()} parameter` : p.kind === 'message' ? 'Phase message' : 'Algorithm parameter',
          data: { 'data-uphase-param': p.name },
          onOpen: p.kind === 'message' || (p.kind === 'batch' && p.direction === 'Report') ? undefined : () => ui.openDialog({ t: 'uphaseParam', unit: u.name, phase: ph.name, param: p.name }),
          onContextMenu: p.kind === 'message' || (p.kind === 'batch' && p.direction === 'Report') ? undefined : (e: React.MouseEvent) => setMenu({ x: e.clientX, y: e.clientY, label: p.name, items: [
            { label: 'Properties', onClick: () => ui.openDialog({ t: 'uphaseParam', unit: u.name, phase: ph.name, param: p.name }) }] }) }))}
          extraColumn={{ title: 'Value', value: r => { const p = pc.params[r.name]; const live = a?.rt.params[r.name]; const cfg = ph.paramValues[r.name]; const v = live ?? cfg ?? p.defaultValue
            return `${typeof v === 'number' ? fmt(v, 1) : String(v)}${p.units ? ' ' + p.units : ''}${live !== undefined ? ' (online)' : cfg !== undefined ? ' (configured)' : ''}` } }} />
        <table className="exp-props-table lib-instance-summary"><tbody>
          <tr><td className="k">Phase class</td><td className="v">{ph.phaseClass}</td></tr>
          <tr><td className="k">Phase type</td><td className="v">{ph.phaseType}</td></tr>
          <tr><td className="k">Aliases resolved?</td><td className="v">{aliasesResolved(u) ? 'Yes' : 'No'}</td></tr>
          <tr><td className="k">State</td><td className="v">{a ? `${STATE_LABEL[a.rt.state]} (loaded, owner ${a.owner === 'BATCH' ? 'DeltaV Batch' : 'External'})` : 'Not loaded'}</td></tr>
        </tbody></table>
      </>, <><button className="tbtn sm" onClick={() => ui.openDialog({ t: 'phaseProps', unit: u.name, phase: ph.name })}>Properties...</button>
        <button className="tbtn sm" onClick={() => openPhaseStudio(ph.phaseClass)}>Open with Control Studio</button></>)
    }
    case 'aliases': {
      const u = b.units[sel.unit]
      if (!u) return <div className="exp-empty">Not found.</div>
      return pane(<ContentsList rows={Object.entries(u.aliases).map(([name, res]) => ({ key: name, icon: icon('alias'), name, type: 'Alias', data: { 'data-alias': name },
        onOpen: () => ui.openDialog({ t: 'alias', unit: u.name, alias: name }),
        onContextMenu: (e: React.MouseEvent) => setMenu({ x: e.clientX, y: e.clientY, label: name, items: [{ label: 'Properties', onClick: () => ui.openDialog({ t: 'alias', unit: u.name, alias: name }) }] }) }))}
        extraColumn={{ title: 'Path', value: r => { const res = u.aliases[r.name]; return res.ignore ? '(Ignore)' : res.path || <i>not resolved</i> } }}
        empty="The unit class has no aliases." />)
    }
    case 'external':
      return pane(<ContentsList rows={[]} empty="No external phases are configured." />)
    case 'emRoot': case 'emCat': case 'emClass': case 'emInstance': case 'cmDevice':
      return <EmDetail sel={sel} onSelect={onSelect} />
    case 'subsystem':
      return pane(<p className="exp-hint">{sel.name} subsystem on the ProfessionalPLUS workstation. Batch {sel.name === 'Batch Executive' ? 'Executive services (procedures, unit procedures, operations, Campaign Manager)' : 'Historian collection'} are not simulated in BatchLive; unit phases are run manually from DeltaV Operate (unit and phase faceplates, BatchHelp).</p>)
    case 'ucBlock': {
      const m = b.unitClasses[sel.unitClass]?.modules?.[sel.name]
      if (!m) return <div className="exp-empty">Not found.</div>
      return pane(<ContentsList rows={[
        { key: 'cls', icon: <ModuleIcon kind={m.kind === 'em' ? 'equipment' : 'control'} size={16} />, name: m.className, type: `${m.kind === 'em' ? 'Equipment' : 'Control'} Module Class` },
        { key: 'own', icon: icon('param'), name: `Ownership type: ${m.ownership}`, type: 'Module block property' },
        { key: 'var', icon: icon('param'), name: `Allow variant module to be substituted on module instances: ${m.allowVariant ? 'Yes' : 'No'}`, type: 'Module block property' }
      ]} />)
    }
  }
}
