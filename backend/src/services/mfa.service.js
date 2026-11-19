import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../config/env.js";
import { one, run, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode(secret) {
  let bits = 0,
    value = 0,
    out = [];
  for (const char of secret) {
    const n = alphabet.indexOf(char);
    if (n < 0) throw new Error("Invalid secret");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export function totp(secret, counter = Math.floor(Date.now() / 30000)) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", decode(secret)).update(bytes).digest(),
    i = mac[19] & 15;
  return String((mac.readUInt32BE(i) & 0x7fffffff) % 1000000).padStart(6, "0");
}
const key = () => {
  if (env.jwtSecret.length < 32)
    throw new Error("Configura JWT_SECRET antes de habilitar MFA");
  return Buffer.from(
    hkdfSync(
      "sha256",
      env.jwtSecret,
      "luma-mfa-v1",
      "encrypted-totp-secret",
      32,
    ),
  );
};
function encrypt(value) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv),
    bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
}
function decrypt(value) {
  const b = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  cipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([
    cipher.update(b.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export const hashCode = (code) =>
  createHash("sha256")
    .update(code.replace(/[\s-]/g, "").toLowerCase())
    .digest("hex");
export async function mfaEnabled(userId) {
  return Boolean(
    (await one("SELECT enabled FROM pb_mfa WHERE user_id=?", [userId]))
      ?.enabled,
  );
}
export async function beginEnrollment(user) {
  const secret = base32(randomBytes(20));
  await transaction(async (cx) => {
    await cx.execute("SELECT id FROM pb_users WHERE id=? FOR UPDATE", [
      user.id,
    ]);
    const [[old]] = await cx.execute(
      "SELECT enabled FROM pb_mfa WHERE user_id=?",
      [user.id],
    );
    if (old?.enabled)
      throw new HttpError(409, "La autenticación en dos pasos ya está activa");
    await cx.execute(
      "INSERT INTO pb_mfa(user_id,company_id,secret_encrypted) VALUES (?,?,?) ON DUPLICATE KEY UPDATE secret_encrypted=VALUES(secret_encrypted),last_counter=-1,created_at=UTC_TIMESTAMP(3)",
      [user.id, user.company_id, encrypt(secret)],
    );
  });
  return {
    secret,
    uri:
      "otpauth://totp/" +
      encodeURIComponent("Luma:" + user.email) +
      "?secret=" +
      secret +
      "&issuer=Luma&algorithm=SHA1&digits=6&period=30",
  };
}
export async function checkFactor(
  cx,
  userId,
  code,
  { enrollment = false } = {},
) {
  const [[row]] = await cx.execute(
    "SELECT * FROM pb_mfa WHERE user_id=? FOR UPDATE",
    [userId],
  );
  if (!row || (!enrollment && !row.enabled)) return false;
  if (enrollment && Date.now() - new Date(row.created_at).getTime() > 600000)
    return false;
  if (/^\d{6}$/.test(code)) {
    const secret = decrypt(row.secret_encrypted),
      counter = Math.floor(Date.now() / 30000);
    for (const offset of [-1, 0, 1]) {
      const n = counter + offset;
      if (n <= Number(row.last_counter)) continue;
      if (timingSafeEqual(Buffer.from(totp(secret, n)), Buffer.from(code))) {
        await cx.execute("UPDATE pb_mfa SET last_counter=? WHERE user_id=?", [
          n,
          userId,
        ]);
        return true;
      }
    }
  }
  if (!enrollment) {
    const [result] = await cx.execute(
      "UPDATE pb_mfa_recovery SET used_at=UTC_TIMESTAMP(3) WHERE user_id=? AND code_hash=? AND used_at IS NULL",
      [userId, hashCode(code)],
    );
    if (result.affectedRows) return true;
  }
  return false;
}
export async function recoveryCodes(cx, userId) {
  await cx.execute("DELETE FROM pb_mfa_recovery WHERE user_id=?", [userId]);
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(16).toString("hex"),
  );
  for (const code of codes)
    await cx.execute(
      "INSERT INTO pb_mfa_recovery(user_id,code_hash) VALUES (?,?)",
      [userId, hashCode(code)],
    );
  return codes;
}
const cookie = "luma_mfa_challenge",
  options = {
    httpOnly: true,
    sameSite: "strict",
    secure: env.nodeEnv === "production",
    path: "/api/auth/mfa",
  };
export async function loginChallenge(res, user) {
  const token = randomBytes(32).toString("hex");
  await run(
    "INSERT INTO pb_mfa_challenges(id,user_id,token_hash,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(3)+INTERVAL 5 MINUTE)",
    [randomUUID(), user.id, hashCode(token)],
  );
  res.cookie(cookie, token, { ...options, maxAge: 300000 });
  return { mfaRequired: true };
}
export function clearChallenge(res) {
  res.clearCookie(cookie, options);
}
export async function consumeChallenge(token, code) {
  return transaction(async (cx) => {
    const [[pre]] = await cx.execute(
      "SELECT user_id FROM pb_mfa_challenges WHERE token_hash=?",
      [hashCode(token)],
    );
    if (!pre) return null;
    await cx.execute("SELECT id FROM pb_users WHERE id=? FOR UPDATE", [
      pre.user_id,
    ]);
    const [[challenge]] = await cx.execute(
      "SELECT * FROM pb_mfa_challenges WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3) AND attempts<5 FOR UPDATE",
      [hashCode(token)],
    );
    if (!challenge) return null;
    await cx.execute(
      "UPDATE pb_mfa_challenges SET attempts=attempts+1 WHERE id=?",
      [challenge.id],
    );
    if (!(await checkFactor(cx, challenge.user_id, code))) return null;
    await cx.execute(
      "UPDATE pb_mfa_challenges SET used_at=UTC_TIMESTAMP(3) WHERE id=?",
      [challenge.id],
    );
    return { id: challenge.user_id };
  });
}
