## Inicio de sesión con Google

El botón de Google y la verificación del backend están implementados. Configura `GOOGLE_CLIENT_ID`, aplica las migraciones y consulta [la guía de configuración](docs/LOGIN_GOOGLE.md). Solo acceden usuarios ya registrados; conservan empresa y rol.

## Roles y conversaciones persistentes

Consulta [la guía de permisos y migración](docs/ROLES_Y_CONVERSACIONES.md) para configurar los 100 roles, el acceso a fuentes y las conversaciones privadas. Al migrar, los documentos existentes quedan accesibles solo para administradores hasta revisar sus permisos.

# PolicyBot corregido: MySQL `tablero` + Groq + Drive

**Esta versión está preparada específicamente para la base de datos `tablero`.** No reemplaza ni borra tablas que ya existan: usa el prefijo `pb_` (`pb_users`, `pb_documents`, etc.). Las siete tablas de negocio se crean mediante migraciones idempotentes. Incluye un diagnosticador de conexiones y mensajes de error más concretos.

**Guía específica para tu caso en Windows:** [`docs/INSTALACION_TABLERO_WINDOWS.md`](docs/INSTALACION_TABLERO_WINDOWS.md). La opción A utiliza MySQL ya instalado (`3306` habitualmente). La opción B usa el contenedor del proyecto (`3307`). **No confundas el nombre `tablero` con el puerto del servidor.**

Desde PowerShell en la raíz del proyecto:

```powershell
Copy-Item backend\.env.example backend\.env
notepad backend\.env
npm install
npm run db:doctor
npm run db:dry-run
npm run db:migrate
npm run db:status
npm run dev
```

Configura antes `MYSQL_*`, `JWT_SECRET`, `GROQ_API_KEY` y la ruta `GOOGLE_APPLICATION_CREDENTIALS` si quieres utilizar Drive. El `.env` real **no está dentro de esta entrega** para proteger tus claves. Si ya tienes uno, conserva su contenido de forma local y pasa los valores al nuevo proyecto. El campo de Drive requiere la **ruta a un JSON**, no el ID que muestra Cloud Console.

Como alternativa manual para Workbench, revisa `database/WORKBENCH_TABLERO.sql`, que incluye `CREATE DATABASE IF NOT EXISTS tablero` y las tablas prefijadas. No es necesario ejecutarlo si usas `npm run db:migrate`.

**Límite de verificación:** no tenemos acceso a tu MySQL de Windows. Se han ejecutado pruebas automatizadas del código, pero la migración real debe aplicarse en tu servidor. Si ya tenías datos de una versión anterior de PolicyBot en tablas *sin* prefijo, no se migran automáticamente a `pb_` para evitar perder o mezclar información.

---

# PolicyBot | SaaS RAG con MySQL, Groq y Google Drive

Aplicación web de asistencia documental para múltiples empresas. **Es el producto PolicyBot solicitado en la práctica**, no únicamente el gestor de tareas. El gestor anterior, **PolicyBoard 4.0**, se conserva aparte en `seguimiento/PolicyBoard_4_React_Express.zip`.

## Funciones implementadas

- Alta de empresas con usuario administrador, acceso con cookie HTTP-only/JWT y contraseñas bcrypt.
- Empresas aisladas: el `company_id` se obtiene del usuario autenticado en MySQL, nunca del frontend.
- Panel React con chat, documentos, Google Drive, usuarios y límites del plan.
- Carga de PDF con texto, DOCX, TXT, Markdown y CSV; extrae texto, divide en fragmentos y guarda embeddings en MySQL.
- RAG: recuperación de fragmentos de la empresa y generación de respuesta **en streaming SSE con Groq** y fuentes.
- Integración Google Drive con cuenta de servicio: carpeta compartida, exportación de Docs/Sheets, descarga de documentos y sincronización manual y horaria.
- Historial del chat y consumo mensual (cuotas de documentos/preguntas, tokens reportados por Groq).
- Migración SQL, datos demostrativos de dos empresas y pruebas automatizadas locales.

