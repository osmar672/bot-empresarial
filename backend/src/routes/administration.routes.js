import { Router } from "express";
import { env } from "../config/env.js";
import { many, one } from "../db/pool.js";
import { adminOnly, authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { folderDetails } from "../services/drive.service.js";
import { mailConfigured } from "../services/mail.service.js";

const router = Router();
router.use(authenticate, adminOnly);

router.get("/", asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const [counts, activity, drive] = await Promise.all([
    one(
      `SELECT c.name, c.plan_id AS plan,
        (SELECT COUNT(*) FROM pb_users WHERE company_id=c.id AND role<>'admin') AS collaborators,
        (SELECT COUNT(*) FROM pb_documents WHERE company_id=c.id) AS documents,
        (SELECT COUNT(*) FROM pb_documents WHERE company_id=c.id AND state='error') AS documentErrors,
        (SELECT COUNT(*) FROM pb_vacation_requests WHERE company_id=c.id AND status='pending') AS vacations,
        (SELECT COUNT(*) FROM pb_permission_requests WHERE company_id=c.id AND status='pending') AS permissions,
        (SELECT COUNT(*) FROM pb_attendance_corrections WHERE company_id=c.id AND status='pending') AS corrections,
        (SELECT COUNT(*) FROM pb_knowledge_gaps WHERE company_id=c.id AND status='pending') AS knowledge
       FROM pb_companies c WHERE c.id=?`,
      [companyId],
    ),
    many(
      `SELECT a.id, a.action, a.created_at, u.name AS actor
       FROM pb_audit_events a
       LEFT JOIN pb_users u ON u.id=a.actor_id AND u.company_id=a.company_id
       WHERE a.company_id=?
       ORDER BY a.created_at DESC, a.id DESC LIMIT 6`,
      [companyId],
    ),
    folderDetails(companyId),
  ]);

  res.json({
    ...counts,
    activity,
    integrations: {
      googleLogin: Boolean(env.googleClientId),
      mail: mailConfigured(),
      driveConfigured: drive.autoSync,
      driveLastState: drive.last?.state ?? null,
    },
  });
}));

export default router;
