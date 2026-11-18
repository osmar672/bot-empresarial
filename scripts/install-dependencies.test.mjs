import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const installer=fileURLToPath(new URL('./install-dependencies.mjs',import.meta.url));
test('keeps npm failure and explains locked DLL without treating setup as successful',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'luma-installer-'));
 try{
  const fake=path.join(dir,'npm.cjs');
  fs.writeFileSync(fake,"console.error('npm error EPERM unlink libvips-42.dll');process.exit(1);");
  const result=spawnSync(process.execPath,[installer],{env:{...process.env,npm_execpath:fake},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/npm error EPERM unlink libvips-42.dll/);assert.match(result.stderr,/Ctrl \+ C/);assert.match(result.stderr,/reinicia Windows/);assert.match(result.stderr,/Instalación incompleta/);
  fs.writeFileSync(fake,'process.exit(0);');
  const success=spawnSync(process.execPath,[installer],{env:{...process.env,npm_execpath:fake},encoding:'utf8'});assert.equal(success.status,0);assert.doesNotMatch(success.stderr,/Instalación incompleta/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
