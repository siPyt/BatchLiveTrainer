import { evalCondition, runProgram, toNum, truthy, type EvalEnv, type Value } from './phaseExpr'

export interface PhaseBlock {
  type: 'CND' | 'BFI' | 'CALC' | 'TIMER_SEC'
  expression: string
  /** BFI IN_D1..n or CALC IN1: the output parameter wired to each input pin, in pin order ('' when unwired). */
  inputs: string[]
  disabled: boolean
  /** Diagram position (the Control Studio canvas assigns one on first draw). */
  x?: number
  y?: number
}

export type DiagramBlockType = 'CND' | 'BFI' | 'CALC'
export const DIAGRAM_BLOCK_TYPES: DiagramBlockType[] = ['BFI', 'CALC', 'CND']
export const BFI_MAX_INPUTS = 16

/** Input pins in drawing order (RESET_IN is written by logic, so it cannot be wired in this simulator). */
export function blockInputPins(block: PhaseBlock): string[] {
  if (block.type === 'BFI') {
    const used = Math.min(BFI_MAX_INPUTS, Math.max(5, block.inputs.length + 1))
    return ['RESET_IN', ...Array.from({ length: used }, (_, i) => `IN_D${i + 1}`)]
  }
  return block.type === 'CALC' ? ['IN1'] : []
}

export function blockOutputPins(block: PhaseBlock): string[] {
  switch (block.type) {
    case 'CND': return ['OUT_D']
    case 'BFI': return ['OUT_D', 'FIRST_OUT', 'OUT_INT']
    case 'CALC': return ['OUT1']
    case 'TIMER_SEC': return ['OUT_D']
  }
}

/** Index into `inputs` that an input pin reads, or -1 when the pin is not wireable. */
export function inputSlot(block: PhaseBlock, pin: string): number {
  if (block.type === 'CALC') return pin === 'IN1' ? 0 : -1
  const m = block.type === 'BFI' ? /^IN_D(\d+)$/.exec(pin) : null
  return m ? Number(m[1]) - 1 : -1
}

export const blockRef = (block: string, pin: string): string => `/${block}/${pin}.CV`

export function parseBlockRef(ref: string): { block: string; pin: string } | null {
  const m = /^\/?([^/]+)\/([A-Z0-9_]+)\.CV$/i.exec(ref.trim())
  return m ? { block: m[1].toUpperCase(), pin: m[2].toUpperCase() } : null
}

const trimInputs = (inputs: string[]): string[] => {
  const out = [...inputs]
  while (out.length && !out[out.length - 1]) out.pop()
  return out
}

/** Wire an output pin to an input pin; the target keeps one connection per input. */
export function connectBlocks(blocks: Record<string, PhaseBlock>, from: { block: string; pin: string }, to: { block: string; pin: string }): Record<string, PhaseBlock> | string {
  const src = blocks[from.block]
  const dst = blocks[to.block]
  if (!src || !dst) return 'That block no longer exists'
  if (!blockOutputPins(src).includes(from.pin)) return `${from.block}/${from.pin} is not an output`
  const slot = inputSlot(dst, to.pin)
  if (slot < 0) return `${to.block}/${to.pin} cannot be connected in this simulator`
  if (from.block === to.block) return 'A block cannot be connected to itself'
  const inputs = [...dst.inputs]
  while (inputs.length <= slot) inputs.push('')
  inputs[slot] = blockRef(from.block, from.pin)
  return { ...blocks, [to.block]: { ...dst, inputs } }
}

export function disconnectInput(blocks: Record<string, PhaseBlock>, block: string, slot: number): Record<string, PhaseBlock> {
  const b = blocks[block]
  if (!b) return blocks
  const inputs = [...b.inputs]
  inputs[slot] = ''
  return { ...blocks, [block]: { ...b, inputs: trimInputs(inputs) } }
}

/** Rename a block and the wires that read from it. */
export function renameBlock(blocks: Record<string, PhaseBlock>, from: string, to: string): Record<string, PhaseBlock> {
  const out: Record<string, PhaseBlock> = {}
  for (const [name, b] of Object.entries(blocks)) {
    out[name === from ? to : name] = { ...b, inputs: b.inputs.map(ref => {
      const p = ref ? parseBlockRef(ref) : null
      return p && p.block === from.toUpperCase() ? blockRef(to, p.pin) : ref
    }) }
  }
  return out
}

