import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { one, many, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { idSchema } from "../utils/validation.js";
import { canReview } from "./vacations.routes.js";
import {
  leavePolicy,
  businessDays,
  setLeaveBalance,
} from "../services/leaveBalance.service.js";
import { audit } from "../services/activity.service.js";
const router = Router();
router.use(authenticate);
router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    const row = await one(
      "SELECT vacation_days FROM pb_employee_profiles WHERE user_id=? AND company_id=?",
      [req.user.id, req.companyId],
    );
    const ledger = await many(
      "SELECT kind,days_delta,balance_after,note,created_at FROM pb_leave_ledger WHERE user_id=? AND company_id=? ORDER BY created_at DESC,id DESC LIMIT 30",
      [req.user.id, req.companyId],
    );
    res.json({
      available: row?.vacation_days ?? null,
      policy: await leavePolicy(req.companyId),
      ledger,
    });
  }),
);
router.get(
  "/estimate",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        start: z.string().date(),
        end: z.string().date(),
        userId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.query);
    const userId = q.userId || req.user.id;
    if (userId !== req.user.id && !canReview(req.user.role))
      throw new HttpError(403, "Solo puedes estimar tus propias vacaciones");
    if (
      !(await one("SELECT id FROM pb_users WHERE id=? AND company_id=?", [
        userId,
        req.companyId,
      ]))
    )
      throw new HttpError(404, "Colaborador no encontrado");
    const result = await businessDays(req.companyId, userId, q.start, q.end);
    const profile = await one(
      "SELECT vacation_days FROM pb_employee_profiles WHERE user_id=? AND company_id=?",
      [userId, req.companyId],
    );
    res.json({
      days: result.days,
      available: profile?.vacation_days ?? null,
      automatic: result.policy.automatic,
    });
  }),
);
router.use((req, _res, next) =>
  canReview(req.user.role)
    ? next()
    : next(
        new HttpError(403, "Solo RH o Administración pueden gestionar saldos"),
      ),
);
router.get(
  "/",
  asyncHandler(async (req, res) =>
    res.json({ policy: await leavePolicy(req.companyId) }),
  ),
);
router.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        automatic: z.boolean(),
        count_mode: z.enum(["schedule", "weekdays"]),
        weekdays: z
          .array(z.number().int().min(1).max(7))
          .min(1)
          .max(7)
          .refine((v) => new Set(v).size === v.length, "No repitas días"),
      })
      .strict()
      .parse(req.body);
    await transaction(async (cx) => {
      await cx.execute("SELECT id FROM pb_companies WHERE id=? FOR UPDATE", [
        req.companyId,
      ]);
      await cx.execute(
        "INSERT INTO pb_leave_policy(company_id,automatic,count_mode,weekdays,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE automatic=VALUES(automatic),count_mode=VALUES(count_mode),weekdays=VALUES(weekdays),updated_by=VALUES(updated_by)",
        [
          req.companyId,
          data.automatic,
          data.count_mode,
          JSON.stringify(data.weekdays),
          req.user.id,
        ],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "vacations.policy_changed",
          targetType: "company",
          targetId: req.companyId,
          detail: data,
        },
        cx,
      );
    });
    res.json({ policy: data });
  }),
);
router.put(
  "/balances/:id",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        value: z
          .number()
          .finite()
          .min(0)
          .max(99999)
          .refine(
            (n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-8,
            "Usa hasta dos decimales",
          ),
        note: z.string().trim().min(10).max(500),
      })
      .strict()
      .parse(req.body);
    await setLeaveBalance({
      companyId: req.companyId,
      userId: idSchema.parse(req.params.id),
      value: data.value,
      note: data.note,
      actorId: req.user.id,
    });
    res.json({ ok: true });
  }),
);
export default router;
