# Configurar Google y Gmail en Luma

Completa el bloque de Google y Gmail en `backend/.env`, que Git ignora. Si partes de una instalación nueva, usa `backend/.env.example` como plantilla. Conserva los valores de MySQL y JWT que ya tienes.

| Campo | Valor |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID público del cliente OAuth web para iniciar sesión con Google. |
| `MAIL_PROVIDER` | `gmail` para enviar correos con Gmail. El valor por defecto es `resend`. |
| `GMAIL_FROM` | Dirección de la cuenta Gmail o Google Workspace que autorizó el envío. |
| `GMAIL_CLIENT_ID` | ID del cliente OAuth web que se usó para autorizar Gmail. |
| `GMAIL_CLIENT_SECRET` | Secreto del mismo cliente OAuth. |
| `GMAIL_REFRESH_TOKEN` | Token de actualización emitido para esa cuenta y cliente OAuth. |
| `PUBLIC_APP_URL` | URL donde el destinatario puede abrir Luma. Usa HTTPS en producción. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta al JSON de la cuenta de servicio si usas Drive. |

## Inicio de sesión con Google

En Google Auth Platform, crea un cliente de tipo **Aplicación web** y registra el origen de Luma en **Orígenes autorizados de JavaScript**. En desarrollo puedes agregar `http://127.0.0.1:5173` y `http://localhost:5173`. Para un despliegue, registra su origen HTTPS. Copia el ID público en `GOOGLE_CLIENT_ID`. El administrador de Luma debe registrar primero al usuario con el mismo correo de Google. Consulta [Inicio de sesión con Google](LOGIN_GOOGLE.md) para ver las reglas de vinculación.

## Envío desde Gmail

1. Habilita **Gmail API** en el proyecto de Google Cloud y configura la pantalla de consentimiento. Usa un cliente OAuth web para el envío. Si la aplicación es externa y está en pruebas, agrega la cuenta remitente como usuaria de prueba. En ese modo el token de actualización puede caducar tras siete días.
2. Para obtener el token con [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/), registra `https://developers.google.com/oauthplayground` como **URI de redireccionamiento autorizada** del cliente de envío. En la configuración del Playground, activa **Use your own OAuth credentials** e introduce el ID y el secreto de ese cliente.
3. Selecciona el alcance `https://www.googleapis.com/auth/gmail.send`, autoriza con la cuenta remitente y canjea el código por tokens. Copia el **refresh token** en `GMAIL_REFRESH_TOKEN`. Conserva el secreto y el token únicamente en `backend/.env` o en el gestor privado del despliegue.
4. Completa `GMAIL_FROM`, los campos del cliente y `PUBLIC_APP_URL`. Reinicia el backend.

Gmail se usa para el correo de bienvenida, la verificación y la recuperación de contraseña. El servidor necesita salida HTTPS a `oauth2.googleapis.com` y `gmail.googleapis.com`. Si el proveedor no está configurado, los correos quedan pendientes. Los enlaces enviados antes de habilitar correo pueden haber caducado. Genera uno nuevo para probar.

## Google Drive

Habilita **Google Drive API**, guarda el JSON de la cuenta de servicio en `backend/credentials/service-account.json` o configura otra ruta privada. Comparte la carpeta con la cuenta de servicio como **Lector**, registra el ID de la carpeta en **Documentos → Google Drive** y ejecuta **Sincronizar ahora**. El servidor necesita salida HTTPS a `www.googleapis.com` y `oauth2.googleapis.com`. El navegador carga el SDK de inicio de sesión desde `accounts.google.com`.

## Comprobación

Desde la raíz del proyecto, con las dependencias instaladas:

```sh
npm run mail:test
```

El diagnóstico muestra qué campos están presentes sin imprimir secretos ni enviar correo. Para comprobar entregas reales, confirma que MySQL esté iniciado, las migraciones aplicadas y `PUBLIC_APP_URL` apunte a tu instalación. Ejecuta el siguiente comando con una **cuenta de prueba ya registrada**. Genera y envía correos reales de verificación y recuperación a esa cuenta.

```sh
npm run mail:test -- --to tu-correo-de-prueba@gmail.com --send
```

Abre Luma desde el origen autorizado para probar el botón de Google. Comprueba la carpeta compartida desde Documentos para validar Drive.
