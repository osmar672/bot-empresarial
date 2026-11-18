import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFolder} from '../src/utils/drive.js';
import {folderSchema} from '../src/utils/validation.js';
import {driveError,validateFolder,listAllFiles} from '../src/services/drive.service.js';
test('Drive accepts a folder URL, shared-drive URL, or ID and rejects unrelated hosts',()=>{
 const id='folder_123456789';
 for(const link of [id,`https://drive.google.com/drive/folders/${id}?usp=sharing`,`https://drive.google.com/drive/u/0/folders/${id}`,`https://drive.google.com/open?id=${id}`])assert.equal(folderSchema.parse({folderId:link}).folderId,id);
 assert.equal(normalizeFolder(''), '');assert.throws(()=>folderSchema.parse({folderId:`https://evil.test/drive/folders/${id}`}));
});
test('Drive diagnosis distinguishes missing permissions, disabled API, quota, auth and network',()=>{
 assert.match(driveError({response:{status:404}}).message,/Comparte/);
 assert.match(driveError({response:{status:403,data:{error:{errors:[{reason:'accessNotConfigured'}]}}}}).message,/Habilita Google Drive API/);
 assert.equal(driveError({response:{status:401}}).status,503);
 assert.equal(driveError({response:{status:429}}).status,429);
 assert.equal(driveError({code:'ENOTFOUND'}).status,502);
});
test('Drive verifies folder type and maps access denial',async()=>{
 await assert.rejects(validateFolder('folder_123456789',{files:{get:async()=>({data:{mimeType:'application/pdf'}})}}),/no corresponde a una carpeta/);
 await assert.rejects(validateFolder('folder_123456789',{files:{get:async()=>{throw {response:{status:404}};}}}),/Comparte/);
});
test('Drive traverses all listing pages before a sync can remove disappeared files',async()=>{
 let count=0;const files=await listAllFiles('folder_123456789',{files:{list:async({pageToken})=>{count++;return {data:pageToken?{files:[{id:'second'}]}:{files:[{id:'first'}],nextPageToken:'next'}};}}});assert.equal(count,2);assert.deepEqual(files.map(f=>f.id),['first','second']);
});
