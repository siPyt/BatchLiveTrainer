import { create } from 'zustand'
import { useStore } from './store'
import { usePictures, pictureSignature, type PicElement, type Picture } from './pictureStore'
import { PICTURE_TEMPLATES, pictureSourcePaths, DYNAMO_SETS, type DynamoSetName } from './pictureObjects'
import { requireUnlockedKey } from './security'
import { libraryHooks } from './libraryStore'
import { ensureUserRef } from './dv09Settings'

// Course DV-09 chapter 3: the DeltaV Operate (Configure / Run) workflow on top of the picture model (pictureStore).

export const OVW_REF = 'OVW_REF'
export const MAIN_TEMPLATE_TEXT = 'Template'

export type OperateMode = 'configure' | 'run'
interface OperateState {
  mode: OperateMode
  /** Pictures open in the work area (the System Tree and File > Open list the rest). */
  open: string[]
  active: string | null
}
const OPERATE_KEY = 'batchlivetrainer.dv09.operate.v1'
const restoreOperate = (): OperateState => {
  try {
    const text = typeof window !== 'undefined' ? window.localStorage?.getItem(OPERATE_KEY) : null
    const v = text ? JSON.parse(text) as Partial<OperateState> : {}
    return { mode: v.mode === 'configure' ? 'configure' : 'run', open: Array.isArray(v.open) ? v.open.filter(k => typeof k === 'string') : [], active: typeof v.active === 'string' ? v.active : null }
  } catch { return { mode: 'run', open: [], active: null } }
}
export const useOperate = create<OperateState>(() => restoreOperate())
// The open windows of DeltaV Operate survive a reload of the application.
useOperate.subscribe(s => {
  try { if (typeof window !== 'undefined') window.localStorage?.setItem(OPERATE_KEY, JSON.stringify({ mode: s.mode, open: s.open, active: s.active })) } catch { /* storage unavailable */ }
})

// A new project starts with nothing open in DeltaV Operate.
libraryHooks.reset.push(() => useOperate.setState({ mode: 'run', open: [], active: null }))

const log = (tag: string, description: string, category: 'CONFIGURE' | 'DIAGNOSTIC' | 'OPERATOR' = 'CONFIGURE'): void =>
  useStore.getState().logEvent(category, tag, description)
const reject = (tag: string, message: string): false => {
  log(tag, message, 'DIAGNOSTIC')
  if (typeof window !== 'undefined') window.alert(message)
  return false
}

/** Event Journal evidence of what the student did in the Operate windows (launch, mode switches, window commands). */
export const logOperate = (text: string): void => log('DeltaV Operate', text, 'DIAGNOSTIC')

export const pictureKey = (name: string): string => name.trim().replace(/\.grf$/i, '').toUpperCase()
export const sameName = (a: string | undefined, b: string): boolean => !!a && pictureKey(a) === pictureKey(b)

/** Ovw_ref.grf ships with DeltaV Operate; the DV-09 project gets a plain overview picture to edit (chapter 3, Adding a Dynamo). */
export function ensureStandardPictures(): void {
  ensureUserRef()
  const p = usePictures.getState().pictures
  if (p[OVW_REF]) return
  usePictures.setState({ pictures: { ...p, [OVW_REF]: { name: OVW_REF, template: 'MAIN', background: PICTURE_TEMPLATES.MAIN.background,
    width: PICTURE_TEMPLATES.MAIN.width, height: PICTURE_TEMPLATES.MAIN.height,
    elements: [{ id: 'OVW1', type: 'text', x: 400, y: 280, content: 'Overview', fontSize: 32, bold: true, color: '#1d3b5c' }] } } })
}

/** New Picture dialog: Picture Name + the main template (which has objects on it, slide 3-25). */
export function createMainPicture(name: string, template = 'main'): string | null {
  const key = pictureKey(name)
  if (!key) return (reject(name, 'Picture name is required'), 'Picture name is required')
  if (template.toLowerCase() !== 'main') return (reject(key, `Template ${template} is not modeled; select the main template`), `Template ${template} is not modeled`)
  if (usePictures.getState().pictures[key]) return (reject(key, 'A picture with this name already exists'), 'A picture with this name already exists')
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return (reject(key, 'Picture names use letters, digits and underscore and start with a letter'), 'Picture names use letters, digits and underscore and start with a letter')
  if (!requireUnlockedKey('CAN_CONFIGURE', `Create dynamic picture element ${key}`)) return 'Requires the Can Configure key'
  const info = PICTURE_TEMPLATES.MAIN
  const picture: Picture = { name: key, template: 'MAIN', background: info.background, width: info.width, height: info.height,
    elements: [{ id: `T${Date.now().toString(36)}`, type: 'text', x: 430, y: 300, content: MAIN_TEMPLATE_TEXT, fontSize: 28, bold: true, color: '#1d3b5c', group: 'TEMPLATE' }] }
  usePictures.setState(s => ({ pictures: { ...s.pictures, [key]: picture } }))
  log(key, 'Picture created from the main template')
  return null
}

/** Edit > Picture...: Background Color. */
export function setBackgroundColor(pic: string, color: string): string | null {
  return usePictures.getState().setPictureBackground(pic, color) ? null : 'The background color was not changed'
}

let seq = 0
const uid = (): string => `D${Date.now().toString(36)}${seq++}`

export interface DatalinkSource { tag: string; path: string }

