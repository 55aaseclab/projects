import { projectInventory } from './inventory.mjs';
export function createStorageIntegration() { return {
  inventory: { project: projectInventory },
  "rootId": "projects",
  "paths": {
    "projects": ""
  },
  "sources": [
    {
      "kind": "sqlite",
      "path": "projects",
      "relative": "projects.db",
      "target": "projects.db"
    }
  ],
  "omissions": [],
  relocation: {
  "businessBindings": {
    "dataDir": "projects"
  }
},
  recovery: { configFields: ['dataDir'], async collect(ctx) { await ctx.register({ kind: 'sqlite', source: ctx.path('dataDir', 'projects.db'), target: 'projects.db' }); } }
}; }
