# Flujos de RH, conocimiento revisado y protección del acceso

## Actualización

Desde la carpeta principal, con los servidores detenidos:

```powershell
git switch feat-yubran
git pull origin feat-yubran
npm run setup
npm run db:migrate
npm run dev
```

La migración 012 añade tablas sin reescribir migraciones anteriores. El arranque también crea automáticamente sus tablas si faltan. Las conexiones de la aplicación, respaldo y restauración fijan su zona de sesión MySQL en UTC; la interfaz presenta horas de Costa Rica.

## Correcciones de marcaciones

En **Mi perfil → Solicitar corrección de marcaciones** se elige una de las últimas 30 jornadas o «Olvidé ambas marcaciones», se propone entrada/salida y se justifica la solicitud. Las fechas deben haber pasado, la salida debe ser posterior y el intervalo no puede superar 24 horas. No se permiten intervalos superpuestos.

La solicitud conserva una copia de la entrada/salida originales. RH revisa en su bandeja; no se puede aprobar una solicitud propia. La decisión exige un comentario y se registra en auditoría. Una aprobación crea o ajusta la jornada, recalcula la evaluación de puntualidad cuando el horario histórico permite hacerlo y notifica al colaborador.

Si una marcación cambió después de solicitar el ajuste, la aprobación se detiene. Hay que rechazar la propuesta antigua y solicitar otra, para evitar sobrescribir una salida registrada posteriormente. Dos revisiones concurrentes no aplican el cambio dos veces. Las solicitudes pendientes se pueden cancelar desde el perfil.

## Bandeja de RH

**Solicitudes RH → Bandeja de tareas** reúne vacaciones, permisos por horas y correcciones. Tiene filtros de tipo, estado, nombre/correo y antigüedad, con paginación. Los datos y comentarios se limitan a RH/Administración de la empresa.

**Recordar al equipo de RH** crea avisos internos para los revisores que pueden decidir; excluye al propio solicitante. Permite un recordatorio por solicitud cada 24 horas, únicamente mientras esté pendiente. Es una acción manual; no envía correos ni mensajes externos.

## Preguntas de IA con revisión humana

Cuando el chat no encuentra fuentes y la pregunta trata asuntos empresariales o legales, se registra un pendiente de esa empresa. Las preguntas se agrupan por texto normalizado (mayúsculas, acentos, puntuación y espacios); no se afirma agrupación semántica. Una persona cuenta una sola vez por pregunta. Las preguntas fuera del tema o con instrucciones dañinas no se promueven.

En **Revisión de IA**, solo Administración ve los pendientes y su número de personas distintas. A partir de dos personas puede escribir una respuesta, añadir una referencia HTTPS y elegir los roles autorizados. Debe comprobar la referencia, su vigencia y jurisdicción: el sistema no navega, comprueba hechos ni publica información por su cuenta.

Al publicar, la respuesta se convierte en un documento indexado de la empresa y participa en la recuperación habitual del chat, con los mismos permisos y cuotas. Puede descargarse como texto. Antes de aprobarla no participa en las fuentes. **Retirar respuesta** elimina su documento del índice; se conserva el registro de revisión y se ocultan respuestas históricas cuyo acceso dependía exclusivamente de esa fuente retirada.

El conteo y las preguntas no se comparten entre empresas. No se modifica ni reentrena el modelo de IA.

## Políticas y aceptaciones

En **Políticas y firmas**, Administración publica un documento ya indexado y elige los cargos destinatarios. Se conserva una copia del texto indexado, su huella SHA-256 y una identificación de versión. Se presenta ese texto, que puede tener formato distinto al PDF original o errores de OCR; revisar el documento antes de publicarlo.

El colaborador abre la versión, declara que la ha leído y aceptado y confirma. El servidor registra usuario, fecha, declaración y huella del texto. Es una aceptación dentro de Luma; no es una firma digital certificada ni una prueba de que la persona leyó cada línea.

Una nueva publicación retira la edición anterior y pide una aceptación nueva. Las aceptaciones previas permanecen en el historial; si la edición cambió mientras estaba abierta, se debe abrir la vigente. Los permisos del documento se vuelven a comprobar al leer y aceptar. Administración ve el registro del equipo con paginación. Al eliminar el documento se conserva la copia de la edición y los recibos; el colaborador mantiene el registro de su aceptación, sin volver a acceder al contenido si perdió permisos.

## Ingreso de colaboradores

En **Solicitudes RH → Ingreso de colaboradores**, RH asigna documentos, capacitaciones o tareas a una persona, con instrucciones, enlace HTTPS opcional y fecha objetivo. No se asume que abrir un enlace completa una tarea.

El colaborador ve su lista en **Mi perfil → Mi lista de bienvenida**, entrega las tareas y RH valida la finalización. Otra persona de RH debe validar las tareas asignadas a un revisor. RH puede reabrir tareas para una nueva revisión. Se registran asignaciones, entregas, validaciones y reaperturas en auditoría y avisos internos. La lista y sus totales se consultan con paginación; los colaboradores solo ven sus tareas.

## Autenticación en dos pasos (TOTP)

En **Seguridad**, cada persona puede activar un autenticador, especialmente recomendable para Administración y RH:

1. Confirmar la contraseña actual y preparar el autenticador.
2. Escanear el QR con una aplicación compatible o introducir la clave manualmente.
3. Confirmar un código de seis dígitos. La preparación caduca en diez minutos.
4. Guardar los diez códigos privados de recuperación, que se muestran solo en ese momento. Cada uno funciona una sola vez.

