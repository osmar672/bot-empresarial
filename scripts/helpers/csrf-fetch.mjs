// HTTP clients used by integration tests follow the same CSRF handshake as the browser.
export async function csrfFetch(input,init={}){
 const url=new URL(input);
 if(!['GET','HEAD','OPTIONS'].includes((init.method||'GET').toUpperCase())&&url.pathname.startsWith('/api/')){
  const headers=new Headers(init.headers);
  const response=await globalThis.fetch(new URL('/api/csrf-token',url),{headers:{cookie:headers.get('cookie')||''}});
  if(!response.ok)throw new Error('No se pudo obtener token CSRF: '+response.status);
  const {token}=await response.json();
  const cookies=(response.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]);
  const previous=(headers.get('cookie')||'').split(';').map(c=>c.trim()).filter(Boolean);
  const names=new Set(cookies.map(c=>c.split('=')[0]));
  headers.set('cookie',[...previous.filter(c=>!names.has(c.split('=')[0])),...cookies].join('; '));
  headers.set('x-csrf-token',token);
  init={...init,headers};
 }
 return globalThis.fetch(input,init);
}
