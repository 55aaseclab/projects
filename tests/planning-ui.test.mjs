import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, planChanges, applyPlanChanges, compareLocalDraft, draftStorageKey } from '../public/planning.js';

test('native editors produce bounded typed field/item changes without replacing a plan or mutating either input', () => {
  const before = emptyPlan(), after = emptyPlan();
  after.prd.problem = 'Fictional river measurements need a common brief.';
  after.prd.goals.push({ id: 'river-goal', text: 'Agree a measurement window.' });
  after.prd.criteria.push({ id: 'river-criterion', text: 'Record the approved window.', goalIds: ['river-goal'] });
  const untouched = structuredClone(before), changes = planChanges(before, after);
  assert.deepEqual(changes.map(change => change.op), ['set_prd_field', 'upsert_goal', 'upsert_criterion']);
  assert.ok(changes.every(change => !('plan' in change) && !('path' in change)));
  assert.deepEqual(applyPlanChanges(before, changes), after); assert.deepEqual(before, untouched);
});

test('native comparison preserves independent saved work while identifying conflicting stable items and deletions', () => {
  const base = emptyPlan(); base.prd.goals.push({ id: 'goal-a', text: 'Original goal' });
  const current = structuredClone(base), proposed = structuredClone(base);
  current.prd.scope = 'Independent saved scope'; current.prd.goals[0].text = 'Another saved goal'; proposed.prd.goals[0].text = 'My local goal';
  proposed.prd.outOfScope = 'No equipment purchase';
  const comparison = compareLocalDraft(base, current, proposed);
  const conflict = comparison.find(change => change.id === 'goal:goal-a');
  assert.equal(conflict.conflict, true); assert.equal(conflict.base.text, 'Original goal'); assert.equal(conflict.current.text, 'Another saved goal'); assert.equal(conflict.proposed.text, 'My local goal');
  const independent = comparison.filter(change => !change.conflict).map(change => change.change);
  const recovered = applyPlanChanges(current, independent);
  assert.equal(recovered.prd.scope, 'Independent saved scope'); assert.equal(recovered.prd.goals[0].text, 'Another saved goal'); assert.equal(recovered.prd.outOfScope, 'No equipment purchase');
  proposed.prd.goals = []; const removal = compareLocalDraft(base, current, proposed).find(change => change.id === 'goal:goal-a');
  assert.equal(removal.conflict, true); assert.equal(removal.proposed, null); assert.equal(removal.change.op, 'remove_goal');
});

test('draft recovery namespaces include authenticated identity, space, project and branch without ambiguous separators', () => {
  const first = draftStorageKey('reader-a', { spaceId: 'demo:one', resourceId: 'river' }, 'personal:one');
  assert.equal(first, draftStorageKey('reader-a', { spaceId: 'demo:one', resourceId: 'river' }, 'personal:one'));
  for (const [actor, entry, branch] of [['reader-b', { spaceId: 'demo:one', resourceId: 'river' }, 'personal:one'], ['reader-a', { spaceId: 'demo', resourceId: 'one:river' }, 'personal:one'], ['reader-a', { spaceId: 'demo:one', resourceId: 'river' }, 'personal:two']]) assert.notEqual(first, draftStorageKey(actor, entry, branch));
  assert.throws(() => draftStorageKey('', { spaceId: 'demo', resourceId: 'river' }, 'personal:one'));
});

test('typed local recovery rejects arbitrary path operations and retains declared milestone order and execution-neutral planning state', () => {
  const before = emptyPlan(), after = emptyPlan();
  const milestone = { id: 'visit', title: 'Agree a visit', goalIds: [], criterionIds: [], status: 'done', priority: 'P1', commitment: 'tentative', ownerUserId: null, dueDate: null, dependsOn: [], order: 1 };
  before.roadmap.milestones = [milestone]; after.roadmap.milestones = [{ ...milestone, order: 0 }];
  const changes = planChanges(before, after); assert.equal(changes[0].op, 'upsert_milestone');
  assert.equal(applyPlanChanges(before, changes).roadmap.milestones[0].order, 0);
  assert.equal('workItems' in applyPlanChanges(before, changes), false);
  assert.throws(() => applyPlanChanges(before, [{ op: 'replace', path: '__proto__', value: {} }]));
  assert.throws(() => applyPlanChanges(before, [{ op: 'set_prd_field', field: 'roles', value: 'owner' }]));
});
