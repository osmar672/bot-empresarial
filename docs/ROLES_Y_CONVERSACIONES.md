# Roles, fuentes y conversaciones

Esta implementación usa MySQL 8.4. No borra ni reemplaza las tablas existentes.
Ejecutar desde la raíz: `npm run db:migrate`. La migración `002_roles_conversations.sql` conserva los mensajes anteriores y agrega:

- Los cuatro roles originales en `pb_users`, ampliados a un catálogo de 100 por la migración `003_role_catalog.sql`.
- `pb_documents.allowed_roles`: lista de roles autorizados. Los administradores siempre tienen acceso dentro de su empresa.
- `pb_conversations`: conversaciones privadas por usuario y empresa.
- `pb_messages.conversation_id`, rol al preguntar, fecha de finalización y error separado de la respuesta. Las claves compuestas impiden asociar mensajes con conversaciones de otro usuario o empresa.
- Índices para historial por usuario y conversación. Las preguntas y respuestas permanecen en `pb_messages`; no hay borrado automático.

## Permisos

| Acción | Administrador | RRHH | Supervisor | Colaborador |
| --- | --- | --- | --- | --- |
| Gestionar usuarios, roles, Drive y documentos | Sí | No | No | No |
| Ver plan y consumo empresarial | Sí | No | No | No |
| Consultar leyes y políticas | Todas las fuentes de su empresa | Fuentes habilitadas para RRHH | Fuentes habilitadas para supervisor | Fuentes habilitadas para colaborador |
| Ver conversaciones | Solo las propias | Solo las propias | Solo las propias | Solo las propias |

Los roles no heredan fuentes entre sí. No se permite quitarse el propio rol de administrador. El servidor lee el rol actual en MySQL en cada petición; cambiarlo no requiere renovar el JWT.

**Importante al migrar:** los documentos existentes y los nuevos importados de Drive quedan restringidos a administradores. En Documentos, un administrador debe revisar cada archivo y marcar los roles que pueden consultarlo. Los cambios de acceso se conservan al reindexar o sincronizar archivos existentes de Drive. Al subir archivos se puede elegir su acceso antes de indexarlos. No marcar información de RRHH o de administración como accesible a colaboradores.

## Conversaciones y respuestas

El chat permite iniciar y seleccionar conversaciones. Cada turno admitido se guarda antes de buscar fuentes, con estados `processing`, `ok` o `error`. Se guardan pregunta, respuesta, fuentes y consumo. Si falla o se cancela el streaming, se conserva el texto parcial y el diagnóstico en columnas distintas. Un cierre abrupto del proceso puede dejar un turno en `processing`; no existe recuperación automática de una respuesta que el proveedor no terminó de transmitir. Solicitudes inválidas, sin autenticar o rechazadas por cuota no crean turnos.

El historial se pagina de 200 en 200 sin eliminar mensajes antiguos. Antes de mostrar respuestas o reutilizarlas como contexto, el servidor comprueba el rol y los permisos actuales de sus fuentes. Si se retira acceso o desaparece una fuente, se oculta la respuesta y sus referencias. Un cambio de rol también oculta respuestas del rol anterior para evitar reutilizar privilegios. Los permisos se evalúan por petición; no se puede retirar información que el usuario ya haya recibido.

El nombre y rol proceden de la sesión autenticada; el cliente no puede indicar un rol en el chat. La búsqueda SQL filtra empresa y roles **antes** de construir el prompt. El bot recibe como contexto hasta seis turnos autorizados de la conversación actual. Si no hay fuentes autorizadas, responde sin llamar a Groq y sin confirmar que existan documentos restringidos.

Para preguntas legales hay que cargar la legislación correspondiente, con su jurisdicción y vigencia. No se descarga legislación automáticamente ni se presenta conocimiento externo como normativa empresarial. El prompt limita las respuestas a leyes, políticas y procesos documentados, con citas. Existe rechazo local para intentos explícitos de evadir permisos, revelar secretos o realizar actividades dañinas. Este filtro no es un clasificador exhaustivo: la restricción de documentos se aplica en SQL independientemente del comportamiento del modelo. La clasificación por rol debe hacerse correctamente al cargar cada documento.

