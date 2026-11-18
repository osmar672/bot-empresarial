# Luma

Rediseño del espacio de trabajo con conversación, biblioteca, permisos y perfiles laborales.

## Actualizar una instalación

Usar Node >=22.16 y MySQL 8.4. Conservar backend/.env y los originales en backend/uploads (no versionados). Respaldar la base antes de migrar una instalación existente.

```bash
npm ci
npm run db:doctor
npm run db:migrate
npm run build
npm run dev
```

Las migraciones históricas mantienen sus archivos y checksums. El ejecutor adapta los ADD COLUMN IF NOT EXISTS a consultas de metadatos compatibles con MySQL y evita añadir columnas ya presentes. La migración 004 añade perfiles y almacenamiento de originales; el valor 0 en max_documents significa sin límite de cantidad para los planes actuales. No borra datos existentes ni aplica las migraciones sobre tablas sin prefijo pb_. No desactives la comprobación de checksums si una instalación tiene versiones diferentes.

## Perfil laboral

Administración → Colaboradores → Perfil laboral permite registrar cargo, departamento, vacaciones disponibles, horario, descanso e ingreso. Cada persona consulta sus propios datos en Mi perfil. Los valores sin registrar se muestran como pendientes, nunca se deducen del reglamento o del chat. Solo los administradores de la misma empresa pueden actualizarlos.

## Documentos grandes y originales

PDF sin límite fijo de páginas y sin el anterior tope de 350 fragmentos o 400.000 caracteres. MAX_UPLOAD_MB=1024 (1 GB por archivo, 1.073.741.824 bytes) es el valor predeterminado para instalaciones nuevas y puede ajustarse en backend/.env; instalaciones existentes conservan el valor previamente configurado. La interfaz consulta el límite real al servidor. La cantidad de documentos no tiene cuota; siguen aplicándose los recursos disponibles de disco, memoria y tiempo de procesamiento. Las preguntas mensuales conservan sus cuotas.

La selección múltiple procesa los archivos secuencialmente y muestra progreso y errores por archivo. Mantener abierta la pestaña durante la carga. La extracción e indexación siguen siendo síncronas; para grandes volúmenes simultáneos se requeriría una cola de trabajo persistente. PDF escaneados sin texto requieren OCR, que no está incluido.

Los originales nuevos se guardan en backend/uploads y se descargan desde la biblioteca o las fuentes del chat, con autenticación y permisos comprobados en cada solicitud. Respaldar esta carpeta junto con MySQL. Archivos antiguos sin original deben volver a subirse para habilitar descarga. Los de Drive abren el enlace original y siguen dependiendo de sus permisos en Google. La búsqueda compara embeddings en lotes para no cargar toda la biblioteca simultáneamente; el proveedor local sigue siendo léxico.

## Validación

```bash
npm test
npm run test:integration
npm run test:files
npm run build
# Con API activa y datos demo preparados en la base local:
npm run smoke
```

`test:files` genera un PDF de 220 páginas, comprueba más de 350 fragmentos, recuperación, descarga idéntica al original, privacidad por empresa y rol, y persistencia del perfil. Crea y elimina sus empresas de prueba. No usa Groq ni Drive.

La generación real requiere GROQ_API_KEY y acceso a api.groq.com. Google Drive necesita la cuenta de servicio documentada. No se han validado llamadas reales a esos proveedores sin credenciales.

El servidor permite hasta 30 minutos para recibir una subida. En despliegues con proxy inverso debe configurarse también su límite de cuerpo a 1 GB y un tiempo de recepción compatible. La recepción se guarda temporalmente en disco; la extracción todavía utiliza memoria y no se ha validado con un PDF real de 1 GB. El procesamiento de documentos grandes depende de los recursos del servidor.

## Diagnóstico de Google Drive

En Documentos → Google Drive, el estado distingue un JSON ausente, vacío, inválido o de tipo OAuth. «Comprobar conexión» valida las credenciales locales y, cuando hay una carpeta guardada, consulta Google para verificar acceso real. Una carpeta guardada por sí sola no acredita conectividad.

