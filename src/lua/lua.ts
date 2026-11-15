// Intérprete de Lua 5.1 escrito en TypeScript para ejecutar scripts de mods (Psych Engine usa LuaJIT = Lua 5.1).
// Totalmente aislado: el código Lua solo ve las funciones que le damos (no hay acceso al DOM, red ni almacenamiento),
// y cada llamada tiene un presupuesto de instrucciones para que un bucle infinito no congele el juego.

export class LuaTable {
  hash = new Map<unknown, unknown>();
  arr: unknown[] = []; // arr[i-1] = t[i]
  meta: LuaTable | null = null;
  get(k: unknown): unknown {
    if (typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= this.arr.length) return this.arr[k - 1];
    const v = this.hash.get(typeof k === 'number' ? normNum(k) : k);
    if (v === undefined && this.meta) {
      const idx = this.meta.get('__index');
      if (idx instanceof LuaTable) return idx.get(k);
      if (idx !== undefined) return first(call(idx, [this, k]));
    }
    return v;
  }
  set(k: unknown, v: unknown) {
    if (k === undefined) throw new LuaError('índice nil en tabla');
    if (typeof k === 'number') {
      if (Number.isNaN(k)) throw new LuaError('índice NaN en tabla');
      if (Number.isInteger(k) && k >= 1) {
        if (k <= this.arr.length) { if (v === undefined && k === this.arr.length) { this.arr.pop(); while (this.arr.length && this.arr[this.arr.length - 1] === undefined) this.arr.pop(); } else this.arr[k - 1] = v; return; }
        if (k === this.arr.length + 1 && v !== undefined) {
          this.arr.push(v); this.hash.delete(k);
          // absorber claves consecutivas que estaban en el hash
          let n = this.arr.length + 1;
          while (this.hash.has(n)) { this.arr.push(this.hash.get(n)); this.hash.delete(n); n++; }
          return;
        }
      }
      k = normNum(k);
    }
    if (v === undefined) this.hash.delete(k); else this.hash.set(k, v);
  }
  length() { return this.arr.length; }
}
function normNum(n: number) { return Object.is(n, -0) ? 0 : n; }

export type NativeFn = (args: unknown[]) => unknown[] | unknown | void;
export class LuaFunction { constructor(public params: string[], public vararg: boolean, public body: Node[], public env: Scope, public name: string, public interp: Interp) {} }
export class LuaError extends Error { constructor(msg: string, public value?: unknown) { super(msg); } }

export function first(v: unknown): unknown { return Array.isArray(v) ? v[0] : v; }
export function truthy(v: unknown) { return v !== undefined && v !== null && v !== false; }

export function call(fn: unknown, args: unknown[]): unknown[] {
  if (typeof fn === 'function') {
    const r = (fn as NativeFn)(args);
    return Array.isArray(r) ? r : r === undefined ? [] : [r];
  }
  if (fn instanceof LuaFunction) return fn.interp.callLua(fn, args);
  if (fn instanceof LuaTable && fn.meta?.get('__call')) return call(fn.meta.get('__call'), [fn, ...args]);
  throw new LuaError(`intento de llamar a un valor ${luaType(fn)}`);
}

export function luaType(v: unknown): string {
  if (v === undefined || v === null) return 'nil';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (v instanceof LuaTable) return 'table';
  if (typeof v === 'function' || v instanceof LuaFunction) return 'function';
  return 'userdata';
}

export function tostr(v: unknown): string {
  if (v === undefined || v === null) return 'nil';
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
    return String(Number(v.toPrecision(14)));
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof LuaTable) { const ts = v.meta?.get('__tostring'); if (ts) return tostr(first(call(ts, [v]))); return 'table: 0x' + idOf(v); }
  return 'function: 0x' + idOf(v);
}
const ids = new WeakMap<object, string>(); let idc = 0x1000;
function idOf(o: object) { let s = ids.get(o); if (!s) { s = (idc++).toString(16).padStart(8, '0'); ids.set(o, s); } return s; }

