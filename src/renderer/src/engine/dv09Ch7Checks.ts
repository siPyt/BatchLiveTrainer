import type { Dv09Ctx } from './dv09Registry'
import type { StepCheck } from './workshopChecks'
import type { EventLogEntry } from './types'
import type { SfcAction, SfcCondition, SfcStep } from './sfc'
import { sfcStepsError } from './sfc'
import { sfcBlockConfigurationError } from './sfcBlocks'
import { sfcParameterError } from './sfcParameters'
import { sfcDraftDirty, sfcNeedsDownload } from './sfcLifecycle'
import { sfcExpressionContext } from './store'
import { changedNamedSets, namedSetTargetKey } from './namedSets'
import { usePictures } from './pictureStore'
import { savedPicture } from './dv09Operate'

// Course DV-09 chapter 7 (Sequential Function Charts, pp 7-1 .. 7-30): live checks of the workshops. Everything is read from the
// named sets, the SFC configuration (draft, saved, deployed), the picture Tank101 and the Event Journal (an SFC that was downloaded
// journals each step it enters and the operator entries of its MESSAGE parameter).

export const SFC = 'SFC-T101'
export const NAMED_SET = 'NS-T101'
const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const up = (text: string | undefined): string => (text ?? '').toUpperCase()
const same = (a: string | undefined, b: string): boolean => up(a) === b

const isNamed = (c: SfcCondition, entry: string): boolean => c.kind === 'namedSet' && c.parameter === 'MESSAGE' && c.namedSet === NAMED_SET && c.entry === entry
const isDiscrete = (c: SfcCondition, tag: string, state: boolean): boolean => c.kind === 'discrete' && same(c.tag, tag) && c.state === state
const isRunning = (c: SfcCondition, running: boolean): boolean => c.kind === 'motorRunning' && same(c.tag, 'MTR-102') && c.running === running
const isOut = (c: SfcCondition, ops: string[], value: number): boolean => c.kind === 'out' && same(c.tag, 'FIC-102') && ops.includes(c.op) && c.value === value
const isAlways = (c: SfcCondition): boolean => c.kind === 'always'

const doAction = (a: SfcAction, on: boolean): boolean => a.kind === 'do' && same(a.tag, 'XV-101') && a.on === on
const motorAction = (a: SfcAction, run: boolean): boolean => a.kind === 'motor' && same(a.tag, 'MTR-102') && a.run === run
const isPrompt = (a: SfcAction): boolean => a.kind === 'namedSet' && a.parameter === 'MESSAGE' && a.namedSet === NAMED_SET && a.entry === 'SELECT SEQUENCE'
const BASE_STATES = ['STARTUP', 'SHUTDOWN', 'SELECT SEQUENCE']

interface Route { condition: SfcCondition; to: string | null }

/** Every module path an SFC expression can name, as TAG/BLOCK/PARAMETER (without .CV): from the structured actions and conditions and from expression text. */
export function sfcPathsUsed(steps: SfcStep[]): Set<string> {
  const out = new Set<string>()
  const text = (t: string): void => {
    for (const m of t.matchAll(/'(?:\^\/|\/\/|\/)?([A-Za-z0-9_$-]+)\/([A-Za-z0-9_/.]+?)(?:\.CV)?'/g)) out.add(`${up(m[1])}/${up(m[2])}`)
  }
  const cond = (c: SfcCondition | undefined): void => {
    if (!c) return
    switch (c.kind) {
      case 'discrete': out.add(`${up(c.tag)}/DI1/PV_D`); break
      case 'motorRunning': case 'valveOpen': out.add(`${up(c.tag)}/DC1/PV_D`); break
      case 'mode': out.add(`${up(c.tag)}/PID1/MODE.ACTUAL`); break
      case 'out': out.add(`${up(c.tag)}/PID1/OUT`); break
      case 'pv': out.add(`${up(c.tag)}/PID1/PV`); out.add(`${up(c.tag)}/AI1/PV`); break
      case 'expression': text(c.text); break
      default: break
    }
  }
  for (const step of steps) {
    cond(step.transition)
    for (const alt of step.alternatives ?? []) cond(alt.condition)
    for (const a of step.actions) {
      cond(a.timingCondition)
      if (a.confirm) { text(a.confirm.expression); if (a.confirm.timeoutExpression) text(a.confirm.timeoutExpression) }
      const tag = 'tag' in a ? up(a.tag) : ''
      switch (a.kind) {
        case 'do': out.add(`${tag}/DO1/SP_D`); break
        case 'motor': case 'valve': out.add(`${tag}/DC1/SP_D`); break
        case 'deviceReset': out.add(`${tag}/DC1/RESET_D`); break
        case 'mode': out.add(`${tag}/PID1/MODE.TARGET`); break
        case 'sp': out.add(`${tag}/PID1/SP`); if (a.expression) text(a.expression); break
        case 'out': out.add(`${tag}/PID1/OUT`); if (a.expression) text(a.expression); break
        default: break
      }
    }
  }
  return out
}