1. En Google Cloud habilitar Google Drive API para el proyecto.
2. Crear o usar una cuenta de servicio y descargar una clave JSON completa. Un JSON vacío (`{}`), una API key o un JSON de cliente OAuth no sirven para esta integración.
3. Configurar el archivo de forma privada en el servidor y apuntar GOOGLE_APPLICATION_CREDENTIALS a su ruta. No pegar claves privadas en chat ni subirlas al repositorio.
4. Compartir la carpeta como Lector con el client_email de esa cuenta. La aplicación muestra ese correo únicamente a administradores cuando las credenciales están presentes.
5. Permitir HTTPS saliente hacia www.googleapis.com y oauth2.googleapis.com. En este entorno la adición se guardó como borrador: revisar y guardar en ajustes y publicar para activar la configuración; un borrador no modifica la red en ejecución.
6. Pegar el enlace completo o el ID de la carpeta, guardar, comprobar conexión y sincronizar.

Los errores de permisos, API deshabilitada, autenticación, cuota y conexión tienen mensajes distintos. La sincronización parcial muestra los archivos fallidos y no anuncia éxito completo. Las subcarpetas no se recorren automáticamente.

## Avisos y códigos HTTP

Las eliminaciones de documentos y conversaciones utilizan un diálogo de Luma. Cancelar, cerrar o pulsar Escape no envía una solicitud de eliminación. El foco inicial está en Cancelar.

Los avisos distinguen éxito, información y errores. Muestran el código HTTP real cuando está disponible, detalles de campos inválidos y una orientación de recuperación. La falta de conexión se identifica sin inventar un código HTTP.

- 2xx (200, 201, 204): solicitudes completadas correctamente.
- 3xx (301, 302, 304, 307, 308): redirecciones o información de caché, no errores del servidor. El navegador sigue automáticamente las redirecciones habituales; no se inventa un código intermedio si no está disponible.
- 4xx: datos inválidos (400), autenticación (401), permisos (403), recurso ausente (404), conflicto (409), tamaño (413), formato (415), contenido no procesable (422) y cuota (429).
- 5xx: fallo interno (500), proveedor externo (502), servicio no disponible (503) o tiempo de espera (504).

Las respuestas de error del backend incluyen error, status y code; la validación también incluye details. Los errores inesperados no exponen datos internos en la respuesta al usuario.

## Interfaz del asistente

La conversación utiliza una sola columna. El botón Historial abre un panel de búsqueda que se cierra con Escape o al seleccionar una conversación. Nuevo chat inicia un hilo vacío, sin borrar los anteriores. Las respuestas agrupan fuentes y copiar en su pie; los enlaces conservan la comprobación de permisos del servidor. La biblioteca y la navegación principal siguen disponibles. La estructura está en Chat.jsx y los estilos específicos en frontend/src/styles/chat-workspace.css.

## Mascota del asistente

El pingüino de Luma es un recurso PNG transparente en frontend/public/mascot/luma-penguin.png, rediseñado a partir de la referencia del usuario. PenguinMascot.jsx lo anima con CSS sin añadir librerías de animación.

Estados conectados al flujo del chat: espera, lectura del texto del usuario, carga del historial, preparación de respuesta, llegada de fragmentos de texto, finalización, interrupción y error. La preparación comienza al enviar; la animación de respuesta se activa al recibir un evento delta y la celebración al finalizar la solicitud. Al detener una respuesta vacía se muestra un mensaje de interrupción, no un indicador de escritura infinito.

La mascota saluda al abrir una conversación nueva y reacciona al tocarla, enfocarla o pasar el cursor. En la bienvenida, hace un saludo ocasional mientras espera; no lo repite en pestañas ocultas ni mientras el usuario escribe. No tiene botón de pausa visible. prefers-reduced-motion desactiva los movimientos y el seguimiento del cursor, incluido el saludo, manteniendo los mensajes de estado. La mascota no reproduce audio ni accede al micrófono.

Se verificaron los estados con respuestas HTTP y SSE simuladas en navegador, el saludo automático y al pasar el cursor, seguimiento del puntero, ausencia del botón de pausa, movimiento reducido y la visibilidad del cuadro de escritura en móvil; esas comprobaciones no acreditan llamadas reales al proveedor de IA.

### Ayuda por inactividad

Tras 20 segundos sin actividad y con el campo vacío, el pingüino muestra una invitación breve como «¿Necesitas ayuda con algo?». El aviso dura 8 segundos y no se repite hasta que haya nueva interacción. Es un mensaje local de interfaz: no envía preguntas a la IA ni crea mensajes en el historial.

