import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../engine/store'
import { useLibrary } from '../engine/libraryStore'
import { useUi } from '../ui/uiStore'
import { useBatchUi } from '../ui/batchUi'
import { useBatch } from '../engine/batchStore'
import { CM_DEVICE_CLASSES, EM_ALGORITHM_NOTE, EM_PARAMS, emDisplay, emDownloadState, stateName, useEm } from '../engine/emStore'
import { TreeRow, ContextMenu, ContentsList, alertResult } from './LibraryExplorer'
import { BatchIcon, DRAG_CM_DEVICE, DRAG_EM_CLASS, DRAG_MODULE, type BatchSel } from './BatchExplorer'
import { ModuleIcon } from './EngineeringIcons'

// DeltaV Explorer for Course 7016 Chapter 5: Library ▸ Advanced Definitions ▸ Equipment Module
// Classes (categories, command- and state-driven classes and their module blocks), the provided
// Control Module Classes, and the module instances a unit class creates under each unit module.

type MenuItem = { label: string; onClick?: () => void; disabled?: string; separator?: boolean; danger?: boolean }
type Menu = { x: number; y: number; label: string; items: MenuItem[] }
const sep: MenuItem = { label: '', separator: true }
const same = (a: BatchSel | null, b: BatchSel): boolean => !!a && JSON.stringify(a) === JSON.stringify(b)

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

export function InlineName({ value, onCommit, onCancel, label }: { value: string; onCommit: (v: string) => void; onCancel: () => void; label: string }): JSX.Element {
  const [text, setText] = useState(value)
  return <input aria-label={label} className="exp-area-editor" autoFocus value={text}
    onFocus={e => e.target.select()} onClick={e => e.stopPropagation()} onChange={e => setText(e.target.value)} onBlur={() => onCommit(text)}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); onCommit(text) } else if (e.key === 'Escape') { e.preventDefault(); onCancel() } }} />
}

