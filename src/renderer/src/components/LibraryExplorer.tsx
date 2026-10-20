import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useStore } from '../engine/store'
import { useUi } from '../ui/uiStore'
import { ModuleIcon } from './EngineeringIcons'
import { SimulatorDialog } from './SimulatorDialog'
import { LibraryParamDialog } from './LibraryParamDialog'
import {
  useLibrary, downloadState, instanceContents, type DownloadReport, type DownloadState, type Result
} from '../engine/libraryStore'
import {
  LIBRARY_TEMPLATES, PARAM_TYPE_LABEL, configurableParams, findTemplate, formatParamValue, getParam, templateIoNote, type TemplateNode, type ParamValue
} from '../engine/classLibrary'
import { DeviceClassRows, EmClassTree, EmDetail } from './EmExplorer'
import { CM_DEVICE_CLASSES, useEm } from '../engine/emStore'
import { controllerIsDown, type Controller } from '../engine/hardware'
import { fmt } from '../utils/format'
import { useBatch, unitDownloadState } from '../engine/batchStore'
import { useBatchUi } from '../ui/batchUi'
import { BatchClassTree, BatchDetail, BatchIcon, DRAG_CM_DEVICE, DRAG_PCELL, DRAG_UNIT, ROOT_LABEL, useBatchEnabled, type BatchSel } from './BatchExplorer'

export const DRAG_TEMPLATE = 'application/x-bl-template'
export const DRAG_CLASS = 'application/x-bl-class'
export const DRAG_AREA = 'application/x-bl-area'

export type LibrarySelection =
  | { kind: 'library' }
  | { kind: 'folder'; path: string[] }
  | { kind: 'template'; name: string; path: string[] }
  | { kind: 'advanced' }
  | { kind: 'emClasses' }
  | { kind: 'cmClasses' }
  | { kind: 'category'; name: string }
  | { kind: 'class'; name: string; view?: 'references' }
  | { kind: 'network' }
  | { kind: 'decom' }
  | { kind: 'ctlnet' }
  | { kind: 'controller'; tag: string }
  | { kind: 'sim'; tag: string }
  | { kind: 'batch'; sel: BatchSel }

type Menu = { x: number; y: number; items: MenuItem[]; label: string }
type MenuItem = { label: string; onClick?: () => void; disabled?: string; separator?: boolean; danger?: boolean }

const WHATS_THIS: Record<string, string> = {
  library: 'Library — reusable templates and Advanced Definitions (classes) for the database.',
  cmClasses: 'Control Module Classes — common properties (algorithms, conditions, alarms and displays) for a particular type of control module. Right-click to create a New Category.',
  category: 'Control Module Class Categories — organizational groupings of control module classes. Categories do not influence your control strategy in any way.',
  class: 'Control Module Class — a template from which control modules are created. Each instance has the same structure; only parameters with "Allow instance value to be configured" can be changed on an instance.',
  instance: 'Control Module — created from a Control Module Class by dragging the class onto a Plant Area. Its logic comes from the class.',
  template: 'Module Template — drag it onto a Control Module Class Category to create a new Control Module Class.',
  controller: 'Controller — drag a Plant Area here to assign its modules, then Download the controller.'
}

export const alertResult = <T,>(r: Result<T>): r is { ok: true; value: T } => {
  if (!r.ok) window.alert(r.error)
  return r.ok
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

export function ContextMenu({ menu, onClose }: { menu: Menu; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({ left: Math.max(4, Math.min(menu.x, window.innerWidth - width - 4)), top: Math.max(4, Math.min(menu.y, window.innerHeight - height - 4)) })
  }, [menu.x, menu.y])
  return <div ref={ref} className="ctx-menu lib-ctx-menu" role="menu" aria-label={`${menu.label} menu`} style={pos} onMouseDown={e => e.stopPropagation()}>
    <div className="ctx-label">{menu.label}</div>
    {menu.items.map((item, i) => item.separator ? <div key={i} className="ctx-sep" /> :
      <button key={i} role="menuitem" className={'ctx-item' + (item.danger ? ' danger' : '')} disabled={!!item.disabled} title={item.disabled}
        onClick={() => { onClose(); item.onClick?.() }}>{item.label}</button>)}
  </div>
}

/** 16px DeltaV Explorer container icons (database, Library, System Configuration, areas, network, nodes). */
export function DvIcon({ kind }: { kind: 'database' | 'library' | 'sysconfig' | 'recipes' | 'setup' | 'strategies' | 'area' | 'unassignedio' | 'network' | 'decom' | 'ctlnet' | 'controller' | 'workstation' | 'folder' | 'item' }): JSX.Element {
  return <svg width={16} height={16} viewBox="0 0 16 16" className="lib-ico" aria-hidden data-dv-icon={kind}>
    {kind === 'database' && <><path d="M1,6 L8,2 L15,6 V14 H1 Z" fill="#c9cdd4" stroke="#5a5f68" /><rect x={3} y={8} width={3} height={6} fill="#b5413a" /><rect x={7} y={8} width={2} height={6} fill="#4f7cc4" /><rect x={10} y={8} width={3} height={6} fill="#6a9e48" /></>}
    {kind === 'library' && <><rect x={2} y={2} width={12} height={12} fill="#3d4148" /><rect x={4} y={4} width={2} height={8} fill="#c9cdd4" /><rect x={7} y={4} width={2} height={8} fill="#9aa1ab" /><rect x={10} y={4} width={2} height={8} fill="#c9cdd4" /></>}
    {kind === 'sysconfig' && <><rect x={1} y={2} width={9} height={11} fill="#4f6fa8" stroke="#283c63" /><rect x={8} y={5} width={7} height={9} fill="#9fb0c8" stroke="#3a4a66" /><rect x={3} y={4} width={5} height={2} fill="#c9d6ec" /></>}
    {kind === 'recipes' && <path d="M3,3 H12 Q14,3 14,5 V13 H5 Q3,13 3,11 Z" fill="#b8874a" stroke="#6c4a1f" />}
    {kind === 'setup' && <><circle cx={8} cy={8} r={5} fill="#7d838c" stroke="#3f444b" /><circle cx={8} cy={8} r={2} fill="#e3e6ea" /></>}
    {kind === 'strategies' && <><circle cx={5} cy={10} r={3.2} fill="#d7b52a" stroke="#806a12" /><circle cx={11} cy={10} r={3.2} fill="#5d9b39" stroke="#356e24" /><circle cx={8} cy={5} r={3.2} fill="#c0452f" stroke="#783721" /></>}
    {kind === 'area' && <><path d="M1,14 V7 L5,9 V7 L9,9 V4 H12 V14 Z" fill="#8a9099" stroke="#3f444b" /><rect x={10} y={2} width={2} height={3} fill="#5a5f68" /></>}
    {kind === 'unassignedio' && <><rect x={4} y={2} width={8} height={12} fill="#f1e6c2" stroke="#7a6a3a" /><path d="M6,6 H10 M6,9 H10" stroke="#7a6a3a" /></>}
    {kind === 'network' && <><rect x={1} y={2} width={6} height={5} fill="#4f6fa8" /><rect x={9} y={2} width={6} height={5} fill="#5d9b39" /><rect x={5} y={10} width={6} height={5} fill="#4f6fa8" /><path d="M4,7 V9 H12 V7 M8,9 V10" stroke="#3f444b" fill="none" /></>}
    {kind === 'decom' && <><rect x={3} y={2} width={10} height={12} fill="#6d6250" stroke="#3f3626" /><rect x={5} y={4} width={6} height={2} fill="#d8c27a" /></>}
    {kind === 'ctlnet' && <><rect x={2} y={2} width={12} height={12} fill="none" stroke="#2f5ca8" strokeDasharray="2 1" /><rect x={5} y={5} width={6} height={6} fill="#2f5ca8" /></>}
    {kind === 'controller' && <><rect x={2} y={2} width={12} height={12} fill="#e5c22b" stroke="#6e5a0b" /><text x={8} y={12} textAnchor="middle" fontSize={10} fontWeight={800} fill="#3f3626">C</text></>}
    {kind === 'workstation' && <><rect x={2} y={2} width={12} height={9} fill="#3f9b45" stroke="#1f5a23" /><rect x={5} y={12} width={6} height={2} fill="#3f444b" /></>}
    {kind === 'folder' && <path d="M1,4 H6 L7.5,6 H15 V14 H1 Z" fill="#e4c45b" stroke="#7b6a35" strokeWidth={0.7} />}
    {kind === 'item' && <rect x={3} y={3} width={10} height={10} fill="#fff" stroke="#5a5f68" />}
  </svg>
}