> IMPORTANTE: Este trabajo adapta el PDF original. Allí se pedían **Claude + PostgreSQL/pgvector + Voyage**. Aquí se emplean **Groq + MySQL** como solicitaste. Los vectores se almacenan en una columna JSON y la similitud se calcula en Node.js, solución válida para el tamaño de un MVP, **no un reemplazo de pgvector a gran escala**. Si tu profesor exige la pila tecnológica literalmente, solicita autorización para el cambio.

## Requisitos

- Node.js 22.16+ y npm.
- MySQL 8.4 activo, ya sea instalado directamente en Windows o mediante Docker Desktop (opcional).
- Clave real de [Groq Cloud](https://console.groq.com/keys) para generar respuestas.
- Para Drive: proyecto de Google Cloud, Drive API habilitada y una cuenta de servicio que tenga acceso de lectura a la carpeta.
- Opcional: clave de Voyage AI para embeddings **semánticos** en vez del hashing lexical local.

## Instalación en Windows

1. Descomprime el ZIP y abre la carpeta del proyecto.
2. Abre PowerShell o CMD en esta carpeta y ejecuta:

```powershell
copy backend\.env.example backend\.env
```

3. Abre `backend/.env`. Cambia `JWT_SECRET` por una cadena aleatoria de **mínimo 32 caracteres** (por ejemplo, generada con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Añade `GROQ_API_KEY`.
4. Si usas **Docker**, inicia MySQL con `docker compose up -d db`. Si usas MySQL instalado en Windows, **no** ejecutes ese comando: configura `MYSQL_PORT=3306` (o tu puerto real) y comprueba el servicio con `npm run db:doctor`.

5. Instala dependencias, aplica SQL y ejecuta:

```powershell
npm install
npm run db:doctor
npm run db:migrate
npm run dev
```

6. Abre **http://127.0.0.1:5173**. El backend responde en `http://127.0.0.1:4000/api/health`.

También puedes ejecutar `INICIAR_WINDOWS.bat`. En el primer uso abre el `.env`; después comprueba MySQL antes de aplicar las migraciones. Si prefieres Linux, `./INICIAR_LINUX.sh`.

**Modo producción local:** `npm run build` y después `npm start` sirven frontend y API desde el puerto 4000. Configura `NODE_ENV=production`, HTTPS con proxy inverso y credenciales seguras antes de desplegarlo públicamente.

### Configuración de Google Drive

1. Abre [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y habilita **Google Drive API**.
2. En **Cuentas de servicio**, crea una identidad. Genera una clave JSON y guárdala como `backend/credentials/service-account.json`. **No la subas al repositorio**.
3. Abre el JSON y copia su campo `client_email`. Comparte una carpeta de Drive con ese correo asignando permiso **Lector**. Algunas políticas de Google Workspace prohíben compartir con cuentas externas; necesitarás que tu administrador lo permita.
4. En `backend/.env` conserva `GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json` o usa otra ruta. Reinicia el backend si cambias las credenciales.
5. En **Documentos → Google Drive**, pega el ID de la carpeta (el segmento final de su URL), guárdalo y pulsa **Sincronizar ahora**.
6. La sincronización automática se ejecuta una vez por hora por defecto. Elimina del índice archivos retirados de esa carpeta y vuelve a indexar los modificados.

Formatos Drive: documentos Google Docs (texto plano), Google Sheets (CSV, con limitaciones de exportación), PDF, DOCX, TXT, MD y CSV. Subcarpetas no se recorren recursivamente. No se implementó OAuth de usuario; se usa **cuenta de servicio**, igual que el ejercicio.

### Embeddings: local o Voyage

Configuración por defecto: `EMBEDDING_PROVIDER=local`. Guarda vectores de 384 dimensiones usando hashing **lexical** local. Es muy ligero y no necesita otra API, pero no comprende sinónimos igual que un modelo semántico real.

Para una búsqueda semántica de calidad superior:

```dotenv
EMBEDDING_PROVIDER=voyage
VOYAGE_API_KEY=tu_clave_real
VOYAGE_MODEL=voyage-4-lite
```

**Reindexa los documentos** con la acción circular de la biblioteca después de cambiar el proveedor o el modelo de embeddings. Los fragmentos de un proveedor no se comparan con los de otro (evitamos mezclar dimensiones). Para una instalación nueva lo más fácil es usar ese modo desde el principio.

### Modelo de Groq

`GROQ_MODEL=openai/gpt-oss-120b` es un ejemplo de modelo de producción vigente verificado el 16-11-2026. Puedes consultar los disponibles en [Groq Models](https://console.groq.com/docs/models) y modificarlo en `.env` sin tocar código. El frontend nunca recibe las API keys.

## Datos demostrativos

Para preparar 2 empresas y 3 políticas por empresa:

```bash
npm run db:seed
```

Cuentas de demostración (en **desarrollo local exclusivamente**):

| Empresa | Admin | Colaborador |
| --- | --- | --- |
| Café Montaña S.A. | `admin.cafe@demo.test` | `equipo.cafe@demo.test` |
| Logística Pacífico | `admin.logistica@demo.test` | `equipo.logistica@demo.test` |

Contraseña inicial de las cuentas demostrativas: `DemoSeguro2026!` (se puede definir con `DEMO_PASSWORD`). No utilices estas cuentas en producción.

## Estructura

```text
PolicyBot_MySQL_Groq_Drive/
├── backend/
│   ├── src/
│   │   ├── config/          # .env, configuración
│   │   ├── db/              # MySQL, migraciones y seed
│   │   ├── middlewares/     # sesión, roles y errores
│   │   ├── routes/          # auth, users, documents, drive, chat, usage
│   │   ├── services/        # Groq, embeddings, Drive, extracción e indexación
│   │   ├── rag/             # fragmentación, vector local, recuperación
│   │   ├── jobs/            # sincronización programada
│   │   ├── app.js
│   │   └── server.js
│   ├── credentials/         # clave JSON privada, ignorada por git
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/             # composición
│   │   ├── components/      # componentes compartidos y navegación
│   │   ├── context/         # autenticación
│   │   ├── pages/           # login, chat, documentos, usuarios, uso
│   │   ├── services/        # cliente API + SSE
│   │   └── styles/
│   └── public/
├── database/
│   ├── migrations/         # 001_init.sql
│   └── WORKBENCH_TABLERO.sql
│   └── fixtures/           # 6 documentos de prueba
├── scripts/                # pruebas HTTP
├── docs/                   # diseño, API y pruebas
├── seguimiento/            # copia separada de PolicyBoard 4.0
├── docker-compose.yml
└── package.json
```

## Verificación

Pruebas unitarias de Node.js:

```bash
npm test
```

Tras arrancar la API y ejecutar `npm run db:seed`, prueba endpoints reales (sesiones, separación de empresas y 403 para colaboradores):

```bash
npm run smoke
```

Consulta `docs/PRUEBAS_DE_ACEPTACION.md` para las siete pruebas del PDF y `docs/INFORME_1_PAGINA_PLANTILLA.md` para el informe final. Varias requieren tus claves reales; no se pueden acreditar con mocks. El registro de estado real de esta entrega está en `VERIFICACION.md`.

## Limitaciones del MVP

- Los embeddings JSON se puntúan en el proceso Node (búsqueda exacta), no con un índice vectorial dentro de MySQL. Funciona para volúmenes reducidos; para miles de documentos requiere una implementación de búsqueda vectorial indexada.
- OCR local para páginas escaneadas en español e inglés. La precisión depende de la calidad del escaneo; revisar cifras y originales.
- Sin panel de propietario de plataforma para cobros. Planes `gratis`/`pro` y cuotas **sí** están implementados, sin integración de pagos.
- Correo de bienvenida, verificación y recuperación disponibles al configurar Resend y un remitente verificado. Sin configuración, los mensajes permanecen pendientes.
- La sincronización periódica usa un proceso cron en el servidor y no una cola distribuida.
- El modo local de hashing recupera principalmente términos coincidentes. Para demostrar RAG semántico completo usa Voyage.

## Referencias oficiales

- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/models
- https://developers.google.com/workspace/guides/create-credentials
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://docs.voyageai.com/docs/embeddings

## Personal, reportes y aplicación instalable

Permisos por horas, saldo de vacaciones con movimientos, OCR, búsqueda general, exportaciones Excel/PDF, instalación móvil y restauración de respaldos: instrucciones en [Herramientas de personal y móvil](docs/HERRAMIENTAS_PERSONAL_Y_MOVIL.md).
