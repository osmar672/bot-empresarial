import { canReview } from "./vacations.routes.js";
import { Router } from "express";
import { z } from "zod";
import { authenticate, adminOnly } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, one, run } from "../db/pool.js";
import { idSchema } from "../utils/validation.js";
import { HttpError } from "../utils/errors.js";
const router = Router();
router.use(authenticate);
const visible =
  "n.company_id=? AND n.user_id=? AND (n.kind<>'document' OR EXISTS (SELECT 1 FROM pb_documents d WHERE d.id=n.entity_id AND d.company_id=n.company_id AND (?='admin' OR JSON_CONTAINS(d.allowed_roles,JSON_QUOTE(?))))) AND (n.target<>'hr' OR ?=1) AND (n.target<>'documents' OR n.kind='document' OR ?='admin')";
router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(req.query.page || 1),
      params = [
        req.companyId,
        req.user.id,
        req.user.role,
        req.user.role,
        canReview(req.user.role) ? 1 : 0,
        req.user.role,
      ];
    const count = await one(
      "SELECT COUNT(*) AS total,COALESCE(SUM(n.read_at IS NULL),0) AS unread FROM pb_notifications n WHERE " +
        visible,
      params,
    );
    const items = await many(
      "SELECT n.id,n.title,n.body,n.target,n.kind,n.read_at,n.created_at FROM pb_notifications n WHERE " +
        visible +
        " ORDER BY n.created_at DESC,n.id DESC LIMIT 20 OFFSET " +
        (page - 1) * 20,
      params,
    );
    res.json({ items, page, ...count });
  }),
);
router.patch(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    await run(
      "UPDATE pb_notifications SET read_at=UTC_TIMESTAMP(3) WHERE company_id=? AND user_id=? AND read_at IS NULL",
      [req.companyId, req.user.id],
    );
    res.json({ ok: true });
  }),
);
router.patch(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const result = await run(
      "UPDATE pb_notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE id=? AND company_id=? AND user_id=?",
      [idSchema.parse(req.params.id), req.companyId, req.user.id],
    );
    if (!result.affectedRows) throw new HttpError(404, "Aviso no encontrado");
    res.json({ ok: true });
  }),
);
router.get(
  "/audit",
  adminOnly,
  asyncHandler(async (req, res) => {
    const query = z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          action: z.string().max(80).default(""),
        })
        .parse(req.query),
      where = "a.company_id=?" + (query.action ? " AND a.action=?" : ""),
      params = [req.companyId, ...(query.action ? [query.action] : [])];
    const total = await one(
      "SELECT COUNT(*) AS total FROM pb_audit_events a WHERE " + where,
      params,
    );
    const items = await many(
      "SELECT a.id,a.action,a.target_type,a.target_id,a.detail,a.created_at,u.name AS actor FROM pb_audit_events a LEFT JOIN pb_users u ON u.id=a.actor_id AND u.company_id=a.company_id WHERE " +
        where +
        " ORDER BY a.created_at DESC,a.id DESC LIMIT 30 OFFSET " +
        (query.page - 1) * 30,
      params,
    );
    res.json({ items, ...total, page: query.page });
  }),
);
export default router;
