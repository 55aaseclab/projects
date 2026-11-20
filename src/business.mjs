import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { ACTIONS, fail, fields, identifier, object, slug } from './schema.mjs';

export function verifyAssertion(raw, assertion, key, now = Date.now()) {
  const invalid = () => fail('INVALID_ASSERTION', 401);
  if (typeof assertion !== 'string' || assertion.length > 32768) invalid();
  const parts = assertion.split('.');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) invalid();
  const actual = Buffer.from(parts[1], 'base64url'), expected = createHmac('sha256', key).update(parts[0]).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) invalid();
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { invalid(); }
  const extras = ['rolesManage', 'subjectsChecked', 'actionsGranted'];
  const keys = ['v', 'appId', 'userId', 'clientId', 'grantId', 'spaceId', 'action', 'resources', 'expiresAt', 'requestId', 'method', 'path', 'bodyHash'];
  if (!object(claims) || Object.keys(claims).some(name => !keys.includes(name) && !extras.includes(name)) || keys.some(name => !Object.hasOwn(claims, name))) invalid();
  if (claims.v !== 1 || claims.appId !== 'projects' || claims.method !== 'POST' || claims.path !== '/api/business' || claims.bodyHash !== createHash('sha256').update(raw).digest('hex') || !['read', 'create', 'update', 'accept_plan', 'manage_planning_roles'].includes(claims.action)) invalid();
  if (!['userId', 'clientId', 'grantId', 'spaceId', 'requestId'].every(name => identifier(claims[name])) || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= now || claims.expiresAt > now + 30000) invalid();
  if (!Array.isArray(claims.resources) || !claims.resources.length || claims.resources.length > 1000 || new Set(claims.resources).size !== claims.resources.length || claims.resources.some(id => id !== '*' && !slug(id)) || claims.resources.includes('*') && claims.resources.length !== 1) invalid();
  for (const name of ['rolesManage', 'subjectsChecked']) if (claims[name] !== undefined && typeof claims[name] !== 'boolean') invalid();
  if (claims.actionsGranted !== undefined && (!Array.isArray(claims.actionsGranted) || new Set(claims.actionsGranted).size !== claims.actionsGranted.length || claims.actionsGranted.some(value => !['read', 'create', 'update', 'accept_plan', 'manage_planning_roles'].includes(value)))) invalid();
  return claims;
}
export class BusinessService {
  constructor({ store, key, spaces, now = Date.now }) {
    if (!store || !Buffer.isBuffer(key) || key.length < 32 || key.length > 4096 || !Array.isArray(spaces) || !spaces.length || spaces.some(value => !identifier(value)) || new Set(spaces).size !== spaces.length) throw new Error('Projects business configuration is invalid.');
    this.store = store; this.key = Buffer.from(key); this.spaces = new Set(spaces); this.now = now;
  }
  handle(raw, assertion) {
    const claims = verifyAssertion(raw, assertion, this.key, this.now());
    let request;
    try { request = JSON.parse(raw.toString('utf8')); } catch { fail('INVALID_REQUEST'); }
    if (!this.spaces.has(claims.spaceId)) fail('FORBIDDEN', 403);
    return this.store.execute(request, claims);
  }
}
export function loadBusinessService(store, env = process.env) {
  if (env.PROJECTS_MANAGED !== undefined && !['0', '1'].includes(env.PROJECTS_MANAGED)) throw new Error('PROJECTS_MANAGED must be 0 or 1.');
  if (env.PROJECTS_MANAGED !== '1') return null;
  const paths = ['PROJECTS_BUSINESS_KEY_FILE', 'PROJECTS_BUSINESS_CONFIG_FILE'];
  for (const name of paths) {
    if (!isAbsolute(env[name] || '')) throw new Error('Managed Projects requires absolute key and configuration paths.');
    const info = lstatSync(env[name]);
    if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size > 65536) throw new Error('Business secrets must be private regular files.');
  }
  let config;
  try { config = JSON.parse(readFileSync(env.PROJECTS_BUSINESS_CONFIG_FILE, 'utf8')); } catch { throw new Error('The business configuration must contain valid JSON.'); }
  fields(config, ['version', 'spaces']);
  if (config.version !== 1) throw new Error('The business configuration version is unsupported.');
  return new BusinessService({ store, key: readFileSync(env.PROJECTS_BUSINESS_KEY_FILE), spaces: config.spaces });
}
