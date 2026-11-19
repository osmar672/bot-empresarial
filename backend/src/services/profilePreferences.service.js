import { z } from "zod";
import { one, run } from "../db/pool.js";
export const appearanceSchema = z
  .object({
    displayName: z.string().trim().max(60).default(""),
    bio: z.string().trim().max(500).default(""),
    location: z.string().trim().max(80).default(""),
    tagline: z.string().trim().max(100).default(""),
    theme: z
      .enum(["luma", "midnight", "ocean", "forest", "sunset"])
      .default("luma"),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#7755ad"),
    coverPreset: z.enum(["aurora", "grid", "waves", "none"]).default("aurora"),
    frame: z.enum(["clean", "ring", "double", "glow"]).default("ring"),
    avatarShape: z.enum(["rounded", "circle", "square"]).default("rounded"),
    layout: z.enum(["comfortable", "compact"]).default("comfortable"),
    status: z.enum(["available", "busy", "away"]).default("available"),
    showEmail: z.boolean().default(true),
    showDepartment: z.boolean().default(true),
    showStreak: z.boolean().default(true),
    motion: z.boolean().default(true),
    sections: z
      .array(z.enum(["about", "streak", "work"]))
      .length(3)
      .refine((v) => new Set(v).size === 3, "No repitas secciones")
      .default(["about", "streak", "work"]),
  })
  .strict();
export const defaultAppearance = () => appearanceSchema.parse({});
export async function getAppearance(userId, companyId) {
  const row = await one(
    "SELECT settings FROM pb_profile_preferences WHERE user_id=? AND company_id=?",
    [userId, companyId],
  );
  return row
    ? appearanceSchema.parse(
        typeof row.settings === "string"
          ? JSON.parse(row.settings)
          : row.settings,
      )
    : defaultAppearance();
}
export async function saveAppearance(userId, companyId, settings) {
  const parsed = appearanceSchema.parse(settings);
  await run(
    "INSERT INTO pb_profile_preferences(user_id,company_id,settings) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)",
    [userId, companyId, JSON.stringify(parsed)],
  );
  return parsed;
}
