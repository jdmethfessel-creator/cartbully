import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { extractProduct } from "@/lib/extractor";
import { SALE_DROP_MIN_DOLLARS, SALE_DROP_PERCENT } from "@/config";
import { Resend } from "resend";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

type LockerRow = {
  id: string;
  verdict_id: string;
  user_or_anon_key: string;
  last_price: number | null;
  status: string;
  verdicts: { url: string; price: number | string; title: string } | null;
};

type SubRow = {
  email: string | null;
  user_id: string | null;
  status: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  price_alerts_unsubscribed: boolean | null;
};

type AuthUser = { id: string; email: string | null };

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    req.nextUrl.searchParams.get("secret");
  if (!secret || provided !== secret) return unauthorized();

  const sb = supabaseService();
  if (!sb) return NextResponse.json({ ok: false, note: "no-supabase" });

  // Pull watched lockers. We look up owner emails from BOTH subscribers and
  // profiles so any logged-in user with a real email gets alerts, not just
  // active Stripe subscribers.
  const { data: lockers } = await sb
    .from("lockers")
    .select("id, verdict_id, user_or_anon_key, last_price, status, verdicts(url, price, title)")
    .eq("status", "watching")
    .limit(200);
  const rows = ((lockers as unknown as LockerRow[]) || []).filter((r) => r.verdicts);

  // Bulk lookups.
  const userIds = Array.from(
    new Set(
      rows
        .filter((r) => r.user_or_anon_key.startsWith("user:"))
        .map((r) => r.user_or_anon_key.slice(5))
    )
  );

  const emailByUserId = new Map<string, string>();
  const unsubscribedUserIds = new Set<string>();
  if (userIds.length > 0) {
    // Prefer subscribers.email (kept up to date by Stripe webhook), then
    // profiles.email (populated on magic-link sign in via webhook), then a
    // fallback listUsers scan.
    const { data: subs } = await sb
      .from("subscribers")
      .select("email, user_id, status")
      .in("user_id", userIds);
    for (const s of ((subs as SubRow[]) || [])) {
      if (s.user_id && s.email) emailByUserId.set(s.user_id, s.email);
    }
    const { data: profs } = await sb
      .from("profiles")
      .select("id, email, price_alerts_unsubscribed")
      .in("id", userIds);
    for (const p of ((profs as ProfileRow[]) || [])) {
      if (p.email && !emailByUserId.has(p.id)) emailByUserId.set(p.id, p.email);
      if (p.price_alerts_unsubscribed) unsubscribedUserIds.add(p.id);
    }
    // Fill any remaining gaps by asking auth.users directly.
    const missing = userIds.filter((id) => !emailByUserId.has(id));
    if (missing.length > 0) {
      try {
        const list = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
        for (const u of list.data.users as AuthUser[]) {
          if (u.email && missing.includes(u.id)) emailByUserId.set(u.id, u.email);
        }
      } catch {
        // best-effort; unresolved rows just get skipped below.
      }
    }
  }

  let checked = 0;
  let alerted = 0;
  let sent = 0;
  const messageIds: string[] = [];
  const skipped: Record<string, number> = {
    anon: 0,
    no_email: 0,
    unsubscribed: 0,
    no_fresh_price: 0,
    no_drop: 0,
    prior_alert: 0,
  };

  for (const row of rows) {
    checked++;
    const isUser = row.user_or_anon_key.startsWith("user:");
    if (!isUser) {
      skipped.anon++;
      continue;
    }
    const userId = row.user_or_anon_key.slice(5);
    if (unsubscribedUserIds.has(userId)) {
      skipped.unsubscribed++;
      continue;
    }
    const email = emailByUserId.get(userId) || null;
    if (!email) {
      skipped.no_email++;
      continue;
    }

    const original = Number(row.verdicts!.price);
    const fresh = await extractProduct(row.verdicts!.url);
    if (fresh.price == null) {
      skipped.no_fresh_price++;
      continue;
    }
    await sb.from("price_snapshots").insert({
      verdict_id: row.verdict_id,
      price: fresh.price,
      captured_at: new Date().toISOString(),
    });
    const dropPct = ((original - fresh.price) / original) * 100;
    const dropDollars = original - fresh.price;
    if (dropPct < SALE_DROP_PERCENT || dropDollars < SALE_DROP_MIN_DOLLARS) {
      skipped.no_drop++;
      continue;
    }

    const { data: prior } = await sb
      .from("alerts_sent")
      .select("price")
      .eq("verdict_id", row.verdict_id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior && Number(prior.price) <= fresh.price) {
      skipped.prior_alert++;
      continue;
    }

    // Flip locker state.
    await sb
      .from("lockers")
      .update({
        status: "released",
        last_price: fresh.price,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    alerted++;

    // Send if we have Resend wired.
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const unsubscribeUrl = buildUnsubscribeUrl(userId);
      try {
        const res = await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: email,
          subject: bullySubject(row.verdicts!.title, original, fresh.price),
          text: bullyPlain(row.verdicts!.title, original, fresh.price, row.verdicts!.url, unsubscribeUrl),
          html: bullyHtml({
            title: row.verdicts!.title,
            oldPrice: original,
            newPrice: fresh.price,
            url: row.verdicts!.url,
            unsubscribeUrl,
          }),
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        const id = res.data?.id || null;
        if (id) {
          messageIds.push(id);
          sent++;
          console.log(`[cron price-check] sent id=${id} to=${email} verdict=${row.verdict_id}`);
        } else if (res.error) {
          console.log(`[cron price-check] resend error verdict=${row.verdict_id} err=${res.error.message}`);
        }
      } catch (err) {
        console.log(`[cron price-check] resend threw verdict=${row.verdict_id} err=${(err as Error).message}`);
      }
    }
    await sb.from("alerts_sent").insert({
      verdict_id: row.verdict_id,
      price: fresh.price,
    });
  }

  return NextResponse.json({
    ok: true,
    checked,
    alerted,
    sent,
    messageIds,
    skipped,
  });
}

