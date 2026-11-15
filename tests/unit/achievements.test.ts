import { describe, expect, test } from 'bun:test';
import { achievementList, applyPlay, emptyStats, levelOf, rankedScore, xpOf, type PlayRecord } from '../../src/profile/achievements';

const mods = [{ id: 'm1', name: 'Mod Uno', songs: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, { id: 'm2', name: 'Mod Dos', songs: [{ id: 'c', name: 'C' }] }];
const play = (o: Partial<PlayRecord>): PlayRecord => ({ modId: 'm1', modName: 'Mod Uno', songId: 'a', songName: 'A', diff: 'normal', score: 10000, accuracy: 90, grade: 'A', sick: 50, good: 5, bad: 0, shit: 0, miss: 2, maxCombo: 40, cleared: true, date: new Date('2026-01-01T15:00:00').getTime(), durationMs: 60000, ...o });

describe('logros', () => {
  test('primera canción y récords por dificultad', () => {
    const s = emptyStats();
    const fresh = applyPlay(s, play({}), mods);
    expect(fresh.map((a) => a.id)).toContain('first-clear');
    applyPlay(s, play({ score: 5000 }), mods);
    expect(s.bests['m1/a/normal'].score).toBe(10000);
    expect(s.plays).toBe(2);
  });
  test('un game over no cuenta como completada', () => {
    const s = emptyStats();
    const fresh = applyPlay(s, play({ cleared: false }), mods);
    expect(s.clears).toBe(0);
    expect(fresh.map((a) => a.id)).not.toContain('first-clear');
  });
  test('FC, SFC, difícil y francotirador', () => {
    const s = emptyStats();
    const ids = applyPlay(s, play({ miss: 0, good: 0, diff: 'hard', accuracy: 100 }), mods).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['fc', 'sfc', 'hard', 'sniper']));
  });
  test('completar todas las canciones de un mod y de todos', () => {
    const s = emptyStats();
    applyPlay(s, play({ songId: 'a' }), mods);
    const ids = applyPlay(s, play({ songId: 'b' }), mods).map((a) => a.id);
    expect(ids).toContain('complete-m1');
    expect(s.achievements['legend']).toBeUndefined();
    const last = applyPlay(s, play({ modId: 'm2', songId: 'c' }), mods).map((a) => a.id);
    expect(last).toEqual(expect.arrayContaining(['complete-m2', 'legend']));
    expect(achievementList(mods).length).toBe(12 + 2 + 1);
  });
  test('nivel, XP y puntuación de clasificación', () => {
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(100).level).toBe(2);
    expect(levelOf(299).level).toBe(2);
    expect(levelOf(300).level).toBe(3);
    const s = emptyStats();
    applyPlay(s, play({ score: 8000 }), mods);
    applyPlay(s, play({ score: 9000 }), mods);
    expect(rankedScore(s)).toBe(9000); // repetir no suma: solo cuenta la mejor marca
    expect(xpOf(s)).toBeGreaterThan(0);
  });
});