/** DVSYS.XV-101/DO1/SP_D.F_CV (or without DVSYS.; .A_CV for the text form) -> module and block path. Returns an error text for anything else. */
export function parseDatalinkSource(source: string): DatalinkSource | { error: string } {
  const text = source.trim().replace(/^DVSYS\./i, '')
  const m = text.match(/^([A-Za-z0-9_$-]+)\/(.+?)(?:\.(?:F_|A_)?CV)?$/i)
  if (!m) return { error: `${source.trim() || '(empty)'} is not a parameter path; use DVSYS.MODULE/BLOCK/PARAMETER.TYPE_FIELD` }
  const tag = m[1].toUpperCase()
  const module = useStore.getState().modules[tag]
  if (!module) return { error: `Module ${tag} does not exist` }
  const path = m[2].toUpperCase()
  const allowed = pictureSourcePaths(module).filter(p => p.path.toUpperCase() === path)
  if (!allowed.length) return { error: `${tag} has no parameter ${path}` }
  return { tag, path: allowed[0].path }
}

export interface DatalinkSpec { source: string; inPlace: boolean; refreshSeconds: number; x: number; y: number; color?: string }

/** Datalink Stamper: Source, Data Entry (None / In-Place), Refresh Rate; the click on the picture places it. */
export function addDatalink(pic: string, spec: DatalinkSpec): string | null {
  const parsed = parseDatalinkSource(spec.source)
  if ('error' in parsed) return (reject(pic, parsed.error), parsed.error)
  if (spec.inPlace && !/^(DC1|DO1)\/SP_D$/i.test(parsed.path)) return (reject(pic, 'In-Place data entry needs a writable SP_D parameter; PV_D and other parameters are read-only here'), 'In-Place data entry needs a writable SP_D parameter')
  const el: Omit<PicElement, 'id'> = {
    type: 'datalink', x: spec.x, y: spec.y, tag: parsed.tag, path: parsed.path, label: false, refreshSeconds: spec.refreshSeconds,
    ...(spec.inPlace ? { entry: { method: 'DISCRETE' as const } } : {}), ...(spec.color ? { color: spec.color } : {})
  }
  const id = usePictures.getState().addElement(pic, el)
  if (!id) return 'The datalink was not added (see the Event Journal)'
  log(pic, `Datalink DVSYS.${parsed.tag}/${parsed.path}.F_CV added (data entry ${spec.inPlace ? 'In-Place' : 'None'}, refresh ${spec.refreshSeconds} s)`)
  return null
}

export function addText(pic: string, x: number, y: number, content: string, color?: string): string | null {
  const text = content.trim()
  if (!text) return 'Type the text first'
  const id = usePictures.getState().addElement(pic, { type: 'text', x, y, content: text, fontSize: 14, ...(color ? { color } : {}) })
  if (!id) return 'The text was not added (see the Event Journal)'
  log(pic, `Text "${text}" added`)
  return null
}

/** View > Color Selections applied to an object (text or datalink). */
export function setObjectColor(pic: string, id: string, color: string): boolean {
  const ok = usePictures.getState().updateElement(pic, id, { color })
  if (ok) log(pic, `Object color set to ${color} (View > Color Selections)`)
  return ok
}

export type TextEditVia = 'Property Window' | 'Text Caption Editor' | 'Font dialog'
export function setTextCaption(pic: string, id: string, caption: string, via: TextEditVia): boolean {
  if (!caption.trim()) return reject(pic, 'The caption cannot be empty')
  const ok = usePictures.getState().updateElement(pic, id, { content: caption })
  if (ok) log(pic, via === 'Text Caption Editor' ? `Text Caption Editor: Write Caption "${caption}"` : `Text caption changed to "${caption}" (Property Window)`)
  return ok
}
export function setTextFont(pic: string, id: string, font: { fontFamily?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean }, via: 'Property Window' | 'Font dialog'): boolean {
  const ok = usePictures.getState().updateElement(pic, id, font)
  if (ok) log(pic, via === 'Font dialog' ? 'Text font set in the Font dialog' : 'Text FontName / FontSize / FontStyle set in the Property Window')
  return ok
}

export function deleteElement(pic: string, id: string): void {
  usePictures.getState().removeElement(pic, id)
  log(pic, 'Object deleted')
}

/** Dynamo Sets > Valves2 > Valve17 dragged onto the picture. */
export function addDynamo(pic: string, set: DynamoSetName, x: number, y: number, tag?: string): string | null {
  const types = DYNAMO_SETS[set].modules
  const modules = useStore.getState().modules
  const bound = tag ?? Object.values(modules).find(m => types.includes(m.type))?.tag
  if (!bound) return (reject(pic, `Create a ${types.join(' or ')} module before adding ${DYNAMO_SETS[set].label}`), 'No module to animate')
  const id = usePictures.getState().addElement(pic, { type: 'dynamo', x, y, tag: bound, dynamoSet: set })
  if (!id) return 'The dynamo was not added (see the Event Journal)'
  log(pic, `Dynamo ${DYNAMO_SETS[set].label} added (animated by ${bound})`)
  return null
}

/** Previous/Next Picture dialog (double-click the Previous/Next buttons). */
export function setPictureNavigation(pic: string, previous: string, next: string): string | null {
  return usePictures.getState().setPictureLinks(pic, previous, next) ? null : 'The picture names were not applied (see the Event Journal)'
}

/** File > Save. */
export function savePicture(pic: string): string | null {
  return usePictures.getState().savePicture(pic) ? null : 'The picture was not saved (see the Event Journal)'
}

/** What the last File > Save stored (null when never saved). */
export function savedPicture(p: Picture | undefined): Picture | null {
  if (!p?.saved) return null
  try { return JSON.parse(p.saved) as Picture } catch { return null }
}
export const pictureDirty = (p: Picture): boolean => p.saved !== pictureSignature(p)
