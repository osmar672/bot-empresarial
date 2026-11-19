# Personal, documentos y acceso móvil en Luma

## Actualizar en Windows

Detén los servidores de Luma antes de instalar: Windows bloquea las DLL de imágenes cuando están en uso. Desde la carpeta principal:

```powershell
git switch feat-yubran
git pull origin feat-yubran
npm run setup
npm run db:migrate
npm run dev
```

El servidor también crea automáticamente las tablas nuevas de la migración 011 al iniciar. No hay que pegar SQL ni modificar migraciones anteriores.

## Permisos por horas

En **Mi perfil**, el colaborador elige categoría, fechas, horas y comentario privado. Hasta 24 horas por solicitud, con hora de Costa Rica y sin fechas pasadas. Se impiden superposiciones con otros permisos pendientes/aprobados y con vacaciones aprobadas.

En **Solicitudes RH → Permisos por horas**, RH acepta o rechaza con comentario. Nadie puede revisar su propia solicitud. Las decisiones generan una notificación y un registro de auditoría. Solo el solicitante y RH/Administración de su empresa acceden al motivo. Estos permisos no cambian el salario ni el saldo de vacaciones.

## Saldo automático de vacaciones

En **Solicitudes RH → Reglas y saldos**:

1. Elegir el horario individual completo (siete días asignados) o los días laborables comunes de la empresa.
2. Registrar los feriados en **Calendario**; no se presume un calendario legal universal.
3. Registrar el saldo inicial de cada persona con su justificación.
4. Activar **Descontar días automáticamente al aprobar**.

La aprobación calcula días laborables inclusivos, excluye feriados registrados y descuenta dentro de la misma transacción. Sin horario/saldo o con saldo insuficiente, no se aprueba. Dos revisiones simultáneas no duplican el descuento. Aperturas, ajustes y descuentos aparecen en **Mi perfil → Saldo y movimientos**. La política nueva no recalcula aprobaciones anteriores. No se implementa devengo anual ni reglas legales no configuradas.

Los ajustes desde el editor laboral también generan movimientos; no se puede borrar un saldo conocido dejándolo vacío. Las solicitudes pendientes se cancelan sin descuento. No hay revocación automática de vacaciones ya aprobadas; una corrección posterior del saldo debe quedar justificada por RH.

## PDF escaneados y OCR

La extracción reconoce automáticamente páginas con poco texto mediante Tesseract en español e inglés, renderizadas localmente. Los idiomas vienen en las dependencias de npm; el documento no se sube a servicios de OCR. Los PDF mixtos conservan su texto nativo y reconocen las páginas escaneadas. El seguimiento muestra página actual y la biblioteca identifica las páginas procesadas con OCR.

No se introduce un límite por número de páginas. Se mantiene el límite configurable de carga (por defecto 1024 MiB). El tiempo de un escaneo extenso depende de su resolución y del servidor; se procesa una página a la vez, pero la lectura del PDF y la indexación siguen necesitando memoria y almacenamiento suficientes. OCR puede cometer errores: revisar cifras y textos originales antes de tomar decisiones. PDF cifrado, ilegible o sin texto recuperable puede fallar y se puede reintentar desde Documentos.

## Reportes

**Reportes** descarga archivos Excel reales (.xlsx) o PDF con entradas/salidas, puntualidad, vacaciones, permisos y consumo de IA. Hora de Costa Rica, intervalo máximo de 366 días y 10 000 filas por exportación. Si se supera el límite, se pide reducir el intervalo en lugar de truncar registros.

Los colaboradores exportan datos propios; RH exporta los de su empresa. Solo Administración exporta consumo. Se omiten motivos médicos/personales y comentarios privados de los archivos. Las celdas de texto de Excel se guardan como texto, incluso si empiezan por `=`. La puntualidad histórica usa la evaluación guardada al marcar entrada; si no existe, indica «Sin evaluación».

## Búsqueda

La lupa superior busca en tres categorías: documentos autorizados (nombre/contenido indexado), conversaciones propias (título/preguntas) y solicitudes visibles para el rol. Cada resultado permite abrir su sección; los chats abren la conversación encontrada. Las solicitudes muestran el detalle privado solo cuando el usuario tiene permiso. El servidor vuelve a comprobar el acceso al descargar documentos.

## Aplicación instalable

Compilar y servir desde HTTPS, o localhost para pruebas:

```powershell
npm run build
npm start
```

El navegador compatible ofrece **Instalar Luma**; en iPhone/iPad se muestra la instrucción de Compartir → Añadir a pantalla de inicio. En desarrollo con Vite no se registra el service worker para evitar interferencias durante cambios de código.

