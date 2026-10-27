// DeltaV phase-logic expression language (course 7016 pp 4-20..4-23): assignments
// ('ref' := expr;), comparisons, AND/OR/NOT, arithmetic and string concatenation,
// single-quoted parameter references (/, ^/, //, #ALIAS#), named-set states
// ('vlvnc-sp:OPEN'), double-quoted strings, SELSTR and LOGEVENT.

export type Value = number | string | boolean

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ident'; v: string }
  | { k: 'ref'; v: string }
  | { k: 'named'; set: string; state: string }
  | { k: 'un'; op: '-' | 'NOT'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] }
  | { k: 'choose'; condition: Node; yes: Node; no: Node }

export type Statement = { k: 'assign'; target: string; expr: Node } | { k: 'expr'; expr: Node }
  | { k: 'if'; condition: Node; yes: Statement[]; no: Statement[] }

export interface Program { statements: Statement[] }

type Tok = { t: 'num' | 'str' | 'quoted' | 'ident' | 'op'; v: string; pos: number }

const OPS = [':=', '<=', '>=', '!=', '<>', '=', '<', '>', '+', '-', '*', '/', '(', ')', ',', ';', '?', ':']
export const MODE_WORDS = ['CAS', 'AUTO', 'MAN', 'OOS', 'RCAS', 'ROUT', 'LO', 'IMAN']
const KEYWORDS = ['AND', 'OR', 'NOT', 'TRUE', 'FALSE']

function tokenize(rawSrc: string): Tok[] {
  // Text copied from the course PDF or a web page carries typographic characters: curly quotes and the modifier
  // letter U+02C6 in place of ^. Each maps to a single character, so error positions stay accurate.
  const src = rawSrc.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u02C6/g, '^')
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (src.startsWith('(*', i)) {
      const end = src.indexOf('*)', i + 2)
      if (end < 0) throw new SyntaxError(`Unterminated comment at position ${i + 1}`)
      i = end + 2
      continue
    }
    if (/^REM\b/i.test(src.slice(i)) && (i === 0 || src[i - 1] === '\n')) {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? src.length : nl + 1
      continue
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1)
      if (end < 0) throw new SyntaxError(`Unterminated ${c === "'" ? 'parameter reference' : 'string'} at position ${i + 1}`)
      out.push({ t: c === "'" ? 'quoted' : 'str', v: src.slice(i + 1, end), pos: i })
      i = end + 1
      continue
    }
    const num = /^\d+(\.\d+)?([eE][-+]?\d+)?/.exec(src.slice(i))
    if (num) { out.push({ t: 'num', v: num[0], pos: i }); i += num[0].length; continue }
    const id = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(src.slice(i))
    if (id) { out.push({ t: 'ident', v: id[0], pos: i }); i += id[0].length; continue }
    const op = OPS.find(o => src.startsWith(o, i))
    if (!op) throw new SyntaxError(`Unexpected character '${c}' at position ${i + 1}`)
    out.push({ t: 'op', v: op, pos: i })
    i += op.length
  }
  return out
}

/** Like DeltaV, add the closing ';' after the last token when it is missing (trailing comments stay after it). */
export function ensureTrailingSemicolon(src: string): string {
  let toks: Tok[]
  try { toks = tokenize(src) } catch { return src }
  const last = toks[toks.length - 1]
  if (!last || (last.t === 'op' && last.v === ';')) return src
  const end = last.pos + last.v.length + (last.t === 'quoted' || last.t === 'str' ? 2 : 0)
  return src.slice(0, end) + ';' + src.slice(end)
}

class Parser {
  private i = 0
  constructor(private toks: Tok[]) {}
  private peek(): Tok | undefined { return this.toks[this.i] }
  private isOp(v: string): boolean { const t = this.peek(); return !!t && t.t === 'op' && t.v === v }
  private isWord(v: string): boolean { const t = this.peek(); return !!t && t.t === 'ident' && t.v.toUpperCase() === v }
  private expectOp(v: string): void {
    const t = this.peek()
    if (!t || t.t !== 'op' || t.v !== v) throw new SyntaxError(`Expected '${v}'${t ? ` at position ${t.pos + 1}` : ' at end of expression'}`)
    this.i++
  }
  done(): boolean { return this.i >= this.toks.length }

  program(): Program {
    const statements: Statement[] = []
    while (!this.done()) {
      if (this.isOp(';')) { this.i++; continue }
      statements.push(this.statement())
      if (!this.done()) this.expectOp(';')
    }
    return { statements }
  }

