export const attendanceDate=value=>value?new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value)):'—';

export function costaRicaDay(value=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
