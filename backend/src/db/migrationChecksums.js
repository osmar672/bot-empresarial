import {createHash} from 'node:crypto';
const rawDigest=sql=>createHash('sha256').update(sql,'utf8').digest('hex');
const lf=sql=>sql.replace(/\r\n/g,'\n');
// New entries use LF. Existing records may have been created from a CRLF checkout.
export const migrationChecksum=sql=>rawDigest(lf(sql));
export function matchesMigrationChecksum(applied,sql){
 const normalized=lf(sql);
 return new Set([rawDigest(sql),rawDigest(normalized),rawDigest(normalized.replace(/\n/g,'\r\n'))]).has(applied);
}
