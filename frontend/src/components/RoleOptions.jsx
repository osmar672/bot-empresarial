export default function RoleOptions({roles}){
 const groups=new Map();for(const role of roles){if(!groups.has(role.department))groups.set(role.department,[]);groups.get(role.department).push(role);}
 return Array.from(groups,([department,items])=><optgroup key={department} label={department}>{items.map(r=><option key={r.code} value={r.code}>{r.label}</option>)}</optgroup>);
}
