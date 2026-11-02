import type { Dv09Ctx } from './dv09Registry'
import type { StepCheck } from './workshopChecks'
import { lockScope, type DvGroup, type DvUser, type LockType } from './security'
import type { EventLogEntry } from './types'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** Course DV-09 chapter 8 (pp 8-32 .. 8-34): the two accounts of the Defining Users workshop. */
export const DV09_USERS = {
  operator: { name: 'OperatorA', fullName: 'Alpha Operator', password: 'operatora', area: 'PLANT_AREA_A' },
  supervisor: { name: 'Supervisor1', fullName: 'Sarge Supervisor', password: 'supervisor1' }
} as const

const sameAreas = (scope: ReturnType<typeof lockScope>, areas: string[]): boolean =>
  Array.isArray(scope) && scope.length === areas.length && areas.every(a => scope.includes(a))

/** OperatorA: OPERATE (the Control key) for PLANT_AREA_A only and nothing that tunes. */
export function operatorOk(users: DvUser[], groups: DvGroup[]): boolean {
  const u = users.find(x => x.name === DV09_USERS.operator.name)
  return !!u && u.fullName === DV09_USERS.operator.fullName && u.password === DV09_USERS.operator.password &&
    sameAreas(lockScope(u, groups, 'CONTROL'), [DV09_USERS.operator.area]) && lockScope(u, groups, 'TUNING') === null
}
/** Supervisor1: sitewide TUNE and download capability. */
export function supervisorOk(users: DvUser[], groups: DvGroup[]): boolean {
  const u = users.find(x => x.name === DV09_USERS.supervisor.name)
  return !!u && u.fullName === DV09_USERS.supervisor.fullName && u.password === DV09_USERS.supervisor.password &&
    lockScope(u, groups, 'TUNING') === 'sitewide' && lockScope(u, groups, 'CAN_DOWNLOAD') === 'sitewide'
}

const logons = (events: EventLogEntry[], name: string, after: number): boolean =>
  events.some((e, i) => i > after && e.category === 'SECURITY' && /^User logged on/.test(e.description) && e.tag === name)
const exported = (events: EventLogEntry[], re: RegExp, tag?: RegExp): boolean =>
  events.some(e => e.category === 'CONFIGURE' && re.test(e.description) && (!tag || tag.test(e.tag)))
const hasLock = (u: DvUser | undefined, groups: DvGroup[], lock: LockType): ReturnType<typeof lockScope> => lockScope(u, groups, lock)

