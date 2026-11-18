/** Diagnosticador de conexión a MySQL */
import mysql from 'mysql2/promise';
import {env} from '../config/env.js';

async function diagnose() {
  console.log(`Diagnosticando conexión a MySQL en ${env.db.host}:${env.db.port}...`);
  try {
    const cx = await mysql.createConnection({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      connectTimeout: 4000
    });
    console.log(`[OK] Conexión establecida con éxito con el usuario '${env.db.user}'.`);

    const [rows] = await cx.query(`SHOW DATABASES LIKE ?`, [env.db.database]);
    if (rows.length) {
      console.log(`[OK] La base de datos '${env.db.database}' ya existe en el servidor.`);
    } else {
      console.log(`[INFO] La base de datos '${env.db.database}' aún no existe. Se creará al ejecutar: npm run db:migrate`);
    }
    await cx.end();
    console.log('[OK] Diagnóstico completado sin problemas.');
    process.exit(0);
  } catch (error) {
    console.error('\n--- DIAGNÓSTICO DE ERROR MYSQL ---');
    if (error.code === 'ECONNREFUSED') {
      console.error(`ERROR: No hay ningún servidor MySQL respondiendo en ${env.db.host}:${env.db.port}.`);
      console.error(`- Si usas MySQL instalado localmente en Windows, normalmente escucha en el puerto 3306. Cambia MYSQL_PORT=3306 en backend/.env.`);
      console.error(`- Si usas Docker Desktop, inicia el contenedor con: docker compose up -d db (mapea a 3307).`);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`ERROR: Acceso denegado para el usuario '${env.db.user}'. Verifica MYSQL_USER y MYSQL_PASSWORD en backend/.env.`);
    } else {
      console.error(`ERROR: ${error.message} (${error.code || 'sin código'})`);
    }
    process.exit(1);
  }
}

diagnose();