/** Library ▸ Advanced Definitions ▸ Equipment Module Classes. */
export function EmClassTree({ depth, sel, onSelect }: { depth: number; sel: BatchSel | null; onSelect: (s: BatchSel) => void }): JSX.Element {
  const em = useEm()
  const ui = useBatchUi()
  const openEmStudio = useUi(s => s.openEmStudio)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useMenu()
  const toggle = (k: string): void => setOpen(o => ({ ...o, [k]: !o[k] }))
  const r = ui.renaming
  const commit = (next: string): void => {
    if (!r) return
    if (r.kind === 'emCat') { const res = em.renameCategory(r.name, next); if (!alertResult(res)) return; ui.setRenaming(null); onSelect({ t: 'emCat', name: res.value }) }
    else if (r.kind === 'emClass') { const res = em.renameClass(r.name, next); if (!alertResult(res)) return; ui.setRenaming(null); onSelect({ t: 'emClass', name: res.value }) }
    else if (r.kind === 'emBlock') { const res = em.renameChild(r.cls, r.name, next); if (!alertResult(res)) return; ui.setRenaming(null) }
  }
  const cancel = (): void => ui.setRenaming(null)
  const newCategory = (parent: string | null): void => {
    const res = em.newCategory(parent)
    if (!alertResult(res)) return
    setOpen(o => ({ ...o, root: true, ...(parent ? { [`cat:${parent}`]: true } : {}) }))
    onSelect({ t: 'emCat', name: res.value })
    ui.setRenaming({ kind: 'emCat', name: res.value })
  }
  const classMenu = (name: string, e: React.MouseEvent): void => {
    onSelect({ t: 'emClass', name })
    setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
      { label: 'Explore', onClick: () => onSelect({ t: 'emClass', name }) },
      { label: 'Open with Control Studio', onClick: () => openEmStudio(name) },
      { label: 'Add Control Module Class...', onClick: () => window.alert('Drag a Control Module Class (Control Module Classes ▸ NC_Valves ▸ 2STAGE_VALVE or NC_VALVE) onto the equipment module class.') },
      sep,
      { label: 'References...', onClick: () => onSelect({ t: 'emClass', name }) },
      sep,
      { label: 'Delete', danger: true, onClick: () => { if (window.confirm(`Delete ${name}?`)) alertResult(em.deleteClass(name)) } },
      { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'emClass', name }) },
      sep,
      { label: "What's this?", onClick: () => window.alert('Equipment Module Class — common properties for a type of equipment module. It can contain control modules derived from control module classes.') },
      { label: 'Properties', onClick: () => ui.openDialog({ t: 'emProps', cls: name }) }
    ] })
  }
  const renderCat = (cat: string, d: number): JSX.Element => {
    const key = `cat:${cat}`
    const kids = Object.values(em.categories).filter(c => c.parent === cat).map(c => c.name).sort()
    const members = Object.values(em.classes).filter(c => c.category === cat).map(c => c.name).sort()
    return <TreeRow key={cat} depth={d} open={!!open[key]} onToggle={() => toggle(key)} selected={same(sel, { t: 'emCat', name: cat })}
      icon={<BatchIcon kind="folder" />} dataAttr={{ 'data-em-cat': cat }}
      label={r?.kind === 'emCat' && r.name === cat ? <InlineName label="Category name" value={cat} onCommit={commit} onCancel={cancel} /> : <span>{cat}</span>}
      onClick={() => onSelect({ t: 'emCat', name: cat })}
      onContextMenu={e => { onSelect({ t: 'emCat', name: cat }); setMenu({ x: e.clientX, y: e.clientY, label: cat, items: [
        { label: 'Explore', onClick: () => onSelect({ t: 'emCat', name: cat }) },
        { label: 'New Equipment Module Class', onClick: () => { setOpen(o => ({ ...o, [key]: true })); ui.openDialog({ t: 'newEmClass', category: cat }) } },
        { label: 'New Category', onClick: () => newCategory(cat) },
        sep,
        { label: 'Delete', danger: true, onClick: () => alertResult(em.deleteCategory(cat)) },
        { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'emCat', name: cat }) },
        sep,
        { label: "What's this?", onClick: () => window.alert('Equipment Module Class Categories are organizational groupings of equipment module classes. Categories do not influence your control strategy in any way.') }
      ] }) }}>
      {kids.map(k => renderCat(k, d + 1))}
      {members.map(name => {
        const ck = `class:${name}`
        const cls = em.drafts[name] ?? em.classes[name]
        const blocks = Object.values(cls.children)
        return <TreeRow key={name} depth={d + 1} open={!!open[ck]} onToggle={blocks.length ? () => toggle(ck) : undefined}
          selected={same(sel, { t: 'emClass', name })} icon={<ModuleIcon kind="equipment" size={16} />} dataAttr={{ 'data-em-class': name }}
          label={r?.kind === 'emClass' && r.name === name ? <InlineName label="Class name" value={name} onCommit={commit} onCancel={cancel} /> : <span>{name}{em.drafts[name] ? ' *' : ''}</span>}
          sub={`Equipment Module Class · ${cls.algorithm}`}
          drag={{ type: DRAG_EM_CLASS, value: name }}
          drop={{ accepts: [DRAG_CM_DEVICE], onDrop: (_t, v) => {
            const res = em.addChild(name, v)
            if (!alertResult(res)) return
            setOpen(o => ({ ...o, [ck]: true }))
            ui.setRenaming({ kind: 'emBlock', cls: name, name: res.value })
          } }}
          onClick={() => onSelect({ t: 'emClass', name })}
          onDoubleClick={() => openEmStudio(name)}
          onContextMenu={e => classMenu(name, e)}>
          {blocks.map(b => <TreeRow key={b.name} depth={d + 2} icon={<ModuleIcon kind="control" size={16} />} dataAttr={{ 'data-em-block': `${name}/${b.name}` }}
            label={r?.kind === 'emBlock' && r.cls === name && r.name === b.name ? <InlineName label="Module block name" value={b.name} onCommit={commit} onCancel={cancel} /> : <span>{b.name}</span>}
            sub={`Module block (${b.className})`}
            onContextMenu={e => setMenu({ x: e.clientX, y: e.clientY, label: b.name, items: [
              { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'emBlock', cls: name, name: b.name }) },
              { label: 'Delete', danger: true, onClick: () => { if (window.confirm(`Delete module block ${b.name}?`)) alertResult(em.removeChild(name, b.name)) } },
              sep,
              { label: 'Properties', onClick: () => window.alert(`${b.name}: embedded control module of class ${b.className}. Each equipment module instance creates its own ${b.className} module for it.`) }
            ] })} />)}
        </TreeRow>
      })}
    </TreeRow>
  }
  return <div data-library="em-classes">
    <TreeRow depth={depth} open={!!open.root} onToggle={() => toggle('root')} selected={same(sel, { t: 'emRoot' })}
      icon={<ModuleIcon kind="equipment" size={16} />} label={<span>Equipment Module Classes</span>} dataAttr={{ 'data-em-root': '' }}
      onClick={() => onSelect({ t: 'emRoot' })}
      onContextMenu={e => { onSelect({ t: 'emRoot' }); setMenu({ x: e.clientX, y: e.clientY, label: 'Equipment Module Classes', items: [
        { label: 'Explore', onClick: () => onSelect({ t: 'emRoot' }) },
        { label: 'New Category', onClick: () => newCategory(null) },
        sep,
        { label: "What's this?", onClick: () => window.alert('Equipment Module Classes — right-click to create a New Category, then right-click the category to create a New Equipment Module Class.') }
      ] }) }}>
      {Object.values(em.categories).filter(c => c.parent === null).map(c => c.name).sort().map(c => renderCat(c, depth + 1))}
    </TreeRow>
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </div>
}

