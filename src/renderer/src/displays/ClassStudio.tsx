import { useEffect, useRef, useState } from 'react'
import { useUi } from '../ui/uiStore'
import { useStore } from '../engine/store'
import { useLibrary, downloadState, instanceDefinition } from '../engine/libraryStore'
import { SimulatorDialog } from '../components/SimulatorDialog'
import { LibraryParamDialog, type ParamDialogResult } from '../components/LibraryParamDialog'
import { ContextMenu, ControllerDownloadDialog, alertResult } from '../components/LibraryExplorer'
import { FunctionBlockIcon, ModuleIcon } from '../components/EngineeringIcons'
import { PaneResizer, usePersistentSize } from '../components/PaneResizer'
import { Btn, Group, Stack } from './ControlStudioDisplay'
import {
  BLOCK_PINS, PARAM_TYPE_LABEL, defaultSpecialName, explorerName, formatParamValue, getParam, instanceConfigurable,
  type ModuleDefinition, type ParamDef, type Wire
} from '../engine/classLibrary'
import { isValidDeltaVTag } from '../engine/naming'
import type { AlarmPriority } from '../engine/types'
import { fmt } from '../utils/format'
import { askConfirm } from '../components/AppNotices'

// Control Studio on a Control Module Class (course 7016 pp 1-19..1-25), drawn with the same ribbon,
// Hierarchy / Diagram / Palette / Parameter / Alarm panes and status bar as BatchLive's Control Studio
// (site photos IMG_0640-0646, IMG_0620). Opened on a class-based module it is read-only except for
// parameters marked "Allow instance value to be configured".

const DRAG_PALETTE = 'application/x-bl-palette'
const BLOCK_W = 150
const BLOCK_H = 86
const PARAM_W = 120
const PARAM_H = 24
/** Keep diagram items inside the drawn canvas (a drop beside it, or an older off-canvas position, stays visible). */
const clampX = (x: number, w: number): number => Math.max(14, Math.min(CANVAS_W - w - 24, x))
const clampY = (y: number, h: number): number => Math.max(14, Math.min(CANVAS_H - h - 24, y))
const PIN_Y = 52
const CANVAS_W = 900
const CANVAS_H = 460

type Node = { kind: 'module' } | { kind: 'block'; name: string } | { kind: 'param'; name: string }

/** DeltaV Control Studio palette groups (function block names as listed in the palette). */
const PALETTE_GROUPS: Record<string, string[]> = {
  'Advanced Control': ['FLC', 'NN', 'MPC', 'PRED', 'DT'],
  'Analog Control': ['PID', 'BG', 'CTLSL', 'FFET', 'LL', 'MAN', 'RAT', 'SPLTR', 'ISEL'],
  'Calculation/Logic': ['ACT', 'AND', 'BDE', 'BFI', 'BFO', 'CALC', 'CMP', 'CND', 'MLTX', 'NDE', 'NOT', 'OR', 'PDE', 'RS', 'SR'],
  'I/O': ['AI', 'AO', 'DI', 'DO', 'MAI', 'MDI', 'MDO', 'PIN'],
  'Math': ['ABS', 'ADD', 'DIV', 'INT', 'MLTY', 'SCLR', 'SUB'],
  'Timer/Counter': ['CTR', 'DLY', 'RET', 'TP']
}

/** Small palette icons: parameter shapes for Special Items, a mini function block for blocks. */
function PaletteGlyph({ kind, label }: { kind: string; label?: string }): JSX.Element {
  const stroke = '#2c4f7c'
  const shape = kind === 'Input Parameter' ? <><path d="M2 4 H14 L19 9 L14 14 H2 Z" fill="#fff" stroke={stroke} /><path d="M19 9 H22" stroke={stroke} /></>
    : kind === 'Output Parameter' ? <><path d="M7 4 H20 V14 H7 L2 9 Z" fill="#fff" stroke={stroke} /><path d="M0 9 H2" stroke={stroke} /></>
    : kind === 'Internal Read Parameter' ? <><rect x="2" y="4" width="18" height="10" fill="#fff" stroke={stroke} /><text x="11" y="12.5" fontSize="8" textAnchor="middle" fill={stroke}>R</text></>
    : kind === 'Internal Write Parameter' ? <><rect x="2" y="4" width="18" height="10" fill="#fff" stroke={stroke} /><text x="11" y="12.5" fontSize="8" textAnchor="middle" fill={stroke}>W</text></>
    : kind === 'Embedded Composite' ? <><rect x="2" y="2" width="18" height="14" fill="#fff" stroke={stroke} /><rect x="6" y="6" width="10" height="6" fill="#dfe8f3" stroke={stroke} /></>
    : kind === 'Linked Composite' ? <><rect x="2" y="2" width="18" height="14" fill="#fff" stroke={stroke} /><path d="M7 9 h8 M12 6 l3 3 l-3 3" fill="none" stroke={stroke} /></>
    : <><rect x="3" y="2" width="16" height="14" fill="#eef2f7" stroke={stroke} /><rect x="3" y="2" width="16" height="4" fill="#c9d6e6" stroke={stroke} />
        <path d="M0 11 H3 M19 11 H22" stroke={stroke} /><text x="11" y="14" fontSize="5.5" textAnchor="middle" fill={stroke}>{(label ?? '').slice(0, 4)}</text></>
  return <svg className="cs-pal-glyph" width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">{shape}</svg>
}
type Menu = Parameters<typeof ContextMenu>[0]['menu']

