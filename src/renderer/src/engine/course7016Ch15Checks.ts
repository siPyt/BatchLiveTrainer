import type { CampaignState } from './campaignManager'
import type { ExecutiveState } from './executive'
import type { StepCheck } from './workshopChecks'

const check = (id: string, ok: boolean, detail: string): StepCheck => ({ id, verdict: ok ? 'verified' : 'pending', detail })

/** Course 7016 Chapter 15 (pp 15-35 .. 15-39): enable and start the Campaign Manager, create a campaign, edit its batches and control it through the modes. */
export function checkCourse7016Ch15(c: Pick<CampaignState, 'enabled' | 'service' | 'campaigns' | 'journal' | 'client' | 'autoRemove'>, x: Pick<ExecutiveState, 'enabled' | 'service' | 'equipmentAt' | 'verify' | 'journal'>): StepCheck[] {
  const text = (re: RegExp): boolean => c.journal.some(j => re.test(j.text))
  const created = c.journal.map(j => /^Campaign (\w+) created with (\d+) batch\(es\) of (\S+); maximum active batches (\d+); base formula (.*); units (.*)$/.exec(j.text)).find(Boolean)
  const name = created?.[1] ?? ''
  const live = c.campaigns[name]
  const idx = (re: RegExp): number => c.journal.findIndex(j => re.test(j.text))
  const lastIdx = (re: RegExp): number => { for (let i = c.journal.length - 1; i >= 0; i--) if (re.test(c.journal[i].text)) return i; return -1 }
  const baseFormula = created?.[5] ?? ''
  const edits = c.journal.map(j => /^Batch (\w+)_(\d+) edited \([^,)]+(?:, formula ([^,)]+))?/.exec(j.text)).filter((m): m is RegExpExecArray => !!m && m[1] === name)
  const editedFormula = (seq: string): string => edits.filter(m => m[2] === seq).map(m => m[3] ?? '').pop() ?? ''
  const batchLog = (suffix: string, re: RegExp): boolean => c.journal.some(j => j.campaign === name && new RegExp(`Batch ${name}_${suffix}.*${re.source}`).test(j.text))
  const removed = c.journal.filter(j => /removed from the Batch Executive/.test(j.text)).length
  return [
    check('7016-15a-1', x.enabled && x.equipmentAt !== null, 'Step 1. The Batch Executive is enabled on this node and its equipment is downloaded'),
    check('7016-15a-2', x.service === 'RUNNING' || x.journal.some(j => /service started/.test(j.text)), 'Steps 2-3. The Batch Executive was started in the Batch Application Manager and the phases verified'),
    check('7016-15a-3', c.enabled && text(/Campaign Manager service started/), 'Step 4. The Campaign Manager is enabled and its service was started on the Campaign Manager tab'),
    check('7016-15b-1', !!created && created[1] === 'InteriorLatex' && created[2] === '2' && created[4] === '1', 'Step 6. A campaign InteriorLatex with 2 batches and a maximum of 1 active batch was created'),
    check('7016-15b-2', !!created && created[3] === 'PRC_PAINT' && /UM_BL_500/.test(created[6]) && /UM_COLOR_100/.test(created[6]) && baseFormula !== '(none)', 'Steps 7-9. PRC_PAINT is the base recipe with units bound to UM_BL_500 and UM_COLOR_100 and a base formula'),
    check('7016-15b-3', !!created && !!editedFormula('02') && editedFormula('02') !== baseFormula, 'Steps 10-11. The second batch was edited to use another formula'),
    check('7016-15b-4', text(/added to campaign/) && !!editedFormula('03') && editedFormula('03') !== baseFormula && editedFormula('03') !== editedFormula('02'), 'Step 12. A third batch was added and edited to use the last of the three formulas'),
    check('7016-15c-1', text(/mode changed to Auto Start/), 'Step 13. The campaign mode was changed to Auto Start'),
    check('7016-15c-2', batchLog('01', /released/) && batchLog('01', /started/) && batchLog('02', /released/), 'Step 14. The first batch went Active-Running and the second Active-Ready (released, not started)'),
    check('7016-15c-3', lastIdx(/mode changed to Manual/) > idx(/mode changed to Auto Start/) && idx(/mode changed to Auto Start/) >= 0, 'Step 16. The campaign was returned to Manual mode'),
    check('7016-15c-4', removed >= 3, 'Steps 17-19. Every batch was removed from the Batch Executive after it completed'),
    check('7016-15c-5', !!name && !live && text(/Campaign \w+ removed/), 'Step 20. The campaign was removed from the list after all its batches completed'),
    check('7016-15o-1', text(/Comment: /), 'Optional. A comment was added to the campaign'),
    check('7016-15o-2', text(/Auto Release/), 'Optional. The Auto Release mode was tried (batches are released but not started)'),
    check('7016-15o-3', c.client.sequenceLength !== 2 || c.client.hideCompleted || c.autoRemove.manual.enabled || c.autoRemove.autoStart.enabled || c.autoRemove.autoRelease.enabled || text(/Client Configuration changed|properties changed/), 'Optional. The Campaign Manager properties or Client Configuration were reviewed or changed')
  ]
}
