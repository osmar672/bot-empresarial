import {Router} from 'express';
import {one} from '../db/pool.js';
import {authenticate,adminOnly} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
const router=Router();router.use(authenticate,adminOnly);
router.get('/',asyncHandler(async(req,res)=>{
  const r=await one(`SELECT c.plan_id,p.max_documents,p.max_questions_month,
    (SELECT COUNT(*) FROM pb_documents d WHERE d.company_id=c.id) AS documents_used,
    (SELECT COUNT(*) FROM pb_messages m
     WHERE m.company_id=c.id
       AND (m.state='ok' OR (m.state='processing' AND m.created_at>=UTC_TIMESTAMP()-INTERVAL 15 MINUTE))
       AND m.created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01')
       AND m.created_at<DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH),'%Y-%m-01')
    ) AS questions_used,
    (SELECT COALESCE(SUM(m.input_tokens), 0) FROM pb_messages m
     WHERE m.company_id=c.id AND (m.state='ok' OR m.input_tokens > 0)
       AND m.created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01')
    ) AS input_tokens,
    (SELECT COALESCE(SUM(m.output_tokens), 0) FROM pb_messages m
     WHERE m.company_id=c.id AND (m.state='ok' OR m.output_tokens > 0)
       AND m.created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01')
    ) AS output_tokens,
    (SELECT COALESCE(SUM(COALESCE(m.total_tokens, m.input_tokens + m.output_tokens)), 0) FROM pb_messages m
     WHERE m.company_id=c.id AND (m.state='ok' OR m.total_tokens > 0 OR m.input_tokens > 0)
       AND m.created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01')
    ) AS total_tokens
    FROM pb_companies c JOIN pb_plans p ON p.id=c.plan_id WHERE c.id=?`, [req.companyId]);

  // Desglose por modelo / proveedor durante el mes
  const byModel = await many(`
    SELECT COALESCE(m.provider, 'groq') AS provider,
      COALESCE(m.model, 'openai/gpt-oss-120b') AS model,
      COUNT(*) AS questions,
      COALESCE(SUM(m.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(m.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(COALESCE(m.total_tokens, m.input_tokens + m.output_tokens)), 0) AS total_tokens
    FROM pb_messages m
    WHERE m.company_id = ? AND (m.state = 'ok' OR m.input_tokens > 0)
      AND m.created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')
    GROUP BY m.provider, m.model`, [req.companyId]);

  // Consumo por usuario en la empresa
  const byUser = await many(`
    SELECT u.id, u.name, u.email, u.role,
      COUNT(m.id) AS questions,
      COALESCE(SUM(m.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(m.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(COALESCE(m.total_tokens, m.input_tokens + m.output_tokens)), 0) AS total_tokens
    FROM pb_users u
    LEFT JOIN pb_messages m ON m.user_id = u.id AND m.company_id = u.company_id AND (m.state = 'ok' OR m.input_tokens > 0) AND m.created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')
    WHERE u.company_id = ?
    GROUP BY u.id, u.name, u.email, u.role
    ORDER BY questions DESC`, [req.companyId]);

  // Actividad diaria del mes en curso (reporte diario)
  const daily = await many(`
    SELECT DATE_FORMAT(m.created_at, '%Y-%m-%d') AS date,
      COUNT(*) AS questions,
      COALESCE(SUM(m.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(m.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(COALESCE(m.total_tokens, m.input_tokens + m.output_tokens)), 0) AS total_tokens
    FROM pb_messages m
    WHERE m.company_id = ? AND (m.state = 'ok' OR m.input_tokens > 0)
      AND m.created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')
    GROUP BY DATE_FORMAT(m.created_at, '%Y-%m-%d')
    ORDER BY date DESC`, [req.companyId]);

  const now = new Date();
  const period = {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
  };

  res.json({
    usage: {
      ...r,
      total_tokens: Number(r?.total_tokens || (Number(r?.input_tokens || 0) + Number(r?.output_tokens || 0))),
      period
    },
    byModel,
    byUser,
    daily
  });
}));

// Reporte histórico por meses anteriores
router.get('/history', asyncHandler(async (req, res) => {
  const months = Math.max(1, Math.min(12, Number(req.query.months || 6)));
  const monthly = await many(`
    SELECT DATE_FORMAT(m.created_at, '%Y-%m') AS month,
      COUNT(*) AS questions,
      COALESCE(SUM(m.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(m.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(COALESCE(m.total_tokens, m.input_tokens + m.output_tokens)), 0) AS total_tokens
    FROM pb_messages m
    WHERE m.company_id = ? AND (m.state = 'ok' OR m.input_tokens > 0)
      AND m.created_at >= DATE_SUB(DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01'), INTERVAL ? MONTH)
    GROUP BY DATE_FORMAT(m.created_at, '%Y-%m')
    ORDER BY month DESC`, [req.companyId, months - 1]);

  res.json({ history: monthly });
}));

export default router;
