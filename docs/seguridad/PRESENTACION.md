# Presentación: protección de Luma

Duración sugerida: 7–9 minutos. Completar nombres del equipo y coordinar la hora con el profesor.

## Diapositiva 1 — Objetivo y alcance (45 s)

Luma administra documentos y usuarios de varias empresas. Protegeremos las consultas, el contenido que muestra el navegador y las acciones realizadas con cookies. Todas las pruebas se ejecutaron en nuestro proyecto local con datos ficticios.

**Guion:** explicar por qué un fallo puede afectar información de otra empresa. Identificar rama `feat/seguridad-sql-xss-csrf`.

## Diapositiva 2 — Cuatro medidas distintas (1 min)

| Riesgo | Medida aplicada |
| --- | --- |
| SQLi | Parámetros, validación estricta y permisos mínimos recomendados |
| XSS | Texto React, Markdown sin HTML, URLs seguras y CSP en producción |
| CSRF | Token HMAC ligado a sesión, cookies HttpOnly/SameSite/Secure |
| CORS | Orígenes exactos HTTPS en producción, métodos y headers limitados |

**Guion:** CORS no reemplaza autorización y CSRF no elimina XSS.

## Diapositiva 3 — Qué investigamos sobre SQLi (1 min)

La vulnerabilidad mezcla datos con sintaxis SQL. Puede ser visible, ciega, temporal, fuera de banda o de segundo orden. Drupal CVE-2014-3704 muestra que también fallan capas de abstracción. MOVEit CVE-2023-34362 documenta SQLi sin autenticación explotada en 2023.

**Visual:** usar el cuadro de tipos de `INVESTIGACION_SQL.md`. Citar OWASP y los registros CVE; no atribuir cifras de impacto no verificadas.

## Diapositiva 4 — Demostración antes/después (2 min)

Preparar MySQL local y ejecutar desde la raíz:

```bash
npm run security:lab
```

Mostrar `docs/seguridad/evidencias/simulacion.html` o la captura `simulacion.png`.

**Guion:** señalar el mismo payload en ambas consultas. Antes: una fila con contraseña incorrecta. Después: cero filas con parámetros. Control positivo: una fila con datos correctos. La tabla es temporal y desaparece al cerrar la conexión. La versión vulnerable es un ejemplo aislado; no se añadió una puerta trasera a la API ni se afirma que el login previo fuera vulnerable.

## Diapositiva 5 — Comprobación de la aplicación real (1–2 min)

```bash
npm run test:security
npm run test:security:integration
```

Mostrar rechazo del login sin CSRF; rechazo de SQLi en login; búsqueda literal; origen desconocido con 403; token de otra sesión con 403; Markdown malicioso sin scripts ejecutables. No revelar `.env`, cookies de sesión ni claves.

## Diapositiva 6 — Evidencia y límites (1 min)

Mostrar resultados actuales de `VERIFICACION.md`. Diferenciar pruebas nuevas aprobadas, smoke HTTP y fallos previos de la suite general por fixtures Rockstar. Groq, Drive y correo externos no forman parte de esta demostración. Antes de desplegar: HTTPS, origen público explícito y usuario MySQL con privilegios mínimos.

## Diapositiva 7 — Conclusiones (45 s)

Separar instrucciones y datos evita el bypass demostrado. La validación debe comprobar toda la entrada. Los controles deben llegar al cliente: tokens en JSON, archivos y streaming. Las evidencias deben incluir un control positivo y reconocer sus límites. Ninguna prueba aislada garantiza seguridad total.

**Pregunta para la clase:** ¿Por qué desactivar múltiples sentencias no bloquea `OR 1=1` dentro de una sola consulta?
