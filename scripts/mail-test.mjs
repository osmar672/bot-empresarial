import { z } from "zod";
import { one, pool } from "../backend/src/db/pool.js";
import { env } from "../backend/src/config/env.js";
import { mailConfiguration } from "../backend/src/services/mailTransport.js";
import { driveConfiguration } from "../backend/src/services/drive.service.js";
import {
  requestAccountLink,
  sendSecurityMail,
} from "../backend/src/services/accountSecurity.service.js";
try {
  const args = process.argv.slice(2),
    send = args.includes("--send"),
    index = args.indexOf("--to");
  const mail = mailConfiguration();
  const hasPublicUrl = Boolean(process.env.PUBLIC_APP_URL);
  console.log("Configuración local (sin mostrar secretos):", {
    googleLogin: Boolean(env.googleClientId),
    googleDrive: driveConfiguration().status,
    mailProvider: mail.provider,
    mailConfigured: mail.configured,
    missingOrInvalid: [...mail.missing, ...(!hasPublicUrl ? ["PUBLIC_APP_URL"] : [])],
  });
  if (!send) {
    console.log(
      "Para enviar enlaces reales a una cuenta existente: npm run mail:test -- --to tu-correo --send",
    );
  } else {
    if (!mail.configured || !hasPublicUrl)
      throw new Error("Completa la configuración indicada antes del envío.");
    const url = new URL(process.env.PUBLIC_APP_URL);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["https:", "http:"].includes(url.protocol) ||
      (env.nodeEnv === "production" && url.protocol !== "https:")
    )
      throw new Error("PUBLIC_APP_URL no es válida");
    const email = z
      .string()
      .trim()
      .email()
      .parse(args[index + 1])
      .toLowerCase();
    if (index < 0) throw new Error("Falta --to");
    const user = await one("SELECT id FROM pb_users WHERE email=?", [email]);
    if (!user)
      throw new Error(
        "El destinatario debe tener una cuenta registrada. No se creó ninguna cuenta de prueba.",
      );
    for (const purpose of ["verify", "reset"]) {
      const result = await requestAccountLink(user.id, purpose);
      if (!result?.mailId)
        throw new Error("No se pudo generar el enlace. Revisa PUBLIC_APP_URL.");
      const sent = await sendSecurityMail(result.mailId);
      if (sent.status !== "sent")
        throw new Error(
          "El proveedor no confirmó el envío. Revisa las credenciales y los permisos del proveedor seleccionado.",
        );
      console.log(
        purpose === "verify"
          ? "Verificación aceptada por el proveedor."
          : "Recuperación aceptada por el proveedor.",
      );
    }
    console.log(
      "Revisa la bandeja y Spam. El envío aceptado no confirma la recepción ni que hayas completado ambos enlaces.",
    );
  }
} catch (error) {
  console.error(
    error.name === "ZodError"
      ? "Indica un correo válido con --to."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
