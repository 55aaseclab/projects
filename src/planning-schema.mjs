export const PLANNING_ACTIONS = Object.freeze({ read_planning: 'read', compare_plan: 'read', read_plan_history: 'read', read_plan_version: 'read', read_planning_receipt: 'read', set_planning_roles: 'manage_planning_roles', create_personal_branch: 'update', save_plan: 'update', sync_plan: 'update', submit_proposal: 'update', withdraw_proposal: 'update', adopt_plan: 'accept_plan', decide_proposal: 'accept_plan', restore_plan: 'update' });
export const TEAMS = Object.freeze(['research', 'engineering', 'marketing', 'support']);
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);
export const revision = value => typeof value === 'string' && /^(0|[1-9]\d{0,14})$/.test(value) && Number.isSafeInteger(Number(value));
export function invalid(code = 'INVALID_INPUT', status = 400) { throw Object.assign(new Error(code), { code, status }); }
export function shape(value, required, optional = []) { if (!plain(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid(); }
export function text(value, max = 2000, empty = false) { if (typeof value !== 'string' || value.length > max || !empty && !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || /<\s*\/?[a-z][^>]*>/i.test(value)) invalid(); return value; }
const choose = (value, options) => { if (!options.includes(value)) invalid(); return value; };
const ids = (value, maximum = 100) => { if (!Array.isArray(value) || value.length > maximum || value.some(item => !id(item)) || new Set(value).size !== value.length) invalid(); return value; };
const user = value => { if (value !== null && !id(value)) invalid(); return value; };
const teamList = value => { ids(value, 4); if (value.some(item => !TEAMS.includes(item))) invalid(); return value; };
export const emptyPlan = () => ({ prd: { problem: '', scope: '', outOfScope: '', goals: [], criteria: [], questions: [], decisions: [], references: [] }, roadmap: { milestones: [] } });
const collections = ['goal', 'criterion', 'question', 'decision', 'reference', 'milestone'];
export function validateItem(kind, item) {
  const common = ['id'];
  if (kind === 'goal') { shape(item, [...common, 'text']); text(item.text); }
  else if (kind === 'criterion') { shape(item, [...common, 'text', 'goalIds']); text(item.text); ids(item.goalIds); }
  else if (kind === 'question') { shape(item, [...common, 'text', 'ownerUserId', 'state', 'decisionId']); text(item.text); user(item.ownerUserId); choose(item.state, ['open', 'resolved']); if (item.decisionId !== null && !id(item.decisionId)) invalid(); }
  else if (kind === 'decision') { shape(item, [...common, 'text', 'ownerUserId', 'referenceIds']); text(item.text); user(item.ownerUserId); ids(item.referenceIds); }
  else if (kind === 'reference') {
    shape(item, [...common, 'title', 'kind', 'url', 'revision']); text(item.title, 160); choose(item.kind, ['knowledge', 'deliverable']);
    if (typeof item.url !== 'string' || item.url.length > 2048 || /[\s\\?#\u0000-\u001f]/.test(item.url) || /%(?:2e|2f|5c|25)/i.test(item.url)) invalid();
    let url; try { url = new URL(item.url, 'https://projects.invalid'); } catch { invalid(); }
    if (url.username || url.password || url.pathname.includes('//') || item.url.split('/').some(part => part === '..' || part === '.')) invalid();
    if (item.kind === 'knowledge' ? !item.url.startsWith('/apps/knowledge/') || url.origin !== 'https://projects.invalid' : !item.url.startsWith('https://') || url.protocol !== 'https:') invalid();
    if (item.revision !== null) text(item.revision, 200);
  } else if (kind === 'milestone') {
    shape(item, [...common, 'title', 'goalIds', 'criterionIds', 'status', 'priority', 'commitment', 'ownerUserId', 'dueDate', 'dependsOn', 'order']);
    text(item.title, 160); ids(item.goalIds); ids(item.criterionIds); ids(item.dependsOn); user(item.ownerUserId);
    choose(item.status, ['todo', 'doing', 'review', 'done']); choose(item.priority, ['P0', 'P1', 'P2']); choose(item.commitment, ['tentative', 'committed']);
    if (!Number.isSafeInteger(item.order) || item.order < 0) invalid();
    if (item.dueDate !== null) { if (typeof item.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)) invalid(); const date = new Date(item.dueDate + 'T00:00:00Z'); if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.dueDate) invalid(); }
  } else invalid();
  if (!id(item.id)) invalid(); return structuredClone(item);
}
export const collectionName = kind => ({ goal: 'goals', criterion: 'criteria', question: 'questions', decision: 'decisions', reference: 'references', milestone: 'milestones' })[kind];
export function validateChanges(value, { empty = false } = {}) {
  if (!Array.isArray(value) || value.length > 200 || !empty && !value.length) invalid('EMPTY_CHANGES');
  const seen = new Set();
  return value.map(change => {
    if (change?.op === 'set_prd_field') { shape(change, ['op', 'field', 'value']); choose(change.field, ['problem', 'scope', 'outOfScope']); text(change.value, 10000, true); }
    else {
      const match = /^(upsert|remove)_(goal|criterion|question|decision|reference|milestone)$/.exec(change?.op || ''); if (!match) invalid();
      shape(change, ['op', match[1] === 'upsert' ? 'item' : 'id']); if (match[1] === 'upsert') validateItem(match[2], change.item); else if (!id(change.id)) invalid();
    }
    const key = change.op === 'set_prd_field' ? change.field : change.op.split('_').slice(1).join('_') + ':' + (change.item?.id || change.id); if (seen.has(key)) invalid('DUPLICATE_ID', 422); seen.add(key);
    return structuredClone(change);
  });
}
export function validatePlan(plan, { complete = false } = {}) {
  shape(plan, ['prd', 'roadmap']); shape(plan.prd, ['problem', 'scope', 'outOfScope', 'goals', 'criteria', 'questions', 'decisions', 'references']); shape(plan.roadmap, ['milestones']);
  for (const field of ['problem', 'scope', 'outOfScope']) text(plan.prd[field], 10000, true);
  const maps = {};
  for (const kind of collections) {
    const values = (kind === 'milestone' ? plan.roadmap : plan.prd)[collectionName(kind)];
    if (!Array.isArray(values) || values.length > (kind === 'milestone' ? 200 : 100)) invalid('PLAN_TOO_LARGE', 422);
    values.forEach(item => validateItem(kind, item)); maps[kind] = new Map(values.map(item => [item.id, item])); if (maps[kind].size !== values.length) invalid('DUPLICATE_ID', 422);
  }
  const links = (values, map) => { if (values.some(value => !map.has(value))) invalid('INVALID_REFERENCE', 422); };
  for (const criterion of maps.criterion.values()) links(criterion.goalIds, maps.goal);
  for (const question of maps.question.values()) if (question.state === 'resolved' && (!question.decisionId || !maps.decision.has(question.decisionId))) invalid('INVALID_REFERENCE', 422);
  for (const decision of maps.decision.values()) links(decision.referenceIds, maps.reference);
  for (const milestone of maps.milestone.values()) {
    links(milestone.goalIds, maps.goal); links(milestone.criterionIds, maps.criterion); links(milestone.dependsOn, maps.milestone);
    if (milestone.dependsOn.includes(milestone.id)) invalid('DEPENDENCY_CYCLE', 422);
    if (complete && milestone.commitment === 'committed' && (!milestone.ownerUserId || !milestone.criterionIds.length)) invalid('COMMITMENT_INCOMPLETE', 422);
  }
  const visiting = new Set(), visited = new Set();
  function visit(key) { if (visiting.has(key)) invalid('DEPENDENCY_CYCLE', 422); if (visited.has(key)) return; visiting.add(key); maps.milestone.get(key).dependsOn.forEach(visit); visiting.delete(key); visited.add(key); }
  maps.milestone.forEach((_, key) => visit(key));
  if (complete && (!plan.prd.problem.trim() || !plan.prd.scope.trim() || !plan.prd.goals.length || !plan.prd.criteria.length)) invalid('PLAN_INCOMPLETE', 422);
  if (Buffer.byteLength(JSON.stringify(plan)) > 2 * 1024 * 1024) invalid('PLAN_TOO_LARGE', 422);
  return plan;
}
export function validatePlanningRequest(request) {
  shape(request, ['operation', 'spaceId', 'resourceId'], ['input', 'expectedRevision', 'idempotencyKey']);
  if (!Object.hasOwn(PLANNING_ACTIONS, request.operation) || !id(request.spaceId) || typeof request.resourceId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(request.resourceId)) invalid('INVALID_REQUEST');
  const action = PLANNING_ACTIONS[request.operation], input = request.input ?? {}, op = request.operation;
  if (action === 'read') { if (request.expectedRevision !== undefined || request.idempotencyKey !== undefined) invalid('INVALID_REQUEST'); }
  else if (!id(request.idempotencyKey) || !revision(request.expectedRevision)) invalid('REVISION_REQUIRED', 428);
  if (op === 'read_planning') shape(input, []);
  else if (op === 'read_planning_receipt') { shape(input, ['key']); if (!id(input.key)) invalid(); }
  else if (op === 'read_plan_history') { shape(input, [], ['before', 'limit']); if (input.before !== undefined && (!Number.isSafeInteger(input.before) || input.before < 1) || input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50)) invalid(); }
  else if (op === 'read_plan_version') { shape(input, ['versionId']); if (!revision(input.versionId)) invalid(); }
  else if (op === 'set_planning_roles') {
    shape(input, ['assignments', 'removeUserIds']); if (!Array.isArray(input.assignments) || input.assignments.length > 100) invalid(); ids(input.removeUserIds); if (!input.assignments.length && !input.removeUserIds.length) invalid();
    const users = new Set(); for (const assignment of input.assignments) { shape(assignment, ['userId', 'projectDecision', 'teamDecision', 'teams']); if (!id(assignment.userId) || users.has(assignment.userId) || typeof assignment.projectDecision !== 'boolean') invalid(); if (input.removeUserIds.includes(assignment.userId)) invalid(); users.add(assignment.userId); teamList(assignment.teamDecision); teamList(assignment.teams); }
  } else if (op === 'create_personal_branch') { shape(input, ['teamId']); choose(input.teamId, TEAMS); }
  else if (op === 'save_plan') { shape(input, ['branchId', 'changes']); validateChanges(input.changes); }
  else if (op === 'adopt_plan') { shape(input, ['branchId', 'changes', 'reason']); validateChanges(input.changes); text(input.reason); }
  else if (op === 'restore_plan') { shape(input, ['branchId', 'versionId', 'reason']); if (!revision(input.versionId)) invalid(); text(input.reason); }
  else if (op === 'sync_plan') { shape(input, ['branchId', 'targetRevision', 'resolutions']); if (!revision(input.targetRevision) || !Array.isArray(input.resolutions) || input.resolutions.length > 200) invalid(); for (const item of input.resolutions) { shape(item, ['key', 'choice', 'reason']); text(item.key, 240); choose(item.choice, ['base', 'current', 'proposed']); text(item.reason); } }
  else if (op === 'compare_plan') { if (input.proposalId !== undefined) { shape(input, ['proposalId']); if (!id(input.proposalId)) invalid(); } else { shape(input, ['sourceBranchId', 'targetBranchId'], ['changes']); if (!id(input.sourceBranchId) || !id(input.targetBranchId)) invalid(); if (input.changes !== undefined) validateChanges(input.changes); } }
  else if (op === 'submit_proposal') { shape(input, ['sourceBranchId', 'targetBranchId', 'targetRevision', 'purpose', 'impact', 'evidence'], ['changes', 'predecessorId']); if (!id(input.sourceBranchId) || !id(input.targetBranchId) || !revision(input.targetRevision)) invalid(); text(input.purpose); text(input.impact); if (!Array.isArray(input.evidence) || input.evidence.length > 100) invalid(); input.evidence.forEach(value => validateItem('reference', value)); if (input.changes !== undefined) validateChanges(input.changes); if (input.predecessorId !== undefined && !id(input.predecessorId)) invalid(); }
  else if (op === 'withdraw_proposal') { shape(input, ['proposalId', 'reason']); if (!id(input.proposalId)) invalid(); text(input.reason); }
  else if (op === 'decide_proposal') { shape(input, ['proposalId', 'decision', 'reason', 'sourceRevision', 'targetRevision']); if (!id(input.proposalId) || !revision(input.sourceRevision) || !revision(input.targetRevision)) invalid(); choose(input.decision, ['accept', 'reject']); text(input.reason); }
  else invalid();
  if (input.branchId !== undefined && !id(input.branchId)) invalid();
  return { ...request, input: structuredClone(input) };
}