const NOT_MODELED = 'Not part of the Chapter 1 workshop; not modeled in BatchLive'
const sep: MenuItem = { label: '', separator: true }

function LibIcon({ kind }: { kind: 'library' | 'folder' | 'category' | 'class' | 'template' | 'fb' | 'advanced' | 'classes' | 'network' | 'controller' | 'sim' | 'param' }): JSX.Element {
  const fill: Record<string, string> = { library: '#4b4f57', folder: '#e4c45b', category: '#e6a24a', advanced: '#7aa2c8', network: '#6b8fb3', controller: '#5f6f7f', param: '#2f5ca8' }
  if (kind === 'class' || kind === 'template' || kind === 'classes') return <span className="lib-ico" aria-hidden>
    <ModuleIcon kind="control" size={16} />{kind !== 'template' && <span className={'lib-ico-badge ' + kind}>{kind === 'class' ? 'C' : '▣'}</span>}
  </span>
  if (kind === 'sim') return <span className="lib-ico" aria-hidden><ModuleIcon kind="control" size={16} /></span>
  return <svg width={16} height={16} viewBox="0 0 16 16" className="lib-ico" aria-hidden>
    {kind === 'folder' || kind === 'category' ? <path d="M1,4 H6 L7.5,6 H15 V14 H1 Z" fill={fill[kind]} stroke="#7b6a35" strokeWidth={0.7} /> :
      kind === 'param' ? <><rect x={1} y={2} width={14} height={12} fill="#fff" stroke={fill.param} /><path d="M3,6 H13 M3,9 H13 M3,12 H9" stroke={fill.param} /></> :
        kind === 'fb' ? <rect x={2} y={2} width={12} height={12} fill="#292e25" stroke="#969a9c" /> :
          <rect x={2} y={2} width={12} height={12} rx={2} fill={fill[kind] ?? '#888'} />}
  </svg>
}

/** Classic "Exploring DeltaV" tree row: ⊞/⊟ box, dotted guides, optional blue download triangle, icon and label. */
export function TreeRow({ depth, open, onToggle, selected, icon, label, sub, pending, onClick, onDoubleClick, onContextMenu, onKeyDown, drag, drop, dataAttr, children }: {
  depth: number; open?: boolean; onToggle?: () => void; selected?: boolean; icon: ReactNode; label: ReactNode; sub?: string
  pending?: ReactNode
  onClick?: () => void; onDoubleClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void; onKeyDown?: (e: React.KeyboardEvent) => void
  drag?: { type: string; value: string }; drop?: { accepts: string[]; onDrop: (type: string, value: string) => void }
  dataAttr?: Record<string, unknown>; children?: ReactNode
}): JSX.Element {
  const [over, setOver] = useState(false)
  const accepts = (e: DragEvent): string | undefined => drop?.accepts.find(t => e.dataTransfer.types.includes(t))
  return <>
    <div className={'tv-row exp-node lib-node' + (depth === 0 ? ' d0' : '') + (onToggle ? '' : ' leaf') + (selected ? ' sel' : '') + (over ? ' drop-over' : '')}
      style={{ '--d': depth } as React.CSSProperties} title={sub}
      {...dataAttr}
      tabIndex={selected ? 0 : -1}
      draggable={!!drag}
      onDragStart={drag ? e => { e.dataTransfer.setData(drag.type, drag.value); e.dataTransfer.setData('text/plain', drag.value); e.dataTransfer.effectAllowed = 'copyMove' } : undefined}
      onDragOver={drop ? e => { if (accepts(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true) } } : undefined}
      onDragLeave={drop ? () => setOver(false) : undefined}
      onDrop={drop ? e => { const t = accepts(e); setOver(false); if (t) { e.preventDefault(); drop.onDrop(t, e.dataTransfer.getData(t)) } } : undefined}
      onClick={onClick} onDoubleClick={onDoubleClick ?? onToggle} onKeyDown={onKeyDown}
      onContextMenu={onContextMenu ? e => { e.preventDefault(); onContextMenu(e) } : undefined}>
      <span className="tv-box exp-caret" onClick={e => { e.stopPropagation(); onToggle?.() }}>{onToggle ? (open ? '−' : '+') : ''}</span>
      {pending}
      <span className="tv-icon">{icon}</span>
      <span className="tv-label">{label}</span>
    </div>
    {open && children}
  </>
}
const Row = TreeRow

function InlineName({ value, onCommit, onCancel, label }: { value: string; onCommit: (v: string) => void; onCancel: () => void; label: string }): JSX.Element {
  const [text, setText] = useState(value)
  return <input aria-label={label} className="exp-area-editor" autoFocus value={text}
    onFocus={e => e.target.select()} onClick={e => e.stopPropagation()} onChange={e => setText(e.target.value)}
    onBlur={() => onCommit(text)}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCommit(text) } else if (e.key === 'Escape') { e.preventDefault(); onCancel() } }} />
}

// ---------------------------------------------------------------------------
// Library branch

