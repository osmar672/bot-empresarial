# Verificación de esta entrega corregida

- **15 pruebas automatizadas de Node.js: PASS**, incluida estructura de tablas prefijadas, claves foráneas de aislamiento, migrador no destructivo, ausencia de secretos en la plantilla y flujo de recuperación RAG.
- **Comprobación de sintaxis:** PASS en los archivos JS del backend modificados y la nueva prueba.
- **Diagnóstico `npm run db:doctor`: ejecutado** y detectó correctamente que **no hay MySQL en este entorno** en `127.0.0.1:3307`.
- **Migración `npm run db:migrate` contra MySQL real: PENDIENTE**. El servidor MySQL de Windows del usuario no es accesible desde aquí; en este entorno tampoco hay MySQL/Docker. No se afirma que se hayan creado tablas en la base de datos del usuario.
- **Compilación completa de React: PENDIENTE**. El ZIP original contenía dependencias del backend pero no el ejecutable Vite; el proyecto entrega su `package-lock.json` para instalar todo con `npm install` en la raíz.
- **Groq y Google Drive reales: PENDIENTES**. Se necesitan las claves y el JSON privado del usuario; no se copian ni se incluyen en el ZIP.
- **Seguridad de entrega:** `backend/.env`, archivos de credenciales y `node_modules` fueron excluidos; `backend/.env.example` contiene solo placeholders de claves.

La configuración original adjunta apuntaba a `MYSQL_DATABASE=tablero` y `MYSQL_PORT=3307`; este último es el motivo de conexión rechazada cuando no hay MySQL escuchando. Si tu MySQL usa 3306, cambia el puerto en el `.env` privado.

Para verificar por completo en Windows: `npm install`, `npm run db:doctor`, `npm run db:migrate`, `npm run db:seed` (solo para datos demo), `npm test`, `npm run build`, `npm run dev` y `npm run smoke` (con datos demo).

## Personal, OCR, reportes y aplicación instalable (18 de noviembre de 2026, Costa Rica)

Implementados permisos por horas con revisión de RH, política configurable y movimientos de saldo de vacaciones, OCR local español/inglés, exportaciones Excel/PDF, búsqueda con permisos y PWA con pantalla de desconexión. Migración 011 aplicada sin modificar checksums anteriores; el arranque crea sus tablas automáticamente.

Verificado con MySQL real: días laborables y feriados, descuento atómico ante dos aprobaciones simultáneas, saldo insuficiente, fechas/horas y conflictos, separación por usuario/empresa, lectura de los archivos Excel/PDF generados y texto seguro en celdas de Excel. OCR real sobre un PDF de imágenes y un documento mixto. No se ha medido una carga de 1 GiB ni un PDF escaneado de 1500 páginas en estas pruebas.

Restauración real del esquema completo de Luma en un contenedor MySQL 8.4 desechable: conserva texto con comillas/punto y coma, JSON, binarios, fechas y columnas generadas. Rechaza respaldo alterado, destino no vacío y base activa. También se creó y verificó un respaldo cifrado de la base de desarrollo en la nube. Clave y configuración automática guardadas en `.env` privado, excluido de git; el servidor se reinició con respaldos habilitados. No equivale a una copia externa: guardar la clave y los archivos en almacenamiento separado.

Chromium: configuración RH, ajuste de saldo, revisión de permisos, formulario del colaborador, descarga real Excel, búsqueda, diseño móvil de 390 px y ausencia de errores de ejecución. Compilación de producción, service worker y caché exclusivamente pública verificados; con la red desactivada aparece la página de desconexión. No se afirma instalación física en un teléfono ni avisos con la aplicación cerrada.

Correo: verificación/recuperación y consumo único de enlaces probados con transporte de prueba, incluida concurrencia y reintentos. La configuración activa de este entorno no contiene `RESEND_API_KEY`, `MAIL_FROM` ni `PUBLIC_APP_URL`; no se envió ningún correo real. Se añadió `npm run mail:test` y su envío explícito a una cuenta existente. No se registraron claves, enlaces privados ni destinatarios personales en el repositorio.

Regresiones aprobadas: operaciones, personalización del perfil, gestión laboral, asistencia y 10 pruebas de integración de acceso/Google. `npm run build` y `git diff --check` correctos. Instrucciones operativas en `docs/HERRAMIENTAS_PERSONAL_Y_MOVIL.md`.
