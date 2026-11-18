export function normalizeFolder(value){
 const input=String(value||'').trim();if(!input)return '';
 if(/^[A-Za-z0-9_-]{10,120}$/.test(input))return input;
 try{const url=new URL(input);if(url.protocol!=='https:'||url.hostname!=='drive.google.com')return input;return url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,120})(?:\/|$)/)?.[1]||url.searchParams.get('id')||input;}catch{return input;}
}
