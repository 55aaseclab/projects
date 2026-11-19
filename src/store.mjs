import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, lstatSync, existsSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { ACTIONS, fail, validateProjectRelations, validateRequest } from './schema.mjs';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(value).digest('hex');
const allowed = (claims, resourceId) => claims.resources.includes('*') || claims.resources.includes(resourceId);
function safePath(file) {
  if (!isAbsolute(file)) throw new Error('The database path must be absolute.');
  for (let path = file; path !== dirname(path); path = dirname(path)) {
    try { if (lstatSync(path).isSymbolicLink()) throw new Error('The database path must not contain symbolic links.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export class ProjectStore {
  constructor(file, { now = Date.now } = {}) {
    safePath(file); mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.now = now;
    const priorMask = process.umask(0o077);
    try {
    this.db = new DatabaseSync(file); chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(space TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(space,id));
      CREATE TABLE IF NOT EXISTS project_receipts(space TEXT NOT NULL,resource TEXT NOT NULL,user_id TEXT NOT NULL,client_id TEXT NOT NULL,grant_id TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(space,resource,user_id,client_id,grant_id,key));
      CREATE TABLE IF NOT EXISTS project_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,space TEXT NOT NULL,resource TEXT NOT NULL,revision TEXT NOT NULL,operation TEXT NOT NULL,committed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS project_requests(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
    this.db.prepare("INSERT OR IGNORE INTO projects_meta VALUES('schema_version','1')").run();
    if (this.db.prepare("SELECT value FROM projects_meta WHERE key='schema_version'").get().value !== '1') throw new Error('The database schema version is unsupported.');
    for (const suffix of ['-wal', '-shm']) if (existsSync(file + suffix)) chmodSync(file + suffix, 0o600);
    } finally { process.umask(priorMask); }
  }
  close() { this.db.close(); }
  read(spaceId, resourceId) {
    const row = this.db.prepare('SELECT payload FROM projects WHERE space=? AND id=?').get(spaceId, resourceId);
    if (!row) fail('NOT_FOUND', 404);
    return JSON.parse(row.payload);
  }
  list(spaceId, resources = ['*']) {
    return this.db.prepare('SELECT payload FROM projects WHERE space=? ORDER BY updated_at DESC,id').all(spaceId)
      .filter(row => resources.includes('*') || resources.includes(JSON.parse(row.payload).id))
      .map(row => { const { id, name, goal, owner, status, revision, updatedAt } = JSON.parse(row.payload); return { resourceId: id, id, name, goal, owner, status, revision, updatedAt }; });
  }
  events(spaceId, after, resources = ['*']) {
    const cursor = this.db.prepare('SELECT COALESCE(MAX(seq),0) AS cursor FROM project_events WHERE space=?').get(spaceId).cursor;
    const resetRequired = after > cursor;
    const rows = resetRequired ? [] : this.db.prepare('SELECT seq AS cursor,resource AS resourceId,revision,operation,committed_at AS committedAt FROM project_events WHERE space=? AND seq>? ORDER BY seq LIMIT 1000').all(spaceId, after);
    const events = rows.filter(item => resources.includes('*') || resources.includes(item.resourceId)).map(item => ({ ...item, id: item.cursor }));
    const lastPageCursor = !resetRequired && rows.length === 1000 ? rows.at(-1).cursor : cursor;
    return { spaceId, cursor: lastPageCursor, minCursor: 1, resetRequired, events };
  }
  execute(requestValue, claims) {
    const request = validateRequest(requestValue), action = ACTIONS[request.operation];
    if (claims.spaceId !== request.spaceId || claims.action !== action || request.resourceId && !allowed(claims, request.resourceId)) fail('FORBIDDEN', 403);
    if (claims.expiresAt <= this.now()) fail('INVALID_ASSERTION', 401);
    if (action === 'read') {
      let result;
      if (request.operation === 'list_projects') result = { spaceId: request.spaceId, items: this.list(request.spaceId, claims.resources) };
      else if (request.operation === 'find_references') {
        const items = this.list(request.spaceId, claims.resources).flatMap(item => this.read(request.spaceId, item.resourceId).references.filter(reference => reference.kind === 'knowledge' && reference.url === request.input.url).map(reference => ({ resourceId: item.resourceId, name: item.name, referenceId: reference.id, title: reference.title })));
        result = { spaceId: request.spaceId, items };
      }
      else if (request.operation === 'events') result = this.events(request.spaceId, request.input.after, claims.resources);
      else { const project = this.read(request.spaceId, request.resourceId); result = { spaceId: request.spaceId, resourceId: project.id, revision: project.revision, project }; }
      if (claims.expiresAt <= this.now()) fail('INVALID_ASSERTION', 401);
      return result;
    }
    const identity = [request.spaceId, request.resourceId, claims.userId, claims.clientId, claims.grantId, request.idempotencyKey];
    const fingerprint = hash(canonical(request));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const receipt = this.db.prepare('SELECT fingerprint,response FROM project_receipts WHERE space=? AND resource=? AND user_id=? AND client_id=? AND grant_id=? AND key=?').get(...identity);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409);
        if (claims.expiresAt <= this.now()) fail('INVALID_ASSERTION', 401);
        this.db.exec('COMMIT'); return JSON.parse(receipt.response);
      }
      const nonce = this.db.prepare('SELECT fingerprint FROM project_requests WHERE id=?').get(claims.requestId);
      if (nonce) fail(nonce.fingerprint === fingerprint ? 'REPLAY' : 'REQUEST_ID_CONFLICT', 409);
      let project;
      if (request.operation === 'create_project') {
        if (this.db.prepare('SELECT 1 FROM projects WHERE space=? AND id=?').get(request.spaceId, request.resourceId)) fail('ALREADY_EXISTS', 409);
        const count = this.db.prepare('SELECT COUNT(*) AS count FROM projects WHERE space=?').get(request.spaceId).count;
        if (count >= 200) fail('PROJECT_LIMIT', 422);
        project = { id: request.resourceId, ...request.input, status: 'active', revision: '1', updatedAt: new Date(this.now()).toISOString(), workItems: [], references: [] };
      } else {
        project = this.read(request.spaceId, request.resourceId);
        if (project.revision !== request.expectedRevision) fail('CONFLICT', 409);
        if (request.operation === 'update_project') Object.assign(project, request.input);
        else {
          const collection = request.operation === 'set_work_item' ? project.workItems : project.references;
          const at = collection.findIndex(item => item.id === request.input.id);
          if (at === -1) collection.push(request.input); else collection[at] = request.input;
        }
        project.revision = String(Number(project.revision) + 1); project.updatedAt = new Date(this.now()).toISOString();
      }
      validateProjectRelations(project);
      if (claims.expiresAt <= this.now()) fail('INVALID_ASSERTION', 401);
      const result = { spaceId: request.spaceId, resourceId: project.id, revision: project.revision, project };
      const at = this.now();
      this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?) ON CONFLICT(space,id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(request.spaceId, project.id, Number(project.revision), JSON.stringify(project), at);
      this.db.prepare('INSERT INTO project_events(space,resource,revision,operation,committed_at) VALUES(?,?,?,?,?)').run(request.spaceId, project.id, project.revision, request.operation, at);
      this.db.prepare('INSERT INTO project_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(...identity, fingerprint, JSON.stringify(result), at);
      this.db.prepare('DELETE FROM project_requests WHERE expires_at<?').run(at);
      this.db.prepare('INSERT INTO project_requests VALUES(?,?,?)').run(claims.requestId, fingerprint, claims.expiresAt);
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
