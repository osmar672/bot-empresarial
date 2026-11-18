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
