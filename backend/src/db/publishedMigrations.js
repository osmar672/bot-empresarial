// Published revisions verified against repository commits 2de8aa9 and 5b07875.
// Only this exact pair is compatible. Unknown edits still stop the migration runner.
const trackingFile='002_conversations_and_tracking.sql';
const original='2754fbc6f90e0bd515558bdbd4cfb54f71df893666fb0344cde6012b0318b3bb';
const publishedRevision='60f5c44dc8c5e093bd9f0c6bbccf81d6aa5b0d1131936962962caae9744815e1';
export function isPublishedUpgrade(filename,applied,current){
 return filename===trackingFile&&applied===original&&current===publishedRevision;
}