/** Rows for the provided Control Module Classes in a Control Module Class category (draggable onto EM and unit classes). */
export function DeviceClassRows({ category, depth, sel, onSelect }: { category: string; depth: number; sel: BatchSel | null; onSelect: (s: BatchSel) => void }): JSX.Element {
  return <>{Object.values(CM_DEVICE_CLASSES).filter(c => c.category === category).map(c => <TreeRow key={c.name} depth={depth}
    selected={same(sel, { t: 'cmDevice', name: c.name })} icon={<ModuleIcon kind="control" size={16} />} dataAttr={{ 'data-cm-device': c.name }}
    label={<span>{c.name}</span>} sub="Control Module Class" drag={{ type: DRAG_CM_DEVICE, value: c.name }}
    onClick={() => onSelect({ t: 'cmDevice', name: c.name })} />)}</>
}

/** Module instances under a unit module: "AGIT-503 (AGITATOR)", equipment modules with their module blocks (p5-34). */
export function ModuleInstanceRows({ unit, depth, sel, onSelect }: { unit: string; depth: number; sel: BatchSel | null; onSelect: (s: BatchSel) => void }): JSX.Element {
  const em = useEm()
  const b = useBatch()
  const lib = useLibrary()
  const modules = useStore(s => s.modules)
  const ui = useBatchUi()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useMenu()
  const u = b.units[unit]
  if (!u) return <></>
  const blocks = u.blocks ?? {}
  const commit = (next: string): void => {
    const r = ui.renaming
    if (r?.kind !== 'module') return
    const res = b.renameCourseModule(r.name, next)
    if (!alertResult(res)) return
    ui.setRenaming(null)
  }
  const moduleMenu = (tag: string, isEm: boolean, e: React.MouseEvent): void => {
    e.preventDefault()
    if (isEm) onSelect({ t: 'emInstance', tag })
    setMenu({ x: e.clientX, y: e.clientY, label: tag, items: [
      { label: 'Explore', onClick: () => (isEm ? onSelect({ t: 'emInstance', tag }) : useUi.getState().select(tag)) },
      { label: 'Open with Control Studio', onClick: () => (isEm ? useUi.getState().openEmStudio(em.instances[tag].className, tag) : useUi.getState().openStudio(tag)) },
      ...(isEm ? [] : [{ label: 'Open ▸ Faceplate', onClick: () => useUi.getState().openFaceplate(tag) }]),
      sep,
      { label: 'Delete', danger: true, onClick: () => { if (window.confirm(`Delete ${tag}?`)) alertResult(b.deleteCourseModule(tag)) } },
      { label: 'Rename', onClick: () => ui.setRenaming({ kind: 'module', name: tag }) },
      sep,
      { label: "What's this?", onClick: () => window.alert(isEm ? 'Equipment Module — created from the unit class module block; it coordinates its control modules through A_COMMAND.' : 'Control Module — created from the unit class module block.') },
      { label: 'Properties', onClick: () => ui.openDialog({ t: 'moduleDesc', tag }) }
    ] })
  }
  const label = (tag: string, block: string): ReactNode => ui.renaming?.kind === 'module' && ui.renaming.name === tag ?
    <InlineName label="Module name" value={tag} onCommit={commit} onCancel={() => ui.setRenaming(null)} /> : <span>{tag} ({block})</span>
  const pending = (tag: string, isEm: boolean): ReactNode => {
    const ctl = lib.assignments[tag]
    if (isEm) { const st = emDownloadState(tag, ctl); return st === 'not-downloaded' || st === 'pending' ? <span className="tv-pending" title="Download required">▲</span> : undefined }
    return undefined
  }
  return <>
    {Object.entries(blocks).map(([block, tag]) => {
      if (!tag) return <TreeRow key={block} depth={depth} icon={<ModuleIcon kind="control" size={16} />} label={<span>&lt;unbound&gt; ({block})</span>}
        sub="Shared module block — bind it to a module" dataAttr={{ 'data-unbound-block': `${unit}/${block}` }}
        onContextMenu={e => setMenu({ x: e.clientX, y: e.clientY, label: block, items: [{ label: 'Bind...', onClick: () => ui.openDialog({ t: 'bindBlock', unit, block }) }] })}
        onDoubleClick={() => ui.openDialog({ t: 'bindBlock', unit, block })} />
      const inst = em.instances[tag]
      if (inst) {
        const k = `em:${tag}`
        return <TreeRow key={tag} depth={depth} open={open[k] !== false} onToggle={() => setOpen(o => ({ ...o, [k]: o[k] === false }))}
          selected={same(sel, { t: 'emInstance', tag })} icon={<ModuleIcon kind="equipment" size={16} />} dataAttr={{ 'data-em-instance': tag }}
          pending={pending(tag, true)} label={label(tag, block)}
          sub={`Equipment Module (${inst.className})${em.deployed[tag] ? ` · A_PV ${emDisplay(em.deployed[tag], em.runtime[tag], 'A_PV')}` : ''}`}
          onClick={() => onSelect({ t: 'emInstance', tag })}
          onDoubleClick={() => useUi.getState().openEmStudio(inst.className, tag)}
          onKeyDown={e => { if (e.key === 'F2') ui.setRenaming({ kind: 'module', name: tag }) }}
          onContextMenu={e => moduleMenu(tag, true, e)}>
          {Object.entries(inst.children).map(([cb, ct]) => <TreeRow key={ct} depth={depth + 1} icon={<ModuleIcon kind="control" size={16} />}
            dataAttr={{ 'data-module': ct }} label={label(ct, cb)} sub={`${modules[ct]?.description ?? ''}`}
            drag={{ type: DRAG_MODULE, value: ct }}
            onClick={() => useUi.getState().select(ct)}
            onDoubleClick={() => useUi.getState().openFaceplate(ct)}
            onKeyDown={e => { if (e.key === 'F2') ui.setRenaming({ kind: 'module', name: ct }) }}
            onContextMenu={e => moduleMenu(ct, false, e)} />)}
        </TreeRow>
      }
      if (!modules[tag]) return null
      return <TreeRow key={tag} depth={depth} icon={<ModuleIcon kind="control" size={16} />} dataAttr={{ 'data-module': tag }}
        label={label(tag, block)} sub={modules[tag].description} drag={{ type: DRAG_MODULE, value: tag }}
        onClick={() => useUi.getState().select(tag)}
        onDoubleClick={() => useUi.getState().openFaceplate(tag)}
        onKeyDown={e => { if (e.key === 'F2') ui.setRenaming({ kind: 'module', name: tag }) }}
        onContextMenu={e => moduleMenu(tag, false, e)} />
    })}
    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
  </>
}