Escribir, pulsar o desplazarse reinicia la espera. No aparece mientras hay un borrador, una respuesta en curso, un error, el historial abierto ni la pestaña oculta. Al volver a la pestaña comienza una espera nueva. Las animaciones siguen respetando prefers-reduced-motion.

## Preguntas y respuestas por voz

- Micrófono: dicta una pregunta en español y la coloca en el campo para revisarla; no la envía automáticamente.
- Ondas de voz: activa una sesión explícita de conversación. Al terminar de reconocer una pregunta, la envía, lee la respuesta completa y vuelve a escuchar. Cerrar modo de voz detiene micrófono y lectura. La generación de texto en curso tiene su propio botón Detener respuesta.
- Altavoz junto a una respuesta: lectura manual. Detener lectura cancela el audio.

Usa SpeechRecognition/webkitSpeechRecognition y speechSynthesis del navegador. El dictado funciona solo donde el navegador lo ofrece (habitualmente Chrome o Edge), requiere permiso de micrófono y HTTPS o localhost. La disponibilidad, voces e idioma dependen del navegador y del sistema. El reconocimiento puede usar servicios externos del navegador; no se garantiza procesamiento local ni funcionamiento sin Internet. La aplicación no guarda grabaciones de audio; guarda la pregunta transcrita mediante el flujo habitual del chat.

La sesión se detiene al cambiar de página, abrir otro historial, iniciar chat nuevo, ocultar la pestaña, perder permisos o fallar el servicio de voz. No se activa al cargar la página. No reconoce mientras lee para evitar transcribir su propia voz. La mascota distingue escucha de micrófono y reproducción.

La lectura elimina marcas de Markdown, enlaces y números de citas y divide respuestas largas en fragmentos. Las funciones de reconocimiento y síntesis fueron verificadas con APIs simuladas en navegador, junto con dictado revisable, envío explícito, conversación automática, interrupción, permisos denegados y diseño móvil. La captura y reproducción reales con hardware requieren validación en el navegador del usuario.

## Marcar ficha: entrada y salida

Aplicar `npm run db:migrate` antes de iniciar la versión con marcaciones. La migración 005_attendance.sql añade pb_attendance sin modificar jornadas anteriores ni tablas ajenas.

Al iniciar sesión se ofrece un recordatorio opcional. El botón Marcar ficha permanece en la barra superior; Mi perfil muestra el estado y un historial paginado con filtros por fecha y día, con entrada, salida y duración de jornadas cerradas. Cada usuario consulta y marca únicamente su propia jornada, dentro de su empresa.

Entrada y salida se guardan con UTC_TIMESTAMP del servidor MySQL; la interfaz muestra America/Costa_Rica. No se aceptan horas ni identidades suministradas por el cliente. Un bloqueo transaccional y una restricción única impiden dos jornadas abiertas incluso con solicitudes concurrentes.

Cerrar sesión ofrece Marcar salida y salir, Salir sin marcar o Volver cuando hay una jornada abierta. No se registra nada por iniciar sesión, cerrar pestaña, perder conexión o salir sin marcar. Si falla el registro de salida, la sesión se mantiene abierta y se muestra el error. Si no se puede consultar el estado de jornada, sigue disponible salir sin marcar.

Las marcaciones no alteran automáticamente vacaciones, horarios ni saldos laborales. No se ha añadido edición retroactiva o gestión de marcaciones de otras personas.

Validación adicional: `npm run test:attendance` prueba contra la base local migrada: autenticación, hora del servidor, rechazo de suplantación, concurrencia, privacidad entre empleados/empresas y cierre de sesión sin salida automática. Crea y elimina sus empresas de prueba.

## Historial por fecha y vacaciones

Actualizar con `git pull origin main`, ejecutar `npm run db:migrate` con MySQL activo y reiniciar API y frontend mediante `npm run dev`. La migración 006 añade solicitudes de vacaciones y una cola de correos. No modifica las marcaciones existentes.

Si la sección de marcación responde HTTP 404 «Ruta no encontrada», el servidor de API que responde no incorpora la ruta de la versión actual. La interfaz muestra instrucciones para actualizar y reiniciar y ofrece Reintentar conexión. El endpoint /api/health informa las capacidades attendance, attendanceHistory y vacationRequests; esas capacidades no sustituyen aplicar las migraciones. Un 404 no se resuelve borrando tablas.

