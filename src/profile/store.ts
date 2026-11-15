// Perfiles de jugador guardados en el navegador (IndexedDB). Varios perfiles por dispositivo.
import { idbDelete, idbGet, idbSet } from '../storage/idb';
import { applyPlay, emptyStats, type Achievement, type ModInfo, type PlayRecord, type ProfileStats } from './achievements';

export interface Profile {
  id: string;
  name: string;
  bio: string;
  avatar: string; // data URL (JPEG 256x256) o ''
  theme: number;
  favoriteMod: string;
  createdAt: number;
}

export interface ProfileData { profile: Profile; stats: ProfileStats; recent: PlayRecord[] }

export const THEMES = [
  { name: 'Neón', a: '#ff3fa4', b: '#4f8bff' },
  { name: 'Atardecer', a: '#ff8a3d', b: '#ff3f6c' },
  { name: 'Bosque', a: '#2fbf85', b: '#1d6b8f' },
  { name: 'Galaxia', a: '#7b2ff7', b: '#1c1a4d' },
  { name: 'Oro', a: '#ffd34d', b: '#c46a1b' },
  { name: 'Hielo', a: '#7fe7ff', b: '#4a5ad8' },
  { name: 'Carbón', a: '#4a4a5e', b: '#14141c' },
  { name: 'Cereza', a: '#ff5a6a', b: '#6b1036' },
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
let cache: Map<string, ProfileData> | null = null;
let currentId = '';

async function loadAll(): Promise<Map<string, ProfileData>> {
  if (cache) return cache;
  cache = new Map();
  const ids = (await idbGet<string[]>('kv', 'profiles').catch(() => undefined)) ?? [];
  for (const id of ids) {
    const d = await idbGet<ProfileData>('kv', 'profile:' + id).catch(() => undefined);
    if (d) { d.stats = { ...emptyStats(), ...d.stats }; cache.set(id, d); }
  }
  currentId = (await idbGet<string>('kv', 'currentProfile').catch(() => undefined)) ?? '';
  if (!cache.size) {
    const d = newProfileData('Jugador');
    cache.set(d.profile.id, d);
    currentId = d.profile.id;
    await persist(d);
  }
  if (!cache.has(currentId)) currentId = cache.keys().next().value!;
  return cache;
}

function newProfileData(name: string): ProfileData {
  return { profile: { id: uid(), name, bio: '', avatar: '', theme: Math.floor(Math.random() * THEMES.length), favoriteMod: '', createdAt: Date.now() }, stats: emptyStats(), recent: [] };
}

async function persist(d: ProfileData) {
  await idbSet('kv', 'profile:' + d.profile.id, d).catch(() => {});
  await idbSet('kv', 'profiles', [...(cache?.keys() ?? [])]).catch(() => {});
  await idbSet('kv', 'currentProfile', currentId).catch(() => {});
  for (const l of listeners) l();
}

const listeners = new Set<() => void>();
export function onProfileChange(fn: () => void) { listeners.add(fn); }

export async function current(): Promise<ProfileData> { const all = await loadAll(); return all.get(currentId)!; }
export async function allProfiles(): Promise<ProfileData[]> { return [...(await loadAll()).values()]; }
export async function getProfile(id: string): Promise<ProfileData | undefined> { return (await loadAll()).get(id); }

export async function switchProfile(id: string) { const all = await loadAll(); if (all.has(id)) { currentId = id; await persist(all.get(id)!); } }

export async function createProfile(name: string): Promise<ProfileData> {
  const all = await loadAll();
  const d = newProfileData(name.trim().slice(0, 24) || 'Jugador');
  all.set(d.profile.id, d);
  currentId = d.profile.id;
  await persist(d);
  return d;
}

export async function updateProfile(patch: Partial<Profile>) {
  const d = await current();
  Object.assign(d.profile, patch);
  d.profile.name = d.profile.name.trim().slice(0, 24) || 'Jugador';
  d.profile.bio = d.profile.bio.slice(0, 200);
  await persist(d);
}

export async function deleteProfile(id: string) {
  const all = await loadAll();
  if (all.size <= 1) throw new Error('Debe quedar al menos un perfil.');
  all.delete(id);
  await idbDelete('kv', 'profile:' + id).catch(() => {});
  if (currentId === id) currentId = all.keys().next().value!;
  await persist(all.get(currentId)!);
}

export async function recordPlay(p: PlayRecord, mods: ModInfo[]): Promise<{ fresh: Achievement[]; record: boolean }> {
  const d = await current();
  const bk = `${p.modId}/${p.songId}/${p.diff}`;
  const prevBest = d.stats.bests[bk]?.score ?? -Infinity;
  const fresh = applyPlay(d.stats, p, mods);
  d.recent.unshift(p);
  d.recent.length = Math.min(d.recent.length, 60);
  await persist(d);
  return { fresh, record: p.cleared && p.score > prevBest };
}

/** Reduce una imagen a un avatar cuadrado de 256 px (JPEG ~20–40 KB) */
export async function makeAvatar(file: File): Promise<string> {
  if (file.size > 15 * 1048576) throw new Error('La imagen supera 15 MB.');
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.86);
}

export async function exportProfile(): Promise<Blob> {
  const d = await current();
  return new Blob([JSON.stringify({ funkadeProfile: 1, ...d }, null, 1)], { type: 'application/json' });
}

export async function importProfile(file: File): Promise<ProfileData> {
  const j = JSON.parse(await file.text());
  if (!j || j.funkadeProfile !== 1 || !j.profile || !j.stats) throw new Error('El archivo no es un perfil de Funkade.');
  const all = await loadAll();
  const d: ProfileData = { profile: { ...newProfileData('').profile, ...j.profile, id: uid() }, stats: { ...emptyStats(), ...j.stats }, recent: Array.isArray(j.recent) ? j.recent.slice(0, 60) : [] };
  if (typeof d.profile.avatar !== 'string' || (d.profile.avatar && !d.profile.avatar.startsWith('data:image/'))) d.profile.avatar = '';
  all.set(d.profile.id, d);
  currentId = d.profile.id;
  await persist(d);
  return d;
}
