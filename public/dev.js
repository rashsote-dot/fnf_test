// Panel de desarrollador: lee el catálogo publicado y enlaza las acciones de GitHub.
const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
const owner = m ? m[1] : 'rashsote-dot';
const repo = m ? (location.pathname.split('/')[1] || `${owner}.github.io`) : 'fnf_test';
const gh = `https://github.com/${owner}/${repo}`;
const $ = (id) => document.getElementById(id);
$('act-release').href = `${gh}/releases/new`;
$('act-url').href = `${gh}/actions/workflows/add-mod.yml`;
$('act-runs').href = `${gh}/actions`;
$('act-validate').href = `${gh}/actions/workflows/deploy.yml`;
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
      const message = (item.commit?.message || 'Actualización de mod').split(/\r?\n/)[0];
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


// ------------------------------------------------------------------ editor DEV aislado: overrides locales, nunca modifica el mod original.
const ed = (id) => document.getElementById('ed-' + id);
const patchKey = (id) => 'funkade-dev-patches:' + id;
let edEntry = null;
let edManifest = null;
let edPath = '';
let edOriginal = '';
let edIsCharacter = false;
let edOverrides = {};

function readOverrides(id) {
  try { return JSON.parse(localStorage.getItem(patchKey(id)) || '{}'); }
  catch { return {}; }
}
function setEditorMessage(message) { ed('message').textContent = message; }
function editorUrl(path) { return new URL(path, document.baseURI).href; }

