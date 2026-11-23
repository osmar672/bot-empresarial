# Investigación: inyección SQL

Consulta de fuentes: 23 de noviembre de 2026. Alcance: SQLi en aplicaciones web y aplicación práctica a Node/MySQL de Luma.

## Qué es y cómo funciona

Una SQLi ocurre cuando datos no confiables pasan a formar parte de la gramática de una consulta. La base interpreta parte de una entrada como operadores, comentarios o instrucciones en lugar de compararla como un valor. El origen puede ser un formulario, query string, cabecera, archivo importado, otra API o incluso un dato previamente almacenado [1].

En `WHERE email='` + entrada + `'`, una entrada con comilla puede cerrar el literal. En nuestro laboratorio, `' OR 1=1 -- ` introduce una condición verdadera y comenta la comprobación restante. MySQL exige espacio después de `--`; por eso el payload lo incluye. El laboratorio usa un marcador de contraseña simplificado; el login real usa un hash bcrypt y consulta parametrizada.

La causa no es que la contraseña sea débil ni que el navegador permita un carácter: es mezclar instrucciones y datos en el servidor. HTML escaping previene otra clase de problemas, pero no hace segura una consulta SQL.

## Familias de ataques

| Familia | Funcionamiento | Qué puede observarse |
| --- | --- | --- |
| Tautología/bypass | Modifica una condición para hacerla verdadera | Acceso o registros sin credenciales correctas |
| UNION / in-band | Une resultados de otra consulta compatible | Datos ajenos en la propia respuesta |
| Basada en errores | Provoca errores que revelan estructura o datos | Mensajes del motor y diferencias de respuesta |
| Ciega booleana | Formula condiciones verdaderas/falsas sin devolver el dato | Cambios en contenido, estado o cantidad de filas |
| Ciega temporal | Hace que una condición cambie el tiempo de ejecución | Diferencias de latencia; deben descartarse ruido y carga |
| Fuera de banda | Usa capacidades del motor para enviar datos por otro canal | Actividad externa; depende de permisos y red |
| Consultas apiladas | Intenta ejecutar una segunda instrucción | Posibles cambios adicionales si el driver lo permite |
| Segundo orden | Guarda una entrada aparentemente inocua y otro flujo la concatena después | El fallo aparece en una operación posterior |

Estas categorías se solapan: una SQLi ciega también puede ser de segundo orden. Deshabilitar varias sentencias limita consultas apiladas, pero no impide una tautología en una sola sentencia. Un ORM tampoco garantiza seguridad si se construye SQL crudo concatenado [1].

## Impacto y condiciones

El daño depende de los permisos de la cuenta, el motor, los datos y el aislamiento entre empresas. Puede incluir lectura de documentos y usuarios de otra empresa, alteración de información, eliminación o indisponibilidad. Acceder a archivos o ejecutar órdenes del sistema depende de funciones/permisos específicos: no es una consecuencia universal de cualquier SQLi [1].

En una aplicación multiempresa, `company_id=?` debe obtenerse de la identidad autenticada y conservarse en todas las consultas sensibles. Parametrizar un ID entregado por el usuario no demuestra que ese usuario esté autorizado a verlo. SQLi y autorización son controles diferentes.

## Dos casos reales documentados

**Drupal, CVE-2014-3704.** Drupal core 7.x anterior a 7.32 construía incorrectamente sentencias preparadas al expandir argumentos de arreglos con claves manipuladas. El registro CVE describe SQLi remota a través de esa expansión [4]. Enseñanza: la biblioteca que transforma parámetros también puede contener defectos; utilizar parámetros no elimina la necesidad de actualizar dependencias y revisar consultas generadas.

**MOVEit Transfer, CVE-2023-34362.** El registro describe SQLi sin autenticación que permitía acceder a la base, inferir su estructura/contenido y, según el motor, alterar o borrar elementos. El registro señala explotación real en mayo y junio de 2023 [5]. Enseñanza: proteger el login no basta; un endpoint expuesto de transferencia o integración puede comprometer datos. Se requieren parches y respuesta a incidentes, además de controles de desarrollo.

No se atribuyen cifras de víctimas ni pérdidas no comprobadas. Son casos históricos usados para entender causas y consecuencias; este proyecto no intenta reproducir sus exploits.

