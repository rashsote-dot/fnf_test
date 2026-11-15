// Servidor estático de desarrollo: bun tools/serve.ts [puerto]
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const root = join(process.cwd(), 'dist');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.xml': 'application/xml', '.map': 'application/json', '.txt': 'text/plain' };

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (p.includes('..')) return new Response('Forbidden', { status: 403 });
    let file = join(root, p);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return new Response('Not found', { status: 404 });
    return new Response(Bun.file(file), { headers: { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' } });
  },
});
console.log(`Funkade en http://localhost:${port}  (Ctrl+C para salir)`);
