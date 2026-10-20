import type { StepCheck } from './workshopChecks'
import type { AnyModule, EventLogEntry } from './types'
import type { UnitClass, UnitModule } from './batchConfig'
import type { EmCategory, EmClass, EmDeployment, EmInstance } from './emStore'
import type { TransferLog } from './libraryStore'
import { normExpr } from './course7016Ch4Checks'
import { FB_NEEDS_IN2 } from './fb'
import { conditionReferences } from './fbCondition'

/** Evidence-based checking of the Course 7016 Chapter 5 workshops (Equipment Module Classes, BLENDERS unit class, process and EM verification). */

export interface Ch5State {
  emCategories: Record<string, EmCategory>
  emClasses: Record<string, EmClass>
  emDrafts: Record<string, EmClass>
  emInstances: Record<string, EmInstance>
  emDeployed: Record<string, EmDeployment>
  batchCategories: Record<string, { name: string; kind: string; parent: string | null }>
  unitClasses: Record<string, UnitClass>
  units: Record<string, UnitModule>
  contained: Record<string, string>
  assignments: Record<string, string>
  modules: Record<string, AnyModule>
  transfers: Record<string, TransferLog>
  sims: Record<string, unknown>
  /** Simulation time of the first blender equipment module download; Verify you can run the process counts transfers after it (Chapter 2 manual runs do not count). */
  runSince: number | null
}

/** runSince for the live checks: the first time a blender equipment module was downloaded. */
export function blendersDownloadedAt(emDeployed: Record<string, EmDeployment>): number | null {
  const at = Object.values(emDeployed).map(d => d.at)
  return at.length ? Math.min(...at) : null
}

const v = (id: string, ok: boolean, good: string, bad: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail: ok ? good : bad })
const up = (s: string): string => s.toUpperCase().replace(/\s+/g, '')
const emClass = (s: Ch5State, name: string): EmClass | undefined => s.emDrafts[name] ?? s.emClasses[name]

// ---------------------------------------------------------------------------
// Workshop – BLENDER_COLOR (pp 5-11 to 5-17)

const allActions = (c: EmClass | undefined, value: number): string =>
  normExpr((c?.commands[String(value)]?.sfc.steps ?? []).flatMap(s => s.actions.map(a => a.expression)).join(' '))
const allConds = (c: EmClass | undefined, value: number): string =>
  normExpr((c?.commands[String(value)]?.sfc.transitions ?? []).map(t => t.condition).join(' '))

