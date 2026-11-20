import { join } from 'node:path';

// The caller provides only fresh, isolated demo paths and a loopback port.
export function createDemoIntegration() {
  return {
    supported: true, module: 'praxis/demo.mjs',
    plan({ dataDir, port }) {
      return {
        steps: [],
        server: { args: ['src/server.mjs', '--host', '127.0.0.1', '--port', String(port)], environment: { PROJECTS_DATA_DIR: dataDir } },
      };
    },
  };
}
