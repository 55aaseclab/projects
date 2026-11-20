# Projects roadmap

[简体中文](ROADMAP.md)

Document revision: 2 · Updated: 2026-11-20 · Status: proposed delivery sequence for [PRD revision 2](PRD.en.md).

## Current delivery: requirements ready for review

This task updates the PRD and roadmap only. The document is ready for product review; planning branches, PRD/Roadmap panels and the consensus workflow remain **unimplemented**, and all new functional acceptance is **Pending**. No release date, assigned implementation capacity or production readiness is asserted.

The intended outcome is a shared project plan with **one project main, four team mains** (`research`, `engineering`, `marketing`, `support`) **and actual identity-owned personal branches**. Each scope has a PRD and Roadmap. A personal proposal targets its team plan; a team contribution selects changes to the project plan without replacing the project PRD or unrelated team context.

## Proposed sequence and dependencies

The rows below are implementation checkpoints, not independent production releases. **P0 includes the complete personal → team → project consensus loop**, its permission checks and recovery. A branch editor or a personal-to-team merge alone does not complete P0.

| Checkpoint | Required outcome and dependency | PRD coverage | Evidence required before completion | Current result |
| --- | --- | --- | --- | --- |
| Required D1: role bootstrap | Define the protected authority that assigns/revokes project and team decision roles; map those roles to current resource/action grants. Establish explicit initial-baseline adoption. Missing assignees keep acceptance unavailable. Resolve before enabling acceptance or claiming a usable workflow. | F01, F04, F06; §5.2 D1 | AC03, AC09, AC13: designated-role positive cases and denials for ordinary writers, role spoofing, revocation and platform administrators lacking a business decision role. Record assignment/revocation evidence. | Pending: decision and implementation |
| P0: scoped plans and owned drafts | Preserve existing records and native views; expose the project/four-team/personal hierarchy and unadopted states. Add identity-owned PRD drafts and linked Roadmap milestones with typed validation and draft recovery. Uses D1 for adoption and decision actions. | F01–F03, F06 | AC01–AC05, AC12: empty/existing installations, two users in a team, one user in two teams, saved-version readback/restart, invalid references/cycles, read-only access and protected draft recovery. | Pending: implementation |
| P0: complete consensus loop | Compare and submit exact target-scoped proposals; designated team decision-makers accept/reject personal changes, and designated project decision-makers decide on selected team contributions. Preserve continuing branches, withdrawal, supersession and successor proposals. Resolve conflicts explicitly and refresh stale reviews before acceptance. Depends on scoped plans and D1. | F04–F06 | AC06–AC10, AC13: personal → team → project end-to-end result, no skipped team decision, unrelated changes preserved, team-qualified IDs, source/target version guards and immutable reasons/evidence. | Pending: implementation |
| P0: release evidence and recovery | Verify the entire P0 contract through native web and scoped business operations, including history, retries, uncertain outcomes, authorization changes and existing providers. Agree the A2 test environment/concurrency before performance acceptance. | F01–F06; §4; §5.1 | All AC01–AC15 require actual Pass/Fail/N/A with evidence; exercise AC11–AC12 recovery, AC14 bilingual desktop/phone-width/keyboard round trip and AC15 agreed synthetic load plus provider/legacy regressions. N/A requires a reason and cannot hide a failed mandatory case. | Pending: implementation and acceptance |
| P1: restore as a new proposal | After the full P0 loop, restore a historical plan into a new personal draft, compare it and use ordinary target review; improve historical comparison. No rewrite of intervening decisions or execution facts. | F06 | AC16: new draft/proposal and accepted successor baseline preserve prior history, completed work and deliveries. | Pending: follow-up |

## Decisions, risks and release boundary

- **D1 blocks role bootstrap and positive acceptance tests.** Platform maintenance/admin status and a legacy free-text owner label confer no business acceptance authority. Acceptance requires the designated role for the target plus current scoped authorization; an external agent needs explicit delegation for that decision.
- **A1 defines ownership:** use one continuing personal branch per `(project, team, user)` by default; confirm this during design review. Branch count follows actual authorized participation, not invented members.
- **A2 defines performance evidence:** confirm the proposed PRD load/latency target, assigned environment and active concurrency before measuring. No unmeasured performance result or service guarantee is implied.
- **D2 defines future retention/deletion:** preserve acknowledged history under existing project policy; no automatic purge is introduced. **A3 fixes the proposed scope:** the full P0 loop precedes P1 restore; schedule and capacity remain unconfirmed.
- Independent edits must not silently overwrite one another. A team-to-project proposal promotes bounded project changes with provenance; synchronization retains team-specific meaning. Planning acceptance never erases execution facts or implies that real resources were reserved.

Use isolated synthetic records for implementation checks. Maintenance never seeds or rewrites live business records. Record independent authorized business-client and physical-phone evidence separately under the Praxis verification plan; source and browser fixtures do not substitute for those clients.

For a future runtime release, publish the verified app revision in its owning repository before Praxis pins the publicly retrievable revision and verifies the combination. Deploy according to the assigned environment and record actual running-entry evidence. This documentation revision requires no application rebuild, deployment or business-data operation. Open both PRD language editions through the workbench reader and record the documentation check in task delivery; that check leaves AC01–AC16 Pending.

## Existing standalone and provider contracts

Keep the standalone app and its Praxis integration working from an empty installation. Add new contracts with synthetic examples and tests.

Preserve the app-owned card and data-source contract. Verify synthetic authorized records, native links, stable revisions, empty/error separation and metadata resolution. Keep storage keys, business records and video provisioning outside this module.
