import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {installDependencies} from './install-dependencies.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scope=process.argv.includes('--frontend')?'frontend':process.argv.includes('--backend')?'backend':'all';
const checkOnly=process.argv.includes('--check');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<16)){
 console.error('Luma requiere Node.js 22.16 o posterior. Versión actual: '+process.version);
 process.exit(1);
}
export async function missingDependencies(){
 const problems=[];
 const workspaces=scope==='all'?['.','frontend','backend']:[scope];
 for(const workspace of workspaces){
  const directory=path.resolve(root,workspace),require=createRequire(path.join(directory,'package.json'));
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  for(const name of Object.keys({...manifest.dependencies,...manifest.devDependencies})){
   try{require.resolve(name);}catch{problems.push(workspace+': '+name);}
  }
 }
 // Also exercise the entry points/native bindings used by the reported failures.
 for(const name of scope==='frontend'?['vite']:scope==='backend'?['mysql2/promise','sharp','@napi-rs/canvas']:['vite','mysql2/promise','sharp','@napi-rs/canvas']){
  try{
   const require=createRequire(path.join(root,name==='vite'?'frontend':'backend','package.json'));
   // A separate process releases native DLLs before npm ci replaces files on Windows.
   const loaded=spawnSync(process.execPath,['--input-type=module','-e','await import(process.argv[1])',pathToFileURL(require.resolve(name)).href],{encoding:'utf8',timeout:15000,windowsHide:true});
   if(loaded.error||loaded.status!==0)throw new Error('No se pudo cargar');
  }catch{problems.push(name+' (módulo incompleto o incompatible)');}
 }
 for(const name of scope==='frontend'?['vite']:scope==='backend'?[]:['vite','concurrently']){
  const binary=name+(process.platform==='win32'?'.cmd':'');
  const candidates=[path.join(root,'node_modules/.bin',binary),path.join(root,'frontend/node_modules/.bin',binary)];
  if(!candidates.some(candidate=>fs.existsSync(candidate)))problems.push('comando '+name);
 }
 return [...new Set(problems)];
}
const missing=await missingDependencies();
if(missing.length===0){if(checkOnly)console.log('Dependencias verificadas ('+scope+').');}
else{
 console.error('La instalación de Luma está incompleta: '+missing.join(', ')+'.');
 if(checkOnly){console.error('Desde '+root+' ejecuta: npm run setup');process.exit(1);}
 const npmCli=process.env.npm_execpath;
 if(!npmCli||!fs.existsSync(npmCli)){console.error('Desde '+root+' ejecuta: npm ci --include=dev --bin-links=true');process.exit(1);}
 console.log('Reparando dependencias desde la carpeta principal con npm ci…');
 const installed=await installDependencies(npmCli);
 if(installed!==0)process.exit(installed);
 // Verify in a fresh process: Node can cache earlier resolution/native-load failures.
 const verified=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--check',...(scope==='all'?[]:['--'+scope])],{cwd:root,stdio:'inherit',env:process.env});
 process.exit(verified.status|| (verified.error?1:0));
}
