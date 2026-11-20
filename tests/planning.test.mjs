import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { once } from 'node:events';
import { createServer } from '../src/server.mjs';
import { fixture, assignment, milestone, completeChanges } from './planning-fixture.mjs';
const code = expected => error => error.code === expected;
const change = value => [{ op: 'set_prd_field', field: 'scope', value }];

test('AC01/02 legacy reads expose exactly five unadopted slots without inventing records or authority', t => {
  const f = fixture(t), before = JSON.stringify(f.store.read('space-a', 'alpha')), value = f.view();
  assert.equal(value.branches.length, 5); assert.equal(value.branches[0].id, 'project'); assert.ok(value.branches.every(branch => !branch.adopted && branch.headRevision === '0'));
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM planning_meta').get().n, 0); assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM planning_roles').get().n, 0);
  assert.equal(JSON.stringify(f.store.read('space-a', 'alpha')), before); assert.equal(value.branches.some(branch => branch.permissions.adopt), false);
});
test('AC03 role administration requires signed effective authority and subjects; acceptance is separate from management or owner text', t => {
  const f = fixture(t), input = { assignments: [assignment('lead', { projectDecision: true })], removeUserIds: [] };
  for (const options of [{ user: 'alice' }, { user: 'manager', rolesManage: false }, { user: 'manager', subjectsChecked: false }, { user: 'manager', actions: ['read', 'update'] }]) assert.throws(() => f.call('set_planning_roles', input, options), code('ROLE_REQUIRED'));
  f.roles(); assert.equal(f.view('manager').capabilities.rolesManage, true); assert.equal(f.view('alice').roleAssignments.length, 0);
  assert.throws(() => f.call('adopt_plan', { branchId: 'project', changes: completeChanges('No'), reason: 'Not a designated decision' }, { user: 'manager' }), code('ROLE_REQUIRED'));
  for (const actions of [['read', 'update'], ['read', 'accept_plan']]) assert.throws(() => f.call('adopt_plan', { branchId: 'project', changes: completeChanges('No'), reason: 'Missing effective action' }, { user: 'lead', actions }), error => ['ROLE_REQUIRED', 'FORBIDDEN'].includes(error.code));
  assert.throws(() => f.call('set_planning_roles', { ...input, administrator: true }, { user: 'manager' }), code('INVALID_INPUT'));
  assert.equal(f.branch('project').adopted, false);
});
test('AC02/03/04 personal branches are unique per project/team/authenticated user and saved versions survive restart', t => {
  const f = fixture(t); f.roles(); f.adopt(); const alice = f.draft(), bob = f.draft('bob'), second = f.draft('alice', 'engineering');
  assert.notEqual(alice.id, bob.id); assert.notEqual(alice.id, second.id); assert.equal(f.draft().id, alice.id);
  const result = f.save(alice.id, change('Own saved scope')); const saved = f.call('read_plan_version', { versionId: result.versionId }); assert.equal(saved.version.plan.prd.scope, 'Own saved scope');
  assert.throws(() => f.call('read_plan_version', { versionId: result.versionId }, { user: 'bob' }), code('FORBIDDEN'));
  assert.throws(() => f.call('save_plan', { branchId: alice.id, changes: change('Other writer') }, { user: 'bob', revision: result.revision }), code('ROLE_REQUIRED'));
  f.reopen(); assert.equal(f.branch(alice.id).headRevision, result.revision); assert.equal(f.branch(alice.id).plan.prd.scope, 'Own saved scope');
  assert.equal(f.view('bob').branches.filter(branch => branch.kind === 'personal').length, 1);
});
test('AC05 plan validators reject malformed fields, duplicate operations, dangling links, cycles and impossible dates atomically', t => {
  const f = fixture(t); f.roles(); f.adopt(); const branch = f.draft(), initial = branch.headRevision;
  const invalid = [change('<script>run()</script>'), [{ op: 'upsert_milestone', item: milestone('bad', { dueDate: '2026-02-30' }) }], [{ op: 'upsert_milestone', item: milestone('bad', { status: 'maybe' }) }], [{ op: 'upsert_milestone', item: milestone('bad', { goalIds: ['missing'] }) }], [{ op: 'remove_goal', id: 'research:goal' }], [...change('one'), ...change('two')], [{ op: 'upsert_milestone', item: milestone('a', { dependsOn: ['b'] }) }, { op: 'upsert_milestone', item: milestone('b', { dependsOn: ['a'] }) }], [{ op: 'arbitrary_json_patch', path: '/owner', value: 'attacker' }]];
  for (const changes of invalid) assert.throws(() => f.call('save_plan', { branchId: branch.id, changes }, { revision: initial }));
  assert.equal(f.branch(branch.id).headRevision, initial);
  assert.throws(() => f.call('save_plan', { branchId: branch.id, changes: [{ op: 'set_prd_field', field: 'scope', value: 'a'.repeat(10001) }] }, { revision: initial }));
});
test('AC06/07 complete personal→team→project flow promotes qualified selected items without replacing project prose or execution facts', t => {
  const f = fixture(t); f.roles(); f.adopt('project', 'Project agreement'); f.adopt(); const facts = JSON.stringify(f.store.read('space-a', 'alpha')), branch = f.draft();
  f.save(branch.id, [{ op: 'upsert_milestone', item: milestone('launch') }]);
  assert.throws(() => f.submit(branch.id, 'alice', 'project'), code('INVALID_TARGET'));
  const submitted = f.submit(branch.id); const accepted = f.decide(submitted.proposalId); assert.ok(accepted.versionId);
  const comparison = f.call('compare_plan', { sourceBranchId: 'team:research', targetBranchId: 'project' }, { user: 'lead' }); assert.ok(comparison.changes.every(item => item.operation !== 'set_prd_field'));
  const upward = f.submit('team:research', 'lead', 'project', comparison.changes.map(item => item.change)); f.decide(upward.proposalId);
  const project = f.branch('project').plan; assert.equal(project.prd.problem, 'Project agreement problem'); assert.ok(project.roadmap.milestones.some(item => item.id === 'research:launch')); assert.ok(project.prd.goals.some(item => item.id === 'project:goal'));
  assert.equal(JSON.stringify(f.store.read('space-a', 'alpha')), facts);
});
test('AC08/09 independent changes preserve both sides; stale target and source cannot commit', t => {
  const f = fixture(t); f.roles(); f.adopt(); const a = f.draft(), b = f.draft('bob'); f.save(a.id, change('Alice scope')); f.save(b.id, [{ op: 'set_prd_field', field: 'outOfScope', value: 'Bob exclusions' }], 'bob');
  const pa = f.submit(a.id), pb = f.submit(b.id, 'bob'); f.decide(pa.proposalId); const before = f.branch('team:research').headRevision;
  assert.throws(() => f.decide(pb.proposalId), code('STALE_REVIEW')); assert.equal(f.branch('team:research').headRevision, before);
  const target = f.branch('team:research'); f.call('sync_plan', { branchId: b.id, targetRevision: target.headRevision, resolutions: [] }, { user: 'bob', revision: f.branch(b.id, 'bob').headRevision });
  const next = f.submit(b.id, 'bob'); f.decide(next.proposalId); assert.equal(f.branch('team:research').plan.prd.scope, 'Alice scope'); assert.equal(f.branch('team:research').plan.prd.outOfScope, 'Bob exclusions');
  f.call('sync_plan', { branchId: a.id, targetRevision: f.branch('team:research').headRevision, resolutions: [] }, { revision: f.branch(a.id).headRevision });
  f.save(a.id, [{ op: 'set_prd_field', field: 'outOfScope', value: 'new draft' }]); const proposal = f.submit(a.id); f.save(a.id, change('Changed after submission')); assert.throws(() => f.decide(proposal.proposalId), code('STALE_REVIEW'));
});
test('AC08 conflicts expose base/current/proposed and require explicit recorded resolution', t => {
  const f = fixture(t); f.roles(); f.adopt(); const a = f.draft(), b = f.draft('bob'); f.save(a.id, change('First scope')); f.save(b.id, change('Second scope'), 'bob'); const first = f.submit(a.id); f.decide(first.proposalId);
  const compare = f.call('compare_plan', { sourceBranchId: b.id, targetBranchId: 'team:research' }, { user: 'bob' }); assert.equal(compare.conflicts.length, 1); assert.equal(compare.conflicts[0].current, 'First scope'); assert.equal(compare.conflicts[0].proposed, 'Second scope');
  const options = { user: 'bob', revision: f.branch(b.id, 'bob').headRevision }, input = { branchId: b.id, targetRevision: f.branch('team:research').headRevision, resolutions: [] };
  assert.throws(() => f.call('sync_plan', input, options), code('PLAN_CONFLICT'));
  f.call('sync_plan', { ...input, resolutions: [{ key: compare.conflicts[0].id, choice: 'proposed', reason: 'Synthetic explicit reconciliation' }] }, options); const revised = f.submit(b.id, 'bob'); f.decide(revised.proposalId); assert.equal(f.branch('team:research').plan.prd.scope, 'Second scope');
});
test('AC10 terminal proposal snapshots, withdraw, supersession and continuing branches remain attributable', t => {
  const f = fixture(t); f.roles(); f.adopt(); const branch = f.draft(); f.save(branch.id, change('First')); const first = f.submit(branch.id); const frozen = f.view().proposals.find(item => item.id === first.proposalId).changes;
  f.decide(first.proposalId, 'reject'); const rejected = f.view().proposals.find(item => item.id === first.proposalId); assert.equal(rejected.status, 'rejected'); assert.deepEqual(rejected.changes, frozen);
  const second = f.submit(branch.id); const p = f.view().proposals.find(item => item.id === second.proposalId); f.call('withdraw_proposal', { proposalId: p.id, reason: 'Synthetic withdrawal' }, { revision: p.revision }); assert.equal(f.view().proposals.find(item => item.id === p.id).status, 'withdrawn');
  const third = f.submit(branch.id), fourth = f.submit(branch.id); assert.equal(f.view().proposals.find(item => item.id === third.proposalId).status, 'superseded'); f.decide(fourth.proposalId);
  f.save(branch.id, [{ op: 'set_prd_field', field: 'outOfScope', value: 'Continue same owned branch' }]); assert.ok(f.submit(branch.id).proposalId); assert.equal(f.draft().id, branch.id);
});
test('AC11 exact intents replay across restart; altered payload conflicts and receipts are owner-scoped metadata', t => {
  const f = fixture(t); f.roles(); const input = { branchId: 'team:research', changes: completeChanges('Adopt'), reason: 'Same intent' }, options = { user: 'lead', key: 'stable-adoption', revision: '0' };
  const adopted = f.call('adopt_plan', input, options); f.reopen(); assert.deepEqual(f.call('adopt_plan', input, options), adopted);
  assert.throws(() => f.call('adopt_plan', { ...input, reason: 'Different intent' }, options), code('IDEMPOTENCY_CONFLICT'));
  const receipt = f.call('read_planning_receipt', { key: options.key }, { user: 'lead' }); assert.equal(receipt.found, true); assert.equal(receipt.receipt.versionId, adopted.versionId); assert.ok(!JSON.stringify(receipt).includes('Adopt problem'));
  assert.equal(f.call('read_planning_receipt', { key: options.key }, { user: 'alice' }).found, false);
});
test('AC03/09 revoked decision roles, missing update and cross-project scope reject without baseline writes', t => {
  const f = fixture(t); f.roles(); f.adopt(); const branch = f.draft(); f.save(branch.id, change('Requested')); const proposal = f.submit(branch.id), before = f.branch('team:research').headRevision;
  f.call('set_planning_roles', { assignments: [assignment('lead', { projectDecision: true, teams: ['research'] })], removeUserIds: [] }, { user: 'manager', revision: f.view('manager').rolesRevision });
  assert.throws(() => f.decide(proposal.proposalId), code('ROLE_REQUIRED')); assert.equal(f.branch('team:research').headRevision, before);
  assert.throws(() => f.call('read_planning', {}, { resources: ['other'] }), code('FORBIDDEN')); assert.throws(() => f.call('read_planning', {}, { resourceId: 'missing' }), code('NOT_FOUND'));
});
test('AC13/16 restoration creates a new owned draft and new proposal while immutable history and execution facts survive', t => {
  const f = fixture(t); f.roles(); f.adopt(); const original = f.branch('team:research').headRevision, branch = f.draft(), facts = JSON.stringify(f.store.read('space-a', 'alpha'));
  f.save(branch.id, change('Later agreement')); f.decide(f.submit(branch.id).proposalId); const later = f.branch('team:research').headRevision;
  const result = f.call('restore_plan', { branchId: branch.id, versionId: original, reason: 'Restore as a new draft for review' }, { revision: f.branch(branch.id).headRevision }); assert.notEqual(result.versionId, original); assert.equal(f.branch('team:research').headRevision, later);
  const target = f.branch('team:research'); const compare = f.call('compare_plan', { sourceBranchId: branch.id, targetBranchId: target.id });
  f.call('sync_plan', { branchId: branch.id, targetRevision: target.headRevision, resolutions: compare.conflicts.map(item => ({ key: item.id, choice: 'proposed', reason: 'Explicit restoration review' })) }, { revision: result.revision }); f.decide(f.submit(branch.id).proposalId);
  assert.equal(f.call('read_plan_version', { versionId: later }).version.plan.prd.scope, 'Later agreement'); assert.equal(f.call('read_plan_version', { versionId: original }).version.plan.prd.scope, 'team:research scope'); assert.equal(JSON.stringify(f.store.read('space-a', 'alpha')), facts);
  const page = f.call('read_plan_history', { limit: 2 }); assert.equal(page.items.length, 2); assert.ok(page.nextCursor); assert.ok(f.call('read_plan_history', { before: page.nextCursor, limit: 2 }).items.every(item => item.cursor < page.nextCursor));
});
test('AC05 commitments require accountable owner and acceptance; planning done never completes execution work', t => {
  const f = fixture(t); f.roles(); f.adopt(); const branch = f.draft(); f.save(branch.id, [{ op: 'upsert_milestone', item: milestone('commit', { commitment: 'committed' }) }]); const p = f.submit(branch.id);
  assert.throws(() => f.decide(p.proposalId), code('COMMITMENT_INCOMPLETE')); assert.equal(f.branch('team:research').plan.roadmap.milestones.length, 0);
  f.save(branch.id, [{ op: 'upsert_milestone', item: milestone('commit', { commitment: 'committed', ownerUserId: 'alice', status: 'done' }) }]); f.decide(f.submit(branch.id).proposalId); assert.equal(f.store.read('space-a', 'alpha').status, 'active');
});
test('AC15 actual loopback signed HTTP records20-client/200-milestone read save compare p95 without production data', async t => {
  const f = fixture(t), members = Array.from({ length: 20 }, (_, i) => 'worker-' + i); f.roles([assignment('lead', { teamDecision: ['research'], teams: ['research'] }), ...members.map(userId => assignment(userId, { teams: ['research'] }))]); f.adopt();
  const initial = f.draft(members[0]); f.save(initial.id, Array.from({ length: 200 }, (_, i) => ({ op: 'upsert_milestone', item: milestone('item-' + i, { order: i }) })), members[0]); f.decide(f.submit(initial.id, members[0]).proposalId);
  const branches = members.map(user => f.draft(user)); const server = createServer({ store: f.store, business: f.service }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); }); const origin = 'http://127.0.0.1:' + server.address().port;
  const measurements = {};
  for (const operation of ['read_planning', 'save_plan', 'compare_plan']) {
    const times = await Promise.all(members.map(async (user, i) => { const input = operation === 'read_planning' ? {} : operation === 'save_plan' ? { branchId: branches[i].id, changes: change('Worker-specific scope ' + i) } : { sourceBranchId: branches[i].id, targetBranchId: 'team:research' }; const request = f.request(operation, input, { revision: branches[i].headRevision }); const signed = f.signed(request, { user }); const started = performance.now(); const response = await fetch(origin + '/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Praxis-Assertion': signed.assertion }, body: signed.raw }); assert.equal(response.status, 200); await response.json(); return performance.now() - started; }));
    times.sort((a, b) => a - b); measurements[operation] = Math.round(times[Math.ceil(times.length * .95) - 1] * 100) / 100; assert.ok(measurements[operation] < 2000, operation + ' p95 exceeds agreed synthetic target');
  }
  t.diagnostic(JSON.stringify({ environment: process.platform + '/' + process.arch, node: process.version, database: 'Node SQLite WAL temporary fixture', members: 20, milestones: 200, concurrency: 20, p95Ms: measurements }));
});

