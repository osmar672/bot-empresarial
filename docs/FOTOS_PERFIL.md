# Fotos de perfil

Para actualizar una instalación existente:

```bash
git pull origin main
npm ci
npm run db:photos
npm run dev
```

`db:photos` prepara únicamente la tabla nueva `pb_user_photos`, de forma repetible. No altera usuarios ni historiales de otras migraciones. Las instalaciones nuevas también la reciben al ejecutar `npm run db:migrate`.

En **Mi perfil**, usa **Subir foto**, **Cambiar foto** o **Quitar foto**. La foto se actualiza en el perfil, la barra superior y el menú lateral. Cada persona modifica solo su propia foto.

Se aceptan JPG, PNG y WebP de hasta 5 MB y 20 megapíxeles. El servidor decodifica la imagen, aplica su orientación, la recorta a un cuadrado y la guarda como WebP de hasta 512 × 512 sin metadatos. Se rechazan archivos dañados y formatos distintos; la foto guardada es estática.

La imagen se guarda en MySQL, vinculada al usuario y a la empresa; no se publica una carpeta de fotos. La ruta de lectura exige una sesión y devuelve únicamente la foto de esa cuenta, sin caché compartida. Incluye `pb_user_photos` en los respaldos de la base de datos.

Verificación de integración en una base ya preparada:

```bash
npm run test:profile-photo
npm run build
```

La prueba crea cuentas temporales, verifica carga, lectura, límites, aislamiento y borrado, y elimina sus datos al terminar.
