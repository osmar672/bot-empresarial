# Equipo ficticio para probar Luma

Para crear diez cuentas en tu MySQL configurado en `backend/.env`:

```bash
npm run db:seed:team
```

Ejecuta primero las migraciones si tu base de datos todavía no está preparada. Este comando requiere un entorno de desarrollo y no permite ejecutarse con `NODE_ENV=production`.

Crea la empresa **Luma Empresa Demo**, independiente de las demás empresas. No modifica usuarios existentes, no envía correos y no cambia permisos de documentos existentes. Los correos terminados en `.test` son ficticios y no reciben correo.

| Nombre | Correo | Rol |
| --- | --- | --- |
| Ana Rodríguez | ana@luma-demo.test | Administrador |
| Carlos Jiménez | carlos@luma-demo.test | Analista de Recursos Humanos |
| Valeria Mora | valeria@luma-demo.test | Asistente de Finanzas |
| Diego Vargas | diego@luma-demo.test | Analista de Tecnología |
| Lucía Rojas | lucia@luma-demo.test | Analista de Operaciones |
| Andrés Soto | andres@luma-demo.test | Analista de Calidad |
| Camila Castro | camila@luma-demo.test | Auxiliar de Compras |
| Gabriel Solís | gabriel@luma-demo.test | Analista de Ventas |
| Elena Navarro | elena@luma-demo.test | Coordinación de Logística |
| Mateo Campos | mateo@luma-demo.test | Colaborador |

Las contraseñas son distintas y se generan al ejecutar el comando. El archivo local **`backend/credentials/equipo_demo.csv`** contiene nombre, correo, empresa, rol y contraseña inicial. Está excluido de Git. Ábrelo localmente para consultar las credenciales; no se sirve desde la web ni se publica en el repositorio.

Inicia sesión con `ana@luma-demo.test` y su contraseña del CSV para ver las diez cuentas en **Colaboradores**. Cada empresa solo puede consultar sus propios usuarios. Los usuarios de las otras empresas no verán este equipo.

Repetir el comando conserva las cuentas y las contraseñas existentes. Si pierdes el CSV, no se pueden reconstruir las claves a partir de MySQL. El comando no restablece las cuentas automáticamente.

## Tabla en el sistema

Colaboradores presenta las columnas nombre, correo, empresa, rol y contraseña. La contraseña figura como **Protegida**: MySQL guarda un hash bcrypt y la API no devuelve el hash ni la clave.

Al crear una cuenta desde la página se muestra un aviso donde puedes revelar su contraseña inicial. Cerrar el aviso o recargar la página elimina esa copia temporal de la memoria del navegador.

Para consultar los usuarios desde MySQL sin exponer credenciales:

```sql
SELECT u.name AS nombre,
       u.email AS correo,
       c.name AS empresa,
       r.label AS rol,
       'Protegida (bcrypt)' AS contrasena
FROM pb_users u
JOIN pb_companies c ON c.id = u.company_id
JOIN pb_roles r ON r.code = u.role
WHERE c.name = 'Luma Empresa Demo'
ORDER BY u.name;
```
