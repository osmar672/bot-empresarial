# API REST (cookies de sesión)

Para desarrollo, base `/api` (frontend mediante proxy de Vite). Todas las rutas privadas usan cookie `policybot_session` HTTP-only.

| Verbo | Ruta | Rol | Resultado |
| --- | --- | --- | --- |
| GET | `/api/health` | público | Estado API |
| POST | `/api/auth/register` | público | Empresa + admin + sesión |
| POST | `/api/auth/login` | público | Iniciar sesión |
| POST | `/api/auth/logout` | público | Cerrar sesión |
| GET | `/api/auth/me` | autenticado | Perfil/empresa |
| GET | `/api/users` | admin | Lista usuarios empresa |
| POST | `/api/users` | admin | Crear colaborador/admin |
| GET | `/api/documents` | usuario | Listar documentos empresa |
| POST | `/api/documents/upload` | admin | Multipart `file`; indexar |
| POST | `/api/documents/:id/reindex` | admin | Regenerar embeddings desde texto indexado |
| DELETE | `/api/documents/:id` | admin | Borrar documento y chunks |
| GET | `/api/drive` | admin | ID carpeta y última ejecución |
| PUT | `/api/drive` | admin | `{folderId}` |
| POST | `/api/drive/sync` | admin | Sincronizar en este momento |
| GET | `/api/chat/conversations` | usuario | Listar conversaciones del usuario |
| POST | `/api/chat/conversations` | usuario | Crear conversación `{title}` |
| GET | `/api/chat/conversations/:id` | usuario | Obtener conversación y sus mensajes |
| PATCH | `/api/chat/conversations/:id` | usuario | Actualizar título `{title}` |
| DELETE | `/api/chat/conversations/:id` | usuario | Eliminar conversación y mensajes |
| GET | `/api/chat/history` | usuario | Historial de mensajes (retrocompatible) |
| POST | `/api/chat/stream` | usuario | `{question, conversationId?}` → SSE |
| GET | `/api/usage` | usuario | Cuotas, tokens, modelos, desglose por usuario y actividad diaria |
| GET | `/api/usage/history` | usuario | Reporte histórico mensual `?months=6` |

## Flujo de Eventos SSE (`POST /api/chat/stream`)

```text
data: {"type":"conversation","conversationId":"b478d120-..."}

data: {"type":"sources","sources":[{"id":1,"name":"politica.txt","documentId":"..."}]}

data: {"type":"delta","text":"Según la política oficial de la empresa... [1]"}

data: {"type":"done","messageId":"...","conversationId":"...","inputTokens":120,"outputTokens":40,"totalTokens":160,"model":"openai/gpt-oss-120b","durationMs":420}
```

- **401** cuando no hay sesión activa.
- **403** si el rol es insuficiente.
- **404** si el documento o conversación no pertenece al usuario/empresa autenticada.
- **409** si la carpeta ya está sincronizándose o hay duplicados de correo.
- **413** al superar el tamaño permitido de documento.
- **429** por límite de plan alcanzado.
- **503** si faltan claves necesarias (por ejemplo Groq o credenciales de Drive).
- Los errores posteriores a la apertura del stream SSE se transmiten como:
  `{type:"error", error:"...", status:...}`.

El `companyId` no se acepta en el body ni en los parámetros de ruta; deriva exclusivamente del usuario autenticado en la sesión.
