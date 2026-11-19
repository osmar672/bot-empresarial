import { verifyExternalBackup } from "../backend/src/services/externalBackup.service.js";
import { initializeBackups } from "../backend/src/services/backupSetup.service.js";
import { restoreDatabaseBackup } from "../backend/src/services/restore.service.js";
import path from "node:path";
import {
  createDatabaseBackup,
  readDatabaseBackup,
} from "../backend/src/services/backup.service.js";
import { pool } from "../backend/src/db/pool.js";
try {
  const args = process.argv.slice(2);
  if (args[0] === "download-remote") {
    if (!args[1] || !args[2])
      throw new Error(
        "Uso: npm run backup -- download-remote nombre.sql.gz.enc salida.sql.gz.enc",
      );
    console.log(
      await verifyExternalBackup({ filename: args[1], output: args[2] }),
    );
  } else if (args[0] === "verify-remote") {
    if (!args[1]) throw new Error("Indica el nombre del respaldo externo");
    console.log(await verifyExternalBackup({ filename: args[1] }));
  } else if (args[0] === "init") {
    console.log(await initializeBackups());
    console.log(
      "Respaldos activados en backend/.env privado. Reinicia el servidor. Conserva una copia segura de la clave fuera de este equipo; no se muestra en consola.",
    );
  } else if (args[0] === "restore") {
    const index = args.indexOf("--database");
    if (!args[1] || index < 0 || !args[index + 1])
      throw new Error(
        "Uso: npm run backup -- restore archivo.sql.gz.enc --database base_vacia [--apply]",
      );
    console.log(
      await restoreDatabaseBackup(path.resolve(args[1]), {
        database: args[index + 1],
        apply: args.includes("--apply"),
      }),
    );
  } else if (args[0] === "verify") {
    if (!args[1])
      throw new Error("Uso: npm run backup -- verify archivo.sql.gz.enc");
    console.log(await readDatabaseBackup(path.resolve(args[1])));
  } else if (args[0] === "decrypt") {
    if (!args[1] || !args[2])
      throw new Error(
        "Uso: npm run backup -- decrypt respaldo.sql.gz.enc salida.sql",
      );
    await readDatabaseBackup(path.resolve(args[1]), path.resolve(args[2]));
    console.log(
      "SQL descifrado y verificado en el archivo indicado. No se modificó la base de datos.",
    );
  } else if (!args.length) {
    const result = await createDatabaseBackup();
    console.log(result);
    if (result.external?.state === "failed") process.exitCode = 1;
  } else throw new Error("Comando de respaldo desconocido");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
