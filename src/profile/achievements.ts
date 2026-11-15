// Logros y niveles. Lógica pura (sin DOM) para poder probarla con tests unitarios.

export interface PlayRecord {
  modId: string; modName: string; songId: string; songName: string; diff: string;
  score: number; accuracy: number; grade: string;
  sick: number; good: number; bad: number; shit: number; miss: number; maxCombo: number;
  cleared: boolean; // terminó la canción (no game over)
  date: number; // epoch ms
  durationMs: number;
}

export interface ProfileStats {
  plays: number;
  clears: number;
  totalScore: number;
  notesHit: number;
  bestCombo: number;
  fcs: number;
  sfcs: number;
  playMs: number;
  hardClears: number;
  bestHardAcc: number;
  nightPlays: number;
  modsPlayed: string[];
  /** mejor resultado por "mod/canción/dificultad" */
  bests: Record<string, PlayRecord>;
  /** canciones completadas al menos una vez: "mod/canción" */
  cleared: string[];
  achievements: Record<string, number>; // id → fecha de desbloqueo
}

export interface ModInfo { id: string; name: string; songs: { id: string; name: string }[] }

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  progress: (s: ProfileStats, mods: ModInfo[]) => [number, number];
}

export function emptyStats(): ProfileStats {
  return { plays: 0, clears: 0, totalScore: 0, notesHit: 0, bestCombo: 0, fcs: 0, sfcs: 0, playMs: 0, hardClears: 0, bestHardAcc: 0, nightPlays: 0, modsPlayed: [], bests: {}, cleared: [], achievements: {} };
}

const clamp = (v: number, max: number): [number, number] => [Math.min(v, max), max];

export function modCompletion(s: ProfileStats, m: ModInfo): [number, number] {
  const done = m.songs.filter((x) => s.cleared.includes(`${m.id}/${x.id}`)).length;
  return [done, m.songs.length];
}

export function achievementList(mods: ModInfo[]): Achievement[] {
  const base: Achievement[] = [
    { id: 'first-clear', name: 'Primer escenario', desc: 'Completa tu primera canción.', icon: '🎤', tier: 'bronze', progress: (s) => clamp(s.clears, 1) },
    { id: 'plays10', name: 'Habitual', desc: 'Juega 10 partidas.', icon: '🎧', tier: 'bronze', progress: (s) => clamp(s.plays, 10) },
    { id: 'combo100', name: 'En racha', desc: 'Consigue un combo de 100 notas.', icon: '🔥', tier: 'bronze', progress: (s) => clamp(s.bestCombo, 100) },
    { id: 'explorer', name: 'Explorador', desc: 'Juega canciones de 3 mods distintos.', icon: '🧭', tier: 'bronze', progress: (s) => clamp(s.modsPlayed.length, 3) },
    { id: 'night', name: 'Noctámbulo', desc: 'Juega una partida entre las 00:00 y las 05:00.', icon: '🌙', tier: 'bronze', progress: (s) => clamp(s.nightPlays, 1) },
    { id: 'fc', name: 'Sin fallos', desc: 'Completa una canción sin fallar ninguna nota (FC).', icon: '🎯', tier: 'silver', progress: (s) => clamp(s.fcs, 1) },
    { id: 'hard', name: 'Sin miedo', desc: 'Completa una canción en dificultad Difícil.', icon: '⚔️', tier: 'silver', progress: (s) => clamp(s.hardClears, 1) },
    { id: 'combo300', name: 'Imparable', desc: 'Consigue un combo de 300 notas.', icon: '☄️', tier: 'silver', progress: (s) => clamp(s.bestCombo, 300) },
    { id: 'plays50', name: 'Veterano', desc: 'Juega 50 partidas.', icon: '🏟️', tier: 'silver', progress: (s) => clamp(s.plays, 50) },
    { id: 'score1m', name: 'Millonario', desc: 'Acumula 1.000.000 de puntos.', icon: '💰', tier: 'silver', progress: (s) => clamp(s.totalScore, 1_000_000) },
    { id: 'sfc', name: 'Perfección absoluta', desc: 'Completa una canción con todas las notas en «¡Genial!» (SFC).', icon: '💎', tier: 'gold', progress: (s) => clamp(s.sfcs, 1) },
    { id: 'sniper', name: 'Francotirador', desc: 'Completa una canción en Difícil con un 95 % de precisión o más.', icon: '🏹', tier: 'gold', progress: (s) => [Math.min(95, Math.floor(s.bestHardAcc)), 95] },
  ];
  const perMod: Achievement[] = mods.filter((m) => m.songs.length).map((m) => ({
    id: 'complete-' + m.id, name: `Completista: ${m.name}`, desc: `Completa todas las canciones de ${m.name}.`, icon: '🏆', tier: 'gold' as const,
    progress: (s: ProfileStats) => modCompletion(s, m),
  }));
  const legend: Achievement = {
    id: 'legend', name: 'Leyenda de Funkade', desc: 'Completa todas las canciones de todos los mods.', icon: '👑', tier: 'platinum',
    progress: (s) => {
      let done = 0, total = 0;
      for (const m of mods) { const [d, t] = modCompletion(s, m); done += d; total += t; }
      return [done, Math.max(1, total)];
    },
  };
  return [...base, ...perMod, legend];
}

