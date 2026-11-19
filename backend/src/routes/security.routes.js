import { backupConfiguration } from "../services/backup.service.js";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { authenticate, setSession, clearSession } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, one, run, transaction } from "../db/pool.js";
import {
  requestAccountLink,
  consumeAccountToken,
  revokeLegacy,
} from "../services/accountSecurity.service.js";
import { mailConfigured } from "../services/mail.service.js";
import { audit } from "../services/activity.service.js";
import { HttpError } from "../utils/errors.js";
import { idSchema } from "../utils/validation.js";
const router = Router(),
  limit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Has realizado varias solicitudes. Inténtalo más tarde.",
    },
  });
router.post(
  "/forgot",
  limit,
  asyncHandler(async (req, res) => {
    const { email } = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(190)
          .transform((v) => v.toLowerCase()),
      })
      .strict()
      .parse(req.body);
    const user = await one("SELECT id FROM pb_users WHERE email=?", [email]);
    if (user) await requestAccountLink(user.id, "reset");
    res
      .status(202)
      .json({
        message:
          "Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña. Revisa también Spam.",
      });
  }),
);
router.post(
  "/reset",
  limit,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(10).max(100),
      })
      .strict()
      .parse(req.body);
    await consumeAccountToken(data.token, "reset", data.password);
    clearSession(res);
    res.json({ ok: true });
  }),
);
router.post(
  "/verify",
  limit,
  asyncHandler(async (req, res) => {
    const { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(req.body);
    await consumeAccountToken(token, "verify");
    res.json({ ok: true });
  }),
);
router.use(authenticate);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const security = await one(
      "SELECT email_verified_at FROM pb_account_security WHERE user_id=? AND company_id=?",
      [req.user.id, req.companyId],
    );
    const sessions = await many(
      "SELECT id,label,created_at,last_seen_at,expires_at FROM pb_login_sessions WHERE user_id=? AND company_id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) ORDER BY last_seen_at DESC LIMIT 30",
      [req.user.id, req.companyId],
    );
    const backup =
      req.user.role === "admin"
        ? {
            ...backupConfiguration(),
            last: await one(
              "SELECT state,finished_at FROM pb_backup_runs ORDER BY started_at DESC LIMIT 1",
            ),
          }
        : undefined;
    res.json({
      verifiedAt: security?.email_verified_at || null,
      mailConfigured: mailConfigured(),
      currentSession: req.sessionId,
      sessions,
      ...(backup ? { backup } : {}),
    });
  }),
);
router.post(
  "/request-verification",
  limit,
  asyncHandler(async (req, res) => {
    const security = await one(
      "SELECT email_verified_at FROM pb_account_security WHERE user_id=?",
      [req.user.id],
    );
    if (security?.email_verified_at) return res.json({ status: "verified" });
    const result = await requestAccountLink(req.user.id, "verify");
    res.status(202).json(result);
  }),
);
router.post(
  "/sessions/revoke-others",
  asyncHandler(async (req, res) => {
    if (!req.sessionId) req.sessionId = await setSession(res, req.user, req);
    await transaction(async (cx) => {
      await cx.execute(
        "UPDATE pb_login_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND company_id=? AND id<>? AND revoked_at IS NULL",
        [req.user.id, req.companyId, req.sessionId],
      );
      await revokeLegacy(cx, req.user);
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "account.sessions_revoked",
          targetType: "account",
          targetId: req.user.id,
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
router.delete(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const result = await run(
      "UPDATE pb_login_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND company_id=? AND revoked_at IS NULL",
      [id, req.user.id, req.companyId],
    );
    if (!result.affectedRows) throw new HttpError(404, "Sesión no encontrada");
    if (id === req.sessionId) clearSession(res);
    res.json({ ok: true, current: id === req.sessionId });
  }),
);
export default router;