export function LibraryTree({ selection, onSelect, depth = 0 }: { selection: LibrarySelection | null; onSelect: (s: LibrarySelection) => void; depth?: number }): JSX.Element {
  const categories = useLibrary(s => s.categories)
  const classes = useLibrary(s => s.classes)
  const drafts = useLibrary(s => s.drafts)
  const lib = useLibrary
  const openClassStudio = useUi(s => s.openClassStudio)
  const { aum } = useBatchEnabled()
  const batchSel = selection?.kind === 'batch' ? selection.sel : null
  const pickBatch = (s: BatchSel): void => onSelect({ kind: 'batch', sel: s })
  const [open, setOpen] = useState<Record<string, boolean>>({ Library: true, 'Advanced Definitions': true, cmClasses: true })
  const [renaming, setRenaming] = useState<{ kind: 'category' | 'class'; name: string } | null>(null)
  const [menu, setMenu] = useMenu()
  const toggle = (k: string): void => setOpen(o => ({ ...o, [k]: !o[k] }))
  const expand = (...keys: string[]): void => setOpen(o => ({ ...o, ...Object.fromEntries(keys.map(k => [k, true])) }))
  const is = (s: LibrarySelection): boolean => JSON.stringify(s) === JSON.stringify(selection)

  const newCategory = (parent: string | null): void => {
    const r = lib.getState().newCategory(parent)
    if (!alertResult(r)) return
    expand('cmClasses', ...(parent ? [`cat:${parent}`] : []))
    onSelect({ kind: 'category', name: r.value })
    setRenaming({ kind: 'category', name: r.value })
  }
  const dropOnCategory = (category: string) => (type: string, value: string): void => {
    if (type === DRAG_TEMPLATE) {
      const r = lib.getState().createClassFromTemplate(value, category)
      if (!alertResult(r)) return
      expand(`cat:${category}`)
      onSelect({ kind: 'class', name: r.value })
      setRenaming({ kind: 'class', name: r.value })
    } else if (type === DRAG_CLASS) alertResult(lib.getState().moveClass(value, category))
  }
  const commitRename = (next: string): void => {
    if (!renaming) return
    const r = renaming.kind === 'category' ? lib.getState().renameCategory(renaming.name, next) : lib.getState().renameClass(renaming.name, next)
    if (!alertResult(r)) return
    setRenaming(null)
    onSelect(renaming.kind === 'category' ? { kind: 'category', name: r.value } : { kind: 'class', name: r.value })
    if (renaming.kind === 'category') expand(`cat:${r.value}`)
  }
  const whatsThis = (key: string): void => window.alert(WHATS_THIS[key])

  const classMenu = (name: string, e: React.MouseEvent): void => setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
    { label: 'Explore', onClick: () => onSelect({ kind: 'class', name }) },
    { label: 'Open with Control Studio', onClick: () => openClassStudio(name) },
    { label: 'Add Control Module Class', disabled: NOT_MODELED },
    { label: 'Configure', disabled: NOT_MODELED },
    { label: 'Hide Internal Structure', disabled: NOT_MODELED },
    { label: 'Show Internal Structure', disabled: NOT_MODELED },
    sep,
    { label: 'References...', onClick: () => onSelect({ kind: 'class', name, view: 'references' }) },
    { label: 'History Collection...', disabled: NOT_MODELED },
    sep,
    { label: 'Print', disabled: NOT_MODELED }, { label: 'Export', disabled: NOT_MODELED },
    sep,
    { label: 'Cut', disabled: 'Drag the class onto another category to move it' }, { label: 'Copy', disabled: NOT_MODELED }, { label: 'Paste', disabled: NOT_MODELED },
    sep,
    { label: 'Delete', danger: true, onClick: () => { if (window.confirm(`Delete Control Module Class ${name}?`)) alertResult(lib.getState().deleteClass(name)) } },
    { label: 'Rename', onClick: () => setRenaming({ kind: 'class', name }) },
    sep,
    { label: "What's this?", onClick: () => whatsThis('class') },
    { label: 'Add ShortCut', disabled: NOT_MODELED },
    sep,
    { label: 'Properties', onClick: () => onSelect({ kind: 'class', name }) }
  ] })

  const categoryMenu = (name: string, e: React.MouseEvent): void => setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
    { label: 'Explore', onClick: () => onSelect({ kind: 'category', name }) },
    { label: 'New Category', onClick: () => newCategory(name) },
    sep,
    { label: 'Delete', danger: true, onClick: () => alertResult(lib.getState().deleteCategory(name)) },
    { label: 'Rename', onClick: () => setRenaming({ kind: 'category', name }) },
    sep,
    { label: "What's this?", onClick: () => whatsThis('category') },
    { label: 'Properties', onClick: () => onSelect({ kind: 'category', name }) }
  ] })

  const renderCategory = (cat: string, depth: number): JSX.Element => {
    const key = `cat:${cat}`
    const childCats = Object.values(categories).filter(c => c.parent === cat).map(c => c.name).sort()
    const childClasses = Object.values(classes).filter(c => c.category === cat).map(c => c.name).sort()
    return <Row key={cat} depth={depth} open={!!open[key]} onToggle={() => toggle(key)} selected={is({ kind: 'category', name: cat })}
      icon={<LibIcon kind="category" />} dataAttr={{ 'data-library-category': cat }}
      label={renaming?.kind === 'category' && renaming.name === cat ?
        <InlineName label="Category name" value={cat} onCommit={commitRename} onCancel={() => setRenaming(null)} /> : <span>{cat}</span>}
      onClick={() => onSelect({ kind: 'category', name: cat })}
      onContextMenu={e => { onSelect({ kind: 'category', name: cat }); categoryMenu(cat, e) }}
      drop={{ accepts: [DRAG_TEMPLATE, DRAG_CLASS], onDrop: dropOnCategory(cat) }}>
      {childCats.map(c => renderCategory(c, depth + 1))}
      {childClasses.map(name => <Row key={name} depth={depth + 1} selected={is({ kind: 'class', name })}
        icon={<LibIcon kind="class" />} dataAttr={{ 'data-library-class': name }}
        label={renaming?.kind === 'class' && renaming.name === name ?
          <InlineName label="Class name" value={name} onCommit={commitRename} onCancel={() => setRenaming(null)} /> : <span>{name}{drafts[name] ? ' *' : ''}</span>}
        sub="Control Module Class"
        drag={{ type: DRAG_CLASS, value: name }}
        onClick={() => onSelect({ kind: 'class', name })}
        onDoubleClick={() => openClassStudio(name)}
        onContextMenu={e => { onSelect({ kind: 'class', name }); classMenu(name, e) }} />)}
      <DeviceClassRows category={cat} depth={depth + 1} sel={batchSel} onSelect={pickBatch} />
    </Row>
  }

  const renderTemplates = (nodes: TemplateNode[], depth: number, path: string[]): JSX.Element[] => nodes.map(node => {
    const p = [...path, node.name]
    const key = `tpl:${p.join('/')}`
    if (node.kind === 'folder') return <Row key={key} depth={depth} open={!!open[key]} onToggle={() => toggle(key)}
      selected={is({ kind: 'folder', path: p })} icon={<LibIcon kind={path.length === 0 ? 'classes' : 'folder'} />} label={<span>{node.name}</span>}
      onClick={() => onSelect({ kind: 'folder', path: p })}>
      {renderTemplates(node.children ?? [], depth + 1, p)}
    </Row>
    return <Row key={key} depth={depth} selected={is({ kind: 'template', name: node.name, path: p })}
      icon={<LibIcon kind={node.kind === 'module-template' ? 'template' : 'fb'} />} label={<span>{node.name}</span>}
      sub={node.kind === 'module-template' && !node.modeled ? 'not modeled' : undefined}
      dataAttr={{ 'data-library-template': node.name }}
      drag={{ type: DRAG_TEMPLATE, value: node.name }}
      onClick={() => onSelect({ kind: 'template', name: node.name, path: p })}
      onContextMenu={e => { onSelect({ kind: 'template', name: node.name, path: p }); setMenu({ x: e.clientX, y: e.clientY, label: node.name, items: [
        { label: 'Explore', onClick: () => onSelect({ kind: 'template', name: node.name, path: p }) },
        { label: "What's this?", onClick: () => whatsThis('template') },
        { label: 'Properties', onClick: () => onSelect({ kind: 'template', name: node.name, path: p }) }
      ] }) }} />
  })

  const roots = Object.values(categories).filter(c => c.parent === null).map(c => c.name).sort((a, b) => a.localeCompare(b))
  return <div data-library="tree" onKeyDown={e => {
    if (e.key === 'F2' && selection?.kind === 'class') setRenaming({ kind: 'class', name: selection.name })
    if (e.key === 'F2' && selection?.kind === 'category') setRenaming({ kind: 'category', name: selection.name })
  }} tabIndex={-1}>
    <Row depth={depth} open={!!open.Library} onToggle={() => toggle('Library')} selected={is({ kind: 'library' })}
      icon={<DvIcon kind="library" />} label={<span>Library</span>} onClick={() => onSelect({ kind: 'library' })}
      onContextMenu={e => setMenu({ x: e.clientX, y: e.clientY, label: 'Library', items: [{ label: "What's this?", onClick: () => whatsThis('library') }] })}>
      {renderTemplates(LIBRARY_TEMPLATES, depth + 1, [])}
      <Row depth={depth + 1} open={!!open['Advanced Definitions']} onToggle={() => toggle('Advanced Definitions')} selected={is({ kind: 'advanced' })}
        icon={<LibIcon kind="advanced" />} label={<span>Advanced Definitions</span>} onClick={() => onSelect({ kind: 'advanced' })}>
        <EmClassTree depth={depth + 2} sel={batchSel} onSelect={pickBatch} />
        <Row depth={depth + 2} open={!!open.cmClasses} onToggle={() => toggle('cmClasses')} selected={is({ kind: 'cmClasses' })}
          icon={<LibIcon kind="classes" />} label={<span>Control Module Classes</span>} dataAttr={{ 'data-library-node': 'Control Module Classes' }}
          onClick={() => onSelect({ kind: 'cmClasses' })}
          onContextMenu={e => { onSelect({ kind: 'cmClasses' }); setMenu({ x: e.clientX, y: e.clientY, label: 'Control Module Classes', items: [
            { label: 'Explore', onClick: () => onSelect({ kind: 'cmClasses' }) },
            { label: 'New Category', onClick: () => newCategory(null) },
            sep,
            { label: 'Print', disabled: NOT_MODELED }, { label: 'Export', disabled: NOT_MODELED },
            sep,
            { label: "What's this?", onClick: () => whatsThis('cmClasses') }
          ] }) }}>
          {roots.map(c => renderCategory(c, depth + 3))}
        </Row>
        {aum && <>
          <BatchClassTree cls="pcell" depth={depth + 2} sel={batchSel} onSelect={pickBatch} />
          <BatchClassTree cls="unit" depth={depth + 2} sel={batchSel} onSelect={pickBatch} />
          <BatchClassTree cls="phase" depth={depth + 2} sel={batchSel} onSelect={pickBatch} />
        </>}
      </Row>
    </Row>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </div>
}

