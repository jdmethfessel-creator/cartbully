import { createHmac, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";

// Anonymous user identity, no signup. Cookie stores an id, plus a signed free-counter token.
// Server-side fallback: hashed IP+UA counter table (see events + verdicts.user_or_anon_key).

const COOKIE = "cb_anon";
const SECRET = process.env.CRON_SECRET || "cartbully-dev-secret";

export function readAnonId(): string {
  const c = cookies();
  const existing = c.get(COOKIE)?.value;
  if (existing && /^[a-z0-9-]{8,}$/i.test(existing)) return existing;
  return "";
}

export function mintAnonId(): string {
  return `a_${randomBytes(9).toString("hex")}`;
}

export function fingerprint(): string {
  const h = headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "0.0.0.0";
  const ua = h.get("user-agent") || "unknown";
  return createHmac("sha256", SECRET).update(`${ip}|${ua}`).digest("hex").slice(0, 24);
}

export function anonKey(): { anonId: string; fp: string; combined: string } {
  const anonId = readAnonId();
  const fp = fingerprint();
  return { anonId, fp, combined: anonId ? `anon:${anonId}` : `fp:${fp}` };
}
