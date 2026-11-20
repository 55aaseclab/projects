# Projects

[简体中文](README.zh-CN.md)

Manage goals, work items, dependencies and source references for projects in independent spaces. The reader shows project progress, four work areas and linked sources. Configure signed business access for authorized writes. Local reads start with an empty project directory.

```sh
npm start -- --host 127.0.0.1 --port 4327
```

Open http://127.0.0.1:4327/ and run `npm test` for isolated fixtures. Configure an absolute `PROJECTS_DATA_DIR` for persistent project data.

## Praxis integration

The app-owned [provider contract](docs/PRAXIS-PROVIDER.md) supplies authorized source-backed cards and data-source metadata without exposing a new HTTP endpoint. Run `npm run test:provider` for the isolated provider checks.

## Praxis registration

App release: `0.2.0`. The app owns [`praxis-app.json`](praxis-app.json), its English and Simplified Chinese presentation, the icon at `public/praxis-icon.svg`, the declared PRD locations and any legacy icon aliases. `schemaVersion: 1` identifies the registration format; it is separate from this app release and from data, protocol and document revisions. Package and lockfile release metadata, where present, agree with the declaration.

[`apps.example.json`](apps.example.json) registers a local alias by referencing `./praxis-app.json` and `http://127.0.0.1:4327/`. Start the standalone service described above before using the example; registration does not start a backend or grant account, administrator or business-data access. Installation origins, data locations and access policy remain separately configured.


## Versioned planning

Release 0.2.0 adds one project main, four team mains and continuing identity-owned personal branches. Use the PRD/Roadmap panels to draft typed changes, compare source/target versions, submit personal-to-team then selected team-to-project proposals, and record authorized decisions. Restore history as a new draft and ordinary proposal; existing execution facts remain separate. Role administration requires current business-space owner/admin plus project-scoped `manage_planning_roles`. Acceptance additionally needs `update`, explicitly delegated `accept_plan` and the designated target role. Empty reads create no members, baselines or approvals. Standalone unsigned HTTP remains read-only.

`npm test` checks synthetic storage/authorization/concurrency and provider behavior. `npm run test:browser` requires Playwright and Chromium; set `PROJECTS_PLAYWRIGHT_MODULE`, `PROJECTS_CHROMIUM_PATH` and optionally `PRAXIS_PUBLIC_DIR` to explicit installed module, executable and shared-navigation asset paths. Its temporary signed native service and synthetic web session are not production Core/OAuth or external-client evidence. [Business tool guidance](skills/mcp-projects/SKILL.md)

## App-owned container build

`docker build -f Dockerfile.praxis -t praxis-projects:local .` builds the native app from this repository. Configure its persistent `PROJECTS_DATA_DIR`, managed signing key and explicit business-space mapping as described above. Praxis loads [`praxis-integration.mjs`](praxis-integration.mjs) for the same native routes, typed tools, skills, storage and deployment recipes. [Integration contract](praxis/README.md)

The native `/health` response reports the same three-component `version` as `package.json` and `praxis-app.json`; document revision 3 is a separate requirements identity.