function renderEditorFiles() {
  const host = ed('files');
  host.replaceChildren();
  if (!edManifest || !Array.isArray(edManifest.files)) {
    host.textContent = 'Este mod no publica una lista de archivos.';
    return;
  }
  const files = edManifest.files.filter(p => /\.(json|lua|js|xml|txt|hscript)$/i.test(p));
  for (const path of files) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost';
    b.textContent = path;
    b.addEventListener('click', () => {
      ed('file').value = path;
      openEditorFile(path);
    });
    host.append(b);
  }
  if (!files.length) host.textContent = 'No hay archivos de texto editables en el manifiesto.';
}
async function openEditorFile(path) {
  if (!edEntry || !path) return;
  edPath = path;
  edIsCharacter = /^characters\/.*\.json$/i.test(path);
  try {
    const response = await fetch(editorUrl(edEntry.path + path), { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    edOriginal = await response.text();
    edOverrides = readOverrides(edEntry.id);
    const shown = Object.prototype.hasOwnProperty.call(edOverrides, path) ? edOverrides[path] : edOriginal;
    ed('source').value = typeof shown === 'string' ? shown : JSON.stringify(shown, null, 2);
    ed('status').textContent = edOverrides[path] !== undefined ? 'Tiene override local' : 'Original';
    ed('preview-name').textContent = path;
    if (edIsCharacter) {
      let data;
      try { data = JSON.parse(ed('source').value); } catch { data = null; }
      updateCharacterPreview(data);
    } else {
      ed('atlas').hidden = true;
      ed('preview-name').textContent = 'Archivo de texto · ' + path;
    }
    setEditorMessage('Archivo abierto: ' + path + '. El original no se ha modificado.');
  } catch (error) {
    setEditorMessage('No se pudo abrir el archivo: ' + error.message);
  }
}
function updateCharacterPreview(data) {
  const image = ed('atlas');
  if (!data || typeof data !== 'object') {
    image.hidden = true;
    ed('preview-name').textContent = 'JSON no válido';
    return;
  }
  const imageName = String(data.image || '').replace(/^\/+/, '');
  image.hidden = !imageName;
  if (imageName) image.src = editorUrl(edEntry.path + 'images/' + imageName + '.png');
  const scale = Number(data.scale ?? 1);
  image.style.transform = 'scale(' + Math.max(.05, Math.min(5, Number.isFinite(scale) ? scale : 1)) + ')';
  ed('scale').value = String(scale);
  ed('x').value = String(data.position?.[0] ?? 0);
  ed('y').value = String(data.position?.[1] ?? 0);
  ed('cx').value = String(data.camera_position?.[0] ?? 0);
  ed('cy').value = String(data.camera_position?.[1] ?? 0);
  ed('preview-name').textContent = imageName ? imageName + '.png · atlas completo' : 'Este personaje no declara una imagen.';
}
function selectedCharacterData() {
  try { return JSON.parse(ed('source').value); }
  catch { setEditorMessage('El JSON tiene un error. Corrígelo antes de aplicar ajustes.'); return null; }
}

ed('mod').replaceChildren(new Option('Selecciona un mod…', ''));
for (const entry of mods) ed('mod').add(new Option(entry.name, entry.id));
ed('mod').addEventListener('change', async () => {
  edEntry = mods.find(x => x.id === ed('mod').value) || null;
  edManifest = null; edPath = ''; ed('source').value = '';
  ed('file').replaceChildren(new Option('Selecciona un archivo…', ''));
  ed('files').textContent = 'Cargando manifiesto…';
  if (!edEntry) return;
  try {
    const response = await fetch(editorUrl(edEntry.path + 'manifest.json'), { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo leer manifest.json');
    edManifest = await response.json();
    edOverrides = readOverrides(edEntry.id);
    renderEditorFiles();
    const character = (edManifest.files || []).find(p => /^characters\/.*\.json$/i.test(p));
    const allText = (edManifest.files || []).filter(p => /\.(json|lua|js|xml|txt|hscript)$/i.test(p));
    ed('file').replaceChildren(new Option('Selecciona un archivo…', ''), ...allText.map(p => new Option(p, p)));
    if (character) { ed('file').value = character; await openEditorFile(character); }
    setEditorMessage('Workspace listo para ' + edEntry.name + '. Los cambios se guardan solo en este navegador.');
  } catch (error) { setEditorMessage(error.message); }
});
ed('load').addEventListener('click', () => openEditorFile(ed('file').value));
ed('source').addEventListener('input', () => {
  ed('status').textContent = 'Sin guardar';
  if (edIsCharacter) updateCharacterPreview(selectedCharacterData());
});
ed('apply').addEventListener('click', () => {
  if (!edIsCharacter) { setEditorMessage('Selecciona un JSON de personaje para usar estos controles.'); return; }
  const data = selectedCharacterData();
  if (!data) return;
  data.scale = Number(ed('scale').value);
  data.position = [Number(ed('x').value), Number(ed('y').value)];
  data.camera_position = [Number(ed('cx').value), Number(ed('cy').value)];
  ed('source').value = JSON.stringify(data, null, 2);
  updateCharacterPreview(data);
  ed('status').textContent = 'Ajustes aplicados · pendiente de guardar';
  setEditorMessage('Ajustes aplicados al JSON. Pulsa «Guardar cambio local» para conservarlos.');
});
ed('save').addEventListener('click', () => {
  if (!edEntry || !edPath) { setEditorMessage('Primero abre un archivo.'); return; }
  const value = ed('source').value;
  if (/\.json$/i.test(edPath)) {
    try { JSON.parse(value); } catch (error) { setEditorMessage('JSON inválido: ' + error.message); return; }
  }
  edOverrides = readOverrides(edEntry.id);
  edOverrides[edPath] = value;
  localStorage.setItem(patchKey(edEntry.id), JSON.stringify(edOverrides));
  ed('status').textContent = 'Guardado localmente';
  setEditorMessage('Guardado en este navegador: ' + edPath + '. El ZIP original sigue intacto.');
});
ed('reset').addEventListener('click', async () => {
  if (!edEntry || !edPath) return;
  if (!confirm('¿Eliminar el override local de ' + edPath + ' y volver al original?')) return;
  edOverrides = readOverrides(edEntry.id);
  delete edOverrides[edPath];
  localStorage.setItem(patchKey(edEntry.id), JSON.stringify(edOverrides));
  await openEditorFile(edPath);
  setEditorMessage('Override eliminado. Se está mostrando el archivo original.');
});
ed('export').addEventListener('click', () => {
  if (!edEntry) { setEditorMessage('Selecciona un mod primero.'); return; }
  const patches = readOverrides(edEntry.id);
  const paths = Object.keys(patches);
  if (!paths.length) { setEditorMessage('Todavía no hay cambios guardados para exportar.'); return; }
  const blob = new Blob([JSON.stringify({ format: 'funkade-mod-patch', version: 1, modId: edEntry.id, files: patches }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = edEntry.id + '-patch.json'; a.click();
  URL.revokeObjectURL(url);
  setEditorMessage('Parche exportado con ' + paths.length + ' archivo(s).');
});
