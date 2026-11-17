import {useState} from 'react';
export default function RoleAccess({roles,selected,onChange,disabled=false}){
 const [query,setQuery]=useState('');
 const normalize=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
 const visible=roles.filter(r=>normalize(r.label+' '+r.department).includes(normalize(query)));
 const count=new Set(['admin',...selected]).size;
 return <details className="role-access"><summary>Acceso: {count} de {roles.length} roles</summary>
  <label className="field">Buscar rol o área<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ej. Finanzas, analista…"/></label>
  <div className="role-access-list">{visible.map(role=><label className="role-access-option" key={role.code}>
   <input type="checkbox" checked={role.code==='admin'||selected.includes(role.code)} disabled={disabled||role.code==='admin'} onChange={e=>onChange(e.target.checked?[...new Set(['admin',...selected,role.code])]:['admin',...selected.filter(r=>r!=='admin'&&r!==role.code)])}/>
   <span>{role.label}<small>{role.department}</small></span>
  </label>)}{!visible.length&&<p>No hay roles que coincidan con la búsqueda.</p>}</div>
  <p className="fineprint">Solo Administrador gestiona el sistema. Los demás cargos necesitan acceso explícito a cada documento.</p>
 </details>;
}
