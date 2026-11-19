import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { env, assertConfig } from "../config/env.js";
import { pool, one, transaction } from "./pool.js";

// Datos ficticios aislados: nunca sobrescribe cuentas ni reinicia contraseñas.
export async function seedTeam() {
  if (env.nodeEnv === "production")
    throw new Error("Los usuarios ficticios no se instalan en producción");
  assertConfig();
  const companyName = "Luma Empresa Demo";
  const deliveryPath = path.resolve(
    env.backendDir,
    "credentials/equipo_demo.csv",
  );
  const people = [
    ["Ana Rodríguez", "ana", "admin"],
    ["Carlos Jiménez", "carlos", "rrhh_analista"],
    ["Valeria Mora", "valeria", "finanzas_asistente"],
    ["Diego Vargas", "diego", "tecnologia_analista"],
    ["Lucía Rojas", "lucia", "operaciones_analista"],
    ["Andrés Soto", "andres", "calidad_analista"],
    ["Camila Castro", "camila", "compras_auxiliar"],
    ["Gabriel Solís", "gabriel", "ventas_analista"],
    ["Elena Navarro", "elena", "logistica_coordinador"],
    ["Mateo Campos", "mateo", "colaborador"],
  ];
  const existing = await one("SELECT id FROM pb_companies WHERE name=?", [
    companyName,
  ]);
  if (existing) {
    const count = await one(
      "SELECT COUNT(*) AS total FROM pb_users WHERE company_id=?",
      [existing.id],
    );
    return {
      company: companyName,
      created: 0,
      total: Number(count.total),
      deliveryPath,
      unchanged: true,
    };
  }
  const companyId = randomUUID();
  const users = await Promise.all(
    people.map(async ([name, alias, role]) => {
      const password = "Aa!" + randomBytes(15).toString("base64url");
      const catalog = await one(
        "SELECT code,label FROM pb_roles WHERE code=?",
        [role],
      );
      if (!catalog)
        throw new Error("Ejecuta las migraciones: falta el rol " + role);
      return {
        id: randomUUID(),
        name,
        email: alias + "@luma-demo.test",
        role,
        roleLabel: catalog.label,
        password,
        hash: await bcrypt.hash(password, 12),
      };
    }),
  );
  const rows = [
    ["nombre", "correo", "empresa", "rol", "codigo_rol", "contrasena_inicial"],
    ...users.map((u) => [
      u.name,
      u.email,
      companyName,
      u.roleLabel,
      u.role,
      u.password,
    ]),
  ];
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row.map((cell) => '"' + cell.replace(/"/g, '""') + '"').join(","),
      )
      .join("\r\n");
  await fs.mkdir(path.dirname(deliveryPath), { recursive: true });
  // Crear el archivo antes del commit evita perder las claves iniciales.
  await fs.writeFile(deliveryPath, csv, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    await transaction(async (cx) => {
      await cx.execute(
        "INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,?)",
        [companyId, companyName, "gratis"],
      );
      for (const u of users)
        await cx.execute(
          "INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,?)",
          [u.id, companyId, u.name, u.email, u.hash, u.role],
        );
    });
  } catch (error) {
    await fs.unlink(deliveryPath);
    throw error;
  }
  return {
    company: companyName,
    created: users.length,
    total: users.length,
    deliveryPath,
  };
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    console.log(JSON.stringify(await seedTeam(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