export function deleteBlock(blocks: Record<string, PhaseBlock>, name: string): Record<string, PhaseBlock> {
  const out: Record<string, PhaseBlock> = {}
  for (const [n, b] of Object.entries(blocks)) {
    if (n === name) continue
    out[n] = { ...b, inputs: trimInputs(b.inputs.map(ref => (ref && parseBlockRef(ref)?.block === name.toUpperCase() ? '' : ref))) }
  }
  return out
}

/** A new function block named like the DeltaV palette does (CND1, BFI1, CALC1...); without a drop position the canvas places it. */
export function newDiagramBlock(type: DiagramBlockType, blocks: Record<string, PhaseBlock>, x?: number, y?: number): { name: string; block: PhaseBlock } {
  let n = 1
  while (blocks[`${type}${n}`]) n++
  return { name: `${type}${n}`, block: { type, expression: type === 'CND' ? 'FALSE' : '', inputs: [], disabled: type === 'CND', ...(x === undefined || y === undefined ? {} : { x, y }) } }
}

export function phaseBlockDefaults(block: PhaseBlock): Record<string, Value> {
  switch (block.type) {
    case 'CND': return { DISABLE: block.disabled ? 1 : 0, OUT_D: false }
    case 'BFI': return { RESET_IN: 0, OUT_D: false, FIRST_OUT: 0, OUT_INT: 0 }
    case 'CALC': return { OUT1: 0 }
    case 'TIMER_SEC': return { ACTIVE: 0, START: 0, RESET: 0, TIME_DURATION: 0, ELAPSED_TIME: 0, OUT_D: false }
  }
}

/** Conditions feed BFI before calculations, regardless of the hierarchy's sort order. */
export function scanPhaseBlocks(blocks: Record<string, PhaseBlock>, env: EvalEnv, dt: number): void {
  const read = (name: string, p: string): Value => env.read(`/${name}/${p}.CV`)
  const write = (name: string, p: string, v: Value): void => env.write(`/${name}/${p}.CV`, v)
  for (const [name, b] of Object.entries(blocks)) if (b.type === 'CND') {
    write(name, 'OUT_D', !truthy(read(name, 'DISABLE')) && evalCondition(b.expression, env))
  }
  for (const [name, b] of Object.entries(blocks)) if (b.type === 'BFI') {
    const reset = truthy(read(name, 'RESET_IN'))
    const mask = b.inputs.reduce((n, ref, i) => n + (ref && truthy(env.read(ref)) ? 2 ** i : 0), 0)
    const first = toNum(read(name, 'FIRST_OUT'))
    write(name, 'OUT_D', mask !== 0)
    write(name, 'OUT_INT', mask)
    write(name, 'FIRST_OUT', reset ? 0 : first || mask)
    if (reset) write(name, 'RESET_IN', 0)
  }
  for (const [name, b] of Object.entries(blocks)) if (b.type === 'CALC') {
    const calcEnv: EvalEnv = {
      ...env,
      read: ref => /^\/?(?:IN_?1|OUT1)\.CV$/i.test(ref)
        ? (/OUT1/i.test(ref) ? read(name, 'OUT1') : b.inputs[0] ? env.read(b.inputs[0]) : 0) : env.read(ref),
      write: (ref, v) => /^\/?OUT1\.CV$/i.test(ref) ? write(name, 'OUT1', v) : env.write(ref, v)
    }
    if (b.expression.trim()) runProgram(b.expression, calcEnv)
  }
  for (const [name, b] of Object.entries(blocks)) if (b.type === 'TIMER_SEC') {
    if (truthy(read(name, 'RESET'))) {
      write(name, 'ELAPSED_TIME', 0)
      write(name, 'RESET', 0)
    } else if (truthy(read(name, 'ACTIVE')) && truthy(read(name, 'START'))) {
      write(name, 'ELAPSED_TIME', toNum(read(name, 'ELAPSED_TIME')) + dt)
    }
    write(name, 'OUT_D', toNum(read(name, 'ELAPSED_TIME')) >= toNum(read(name, 'TIME_DURATION')))
  }
}
