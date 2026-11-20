import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, createHash, randomBytes, randomUUID } from 'node:crypto';
import { ProjectStore } from '../src/store.mjs';
import { BusinessService } from '../src/business.mjs';
import { ACTIONS } from '../src/schema.mjs';
export const allActions = ['read', 'create', 'update', 'accept_plan', 'manage_planning_roles'];
export const assignment = (userId, patch = {}) => ({ userId, projectDecision: false, teamDecision: [], teams: [], ...patch });
export const milestone = (id, patch = {}) => ({ id, title: 'Synthetic milestone ' + id, goalIds: ['research:goal'], criterionIds: ['research:criterion'], status: 'todo', priority: 'P1', commitment: 'tentative', ownerUserId: null, dueDate: null, dependsOn: [], order: 0, ...patch });
export const completeChanges = name => [{ op: 'set_prd_field', field: 'problem', value: name + ' problem' }, { op: 'set_prd_field', field: 'scope', value: name + ' scope' }, { op: 'upsert_goal', item: { id: 'goal', text: name + ' goal' } }, { op: 'upsert_criterion', item: { id: 'criterion', text: name + ' criterion', goalIds: ['goal'] } }];
export function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'projects-planning-')), file = join(directory, 'projects.db'), key = randomBytes(48);
  let store = new ProjectStore(file), service = new BusinessService({ store, key, spaces: ['space-a', 'space-b'] });
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  function signed(request, { user = 'alice', actions = allActions, rolesManage = user === 'manager', subjectsChecked = true, resources = ['*'], revision: _revision, key: _key, resourceId: _resourceId, spaceId: _spaceId, ...extra } = {}) {
    const raw = Buffer.from(JSON.stringify(request)), claims = { v: 1, appId: 'projects', userId: user, clientId: 'synthetic-client', grantId: 'synthetic-grant', spaceId: request.spaceId, action: ACTIONS[request.operation], resources, expiresAt: Date.now() + 20000, requestId: randomUUID(), method: 'POST', path: '/api/business', bodyHash: createHash('sha256').update(raw).digest('hex'), rolesManage, subjectsChecked, actionsGranted: actions, ...extra };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url'); return { raw, assertion: body + '.' + createHmac('sha256', key).update(body).digest('base64url') };
  }
  function request(operation, input = {}, { revision = '0', key = randomUUID(), resourceId = 'alpha', spaceId = 'space-a' } = {}) { return { operation, spaceId, resourceId, input, ...(ACTIONS[operation] !== 'read' ? { expectedRevision: revision, idempotencyKey: key } : {}) }; }
  function call(operation, input = {}, options = {}) { const value = request(operation, input, options); if (operation === 'create_project') delete value.expectedRevision; const wire = signed(value, options); return service.handle(wire.raw, wire.assertion); }
  const view = (user = 'alice', options = {}) => call('read_planning', {}, { user, ...options });
  const branch = (id, user = 'alice') => view(user).branches.find(item => item.id === id);
  function roles(values = [assignment('lead', { projectDecision: true, teamDecision: ['research', 'engineering', 'marketing', 'support'], teams: ['research', 'engineering', 'marketing', 'support'] }), assignment('alice', { teams: ['research', 'engineering'] }), assignment('bob', { teams: ['research'] })]) { return call('set_planning_roles', { assignments: values, removeUserIds: [] }, { user: 'manager', revision: view('manager').rolesRevision }); }
  function adopt(id = 'team:research', name = id) { return call('adopt_plan', { branchId: id, changes: completeChanges(name), reason: 'Synthetic authorized initial adoption' }, { user: 'lead', revision: branch(id, 'lead').headRevision }); }
  function draft(user = 'alice', teamId = 'research') { const created = call('create_personal_branch', { teamId }, { user, revision: branch('team:' + teamId, user).headRevision }); return branch(created.branchId, user); }
  function save(id, changes, user = 'alice', options = {}) { return call('save_plan', { branchId: id, changes }, { user, revision: branch(id, user).headRevision, ...options }); }
  function submit(id, user = 'alice', target = 'team:research', changes) { const source = branch(id, user); return call('submit_proposal', { sourceBranchId: id, targetBranchId: target, targetRevision: branch(target, user).headRevision, purpose: 'Synthetic bounded plan change', impact: 'Review the changed scope and linked commitments.', evidence: [], ...(changes ? { changes } : {}) }, { user, revision: source.headRevision }); }
  function decide(id, decision = 'accept', options = {}) { const proposal = view('lead').proposals.find(item => item.id === id); return call('decide_proposal', { proposalId: id, decision, reason: 'Synthetic designated decision', sourceRevision: proposal.sourceRevision, targetRevision: proposal.targetRevision }, { user: 'lead', revision: proposal.revision, ...options }); }
  call('create_project', { name: 'Synthetic project', goal: 'Preserve execution facts', owner: 'ordinary text, not an identity grant' }, { user: 'manager' });
  return { directory, file, key, signed, request, call, view, branch, roles, adopt, draft, save, submit, decide, get store() { return store; }, get service() { return service; }, reopen() { store.close(); store = new ProjectStore(file); service = new BusinessService({ store, key, spaces: ['space-a', 'space-b'] }); } };
}
