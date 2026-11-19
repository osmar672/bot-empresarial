# Operaciones, RH, documentos, chat y seguridad de Luma

Estos cambios se publican en `feat-yubran`. La instalación no necesita nuevas dependencias. Al reiniciar el backend se preparan las tablas nuevas con `CREATE TABLE IF NOT EXISTS`, sin borrar datos existentes ni reescribir el historial de migraciones. MySQL debe permitir crear tablas. Para registrar formalmente la migración también puedes ejecutar `npm run db:migrate`.

```powershell
git switch feat-yubran
git pull origin feat-yubran
npm run dev
```

Detén la instancia anterior con Ctrl + C antes de reiniciar.

## 1. Notificaciones

La campana muestra avisos propios con contador de pendientes, paginación y acciones para leer uno o todos. Se consulta cada treinta segundos y al abrirla. Aprobar o rechazar vacaciones avisa al solicitante; una solicitud nueva avisa a RH y Administración; los documentos disponibles y los fallos de procesamiento generan avisos.

Los avisos se guardan en MySQL. Se filtran por empresa, destinatario y permisos actuales. Si una persona pierde acceso a un documento o deja de tener funciones de RH, sus avisos restringidos dejan de mostrarse. El sistema no envía mensajes por Slack ni notificaciones del sistema operativo.

## 2. Panel de RH

**Solicitudes RH → Resumen del equipo** presenta solicitudes pendientes, llegadas puntuales y tarde, jornadas vencidas sin entrada, personas de vacaciones y el listado paginado del equipo. Incluye saldos informados, área, horario y primera entrada del día. La búsqueda opera sobre nombre, correo y área.

**Solicitudes de vacaciones** conserva la revisión, comentarios y protección frente a autoaprobaciones. Los estados de asistencia son indicadores para revisión de RH, no decisiones disciplinarias. No se inventan saldos ni horarios. Se respetan descansos, vacaciones aprobadas y feriados registrados. Cuando hay una instantánea de puntualidad se usa esa evaluación; los cambios de horario posteriores no convierten automáticamente una entrada anterior en falta.

## 3. Documentos

La página utiliza una transferencia con porcentaje real y una cola persistente. Después de recibir el archivo, el servidor extrae e indexa el texto en segundo plano. Los avances de indexación corresponden a los lotes de fragmentos procesados, no a una cuenta atrás simulada. Puedes salir de la página; el proceso continúa mientras el servidor permanezca abierto.

Se muestran los trabajos, su etapa y los errores, con reintento y paginación. Al reiniciar, el trabajador recupera los trabajos interrumpidos. Un bloqueo de MySQL impide que dos trabajadores procesen la misma cola a la vez. El servidor espera al trabajador durante su cierre normal.

Los duplicados se detectan con SHA-256 dentro de cada empresa para el contenido actual y las cargas en curso. Los originales anteriores se incorporan al seguimiento por lotes. No se comparan datos ni se revelan coincidencias de otras empresas. No se limita la biblioteca a un número fijo de documentos; se mantiene el límite de tamaño configurado para cada archivo.

**Versiones del documento** permite descargar originales publicados y subir una nueva versión de un archivo local. El original vigente y sus permisos se conservan hasta publicar correctamente la siguiente versión. Los documentos de Drive se actualizan en su carpeta de origen. Las versiones y su descarga están restringidas a Administración. La eliminación del documento elimina también sus versiones; no es una papelera.

Se conservan los endpoints síncronos anteriores para compatibilidad; la interfaz nueva usa `/documents/upload-queued`, `/documents/:id/new-version` y `/documents/:id/reindex-queued`.

## 4. Chat

Las conversaciones existentes continúan guardándose. Encima del cuadro de escritura puedes elegir hasta treinta documentos o consultar todas tus fuentes autorizadas. La selección se valida de nuevo en el servidor y se combina con los permisos de empresa y rol. La memoria usada para responder también se restringe a esa selección. Elegir documentos no concede acceso a documentos restringidos.

Las respuestas terminadas admiten valoración y comentario opcional. **Actividad y calidad**, visible para Administración, muestra totales y comentarios compartidos, sin abrir historiales privados de otras personas. La valoración no entrena al modelo ni agrega respuestas externas automáticamente.

## 5. Calendario

Incluye vacaciones aprobadas del equipo, solicitudes pendientes visibles para la cuenta, feriados registrados por RH y horarios semanales. No se muestran motivos ni comentarios de vacaciones. RH puede seleccionar el horario de una persona de su empresa y gestionar feriados. Las demás personas consultan su propio turno.

Los feriados se registran expresamente; no se inventa un calendario legal oficial. Tampoco se descuentan vacaciones automáticamente. Un feriado registrado se excluye de la racha de puntualidad. Los turnos mostrados son el horario semanal actual, no una reconstrucción histórica de todas sus versiones.

## 6. Correo y seguridad de cuenta

