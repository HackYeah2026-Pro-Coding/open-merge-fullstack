// A tiny static server for the receipt example: browsers refuse ES modules from file://.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const file = normalize(join(root, pathname === '/' ? 'examples/index.html' : pathname));
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
    response.writeHead(404).end('Not found');
  }
}).listen(8080, () => console.log('http://localhost:8080'));