// ---------------------------------------------------------------------------
// Physical Network branch (controllers accept dropped Plant Areas)

export function PhysicalNetworkTree({ selection, onSelect, depth = 0, onWorkstation, workstationSelected = false }: {
  selection: LibrarySelection | null; onSelect: (s: LibrarySelection) => void; depth?: number
  /** ProfessionalPLUS workstation node (Licensing Properties). */
  onWorkstation?: () => void; workstationSelected?: boolean
}): JSX.Element {
  const controllers = useStore(s => s.hardware.controllers)
  const lib = useLibrary()
  const batch = useBatch()
  const { batch: batchOn } = useBatchEnabled()
  const [open, setOpen] = useState<Record<string, boolean>>({ network: true, ctlnet: true })
  const [menu, setMenu] = useMenu()
  const [downloading, setDownloading] = useState<string | null>(null)
  const toggle = (k: string): void => setOpen(o => ({ ...o, [k]: !o[k] }))
  const assignArea = (controller: string) => (_type: string, area: string): void => {
    const r = useLibrary.getState().assignArea(area, controller)
    if (alertResult(r)) { onSelect({ kind: 'controller', tag: controller }); setOpen(o => ({ ...o, [controller]: true })) }
  }
  const assignBatch = (controller: string) => (type: string, name: string): void => {
    const r = type === DRAG_PCELL ? useBatch.getState().assignCell(name, controller) : null
    if (type === DRAG_UNIT) { useBatchUi.getState().openDialog({ t: 'assignNode', unit: name, contained: true, controller }); return }
    if (r && alertResult(r)) { onSelect({ kind: 'controller', tag: controller }); setOpen(o => ({ ...o, [controller]: true })) }
  }
  const unitsOn = (tag: string): string[] => Object.entries(batch.unitAssignments).filter(([, c]) => c === tag).map(([u]) => u).sort()
  const pendingFor = (tag: string): boolean => Object.entries(lib.assignments).some(([t, c]) => c === tag && lib.instances[t] && downloadState(lib, t) !== 'current') ||
    unitsOn(tag).some(u => unitDownloadState(batch, u) !== 'current')
  const all = Object.values(controllers)
  const node = (c: Controller, d: number): JSX.Element => {
    const count = Object.values(lib.assignments).filter(x => x === c.tag).length
    return <Row key={c.tag} depth={d} open={!!open[c.tag]} onToggle={() => toggle(c.tag)}
      selected={selection?.kind === 'controller' && selection.tag === c.tag} icon={<DvIcon kind="controller" />}
      pending={pendingFor(c.tag) ? <span className="tv-pending" title="Download required">▲</span> : undefined}
      label={<span>{c.tag}</span>} sub={`${c.description} · ${controllerIsDown(c) ? 'not communicating' : 'commissioned'} · ${count} assigned module(s)`}
      dataAttr={{ 'data-controller': c.tag }}
      onClick={() => onSelect({ kind: 'controller', tag: c.tag })}
      drop={{ accepts: [DRAG_AREA, DRAG_PCELL, DRAG_UNIT], onDrop: (type, v) => (type === DRAG_AREA ? assignArea(c.tag)(type, v) : assignBatch(c.tag)(type, v)) }}
      onContextMenu={e => { onSelect({ kind: 'controller', tag: c.tag }); setMenu({ x: e.clientX, y: e.clientY, label: c.tag, items: [
        { label: 'Explore', onClick: () => onSelect({ kind: 'controller', tag: c.tag }) },
        { label: 'Download ▸ Controller...', onClick: () => setDownloading(c.tag), disabled: c.commissioned ? undefined : 'Commission the controller first' },
        { label: 'Upload', disabled: 'There is no need to perform an upload in this workshop' },
        sep,
        { label: "What's this?", onClick: () => window.alert(WHATS_THIS.controller) },
        { label: 'Properties', onClick: () => onSelect({ kind: 'controller', tag: c.tag }) }
      ] }) }}>
      <Row depth={d + 1} icon={<DvIcon kind="folder" />} label={<span>Assigned Modules</span>} sub={`${count} module(s)`}
        onClick={() => onSelect({ kind: 'controller', tag: c.tag })} />
      {unitsOn(c.tag).map(u => <Row key={u} depth={d + 1} icon={<BatchIcon kind="unit" />} label={<span>{u}</span>} sub="Assigned unit module"
        dataAttr={{ 'data-controller-unit': u }}
        pending={unitDownloadState(batch, u) !== 'current' ? <span className="tv-pending" title="Download required">▲</span> : undefined}
        onClick={() => onSelect({ kind: 'batch', sel: { t: 'unit', name: u } })} />)}
    </Row>
  }
  return <div data-library="network">
    <Row depth={depth} open={!!open.network} onToggle={() => toggle('network')} selected={selection?.kind === 'network'}
      icon={<DvIcon kind="network" />} label={<span>Physical Network</span>} onClick={() => onSelect({ kind: 'network' })}>
      <Row depth={depth + 1} open={!!open.decom} onToggle={all.some(c => !c.commissioned) ? () => toggle('decom') : undefined}
        selected={selection?.kind === 'decom'} icon={<DvIcon kind="decom" />} label={<span>Decommissioned Nodes</span>}
        onClick={() => onSelect({ kind: 'decom' })}>
        {all.filter(c => !c.commissioned).map(c => node(c, depth + 2))}
      </Row>
      <Row depth={depth + 1} open={!!open.ctlnet} onToggle={() => toggle('ctlnet')} selected={selection?.kind === 'ctlnet'}
        icon={<DvIcon kind="ctlnet" />} label={<span>Control Network</span>} onClick={() => onSelect({ kind: 'ctlnet' })}>
        {onWorkstation && <Row depth={depth + 2} selected={workstationSelected} icon={<DvIcon kind="workstation" />}
          open={batchOn ? open.proplus !== false : undefined} onToggle={batchOn ? () => setOpen(o => ({ ...o, proplus: o.proplus === false })) : undefined}
          label={<span>PROPLUS</span>} sub="ProfessionalPLUS workstation (simulated) — Licensing Properties" onClick={onWorkstation}
          dataAttr={{ 'data-workstation': 'PROPLUS' }}>
          {batchOn && ['Batch Executive', 'Batch Historian'].map(name => <Row key={name} depth={depth + 3} icon={<BatchIcon kind="subsystem" />} label={<span>{name}</span>}
            sub="Subsystem" dataAttr={{ 'data-subsystem': name }} selected={selection?.kind === 'batch' && selection.sel.t === 'subsystem' && selection.sel.name === name}
            onClick={() => onSelect({ kind: 'batch', sel: { t: 'subsystem', name } })} />)}
        </Row>}
        {all.filter(c => c.commissioned).map(c => node(c, depth + 2))}
      </Row>
    </Row>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    {downloading && <ControllerDownloadDialog controller={downloading} onClose={() => setDownloading(null)} />}
  </div>
}
const STATE_LABEL: Record<DownloadState, string> = {
  unassigned: 'Not assigned', 'not-downloaded': 'Not downloaded', pending: 'Download pending', current: 'Downloaded'
}