/** The paths of the Parameter Paths workshop (p7-16): the accepted spellings of each line. */
export const PARAMETER_PATHS: { id: string; text: string; paths: string[] }[] = [
  { id: 'dv09-7b-1', text: 'open or close the block valve', paths: ['XV-101/DO1/SP_D'] },
  { id: 'dv09-7b-2', text: 'determine if the block valve is open or closed', paths: ['XVSTAT-101/DI1/PV_D'] },
  { id: 'dv09-7b-3', text: 'start or stop the motor', paths: ['MTR-102/DC1/SP_D', 'MTR-102/DC1/OUT_D'] },
  { id: 'dv09-7b-4', text: 'determine if the motor is running or stopped', paths: ['MTR-102/DC1/PV_D'] },
  { id: 'dv09-7b-5', text: 'set the mode of the flow loop', paths: ['FIC-102/PID1/MODE.TARGET'] },
  { id: 'dv09-7b-6', text: 'set the setpoint of the flow loop', paths: ['FIC-102/PID1/SP'] },
  { id: 'dv09-7b-7', text: 'manipulate the output of the flow loop', paths: ['FIC-102/PID1/OUT'] },
  { id: 'dv09-7b-8', text: 'determine the mode of the flow loop', paths: ['FIC-102/PID1/MODE.ACTUAL'] },
  { id: 'dv09-7b-9', text: 'determine the flow rate', paths: ['FIC-102/PID1/PV', 'FIC-102/AI1/PV'] }
]

