// Projects owns this renderer. Plans are plain typed data; no content is executed.
export const TEAM_IDS = ['research', 'engineering', 'marketing', 'support'];
export const PLAN_COLLECTIONS = ['goal', 'criterion', 'question', 'decision', 'reference', 'milestone'];
const collectionPath = { goal: ['prd', 'goals'], criterion: ['prd', 'criteria'], question: ['prd', 'questions'], decision: ['prd', 'decisions'], reference: ['prd', 'references'], milestone: ['roadmap', 'milestones'] };
export const emptyPlan = () => ({ prd: { problem: '', scope: '', outOfScope: '', goals: [], criteria: [], questions: [], decisions: [], references: [] }, roadmap: { milestones: [] } });
const copy = value => structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export function planChanges(before, after) {
  const changes = [];
  for (const field of ['problem', 'scope', 'outOfScope']) if (before.prd[field] !== after.prd[field]) changes.push({ op: 'set_prd_field', field, value: after.prd[field] });
  for (const kind of PLAN_COLLECTIONS) {
    const [section, name] = collectionPath[kind], previous = new Map(before[section][name].map(item => [item.id, item])), next = new Map(after[section][name].map(item => [item.id, item]));
    for (const id of previous.keys()) if (!next.has(id)) changes.push({ op: `remove_${kind}`, id });
    for (const item of next.values()) if (!same(previous.get(item.id), item)) changes.push({ op: `upsert_${kind}`, item: copy(item) });
  }
  return changes;
}
export function applyPlanChanges(plan, changes) {
  const next = copy(plan);
  for (const change of changes) {
    if (change.op === 'set_prd_field' && ['problem', 'scope', 'outOfScope'].includes(change.field)) next.prd[change.field] = change.value;
    else {
      const match = /^(upsert|remove)_(goal|criterion|question|decision|reference|milestone)$/.exec(change.op || ''); if (!match) throw new Error('Invalid typed plan change.');
      const [section, name] = collectionPath[match[2]], items = next[section][name], id = change.item?.id || change.id, at = items.findIndex(item => item.id === id);
      if (match[1] === 'remove') { if (at >= 0) items.splice(at, 1); }
      else if (at >= 0) items[at] = copy(change.item); else items.push(copy(change.item));
    }
  }
  return next;
}
function operationValue(plan, operation) {
  if (operation.op === 'set_prd_field') return plan.prd[operation.field];
  const kind = operation.op.replace(/^(?:upsert|remove)_/, ''), [section, name] = collectionPath[kind];
  return plan[section][name].find(item => item.id === (operation.item?.id || operation.id)) || null;
}
export function compareLocalDraft(base, current, proposed) {
  return planChanges(base, proposed).map(change => {
    const previous = operationValue(base, change), now = operationValue(current, change), next = operationValue(proposed, change);
    return { id: change.op === 'set_prd_field' ? `prd:${change.field}` : `${change.op.replace(/^(?:upsert|remove)_/, '')}:${change.item?.id || change.id}`, change, base: previous, current: now, proposed: next, conflict: !same(previous, now) && !same(now, next) };
  });
}
export function draftStorageKey(actorId, entry, branchId) {
  if (![actorId, entry?.spaceId, entry?.resourceId, branchId].every(value => typeof value === 'string' && value.length && value.length < 512)) throw new Error('Invalid draft identity.');
  return 'projects.planning.draft:' + [actorId, entry.spaceId, entry.resourceId, branchId].map(encodeURIComponent).join(':');
}
const freshId = kind => `${kind}-${crypto.randomUUID().slice(0, 12)}`;
function newItem(kind, order) {
  const id = freshId(kind);
  if (kind === 'goal') return { id, text: '' };
  if (kind === 'criterion') return { id, text: '', goalIds: [] };
  if (kind === 'question') return { id, text: '', ownerUserId: null, state: 'open', decisionId: null };
  if (kind === 'decision') return { id, text: '', ownerUserId: null, referenceIds: [] };
  if (kind === 'reference') return { id, title: '', kind: 'knowledge', url: '', revision: null };
  return { id, title: '', goalIds: [], criterionIds: [], status: 'todo', priority: 'P1', commitment: 'tentative', ownerUserId: null, dueDate: null, dependsOn: [], order };
}
const names = {
  goal: ['Goals', '目标'], criterion: ['Acceptance criteria', '验收条件'], question: ['Open questions', '未决问题'], decision: ['Decisions', '决策'], reference: ['Sources', '来源'], milestone: ['Milestones', '里程碑'],
};
function node(tag, className, text) { const value = document.createElement(tag); if (className) value.className = className; if (text !== undefined) value.textContent = text; return value; }
function button(text, handler, { primary = false, disabled = false, name } = {}) {
  const value = node('button', primary ? 'plan-button primary' : 'plan-button', text); value.type = 'button'; value.disabled = disabled;
  if (name) value.dataset.action = name;
  value.addEventListener('click', handler); return value;
}
function message(text, role = 'status') { const value = node('p', 'plan-feedback', text); value.setAttribute('role', role); return value; }
let fieldNumber = 0;
function labeled(text, input) {
  const value = node('div', 'plan-field'), label = node('label', 'plan-label', text);
  input.id ||= `plan-field-${++fieldNumber}`; label.htmlFor = input.id;
  value.append(label, input); return value;
}
function textField(value, change, { multiline = false, max = 2000, nullable = false, type = 'text', required = false } = {}) {
  const input = document.createElement(multiline ? 'textarea' : 'input'); if (!multiline) input.type = type;
  input.value = value ?? ''; if (multiline) input.rows = 4; input.maxLength = max; input.required = required;
  input.addEventListener('input', () => change(nullable && !input.value ? null : input.value)); return input;
}
function choice(value, options, change, { multiple = false, nullable = false } = {}) {
  const select = document.createElement('select'); select.multiple = multiple;
  if (multiple) select.size = Math.min(5, Math.max(2, options.length));
  for (const [id, text] of options) { const option = node('option', '', text); option.value = id; option.selected = multiple ? value.includes(id) : String(value ?? '') === id; select.append(option); }
  select.addEventListener('change', () => change(multiple ? [...select.selectedOptions].map(option => option.value) : nullable && !select.value ? null : select.value));
  return select;
}
function readValue(value, t) {
  if (value === null || value === undefined || value === '') return node('span', 'plan-unknown', t('Not specified', '未指定'));
  if (Array.isArray(value)) return node('span', '', value.length ? value.join(', ') : t('None', '无'));
  return node('span', '', String(value));
}
function itemTitle(item) { return item.title || item.text || item.id; }
function textSection(title, value, { editable, change, t, max = 10000 }) {
  const section = node('section', 'plan-section'); section.append(node('h2', '', title));
  section.append(editable ? labeled(title, textField(value, change, { multiline: true, max })) : node('p', 'plan-prose', value || t('Not specified', '未指定'))); return section;
}
function fieldList(title, values, t) {
  const list = node('dl', 'plan-facts');
  for (const [label, value] of values) { const row = node('div'); row.append(node('dt', '', label)); const dd = node('dd'); dd.append(readValue(value, t)); row.append(dd); list.append(row); }
  if (title) { const section = node('section', 'plan-section'); section.append(node('h3', '', title), list); return section; }
  return list;
}
function sourceLink(value) {
  try { const url = new URL(value, location.origin); if (url.username || url.password || url.protocol !== 'https:' && !(value.startsWith('/') && url.origin === location.origin)) return null; return url.href; } catch { return null; }
}
function collectionEditor(kind, plan, { editable, changed, redraw, t, subjects = [], referenceHref = reference => sourceLink(reference.url) }) {
  const [sectionName, name] = collectionPath[kind], items = plan[sectionName][name], section = node('section', 'plan-section');
  const heading = node('div', 'plan-section-heading'); heading.append(node('h2', '', t(...names[kind])));
  if (editable) heading.append(button(t('Add', '添加'), () => { items.push(newItem(kind, items.length)); changed(); redraw(); }, { name: `add-${kind}` }));
  section.append(heading); if (!items.length) section.append(node('p', 'empty-inline', t('None recorded.', '暂无记录。')));
  const recordChoices = list => list.map(item => [item.id, itemTitle(item)]);
  const people = [['', t('Unassigned', '未指派')], ...subjects.map(subject => [subject.userId, subject.name || subject.username || subject.userId])];
  const update = (item, field, value) => { item[field] = value; changed(); };
  for (const [index, item] of items.entries()) {
    const details = node('details', 'plan-record'); details.dataset.record = item.id; details.open = editable && !item.title && !item.text;
    const summary = node('summary'); summary.append(node('span', '', itemTitle(item))); if (kind === 'milestone') summary.append(node('small', '', item.priority + ' · ' + (item.commitment === 'committed' ? t('Committed', '已承诺') : t('Tentative', '暂定')))); details.append(summary);
    const body = node('div', 'plan-record-body');
    if (editable) {
      const set = (field, options = {}) => textField(item[field], value => update(item, field, value), options);
      if (['goal', 'criterion', 'question', 'decision'].includes(kind)) body.append(labeled(t('Text', '内容'), set('text', { multiline: true, required: true })));
      if (['reference', 'milestone'].includes(kind)) body.append(labeled(t('Title', '标题'), set('title', { max: 160, required: true })));
      if (['criterion', 'milestone'].includes(kind)) body.append(labeled(t('Related goals', '关联目标'), choice(item.goalIds, recordChoices(plan.prd.goals), value => update(item, 'goalIds', value), { multiple: true })));
      if (kind === 'question') {
        body.append(labeled(t('State', '状态'), choice(item.state, [['open', t('Open', '未解决')], ['resolved', t('Resolved', '已解决')]], value => update(item, 'state', value))));
        body.append(labeled(t('Recorded decision', '已记录决策'), choice(item.decisionId, [['', t('None', '无')], ...recordChoices(plan.prd.decisions)], value => update(item, 'decisionId', value), { nullable: true })));
      }
      if (['question', 'decision', 'milestone'].includes(kind)) body.append(labeled(t('Responsible account, if known', '已知负责账号'), subjects.length ? choice(item.ownerUserId, people, value => update(item, 'ownerUserId', value), { nullable: true }) : set('ownerUserId', { max: 200, nullable: true })));
      if (kind === 'decision') body.append(labeled(t('Source references', '来源引用'), choice(item.referenceIds, recordChoices(plan.prd.references), value => update(item, 'referenceIds', value), { multiple: true })));
      if (kind === 'reference') {
        body.append(labeled(t('Source type', '来源类型'), choice(item.kind, [['knowledge', t('Knowledge document', '知识文档')], ['deliverable', t('Deliverable', '交付物')]], value => update(item, 'kind', value))));
        body.append(labeled(t('Source link', '来源链接'), set('url', { max: 2048, required: true })));
        body.append(labeled(t('Source version, if known', '已知来源版本'), set('revision', { max: 160, nullable: true })));
      }
      if (kind === 'milestone') {
        body.append(labeled(t('Acceptance criteria', '验收条件'), choice(item.criterionIds, recordChoices(plan.prd.criteria), value => update(item, 'criterionIds', value), { multiple: true })));
        const grid = node('div', 'plan-form-grid');
        grid.append(labeled(t('Priority', '优先级'), choice(item.priority, ['P0', 'P1', 'P2'].map(value => [value, value]), value => update(item, 'priority', value))));
        grid.append(labeled(t('Planning state', '计划状态'), choice(item.status, [['todo', t('Not started', '待开始')], ['doing', t('In progress', '进行中')], ['review', t('In review', '待验收')], ['done', t('Done in plan', '计划中已完成')]], value => update(item, 'status', value))));
        grid.append(labeled(t('Commitment', '承诺'), choice(item.commitment, [['tentative', t('Tentative', '暂定')], ['committed', t('Committed', '已承诺')]], value => update(item, 'commitment', value))));
        grid.append(labeled(t('Planned date, if known', '已知计划日期'), set('dueDate', { type: 'date', nullable: true })));
        body.append(grid, labeled(t('Depends on', '依赖项'), choice(item.dependsOn, recordChoices(items.filter(value => value.id !== item.id)), value => update(item, 'dependsOn', value), { multiple: true })));
        const order = node('div', 'plan-actions');
        order.append(button(t('Move up', '上移'), () => { if (index) { [items[index - 1], items[index]] = [items[index], items[index - 1]]; items.forEach((value, at) => { value.order = at; }); changed(); redraw(); } }, { disabled: index === 0 }));
        order.append(button(t('Move down', '下移'), () => { if (index < items.length - 1) { [items[index + 1], items[index]] = [items[index], items[index + 1]]; items.forEach((value, at) => { value.order = at; }); changed(); redraw(); } }, { disabled: index === items.length - 1 })); body.append(order);
      }
      body.append(button(t('Remove this item', '移除此项'), () => { items.splice(index, 1); changed(); redraw(); }, { name: `remove-${kind}` }));
    } else {
      if (item.text) body.append(node('p', 'plan-prose', item.text));
      if (kind === 'reference') { const href = referenceHref(item); if (href) { const link = node('a', '', item.title); link.href = href; link.rel = 'noreferrer'; body.append(link); } body.append(fieldList('', [[t('Source version', '来源版本'), item.revision || t('Unversioned source', '未标注版本的来源')]], t)); }
      if (kind === 'criterion') body.append(fieldList('', [[t('Related goals', '关联目标'), item.goalIds.map(id => plan.prd.goals.find(goal => goal.id === id)?.text || id)]], t));
      if (kind === 'question') body.append(fieldList('', [[t('State', '状态'), item.state === 'open' ? t('Open', '未解决') : t('Resolved', '已解决')], [t('Responsible person', '负责人'), item.ownerUserId], [t('Recorded decision', '已记录决策'), plan.prd.decisions.find(value => value.id === item.decisionId)?.text]], t));
      if (kind === 'decision') body.append(fieldList('', [[t('Responsible person', '负责人'), item.ownerUserId], [t('Sources', '来源'), item.referenceIds.map(id => plan.prd.references.find(value => value.id === id)?.title || id)]], t));
      if (kind === 'milestone') {
        const states = { todo: t('Not started', '待开始'), doing: t('In progress', '进行中'), review: t('In review', '待验收'), done: t('Done in plan', '计划中已完成') };
        body.append(fieldList('', [[t('Planning state', '计划状态'), states[item.status]], [t('Responsible person', '负责人'), item.ownerUserId], [t('Planned date', '计划日期'), item.dueDate], [t('Goals', '目标'), item.goalIds.map(id => plan.prd.goals.find(value => value.id === id)?.text || id)], [t('Acceptance criteria', '验收条件'), item.criterionIds.map(id => plan.prd.criteria.find(value => value.id === id)?.text || id)], [t('Depends on', '依赖项'), item.dependsOn.map(id => items.find(value => value.id === id)?.title || id)]], t));
      }
    }
    details.append(body); section.append(details);
  }
  return section;
}
export function renderPlan(panel, plan, options) {
  const { t, editable = false, changed = () => {}, redraw = () => {} } = options, root = node('div', 'plan-document');
  if (panel === 'roadmap') { root.append(node('p', 'plan-note', t('Dates and states describe the plan. They do not certify a delivery or completed execution.', '日期和状态描述计划安排，不代表交付保证或执行验收。'))); root.append(collectionEditor('milestone', plan, options)); }
  else {
    for (const [field, en, zh] of [['problem', 'Problem', '问题'], ['scope', 'Scope', '范围'], ['outOfScope', 'Out of scope', '不做什么']]) root.append(textSection(t(en, zh), plan.prd[field], { t, editable, change: value => { plan.prd[field] = value; changed(); } }));
    for (const kind of ['goal', 'criterion', 'question', 'decision', 'reference']) root.append(collectionEditor(kind, plan, { ...options, changed, redraw }));
  }
  return root;
}

