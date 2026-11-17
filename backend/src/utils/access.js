// This guard handles explicit abuse; source permissions remain the security boundary.
export function questionRefusal(question){
 const q=question.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
 if(/(?:ignora|olvida|omite|salta).{0,50}(?:instrucciones|permisos|restricciones|reglas)|(?:system prompt|prompt del sistema)|(?:robar|revela|dame|muestra).{0,35}(?:contrasenas|claves secretas|credenciales)|(?:como|ayuda).{0,40}(?:hackear|acosar|estafar|fabricar una bomba)/u.test(q))return 'No puedo ayudar a evadir permisos, revelar secretos ni realizar actividades dañinas. Puedo orientarte sobre leyes y políticas autorizadas de tu empresa.';
 return null;
}
