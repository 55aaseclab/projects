import packageMetadata from '../package.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { ProjectStore } from '../src/store.mjs';
import { BusinessService, verifyAssertion, loadBusinessService } from '../src/business.mjs';
import { ACTIONS, validateInput } from '../src/schema.mjs';
import { createServer } from '../src/server.mjs';

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'projects-test-')), file = join(dir, 'projects.db'), key = randomBytes(32);
  let time = 1800000000000;
  const now = () => time;
  const store = new ProjectStore(file, { now });
  const service = new BusinessService({ store, key, spaces: ['space-a', 'space-b', 'local'], now });
  t.after(() => { try { store.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });
  function signed(request, patch = {}) {
    const raw = Buffer.from(JSON.stringify(request));
    const claims = { v: 1, appId: 'projects', userId: 'user-a', clientId: 'client-a', grantId: 'grant-a', spaceId: request.spaceId, action: ACTIONS[request.operation], resources: ['*'], expiresAt: now() + 20000, requestId: randomUUID(), method: 'POST', path: '/api/business', bodyHash: createHash('sha256').update(raw).digest('hex'), ...patch };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { raw, assertion: `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`, claims };
  }
  function invoke(operation, { spaceId = 'space-a', resourceId = 'alpha', input, expectedRevision, idempotencyKey, ...patch } = {}) {
    const request = { operation, spaceId, ...(!['list_projects', 'find_references', 'events'].includes(operation) ? { resourceId } : {}), ...(input !== undefined ? { input } : {}), ...(expectedRevision !== undefined ? { expectedRevision } : {}), ...(ACTIONS[operation] !== 'read' ? { idempotencyKey: idempotencyKey || randomUUID() } : {}) };
    const { raw, assertion } = signed(request, patch); return service.handle(raw, assertion);
  }
  function create(resourceId = 'alpha', spaceId = 'space-a') { return invoke('create_project', { resourceId, spaceId, input: { name: `Project ${resourceId}`, goal: 'Validate a shared workflow' } }); }
  return { dir, file, key, store, service, now, signed, invoke, create, advance: value => { time += value; } };
}
const work = (id, patch = {}) => ({ id, title: `Work ${id}`, domain: 'research', status: 'todo', tier: null, owner: null, dueDate: null, description: '', acceptance: '', dependsOn: [], referenceIds: [], ...patch });
function code(expected) { return error => error.code === expected; }