export function ControllerDownloadDialog({ controller, tag, onClose }: { controller: string; tag?: string; onClose: () => void }): JSX.Element {
  const lib = useLibrary()
  const [report, setReport] = useState<DownloadReport | null>(null)
  const tags = tag ? [tag] : Object.entries(lib.assignments).filter(([, c]) => c === controller).map(([t]) => t).sort()
  const go = (): void => {
    const r = tag ? lib.downloadModule(tag) : lib.downloadController(controller)
    if (alertResult(r)) setReport(r.value)
  }
  return <SimulatorDialog className="module-download-dialog lib-download-dialog" label={tag ? `Download ${tag}` : `Download Controller ${controller}`} onClose={onClose}>
    {!report ? <>
      <p>{tag ? `Download ${tag} to ${controller}?` : `Download the configuration of controller ${controller}? The following modules are assigned to it:`}</p>
      <div className="lib-download-list">
        {tags.length ? tags.map(t => <div key={t}><b>{t}</b> <span className="exp-sub">{lib.instances[t] ? STATE_LABEL[downloadState(lib, t)] : 'Configured'}</span></div>) :
          <i>No modules are assigned. Drag a Plant Area onto {controller} first.</i>}
      </div>
      <div className="traditional-channel-form">
        <button className="tbtn sm" onClick={go}>Download</button>
        <button className="tbtn sm" onClick={onClose}>Cancel</button>
      </div>
    </> : <>
      <p role="status">Download of {report.target} completed: {report.downloaded.length} module(s). No upload is needed.</p>
      {report.warnings.length ? <ul className="lib-download-warnings">{report.warnings.map(w => <li key={w}>⚠ {w}</li>)}</ul> : <p>No warnings.</p>}
      <div className="traditional-channel-form"><button className="tbtn sm" onClick={onClose}>OK</button></div>
    </>}
  </SimulatorDialog>
}

// ---------------------------------------------------------------------------
// Right-hand "Contents of" pane for library / network selections

export interface ContentsRow {
  key: string; icon: ReactNode; name: string; type: string
  drag?: { type: string; value: string }; onOpen?: () => void; onClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void
  data?: Record<string, string>; selected?: boolean
}

/** Right-hand "Contents of" pane in Details view: Name / Type columns, as in Exploring DeltaV. */
export function ContentsList({ rows, empty, extraColumn }: { rows: ContentsRow[]; empty?: ReactNode; extraColumn?: { title: string; value: (r: ContentsRow) => ReactNode } }): JSX.Element {
  return <table className="dvx-details" role="grid">
    <thead><tr><th>Name</th><th>Type</th>{extraColumn && <th>{extraColumn.title}</th>}</tr></thead>
    <tbody>
      {rows.map(r => <tr key={r.key} className={r.selected ? 'sel' : undefined} draggable={!!r.drag} {...r.data}
        onDragStart={r.drag ? e => { e.dataTransfer.setData(r.drag!.type, r.drag!.value); e.dataTransfer.setData('text/plain', r.drag!.value) } : undefined}
        onClick={r.onClick} onDoubleClick={r.onOpen} onContextMenu={r.onContextMenu ? e => { e.preventDefault(); r.onContextMenu!(e) } : undefined}>
        <td><span className="dvx-name">{r.icon}<span>{r.name}</span></span></td><td>{r.type}</td>
        {extraColumn && <td>{extraColumn.value(r)}</td>}
      </tr>)}
      {!rows.length && empty && <tr><td colSpan={extraColumn ? 3 : 2} className="dvx-empty">{empty}</td></tr>}
    </tbody>
  </table>
}