export function tonum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^-?0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return parseFloat(s);
  }
  return undefined;
}

// ------------------------------------------------------------------ léxico
type Tok = { t: string; v?: string | number; line: number };
const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1;
  const n = src.length;
  const longBracket = (): string | null => {
    // [[ ... ]] o [==[ ... ]==]
    const m = /^\[(=*)\[/.exec(src.slice(i, i + 64));
    if (!m) return null;
    const close = ']' + m[1] + ']';
    let start = i + m[0].length;
    if (src[start] === '\r') start++;
    if (src[start] === '\n') start++;
    const end = src.indexOf(close, start);
    if (end < 0) throw new LuaError(`cadena larga sin cerrar (línea ${line})`);
    const s = src.slice(start, end);
    line += (src.slice(i, end).match(/\n/g) || []).length;
    i = end + close.length;
    return s;
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') {
      i += 2;
      if (src[i] === '[') { const s = longBracket(); if (s !== null) continue; }
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j); i = j;
      toks.push(KEYWORDS.has(w) ? { t: w, line } : { t: 'name', v: w, line });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const m = /^(0[xX][0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)/.exec(src.slice(i, i + 64))!;
      i += m[0].length;
      toks.push({ t: 'number', v: m[0].startsWith('0x') || m[0].startsWith('0X') ? parseInt(m[0], 16) : parseFloat(m[0]), line });
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, out = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\n') throw new LuaError(`cadena sin cerrar (línea ${line})`);
        if (src[j] === '\\') {
          const e = src[j + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '\n': '\n' };
          if (e in map) { out += map[e]; j += 2; if (e === '\n') line++; }
          else if (/[0-9]/.test(e)) { const m = /^\d{1,3}/.exec(src.slice(j + 1))!; out += String.fromCharCode(+m[0]); j += 1 + m[0].length; }
          else if (e === 'x') { out += String.fromCharCode(parseInt(src.substr(j + 2, 2), 16)); j += 4; }
          else if (e === 'z') { j += 2; while (/\s/.test(src[j])) { if (src[j] === '\n') line++; j++; } }
          else { out += e; j += 2; }
        } else out += src[j++];
      }
      i = j + 1;
      toks.push({ t: 'string', v: out, line });
      continue;
    }
    if (c === '[' && (src[i + 1] === '[' || src[i + 1] === '=')) {
      const s = longBracket();
      if (s !== null) { toks.push({ t: 'string', v: s, line }); continue; }
    }
    const three = src.substr(i, 3), two = src.substr(i, 2);
    if (three === '...') { toks.push({ t: '...', line }); i += 3; continue; }
    if (['==', '~=', '<=', '>=', '..', '::', '//', '<<', '>>', '!='].includes(two)) { toks.push({ t: two === '!=' ? '~=' : two, line }); i += 2; continue; }
    if ('+-*/%^#<>=(){}[];:,.&|~'.includes(c)) { toks.push({ t: c, line }); i++; continue; }
    throw new LuaError(`carácter inesperado '${c}' (línea ${line})`);
  }
  toks.push({ t: 'eof', line });
  return toks;
}

// ------------------------------------------------------------------ sintaxis (AST)
export type Node = { k: string; line?: number; [key: string]: any };

class Parser {
  p = 0;
  constructor(private toks: Tok[]) {}
  peek(o = 0) { return this.toks[this.p + o]; }
  next() { return this.toks[this.p++]; }
  check(t: string) { return this.toks[this.p].t === t; }
  accept(t: string) { if (this.check(t)) { this.p++; return true; } return false; }
  expect(t: string, what?: string) {
    const tk = this.next();
    if (tk.t !== t) throw new LuaError(`se esperaba '${what ?? t}' cerca de '${tk.v ?? tk.t}' (línea ${tk.line})`);
    return tk;
  }
  name() { return this.expect('name', 'nombre').v as string; }

