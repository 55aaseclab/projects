# Projects roadmap

[简体中文](ROADMAP.md)

Document revision: 3 · Updated: 2026-11-20 · Status: proposed delivery sequence for [PRD revision 3](PRD.en.md).

## Current delivery: complete 0.2.0 planning workflow

This task implements the complete planning contract, P0 followed by P1 restoration. Native/browser/Core SDK functional evidence passed; deployment and independent client/device acceptance are recorded separately. No release date, assigned implementation capacity or production readiness is asserted.

The intended outcome is a shared project plan with **one project main, four team mains** (`research`, `engineering`, `marketing`, `support`) **and actual identity-owned personal branches**. Each scope has a PRD and Roadmap. A personal proposal targets its team plan; a team contribution selects changes to the project plan without replacing the project PRD or unrelated team context.

## Proposed sequence and dependencies

The rows below are implementation checkpoints, not independent production releases. **P0 includes the complete personal → team → project consensus loop**, its permission checks and recovery. A branch editor or a personal-to-team merge alone does not complete P0.

| Checkpoint | Required outcome and dependency | PRD coverage | Evidence required before completion | Current result |
| --- | --- | --- | --- | --- |
| Required D1: role bootstrap | Define the protected authority that assigns/revokes project and team decision roles; map those roles to current resource/action grants. Establish explicit initial-baseline adoption. Missing assignees keep acceptance unavailable. Resolve before enabling acceptance or claiming a usable workflow. | F01, F04, F06; §5.2 D1 | AC03, AC09, AC13: designated-role positive cases and denials for ordinary writers, role spoofing, revocation and platform administrators lacking a business decision role. Record assignment/revocation evidence. | Pass — native/browser/Core SDK; see PRD verification scope |
| P0: scoped plans and owned drafts | Preserve existing records and native views; expose the project/four-team/personal hierarchy and unadopted states. Add identity-owned PRD drafts and linked Roadmap milestones with typed validation and draft recovery. Uses D1 for adoption and decision actions. | F01–F03, F06 | AC01–AC05, AC12: empty/existing installations, two users in a team, one user in two teams, saved-version readback/restart, invalid references/cycles, read-only access and protected draft recovery. | Pass — native/browser/Core SDK; see PRD verification scope |
| P0: complete consensus loop | Compare and submit exact target-scoped proposals; designated team decision-makers accept/reject personal changes, and designated project decision-makers decide on selected team contributions. Preserve continuing branches, withdrawal, supersession and successor proposals. Resolve conflicts explicitly and refresh stale reviews before acceptance. Depends on scoped plans and D1. | F04–F06 | AC06–AC10, AC13: personal → team → project end-to-end result, no skipped team decision, unrelated changes preserved, team-qualified IDs, source/target version guards and immutable reasons/evidence. | Pass — native/browser/Core SDK; see PRD verification scope |
| P0: release evidence and recovery | Verify the entire P0 contract through native web and scoped business operations, including history, retries, uncertain outcomes, authorization changes and existing providers. Agree the A2 test environment/concurrency before performance acceptance. | F01–F06; §4; §5.1 | All AC01–AC15 require actual Pass/Fail/N/A with evidence; exercise AC11–AC12 recovery, AC14 bilingual desktop/phone-width/keyboard round trip and AC15 agreed synthetic load plus provider/legacy regressions. N/A requires a reason and cannot hide a failed mandatory case. | Pass — native/browser/Core SDK; see PRD verification scope |
| P1: restore as a new proposal | After the full P0 loop, restore a historical plan into a new personal draft, compare it and use ordinary target review; improve historical comparison. No rewrite of intervening decisions or execution facts. | F06 | AC16: new draft/proposal and accepted successor baseline preserve prior history, completed work and deliveries. | Pass — native/browser/Core SDK; see PRD verification scope |

## Decisions, risks and release boundary

- **D1 is confirmed in PRD revision 3; implement its protected role and delegation checks.** Platform maintenance/admin status and a legacy free-text owner label confer no business acceptance authority. Acceptance requires the designated role for the target plus current scoped authorization; an external agent needs explicit delegation for that decision.
- **A1 defines ownership:** use one continuing personal branch per `(project, team, user)` by default; confirm this during design review. Branch count follows actual authorized participation, not invented members.
- **A2 defines performance evidence:** confirm the proposed PRD load/latency target, assigned environment and active concurrency before measuring. No unmeasured performance result or service guarantee is implied.
- **D2 defines future retention/deletion:** preserve acknowledged history under existing project policy; no automatic purge is introduced. **A3 fixes the proposed scope:** the full P0 loop precedes P1 restore; schedule and capacity remain unconfirmed.
- Independent edits must not silently overwrite one another. A team-to-project proposal promotes bounded project changes with provenance; synchronization retains team-specific meaning. Planning acceptance never erases execution facts or implies that real resources were reserved.

Use isolated synthetic records for implementation checks. Maintenance never seeds or rewrites live business records. Record independent authorized business-client and physical-phone evidence separately under the Praxis verification plan; source and browser fixtures do not substitute for those clients.

For a future runtime release, publish the verified app revision in its owning repository before Praxis pins the publicly retrievable revision and verifies the combination. Deploy according to the assigned environment and record actual running-entry evidence. This runtime release requires verified source publication and deployment; maintenance performs no live business-record operations. Open both PRD language editions through the workbench reader and record the documentation check in task delivery; current functional results and their scope are recorded in the PRD AC ledger.

## Existing standalone and provider contracts

Keep the standalone app and its Praxis integration working from an empty installation. Add new contracts with synthetic examples and tests.

Preserve the app-owned card and data-source contract. Verify synthetic authorized records, native links, stable revisions, empty/error separation and metadata resolution. Keep storage keys, business records and video provisioning outside this module.

## Confirmed 0.2.0 execution contract

D1 is resolved as specified in PRD revision 3: current space owner/admin plus project-scoped `manage_planning_roles`, checked enabled/read-authorized subjects and explicit target-role/`update`/`accept_plan` decision authority. A1 is one continuing branch per project/team/user. Run A2 in the specified Node 22.22.1 Linux temporary SQLite/loopback fixture with 20 members, 200 milestones and concurrency 20. Complete all P0 checkpoints and then P1 restoration in this task; verify AC01–AC16. The original revisions 1–2 documentation-only Pending ledger remains in Git history; no implementation is accepted without recorded evidence.

## 0.2.0 implementation evidence

The complete P0 and P1 candidate passed 52 app checks, four native browser language/width scenes and a separate real Core OAuth/PKCE→MCP SDK→signed Projects-service proof. Current PRD AC01–AC16 records the scoped results. The original Pending ledger remains in Git history; actual external-agent and physical-phone acceptance remains Pending separately. No maintenance client created live business records.