function pinPosition(d: ModuleDefinition, end: string, pos: (id: string) => { x: number; y: number }): { x: number; y: number } | null {
  if (end.includes('/')) {
    const [block, pin] = end.split('/')
    const b = d.blocks[block]
    if (!b) return null
    const p = pos(block)
    return BLOCK_PINS[b.type].outputs.includes(pin) ? { x: p.x + BLOCK_W + 10, y: p.y + PIN_Y } : { x: p.x - 10, y: p.y + PIN_Y }
  }
  const def = d.params[end]
  if (!def?.special) return null
  const p = pos(end)
  return def.special.item === 'INPUT' ? { x: p.x + PARAM_W + 8, y: p.y + PARAM_H / 2 } : { x: p.x - 8, y: p.y + PARAM_H / 2 }
}

const route = (a: { x: number; y: number }, b: { x: number; y: number }): string => {
  const mid = Math.round((a.x + b.x) / 2)
  return `M${a.x},${a.y} H${mid} V${b.y} H${b.x}`
}

const CONNECTION: Partial<Record<ParamDef['type'], string>> = {
  extref: 'Input', intref: 'Internal read', fstatus: 'Input', dynamic: 'Output', connector: 'Input'
}

export function ClassStudio(): JSX.Element {
  const className = useUi(s => s.studioClass)!
  const instanceTag = useUi(s => s.studioInstance)
  const close = useUi(s => s.closeClassStudio)
  const openClassStudio = useUi(s => s.openClassStudio)
  const focusExplorer = useUi(s => s.focusExplorer)
  const lib = useLibrary()
  const module = useStore(s => (instanceTag ? s.modules[instanceTag] : undefined))
  const cls = lib.classes[className]
  const inst = instanceTag ? lib.instances[instanceTag] : undefined
  const readOnly = !!instanceTag
  const d: ModuleDefinition | undefined = readOnly ? (instanceTag ? instanceDefinition(instanceTag) : undefined) : lib.draftOf(className)
  const dirty = !readOnly && !!lib.drafts[className]

  const [tab, setTab] = useState('Home')
  const [palOpen, setPalOpen] = useState<Record<string, boolean>>({})
  const [node, setNode] = useState<Node>({ kind: 'block', name: 'AI1' })
  const [paramTab, setParamTab] = useState<'alpha' | 'cat'>('alpha')
  const [bottomTab, setBottomTab] = useState<'parameters' | 'alarms'>('parameters')
  const [panes, setPanes] = useState({ hierarchy: true, palette: true })
  const [zoom, setZoom] = useState(1)
  const [editing, setEditing] = useState<{ path: string; isNew?: boolean } | null>(null)
  const [moduleProps, setModuleProps] = useState(false)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [selectedWire, setSelectedWire] = useState<number | null>(null)
  const [wiring, setWiring] = useState<{ from: string; x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [moving, setMoving] = useState<{ id: string; ox: number; oy: number; x: number; y: number } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [hierWidth, setHierWidth] = usePersistentSize('studio.hierWidth', 190)
  const [paletteWidth, setPaletteWidth] = usePersistentSize('studio.paletteWidth', 184)
  const [bottomHeight, setBottomHeight] = usePersistentSize('studio.bottomHeight', 200)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!menu) return
    const shut = (): void => setMenu(null)
    window.addEventListener('mousedown', shut)
    return () => window.removeEventListener('mousedown', shut)
  }, [menu])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (readOnly || useUi.getState().display !== 'studio') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
      if (e.key === 'Delete' && selectedWire !== null && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault(); deleteWire(selectedWire)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  if (!cls || !d) return <div className="display studio"><div className="exp-empty">Control Module Class {className} was not found.
    {' '}<button className="tbtn sm" onClick={close}>Close</button></div></div>

  const edit = (fn: (draft: ModuleDefinition) => string | null | void): boolean => alertResult(lib.editDraft(className, fn))
  const save = (): void => { alertResult(useLibrary.getState().saveClass(className)) }
  const closeStudio = (): void => {
    if (!dirty) { close(); return }
    void askConfirm(`Save changes to ${className}?`).then(ok => {
      if (ok && !alertResult(useLibrary.getState().saveClass(className))) return
      close()
    })
  }
  const deleteWire = (i: number): void => { if (edit(draft => { draft.wires.splice(i, 1) })) setSelectedWire(null) }
  const pos = (id: string): { x: number; y: number } => {
    if (moving?.id === id) return { x: moving.x, y: moving.y }
    const b = d.blocks[id]
    if (b) return { x: clampX(b.x, BLOCK_W), y: clampY(b.y, 60) }
    const s = d.params[id]?.special
    return { x: clampX(s?.x ?? 0, PARAM_W), y: clampY(s?.y ?? 0, PARAM_H) }
  }
  const point = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = svg.current?.getBoundingClientRect()
    return { x: (e.clientX - (r?.left ?? 0)) / zoom, y: (e.clientY - (r?.top ?? 0)) / zoom }
  }

  const paramsOf = (n: Node): { path: string; name: string; def: ParamDef }[] => {
    if (n.kind === 'block') return Object.entries(d.blocks[n.name]?.params ?? {}).map(([name, def]) => ({ path: `${n.name}/${name}`, name, def }))
    if (n.kind === 'param') return d.params[n.name] ? [{ path: n.name, name: n.name, def: d.params[n.name] }] : []
    return Object.entries(d.params).map(([name, def]) => ({ path: name, name, def }))
  }
  const rows = paramsOf(node).sort((a, b) => a.name.localeCompare(b.name))
  const valueOf = (path: string, def: ParamDef): string => {
    if (readOnly && module?.type === 'AI' && (path === 'AI1/PV' || path === 'AI1/OUT')) return module.pvBad ? 'Bad' : fmt(module.pv, module.decimals)
    return formatParamValue(def)
  }

  const applyParam = (path: string, isNew: boolean) => (r: ParamDialogResult): string | null => {
    if (readOnly) {
      const res = useLibrary.getState().setOverride(instanceTag!, path, r.flag ? null : r.value)
      return res.ok ? null : res.error
    }
    const res = lib.editDraft(className, draft => {
      const def = getParam(draft, path)
      if (!def) return `${path} no longer exists`
      if (def.special) {
        const name = r.name.toUpperCase()
        if (name !== path) {
          if (!isValidDeltaVTag(name)) return 'Parameter names must be 1-16 characters using letters, digits, $, - or _'
          if (draft.params[name] || draft.blocks[name]) return `${name} already exists in this module`
          draft.params[name] = def
          delete draft.params[path]
          draft.wires = draft.wires.map(w => ({ from: w.from === path ? name : w.from, to: w.to === path ? name : w.to }))
        }
        def.type = r.type
      }
      def.value = r.value
      def.allowInstance = def.type === 'extref' || r.flag
    })
    if (!res.ok) return res.error
    if (isNew || r.name.toUpperCase() !== path) { if (d.params[path]?.special) setNode({ kind: 'param', name: r.name.toUpperCase() }) }
    return null
  }

  const addInputParameter = (x: number, y: number): void => {
    const name = defaultSpecialName(d, 'INPUT')
    if (edit(draft => {
      draft.params[name] = { type: 'extref', category: 'I/O', value: '', allowInstance: true, description: 'Input parameter',
        special: { item: 'INPUT', x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) } }
    })) {
      setNode({ kind: 'param', name })
      setEditing({ path: name, isNew: true })
    }
  }

  const dropPalette = (e: React.DragEvent): void => {
    if (!e.dataTransfer.getData(DRAG_PALETTE) || readOnly) return
    e.preventDefault()
    const p = point(e)
    addInputParameter(clampX(p.x - PARAM_W / 2, PARAM_W), clampY(p.y - PARAM_H / 2, PARAM_H))
  }

  const startMove = (id: string, e: React.MouseEvent): void => {
    if (readOnly || e.button !== 0) return
    const p = point(e)
    const cur = pos(id)
    setMoving({ id, ox: p.x - cur.x, oy: p.y - cur.y, x: cur.x, y: cur.y })
  }
  const onMouseMove = (e: React.MouseEvent): void => {
    const p = point(e)
    if (moving) {
      const w = d.blocks[moving.id] ? BLOCK_W : PARAM_W
      setMoving({ ...moving, x: Math.round(clampX(p.x - moving.ox, w)), y: Math.round(clampY(p.y - moving.oy, d.blocks[moving.id] ? 60 : PARAM_H)) })
    }
    if (wiring) setWiring({ ...wiring, x2: p.x, y2: p.y })
  }
  const onMouseUp = (): void => {
    if (moving) {
      const { id, x, y } = moving
      const b = d.blocks[id]
      const s = d.params[id]?.special
      setMoving(null)
      if ((b && (b.x !== x || b.y !== y)) || (s && (s.x !== x || s.y !== y))) edit(draft => {
        if (draft.blocks[id]) { draft.blocks[id].x = x; draft.blocks[id].y = y }
        else if (draft.params[id]?.special) { draft.params[id].special!.x = x; draft.params[id].special!.y = y }
      })
    }
    setWiring(null)
  }
  const startWire = (from: string, e: React.MouseEvent): void => {
    if (readOnly) return
    e.stopPropagation()
    const p = pinPosition(d, from, pos)
    if (p) setWiring({ from, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }
  const endWire = (to: string, e: React.MouseEvent): void => {
    if (!wiring) return
    e.stopPropagation()
    alertResult(lib.connect(className, wiring.from, to))
    setWiring(null)
  }
  const deleteParam = (name: string): void => {
    if (edit(draft => { delete draft.params[name]; draft.wires = draft.wires.filter(w => w.from !== name && w.to !== name) })) setNode({ kind: 'block', name: 'AI1' })
  }

  const nodeMenu = (n: Node, e: React.MouseEvent): void => {
    e.preventDefault()
    setNode(n)
    const name = n.kind === 'module' ? className : n.name
    setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
      { label: 'Properties...', onClick: () => n.kind === 'param' ? setEditing({ path: n.name }) : n.kind === 'module' ? setModuleProps(true) : setBottomTab('parameters') },
      ...(n.kind === 'param' && !readOnly ? [{ label: 'Delete', danger: true, onClick: () => deleteParam(n.name) }] : []),
      ...(n.kind === 'block' ? [{ label: 'Delete', disabled: 'The template AI1 block is required by this class' }] : []),
      { label: "What's this?", onClick: () => window.alert(n.kind === 'block' ? 'AI1 — Analog Input function block. With SIMULATE enabled, the SIMULATE_IN value (or SIMULATE value) replaces the I/O channel value.' :
        n.kind === 'param' ? 'Input Parameter — a module-level parameter. As an External Reference it reads another module\'s parameter (for example TANKSIM/TKLEV100).' :
          'Control Module Class — the common logic for every module created from it.') }
    ] })
  }

  const title = readOnly ? `${inst?.area ?? ''}/${instanceTag} (class ${className})` : `Advanced Definitions/Control Module Classes/${cls.category}/${className}`
  const editingDef = editing ? getParam(d, editing.path) : undefined
  const classDef = editing && readOnly ? getParam(cls.definition, editing.path) : undefined
  const assigned = instanceTag ? lib.assignments[instanceTag] : undefined
  const classOnly = 'A Control Module Class has no runtime; download the control modules created from it'
  const notModeled = 'This command is not implemented in the simulator'
  const licensed = (name: string): string => `${name} is an optional licensed DeltaV application and is not included in this simulator`

  return <div className="display studio class-studio" data-class-studio={className} data-instance={instanceTag ?? undefined}>
    <div className="ribbon">
      <div className="studio-caption"><ModuleIcon kind="control" size={16} />
        <span>[{title}] — Control Studio{readOnly ? ' (Read-Only)' : dirty ? ' *' : ''}</span>
        <span className="studio-caption-status">{readOnly ? `Class-based module · ${instanceTag ? downloadState(lib, instanceTag) : ''}` : `Class revision ${cls.revision}${dirty ? ' · unsaved changes' : ' · saved'}`}</span>
      </div>
      {readOnly && lib.drafts[className] && <div className="sp-note" role="note" data-unsaved-class={className} style={{ margin: '2px 6px', maxWidth: 'none' }}>
        Class {className} has unsaved changes in Control Studio; this module shows the saved class. Open {className}, then File → Save (Ctrl+S) to apply them.
        <button className="tbtn sm" style={{ marginLeft: 8 }} onClick={() => openClassStudio(className)}>Open {className}</button>
      </div>}
      <div className="ribbon-tabs">
        <div className="rb-quick" role="toolbar" aria-label="Quick access">
          <Btn glyph="save" label="Save" size="tiny" onClick={readOnly || !dirty ? undefined : save} unavailable={readOnly ? 'Class-based modules are edited through their class' : dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="undo" label="Undo" size="tiny" unavailable="Undo is not implemented" />
          <Btn glyph="redo" label="Redo" size="tiny" unavailable="Redo is not implemented" />
        </div>
        {['File', 'Home', 'Diagram', 'View'].map(t => <button key={t} type="button" className={'ribbon-tab' + (t === 'File' ? ' file' : t === tab ? ' active' : '')}
          aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>)}
        <span className="ribbon-title">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="ribbon-body rb-body">
        {tab === 'File' && <Group label="File">
          <Btn glyph="save" label="Save" onClick={readOnly || !dirty ? undefined : save} unavailable={readOnly ? 'Read-only' : dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="reset" label="Discard Changes" onClick={!readOnly && dirty ? () => { void askConfirm('Discard unsaved changes?').then(ok => { if (ok) { lib.discardDraft(className) } })} : undefined}
            unavailable={!readOnly && dirty ? undefined : 'No unsaved changes'} />
          <Btn glyph="properties" label="Properties" onClick={() => setModuleProps(true)} />
          <Btn glyph="backOut" label="Close" onClick={closeStudio} />
        </Group>}
        {tab === 'Home' && <>
          <Group label="Clipboard">
            <Btn glyph="paste" label="Paste" unavailable="Block clipboard operations are not implemented" />
            <Stack>
              <Btn glyph="cut" label="Cut" size="small" unavailable="Block clipboard operations are not implemented" />
              <Btn glyph="copy" label="Copy" size="small" unavailable="Block clipboard operations are not implemented" />
            </Stack>
          </Group>
          <Group label="Module">
            <Btn glyph="download" label="Download" onClick={readOnly && assigned ? () => setDownloading(true) : undefined}
              unavailable={readOnly ? (assigned ? undefined : 'Assign the module to a controller first (drag its area onto a controller in Explorer)') : classOnly} />
            <Btn glyph="assign" label="Assign To Node" onClick={readOnly ? () => focusExplorer(instanceTag!) : undefined}
              unavailable={readOnly ? undefined : classOnly} />
            <Stack>
              <Btn glyph="collection" label="History Collection" size="small" unavailable={notModeled} />
              <Btn glyph="recorder" label="History Recorder" size="small" unavailable={readOnly ? notModeled : classOnly} />
              <Btn glyph="properties" label="Properties" size="small" onClick={() => setModuleProps(true)} />
            </Stack>
          </Group>
          <Group label="Insert">
            <Btn glyph="moduleParameter" label="Module Parameter" onClick={readOnly ? undefined : () => addInputParameter(40, 120)}
              unavailable={readOnly ? 'Class-based modules are edited through their class' : undefined} />
            <Stack>
              <Btn glyph="custom" label="Custom" size="small" unavailable="Custom diagram objects are not implemented" />
              <Btn glyph="textBox" label="Text Box" size="small" unavailable="Diagram text boxes are not implemented" />
              <Btn glyph="stateItem" label="State Item" size="small" unavailable="State items are not implemented" />
            </Stack>
          </Group>
          <Group label="Alarms">
            <Btn glyph="alarm" label="Alarm" active={bottomTab === 'alarms'} onClick={() => setBottomTab('alarms')} />
            <Btn glyph="alarmGroups" label="Alarm Groups Configuration" unavailable="Alarm groups are not modeled" />
            <Btn glyph="alarmGroupRefs" label="Alarm Groups Assignment References" unavailable="Alarm group assignments and references are not modeled" />
          </Group>
          <Group label="Algorithm">
            <Btn glyph="editObject" label="Edit Object" onClick={() => node.kind === 'param' ? setEditing({ path: node.name }) : node.kind === 'module' ? setModuleProps(true) : setBottomTab('parameters')} />
            <Btn glyph="drillDown" label="Drill Down" unavailable="AI1 has no nested block level" />
            <Btn glyph="backOut" label="Back Out" unavailable="Already at the module level" />
          </Group>
          <Group label="Diagram Mode">
            <Btn glyph="onlineDebug" label="On-Line Debug" active={readOnly} unavailable={readOnly ? undefined : classOnly} />
            <Btn glyph="edit" label="Edit" active={!readOnly} unavailable={readOnly ? 'Open the class to edit its logic' : undefined} />
          </Group>
          <Group label="Class">
            <Stack>
              <Btn glyph="configure" label="Configure" size="small" onClick={readOnly ? () => openClassStudio(className) : undefined}
                unavailable={readOnly ? undefined : 'You are editing the class'} />
              <Btn glyph="namedSet" label="Named Set" size="small" unavailable="Named sets are configured in DeltaV Explorer Setup" />
            </Stack>
          </Group>
          <Group label="Advanced">
            <Stack>
              <Btn glyph="tune" label="Tune with Insight" size="small" unavailable={licensed('Tune with InSight')} />
              <Btn glyph="predict" label="Predict" size="small" unavailable={licensed('Predict and PredictPro')} />
              <Btn glyph="neural" label="Neural" size="small" unavailable={licensed('Neural')} />
            </Stack>
          </Group>
          <Group label="Version Control">
            <Btn glyph="checkOut" label="Check Out" unavailable="Configuration Audit Trail (Version Control) is an optional licensed feature; class saves are recorded in the Event Journal" />
          </Group>
        </>}
        {tab === 'View' && <Group label="Windows">
          <Btn glyph="hierarchy" label="Hierarchy" active={panes.hierarchy} onClick={() => setPanes(p => ({ ...p, hierarchy: !p.hierarchy }))} />
          <Btn glyph="parameters" label="Parameters" active={bottomTab === 'parameters'} onClick={() => setBottomTab('parameters')} />
          <Btn glyph="palette" label="Palette" active={panes.palette} onClick={() => setPanes(p => ({ ...p, palette: !p.palette }))} />
          <Btn glyph="alarm" label="Alarm View" active={bottomTab === 'alarms'} onClick={() => setBottomTab('alarms')} />
        </Group>}
        {(tab === 'Diagram' || tab === 'View') && <Group label="Zoom">
          <Btn glyph="zoomIn" label="Zoom In" onClick={() => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))} unavailable={zoom >= 1.5 ? 'Maximum zoom is 150%' : undefined} />
          <Btn glyph="zoomOut" label="Zoom Out" onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} unavailable={zoom <= 0.5 ? 'Minimum zoom is 50%' : undefined} />
          <Btn glyph="reset" label="100%" onClick={() => setZoom(1)} />
        </Group>}
      </div>
    </div>

    <div className="studio-main">
      {panes.hierarchy && <div className="studio-pane studio-hier" style={{ width: hierWidth, minWidth: hierWidth, flex: `0 0 ${hierWidth}px` }}>
        <div className="studio-tree" role="tree" aria-label="Module hierarchy">
          <div className={'studio-tree-root' + (node.kind === 'module' ? ' cs-sel' : '')} role="treeitem" onClick={() => setNode({ kind: 'module' })}
            onContextMenu={e => nodeMenu({ kind: 'module' }, e)} onDoubleClick={() => setModuleProps(true)}>
            <ModuleIcon kind="control" /> {readOnly ? instanceTag : className}
          </div>
          {Object.values(d.blocks).map(b => <button key={b.name} type="button" role="treeitem"
            className={'studio-tree-node studio-block-select' + (node.kind === 'block' && node.name === b.name ? ' active' : '')}
            onClick={() => setNode({ kind: 'block', name: b.name })} onContextMenu={e => nodeMenu({ kind: 'block', name: b.name }, e)}>
            <FunctionBlockIcon type={b.type} />{b.name}
          </button>)}
          {Object.entries(d.params).filter(([, def]) => def.special).map(([name]) => <button key={name} type="button" role="treeitem"
            className={'studio-tree-node studio-block-select' + (node.kind === 'param' && node.name === name ? ' active' : '')}
            onClick={() => setNode({ kind: 'param', name })} onContextMenu={e => nodeMenu({ kind: 'param', name }, e)} onDoubleClick={() => setEditing({ path: name })}>
            <span className="cs-param-ico">▭</span>{name}
          </button>)}
        </div>
        <div className="studio-pane-label">Hierarchy View</div>
      </div>}
      {panes.hierarchy && <PaneResizer axis="x" sign={1} value={hierWidth} min={140} max={520} onChange={setHierWidth} label="Resize hierarchy panel" />}

      <div className="studio-center">
        <div className="studio-canvas cs-diagram-wrap"
          onDragOver={e => { if (!readOnly && e.dataTransfer.types.includes(DRAG_PALETTE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
          onDrop={dropPalette}>
          <svg ref={svg} className="cs-diagram fbd-canvas-svg" width={CANVAS_W * zoom} height={CANVAS_H * zoom} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            role="img" aria-label={`${className} function block diagram`}
            onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onMouseDown={() => setSelectedWire(null)}>
            <defs>
              <pattern id="csGrid" width={20} height={20} patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7e9eb" strokeWidth={0.7} />
              </pattern>
            </defs>
            <rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="url(#csGrid)" />
            {d.wires.map((w: Wire, i) => {
              const a = pinPosition(d, w.from, pos)
              const b = pinPosition(d, w.to, pos)
              if (!a || !b) return null
              return <g key={`${w.from}-${w.to}`} data-wire={`${w.from}->${w.to}`}>
                <path d={route(a, b)} className={'cs-wire' + (selectedWire === i ? ' sel' : '')} />
                <path d={route(a, b)} className="cs-wire-hit" onMouseDown={e => { e.stopPropagation(); setSelectedWire(i) }}
                  onContextMenu={e => { e.preventDefault(); if (!readOnly) setMenu({ x: e.clientX, y: e.clientY, label: `${w.from} → ${w.to}`, items: [
                    { label: 'Delete connection', danger: true, onClick: () => deleteWire(i) }] }) }} />
              </g>
            })}
            {wiring && <path d={route({ x: wiring.x1, y: wiring.y1 }, { x: wiring.x2, y: wiring.y2 })} className="cs-wire drawing" />}
            {Object.values(d.blocks).map(b => {
              const p = pos(b.name)
              const pins = BLOCK_PINS[b.type]
              const sel = node.kind === 'block' && node.name === b.name
              return <g key={b.name} transform={`translate(${p.x},${p.y})`} data-block={b.name}
                onMouseDown={e => { e.stopPropagation(); setNode({ kind: 'block', name: b.name }); startMove(b.name, e) }}
                onContextMenu={e => nodeMenu({ kind: 'block', name: b.name }, e)}>
                <text x={BLOCK_W / 2} y={-6} className="cs-block-badge" textAnchor="middle">{b.type}</text>
                <rect width={BLOCK_W} height={BLOCK_H} className={'cs-block' + (sel ? ' sel' : '')} />
                <rect width={BLOCK_W} height={22} className="cs-block-head" />
                <text x={6} y={15} className="cs-block-name">{b.name}</text>
                <FunctionBlockIcon type={b.type} size={18} x={BLOCK_W - 21} y={2} />
                {pins.inputs.map(pin => <g key={pin} data-pin={`${b.name}/${pin}`} onMouseUp={e => endWire(`${b.name}/${pin}`, e)}>
                  <line x1={-10} y1={PIN_Y} x2={0} y2={PIN_Y} className="cs-pin-line" />
                  <circle cx={-10} cy={PIN_Y} r={5} className={'cs-pin in' + (wiring ? ' armed' : '')} />
                  <text x={4} y={PIN_Y + 3} className="cs-pin-label">{pin}</text>
                </g>)}
                {pins.outputs.map(pin => <g key={pin} data-pin={`${b.name}/${pin}`} onMouseDown={e => startWire(`${b.name}/${pin}`, e)}>
                  <line x1={BLOCK_W} y1={PIN_Y} x2={BLOCK_W + 10} y2={PIN_Y} className="cs-pin-line" />
                  <circle cx={BLOCK_W + 10} cy={PIN_Y} r={5} className="cs-pin out" />
                  <text x={BLOCK_W - 4} y={PIN_Y + 3} textAnchor="end" className="cs-pin-label">{pin}</text>
                </g>)}
                <line x1={0} y1={BLOCK_H - 18} x2={BLOCK_W} y2={BLOCK_H - 18} className="cs-block-rule" />
                <text x={6} y={BLOCK_H - 6} className="cs-pin-label dim">{readOnly && module?.type === 'AI' ? `PV ${module.pvBad ? 'Bad' : fmt(module.pv, module.decimals)} ${module.unit}` : (d.blocks[b.name].params.SIMULATE.value as { enabled: boolean }).enabled ? 'SIMULATE enabled' : ''}</text>
              </g>
            })}
            {Object.entries(d.params).filter(([, def]) => def.special).map(([name, def]) => {
              const p = pos(name)
              const input = def.special!.item === 'INPUT'
              const sel = node.kind === 'param' && node.name === name
              const path = typeof def.value === 'string' ? def.value : ''
              return <g key={name} transform={`translate(${p.x},${p.y})`} data-special={name}
                onMouseDown={e => { e.stopPropagation(); setNode({ kind: 'param', name }); startMove(name, e) }}
                onDoubleClick={() => setEditing({ path: name })} onContextMenu={e => nodeMenu({ kind: 'param', name }, e)}>
                <rect width={PARAM_W} height={PARAM_H} rx={5} className={'cs-special' + (sel ? ' sel' : '')} />
                <rect x={input ? PARAM_W - 14 : 4} y={7} width={10} height={10} className="cs-special-box" />
                <text x={input ? (PARAM_W - 14) / 2 : PARAM_W / 2 + 7} y={16} textAnchor="middle" className="cs-block-name">{name}</text>
                <text x={PARAM_W / 2} y={PARAM_H + 13} textAnchor="middle" className="cs-pin-label">{path || (def.type === 'extref' ? '' : PARAM_TYPE_LABEL[def.type])}</text>
                {input ? <g data-pin={name} onMouseDown={e => startWire(name, e)}>
                  <line x1={PARAM_W} y1={PARAM_H / 2} x2={PARAM_W + 8} y2={PARAM_H / 2} className="cs-pin-line" />
                  <circle cx={PARAM_W + 8} cy={PARAM_H / 2} r={5} className="cs-pin out" />
                </g> : <g data-pin={name} onMouseUp={e => endWire(name, e)}>
                  <circle cx={-8} cy={PARAM_H / 2} r={5} className="cs-pin in" />
                </g>}
              </g>
            })}
          </svg>
        </div>
        <PaneResizer axis="y" sign={-1} value={bottomHeight} min={96} max={600} onChange={setBottomHeight} label="Resize parameter and alarm panel" />
        <div className="studio-bottom" style={{ height: bottomHeight }}>
          <div className="studio-bottom-tabs" role="tablist" aria-label="Bottom panel">
            <button type="button" role="tab" aria-selected={bottomTab === 'parameters'} className={bottomTab === 'parameters' ? 'active' : ''} onClick={() => setBottomTab('parameters')}>Parameter View</button>
            <button type="button" role="tab" aria-selected={bottomTab === 'alarms'} className={bottomTab === 'alarms' ? 'active' : ''} onClick={() => setBottomTab('alarms')}>Alarm View</button>
          </div>
          {bottomTab === 'parameters' ? <div className="studio-pane studio-params cs-params">
            <div className="cs-params-filter">Filtered by: <span className="cs-filter-box" /><span className="cs-filter-box" /><span className="cs-filter-box" />
              <span className="cs-filter-box on">✓</span><span className="cs-filter-box" /><span className="cs-filter-box" /><span className="cs-filter-box" /><span className="cs-filter-box" /></div>
            <div className="cs-tabs">
              <button className={paramTab === 'alpha' ? 'on' : ''} onClick={() => setParamTab('alpha')}>Alphabetic</button>
              <button className={paramTab === 'cat' ? 'on' : ''} onClick={() => setParamTab('cat')}>Categorized</button>
            </div>
            <div className="studio-alarm-scroll">
              <table className="studio-param-table cs-param-table" aria-label="Parameters">
                <thead><tr><th>Parameter</th><th>{readOnly ? 'Value' : 'Default'}</th><th>Connection</th><th>Parameter type</th><th>Instance</th></tr></thead>
                <tbody>
                  {(paramTab === 'alpha' ? [['', rows] as const] : Array.from(new Set(rows.map(r => r.def.category))).sort().map(c => [c, rows.filter(r => r.def.category === c)] as const))
                    .flatMap(([cat, list]) => [
                      ...(cat ? [<tr key={`cat-${cat}`} className="cs-param-cat"><td colSpan={5}>⊟ {cat}</td></tr>] : []),
                      ...list.map(r => <tr key={r.path} className="cs-param-row" data-param={r.path} aria-selected={editing?.path === r.path}
                        onDoubleClick={() => setEditing({ path: r.path })}
                        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, label: r.name, items: [
                          { label: 'Add...', disabled: 'Add module parameters with Insert ▸ Module Parameter or the Special Items palette' },
                          { label: 'Properties...', onClick: () => setEditing({ path: r.path }) }
                        ] }) }}>
                        <td>{r.name}</td>
                        <td className="cs-param-val">{valueOf(r.path, r.def)}</td>
                        <td>{CONNECTION[r.def.type] ?? 'Internal'}</td>
                        <td>{PARAM_TYPE_LABEL[r.def.type]}</td>
                        <td>{readOnly ? (inst && r.path in inst.overrides ? 'Instance value' : instanceConfigurable(r.def) ? 'Library default' : '') :
                          instanceConfigurable(r.def) ? 'Configurable' : ''}</td>
                      </tr>)
                    ])}
                  {!rows.length && <tr><td colSpan={5}>No parameters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="studio-pane-label">Parameter View — {node.kind === 'module' ? (readOnly ? instanceTag : className) : node.name}</div>
          </div> : <div className="studio-pane studio-alarms">
            <div className="studio-alarm-scroll">
              <table className="studio-param-table" aria-label="Alarm View">
                <thead><tr><th>Alarm</th><th>Word</th><th>State</th><th>Parameter</th><th>Limit Value</th><th>Enabled</th><th>Invert</th><th>Priority</th><th>Functional Class</th><th>Alarm Description</th></tr></thead>
                <tbody>
                  {Object.entries(d.alarms).map(([name, a]) => <tr key={name} data-alarm={name}
                    onContextMenu={e => { e.preventDefault(); if (!readOnly) setMenu({ x: e.clientX, y: e.clientY, label: name, items: [
                      { label: a.enabled ? 'Disable' : 'Enable', onClick: () => edit(draft => { draft.alarms[name].enabled = !a.enabled }) }] }) }}>
                    <td>{name}</td><td>{a.type}</td><td>{readOnly && module?.type === 'AI' ? 'Normal' : '—'}</td><td>{explorerName(a.parameter)}</td>
                    <td>{String(getParam(d, a.parameter)?.value ?? '')}</td>
                    <td><label className="cs-enable"><input type="checkbox" aria-label={`${name} enabled`} checked={a.enabled} disabled={readOnly}
                      onChange={e => edit(draft => { draft.alarms[name].enabled = e.target.checked })} />{a.enabled ? 'True' : 'False'}</label></td>
                    <td>False</td>
                    <td><select className="exp-alm-select" aria-label={`${name} priority`} value={a.priority} disabled={readOnly}
                      onChange={e => edit(draft => { draft.alarms[name].priority = e.target.value as AlarmPriority })}>
                      {(['CRITICAL', 'WARNING', 'ADVISORY'] as AlarmPriority[]).map(p => <option key={p} value={p}>{p}</option>)}
                    </select></td>
                    <td>Not classified</td><td>{a.type} alarm on {explorerName(a.parameter)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="studio-pane-label">Alarm View — {readOnly ? instanceTag : className}</div>
          </div>}
        </div>
      </div>

      {panes.palette && <PaneResizer axis="x" sign={-1} value={paletteWidth} min={140} max={420} onChange={setPaletteWidth} label="Resize palette panel" />}
      {panes.palette && <div className="studio-pane studio-palette" aria-label="Palette" style={{ width: paletteWidth, minWidth: paletteWidth, flex: `0 0 ${paletteWidth}px` }}>
        <div className="studio-palette-body">
          <div className="studio-pal-group">
            <div className="studio-pal-head">Special Items</div>
            <div className={'studio-pal-item' + (readOnly ? ' disabled' : '')} draggable={!readOnly} data-palette="Input Parameter"
              title={readOnly ? 'Class-based modules are edited through their class' : 'Drag onto the diagram'}
              onDragStart={e => { e.dataTransfer.setData(DRAG_PALETTE, 'INPUT'); e.dataTransfer.setData('text/plain', 'Input Parameter'); e.dataTransfer.effectAllowed = 'copy' }}>
              <PaletteGlyph kind="Input Parameter" /><span>Input Parameter</span>
            </div>
            {['Output Parameter', 'Internal Read Parameter', 'Internal Write Parameter', 'Embedded Composite', 'Linked Composite'].map(x =>
              <div key={x} className="studio-pal-item disabled" title="Not used in Course 7016 Chapter 1; not modeled for classes"><PaletteGlyph kind={x} /><span>{x}</span></div>)}
          </div>
          {Object.entries(PALETTE_GROUPS).map(([g, blocks]) => <div key={g} className="studio-pal-group">
            <button type="button" className="studio-pal-head studio-pal-toggle" aria-expanded={!!palOpen[g]} onClick={() => setPalOpen(o => ({ ...o, [g]: !o[g] }))}>
              <span className="studio-pal-caret">{palOpen[g] ? '▾' : '▸'}</span>{g}
            </button>
            {palOpen[g] && blocks.map(b => <div key={b} className="studio-pal-item disabled" data-palette={b}
              title={`${b} block — not used by the LEVEL_INDICATOR class (Course 7016 Chapter 1 keeps the ANALOG template's AI1 block)`}>
              <PaletteGlyph kind="block" label={b} /><span>{b}</span>
            </div>)}
          </div>)}
        </div>
        <div className="studio-pane-label">Palette · drag Special Items onto the diagram</div>
      </div>}
    </div>

    <div className="studio-statusbar">
      <span>Press F1 for Help.</span>
      <span>{readOnly ? `Assigned to: ${assigned ?? 'Not assigned'}${module?.type === 'AI' && module.statusText ? ` · ${module.statusText}` : ''}` :
        `${Object.values(lib.instances).filter(i => i.className === className).length} module(s) use this class`}</span>
      <span className="studio-status-zoom">{Math.round(zoom * 100)}%
        <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>-</button>
        <input type="range" aria-label="Zoom" min={50} max={150} step={10} value={Math.round(zoom * 100)} onChange={e => setZoom(Number(e.target.value) / 100)} />
        <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}>+</button>
      </span>
    </div>

    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    {editing && editingDef && <LibraryParamDialog key={editing.path} title={explorerName(editing.path)} name={editing.path.split('/').pop()!}
      def={editingDef} mode={readOnly ? 'instance' : 'class'}
      value={editingDef.value} classValue={classDef?.value}
      flag={readOnly ? !(inst && editing.path in inst.overrides) : editingDef.allowInstance}
      readOnly={readOnly && !instanceConfigurable(editingDef)}
      onOk={applyParam(editing.path, !!editing.isNew)} onClose={() => setEditing(null)} />}
    {moduleProps && <ModulePropertiesDialog definition={d} name={readOnly ? instanceTag! : className} readOnly={readOnly}
      onOk={next => { edit(draft => { Object.assign(draft, next) }); setModuleProps(false) }} onClose={() => setModuleProps(false)} />}
    {downloading && instanceTag && assigned && <ControllerDownloadDialog controller={assigned} tag={instanceTag} onClose={() => setDownloading(false)} />}
  </div>
}

const DISPLAY_CHOICES = ['Process', 'OVW_REF', 'ALARMLIST']

export function ModulePropertiesDialog({ definition, name, readOnly, onOk, onClose }: {
  definition: ModuleDefinition; name: string; readOnly: boolean
  onOk: (next: Pick<ModuleDefinition, 'description' | 'primaryDisplay' | 'detailDisplay' | 'instrumentDisplay'>) => void; onClose: () => void
}): JSX.Element {
  const [v, setV] = useState({ description: definition.description, primaryDisplay: definition.primaryDisplay,
    detailDisplay: definition.detailDisplay, instrumentDisplay: definition.instrumentDisplay })
  const field = (key: keyof typeof v, label: string, list = false): JSX.Element => <label>{label}
    <input aria-label={label} value={v[key]} disabled={readOnly} list={list ? 'cs-display-choices' : undefined}
      onChange={e => setV({ ...v, [key]: e.target.value })} />
  </label>
  return <SimulatorDialog className="module-download-dialog lib-param-dialog" label={`${name} Properties`} onClose={onClose}>
    <datalist id="cs-display-choices">{DISPLAY_CHOICES.map(x => <option key={x} value={x} />)}</datalist>
    <div className="lib-dlg-fields">
      <div className="exp-props-subhead">General</div>
      {field('description', 'Description')}
      <div className="exp-props-subhead">Displays</div>
      {field('primaryDisplay', 'Primary control display', true)}
      {field('detailDisplay', 'Detail display', true)}
      {field('instrumentDisplay', 'Instrument area display', true)}
    </div>
    <div className="traditional-channel-form">
      <button className="tbtn sm" disabled={readOnly} onClick={() => onOk({ ...v, description: v.description.trim(), primaryDisplay: v.primaryDisplay.trim(),
        detailDisplay: v.detailDisplay.trim(), instrumentDisplay: v.instrumentDisplay.trim() })}>OK</button>
      <button className="tbtn sm" onClick={onClose}>Cancel</button>
    </div>
  </SimulatorDialog>
}
