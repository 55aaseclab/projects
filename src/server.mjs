import { createServer as httpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectStore } from './store.mjs';
import { loadBusinessService } from './business.mjs';
import { identifier, slug } from './schema.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const defaultPublic = resolve(directory, '../public');
const types = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/planning.js': ['planning.js', 'text/javascript; charset=utf-8'] };
const security = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'" };
function json(response, status, result) {
  const body = JSON.stringify(result);
  response.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }); response.end(body);
}
export function createServer({ store, business = null, managed = Boolean(business), publicDir = defaultPublic, knowledgeBaseUrl = '/apps/knowledge/', localSpace = 'local' } = {}) {
  if (!store || managed && !business || !identifier(localSpace)) throw new Error('Projects requires a configured store and managed business service.');
  if (typeof knowledgeBaseUrl !== 'string' || !knowledgeBaseUrl || /[\\?#\s]/.test(knowledgeBaseUrl) || /%(?:2f|5c|25|2e)/i.test(knowledgeBaseUrl)) throw new Error('Knowledge base URL must be a fixed normalized application URL.');
  let knowledgeTarget;
  try { knowledgeTarget = new URL(knowledgeBaseUrl, 'https://projects.invalid'); } catch { throw new Error('Knowledge base URL must be a fixed normalized application URL.'); }
  const relativeKnowledge = knowledgeBaseUrl.startsWith('/') && !knowledgeBaseUrl.startsWith('//');
  if ((!relativeKnowledge && !/^https?:\/\//.test(knowledgeBaseUrl)) || !['http:', 'https:'].includes(knowledgeTarget.protocol) || knowledgeTarget.username || knowledgeTarget.password || knowledgeTarget.pathname.includes('//') || knowledgeBaseUrl.split('/').some(part => part === '.' || part === '..')) throw new Error('Knowledge base URL must be a fixed normalized application URL.');
  const server = httpServer({ maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000, keepAliveTimeout: 5000 }, async (request, response) => {
    try {
      const rawPath = request.url || '/';
      if (!rawPath.startsWith('/') || rawPath.startsWith('//') || /[\\\u0000-\u0020]/.test(rawPath) || rawPath.includes('%') || rawPath.includes('?') || rawPath.includes('#') || rawPath.split('/').some(part => part.startsWith('.'))) return json(response, 404, { code: 'NOT_FOUND' });
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (rawPath === '/health') return json(response, 200, { status: 'ok', managed });
        if (rawPath === '/api/config') return json(response, 200, { managed, knowledgeBaseUrl });
        if (rawPath === '/api/projects' || rawPath.startsWith('/api/projects/')) {
          if (managed) return json(response, 403, { code: 'BUSINESS_AUTH_REQUIRED' });
          if (rawPath === '/api/projects') return json(response, 200, { items: store.list(localSpace) });
          const planning = /^\/api\/projects\/([a-z0-9][a-z0-9-]{0,79})\/planning$/.exec(rawPath);
          if (planning) { store.read(localSpace, planning[1]); return json(response, 200, { spaceId: localSpace, resourceId: planning[1], ...store.planning.view([localSpace, planning[1]], { userId: null, action: 'read', actionsGranted: ['read'] }) }); }
          const id = rawPath.slice('/api/projects/'.length);
          if (!slug(id)) return json(response, 404, { code: 'NOT_FOUND' });
          const project = store.read(localSpace, id); return json(response, 200, { resourceId: id, revision: project.revision, project });
        }
        const asset = types[rawPath];
        if (asset) {
          const body = await readFile(join(publicDir, asset[0]));
          response.writeHead(200, { ...security, 'Content-Type': asset[1], 'Content-Length': body.byteLength }); response.end(request.method === 'HEAD' ? undefined : body); return;
        }
        const projectPath = /^\/([a-z0-9][a-z0-9-]{0,79})\/$/.exec(rawPath);
        if (projectPath) { response.writeHead(303, { ...security, Location: `../#project=${projectPath[1]}` }); response.end(); return; }
        return json(response, 404, { code: 'NOT_FOUND' });
      }
      if (rawPath !== '/api/business' || request.method !== 'POST') return json(response, 405, { code: 'METHOD_NOT_ALLOWED' });
      if (!business) return json(response, 503, { code: 'BUSINESS_UNAVAILABLE' });
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) return json(response, 415, { code: 'JSON_REQUIRED' });
      request.setTimeout(10000, () => { if (!response.headersSent) json(response, 408, { code: 'REQUEST_TIMEOUT' }); request.destroy(); });
      if (Number(request.headers['content-length']) > 3 * 1024 * 1024) { json(response, 413, { code: 'REQUEST_TOO_LARGE' }); request.resume(); return; }
      const parts = []; let length = 0;
      for await (const part of request) { length += part.length; if (length > 3 * 1024 * 1024) { json(response, 413, { code: 'REQUEST_TOO_LARGE' }); request.resume(); return; } parts.push(part); }
      const result = business.handle(Buffer.concat(parts), request.headers['x-praxis-assertion']);
      json(response, 200, result);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) json(response, error.status || (error.code === 'ENOENT' ? 404 : 500), { code: error.status ? error.code : error.code === 'ENOENT' ? 'NOT_FOUND' : 'INTERNAL_ERROR' });
      else if (!response.destroyed) response.destroy();
    }
  });
  return server;
}
async function main() {
  const args = process.argv.slice(2); let host = '127.0.0.1', port = 4327;
  if (args.includes('--help')) { process.stdout.write('Usage: node src/server.mjs [--host ADDRESS] [--port PORT]\nBusiness data is stored in PROJECTS_DATA_DIR outside the source repository.\n'); return; }
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--host' && args[i + 1]) host = args[i + 1];
    else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] || '')) port = Number(args[i + 1]);
    else throw new Error('Unknown or incomplete server argument.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 through 65535.');
  const dataDir = process.env.PROJECTS_DATA_DIR || join(homedir(), '.local/share/praxis-builtins/projects');
  if (!isAbsolute(dataDir)) throw new Error('PROJECTS_DATA_DIR must be absolute.');
  const store = new ProjectStore(join(dataDir, 'projects.db'));
  const business = loadBusinessService(store);
  const server = createServer({ store, business, localSpace: process.env.PROJECTS_LOCAL_SPACE || 'local', knowledgeBaseUrl: process.env.PROJECTS_KNOWLEDGE_BASE_URL || '/apps/knowledge/' });
  server.listen(port, host, () => process.stdout.write(`Projects listening on http://${host}:${port}\n`));
  const stop = () => { server.close(() => { store.close(); process.exit(0); }); server.closeIdleConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