## Prevención en capas

1. **Sentencias preparadas:** estructura SQL fija y valores por separado. En mysql2, `execute('... WHERE email=?',[email])`. Una contraseña con comillas continúa siendo una cadena.
2. **Identificadores controlados:** nombres de tablas/columnas y dirección de orden no se parametrizan como valores; mapear opciones a constantes internas de una allowlist. Nunca copiar un nombre de columna recibido a una plantilla SQL [1].
3. **Validación de tipo, rango, longitud y forma:** un número de página debe ser un entero completo, no el prefijo numérico que acepte `parseInt`. Validar no reemplaza parametrización.
4. **Permisos mínimos:** cuenta normal sin privilegios de administración; reservar cambios de esquema para migraciones. Limitar exposición y destinos de red de la base [1].
5. **Errores públicos genéricos:** no devolver SQL, stack traces ni credenciales. Mantener evidencias internas sin secretos y con acceso restringido.
6. **Pruebas:** entradas con comillas/comentarios, controles positivos y negativos, aislamiento de empresas y revisión de todos los caminos, incluidos importadores y tareas en segundo plano.
7. **Mantenimiento:** actualizar frameworks, drivers y motores; proteger respaldos y practicar recuperación. Un WAF puede ser defensa adicional, no sustituto de corregir la consulta.

Escapar manualmente cadenas es frágil frente al contexto, charset y configuración del motor. Borrar palabras como SELECT o caracteres como `'` da falsos positivos y puede admitir variantes. El documento de OWASP recomienda parametrización y allowlists de estructuras en vez de ese enfoque [1].

## Diferencias respecto a XSS, CSRF y CORS

SQLi cambia instrucciones interpretadas por la base. XSS hace interpretar contenido como código en el navegador: requiere renderizado seguro y codificación contextual [2]. CSRF aprovecha cookies enviadas automáticamente para provocar acciones: requiere tokens ligados a sesión y defensas complementarias como SameSite [3]. CORS limita lectura/uso entre orígenes en navegadores; no es autenticación ni una barrera contra clientes HTTP arbitrarios.

Una XSS puede actuar dentro del origen y obtener un token CSRF, así que CSRF no compensa XSS. Una CSP reduce posibilidades de ejecución, pero no justifica insertar HTML no confiable. Cada capa aborda un mecanismo distinto.

## Aplicación y conclusión del experimento

El laboratorio ejecutó dos consultas sobre el mismo registro ficticio, en la misma conexión MySQL local: concatenación devolvió **1 fila**, parametrización devolvió **0 filas** con el payload, y el control correcto devolvió **1 fila**. Se verificaron esos valores con aserciones, no con una respuesta escrita manualmente. HTML, JSON y captura están en `evidencias/`.

Esto demuestra el mecanismo concreto probado. No demuestra ausencia de todas las SQLi ni reemplaza una auditoría. Las pruebas adicionales usan los endpoints reales para comprobar que el payload no inicia sesión y que la búsqueda lo interpreta como dato.

## Fuentes consultadas

Se leyeron los textos oficiales desde sus repositorios públicos. Los sitios web de OWASP y algunos avisos externos estaban bloqueados por la política de red del entorno; los enlaces de abajo son las copias efectivamente consultadas, no se simula acceso a páginas bloqueadas.

1. [OWASP, SQL Injection Prevention Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.md): causa, parámetros, identificadores, riesgos del escape y privilegios mínimos.
2. [OWASP, Cross Site Scripting Prevention Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.md): codificación por contexto y renderizado seguro.
3. [OWASP, Cross-Site Request Forgery Prevention Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.md): double-submit firmado ligado a sesión, encabezados y límites de SameSite.
4. [CVE Program, CVE-2014-3704](https://github.com/CVEProject/cvelistV5/blob/main/cves/2014/3xxx/CVE-2014-3704.json): descripción y referencias al aviso Drupal SA-CORE-2014-005.
5. [CVE Program, CVE-2023-34362](https://github.com/CVEProject/cvelistV5/blob/main/cves/2023/34xxx/CVE-2023-34362.json): descripción, versiones afectadas y explotación documentada de MOVEit.
