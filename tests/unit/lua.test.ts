import { describe, expect, test } from 'bun:test';
import { Interp, LuaTable } from '../../src/lua/lua';
import { installStdlib } from '../../src/lua/stdlib';

function run(src: string) {
  const out: string[] = [];
  const I = new Interp();
  installStdlib(I, (s) => out.push(s));
  const r = I.run(src);
  return { out, r, I };
}

describe('intérprete Lua', () => {
  test('aritmética, cadenas y precedencia', () => {
    expect(run('return 1 + 2 * 3 ^ 2, 2 ^ 3 ^ 2, -2 ^ 2, 7 % 3, -7 % 3, "a" .. 1 .. "b", 10 / 4').r).toEqual([19, 512, -4, 1, 2, 'a1b', 2.5]);
  });
  test('locales, closures, varargs y retornos múltiples', () => {
    const { r } = run(`
      local function counter() local n = 0 return function() n = n + 1 return n end end
      local c = counter(); c(); c()
      local function multi(...) return select('#', ...), ... end
      local a, b, x = multi(10, 20)
      return c(), a, b, x`);
    expect(r).toEqual([3, 2, 10, 20]);
  });
  test('tablas, ipairs, pairs, # y métodos', () => {
    const { r } = run(`
      local t = {1, 2, 3, x = 'y', [10] = 'z'}
      local s = 0 for i, v in ipairs(t) do s = s + v end
      local k = 0 for _ in pairs(t) do k = k + 1 end
      local obj = {v = 5} function obj:get(n) return self.v + n end
      table.insert(t, 4) table.insert(t, 1, 0)
      return s, k, #t, obj:get(2), t[1], table.concat({1,2,3}, '-')`);
    expect(r).toEqual([6, 5, 5, 7, 0, '1-2-3']);
  });
  test('control de flujo: while, repeat, for con paso, break y goto continue', () => {
    const { r } = run(`
      local a = 0 while a < 10 do a = a + 3 end
      local b = 0 repeat b = b + 1 until b >= 4
      local c = 0 for i = 10, 1, -2 do c = c + i end
      local d = 0 for i = 1, 100 do if i > 5 then break end d = d + i end
      local e = 0 for i = 1, 5 do if i % 2 == 0 then goto continue end e = e + i ::continue:: end
      return a, b, c, d, e`);
    expect(r).toEqual([12, 4, 30, 15, 9]);
  });
  test('librería string con patrones de Lua', () => {
    const { r } = run(`
      local a, b = string.find('hola mundo', 'mun')
      local m = string.match('Value: 42px', '(%d+)px')
      local g = string.gsub('hello world', 'o', '0')
      local k, v = string.match('key = value', '^(%w+)%s*=%s*(%w+)$')
      local words = {} for w in string.gmatch('uno dos  tres', '%a+') do words[#words + 1] = w end
      local trimmed = ('  hi  '):gsub('^%s*(.-)%s*$', '%1')
      return a, b, m, g, k, v, #words, trimmed, string.format('%.2f|%03d|%s|%x', 3.14159, 7, 'x', 255), ('abc'):upper(), string.sub('abcdef', -3)`);
    expect(r).toEqual([6, 8, '42', 'hell0 w0rld', 'key', 'value', 3, 'hi', '3.14|007|x|ff', 'ABC', 'def']);
  });
  test('pcall, error y metatablas', () => {
    const { r } = run(`
      local ok, err = pcall(function() error('fallo') end)
      local mt = {__index = function(t, k) return k .. '!' end}
      local t = setmetatable({}, mt)
      local v = setmetatable({}, {__add = function(a, b) return 99 end})
      return ok, err, t.hola, v + 1`);
    expect(r).toEqual([false, 'fallo', 'hola!', 99]);
  });
  test('un bucle infinito se detiene en lugar de congelar', () => {
    const I = new Interp(); installStdlib(I, () => {}); I.maxSteps = 100000;
    expect(() => I.run('while true do end')).toThrow(/tardó demasiado/);
  });
  test('sin acceso al entorno de JavaScript', () => {
    const { r } = run('return type(window), type(document), type(fetch), type(require), type(os.execute), type(io)');
    expect(r).toEqual(['nil', 'nil', 'nil', 'function', 'nil', 'nil']);
  });
  test('código real de Psych: script de evento', () => {
    const { I } = run(`
      local camin = 0.025
      function onEvent(name, value1, value2)
        if name == 'bop' then
          if value1 == '' then camin = 0.025 else camin = tonumber(value1) end
        end
      end
      function get() return camin end`);
    const onEvent = I.G.get('onEvent');
    I.protectedCall(onEvent, ['bop', '0.05', '']);
    expect(I.protectedCall(I.G.get('get'), [])).toEqual([0.05]);
    expect(I.G).toBeInstanceOf(LuaTable);
  });
});
