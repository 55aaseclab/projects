function projectDirectory(items,{spaceId,nativePath}) {
 if(!Array.isArray(items)||items.length>200)throw Error('Invalid project summaries.');
 const seen=new Set();return items.map(item=>{
  if(!item||typeof item.resourceId!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.resourceId)||seen.has(item.resourceId)||typeof item.name!=='string'||!item.name||typeof item.goal!=='string')throw Error('Invalid project summary.');
  seen.add(item.resourceId);
  const encoded=[...JSON.stringify([spaceId,item.resourceId])].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
  return {id:'project-'+encoded,appId:'projects',resourceId:item.resourceId,kind:'project',name:item.name,description:item.goal,href:nativePath+'#'+new URLSearchParams({project:item.resourceId,space:spaceId,view:'overview'})};
 });
}

export function createWebIntegration() {
  return {
    "slug": "projects",
    "policy": "grant",
    "kind": "proxy",
    "nativePort": 4327,
    workbenchDirectory: {path:"/api/business/workbench/projects",operation:"list_projects",title:{en:"Projects",zh:"项目"},project:projectDirectory}
  };
}