Activar o desactivar la protección cierra las demás sesiones y renueva la actual. A partir de la activación, contraseña y Google requieren completar el segundo factor antes de emitir la sesión de acceso. El intento dura cinco minutos y admite cinco códigos fallidos. Los códigos TOTP ya utilizados se rechazan; se tolera una ventana de 30 segundos de diferencia de reloj a cada lado.

Los códigos de recuperación se guardan como hashes, y la clave TOTP queda cifrada con una clave derivada de `JWT_SECRET`. Es necesario conservar ese secreto de servidor al recuperar la base. Rotarlo invalida las sesiones y puede impedir usar el autenticador existente; conservar los códigos de recuperación para entrar, desactivar y configurar uno nuevo. No cambiar secretos de servidor sin un procedimiento de recuperación probado.

Restablecer la contraseña por correo no desactiva el segundo factor. Desactivarlo requiere contraseña y un código válido del autenticador o de recuperación. No hay recuperación administrativa que omita ambos factores ni obligación automática para toda la empresa; cada usuario debe activarlo y guardar sus códigos.

## Copias externas cifradas

El conector admite S3/compatibles y Google Cloud Storage. Está desactivado hasta configurar un proveedor y bucket privados. No se ha configurado ni contactado un bucket real en esta entrega.

Ejemplo S3 en el entorno privado del servidor:

```dotenv
BACKUP_EXTERNAL_PROVIDER=s3
BACKUP_EXTERNAL_BUCKET=tu-bucket-privado
BACKUP_EXTERNAL_PREFIX=luma
BACKUP_S3_REGION=us-east-1
BACKUP_EXTERNAL_VERIFY_CRON=30 4 * * 0
```

Usar un rol IAM o credenciales privadas estándar del SDK (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y, si corresponde, `AWS_SESSION_TOKEN`). Para un servicio compatible, configurar `BACKUP_S3_ENDPOINT` en HTTPS y `BACKUP_S3_PATH_STYLE` según su proveedor. El servidor necesita crear y leer objetos; las cargas grandes usan multipartes y pueden necesitar abortar una carga fallida. El conector no configura acceso público ni borra objetos externos.

Para GCS, usar `BACKUP_EXTERNAL_PROVIDER=gcs`, el bucket privado y `GOOGLE_APPLICATION_CREDENTIALS` con una cuenta de servicio autorizada para crear y leer objetos de ese bucket. La clave y las credenciales se guardan fuera de git y no deben compartirse en el chat.

El respaldo local debe estar activo y tener `BACKUP_ENCRYPTION_KEY`. Después de cada copia local se sube únicamente el archivo cifrado, se vuelve a descargar y se verifica su SHA-256 e integridad autenticada AES-GCM. Si falla la copia externa se conserva la local, se registra el fallo y el comando de respaldo devuelve error. La pantalla Seguridad muestra el estado sin revelar bucket, claves ni archivos.

Cada domingo a las 04:30, Costa Rica, se descarga y verifica otra vez la copia externa verificada más reciente, mientras el servidor permanezca encendido. Esto comprueba recuperación e integridad del archivo cifrado; no equivale a restaurar una base MySQL completa cada semana.

```powershell
npm run backup
npm run backup -- verify-remote luma-NOMBRE.sql.gz.enc
npm run backup -- download-remote luma-NOMBRE.sql.gz.enc recuperado.sql.gz.enc
npm run backup -- restore recuperado.sql.gz.enc --database policybot_recuperacion
npm run backup -- restore recuperado.sql.gz.enc --database policybot_recuperacion --apply
```

La descarga verifica antes de guardar y no reemplaza archivos existentes. La restauración exige una base nueva y vacía, y rechaza la base activa. Consultar también `HERRAMIENTAS_PERSONAL_Y_MOVIL.md`. Programar ensayos completos de restauración en un entorno aislado; el ensayo automático disponible usa Docker/MySQL desechable. Los archivos de `backend/uploads`, las claves de cifrado y las credenciales requieren respaldo separado. Configurar la retención remota en el proveedor y conservar la clave de respaldo fuera del mismo servidor.

## Comprobaciones

- `npm run test:workflows`: MySQL real; correcciones, conflictos, concurrencia, recordatorios, tareas de ingreso, aceptación por versión, revocación, preguntas distintas por empresa, recuperación real de una respuesta revisada y su retiro, TOTP con vector RFC, sesiones, códigos de recuperación, límites y reto después de Google (identidad de Google sustituida en la prueba).
- `npm run test:external-backup`: S3 contra servidor local de prueba; cargas simples y multipartes, descarga exacta, guardado sin sobrescritura y rechazo de archivos alterados. No acredita envío a almacenamiento externo real ni verifica el adaptador GCS con credenciales reales.
- `npm run test:backup-restore`: respaldo y restauración del esquema completo en MySQL desechable, incluidos los nuevos objetos de la migración 012.
- Chromium: bandeja RH, ingreso/entrega/validación, móvil, publicación y aceptación de política, publicación de respuesta revisada, activación TOTP y acceso con código de recuperación. Sin errores de ejecución.
- Regresión: asistencia, operaciones, herramientas de personal y diez pruebas de acceso/Google; compilación de producción.

Ejecutar pruebas con usuarios ficticios sobre una base de desarrollo y sin una clave de envío de correo activa. Las pruebas de almacenamiento usan un servidor local y credenciales ficticias, sin contactar proveedores reales.
