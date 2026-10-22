import {mkdir,rm,copyFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeFiles} from './files.mjs';
import {project,validateProject} from './check.mjs';
export async function build({root=project}={}){
 await validateProject(root); // Fail before touching the previous good build.
 const stage=path.join(root,'.build-'+randomUUID()),out=path.join(root,'dist'),backup=stage+'-previous';
 await mkdir(stage);
 try{
  for(const [dst,src]of Object.entries(runtimeFiles)){const target=path.join(stage,dst);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,src),target);}
  let hadPrevious=false;try{await rename(out,backup);hadPrevious=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await rename(stage,out);}catch(e){if(hadPrevious)await rename(backup,out);throw e;}
  if(hadPrevious)await rm(backup,{recursive:true,force:true});
 }finally{await rm(stage,{recursive:true,force:true});}
 return Object.keys(runtimeFiles);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const files=await build();console.log(`Built ${files.length} explicitly allowlisted runtime files → dist/`);}
