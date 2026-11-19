import { revokeLegacy } from "../services/accountSecurity.service.js";
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { rateLimit } from "express-rate-limit";
import { authenticate, setSession, getCookie } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { one, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import {
  beginEnrollment,
  checkFactor,
  recoveryCodes,
  mfaEnabled,
  consumeChallenge,
  clearChallenge,
} from "../services/mfa.service.js";
import { audit } from "../services/activity.service.js";
const router = Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(
  rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const proof = z
  .object({
    password: z.string().min(1).max(100),
    code: z.string().trim().min(6).max(40),
  })
  .strict();
async function password(userId, value, cx = null) {
  const user = cx
    ? (
        await cx.execute("SELECT password_hash FROM pb_users WHERE id=?", [
          userId,
        ])
      )[0][0]
    : await one("SELECT password_hash FROM pb_users WHERE id=?", [userId]);
  if (!user || !(await bcrypt.compare(value, user.password_hash)))
    throw new HttpError(401, "Contraseña incorrecta");
}
router.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const { code } = z
        .object({ code: z.string().trim().min(6).max(40) })
        .strict()
        .parse(req.body),
      token = getCookie(req, "luma_mfa_challenge");
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new HttpError(401, "Vuelve a iniciar sesión");
    const user = await consumeChallenge(token, code);
    if (!user)
      throw new HttpError(
        401,
        "Código inválido, utilizado o intento caducado. Tras cinco fallos, vuelve a iniciar sesión.",
      );
    await setSession(res, user, req, { mfa: true });
    clearChallenge(res);
    res.json({ ok: true });
  }),
);
router.post("/cancel", (_req, res) => {
  clearChallenge(res);
  res.json({ ok: true });
});
router.use(authenticate);
router.get(
  "/",
  asyncHandler(async (req, res) =>
    res.json({
      enabled: await mfaEnabled(req.user.id),
      remaining: (
        await one(
          "SELECT COUNT(*) AS n FROM pb_mfa_recovery WHERE user_id=? AND used_at IS NULL",
          [req.user.id],
        )
      ).n,
    }),
  ),
);
router.post(
  "/enroll",
  asyncHandler(async (req, res) => {
    const { password: value } = z
      .object({ password: z.string().min(1).max(100) })
      .strict()
      .parse(req.body);
    await password(req.user.id, value);
    const setup = await beginEnrollment(req.user);
    res.json({ ...setup, qr: await QRCode.toDataURL(setup.uri) });
  }),
);
router.post(
  "/enable",
  asyncHandler(async (req, res) => {
    const data = proof.parse(req.body);
    const codes = await transaction(async (cx) => {
      await cx.execute("SELECT id FROM pb_users WHERE id=? FOR UPDATE", [
        req.user.id,
      ]);
      await password(req.user.id, data.password, cx);
      const [[row]] = await cx.execute(
        "SELECT enabled FROM pb_mfa WHERE user_id=?",
        [req.user.id],
      );
      if (row?.enabled) throw new HttpError(409, "MFA ya está activada");
      if (
        !(await checkFactor(cx, req.user.id, data.code, { enrollment: true }))
      )
        throw new HttpError(400, "Código inválido o preparación caducada");
      await cx.execute("UPDATE pb_mfa SET enabled=TRUE WHERE user_id=?", [
        req.user.id,
      ]);
      await cx.execute(
        "UPDATE pb_login_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=?",
        [req.user.id],
      );
      await revokeLegacy(cx, req.user);
      const codes = await recoveryCodes(cx, req.user.id);
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "security.mfa_enabled",
          targetType: "account",
          targetId: req.user.id,
        },
        cx,
      );
      return codes;
    });
    await setSession(res, req.user, req, { mfa: true });
    res.json({ codes });
  }),
);
router.post(
  "/disable",
  asyncHandler(async (req, res) => {
    const data = proof.parse(req.body);
    await transaction(async (cx) => {
      await cx.execute("SELECT id FROM pb_users WHERE id=? FOR UPDATE", [
        req.user.id,
      ]);
      await password(req.user.id, data.password, cx);
      if (!(await checkFactor(cx, req.user.id, data.code)))
        throw new HttpError(401, "Código inválido o utilizado");
      await cx.execute("DELETE FROM pb_mfa_recovery WHERE user_id=?", [
        req.user.id,
      ]);
      await cx.execute("DELETE FROM pb_mfa WHERE user_id=?", [req.user.id]);
      await cx.execute(
        "UPDATE pb_login_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=?",
        [req.user.id],
      );
      await revokeLegacy(cx, req.user);
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "security.mfa_disabled",
          targetType: "account",
          targetId: req.user.id,
        },
        cx,
      );
    });
    await setSession(res, req.user, req);
    res.json({ ok: true });
  }),
);
export default router;
