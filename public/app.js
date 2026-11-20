import { createPlanning } from './planning.js';
const language = localStorage.getItem('praxis.locale') === 'zh' ? 'zh-CN' : 'en';
function t(english, chinese, ...values) {
  return (language === 'en' ? english : chinese).replace(/\{(\d+)\}/g, (_, index) => String(values[index]));
}
document.documentElement.lang = language;
if (language === 'zh-CN') {
  for (const node of document.querySelectorAll('[data-zh]')) node.textContent = node.dataset.zh;
  for (const node of document.querySelectorAll('[data-zh-label]')) node.setAttribute('aria-label', node.dataset.zhLabel);
}
const languageButton = document.querySelector('#language');
if (languageButton) {
  languageButton.textContent = t('简体中文', 'English');
  languageButton.addEventListener('click', () => {
    const next = language === 'en' ? 'zh' : 'en';
    localStorage.setItem('praxis.locale', next);
    document.cookie = 'praxis_locale=' + next + '; Path=/; SameSite=Lax; Max-Age=31536000' + (location.protocol === 'https:' ? '; Secure' : '');
    location.reload();
  });
}

const VIEWS = [
  ['prd', 'PRD', '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h8"/>'],
  ['roadmap', t('Roadmap', '路线图'), '<path d="M5 4v16M5 6h14l-3 4H5m0 4h11l-3 4H5"/>'],
  ['proposals', t('Proposals', '提案'), '<path d="M4 5h12v14H4zM8 9h12m-3-3 3 3-3 3M8 15h5"/>'],
  ['history', t('History', '历史'), '<path d="M4 10a8 8 0 1 1 1 9M4 4v6h6m2-3v5l3 2"/>'],
  ['overview', t("Overview", "概览"), '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
  ['research', t("Research", "科研"), '<path d="M9 3h6M10 3v6l-6 10a1.4 1.4 0 0 0 1.2 2h13.6a1.4 1.4 0 0 0 1.2-2L14 9V3M7 15h10"/>'],
  ['engineering', t("Engineering", "工程"), '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>'],
  ['marketing', t("Marketing", "市场"), '<path d="m4 9 12-5v16L4 15V9Zm12-1 4-2v12l-4-2M6 16l1 5h3l-1-4"/>'],
  ['support', t("Support", "支持"), '<path d="M4 13v-1a8 8 0 0 1 16 0v1M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3Zm0 6v1a2 2 0 0 1-2 2h-5"/>'],
  ['knowledge', t("References", "资料"), '<path d="M3 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H3V4Zm18 0h-5a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h4V4Z"/>'],
];
const PLANNING_VIEWS = new Set(['prd', 'roadmap', 'proposals', 'history']);
const DOMAIN_NAMES = Object.fromEntries(VIEWS.filter(([id]) => ['research', 'engineering', 'marketing', 'support'].includes(id)).map(([id, name]) => [id, name]));
const STATUS_NAMES = { todo: t("Not started", "待开始"), doing: t("In progress", "进行中"), review: t("In review", "待验收"), done: t("Completed", "已完成") };
const PROJECT_STATUS_NAMES = { active: t("In progress", "进行中"), paused: t("Paused", "已暂停"), completed: t("Completed", "已完成") };
const ERROR_NAMES = { FORBIDDEN: t("You do not have access to this project.", "你目前没有这个项目的访问权限。"), UNAUTHENTICATED: t("Your session expired. Sign in again from the workbench.", "登录已失效，请回到工作台重新登录。"), NOT_FOUND: t("This project is missing or no longer accessible.", "项目不存在或已无法访问。"), APP_UNAVAILABLE: t("Could not load this project. Try again later.", "暂时无法读取项目，请稍后重试。") };
const base = new URL('./', import.meta.url);
const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
const content = document.querySelector('#project-content');
const picker = document.querySelector('#project-select');
const navigation = document.querySelector('#navigation');
let config, csrfToken, entries = [], project, selected, generation = 0, requestController;
let refreshing = false, stopped = false, navigationState = 'ready';
const planning = createPlanning({ t, call: planningCall, getRoute: route, navigate: planningNavigate, onAuthError: showError, referenceHref: referenceLink });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function appState(value) {
  navigationState = value;
  document.dispatchEvent(new CustomEvent('praxis-navigation-state', { detail: { state: value } }));
}
function key(entry) { return `${entry.spaceId || ''}:${entry.resourceId}`; }
function route() {
  const params = new URLSearchParams(location.hash.slice(1));
  return { projectId: params.get('project'), spaceId: params.get('space') || '', view: VIEWS.some(([id]) => id === params.get('view')) ? params.get('view') : 'prd', item: params.get('item'), branch: params.get('branch'), proposal: params.get('proposal'), version: params.get('version'), predecessor: params.get('predecessor') };
}
function href(entry, view = 'overview', item) {
  const values = new URLSearchParams({ project: entry.resourceId, ...(entry.spaceId ? { space: entry.spaceId } : {}), view });
  if (item) values.set('item', item);
  const branch = route().branch;
  if (branch && PLANNING_VIEWS.has(view)) values.set('branch', branch);
  return `#${values}`;
}
function planningNavigate(values) {
  const parameters = new URLSearchParams(location.hash.slice(1));
  for (const [key, value] of Object.entries(values)) { if (value === null || value === undefined) parameters.delete(key); else parameters.set(key, value); }
  const next = '#' + parameters;
  if (location.hash === next) renderView(); else location.hash = next;
}
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(language, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
}
function safeLink(value) {
  if (typeof value !== 'string' || /[\\\u0000-\u0020]/.test(value) || value.startsWith('//')) return null;
  try {
    const parsed = new URL(value, location.origin);
    if (parsed.username || parsed.password || parsed.protocol !== 'https:' && !(value.startsWith('/') && parsed.origin === location.origin)) return null;
    return parsed.href;
  } catch { return null; }
}
function referenceLink(reference) {
  const prefix = '/apps/knowledge/';
  if (reference.kind !== 'knowledge' || !reference.url?.startsWith(prefix) || !config?.knowledgeBaseUrl) return safeLink(reference.url);
  try {
    const destination = new URL(config.knowledgeBaseUrl, location.origin);
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password || destination.search || destination.hash) return null;
    if (!destination.pathname.endsWith('/')) destination.pathname += '/';
    const link = new URL(reference.url.slice(prefix.length), destination);
    if (link.origin !== destination.origin || !link.pathname.startsWith(destination.pathname)) return null;
    return link.href;
  } catch { return null; }
}
async function api(path, body, signal = requestController?.signal) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    ...(body ? { headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' }, body: JSON.stringify(body) } : {}),
  });
  let value;
  try { value = await response.json(); } catch { throw new Error('Project response is unavailable.'); }
  if (!response.ok) throw Object.assign(new Error('Project request failed.'), { status: response.status, code: value?.code, details: value?.details });
  return value;
}
function invoke(operation, entry, signal) {
  return api('/api/business/invoke', { appId: 'projects', operation, spaceId: entry.spaceId, ...(entry.resourceId ? { resourceId: entry.resourceId } : {}) }, signal);
}
function planningCall(operation, input, expectedRevision, idempotencyKey, entry) {
  if (!config?.managed) {
    if (operation !== 'read_planning') throw Object.assign(new Error('Planning writes require an authorized identity.'), { status: 403, code: 'FORBIDDEN' });
    return api(new URL(`api/projects/${encodeURIComponent(entry.resourceId)}/planning`, base), undefined, requestController?.signal);
  }
  return api('/api/business/invoke', { appId: 'projects', operation, spaceId: entry.spaceId, resourceId: entry.resourceId, input, ...(expectedRevision !== undefined ? { expectedRevision } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) }, requestController?.signal);
}
function clearProject() {
  planning.leave();
  project = undefined;
  content.hidden = true;
  document.title = 'Projects';
  document.querySelector('#project-name').textContent = '';
  document.querySelector('#project-description').textContent = '';
  document.querySelector('#view').replaceChildren();
  document.querySelector('#project-status').textContent = '';
  document.querySelector('#project-status').removeAttribute('data-status');
}
function showNotice(title, description, retry = false) {
  clearProject();
  navigation.replaceChildren(); navigation.hidden = true;
  notice.replaceChildren();
  if (title) notice.append(element('strong', '', title));
  if (description) notice.append(element('p', '', description));
  if (retry) {
    const button = element('button', 'retry', t("Retry", "重新读取"));
    button.type = 'button'; button.addEventListener('click', () => void initialize()); notice.append(button);
  }
  notice.hidden = false;
  main.setAttribute('aria-busy', 'false');
}
function showError(error) {
  if (error.name === 'AbortError') return;
  if (error.status === 401 || error.status === 403) {
    planning.clearProtected();
    entries = []; selected = undefined;
    picker.replaceChildren();
    navigation.replaceChildren(); navigation.hidden = true;
    document.querySelector('#project-picker').hidden = true;
    if (error.status === 401) appState('login-required');
  }
  showNotice(t("Could not load the project", "无法读取项目"), ERROR_NAMES[error.code] || t("Connection unavailable. Try again later.", "连接暂时不可用，请稍后重试。"), true);
}
function renderPicker() {
  picker.replaceChildren();
  if (config?.managed) { document.querySelector('#project-picker').hidden = true; return; }
  const multipleSpaces = new Set(entries.map(entry => entry.spaceId)).size > 1;
  for (const entry of entries) {
    const option = element('option', '', multipleSpaces ? `${entry.spaceName} / ${entry.name}` : entry.name);
    option.value = key(entry); picker.append(option);
  }
  if (selected) picker.value = key(selected);
  picker.disabled = entries.length < 2;
  document.querySelector('#project-picker').hidden = !entries.length;
}
function renderNavigation(view) {
  const focusedView = navigation.contains(document.activeElement) && document.activeElement.dataset.view;
  navigation.replaceChildren();
  for (const [id, name, drawing] of VIEWS) {
    const link = element('a', 'nav-entry'); link.href = href(selected, id); link.dataset.view = id;
    const icon = element('span', 'nav-icon'); icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24">${drawing}</svg>`;
    link.append(icon, element('span', 'nav-label', name));
    if (id !== 'overview' && !PLANNING_VIEWS.has(id)) {
      const count = id === 'knowledge' ? project.references.length : project.workItems.filter(item => item.domain === id).length;
      link.append(element('span', 'nav-count', String(count)));
    }
    if (id === view) link.setAttribute('aria-current', 'page');
    navigation.append(link);
  }
  navigation.hidden = false;
  if (focusedView) navigation.querySelector(`[data-view="${CSS.escape(focusedView)}"]`)?.focus({ preventScroll: true });
  requestAnimationFrame(ensureActiveVisible);
}
function ensureActiveVisible() {
  const active = navigation.querySelector('[aria-current=page]');
  if (!active || navigation.scrollWidth <= navigation.clientWidth) return;
  const bounds = navigation.getBoundingClientRect(), selectedBounds = active.getBoundingClientRect();
  if (selectedBounds.left < bounds.left) navigation.scrollLeft += selectedBounds.left - bounds.left;
  else if (selectedBounds.right > bounds.right) navigation.scrollLeft += selectedBounds.right - bounds.right;
}
function blockedBy(item) {
  return item.dependsOn.map(id => project.workItems.find(value => value.id === id)).filter(value => value && value.status !== 'done');
}
function referenceList(values) {
  const list = element('ul', 'reference-list');
  for (const reference of values) {
    const target = referenceLink(reference);
    if (!target) continue;
    const item = element('li');
    const link = element('a', '', reference.title); link.href = target; link.rel = 'noreferrer';
    item.append(link, element('span', 'reference-kind', reference.kind === 'knowledge' ? t("Knowledge source", "知识资料") : t("Deliverable", "交付物")));
    list.append(item);
  }
  return list;
}
function detailSection(title, children) {
  const section = element('div', 'detail-section'); section.append(element('h3', '', title), children); return section;
}
function workList(items, { showDomain = true } = {}) {
  const list = element('div', 'work-list');
  for (const item of items) {
    const row = element('details', 'work-item'); row.dataset.item = item.id;
    const summary = element('summary');
    const top = element('div', 'work-top');
    const title = element('span', 'work-title');
    const dot = element('span', 'status-dot'); dot.dataset.status = item.status; dot.setAttribute('aria-hidden', 'true');
    title.append(dot, element('span', '', item.title));
    const blockers = blockedBy(item);
    const state = element('span', `work-state${blockers.length && item.status !== 'done' ? ' blocked' : ''}`, blockers.length && item.status !== 'done' ? t("Waiting on dependencies", "等待前置工作") : STATUS_NAMES[item.status]);
    top.append(title, state);
    const meta = element('div', 'work-meta');
    if (showDomain) meta.append(element('span', '', DOMAIN_NAMES[item.domain]));
    if (item.owner) meta.append(element('span', '', item.owner));
    if (item.dueDate) meta.append(element('span', '', formatDate(item.dueDate)));
    if (item.tier) meta.append(element('span', 'tier', item.tier));
    summary.append(top, meta);
    const detail = element('div', 'work-detail');
    if (item.description) detail.append(element('p', '', item.description));
    if (item.acceptance) detail.append(detailSection(t("Acceptance criteria", "验收条件"), element('p', '', item.acceptance)));
    if (item.dependsOn.length) {
      const dependencies = element('ul', 'dependency-list');
      for (const dependencyId of item.dependsOn) {
        const dependency = project.workItems.find(value => value.id === dependencyId);
        if (!dependency) continue;
        const li = element('li'); const button = element('button', '', dependency.title); button.type = 'button'; button.dataset.dependency = dependency.id;
        button.addEventListener('click', () => { location.hash = href(selected, dependency.domain, dependency.id); });
        li.append(button, element('span', '', STATUS_NAMES[dependency.status])); dependencies.append(li);
      }
      detail.append(detailSection(t("Dependencies", "前置工作"), dependencies));
    }
    const references = item.referenceIds.map(id => project.references.find(value => value.id === id)).filter(Boolean);
    if (references.length) detail.append(detailSection(t("Related references", "关联资料"), referenceList(references)));
    if (!detail.children.length) detail.append(element('p', '', t("No additional notes.", "暂无补充说明。")));
    row.append(summary, detail); list.append(row);
  }
  return list;
}
function section(title, items, emptyText, options) {
  const node = element('section', 'section');
  const heading = element('h2', 'section-title', title);
  if (items.length) heading.append(element('span', '', String(items.length)));
  node.append(heading, items.length ? workList(items, options) : element('p', 'empty-inline', emptyText));
  return node;
}
function renderOverview(view) {
  const goal = element('section', 'section'); goal.append(element('h2', '', t("Project goal", "项目目标")), element('p', 'goal', project.goal));
  const meta = element('div', 'project-meta');
  if (project.owner) meta.append(element('span', '', t("Owner: {0}", "负责人 {0}", project.owner)));
  if (project.updatedAt) meta.append(element('span', '', t("Updated {0}", "更新于 {0}", formatDate(project.updatedAt))));
  goal.append(meta); view.append(goal);
  const pending = project.workItems.filter(item => item.status !== 'done');
  const blocked = pending.filter(item => blockedBy(item).length);
  const review = pending.filter(item => item.status === 'review' && !blockedBy(item).length);
  const current = pending.filter(item => item.status !== 'review' && !blockedBy(item).length);
  if (!project.workItems.length) { view.append(element('p', 'empty-inline', t("No work items yet.", "暂无工作安排。"))); return; }
  if (current.length) view.append(section(t("Work items", "工作安排"), current));
  if (review.length) view.append(section(t("Awaiting review", "等待验收"), review));
  if (blocked.length) view.append(section(t("Dependencies", "协作依赖"), blocked));
  const done = project.workItems.filter(item => item.status === 'done');
  if (done.length) view.append(section(t("Completed", "已完成"), done));
}
function renderView(refresh = false) {
  const state = route();
  const openIds = refresh ? [...content.querySelectorAll('.work-item[open]')].map(row => row.dataset.item) : [];
  const focused = document.activeElement;
  const focusItem = refresh && focused?.closest('.work-item')?.dataset.item;
  renderNavigation(state.view);
  const view = document.querySelector('#view'); view.replaceChildren();
  if (PLANNING_VIEWS.has(state.view)) { planning.render(view, state.view); void planning.routeChanged(); return; }
  planning.leave();
  if (state.view === 'overview') renderOverview(view);
  else if (state.view === 'knowledge') {
    view.append(element('h2', 'view-heading', t("References", "资料")));
    view.append(project.references.length ? referenceList(project.references) : element('p', 'empty-inline', t("No references yet.", "暂无关联资料。")));
  } else {
    const items = project.workItems.filter(item => item.domain === state.view);
    view.append(section(DOMAIN_NAMES[state.view], items, t("No work items yet.", "暂无工作安排。"), { showDomain: false }));
  }
  if (refresh) {
    const rows = [...view.querySelectorAll('.work-item')];
    for (const row of rows) row.open = openIds.includes(row.dataset.item);
    if (focusItem) {
      const row = rows.find(row => row.dataset.item === focusItem);
      const selector = focused.dataset.dependency ? `[data-dependency="${CSS.escape(focused.dataset.dependency)}"]`
        : focused.matches('a') ? `a[href="${CSS.escape(focused.getAttribute('href'))}"]` : 'summary';
      (row?.querySelector(selector) || row?.querySelector('summary') || main).focus({ preventScroll: true });
    }
  } else if (state.item) {
    const detail = [...view.querySelectorAll('.work-item')].find(node => node.dataset.item === state.item);
    if (detail) { detail.open = true; detail.querySelector('summary').focus({ preventScroll: true }); detail.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
  }
}
function managedTarget() {
  const parameters = new URLSearchParams(location.hash.slice(1));
  const state = route();
  if (parameters.getAll('project').length !== 1 || parameters.getAll('space').length !== 1
    || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(state.projectId || '')
    || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(state.spaceId)) return null;
  return { resourceId: state.projectId, spaceId: state.spaceId };
}
async function initialize({ silent = false, force = false } = {}) {
  if (refreshing && !force || stopped || silent && planning.busy) return;
  refreshing = true;
  const current = ++generation;
  requestController?.abort(); requestController = new AbortController();
  const signal = requestController.signal;
  const state = route();
  const previousId = selected && key(selected);
  const sameTarget = project && ((selected?.resourceId === state.projectId && (selected.spaceId || '') === state.spaceId)
    || config?.managed === false && !state.projectId && !state.spaceId);
  if (!silent || !sameTarget) { clearProject(); notice.textContent = t("Loading project…", "正在读取项目…"); notice.hidden = false; navigation.hidden = true; main.setAttribute('aria-busy', 'true'); }
  try {
    config ||= await api(new URL('api/config', base), undefined, signal);
    if (current !== generation || stopped) return;
    let target;
    if (config.managed) {
      entries = []; renderPicker();
      target = managedTarget();
      if (!target) {
        selected = undefined; navigation.hidden = true;
        showNotice(t("Select a project from the workbench.", "请从工作台选择项目。")); return;
      }
      const session = await api('/auth/session', undefined, signal);
      if (current !== generation || stopped) return;
      csrfToken = session.csrfToken;
      const catalog = await api('/api/business/catalog', undefined, signal);
      if (current !== generation || stopped) return;
      const allowed = catalog.spaces.some(space => space.id === target.spaceId && space.apps.some(app => app.id === 'projects' && app.actions.includes('read')));
      if (!allowed) throw Object.assign(new Error('Project context is unavailable.'), { status: 403, code: 'FORBIDDEN' });
    } else {
      const value = await api(new URL('api/projects', base), undefined, signal);
      if (current !== generation || stopped) return;
      entries = value.items.map(item => ({ ...item, spaceId: '' }));
      target = entries.find(entry => entry.resourceId === state.projectId && !state.spaceId) || (!state.projectId ? entries[0] : undefined);
      if (!target) {
        selected = undefined; renderPicker(); navigation.hidden = true;
        showNotice(state.projectId ? t("Project unavailable", "项目暂不可用") : t("No projects", "暂无项目"), state.projectId ? t("This project is missing or no longer accessible.", "该项目不存在或已无法访问。") : t("Projects will appear here once created.", "项目创建后会显示在这里。")); return;
      }
    }
    const preserveView = silent && sameTarget && key(target) === previousId;
    if (silent && !preserveView) clearProject();
    selected = target; renderPicker();
    const result = config.managed ? await invoke('read_project', target, signal) : await api(new URL(`api/projects/${encodeURIComponent(target.resourceId)}`, base), undefined, signal);
    if (current !== generation || stopped) return;
    if (!result.project || result.project.id !== target.resourceId || result.resourceId !== target.resourceId
      || result.spaceId !== undefined && result.spaceId !== target.spaceId
      || !Array.isArray(result.project.workItems) || !Array.isArray(result.project.references)) throw new Error('Invalid project response.');
    if (preserveView && project?.revision && project.revision === result.project.revision) { await planning.setContext(target, { silent: true }); return; }
    project = result.project;
    document.querySelector('#project-name').textContent = project.name;
    document.querySelector('#project-description').textContent = project.description;
    const status = document.querySelector('#project-status'); status.textContent = PROJECT_STATUS_NAMES[project.status] || ''; status.dataset.status = project.status;
    document.title = `${project.name} · Projects`;
    notice.hidden = true; content.hidden = false; main.setAttribute('aria-busy', 'false');
    const keepPlanningFocus = preserveView && PLANNING_VIEWS.has(state.view) && document.querySelector('#view').contains(document.activeElement);
    await planning.setContext(target, { silent: preserveView });
    if (current !== generation || stopped || !project || content.hidden) return;
    if (keepPlanningFocus) { renderNavigation(state.view); appState('ready'); return; }
    renderView(preserveView); appState('ready');
  } catch (error) { if (current === generation && !stopped) showError(error); }
  finally { if (current === generation) refreshing = false; }
}
picker.addEventListener('change', () => {
  const entry = entries.find(value => key(value) === picker.value);
  if (entry) location.hash = href(entry);
});
window.addEventListener('hashchange', () => {
  const state = route();
  const target = config?.managed ? managedTarget() : null;
  const sameTarget = project && (config?.managed
    ? target && selected?.resourceId === target.resourceId && selected.spaceId === target.spaceId
    : selected?.resourceId === state.projectId && !state.spaceId || !state.projectId);
  if (sameTarget) renderView();
  else void initialize({ force: true });
});
window.addEventListener('resize', ensureActiveVisible);
document.addEventListener('praxis-navigation-ready', () => appState(navigationState));
document.addEventListener('praxis-session-ended', () => {
  planning.clearProtected();
  stopped = true; generation++; requestController?.abort();
  entries = []; selected = undefined; picker.replaceChildren(); navigation.replaceChildren(); navigation.hidden = true;
  document.querySelector('#project-picker').hidden = true;
  showNotice(t("Session expired", "登录已失效"), t("Sign in again from the workbench.", "请回到工作台重新登录。")); appState('login-required');
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void initialize({ silent: true }); });
window.addEventListener('focus', () => void initialize({ silent: true }));
setInterval(() => { if (document.visibilityState === 'visible') void initialize({ silent: true }); }, 30000);
await initialize();
