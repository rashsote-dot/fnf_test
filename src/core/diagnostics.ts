// Recolector central de métricas de rendimiento. Sin asignaciones por frame.
const FRAMES = 240;

export const Diag = {
  frameTimes: new Float32Array(FRAMES), // ms entre frames
  cpuTimes: new Float32Array(FRAMES), // ms de trabajo por frame
  idx: 0,
  filled: 0,
  drawCalls: 0,
  sprites: 0,
  textureBytes: 0,
  renderer: '—',
  resolutionScale: 1,
  audioBaseLatency: 0,
  audioOutputLatency: 0,
  syncDrift: 0, // diferencia (ms) entre reloj de audio y reloj del sistema extrapolado
  lastInputDelta: 0, // ms entre la nota y el golpe del último acierto
  loads: [] as { label: string; ms: number; bytes: number }[],
  warnings: [] as string[],
  longFrames: 0, // frames > 2x el presupuesto

  pushFrame(dt: number, cpu: number) {
    this.frameTimes[this.idx] = dt;
    this.cpuTimes[this.idx] = cpu;
    this.idx = (this.idx + 1) % FRAMES;
    if (this.filled < FRAMES) this.filled++;
  },

  stats() {
    const n = this.filled;
    if (!n) return { fps: 0, avg: 0, p99: 0, cpuAvg: 0, max: 0 };
    const arr = Array.from(this.frameTimes.subarray(0, n)).sort((a, b) => a - b);
    let sum = 0, cpu = 0;
    for (let i = 0; i < n; i++) { sum += this.frameTimes[i]; cpu += this.cpuTimes[i]; }
    const avg = sum / n;
    return { fps: 1000 / avg, avg, p99: arr[Math.min(n - 1, Math.floor(n * 0.99))], cpuAvg: cpu / n, max: arr[n - 1] };
  },

  resetFrames() { this.idx = 0; this.filled = 0; this.longFrames = 0; },

  recordLoad(label: string, ms: number, bytes = 0) {
    this.loads.push({ label, ms, bytes });
    if (this.loads.length > 60) this.loads.shift();
  },

  warn(msg: string) {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
    if (this.warnings.length > 30) this.warnings.shift();
    console.warn('[Funkade]', msg);
  },
};