function bullySubject(title: string, oldPrice: number, newPrice: number): string {
  const shorter = title.length > 40 ? title.slice(0, 40) + "..." : title;
  return `The $${Math.round(oldPrice)} ${shorter} is begging now. $${newPrice.toFixed(2)}.`;
}

function bullyPlain(
  title: string,
  oldPrice: number,
  newPrice: number,
  url: string,
  unsubscribeUrl: string
): string {
  return [
    `You put this in a locker: ${title}`,
    `It was $${oldPrice.toFixed(2)}. Now $${newPrice.toFixed(2)}. That is $${(oldPrice - newPrice).toFixed(2)} off.`,
    `The price is begging. I still say no.`,
    ``,
    `Look at it: ${url}`,
    ``,
    `Unsubscribe from price alerts: ${unsubscribeUrl}`,
  ].join("\n");
}

function bullyHtml(opts: {
  title: string;
  oldPrice: number;
  newPrice: number;
  url: string;
  unsubscribeUrl: string;
}): string {
  const saved = (opts.oldPrice - opts.newPrice).toFixed(2);
  return `
  <div style="font-family: system-ui, sans-serif; background:#FDFBF2; color:#1C1A17; padding:24px; max-width:520px;">
    <div style="font-size:32px; font-weight:800;">
      <span style="color:#1C1A17;">CART</span><span style="color:#D6231F;">BULLY</span>
    </div>
    <h1 style="margin-top:16px; font-size:24px; line-height:1.15;">
      The $${Math.round(opts.oldPrice)} ${escapeHtml(shorten(opts.title))} is begging now. Still no.
    </h1>
    <p style="font-size:16px; line-height:1.5;">
      You stuffed this in a locker. The price finally dropped.
      That does not make it a better idea, but you asked to hear about it, so here we are.
    </p>
    <p style="font-size:18px;">
      <span style="text-decoration: line-through; color:#6D675C;">$${opts.oldPrice.toFixed(2)}</span>
      <span style="background:#FFE45C; padding:2px 6px; margin-left:8px;">$${opts.newPrice.toFixed(2)}</span>
      <span style="color:#2E7D46; margin-left:8px;">$${saved} off</span>
    </p>
    <p>
      <a href="${escapeAttr(opts.url)}" style="display:inline-block; background:#D6231F; color:#FDFBF2; padding:12px 20px; text-decoration:none; font-weight:800;">Look at it anyway</a>
    </p>
    <p style="margin-top:24px; font-size:12px; color:#6D675C;">
      You get these because you stuffed items in a CartBully locker.
      <a href="${escapeAttr(opts.unsubscribeUrl)}" style="color:#6D675C;">Unsubscribe from price alerts</a>.
    </p>
  </div>`;
}

function shorten(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + "..." : s;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function buildUnsubscribeUrl(userId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || "https://cartbully.com";
  const secret = process.env.CRON_SECRET || "cartbully-dev-secret";
  const sig = createHmac("sha256", secret)
    .update(`unsub:${userId}`)
    .digest("hex")
    .slice(0, 16);
  const q = new URLSearchParams({ u: userId, s: sig });
  return `${base}/api/unsubscribe?${q.toString()}`;
}