Mi perfil → Entradas y salidas permite seleccionar desde/hasta y un día de la semana. La búsqueda usa la fecha y el día en Costa Rica, incluidas entradas cerca de medianoche, y pagina de 20 en 20 sin limitarse a las últimas 30 jornadas. Solo muestra marcaciones del usuario autenticado.

Mi perfil → Solicitar vacaciones pide fecha inicial, fecha final y motivo (10–2.000 caracteres). No admite fechas pasadas, periodos invertidos o solapamientos con solicitudes propias pendientes/aprobadas. La persona puede cancelar una solicitud pendiente. El perfil muestra las últimas 50 solicitudes, su estado y la respuesta de RH.

Solicitudes RH está disponible para Administrador, rrhh y los cargos rrhh_* de la misma empresa. Muestra las últimas 100 solicitudes, priorizando las pendientes, y permite aprobar/rechazar una sola vez con comentario. Nadie puede revisar su propia solicitud; requiere otro revisor autorizado. La decisión queda guardada con autor y fecha. No descuenta automáticamente un saldo de vacaciones: la cantidad de días laborales y feriados requiere una política específica de la empresa.

## Correo de bienvenida a Gmail u otro destinatario

El correo se dirige al email de la cuenta registrada, también cuando Administración crea un colaborador. No incluye contraseñas ni acredita verificación de propiedad del correo.

Se usa la API HTTPS de Resend. Para envío real:

1. Crear una cuenta de Resend y verificar un dominio remitente. Para pruebas, respetar las restricciones de destinatarios del proveedor.
2. Configurar RESEND_API_KEY de forma privada en backend/.env o como secreto del entorno; nunca compartirlo por chat ni versionarlo.
3. Configurar MAIL_FROM con un remitente permitido, por ejemplo `Luma <bienvenida@tu-dominio-verificado.com>`. Gmail es el destinatario; no hace falta la contraseña de Gmail del destinatario.
4. Permitir acceso HTTPS a api.resend.com. El requisito de secreto y ese dominio se guardaron en el borrador del entorno cloud: revisar, guardar y publicar para activarlos. Esto no configura por sí mismo el equipo Windows.
5. Reiniciar el backend. Las cuentas nuevas encolan el correo en la misma transacción de creación. Un worker revisa pendientes cada minuto, con reintentos limitados y clave de idempotencia estable para evitar duplicados durante reintentos del proveedor. Se conservan los fallidos para diagnóstico.

Si falta configuración, la cuenta se crea y se indica «correo pendiente». Solo se informa aceptación del servicio si la API confirma un identificador de correo; eso no garantiza llegada a la bandeja principal. Revisar Spam. Los fallos del proveedor no exponen su respuesta cruda ni claves. Los correos se generan y almacenan en pb_mail_outbox, con acceso mediante el backend, no rutas públicas.

No se realizó un envío real en este entorno porque no hay credenciales ni remitente configurados. Se validaron cola, destinatario, ausencia de contraseñas, entrega simulada, idempotencia y reintentos. `npm run test:workforce` debe ejecutarse sin RESEND_API_KEY para evitar envíos externos; crea y elimina empresas de prueba.

### Creación automática de la tabla de correos

Antes de aceptar conexiones, el backend comprueba si existe pb_mail_outbox en la base indicada por MYSQL_DATABASE. Si falta, la crea usando la definición canónica de 006_vacations_mail.sql. No usa un nombre de base fijo ni borra o altera una tabla existente. El usuario de MySQL necesita permiso CREATE y las tablas base pb_users/pb_companies ya deben existir.

Esto resuelve la ausencia de la cola de correo al registrar cuentas; no sustituye las migraciones de vacaciones, marcaciones o el resto del esquema. Las migraciones se pueden ejecutar después sin perder los correos encolados. Si no es posible crear la tabla, el arranque informa el requisito y no inicia una API incompleta.

Prueba de regresión: scripts/mail-bootstrap.integration.mjs, solo contra una base vacía desechable luma_migration_test_*. Verifica creación, inserción de bienvenida, segundo arranque sin pérdida de datos y compatibilidad con la migración posterior.