export function LibraryDetail({ selection, onSelect }: { selection: LibrarySelection; onSelect: (s: LibrarySelection) => void }): JSX.Element {
  const lib = useLibrary()
  const main = useStore()
  const batch = useBatch()
  const { aum } = useBatchEnabled()
  const openClassStudio = useUi(s => s.openClassStudio)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [menu, setMenu] = useMenu()
  const pane = (body: ReactNode, actions?: ReactNode, notes?: ReactNode): JSX.Element => <div className="dvx-contents">
    {actions && <div className="dvx-actions">{actions}</div>}{body}{notes}</div>
  const tplType = (n: TemplateNode): string => n.kind === 'folder' ? 'Folder' : n.kind === 'module-template' ? 'Module Template' : n.kind === 'composite-template' ? 'Composite Template' : 'Function Block Template'

  switch (selection.kind) {
    case 'batch':
      return <BatchDetail sel={selection.sel} onSelect={s => onSelect({ kind: 'batch', sel: s })} />
    case 'library':
      return pane(<ContentsList rows={[
        ...LIBRARY_TEMPLATES.map(n => ({ key: n.name, icon: <LibIcon kind="classes" />, name: n.name, type: 'Templates', onOpen: () => onSelect({ kind: 'folder', path: [n.name] }) })),
        { key: 'adv', icon: <LibIcon kind="advanced" />, name: 'Advanced Definitions', type: 'Advanced Definitions', onOpen: () => onSelect({ kind: 'advanced' }) }
      ]} />)
    case 'folder': {
      let nodes: TemplateNode[] = LIBRARY_TEMPLATES
      for (const name of selection.path) nodes = nodes.find(n => n.name === name)?.children ?? []
      return pane(<ContentsList rows={nodes.map(n => ({ key: n.name, icon: <LibIcon kind={n.kind === 'folder' ? 'folder' : n.kind === 'module-template' ? 'template' : 'fb'} />,
        name: n.name, type: tplType(n), data: n.kind === 'folder' ? undefined : { 'data-contents-template': n.name },
        drag: n.kind === 'folder' ? undefined : { type: DRAG_TEMPLATE, value: n.name },
        onOpen: n.kind === 'folder' ? () => onSelect({ kind: 'folder', path: [...selection.path, n.name] }) : () => onSelect({ kind: 'template', name: n.name, path: [...selection.path, n.name] }) }))} />)
    }
    case 'template': {
      const node = findTemplate(selection.name)?.node
      const io = templateIoNote(selection.name)
      return pane(<table className="exp-props-table"><tbody>
        <tr><td className="k">Path</td><td className="v">Library/{selection.path.join('/')}</td></tr>
        <tr><td className="k">Type</td><td className="v">{selection.path[0] === 'ModuleTemplates' ? 'Module Template' : selection.path[0] === 'CompositeTemplates' ? 'Composite Template' : 'Function Block Template'}</td></tr>
        {node?.description && <tr><td className="k">Description</td><td className="v">{node.description}</td></tr>}
        {io && <tr><td className="k">I/O (-XY suffix)</td><td className="v">{io}</td></tr>}
        <tr><td className="k">Use</td><td className="v">{selection.name === 'ANALOG' ? 'Drag onto a Control Module Class Category to create a Control Module Class (one AI1 block, HI/LO alarms).' :
          'Reference only in BatchLiveTrainer — Chapter 1 drags ModuleTemplates/Monitoring/ANALOG; the Chapter 5 valve and motor classes (NC_VALVE, 2STAGE_VALVE, AGIT_MTR, OUT_PMP) are provided in Control Module Classes.'}</td></tr>
      </tbody></table>)
    }
    case 'advanced':
      return pane(<ContentsList rows={[
        { key: 'em', icon: <LibIcon kind="classes" />, name: 'Equipment Module Classes', type: 'Equipment Module Classes', onOpen: () => onSelect({ kind: 'emClasses' }) },
        { key: 'cm', icon: <LibIcon kind="classes" />, name: 'Control Module Classes', type: 'Control Module Classes', onOpen: () => onSelect({ kind: 'cmClasses' }) },
        ...(aum ? (['pcell', 'unit', 'phase'] as const).map(cls => ({ key: cls, icon: <BatchIcon kind={cls === 'pcell' ? 'pcellClass' : cls === 'unit' ? 'unitClass' : 'phaseClass'} />,
          name: ROOT_LABEL[cls], type: ROOT_LABEL[cls], onOpen: () => onSelect({ kind: 'batch', sel: { t: 'root', cls } }) })) : [])
      ]} />)
    case 'emClasses':
      return <EmDetail sel={{ t: 'emRoot' }} onSelect={s => onSelect({ kind: 'batch', sel: s })} />
    case 'cmClasses':
      return pane(<ContentsList rows={Object.values(lib.categories).filter(c => c.parent === null).sort((a, b) => a.name.localeCompare(b.name))
        .map(c => ({ key: c.name, icon: <LibIcon kind="category" />, name: c.name, type: 'Control Module Class Category', onOpen: () => onSelect({ kind: 'category', name: c.name }) }))} />)
    case 'category': {
      const cats = Object.values(lib.categories).filter(c => c.parent === selection.name)
      const cls = Object.values(lib.classes).filter(c => c.category === selection.name)
      return pane(<ContentsList rows={[
        ...cats.map(c => ({ key: c.name, icon: <LibIcon kind="category" />, name: c.name, type: 'Control Module Class Category', onOpen: () => onSelect({ kind: 'category', name: c.name }) })),
        ...cls.map(c => ({ key: c.name, icon: <LibIcon kind="class" />, name: c.name, type: 'Control Module Class', data: { 'data-contents-class': c.name },
          drag: { type: DRAG_CLASS, value: c.name }, onClick: () => onSelect({ kind: 'class', name: c.name }), onOpen: () => openClassStudio(c.name) })),
        ...Object.values(CM_DEVICE_CLASSES).filter(c => c.category === selection.name).map(c => ({ key: `d${c.name}`, icon: <LibIcon kind="class" />, name: c.name,
          type: `Control Module Class (${c.template})`, drag: { type: DRAG_CM_DEVICE, value: c.name }, onOpen: () => onSelect({ kind: 'batch', sel: { t: 'cmDevice', name: c.name } }) }))
      ]} empty={`Empty. Drag Library ▸ ModuleTemplates ▸ Monitoring ▸ ANALOG onto ${selection.name} to create a class.`} />)
    }
    case 'class': {
      const cls = lib.classes[selection.name]
      if (!cls) return <div className="exp-empty">Class not found.</div>
      const users = Object.values(lib.instances).filter(i => i.className === cls.name)
      const d = cls.definition
      return pane(<>
        <ContentsList rows={configurableParams(d).map(p => ({ key: p.path, icon: <LibIcon kind="param" />, name: p.name, type: PARAM_TYPE_LABEL[p.def.type] }))}
          extraColumn={{ title: 'Default value', value: r => formatParamValue(getParam(d, r.key)!) }} />
        <div className="exp-props-alarms" data-references={cls.name}>
          <div className="exp-props-subhead">References — modules created from {cls.name} (revision {cls.revision}{lib.drafts[cls.name] ? ', unsaved changes in Control Studio' : ''})</div>
          <ContentsList rows={users.map(i => ({ key: i.tag, icon: <ModuleIcon kind="control" size={16} />, name: i.tag, type: `Control Module (${i.area})` }))}
            empty="No modules use this class yet. Drag it onto a Plant Area." />
        </div>
      </>, <button className="tbtn sm" onClick={() => openClassStudio(cls.name)}>Open with Control Studio</button>)
    }
    case 'network':
      return pane(<ContentsList rows={[
        { key: 'decom', icon: <DvIcon kind="decom" />, name: 'Decommissioned Nodes', type: 'Decommissioned Nodes', onOpen: () => onSelect({ kind: 'decom' }) },
        { key: 'ctl', icon: <DvIcon kind="ctlnet" />, name: 'Control Network', type: 'Control Network', onOpen: () => onSelect({ kind: 'ctlnet' }) }
      ]} />)
    case 'decom': case 'ctlnet':
      return pane(<ContentsList rows={Object.values(main.hardware.controllers).filter(c => c.commissioned === (selection.kind === 'ctlnet'))
        .map(c => ({ key: c.tag, icon: <DvIcon kind="controller" />, name: c.tag, type: 'Controller', onOpen: () => onSelect({ kind: 'controller', tag: c.tag }) }))}
        empty="No nodes." />)
    case 'controller': {
      const c = main.hardware.controllers[selection.tag]
      if (!c) return <div className="exp-empty">Controller not found.</div>
      const tags = Object.entries(lib.assignments).filter(([, x]) => x === c.tag).map(([t]) => t).sort()
      const unitTags = Object.entries(batch.unitAssignments).filter(([, x]) => x === c.tag).map(([u]) => u).sort()
      return pane(<ContentsList rows={[...unitTags.map(u => ({ key: `unit:${u}`, icon: <BatchIcon kind="unit" />, name: u, data: { 'data-assigned-unit': u },
          type: `Unit Module (${batch.units[u]?.unitClass ?? ''})`, onOpen: () => onSelect({ kind: 'batch', sel: { t: 'unit', name: u } }) })),
        ...tags.map(t => { const emi = useEm.getState().instances[t]; const cmi = useEm.getState().cmInstances[t]; return { key: t, icon: <ModuleIcon kind={emi ? 'equipment' : 'control'} size={16} />, name: t, data: { 'data-assigned': t },
        type: emi ? `Equipment Module (${emi.className})` : lib.instances[t] ? `Control Module (${lib.instances[t].className})` : cmi ? `Control Module (${cmi.className})` : lib.sims[t] ? 'Control Module (simulation)' : 'Control Module',
        onContextMenu: (e: React.MouseEvent) => setMenu({ x: e.clientX, y: e.clientY, label: t, items: [
          { label: 'Delete Assignment', danger: true, onClick: () => { if (window.confirm(`Delete the assignment of ${t} to ${c.tag}?`)) { const r = useBatch.getState().unassignModule(t); if (!r.ok) window.alert(r.error) } } },
          sep, { label: 'Properties', onClick: () => window.alert(`${t}\nAssigned to ${c.tag}`) }
        ] }) } })]}
        extraColumn={{ title: 'Download', value: r => r.key.startsWith('unit:') ? STATE_LABEL[unitDownloadState(batch, r.key.slice(5))] : lib.instances[r.key] ? STATE_LABEL[downloadState(lib, r.key)] : 'Downloaded' }}
        empty={`No modules assigned. Drag a Plant Area (for example ED_CENTER_BATCH) onto ${c.tag}.`} />,
      <button className="tbtn sm" onClick={() => setDownloading(c.tag)}>Download Controller...</button>,
      <>{lib.lastDownload && <div className="exp-props-alarms">
          <div className="exp-props-subhead">Last download: {lib.lastDownload.target}</div>
          {lib.lastDownload.warnings.length ? lib.lastDownload.warnings.map(w => <div key={w} className="exp-hint">⚠ {w}</div>) : <div className="exp-hint">No warnings.</div>}
        </div>}
        {downloading && <ControllerDownloadDialog controller={c.tag} onClose={() => setDownloading(null)} />}
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}</>)
    }
    case 'sim': {
      const sim = lib.sims[selection.tag]
      if (!sim) return <div className="exp-empty">Module not found.</div>
      return pane(<ContentsList rows={Object.entries(sim.params).map(([name]) => ({ key: name, icon: <LibIcon kind="param" />, name, type: 'Floating point with status' }))}
        extraColumn={{ title: 'Value', value: r => lib.process ? `${fmt(lib.process[sim.params[r.key]], 1)} gal` : '—' }} />,
      <button className="tbtn sm" onClick={() => useUi.getState().navigate('process')}>Open Process display</button>,
      <p className="exp-hint">{sim.description}. Reference these values from an External Reference parameter as {sim.tag}/PARAMETER.</p>)
    }
  }
}
// ---------------------------------------------------------------------------
// Class-based module ("Contents of 'LI-104'", pp 1-22 / 1-23)