const VLV = "'/COLOR_IN_VLV/"
const modeIs = (text: string, mode: 'CAS' | 'AUTO'): boolean => new RegExp(`${escape(VLV)}MODE\\.TARGET':='?${mode}'?`).test(text)
const spIs = (text: string, state: string, value: number): boolean => new RegExp(`${escape(VLV)}CAS_SP':=('VLVNC2STAGE-SP:${state}'|${value}(?![0-9.]))`).test(text)
const pvIs = (text: string, state: string, value: number): boolean => new RegExp(`${escape(VLV)}PV'=('VLVNC2STAGE-PV:${state}'|${value}(?![0-9.]))`).test(text)
function escape(s: string): string { return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') }

/** COMMAND_0000n logic as written in Steps 7 to 10. */
function commandOk(c: EmClass | undefined, value: number): boolean {
  const a = allActions(c, value)
  const t = allConds(c, value)
  switch (value) {
    case 1: return modeIs(a, 'CAS') && spIs(a, 'CLOSE', 0) && pvIs(t, 'CLOSED', 0)
    case 2: return modeIs(a, 'CAS') && spIs(a, 'DRIBBLE', 1) && pvIs(t, 'DRIBBLE', 1)
    case 3: return modeIs(a, 'CAS') && spIs(a, 'BULK', 2) && pvIs(t, 'BULK', 2)
    case 4: return modeIs(a, 'AUTO') && new RegExp(`${escape(VLV)}MODE\\.ACTUAL'='?AUTO'?`).test(t)
  }
  return false
}

export function checkCourse7016BlenderColor(s: Ch5State): StepCheck[] {
  const c = emClass(s, 'BLENDER_COLOR')
  const saved = s.emClasses.BLENDER_COLOR
  const child = c?.children.COLOR_IN_VLV
  const anyLogic = !!c && Object.values(c.commands).some(cmd => cmd.sfc.steps.some(st => st.actions.length > 0))
  const cmdStep = (id: string, n: number, what: string): StepCheck => v(id, commandOk(c, n), `COMMAND_0000${n} ${what} is configured`,
    `Drill into COMMAND_0000${n} and add the step actions and the transition expression (${what})`)
  return [
    v('7016-5c-1', !!s.emCategories.CommandDriven, 'Category CommandDriven exists', 'Right-click Equipment Module Classes → New Category, name it CommandDriven'),
    v('7016-5c-2', c?.category === 'CommandDriven' && c.algorithm === 'Command driven', 'BLENDER_COLOR (Command driven) exists under CommandDriven',
      'Right-click CommandDriven → New Equipment Module Class: BLENDER_COLOR, Algorithm type Command driven'),
    v('7016-5c-3', c?.namedSet === 'EM-vlvnc-2stage', 'Named Set EM-vlvnc-2stage attached (COMMAND_00001 to COMMAND_00004 generated)', 'Browse for the Named Set EM-vlvnc-2stage'),
    v('7016-5c-4', child?.className === '2STAGE_VALVE', 'COLOR_IN_VLV (2STAGE_VALVE) is a child of BLENDER_COLOR',
      'Drag Control Module Classes → NC_Valves → 2STAGE_VALVE onto BLENDER_COLOR and rename 2STAGE_VALV_1 to COLOR_IN_VLV'),
    v('7016-5c-5', !!s.emDrafts.BLENDER_COLOR || anyLogic, 'BLENDER_COLOR opened with Control Studio', 'Right-click BLENDER_COLOR → Open with Control Studio'),
    v('7016-5c-6', anyLogic, 'Command function block logic is being defined', 'Double-click a COMMAND_0000n block to drill down into its SFC'),
    cmdStep('7016-5c-7', 1, 'CLOSE_VLV / VLV_CLOSED'),
    cmdStep('7016-5c-8', 2, 'DRIBBLE_SP / VLV_DRIBBLE'),
    cmdStep('7016-5c-9', 3, 'BULK_SP / VLV_BULK'),
    cmdStep('7016-5c-10', 4, 'AUTO_MODE / ACTUAL_AUTO'),
    v('7016-5c-11', !!saved && !s.emDrafts.BLENDER_COLOR && [1, 2, 3, 4].every(n => commandOk(saved, n)), 'BLENDER_COLOR saved with all four commands',
      'File → Save in Control Studio (all four commands must be complete)')
  ]
}

// ---------------------------------------------------------------------------
// Workshop – BLENDER_OUTLET (pp 5-19 to 5-24)

const ITEMS: [string, string, string][] = [
  ['PRODUCT_MODE', 'PRODUCT_VLV/MODE.TARGET', 'PRODUCT_VLV/MODE.ACTUAL'],
  ['WASTE_MODE', 'WASTE_VLV/MODE.TARGET', 'WASTE_VLV/MODE.ACTUAL'],
  ['PRODUCT_SP', 'PRODUCT_VLV/CAS_SP.CV', 'PRODUCT_VLV/PV.CV'],
  ['WASTE_SP', 'WASTE_VLV/CAS_SP.CV', 'WASTE_VLV/PV.CV']
]
const path = (p: string): string => up(p).replace(/\.CV$/, '')
function itemsOk(c: EmClass | undefined): boolean {
  return !!c && ITEMS.every(([n, w, r]) => c.items.some(i => up(i.name) === n && path(i.write) === path(w) && path(i.readback) === path(r)))
}
const isCas = (x: string | undefined): boolean => /^(CASCADE|CAS)$/.test(up(x ?? ''))
const isAuto = (x: string | undefined): boolean => /^AUTO(MATIC)?$/.test(up(x ?? ''))
const spOf = (x: string | undefined): string => up(x ?? '').replace(/^VLVNC-SP:/, '')
/** Truth table (Step 9): Closed / Draining Waste / Releasing Product in CAS, Auto Mode returns both valves to AUTO. */
function statesOk(c: EmClass | undefined): boolean {
  if (!c) return false
  const st = (v: number): Record<string, string> => c.states[String(v)] ?? {}
  const cas = (r: Record<string, string>): boolean => isCas(r.PRODUCT_MODE) && isCas(r.WASTE_MODE)
  const sp = (r: Record<string, string>, p: string, w: string): boolean => spOf(r.PRODUCT_SP) === p && spOf(r.WASTE_SP) === w
  return cas(st(1)) && sp(st(1), 'CLOSE', 'CLOSE') && cas(st(2)) && sp(st(2), 'CLOSE', 'OPEN') && cas(st(3)) && sp(st(3), 'OPEN', 'CLOSE') &&
    isAuto(st(4).PRODUCT_MODE) && isAuto(st(4).WASTE_MODE)
}

export function checkCourse7016BlenderOutlet(s: Ch5State): StepCheck[] {
  const c = emClass(s, 'BLENDER_OUTLET')
  const saved = s.emClasses.BLENDER_OUTLET
  return [
    v('7016-5o-1', !!s.emCategories.StateDriven, 'Category StateDriven exists', 'Right-click Equipment Module Classes → New Category, name it StateDriven'),
    v('7016-5o-2', c?.category === 'StateDriven' && c.algorithm === 'State driven', 'BLENDER_OUTLET (State driven) exists under StateDriven',
      'Right-click StateDriven → New Equipment Module Class: BLENDER_OUTLET, Algorithm type State driven'),
    v('7016-5o-3', c?.namedSet === 'EM_Outlet_State', 'Named Set EM_Outlet_State attached', 'Browse for the Named Set EM_Outlet_State'),
    v('7016-5o-4', c?.children.PRODUCT_VLV?.className === 'NC_VALVE', 'PRODUCT_VLV (NC_VALVE) added', 'Drag NC_Valves → NC_VALVE onto BLENDER_OUTLET and rename NC_VALVE_1 to PRODUCT_VLV'),
    v('7016-5o-5', c?.children.WASTE_VLV?.className === 'NC_VALVE', 'WASTE_VLV (NC_VALVE) added', 'Drag NC_VALVE again and rename NC_VALVE_1 to WASTE_VLV'),
    v('7016-5o-6', !!s.emDrafts.BLENDER_OUTLET || (c?.items.length ?? 0) > 0, 'BLENDER_OUTLET opened with Control Studio', 'Right-click BLENDER_OUTLET → Open with Control Studio'),
    v('7016-5o-7', (c?.items.length ?? 0) > 0, `${c?.items.length ?? 0} item(s) in the Items area`, 'Right-click in the Items area → Add'),
    v('7016-5o-8', itemsOk(c), 'PRODUCT_MODE, WASTE_MODE, PRODUCT_SP and WASTE_SP items configured', 'Add the four items with their write and readback parameter paths'),
    v('7016-5o-9', statesOk(c), 'State values configured for Closed, Draining Waste, Releasing Product and Auto Mode',
      'States view: CAS + CLOSE/CLOSE, CAS + CLOSE/OPEN (waste), CAS + OPEN/CLOSE (product), Auto/Auto'),
    v('7016-5o-10', !!saved && !s.emDrafts.BLENDER_OUTLET && itemsOk(saved) && statesOk(saved), 'BLENDER_OUTLET saved', 'File → Save in Control Studio')
  ]
}

// ---------------------------------------------------------------------------
// Workshop – BLENDERS Unit Class (pp 5-28 to 5-36)

export const OLD_BLENDER_MODULES = ['AGIT-503', 'AGIT-603', 'MTR-505', 'MTR-605', 'XV-501', 'XV-601', 'XV-502', 'XV-602', 'XV-503', 'XV-603', 'XV-504', 'XV-604']
const BLOCKS: [string, string, 'em' | 'cm'][] = [['BLNDR_COLOR', 'BLENDER_COLOR', 'em'], ['BLNDR_OUTLET', 'BLENDER_OUTLET', 'em'],
  ['AGITATOR', 'AGIT_MTR', 'cm'], ['OUT_PUMP', 'OUT_PMP', 'cm'], ['BASE_IN_VLV', 'NC_VALVE', 'cm']]
const renames = (n: 5 | 6): [string, string][] => [['AGITATOR', `AGIT-${n}03`], ['BASE_IN_VLV', `XV-${n}01`], ['BLNDR_COLOR', `BL_${n}00_COLOR_IN`],
  ['BLNDR_OUTLET', `BL_${n}00_OUTLET`], ['OUT_PUMP', `MTR-${n}05`]]

function unitRenamed(s: Ch5State, n: 5 | 6): string[] {
  const u = s.units[`UM_BL_${n}00`]
  if (!u) return [`UM_BL_${n}00 does not exist`]
  const bad = renames(n).filter(([b, t]) => u.blocks?.[b] !== t).map(([b, t]) => `${b} → ${t}`)
  const color = s.emInstances[`BL_${n}00_COLOR_IN`]
  const outlet = s.emInstances[`BL_${n}00_OUTLET`]
  if (color?.children.COLOR_IN_VLV !== `XV-${n}02`) bad.push(`COLOR_IN_VLV → XV-${n}02`)
  if (outlet?.children.PRODUCT_VLV !== `XV-${n}03`) bad.push(`PRODUCT_VLV → XV-${n}03`)
  if (outlet?.children.WASTE_VLV !== `XV-${n}04`) bad.push(`WASTE_VLV → XV-${n}04`)
  return bad
}

export function checkCourse7016BlendersUnit(s: Ch5State): StepCheck[] {
  const uc = s.unitClasses.BLENDERS
  const blocks = Object.values(uc?.modules ?? {})
  const blockOk = (cls: string): boolean => blocks.some(b => b.className === cls && b.ownership === 'Private' && b.allowVariant)
  const unitBlockTags = new Set(Object.values(s.units).flatMap(u => Object.values(u.blocks ?? {})).filter((t): t is string => !!t))
  const emChildTags = new Set(Object.values(s.emInstances).flatMap(i => Object.values(i.children)))
  const replaced = (t: string): boolean => !s.modules[t] || unitBlockTags.has(t) || emChildTags.has(t)
  const oldGone = OLD_BLENDER_MODULES.filter(t => !replaced(t))
  const oldAssigned = OLD_BLENDER_MODULES.filter(t => !replaced(t) && s.assignments[t])
  const keep = ['LI-504', 'LI-604', 'LEV500-SIM', 'LEV600-SIM'].filter(t => !s.modules[t] && !s.sims[t])
  const blendersUnits = Object.values(s.units).filter(u => u.unitClass === 'BLENDERS')
  const tank = (n: 5 | 6): boolean => path(s.units[`UM_BL_${n}00`]?.aliases.TANK_LEVEL?.path ?? '') === `LI-${n}04/AI1/PV`
  const r5 = unitRenamed(s, 5)
  const r6 = unitRenamed(s, 6)
  const emTags = ['BL_500_COLOR_IN', 'BL_500_OUTLET', 'BL_600_COLOR_IN', 'BL_600_OUTLET']
  const assignedTags = [...emTags, 'XV-502', 'XV-602', 'LI-504', 'LI-604', 'FIC-404', 'MTR-403', 'LI-401']
  const unassigned = assignedTags.filter(t => !s.assignments[t])
  const notDownloaded = emTags.filter(t => !s.emDeployed[t])
  return [
    v('7016-5u-1', oldAssigned.length === 0, 'The old blender modules are no longer assigned to the controller',
      `Physical Network → CTLR1 → Assigned Modules → right-click → Delete Assignment: ${oldAssigned.join(', ')}`),
    v('7016-5u-2', oldGone.length === 0 && keep.length === 0, 'AGIT/MTR/XV blender modules deleted; LI-504, LI-604, LEV500-SIM and LEV600-SIM kept',
      keep.length ? `Do not delete ${keep.join(', ')} (start a new project to recover them)` : `Delete from ED_CENTER_BATCH: ${oldGone.join(', ')}`),
    v('7016-5u-3', Object.values(s.batchCategories).some(c => c.kind === 'unit' && c.name === 'BlenderUnits'), 'Unit Class Category BlenderUnits exists',
      'Right-click Unit Classes → New Category, name it BlenderUnits'),
    v('7016-5u-4', uc?.category === 'BlenderUnits', 'Unit Class BLENDERS exists under BlenderUnits', 'Right-click BlenderUnits → New Unit Class, name it BLENDERS'),
    v('7016-5u-5', blockOk('BLENDER_COLOR') && blockOk('BLENDER_OUTLET'), 'BLENDER_COLOR and BLENDER_OUTLET added (Private, variant allowed)',
      'Drag BLENDER_COLOR and BLENDER_OUTLET onto BLENDERS: Ownership Private, Allow variant checked'),
    v('7016-5u-6', blockOk('AGIT_MTR') && blockOk('OUT_PMP') && blockOk('NC_VALVE'), 'AGIT_MTR, OUT_PMP and NC_VALVE added (Private, variant allowed)',
      'Drag 2StateMotor → AGIT_MTR, 2StateMotor → OUT_PMP and NC_Valves → NC_VALVE onto BLENDERS'),
    v('7016-5u-7', BLOCKS.every(([n, cls, kind]) => uc?.modules?.[n]?.className === cls && uc.modules[n].kind === kind), 'Module blocks renamed BLNDR_COLOR, BLNDR_OUTLET, AGITATOR, OUT_PUMP, BASE_IN_VLV',
      'Right-click each module block under BLENDERS → Rename'),
    v('7016-5u-8', !!uc?.aliases.TANK_LEVEL, 'Alias TANK_LEVEL created on BLENDERS', 'Right-click BLENDERS → New Alias: TANK_LEVEL'),
    v('7016-5u-9', blendersUnits.some(u => u.processCell === 'PAINT_PRODUCTION'), 'A BLENDERS unit module exists in PAINT_PRODUCTION',
      'Drag BLENDERS onto ED_CENTER_BATCH → PAINT_PRODUCTION (create PAINT_PRODUCTION in Chapter 4 first)'),
    v('7016-5u-10', s.units.UM_BL_500?.unitClass === 'BLENDERS', 'UM_BL_500 exists', 'Rename BLENDERS_1 to UM_BL_500'),
    v('7016-5u-11', s.units.UM_BL_600?.unitClass === 'BLENDERS', 'UM_BL_600 exists', 'Drag BLENDERS onto PAINT_PRODUCTION again and rename the unit UM_BL_600'),
    v('7016-5u-12', r5.length === 0, 'UM_BL_500 module instances renamed', `Rename under UM_BL_500: ${r5.join(', ')}`),
    v('7016-5u-13', r6.length === 0, 'UM_BL_600 module instances renamed', `Rename under UM_BL_600: ${r6.join(', ')}`),
    v('7016-5u-14', tank(5) && tank(6), 'TANK_LEVEL resolved to LI-504/AI1/PV.CV and LI-604/AI1/PV.CV', 'Unit module → TANK_LEVEL → Properties: LI-n04/AI1/PV.CV'),
    v('7016-5u-15', s.units.UM_BL_500?.primaryDisplay === 'Process' && s.units.UM_BL_600?.primaryDisplay === 'Process', 'Primary control display is Process on both blender units',
      'UM_BL_500 / UM_BL_600 → Properties → Displays: Primary control display Process'),
    v('7016-5u-16', s.contained['LI-504'] === 'UM_BL_500' && s.contained['LI-604'] === 'UM_BL_600', 'LI-504 and LI-604 are contained in their unit modules',
      'Drag LI-504 onto UM_BL_500 and LI-604 onto UM_BL_600'),
    v('7016-5u-17', unassigned.length === 0, 'ED_CENTER_BATCH and FEED_TANK_AREA are assigned to the controller', `Drag ED_CENTER_BATCH and FEED_TANK_AREA onto CTLR1 (unassigned: ${unassigned.join(', ')})`),
    v('7016-5u-18', notDownloaded.length === 0, 'Controller downloaded; the blender equipment modules are running', `Right-click CTLR1 → Download ▸ Controller (not downloaded: ${notDownloaded.join(', ')})`)
  ]
}

// ---------------------------------------------------------------------------
// Workshop – Verify you can run the process (pp 5-38 / 5-39)

type Range = [number, number]
function episode(s: Ch5State, key: string, pick: (e: TransferLog['episodes'][number]) => number, range: Range, extra?: (e: TransferLog['episodes'][number]) => boolean): { ok: boolean; seen: string } {
  if (s.runSince === null) return { ok: false, seen: 'do the BLENDERS Unit Class workshop and download first' }
  const since = s.runSince
  const eps = (s.transfers[key]?.episodes ?? []).filter(e => (e.at ?? 0) >= since)
  const hit = eps.find(e => pick(e) >= range[0] && pick(e) <= range[1] && (!extra || extra(e)))
  const last = eps.at(-1)
  return { ok: !!hit, seen: last ? `last ${fmt(pick(last))}${extra ? ` at ${fmt(last.avgSp)} GPM` : ''}` : 'not seen yet' }
}
const fmt = (n: number): string => (Math.round(n * 10) / 10).toString()

export function checkCourse7016RunProcess(s: Ch5State): StepCheck[] {
  const fill = (id: string, n: 1 | 2 | 3): StepCheck => {
    const r = episode(s, `TK${n}00 FILL`, e => e.endLevel, [55, 80])
    return v(id, r.ok, `COLOR ${n}00 filled to about 60 gal`, `Open XV-${n}01, close it at 60 gal (${r.seen})`)
  }
  const move = (id: string, key: string, range: Range, good: string, how: string, atSp = false): StepCheck => {
    const r = episode(s, key, e => e.amount, range, atSp ? e => Math.abs(e.avgSp - 90) <= 5 : undefined)
    return v(id, r.ok, good, `${how} (${r.seen})`)
  }
  const agit = episode(s, 'AGIT-503 RUN', e => e.amount, [55, 1e9])
  return [
    fill('7016-5r-1', 1),
    move('7016-5r-2', 'BASE>BL500', [85, 135], '100 gal transferred from BASE 400 to BLENDER 500 at 90 GPM',
      'FIC-404: AUTO, then SP 90; open XV-501, start MTR-403; stop at +100 gal', true),
    move('7016-5r-3', 'TK100>BL500', [42, 75], '50 gal dumped from COLOR 100 to BLENDER 500', 'Open XV-102 and XV-502 (Bulk); close at -50 gal'),
    v('7016-5r-4', agit.ok, 'AGIT-503 ran for at least 1 minute', `Start AGIT-503, stop it after 60 s (${agit.seen} s)`),
    move('7016-5r-5', 'BL500>PRODUCT', [105, 170], '125 gal drained from BLENDER 500 to Product', 'Open XV-503, start MTR-505; stop at -125 gal'),
    fill('7016-5r-6', 2),
    move('7016-5r-7', 'TK200>BL500', [42, 75], '50 gal dumped from COLOR 200 to BLENDER 500', 'Open XV-202 and XV-502 (Bulk); close at -50 gal'),
    move('7016-5r-8', 'BL500>WASTE', [105, 170], '125 gal drained from BLENDER 500 to Waste', 'Open XV-504, start MTR-505; stop at -125 gal'),
    fill('7016-5r-9', 3),
    move('7016-5r-10', 'BASE>BL600', [85, 135], '100 gal transferred from BASE 400 to BLENDER 600 at 90 GPM',
      'FIC-404: AUTO, then SP 90; open XV-601, start MTR-403; stop at +100 gal', true),
    move('7016-5r-11', 'TK300>BL600', [42, 75], '50 gal dumped from COLOR 300 to BLENDER 600', 'Open XV-302 and XV-602 (Bulk); close at -50 gal'),
    move('7016-5r-12', 'BL600>PRODUCT', [85, 140], '100 gal drained from BLENDER 600 to Product', 'Open XV-603, start MTR-605; stop at -100 gal'),
    move('7016-5r-13', 'BL600>WASTE', [20, 50], '25 gal drained from BLENDER 600 to Waste', 'Open XV-604, start MTR-605; stop at -25 gal')
  ]
}

// ---------------------------------------------------------------------------
// Workshop – Verify Equipment Modules (pp 5-40 to 5-50), from the event journal

const completed = (log: EventLogEntry[], tag: string, text: string): boolean => log.some(e => e.tag === tag && e.description.includes(text))

export function checkCourse7016VerifyEms(log: EventLogEntry[]): StepCheck[] {
  const color = (tag: string): boolean[] => [
    completed(log, tag, 'COMMAND_00002 Complete; A_PV = Dribble'),
    completed(log, tag, 'COMMAND_00003 Complete; A_PV = Bulk'),
    completed(log, tag, 'COMMAND_00001 Complete; A_PV = Close'),
    completed(log, tag, 'COMMAND_00004 Complete; A_PV = Auto Mode')
  ]
  const outlet = (tag: string): boolean[] => ['Draining Waste - CAS', 'Releasing Product - CAS', 'Closed - CAS', 'Auto Mode'].map(st => completed(log, tag, `A_PV = ${st}`))
  const c5 = color('BL_500_COLOR_IN')
  const c6 = color('BL_600_COLOR_IN')
  const o5 = outlet('BL_500_OUTLET')
  const o6 = outlet('BL_600_OUTLET')
  const opened = (tag: string): boolean => log.some(e => e.tag === tag)
  return [
    v('7016-5v-1', opened('BL_500_COLOR_IN') || c5.some(Boolean), 'BL_500_COLOR_IN is on-line', 'Right-click BL_500_COLOR_IN → Open with Control Studio → On-line'),
    v('7016-5v-2', c5[0], 'COMMAND_00002 completed; A_PV = Dribble (COLOR_IN_VLV CAS, DRIBBLE)', 'Set A_COMMAND to Dribble'),
    v('7016-5v-3', c5[1], 'COMMAND_00003 completed; A_PV = Bulk (COLOR_IN_VLV CAS, BULK)', 'Set A_COMMAND to Bulk'),
    v('7016-5v-4', c5[2], 'COMMAND_00001 completed; A_PV = Close (COLOR_IN_VLV CAS, CLOSED)', 'Set A_COMMAND to Close'),
    v('7016-5v-5', c5[3], 'COMMAND_00004 completed; A_PV = Auto Mode (COLOR_IN_VLV AUTO)', 'Set A_COMMAND to Auto Mode'),
    v('7016-5v-6', c6.every(Boolean), 'BL_600_COLOR_IN verified', `Repeat for BL_600_COLOR_IN (${c6.filter(Boolean).length}/4 commands completed)`),
    v('7016-5v-7', o5[0], 'A_PV = Draining Waste - CAS (PRODUCT CLOSED, WASTE OPEN, both CAS)', 'Open BL_500_OUTLET on-line and set A_COMMAND to Draining Waste - CAS'),
    v('7016-5v-8', o5[1], 'A_PV = Releasing Product - CAS (PRODUCT OPEN, WASTE CLOSED)', 'Set A_COMMAND to Releasing Product - CAS'),
    v('7016-5v-9', o5[2], 'A_PV = Closed - CAS (both CLOSED)', 'Set A_COMMAND to Closed - CAS'),
    v('7016-5v-10', o5[3], 'A_PV = Auto Mode (both valves AUTO)', 'Set A_COMMAND to Auto Mode'),
    v('7016-5v-11', o6.every(Boolean), 'BL_600_OUTLET verified', `Repeat for BL_600_OUTLET (${o6.filter(Boolean).length}/4 states reached)`)
  ]
}

// ---------------------------------------------------------------------------
// Optional exercises (pp 5-52 / 5-53)

/** Every module a device's interlock/permissive logic reads, following OR/AND/NOT/CND logic blocks upstream. */
function upstream(modules: Record<string, AnyModule>, start: string[]): string[] {
  const seen = new Set<string>()
  const visit = (raw: string | undefined): void => {
    const tag = raw?.split('/')[0].toUpperCase()
    if (!tag || seen.has(tag)) return
    seen.add(tag)
    const m = modules[tag]
    if (m?.type !== 'FB') return
    for (const input of [m.in1, ...(FB_NEEDS_IN2[m.fbType] ? [m.in2] : [])]) if (input.kind === 'ref') visit(input.tag)
    if (m.fbType === 'CND') { const r = conditionReferences(m.expr); if ('references' in r) r.references.forEach(x => visit(x.tag)) }
  }
  start.forEach(visit)
  return [...seen]
}

export function checkCourse7016Ch5Optional(s: Ch5State, log: EventLogEntry[]): StepCheck[] {
  const cms = [5, 6].flatMap(n => [`XV-${n}01`, `XV-${n}02`, `XV-${n}03`, `XV-${n}04`, `AGIT-${n}03`, `MTR-${n}05`])
  const described = (t: string): boolean => log.some(e => e.tag === t && e.description.startsWith('Description changed'))
  const missing = cms.filter(t => !described(t))
  const units = ['UM_BL_500', 'UM_BL_600'].filter(u => !s.units[u]?.description.trim())
  const guarded = (mtr: string, n: 5 | 6): boolean => {
    const m = s.modules[mtr]
    if (m?.type !== 'MOTOR') return false
    const hits = (start: string[]): boolean => upstream(s.modules, start).some(r => r === `XV-${n}03` || r === `XV-${n}04`)
    const interlock = hits([...(m.interlockConditions ?? []).map(c => c.source), ...(m.interlockSource ? [m.interlockSource] : [])])
    // PERMISSIVE_D only acts when the Permissive device option (DEVICE_OPTS) is set.
    const permissive = m.permissiveRequired && hits([...(m.permissiveConditions ?? []).map(c => c.source), ...(m.permissiveSource ? [m.permissiveSource] : [])])
    return interlock || permissive
  }
  return [
    v('7016-5x-1', units.length === 0 && missing.length === 0, 'Descriptions added to the blender unit modules and control modules',
      `Explorer → right-click → Properties → Description: ${[...units, ...missing].join(', ')}`),
    v('7016-5x-2', guarded('MTR-505', 5) && guarded('MTR-605', 6), 'MTR-505 and MTR-605 interlocks/permissives reference their outlet block valves',
      'Open MTR-505 / MTR-605 with Control Studio: add an OR block (Logical Blocks) with IN1 = XV-n03 and IN2 = XV-n04, set PERMISSIVE_SOURCE to it and check the Permissive device option (or add interlock/permissive conditions on XV-n03 / XV-n04)')
  ]
}
