# Projects requirements

[简体中文](PRD.md)

Manage goals, work items, dependencies and source references for projects in independent spaces. The reader shows project progress, four work areas and linked sources. Configure signed business access for authorized writes. Local reads start with an empty project directory.

The standalone app opens its own view and keeps working data separate from its source. Integration with an external workbench uses the same renderer.

## Shared plans and branches · proposed requirements

This section specifies the next product behavior. The current app has project revisions and concurrency checks; it does not yet implement the branch, PRD, roadmap or merge workflow below. This document update does not change application behavior or existing business records.

### Team agreement is the visible product

Projects should give a team a readable common plan while members explore changes independently. Its two primary planning panels are **PRD** and **Roadmap**. The version engine supports those panels with history, comparison and controlled acceptance.

The PRD explains the problem, intended outcome, scope, exclusions and acceptance criteria. It also records unresolved questions, important decisions and their evidence. The Roadmap connects stages and milestones to those goals and acceptance criteria, showing status, priority, owner, dependencies and dates when known. It distinguishes agreed commitments from tentative arrangements; an unknown date remains unknown, and a planned date is not a delivery guarantee. A scope change should expose its effect on the roadmap rather than silently create a second inconsistent plan.

Each panel clearly identifies its project, team, branch and current state. Readers can distinguish a draft, submitted proposal, accepted baseline and later proposed changes. An accepted baseline identifies who accepted which version, when and why. An individual acceptance is not presented as unanimous agreement. Reading a page never counts as consent, approval or acceptance.

### Project, team and personal branches

Each project has a project baseline (`main`), four team baselines for the existing research, engineering, marketing and support domains, and personal proposal branches under each team. The four team branches are additional to the project baseline; they are not four people. Each member has one continuing personal branch in the team they participate in. A branch contains its own PRD and Roadmap version, with a recorded parent baseline.

Personal proposals target their team baseline. Accepted team changes can then be proposed to the project baseline. Project and team baselines are read-only in the planning panels; changes originate in a personal branch and reach them through the appropriate proposal and acceptance path. Team baselines retain their own context; submitting a team proposal exposes its effect on the shared project plan. Synchronizing a newer parent baseline preserves local changes or asks for conflict decisions. Branch isolation covers plans and proposed changes; it does not reserve people, budgets or time independently for each branch.

### Ownership, proposals and acceptance

Ownership of a personal branch comes from the authenticated user identity, including when an authorized external agent acts for that user. A member can edit their own branch, not nominate another identity or modify another member's draft. Reading follows the existing project and resource grants; a separate branch does not automatically make its contents private or expand access. An explicitly designated project owner or decision-maker accepts the project baseline; the designated team lead or delegate accepts a team baseline. Each requires actual scoped write and acceptance rights for that target. Platform administrator status alone confers no business acceptance authority. The protected account/permission workflow establishes those roles; a proposal cannot grant its author approval authority. The implementation of that policy remains to be designed.

The author submits a bounded proposal with its purpose, changed scope and expected impact. Review shows the proposed version, the captured parent baseline and the parent's current version. Non-overlapping changes may be combined, but publication still requires authorized acceptance. Semantic contradictions about scope, dependencies, commitments or acceptance criteria remain explicit questions for the decision owner even when text fields can be combined.

Conflicting changes cannot silently overwrite either side. The author or authorized target maintainer resolves them explicitly, records the decision and returns the resulting proposal for review. Acceptance checks that the submitted source version and reviewed target version are still current. Editing invalidates the earlier submission; moving either version requires refreshed review. Rejection or withdrawal leaves the accepted baseline intact and allows the author to revise and resubmit. Unresolved disagreement keeps its context and a decision owner rather than being represented as consensus.

### History, execution facts and existing records

Every accepted baseline remains retrievable with its PRD, Roadmap, source branch, actor, reason and linked evidence. Saved proposals and acceptance decisions have durable version history. A restoration creates a new recorded proposal rather than erasing intervening history. The interface preserves unsaved drafts when refreshing or navigating and clearly distinguishes unsaved, saving, saved, conflicting and uncertain outcomes. After an uncertain save, read back the actual version before retrying the same intent. Repeated requests for that intent do not create duplicate branches or acceptances, and interrupted or conflicting writes have an explicit recovery path.

Existing work items and references remain execution records. Planning changes cannot erase completed work, spent effort, delivered output or recorded acceptance. References identify the actual source and its version where the owning app supports it; a mutable current URL alone is not proof of historical content. History must describe missing coverage honestly and enforce current access when opening source material.

Opening an existing project preserves its current goals, work items, dependencies and references. Introducing the hierarchy does not manufacture members, personal branches, agreement or historical decisions. Any initial adoption of a team or project baseline is an explicit authorized action. Runtime plans and snapshots stay in private app-owned storage, outside the application source repository. Standalone operation keeps its established read-only boundary unless separately authorized business access is configured.

### Observable acceptance

| Requirement | Evidence required before claiming implementation |
| --- | --- |
| Shared understanding | PRD and Roadmap show goals, scope, acceptance, commitments, unknowns and proposal/baseline states, linked across both panels. |
| Correct hierarchy | One project baseline, four team baselines and identity-owned personal branches remain distinct; a personal proposal goes to its team before a team proposal reaches the project. |
| Ownership and access | Synthetic users cannot impersonate an owner, edit another personal branch, accept without the target role/write grant, or read outside the project grant; denials leave data unchanged. |
| Safe consensus changes | Compare, submit, accept, reject/withdraw and resubmit work; independent changes preserve both sides, conflicts require recorded decisions, and stale source/target reviews cannot be accepted. |
| Honest history | Earlier baselines and decisions survive restart and retries; restoring a plan creates new history and preserves execution facts and existing records. |
| Usable interfaces | The representative branch → PRD → Roadmap → review → parent-baseline flow works in English and Simplified Chinese, on desktop and phone widths, with loading, empty, conflict and recovery states and Home return. |

These are future implementation acceptance criteria, not test results from this documentation change. Use isolated synthetic fixtures for maintenance checks; record actual independent business-client and physical-phone results separately.

## Praxis provider

The app owns a version-1 `praxis-provider.mjs` contract for source-backed workbench cards and data-source metadata. Reads use host-supplied authorized callbacks; the provider has no direct filesystem, credential or network access. Preserve native object links, real revisions or stable content hashes, and distinct empty, partial and unavailable results. Personal card handling never modifies shared records. See [provider contract](PRAXIS-PROVIDER.md).