export function checkDv09Ch7(ctx: Dv09Ctx): StepCheck[] {
  const { main } = ctx
  const out: StepCheck[] = []
  const events: EventLogEntry[] = main.eventLog
  const life = main.sfcLifecycle[SFC]
  const draft = life?.draft
  const runtime = main.sfcs[SFC]
  const steps: SfcStep[] = draft?.steps ?? runtime?.steps ?? []
  const set = main.namedSets.configured[NAMED_SET]
  const ctl = Object.values(main.hardware.controllers).find(c => c.commissioned)?.tag ?? ''

  const stepNamed = (name: string): SfcStep | undefined => steps.find(s => up(s.name) === name)
  const nameOf = (id: string | null): string => (id === null ? '(end)' : steps.find(s => s.id === id)?.name ?? '(missing)')
  const routes = (step: SfcStep | undefined): Route[] => {
    if (!step) return []
    const index = steps.indexOf(step)
    const primary = step.nextStep === undefined ? steps[index + 1]?.id ?? null : step.nextStep
    return [{ condition: step.transition, to: primary }, ...(step.alternatives ?? []).map(a => ({ condition: a.condition, to: a.nextStep }))]
  }
  const leads = (step: SfcStep | undefined, pred: (c: SfcCondition) => boolean, target: string): boolean =>
    routes(step).some(r => pred(r.condition) && r.to !== null && up(nameOf(r.to)) === target)
  const reachesHold = (from: SfcStep | undefined): boolean => {
    const hold = stepNamed('HOLD_SFC')
    let current = from
    for (let hops = 0; current && hops <= steps.length; hops++) {
      const target = routes(current)[0]?.to
      if (target === null || target === undefined) return false
      if (target === hold?.id) return true
      current = steps.find(s => s.id === target)
    }
    return false
  }
  const missing = (...names: string[]): string => {
    const gone = names.filter(n => !stepNamed(n))
    return gone.length ? `step ${gone.join(', ')} does not exist` : ''
  }
  const draftError = (): string | null => {
    if (!runtime || !draft) return `${SFC} does not exist`
    if (!steps.length) return 'SFC requires at least one step'
    const context = sfcExpressionContext(main, SFC, false)
    return sfcBlockConfigurationError(draft) ?? sfcParameterError(draft.parameters, context.sets) ??
      sfcStepsError(steps, main.modules, { ...context, parameters: draft.parameters ?? {} })
  }

  // ---- Workshop - Using SFC-T101 ------------------------------------------------------------------------------------
  out.push(check('dv09-7c-1', !!set, `Step 1. Named Set ${NAMED_SET} exists${set ? ` (${set.entries.length} states)` : ' (create it in Explorer: System Configuration > Setup > Named Sets)'}`))
  const startup = set?.entries.find(e => e.name === 'STARTUP')
  const prompt = set?.entries.find(e => e.name === 'SELECT SEQUENCE')
  const namedSetOk = !!startup && startup.value === 1 && startup.visible && startup.userSelectable && !!prompt && prompt.value === 255 && prompt.visible && !prompt.userSelectable
  out.push(check('dv09-7c-2', namedSetOk, `Step 2. ${NAMED_SET}: ${set ? set.entries.map(e => `${e.value} = ${e.name} (Visible ${e.visible ? 'Yes' : 'No'}, User Selectable ${e.userSelectable ? 'Yes' : 'No'})`).join('; ') || 'no states' : 'not created'} - needs 1 = STARTUP Yes/Yes and 255 = SELECT SEQUENCE Yes/No`))
  out.push(check('dv09-7c-3', !!runtime && !!life, `Step 3. Sequential Function Chart ${SFC} was created in Control Studio${runtime ? ` (area ${runtime.area})` : ' (File > New, Algorithm type Sequential Function Chart, then Save as SFC-T101)'}`))
  const message = draft?.parameters?.MESSAGE
  out.push(check('dv09-7c-4', message?.type === 'NAMED_SET' && message.namedSet === NAMED_SET,
    `Step 4. Parameter MESSAGE is ${message ? message.type === 'NAMED_SET' ? `a Named Set parameter (${message.namedSet}, default ${set?.entries.find(e => e.value === message.value)?.name ?? message.value})` : 'a Boolean parameter' : 'not created'}`))

  const hold = stepNamed('HOLD_SFC')
  const open = stepNamed('OPEN_BLK_VLV')
  const flow = stepNamed('SET_FLOW_RATE')
  const start = stepNamed('START_PUMP')
  const stop = stepNamed('STOP_PUMP')
  const closeValve = stepNamed('CLOSE_BLK_VLV')
  const closeFlow = stepNamed('CLOSE_FLOW_VLV')
  const end = stepNamed('END_SEQUENCE')
  const promptAction = hold?.actions.find(isPrompt)
  out.push(check('dv09-7c-5a', !!hold && steps[0] === hold && !!promptAction && promptAction.qualifier === 'P',
    `HOLD_SFC is the first step with the action 'MESSAGE' := '${NAMED_SET}:SELECT SEQUENCE' and the qualifier P Pulse${hold ? promptAction ? promptAction.qualifier === 'P' ? '' : ` (the qualifier is ${promptAction.qualifier ?? 'N'}: a Pulse sets the prompt once, N would overwrite the operator's entry)` : ' (the action is missing)' : ' (step HOLD_SFC does not exist)'}`))
  out.push(check('dv09-7c-5b', leads(hold, c => isNamed(c, 'STARTUP'), 'OPEN_BLK_VLV'), `The transition after HOLD_SFC is 'MESSAGE' = '${NAMED_SET}:STARTUP' and leads to OPEN_BLK_VLV${missing('HOLD_SFC', 'OPEN_BLK_VLV')}`))
  out.push(check('dv09-7c-5c', !!open?.actions.some(a => doAction(a, true)), `OPEN_BLK_VLV opens the block valve XV-101 ('//XV-101/DO1/SP_D.CV' := 1)${missing('OPEN_BLK_VLV') ? ' - ' + missing('OPEN_BLK_VLV') : ''}`))
  out.push(check('dv09-7c-5d', leads(open, c => isDiscrete(c, 'XVSTAT-101', true), 'SET_FLOW_RATE'), `The transition after OPEN_BLK_VLV waits for XVSTAT-101 to be open ('//XVSTAT-101/DI1/PV_D.CV' = 1) and leads to SET_FLOW_RATE`))
  out.push(check('dv09-7c-5e', !!flow?.actions.some(a => a.kind === 'sp' && same(a.tag, 'FIC-102') && a.value === 50 && a.expression === undefined), `SET_FLOW_RATE sets the flow rate of FIC-102 to 50 ('//FIC-102/PID1/SP.CV' := 50)${missing('SET_FLOW_RATE') ? ' - ' + missing('SET_FLOW_RATE') : ''}`))
  out.push(check('dv09-7c-5f', leads(flow, c => isOut(c, ['>', '>='], 30), 'START_PUMP'), `The transition after SET_FLOW_RATE waits for the flow valve to be > 30 % open ('//FIC-102/PID1/OUT.CV' > 30) and leads to START_PUMP`))
  out.push(check('dv09-7c-5g', !!start?.actions.some(a => motorAction(a, true)), `START_PUMP starts the pump MTR-102 ('//MTR-102/DC1/SP_D.CV' := 'mtr2-sp:START')${missing('START_PUMP') ? ' - ' + missing('START_PUMP') : ''}`))
  out.push(check('dv09-7c-5h', !!start && isRunning(start.transition, true) && reachesHold(start), `The transition after START_PUMP waits for the pump to start ('//MTR-102/DC1/PV_D.CV' = 'mtr2-pv:RUNNING') and the sequence returns to HOLD_SFC`))

  const assigned = draft?.controllerTag ?? ''
  out.push(check('dv09-7c-6', !!draft && !!main.hardware.controllers[assigned]?.commissioned, `Step 6. Module Properties: ${SFC} is assigned to ${assigned || 'no controller'}${ctl && !assigned ? ` (use ${ctl})` : ''}`))
  out.push(check('dv09-7c-7', !!life?.saved && !!life.deployed, `Step 7. ${SFC} was ${life?.saved ? 'saved' : 'not saved'} and ${life?.deployed ? `downloaded to ${life.deployed.controllerTag}` : 'not downloaded'}${life && sfcNeedsDownload(life) && life.deployed ? ' (changed since; download again)' : ''}`))
  const error = draftError()
  out.push(check('dv09-7c-8', !!runtime && steps.length > 0 && error === null, `Step 8. Check: ${!runtime ? `${SFC} does not exist` : error === null ? 'no algorithm errors in the SFC' : error}`))

  const pictures = usePictures.getState().pictures
  const tank = pictures.TANK101
  const link = (p: typeof tank | null): boolean => !!p?.elements.some(e => e.type === 'datalink' && same(e.tag, SFC) && up(e.path) === 'MESSAGE' && e.entry?.method === 'NAMED_SET')
  const savedTank = savedPicture(tank)
  out.push(check('dv09-7c-9', link(savedTank), `Step 9. The picture Tank101 ${link(tank) ? link(savedTank) ? 'has the MESSAGE datalink (DVSYS.SFC-T101/MESSAGE.F_CV) with Named Set data entry' : 'has the datalink but is not saved (File > Save)' : tank ? 'has no MESSAGE datalink with data entry yet' : 'does not exist'}`))
  const stationSets = main.namedSets.deployed[namedSetTargetKey({ kind: 'workstation' })] ?? {}
  const ctlChanged = ctl ? changedNamedSets(main.namedSets, { kind: 'controller', tag: assigned || ctl }) : []
  const wsChanged = changedNamedSets(main.namedSets, { kind: 'workstation' })
  out.push(check('dv09-7c-9n', !!set && Object.hasOwn(stationSets, NAMED_SET) && !wsChanged.includes(NAMED_SET) && !ctlChanged.includes(NAMED_SET),
    `Changed Setup Data: ${NAMED_SET} ${!set ? 'does not exist' : wsChanged.includes(NAMED_SET) || !Object.hasOwn(stationSets, NAMED_SET) ? 'is not downloaded to the workstation' : ctlChanged.includes(NAMED_SET) ? 'is not downloaded to the controller' : 'is downloaded to the workstation and the controller'}`))

  const journal = events.filter(e => e.tag === SFC)
  /** Index of the first journal entry after `after` matching `re`; -1 when none. */
  const at = (re: RegExp, after = -1): number => journal.findIndex((e, i) => i > after && re.test(e.description))
  const runOf = (command: string, names: string[], lastNames: string[]): number => {
    let i = at(new RegExp(`^MESSAGE := ${NAMED_SET}:${command} `))
    for (const name of names) { if (i < 0) return -1; i = at(new RegExp(`^SFC step ${name} active$`), i) }
    if (i < 0) return -1
    for (const name of lastNames) { const j = at(new RegExp(`^SFC step ${name} active$`), i); if (j >= 0) return j }
    return -1
  }
  const startupRun = runOf('STARTUP', ['OPEN_BLK_VLV', 'SET_FLOW_RATE', 'START_PUMP'], ['HOLD_SFC', 'END_SEQUENCE'])
  out.push(check('dv09-7c-10', startupRun >= 0, `Step 10. ${startupRun >= 0 ? 'The Event Journal shows STARTUP entered by the operator and the steps OPEN_BLK_VLV, SET_FLOW_RATE and START_PUMP executed' : 'No complete startup run in the Event Journal: in DeltaV Operate (Run) enter STARTUP on the MESSAGE datalink of Tank101 and let the sequence run'}`))

  // ---- Workshop - Startup & Shutdown (the figure of p7-25) -------------------------------------------------------------
  const e: StepCheck[] = []
  e.push(check('dv09-7e-1', !!hold && leads(hold, c => isNamed(c, 'STARTUP'), 'OPEN_BLK_VLV') && leads(hold, c => isNamed(c, 'SHUTDOWN'), 'STOP_PUMP'),
    `HOLD_SFC has two paths: wait for the STARTUP message (to OPEN_BLK_VLV) and wait for the SHUTDOWN message (to STOP_PUMP)${missing('HOLD_SFC', 'OPEN_BLK_VLV', 'STOP_PUMP') ? ' - ' + missing('HOLD_SFC', 'OPEN_BLK_VLV', 'STOP_PUMP') : ''}`))
  e.push(check('dv09-7e-2', !!open?.actions.some(a => doAction(a, true)), 'OPEN_BLK_VLV opens the block valve XV-101'))
  e.push(check('dv09-7e-3', leads(open, c => isDiscrete(c, 'XVSTAT-101', true), 'SET_FLOW_RATE'), 'Wait for block valve to open XVSTAT-101 (leads to SET_FLOW_RATE)'))
  e.push(check('dv09-7e-4', !!flow?.actions.some(a => a.kind === 'sp' && same(a.tag, 'FIC-102') && a.value === 50), 'SET_FLOW_RATE sets the flow rate of FIC-102 to 50'))
  e.push(check('dv09-7e-5', leads(flow, c => isOut(c, ['>', '>='], 30), 'START_PUMP'), 'Wait for flow valve to be > 30 % open (leads to START_PUMP)'))
  e.push(check('dv09-7e-6', !!start?.actions.some(a => motorAction(a, true)), 'START_PUMP starts the pump MTR-102'))
  e.push(check('dv09-7e-7', leads(start, c => isRunning(c, true), 'END_SEQUENCE'), 'Wait for pump to start (leads to END_SEQUENCE)'))
  e.push(check('dv09-7e-8', !!stop?.actions.some(a => motorAction(a, false)), 'STOP_PUMP stops the pump MTR-102'))
  e.push(check('dv09-7e-9', leads(stop, c => isRunning(c, false), 'CLOSE_BLK_VLV'), 'Wait for pump to stop (leads to CLOSE_BLK_VLV)'))
  e.push(check('dv09-7e-10', !!closeValve?.actions.some(a => doAction(a, false)), 'CLOSE_BLK_VLV closes the block valve XV-101'))
  e.push(check('dv09-7e-11', leads(closeValve, c => isDiscrete(c, 'XVSTAT-101', false), 'CLOSE_FLOW_VLV'), 'Wait for block valve XVSTAT-101 to close (leads to CLOSE_FLOW_VLV)'))
  e.push(check('dv09-7e-12', !!closeFlow?.actions.some(a => a.kind === 'mode' && same(a.tag, 'FIC-102') && a.mode === 'MAN') && !!closeFlow.actions.some(a => a.kind === 'out' && same(a.tag, 'FIC-102') && a.value === 0 && a.expression === undefined),
    'CLOSE_FLOW_VLV sets the mode of FIC-102 to MAN and OUT of FIC-102 to 0 %'))
  e.push(check('dv09-7e-13', leads(closeFlow, c => isOut(c, ['<', '<='], 2), 'END_SEQUENCE'), 'Wait for flow valve to be < 2 % open (leads to END_SEQUENCE)'))
  e.push(check('dv09-7e-14', !!end && end.actions.length === 0 && isAlways(end.transition) && reachesHold(end), 'END_SEQUENCE has no action and the transition True leads back to HOLD_SFC'))
  out.push(...e)
  const figureDone = e.every(c => c.verdict === 'verified')

  // ---- Workshop - Modifying SFC-T101 -------------------------------------------------------------------------------------
  const shutdown = set?.entries.find(e => e.name.toUpperCase() === 'SHUTDOWN')
  out.push(check('dv09-7d-1', !!shutdown && shutdown.visible && shutdown.userSelectable, `Step 1. ${NAMED_SET} ${shutdown ? `has the state ${shutdown.name} = ${shutdown.value} (Visible ${shutdown.visible ? 'Yes' : 'No'}, User Selectable ${shutdown.userSelectable ? 'Yes' : 'No'})` : 'has no SHUTDOWN state yet'}`))
  out.push(check('dv09-7d-2', figureDone, `Step 2. The chart ${figureDone ? 'has the startup and shutdown paths of the figure on p7-25' : `still lacks ${e.filter(c => c.verdict !== 'verified').length} of the 14 boxes of the figure (see the workshop Startup & Shutdown)`}`))
  const deployedSteps = life?.deployed?.steps ?? []
  const controllerSet = ((life?.deployed ? main.namedSets.deployed[namedSetTargetKey({ kind: 'controller', tag: life.deployed.controllerTag })] : undefined) ?? {})[NAMED_SET]
  const downloaded = !!life && !!life.saved && !!life.deployed && !sfcNeedsDownload(life) && !sfcDraftDirty(life) &&
    deployedSteps.some(s => up(s.name) === 'STOP_PUMP') && !!controllerSet?.entries.some(en => en.name.toUpperCase() === 'SHUTDOWN')
  out.push(check('dv09-7d-3', downloaded, `Step 3. ${!life?.deployed ? `${SFC} is not downloaded` : downloaded ? `The modified ${SFC} (with the shutdown path) is downloaded to ${life.deployed.controllerTag}` : sfcDraftDirty(life) ? 'The edits are not saved yet' : sfcNeedsDownload(life) ? 'The controller still runs the previous version: Save and Download again' : 'The downloaded SFC does not have the shutdown path and the SHUTDOWN state in the controller'}`))
  out.push(check('dv09-7d-4', !!runtime && deployedSteps.length > 0 && error === null && !!stop, `Step 4. Check: ${error === null ? stop ? 'no algorithm errors in the modified SFC' : 'the chart has no shutdown path yet' : error}`))
  const shutdownRun = runOf('SHUTDOWN', ['STOP_PUMP', 'CLOSE_BLK_VLV', 'CLOSE_FLOW_VLV'], ['END_SEQUENCE'])
  const startupEnd = runOf('STARTUP', ['OPEN_BLK_VLV', 'SET_FLOW_RATE', 'START_PUMP', 'END_SEQUENCE'], ['HOLD_SFC'])
  out.push(check('dv09-7d-5', shutdownRun >= 0 && startupEnd >= 0, `Step 5. The Event Journal ${startupEnd >= 0 ? 'shows a STARTUP run through END_SEQUENCE' : 'has no STARTUP run through END_SEQUENCE'} and ${shutdownRun >= 0 ? 'a SHUTDOWN run (STOP_PUMP, CLOSE_BLK_VLV, CLOSE_FLOW_VLV, END_SEQUENCE)' : 'no SHUTDOWN run (STOP_PUMP, CLOSE_BLK_VLV, CLOSE_FLOW_VLV, END_SEQUENCE)'}`))

  // ---- Workshop - Parameter Paths --------------------------------------------------------------------------------------
  const used = new Set<string>()
  for (const configuration of [draft, life?.saved, life?.deployed]) if (configuration) for (const p of sfcPathsUsed(configuration.steps)) used.add(p)
  for (const entry of events) {
    const m = entry.description.match(/^Expression Assistant: browsed (.+)$/)
    if (m) used.add(up(m[1].replace(/^'?(\^\/|\/\/|\/)?/, '').replace(/'$/, '').replace(/\.CV$/i, '')))
  }
  const pathChecks = PARAMETER_PATHS.map(p => {
    const hit = p.paths.find(path => used.has(path))
    return check(p.id, !!hit, `${p.text[0].toUpperCase()}${p.text.slice(1)}: ${hit ? `//${hit}.CV is used in an SFC expression or was picked in the Expression Assistant Browser` : `use or browse ${p.paths.map(x => `//${x}`).join(' or ')} (Expression Assistant > Browser)`}`)
  })
  out.push(...pathChecks)

  // ---- Workshop - Using SFCs (overview) ------------------------------------------------------------------------------------
  const verdict = (id: string): boolean => out.find(c => c.id === id)?.verdict === 'verified'
  const pathsDone = pathChecks.every(c => c.verdict === 'verified')
  out.push(check('dv09-7a-1', pathsDone, `Task 1. Parameter paths: ${pathChecks.filter(c => c.verdict === 'verified').length} of ${pathChecks.length} defined (workshop Parameter Paths)`))
  out.push(check('dv09-7a-2', verdict('dv09-7c-1') && verdict('dv09-7c-2'), `Task 2. Named Set ${NAMED_SET} ${verdict('dv09-7c-1') && verdict('dv09-7c-2') ? 'is created with STARTUP and SELECT SEQUENCE' : 'is not complete (Using SFC-T101 steps 1 and 2)'}`))
  const sfcIds = ['dv09-7c-3', 'dv09-7c-4', 'dv09-7c-5a', 'dv09-7c-5b', 'dv09-7c-5c', 'dv09-7c-5d', 'dv09-7c-5e', 'dv09-7c-5f', 'dv09-7c-5g', 'dv09-7c-5h', 'dv09-7c-6', 'dv09-7c-7', 'dv09-7c-8']
  out.push(check('dv09-7a-3', sfcIds.every(verdict), `Task 3. ${SFC} ${sfcIds.every(verdict) ? 'is built, assigned, saved, downloaded and checked' : `is not complete (${sfcIds.filter(id => !verdict(id)).length} of ${sfcIds.length} checks of Using SFC-T101 pending)`}`))
  out.push(check('dv09-7a-4', verdict('dv09-7c-9'), `Task 4. The Named Set ${verdict('dv09-7c-9') ? 'MESSAGE is displayed to the operator on Tank101' : 'MESSAGE is not on the operator display yet (Using SFC-T101 step 9)'}`))

  // ---- Optional Exercises -------------------------------------------------------------------------------------------------
  const extra = (set?.entries ?? []).filter(en => !BASE_STATES.includes(en.name.toUpperCase()))
  out.push(check('dv09-7f-1', extra.length > 0, `Hint 1. ${NAMED_SET} has ${extra.length} state(s) beyond STARTUP, SHUTDOWN and SELECT SEQUENCE${extra.length ? ` (${extra.map(en => en.name).join(', ')})` : ''}`))
  const waitSteps = steps.filter(s => s !== hold && s !== end)
  const noMessage = waitSteps.filter(s => !s.actions.some(a => a.kind === 'namedSet' && a.parameter === 'MESSAGE' && !BASE_STATES.includes(up(a.entry))))
  out.push(check('dv09-7f-2', waitSteps.length > 0 && noMessage.length === 0, `Hint 2. ${waitSteps.length === 0 ? 'The chart has no steps to update' : noMessage.length ? `Steps without a MESSAGE update: ${noMessage.map(s => s.name).join(', ')}` : `Every step between the prompt and END_SEQUENCE (${waitSteps.length}) updates MESSAGE`}`))
  const levelTags = Object.values(main.modules).filter(m => m.type === 'AI').map(m => m.tag)
  const readsLevel = steps.some(s => [s.transition, ...(s.alternatives ?? []).map(a => a.condition)].some(c =>
    c.kind === 'pv' && levelTags.includes(up(c.tag)) || c.kind === 'expression' && [...c.text.matchAll(/'(?:\^\/|\/\/|\/)?([A-Za-z0-9_$-]+)\//g)].some(m => levelTags.includes(up(m[1])))))
  out.push(check('dv09-7g-1', readsLevel, `The startup waits for the level of Tank101: ${readsLevel ? 'a transition reads the level module' : `no transition reads a level (analog input) module${levelTags.length ? ` such as ${levelTags.join(', ')}` : ''}`}`))
  const resets = steps.some(s => s.actions.some(a => a.kind === 'deviceReset' && same(a.tag, 'MTR-102') && a.reset))
  out.push(check('dv09-7g-2', resets, `The lock of MTR-102 is reset in the startup: ${resets ? 'an action writes //MTR-102/DC1/RESET_D.CV' : "no action resets MTR-102 ('//MTR-102/DC1/RESET_D.CV' := 1)"}`))
  const types = Object.keys(draft?.alarmTypes ?? {})
  const blocks = Object.entries(draft?.blocks ?? {})
  const alarms = Object.entries(draft?.alarms ?? {})
  out.push(check('dv09-7h-1', types.length > 0, `Hint 1. Alarm Type: ${types.length ? types.join(', ') : 'none defined'}`))
  out.push(check('dv09-7h-2', alarms.length > 0, `Hint 2. SFC alarm: ${alarms.length ? alarms.map(([n, a]) => `${n} (${a.type} on ${a.block})`).join(', ') : 'none defined'}`))
  out.push(check('dv09-7h-3', blocks.length > 0 && alarms.some(([, a]) => !!draft?.blocks?.[a.block]), `Hint 3. Function block: ${blocks.length ? blocks.map(([n, b]) => `${n} (action time ${b.op} ${b.seconds} s)`).join(', ') : 'none defined'}`))
  const started = steps.find(s => s.actions.some(a => a.kind === 'block'))
  out.push(check('dv09-7h-4', !!started, `Hint 4. Non-Boolean action: ${started ? `step ${started.name} starts the function block` : 'no step starts the function block'}`))
  return out
}