**Seguridad** permite consultar la verificación de correo, solicitar un nuevo enlace, ver las sesiones activas y cerrar otras sesiones. El inicio de sesión normal y el de Google crean sesiones revocables con vencimiento de ocho horas. Las cookies anteriores siguen siendo compatibles hasta que caducan o se revocan.

**Olvidé mi contraseña**, en la pantalla de acceso, devuelve una respuesta genérica tanto si el correo existe como si no. El enlace dura treinta minutos, se guarda mediante un hash y solo puede consumirse una vez. Restablecer la contraseña revoca las sesiones anteriores. Los enlaces de verificación duran veinticuatro horas y también son de un solo uso.

El correo utiliza la cola del servidor y el servicio Resend ya previsto en el proyecto:

```dotenv
PUBLIC_APP_URL=https://tu-dominio.example
RESEND_API_KEY=
MAIL_FROM=Luma <correo@tu-dominio-verificado.example>
```

Introduce valores reales únicamente en `backend/.env` o en los secretos del servidor, nunca en Git ni en el chat. En producción `PUBLIC_APP_URL` debe ser HTTPS. Es una URL fija configurada por el servidor; no se toma del encabezado enviado por el visitante. Los enlaces usan un fragmento que la página retira de la barra de direcciones al cargarse.

Los tokens no se incluyen en respuestas API ni en auditoría. La cola privada de correo conserva el mensaje que debe entregar, con su enlace, como cualquier sistema de envío transaccional. Si falta configuración, la cuenta sigue pudiendo entrar con su contraseña y se muestra que el envío está pendiente. No se puede garantizar la entrega a Gmail hasta configurar el remitente y probarlo con el proveedor.

## 7. Respaldos y auditoría

### Respaldos del servidor

Están desactivados de forma predeterminada hasta configurar una clave y almacenamiento privados. El operador del servidor, no una cuenta de empresa, gestiona estos archivos: contienen la base de datos completa de la instalación.

```dotenv
BACKUP_ENABLED=true
BACKUP_ENCRYPTION_KEY=
BACKUP_DIRECTORY=./backups
BACKUP_CRON=15 3 * * *
BACKUP_RETENTION_DAYS=14
```

La clave debe contener exactamente 64 caracteres hexadecimales aleatorios (32 bytes). Puedes generarla localmente con el módulo `crypto` de Node y guardarla en los secretos del servidor. Conserva una copia segura separada: sin ella los respaldos no se pueden descifrar. Cambiar la clave no vuelve a cifrar los respaldos anteriores.

La programación usa la hora de Costa Rica. El servidor debe estar ejecutándose. La copia usa una instantánea consistente de las tablas `pb_`, compresión y AES-256-GCM, con verificación de autenticidad y retención automática de los archivos que genera. No se desactiva la verificación TLS de ningún servicio. Los fallos quedan registrados sin volcar datos o claves.

Los avatares y portadas guardados en MySQL están incluidos. Los originales de documentos que están en `backend/uploads` requieren además una copia de esa carpeta; configura su respaldo fuera de la aplicación. Para protegerte de la pérdida del disco, replica también los respaldos cifrados a almacenamiento externo y prueba regularmente la recuperación.

Comandos del operador desde la raíz:

```bash
npm run backup
npm run backup -- verify backend/backups/archivo.sql.gz.enc
npm run backup -- decrypt backend/backups/archivo.sql.gz.enc backend/backups/restauracion.sql
```

El descifrado verifica autenticidad antes de publicar la salida y no sobrescribe un archivo existente. Estos comandos no restauran ni borran la base. Para recuperar, el operador debe cargar el SQL verificado en una base **vacía** y recuperar también los originales de `uploads`. La restauración sobre una base en uso requiere un procedimiento de mantenimiento propio; no se ejecuta automáticamente.

### Auditoría

**Actividad y calidad** registra desde esta actualización quién cambió un rol, solicitó o resolvió vacaciones, cargó una versión, eliminó un documento, cambió permisos, gestionó un feriado o revocó sesiones. Se conserva el nombre del actor aunque luego se elimine la cuenta. Los eventos se consultan por empresa, tipo y página. No existe una API para editar el registro.

No se inventan registros de acciones anteriores a la instalación. Un administrador de MySQL sigue teniendo control sobre sus tablas; este registro no es una certificación criptográfica externa.

## Verificación

```bash
RESEND_API_KEY= node scripts/operations.integration.mjs
node --test backend/tests/retrieval-selection.test.js
npm run build
```

En PowerShell, vacía la variable del proceso con `$env:RESEND_API_KEY=''` antes de la integración. La prueba no debe enviar correos externos. Crea y elimina empresas temporales propias y verifica notificaciones, RH, calendario, permisos, cola, duplicados, versiones, reintento, valoración, sesiones, recuperación, verificación y cifrado. Los respaldos de prueba se descifran y se manipulan para comprobar que se rechazan alteraciones. Los correos reales y la copia externa del respaldo requieren configuración del operador.
