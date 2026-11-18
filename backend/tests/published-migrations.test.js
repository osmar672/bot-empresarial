import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isPublishedUpgrade} from '../src/db/publishedMigrations.js';
const filename='002_conversations_and_tracking.sql';
const original='2754fbc6f90e0bd515558bdbd4cfb54f71df893666fb0344cde6012b0318b3bb';
const digest=value=>createHash('sha256').update(value).digest('hex');
test('recognizes only the verified published upgrade; rejects unknown SQL edits and stored checksums',async()=>{
 const sql=await readFile(new URL('../../database/migrations/'+filename,import.meta.url),'utf8');
 assert.equal(isPublishedUpgrade(filename,original,digest(sql)),true);
 assert.equal(isPublishedUpgrade(filename,original,digest(sql+'\n-- changed')),false);
 assert.equal(isPublishedUpgrade(filename,'0'.repeat(64),digest(sql)),false);
 assert.equal(isPublishedUpgrade('001_init.sql',original,digest(sql)),false);
});
