# Verificación de la rama de seguridad

Ejecución real el 23 de noviembre de 2026, Node 24.22.3, MySQL 8.4 local en Docker. No se utilizaron servicios de terceros como objetivo de ataques.

| Comprobación | Resultado |
| --- | --- |
| `npm run test:security` | 7/7 aprobadas: CSRF, CORS, CSP de la aplicación en modo producción, cliente JSON/multipart/SSE y renderizado XSS |
| `npm run test:security:integration` | 1/1 aprobada contra HTTP/MySQL reales: login sin token, payload SQL, búsqueda, paginación y conservación de datos |
| `npm run security:lab` | Antes: 1 fila con contraseña incorrecta. Después: 0. Control positivo: 1. Tabla temporal cerrada |
| `npm run smoke` | Aprobado: sesiones A/B, aislamiento documental, permisos, conversaciones y métricas |
| `npm run test:integration` | 6/6 aprobadas: roles SQL, documentos, conversaciones e historial |
| `node scripts/google.integration.mjs` | 4/4 aprobadas con firmas de prueba y MySQL; no usa Google real |
| `npm run test:workflows` | Aprobado: correcciones, RH, onboarding, políticas, conocimiento y MFA |
| `npm run build` | Compilación del frontend aprobada |
| Inicio de sesión desde Chromium | Aprobado en el frontend de desarrollo con una cuenta demo, cookies y token CSRF reales |
| `npm test` | 83 ejecutadas: 73 aprobadas, 10 fallidas, 0 omitidas/canceladas |
| `git diff --check` | Aprobado |

## Fallos de la suite general

Los 10 fallos requieren fixtures que el seed estándar no crea: una prueba de colaboradores exige un usuario de la empresa Rockstar y nueve pruebas de horarios exigen esa empresa, sus 500 colaboradores y jornadas. La preparación anterior a esta rama ya registró los mismos 10 fallos (66 aprobadas de 76). En esta rama se agregan siete pruebas que pasan; no se desactivaron ni cambiaron sus aserciones para obtener un resultado favorable.

No se renombró Café Montaña a Rockstar ni se inventó que esos casos pasaran. La integración nueva usa una empresa propia, verifica aislamiento y elimina su fixture al terminar. Los scripts existentes se adaptaron al handshake CSRF, conservando sus aserciones.

## Evidencia visual

- `evidencias/simulacion.json`: resultados generados por las consultas y aserciones reales.
- `evidencias/simulacion.html`: reporte construido con esos resultados y contenido escapado.
- `evidencias/simulacion.png`: captura de ese reporte renderizado en Chromium, inspeccionada visualmente.

No son capturas de un sitio atacado ni pruebas de vulnerabilidad del login original. La variante vulnerable solo existe en el laboratorio opt-in. Para actualizar las evidencias, repetir el comando y tomar una nueva captura del HTML.

## Limitaciones

No se verificaron credenciales reales de Groq, Drive, Gmail ni un despliegue público HTTPS. CSP y cookies Secure se verificaron con configuración de producción en pruebas locales; eso no acredita certificados o proxy de un despliegue. La base local de desarrollo utiliza las credenciales del Compose y no es una configuración de producción. No se hizo pentesting de toda la aplicación ni se contactó al profesor.

## Repetición solicitada por el usuario

El 23 de noviembre de 2026 se repitieron `test:security` (7/7), `test:security:integration` (1/1), `test:integration` (6/6), `test:workflows`, `smoke`, `build` y `npm test` (73/83, con los mismos 10 fallos Rockstar). La API respondió correctamente al chequeo de salud.

En el arranque del entorno restaurado, una ejecución aislada de CSP agotó sus 15 segundos al cargar la aplicación. Se amplió exclusivamente el límite del proceso hijo a 120 segundos y se agregó `assert.ifError(result.error)` para mostrar errores de arranque explícitamente. No se eliminaron ni relajaron aserciones de seguridad. La repetición completa de seguridad terminó con 7/7 aprobadas; la comprobación CSP tardó aproximadamente 2,1 segundos con el entorno ya inicializado.
