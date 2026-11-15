// Sección "Jugadores": buscador de perfiles (de este navegador y, si el modo en línea está activo, de todos).
import { THEMES } from '../profile/store';
import { isOnline, likeCounts, onlinePlayer, searchPlayers, type PlayerHit } from '../social/social';

const h = (tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string | null | false | undefined)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k !== null && k !== false && k !== undefined) el.append(k);
  return el;
};
const fmt = (n: number) => Math.round(n).toLocaleString('es');

function avatar(p: PlayerHit, size: number) {
  const t = THEMES[p.theme % THEMES.length];
  const el = h('span', { class: 'avatar', style: `--s:${size}px;--a:${t.a};--b:${t.b}` });
  if (p.avatar) el.append(h('img', { src: p.avatar, alt: '' }));
  else el.append(h('b', {}, (p.name.trim()[0] ?? '?').toUpperCase()));
  return el;
}

function card(p: PlayerHit) {
  return h('a', { class: 'player-card', href: p.online ? '#/player/' + p.id : '#/profile/' + p.id },
    avatar(p, 64),
    h('div', { class: 'pc-body' },
      h('b', {}, p.name),
      h('span', { class: 'muted small' }, `Nivel ${p.level} · ${p.clears} completadas · ${p.achievements} logros`),
      p.bio ? h('p', { class: 'pc-bio' }, p.bio) : null),
    h('span', { class: 'pc-score' }, fmt(p.score), h('small', {}, 'puntos')),
    h('span', { class: 'pc-tag ' + (p.online ? 'on' : 'local') }, p.online ? 'En línea' : 'Este navegador'));
}

let timer = 0;
export async function renderPlayers(root: HTMLElement, initial = '') {
  const online = await isOnline();
  const input = h('input', { type: 'search', id: 'player-search', placeholder: 'Buscar jugadores por nombre…', 'aria-label': 'Buscar jugadores', autocomplete: 'off' }) as HTMLInputElement;
  input.value = initial;
  const list = h('div', { class: 'player-grid', 'aria-live': 'polite' });
  const status = h('p', { class: 'muted small' });
  const run = async () => {
    const q = input.value;
    const res = await searchPlayers(q);
    if (input.value !== q) return;
    status.textContent = res.length ? `${res.length} jugador${res.length > 1 ? 'es' : ''}` : 'Ningún jugador coincide con la búsqueda.';
    list.replaceChildren(...res.map(card));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => void run(), 200); });
  root.replaceChildren(
    h('div', { class: 'section-head' },
      h('div', {}, h('h1', {}, 'Jugadores'),
        h('p', { class: 'muted' }, online
          ? 'Busca a cualquier jugador de Funkade y mira su nivel, logros y puntuación.'
          : 'Busca entre los perfiles de este navegador. Para buscar jugadores de todo el mundo hace falta activar el modo en línea (ver docs/online.md).')),
      h('div', { class: 'toolbar' }, input)),
    status, list);
  await run();
}

export async function renderOnlinePlayer(root: HTMLElement, id: string) {
  const p = await onlinePlayer(id);
  if (!p) { root.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, 'Jugador no encontrado'), h('p', { class: 'muted' }, 'El perfil no existe o el modo en línea no está disponible.'), h('a', { href: '#/players', class: 'btn' }, '← Volver a Jugadores'))); return; }
  const t = THEMES[p.theme % THEMES.length];
  root.replaceChildren(
    h('section', { class: 'pf-head', style: `--a:${t.a};--b:${t.b}` }, h('div', { class: 'pf-head-bg' }),
      h('div', { class: 'pf-head-inner' }, avatar(p, 128),
        h('div', {}, h('h1', {}, p.name), h('p', { class: 'muted' }, p.bio || 'Sin descripción.'), h('span', { class: 'pc-tag on' }, 'Perfil en línea')))),
    h('section', { class: 'panel' }, h('div', { class: 'stat-grid four' },
      ...([['Nivel', p.level], ['Puntos', fmt(p.score)], ['Completadas', p.clears], ['Logros', p.achievements]] as [string, string | number][]).map(([k, v]) => h('div', {}, h('b', {}, String(v)), h('span', {}, k))))),
    h('p', {}, h('a', { href: '#/players' }, '← Volver a Jugadores')));
}

/** botón de "me gusta" con contador (se usa en la lista de canciones y en resultados) */
export function likeButton(key: string, liked: boolean, count: number, onToggle: () => Promise<boolean>) {
  const b = h('button', { type: 'button', class: 'like' + (liked ? ' on' : ''), 'aria-pressed': String(liked), title: liked ? 'Quitar «me gusta»' : 'Me gusta' }) as HTMLButtonElement;
  const n = h('span', { class: 'like-n' }, fmt(count));
  b.append(h('span', { class: 'like-ic', 'aria-hidden': 'true' }, '♥'), n);
  b.dataset.like = key;
  let c = count;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    b.disabled = true;
    const now = await onToggle();
    c = Math.max(0, c + (now ? 1 : -1));
    b.classList.toggle('on', now); b.setAttribute('aria-pressed', String(now)); n.textContent = fmt(c);
    b.title = now ? 'Quitar «me gusta»' : 'Me gusta';
    b.disabled = false;
  });
  return b;
}

export { likeCounts };
