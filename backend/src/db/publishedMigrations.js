// Published revisions verified against repository commits 2de8aa9 and 5b07875.
// LF and Windows CRLF forms of these exact revisions are compatible. Unknown edits still stop the migration runner.
const trackingFile='002_conversations_and_tracking.sql';
const originals=new Set(['2754fbc6f90e0bd515558bdbd4cfb54f71df893666fb0344cde6012b0318b3bb','f275882727168a7e6f7f745c55735aaf4b5f0bf93197105d72e0d8ad4ab581a2']);
const publishedRevisions=new Set(['60f5c44dc8c5e093bd9f0c6bbccf81d6aa5b0d1131936962962caae9744815e1','0296765da8d70869dfdf4aaaaeb01ea60edf6df1373c26e7557aac10f8a5ed55']);
export function isPublishedUpgrade(filename,applied,current){
 return filename===trackingFile&&originals.has(applied)&&publishedRevisions.has(current);
}