  block(): Node[] {
    const out: Node[] = [];
    for (;;) {
      const t = this.peek().t;
      if (t === 'return') {
        const line = this.next().line;
        const vals = this.blockEnd() || this.check(';') ? [] : this.exprList();
        this.accept(';');
        out.push({ k: 'Return', vals, line });
        break;
      }
      if (this.blockEnd()) break;
      const s = this.statement();
      if (s) out.push(s);
    }
    return out;
  }
  blockEnd() { const t = this.peek().t; return t === 'end' || t === 'else' || t === 'elseif' || t === 'until' || t === 'eof'; }

  statement(): Node | null {
    const tk = this.peek();
    const line = tk.line;
    switch (tk.t) {
      case ';': this.next(); return null;
      case 'if': {
        this.next();
        const clauses: { cond: Node; body: Node[] }[] = [];
        const cond = this.expr(); this.expect('then');
        clauses.push({ cond, body: this.block() });
        let orelse: Node[] | null = null;
        for (;;) {
          if (this.accept('elseif')) { const c = this.expr(); this.expect('then'); clauses.push({ cond: c, body: this.block() }); }
          else if (this.accept('else')) { orelse = this.block(); this.expect('end'); break; }
          else { this.expect('end'); break; }
        }
        return { k: 'If', clauses, orelse, line };
      }
      case 'while': { this.next(); const cond = this.expr(); this.expect('do'); const body = this.block(); this.expect('end'); return { k: 'While', cond, body, line }; }
      case 'do': { this.next(); const body = this.block(); this.expect('end'); return { k: 'Do', body, line }; }
      case 'repeat': { this.next(); const body = this.block(); this.expect('until'); return { k: 'Repeat', body, cond: this.expr(), line }; }
      case 'for': {
        this.next();
        const n1 = this.name();
        if (this.accept('=')) {
          const start = this.expr(); this.expect(','); const stop = this.expr();
          const step = this.accept(',') ? this.expr() : null;
          this.expect('do'); const body = this.block(); this.expect('end');
          return { k: 'NumFor', v: n1, start, stop, step, body, line };
        }
        const names = [n1];
        while (this.accept(',')) names.push(this.name());
        this.expect('in');
        const exprs = this.exprList();
        this.expect('do'); const body = this.block(); this.expect('end');
        return { k: 'GenFor', names, exprs, body, line };
      }
      case 'function': {
        this.next();
        let target: Node = { k: 'Name', name: this.name(), line };
        let method = false;
        while (this.check('.') || this.check(':')) {
          const sep = this.next().t;
          const key = this.name();
          target = { k: 'Index', obj: target, key: { k: 'Str', v: key }, line };
          if (sep === ':') { method = true; break; }
        }
        const fn = this.funcBody(method, line, nodeName(target));
        return { k: 'Assign', targets: [target], vals: [fn], line };
      }
      case 'local': {
        this.next();
        if (this.accept('function')) { const name = this.name(); return { k: 'LocalFunc', name, fn: this.funcBody(false, line, name), line }; }
        const names = [this.name()];
        this.attrib();
        while (this.accept(',')) { names.push(this.name()); this.attrib(); }
        const vals = this.accept('=') ? this.exprList() : [];
        return { k: 'Local', names, vals, line };
      }
      case 'return': return null;
      case 'break': this.next(); return { k: 'Break', line };
      case 'goto': { this.next(); return { k: 'Goto', label: this.name(), line }; }
      case '::': { this.next(); const label = this.name(); this.expect('::'); return { k: 'Label', label, line }; }
      default: {
        const e = this.suffixed();
        if (this.check('=') || this.check(',')) {
          const targets = [e];
          while (this.accept(',')) targets.push(this.suffixed());
          this.expect('=');
          for (const t of targets) if (t.k !== 'Name' && t.k !== 'Index') throw new LuaError(`asignación no válida (línea ${line})`);
          return { k: 'Assign', targets, vals: this.exprList(), line };
        }
        if (e.k !== 'Call' && e.k !== 'Method') throw new LuaError(`sintaxis no válida cerca de '${this.peek().v ?? this.peek().t}' (línea ${line})`);
        return { k: 'ExprStat', e, line };
      }
    }
  }
  attrib() { if (this.check('<')) { this.next(); this.name(); this.expect('>'); } }