  statement(): Statement {
    const t = this.peek()
    if (this.isWord('IF')) {
      this.i++
      const condition = this.expr()
      if (!this.isWord('THEN')) throw new SyntaxError('Expected THEN')
      this.i++
      const branch = (): Statement[] => {
        const rows: Statement[] = []
        while (!this.done() && !this.isWord('ELSE') && !this.isWord('ENDIF')) {
          rows.push(this.statement())
          if (this.isOp(';')) this.i++
          else if (!this.isWord('ELSE') && !this.isWord('ENDIF')) this.expectOp(';')
        }
        return rows
      }
      const yes = branch()
      const no: Statement[] = this.isWord('ELSE') ? (this.i++, branch()) : []
      if (!this.isWord('ENDIF')) throw new SyntaxError('Expected ENDIF')
      this.i++
      return { k: 'if', condition, yes, no }
    }
    if (t?.t === 'ident' && !KEYWORDS.includes(t.v.toUpperCase()) && this.toks[this.i + 1]?.t === 'op' && this.toks[this.i + 1].v === ':=')
      throw new SyntaxError(`${t.v} must be a quoted parameter reference, for example '^/${t.v.toUpperCase()}.CV' := value;`)
    if (t?.t === 'quoted' && this.toks[this.i + 1]?.t === 'op' && this.toks[this.i + 1].v === ':=') {
      this.i += 2
      return { k: 'assign', target: t.v, expr: this.expr() }
    }
    return { k: 'expr', expr: this.expr() }
  }

