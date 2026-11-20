import { dirname, resolve } from 'node:path';
export async function createManagedService({ app: projects, config, corePort: port, uid, gid, workspace, controlDirectory, stateDirectories, appDirectories, readOnlyFiles, privatePath, readPrivateJson, distinctDirectories, mount, overlaps, isWithin, fail, build }) {
  const services = {}, ports = [];
  if (projects) {
    if (projects.managed !== true || projects.url !== 'http://127.0.0.1:4327/api/business') fail('INVALID_MANAGED_ENDPOINT', 'Projects requires its managed fixed loopback adapter.');
    await privatePath(projects.dataDir, { directory: true, data: true });
    await privatePath(projects.businessConfigFile);
    await privatePath(resolve(projects.dataDir, 'projects.db'), { allowMissing: true, data: true, maxSize: Infinity });
    const mapping = await readPrivateJson(projects.businessConfigFile);
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.keys(mapping).some(key => !['version', 'spaces'].includes(key)) || mapping.version !== 1 || !Array.isArray(mapping.spaces) || !mapping.spaces.length || new Set(mapping.spaces).size !== mapping.spaces.length || JSON.stringify([...mapping.spaces].sort()) !== JSON.stringify([...projects.spaces].sort())) fail('INVALID_SPACE_MAPPING', 'Projects mapping must match its configured spaces exactly.');
    if (stateDirectories.concat(appDirectories).some(directory => overlaps(directory, projects.dataDir)) || readOnlyFiles.concat(projects.businessConfigFile).some(file => isWithin(projects.dataDir, file)) || isWithin(projects.dataDir, controlDirectory)) fail('OVERLAPPING_DATA_MOUNT', 'Projects data must remain separate from identity, other applications, credentials and controls.');
    appDirectories.push(projects.dataDir);
    services.projects = {
      image: 'praxis-business/projects:local',
      build,
      command: ['node', 'src/server.mjs', '--host', '127.0.0.1', '--port', '4327'],
      network_mode: 'host', init: true, user: `${uid}:${gid}`, read_only: true, restart: 'unless-stopped',
      cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'], tmpfs: ['/tmp:rw,nosuid,nodev,size=64m,mode=1777'], stop_grace_period: '30s',
      environment: { PROJECTS_MANAGED: '1', PROJECTS_DATA_DIR: projects.dataDir, PROJECTS_BUSINESS_KEY_FILE: projects.keyFile, PROJECTS_BUSINESS_CONFIG_FILE: projects.businessConfigFile, PROJECTS_KNOWLEDGE_BASE_URL: '/apps/knowledge/' },
      healthcheck: { test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:4327/health').then(async r=>{const h=await r.json();if(!r.ok||h.managed!==true)process.exit(1)}).catch(()=>process.exit(1))"], interval: '10s', timeout: '5s', retries: 3, start_period: '10s' },
      logging: { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } },
      volumes: [mount(projects.dataDir), mount(projects.keyFile, true), mount(projects.businessConfigFile, true)],
    };
    ports.push(4327);
  }
  return { services, ports };
}
