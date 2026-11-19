# Projects requirements

Manage goals, work items, dependencies and source references for projects in independent spaces. The reader shows project progress, four work areas and linked sources. Configure signed business access for authorized writes. Local reads start with an empty project directory.

The standalone app opens its own view and keeps working data separate from its source. Integration with an external workbench uses the same renderer.

## Praxis provider

The app owns a version-1 `praxis-provider.mjs` contract for source-backed workbench cards and data-source metadata. Reads use host-supplied authorized callbacks; the provider has no direct filesystem, credential or network access. Preserve native object links, real revisions or stable content hashes, and distinct empty, partial and unavailable results. Personal card handling never modifies shared records. See [provider contract](PRAXIS-PROVIDER.md).
