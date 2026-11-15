import { describe, expect, test } from 'bun:test';
import { accuracy, applyHit, applyMiss, findHittable, grade, judge, newTally } from '../../src/gameplay/judge';

describe('juicio', () => {
  test('ventanas', () => {
    expect(judge(0)).toBe('sick'); expect(judge(-45)).toBe('sick'); expect(judge(60)).toBe('good');
    expect(judge(-120)).toBe('bad'); expect(judge(160)).toBe('shit');
  });
  test('precisión y nota', () => {
    const t = newTally();
    applyHit(t, 'sick'); applyHit(t, 'good'); applyMiss(t);
    expect(t.combo).toBe(0); expect(t.maxCombo).toBe(2);
    expect(accuracy(t)).toBeCloseTo((1 + 0.67) / 3 * 100);
    const s = newTally(); applyHit(s, 'sick');
    expect(grade(s)).toBe('S+ (SFC)');
  });
  test('elige la nota más temprana del carril dentro de la ventana', () => {
    const notes = [
      { t: 800, lane: 0, player: true, state: 0 },
      { t: 1000, lane: 1, player: false, state: 0 },
      { t: 1050, lane: 1, player: true, state: 1 },
      { t: 1100, lane: 1, player: true, state: 0 },
      { t: 1150, lane: 1, player: true, state: 0 },
    ];
    expect(findHittable(notes, 0, 1, 1040)).toBe(3);
    expect(findHittable(notes, 0, 0, 1040)).toBe(-1); // la de 800 ya está fuera de la ventana
    expect(findHittable(notes, 0, 2, 1040)).toBe(-1);
  });
});