const errorCopy = {
  CONFLICT: ['The saved version changed. Your draft is retained. Refresh the comparison before continuing.', '已保存版本发生变化。草稿已保留，请更新比较后继续。'],
  STALE_REVIEW: ['The source or target changed. Refresh this review before making a decision.', '来源或目标发生变化，请更新审阅后再作决定。'],
  PLAN_CONFLICT: ['This change conflicts with the current plan. Review both versions.', '这项变更与当前计划冲突，请比较两个版本。'],
  INVALID_INPUT: ['Check the fields and try again. Your draft is retained.', '请检查字段后重试，草稿已保留。'],
  INVALID_SUBJECT: ['Use an enabled account with access to this project. Your draft is retained.', '请使用已启用且有此项目访问权的账号，草稿已保留。'],
  INVALID_REFERENCE: ['A linked goal, criterion, decision or dependency is missing. Update the related items together.', '关联目标、条件、决策或依赖不存在，请一并更新关联条目。'],
  DEPENDENCY_CYCLE: ['Dependencies form a cycle. Remove the circular relationship.', '依赖关系形成循环，请修正循环关联。'],
  PLAN_INCOMPLETE: ['A baseline needs a problem, scope, goal and acceptance criterion. Check commitments and unresolved links.', '基线须包含问题、范围、目标和验收条件，请检查承诺与未解决的关联。'],
  ROLE_REQUIRED: ['This action needs the designated role and current scoped permission.', '此操作需要指定角色及当前限定范围授权。'],
  FORBIDDEN: ['Your access changed. Protected drafts and content have been cleared.', '访问权限已变化，受保护的草稿和内容已清除。'],
  UNAUTHENTICATED: ['Your session expired. Sign in again from the workbench.', '登录已失效，请回到工作台重新登录。'],
  IDEMPOTENCY_CONFLICT: ['This intent key was already used for a different change. Check the recorded result.', '此意图键已用于其他变更，请核对已记录结果。'],
};
function displayOperation(change, t) {
  const operation = change.change || change;
  if (operation.op === 'set_prd_field') return ({ problem: t('Problem', '问题'), scope: t('Scope', '范围'), outOfScope: t('Out of scope', '不做什么') })[operation.field];
  const kind = operation.op?.replace(/^(?:upsert|remove)_/, '');
  return (operation.op?.startsWith('remove_') ? t('Remove ', '移除 ') : t('Change ', '变更 ')) + (operation.item?.title || operation.item?.text || operation.id || (names[kind] && t(...names[kind])) || t('Plan item', '计划条目'));
}
function presentValue(value, t) {
  const root = node('div', 'plan-compare-value');
  if (typeof value === 'string' || value === null || value === undefined) { root.append(readValue(value, t)); return root; }
  if (Array.isArray(value)) { const ul = node('ul'); for (const item of value) ul.append(node('li', '', typeof item === 'object' ? itemTitle(item) : String(item))); root.append(ul); return root; }
  const labels = { id: ['Item reference', '条目引用'], text: ['Text', '内容'], title: ['Title', '标题'], goalIds: ['Goals', '目标'], criterionIds: ['Acceptance criteria', '验收条件'], dependsOn: ['Dependencies', '依赖'], ownerUserId: ['Responsible person', '负责人'], dueDate: ['Planned date', '计划日期'], commitment: ['Commitment', '承诺'], priority: ['Priority', '优先级'], status: ['Planning state', '计划状态'], state: ['State', '状态'], url: ['Source link', '来源链接'], revision: ['Source version', '来源版本'], decisionId: ['Decision', '决策'], referenceIds: ['Sources', '来源'] };
  root.append(fieldList('', Object.entries(value).filter(([key]) => labels[key]).map(([key, entry]) => [t(...labels[key]), entry]), t)); return root;
}
export function createPlanning({ t, call, getRoute, navigate, onAuthError = () => {}, referenceHref = reference => sourceLink(reference.url) }) {
  let entry, snapshot, identity, activeRoot, activePanel, loading = false, stopped = false, loadGeneration = 0;
  let compare, reviewProposal, historyDetail, history, roleDraft, busy = false, feedback = '', feedbackError = false, preparing = new Set();
  const drafts = new Map(), memory = new Map();
  const storage = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return memory.get(key); } },
    set(key, value) { memory.set(key, value); try { sessionStorage.setItem(key, value); } catch {} },
    remove(key) { memory.delete(key); try { sessionStorage.removeItem(key); } catch {} },
    clear() { memory.clear(); try { for (const key of Object.keys(sessionStorage)) if (key.startsWith('projects.planning.')) sessionStorage.removeItem(key); } catch {} },
  };
  const teamName = id => ({ research: t('Research', '科研'), engineering: t('Engineering', '工程'), marketing: t('Marketing', '市场'), support: t('Support', '支持') })[id] || id;
  const proposalState = value => ({ submitted: t('Submitted', '已提交'), accepted: t('Accepted', '已接受'), rejected: t('Rejected', '已拒绝'), withdrawn: t('Withdrawn', '已撤回'), superseded: t('Superseded', '已替代'), accept: t('Accepted', '已接受'), reject: t('Rejected', '已拒绝') })[value] || t('Recorded', '已记录');
  const historyKind = value => ({ create_personal_branch: t('Personal draft created', '已创建个人草稿'), save_plan: t('Draft saved', '已保存草稿'), adopt_plan: t('Baseline adopted', '已采纳基线'), submit_proposal: t('Proposal submitted', '已提交提案'), accepted_proposal: t('Proposal accepted', '已接受提案'), accept_proposal: t('Baseline updated from proposal', '已根据提案更新基线'), rejected_proposal: t('Proposal rejected', '已拒绝提案'), withdrawn_proposal: t('Proposal withdrawn', '已撤回提案'), superseded_proposal: t('Proposal superseded', '已替代提案'), sync_plan: t('Parent context synchronized', '已同步父级上下文'), restore_plan: t('Historical plan restored as draft', '已将历史计划恢复为草稿'), set_planning_roles: t('Planning roles updated', '已更新计划角色') })[value] || t('Recorded plan change', '已记录计划变更');
  function branchName(branch) {
    if (branch.kind === 'project') return t('Project main', '项目主分支');
    if (branch.kind === 'team') return t('{0} main', '{0}主分支', teamName(branch.teamId));
    return branch.ownerUserId === identity ? t('Your draft · {0}', '你的草稿 · {0}', teamName(branch.teamId)) : t('{0} draft · {1}', '{0}的草稿 · {1}', branch.ownerUserId, teamName(branch.teamId));
  }
  const currentBranch = () => snapshot?.branches.find(branch => branch.id === (getRoute().branch || 'project'));
  function key(branch) { return identity && entry?.spaceId ? draftStorageKey(identity, entry, branch.id) : null; }
  function persist(branch, draft) { const storageKey = key(branch); if (storageKey) storage.set(storageKey, JSON.stringify(draft)); }
  function getDraft(branch) {
    if (drafts.has(branch.id)) return drafts.get(branch.id);
    let draft;
    const storageKey = key(branch), cached = storageKey && storage.get(storageKey);
    if (cached && cached.length < 4 * 1024 * 1024) { try { const value = JSON.parse(cached); if (value.branchId === branch.id && value.plan?.prd && value.plan?.roadmap && typeof value.baseRevision === 'string') draft = value; } catch {} }
    if (!draft) draft = { branchId: branch.id, baseRevision: branch.headRevision, basePlan: copy(branch.plan), plan: copy(branch.plan), dirty: false, status: 'saved', pending: null };
    if (!draft.dirty && !draft.pending && draft.baseRevision !== branch.headRevision) draft = { ...draft, baseRevision: branch.headRevision, basePlan: copy(branch.plan), plan: copy(branch.plan), status: 'saved' };
    drafts.set(branch.id, draft); return draft;
  }
  function changeDraft(branch) { const draft = getDraft(branch); draft.dirty = !same(draft.plan, draft.basePlan); draft.status = draft.dirty ? 'unsaved' : 'saved'; persist(branch, draft); updateStatus(branch); }
  function statusText(branch) {
    const draft = getDraft(branch);
    if (draft.status === 'saving') return t('Saving…', '正在保存…');
    if (draft.pending) return t('Result uncertain. Check the saved result before retrying.', '结果尚不确定，请先核对已保存结果，再决定是否重试。');
    if (draft.baseRevision !== branch.headRevision) return t('The saved version changed. Your local draft is retained.', '已保存版本发生变化，本地草稿已保留。');
    if (draft.status === 'conflict') return t('Conflict. Your draft is retained.', '存在冲突，草稿已保留。');
    return draft.dirty ? t('Unsaved draft · kept in this browser session', '未保存草稿 · 已在当前浏览器会话中保留') : t('Saved version {0}', '已保存版本 {0}', branch.headRevision);
  }
  function updateStatus(branch) {
    const value = activeRoot?.querySelector('.plan-save-status'); if (value) value.textContent = statusText(branch);
    const draft = getDraft(branch);
    for (const action of ['save-draft', 'review-adoption']) { const control = activeRoot?.querySelector(`[data-action="${action}"]`); if (control) control.disabled = busy || !draft.dirty || Boolean(draft.pending); }
    for (const action of ['compare-source', 'sync-context']) { const control = activeRoot?.querySelector(`[data-action="${action}"]`); if (control) control.disabled = busy || draft.dirty || Boolean(draft.pending); }
  }
  function validateEditor() {
    const invalid = [...(activeRoot?.querySelectorAll('input,textarea,select') || [])].find(input => !input.checkValidity());
    if (!invalid) return true;
    for (const error of activeRoot.querySelectorAll('.plan-field-error')) error.remove();
    invalid.setAttribute('aria-invalid', 'true');
    invalid.closest('.plan-field')?.append(node('small', 'plan-field-error', t('Complete this field with a valid value.', '请为此字段填写有效内容。')));
    invalid.closest('details')?.setAttribute('open', ''); invalid.focus(); return false;
  }
  function showFeedback(text, error = false) { feedback = text; feedbackError = error; renderActive(); }
  function clearProtected() {
    stopped = true; loadGeneration++; snapshot = undefined; identity = undefined; drafts.clear(); preparing.clear(); storage.clear(); compare = undefined; reviewProposal = undefined; historyDetail = undefined; history = undefined; roleDraft = undefined; feedback = ''; activeRoot?.replaceChildren();
  }
  function handleError(error, branch) {
    if (error.status === 401 || error.status === 403 && error.code !== 'ROLE_REQUIRED') { clearProtected(); onAuthError(error); return; }
    const draft = branch && getDraft(branch);
    if (draft && error.status === 409) { draft.status = 'conflict'; persist(branch, draft); }
    feedback = t(...(errorCopy[error.code] || ['Could not complete this action. Your input is retained. Try again when the connection is available.', '暂时无法完成操作，输入已保留，请在连接恢复后重试。'])); feedbackError = true;
    renderActive();
  }
  async function load({ silent = false } = {}) {
    if (!entry || stopped) return;
    const current = ++loadGeneration; loading = true;
    try {
      const next = await call('read_planning', {}, undefined, undefined, entry);
      if (current !== loadGeneration || stopped) return;
      if (!Array.isArray(next.branches) || !next.actor || !next.capabilities) throw new Error('Invalid planning response.');
      const nextIdentity = next.actor.userId;
      const previousIdentity = identity || storage.get('projects.planning.active-identity');
      if (previousIdentity && previousIdentity !== nextIdentity) { drafts.clear(); preparing.clear(); storage.clear(); compare = undefined; reviewProposal = undefined; historyDetail = undefined; roleDraft = undefined; }
      if (nextIdentity) storage.set('projects.planning.active-identity', nextIdentity);
      identity = nextIdentity; snapshot = next;
      if (silent && history?.items?.length > (next.history?.items?.length || 0)) {
        const combined = new Map([...next.history.items, ...history.items].map(item => [item.id, item]));
        history = { items: [...combined.values()].sort((a, b) => b.cursor - a.cursor), nextCursor: history.nextCursor };
      } else history = next.history;
      for (const branch of next.branches) {
        const draft = drafts.get(branch.id);
        if (draft && !branch.permissions.edit && !branch.permissions.adopt) { storage.remove(key(branch)); drafts.delete(branch.id); preparing.delete(branch.id); continue; }
        if (draft && !draft.dirty && !draft.pending) drafts.set(branch.id, { branchId: branch.id, baseRevision: branch.headRevision, basePlan: copy(branch.plan), plan: copy(branch.plan), dirty: false, status: 'saved', pending: null });
      }
      if (reviewProposal) reviewProposal = next.proposals.find(value => value.id === reviewProposal.id) || reviewProposal;
      if (!silent || !activeRoot?.contains(document.activeElement) || !currentBranch()) renderActive();
      else updateStatus(currentBranch());
    } catch (error) { if (current === loadGeneration) handleError(error); }
    finally { if (current === loadGeneration) { loading = false; if (!snapshot) renderActive(); } }
  }
  async function setContext(nextEntry, { silent = false } = {}) {
    const changed = !entry || entry.resourceId !== nextEntry.resourceId || entry.spaceId !== nextEntry.spaceId;
    if (changed) { snapshot = undefined; compare = undefined; reviewProposal = undefined; historyDetail = undefined; roleDraft = undefined; drafts.clear(); preparing.clear(); feedback = ''; }
    entry = { ...nextEntry }; stopped = false; await load({ silent });
  }
  async function mutate(operation, input, expectedRevision, { branch = currentBranch(), intent, after } = {}) {
    if (busy || stopped) return;
    const draft = branch && getDraft(branch), request = intent || { operation, input: copy(input), expectedRevision, key: crypto.randomUUID() };
    if (draft) { draft.pending = request; draft.status = 'saving'; persist(branch, draft); }
    busy = true; feedback = t('Working…', '正在处理…'); feedbackError = false; renderActive();
    let acknowledged = false;
    try {
      const result = await call(request.operation, request.input, request.expectedRevision, request.key, entry);
      if (stopped) return;
      acknowledged = true;
      if (result.versionId) {
        const recorded = await call('read_plan_version', { versionId: result.versionId }, undefined, undefined, entry);
        if (recorded.version?.versionId !== result.versionId) throw new Error('Saved version readback was not confirmed.');
      }
      if (draft) { draft.pending = null; draft.dirty = false; storage.remove(key(branch)); drafts.delete(branch.id); }
      feedback = t('Change saved. Reading back the recorded version.', '变更已保存，正在回读记录的版本。'); feedbackError = false;
      if (operation === 'set_planning_roles') roleDraft = undefined;
      compare = undefined; reviewProposal = undefined; historyDetail = undefined; if (branch) preparing.delete(branch.id);
      await load();
      if (after) await after(result);
      feedback = t('Saved and read back.', '已保存并回读。');
    } catch (error) {
      if (draft) {
        if (error.status && !acknowledged) { draft.pending = null; draft.status = error.status === 409 ? 'conflict' : 'unsaved'; }
        else draft.status = 'uncertain';
        persist(branch, draft);
      }
      handleError(error, branch);
    } finally { busy = false; renderActive(); }
  }
  async function recover(branch) {
    const draft = getDraft(branch), pending = draft.pending; if (!pending || busy) return;
    busy = true; renderActive();
    try {
      const receipt = await call('read_planning_receipt', { key: pending.key }, undefined, undefined, entry);
      if (receipt.found) {
        if (receipt.receipt?.versionId) { const result = await call('read_plan_version', { versionId: receipt.receipt.versionId }, undefined, undefined, entry); if (result.version?.versionId !== receipt.receipt.versionId) throw new Error('Saved version readback was not confirmed.'); }
        draft.pending = null; draft.dirty = false; storage.remove(key(branch)); drafts.delete(branch.id); await load(); feedback = t('The recorded result was found and read back.', '已找到并回读记录的结果。');
      }
      else { await load({ silent: true }); feedback = t('No committed result was found. You can retry this same intent.', '未发现已提交结果，可以重试同一意图。'); }
    } catch (error) { handleError(error, branch); }
    finally { busy = false; renderActive(); }
  }
  function scopeHeader(root, branch) {
    const context = node('div', 'plan-context');
    const selector = choice(branch?.id || '', (snapshot?.branches || []).map(value => [value.id, branchName(value)]), id => { compare = undefined; reviewProposal = undefined; historyDetail = undefined; navigate({ branch: id, view: activePanel || 'prd', proposal: null, version: null }); }); selector.id = 'branch-select';
    context.append(labeled(t('Plan branch', '计划分支'), selector));
    if (branch) {
      const details = node('div', 'plan-context-meta'); details.append(node('span', '', branch.kind === 'personal' ? t('Personal draft · {0}', '个人草稿 · {0}', branch.ownerUserId) : branch.adopted ? t('Accepted baseline', '已采纳基线') : t('Not adopted', '未采纳')));
      details.append(node('span', '', t('Version {0}', '版本 {0}', branch.headRevision)));
      details.append(node('span', '', branch.permissions.accept ? t('You have decision authority for this target.', '你具有此目标的决策权限。') : branch.permissions.edit ? t('You can edit this personal draft.', '你可以编辑此个人草稿。') : t('Reading access · no decision authority for this target', '可阅读 · 没有此目标的决策权限')));
      if (branch.parentBranchId) details.append(node('span', '', t('Parent context {0} · current {1}', '父级上下文 {0} · 当前 {1}', branch.parentRevision ?? t('Unknown', '未知'), branch.currentParentRevision ?? t('Unknown', '未知'))));
      context.append(details);
    }
    root.append(context);
  }
  function draftTools(root, branch) {
    const permissions = branch.permissions, draft = getDraft(branch), editable = permissions.edit || preparing.has(branch.id);
    const tools = node('div', 'plan-toolbar');
    const state = node('p', 'plan-save-status', statusText(branch)); state.setAttribute('role', 'status'); tools.append(state);
    const actions = node('div', 'plan-actions');
    if (draft.pending) {
      actions.append(button(t('Check saved result', '核对已保存结果'), () => void recover(branch), { disabled: busy, name: 'check-result' }));
      actions.append(button(t('Retry the same intent', '重试同一意图'), () => void mutate('', {}, '', { branch, intent: draft.pending }), { disabled: busy, name: 'retry-intent' }));
    } else {
      if (permissions.edit) actions.append(button(t('Save draft', '保存草稿'), () => { if (validateEditor()) void mutate('save_plan', { branchId: branch.id, changes: planChanges(draft.basePlan, draft.plan) }, draft.baseRevision); }, { primary: true, disabled: busy || !draft.dirty, name: 'save-draft' }));
      if (permissions.adopt && !branch.adopted) {
        if (!preparing.has(branch.id)) actions.append(button(t('Prepare initial baseline', '准备初始基线'), () => { preparing.add(branch.id); renderActive(); }, { name: 'prepare-baseline' }));
        else actions.append(button(t('Review initial baseline', '审阅初始基线'), () => { if (validateEditor()) reviewAdoption(branch); }, { primary: true, disabled: busy || !draft.dirty, name: 'review-adoption' }));
      }
      if (editable && draft.dirty) actions.append(button(t('Discard local changes', '放弃本地变更'), () => { if (!confirm(t('Discard the unsaved changes in this draft?', '放弃此草稿中未保存的变更？'))) return; storage.remove(key(branch)); drafts.delete(branch.id); preparing.delete(branch.id); renderActive(); }, { disabled: busy, name: 'discard-draft' }));
      if (draft.dirty && (draft.status === 'conflict' || draft.baseRevision !== branch.headRevision)) actions.append(button(t('Review latest saved version', '审阅最新保存版本'), async () => { await load({ silent: true }); const latest = currentBranch(); if (!latest) return; const local = getDraft(latest); compare = { localDraft: true, source: { branchId: latest.id, revision: local.baseRevision }, target: { branchId: latest.id, capturedRevision: local.baseRevision, currentRevision: latest.headRevision }, changes: compareLocalDraft(local.basePlan, latest.plan, local.plan), conflicts: [], impacts: [] }; renderActive(); }, { disabled: busy, name: 'review-local-conflict' }));
      if (permissions.submit) actions.append(button(t('Compare and propose', '比较并提出变更'), () => void compareSource(branch), { disabled: busy || draft.dirty, name: 'compare-source' }));
      if (permissions.sync && branch.parentBranchId) actions.append(button(t('Sync parent context', '同步父级上下文'), () => void compareSource(branch, true), { disabled: busy || draft.dirty, name: 'sync-context' }));
    }
    tools.append(actions); root.append(tools);
    const teams = snapshot.branches.filter(value => value.kind === 'team' && value.permissions.createPersonal);
    if (teams.length && branch.kind !== 'personal') {
      const create = node('div', 'plan-create'); let team = branch.teamId && teams.some(value => value.teamId === branch.teamId) ? branch.teamId : teams[0].teamId;
      create.append(labeled(t('Draft in team', '在团队下起草'), choice(team, teams.map(value => [value.teamId, teamName(value.teamId)]), value => { team = value; })));
      create.append(button(t('Open your personal draft', '打开你的个人草稿'), () => { const parent = teams.find(value => value.teamId === team); void mutate('create_personal_branch', { teamId: team }, parent.headRevision, { branch: parent, after: result => navigate({ branch: result.branchId, view: 'prd', proposal: null, version: null }) }); }, { disabled: busy, name: 'create-personal' })); root.append(create);
    }
    if (!editable && !permissions.adopt) root.append(node('p', 'plan-note', t('This baseline is read-only. Changes use an authorized personal or team proposal. Decision authority is assigned separately from write access.', '此基线为只读。变更须通过获授权的个人或团队提案，决策角色与普通写入授权分别分配。')));
  }
  function reviewAdoption(branch) {
    reviewProposal = undefined; compare = { adoption: true, source: { branchId: branch.id, revision: branch.headRevision }, target: { branchId: branch.id, capturedRevision: branch.headRevision, currentRevision: branch.headRevision }, changes: planChanges(getDraft(branch).basePlan, getDraft(branch).plan).map((change, index) => ({ id: String(index), change, base: null, current: null, proposed: change.value ?? change.item ?? null, conflict: false })), conflicts: [], impacts: [] }; renderActive();
  }
  async function compareSource(branch, sync = false) {
    if (busy) return; busy = true; feedback = ''; renderActive();
    try {
      const targetBranchId = branch.kind === 'team' ? 'project' : branch.parentBranchId;
      compare = await call('compare_plan', { sourceBranchId: branch.id, targetBranchId }, undefined, undefined, entry);
      compare.sync = sync; reviewProposal = undefined; renderActive();
    } catch (error) { handleError(error, branch); }
    finally { busy = false; renderActive(); }
  }
  function renderComparison(root, branch) {
    const section = node('section', 'plan-comparison'); section.append(node('h2', '', compare.adoption ? t('Initial baseline review', '初始基线审阅') : compare.sync ? t('Parent context comparison', '父级上下文比较') : t('Review proposed changes', '审阅拟议变更')));
    section.append(fieldList('', [[t('Source branch', '来源分支'), compare.source.branchId], [t('Source version', '来源版本'), compare.source.revision], [t('Captured target', '记录的目标版本'), compare.target.capturedRevision], [t('Current target', '当前目标版本'), compare.target.currentRevision]], t));
    const sourceNow = snapshot.branches.find(value => value.id === compare.source.branchId), targetNow = snapshot.branches.find(value => value.id === compare.target.branchId);
    const reviewChanged = !compare.localDraft && (sourceNow?.headRevision !== compare.source.revision || targetNow?.headRevision !== compare.target.currentRevision);
    if (reviewChanged) {
      section.append(message(t('A newer source or target is available. Refresh this comparison before continuing.', '来源或目标已有新版本，请更新比较后继续。'), 'alert'));
      section.append(button(t('Refresh comparison', '更新比较'), () => reviewProposal ? void openProposal(reviewProposal) : void compareSource(branch, compare.sync), { name: 'refresh-comparison', disabled: busy }));
    }
    compare.selected ||= compare.changes.map(change => change.id); compare.resolutions ||= []; compare.form ||= { purpose: '', impact: '', reason: '' };
    const selected = new Map(), resolutions = compare.resolutions;
    if (!compare.changes.length) section.append(message(t('There are no changes to propose.', '没有可提交的变更。')));
    for (const change of compare.changes) {
      const detail = node('details', 'plan-change'); detail.open = Boolean(change.conflict); detail.dataset.change = change.id;
      const summary = node('summary', '', displayOperation(change, t)); if (change.conflict) summary.append(node('strong', 'plan-conflict', t('Conflict', '冲突'))); detail.append(summary);
      const body = node('div', 'plan-change-body');
      if (compare.source.kind === 'team' && !compare.sync && !reviewProposal) {
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = compare.selected.includes(change.id); if (checkbox.checked) selected.set(change.id, change.change);
        checkbox.addEventListener('change', () => { if (checkbox.checked) { selected.set(change.id, change.change); compare.selected.push(change.id); } else { selected.delete(change.id); compare.selected = compare.selected.filter(id => id !== change.id); } }); body.append(labeled(t('Include in project proposal', '纳入项目提案'), checkbox));
      } else selected.set(change.id, change.change);
      const grid = node('div', 'plan-comparison-grid');
      for (const [label, value] of [[t('Base', '基线'), change.base], [t('Current target', '当前目标'), change.current], [t('Proposed', '拟议值'), change.proposed]]) { const cell = node('section'); cell.append(node('h3', '', label), presentValue(value, t)); grid.append(cell); }
      body.append(grid);
      if ((compare.sync || compare.localDraft) && change.conflict) {
        let resolution = resolutions.find(value => value.key === change.id); if (!resolution) { resolution = { key: change.id, choice: 'current', reason: '' }; resolutions.push(resolution); }
        body.append(labeled(t('Resolve with', '采用'), choice(resolution.choice, [['base', t('Base', '基线')], ['current', t('Current target', '当前目标')], ['proposed', t('Your proposed version', '你的拟议版本')]], value => { resolution.choice = value; })));
        body.append(labeled(t('Resolution reason', '解决原因'), textField(resolution.reason, value => { resolution.reason = value; }, { multiline: true, required: true })));
      }
      detail.append(body); section.append(detail);
    }
    if (compare.impacts?.length) section.append(fieldList(t('Impact', '影响'), compare.impacts.map((impact, index) => [String(index + 1), typeof impact === 'string' ? impact : impact.message || impact.label || t('Related plan items changed.', '关联计划条目发生变化。')]), t));
    const actions = node('div', 'plan-actions'); actions.append(button(t('Back to plan', '返回计划'), () => { compare = undefined; reviewProposal = undefined; renderActive(); }, { name: 'close-comparison' }));
    if (compare.adoption) {
      section.append(labeled(t('Adoption reason', '采纳原因'), textField(compare.form.reason, value => { compare.form.reason = value; }, { multiline: true, required: true })));
      actions.append(button(t('Adopt this initial baseline', '采纳此初始基线'), () => { if (validateEditor()) void mutate('adopt_plan', { branchId: branch.id, changes: compare.changes.map(value => value.change), reason: compare.form.reason }, compare.target.currentRevision); }, { primary: true, disabled: busy || reviewChanged, name: 'adopt-plan' }));
    } else if (compare.localDraft) {
      actions.append(button(t('Keep reviewed draft', '保留审阅后的草稿'), () => {
        if (!validateEditor()) return;
        const changes = compare.changes.filter(change => !change.conflict || resolutions.find(value => value.key === change.id)?.choice === 'proposed').map(change => change.change);
        for (const change of compare.changes.filter(value => value.conflict && resolutions.find(item => item.key === value.id)?.choice === 'base')) {
          const operation = copy(change.change);
          if (operation.op === 'set_prd_field') operation.value = change.base;
          else if (change.base) { operation.op = operation.op.replace(/^remove_/, 'upsert_'); operation.item = copy(change.base); delete operation.id; }
          else { operation.op = operation.op.replace(/^upsert_/, 'remove_'); operation.id = operation.item.id; delete operation.item; }
          changes.push(operation);
        }
        const draft = getDraft(branch); draft.baseRevision = branch.headRevision; draft.basePlan = copy(branch.plan); draft.plan = applyPlanChanges(branch.plan, changes); draft.dirty = !same(draft.plan, draft.basePlan); draft.status = 'unsaved'; draft.localResolutions = copy(resolutions); persist(branch, draft); compare = undefined; renderActive();
      }, { primary: true, disabled: busy, name: 'keep-reviewed-draft' }));
    } else if (compare.sync) {
      actions.append(button(t('Save context resolution', '保存上下文解决结果'), () => { if (validateEditor()) void mutate('sync_plan', { branchId: branch.id, targetRevision: compare.target.currentRevision, resolutions }, branch.headRevision); }, { primary: true, disabled: busy, name: 'save-resolution' }));
    } else if (reviewProposal) renderDecision(section, actions, reviewProposal);
    else {
      section.append(labeled(t('Purpose of the change', '变更目的'), textField(compare.form.purpose, value => { compare.form.purpose = value; }, { multiline: true, required: true })), labeled(t('Impact and unresolved questions', '影响与未决问题'), textField(compare.form.impact, value => { compare.form.impact = value; }, { multiline: true, required: true })));
      compare.evidence ||= [];
      if (branch.plan.prd.references.length) {
        const sources = node('fieldset', 'plan-evidence'); sources.append(node('legend', '', t('Source evidence', '来源依据')));
        for (const reference of branch.plan.prd.references) {
          const input = document.createElement('input'); input.type = 'checkbox'; input.checked = compare.evidence.includes(reference.id);
          input.addEventListener('change', () => { compare.evidence = input.checked ? [...compare.evidence, reference.id] : compare.evidence.filter(id => id !== reference.id); });
          sources.append(labeled(reference.title + (reference.revision ? ` · ${reference.revision}` : t(' · Unversioned source', ' · 未标注版本的来源')), input));
        }
        section.append(sources);
      }
      actions.append(button(t('Submit proposal', '提交提案'), () => { if (validateEditor()) void mutate('submit_proposal', { sourceBranchId: branch.id, targetBranchId: compare.target.branchId, targetRevision: compare.target.currentRevision, changes: [...selected.values()], purpose: compare.form.purpose, impact: compare.form.impact, evidence: branch.plan.prd.references.filter(value => compare.evidence.includes(value.id)), ...(getRoute().predecessor ? { predecessorId: getRoute().predecessor } : {}) }, compare.source.revision, { after: result => navigate({ view: 'proposals', proposal: result.proposalId, predecessor: null }) }); }, { primary: true, disabled: busy || reviewChanged || !compare.changes.length, name: 'submit-proposal' }));
    }
    section.append(actions); root.append(section);
  }
  function renderDecision(section, actions, proposal) {
    const source = snapshot.branches.find(value => value.id === proposal.sourceBranchId), target = snapshot.branches.find(value => value.id === proposal.targetBranchId);
    const reviewStale = proposal.stale || source && source.headRevision !== compare.source.revision || target && target.headRevision !== compare.target.currentRevision;
    section.append(fieldList('', [[t('Purpose', '目的'), proposal.purpose], [t('Impact and questions', '影响与问题'), proposal.impact], [t('Author', '作者'), proposal.authorUserId], [t('State', '状态'), proposalState(proposal.status)]], t));
    if (proposal.stale) section.append(message(t('This review is stale. Recompare and submit a new version before acceptance.', '此审阅已过期，须重新比较并提交新版本后再接受。'), 'alert'));
    if (proposal.decision) section.append(fieldList(t('Recorded decision', '已记录决策'), [[t('Result', '结果'), proposalState(proposal.decision.result)], [t('Reason', '原因'), proposal.decision.reason], [t('Decision-maker', '决策者'), proposal.decision.actor?.userId]], t));
    if (proposal.evidence?.length) {
      const evidence = node('section', 'plan-section'); evidence.append(node('h3', '', t('Submitted evidence', '已提交依据')));
      for (const source of proposal.evidence) { const row = node('p', 'plan-note'), href = referenceHref(source); if (href) { const link = node('a', '', source.title); link.href = href; link.rel = 'noreferrer'; row.append(link); } else row.append(node('span', '', source.title)); row.append(node('span', '', source.revision ? ` · ${source.revision}` : t(' · Unversioned source', ' · 未标注版本的来源'))); evidence.append(row); }
      section.append(evidence);
    }
    compare.form ||= { reason: '' };
    if (proposal.status === 'submitted' && (proposal.permissions.accept || proposal.permissions.reject || proposal.permissions.withdraw)) {
      section.append(labeled(t('Decision or withdrawal reason', '决策或撤回原因'), textField(compare.form.reason, value => { compare.form.reason = value; }, { multiline: true, required: true })));
      for (const [decision, en, zh] of [['accept', 'Accept proposal', '接受提案'], ['reject', 'Reject proposal', '拒绝提案']]) if (proposal.permissions[decision]) actions.append(button(t(en, zh), () => { if (validateEditor()) void mutate('decide_proposal', { proposalId: proposal.id, decision, reason: compare.form.reason, sourceRevision: compare.source.revision, targetRevision: compare.target.currentRevision }, proposal.revision); }, { primary: decision === 'accept', disabled: busy || decision === 'accept' && reviewStale, name: `${decision}-proposal` }));
      if (proposal.permissions.withdraw) actions.append(button(t('Withdraw proposal', '撤回提案'), () => { if (validateEditor()) void mutate('withdraw_proposal', { proposalId: proposal.id, reason: compare.form.reason }, proposal.revision); }, { disabled: busy, name: 'withdraw-proposal' }));
    }
    if (source?.permissions.submit) actions.append(button(t('Continue this branch', '沿用此分支继续'), () => { compare = undefined; reviewProposal = undefined; navigate({ branch: source.id, view: 'prd', proposal: null, predecessor: proposal.id }); }, { name: 'continue-branch' }));
  }
  async function openProposal(proposal) {
    if (busy) return; busy = true; renderActive();
    try { compare = await call('compare_plan', { proposalId: proposal.id }, undefined, undefined, entry); reviewProposal = proposal; renderActive(); }
    catch (error) { handleError(error); }
    finally { busy = false; renderActive(); }
  }
  function renderProposals(root) {
    root.append(node('h2', '', t('Proposals', '提案')));
    const statuses = { submitted: t('Submitted', '已提交'), accepted: t('Accepted', '已接受'), rejected: t('Rejected', '已拒绝'), withdrawn: t('Withdrawn', '已撤回'), superseded: t('Superseded', '已替代') };
    if (!snapshot.proposals.length) root.append(node('p', 'empty-inline', t('No proposals recorded.', '暂无提案记录。')));
    const list = node('div', 'plan-proposal-list');
    for (const proposal of snapshot.proposals) {
      const row = node('article', 'plan-proposal-row'); row.dataset.proposal = proposal.id;
      const source = snapshot.branches.find(value => value.id === proposal.sourceBranchId), target = snapshot.branches.find(value => value.id === proposal.targetBranchId);
      row.append(node('h3', '', proposal.purpose), node('p', 'plan-note', `${source ? branchName(source) : proposal.sourceBranchId} → ${target ? branchName(target) : proposal.targetBranchId}`), node('p', '', statuses[proposal.status] + (proposal.stale ? t(' · Review stale', ' · 审阅已过期') : '')));
      row.append(button(t('Review proposal', '审阅提案'), () => { navigate({ view: 'proposals', proposal: proposal.id }); void openProposal(proposal); }, { name: 'review-proposal', disabled: busy })); list.append(row);
    }
    root.append(list);
  }
  async function openVersion(versionId) {
    if (busy) return; busy = true; renderActive();
    try { const result = await call('read_plan_version', { versionId }, undefined, undefined, entry); historyDetail = result.version; renderActive(); }
    catch (error) { handleError(error); }
    finally { busy = false; renderActive(); }
  }
  function renderHistory(root) {
    root.append(node('h2', '', t('Plan history', '计划历史')));
    if (historyDetail) {
      root.append(fieldList('', [[t('Original branch', '原始分支'), historyDetail.branchId], [t('Version', '版本'), historyDetail.revision], [t('Actor', '操作者'), historyDetail.actor?.userId], [t('Reason', '原因'), historyDetail.reason], [t('Recorded at', '记录时间'), historyDetail.at]], t));
      const tabs = node('div', 'plan-actions'); let panel = 'prd'; const body = node('div');
      const show = () => body.replaceChildren(renderPlan(panel, historyDetail.plan, { t, editable: false, referenceHref }));
      tabs.append(button(t('PRD', 'PRD'), () => { panel = 'prd'; show(); }), button(t('Roadmap', '路线图'), () => { panel = 'roadmap'; show(); }));
      tabs.append(button(t('Back to history', '返回历史'), () => { historyDetail = undefined; navigate({ view: 'history', version: null }); renderActive(); }, { name: 'close-version' }));
      root.append(tabs, body); show();
      const eligible = snapshot.branches.filter(branch => branch.kind === 'personal' && branch.ownerUserId === identity && branch.permissions.restore);
      if (eligible.length) {
        const section = node('section', 'plan-section'); section.append(node('h3', '', t('Restore into a personal draft', '恢复至个人草稿')), node('p', 'plan-note', t('This creates a new draft version. Accepted plans, decisions and execution records remain unchanged.', '这会创建新的草稿版本，不改变已接受计划、决策或执行记录。')));
        let selected = eligible[0].id, reason = '';
        section.append(labeled(t('Your target draft', '你的目标草稿'), choice(selected, eligible.map(branch => [branch.id, branchName(branch)]), value => { selected = value; })), labeled(t('Restoration reason', '恢复原因'), textField('', value => { reason = value; }, { multiline: true })));
        section.append(button(t('Restore as new draft version', '恢复为新的草稿版本'), () => { const branch = eligible.find(value => value.id === selected); void mutate('restore_plan', { branchId: selected, versionId: historyDetail.versionId, reason }, branch.headRevision, { branch, after: () => navigate({ branch: selected, view: 'prd', version: null }) }); }, { disabled: busy, name: 'restore-version' })); root.append(section);
      }
      return;
    }
    const items = history?.items || [];
    if (!items.length) root.append(node('p', 'empty-inline', t('No recorded plan history.', '暂无已记录的计划历史。')));
    for (const event of items) {
      const row = node('article', 'plan-history-row'); row.append(node('h3', '', event.reason || historyKind(event.kind)), node('p', 'plan-note', [historyKind(event.kind), event.actor?.userId, event.at].filter(Boolean).join(' · ')));
      if (event.versionId) row.append(button(t('Read original version', '阅读原始版本'), () => { navigate({ view: 'history', version: event.versionId }); void openVersion(event.versionId); }, { disabled: busy, name: 'read-version' }));
      else row.append(node('p', 'plan-note', t('No immutable plan version is attached to this record.', '此记录未附带不可变计划版本。')));
      root.append(row);
    }
    if (history?.nextCursor !== null && history?.nextCursor !== undefined) root.append(button(t('Load earlier history', '加载更早历史'), async () => { if (busy) return; busy = true; renderActive(); try { const next = await call('read_plan_history', { before: history.nextCursor, limit: 25 }, undefined, undefined, entry); history = { items: [...items, ...next.items], nextCursor: next.nextCursor }; } catch (error) { handleError(error); } finally { busy = false; renderActive(); } }, { disabled: busy, name: 'more-history' }));
  }
  function renderRoles(root) {
    if (!snapshot.capabilities.rolesManage) return;
    const details = node('details', 'plan-roles'); details.append(node('summary', '', t('Planning roles', '计划角色')));
    const body = node('div', 'plan-record-body'); body.append(node('p', 'plan-note', t('Assign enabled accounts that already have access to this project. A role also needs the corresponding current grants. Global permissions remain in Settings.', '仅分配已启用且有此项目访问权的账号。角色还须具备对应的当前授权，全局权限仍在设置中管理。')));
    roleDraft ||= copy(snapshot.roleAssignments || []);
    const assignments = roleDraft, originals = new Set((snapshot.roleAssignments || []).map(value => value.userId)), rows = node('div');
    function renderRows() {
      rows.replaceChildren();
      for (const [index, assignment] of assignments.entries()) {
        const fieldset = node('fieldset', 'plan-role-row'); fieldset.append(node('legend', '', t('Role mapping {0}', '角色映射 {0}', index + 1)));
        fieldset.append(labeled(t('Enabled account ID', '已启用账号 ID'), textField(assignment.userId, value => { assignment.userId = value; }, { max: 200, required: true })));
        const projectDecision = document.createElement('input'); projectDecision.type = 'checkbox'; projectDecision.checked = assignment.projectDecision; projectDecision.addEventListener('change', () => { assignment.projectDecision = projectDecision.checked; }); fieldset.append(labeled(t('Project decision-maker', '项目决策者'), projectDecision));
        fieldset.append(labeled(t('Team decision roles', '团队决策角色'), choice(assignment.teamDecision, TEAM_IDS.map(id => [id, teamName(id)]), value => { assignment.teamDecision = value; }, { multiple: true })));
        fieldset.append(labeled(t('Team participation', '团队参与关系'), choice(assignment.teams, TEAM_IDS.map(id => [id, teamName(id)]), value => { assignment.teams = value; }, { multiple: true })));
        fieldset.append(button(t('Remove mapping', '移除此映射'), () => { assignments.splice(index, 1); renderRows(); }, { name: 'remove-role' })); rows.append(fieldset);
      }
    }
    renderRows(); body.append(rows); const actions = node('div', 'plan-actions');
    actions.append(button(t('Add account mapping', '添加账号映射'), () => { assignments.push({ userId: '', projectDecision: false, teamDecision: [], teams: [] }); renderRows(); }, { name: 'add-role' }));
    actions.append(button(t('Save role assignments', '保存角色分配'), () => { if (validateEditor()) void mutate('set_planning_roles', { assignments, removeUserIds: [...originals].filter(userId => !assignments.some(item => item.userId === userId)) }, snapshot.rolesRevision); }, { primary: true, disabled: busy, name: 'save-roles' })); body.append(actions); details.append(body); root.append(details);
  }
  function render(root, panel) {
    activeRoot = root; activePanel = panel; root.replaceChildren();
    if (!snapshot) { root.append(message(loading ? t('Loading plans…', '正在读取计划…') : feedback || t('Planning is currently unavailable.', '计划暂时无法读取。'))); if (!loading && !stopped) root.append(button(t('Retry', '重新读取'), () => void load())); return; }
    const branch = currentBranch(); scopeHeader(root, branch);
    if (!branch) { root.append(message(t('This branch is missing or outside your access.', '此分支不存在或不在当前访问范围内。'))); return; }
    if (feedback) root.append(message(feedback, feedbackError ? 'alert' : 'status'));
    if (busy) root.setAttribute('aria-busy', 'true'); else root.removeAttribute('aria-busy');
    if (compare) renderComparison(root, branch);
    else if (panel === 'proposals') renderProposals(root);
    else if (panel === 'history') renderHistory(root);
    else {
      draftTools(root, branch); const draft = getDraft(branch), editable = !busy && !draft.pending && (branch.permissions.edit || preparing.has(branch.id));
      root.append(renderPlan(panel, editable ? draft.plan : branch.plan, { t, editable, referenceHref, subjects: snapshot.subjects || [], changed: () => changeDraft(branch), redraw: renderActive }));
    }
    renderRoles(root);
  }
  function renderActive() { if (activeRoot?.isConnected) { const scroll = window.scrollY; render(activeRoot, activePanel); window.scrollTo({ top: scroll, behavior: 'instant' }); } }
  function leave() { activeRoot = undefined; activePanel = undefined; compare = undefined; reviewProposal = undefined; }
  async function routeChanged() {
    const route = getRoute();
    if (route.proposal && snapshot && !reviewProposal) { const proposal = snapshot.proposals.find(value => value.id === route.proposal); if (proposal) await openProposal(proposal); }
    if (route.version && !historyDetail) await openVersion(route.version);
  }
  return { setContext, load, render, leave, clearProtected, routeChanged, get snapshot() { return snapshot; }, get busy() { return busy; } };
}
