import { join } from 'node:path';
export function projectInventory({id,config,working,workspaceId,storage,reminderSpaces,slidesSpaces,polaris,financeMounts,financeProjectName,intelligenceRuntime,locations,add,file,source,safePath,paths,object}) {

      if (safePath(config.dataDir)) file('项目记录', 'sqlite', join(config.dataDir, `${id}.db`));
}