test('one store persists multiple projects and spaces without shared record state', t => {
  const f = fixture(t); f.create(); f.create('beta'); f.create('alpha', 'space-b');
  const changed = f.invoke('update_project', { resourceId: 'alpha', expectedRevision: '1', input: { name: '汉字项目' } });
  assert.equal(changed.project.name, '汉字项目');
  assert.equal(f.invoke('read_project', { resourceId: 'beta' }).project.name, 'Project beta');
  assert.equal(f.invoke('read_project', { spaceId: 'space-b' }).project.name, 'Project alpha');
  assert.equal(f.invoke('list_projects').items.length, 2);
});
test('project creation has strict fields and requires a named resource and idempotency key', t => {
  const f = fixture(t);
  for (const input of [{ name: 'A' }, { name: '', goal: 'A' }, { name: ' A', goal: 'A' }, { name: 'A', goal: 'A', html: '<script>' }]) assert.throws(() => f.invoke('create_project', { input }), code('INVALID_INPUT'));
  const request = { operation: 'create_project', spaceId: 'space-a', resourceId: 'alpha', input: { name: 'A', goal: 'A' } };
  const signed = f.signed(request);
  assert.throws(() => f.service.handle(signed.raw, signed.assertion), code('IDEMPOTENCY_REQUIRED'));
  assert.equal(f.invoke('list_projects').items.length, 0);
});
test('compare-and-swap rejects stale writers without losing the first commit', t => {
  const f = fixture(t); f.create();
  f.invoke('update_project', { expectedRevision: '1', input: { goal: 'First writer' } });
  assert.throws(() => f.invoke('update_project', { expectedRevision: '1', input: { goal: 'Lost writer' } }), code('CONFLICT'));
  assert.equal(f.invoke('read_project').project.goal, 'First writer');
  assert.equal(f.invoke('events').events.length, 2);
});
test('durable idempotency replays the original receipt after store reopen', t => {
  const f = fixture(t);
  const first = f.invoke('create_project', { idempotencyKey: 'create-alpha', input: { name: 'A', goal: 'A' } });
  f.invoke('update_project', { expectedRevision: '1', input: { goal: 'Current' } });
  f.store.close();
  const reopened = new ProjectStore(f.file, { now: f.now });
  t.after(() => reopened.close());
  const service = new BusinessService({ store: reopened, key: f.key, spaces: ['space-a'], now: f.now });
  const request = f.signed({ operation: 'create_project', spaceId: 'space-a', resourceId: 'alpha', idempotencyKey: 'create-alpha', input: { name: 'A', goal: 'A' } });
  assert.deepEqual(service.handle(request.raw, request.assertion), first);
  assert.equal(reopened.read('space-a', 'alpha').goal, 'Current');
});
test('idempotency keys cannot be reused with different input', t => {
  const f = fixture(t); f.invoke('create_project', { idempotencyKey: 'same-key', input: { name: 'A', goal: 'A' } });
  assert.throws(() => f.invoke('create_project', { idempotencyKey: 'same-key', input: { name: 'B', goal: 'B' } }), code('IDEMPOTENCY_CONFLICT'));
  assert.equal(f.invoke('events').events.length, 1);
});
test('same-signed write replays once while request identifiers cannot authorize different writes', t => {
  const f = fixture(t);
  const request = { operation: 'create_project', spaceId: 'space-a', resourceId: 'alpha', idempotencyKey: 'one', input: { name: 'A', goal: 'A' } };
  const signed = f.signed(request, { requestId: 'same-request' });
  const first = f.service.handle(signed.raw, signed.assertion);
  assert.deepEqual(f.service.handle(signed.raw, signed.assertion), first);
  const other = f.signed({ ...request, resourceId: 'beta', idempotencyKey: 'two' }, { requestId: 'same-request' });
  assert.throws(() => f.service.handle(other.raw, other.assertion), code('REQUEST_ID_CONFLICT'));
  assert.equal(f.invoke('list_projects').items.length, 1);
});
test('work items retain professional fields and resolve cross-domain dependencies', t => {
  const f = fixture(t); f.create();
  f.invoke('set_reference', { expectedRevision: '1', input: { id: 'note', title: 'Research note', kind: 'knowledge', url: '/apps/knowledge/research-note/' } });
  f.invoke('set_work_item', { expectedRevision: '2', input: work('research', { referenceIds: ['note'], tier: 'L2' }) });
  const result = f.invoke('set_work_item', { expectedRevision: '3', input: work('implementation', { domain: 'engineering', dependsOn: ['research'], acceptance: 'Pass the agreed tests' }) });
  assert.equal(result.project.workItems.length, 2);
  assert.deepEqual(result.project.workItems[1].dependsOn, ['research']);
});
test('missing references and dependencies are rejected atomically', t => {
  const f = fixture(t); f.create();
  for (const input of [work('a', { dependsOn: ['missing'] }), work('a', { referenceIds: ['missing'] })]) assert.throws(() => f.invoke('set_work_item', { expectedRevision: '1', input }), code('INVALID_REFERENCE'));
  assert.equal(f.invoke('read_project').revision, '1');
});
test('dependency cycles are rejected while prior project state remains unchanged', t => {
  const f = fixture(t); f.create();
  f.invoke('set_work_item', { expectedRevision: '1', input: work('a') });
  f.invoke('set_work_item', { expectedRevision: '2', input: work('b', { dependsOn: ['a'] }) });
  assert.throws(() => f.invoke('set_work_item', { expectedRevision: '3', input: work('a', { dependsOn: ['b'] }) }), code('DEPENDENCY_CYCLE'));
  assert.equal(f.invoke('read_project').revision, '3');
});
test('completed work requires complete dependencies and cannot be invalidated by reopening a predecessor', t => {
  const f = fixture(t); f.create();
  f.invoke('set_work_item', { expectedRevision: '1', input: work('a') });
  assert.throws(() => f.invoke('set_work_item', { expectedRevision: '2', input: work('b', { dependsOn: ['a'], status: 'done' }) }), code('DEPENDENCY_INCOMPLETE'));
  f.invoke('set_work_item', { expectedRevision: '2', input: work('a', { status: 'done' }) });
  f.invoke('set_work_item', { expectedRevision: '3', input: work('b', { dependsOn: ['a'], status: 'done' }) });
  assert.throws(() => f.invoke('set_work_item', { expectedRevision: '4', input: work('a') }), code('DEPENDENCY_INCOMPLETE'));
});
test('project completion requires all work to be completed', t => {
  const f = fixture(t); f.create();
  f.invoke('set_work_item', { expectedRevision: '1', input: work('a') });
  assert.throws(() => f.invoke('update_project', { expectedRevision: '2', input: { status: 'completed' } }), code('PROJECT_INCOMPLETE'));
});
test('typed work fields reject prose states, impossible dates, extra fields, duplicate and self dependencies', t => {
  for (const value of [work('a', { status: 'Maybe finished' }), work('a', { dueDate: '2026-02-29' }), work('a', { dueDate: '2028-02-30' }), work('a', { tier: 'L4' }), work('a', { dependsOn: ['a'] }), work('a', { dependsOn: ['b', 'b'] }), { ...work('a'), dangerous: true }]) assert.throws(() => validateInput('set_work_item', value));
  assert.equal(validateInput('set_work_item', work('a', { dueDate: '2028-02-29' })).dueDate, '2028-02-29');
});
test('knowledge and deliverable references reject credentials, scripts and path confusion', t => {
  for (const url of ['javascript:alert(1)', '//evil.test/', '/apps/knowledge/../admin/', '/apps/knowledge/%2e%2e/admin/', '/apps/knowledge/a?token=x', '/apps/knowledge/a#fragment', '/apps/knowledge//a', '/apps/knowledge/a%2fb']) assert.throws(() => validateInput('set_reference', { id: 'a', title: 'A', kind: 'knowledge', url }));
  for (const url of ['http://example.test/', 'https://user:pass@example.test/a', 'https://example.test/a?token=x', 'https://example.test/a#b', 'https://example.test/../admin', 'https://example.test//a']) assert.throws(() => validateInput('set_reference', { id: 'a', title: 'A', kind: 'deliverable', url }));
  assert.equal(validateInput('set_reference', { id: 'a', title: 'A', kind: 'deliverable', url: 'https://example.test/report.pdf' }).url, 'https://example.test/report.pdf');
});
test('list details events and writes enforce resource and space restrictions', t => {
  const f = fixture(t); f.create(); f.create('beta');
  const listed = f.invoke('list_projects', { resources: ['alpha'] }); assert.deepEqual(listed.items.map(item => item.id), ['alpha']);
  assert.throws(() => f.invoke('read_project', { resourceId: 'beta', resources: ['alpha'] }), code('FORBIDDEN'));
  assert.throws(() => f.invoke('update_project', { resourceId: 'beta', expectedRevision: '1', input: { name: 'Blocked' }, resources: ['alpha'] }), code('FORBIDDEN'));
  assert.deepEqual(f.invoke('events', { resources: ['alpha'] }).events.map(item => item.resourceId), ['alpha']);
  assert.throws(() => f.invoke('read_project', { spaceId: 'unconfigured' }), code('FORBIDDEN'));
  assert.throws(() => f.invoke('read_project', { action: 'update' }), code('FORBIDDEN'));
});
test('signed assertions bind the body app method path expiration and resource syntax', t => {
  const f = fixture(t); f.create();
  const request = { operation: 'read_project', spaceId: 'space-a', resourceId: 'alpha' };
  for (const patch of [{ appId: 'travel' }, { method: 'GET' }, { path: '/api/anything' }, { expiresAt: f.now() }, { expiresAt: f.now() + 30001 }, { resources: ['*', 'alpha'] }, { resources: ['../alpha'] }, { extra: 'ignored' }]) {
    const s = f.signed(request, patch); assert.throws(() => f.service.handle(s.raw, s.assertion), code('INVALID_ASSERTION'));
  }
  const s = f.signed(request);
  assert.throws(() => f.service.handle(Buffer.from(JSON.stringify({ ...request, resourceId: 'beta' })), s.assertion), code('INVALID_ASSERTION'));
  assert.throws(() => f.service.handle(s.raw, `${s.assertion}A`), code('INVALID_ASSERTION'));
});
test('event outbox contains metadata only and survives process restart', t => {
  const f = fixture(t); f.create(); f.invoke('update_project', { expectedRevision: '1', input: { goal: 'Private project goal' } });
  const events = f.invoke('events');
  assert.equal(events.cursor, 2); assert.equal(events.events.length, 2);
  assert.ok(events.events.every(item => !Object.hasOwn(item, 'project') && !Object.hasOwn(item, 'goal') && Number.isInteger(item.committedAt)));
  assert.equal(f.invoke('events', { input: { after: 2 } }).events.length, 0);
  assert.equal(f.invoke('events', { input: { after: 999 } }).resetRequired, true);
});
test('managed HTTP serves the shared interface but refuses anonymous data and unsigned writes', async t => {
  const f = fixture(t); f.create();
  const publicDir = join(f.dir, 'public'); mkdirSync(publicDir); writeFileSync(join(publicDir, 'index.html'), '<main>Projects</main>');
  const server = createServer({ store: f.store, business: f.service, publicDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await (await fetch(base + '/health')).json()).version, packageMetadata.version);
  assert.deepEqual(await (await fetch(base + '/api/config')).json(), { managed: true, knowledgeBaseUrl: '/apps/knowledge/' });
  assert.equal((await fetch(base + '/api/projects')).status, 403);
  assert.equal((await fetch(base + '/api/projects/alpha')).status, 403);
  assert.equal((await fetch(base + '/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const signed = f.signed({ operation: 'read_project', spaceId: 'space-a', resourceId: 'alpha' });
  const response = await fetch(base + '/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Praxis-Assertion': signed.assertion }, body: signed.raw });
  assert.equal(response.status, 200); assert.equal((await response.json()).project.id, 'alpha');
  assert.equal((await fetch(base + '/projects.db')).status, 404);
  assert.equal((await fetch(base + '/src/server.mjs')).status, 404);
});
test('standalone HTTP reads multiple records through one API and accepts no unsigned writes', async t => {
  const f = fixture(t); f.create('alpha', 'local'); f.create('beta', 'local');
  const server = createServer({ store: f.store }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await (await fetch(base + '/api/projects')).json()).items.length, 2);
  assert.equal((await (await fetch(base + '/api/projects/beta')).json()).project.id, 'beta');
  assert.equal((await fetch(base + '/api/projects', { method: 'POST' })).status, 405);
});
test('standalone Knowledge links accept a fixed source base without a Praxis runtime dependency', async t => {
  const f = fixture(t);
  const server = createServer({ store: f.store, knowledgeBaseUrl: 'http://localhost:4324/' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/config`);
  assert.equal((await response.json()).knowledgeBaseUrl, 'http://localhost:4324/');
  for (const knowledgeBaseUrl of ['javascript:alert(1)', '//example.test/', 'https://user:pass@example.test/', '/apps/knowledge/../admin/', '/apps/knowledge/%2e%2e/admin/', 'https://example.test/?token=x']) assert.throws(() => createServer({ store: f.store, knowledgeBaseUrl }), /fixed normalized/);
});
test('business loader rejects weak permissions and store paths reject symlink aliases', t => {
  const f = fixture(t);
  const config = join(f.dir, 'config.json'), key = join(f.dir, 'key');
  writeFileSync(config, JSON.stringify({ version: 1, spaces: ['space-a'] }), { mode: 0o600 }); writeFileSync(key, f.key, { mode: 0o600 });
  const env = { PROJECTS_MANAGED: '1', PROJECTS_BUSINESS_KEY_FILE: key, PROJECTS_BUSINESS_CONFIG_FILE: config };
  assert.ok(loadBusinessService(f.store, env));
  chmodSync(key, 0o644);
  assert.throws(() => loadBusinessService(f.store, env), /private regular files/);
  symlinkSync(f.dir, join(f.dir, 'alias'));
  assert.throws(() => new ProjectStore(join(f.dir, 'alias', 'other.db')), /symbolic links/);
  assert.throws(() => loadBusinessService(f.store, { ...env, PROJECTS_MANAGED: 'yes' }), /0 or 1/);
});
test('database and WAL sidecars are private even with a permissive caller umask', t => {
  const prior = process.umask(0o022);
  try {
    const f = fixture(t); f.create();
    for (const suffix of ['', '-wal', '-shm']) assert.equal(statSync(f.file + suffix).mode & 0o077, 0);
    assert.equal(process.umask(), 0o022);
  } finally { process.umask(prior); }
});


test('Knowledge backlinks read only authorized projects in the requested space without changing records', t => {
  const f = fixture(t), url = '/apps/knowledge/k/space-a/library/entry/';
  f.create('alpha'); f.create('beta'); f.create('alpha', 'space-b');
  for (const [resourceId, spaceId] of [['alpha', 'space-a'], ['beta', 'space-a'], ['alpha', 'space-b']]) f.invoke('set_reference', { resourceId, spaceId, expectedRevision: '1', input: { id: 'entry-link', title: '知识条目', kind: 'knowledge', url } });
  const before = JSON.stringify(f.store.read('space-a', 'alpha')), cursor = f.invoke('events').cursor;
  const result = f.invoke('find_references', { input: { url }, resources: ['alpha'] });
  assert.deepEqual(result.items, [{ resourceId: 'alpha', name: 'Project alpha', referenceId: 'entry-link', title: '知识条目' }]);
  assert.equal(f.invoke('find_references', { input: { url } }).items.length, 2);
  assert.deepEqual(f.invoke('find_references', { input: { url }, resources: ['missing'] }).items, []);
  assert.throws(() => f.invoke('find_references', { input: { url: '/apps/knowledge/../admin/' } }), code('INVALID_INPUT'));
  assert.equal(JSON.stringify(f.store.read('space-a', 'alpha')), before);
  assert.equal(f.invoke('events').cursor, cursor);
});
