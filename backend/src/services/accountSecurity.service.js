import { randomBytes, randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { one, run, transaction, pool } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { audit, notify } from "./activity.service.js";
import { mailConfigured, sendTransactionalMail } from "./mail.service.js";
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export async function newLoginSession(userId, request = {}) {
  const user = await one("SELECT company_id FROM pb_users WHERE id=?", [
    userId,
  ]);
  if (!user) throw new HttpError(401, "Usuario no encontrado");
  const id = randomUUID(),
    ua = String(request.headers?.["user-agent"] || "Navegador").slice(0, 180);
  await run(
    "INSERT INTO pb_login_sessions(id,company_id,user_id,label,expires_at) VALUES (?,?,?,?,TIMESTAMPADD(HOUR,8,UTC_TIMESTAMP(3)))",
    [id, user.company_id, userId, ua],
  );
  return id;
}
export async function checkSession(decoded, user) {
  if (decoded.sid) {
    const row = await one(
      "SELECT id,last_seen_at FROM pb_login_sessions WHERE id=? AND user_id=? AND company_id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3)",
      [decoded.sid, user.id, user.company_id],
    );
    if (!row)
      throw new HttpError(
        401,
        "Esta sesión fue cerrada. Inicia sesión de nuevo.",
      );
    if (Date.now() - new Date(row.last_seen_at).getTime() > 300000)
      await run(
        "UPDATE pb_login_sessions SET last_seen_at=UTC_TIMESTAMP(3) WHERE id=?",
        [row.id],
      );
    return row.id;
  }
  const security = await one(
    "SELECT legacy_revoked_before FROM pb_account_security WHERE user_id=? AND company_id=?",
    [user.id, user.company_id],
  );
  if (
    security?.legacy_revoked_before != null &&
    Number(decoded.iat || 0) <= Number(security.legacy_revoked_before)
  )
    throw new HttpError(
      401,
      "Esta sesión fue cerrada. Inicia sesión de nuevo.",
    );
  return null;
}
export async function revokeLegacy(cx, user) {
  await cx.execute(
    "INSERT INTO pb_account_security(user_id,company_id,legacy_revoked_before) VALUES (?,?,UNIX_TIMESTAMP()) ON DUPLICATE KEY UPDATE legacy_revoked_before=UNIX_TIMESTAMP()",
    [user.id, user.company_id],
  );
}
function publicBase() {
  const value =
    process.env.PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:5173");
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["https:", "http:"].includes(url.protocol) ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export async function queueAccountLink(user, purpose, cx) {
  const base = publicBase();
  if (!base) return { status: "pending_configuration" };
  const token = randomBytes(32).toString("hex"),
    id = randomUUID(),
    mailId = randomUUID(),
    url = base + "/#account=" + purpose + "&token=" + token;
  await cx.execute(
    "UPDATE pb_security_mail SET state='failed',last_error='SUPERSEDED',updated_at=UTC_TIMESTAMP(3) WHERE user_id=? AND subject=? AND state='pending'",
    [
      user.id,
      purpose === "reset"
        ? "Restablecer tu contraseña de Luma"
        : "Verifica tu correo de Luma",
    ],
  );
  await cx.execute(
    "UPDATE pb_account_tokens SET used_at=UTC_TIMESTAMP(3) WHERE user_id=? AND purpose=? AND used_at IS NULL",
    [user.id, purpose],
  );
  await cx.execute(
    "INSERT INTO pb_account_tokens(id,company_id,user_id,purpose,token_hash,expires_at) VALUES (?,?,?,?,?,TIMESTAMPADD(MINUTE,?,UTC_TIMESTAMP(3)))",
    [
      id,
      user.company_id,
      user.id,
      purpose,
      tokenHash(token),
      purpose === "reset" ? 30 : 1440,
    ],
  );
  await cx.execute(
    "INSERT INTO pb_security_mail(id,company_id,user_id,recipient,subject,body) VALUES (?,?,?,?,?,?)",
    [
      mailId,
      user.company_id,
      user.id,
      user.email,
      purpose === "reset"
        ? "Restablecer tu contraseña de Luma"
        : "Verifica tu correo de Luma",
      `Hola.\n\n${purpose === "reset" ? "Para elegir una nueva contraseña, abre este enlace en los próximos 30 minutos:" : "Para verificar tu correo, abre este enlace en las próximas 24 horas:"}\n\n${url}\n\nSi no solicitaste este mensaje, puedes ignorarlo. No compartas el enlace.`,
    ],
  );
  return {
    status: mailConfigured() ? "pending" : "pending_configuration",
    mailId,
  };
}
export async function requestAccountLink(userId, purpose) {
  return transaction(async (cx) => {
    const [rows] = await cx.execute(
      "SELECT id,company_id,email FROM pb_users WHERE id=? FOR UPDATE",
      [userId],
    );
    if (!rows.length) return null;
    return queueAccountLink(rows[0], purpose, cx);
  });
}
export async function consumeAccountToken(token, purpose, password) {
  const hash = tokenHash(token),
    passwordHash = purpose === "reset" ? await bcrypt.hash(password, 12) : null;
  return transaction(async (cx) => {
    const [rows] = await cx.execute(
      "SELECT t.id,t.user_id,t.company_id FROM pb_account_tokens t WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [hash, purpose],
    );
    if (!rows.length)
      throw new HttpError(
        400,
        "El enlace es inválido o ha caducado. Solicita uno nuevo.",
      );
    const t = rows[0],
      user = { id: t.user_id, company_id: t.company_id };
    const [locked] = await cx.execute(
      "SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE",
      [user.id, user.company_id],
    );
    if (!locked.length)
      throw new HttpError(400, "El enlace es inválido o ha caducado.");
    await cx.execute(
      "UPDATE pb_account_tokens SET used_at=UTC_TIMESTAMP(3) WHERE id=?",
      [t.id],
    );
    if (purpose === "reset") {
      await cx.execute(
        "UPDATE pb_users SET password_hash=? WHERE id=? AND company_id=?",
        [passwordHash, user.id, user.company_id],
      );
      await cx.execute(
        "UPDATE pb_login_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND company_id=? AND revoked_at IS NULL",
        [user.id, user.company_id],
      );
      await revokeLegacy(cx, user);
      await notify(
        {
          companyId: user.company_id,
          userId: user.id,
          kind: "security",
          title: "Contraseña actualizada",
          body: "Se restableció tu contraseña y se cerraron las sesiones anteriores.",
          target: "security",
        },
        cx,
      );
    } else
      await cx.execute(
        "INSERT INTO pb_account_security(user_id,company_id,email_verified_at) VALUES (?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE email_verified_at=UTC_TIMESTAMP(3)",
        [user.id, user.company_id],
      );
    await audit(
      {
        companyId: user.company_id,
        actorId: user.id,
        action:
          purpose === "reset"
            ? "account.password_reset"
            : "account.email_verified",
        targetType: "account",
        targetId: user.id,
      },
      cx,
    );
  });
}
export async function sendSecurityMail(
  id,
  { send = sendTransactionalMail } = {},
) {
  if (send === sendTransactionalMail && !mailConfigured())
    return { status: "pending_configuration" };
  const mail = await transaction(async (cx) => {
    const [rows] = await cx.execute(
      "SELECT * FROM pb_security_mail WHERE id=? AND state='pending' AND next_attempt_at<=UTC_TIMESTAMP(3) FOR UPDATE",
      [id],
    );
    if (!rows.length) return null;
    await cx.execute(
      "UPDATE pb_security_mail SET state='processing',attempts=attempts+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [id],
    );
    return rows[0];
  });
  if (!mail) return { status: "not_pending" };
  try {
    await send(mail);
    await run(
      "UPDATE pb_security_mail SET state='sent',sent_at=UTC_TIMESTAMP(3),last_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [id],
    );
    return { status: "sent" };
  } catch {
    const state = mail.attempts >= 4 ? "failed" : "pending";
    await run(
      "UPDATE pb_security_mail SET state=?,last_error='MAIL_DELIVERY_FAILED',next_attempt_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)),updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [state, id],
    );
    return { status: state };
  }
}
export function startSecurityMailWorker() {
  let running = false;
  const tick = async () => {
    if (running || !mailConfigured()) return;
    running = true;
    try {
      await run(
        "UPDATE pb_security_mail SET state='pending' WHERE state='processing' AND updated_at<UTC_TIMESTAMP()-INTERVAL 10 MINUTE",
      );
      const { many } = await import("../db/pool.js");
      const mails = await many(
        "SELECT id FROM pb_security_mail WHERE state='pending' AND next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY next_attempt_at LIMIT 10",
      );
      for (const item of mails) {
        await sendSecurityMail(item.id);
      }
    } catch {
      console.error("No se pudo procesar el correo de seguridad.");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