  expr(): Node {
    const condition = this.or()
    if (!this.isOp('?')) return condition
    this.i++
    const yes = this.expr()
    this.expectOp(':')
    return { k: 'choose', condition, yes, no: this.expr() }
  }
  private or(): Node { let a = this.and(); while (this.isWord('OR')) { this.i++; a = { k: 'bin', op: 'OR', a, b: this.and() } } return a }
  private and(): Node { let a = this.not(); while (this.isWord('AND')) { this.i++; a = { k: 'bin', op: 'AND', a, b: this.not() } } return a }
  private not(): Node { if (this.isWord('NOT')) { this.i++; return { k: 'un', op: 'NOT', a: this.not() } } return this.cmp() }
  private cmp(): Node {
    const a = this.add()
    const t = this.peek()
    if (t?.t === 'op' && ['=', '!=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
      this.i++
      return { k: 'bin', op: t.v === '<>' ? '!=' : t.v, a, b: this.add() }
    }
    return a
  }
  private add(): Node {
    let a = this.mul()
    while (this.isOp('+') || this.isOp('-')) { const op = this.peek()!.v; this.i++; a = { k: 'bin', op, a, b: this.mul() } }
    return a
  }
  private mul(): Node {
    let a = this.unary()
    while (this.isOp('*') || this.isOp('/')) { const op = this.peek()!.v; this.i++; a = { k: 'bin', op, a, b: this.unary() } }
    return a
  }
  private unary(): Node {
    if (this.isOp('-')) { this.i++; return { k: 'un', op: '-', a: this.unary() } }
    return this.primary()
  }
  private primary(): Node {
    const t = this.peek()
    if (!t) throw new SyntaxError('Unexpected end of expression')
    this.i++
    if (t.t === 'num') return { k: 'num', v: Number(t.v) }
    if (t.t === 'str') return { k: 'str', v: t.v }
    if (t.t === 'quoted') {
      const named = /^([^/#^:][^:]*):([^:]+)$/.exec(t.v)
      if (named) return { k: 'named', set: named[1], state: named[2] }
      if (!t.v.trim()) throw new SyntaxError(`Empty parameter reference at position ${t.pos + 1}`)
      return { k: 'ref', v: t.v }
    }
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expectOp(')'); return e }
    if (t.t === 'ident') {
      const up = t.v.toUpperCase()
      if (up === 'TRUE' || up === 'FALSE') return { k: 'bool', v: up === 'TRUE' }
      if (this.isOp('(')) {
        this.i++
        const args: Node[] = []
        if (!this.isOp(')')) {
          args.push(this.expr())
          while (this.isOp(',')) { this.i++; args.push(this.expr()) }
        }
        this.expectOp(')')
        return { k: 'call', fn: up, args }
      }
      if (KEYWORDS.includes(up)) throw new SyntaxError(`Unexpected ${up} at position ${t.pos + 1}`)
      return { k: 'ident', v: up }
    }
    throw new SyntaxError(`Unexpected '${t.v}' at position ${t.pos + 1}`)
  }
}

export function parseProgram(src: string): Program {
  return new Parser(tokenize(src)).program()
}

export const FUNCTIONS = ['SELSTR', 'LOGEVENT', 'ABS', 'MIN', 'MAX', 'LOG2', 'LN', 'LOG', 'EXP', 'SQRT']

// ---------------------------------------------------------------------------
// Validation

export interface CheckEnv {
  /** Error text when a reference cannot be resolved, otherwise null. */
  checkRef: (ref: string, write: boolean) => string | null
  checkNamed: (set: string, state: string) => string | null
  /** Advice (not an error) when a reference resolves but uses the wrong level: '/' is this composite, '^/' is the phase. */
  warnRef?: (ref: string, write: boolean) => string | null
}

/** Parser-output warnings for references that work in the trainer but are written at the wrong level for DeltaV. */
export function warnExpression(src: string, env: CheckEnv): string[] {
  if (!env.warnRef || !src.trim()) return []
  let program: Program
  try { program = parseProgram(src) } catch { return [] }
  const out: string[] = []
  const node = (n: Node): void => { if (n.k === 'ref') { const w = env.warnRef!(n.v, false); if (w) out.push(w) } }
  const stmt = (s: Statement): void => {
    if (s.k === 'if') { walk(s.condition, node); s.yes.forEach(stmt); s.no.forEach(stmt); return }
    if (s.k === 'assign') { const w = env.warnRef!(s.target, true); if (w) out.push(w) }
    walk(s.expr, node)
  }
  program.statements.forEach(stmt)
  return [...new Set(out)]
}

function walk(n: Node, fn: (n: Node) => void): void {
  fn(n)
  if (n.k === 'un') walk(n.a, fn)
  else if (n.k === 'bin') { walk(n.a, fn); walk(n.b, fn) }
  else if (n.k === 'call') n.args.forEach(a => walk(a, fn))
  else if (n.k === 'choose') { walk(n.condition, fn); walk(n.yes, fn); walk(n.no, fn) }
}

/** Parser output lines for the expression editor; empty array means the expression is valid. */
export function checkExpression(src: string, kind: 'action' | 'condition', env: CheckEnv): string[] {
  if (!src.trim()) return kind === 'condition' ? ['The condition is empty'] : []
  let program: Program
  try { program = parseProgram(src) } catch (e) { return [(e as Error).message] }
  const errors: string[] = []
  if (kind === 'condition') {
    if (program.statements.length !== 1 || program.statements[0].k !== 'expr') errors.push('A transition condition must be a single Boolean expression (no := assignments)')
  }
  const check = (s: Statement): void => {
    if (s.k === 'if') {
      walk(s.condition, checkNode)
      s.yes.forEach(check)
      s.no.forEach(check)
      return
    }
    if (kind === 'action' && s.k === 'expr' && !(s.expr.k === 'call' && s.expr.fn === 'LOGEVENT')) {
      errors.push('Each action statement must be an assignment (\'parameter\' := expression;) or LOGEVENT(...)')
    }
    if (s.k === 'assign') { const e = env.checkRef(s.target, true); if (e) errors.push(e) }
    walk(s.expr, checkNode)
  }
  const checkNode = (n: Node): void => {
      if (n.k === 'ref') { const e = env.checkRef(n.v, false); if (e) errors.push(e) }
      else if (n.k === 'named') { const e = env.checkNamed(n.set, n.state); if (e) errors.push(e) }
      else if (n.k === 'call' && !FUNCTIONS.includes(n.fn)) errors.push(`Unknown function ${n.fn}`)
      else if (n.k === 'ident' && !MODE_WORDS.includes(n.v)) errors.push(`Unknown identifier ${n.v}. Parameter references go in single quotes, for example '^/${n.v}.CV'`)
  }
  for (const s of program.statements) {
    check(s)
  }
  return [...new Set(errors)]
}

// ---------------------------------------------------------------------------
// Evaluation

export interface EvalEnv {
  read: (ref: string) => Value
  write: (ref: string, value: Value) => void
  named: (set: string, state: string) => number
  log: (text: string) => void
}

export class EvalError extends Error {}

const toNum = (v: Value): number => (typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : NaN)
const truthy = (v: Value): boolean => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : v !== '' && v.toUpperCase() !== 'FALSE')

function equal(a: Value, b: Value): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toUpperCase() === b.toUpperCase()
  if (typeof a === 'string' || typeof b === 'string') {
    const na = toNum(a), nb = toNum(b)
    return Number.isFinite(na) && Number.isFinite(nb) ? na === nb : String(a).toUpperCase() === String(b).toUpperCase()
  }
  return toNum(a) === toNum(b)
}