test('AC07/13 team context synchronization never manufactures a newly accepted team plan or replaces its meaning', t => {
  const f = fixture(t); f.roles(); f.adopt('project', 'Project'); f.adopt(); const before = f.branch('team:research'), accepted = f.call('read_plan_version', { versionId: before.headRevision });
  const result = f.call('sync_plan', { branchId: before.id, targetRevision: f.branch('project').headRevision, resolutions: [] }, { user: 'lead', actions: ['read', 'update'], revision: before.headRevision });
  assert.equal(result.versionId, before.headRevision); assert.equal(f.branch(before.id).headRevision, before.headRevision); assert.deepEqual(f.branch(before.id).plan, before.plan); assert.deepEqual(f.call('read_plan_version', { versionId: before.headRevision }), accepted);
});
test('AC06/07 bounded partial submissions preserve the continuing source branch and require real source values', t => {
  const f = fixture(t); f.roles(); f.adopt(); const branch = f.draft(); f.save(branch.id, [...change('Selected scope'), { op: 'set_prd_field', field: 'outOfScope', value: 'Unsubmitted draft detail' }]);
  const selected = change('Selected scope'), proposal = f.submit(branch.id, 'alice', 'team:research', selected); f.decide(proposal.proposalId);
  assert.equal(f.branch('team:research').plan.prd.scope, 'Selected scope'); assert.equal(f.branch('team:research').plan.prd.outOfScope, ''); assert.equal(f.branch(branch.id).plan.prd.outOfScope, 'Unsubmitted draft detail');
  assert.throws(() => f.submit(branch.id, 'alice', 'team:research', change('Not in source')), code('SOURCE_CHANGED'));
});

