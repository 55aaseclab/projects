export function createProjectSchemas(z) {


const projectIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const projectRevisionSchema = z.string().max(15).regex(/^[1-9]\d*$/).refine(value => Number.isSafeInteger(Number(value)), 'Revision must be a safe positive integer string.');
const text = maximum => z.string().max(maximum).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Text contains unsupported control characters.');
const shortText = maximum => text(maximum).refine(value => value.length > 0 && value === value.trim(), 'Text must be nonempty and trimmed.');
const owner = shortText(160).nullable();
const actualDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Date must be a valid calendar date.');
const identifiers = z.array(projectIdSchema).max(100).refine(value => new Set(value).size === value.length, 'Identifiers must be unique.');
const projectCreateFields = { name: shortText(160), goal: shortText(2000), description: text(10000).optional(), owner: owner.optional() };
const projectCreateSchema = z.object(projectCreateFields).strict();
const projectUpdateSchema = z.object({ name: shortText(160).optional(), goal: shortText(2000).optional(), description: text(10000).optional(), owner: owner.optional(), status: z.enum(['active', 'paused', 'completed']).optional() }).strict().refine(value => Object.keys(value).length > 0, 'At least one project field is required.');
const projectWorkItemFields = {
  id: projectIdSchema, title: shortText(160), domain: z.enum(['research', 'engineering', 'marketing', 'support']),
  status: z.enum(['todo', 'doing', 'review', 'done']), tier: z.enum(['L1', 'L2', 'L3']).nullable(),
  owner, dueDate: actualDate.nullable(), description: text(10000), acceptance: text(2000),
  dependsOn: identifiers, referenceIds: identifiers,
};
const projectWorkItemSchema = z.object(projectWorkItemFields).strict().refine(value => !value.dependsOn.includes(value.id), 'A work item cannot depend on itself.');
function safeProjectReference(value) {
  if (!value || typeof value.url !== 'string' || !value.url || value.url.length > 2048 || /[\s\\\x00-\x1f\x7f]/.test(value.url) || /[?#]/.test(value.url)) return false;
  let url;
  try { url = new URL(value.url, 'https://knowledge.synthetic.invalid'); } catch { return false; }
  if (url.username || url.password || url.protocol !== 'https:' || /%(?:2f|5c|2e|25)/i.test(value.url)) return false;
  const rawPath = value.url.startsWith('/') ? value.url : value.url.slice(value.url.indexOf('://') + 3).replace(/^[^/]+/, '') || '/';
  if (rawPath.includes('//') || rawPath.split('/').some(part => part === '.' || part === '..')) return false;
  if (value.kind === 'knowledge') return value.url.startsWith('/apps/knowledge/') && !value.url.startsWith('//') && url.pathname === value.url;
  return value.kind === 'deliverable' && value.url.startsWith('https://');
}
const projectReferenceFields = { id: projectIdSchema, title: shortText(160), kind: z.enum(['knowledge', 'deliverable']), url: z.string().max(2048) };
const projectReferenceSchema = z.object(projectReferenceFields).strict().refine(safeProjectReference, 'Reference URL must be a normalized Knowledge path or an HTTPS deliverable URL.');
const projectReferenceLookupSchema = z.object({ url: z.string().max(2048) }).strict().refine(value => safeProjectReference({ kind: 'knowledge', url: value.url }), 'Lookup requires a normalized Knowledge URL.');
const projectInputs = Object.freeze({ create_project: projectCreateSchema, update_project: projectUpdateSchema, set_work_item: projectWorkItemSchema, set_reference: projectReferenceSchema, find_references: projectReferenceLookupSchema });

return { projectIdSchema, projectRevisionSchema, projectCreateFields, projectCreateSchema, projectUpdateSchema, projectWorkItemFields, projectWorkItemSchema, safeProjectReference, projectReferenceFields, projectReferenceSchema, projectReferenceLookupSchema, projectInputs };
}
