import { describe, expect, test } from 'bun:test';
import { parsePsychChart, parsePsychCharacter, parsePsychStage } from '../../src/adapters/psych';
import { parseVsliceChart, parseVsliceCharacter } from '../../src/adapters/vslice';
import { parseFnfwebChart } from '../../src/adapters/fnfweb';
import { beatToTime, timeToBeat } from '../../src/adapters/common';
import { parseSparrowXml } from '../../src/renderer/atlas';
import { detectMod } from '../../src/mod-loader/mod-manager-detect';

describe('Psych / legacy', () => {
  const legacy = { song: { song: 'Test', bpm: 120, speed: 2, player1: 'bf', player2: 'dad', notes: [
    { mustHitSection: true, lengthInSteps: 16, sectionNotes: [[0, 0, 0], [500, 5, 250], [600, -1, 'Hey!', '', '']] },
    { mustHitSection: false, sectionBeats: 4, sectionNotes: [[2000, 1, 0], [2100, 6, 0, 'Hurt Note']] },
  ] } };
  const c = parsePsychChart(legacy, null);
  test('lados relativos a mustHitSection', () => {
    expect(c.notes.map((n) => [n.t, n.lane, n.player])).toEqual([[0, 0, true], [500, 1, false], [2000, 1, false], [2100, 2, true]]);
  });
  test('tipos de nota y sostenidos', () => {
    expect(c.notes[1].len).toBe(250);
    expect(c.notes[3].kind).toBe('hurt');
  });
  test('eventos incrustados y foco de cámara por sección', () => {
    expect(c.events.find((e) => e.name === 'hey')?.t).toBe(600);
    expect(c.events.filter((e) => e.name === 'camFocus').map((e) => e.v.target)).toEqual(['bf', 'dad']);
    expect(c.events.find((e) => e.name === 'camFocus' && e.v.target === 'dad')?.t).toBe(2000);
  });
  test('psych_v1: lados absolutos', () => {
    const v1 = parsePsychChart({ song: { format: 'psych_v1', bpm: 100, notes: [{ mustHitSection: false, sectionBeats: 4, sectionNotes: [[0, 0, 0], [10, 4, 0]] }] } }, null);
    expect(v1.notes.map((n) => n.player)).toEqual([true, false]);
  });
  test('cambio de BPM', () => {
    const bc = parsePsychChart({ song: { bpm: 120, notes: [{ sectionBeats: 4, sectionNotes: [] }, { changeBPM: true, bpm: 60, sectionBeats: 4, sectionNotes: [] }] } }, null);
    expect(bc.timeChanges).toEqual([{ t: 0, bpm: 120 }, { t: 2000, bpm: 60 }]);
    expect(timeToBeat(3000, bc.timeChanges)).toBeCloseTo(5);
    expect(beatToTime(5, bc.timeChanges)).toBeCloseTo(3000);
  });
  test('eventos de events.json', () => {
    const e = parsePsychChart({ song: { bpm: 100, notes: [] } }, { song: { events: [[1000, [['Change Character', 'dad', 'pico'], ['Unknown', '', '']]]] } });
    expect(e.events.find((x) => x.name === 'changeChar')?.v).toEqual({ target: 'dad', char: 'pico' });
    expect(e.warnings.join()).toContain('Unknown');
  });
  test('personaje: flip para el jugador y colores', () => {
    const ch = parsePsychCharacter({ image: 'characters/BOYFRIEND', flip_x: true, healthbar_colors: [49, 176, 209], animations: [{ anim: 'idle', name: 'BF idle dance', fps: 24, loop: false, offsets: [-5, 0] }] }, 'bf', true);
    expect(ch.flipX).toBe(false);
    expect(ch.image).toBe('images/characters/BOYFRIEND');
    expect(ch.healthColor).toBe('#31b0d1');
    expect(ch.anims[0]).toMatchObject({ name: 'idle', prefix: 'BF idle dance', offset: [-5, 0] });
  });
  test('escenario con objetos', () => {
    const st = parsePsychStage({ defaultZoom: 0.7, camera_speed: 1.7, boyfriend: [1, 2], objects: [{ type: 'sprite', name: 'bg', image: 'stageback', x: -600, y: -200, scroll: [0.9, 0.9] }, { type: 'gf' }] }, 's');
    expect(st.zoom).toBe(0.7);
    expect(st.cameraSpeed).toBe(1.7);
    expect(st.props).toHaveLength(1);
    expect(st.props[0].image).toBe('images/stageback');
    expect(st.chars.bf.x).toBe(1);
  });
});

