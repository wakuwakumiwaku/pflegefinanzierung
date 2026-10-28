import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeFiles} from './files.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export function createAppServer({root=path.join(project,'dist'),basePath='/'}={}){
 if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw Error('basePath must be an absolute slash-terminated path');
 return http.createServer(async(req,res)=>{
  const send=(status,text)=>{res.writeHead(status,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:text);};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');send(405,'Method not allowed');return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{send(400,'Bad URL');return;}
  if(!pathname.startsWith(basePath)){send(404,'Not found');return;}
  const relative=pathname.slice(basePath.length)||'index.html';
  if(!Object.hasOwn(runtimeFiles,relative)){send(404,'Not found');return;}
  try{
   const realRoot=await realpath(root),target=await realpath(path.join(root,relative));
   if(!target.startsWith(realRoot+path.sep)){send(404,'Not found');return;}
   const data=await readFile(target);
   res.writeHead(200,{'content-type':types[path.extname(relative)]||'application/octet-stream','content-length':data.length,'x-content-type-options':'nosniff','cache-control':'no-cache','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:data);
  }catch{send(404,'Not found');}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const port=Number(process.env.PORT||3011);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');const server=createAppServer();server.listen(port,'127.0.0.1',()=>console.log(`Pflegefinanzierung: http://127.0.0.1:${port}/`));}