  funcBody(method: boolean, line: number, name = '?'): Node {
    this.expect('(');
    const params: string[] = method ? ['self'] : [];
    let vararg = false;
    if (!this.check(')')) {
      do {
        if (this.accept('...')) { vararg = true; break; }
        params.push(this.name());
      } while (this.accept(','));
    }
    this.expect(')');
    const body = this.block();
    this.expect('end');
    return { k: 'Func', params, vararg, body, line, name };
  }

  exprList(): Node[] { const l = [this.expr()]; while (this.accept(',')) l.push(this.expr()); return l; }

  static BIN: Record<string, [number, number]> = {
    or: [1, 1], and: [2, 2], '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3],
    '|': [4, 4], '~': [5, 5], '&': [6, 6], '<<': [7, 7], '>>': [7, 7],
    '..': [9, 8], '+': [10, 10], '-': [10, 10], '*': [11, 11], '/': [11, 11], '//': [11, 11], '%': [11, 11], '^': [14, 13],
  };
  expr(limit = 0): Node {
    let left: Node;
    const tk = this.peek();
    if (tk.t === 'not' || tk.t === '-' || tk.t === '#' || tk.t === '~') {
      this.next();
      left = { k: 'Un', op: tk.t, e: this.expr(12), line: tk.line };
    } else left = this.simple();
    for (;;) {
      const op = this.peek().t;
      const pr = Parser.BIN[op];
      if (!pr || pr[0] <= limit) break;
      const line = this.next().line;
      const right = this.expr(pr[1]);
      left = op === 'and' || op === 'or' ? { k: op === 'and' ? 'And' : 'Or', a: left, b: right, line } : { k: 'Bin', op, a: left, b: right, line };
    }
    return left;
  }
  simple(): Node {
    const tk = this.peek();
    switch (tk.t) {
      case 'number': this.next(); return { k: 'Num', v: tk.v };
      case 'string': this.next(); return { k: 'Str', v: tk.v };
      case 'nil': this.next(); return { k: 'Nil' };
      case 'true': this.next(); return { k: 'True' };
      case 'false': this.next(); return { k: 'False' };
      case '...': this.next(); return { k: 'Vararg' };
      case '{': return this.table();
      case 'function': this.next(); return this.funcBody(false, tk.line, 'anónima');
      default: return this.suffixed();
    }
  }
  primary(): Node {
    const tk = this.peek();
    if (tk.t === 'name') { this.next(); return { k: 'Name', name: tk.v, line: tk.line }; }
    if (tk.t === '(') { this.next(); const e = this.expr(); this.expect(')'); return { k: 'Paren', e, line: tk.line }; }
    throw new LuaError(`símbolo inesperado '${tk.v ?? tk.t}' (línea ${tk.line})`);
  }
  suffixed(): Node {
    let e = this.primary();
    for (;;) {
      const tk = this.peek();
      if (tk.t === '.') { this.next(); e = { k: 'Index', obj: e, key: { k: 'Str', v: this.name() }, line: tk.line }; }
      else if (tk.t === '[') { this.next(); const key = this.expr(); this.expect(']'); e = { k: 'Index', obj: e, key, line: tk.line }; }
      else if (tk.t === ':') { this.next(); const name = this.name(); e = { k: 'Method', obj: e, name, args: this.callArgs(), line: tk.line }; }
      else if (tk.t === '(' || tk.t === 'string' || tk.t === '{') { e = { k: 'Call', fn: e, args: this.callArgs(), line: tk.line }; }
      else return e;
    }
  }
  callArgs(): Node[] {
    const tk = this.peek();
    if (tk.t === 'string') { this.next(); return [{ k: 'Str', v: tk.v }]; }
    if (tk.t === '{') return [this.table()];
    this.expect('(');
    if (this.accept(')')) return [];
    const args = this.exprList();
    this.expect(')');
    return args;
  }
  table(): Node {
    const line = this.expect('{').line;
    const items: { key?: Node; val: Node }[] = [];
    while (!this.check('}')) {
      if (this.check('[')) { this.next(); const key = this.expr(); this.expect(']'); this.expect('='); items.push({ key, val: this.expr() }); }
      else if (this.peek().t === 'name' && this.peek(1).t === '=') { const key = { k: 'Str', v: this.name() }; this.next(); items.push({ key, val: this.expr() }); }
      else items.push({ val: this.expr() });
      if (!this.accept(',') && !this.accept(';')) break;
    }
    this.expect('}');
    return { k: 'Table', items, line };
  }
}
function nodeName(n: Node): string { return n.k === 'Name' ? n.name : n.k === 'Index' ? nodeName(n.obj) + '.' + (n.key.v ?? '?') : '?'; }