describe('V-Slice', () => {
  const meta = { songName: 'X', timeChanges: [{ t: 0, bpm: 150 }], playData: { characters: { player: 'bf', opponent: 'dad', girlfriend: 'gf' }, stage: 'mainStage' } };
  const chart = { scrollSpeed: { hard: 2.5 }, events: [{ t: 100, e: 'FocusCamera', v: { char: 1 } }, { t: 200, e: 'ZoomCamera', v: { zoom: 1.2, duration: 4 } }, { t: 300, e: 'Weird' }], notes: { hard: [{ t: 0, d: 4 }, { t: 100, d: 2, l: 300 }, { t: 200, d: 1, k: 'hurt' }] } };
  const c = parseVsliceChart(meta, chart, 'hard');
  test('notas y lados', () => expect(c.notes.map((n) => [n.lane, n.player, n.len, n.kind])).toEqual([[0, false, 0, ''], [2, true, 300, ''], [1, true, 0, 'hurt']]));
  test('scroll y personajes', () => { expect(c.scrollSpeed).toBe(2.5); expect(c.player).toBe('bf'); expect(c.stage).toBe('mainStage'); });
  test('eventos', () => {
    expect(c.events[0]).toMatchObject({ name: 'camFocus', v: { target: 'dad' } });
    expect(c.events[1].v.dur).toBeCloseTo(400); // 4 pasos a 150 BPM = 400 ms
    expect(c.warnings.join()).toContain('Weird');
  });
  test('dificultad inexistente', () => expect(() => parseVsliceChart(meta, chart, 'easy')).toThrow());
  test('personaje con atlas de Animate no soportado', () => expect(() => parseVsliceCharacter({ renderType: 'animateatlas' }, 'x')).toThrow());
});

describe('Formato nativo y utilidades', () => {
  test('elimina notas duplicadas', () => {
    const c = parseFnfwebChart({ bpm: 100, notes: [[0, 1, 0, 1], [0.5, 1, 0, 1], [0, 1, 0, 0]] });
    expect(c.notes).toHaveLength(2);
    expect(c.warnings[0]).toContain('duplicadas');
  });
  test('parser Sparrow', () => {
    const f = parseSparrowXml('<TextureAtlas><SubTexture name="idle0000" x="1" y="2" width="30" height="40" frameX="-3" frameY="-4" frameWidth="36" frameHeight="48"/><SubTexture name="a &amp; b0001" x="0" y="0" width="5" height="6" rotated="true"/></TextureAtlas>');
    expect(f[0]).toEqual({ name: 'idle0000', x: 1, y: 2, w: 30, h: 40, fx: -3, fy: -4, fw: 36, fh: 48, rotated: false });
    expect(f[1].name).toBe('a & b0001');
    expect([f[1].fw, f[1].fh]).toEqual([6, 5]);
  });
  test('detección de formato de mods importados', () => {
    const p = detectMod(['data/bopeebo/bopeebo.json', 'data/bopeebo/bopeebo-hard.json', 'data/bopeebo/events.json', 'scripts/a.lua'], 'm');
    expect(p.format).toBe('psych');
    expect(p.songs[0]).toMatchObject({ id: 'bopeebo', difficulties: ['normal', 'hard'] });
    expect(p.compatibility).toBe('partial');
    expect(detectMod(['data/songs/darnell/darnell-metadata.json', 'data/songs/darnell/darnell-chart.json'], 'v').format).toBe('vslice');
  });
});
