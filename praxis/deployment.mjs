import { createDemoIntegration } from './demo.mjs';
import { createStackIntegration } from './stack.mjs';
import { localCompose } from './local-compose.mjs';
import { createManagedService } from './managed-service.mjs';
export function createDeploymentIntegration() { return {
  demo: createDemoIntegration(),
  stack: createStackIntegration(),
  localCompose,
  managedService: createManagedService,
  managedServices: ['projects'],
  "dataId": "projects",
  "volumes": [
    "projects"
  ],
  "adapterPort": 4327,
  "runtime": {
    "PROJECTS_MANAGED": "1",
    "PROJECTS_BUSINESS_KEY_FILE": "/config/key",
    "PROJECTS_BUSINESS_CONFIG_FILE": "/config/spaces.json",
    "PROJECTS_DATA_DIR": "/data/projects",
    "PROJECTS_KNOWLEDGE_BASE_URL": "/apps/knowledge/"
  },
  "spaces": {
    "version": 1,
    "spaces": [
      "${spaceId}"
    ]
  },
  "businessBindings": {
    "dataDir": "/data/projects",
    "businessConfigFile": "/app-config/projects/spaces.json"
  },
  "initialFiles": [],
  "native": {
    "dockerfile": "Dockerfile.praxis",
    "command": [
      "node",
      "src/server.mjs",
      "--host",
      "127.0.0.1",
      "--port",
      "4327"
    ]
  }
}; }
