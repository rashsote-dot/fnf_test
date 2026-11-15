// "Me gusta" de canciones y búsqueda de jugadores.
//
// Dos modos:
//  · Local (por defecto): cuenta los perfiles de este navegador. Funciona sin servidor.
//  · En línea (opcional): si public/online.json tiene la URL y la clave pública (anon) de un proyecto de Supabase,
//    los "me gusta" y los perfiles públicos se guardan allí y se suman los de todos los jugadores.
//    El SQL de las tablas está en docs/online.md. GitHub Pages es estático: sin ese backend no hay forma
//    de juntar datos de distintos jugadores, y la web lo indica en pantalla.
import { idbGet, idbSet } from '../storage/idb';
import { levelOf, rankedScore, xpOf } from '../profile/achievements';
import { allProfiles, current, toggleLike as toggleLocal, type ProfileData } from '../profile/store';

interface OnlineCfg { supabaseUrl: string; supabaseAnonKey: string }
export interface PlayerHit { id: string; name: string; avatar: string; theme: number; bio: string; level: number; score: number; clears: number; achievements: number; online: boolean }

let cfgP: Promise<OnlineCfg | null> | null = null;
let token: { access: string; user: string; exp: number } | null = null;

function config(): Promise<OnlineCfg | null> {
  cfgP ??= fetch(new URL('online.json', document.baseURI), { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(String(j.supabaseUrl)) && j.supabaseAnonKey ? { supabaseUrl: String(j.supabaseUrl).replace(/\/$/, ''), supabaseAnonKey: String(j.supabaseAnonKey) } : null))
    .catch(() => null);
  return cfgP;
}

export async function isOnline() { return !!(await config()); }

/** sesión anónima de Supabase (una por navegador; se renueva sola) */
async function session(c: OnlineCfg) {
  if (token && token.exp > Date.now() + 60000) return token;
  const saved = await idbGet<{ access: string; refresh: string; user: string; exp: number }>('kv', 'online:session').catch(() => undefined);
  const call = (path: string, body: unknown) => fetch(c.supabaseUrl + path, { method: 'POST', headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('auth ' + r.status))));
  let j: any = null;
  if (saved?.refresh) j = await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: saved.refresh }).catch(() => null);
  if (!j) j = await call('/auth/v1/signup', {});
  const s = { access: j.access_token, refresh: j.refresh_token, user: j.user?.id, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  await idbSet('kv', 'online:session', s).catch(() => {});
  token = s;
  return s;
}

async function rest(path: string, init: RequestInit = {}, auth = true): Promise<any> {
  const c = await config();
  if (!c) throw new Error('offline');
  const headers: Record<string, string> = { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (auth) headers.Authorization = 'Bearer ' + (await session(c)).access;
  const r = await fetch(`${c.supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  if (!r.ok) throw new Error(`Servidor: ${r.status}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

const likeCache = new Map<string, number>();

/** número de "me gusta" de cada canción ('<mod>/<canción>') */
export async function likeCounts(keys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(keys.map((k) => [k, 0]));
  if (await isOnline()) {
    try {
      const list = keys.map((k) => `"${k.replace(/"/g, '')}"`).join(',');
      const rows: { song_key: string; likes: number }[] = await rest(`song_like_counts?select=song_key,likes&song_key=in.(${encodeURIComponent(list)})`, {}, false);
      for (const r of rows) out.set(r.song_key, r.likes);
      for (const [k, v] of out) likeCache.set(k, v);
      return out;
    } catch { /* si el servidor falla se muestran los locales */ }
  }
  for (const d of await allProfiles()) for (const k of d.likes ?? []) if (out.has(k)) out.set(k, out.get(k)! + 1);
  return out;
}

export async function isLiked(key: string) { return ((await current()).likes ?? []).includes(key); }

/** alterna el "me gusta" del jugador actual; devuelve el nuevo estado */
export async function toggleLike(key: string): Promise<boolean> {
  const liked = await toggleLocal(key);
  if (await isOnline()) {
    try {
      const s = await session((await config())!);
      if (liked) await rest('song_likes', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: s.user, song_key: key }) });
      else await rest(`song_likes?user_id=eq.${s.user}&song_key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
    } catch { /* se queda guardado en local */ }
  }
  return liked;
}

function hitFrom(d: ProfileData): PlayerHit {
  return { id: d.profile.id, name: d.profile.name, avatar: d.profile.avatar, theme: d.profile.theme, bio: d.profile.bio, level: levelOf(xpOf(d.stats)).level, score: rankedScore(d.stats), clears: d.stats.cleared.length, achievements: Object.keys(d.stats.achievements).length, online: false };
}

/** publica (o actualiza) el perfil actual en el servidor, si el modo en línea está activo */
export async function publishProfile() {
  if (!(await isOnline())) return;
  try {
    const d = await current();
    const s = await session((await config())!);
    const p = hitFrom(d);
    await rest('players', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: s.user, name: p.name, avatar: p.avatar.slice(0, 60000), theme: p.theme, bio: p.bio, level: p.level, score: p.score, clears: p.clears, achievements: p.achievements, updated_at: new Date().toISOString() }) });
  } catch { /* sin conexión: se reintenta en la próxima partida */ }
}

/** busca jugadores por nombre (perfiles de este navegador + servidor si está configurado) */
export async function searchPlayers(q: string): Promise<PlayerHit[]> {
  const needle = q.trim().toLowerCase();
  const local = (await allProfiles()).map(hitFrom).filter((p) => !needle || p.name.toLowerCase().includes(needle));
  let online: PlayerHit[] = [];
  if (await isOnline()) {
    try {
      const filter = needle ? `&name=ilike.*${encodeURIComponent(needle.replace(/[*,()]/g, ''))}*` : '';
      const rows: any[] = await rest(`players?select=id,name,avatar,theme,bio,level,score,clears,achievements&order=score.desc&limit=50${filter}`, {}, false);
      online = rows.map((r) => ({ id: r.id, name: String(r.name ?? 'Jugador'), avatar: typeof r.avatar === 'string' && r.avatar.startsWith('data:image/') ? r.avatar : '', theme: +r.theme || 0, bio: String(r.bio ?? ''), level: +r.level || 1, score: +r.score || 0, clears: +r.clears || 0, achievements: +r.achievements || 0, online: true }));
    } catch { /* solo locales */ }
  }
  return [...local, ...online].sort((a, b) => b.score - a.score);
}

export async function onlinePlayer(id: string): Promise<PlayerHit | null> {
  if (!(await isOnline()) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  try {
    const rows: any[] = await rest(`players?select=id,name,avatar,theme,bio,level,score,clears,achievements&id=eq.${id}`, {}, false);
    const r = rows[0];
    return r ? { id: r.id, name: r.name, avatar: String(r.avatar ?? '').startsWith('data:image/') ? r.avatar : '', theme: +r.theme || 0, bio: r.bio ?? '', level: +r.level || 1, score: +r.score || 0, clears: +r.clears || 0, achievements: +r.achievements || 0, online: true } : null;
  } catch { return null; }
}
