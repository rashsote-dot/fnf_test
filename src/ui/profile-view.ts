// Vistas de perfil (estilo Steam) y podio.
import { achievementList, levelOf, modCompletion, rankedScore, xpOf, type ModInfo, type PlayRecord } from '../profile/achievements';
import { allProfiles, createProfile, current, deleteProfile, exportProfile, getProfile, importProfile, makeAvatar, switchProfile, THEMES, updateProfile, type Profile, type ProfileData } from '../profile/store';

type ModInfoX = ModInfo & { cover: string };

const h = (tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string | null | false | undefined)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k !== null && k !== false && k !== undefined) el.append(k);
  return el;
};
const btn = (label: string, onClick: () => void, cls = '') => { const b = h('button', { type: 'button', class: cls }, label) as HTMLButtonElement; b.addEventListener('click', onClick); return b; };
const fmt = (n: number) => Math.round(n).toLocaleString('es');
const DIFF: Record<string, string> = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };

export function avatarEl(p: Profile, size = 40, cls = '') {
  const t = THEMES[p.theme % THEMES.length];
  const el = h('span', { class: 'avatar ' + cls, style: `--s:${size}px;--a:${t.a};--b:${t.b}` });
  if (p.avatar) el.append(h('img', { src: p.avatar, alt: '' }));
  else el.append(h('b', {}, (p.name.trim()[0] ?? '?').toUpperCase()));
  return el;
}

