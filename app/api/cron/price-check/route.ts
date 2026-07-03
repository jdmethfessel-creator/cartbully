import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { extractProduct } from "@/lib/extractor";
import { SALE_DROP_MIN_DOLLARS, SALE_DROP_PERCENT, SHARE_FOOTER } from "@/config";
import { Resend } from "resend";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    req.nextUrl.searchParams.get("secret");
  if (!secret || provided !== secret) return unauthorized();

  const sb = supabaseService();
  if (!sb) return NextResponse.json({ ok: false, note: "no-supabase" });

  // Only watch lockers owned by active subscribers.
  const { data: subs } = await sb
    .from("subscribers")
    .select("email, user_id, status")
    .eq("status", "active");
  const subKeys = new Set(
    (subs || []).map((s) => (s.user_id ? `user:${s.user_id}` : ""))
  );

  const { data: lockers } = await sb
    .from("lockers")
    .select("id, verdict_id, user_or_anon_key, last_price, status, verdicts(url, price, title)")
    .eq("status", "watching")
    .limit(200);

  type LockerRow = {
    id: string;
    verdict_id: string;
    user_or_anon_key: string;
    last_price: number | null;
    status: string;
    verdicts: { url: string; price: number; title: string } | null;
  };

  const rows = (lockers as unknown as LockerRow[]) || [];
  let checked = 0;
  let alerted = 0;
  for (const row of rows) {
    if (!row.verdicts) continue;
    if (!subKeys.has(row.user_or_anon_key)) continue;
    const original = Number(row.verdicts.price);
    const fresh = await extractProduct(row.verdicts.url);
    checked++;
    if (fresh.price == null) continue;
    await sb.from("price_snapshots").insert({
      verdict_id: row.verdict_id,
      price: fresh.price,
      captured_at: new Date().toISOString(),
    });
    const dropPct = ((original - fresh.price) / original) * 100;
    const dropDollars = original - fresh.price;
    if (dropPct >= SALE_DROP_PERCENT && dropDollars >= SALE_DROP_MIN_DOLLARS) {
      // Dedupe: skip if we already alerted at this price or lower.
      const { data: prior } = await sb
        .from("alerts_sent")
        .select("price")
        .eq("verdict_id", row.verdict_id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prior && Number(prior.price) <= fresh.price) continue;

      // Update locker.
      await sb
        .from("lockers")
        .update({
          status: "released",
          last_price: fresh.price,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      // Email if we can.
      const sub = (subs || []).find(
        (s) => s.user_id && `user:${s.user_id}` === row.user_or_anon_key
      );
      if (sub?.email && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const url = row.verdicts.url;
        await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: sub.email,
          subject: "It's banging on the locker door.",
          html: emailHtml({
            title: row.verdicts.title,
            oldPrice: original,
            newPrice: fresh.price,
            url,
          }),
        });
      }
      await sb.from("alerts_sent").insert({
        verdict_id: row.verdict_id,
        price: fresh.price,
      });
      alerted++;
    }
  }
  return NextResponse.json({ ok: true, checked, alerted });
}

function emailHtml({
  title,
  oldPrice,
  newPrice,
  url,
}: {
  title: string;
  oldPrice: number;
  newPrice: number;
  url: string;
}) {
  const saved = (oldPrice - newPrice).toFixed(2);
  return `
  <div style="font-family: system-ui, sans-serif; background:#FDFBF2; color:#1C1A17; padding:24px;">
    <div style="font-size:32px; font-weight:800;">
      <span style="color:#1C1A17;">CART</span><span style="color:#D6231F;">BULLY</span>
    </div>
    <h1 style="margin-top:16px; font-size:26px;">It's banging on the locker door.</h1>
    <p style="font-size:18px; line-height:1.4;">${escapeHtml(title)}</p>
    <p style="font-size:20px;">
      <span style="text-decoration: line-through; color:#6D675C;">$${oldPrice.toFixed(2)}</span>
      <span style="background:#FFE45C; padding:2px 6px; margin-left:8px;">$${newPrice.toFixed(2)}</span>
      <span style="color:#2E7D46; margin-left:8px;">save $${saved}</span>
    </p>
    <p>
      <a href="${escapeAttr(url)}" style="display:inline-block; background:#D6231F; color:#FDFBF2; padding:12px 20px; text-decoration:none; font-weight:800;">Let it out</a>
    </p>
    <p style="margin-top:24px; font-size:12px; color:#6D675C;">${SHARE_FOOTER}</p>
    <p style="font-size:11px; color:#6D675C;">
      You get these because you subscribed to CartBully. Manage or cancel in your billing portal.
    </p>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function escapeAttr(s: string) {
  return s.replace(/"/g, "&quot;");
}
