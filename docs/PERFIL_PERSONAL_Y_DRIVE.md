# Perfil personal, cámara, puntualidad y Drive automático

Los cambios se publican en `feat-yubran`. Actualiza la rama y reinicia `npm run dev`. Al arrancar, el backend prepara las tablas nuevas de perfil y fotos con `CREATE TABLE IF NOT EXISTS`; no borra datos ni cambia el historial de migraciones. La instalación base sigue necesitando sus tablas de usuarios, marcaciones, vacaciones y horarios. El usuario de MySQL debe tener permiso para crear las tablas de funciones nuevas.

## Personalización

En **Mi perfil → Personalizar** tienes vista previa y guardado de nombre visible, frase, descripción, ubicación y estado decorativo; cinco temas (Luma, Medianoche, Océano, Bosque, Atardecer), color de acento, cuatro fondos de portada, portada propia, cuatro marcos y tres formas de avatar, espaciado, animación y orden de vitrinas. Puedes mostrar u ocultar correo, departamento y racha, o restablecer el estilo.

La personalización queda en MySQL y se conserva entre sesiones y dispositivos. El nombre visible y el estado no modifican la identidad de acceso, el rol, el cargo ni las marcaciones. Este perfil es privado dentro de la cuenta; ocultar un campo cambia su presentación, no los permisos administrativos.

Las fotos y portadas se guardan al elegirlas, independientemente del botón de guardar estilo. Solo el propietario puede modificarlas o leerlas mediante rutas autenticadas. Los archivos se validan, convierten a WebP y se guardan sin metadatos. La portada admite hasta 5 MB y 20 megapíxeles, con recorte panorámico de hasta 1600 × 500.

## Cámara

**Usar cámara** solicita permiso del navegador, permite capturar, repetir y revisar antes de **Usar foto**. Se usa únicamente vídeo, sin audio. Se detienen las pistas al cerrar o salir del perfil. El navegador requiere HTTPS o localhost y una cámara disponible. Si no hay permiso o cámara, se conserva la opción de subir una imagen.

## Racha real de puntualidad

Se consulta la primera entrada de cada jornada, la hora de inicio del horario semanal de `pb_work_schedules` y el reloj del servidor en Costa Rica. Llegar a la hora de inicio o antes cuenta como puntual; una llegada tarde o una jornada laboral vencida sin entrada rompe la racha. No se añade tolerancia inventada.

Al marcar una nueva entrada se guarda una instantánea del inicio esperado y si fue puntual. Cambiar el horario más tarde no cambia esa evaluación. Para marcaciones anteriores solo se usa un horario si ya estaba asignado antes del inicio de esa jornada. Los días sin horario verificable no suman ni inventan méritos y pueden interrumpir la continuidad verificable. Los descansos y vacaciones aprobadas no rompen la racha. Los turnos nocturnos se vinculan al día en que empieza el turno.

La racha actual, la mejor racha y las entradas puntuales se calculan dentro de los últimos 365 días. Una jornada que todavía no ha empezado no rompe la racha. La pantalla se actualiza al marcar, al volver a la ventana y periódicamente. Los horarios se siguen administrando desde las funciones laborales de la empresa; el usuario no los altera desde el editor visual.

## Drive guardado en el sistema

La carpeta ya se almacena por empresa en `pb_companies.drive_folder_id`. Después de guardarla una vez, el sistema oculta el campo de ID y muestra la conexión guardada. Usa **Cambiar carpeta** solo para sustituirla; no se coloca una carpeta privada de una empresa como valor global para todas las demás.

Guardar una carpeta inicia una sincronización en segundo plano. El backend sincroniza las carpetas guardadas al arrancar y periódicamente; el valor por defecto es cada cinco minutos. Si `SYNC_CRON` ya está definido en `backend/.env`, se respeta ese intervalo existente. El panel de documentos se actualiza cada treinta segundos y conserva el texto mientras editas la carpeta.

La cuenta de servicio, sus credenciales y el permiso de Lectura de Google Drive siguen siendo necesarios. El servidor debe estar ejecutándose para detectar archivos nuevos; no es necesario mantener abierta la página. Se conserva el acceso inicial de los documentos importados solo para administradores hasta revisar sus roles. No se envían documentos de una empresa a otra ni se evita el control de permisos.

## Comprobaciones

```bash
node --test backend/tests/punctuality.test.js backend/tests/drive-job.test.js backend/tests/drive.test.js
node scripts/profile-customization.integration.mjs
node scripts/profile-photo.integration.mjs
npm run build
```

La integración crea y elimina sus cuentas temporales; no usa una cámara física ni credenciales externas. La captura de cámara también se comprueba en navegador con un dispositivo simulado. Las pruebas automáticas del trabajo de Drive usan servicios simulados; una sincronización real requiere la cuenta de servicio configurada por la empresa.
