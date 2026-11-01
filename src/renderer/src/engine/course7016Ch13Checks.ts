import type { VcState } from './versionControl'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })
const FIC = 'Module:FIC-404'

export type Ch13State = Pick<VcState, 'enabled' | 'displays' | 'preference' | 'authorization' | 'signers' | 'items' | 'snapshots' | 'messages' | 'signatures'>

/** Course 7016 Chapter 13 (pp 13-59 .. 13-65): enable Version Control, Show History / Show Differences / Rollback on FIC-404, and take a snapshot. */
export function checkCourse7016Ch13(s: Ch13State, downloaded: string[] = []): StepCheck[] {
  const it = s.items[FIC]
  const params = (v: { content: string } | undefined): number => { try { return (JSON.parse(v?.content ?? '{}') as { inputParams?: string[] }).inputParams?.length ?? 0 } catch { return 0 } }
  const text = (re: RegExp): boolean => s.messages.some(m => re.test(m.text))
  const v1 = it?.versions[0]
  const edited = it?.versions.find(v => v.n > 1 && params(v) >= 2)
  const last = it?.versions[it.versions.length - 1]
  const everEnabled = !!it && it.versions.length > 0
  const allAuthorized = (r: string): boolean => s.authorization && s.signers.length > 0 && s.signers.every(g => s.signatures[r]?.[g.name]?.approved)
  return [
    check('7016-13a-1', s.enabled || everEnabled, 'Version Control is enabled in the Database Administrator (Version Control Configuration) and the database was synchronized'),
    check('7016-13a-2', everEnabled && (s.enabled ? text(/Version Control enabled/) : true), 'The Database Server was connected again (File > Connect to Server) and the Version Control database holds FIC-404'),
    check('7016-13b-1', text(/FIC-404 checked out/), 'Step 1. FIC-404 was checked out when it was opened with Control Studio'),
    check('7016-13b-2', !!edited, 'Steps 2-6. Two Input Parameters were added to the FIC-404 diagram (not wired) and the module was saved'),
    check('7016-13b-3', !!edited && edited.comment.trim().length > 0 && !!v1, 'Steps 8-11. FIC-404 was checked in with a comment; Show History lists the new version and Details shows the comment'),
    check('7016-13b-4', text(/FIC-404 rolled back to version/), 'Steps 12-13. The previous version of FIC-404 was rolled back from the history window'),
    check('7016-13b-5', !!it && it.versions.length >= 3 && !!last && params(last) < params(edited) && it.checkedOutBy === null, 'Steps 14-17. FIC-404 was checked in again after the rollback: a newer version exists without the extra parameters'),
    check('7016-13c-1', s.snapshots.length > 0, 'Take a snapshot. Step 2. A Version Control snapshot of the configuration was created'),
    check('7016-13c-2', s.snapshots.length > 0 && text(/Version Control disabled/), 'Take a snapshot. Steps 4-5. Version Control was disabled again in the Version Control Configuration'),
    check('7016-13r-1', s.authorization && s.signers.length >= 1, 'Optional. Recipe authorization is enabled and a signer is configured (Signers... > Add)'),
    check('7016-13r-2', s.authorization && downloaded.some(allAuthorized), 'Optional. A recipe was approved by every signer and then downloaded to the Batch Executive'),
    check('7016-13p-1', text(/Check out preference changed to Auto Check Out/), 'Optional. The check out preference was changed (Version Control Preferences)')
  ]
}
