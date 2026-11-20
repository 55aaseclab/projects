import { createHash, randomUUID } from 'node:crypto';
import { PLANNING_ACTIONS, TEAMS, emptyPlan, validateChanges, validatePlan, validatePlanningRequest, collectionName, invalid } from './planning-schema.mjs';
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const actorOf = claims => ({ userId: claims.userId, clientId: claims.clientId, grantId: claims.grantId });
const owners = plan => [...plan.prd.questions, ...plan.prd.decisions, ...plan.roadmap.milestones].flatMap(item => item.ownerUserId ? [item.ownerUserId] : []);
const changesHaveOwners = changes => changes.some(change => Boolean(change.item?.ownerUserId));
const subjectProof = (claims, required) => { if (required && claims.subjectsChecked !== true) invalid('SUBJECTS_REQUIRED', 403); };
const kinds = ['goal', 'criterion', 'question', 'decision', 'reference', 'milestone'];
const list = (plan, kind) => (kind === 'milestone' ? plan.roadmap : plan.prd)[collectionName(kind)];
const keyOf = change => change.op === 'set_prd_field' ? 'prd:' + change.field : change.op.split('_').slice(1).join('_') + ':' + (change.item?.id || change.id);
function valueOf(plan, change) { if (change.op === 'set_prd_field') return plan.prd[change.field]; const kind = change.op.split('_').slice(1).join('_'); return list(plan, kind).find(item => item.id === (change.item?.id || change.id)) ?? null; }
function proposedValue(change) { return change.op === 'set_prd_field' ? change.value : change.op.startsWith('remove_') ? null : change.item; }
export function applyPlanChanges(plan, changes, validate = true) {
  const result = clone(plan);
  for (const change of changes) {
    if (change.op === 'set_prd_field') result.prd[change.field] = change.value;
    else {
      const kind = change.op.split('_').slice(1).join('_'), values = list(result, kind), id = change.item?.id || change.id, index = values.findIndex(item => item.id === id);
      if (change.op.startsWith('remove_')) { if (index < 0) invalid('INVALID_REFERENCE', 422); values.splice(index, 1); }
      else if (index < 0) values.push(clone(change.item)); else values[index] = clone(change.item);
    }
  }
  result.roadmap.milestones.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (validate) validatePlan(result); return result;
}
function diff(base, next) {
  const changes = [];
  for (const field of ['problem', 'scope', 'outOfScope']) if (base.prd[field] !== next.prd[field]) changes.push({ op: 'set_prd_field', field, value: next.prd[field] });
  for (const kind of kinds) {
    const before = new Map(list(base, kind).map(item => [item.id, item])), after = new Map(list(next, kind).map(item => [item.id, item]));
    for (const [id, item] of after) if (!equal(before.get(id) ?? null, item)) changes.push({ op: 'upsert_' + kind, item: clone(item) });
    for (const id of before.keys()) if (!after.has(id)) changes.push({ op: 'remove_' + kind, id });
  }
  return changes;
}
function qualified(changes, team) {
  const qualify = value => value.includes(':') ? value : team + ':' + value;
  return changes.map(original => {
    const change = clone(original); if (change.op === 'set_prd_field') return change;
    if (change.id) change.id = qualify(change.id);
    if (change.item) { change.item.id = qualify(change.item.id); for (const field of ['goalIds', 'criterionIds', 'dependsOn', 'referenceIds']) if (change.item[field]) change.item[field] = change.item[field].map(qualify); if (change.item.decisionId) change.item.decisionId = qualify(change.item.decisionId); }
    return change;
  });
}
export class PlanningStore {
  constructor(db, { now = Date.now, readProject } = {}) {
    this.db = db; this.now = now; this.readProject = readProject;
    db.exec(`CREATE TABLE IF NOT EXISTS planning_meta(space TEXT,project TEXT,revision INTEGER NOT NULL,roles_revision TEXT NOT NULL,PRIMARY KEY(space,project));
      CREATE TABLE IF NOT EXISTS planning_roles(space TEXT,project TEXT,user_id TEXT,payload TEXT NOT NULL,PRIMARY KEY(space,project,user_id));
      CREATE TABLE IF NOT EXISTS planning_branches(space TEXT,project TEXT,id TEXT,payload TEXT NOT NULL,PRIMARY KEY(space,project,id));
      CREATE TABLE IF NOT EXISTS planning_versions(seq INTEGER PRIMARY KEY AUTOINCREMENT,space TEXT,project TEXT,revision TEXT,payload TEXT NOT NULL,UNIQUE(space,project,revision));
      CREATE TABLE IF NOT EXISTS planning_proposals(space TEXT,project TEXT,id TEXT,revision TEXT,status TEXT,payload TEXT NOT NULL,decision TEXT,PRIMARY KEY(space,project,id));
      CREATE TABLE IF NOT EXISTS planning_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,space TEXT,project TEXT,payload TEXT NOT NULL);`);
  }
  meta(scope) { return this.db.prepare('SELECT revision,roles_revision FROM planning_meta WHERE space=? AND project=?').get(...scope) || { revision: 0, roles_revision: '0' }; }
  next(scope) { this.db.prepare("INSERT OR IGNORE INTO planning_meta VALUES(?,?,0,'0')").run(...scope); this.db.prepare('UPDATE planning_meta SET revision=revision+1 WHERE space=? AND project=?').run(...scope); return String(this.meta(scope).revision); }
  role(scope, userId) { const row = this.db.prepare('SELECT payload FROM planning_roles WHERE space=? AND project=? AND user_id=?').get(...scope, userId); return row ? JSON.parse(row.payload) : { userId, projectDecision: false, teamDecision: [], teams: [] }; }
  has(claims, action) { return (claims.actionsGranted || [claims.action]).includes(action); }
  manager(claims) { return claims.rolesManage === true && this.has(claims, 'manage_planning_roles'); }
  designated(scope, branch, claims) { const role = this.role(scope, claims.userId); return branch.kind === 'project' ? role.projectDecision : branch.kind === 'team' && role.teamDecision.includes(branch.teamId); }
  decisionAllowed(scope, branch, claims) { return this.designated(scope, branch, claims) && this.has(claims, 'accept_plan') && this.has(claims, 'update'); }
  permissions(scope, branch, claims) {
    const role = this.role(scope, claims.userId), own = branch.kind === 'personal' && branch.ownerUserId === claims.userId, member = role.teams.includes(branch.teamId), update = this.has(claims, 'update');
    return { read: branch.kind !== 'personal' || own, edit: own && member && update, createPersonal: branch.kind === 'team' && member && update, adopt: branch.kind !== 'personal' && !branch.adopted && this.decisionAllowed(scope, branch, claims), submit: update && (own && member || branch.kind === 'team' && branch.adopted && role.teamDecision.includes(branch.teamId)), accept: this.decisionAllowed(scope, branch, claims), reject: this.decisionAllowed(scope, branch, claims), sync: update && (own && member || branch.kind === 'team' && role.teamDecision.includes(branch.teamId)), restore: own && member && update };
  }
  branch(scope, id) {
    const row = this.db.prepare('SELECT payload FROM planning_branches WHERE space=? AND project=? AND id=?').get(...scope, id); if (row) return JSON.parse(row.payload);
    if (id === 'project' || TEAMS.some(team => id === 'team:' + team)) {
      const team = id === 'project' ? null : id.slice(5); return { id, kind: team ? 'team' : 'project', teamId: team, ownerUserId: null, parentBranchId: team ? 'project' : null, parentRevision: '0', headRevision: '0', adopted: false, plan: emptyPlan(), basePlan: emptyPlan(), baseRevision: '0' };
    }
    invalid('NOT_FOUND', 404);
  }
  assertRead(scope, branch, claims) { if (!this.permissions(scope, branch, claims).read) invalid('FORBIDDEN', 403); }
  saveBranch(scope, branch, claims, kind, reason = '', details = {}) {
    const revision = this.next(scope), at = new Date(this.now()).toISOString(); branch.headRevision = revision;
    const version = { versionId: revision, branchId: branch.id, revision, plan: clone(branch.plan), parentRevision: branch.parentRevision, actor: actorOf(claims), at, reason, kind };
    this.db.prepare('INSERT INTO planning_versions(space,project,revision,payload) VALUES(?,?,?,?)').run(...scope, revision, JSON.stringify(version));
    this.db.prepare('INSERT INTO planning_branches VALUES(?,?,?,?) ON CONFLICT(space,project,id) DO UPDATE SET payload=excluded.payload').run(...scope, branch.id, JSON.stringify(branch));
    this.note(scope, claims, { revision, kind, branchId: branch.id, versionId: revision, reason, ...details }); return revision;
  }
  note(scope, claims, value) { this.db.prepare('INSERT INTO planning_history(space,project,payload) VALUES(?,?,?)').run(...scope, JSON.stringify({ id: randomUUID(), branchId: null, proposalId: null, sourceRevision: null, targetRevision: null, versionId: null, at: new Date(this.now()).toISOString(), actor: actorOf(claims), reason: '', ...value })); }
  history(scope, claims, { before = Number.MAX_SAFE_INTEGER, limit = 25 } = {}) {
    const rows = this.db.prepare('SELECT seq,payload FROM planning_history WHERE space=? AND project=? AND seq<? ORDER BY seq DESC LIMIT ?').all(...scope, before, limit + 1);
    const visible = rows.filter(row => { const item = JSON.parse(row.payload); if (!item.branchId) return true; return this.permissions(scope, this.branch(scope, item.branchId), claims).read; });
    return { items: visible.slice(0, limit).map(row => { const item = { ...JSON.parse(row.payload), cursor: row.seq }; if (!this.manager(claims)) delete item.roleChanges; return item; }), nextCursor: rows.length > limit ? rows[limit - 1]?.seq ?? null : null };
  }
  version(scope, versionId, claims) { const row = this.db.prepare('SELECT payload FROM planning_versions WHERE space=? AND project=? AND revision=?').get(...scope, versionId); if (!row) invalid('NOT_FOUND', 404); const version = JSON.parse(row.payload); this.assertRead(scope, this.branch(scope, version.branchId), claims); return version; }
  proposal(scope, id) { const row = this.db.prepare('SELECT * FROM planning_proposals WHERE space=? AND project=? AND id=?').get(...scope, id); if (!row) invalid('NOT_FOUND', 404); return { ...JSON.parse(row.payload), id: row.id, revision: row.revision, status: row.status, decision: row.decision ? JSON.parse(row.decision) : null }; }
  proposalView(scope, proposal, claims) { const { basePlan, ...visible } = proposal; const target = this.branch(scope, proposal.targetBranchId), source = this.branch(scope, proposal.sourceBranchId); return { ...visible, stale: source.headRevision !== proposal.sourceRevision || target.headRevision !== proposal.targetRevision, permissions: { accept: proposal.status === 'submitted' && this.decisionAllowed(scope, target, claims), reject: proposal.status === 'submitted' && this.decisionAllowed(scope, target, claims), withdraw: proposal.status === 'submitted' && proposal.authorUserId === claims.userId && this.has(claims, 'update') } }; }
  view(scope, claims) {
    const branches = ['project', ...TEAMS.map(team => 'team:' + team)].map(id => this.branch(scope, id));
    for (const row of this.db.prepare('SELECT payload FROM planning_branches WHERE space=? AND project=?').all(...scope)) { const branch = JSON.parse(row.payload); if (branch.kind === 'personal' && branch.ownerUserId === claims.userId) branches.push(branch); }
    const roles = this.manager(claims) ? this.db.prepare('SELECT payload FROM planning_roles WHERE space=? AND project=? ORDER BY user_id').all(...scope).map(row => JSON.parse(row.payload)) : [];
    const proposals = this.db.prepare("SELECT id FROM planning_proposals WHERE space=? AND project=? ORDER BY (status='submitted') DESC,CAST(revision AS INTEGER) DESC LIMIT 50").all(...scope).map(row => this.proposalView(scope, this.proposal(scope, row.id), claims));
    const state = this.meta(scope);
    return { projectId: scope[1], revision: String(state.revision), actor: { userId: claims.userId || null }, capabilities: { rolesManage: this.manager(claims), update: this.has(claims, 'update'), acceptPlan: this.has(claims, 'accept_plan') }, rolesRevision: state.roles_revision, roleAssignments: roles,
      branches: branches.map(branch => { const { basePlan, baseRevision, ...visible } = branch; return { ...visible, revision: branch.headRevision, currentParentRevision: branch.parentBranchId ? this.branch(scope, branch.parentBranchId).headRevision : null, permissions: this.permissions(scope, branch, claims) }; }), proposals, history: this.history(scope, claims) };
  }
  targetFor(source, target) { if (source.kind === 'personal' && target.id === 'team:' + source.teamId || source.kind === 'team' && target.id === 'project') return; invalid('INVALID_TARGET', 422); }
  upward(source) { return kinds.flatMap(kind => list(source.plan, kind).map(item => ({ op: 'upsert_' + kind, item: clone(item) }))); }
  comparison(scope, source, target, changes, claims, basePlan = source.basePlan, capturedRevision = source.baseRevision) {
    const details = changes.map(change => { const base = valueOf(basePlan, change), current = valueOf(target.plan, change), proposed = proposedValue(change); return { id: keyOf(change), operation: change.op, change: clone(change), pathLabel: keyOf(change), base, current, proposed, conflict: !equal(current, base) && !equal(current, proposed) }; });
    return { source: { branchId: source.id, revision: source.headRevision, kind: source.kind }, target: { branchId: target.id, capturedRevision, currentRevision: target.headRevision }, changes: details, conflicts: details.filter(item => item.conflict), impacts: details.map(item => ({ kind: item.change.op === 'set_prd_field' ? 'scope' : item.change.op.split('_').slice(1).join('_'), id: item.id, text: item.pathLabel })) };
  }
  execute(requestValue, claims) {
    const request = validatePlanningRequest(requestValue), action = PLANNING_ACTIONS[request.operation], scope = [request.spaceId, request.resourceId], input = request.input, op = request.operation;
    if (claims.spaceId !== request.spaceId || claims.action !== action || !claims.resources?.some(value => value === '*' || value === request.resourceId)) invalid('FORBIDDEN', 403);
    if (claims.expiresAt <= this.now()) invalid('INVALID_ASSERTION', 401); this.readProject(...scope);
    const envelope = value => ({ spaceId: scope[0], resourceId: scope[1], ...value });
    if (action === 'read') {
      let result;
      if (op === 'read_planning') result = this.view(scope, claims);
      else if (op === 'read_plan_history') result = this.history(scope, claims, input);
      else if (op === 'read_plan_version') result = { version: this.version(scope, input.versionId, claims) };
      else if (op === 'read_planning_receipt') { const row = this.db.prepare('SELECT response,created_at FROM project_receipts WHERE space=? AND resource=? AND user_id=? AND client_id=? AND grant_id=? AND key=?').get(...scope, claims.userId, claims.clientId, claims.grantId, input.key); result = row ? { found: true, receipt: Object.fromEntries(Object.entries(JSON.parse(row.response)).filter(([key]) => ['spaceId','resourceId','revision','branchId','versionId','proposalId','rolesRevision'].includes(key))), committedAt: new Date(row.created_at).toISOString() } : { found: false, receipt: null }; }
      else {
        if (input.proposalId) { const proposal = this.proposal(scope, input.proposalId), source = this.branch(scope, proposal.sourceBranchId), target = this.branch(scope, proposal.targetBranchId); result = this.comparison(scope, source, target, proposal.changes, claims, proposal.basePlan, proposal.targetRevision); }
        else { const source = this.branch(scope, input.sourceBranchId), target = this.branch(scope, input.targetBranchId); this.assertRead(scope, source, claims); this.targetFor(source, target); const changes = input.changes === undefined ? source.kind === 'personal' ? diff(source.basePlan, source.plan) : this.upward(source) : qualified(validateChanges(input.changes), source.teamId); result = this.comparison(scope, source, target, changes, claims); }
      }
      if (claims.expiresAt <= this.now()) invalid('INVALID_ASSERTION', 401); return envelope(result);
    }
    const identity = [...scope, claims.userId, claims.clientId, claims.grantId, request.idempotencyKey], digest = fingerprint(request);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.prepare('SELECT fingerprint,response FROM project_receipts WHERE space=? AND resource=? AND user_id=? AND client_id=? AND grant_id=? AND key=?').get(...identity);
      if (prior) { if (prior.fingerprint !== digest) invalid('IDEMPOTENCY_CONFLICT', 409); this.checkMutationAuthority(scope, op, input, claims); if (claims.expiresAt <= this.now()) invalid('INVALID_ASSERTION', 401); this.db.exec('COMMIT'); return JSON.parse(prior.response); }
      const nonce = this.db.prepare('SELECT fingerprint FROM project_requests WHERE id=?').get(claims.requestId); if (nonce) invalid('REQUEST_ID_CONFLICT', 409);
      this.checkMutationAuthority(scope, op, input, claims);
      let result, changed = true;
      const expect = actual => { if (request.expectedRevision !== actual) invalid('CONFLICT', 409); };
      if (op === 'set_planning_roles') {
        expect(this.meta(scope).roles_revision);
        for (const assignment of input.assignments) this.db.prepare('INSERT INTO planning_roles VALUES(?,?,?,?) ON CONFLICT(space,project,user_id) DO UPDATE SET payload=excluded.payload').run(...scope, assignment.userId, JSON.stringify(assignment));
        for (const userId of input.removeUserIds) this.db.prepare('DELETE FROM planning_roles WHERE space=? AND project=? AND user_id=?').run(...scope, userId);
        const revision = this.next(scope); this.db.prepare('UPDATE planning_meta SET roles_revision=? WHERE space=? AND project=?').run(revision, ...scope); this.note(scope, claims, { revision, kind: op, roleChanges: { assignments: clone(input.assignments), removedUserIds: clone(input.removeUserIds) } }); result = { revision, rolesRevision: revision };
      } else if (op === 'create_personal_branch') {
        const parent = this.branch(scope, 'team:' + input.teamId); expect(parent.headRevision);
        const branchId = 'personal:' + input.teamId + ':' + fingerprint(claims.userId).slice(0, 24);
        const existing = this.db.prepare('SELECT payload FROM planning_branches WHERE space=? AND project=? AND id=?').get(...scope, branchId);
        if (existing) { const branch = JSON.parse(existing.payload); result = { revision: branch.headRevision, branchId, versionId: branch.headRevision }; changed = false; }
        else { const branch = { id: branchId, kind: 'personal', teamId: input.teamId, ownerUserId: claims.userId, parentBranchId: parent.id, parentRevision: parent.headRevision, headRevision: '0', adopted: false, basePlan: clone(parent.plan), baseRevision: parent.headRevision, plan: clone(parent.plan) }; const revision = this.saveBranch(scope, branch, claims, op); result = { revision, branchId, versionId: revision }; }
      } else if (['save_plan', 'adopt_plan', 'restore_plan', 'sync_plan'].includes(op)) {
        const branch = this.branch(scope, input.branchId); expect(branch.headRevision);
        if (op === 'save_plan' || op === 'adopt_plan') subjectProof(claims, changesHaveOwners(input.changes));
        if (op === 'save_plan') branch.plan = applyPlanChanges(branch.plan, qualified(input.changes, branch.teamId));
        if (op === 'adopt_plan') { if (branch.adopted) invalid('ALREADY_ADOPTED', 409); branch.plan = applyPlanChanges(branch.plan, qualified(input.changes, branch.teamId || 'project')); validatePlan(branch.plan, { complete: true }); branch.adopted = true; if (branch.parentBranchId) { const parent = this.branch(scope, branch.parentBranchId); branch.parentRevision = parent.headRevision; branch.baseRevision = parent.headRevision; branch.basePlan = clone(parent.plan); } }
        if (op === 'restore_plan') { const version = this.version(scope, input.versionId, claims); subjectProof(claims, owners(version.plan).length > 0); const parent = this.branch(scope, branch.parentBranchId); branch.basePlan = clone(parent.plan); branch.baseRevision = parent.headRevision; branch.parentRevision = parent.headRevision; branch.plan = clone(version.plan); validatePlan(branch.plan); }
        if (op === 'sync_plan') {
          const target = this.branch(scope, branch.parentBranchId); if (input.targetRevision !== target.headRevision) invalid('STALE_REVIEW', 409);
          if (branch.kind === 'personal') {
            const changes = diff(branch.basePlan, branch.plan), comparison = this.comparison(scope, branch, target, changes, claims), resolutions = new Map(input.resolutions.map(value => [value.key, value]));
            if (resolutions.size !== input.resolutions.length || comparison.conflicts.some(item => !resolutions.has(item.id)) || input.resolutions.some(item => !comparison.conflicts.some(conflict => conflict.id === item.key))) invalid('PLAN_CONFLICT', 409);
            const applied = changes.flatMap(change => { const resolution = resolutions.get(keyOf(change)); if (!resolution || resolution.choice === 'proposed') return [change]; if (resolution.choice === 'current') return []; const base = valueOf(branch.basePlan, change); if (change.op === 'set_prd_field') return [{ ...change, value: base }]; const kind = change.op.split('_').slice(1).join('_'); return [base ? { op: 'upsert_' + kind, item: base } : { op: 'remove_' + kind, id: change.item?.id || change.id }]; });
            branch.plan = applyPlanChanges(target.plan, applied); branch.basePlan = clone(target.plan); branch.baseRevision = target.headRevision;
          } else { branch.basePlan = clone(target.plan); branch.baseRevision = target.headRevision; }
          branch.parentRevision = target.headRevision;
        }
        if (op === 'sync_plan' && branch.kind === 'team') { const revision = this.next(scope); this.db.prepare('UPDATE planning_branches SET payload=? WHERE space=? AND project=? AND id=?').run(JSON.stringify(branch), ...scope, branch.id); this.note(scope, claims, { revision, kind: 'sync_context', branchId: branch.id, versionId: branch.headRevision, targetRevision: branch.parentRevision }); result = { revision, branchId: branch.id, versionId: branch.headRevision }; } else { const revision = this.saveBranch(scope, branch, claims, op, input.reason || (op === 'sync_plan' ? input.resolutions.map(value => value.reason).join('; ') : '')); result = { revision, branchId: branch.id, versionId: revision }; }
      } else if (op === 'submit_proposal') {
        const source = this.branch(scope, input.sourceBranchId), target = this.branch(scope, input.targetBranchId); expect(source.headRevision); this.targetFor(source, target);
        if (!target.adopted) invalid('BASELINE_UNADOPTED', 409); if (input.targetRevision !== target.headRevision) invalid('STALE_REVIEW', 409);
        const changes = input.changes === undefined ? source.kind === 'personal' ? diff(source.basePlan, source.plan) : invalid('EXPLICIT_CHANGES_REQUIRED', 422) : qualified(input.changes, source.teamId);
        validateChanges(changes); subjectProof(claims, changesHaveOwners(changes)); if (changes.every(change => equal(valueOf(target.plan, change), proposedValue(change)))) invalid('EMPTY_CHANGES', 422);
        if (source.kind === 'personal' && changes.some(change => !equal(proposedValue(change), valueOf(source.plan, change)))) invalid('SOURCE_CHANGED', 409);
        const comparison = this.comparison(scope, source, target, changes, claims); if (comparison.conflicts.length) invalid('PLAN_CONFLICT', 409);
        validatePlan(applyPlanChanges(target.plan, changes));
        if (input.predecessorId) { const predecessor = this.proposal(scope, input.predecessorId); if (predecessor.authorUserId !== claims.userId || predecessor.sourceBranchId !== source.id || predecessor.targetBranchId !== target.id) invalid('FORBIDDEN', 403); }
        for (const row of this.db.prepare("SELECT id FROM planning_proposals WHERE space=? AND project=? AND status='submitted'").all(...scope)) { const previous = this.proposal(scope, row.id); if (previous.sourceBranchId === source.id && previous.targetBranchId === target.id) this.terminal(scope, previous, claims, 'superseded', 'Superseded by a newly reviewed submission.'); }
        const revision = this.next(scope), proposalId = 'proposal:' + randomUUID(), payload = { sourceBranchId: source.id, sourceRevision: source.headRevision, targetBranchId: target.id, targetRevision: target.headRevision, authorUserId: claims.userId, purpose: input.purpose, impact: input.impact, evidence: clone(input.evidence), changes: clone(changes), basePlan: clone(target.plan), predecessorId: input.predecessorId || null, createdAt: new Date(this.now()).toISOString() };
        this.db.prepare("INSERT INTO planning_proposals VALUES(?,?,?,?,? ,?,NULL)").run(...scope, proposalId, revision, 'submitted', JSON.stringify(payload)); this.note(scope, claims, { revision, kind: op, proposalId, sourceRevision: source.headRevision, targetRevision: target.headRevision }); result = { revision, proposalId };
      } else {
        const proposal = this.proposal(scope, input.proposalId); expect(proposal.revision); if (proposal.status !== 'submitted') invalid('PROPOSAL_TERMINAL', 409);
        if (op === 'withdraw_proposal') result = this.terminal(scope, proposal, claims, 'withdrawn', input.reason);
        else {
          const source = this.branch(scope, proposal.sourceBranchId), target = this.branch(scope, proposal.targetBranchId);
          if (input.sourceRevision !== proposal.sourceRevision || input.targetRevision !== proposal.targetRevision) invalid('STALE_REVIEW', 409);
          if (input.decision === 'accept') {
            if (source.headRevision !== proposal.sourceRevision || target.headRevision !== proposal.targetRevision || input.sourceRevision !== source.headRevision || input.targetRevision !== target.headRevision) invalid('STALE_REVIEW', 409);
            const comparison = this.comparison(scope, source, target, proposal.changes, claims, proposal.basePlan, proposal.targetRevision); if (comparison.conflicts.length) invalid('PLAN_CONFLICT', 409);
            target.plan = applyPlanChanges(target.plan, proposal.changes); subjectProof(claims, owners(target.plan).length > 0); validatePlan(target.plan, { complete: true }); const versionId = this.saveBranch(scope, target, claims, 'accept_proposal', input.reason, { proposalId: proposal.id, sourceRevision: proposal.sourceRevision, targetRevision: proposal.targetRevision });
            result = this.terminal(scope, proposal, claims, 'accepted', input.reason, { targetRevision: versionId, versionId });
          } else result = this.terminal(scope, proposal, claims, 'rejected', input.reason);
        }
      }
      if (claims.expiresAt <= this.now()) invalid('INVALID_ASSERTION', 401);
      result = envelope(result);
      if (changed) this.db.prepare('INSERT INTO project_events(space,resource,revision,operation,committed_at) VALUES(?,?,?,?,?)').run(...scope, result.revision, op, this.now());
      this.db.prepare('INSERT INTO project_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(...identity, digest, JSON.stringify(result), this.now());
      this.db.prepare('DELETE FROM project_requests WHERE expires_at<?').run(this.now()); this.db.prepare('INSERT INTO project_requests VALUES(?,?,?)').run(claims.requestId, digest, claims.expiresAt);
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  terminal(scope, proposal, claims, result, reason, extra = {}) {
    const revision = this.next(scope), decision = { result, reason, actor: actorOf(claims), at: new Date(this.now()).toISOString(), targetRevision: proposal.targetRevision, versionId: null, ...extra };
    this.db.prepare('UPDATE planning_proposals SET revision=?,status=?,decision=? WHERE space=? AND project=? AND id=?').run(revision, result, JSON.stringify(decision), ...scope, proposal.id);
    this.note(scope, claims, { revision, kind: result + '_proposal', proposalId: proposal.id, reason, sourceRevision: proposal.sourceRevision, targetRevision: decision.targetRevision, versionId: decision.versionId }); return { revision, proposalId: proposal.id, ...(decision.versionId && { versionId: decision.versionId }) };
  }
  checkMutationAuthority(scope, op, input, claims) {
    if (op === 'set_planning_roles') { if (!this.manager(claims) || claims.subjectsChecked !== true) invalid('ROLE_REQUIRED', 403); return; }
    if (!this.has(claims, 'update')) invalid('FORBIDDEN', 403);
    if (op === 'create_personal_branch') { if (!this.role(scope, claims.userId).teams.includes(input.teamId)) invalid('ROLE_REQUIRED', 403); return; }
    if (op === 'submit_proposal') { const branch = this.branch(scope, input.sourceBranchId); if (!this.permissions(scope, branch, claims).submit) invalid('FORBIDDEN', 403); return; }
    if (op === 'withdraw_proposal') { if (this.proposal(scope, input.proposalId).authorUserId !== claims.userId) invalid('FORBIDDEN', 403); return; }
    if (op === 'decide_proposal') { const proposal = this.proposal(scope, input.proposalId); if (!this.decisionAllowed(scope, this.branch(scope, proposal.targetBranchId), claims)) invalid('ROLE_REQUIRED', 403); return; }
    const branch = this.branch(scope, input.branchId), permissions = this.permissions(scope, branch, claims);
    if (op === 'adopt_plan' ? branch.kind === 'personal' || !this.decisionAllowed(scope, branch, claims) : op === 'sync_plan' ? !permissions.sync : op === 'restore_plan' ? !permissions.restore : !permissions.edit) invalid('ROLE_REQUIRED', 403);
  }
}
