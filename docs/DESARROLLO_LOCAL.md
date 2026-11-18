# Arranque local y solución de errores de instalación

Esta colaboración publica los cambios en la rama `feat-yubran`.

Desde la carpeta principal `bot-empresarial`, en PowerShell:

```powershell
git switch feat-yubran
git pull origin feat-yubran
npm run setup
npm run db:migrate
npm run dev
```

Se requiere Node.js 22.16 o posterior, acceso al registro de npm para instalar paquetes, MySQL iniciado y `backend/.env` configurado. La configuración de la base de datos no se modifica durante la reparación de dependencias.

`npm run setup` realiza una instalación reproducible con el lockfile, incluye las herramientas de desarrollo y reconstruye los comandos locales como Vite. No instales Vite globalmente ni borres el lockfile.

Antes de `dev`, `start`, `build` y las migraciones, el proyecto comprueba las dependencias necesarias. Si falta Vite, su comando local, MySQL u otro paquete, intenta reparar la instalación desde la raíz con `npm ci`. La aplicación solo arranca si la reparación termina correctamente. Si npm falla por permisos, archivos bloqueados o acceso a Internet, conserva su error en pantalla y detiene el arranque.

La comprobación de módulos nativos se realiza en procesos separados para no mantener bloqueadas DLL durante la reinstalación en Windows. Cierra otras instancias del servidor antes de reparar dependencias.

Para comprobar la instalación sin modificarla:

```powershell
npm run check:install
```

También funcionan estos comandos desde `backend`:

```powershell
npm run db:migrate
npm start
```

Y desde `frontend`:

```powershell
npm run dev
```

Desde cualquiera de esas dos carpetas puedes ejecutar `npm run setup`: instala las dependencias del proyecto completo.

## Historial de migraciones

La migración `002_conversations_and_tracking.sql` se publicó con dos revisiones distintas en los commits `2de8aa9` y `5b07875`. El ejecutor reconoce exclusivamente ese par exacto de checksums y conserva el checksum registrado en la base de datos. Cualquier otra modificación sigue bloqueando la migración.

El ajuste de integridad se aplica mediante la nueva migración `008_conversation_owner_integrity.sql`. No se eliminan ni se reasignan conversaciones o mensajes. Si hay datos que incumplen la propiedad de una conversación, MySQL rechaza el ajuste y se debe revisar ese dato antes de continuar.

Los argumentos se pueden pasar directamente:

```powershell
npm run db:migrate -- --status
npm run db:migrate -- --dry-run
```

Ambas opciones consultan o simulan sin aplicar cambios.

## Windows: EPERM al borrar libvips-42.dll

Sharp carga una DLL que Windows puede mantener bloqueada mientras el backend esté abierto. Ejecutar `npm ci` o `setup` en otra terminal no detiene ese servidor.

1. Detén el backend y el frontend con **Ctrl + C** en cada terminal donde estén abiertos. Detén también las sesiones de depuración de Node del proyecto.
2. Ejecuta `npm run setup`. Si vuelve a fallar con la misma DLL, reinicia Windows y ejecuta el comando antes de volver a abrir los servidores.
3. Continúa con `npm run db:migrate` y `npm run dev` únicamente cuando la instalación termine sin errores.

Si el problema continúa después del reinicio, revisa permisos y los avisos de protección del sistema. No borres el lockfile ni desactives el antivirus. El instalador mantiene el error original y devuelve un código de fallo; no finaliza otros procesos automáticamente.

`setup`, `db:migrate`, `db:status` y `db:photos` también se pueden ejecutar desde `frontend`.
