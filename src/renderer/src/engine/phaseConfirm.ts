// "Default Expression" on the Confirm tab of an action (course 7016 slide 6-7): builds the confirm expression that
// reads back what the action wrote, e.g.
//   '//#OUT_PUMP#/CAS_SP.CV' := 'mtr2-sp:STOP'   ->  '//#OUT_PUMP#/DC1/PV_D.CV' = 'mtr2-pv:STOPPED'

export interface NamedSetLike { name: string; entries: { name: string; value: number }[] }

type Result = { ok: true; expression: string } | { ok: false; error: string }
const fail = (error: string): Result => ({ ok: false, error })

export function defaultConfirmExpression(action: string, sets: Record<string, NamedSetLike>): Result {
  const m = /^\s*'([^']+)'\s*:=\s*([^;]+?)\s*;?\s*$/.exec(action)
  if (!m) return fail('The default confirm expression needs an action expression with one assignment, for example \'//#OUT_PUMP#/CAS_SP.CV\' := \'mtr2-sp:STOP\';')
  const [, target, rhs] = m
  const slash = target.lastIndexOf('/')
  if (slash < 0) return fail('The action must write a module or equipment module parameter')
  let base = target.slice(0, slash)
  const leaf = target.slice(slash + 1).toUpperCase().replace(/\.CV$/, '')
  if (/\/DC1$/i.test(base)) base = base.slice(0, -4)

  if (leaf === 'A_COMMAND') return { ok: true, expression: `'${base}/A_PV.CV' = ${rhs}` }
  if (leaf === 'MODE.TARGET') return { ok: true, expression: `'${base}/MODE.ACTUAL' = ${rhs}` }
  if (leaf !== 'CAS_SP' && leaf !== 'SP_D') return fail(`No default confirm expression for ${target}. Write the readback comparison yourself.`)

  const named = /^'([^:']+):([^']+)'$/.exec(rhs)
  if (!named) return { ok: true, expression: `'${base}/${leaf === 'CAS_SP' ? 'PV.CV' : 'DC1/PV_D.CV'}' = ${rhs}` }
  const [, setName, state] = named
  const sp = Object.values(sets).find(s => s.name === setName)
  const entry = sp?.entries.find(e => e.name.toUpperCase() === state.toUpperCase())
  if (!sp || !entry) return fail(`Named state ${setName}:${state} was not found`)
  const pvName = /sp$/i.test(setName) ? setName.replace(/sp$/i, 'pv') : setName
  const pv = pvName === setName ? undefined : Object.values(sets).find(s => s.name === pvName)
  const pvState = pv?.entries.find(e => e.value === entry.value)
  if (!pv || !pvState) return fail(`No readback named set (${pvName}) with a state for ${state}; write the confirm expression yourself.`)
  const motor = /^mtr/i.test(setName)
  return { ok: true, expression: `'${base}/${motor ? 'DC1/PV_D.CV' : 'PV.CV'}' = '${pv.name}:${pvState.name}'` }
}
