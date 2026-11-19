import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many } from "../db/pool.js";
import { canReview } from "./vacations.routes.js";
const router = Router();
router.use(authenticate);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, type, page } = z
      .object({
        q: z.string().trim().min(2).max(120),
        type: z
          .enum(["documents", "conversations", "requests"])
          .default("documents"),
        page: z.coerce.number().int().min(1).max(100).default(1),
      })
      .strict()
      .parse(req.query);
    const pattern = "%" + q.replace(/[!%_]/g, (c) => "!" + c) + "%",
      offset = (page - 1) * 20;
    let rows;
    if (type === "documents")
      rows = await many(
        `SELECT d.id,d.name AS title,d.state AS subtitle,'documents' AS target FROM pb_documents d WHERE d.company_id=? AND (?='admin' OR JSON_CONTAINS(d.allowed_roles,JSON_QUOTE(?))) AND (d.name LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM pb_chunks c WHERE c.company_id=d.company_id AND c.document_id=d.id AND c.content LIKE ? ESCAPE '!')) ORDER BY d.created_at DESC,d.id LIMIT 21 OFFSET ${offset}`,
        [req.companyId, req.user.role, req.user.role, pattern, pattern],
      );
    if (type === "conversations")
      rows = await many(
        `SELECT c.id,c.title,'Conversación privada' AS subtitle,'chat' AS target FROM pb_conversations c WHERE c.company_id=? AND c.user_id=? AND (c.title LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM pb_messages m WHERE m.company_id=c.company_id AND m.user_id=c.user_id AND m.conversation_id=c.id AND m.question LIKE ? ESCAPE '!')) ORDER BY c.updated_at DESC,c.id LIMIT 21 OFFSET ${offset}`,
        [req.companyId, req.user.id, pattern, pattern],
      );
    if (type === "requests") {
      const hr = canReview(req.user.role),
        scope = hr ? "" : " AND r.user_id=?",
        args = [req.companyId, ...(hr ? [] : [req.user.id]), pattern, pattern];
      rows = await many(
        `SELECT * FROM (SELECT r.id,CONCAT('Vacaciones · ',u.name) AS title,CONCAT(DATE_FORMAT(r.start_date,'%d/%m/%Y'),' — ',DATE_FORMAT(r.end_date,'%d/%m/%Y'),' · ',r.status) AS subtitle,r.reason,r.review_comment,'vacation' AS kind,r.created_at FROM pb_vacation_requests r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id WHERE r.company_id=?${scope} AND (r.reason LIKE ? ESCAPE '!' OR u.name LIKE ? ESCAPE '!') UNION ALL SELECT r.id,CONCAT('Permiso por horas · ',u.name) AS title,CONCAT(DATE_FORMAT(r.starts_at-INTERVAL 6 HOUR,'%d/%m/%Y %H:%i'),' · ',r.status) AS subtitle,r.reason,r.review_comment,'permission' AS kind,r.created_at FROM pb_permission_requests r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id WHERE r.company_id=?${scope} AND (r.reason LIKE ? ESCAPE '!' OR u.name LIKE ? ESCAPE '!')) results ORDER BY created_at DESC,id LIMIT 21 OFFSET ${offset}`,
        [...args, ...args],
      );
      rows = rows.map((r) => ({ ...r, target: hr ? "hr" : "profile" }));
    }
    res
      .set("Cache-Control", "private, no-store")
      .json({ items: rows.slice(0, 20), hasMore: rows.length > 20, page });
  }),
);
export default router;
