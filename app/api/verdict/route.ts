import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { extractProduct, normalizeUrl } from "@/lib/extractor";
import { runVerdict, verdictSchema, VerdictJson } from "@/lib/verdict";
import { findCachedVerdict, saveVerdict, repeatCountFor, logEvent } from "@/lib/store";
import { anonKey, mintAnonId } from "@/lib/anonId";
import { supabaseService } from "@/lib/supabase";
import { getServerUser } from "@/lib/serverAuth";
import { FREE_BEATDOWNS } from "@/config";

export const runtime = "nodejs";

type Body = {
  url: string;
  userNote?: string;
  priceOverride?: number;
  titleOverride?: string;
  imageOverride?: string | null;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body?.url) return NextResponse.json({ error: "missing_url" }, { status: 400 });

  let normalized: string;
  try {
    normalized = normalizeUrl(body.url);
    new URL(normalized);
  } catch {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }

  const cached = await findCachedVerdict(normalized);
  const extracted = await extractProduct(normalized);
  const title = body.titleOverride?.trim() || extracted.title;
  const image = body.imageOverride ?? extracted.image;

  const price = body.priceOverride ?? extracted.price;
  if (price == null) {
    return NextResponse.json(
      {
        error: "need_price",
        product: { title, image, domain: extracted.domain },
      },
      { status: 422 }
    );
  }

  // Ensure anon cookie exists, mint one if missing.
  const jar = cookies();
  let currentAnon = jar.get("cb_anon")?.value;
  if (!currentAnon) {
    currentAnon = mintAnonId();
    jar.set("cb_anon", currentAnon, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // Prefer the authenticated user id when present, so logged-in beatdowns
  // auto-save into that user's ledger. Falls back to the anon combined key.
  const user = await getServerUser(req);
  const anon = anonKey();
  const combined = user ? `user:${user.id}` : anon.combined;

  if (cached) {
    await logEvent("verdict_run", { url: normalized, source: "cache" });
    return NextResponse.json({ id: cached.id, verdict: cached, cached: true });
  }

  // Server-side free-limit gate. Only anonymous callers hit this. Cached
  // repeats above always bypass this.
  const isAnon = combined.startsWith("anon:") || combined.startsWith("fp:");
  if (isAnon) {
    const sb = supabaseService();
    if (sb) {
      const { count } = await sb
        .from("verdicts")
        .select("id", { count: "exact", head: true })
        .eq("user_or_anon_key", combined);
      if ((count ?? 0) >= FREE_BEATDOWNS) {
        return NextResponse.json({ error: "paywall", limit: FREE_BEATDOWNS }, { status: 402 });
      }
    }
  }

  const localHour = new Date().getHours();
  const repeatCount = await repeatCountFor(combined, normalized);

  let judged: VerdictJson;
  try {
    judged = await runVerdict({
      title,
      price,
      domain: extracted.domain,
      localHour,
      repeatCount,
      userNote: body.userNote ?? null,
    });
  } catch {
    judged = (await import("@/lib/verdict")).stubVerdict({
      title,
      price,
      domain: extracted.domain,
      localHour,
      repeatCount,
    });
  }

  const check = verdictSchema.safeParse(judged);
  if (!check.success) {
    return NextResponse.json({ error: "engine_bad_json" }, { status: 502 });
  }

  const saved = await saveVerdict({
    url: normalized,
    title,
    price,
    image,
    domain: extracted.domain,
    verdict: judged.verdict,
    grade: judged.grade,
    roast: judged.roast,
    card_line: judged.card_line,
    math: judged.math,
    swap: judged.swap,
    category: judged.category,
    product_type: judged.product_type,
    defensibility_score: judged.defensibility_score,
    user_or_anon_key: combined,
    shareable: true,
  });

  // TRASHED items get stuffed in a locker so the price-watch cron can nag later.
  if (judged.verdict === "TRASHED") {
    const sb = supabaseService();
    if (sb) {
      await sb.from("lockers").insert({
        verdict_id: saved.id,
        user_or_anon_key: combined,
        status: "watching",
        last_price: price,
      });
    }
  }

  await logEvent("verdict_run", {
    url: normalized,
    source: "engine",
    userKey: user ? "user" : "anon",
  });

  return NextResponse.json({ id: saved.id, verdict: saved, cached: false });
}