La caché contiene exclusivamente iconos, manifiesto y una página pública de desconexión. No guarda chats, respuestas de API, fotos ni documentos. Sin internet no se confirman marcaciones ni se encolan solicitudes. Las actualizaciones se aplican al pulsar el aviso, para que puedas terminar tu trabajo antes.

En **Notificaciones** puedes activar avisos del navegador. Son opcionales y genéricos; el detalle privado permanece en Luma. Funcionan mientras la aplicación está abierta, sujeto a los límites de ejecución del navegador. No se implementa Web Push con la aplicación cerrada.

## Correo real

Configurar valores privados en `backend/.env` o en el entorno del servidor:

```dotenv
RESEND_API_KEY=clave_privada
MAIL_FROM=Luma <remitente@dominio-verificado>
PUBLIC_APP_URL=https://tu-aplicacion.example
```

El remitente debe estar verificado en Resend y la URL debe ser accesible por la persona que abre el enlace. No subir `.env` ni claves al repositorio.

```powershell
npm run mail:test
npm run mail:test -- --to tu-correo@gmail.com --send
```

El primer comando solo comprueba presencia de configuración sin mostrar secretos. El segundo envía enlaces de verificación y recuperación exclusivamente a una cuenta existente con ese correo; no crea usuarios ni procesa la cola de otros destinatarios. La aceptación del proveedor no demuestra entrega en la bandeja: revisar Spam y completar los enlaces. Verificación dura 24 horas y recuperación 30 minutos; son de un solo uso. La contraseña se cambia únicamente al completar el formulario de recuperación.

## Respaldos y restauración

Para activar respaldos locales cifrados sin copiar una clave a mano:

```powershell
npm run backup -- init
```

Genera una clave solo si falta y activa `BACKUP_ENABLED` en el `.env` privado. Conserva ajustes existentes y no imprime la clave. Si la clave está gestionada por el entorno externo, debe permanecer configurada allí. Reiniciar el servidor para activar la programación (03:15, Costa Rica, salvo `BACKUP_CRON`). Guardar una copia segura de la clave fuera del servidor y copiar los respaldos a almacenamiento separado: sin la clave no se pueden recuperar.

```powershell
npm run backup
npm run backup -- verify backend/backups/archivo.sql.gz.enc
npm run backup -- restore backend/backups/archivo.sql.gz.enc --database policybot_recuperacion
npm run backup -- restore backend/backups/archivo.sql.gz.enc --database policybot_recuperacion --apply
```

Crear primero una base nueva y vacía en MySQL, con permisos para el usuario configurado. Sin `--apply` se verifica la integridad y se muestra el plan. Con `--apply` se verifica todo el respaldo antes de ejecutar SQL y se comparan recuentos de filas. Rechaza la base activa y destinos con cualquier tabla. No borra tablas existentes. Si MySQL falla a mitad de restauración, el destino puede quedar parcial: revisar ese destino aislado y volver a probar en otra base vacía.

Los respaldos incluyen tablas `pb_`, imágenes de perfil en base de datos, tokens y configuración privada; permanecen cifrados en disco. Incluyen también el historial de migraciones `pb_schema_migrations`. Excluyen los archivos originales de `backend/uploads` y las credenciales externas; respaldar estos elementos por separado. Tras restaurar y validar una base, aplicar migraciones con el código de la misma versión y cambiar su conexión de forma planificada. No restaurar sobre producción sin probar primero.

## Verificación realizada

- Migraciones: actualización de la base existente y aplicación completa en MySQL aislado.
- `npm run test:people-tools`: reglas, feriados, revisión concurrente, saldo insuficiente, permisos, fechas/horas, acceso entre empresas, búsqueda y lectura de Excel/PDF generados.
- `npm run test:ocr`: reconocimiento real de PDF de imágenes y PDF mixto; no utiliza un proveedor externo.
- `npm run test:backup-restore`: Docker con MySQL desechable, esquema completo, cifrado/restauración, datos binarios/JSON/fechas/columnas generadas y rechazo de archivo alterado/destino no vacío.
- `node scripts/security-mail.integration.mjs`: consumo único, concurrencia de envío con transporte de prueba, reintentos y conservación de clave privada. No acredita entrega real de Resend.
- Regresión: operaciones, perfil y gestión laboral.
- Navegador Chromium: flujos RH, permisos, reportes, búsqueda, móvil y service worker de producción con navegación sin conexión.

Para las pruebas de integración que usan usuarios ficticios, ejecutar sin `RESEND_API_KEY` y sobre una base de desarrollo. El test de restauración requiere Docker y la imagen `mysql:8.4`; elimina únicamente su propio contenedor al terminar.
