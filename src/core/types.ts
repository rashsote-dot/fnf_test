// Formato interno normalizado. Todos los adaptadores convierten a estas estructuras;
// el motor nunca conoce los formatos originales de Psych, V-Slice, etc.

export type CharSlot = 'bf' | 'dad' | 'gf';

export interface ChartNote {
  /** tiempo en ms desde el inicio de la canción */
  t: number;
  /** carril 0..3 (izquierda, abajo, arriba, derecha) */
  lane: number;
  /** duración del sostenido en ms (0 = nota simple) */
  len: number;
  /** true = la toca el jugador, false = el oponente */
  player: boolean;
  /** tipo de nota: '' normal, 'hurt', 'alt', o cualquier otro (los desconocidos se tratan como normales) */
  kind: string;
  /** nombre original del tipo de nota en el mod (p. ej. 'Hurt Note', 'CustardNote'), para los scripts */
  type?: string;
}

export interface ChartEvent {
  t: number;
  /** nombre interno: camFocus, camZoom, camBop, playAnim, hey, changeChar, flash, shake, scrollSpeed, script */
  name: string;
  /** parámetros ya normalizados */
  v: Record<string, unknown>;
  /** nombre y valores originales (Psych: [nombre, valor1, valor2]) para onEvent de los scripts */
  raw?: [string, string, string];
}

export interface TimeChange { t: number; bpm: number }

export interface InternalChart {
  songName: string;
  bpm: number;
  timeChanges: TimeChange[];
  scrollSpeed: number;
  notes: ChartNote[];
  events: ChartEvent[];
  /** personajes y escenario que pide el chart (pueden venir vacíos) */
  player?: string;
  opponent?: string;
  gf?: string;
  stage?: string;
  /** skin de notas que pide el chart (Psych: arrowSkin) */
  arrowSkin?: string;
  /** avisos de compatibilidad detectados durante la conversión */
  warnings: string[];
}

export interface AnimDef {
  name: string;
  /** prefijo del frame en el atlas Sparrow */
  prefix: string;
  fps: number;
  loop: boolean;
  indices?: number[];
  offset: [number, number];
}

export interface InternalCharacter {
  id: string;
  image: string; // ruta del atlas sin extensión, relativa a la raíz del mod
  scale: number;
  flipX: boolean;
  /** posición extra del personaje (estilo Psych "position") */
  position: [number, number];
  cameraOffset: [number, number];
  singDuration: number; // en pasos (steps)
  danceEvery: number; // beats
  anims: AnimDef[];
  healthColor: string;
  icon: string; // id del icono
  /** cómo interpretar la posición del escenario: 'topleft' (Psych) o 'feet' (V-Slice) */
  anchor: 'topleft' | 'feet';
  isPlayerFacing?: boolean;
}

export interface StageProp {
  name: string;
  image: string; // ruta sin extensión; '' = rectángulo de color
  x: number;
  y: number;
  scale: [number, number];
  scroll: [number, number];
  z: number;
  alpha: number;
  color?: string;
  width?: number;
  height?: number;
  anim?: { prefix: string; fps: number; loop: boolean; indices?: number[] };
  lowQuality?: boolean; // se oculta en calidad baja
}

export interface InternalStage {
  id: string;
  zoom: number;
  props: StageProp[];
  chars: Record<CharSlot, { x: number; y: number; z: number; cam: [number, number] }>;
  hideGf?: boolean;
  /** Escala global de personajes para escenarios pixelados de Psych (daPixelZoom = 6). */
  pixelZoom?: number;
  /** Multiplicador adicional de tamaño de todos los personajes definido por el escenario. */
  characterScale?: number;
  /** Velocidad de seguimiento de cámara definida por el escenario Psych. */
  cameraSpeed?: number;
  bgColor: string;
}

export type ModFormat = 'fnfweb' | 'psych' | 'vslice';

export interface SongEntry {
  id: string;
  name: string;
  artist?: string;
  difficulties: string[];
  bpm?: number;
}

export interface ModManifest {
  id: string;
  name: string;
  version: string;
  format: ModFormat;
  author?: string;
  license?: string;
  description?: string;
  category?: string;
  cover?: string;
  popularity?: number;
  sizeBytes?: number;
  songs: SongEntry[];
  /** scripts JS que se ejecutan en el sandbox */
  scripts?: string[];
  permissions?: string[];
  /** imágenes que los scripts pueden usar con addSprite (rutas sin extensión) */
  scriptImages?: string[];
  /** fuentes .ttf/.otf/.woff que usan los scripts (el nombre de la fuente = nombre del archivo) */
  fonts?: string[];
  /** escala aplicada al reempaquetar cada imagen ('images/ruta' → 0.72): el motor la compensa */
  textureScale?: Record<string, number>;
  compatibility?: 'full' | 'partial' | 'songs-only';
  compatNotes?: string[];
  files?: string[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  author?: string;
  description: string;
  category: string;
  cover: string;
  popularity: number;
  sizeBytes: number;
  songCount: number;
  format: ModFormat;
  compatibility: 'full' | 'partial' | 'songs-only';
  path: string; // carpeta base del mod
  local?: boolean;
}

/** Datos que el adaptador de canción entrega al motor */
export interface LoadedSongData {
  chart: InternalChart;
  inst: string; // URL lógica (ruta en el mod) sin extensión
  voices: { url: string; who: 'player' | 'opponent' | 'both' }[];
}
