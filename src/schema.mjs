import { PLANNING_ACTIONS, validatePlanningRequest } from './planning-schema.mjs';
export const ACTIONS = Object.freeze({ list_projects: 'read', read_project: 'read', find_references: 'read', create_project: 'create', update_project: 'update', set_work_item: 'update', set_reference: 'update', events: 'read', ...PLANNING_ACTIONS });
export const DOMAINS = Object.freeze(['research', 'engineering', 'marketing', 'support']);
export const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);
export const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function fail(code = 'INVALID_INPUT', status = 400, message = code) { throw Object.assign(new Error(message), { code, status }); }
export function fields(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail();
}
function text(value, max, { empty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || !empty && (!value.trim() || value !== value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail();
  return value;
}
function owner(value) { return value === null ? null : text(value, 160); }
function choice(value, choices) { if (!choices.includes(value)) fail(); return value; }
function list(value) {
  if (!Array.isArray(value) || value.length > 100 || value.some(item => !slug(item)) || new Set(value).size !== value.length) fail();
  return [...value];
}
function date(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail();
  return value;
}
export function validateReference(value) {
  fields(value, ['id', 'title', 'kind', 'url']);
  if (!slug(value.id)) fail();
  const kind = choice(value.kind, ['knowledge', 'deliverable']);
  const url = value.url;
  if (typeof url !== 'string' || !url || url.length > 2048 || /[\s\\?#\u0000-\u001f]/.test(url) || /%(?:2f|5c|25|2e)/i.test(url)) fail();
  let parsed, decoded;
  try { parsed = new URL(url, 'https://projects.invalid'); decoded = decodeURIComponent(url); } catch { fail(); }
  if (decoded.split('/').some(part => part === '.' || part === '..') || decoded.includes('\\') || decoded.includes('//') && !decoded.startsWith('https://')) fail();
  if (kind === 'knowledge') {
    if (!url.startsWith('/apps/knowledge/') || url.startsWith('//') || parsed.pathname !== url || parsed.origin !== 'https://projects.invalid') fail();
  } else if (!url.startsWith('https://') || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname.includes('//') || parsed.pathname.split('/').some(part => part === '.' || part === '..')) fail();
  return { id: value.id, title: text(value.title, 160), kind, url };
}
export function validateWorkItem(value) {
  fields(value, ['id', 'title', 'domain', 'status', 'tier', 'owner', 'dueDate', 'description', 'acceptance', 'dependsOn', 'referenceIds']);
  if (!slug(value.id)) fail();
  const dependsOn = list(value.dependsOn);
  if (dependsOn.includes(value.id)) fail('INVALID_DEPENDENCY');
  return {
    id: value.id, title: text(value.title, 160), domain: choice(value.domain, DOMAINS),
    status: choice(value.status, ['todo', 'doing', 'review', 'done']), tier: choice(value.tier, [null, 'L1', 'L2', 'L3']),
    owner: owner(value.owner), dueDate: date(value.dueDate), description: text(value.description, 10000, { empty: true }),
    acceptance: text(value.acceptance, 2000, { empty: true }), dependsOn, referenceIds: list(value.referenceIds),
  };
}
export function validateInput(operation, value = {}) {
  if (operation === 'create_project') {
    fields(value, ['name', 'goal'], ['description', 'owner']);
    return { name: text(value.name, 160), goal: text(value.goal, 2000), description: value.description === undefined ? '' : text(value.description, 10000, { empty: true }), owner: value.owner === undefined ? null : owner(value.owner) };
  }
  if (operation === 'update_project') {
    fields(value, [], ['name', 'goal', 'description', 'owner', 'status']);
    if (!Object.keys(value).length) fail();
    const output = {};
    for (const key of Object.keys(value)) output[key] = key === 'owner' ? owner(value[key]) : key === 'status' ? choice(value[key], ['active', 'paused', 'completed']) : text(value[key], key === 'name' ? 160 : key === 'goal' ? 2000 : 10000, { empty: key === 'description' });
    return output;
  }
  if (operation === 'set_work_item') return validateWorkItem(value);
  if (operation === 'set_reference') return validateReference(value);
  if (operation === 'find_references') { fields(value, ['url']); validateReference({ id: 'lookup', title: 'Lookup', kind: 'knowledge', url: value.url }); return { url: value.url }; }
  if (operation === 'events') {
    fields(value, [], ['after']);
    if (value.after !== undefined && (!Number.isSafeInteger(value.after) || value.after < 0)) fail();
    return { after: value.after ?? 0 };
  }
  fields(value, []); return {};
}
export function validateProjectRelations(project) {
  if (project.workItems.length > 200 || project.references.length > 200 || Buffer.byteLength(JSON.stringify(project)) > 2 * 1024 * 1024) fail('PROJECT_TOO_LARGE', 422);
  const work = new Map(project.workItems.map(item => [item.id, item])), references = new Set(project.references.map(item => item.id));
  if (work.size !== project.workItems.length || references.size !== project.references.length) fail();
  for (const item of work.values()) {
    if (item.dependsOn.some(id => !work.has(id)) || item.referenceIds.some(id => !references.has(id))) fail('INVALID_REFERENCE', 422);
    if (item.status === 'done' && item.dependsOn.some(id => work.get(id).status !== 'done')) fail('DEPENDENCY_INCOMPLETE', 409);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail('DEPENDENCY_CYCLE', 422);
    if (visited.has(id)) return;
    visiting.add(id); for (const dependency of work.get(id).dependsOn) visit(dependency); visiting.delete(id); visited.add(id);
  }
  for (const id of work.keys()) visit(id);
  if (project.status === 'completed' && project.workItems.some(item => item.status !== 'done')) fail('PROJECT_INCOMPLETE', 409);
}
export function validateRequest(request) {
  if (Object.hasOwn(PLANNING_ACTIONS, request?.operation || '')) return validatePlanningRequest(request);
  fields(request, ['operation', 'spaceId'], ['resourceId', 'input', 'expectedRevision', 'idempotencyKey']);
  if (!Object.hasOwn(ACTIONS, request.operation) || !identifier(request.spaceId)) fail('INVALID_REQUEST');
  const action = ACTIONS[request.operation];
  if (['list_projects', 'find_references', 'events'].includes(request.operation)) { if (request.resourceId !== undefined) fail('INVALID_REQUEST'); }
  else if (!slug(request.resourceId)) fail('RESOURCE_REQUIRED');
  if (action === 'read') {
    if (request.expectedRevision !== undefined || request.idempotencyKey !== undefined) fail('INVALID_REQUEST');
  } else {
    if (!identifier(request.idempotencyKey)) fail('IDEMPOTENCY_REQUIRED', 428);
    if (action === 'create') { if (request.expectedRevision !== undefined) fail('INVALID_REQUEST'); }
    else if (typeof request.expectedRevision !== 'string' || !/^[1-9]\d{0,14}$/.test(request.expectedRevision) || !Number.isSafeInteger(Number(request.expectedRevision))) fail('REVISION_REQUIRED', 428);
  }
  return { ...request, input: validateInput(request.operation, request.input) };
}
