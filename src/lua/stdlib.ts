// Biblioteca estándar de Lua 5.1 (subconjunto amplio): base, string (con patrones de Lua), math, table, os.
import { call, first, Interp, LuaError, LuaFunction, LuaTable, luaType, parse, tonum, tostr, truthy } from './lua';

// ------------------------------------------------------------------ patrones de Lua (port de lstrlib.c)
const L_ESC = '%';
const SPECIALS = '^$*+?.([%-';

interface MS { src: string; pat: string; level: number; capture: { init: number; len: number }[]; depth: number }
const CAP_UNFINISHED = -1, CAP_POSITION = -2;

function classEnd(ms: MS, p: number): number {
  const pat = ms.pat;
  if (p >= pat.length) throw new LuaError('patrón mal formado');
  const c = pat[p++];
  if (c === L_ESC) { if (p >= pat.length) throw new LuaError("patrón mal formado (termina en '%')"); return p + 1; }
  if (c === '[') {
    if (pat[p] === '^') p++;
    do {
      if (p >= pat.length) throw new LuaError("patrón mal formado (falta ']')");
      const cc = pat[p++];
      if (cc === L_ESC && p < pat.length) p++;
    } while (pat[p] !== ']');
    return p + 1;
  }
  return p;
}

function singleClass(c: string, cl: string): boolean {
  const code = c.charCodeAt(0);
  let res: boolean;
  switch (cl.toLowerCase()) {
    case 'a': res = /[A-Za-z]/.test(c); break;
    case 'c': res = code < 32 || code === 127; break;
    case 'd': res = code >= 48 && code <= 57; break;
    case 'g': res = code > 32 && code < 127; break;
    case 'l': res = code >= 97 && code <= 122; break;
    case 'p': res = /[!-\/:-@\[-`{-~]/.test(c); break;
    case 's': res = /\s/.test(c); break;
    case 'u': res = code >= 65 && code <= 90; break;
    case 'w': res = /[A-Za-z0-9]/.test(c); break;
    case 'x': res = /[0-9A-Fa-f]/.test(c); break;
    case 'z': res = code === 0; break;
    default: return cl === c;
  }
  return cl === cl.toUpperCase() && /[A-Z]/.test(cl) ? !res : res;
}

function matchBracket(ms: MS, c: string, p: number, ec: number): boolean {
  const pat = ms.pat;
  let sig = true;
  if (pat[p + 1] === '^') { sig = false; p++; }
  while (++p < ec) {
    if (pat[p] === L_ESC) { p++; if (singleClass(c, pat[p])) return sig; }
    else if (pat[p + 1] === '-' && p + 2 < ec) {
      if (pat[p] <= c && c <= pat[p + 2]) return sig;
      p += 2;
    } else if (pat[p] === c) return sig;
  }
  return !sig;
}

function singleMatch(ms: MS, s: number, p: number, ep: number): boolean {
  if (s >= ms.src.length) return false;
  const c = ms.src[s];
  switch (ms.pat[p]) {
    case '.': return true;
    case L_ESC: return singleClass(c, ms.pat[p + 1]);
    case '[': return matchBracket(ms, c, p, ep - 1);
    default: return ms.pat[p] === c;
  }
}

function doMatch(ms: MS, s: number, p: number): number {
  if (++ms.depth > 200) throw new LuaError('patrón demasiado complejo');
  try {
    const pat = ms.pat;
    for (;;) {
      if (p >= pat.length) return s;
      switch (pat[p]) {
        case '(':
          if (pat[p + 1] === ')') return startCapture(ms, s, p + 2, CAP_POSITION);
          return startCapture(ms, s, p + 1, CAP_UNFINISHED);
        case ')': return endCapture(ms, s, p + 1);
        case '$':
          if (p + 1 === pat.length) return s === ms.src.length ? s : -1;
          break;
        case L_ESC: {
          const nx = pat[p + 1];
          if (nx === 'b') { s = matchBalance(ms, s, p + 2); if (s !== -1) { p += 4; continue; } return -1; }
          if (nx === 'f') {
            p += 2;
            if (pat[p] !== '[') throw new LuaError("falta '[' tras '%f' en el patrón");
            const ep = classEnd(ms, p);
            const prev = s === 0 ? '\0' : ms.src[s - 1];
            const cur = s < ms.src.length ? ms.src[s] : '\0';
            if (!matchBracket(ms, prev, p, ep - 1) && matchBracket(ms, cur, p, ep - 1)) { p = ep; continue; }
            return -1;
          }
          if (/[0-9]/.test(nx)) {
            s = matchCapture(ms, s, +nx);
            if (s !== -1) { p += 2; continue; }
            return -1;
          }
          break;
        }
      }
      const ep = classEnd(ms, p);
      const epc = pat[ep];
      if (epc === '?') {
        if (singleMatch(ms, s, p, ep)) { const r = doMatch(ms, s + 1, ep + 1); if (r !== -1) return r; }
        p = ep + 1; continue;
      }
      if (epc === '+') return singleMatch(ms, s, p, ep) ? maxExpand(ms, s + 1, p, ep) : -1;
      if (epc === '*') return maxExpand(ms, s, p, ep);
      if (epc === '-') return minExpand(ms, s, p, ep);
      if (!singleMatch(ms, s, p, ep)) return -1;
      s++; p = ep;
    }
  } finally { ms.depth--; }
}

function maxExpand(ms: MS, s: number, p: number, ep: number): number {
  let i = 0;
  while (singleMatch(ms, s + i, p, ep)) i++;
  while (i >= 0) { const r = doMatch(ms, s + i, ep + 1); if (r !== -1) return r; i--; }
  return -1;
}
function minExpand(ms: MS, s: number, p: number, ep: number): number {
  for (;;) {
    const r = doMatch(ms, s, ep + 1);
    if (r !== -1) return r;
    if (singleMatch(ms, s, p, ep)) s++; else return -1;
  }
}
function startCapture(ms: MS, s: number, p: number, what: number): number {
  ms.capture[ms.level] = { init: s, len: what };
  ms.level++;
  const r = doMatch(ms, s, p);
  if (r === -1) ms.level--;
  return r;
}
function endCapture(ms: MS, s: number, p: number): number {
  let l = -1;
  for (let i = ms.level - 1; i >= 0; i--) if (ms.capture[i].len === CAP_UNFINISHED) { l = i; break; }
  if (l < 0) throw new LuaError('patrón con captura no válida');
  ms.capture[l].len = s - ms.capture[l].init;
  const r = doMatch(ms, s, p);
  if (r === -1) ms.capture[l].len = CAP_UNFINISHED;
  return r;
}
function matchBalance(ms: MS, s: number, p: number): number {
  if (p + 1 >= ms.pat.length) throw new LuaError("falta argumento para '%b'");
  if (ms.src[s] !== ms.pat[p]) return -1;
  const b = ms.pat[p], e = ms.pat[p + 1];
  let cont = 1;
  while (++s < ms.src.length) {
    if (ms.src[s] === e) { if (--cont === 0) return s + 1; }
    else if (ms.src[s] === b) cont++;
  }
  return -1;
}
function matchCapture(ms: MS, s: number, l: number): number {
  const cap = ms.capture[l - 1];
  if (!cap || cap.len < 0) throw new LuaError('referencia a captura no válida');
  const str = ms.src.substr(cap.init, cap.len);
  if (ms.src.startsWith(str, s)) return s + str.length;
  return -1;
}
function getCapture(ms: MS, i: number, s: number, e: number): unknown {
  if (i >= ms.level) { if (i === 0) return ms.src.slice(s, e); throw new LuaError('índice de captura no válido'); }
  const c = ms.capture[i];
  if (c.len === CAP_POSITION) return c.init + 1;
  return ms.src.substr(c.init, c.len);
}
function captures(ms: MS, s: number, e: number, wholeIfNone: boolean): unknown[] {
  const n = ms.level === 0 && wholeIfNone ? 1 : ms.level;
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) out.push(getCapture(ms, i, s, e));
  return out;
}

function strFind(s: string, pat: string, init: number, plain: boolean, find: boolean): unknown[] {
  if (init < 0) init = Math.max(0, s.length + init); else init = Math.max(0, init - 1);
  if (init > s.length) return [undefined];
  if (find && (plain || ![...pat].some((ch) => SPECIALS.includes(ch)))) {
    const i = s.indexOf(pat, init);
    return i < 0 ? [undefined] : [i + 1, i + pat.length];
  }
  let p = 0;
  const anchor = pat[0] === '^';
  if (anchor) p = 1;
  let si = init;
  do {
    const ms: MS = { src: s, pat, level: 0, capture: [], depth: 0 };
    const e = doMatch(ms, si, p);
    if (e !== -1) {
      if (find) return [si + 1, e, ...captures(ms, -1, -1, false).length ? captures(ms, si, e, false) : []];
      return captures(ms, si, e, true);
    }
    si++;
  } while (si <= s.length && !anchor);
  return [undefined];
}

function gsub(s: string, pat: string, repl: unknown, maxN?: number): unknown[] {
  const anchor = pat[0] === '^';
  const p = anchor ? 1 : 0;
  let out = '', si = 0, n = 0;
  const max = maxN ?? Infinity;
  while (n < max) {
    const ms: MS = { src: s, pat, level: 0, capture: [], depth: 0 };
    const e = doMatch(ms, si, p);
    if (e !== -1) {
      n++;
      const whole = s.slice(si, e);
      const caps = captures(ms, si, e, true);
      let rep: unknown;
      if (typeof repl === 'string' || typeof repl === 'number') {
        rep = String(repl).replace(/%([0-9%])/g, (_m, d) => d === '%' ? '%' : d === '0' ? whole : tostr(caps[+d - 1] ?? (d === '1' ? whole : '')));
      } else if (repl instanceof LuaTable) rep = repl.get(caps[0]);
      else rep = first(call(repl, caps));
      out += rep === undefined || rep === false ? whole : tostr(rep);
    }
    if (e !== -1 && e > si) si = e;
    else { if (si < s.length) out += s[si]; si++; }
    if (si > s.length || anchor) break;
  }
  if (si < s.length) out += s.slice(si);
  return [out, n];
}

// ------------------------------------------------------------------ string.format
function format(fmt: string, args: unknown[]): string {
  let ai = 0;
  return fmt.replace(/%([-+ #0]*)(\d*)(?:\.(\d+))?([diouxXeEfgGqscaA%])/g, (_m, flags: string, width: string, prec: string | undefined, conv: string) => {
    if (conv === '%') return '%';
    const a = args[ai++];
    let s: string;
    switch (conv) {
      case 'd': case 'i': { const n = Math.trunc(tonum(a) ?? 0); s = String(Math.abs(n)); if (prec) s = s.padStart(+prec, '0'); s = (n < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '') + s; break; }
      case 'u': s = String(Math.trunc(tonum(a) ?? 0) >>> 0); break;
      case 'o': s = Math.trunc(tonum(a) ?? 0).toString(8); break;
      case 'x': s = (Math.trunc(tonum(a) ?? 0) >>> 0).toString(16); break;
      case 'X': s = (Math.trunc(tonum(a) ?? 0) >>> 0).toString(16).toUpperCase(); break;
      case 'f': case 'F': { const n = tonum(a) ?? 0; s = n.toFixed(prec === undefined ? 6 : +prec); if (flags.includes('+') && n >= 0) s = '+' + s; break; }
      case 'e': case 'E': { s = (tonum(a) ?? 0).toExponential(prec === undefined ? 6 : +prec).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') s = s.toUpperCase(); break; }
      case 'g': case 'G': { const n = tonum(a) ?? 0; s = String(Number(n.toPrecision(prec === undefined ? 6 : Math.max(1, +prec)))); break; }
      case 'c': s = String.fromCharCode(tonum(a) ?? 0); break;
      case 'q': s = '"' + tostr(a).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'; break;
      case 's': s = tostr(a); if (prec !== undefined) s = s.slice(0, +prec); break;
      default: s = tostr(a);
    }
    if (width && s.length < +width) s = flags.includes('-') ? s.padEnd(+width) : (flags.includes('0') && /[dfeEgGxX]/.test(conv) ? (s[0] === '-' ? '-' + s.slice(1).padStart(+width - 1, '0') : s.padStart(+width, '0')) : s.padStart(+width));
    return s;
  });
}

// ------------------------------------------------------------------ instalación
export function installStdlib(I: Interp, print: (s: string) => void) {
  const G = I.G;
  const fn = (t: LuaTable, name: string, f: (a: unknown[]) => unknown) => t.set(name, f);
  const arg = (a: unknown[], i: number, name: string) => { const n = tonum(a[i]); if (n === undefined) throw new LuaError(`argumento #${i + 1} de '${name}': se esperaba un número`); return n; };
  const str = (a: unknown[], i: number) => { const v = a[i]; if (typeof v === 'string') return v; if (typeof v === 'number') return tostr(v); throw new LuaError(`argumento #${i + 1}: se esperaba un texto, se obtuvo ${luaType(v)}`); };

  G.set('_G', G);
  G.set('_VERSION', 'Lua 5.1');
  fn(G, 'print', (a) => print(a.map(tostr).join('\t')));
  fn(G, 'type', (a) => luaType(a[0]));
  fn(G, 'tostring', (a) => tostr(a[0]));
  fn(G, 'tonumber', (a) => {
    if (a[1] !== undefined) { const n = parseInt(tostr(a[0]).trim(), arg(a, 1, 'tonumber')); return Number.isNaN(n) ? undefined : n; }
    return tonum(a[0]);
  });
  fn(G, 'rawget', (a) => (a[0] as LuaTable).hash.get(a[1]) ?? ((a[0] as LuaTable).arr[(a[1] as number) - 1]));
  fn(G, 'rawset', (a) => { (a[0] as LuaTable).set(a[1], a[2]); return a[0]; });
  fn(G, 'rawequal', (a) => a[0] === a[1]);
  fn(G, 'rawlen', (a) => a[0] instanceof LuaTable ? a[0].length() : tostr(a[0]).length);
  fn(G, 'setmetatable', (a) => { if (a[0] instanceof LuaTable) a[0].meta = a[1] instanceof LuaTable ? a[1] : null; return a[0]; });
  fn(G, 'getmetatable', (a) => a[0] instanceof LuaTable ? a[0].meta ?? undefined : undefined);
  fn(G, 'assert', (a) => { if (!truthy(a[0])) throw new LuaError(a[1] !== undefined ? tostr(a[1]) : 'assertion failed!', a[1]); return a; });
  fn(G, 'error', (a) => { throw new LuaError(tostr(a[0]), a[0]); });
  fn(G, 'pcall', (a) => { try { return [true, ...call(a[0], a.slice(1))]; } catch (e) { if (e instanceof LuaError && /tardó demasiado/.test(e.message)) throw e; return [false, e instanceof LuaError ? e.value ?? e.message : String(e)]; } });
  fn(G, 'xpcall', (a) => { try { return [true, ...call(a[0], a.slice(2))]; } catch (e) { return [false, ...call(a[1], [e instanceof LuaError ? e.value ?? e.message : String(e)])]; } });
  fn(G, 'select', (a) => { if (a[0] === '#') return a.length - 1; const n = arg(a, 0, 'select'); return n < 0 ? a.slice(n) : a.slice(n); });
  fn(G, 'unpack', (a) => unpack(a));
  const next = (a: unknown[]) => {
    const t = a[0] as LuaTable;
    const keys: unknown[] = [];
    for (let i = 0; i < t.arr.length; i++) if (t.arr[i] !== undefined) keys.push(i + 1);
    for (const k of t.hash.keys()) keys.push(k);
    const idx = a[1] === undefined ? 0 : keys.indexOf(a[1]) + 1;
    if (idx >= keys.length) return [undefined];
    const k = keys[idx];
    return [k, t.get(k)];
  };
  fn(G, 'next', next);
  fn(G, 'pairs', (a) => {
    const t = a[0];
    if (!(t instanceof LuaTable)) throw new LuaError(`argumento de 'pairs': se esperaba una tabla, se obtuvo ${luaType(t)}`);
    // iterador con instantánea de claves (O(1) por paso)
    const keys: unknown[] = [];
    for (let i = 0; i < t.arr.length; i++) if (t.arr[i] !== undefined) keys.push(i + 1);
    for (const k of t.hash.keys()) keys.push(k);
    let i = 0;
    return [() => { while (i < keys.length) { const k = keys[i++]; const v = t.get(k); if (v !== undefined) return [k, v]; } return [undefined]; }, t, undefined];
  });
  fn(G, 'ipairs', (a) => {
    const t = a[0];
    if (!(t instanceof LuaTable)) throw new LuaError(`argumento de 'ipairs': se esperaba una tabla, se obtuvo ${luaType(t)}`);
    return [(b: unknown[]) => { const i = (b[1] as number) + 1; const v = t.get(i); return v === undefined ? [undefined] : [i, v]; }, t, 0];
  });
  fn(G, 'loadstring', (a) => {
    try { return new LuaFunction([], true, parse(tostr(a[0])), new ScopeShim() as never, 'chunk', I); }
    catch (e) { return [undefined, (e as Error).message]; }
  });
  G.set('load', G.get('loadstring'));
  fn(G, 'collectgarbage', () => 0);
  fn(G, 'require', (a) => { throw new LuaError(`require('${tostr(a[0])}') no está disponible en la web`); });
  fn(G, 'dofile', () => { throw new LuaError('dofile no está disponible en la web'); });

  // string
  const S = new LuaTable(); G.set('string', S);
  fn(S, 'len', (a) => str(a, 0).length);
  fn(S, 'sub', (a) => {
    const s = str(a, 0); const l = s.length;
    let i = tonum(a[1]) ?? 1, j = tonum(a[2]) ?? -1;
    if (i < 0) i = Math.max(1, l + i + 1); else if (i === 0) i = 1;
    if (j < 0) j = l + j + 1; else if (j > l) j = l;
    return i > j ? '' : s.slice(i - 1, j);
  });
  fn(S, 'upper', (a) => str(a, 0).toUpperCase());
  fn(S, 'lower', (a) => str(a, 0).toLowerCase());
  fn(S, 'rep', (a) => { const n = Math.max(0, arg(a, 1, 'rep')); const sep = a[2] === undefined ? '' : str(a, 2); return Array(Math.floor(n)).fill(str(a, 0)).join(sep); });
  fn(S, 'reverse', (a) => [...str(a, 0)].reverse().join(''));
  fn(S, 'byte', (a) => { const s = str(a, 0); const i = tonum(a[1]) ?? 1; const j = tonum(a[2]) ?? i; const out = []; for (let k = i; k <= j; k++) { const c = s.charCodeAt(k < 0 ? s.length + k : k - 1); if (!Number.isNaN(c)) out.push(c); } return out; });
  fn(S, 'char', (a) => String.fromCharCode(...a.map((x) => tonum(x) ?? 0)));
  fn(S, 'format', (a) => format(str(a, 0), a.slice(1)));
  fn(S, 'find', (a) => strFind(str(a, 0), str(a, 1), tonum(a[2]) ?? 1, truthy(a[3]), true));
  fn(S, 'match', (a) => strFind(str(a, 0), str(a, 1), tonum(a[2]) ?? 1, false, false));
  fn(S, 'gmatch', (a) => {
    const s = str(a, 0), pat = str(a, 1);
    let si = 0;
    return (() => {
      while (si <= s.length) {
        const ms: MS = { src: s, pat, level: 0, capture: [], depth: 0 };
        const e = doMatch(ms, si, 0);
        if (e !== -1) { const caps = captures(ms, si, e, true); si = e > si ? e : si + 1; return caps; }
        si++;
      }
      return [undefined];
    }) as unknown;
  });
  fn(S, 'gsub', (a) => gsub(str(a, 0), str(a, 1), a[2], a[3] === undefined ? undefined : arg(a, 3, 'gsub')));
  fn(S, 'trim', (a) => str(a, 0).trim());
  fn(S, 'split', (a) => { const t = new LuaTable(); str(a, 0).split(a[1] === undefined ? ',' : str(a, 1)).forEach((p, i) => t.set(i + 1, p)); return t; });
  fn(S, 'startsWith', (a) => str(a, 0).startsWith(str(a, 1)));
  fn(S, 'endsWith', (a) => str(a, 0).endsWith(str(a, 1)));

  // math
  const M = new LuaTable(); G.set('math', M);
  for (const k of ['abs', 'ceil', 'floor', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'exp', 'log10'] as const) fn(M, k, (a) => (Math as any)[k](arg(a, 0, k)));
  fn(M, 'atan', (a) => a[1] === undefined ? Math.atan(arg(a, 0, 'atan')) : Math.atan2(arg(a, 0, 'atan'), arg(a, 1, 'atan')));
  fn(M, 'atan2', (a) => Math.atan2(arg(a, 0, 'atan2'), arg(a, 1, 'atan2')));
  fn(M, 'log', (a) => a[1] === undefined ? Math.log(arg(a, 0, 'log')) : Math.log(arg(a, 0, 'log')) / Math.log(arg(a, 1, 'log')));
  fn(M, 'pow', (a) => Math.pow(arg(a, 0, 'pow'), arg(a, 1, 'pow')));
  fn(M, 'fmod', (a) => arg(a, 0, 'fmod') % arg(a, 1, 'fmod'));
  fn(M, 'modf', (a) => { const n = arg(a, 0, 'modf'); const i = Math.trunc(n); return [i, n - i]; });
  fn(M, 'min', (a) => Math.min(...a.map((x, i) => arg(a, i, 'min'))));
  fn(M, 'max', (a) => Math.max(...a.map((x, i) => arg(a, i, 'max'))));
  fn(M, 'deg', (a) => (arg(a, 0, 'deg') * 180) / Math.PI);
  fn(M, 'rad', (a) => (arg(a, 0, 'rad') * Math.PI) / 180);
  fn(M, 'random', (a) => {
    if (a[0] === undefined) return Math.random();
    const lo = a[1] === undefined ? 1 : arg(a, 0, 'random'), hi = a[1] === undefined ? arg(a, 0, 'random') : arg(a, 1, 'random');
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  });
  fn(M, 'randomseed', () => undefined);
  M.set('pi', Math.PI); M.set('huge', Infinity);
  fn(M, 'tointeger', (a) => { const n = tonum(a[0]); return n !== undefined && Number.isInteger(n) ? n : undefined; });
  fn(M, 'type', (a) => typeof a[0] === 'number' ? (Number.isInteger(a[0]) ? 'integer' : 'float') : undefined);

  // table
  const T = new LuaTable(); G.set('table', T);
  fn(T, 'insert', (a) => {
    const t = a[0] as LuaTable;
    if (a.length === 2) { t.set(t.length() + 1, a[1]); return; }
    const pos = arg(a, 1, 'insert');
    for (let i = t.length(); i >= pos; i--) t.set(i + 1, t.get(i));
    t.set(pos, a[2]);
  });
  fn(T, 'remove', (a) => {
    const t = a[0] as LuaTable; const n = t.length();
    if (n === 0) return undefined;
    const pos = a[1] === undefined ? n : arg(a, 1, 'remove');
    const v = t.get(pos);
    for (let i = pos; i < n; i++) t.set(i, t.get(i + 1));
    t.set(n, undefined);
    return v;
  });
  fn(T, 'concat', (a) => { const t = a[0] as LuaTable; const sep = a[1] === undefined ? '' : tostr(a[1]); const i = tonum(a[2]) ?? 1, j = tonum(a[3]) ?? t.length(); const out = []; for (let k = i; k <= j; k++) out.push(tostr(t.get(k))); return out.join(sep); });
  fn(T, 'sort', (a) => {
    const t = a[0] as LuaTable; const cmp = a[1];
    const arr = t.arr.slice();
    arr.sort((x, y) => cmp ? (truthy(first(call(cmp, [x, y]))) ? -1 : truthy(first(call(cmp, [y, x]))) ? 1 : 0) : ((x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0));
    t.arr = arr;
  });
  fn(T, 'unpack', (a) => unpack(a));
  fn(T, 'getn', (a) => (a[0] as LuaTable).length());
  fn(T, 'maxn', (a) => (a[0] as LuaTable).length());

  // os (solo tiempo)
  const O = new LuaTable(); G.set('os', O);
  fn(O, 'time', () => Math.floor(Date.now() / 1000));
  fn(O, 'clock', () => performance.now() / 1000);
  fn(O, 'date', (a) => { const d = new Date(); return a[0] === '*t' ? (() => { const t = new LuaTable(); t.set('year', d.getFullYear()); t.set('month', d.getMonth() + 1); t.set('day', d.getDate()); t.set('hour', d.getHours()); t.set('min', d.getMinutes()); t.set('sec', d.getSeconds()); return t; })() : d.toLocaleString(); });
}

function unpack(a: unknown[]) {
  const t = a[0] as LuaTable;
  const i = tonum(a[1]) ?? 1, j = tonum(a[2]) ?? t.length();
  const out = [];
  for (let k = i; k <= j; k++) out.push(t.get(k));
  return out;
}

// ámbito vacío para loadstring (las variables libres se resuelven en _G)
class ScopeShim { vars = new Map(); parent = null; varargs = null; lookup() { return undefined; } declare() {} getVarargs() { return []; } }
