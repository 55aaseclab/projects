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

App release: `0.1.6`. The app owns [`praxis-app.json`](praxis-app.json), its English and Simplified Chinese presentation, the icon at `public/praxis-icon.svg`, the declared PRD locations and any legacy icon aliases. `schemaVersion: 1` identifies the registration format; it is separate from this app release and from data, protocol and document revisions. Package and lockfile release metadata, where present, agree with the declaration.

[`apps.example.json`](apps.example.json) registers a local alias by referencing `./praxis-app.json` and `http://127.0.0.1:4327/`. Start the standalone service described above before using the example; registration does not start a backend or grant account, administrator or business-data access. Installation origins, data locations and access policy remain separately configured.
