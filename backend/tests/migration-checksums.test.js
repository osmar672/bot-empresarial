import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {migrationChecksum,matchesMigrationChecksum} from '../src/db/migrationChecksums.js';
import {isPublishedUpgrade} from '../src/db/publishedMigrations.js';
const raw=s=>createHash('sha256').update(s).digest('hex');
test('accepts stored Windows/Linux line endings without accepting SQL edits',()=>{
 const lf='CREATE TABLE pb_example (id INT);\nINSERT INTO pb_example VALUES (1);\n',crlf=lf.replace(/\n/g,'\r\n');
 for(const stored of [raw(lf),raw(crlf)])for(const file of [lf,crlf]){
  assert.equal(matchesMigrationChecksum(stored,file),true);
  assert.equal(matchesMigrationChecksum(stored,file.replace('VALUES (1)','VALUES (2)')),false);
 }
 assert.equal(migrationChecksum(lf),migrationChecksum(crlf));
 assert.equal(matchesMigrationChecksum('0'.repeat(64),lf),false);
});
test('recognizes exactly both published tracking revisions in LF/CRLF',()=>{
 const originals=['2754fbc6f90e0bd515558bdbd4cfb54f71df893666fb0344cde6012b0318b3bb','f275882727168a7e6f7f745c55735aaf4b5f0bf93197105d72e0d8ad4ab581a2'];
 const current=['60f5c44dc8c5e093bd9f0c6bbccf81d6aa5b0d1131936962962caae9744815e1','0296765da8d70869dfdf4aaaaeb01ea60edf6df1373c26e7557aac10f8a5ed55'];
 for(const applied of originals)for(const file of current)assert.equal(isPublishedUpgrade('002_conversations_and_tracking.sql',applied,file),true);
 assert.equal(isPublishedUpgrade('002_conversations_and_tracking.sql',originals[0],'0'.repeat(64)),false);
});
