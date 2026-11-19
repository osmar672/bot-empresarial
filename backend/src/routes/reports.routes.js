import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, one } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { canReview } from "./vacations.routes.js";
import { audit } from "../services/activity.service.js";
const router = Router();
router.use(authenticate);
const stateName = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};
const labels = {
  attendance: "Asistencia",
  punctuality: "Puntualidad y atrasos",
  vacations: "Vacaciones",
  permissions: "Permisos por horas",
  usage: "Consumo de IA",
};
const time = (value) =>
  value
    ? new Intl.DateTimeFormat("es-CR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Costa_Rica",
      }).format(new Date(value))
    : "—";
router.get(
  "/:kind",
  asyncHandler(async (req, res) => {
    const kind = z
      .enum(["attendance", "punctuality", "vacations", "permissions", "usage"])
      .parse(req.params.kind);
    const q = z
      .object({
        from: z.string().date(),
        to: z.string().date(),
        format: z.enum(["xlsx", "pdf"]),
        userId: z.string().uuid().optional(),
      })
      .strict()
      .refine(
        (v) =>
          v.to >= v.from &&
          (new Date(v.to) - new Date(v.from)) / 86400000 <= 365,
        "El intervalo debe ser de hasta 366 días",
      )
      .parse(req.query);
    if (kind === "usage" && req.user.role !== "admin")
      throw new HttpError(403, "Solo Administración puede exportar el consumo");
    const hr = canReview(req.user.role);
    if (q.userId && q.userId !== req.user.id && !hr)
      throw new HttpError(403, "Solo puedes exportar tus propios registros");
    const userId = q.userId || (!hr ? req.user.id : null);
    if (
      userId &&
      !(await one("SELECT id FROM pb_users WHERE id=? AND company_id=?", [
        userId,
        req.companyId,
      ]))
    )
      throw new HttpError(404, "Colaborador no encontrado");
    const args = [req.companyId, q.from, q.to, ...(userId ? [userId] : [])],
      scope = userId ? " AND r.user_id=?" : "";
    let rows, columns;
    if (kind === "attendance" || kind === "punctuality") {
      rows = await many(
        `SELECT u.name,u.email,r.checked_in_at,r.checked_out_at,p.expected_at,p.is_punctual,TIMESTAMPDIFF(SECOND,r.checked_in_at,r.checked_out_at)/3600 AS hours,GREATEST(0,TIMESTAMPDIFF(SECOND,p.expected_at,r.checked_in_at))/60 AS late FROM pb_attendance r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id LEFT JOIN pb_attendance_punctuality p ON p.attendance_id=r.id AND p.company_id=r.company_id WHERE r.company_id=? AND DATE(r.checked_in_at-INTERVAL 6 HOUR) BETWEEN ? AND ?${scope} ORDER BY r.checked_in_at,r.id LIMIT 10001`,
        args,
      );
      columns = [
        "Nombre",
        "Correo",
        "Entrada (CR)",
        "Salida (CR)",
        "Horas cerradas",
        "Entrada prevista (CR)",
        "Puntualidad",
        "Atraso (min)",
      ];
      rows = rows.map((r) => [
        r.name,
        r.email,
        time(r.checked_in_at),
        time(r.checked_out_at),
        r.hours == null
          ? "Jornada abierta"
          : Number(Number(r.hours).toFixed(2)),
        time(r.expected_at),
        r.is_punctual == null
          ? "Sin evaluación"
          : r.is_punctual
            ? "Puntual"
            : "Tarde",
        r.late == null ? "—" : Number(Number(r.late).toFixed(2)),
      ]);
    } else if (kind === "vacations") {
      rows = await many(
        `SELECT u.name,u.email,DATE_FORMAT(r.start_date,'%Y-%m-%d') AS start,DATE_FORMAT(r.end_date,'%Y-%m-%d') AS end,r.status,-l.days_delta AS days FROM pb_vacation_requests r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id LEFT JOIN pb_leave_ledger l ON l.request_id=r.id AND l.company_id=r.company_id AND l.kind='debit' WHERE r.company_id=? AND r.start_date<=? AND r.end_date>=?${scope} ORDER BY r.start_date,r.id LIMIT 10001`,
        [req.companyId, q.to, q.from, ...(userId ? [userId] : [])],
      );
      columns = [
        "Nombre",
        "Correo",
        "Desde",
        "Hasta",
        "Estado",
        "Días descontados",
      ];
      rows = rows.map((r) => [
        r.name,
        r.email,
        r.start,
        r.end,
        stateName[r.status] || r.status,
        r.days == null ? "Sin descuento automático" : Number(r.days),
      ]);
    } else if (kind === "permissions") {
      rows = await many(
        `SELECT u.name,u.email,r.starts_at,r.ends_at,r.minutes,r.status FROM pb_permission_requests r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id WHERE r.company_id=? AND DATE(r.starts_at-INTERVAL 6 HOUR) BETWEEN ? AND ?${scope} ORDER BY r.starts_at,r.id LIMIT 10001`,
        args,
      );
      columns = [
        "Nombre",
        "Correo",
        "Desde (CR)",
        "Hasta (CR)",
        "Minutos",
        "Estado",
      ];
      rows = rows.map((r) => [
        r.name,
        r.email,
        time(r.starts_at),
        time(r.ends_at),
        r.minutes,
        stateName[r.status] || r.status,
      ]);
    } else {
      rows = await many(
        `SELECT u.name,u.email,COUNT(*) AS questions,SUM(r.input_tokens) AS input,SUM(r.output_tokens) AS output,SUM(COALESCE(r.total_tokens,r.input_tokens+r.output_tokens)) AS total FROM pb_messages r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id WHERE r.company_id=? AND DATE(r.created_at-INTERVAL 6 HOUR) BETWEEN ? AND ? AND (r.state='ok' OR r.input_tokens>0 OR r.output_tokens>0 OR r.total_tokens>0)${scope} GROUP BY u.id,u.name,u.email ORDER BY u.name LIMIT 10001`,
        args,
      );
      columns = [
        "Nombre",
        "Correo",
        "Consultas",
        "Tokens entrada",
        "Tokens salida",
        "Tokens totales",
      ];
      rows = rows.map((r) => [
        r.name,
        r.email,
        Number(r.questions),
        Number(r.input || 0),
        Number(r.output || 0),
        Number(r.total || 0),
      ]);
    }
    if (rows.length > 10000)
      throw new HttpError(
        422,
        "Hay más de 10 000 registros. Reduce el intervalo o selecciona un colaborador.",
      );
    const title = labels[kind],
      filename = "luma-" + kind + "-" + q.from + "-" + q.to + "." + q.format;
    let output;
    if (q.format === "xlsx") {
      const book = new ExcelJS.Workbook();
      book.creator = "Luma";
      const sheet = book.addWorksheet(title);
      sheet.addRow([title]);
      sheet.addRow(["Hora de Costa Rica · " + q.from + " a " + q.to]);
      sheet.addRow(columns);
      for (const row of rows) sheet.addRow(row);
      sheet.views = [{ state: "frozen", ySplit: 3 }];
      sheet.autoFilter = {
        from: { row: 3, column: 1 },
        to: { row: 3, column: columns.length },
      };
      columns.forEach((_, i) => {
        sheet.getColumn(i + 1).width = i < 2 ? 28 : 23;
      });
      sheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "6650A5" },
      };
      output = Buffer.from(await book.xlsx.writeBuffer());
    } else {
      const pdf = new PDFDocument({
          size: "A4",
          layout: "landscape",
          margin: 30,
        }),
        chunks = [];
      const done = new Promise((resolve, reject) => {
        pdf.on("data", (chunk) => chunks.push(chunk));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
      });
      const width = (pdf.page.width - 60) / columns.length;
      let y;
      const header = () => {
        pdf
          .font("Helvetica-Bold")
          .fontSize(16)
          .text("Luma · " + title, 30, 25);
        pdf
          .font("Helvetica")
          .fontSize(9)
          .text(
            q.from +
              " a " +
              q.to +
              " · Hora de Costa Rica · " +
              rows.length +
              " registros",
            30,
            48,
          );
        y = 72;
        columns.forEach((v, i) =>
          pdf
            .font("Helvetica-Bold")
            .fontSize(8)
            .text(v, 30 + i * width, y, { width: width - 8 }),
        );
        y += 30;
      };
      header();
      for (const row of rows) {
        pdf.font("Helvetica").fontSize(8);
        const h = Math.max(
          22,
          ...row.map(
            (v) => pdf.heightOfString(String(v), { width: width - 8 }) + 12,
          ),
        );
        if (y + h > pdf.page.height - 35) {
          pdf.addPage();
          header();
        }
        row.forEach((v, i) =>
          pdf
            .font("Helvetica")
            .fontSize(8)
            .text(String(v), 30 + i * width, y, { width: width - 8 }),
        );
        y += h;
      }
      if (!rows.length)
        pdf.font("Helvetica").text("Sin registros en este intervalo.", 30, y);
      pdf.end();
      output = await done;
    }
    await audit({
      companyId: req.companyId,
      actorId: req.user.id,
      action: "reports.exported",
      targetType: "report",
      detail: {
        kind,
        from: q.from,
        to: q.to,
        format: q.format,
        rows: rows.length,
      },
    });
    res
      .set({
        "Content-Type":
          q.format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": 'attachment; filename="' + filename + '"',
        "Cache-Control": "private, no-store",
      })
      .send(output);
  }),
);
export default router;