/** Contents panes for the Chapter 5 selections. */
export function EmDetail({ sel, onSelect }: { sel: BatchSel; onSelect: (s: BatchSel) => void }): JSX.Element | null {
  const em = useEm()
  const ui = useBatchUi()
  const lib = useLibrary()
  const openEmStudio = useUi(s => s.openEmStudio)
  const pane = (body: ReactNode, actions?: ReactNode): JSX.Element => <div className="dvx-contents">{actions && <div className="dvx-actions">{actions}</div>}{body}</div>
  switch (sel.t) {
    case 'emRoot':
      return pane(<ContentsList rows={Object.values(em.categories).filter(c => c.parent === null).map(c => ({ key: c.name, icon: <BatchIcon kind="folder" />, name: c.name, type: 'Category',
        onOpen: () => onSelect({ t: 'emCat', name: c.name }) }))} empty="Right-click Equipment Module Classes ▸ New Category (for example CommandDriven)." />)
    case 'emCat':
      return pane(<ContentsList rows={[
        ...Object.values(em.categories).filter(c => c.parent === sel.name).map(c => ({ key: `c${c.name}`, icon: <BatchIcon kind="folder" />, name: c.name, type: 'Category', onOpen: () => onSelect({ t: 'emCat', name: c.name }) })),
        ...Object.values(em.classes).filter(c => c.category === sel.name).map(c => ({ key: c.name, icon: <ModuleIcon kind="equipment" size={16} />, name: c.name, type: `Equipment Module Class (${c.algorithm})`,
          drag: { type: DRAG_EM_CLASS, value: c.name }, data: { 'data-contents-em-class': c.name }, onClick: () => onSelect({ t: 'emClass', name: c.name }), onOpen: () => openEmStudio(c.name) }))
      ]} empty={`Right-click ${sel.name} ▸ New Equipment Module Class.`} />, <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'newEmClass', category: sel.name })}>New Equipment Module Class...</button>)
    case 'emClass': {
      const cls = em.drafts[sel.name] ?? em.classes[sel.name]
      if (!cls) return <div className="exp-empty">Not found.</div>
      const users = Object.values(em.instances).filter(i => i.className === cls.name)
      return pane(<>
        <ContentsList rows={[
          ...Object.values(cls.children).map(ch => ({ key: `b${ch.name}`, icon: <ModuleIcon kind="control" size={16} />, name: ch.name, type: `Module block (${ch.className})` })),
          ...(cls.algorithm === 'Command driven' ? Object.values(cls.commands).map(c => ({ key: c.block, icon: <BatchIcon kind="composite" />, name: c.block, type: `Command (${c.state})`, onOpen: () => openEmStudio(cls.name, null, c.block) })) :
            cls.items.map(i => ({ key: `i${i.name}`, icon: <BatchIcon kind="param" />, name: i.name, type: `Item ${i.write} ⇐ ${i.readback}` }))),
          ...EM_PARAMS.map(([n, d]) => ({ key: n, icon: <BatchIcon kind="param" />, name: n, type: `Parameter (${d})` }))
        ]} />
        <table className="exp-props-table lib-instance-summary"><tbody>
          <tr><td className="k">Algorithm type</td><td className="v">{cls.algorithm} — {EM_ALGORITHM_NOTE[cls.algorithm]}</td></tr>
          <tr><td className="k">Named set</td><td className="v">{cls.namedSet}</td></tr>
          <tr><td className="k">Revision</td><td className="v">{cls.revision}{em.drafts[cls.name] ? ' (unsaved Control Studio changes)' : ''}</td></tr>
          <tr><td className="k">Instances</td><td className="v">{users.map(i => i.tag).join(', ') || 'None. Add the class to a unit class and create unit modules.'}</td></tr>
        </tbody></table>
      </>, <><button className="tbtn sm" onClick={() => openEmStudio(cls.name)}>Open with Control Studio</button>
        <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'emProps', cls: cls.name })}>Properties...</button></>)
    }
    case 'emInstance': {
      const inst = em.instances[sel.tag]
      if (!inst) return <div className="exp-empty">Not found.</div>
      const dep = em.deployed[sel.tag]
      const rt = em.runtime[sel.tag]
      const ctl = lib.assignments[sel.tag]
      const st = emDownloadState(sel.tag, ctl)
      return pane(<>
        <ContentsList rows={[
          ...Object.entries(inst.children).map(([b, t]) => ({ key: t, icon: <ModuleIcon kind="control" size={16} />, name: `${t} (${b})`, type: 'Control Module' })),
          ...EM_PARAMS.map(([n]) => ({ key: n, icon: <BatchIcon kind="param" />, name: n, type: dep ? emDisplay(dep, rt, n) : 'Not downloaded' }))
        ]} />
        <table className="exp-props-table lib-instance-summary"><tbody>
          <tr><td className="k">Class</td><td className="v">{inst.className}</td></tr>
          <tr><td className="k">Description</td><td className="v">{inst.description}</td></tr>
          <tr><td className="k">Unit module</td><td className="v">{inst.unit ?? '(none)'} · block {inst.block ?? ''}</td></tr>
          <tr><td className="k">Controller</td><td className="v">{ctl ?? 'Not assigned'}</td></tr>
          <tr><td className="k">Download state</td><td className="v" data-em-download-state={st}>{st === 'current' ? 'Downloaded' : st === 'pending' ? 'Download pending' : st === 'not-downloaded' ? 'Not downloaded' : 'Not assigned'}</td></tr>
          {dep && <tr><td className="k">A_PV</td><td className="v">{stateName(dep.cls.namedSet, rt?.pv ?? 255)}</td></tr>}
        </tbody></table>
      </>, <><button className="tbtn sm" onClick={() => openEmStudio(inst.className, sel.tag)}>Open with Control Studio (On-Line)</button>
        <button className="tbtn sm" onClick={() => ui.openDialog({ t: 'moduleDesc', tag: sel.tag })}>Properties...</button></>)
    }
    case 'cmDevice': {
      const c = CM_DEVICE_CLASSES[sel.name]
      if (!c) return <div className="exp-empty">Not found.</div>
      const users = Object.values(em.cmInstances).filter(i => i.className === c.name).map(i => i.tag)
      return pane(<table className="exp-props-table"><tbody>
        <tr><td className="k">Class</td><td className="v">{c.name} — {c.description}</td></tr>
        <tr><td className="k">Category</td><td className="v">Control Module Classes/{c.category}</td></tr>
        <tr><td className="k">Module parameters</td><td className="v">MODE, CAS_SP ({c.spSet}), PV ({c.pvSet}){c.kind === 'MOTOR' ? ', DC1/PV_D' : ''}</td></tr>
        <tr><td className="k">Use</td><td className="v">Drag onto an Equipment Module Class (embedded module block) or a Unit Class (module block, Private or Shared).</td></tr>
        <tr><td className="k">Instances</td><td className="v">{users.join(', ') || 'None'}</td></tr>
      </tbody></table>)
    }
    default: return null
  }
}