export function parse(src: string): Node[] {
  const p = new Parser(lex(src.replace(/^#![^\n]*/, '')));
  const b = p.block();
  if (!p.check('eof')) throw new LuaError(`'${p.peek().v ?? p.peek().t}' inesperado (línea ${p.peek().line})`);
  return b;
}

// ------------------------------------------------------------------ ejecución
class Scope {
  vars = new Map<string, { v: unknown }>();
  constructor(public parent: Scope | null, public varargs: unknown[] | null = null) {}
  lookup(name: string): { v: unknown } | undefined {
    let s: Scope | null = this;
    while (s) { const c = s.vars.get(name); if (c) return c; s = s.parent; }
    return undefined;
  }
  declare(name: string, v: unknown) { this.vars.set(name, { v }); }
  getVarargs(): unknown[] { let s: Scope | null = this; while (s) { if (s.varargs) return s.varargs; s = s.parent; } return []; }
}

const BREAK = { sig: 'break' };
class ReturnSig { constructor(public vals: unknown[]) {} }
class GotoSig { constructor(public label: string) {} }

export class Interp {
  G = new LuaTable();
  budget = 0;
  maxSteps = 5_000_000;
  depth = 0;
  chunkName = 'script';

  run(src: string, name = 'script'): unknown[] {
    this.chunkName = name;
    const body = parse(src);
    const fn = new LuaFunction([], true, body, new Scope(null), 'main', this);
    return this.protectedCall(fn, []);
  }

  /** llamada con presupuesto de instrucciones (cada callback del juego empieza con presupuesto nuevo) */
  protectedCall(fn: unknown, args: unknown[]): unknown[] {
    if (this.depth === 0) this.budget = this.maxSteps;
    return call(fn, args);
  }

  callLua(fn: LuaFunction, args: unknown[]): unknown[] {
    if (++this.depth > 180) { this.depth--; throw new LuaError('desbordamiento de pila (recursión demasiado profunda)'); }
    try {
      const sc = new Scope(fn.env, fn.vararg ? args.slice(fn.params.length) : null);
      for (let i = 0; i < fn.params.length; i++) sc.declare(fn.params[i], args[i]);
      const r = this.execBlock(fn.body, sc);
      if (r instanceof ReturnSig) return r.vals;
      return [];
    } finally { this.depth--; }
  }

  execBlock(stmts: Node[], sc: Scope): unknown {
    for (let i = 0; i < stmts.length; i++) {
      const r = this.exec(stmts[i], sc);
      if (r !== undefined) {
        if (r instanceof GotoSig) {
          const idx = stmts.findIndex((s) => s.k === 'Label' && s.label === r.label);
          if (idx >= 0) { i = idx; continue; }
        }
        return r;
      }
    }
    return undefined;
  }

  exec(s: Node, sc: Scope): unknown {
    if (--this.budget < 0) throw new LuaError('el script tardó demasiado (posible bucle infinito)');
    switch (s.k) {
      case 'Local': {
        const vals = this.evalList(s.vals, sc, s.names.length);
        for (let i = 0; i < s.names.length; i++) sc.declare(s.names[i], vals[i]);
        return;
      }
      case 'LocalFunc': { sc.declare(s.name, undefined); sc.lookup(s.name)!.v = this.eval(s.fn, sc); return; }
      case 'Assign': {
        if (s.targets.length === 1 && s.vals.length === 1) { this.assign(s.targets[0], first(this.eval(s.vals[0], sc, true)), sc); return; }
        const vals = this.evalList(s.vals, sc, s.targets.length);
        // evaluar objetos/índices antes de asignar
        const refs = s.targets.map((t: Node) => t.k === 'Index' ? { obj: first(this.eval(t.obj, sc)), key: first(this.eval(t.key, sc)) } : null);
        s.targets.forEach((t: Node, i: number) => { const r = refs[i]; if (r) this.setIndex(r.obj, r.key, vals[i], t.line); else this.assign(t, vals[i], sc); });
        return;
      }
      case 'ExprStat': this.eval(s.e, sc, true); return;
      case 'If': {
        for (const c of s.clauses) if (truthy(first(this.eval(c.cond, sc)))) return this.execBlock(c.body, new Scope(sc));
        if (s.orelse) return this.execBlock(s.orelse, new Scope(sc));
        return;
      }
      case 'While': {
        while (truthy(first(this.eval(s.cond, sc)))) {
          if (--this.budget < 0) throw new LuaError('el script tardó demasiado (posible bucle infinito)');
          const r = this.execBlock(s.body, new Scope(sc));
          if (r === BREAK) break;
          if (r !== undefined) return r;
        }
        return;
      }
      case 'Repeat': {
        for (;;) {
          if (--this.budget < 0) throw new LuaError('el script tardó demasiado (posible bucle infinito)');
          const inner = new Scope(sc);
          const r = this.execBlock(s.body, inner);
          if (r === BREAK) break;
          if (r !== undefined) return r;
          if (truthy(first(this.eval(s.cond, inner)))) break;
        }
        return;
      }
      case 'NumFor': {
        const a = this.num(first(this.eval(s.start, sc)), s.line), b = this.num(first(this.eval(s.stop, sc)), s.line);
        const st = s.step ? this.num(first(this.eval(s.step, sc)), s.line) : 1;
        if (st === 0) throw new LuaError(`el paso del 'for' es 0 (línea ${s.line})`);
        for (let i = a; st > 0 ? i <= b : i >= b; i += st) {
          const inner = new Scope(sc); inner.declare(s.v, i);
          const r = this.execBlock(s.body, inner);
          if (r === BREAK) break;
          if (r !== undefined) return r;
          if (--this.budget < 0) throw new LuaError('el script tardó demasiado (posible bucle infinito)');
        }
        return;
      }
      case 'GenFor': {
        const init = this.evalList(s.exprs, sc, 3);
        const f = init[0], state = init[1];
        let ctl = init[2];
        for (;;) {
          const rs = call(f, [state, ctl]);
          if (rs[0] === undefined || rs[0] === null) break;
          ctl = rs[0];
          const inner = new Scope(sc);
          s.names.forEach((nm: string, i: number) => inner.declare(nm, rs[i]));
          const r = this.execBlock(s.body, inner);
          if (r === BREAK) break;
          if (r !== undefined) return r;
          if (--this.budget < 0) throw new LuaError('el script tardó demasiado (posible bucle infinito)');
        }
        return;
      }
      case 'Do': return this.execBlock(s.body, new Scope(sc));
      case 'Return': {
        if (s.vals.length === 1 && (s.vals[0].k === 'Call' || s.vals[0].k === 'Method')) return new ReturnSig(this.eval(s.vals[0], sc, true) as unknown[]);
        return new ReturnSig(this.evalList(s.vals, sc));
      }
      case 'Break': return BREAK;
      case 'Goto': return new GotoSig(s.label);
      case 'Label': return;
    }
    throw new LuaError(`instrucción desconocida ${s.k}`);
  }

  assign(t: Node, v: unknown, sc: Scope) {
    if (t.k === 'Name') {
      const cell = sc.lookup(t.name);
      if (cell) cell.v = v; else this.G.set(t.name, v);
    } else this.setIndex(first(this.eval(t.obj, sc)), first(this.eval(t.key, sc)), v, t.line);
  }

  setIndex(obj: unknown, key: unknown, v: unknown, line?: number) {
    if (obj instanceof LuaTable) {
      if (obj.meta && obj.get(key) === undefined) {
        const ni = obj.meta.get('__newindex');
        if (ni instanceof LuaTable) { ni.set(key, v); return; }
        if (ni !== undefined) { call(ni, [obj, key, v]); return; }
      }
      obj.set(key, v); return;
    }
    throw new LuaError(`intento de indexar un valor ${luaType(obj)} (línea ${line ?? '?'})`);
  }

  index(obj: unknown, key: unknown, line?: number): unknown {
    if (obj instanceof LuaTable) return obj.get(key);
    if (typeof obj === 'string') { const sl = this.G.get('string'); return sl instanceof LuaTable ? sl.get(key) : undefined; }
    throw new LuaError(`intento de indexar un valor ${luaType(obj)}${typeof key === 'string' ? ` (campo '${key}')` : ''} (línea ${line ?? '?'})`);
  }

  num(v: unknown, line?: number): number {
    const n = tonum(v);
    if (n === undefined) throw new LuaError(`se esperaba un número, se obtuvo ${luaType(v)} (línea ${line ?? '?'})`);
    return n;
  }

  evalList(list: Node[], sc: Scope, want = -1): unknown[] {
    const out: unknown[] = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (i === list.length - 1 && (e.k === 'Call' || e.k === 'Method' || e.k === 'Vararg')) out.push(...(this.eval(e, sc, true) as unknown[]));
      else out.push(first(this.eval(e, sc)));
    }
    if (want >= 0) out.length = Math.max(out.length, want);
    return out;
  }

  /** multi=true devuelve un array con todos los valores (llamadas/varargs) */
  eval(e: Node, sc: Scope, multi = false): unknown {
    switch (e.k) {
      case 'Num': case 'Str': return e.v;
      case 'Nil': return undefined;
      case 'True': return true;
      case 'False': return false;
      case 'Vararg': { const v = sc.getVarargs(); return multi ? v : v[0]; }
      case 'Name': { const c = sc.lookup(e.name); return c ? c.v : this.G.get(e.name); }
      case 'Paren': return first(this.eval(e.e, sc));
      case 'Index': return this.index(first(this.eval(e.obj, sc)), first(this.eval(e.key, sc)), e.line);
      case 'Call': {
        const fn = first(this.eval(e.fn, sc));
        const args = this.evalList(e.args, sc);
        if (fn === undefined) throw new LuaError(`intento de llamar a '${nodeName(e.fn)}' (nil) (línea ${e.line})`);
        const r = call(fn, args);
        return multi ? r : r[0];
      }
      case 'Method': {
        const obj = first(this.eval(e.obj, sc));
        const fn = this.index(obj, e.name, e.line);
        if (fn === undefined) throw new LuaError(`método '${e.name}' inexistente (línea ${e.line})`);
        const r = call(fn, [obj, ...this.evalList(e.args, sc)]);
        return multi ? r : r[0];
      }
      case 'Func': return new LuaFunction(e.params, e.vararg, e.body, sc, e.name, this);
      case 'And': { const a = first(this.eval(e.a, sc)); return truthy(a) ? first(this.eval(e.b, sc)) : a; }
      case 'Or': { const a = first(this.eval(e.a, sc)); return truthy(a) ? a : first(this.eval(e.b, sc)); }
      case 'Un': {
        const v = first(this.eval(e.e, sc));
        if (e.op === 'not') return !truthy(v);
        if (e.op === '-') { if (v instanceof LuaTable && v.meta?.get('__unm')) return first(call(v.meta.get('__unm'), [v])); return -this.num(v, e.line); }
        if (e.op === '#') {
          if (typeof v === 'string') return v.length;
          if (v instanceof LuaTable) { const l = v.meta?.get('__len'); return l ? first(call(l, [v])) : v.length(); }
          throw new LuaError(`intento de obtener la longitud de un valor ${luaType(v)} (línea ${e.line})`);
        }
        if (e.op === '~') return ~this.num(v, e.line);
        return undefined;
      }
      case 'Bin': return this.binop(e.op, first(this.eval(e.a, sc)), first(this.eval(e.b, sc)), e.line);
      case 'Table': {
        const t = new LuaTable();
        let n = 1;
        e.items.forEach((it: { key?: Node; val: Node }, i: number) => {
          if (it.key) t.set(first(this.eval(it.key, sc)), first(this.eval(it.val, sc)));
          else if (i === e.items.length - 1 && (it.val.k === 'Call' || it.val.k === 'Method' || it.val.k === 'Vararg')) { for (const v of this.eval(it.val, sc, true) as unknown[]) t.set(n++, v); }
          else t.set(n++, first(this.eval(it.val, sc)));
        });
        return t;
      }
    }
    throw new LuaError(`expresión desconocida ${e.k}`);
  }

  binop(op: string, a: unknown, b: unknown, line?: number): unknown {
    const meta = (name: string) => {
      const m = (a instanceof LuaTable && a.meta?.get(name)) || (b instanceof LuaTable && b.meta?.get(name));
      return m ? first(call(m, [a, b])) : undefined;
    };
    switch (op) {
      case '+': case '-': case '*': case '/': case '%': case '^': case '//': {
        const x = tonum(a), y = tonum(b);
        if (x === undefined || y === undefined) {
          const mm = meta({ '+': '__add', '-': '__sub', '*': '__mul', '/': '__div', '%': '__mod', '^': '__pow', '//': '__idiv' }[op]!);
          if (mm !== undefined) return mm;
          throw new LuaError(`intento de operar con un valor ${luaType(x === undefined ? a : b)} (línea ${line ?? '?'})`);
        }
        switch (op) {
          case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y;
          case '%': return x - Math.floor(x / y) * y; case '^': return Math.pow(x, y); case '//': return Math.floor(x / y);
        }
        break;
      }
      case '..': {
        if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) return tostr(a) + tostr(b);
        const mm = meta('__concat');
        if (mm !== undefined) return mm;
        throw new LuaError(`intento de concatenar un valor ${luaType(typeof a === 'string' || typeof a === 'number' ? b : a)} (línea ${line ?? '?'})`);
      }
      case '==': return eq(a, b);
      case '~=': return !eq(a, b);
      case '<': case '>': case '<=': case '>=': {
        if (typeof a === 'number' && typeof b === 'number' || typeof a === 'string' && typeof b === 'string') {
          return op === '<' ? (a as number) < (b as number) : op === '>' ? (a as number) > (b as number) : op === '<=' ? (a as number) <= (b as number) : (a as number) >= (b as number);
        }
        const mm = meta(op === '<' || op === '>' ? '__lt' : '__le');
        if (mm !== undefined) return op === '>' || op === '>=' ? !truthy(mm) : truthy(mm);
        throw new LuaError(`intento de comparar ${luaType(a)} con ${luaType(b)} (línea ${line ?? '?'})`);
      }
      case '&': return this.num(a) & this.num(b);
      case '|': return this.num(a) | this.num(b);
      case '~': return this.num(a) ^ this.num(b);
      case '<<': return this.num(a) << this.num(b);
      case '>>': return this.num(a) >>> this.num(b);
    }
    throw new LuaError(`operador desconocido ${op}`);
  }
}
function eq(a: unknown, b: unknown) { return a === b || (a === undefined && b === null) || (a === null && b === undefined); }