## API

- `POST /api/chat/stream`: `{question, conversationId?}`. SSE `sources` y `done` incluyen `conversationId`.
- `GET /api/chat/conversations`: conversaciones del usuario autenticado.
- `GET /api/chat/history?conversationId=UUID&before=UUID`: historial privado; `before` es el ID del último mensaje de la página anterior. Sin conversación, consulta todo el historial del usuario, incluidos mensajes anteriores a esta migración.
- `POST /api/users`: admite los cuatro roles.
- `PATCH /api/users/:id/role`: `{role}`, solo administradores de la misma empresa.
- `PATCH /api/documents/:id/access`: `{allowedRoles:["admin","rrhh"]}`, solo administradores de la misma empresa.
- `POST /api/documents/upload`: multipart con `file` y `allowedRoles` como array JSON; por defecto solo administradores.

## Verificación

`npm test` ejecuta las pruebas unitarias existentes. `npm run build` compila el frontend.

Con MySQL migrado y configuración local válida: `npm run test:integration`. Crea empresas y usuarios temporales y elimina únicamente sus propios datos al terminar. Comprueba roles, aislamiento, permisos de documentos y endpoints, persistencia de chat, rechazo de suplantación, respuestas parciales, revocación, cambios de rol en sesiones existentes, paginación y claves foráneas.

Las pruebas de integración usan MySQL y HTTP reales. La prueba de fallo de generación usa un proveedor simulado para provocar el error; no acredita respuestas de Groq. La generación real requiere `GROQ_API_KEY` y una prueba con el proveedor. No se ha hecho revisión visual en navegador.

## Catálogo de 100 roles

La migración `003_role_catalog.sql` conserva los cuatro roles originales y agrega 96 cargos. Crea `pb_roles(code,label,department)`, cambia el `ENUM` por un código de hasta 64 caracteres en `pb_users` y añade una clave foránea para rechazar roles inexistentes. Amplía también `pb_messages.role_at_request` para conservar completos los códigos largos. No modifica los permisos actuales de los documentos ni asigna cargos automáticamente.

Los 96 cargos son ocho puestos por cada una de estas 12 áreas:

| Áreas | Puestos disponibles en cada área |
| --- | --- |
| Recursos Humanos, Finanzas, Legal, Tecnología, Operaciones, Ventas, Marketing, Atención al Cliente, Compras, Logística, Producción, Calidad | Dirección, Gerencia, Jefatura, Coordinación, Analista, Especialista, Asistente, Auxiliar |

Ejemplos: `finanzas_analista`, `legal_director`, `tecnologia_especialista`, `atencion_cliente_coordinador`. Solo `admin` tiene funciones de administración. Un director de Finanzas no hereda permisos de administración ni acceso a documentos de un analista. Cada documento puede habilitar de uno a los 100 roles.

`GET /api/roles` devuelve los 100 códigos, nombres y áreas a usuarios autenticados. Los selectores de usuarios los agrupan por área y el selector de acceso a documentos incorpora búsqueda y una lista con altura limitada. La sesión incluye `role_label` para mostrar el cargo real.

El catálogo predeterminado se declara en `backend/src/config/roles.js` y se replica en la migración versionada. Para ampliarlo, agregar una nueva migración y actualizar el catálogo; no editar migraciones ya aplicadas. Las validaciones de API y la clave foránea impiden aceptar códigos no definidos. No se ofrece edición arbitraria del catálogo desde la interfaz.

La prueba de integración recorre los 100 roles, los asigna a un usuario, verifica su sesión, comprueba el acceso SQL a fuentes y confirma que solo `admin` accede a la gestión de usuarios. También prueba permitir los 100 roles en un documento, rechazar roles inexistentes y guardar códigos largos en el historial.
