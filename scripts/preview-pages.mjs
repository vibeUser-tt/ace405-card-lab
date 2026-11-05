import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../.release/site/', import.meta.url));
const release = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8'));
const prefix = '/ace405-card-lab/';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.glb':'model/gltf-binary' };
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    let filename = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)) || '.');
    if (filename !== path.resolve(root) && !filename.startsWith(path.resolve(root) + path.sep)) { response.writeHead(403); response.end(); return; }
    let info = await stat(filename);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) { response.writeHead(301, { Location: url.pathname + '/' + url.search }); response.end(); return; }
      filename = path.join(filename, 'index.html'); info = await stat(filename);
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control':'no-store' });
    createReadStream(filename).pipe(response);
  } catch { response.writeHead(404); response.end(); }
}).listen(4174, '127.0.0.1', () => console.log(`Versioned Pages preview: http://127.0.0.1:4174${prefix}${release.current}/`));
