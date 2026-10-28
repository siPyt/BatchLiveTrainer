import { EvalError, evalCondition, runProgram, toNum, truthy, type EvalEnv, type Value } from './phaseExpr'

export interface PhaseBlock {
  type: 'CND' | 'BFI' | 'CALC' | 'TIMER_SEC'
  expression: string
  /** BFI IN_D1..n or CALC IN1..n: the output parameter wired to each input pin, in pin order ('' when unwired). */
  inputs: string[]
  /** CND DISABLE default (True bypasses OUT_D; PRE_OUT_D still follows the expression). */
  disabled: boolean
  /** CND TIME_DURATION in seconds: the expression must stay TRUE this long before OUT_D is set. */
  timeDuration?: number
  /** Extensible parameters (Function Block Reference): BFI inputs IN_D1..n, CALC inputs IN1..n and outputs OUT1..n. Default 2. */
  inCount?: number
  outCount?: number
  /** Diagram position (the Control Studio canvas assigns one on first draw). */
  x?: number
  y?: number
}

export type DiagramBlockType = 'CND' | 'BFI' | 'CALC'
export const DIAGRAM_BLOCK_TYPES: DiagramBlockType[] = ['BFI', 'CALC', 'CND']
/** BFI allows 1-16 inputs; CALC allows 1-16 inputs and 1-16 outputs. */
export const BLOCK_MAX_PINS = 16
export const BFI_MAX_INPUTS = BLOCK_MAX_PINS
export const BLOCK_DEFAULT_PINS = 2

const clampCount = (n: number): number => Math.min(BLOCK_MAX_PINS, Math.max(1, Math.round(n)))
/** Number of input pins; wires saved before the counts existed keep their pins. */
export const inputCount = (block: PhaseBlock): number => clampCount(Math.max(block.inCount ?? BLOCK_DEFAULT_PINS, block.inputs.length))
export const outputCount = (block: PhaseBlock): number => clampCount(block.outCount ?? BLOCK_DEFAULT_PINS)

/** Input pins in drawing order (RESET_IN is written by logic, so it cannot be wired in this simulator). */
export function blockInputPins(block: PhaseBlock): string[] {
  if (block.type === 'BFI') return ['RESET_IN', ...Array.from({ length: inputCount(block) }, (_, i) => `IN_D${i + 1}`)]
  return block.type === 'CALC' ? Array.from({ length: inputCount(block) }, (_, i) => `IN${i + 1}`) : []
}

export function blockOutputPins(block: PhaseBlock): string[] {
  switch (block.type) {
    case 'CND': return ['OUT_D']
    case 'BFI': return ['OUT_D', 'FIRST_OUT', 'OUT_INT']
    case 'CALC': return Array.from({ length: outputCount(block) }, (_, i) => `OUT${i + 1}`)
    case 'TIMER_SEC': return ['OUT_D']
  }
}

/** Index into `inputs` that an input pin reads, or -1 when the pin is not wireable. */
export function inputSlot(block: PhaseBlock, pin: string): number {
  const m = block.type === 'CALC' ? /^IN(\d+)$/.exec(pin) : block.type === 'BFI' ? /^IN_D(\d+)$/.exec(pin) : null
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
  if (slot < 0 || !blockInputPins(dst).includes(to.pin)) return `${to.block}/${to.pin} cannot be connected${slot >= 0 ? `; add inputs with Extensible Parameters` : ' in this simulator'}`
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

/**
 * A new function block named like the DeltaV palette does (CND1, BFI1, CALC1...); without a drop position the canvas places it.
 * Defaults follow the Function Block Reference: BFI and CALC start with two inputs (CALC also two outputs), a CND has an
 * empty expression, DISABLE False and TIME_DURATION 0.
 */
export function newDiagramBlock(type: DiagramBlockType, blocks: Record<string, PhaseBlock>, x?: number, y?: number): { name: string; block: PhaseBlock } {
  let n = 1
  while (blocks[`${type}${n}`]) n++
  const counts = type === 'BFI' ? { inCount: BLOCK_DEFAULT_PINS } : type === 'CALC' ? { inCount: BLOCK_DEFAULT_PINS, outCount: BLOCK_DEFAULT_PINS } : {}
  return { name: `${type}${n}`, block: { type, expression: '', inputs: [], disabled: false, ...counts, ...(x === undefined || y === undefined ? {} : { x, y }) } }
}

/** Extensible Parameters: set the number of BFI inputs or CALC inputs/outputs; wires to pins that no longer exist are removed. */
export function setBlockCounts(blocks: Record<string, PhaseBlock>, name: string, counts: { inCount?: number; outCount?: number }): Record<string, PhaseBlock> | string {
  const b = blocks[name]
  if (!b || (b.type !== 'BFI' && b.type !== 'CALC')) return 'Only BFI and CALC blocks have extensible parameters'
  for (const n of [counts.inCount, counts.outCount]) {
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > BLOCK_MAX_PINS)) return `Use a whole number from 1 to ${BLOCK_MAX_PINS}`
  }
  const next: PhaseBlock = { ...b, inCount: counts.inCount ?? b.inCount ?? BLOCK_DEFAULT_PINS,
    ...(b.type === 'CALC' ? { outCount: counts.outCount ?? b.outCount ?? BLOCK_DEFAULT_PINS } : {}) }
  next.inputs = trimInputs(next.inputs.slice(0, next.inCount))
  const out: Record<string, PhaseBlock> = {}
  for (const [n, blk] of Object.entries(blocks)) {
    const inputs = blk.inputs.map(ref => {
      const p = ref ? parseBlockRef(ref) : null
      return p && p.block === name.toUpperCase() && next.type === 'CALC' && /^OUT(\d+)$/.test(p.pin) && Number(p.pin.slice(3)) > outputCount(next) ? '' : ref
    })
    out[n] = n === name ? next : { ...blk, inputs: trimInputs(inputs) }
  }
  return out
}