export function evaluate(n: Node, env: EvalEnv): Value {
  switch (n.k) {
    case 'num': case 'str': case 'bool': return n.v
    case 'ident': return n.v
    case 'ref': return env.read(n.v)
    case 'named': return env.named(n.set, n.state)
    case 'choose': return evaluate(truthy(evaluate(n.condition, env)) ? n.yes : n.no, env)
    case 'un': return n.op === 'NOT' ? !truthy(evaluate(n.a, env)) : -toNum(evaluate(n.a, env))
    case 'call': {
      const args = n.args.map(a => evaluate(a, env))
      switch (n.fn) {
        case 'ABS': return Math.abs(toNum(args[0]))
        case 'MIN': return Math.min(...args.map(toNum))
        case 'MAX': return Math.max(...args.map(toNum))
        case 'LOG2': {
          const value = toNum(args[args.length - 1])
          const base = args.length === 2 ? toNum(args[0]) : 2
          if (args.length < 1 || args.length > 2 || !Number.isFinite(value) || !Number.isFinite(base) || value <= 0 || base <= 0 || base === 1)
            throw new EvalError('LOG2 requires a positive value and an optional positive base other than 1')
          return Math.log(value) / Math.log(base)
        }
        case 'LN': case 'LOG': case 'SQRT': {
          // Slide 6-40 converts FIRST_OUT with LN(x) / LN(2) + 4.
          const x = toNum(args[0])
          if (args.length !== 1 || !Number.isFinite(x) || (n.fn === 'SQRT' ? x < 0 : x <= 0)) throw new EvalError(`${n.fn} requires one ${n.fn === 'SQRT' ? 'non-negative' : 'positive'} number`)
          return n.fn === 'LN' ? Math.log(x) : n.fn === 'LOG' ? Math.log10(x) : Math.sqrt(x)
        }
        case 'EXP': {
          if (args.length !== 1 || !Number.isFinite(toNum(args[0]))) throw new EvalError('EXP requires one number')
          return Math.exp(toNum(args[0]))
        }
        case 'LOGEVENT': env.log(args.map(String).join(' ')); return true
        case 'SELSTR': {
          // SELSTR(default, string1, condition1, string2, condition2, ...)
          for (let i = 1; i + 1 < args.length; i += 2) if (truthy(args[i + 1])) return String(args[i])
          return String(args[0] ?? '')
        }
        default: throw new EvalError(`Unknown function ${n.fn}`)
      }
    }
    case 'bin': {
      if (n.op === 'AND') return truthy(evaluate(n.a, env)) && truthy(evaluate(n.b, env))
      if (n.op === 'OR') return truthy(evaluate(n.a, env)) || truthy(evaluate(n.b, env))
      const a = evaluate(n.a, env), b = evaluate(n.b, env)
      switch (n.op) {
        case '=': return equal(a, b)
        case '!=': return !equal(a, b)
        case '<': return toNum(a) < toNum(b)
        case '>': return toNum(a) > toNum(b)
        case '<=': return toNum(a) <= toNum(b)
        case '>=': return toNum(a) >= toNum(b)
        case '+': return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : toNum(a) + toNum(b)
        case '-': return toNum(a) - toNum(b)
        case '*': return toNum(a) * toNum(b)
        case '/': { const d = toNum(b); if (d === 0) throw new EvalError('Division by zero'); return toNum(a) / d }
      }
      throw new EvalError(`Unknown operator ${n.op}`)
    }
  }
}

export function runProgram(src: string, env: EvalEnv): void {
  const run = (s: Statement): void => {
    if (s.k === 'if') { (truthy(evaluate(s.condition, env)) ? s.yes : s.no).forEach(run); return }
    if (s.k === 'assign') env.write(s.target, evaluate(s.expr, env))
    else evaluate(s.expr, env)
  }
  parseProgram(src).statements.forEach(run)
}

export function evalCondition(src: string, env: EvalEnv): boolean {
  const p = parseProgram(src)
  if (p.statements.length !== 1 || p.statements[0].k !== 'expr') throw new EvalError('A transition condition must be a single Boolean expression')
  return truthy(evaluate(p.statements[0].expr, env))
}

export { truthy, toNum }
