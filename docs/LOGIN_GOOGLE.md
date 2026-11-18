# Iniciar sesión con Google

La integración usa Google Identity Services en modo popup, verifica el ID token en Express con `google-auth-library` y mantiene la sesión HTTP-only existente. No necesita API de Gmail, permisos de Drive ni secreto de cliente OAuth.

## Configuración

1. En Google Auth Platform, crear un cliente OAuth de tipo Aplicación web.
2. Registrar como orígenes JavaScript las direcciones exactas donde se abre el frontend. En desarrollo: `http://localhost:5173` y `http://127.0.0.1:5173`. En producción, el dominio HTTPS de la aplicación. El origen no lleva una ruta como `/login`.
3. Este flujo popup con callback JavaScript no necesita URI de redireccionamiento.
4. Configurar marca, público y, si corresponde al estado y configuración del proyecto, los usuarios de prueba. Solo se requiere identidad básica: nombre, correo y OpenID.
5. En `backend/.env`, agregar sin sobrescribir los valores existentes:

```dotenv
GOOGLE_CLIENT_ID=TU_ID_DE_CLIENTE.apps.googleusercontent.com
```

Este ID es público. No introducir el secreto de cliente ni el JSON de la cuenta de servicio de Drive. El frontend obtiene el ID del backend: no hace falta duplicarlo en un archivo del frontend.

Desde la raíz del proyecto:

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run db:migrate
npm run dev
```

Fuera del entorno cloud puede usarse `npm ci` sin la opción de caché. Reiniciar el backend tras cambiar `GOOGLE_CLIENT_ID`. El botón aparece en Iniciar sesión cuando el ID está configurado; si no está configurado, sigue funcionando el acceso con contraseña. Para producción, compilar con `npm run build`, servir sobre HTTPS y configurar `NODE_ENV=production`.

El navegador necesita acceder a `https://accounts.google.com/gsi/`. El backend necesita salida HTTPS hacia `www.googleapis.com` para obtener las claves públicas de Google. La CSP de producción permite el SDK, conexiones e iframe de Google y la política de apertura permite su popup. No desactivar TLS ni la verificación de firmas.

## Autorización y vinculación

- Un administrador debe registrar primero al usuario con el correo exacto de su cuenta de Google y asignarle empresa y rol. El acceso con Google no crea usuarios ni empresas.
- La migración `004_google_login.sql` agrega `pb_users.google_sub`, único y sensible a mayúsculas. Tras vincularse, la identidad estable `sub` identifica al usuario aunque cambie su correo en Google.
- Una cuenta Gmail verificada o una cuenta Workspace con dominio `hd` verificado puede vincularse automáticamente si coincide con el correo ya registrado.
- Para una cuenta de Google con correo de otro proveedor, el usuario debe escribir también su contraseña de PolicyBot la primera vez antes de pulsar el botón. Esto evita vincular cuentas a partir de correos cuya propiedad Google no garantiza actualmente. Los siguientes accesos usan el vínculo `sub`.
- Si el correo local ya está vinculado a otro `sub`, se rechaza el acceso. No se reasignan identidades ni se aceptan roles o empresas enviados por el cliente.
- La sesión lee el rol y la empresa actuales en MySQL en cada petición, igual que el acceso con contraseña. Se conservan los 100 roles, los permisos de documentos y las conversaciones existentes.
- Se verifica firma, emisor, caducidad, audiencia, correo verificado y un nonce asociado al navegador. Hay límite de intentos. Credenciales y contraseñas no se guardan en logs ni se envían a Google desde el backend.

## API y pruebas

`GET /api/auth/google/config` devuelve `{enabled:false}` sin ID o `{enabled:true,clientId,nonce}` con él; establece una cookie nonce HTTP-only de diez minutos. No debe almacenarse en caché.

`POST /api/auth/google` recibe `{credential,password?}` y exige la cookie y el nonce del intento. Emite la misma cookie de sesión utilizada por el resto de la aplicación. La respuesta nunca incluye hashes de contraseña.

```sh
npm test
npm run test:integration
npm run build
```

Las pruebas verifican firmas RSA, audiencia, emisor, caducidad, nonce y correos no verificados con claves de prueba locales. Las pruebas HTTP/MySQL validan invitaciones, vínculo estable, mantenimiento de empresa y rol, rechazo de suplantación y vinculación con contraseña de correos externos. No contactan a Google ni acreditan un inicio de sesión real.

Para la validación final: configurar un ID OAuth real, abrir la aplicación desde un origen autorizado, entrar con una cuenta registrada y comprobar que se conserva su empresa y rol. Una cuenta no registrada debe recibir un rechazo y no debe crear registros.
