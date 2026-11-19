import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
// Private local setup: keys are generated once and never written to tracked files.
export async function initializeBackups({
  file = path.join(env.backendDir, ".env"),
} = {}) {
  let original = "";
  try {
    original = await fs.readFile(file, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  let updated = original;
  const set = (name, value) => {
    const regex = new RegExp("^" + name + "=.*$", "m");
    updated = regex.test(updated)
      ? updated.replace(regex, name + "=" + value)
      : updated +
        (updated.endsWith("\n") ? "" : "\n") +
        name +
        "=" +
        value +
        "\n";
    process.env[name] = value;
  };
  const existing =
    process.env.BACKUP_ENCRYPTION_KEY ||
    dotenv.parse(original).BACKUP_ENCRYPTION_KEY;
  if (existing && !/^[a-f0-9]{64}$/i.test(existing))
    throw new Error(
      "La clave existente no es válida. No se reemplazó: revisa su configuración.",
    );
  if (!existing) set("BACKUP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  else process.env.BACKUP_ENCRYPTION_KEY = existing;
  set("BACKUP_ENABLED", "true");
  const partial = file + "." + randomUUID() + ".partial";
  try {
    await fs.writeFile(partial, updated, { mode: 0o600, flag: "wx" });
    await fs.rename(partial, file);
    await fs.chmod(file, 0o600);
  } finally {
    await fs.unlink(partial).catch(() => {});
  }
  return { enabled: true, keyConfigured: true, restartRequired: true };
}
