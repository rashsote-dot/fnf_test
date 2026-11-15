export interface Settings {
  fpsCap: number; // 0 = sin límite (sincronizado con la pantalla)
  quality: 'auto' | 'high' | 'medium' | 'low';
  renderer: 'auto' | 'webgl2' | 'canvas2d';
  masterVol: number;
  musicVol: number;
  sfxVol: number;
  showFps: boolean;
  showDiag: boolean;
  downscroll: boolean;
  ghostTapping: boolean;
  offsetMs: number;
  scrollSpeed: number; // 0 = la del chart
  botplay: boolean;
  keys: string[][]; // 4 carriles × hasta 2 teclas (KeyboardEvent.code)
  missSounds: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  fpsCap: 0,
  quality: 'auto',
  renderer: 'auto',
  masterVol: 0.8,
  musicVol: 1,
  sfxVol: 0.6,
  showFps: true,
  showDiag: false,
  downscroll: false,
  ghostTapping: true,
  offsetMs: 0,
  scrollSpeed: 0,
  botplay: false,
  keys: [['KeyD', 'ArrowLeft'], ['KeyF', 'ArrowDown'], ['KeyJ', 'ArrowUp'], ['KeyK', 'ArrowRight']],
  missSounds: true,
};

const KEY = 'funkade.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* almacenamiento no disponible */ }
  return structuredClone(DEFAULT_SETTINGS);
}

export const settings: Settings = load();
const listeners = new Set<(s: Settings) => void>();

export function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  for (const l of listeners) l(settings);
}

export function onSettings(fn: (s: Settings) => void) { listeners.add(fn); return () => listeners.delete(fn); }

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { ArrowLeft: '←', ArrowDown: '↓', ArrowUp: '↑', ArrowRight: '→', Space: 'Espacio', Semicolon: 'Ñ/;' };
  return map[code] ?? code;
}