function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.floor(s / 86400)} d`;
  return new Date(ts).toLocaleDateString('es');
}

function hours(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

// ---------------------------------------------------------------- perfil
export async function renderProfile(root: HTMLElement, mods: ModInfoX[], profileId?: string, onChange?: () => void) {
  const me = await current();
  const d = profileId ? (await getProfile(profileId)) ?? me : me;
  const isMe = d.profile.id === me.profile.id;
  const p = d.profile, s = d.stats;
  const theme = THEMES[p.theme % THEMES.length];
  const xp = xpOf(s);
  const lv = levelOf(xp);
  const achs = achievementList(mods);
  const unlocked = achs.filter((a) => s.achievements[a.id]).sort((a, b) => s.achievements[b.id] - s.achievements[a.id]);
  const fav = mods.find((m) => m.id === p.favoriteMod);

  // cabecera
  const header = h('section', { class: 'pf-head', style: `--a:${theme.a};--b:${theme.b}` },
    h('div', { class: 'pf-head-bg' }),
    h('div', { class: 'pf-head-inner' },
      h('div', { class: 'pf-avatar-wrap' }, avatarEl(p, 132, 'xl'), h('span', { class: 'pf-level', title: 'Nivel' }, String(lv.level))),
      h('div', { class: 'pf-id' },
        h('h1', {}, p.name),
        h('p', { class: 'pf-bio' }, p.bio || (isMe ? 'Añade una descripción desde «Editar perfil».' : '')),
        h('div', { class: 'pf-xp' },
          h('div', { class: 'pf-xp-top' }, h('b', {}, `Nivel ${lv.level}`), h('span', { class: 'muted' }, `${fmt(lv.cur)} / ${fmt(lv.need)} XP`)),
          h('div', { class: 'bar' }, h('div', { style: `width:${Math.min(100, (lv.cur / lv.need) * 100)}%` }))),
        fav ? h('p', { class: 'pf-fav' }, 'Mod favorito: ', h('a', { href: '#/mod/' + encodeURIComponent(fav.id) }, fav.name)) : null),
      isMe ? h('div', { class: 'pf-actions' },
        btn('Editar perfil', () => openEditor(mods, onChange), 'btn primary'),
        profileSwitcher(onChange)) : h('div', { class: 'pf-actions' }, btn('Ver mi perfil', () => (location.hash = '#/profile'), 'ghost'))));

  // estadísticas
  const stats = h('section', { class: 'panel pf-stats' }, h('h2', {}, 'Estadísticas'),
    h('div', { class: 'stat-grid' },
      ...([['Partidas', fmt(s.plays)], ['Canciones completadas', fmt(s.clears)], ['Puntuación total', fmt(s.totalScore)], ['Puntos de clasificación', fmt(rankedScore(s))],
        ['Combo máximo', fmt(s.bestCombo)], ['Full Combos', fmt(s.fcs)], ['Notas acertadas', fmt(s.notesHit)], ['Tiempo jugado', hours(s.playMs)]] as [string, string][])
        .map(([k, v]) => h('div', {}, h('b', {}, v), h('span', {}, k)))));

  // vitrina de logros
  const showcase = h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Vitrina de logros'), h('span', { class: 'muted' }, `${unlocked.length} / ${achs.length}`)),
    unlocked.length
      ? h('div', { class: 'ach-strip' }, ...unlocked.slice(0, 10).map((a) => h('span', { class: 'ach-badge ' + a.tier, title: `${a.name} — ${a.desc}` }, a.icon)))
      : h('p', { class: 'muted' }, 'Aún no hay logros. ¡Completa una canción para empezar!'));

  // actividad reciente
  const recent = h('section', { class: 'panel' }, h('h2', {}, 'Actividad reciente'),
    d.recent.length ? h('ul', { class: 'activity' }, ...d.recent.slice(0, 8).map((r) => activityItem(r, mods))) : h('p', { class: 'muted' }, 'Todavía no has jugado ninguna canción.'));

  // mejores puntuaciones
  const bests = Object.values(s.bests).sort((a, b) => b.score - a.score).slice(0, 6);
  const top = h('section', { class: 'panel' }, h('h2', {}, 'Mejores puntuaciones'),
    bests.length ? h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Canción'), h('th', {}, 'Dificultad'), h('th', {}, 'Nota'), h('th', { class: 'num' }, 'Precisión'), h('th', { class: 'num' }, 'Puntos'))),
      h('tbody', {}, ...bests.map((b) => h('tr', {},
        h('td', {}, h('b', {}, b.songName), h('div', { class: 'muted small' }, b.modName)),
        h('td', {}, h('span', { class: 'diff ' + b.diff }, DIFF[b.diff] ?? b.diff)),
        h('td', {}, h('span', { class: 'grade-chip' }, b.grade)),
        h('td', { class: 'num' }, b.accuracy.toFixed(2) + '%'),
        h('td', { class: 'num' }, fmt(b.score)))))) : h('p', { class: 'muted' }, 'Completa canciones para registrar tus récords.'));

  // progreso por mod
  const progress = h('section', { class: 'panel' }, h('h2', {}, 'Progreso por mod'),
    h('div', { class: 'mod-progress' }, ...mods.filter((m) => m.songs.length).map((m) => {
      const [done, total] = modCompletion(s, m);
      const pct = Math.round((done / total) * 100);
      return h('a', { class: 'mp-row' + (done === total ? ' done' : ''), href: '#/mod/' + encodeURIComponent(m.id) },
        m.cover ? h('img', { src: m.cover, alt: '', loading: 'lazy' }) : h('span', { class: 'mp-ph' }),
        h('div', {}, h('div', { class: 'mp-top' }, h('b', {}, m.name), h('span', { class: 'muted' }, `${done}/${total}${done === total ? ' ✓' : ''}`)),
          h('div', { class: 'bar' }, h('div', { style: `width:${pct}%` }))));
    })));

  // todos los logros
  const all = h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Logros'), h('span', { class: 'muted' }, `${Math.round((unlocked.length / achs.length) * 100)} % completado`)),
    h('div', { class: 'ach-grid' }, ...achs.map((a) => {
      const got = s.achievements[a.id];
      const [cur, max] = a.progress(s, mods);
      return h('div', { class: 'ach ' + a.tier + (got ? ' got' : '') },
        h('span', { class: 'ach-ic' }, a.icon),
        h('div', {}, h('b', {}, a.name), h('p', {}, a.desc),
          got ? h('span', { class: 'ach-date' }, 'Desbloqueado ' + ago(got))
            : h('div', { class: 'bar sm' }, h('div', { style: `width:${Math.min(100, (cur / max) * 100)}%` }))),
        !got ? h('span', { class: 'ach-prog' }, `${fmt(cur)}/${fmt(max)}`) : null);
    })));

  root.replaceChildren(header, h('div', { class: 'pf-cols' }, h('div', { class: 'pf-main' }, recent, top, all), h('aside', { class: 'pf-side' }, stats, showcase, progress)));
}

function activityItem(r: PlayRecord, mods: ModInfoX[]) {
  const m = mods.find((x) => x.id === r.modId);
  return h('li', {},
    m?.cover ? h('img', { src: m.cover, alt: '', loading: 'lazy' }) : h('span', { class: 'mp-ph' }),
    h('div', { class: 'act-main' },
      h('b', {}, r.songName), h('span', { class: 'muted small' }, `${r.modName} · `, h('span', { class: 'diff ' + r.diff }, DIFF[r.diff] ?? r.diff)),
      h('span', { class: 'muted small' }, ago(r.date))),
    h('div', { class: 'act-score' }, r.cleared ? h('span', { class: 'grade-chip' }, r.grade) : h('span', { class: 'grade-chip fail' }, 'Game Over'),
      h('b', {}, fmt(r.score)), h('span', { class: 'muted small' }, r.accuracy.toFixed(2) + '%')));
}

function profileSwitcher(onChange?: () => void) {
  const wrap = h('div', { class: 'switcher' });
  const sel = h('select', { 'aria-label': 'Cambiar de perfil' }) as HTMLSelectElement;
  void (async () => {
    const list = await allProfiles(); const me = await current();
    sel.replaceChildren(...list.map((d) => h('option', { value: d.profile.id }, d.profile.name)), h('option', { value: '__new' }, '+ Nuevo perfil…'));
    sel.value = me.profile.id;
  })();
  sel.addEventListener('change', async () => {
    if (sel.value === '__new') {
      const name = prompt('Nombre del nuevo perfil:', 'Jugador');
      if (name) await createProfile(name);
    } else await switchProfile(sel.value);
    onChange?.();
  });
  wrap.append(sel);
  return wrap;
}

// ---------------------------------------------------------------- editor
function openEditor(mods: ModInfoX[], onChange?: () => void) {
  let dlg = document.getElementById('dlg-profile') as HTMLDialogElement | null;
  dlg?.remove();
  dlg = h('dialog', { id: 'dlg-profile', class: 'dialog narrow' }) as HTMLDialogElement;
  document.body.append(dlg);
  void (async () => {
    const d = await current();
    const p = { ...d.profile };
    const preview = h('div', { class: 'pe-preview' });
    const draw = () => preview.replaceChildren(avatarEl(p as Profile, 96, 'xl'));
    draw();
    const file = h('input', { type: 'file', accept: 'image/*', hidden: '' }) as HTMLInputElement;
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; if (!f) return;
      try { p.avatar = await makeAvatar(f); draw(); } catch (e) { alert((e as Error).message); }
    });
    const name = h('input', { type: 'text', maxlength: '24', value: p.name, required: '' }) as HTMLInputElement;
    const bio = h('textarea', { maxlength: '200', rows: '3', placeholder: 'Cuéntale algo a los demás…' }) as HTMLTextAreaElement;
    bio.value = p.bio;
    const favSel = h('select', {}, h('option', { value: '' }, '— Ninguno —'), ...mods.map((m) => h('option', { value: m.id }, m.name))) as HTMLSelectElement;
    favSel.value = p.favoriteMod;
    const themes = h('div', { class: 'themes' }, ...THEMES.map((t, i) => {
      const b = btn('', () => { p.theme = i; themes.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); draw(); }, 'swatch');
      b.style.background = `linear-gradient(135deg, ${t.a}, ${t.b})`; b.title = t.name; b.setAttribute('aria-pressed', String(i === p.theme));
      return b;
    }));
    const importFile = h('input', { type: 'file', accept: 'application/json,.json', hidden: '' }) as HTMLInputElement;
    importFile.addEventListener('change', async () => {
      const f = importFile.files?.[0]; if (!f) return;
      try { await importProfile(f); dlg!.close(); onChange?.(); } catch (e) { alert((e as Error).message); }
    });
    dlg!.append(h('form', { method: 'dialog' },
      h('div', { class: 'dialog-head' }, h('h2', {}, 'Editar perfil'), h('button', { value: 'cancel', class: 'ghost icon-only', 'aria-label': 'Cerrar' }, '✕')),
      h('div', { class: 'pe-grid' },
        h('div', { class: 'pe-av' }, preview, btn('Cambiar foto', () => file.click(), 'ghost'), p.avatar ? btn('Quitar foto', () => { p.avatar = ''; draw(); }, 'link') : null, file),
        h('div', { class: 'pe-fields' },
          h('label', {}, 'Nombre', name),
          h('label', {}, 'Descripción', bio),
          h('label', {}, 'Mod favorito', favSel),
          h('div', { class: 'pe-label' }, 'Color del perfil', themes))),
      h('div', { class: 'pe-extra' },
        btn('Exportar perfil', async () => {
          const a = h('a', { href: URL.createObjectURL(await exportProfile()), download: `perfil-${p.name}.json` }) as HTMLAnchorElement;
          a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }, 'ghost'),
        btn('Importar perfil', () => importFile.click(), 'ghost'), importFile,
        btn('Eliminar perfil', async () => {
          if (!confirm(`¿Eliminar el perfil «${d.profile.name}» y todo su progreso? No se puede deshacer.`)) return;
          try { await deleteProfile(d.profile.id); dlg!.close(); onChange?.(); } catch (e) { alert((e as Error).message); }
        }, 'ghost danger')),
      h('div', { class: 'dialog-actions' },
        h('button', { value: 'cancel', class: 'ghost' }, 'Cancelar'),
        btn('Guardar', async () => {
          await updateProfile({ name: name.value, bio: bio.value, avatar: p.avatar, theme: p.theme, favoriteMod: favSel.value });
          dlg!.close(); onChange?.();
        }, 'btn primary'))));
    dlg!.showModal();
  })();
}

// ---------------------------------------------------------------- podio
export async function renderPodium(root: HTMLElement, mods: ModInfoX[], songKey = '') {
  const list = await allProfiles();
  const songs: { key: string; label: string }[] = [];
  for (const m of mods) for (const s of m.songs) songs.push({ key: `${m.id}/${s.id}`, label: `${s.name} — ${m.name}` });
  const scoreOf = (d: ProfileData) => {
    if (!songKey) return rankedScore(d.stats);
    return Math.max(0, ...Object.entries(d.stats.bests).filter(([k]) => k.startsWith(songKey + '/')).map(([, b]) => b.score));
  };
  const ranked = list.map((d) => ({ d, score: scoreOf(d) })).sort((a, b) => b.score - a.score);
  const sel = h('select', { 'aria-label': 'Clasificación' }, h('option', { value: '' }, 'General (puntos de clasificación)'), ...songs.map((s) => h('option', { value: s.key }, s.label))) as HTMLSelectElement;
  sel.value = songKey;
  sel.addEventListener('change', () => void renderPodium(root, mods, sel.value));

  const place = (i: number) => {
    const r = ranked[i];
    const medal = ['🥇', '🥈', '🥉'][i];
    if (!r) return h('div', { class: `pod p${i + 1} empty` }, h('div', { class: 'pod-person' }, h('span', { class: 'avatar ph', style: '--s:88px' }, h('b', {}, '?')), h('b', {}, 'Libre')), h('div', { class: 'pod-step' }, h('span', {}, String(i + 1))));
    const lv = levelOf(xpOf(r.d.stats)).level;
    return h('a', { class: `pod p${i + 1}`, href: '#/profile/' + r.d.profile.id },
      h('div', { class: 'pod-person' }, h('span', { class: 'medal' }, medal), avatarEl(r.d.profile, i === 0 ? 112 : 88, 'ring'), h('b', {}, r.d.profile.name), h('span', { class: 'muted small' }, `Nivel ${lv}`), h('span', { class: 'pod-score' }, fmt(r.score))),
      h('div', { class: 'pod-step' }, h('span', {}, String(i + 1))));
  };

  root.replaceChildren(
    h('div', { class: 'section-head' },
      h('div', {}, h('h1', {}, 'Podio'), h('p', { class: 'muted' }, 'Clasificación de los perfiles de este navegador. La puntuación general suma tu mejor marca en cada canción y dificultad.')),
      h('div', { class: 'toolbar' }, sel)),
    h('div', { class: 'podium' }, place(1), place(0), place(2)),
    h('section', { class: 'panel' }, h('table', { class: 'table rank' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Jugador'), h('th', { class: 'num' }, 'Nivel'), h('th', { class: 'num' }, 'Completadas'), h('th', { class: 'num' }, 'Logros'), h('th', { class: 'num' }, 'Puntos'))),
      h('tbody', {}, ...ranked.map((r, i) => h('tr', {},
        h('td', {}, String(i + 1)),
        h('td', {}, h('a', { class: 'rank-player', href: '#/profile/' + r.d.profile.id }, avatarEl(r.d.profile, 32), r.d.profile.name)),
        h('td', { class: 'num' }, String(levelOf(xpOf(r.d.stats)).level)),
        h('td', { class: 'num' }, String(r.d.stats.cleared.length)),
        h('td', { class: 'num' }, String(Object.keys(r.d.stats.achievements).length)),
        h('td', { class: 'num' }, h('b', {}, fmt(r.score)))))))),
    h('p', { class: 'muted small' }, 'Consejo: crea un perfil para cada persona que juegue en este equipo desde «Perfil → Nuevo perfil». Para llevar tu progreso a otro dispositivo usa «Exportar perfil».'));
}
