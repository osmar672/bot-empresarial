import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function installDependencies(npmCli=process.env.npm_execpath){
 if(!npmCli||!fs.existsSync(npmCli)){console.error('Desde '+root+' ejecuta: npm ci --include=dev --bin-links=true');return 1;}
 console.log('Antes de instalar, detén los servidores del proyecto con Ctrl + C para liberar archivos nativos de Windows.');
 return new Promise(resolve=>{
  const child=spawn(process.execPath,[npmCli,'ci','--include=dev','--bin-links=true','--workspaces','--include-workspace-root'],{cwd:root,stdio:['inherit','pipe','pipe'],env:process.env});
  let recent='',settled=false;
  const forward=(stream,data)=>{stream.write(data);recent=(recent+data.toString()).slice(-65536);};
  child.stdout.on('data',data=>forward(process.stdout,data));
  child.stderr.on('data',data=>forward(process.stderr,data));
  child.on('error',error=>{console.error('No se pudo ejecutar npm:',error.message);settled=true;resolve(1);});
  child.on('close',code=>{
   if(settled)return;
   if(code!==0){
    if(/EPERM|EBUSY|EACCES/i.test(recent))console.error('\nWindows no permitió reemplazar un archivo. Si se menciona libvips-42.dll o Sharp, puede seguir cargado por otro servidor Node. Detén el backend y el frontend con Ctrl + C en sus terminales. Si persiste, reinicia Windows y ejecuta npm run setup antes de abrir los servidores. Revisa también los permisos o avisos del antivirus; no lo desactives.');
    console.error('Instalación incompleta. No ejecutes migraciones ni arranques la aplicación hasta que npm run setup termine sin errores.');
   }
   resolve(Number.isInteger(code)&&code>0?code:code===0?0:1);
  });
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await installDependencies();