/** Course DV-09 Chapter 8 (pp 8-32 .. 8-34, 8-56 .. 8-63): Defining Users, Export and the optional Electronic Signatures workshop. */
export function checkDv09Ch8(ctx: Dv09Ctx): StepCheck[] {
  const { security, system, main } = ctx
  const events = main.eventLog
  const live = { users: security.users, groups: security.groups }
  const ws = security.workstation
  const wsOk = !!ws && !security.workstationPending() && operatorOk(ws.users, ws.groups) && supervisorOk(ws.users, ws.groups)
  const downloadAt = events.findIndex(e => e.tag === 'PROPLUS' && /^Workstation download complete/.test(e.description))
  const logonOp = logons(events, DV09_USERS.operator.name, downloadAt)
  const logonSup = logons(events, DV09_USERS.supervisor.name, downloadAt)
  const wsOperator = ws?.users.find(u => u.name === DV09_USERS.operator.name)
  const wsSupervisor = ws?.users.find(u => u.name === DV09_USERS.supervisor.name)
  const functionality = !!ws && logonOp && logonSup && sameAreas(hasLock(wsOperator, ws.groups, 'CONTROL'), ['PLANT_AREA_A']) && hasLock(wsOperator, ws.groups, 'TUNING') === null &&
    hasLock(wsSupervisor, ws.groups, 'TUNING') === 'sitewide' && hasLock(wsSupervisor, ws.groups, 'CAN_DOWNLOAD') === 'sitewide'

  const pics = events.filter(e => e.category === 'CONFIGURE' && /^Operator Pictures exported to/.test(e.description)).map(e => e.tag.toUpperCase())
  const picture = (name: string): boolean => pics.some(t => t.split(/,\s*/).includes(name))

  const sig = main.signature
  const target = main.sfcs['SFC-T101'] ? 'SFC-T101' : Object.keys(main.sfcs)[0]
  const policyName = target ? sig.modules[target] : undefined
  const policy = policyName ? sig.policies[policyName] : undefined
  const messagePolicy = Object.values(sig.policies).find(p => p.parameters.MESSAGE === 'CONFIRM_VERIFY')
  const area = target ? main.sfcs[target]?.area : undefined

  return [
    check('dv09-8u-1', operatorOk(live.users, live.groups), operatorOk(live.users, live.groups)
      ? 'OperatorA (Alpha Operator): Control key for PLANT_AREA_A only, no tuning' : 'Create OperatorA with the Operate group or Control key for PLANT_AREA_A only (password operatora)'),
    check('dv09-8u-2', supervisorOk(live.users, live.groups), supervisorOk(live.users, live.groups)
      ? 'Supervisor1 (Sarge Supervisor): sitewide Tuning and Can Download' : 'Create Supervisor1 with sitewide Tuning (Tune group) and Can Download (password supervisor1)'),
    check('dv09-8u-3', wsOk, wsOk ? 'The workstation holds both new users and matches the configured security data' : 'Download the workstation (PROPLUS > Download > Workstation) after creating both users'),
    check('dv09-8u-4', downloadAt >= 0 && (logonOp || logonSup), logonOp || logonSup ? 'Logged on as a new user after the workstation download' : 'Lock the workstation and log on as OperatorA or Supervisor1 after the download'),
    check('dv09-8u-5', functionality, functionality ? 'Both users logged on; the workstation gives OperatorA Control in PLANT_AREA_A only and Supervisor1 sitewide Tuning and Can Download' : 'Log on as both new users after the workstation download'),
    check('dv09-8x-1', exported(events, /^Physical Network exported to/, /^Physical Network$/), 'The Physical Network was exported'),
    check('dv09-8x-3', exported(events, /^Control Strategies exported to/, /^Control Strategies$/), 'Control Strategies were exported'),
    check('dv09-8x-4', exported(events, /^Named Sets exported to/, /^NS-T101$/), 'Named Set NS-T101 was exported on its own'),
    check('dv09-8x-5', exported(events, /^Named Sets exported to/, /^phase_failures$/), 'Named Set phase_failures was exported on its own'),
    check('dv09-8x-8', ['OVW_REF', 'TANK101', 'TANK201'].every(picture), ['OVW_REF', 'TANK101', 'TANK201'].every(picture)
      ? 'Ovw_ref, Tank101 and Tank201 were exported' : 'Export the pictures Ovw_ref, Tank101 and Tank201'),
    check('dv09-8o-1', !!system.features.signaturePolicies, system.features.signaturePolicies ? 'Signature policies are enabled in the running system' : 'Enable Electronic Signature policies in System Preferences, then shut down and connect to the server'),
    check('dv09-8o-2', sig.operate && sig.controlStudio, sig.operate && sig.controlStudio ? 'Electronic Signatures are enabled in DeltaV Operate and DeltaV Control Studio' : 'Check Electronic Signatures for DeltaV Operate and DeltaV Control Studio'),
    check('dv09-8o-3', !!messagePolicy, messagePolicy ? `Policy ${messagePolicy.name}: MESSAGE needs confirmation and verification` : 'Create a policy whose MESSAGE parameter needs two signatures'),
    check('dv09-8o-4', !!policy && policy.parameters.MESSAGE === 'CONFIRM_VERIFY' && !!area && sig.areas.includes(area), policy && policy.parameters.MESSAGE === 'CONFIRM_VERIFY' && !!area && sig.areas.includes(area)
      ? `${target} uses policy ${policyName} and its area ${area} is enabled` : 'Enable Electronic Signatures on the Plant Area and associate the MESSAGE policy with SFC-T101')
  ]
}
