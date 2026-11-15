// Lado de la plataforma del sandbox de scripts. Los scripts NUNCA se ejecutan en el contexto de la página:
// viven en un iframe con origen opaco + Worker, y solo pueden pedir acciones mediante comandos que
// aquí se validan contra los permisos declarados en el manifiesto del mod.
import { Diag } from '../core/diagnostics';

export type ScriptCmd = [string, ...unknown[]];

const PERM_OF: Record<string, string> = {
  camZoom: 'camera', camZoomSet: 'camera', shake: 'camera', flash: 'camera',
  addSprite: 'sprites', removeSprite: 'sprites', tween: 'sprites', setProp: 'sprites',
  playAnim: 'characters', addHealth: 'gameplay', scrollSpeed: 'gameplay', log: '', error: '',
};

export class ScriptSandbox {
  private iframe: HTMLIFrameElement;
  private ready: Promise<void>;
  private seq = 0;
  private awaiting = -1;
  private sentAt = 0;
  private queue: [string, unknown[]][] = [];
  private hooks = new Set<string>();
  private dead = false;
  onCommands: ((cmds: ScriptCmd[]) => void) | null = null;

  constructor(private permissions: Set<string>, private baseUrl: string) {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.setAttribute('aria-hidden', 'true');
    this.iframe.style.display = 'none';
    this.iframe.src = new URL('sandbox.html', this.baseUrl).href;
    let resolveReady!: () => void;
    this.ready = new Promise((r) => (resolveReady = r));
    this.onMessage = (e: MessageEvent) => {
      if (e.source !== this.iframe.contentWindow) return; // solo aceptamos mensajes de NUESTRO iframe
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'ready') resolveReady();
      else if (m.type === 'loaded') for (const h of m.hooks ?? []) this.hooks.add(String(h));
      else if (m.type === 'cmds') {
        if (m.seq === this.awaiting) this.awaiting = -1;
        if (Array.isArray(m.cmds)) this.onCommands?.(this.filter(m.cmds));
      }
    };
    window.addEventListener('message', this.onMessage);
    document.body.appendChild(this.iframe);
  }

  private onMessage: (e: MessageEvent) => void;

  private filter(cmds: unknown[]): ScriptCmd[] {
    const out: ScriptCmd[] = [];
    for (const c of cmds.slice(0, 500)) {
      if (!Array.isArray(c) || typeof c[0] !== 'string') continue;
      const perm = PERM_OF[c[0]];
      if (perm === undefined) continue;
      if (perm && !this.permissions.has(perm)) { Diag.warn(`Script: acción "${c[0]}" bloqueada (requiere permiso "${perm}")`); continue; }
      out.push(c as ScriptCmd);
    }
    return out;
  }

  async load(name: string, code: string, timeoutMs = 3000) {
    await Promise.race([this.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('El sandbox de scripts no respondió')), timeoutMs))]);
    this.iframe.contentWindow?.postMessage({ type: 'load', name, code }, '*');
  }

  has(hook: string) { return this.hooks.has(hook); }

  call(hook: string, ...args: unknown[]) {
    if (!this.dead && this.hooks.has(hook)) this.queue.push([hook, args]);
  }

  /** Envía las llamadas acumuladas en este frame (un único postMessage). */
  flush(state: Record<string, number | string>) {
    if (this.dead) return;
    if (this.awaiting !== -1) {
      // el script sigue procesando el lote anterior; si tarda demasiado, lo detenemos
      if (performance.now() - this.sentAt > 2000) {
        Diag.warn('Un script del mod dejó de responder (posible bucle infinito) y se ha detenido.');
        this.destroy();
      }
      return;
    }
    if (!this.queue.length) return;
    this.awaiting = ++this.seq;
    this.sentAt = performance.now();
    this.iframe.contentWindow?.postMessage({ type: 'calls', seq: this.awaiting, calls: this.queue.splice(0), state }, '*');
  }

  destroy() {
    this.dead = true;
    window.removeEventListener('message', this.onMessage);
    this.iframe.remove();
    this.queue = [];
  }
}
