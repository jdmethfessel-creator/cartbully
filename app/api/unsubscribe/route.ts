import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed one-click unsubscribe. The signature is an HMAC of the user id keyed
// on CRON_SECRET, matching what the price-check cron mint on outgoing emails.
// Anonymous users don't get emails so we don't need an anon path.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u");
  const sig = req.nextUrl.searchParams.get("s");
  if (!userId || !sig) return respond(400, "Missing parameters.");
  if (!verifySignature(userId, sig)) return respond(400, "Bad signature.");

  const sb = supabaseService();
  if (!sb) return respond(500, "Storage unavailable.");
  await sb
    .from("profiles")
    .upsert(
      { id: userId, price_alerts_unsubscribed: true },
      { onConflict: "id" }
    );
  return respond(200, "You are unsubscribed. No more price alerts. The verdicts still stand.");
}

// Some clients POST for RFC 8058 one-click unsubscribe. Handle both.
export async function POST(req: NextRequest) {
  return GET(req);
}

function verifySignature(userId: string, sig: string): boolean {
  const secret = process.env.CRON_SECRET || "cartbully-dev-secret";
  const expected = createHmac("sha256", secret)
    .update(`unsub:${userId}`)
    .digest("hex")
    .slice(0, 16);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function respond(status: number, message: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>CartBully</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,sans-serif;background:#FDFBF2;color:#1C1A17;padding:32px;line-height:1.5;max-width:520px;margin:auto;} h1{margin-top:0;} .wm{font-weight:800;font-size:28px;} .wm span{color:#D6231F}</style></head><body><div class="wm">CART<span>BULLY</span></div><h1>${escape(message)}</h1></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}