export function phaseBlockDefaults(block: PhaseBlock): Record<string, Value> {
  switch (block.type) {
    case 'CND': return { DISABLE: block.disabled ? 1 : 0, TIME_DURATION: block.timeDuration ?? 0, TIMER: 0, PRE_OUT_D: false, OUT_D: false }
    case 'BFI': return { RESET_IN: 0, ARM_TRAP: 1, BCD: 0, OUT_D: false, FIRST_OUT: 0, OUT_INT: 0 }
    case 'CALC': return Object.fromEntries(Array.from({ length: outputCount(block) }, (_, i) => [`OUT${i + 1}`, 0]))
    case 'TIMER_SEC': return { ACTIVE: 0, START: 0, RESET: 0, TIME_DURATION: 0, ELAPSED_TIME: 0, OUT_D: false }
  }
}

/** Binary coded decimal of a BFI's weighted inputs: each group of four inputs is one decimal digit, limited to nine. */
function bcdOf(mask: number): number {
  let out = 0
  for (let d = 0; d < 5; d++) out += Math.min(9, Math.floor(mask / 16 ** d) % 16) * 10 ** d
  return out
}

/** Conditions feed BFI before calculations, regardless of the hierarchy's sort order. */
export function scanPhaseBlocks(blocks: Record<string, PhaseBlock>, env: EvalEnv, dt: number): void {
  const read = (name: string, p: string): Value => env.read(`/${name}/${p}.CV`)
  const write = (name: string, p: string, v: Value): void => env.write(`/${name}/${p}.CV`, v)
  // Parameters added after a phase was loaded are missing from its running copy; they take their defaults.
  const num = (name: string, p: string, fallback: number): number => { try { return toNum(read(name, p)) } catch { return fallback } }
  // Condition: the expression must stay TRUE for TIME_DURATION before PRE_OUT_D is set; DISABLE only bypasses OUT_D.
  // A part of the expression that cannot be resolved makes the whole expression not True.
  for (const [name, b] of Object.entries(blocks)) if (b.type === 'CND') {
    let on = false
    if (b.expression.trim()) { try { on = evalCondition(b.expression, env) } catch { on = false } }
    const timer = on ? num(name, 'TIMER', 0) + dt : 0
    const pre = on && timer >= num(name, 'TIME_DURATION', b.timeDuration ?? 0)
    write(name, 'TIMER', timer)
    write(name, 'PRE_OUT_D', pre)
    write(name, 'OUT_D', pre && !truthy(read(name, 'DISABLE')))
  }
  // Boolean Fan Input: OUT_INT is the binary weighted sum of the inputs (IN_D1 = 1, IN_D2 = 2, IN_D3 = 4 ...). FIRST_OUT traps
  // OUT_INT when it goes from zero to non-zero while ARM_TRAP is non-zero, and RESET_IN clears it. After a reset it stays zero
  // until every input has gone to zero and one has come back.
  for (const [name, b] of Object.entries(blocks)) if (b.type === 'BFI') {
    const reset = truthy(read(name, 'RESET_IN'))
    const mask = b.inputs.slice(0, BLOCK_MAX_PINS).reduce((n, ref, i) => n + (ref && truthy(env.read(ref)) ? 2 ** i : 0), 0)
    const previous = num(name, 'OUT_INT', 0)
    const armed = num(name, 'ARM_TRAP', 1) !== 0
    let first = num(name, 'FIRST_OUT', 0)
    if (reset) first = 0
    else if (armed && previous === 0 && mask !== 0) first = mask
    write(name, 'OUT_D', mask !== 0)
    write(name, 'OUT_INT', mask)
    write(name, 'FIRST_OUT', first)
    write(name, 'BCD', bcdOf(mask))
    if (reset) write(name, 'RESET_IN', 0)
  }
  // Calculation/Logic: IN1..INn and OUT1..OUTn are this block's own pins (the .CV fields), written bare or quoted.
  for (const [name, b] of Object.entries(blocks)) if (b.type === 'CALC') {
    const pin = /^\/?(?:IN_?(\d+)|OUT(\d+))\.CV$/i
    const calcEnv: EvalEnv = {
      ...env,
      read: ref => {
        const m = pin.exec(ref)
        if (!m) return env.read(ref)
        if (m[2]) {
          if (Number(m[2]) > outputCount(b)) throw new EvalError(`${name} has no OUT${m[2]}; add outputs with Extensible Parameters`)
          return read(name, `OUT${m[2]}`)
        }
        if (Number(m[1]) > inputCount(b)) throw new EvalError(`${name} has no IN${m[1]}; add inputs with Extensible Parameters`)
        const ref1 = b.inputs[Number(m[1]) - 1]
        return ref1 ? env.read(ref1) : 0
      },
      write: (ref, v) => {
        const m = pin.exec(ref)
        if (!m) { env.write(ref, v); return }
        if (!m[2]) throw new EvalError(`IN${m[1]} is an input of ${name} and cannot be assigned`)
        if (Number(m[2]) > outputCount(b)) throw new EvalError(`${name} has no OUT${m[2]}; add outputs with Extensible Parameters`)
        write(name, `OUT${m[2]}`, v)
      }
    }
    if (b.expression.trim()) runProgram(b.expression, calcEnv, { calc: true })
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