/** Actualiza las estadísticas con una partida y devuelve los logros recién desbloqueados. */
export function applyPlay(s: ProfileStats, p: PlayRecord, mods: ModInfo[]): Achievement[] {
  s.plays++;
  s.playMs += p.durationMs;
  s.notesHit += p.sick + p.good + p.bad + p.shit;
  s.bestCombo = Math.max(s.bestCombo, p.maxCombo);
  if (!s.modsPlayed.includes(p.modId)) s.modsPlayed.push(p.modId);
  const h = new Date(p.date).getHours();
  if (h < 5) s.nightPlays++;
  if (p.cleared) {
    s.clears++;
    s.totalScore += Math.max(0, p.score);
    if (p.miss === 0) s.fcs++;
    if (p.miss === 0 && p.good + p.bad + p.shit === 0 && p.sick > 0) s.sfcs++;
    if (p.diff === 'hard') { s.hardClears++; s.bestHardAcc = Math.max(s.bestHardAcc, p.accuracy); }
    const key = `${p.modId}/${p.songId}`;
    if (!s.cleared.includes(key)) s.cleared.push(key);
    const bk = `${key}/${p.diff}`;
    if (!s.bests[bk] || p.score > s.bests[bk].score) s.bests[bk] = p;
  }
  return checkAchievements(s, mods);
}

export function checkAchievements(s: ProfileStats, mods: ModInfo[]): Achievement[] {
  const fresh: Achievement[] = [];
  for (const a of achievementList(mods)) {
    if (s.achievements[a.id]) continue;
    const [cur, max] = a.progress(s, mods);
    if (max > 0 && cur >= max) { s.achievements[a.id] = Date.now(); fresh.push(a); }
  }
  return fresh;
}

// ---------------------------------------------------------------- nivel y XP
export function xpOf(s: ProfileStats): number {
  return Math.floor(s.totalScore / 2000) + s.clears * 40 + Object.keys(s.achievements).length * 150 + s.fcs * 60;
}

/** nivel n requiere 100·n·(n−1)/2 XP acumulada (100, 300, 600, 1000…) */
export function levelOf(xp: number): { level: number; cur: number; need: number } {
  let level = 1;
  while (xp >= (100 * level * (level + 1)) / 2) level++;
  const prev = (100 * (level - 1) * level) / 2;
  return { level, cur: xp - prev, need: 100 * level };
}

/** puntuación de clasificación: suma de la mejor puntuación de cada canción/dificultad (no premia repetir) */
export function rankedScore(s: ProfileStats): number {
  return Object.values(s.bests).reduce((t, b) => t + Math.max(0, b.score), 0);
}
