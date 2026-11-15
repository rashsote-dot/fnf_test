// Panel de desarrollador: lee el catálogo publicado y enlaza las acciones de GitHub.
const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
const owner = m ? m[1] : 'rashsote-dot';
const repo = m ? (location.pathname.split('/')[1] || `${owner}.github.io`) : 'fnf_test';
const gh = `https://github.com/${owner}/${repo}`;
const $ = (id) => document.getElementById(id);
$('act-release').href = `${gh}/releases/new`;
$('act-url').href = `${gh}/actions/workflows/add-mod.yml`;
$('act-runs').href = `${gh}/actions`;
$('doc-link').href = `${gh}/blob/main/docs/desarrollador.md`;
const LABEL = { full: 'Compatible', partial: 'Parcial', 'songs-only': 'Solo canciones' };
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cat = await (await fetch('mods/catalog.json', { cache: 'no-store' })).json();
const mods = cat.mods ?? [];
const total = mods.reduce((t, x) => t + (x.sizeBytes || 0), 0);
$('quota-text').textContent = `${mb(total)} de ~1024 MB`;
$('quota-bar').style.width = Math.min(100, (total / 1073741824) * 100) + '%';
$('count').textContent = `${mods.length} mods`;
const rows = await Promise.all(mods.map(async (e) => {
  let man = {};
  try { man = await (await fetch(e.path + 'manifest.json', { cache: 'no-store' })).json(); } catch {}
  const notes = (man.compatNotes || []).map((n) => `<li>${esc(n)}</li>`).join('');
  const songs = (man.songs || []).map((s) => `${esc(s.name)} <span class="muted small">(${(s.difficulties || []).map(esc).join('/')})</span>`).join('<br>');
  return `<tr>
    <td>${e.cover ? `<img src="${esc(e.path + e.cover)}" alt="">` : ''}</td>
    <td><b>${esc(e.name)}</b><div class="muted small"><code>${esc(e.id)}</code> · ${esc(e.category)} · popularidad ${esc(e.popularity)}</div>${notes ? `<ul>${notes}</ul>` : ''}</td>
    <td>${songs}</td>
    <td><span class="badge ${esc(e.compatibility)}">${LABEL[e.compatibility] || esc(e.compatibility)}</span></td>
    <td class="num">${mb(e.sizeBytes || 0)}</td>
    <td><div class="acts">
      <a class="btn ghost" href="./#/mod/${encodeURIComponent(e.id)}" target="_blank">Probar</a>
      <a class="btn ghost" href="${gh}/edit/main/public/mods/${encodeURIComponent(e.id)}/manifest.json" target="_blank" rel="noopener" title="Cambiar nombre, descripción, categoría o popularidad">Editar</a>
      <a class="btn ghost danger" href="${gh}/actions/workflows/remove-mod.yml" target="_blank" rel="noopener" title="Run workflow → escribe: ${esc(e.id)}">Quitar</a>
    </div></td></tr>`;
}));
$('rows').innerHTML = rows.join('') || '<tr><td colspan="6" class="muted">No hay mods.</td></tr>';


// Historial automático de commits que modificaron archivos de mods.
// La API pública de GitHub permite mostrar fecha, autor y descripción del cambio.
async function loadPatchHistory() {
  const host = $('patch-history');
  const count = $('patch-count');
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?path=public/mods&per_page=12`,
      { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
    const commits = await response.json();
    count.textContent = `${commits.length} cambios recientes`;
    if (!commits.length) {
      host.textContent = 'Todavía no hay parches registrados.';
      return;
    }
    host.innerHTML = commits.map((item) => {
      const message = (item.commit?.message || 'Actualización de mod').split('\\n')[0];
      const author = item.commit?.author?.name || item.author?.login || 'Desconocido';
      const date = item.commit?.author?.date;
      const when = date
        ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
        : 'Fecha no disponible';
      const isPatch = /patch|parche|fix|correcci[oó]n|ajuste|sprite|offset|position|scale|lua|stage/i.test(message);
      return `<article style="padding:12px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:5px">
          <span class="badge ${isPatch ? 'partial' : 'full'}">${isPatch ? 'Parche / corrección' : 'Actualización de mod'}</span>
          <span class="muted small">${esc(when)}</span>
        </div>
        <b>${esc(message)}</b>
        <div class="muted small">Publicado por ${esc(author)} · <a href="${esc(item.html_url)}" target="_blank" rel="noopener">Ver cambio en GitHub</a></div>
      </article>`;
    }).join('');
  } catch (error) {
    count.textContent = 'No disponible';
    host.textContent = 'No se pudo consultar el historial de GitHub. Recarga la página en unos minutos.';
    console.error('No se pudo cargar el historial de parches:', error);
  }
}
loadPatchHistory();