test('AC03/05 owner-bearing writes require body-bound signed subject proof and cannot manufacture an accountable assignee', t => {
  const f = fixture(t); f.roles(); f.adopt(); const branch = f.draft(), before = branch.headRevision;
  assert.throws(() => f.call('save_plan', { branchId: branch.id, changes: [{ op: 'upsert_milestone', item: milestone('invalid-assignee', { ownerUserId: 'not-a-checked-subject' }) }] }, { revision: before, subjectsChecked: false }), code('SUBJECTS_REQUIRED'));
  assert.equal(f.branch(branch.id).headRevision, before);
  f.save(branch.id, [{ op: 'upsert_milestone', item: milestone('checked-assignee', { ownerUserId: 'alice', commitment: 'committed' }) }]); const proposal = f.submit(branch.id);
  assert.throws(() => f.decide(proposal.proposalId, 'accept', { subjectsChecked: false }), code('SUBJECTS_REQUIRED')); assert.equal(f.branch('team:research').plan.roadmap.milestones.length, 0);
});

test('AC03/13 role assignment and revocation deltas are durable manager-only evidence with their actual actor', t => {
  const f = fixture(t); const assigned = [assignment('lead', { projectDecision: true, teamDecision: ['research'] }), assignment('alice', { teams: ['research'] })]; f.roles(assigned);
  const first = f.call('read_plan_history', {}, { user: 'manager' }).items.find(item => item.kind === 'set_planning_roles');
  assert.deepEqual(first.roleChanges, { assignments: assigned, removedUserIds: [] }); assert.equal(first.actor.userId, 'manager'); assert.equal(first.actor.clientId, 'synthetic-client'); assert.equal(first.actor.grantId, 'synthetic-grant');
  f.call('set_planning_roles', { assignments: [], removeUserIds: ['alice'] }, { user: 'manager', revision: f.view('manager').rolesRevision });
  f.reopen(); const audit = f.call('read_plan_history', {}, { user: 'manager' }).items.filter(item => item.kind === 'set_planning_roles');
  assert.deepEqual(audit[0].roleChanges, { assignments: [], removedUserIds: ['alice'] }); assert.deepEqual(audit[1].roleChanges.assignments, assigned);
  for (const user of ['alice', 'lead']) assert.ok(f.call('read_plan_history', {}, { user }).items.every(item => !Object.hasOwn(item, 'roleChanges')));
  assert.ok(f.call('read_plan_history', {}, { user: 'manager', rolesManage: false }).items.every(item => !Object.hasOwn(item, 'roleChanges')));
});
