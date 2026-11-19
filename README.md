# Projects

[简体中文](README.zh-CN.md)

Manage goals, work items, dependencies and source references for projects in independent spaces. The reader shows project progress, four work areas and linked sources. Configure signed business access for authorized writes. Local reads start with an empty project directory.

```sh
npm start -- --host 127.0.0.1 --port 4327
```

Open http://127.0.0.1:4327/ and run `npm test` for isolated fixtures. Configure an absolute `PROJECTS_DATA_DIR` for persistent project data.

## Praxis integration

The app-owned [provider contract](docs/PRAXIS-PROVIDER.md) supplies authorized source-backed cards and data-source metadata without exposing a new HTTP endpoint. Run `npm run test:provider` for the isolated provider checks.