export function InstanceContents({ tag }: { tag: string }): JSX.Element {
  const lib = useLibrary()
  const module = useStore(s => s.modules[tag])
  const openClassStudio = useUi(s => s.openClassStudio)
  const openFaceplate = useUi(s => s.openFaceplate)
  const openModuleDisplay = useUi(s => s.openModuleDisplay)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useMenu()
  const [downloading, setDownloading] = useState(false)
  const inst = lib.instances[tag]
  const cls = inst && lib.classes[inst.className]
  if (!inst || !cls) return <div className="exp-empty">{tag} is not a class-based module.</div>
  const rows = instanceContents(tag)
  const state = downloadState(lib, tag)
  const controller = lib.assignments[tag]
  const def = editing ? getParam(cls.definition, editing) : undefined

  const rowMenu = (path: string, name: string) => (e: React.MouseEvent): void => { setSelected(path); setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
    { label: 'Explore', disabled: 'Parameters have no contents' },
    sep, { label: 'Print', disabled: NOT_MODELED }, { label: 'Export', disabled: NOT_MODELED },
    sep, { label: 'Cut', disabled: NOT_MODELED }, { label: 'Copy', disabled: NOT_MODELED }, { label: 'Paste', disabled: NOT_MODELED },
    sep, { label: 'Delete', disabled: 'Class parameters cannot be deleted from an instance' }, { label: 'Rename', disabled: 'Class parameters cannot be renamed on an instance' },
    sep, { label: "What's this?", onClick: () => window.alert('Only parameters whose class property "Allow instance value to be configured" is checked (and external references) appear here. Open Properties and uncheck "Use default value from library object" to give this module its own value.') },
    sep, { label: 'Properties', onClick: () => setEditing(path) }
  ] }) }

  return <div className="dvx-contents" data-instance={tag}>
    <div className="dvx-actions">
      <button className="tbtn sm" onClick={() => openClassStudio(cls.name, tag)}>Open with Control Studio</button>
      <button className="tbtn sm" onClick={() => openFaceplate(tag)}>Faceplate</button>
      <button className="tbtn sm" disabled={!controller} onClick={() => setDownloading(true)}>Download...</button>
      <button className="tbtn sm" disabled={!module?.primaryDisplay} onClick={() => openModuleDisplay(tag, 'primary')}>Primary display</button>
    </div>
    <ContentsList rows={rows.map(r => ({ key: r.path, icon: <LibIcon kind="param" />, name: r.name, type: PARAM_TYPE_LABEL[getParam(cls.definition, r.path)!.type],
      data: { 'data-param': r.name, 'aria-selected': String(selected === r.path) }, selected: selected === r.path,
      onClick: () => setSelected(r.path), onOpen: () => setEditing(r.path), onContextMenu: rowMenu(r.path, r.name) }))}
      extraColumn={{ title: 'Value', value: r => { const row = rows.find(x => x.path === r.key)!
        return <span className={row.overridden ? 'dvx-override' : undefined}>{formatParamValue(getParam(cls.definition, row.path)!, row.value as ParamValue)}{row.overridden ? '' : ' (default)'}</span> } }} />
    <table className="exp-props-table lib-instance-summary"><tbody>
      <tr><td className="k">Class</td><td className="v">{cls.name} ({inst.area})</td></tr>
      <tr><td className="k">Controller</td><td className="v">{controller ?? 'Not assigned — drag the area onto a controller'}</td></tr>
      <tr><td className="k">Download state</td><td className="v" data-download-state={state}>{STATE_LABEL[state]}</td></tr>
      <tr><td className="k">PV</td><td className="v">{module?.type === 'AI' ? `${module.pvBad ? 'Bad' : fmt(module.pv, module.decimals)} ${module.unit}` : '—'}</td></tr>
      <tr><td className="k">Status</td><td className="v">{module?.type === 'AI' ? module.statusText : ''}</td></tr>
    </tbody></table>    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    {editing && def && <LibraryParamDialog key={editing} title={editing.replace('/', '$')} name={editing.replace('/', '$')} def={def} mode="instance"
      value={editing in inst.overrides ? inst.overrides[editing] : def.value} classValue={def.value} flag={!(editing in inst.overrides)}
      onOk={r => { const res = useLibrary.getState().setOverride(tag, editing, r.flag ? null : r.value); return res.ok ? null : res.error }}
      onClose={() => setEditing(null)} />}
    {downloading && controller && <ControllerDownloadDialog controller={controller} tag={tag} onClose={() => setDownloading(false)} />}
  </div>
}

