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
      loadSongAtlas(data);
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

let edSongChart = null;
let edSongDuration = 0;
let edSongFrames = [];
let edSongImage = null;
let edSongAnim = null;
let edSongAnimStarted = 0;
let edSongLastPose = 'idle';
let edSongRaf = 0;
const songCanvas = $('ed-song-canvas');
const songCtx = songCanvas?.getContext('2d');
const fmtSongTime = (ms) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(sec / 60)).padStart(2,'0') + ':' + String(sec % 60).padStart(2,'0');
};
function drawSongPreview() {
  if (!songCtx || !songCanvas) return;
  const w = songCanvas.width, h = songCanvas.height;
  songCtx.clearRect(0,0,w,h);
  const grad = songCtx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0,'#29213d'); grad.addColorStop(.72,'#171329'); grad.addColorStop(1,'#100d1c');
  songCtx.fillStyle=grad; songCtx.fillRect(0,0,w,h);
  songCtx.fillStyle='rgba(255,255,255,.08)'; songCtx.fillRect(0,h-34,w,34);
  songCtx.fillStyle='rgba(255,255,255,.22)'; songCtx.fillRect(0,h-36,w,2);
  if (!edSongImage || !edSongImage.complete || !edSongFrames.length) {
    songCtx.fillStyle='#c8bfdc'; songCtx.font='16px sans-serif'; songCtx.textAlign='center';
    songCtx.fillText('Carga un JSON de personaje con atlas XML para ver la animación',w/2,h/2);
    return;
  }
  const frame=edSongFrames[Math.floor((performance.now()-edSongAnimStarted)/1000*24)%edSongFrames.length];
  if (!frame) return;
  const data=selectedCharacterData();
  const scale=Math.max(.05,Math.min(5,Number(data?.scale??1)));
  const sw=frame.w*scale, sh=frame.h*scale;
  const posX=Number(data?.position?.[0]??0), posY=Number(data?.position?.[1]??0);
  const x=w/2-sw/2+posX*scale, y=h-36-sh+posY*scale;
  songCtx.imageSmoothingEnabled=false;
  songCtx.drawImage(edSongImage,frame.x,frame.y,frame.w,frame.h,x,y,sw,sh);
}
function tickSongPreview() { drawSongPreview(); edSongRaf=requestAnimationFrame(tickSongPreview); }
if(songCanvas && !edSongRaf) edSongRaf=requestAnimationFrame(tickSongPreview);
function renderSongPosition() {
  if (!edSongChart) { drawSongPreview(); return; }
  const ms=(Number(ed('song-seek').value)/1000)*edSongDuration;
  const sections=edSongChart.song?.notes || edSongChart.notes || [];
  let elapsed=0, sectionIndex=0, section=null;
  const bpm=Number(edSongChart.song?.bpm || edManifest?.songs?.find(s=>s.id===ed('song').value)?.bpm || 100);
  for(let i=0;i<sections.length;i++){
    const s=sections[i], length=Math.max(1,Number(s.lengthInSteps||16))*60000/(Math.max(1,bpm)*4);
    if(ms>=elapsed && ms<elapsed+length){sectionIndex=i;section=s;break;}
    elapsed+=length;
  }
  let chosen=null;
  const notes=(section?.sectionNotes||[]);
  const charId=edPath.split('/').pop().replace(/\.json$/i,'').toLowerCase();
  const song=edSongChart.song||edSongChart;
  const isPlayer=String(song.player1||'').toLowerCase()===charId;
  const shouldMatch=section ? (!!section.mustHitSection===isPlayer) : false;
  for(const n of notes){
    if(Number(n[0])<=ms && ms-Number(n[0])<650 && (Number(n[1])%4)>=0 && (Number(n[1])%4)<4) {
      if(shouldMatch) chosen=n;
    }
  }
  let pose='idle';
  if(chosen) pose=['singLEFT','singDOWN','singUP','singRIGHT'][Number(chosen[1])%4]||'idle';
  const anims=selectedCharacterData()?.animations||selectedCharacterData()?.anims||[];
  const anim=anims.find(a=>(a.anim||a.name||'').toLowerCase()===pose.toLowerCase())
    || anims.find(a=>(a.anim||a.name||'').toLowerCase()==='idle');
  const prefix=anim?.name||anim?.prefix||'';
  if(pose!==edSongLastPose || !edSongFrames.length) {
    edSongLastPose=pose; edSongAnim=anim;
    const matching=edSongAllFrames.filter(f=>f.name.toLowerCase().startsWith(String(prefix).toLowerCase()));
    edSongFrames=matching.length?matching:[];
    edSongAnimStarted=performance.now();
  }
  $('ed-song-time').textContent=fmtSongTime(ms)+' / '+fmtSongTime(edSongDuration);
  $('ed-song-pose').textContent='Animación: '+(anim?.anim||pose)+(chosen?' · nota':' · reposo');
  $('ed-song-section').textContent='Sección '+(sectionIndex+1)+' · '+(section?.mustHitSection?'Turno jugador':'Turno oponente');
  drawSongPreview();
}
let edSongAllFrames=[];
async function loadSongAtlas(data) {
  edSongAllFrames=[]; edSongFrames=[]; edSongImage=null;
  if(!edEntry || !data?.image) { drawSongPreview(); return; }
  const base=String(data.image).replace(/^\/+/, '');
  const imageUrl=editorUrl(edEntry.path+'images/'+base+'.png');
  const xmlUrl=editorUrl(edEntry.path+'images/'+base+'.xml');
  try {
    const [imgRes,xmlRes]=await Promise.all([fetch(imageUrl),fetch(xmlUrl)]);
    if(!imgRes.ok||!xmlRes.ok) throw new Error('No se encontró PNG/XML del atlas');
    const xmlText=await xmlRes.text();
    const doc=new DOMParser().parseFromString(xmlText,'application/xml');
    edSongAllFrames=[...doc.querySelectorAll('SubTexture')].map(node=>({
      name:node.getAttribute('name')||'',x:Number(node.getAttribute('x')),y:Number(node.getAttribute('y')),
      w:Number(node.getAttribute('width')),h:Number(node.getAttribute('height'))
    })).filter(f=>f.name&&f.w>0&&f.h>0);
    edSongImage=new Image();
    edSongImage.src=imageUrl;
    await new Promise((resolve,reject)=>{edSongImage.onload=resolve;edSongImage.onerror=reject;});
    renderSongPosition();
  } catch(error) {
    $('ed-song-status').textContent='Atlas no disponible: '+error.message;
    drawSongPreview();
  }
}
async function loadSongChart() {
  if(!edEntry || !edManifest) return;
  const id=ed('song').value;
  if(!id) return;
  const songMeta=edManifest.songs?.find(s=>s.id===id);
  const difficulty=ed('difficulty').value;
  const files=Array.isArray(edManifest.files)?edManifest.files:[];
  const candidates=[
    `data/${id}/${id}-${difficulty}.json`,
    `data/${id}/${id}.json`,
    ...files.filter(p=>p.startsWith(`data/${id}/`) && p.endsWith('.json') && /\.json$/i.test(p))
  ].filter((p,i,a)=>a.indexOf(p)===i);
  edSongChart=null; edSongDuration=0; edSongFrames=[];
  $('ed-song-status').textContent='Cargando chart…';
  for(const path of candidates) {
    if(files.length && !files.includes(path)) continue;
    try {
      const res=await fetch(editorUrl(edEntry.path+path),{cache:'no-store'});
      if(res.ok) {
        const parsed=await res.json();
        if(parsed.song?.notes || parsed.notes) { edSongChart=parsed; break; }
      }
    } catch {}
  }
  if(!edSongChart){
    $('ed-song-status').textContent='No se encontró un chart compatible para esta canción/dificultad';
    drawSongPreview(); return;
  }
  const sections=edSongChart.song?.notes||edSongChart.notes||[];
  const bpm=Number(edSongChart.song?.bpm||songMeta?.bpm||100);
  let total=0;
  for(const s of sections) total+=Math.max(1,Number(s.lengthInSteps||16))*60000/(Math.max(1,bpm)*4);
  const last=sections.flatMap(s=>s.sectionNotes||[]).reduce((v,n)=>Math.max(v,Number(n[0])||0),0);
  edSongDuration=Math.max(total,last+5000,1000);
  $('ed-song-seek').value='0';
  $('ed-song-status').textContent='Chart cargado · '+sections.length+' secciones';
  renderSongPosition();
}
function setupSongPreview(data) {
  const select=ed('song');
  if(!select || !edManifest) return;
  const songs=Array.isArray(edManifest.songs)?edManifest.songs:[];
  select.replaceChildren(new Option(songs.length ? 'Selecciona una canción…' : 'Este mod no tiene canciones', ''));
  for(const song of songs) select.add(new Option(song.name || song.id,song.id));
  select.value=songs[0]?.id || '';
  const updateDifficulties=()=>{
    const song=songs.find(item=>item.id===select.value);
    const difficulties=Array.isArray(song?.difficulties)&&song.difficulties.length?song.difficulties:['hard','normal','easy'];
    const difficulty=ed('difficulty');
    difficulty.replaceChildren(...difficulties.map((name)=>new Option(
      String(name).charAt(0).toUpperCase()+String(name).slice(1),String(name)
    )));
    difficulty.value=difficulties[0]||'hard';
  };
  updateDifficulties();
  edSongChart=null; edSongDuration=0; edSongLastPose='idle'; edSongFrames=[];
  ed('song-seek').value='0';
  ed('song-time').textContent='00:00 / 00:00';
  ed('song-pose').textContent='En espera';
  ed('song-section').textContent='Sección —';
  $('ed-song-status').textContent=songs.length ? 'Primera canción seleccionada' : 'Este mod no declara canciones';
  select.onchange=()=>{updateDifficulties();loadSongChart();};
  ed('difficulty').onchange=loadSongChart;
  ed('song-seek').oninput=renderSongPosition;
  if(data) loadSongAtlas(data);
}

 
// Previsualizador de escenarios: el orden de capas se guarda aparte del JSON.
let edStageData = null;
let edStagePath = '';
let edStageOrder = [];
let edStageImages = new Map();
let edStageBounds = [];
let edStageSelected = -1;
let edStageAssetSelected = '';
let edStageAssetImage = null;
const stageCanvas = $('ed-stage-canvas');
const stageCtx = stageCanvas?.getContext('2d');
const stageLayerKey = (id) => 'funkade-dev-stage-layers:' + id;
function readStageLayers(id) {
  try { return JSON.parse(localStorage.getItem(stageLayerKey(id)) || '{}'); }
  catch { return {}; }
}
function stageDrawableIndices() {
  // Cualquier objeto visual del stage es seleccionable, aunque use otro type.
  return (edStageData?.objects || []).map((o,i)=>({o,i}))
    .filter(x=>!!x.o && (x.o.image || ['gf','dad','boyfriend'].includes(String(x.o.type||'').toLowerCase())))
    .map(x=>x.i);
}
function stageAssetPaths() {
  return (edManifest?.files || []).filter(p => /^images\/.+\.png$/i.test(p));
}
function stageAssetOptions() {
  return stageAssetPaths().map(path => new Option('Sprite · ' + path.replace(/^images\//i,''), 'asset:' + path));
}
function showStageAsset(path) {
  edStageAssetSelected=path||'';edStageSelected=-1;edStageAssetImage=null;
  updateStageLayerButtons();drawStagePreview();
}
function stageObjectLabel(obj,index) {
  return String(obj?.name || obj?.image || obj?.type || 'Objeto') + ' · #' + (index+1);
}
function setupStageEditor() {
  const select=ed('stage-file');
  if(!select || !edManifest) return;
  const paths=(edManifest.files||[]).filter(p=>/^stages\/.*\.json$/i.test(p));
  select.replaceChildren(new Option(paths.length?'Selecciona un escenario…':'Este mod no declara escenarios',''),...paths.map(p=>new Option(p,p)));
  ed('stage-object').replaceChildren(new Option('Selecciona un objeto o sprite…',''),...stageAssetOptions());
  edStageData=null;edStagePath='';edStageOrder=[];edStageSelected=-1;edStageAssetSelected='';edStageAssetImage=null;edStageImages=new Map();
  ed('stage-status').textContent=paths.length?'Escenario disponible':'No hay escenarios · puedes explorar los sprites del mod';
  ed('layer-back').disabled=true;ed('layer-front').disabled=true;
  drawStagePreview();
  if(paths.length){select.value=paths[0];loadStageFile(paths[0]);}
  select.onchange=()=>loadStageFile(select.value);
  ed('stage-object').onchange=()=>{
    const value=ed('stage-object').value;
    if(value.startsWith('asset:')){showStageAsset(value.slice(6));return;}
    edStageAssetSelected='';
    edStageSelected=value===''?-1:Number(value);
    updateStageLayerButtons();drawStagePreview();
  };
}
async function loadStageFile(path) {
  if(!edEntry||!path)return;
  edStagePath=path;edStageData=null;edStageImages=new Map();edStageSelected=-1;edStageAssetSelected='';edStageAssetImage=null;
  ed('stage-status').textContent='Cargando escenario…';
  try{
    const response=await fetch(editorUrl(edEntry.path+path),{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const parsed=await response.json();
    if(!Array.isArray(parsed.objects))throw new Error('El JSON no contiene una lista objects.');
    // Algunos stages no incluyen gf/dad/boyfriend en objects: el motor los crea
    // automáticamente usando sus coordenadas. Añadimos marcadores solo en memoria
    // para que también puedan seleccionarse sin tocar el JSON publicado.
    const presentTypes=new Set(parsed.objects.map(o=>String(o?.type||'').toLowerCase()));
    for(const type of ['gf','dad','boyfriend']){
      if(type==='gf'&&parsed.hide_girlfriend)continue;
      if(!presentTypes.has(type))parsed.objects.push({type,name:type+' (personaje del escenario)',_editorVirtual:true});
    }
    edStageData=parsed;
    const drawable=stageDrawableIndices();
    const saved=readStageLayers(edEntry.id)[path];
    edStageOrder=Array.isArray(saved)?saved.filter(i=>drawable.includes(i)):[];
    for(const i of drawable)if(!edStageOrder.includes(i))edStageOrder.push(i);
    ed('stage-object').replaceChildren(
      new Option('Selecciona un objeto o sprite…',''),
      ...edStageOrder.map(i=>new Option(stageObjectLabel(parsed.objects[i],i),String(i))),
      ...stageAssetOptions()
    );
    ed('stage-status').textContent=drawable.length+' objetos del escenario · '+stageAssetPaths().length+' sprites del mod';
    updateStageLayerButtons();
    drawStagePreview();
  }catch(error){
    ed('stage-status').textContent='No se pudo cargar: '+error.message;
    drawStagePreview();
  }
}
function updateStageLayerButtons(){
  const at=edStageOrder.indexOf(edStageSelected);
  const isStageObject=!edStageAssetSelected&&at>=0;
  ed('layer-back').disabled=!isStageObject||at<=0;
  ed('layer-front').disabled=!isStageObject||at>=edStageOrder.length-1;
}
function moveStageLayer(direction){
  const at=edStageOrder.indexOf(edStageSelected),to=at+direction;
  if(at<0||to<0||to>=edStageOrder.length)return;
  [edStageOrder[at],edStageOrder[to]]=[edStageOrder[to],edStageOrder[at]];
  const all=readStageLayers(edEntry.id);all[edStagePath]=edStageOrder.slice();
  localStorage.setItem(stageLayerKey(edEntry.id),JSON.stringify(all));
  updateStageLayerButtons();drawStagePreview();
  ed('stage-status').textContent='Orden guardado localmente · '+edStageOrder.length+' objetos';
}
ed('layer-back').addEventListener('click',()=>moveStageLayer(-1));
ed('layer-front').addEventListener('click',()=>moveStageLayer(1));
function stageImageUrl(obj){
  let image=String(obj?.image||'').replace(/^\/+|\.png$/gi,'');
  if(!image)return '';
  return editorUrl(edEntry.path+'images/'+image+'.png');
}
function loadStageImage(obj,index){
  if(edStageImages.has(index))return edStageImages.get(index);
  const record={image:null,ready:false,failed:false,frame:null};
  edStageImages.set(index,record);
  const url=stageImageUrl(obj);
  if(!url){record.failed=true;return record;}
  const img=new Image();
  img.onload=async()=>{
    record.image=img;record.ready=true;
    try{
      const xmlUrl=url.replace(/\.png(?:\?.*)?$/i,'.xml');
      const res=await fetch(xmlUrl);
      if(res.ok){
        const doc=new DOMParser().parseFromString(await res.text(),'application/xml');
        const nodes=[...doc.querySelectorAll('SubTexture')];
        const animation=(obj.animations||[]).find(a=>a.name===obj.firstAnimation||a.anim===obj.firstAnimation)||obj.animations?.[0];
        const prefix=String(animation?.prefix||animation?.name||'');
        const node=nodes.find(n=>(n.getAttribute('name')||'').startsWith(prefix))||nodes[0];
        if(node)record.frame={x:Number(node.getAttribute('x')),y:Number(node.getAttribute('y')),w:Number(node.getAttribute('width')),h:Number(node.getAttribute('height'))};
      }
    }catch{}
    drawStagePreview();
  };
  img.onerror=()=>{record.failed=true;drawStagePreview();};
  img.src=url;
  return record;
}
function drawStagePreview(){
  if(!stageCtx||!stageCanvas)return;
  const w=stageCanvas.width,h=stageCanvas.height;
  stageCtx.clearRect(0,0,w,h);
  const bg=stageCtx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#29213d');bg.addColorStop(1,'#100d1c');
  stageCtx.fillStyle=bg;stageCtx.fillRect(0,0,w,h);
  stageCtx.strokeStyle='rgba(255,255,255,.09)';stageCtx.lineWidth=1;
  for(let x=0;x<w;x+=80){stageCtx.beginPath();stageCtx.moveTo(x,0);stageCtx.lineTo(x,h);stageCtx.stroke();}
  for(let y=0;y<h;y+=60){stageCtx.beginPath();stageCtx.moveTo(0,y);stageCtx.lineTo(w,y);stageCtx.stroke();}
  edStageBounds=[];
  if(edStageAssetSelected){
    if(!edStageAssetImage){
      const img=new Image();edStageAssetImage=img;
      img.onload=drawStagePreview;
      img.onerror=()=>{stageCtx.fillStyle='#ff9aaa';stageCtx.font='14px sans-serif';stageCtx.textAlign='center';stageCtx.fillText('No se pudo cargar este sprite',w/2,h/2);};
      img.src=editorUrl(edEntry.path+edStageAssetSelected);
    }
    if(edStageAssetImage.complete&&edStageAssetImage.naturalWidth){
      const fit=Math.min((w-40)/edStageAssetImage.naturalWidth,(h-40)/edStageAssetImage.naturalHeight,1);
      const dw=edStageAssetImage.naturalWidth*fit,dh=edStageAssetImage.naturalHeight*fit;
      stageCtx.imageSmoothingEnabled=false;
      stageCtx.drawImage(edStageAssetImage,(w-dw)/2,(h-dh)/2,dw,dh);
      stageCtx.strokeStyle='#ff3fa4';stageCtx.lineWidth=2;stageCtx.strokeRect((w-dw)/2,(h-dh)/2,dw,dh);
      stageCtx.fillStyle='#fff';stageCtx.font='11px sans-serif';stageCtx.textAlign='left';
      stageCtx.fillText(edStageAssetSelected.replace(/^images\\//i,''),12,h-12);
    }else{
      stageCtx.fillStyle='#c8bfdc';stageCtx.font='15px sans-serif';stageCtx.textAlign='center';
      stageCtx.fillText('Cargando sprite…',w/2,h/2);
    }
    return;
  }
  if(!edStageData){
    stageCtx.fillStyle='#c8bfdc';stageCtx.font='15px sans-serif';stageCtx.textAlign='center';
    stageCtx.fillText('Selecciona un sprite del mod o un escenario',w/2,h/2);return;
  }
  if(!edStageOrder.length){
    stageCtx.fillStyle='#c8bfdc';stageCtx.font='15px sans-serif';stageCtx.textAlign='center';
    stageCtx.fillText('Este escenario no contiene objetos ni marcadores de personajes',w/2,h/2);
  }
  const zoom=Math.max(.1,Math.min(3,Number(edStageData.defaultZoom||1)));
  const scaleX=(w/1280)*zoom,scaleY=(h/720)*zoom;
  for(const index of edStageOrder){
    const obj=edStageData.objects[index];if(!obj)continue;
    const objectType=String(obj.type||'').toLowerCase();
    if(['gf','dad','boyfriend'].includes(objectType)){
      const position=objectType==='boyfriend'?(edStageData.boyfriend||[770,100]):objectType==='gf'?(edStageData.girlfriend||[400,130]):(edStageData.opponent||[100,100]);
      const px=(Number(position[0]||0)-640)*scaleX+w/2;
      const py=(Number(position[1]||0)-360)*scaleY+h/2;
      const pw=76*scaleX,ph=118*scaleY;
      edStageBounds.push({index,x:px,y:py,w:pw,h:ph});
      stageCtx.save();
      stageCtx.fillStyle=index===edStageSelected?'rgba(255,63,164,.35)':'rgba(125,180,255,.18)';
      stageCtx.strokeStyle=index===edStageSelected?'#ff3fa4':'#9dc8ff';
      stageCtx.lineWidth=2;stageCtx.setLineDash([5,3]);
      stageCtx.fillRect(px,py,pw,ph);stageCtx.strokeRect(px,py,pw,ph);
      stageCtx.setLineDash([]);stageCtx.fillStyle='#fff';stageCtx.font='bold 11px sans-serif';stageCtx.textAlign='center';
      stageCtx.fillText(objectType==='boyfriend'?'BOYFRIEND':objectType.toUpperCase(),px+pw/2,py+ph/2);
      stageCtx.restore();
      continue;
    }
    const asset=loadStageImage(obj,index);
    const sx=Number(Array.isArray(obj.scale)?obj.scale[0]:obj.scale??1)||1;
    const sy=Number(Array.isArray(obj.scale)?obj.scale[1]:obj.scale??1)||1;
    const frame=asset.frame;
    const naturalW=frame?.w||asset.image?.naturalWidth||160;
    const naturalH=frame?.h||asset.image?.naturalHeight||90;
    let imageName=String(obj.image||'');
    if(imageName.startsWith('/'))imageName=imageName.slice(1);
    if(imageName.toLowerCase().endsWith('.png'))imageName=imageName.slice(0,-4);
    const textureScale=Number(edManifest?.textureScale?.['images/'+imageName]??1)||1;
    const dw=naturalW*sx*textureScale*scaleX,dh=naturalH*sy*textureScale*scaleY;
    const dx=(Number(obj.x||0)-640)*scaleX+w/2,dy=(Number(obj.y||0)-360)*scaleY+h/2;
    const bounds={index,x:dx,y:dy,w:dw,h:dh};edStageBounds.push(bounds);
    stageCtx.save();stageCtx.globalAlpha=Math.max(0,Math.min(1,Number(obj.alpha??1)));
    if(obj.flipX){stageCtx.translate(dx+dw,dy);stageCtx.scale(-1,1);}
    if(asset.ready&&asset.image){
      if(frame)stageCtx.drawImage(asset.image,frame.x,frame.y,frame.w,frame.h,obj.flipX?0:dx,obj.flipX?0:dy,dw,dh);
      else stageCtx.drawImage(asset.image,obj.flipX?0:dx,obj.flipX?0:dy,dw,dh);
    }else{
      stageCtx.fillStyle=asset.failed?'rgba(255,90,120,.22)':'rgba(180,160,220,.18)';
      stageCtx.fillRect(obj.flipX?0:dx,obj.flipX?0:dy,dw,dh);
      stageCtx.strokeStyle='rgba(255,255,255,.35)';stageCtx.strokeRect(obj.flipX?0:dx,obj.flipX?0:dy,dw,dh);
      stageCtx.fillStyle='#fff';stageCtx.font='11px sans-serif';stageCtx.textAlign='left';
      stageCtx.fillText(String(obj.name||obj.image||'Objeto'),(obj.flipX?0:dx)+4,(obj.flipX?0:dy)+14);
    }
    stageCtx.restore();
    if(index===edStageSelected){
      stageCtx.save();stageCtx.strokeStyle='#ff3fa4';stageCtx.lineWidth=3;stageCtx.setLineDash([7,4]);
      stageCtx.strokeRect(dx,dy,dw,dh);stageCtx.restore();
    }
  }
  stageCtx.fillStyle='rgba(0,0,0,.55)';stageCtx.fillRect(8,h-25,230,18);
  stageCtx.fillStyle='#fff';stageCtx.font='11px sans-serif';stageCtx.textAlign='left';
  stageCtx.fillText('Vista aproximada · coordenadas 1280 × 720',14,h-12);
}
stageCanvas?.addEventListener('click',(event)=>{
  if(!edStageData||!edStageBounds.length)return;
  const rect=stageCanvas.getBoundingClientRect();
  const x=(event.clientX-rect.left)*stageCanvas.width/rect.width;
  const y=(event.clientY-rect.top)*stageCanvas.height/rect.height;
  const hit=[...edStageBounds].reverse().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
  if(hit){edStageSelected=hit.index;ed('stage-object').value=String(hit.index);updateStageLayerButtons();drawStagePreview();}
});

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
    setupSongPreview(null);
    setupStageEditor();
    edOverrides = readOverrides(edEntry.id);
    renderEditorFiles();
    const character = (edManifest.files || []).find(p => /^characters\/.*\.json$/i.test(p));
    const allText = (edManifest.files || []).filter(p => /\.(json|lua|js|xml|txt|hscript)$/i.test(p));
    ed('file').replaceChildren(new Option('Selecciona un archivo…', ''), ...allText.map(p => new Option(p, p)));
    if (character) { ed('file').value = character; await openEditorFile(character); }
    if (ed('song').value) await loadSongChart();
    setEditorMessage('Workspace listo para ' + edEntry.name + '. Los cambios se guardan solo en este navegador.');
  } catch (error) { setEditorMessage(error.message); }
});
ed('load').addEventListener('click', () => openEditorFile(ed('file').value));
ed('source').addEventListener('input', () => {
  ed('status').textContent = 'Sin guardar';
  if (edIsCharacter) { const data=selectedCharacterData(); updateCharacterPreview(data); loadSongAtlas(data); }
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
  const stageLayers = readStageLayers(edEntry.id);
  const stagePaths = Object.keys(stageLayers).filter(path => Array.isArray(stageLayers[path]) && stageLayers[path].length);
  if (!paths.length && !stagePaths.length) { setEditorMessage('Todavía no hay cambios guardados para exportar.'); return; }
  const blob = new Blob([JSON.stringify({ format: 'funkade-mod-patch', version: 1, modId: edEntry.id, files: patches, ...(stagePaths.length ? { stageLayers } : {}) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = edEntry.id + '-patch.json'; a.click();
  URL.revokeObjectURL(url);
  setEditorMessage('Parche exportado: ' + paths.length + ' archivo(s) y ' + stagePaths.length + ' escenario(s) con orden de capas.');
});
