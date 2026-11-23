# Asignación de Seguridad aplicada a Luma

Rama: `feat/seguridad-sql-xss-csrf`. Fecha: 23 de noviembre de 2026.

## Correspondencia con el PDF

| Paso | Entrega |
| --- | --- |
| 1. SQL, XSS y CSRF | Consultas preparadas, validación estricta, renderizador seguro, CSP y tokens CSRF |
| 2. CORS | Allowlist exacta de orígenes, métodos/headers limitados y pruebas de rechazo |
| 3. Investigación | [INVESTIGACION_SQL.md](INVESTIGACION_SQL.md) con fuentes y casos reales |
| 4. Ataque controlado | Laboratorio MySQL temporal, [resultado JSON](evidencias/simulacion.json), [reporte HTML](evidencias/simulacion.html) y [captura](evidencias/simulacion.png) |
| 5. Presentación | [PRESENTACION.md](PRESENTACION.md), guion de siete diapositivas y demostración |

La asignación pide coordinar una exposición con el profesor. Esa gestión corresponde al equipo; no se envían mensajes ni se agenda una clase automáticamente.

## Medidas concretas

**SQL.** El proyecto ya utilizaba `mysql2.execute` con parámetros y bcrypt. Se preserva esa separación entre consulta y datos y se desactiva explícitamente `multipleStatements` en el pool normal. Las migraciones mantienen su conexión separada porque ejecutan DDL controlado del repositorio. Se refuerzan los límites de email/contraseña en login y se sustituye `parseInt` por validación Zod completa de paginación/búsqueda/rol en usuarios: `1; DROP TABLE...` devuelve 400. Los fragmentos SQL dinámicos de filtros se construyen con opciones internas; los valores se pasan como parámetros. No se eliminan comillas ni palabras SQL de textos legítimos: eso no sustituye parametrización.

**XSS.** Los nombres y mensajes se muestran como texto React. El chat usa `SafeMarkdown`: omite HTML crudo, bloquea esquemas activos en enlaces y no carga imágenes remotas procedentes de respuestas/documentos. Los enlaces de tareas reutilizan la validación de URL. La CSP de producción limita scripts a la aplicación y Google Identity; prohíbe objetos, cambios de base URL y embeber la aplicación. Las pruebas renderizan el componente real con HTML y enlaces maliciosos. En desarrollo la CSP sigue desactivada para Vite; no se acredita CSP de producción por observar solo el servidor de desarrollo.

**CSRF.** `GET /api/csrf-token` entrega un token HMAC SHA-256 ligado al nonce de una cookie y a la cookie de sesión actual, con vencimiento de una hora. Cada POST/PUT/PATCH/DELETE exige `X-CSRF-Token`, incluso login, registro, multipart y streaming. La cookie CSRF es HttpOnly, SameSite=Strict, sin Domain y Path=/; en producción usa Secure y prefijo `__Host-`. La sesión conserva HttpOnly, SameSite=Lax y Secure en producción. Cambiar de sesión invalida el token anterior. Se rechazan cookies ambiguas, tokens alterados, vencidos o de otra sesión. El frontend obtiene un token antes de cada escritura, agrupa solicitudes simultáneas de token y no reintenta automáticamente operaciones que modifiquen datos. Clientes HTTP de pruebas hacen el mismo handshake; no existe bypass para tests.

**CORS.** `PUBLIC_APP_URL` y `CORS_ORIGINS` definen orígenes completos, incluyendo esquema y puerto. No se confía en Host ni X-Forwarded-Host para autorizar. En producción se requiere una lista HTTPS explícita; `*` no se admite. Desarrollo permite localhost/127.0.0.1 en 5173 y 4000. Se comprueba Origin también en GET; un origen desconocido recibe 403 sin `Access-Control-Allow-Origin`. Preflight admite GET, HEAD, POST, PUT, PATCH, DELETE y OPTIONS, y únicamente Content-Type y X-CSRF-Token. Se usa `Vary` para evitar mezclar respuestas entre orígenes. CORS controla navegadores: un cliente sin Origin sigue sujeto a autenticación, autorización y CSRF.

## Ejecutar y verificar

Desde la raíz, con Node >=22.16 y Docker:

```bash
npm ci
# Conservar backend/.env existente; no sustituir credenciales.
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

Para una base nueva, ejecutar también el bootstrap de columnas que utiliza el servidor (hay una limitación previa que lo condiciona a un usuario específico):

```bash
node --input-type=module -e 'import {ensureCustomScheduleColumns} from "./backend/src/db/bootstrapCustomSchedules.js"; import {pool} from "./backend/src/db/pool.js"; try {await ensureCustomScheduleColumns();} finally {await pool.end();}'
```

En otra terminal:

```bash
npm run test:security
npm run test:security:integration
npm run security:lab
npm run smoke
npm run build
npm test
```

`test:security` no requiere MySQL. La integración necesita una base migrada y JWT_SECRET configurado; crea y elimina su propia empresa ficticia. El laboratorio requiere MySQL local y desarrollo; usa solo una tabla TEMPORARY en una conexión dedicada, no publica una ruta vulnerable ni toca usuarios reales. El comando genera HTML y JSON nuevos; la captura incluida corresponde a la ejecución documentada. Para actualizarla, abrir el HTML generado en el navegador y capturar la pantalla. No probar payloads contra servicios ajenos.

## Producción

Configurar en el `.env` privado o variables del proceso:

```dotenv
NODE_ENV=production
PUBLIC_APP_URL=https://luma.ejemplo.com
CORS_ORIGINS=
```

Añadir a `CORS_ORIGINS` solo orígenes HTTPS explícitos separados por coma si hacen falta. La aplicación está diseñada para frontend y API en el mismo origen; usa proxy inverso HTTPS en producción y el proxy de Vite en desarrollo. Un frontend desplegado en otro sitio requeriría adaptar también credenciales y política SameSite; habilitar CORS por sí solo no completa ese despliegue.

Mantener JWT_SECRET aleatorio de al menos 32 caracteres y nunca subir `.env`. Usar usuario MySQL con privilegios mínimos; separar privilegios DDL de migraciones de los de ejecución cuando se despliegue. No reutilizar las contraseñas del Compose ni cuentas de demostración en producción. Groq y Drive no son necesarios para esta demostración.

## Límites de la evidencia

La consulta vulnerable del laboratorio es un ejemplo deliberado en una tabla temporal, no una afirmación de que el login original fuera vulnerable. El login real ya usaba parámetros y bcrypt. El control positivo demuestra que la sentencia preparada sigue funcionando con entradas correctas. La prueba de API comprueba además el rechazo de bypass en login, búsqueda literal, validación de paginación y conservación del usuario de prueba.

La suite general tiene fallos previos que requieren la empresa Rockstar y sus horarios. Consultar [VERIFICACION.md](VERIFICACION.md) para los resultados de esta rama. Una captura del laboratorio no sustituye las pruebas de API ni acredita auditoría profesional de toda la aplicación.