/** Explorer rows for the DV_School simulation modules (TANKSIM, LEV500-SIM, LEV600-SIM) in an area. */
export function SimRows({ area, selected, onSelect, depth = 0 }: { area: string; selected: string | null; onSelect: (tag: string) => void; depth?: number }): JSX.Element {
  const sims = useLibrary(s => s.sims)
  const process = useLibrary(s => s.process)
  return <>{Object.values(sims).filter(s => s.area === area).map(sim => <TreeRow key={sim.tag} depth={depth} selected={selected === sim.tag}
    icon={<ModuleIcon kind="control" size={16} />} label={<span>{sim.tag}</span>} dataAttr={{ 'data-sim-module': sim.tag }}
    sub={`${sim.description}${process ? ' — ' + Object.entries(sim.params).map(([n, f]) => `${n} ${fmt(process[f], 0)}`).join(' · ') : ''}`}
    onClick={() => onSelect(sim.tag)} />)}</>
}
/** Drag/drop behaviour for a Plant Area row: accepts dropped classes, can itself be dragged to a controller. */
export function areaDragProps(area: string, onCreated: (tag: string) => void): Record<string, unknown> {
  return {
    draggable: true,
    'data-area': area,
    onDragStart: (e: DragEvent) => { e.dataTransfer.setData(DRAG_AREA, area); e.dataTransfer.setData('text/plain', area); e.dataTransfer.effectAllowed = 'copyMove' },
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG_CLASS)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_CLASS)) return
      e.preventDefault()
      const r = useLibrary.getState().createInstance(e.dataTransfer.getData(DRAG_CLASS), area)
      if (alertResult(r)) onCreated(r.value)
    }
  }
}

export function instanceMenuItems(tag: string, actions: { rename: () => void; select: (s: LibrarySelection) => void; download: () => void }): MenuItem[] {
  const lib = useLibrary.getState()
  const inst = lib.instances[tag]
  const ui = useUi.getState()
  const controllers = Object.keys(useStore.getState().hardware.controllers)
  return [
    { label: 'Open ▸ Control Studio', onClick: () => ui.openClassStudio(inst.className, tag) },
    { label: 'Open ▸ Faceplate', onClick: () => ui.openFaceplate(tag) },
    { label: 'Open ▸ Primary Display', onClick: () => ui.openModuleDisplay(tag, 'primary') },
    { label: 'Configure ▸', disabled: NOT_MODELED },
    { label: 'Convert to classless ▸', disabled: NOT_MODELED },
    sep,
    { label: 'References...', onClick: () => actions.select({ kind: 'class', name: inst.className, view: 'references' }) },
    { label: 'History Collection...', disabled: NOT_MODELED },
    { label: 'System Alarm Management', disabled: NOT_MODELED },
    { label: 'Tune', disabled: NOT_MODELED },
    { label: 'Advanced Control ▸', disabled: NOT_MODELED },
    { label: 'Configure I/O', disabled: NOT_MODELED },
    { label: 'Filtered Parameter List', disabled: NOT_MODELED },
    { label: 'Download ▸ Control Module...', onClick: actions.download, disabled: lib.assignments[tag] ? undefined : 'Assign the module to a controller first' },
    ...controllers.map(c => ({ label: `Assign ▸ ${c}`, onClick: () => alertResult(useLibrary.getState().assignModule(tag, c)) })),
    sep,
    { label: 'Print', disabled: NOT_MODELED }, { label: 'Export', disabled: NOT_MODELED },
    sep,
    { label: 'Cut', disabled: NOT_MODELED }, { label: 'Copy', disabled: NOT_MODELED }, { label: 'Paste', disabled: NOT_MODELED },
    sep,
    { label: 'Delete', danger: true, onClick: () => { if (window.confirm(`Delete ${tag}?`)) alertResult(useLibrary.getState().deleteInstance(tag)) } },
    { label: 'Rename', onClick: actions.rename },
    sep,
    { label: "What's this?", onClick: () => window.alert(WHATS_THIS.instance) },
    { label: 'Add ShortCut', disabled: NOT_MODELED },
    sep,
    { label: 'Properties', onClick: () => ui.select(tag) }
  ]
}
