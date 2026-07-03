import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { extractProduct, normalizeUrl } from "@/lib/extractor";
import { runVerdict, verdictSchema, VerdictJson } from "@/lib/verdict";
import { findCachedVerdict, saveVerdict, repeatCountFor, logEvent } from "@/lib/store";
import { anonKey, mintAnonId } from "@/lib/anonId";
import { supabaseService } from "@/lib/supabase";
import { FREE_BEATDOWNS, MEANNESS_DEFAULT, Meanness } from "@/config";

export const runtime = "nodejs";

type Body = {
  url: string;
  meanness?: Meanness;
  userNote?: string;
  priceOverride?: number;
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

  const meanness: Meanness = body.meanness || MEANNESS_DEFAULT;
  const cached = await findCachedVerdict(normalized, meanness);
  const extracted = await extractProduct(normalized);

  const price = body.priceOverride ?? extracted.price;
  if (price == null) {
    return NextResponse.json(
      {
        error: "need_price",
        product: { title: extracted.title, image: extracted.image, domain: extracted.domain },
      },
      { status: 422 }
    );
  }

  // ensure anon cookie exists
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
  const { combined } = anonKey();

  if (cached) {
    await logEvent("verdict_run", { url: normalized, meanness, source: "cache" });
    return NextResponse.json({ id: cached.id, verdict: cached, cached: true });
  }

  // Server-side free-limit gate. Runs when Supabase is configured and the
  // caller is anonymous (no user:<uid> combined key). Cached repeats above
  // are always free, so this counts distinct fresh verdicts only.
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
      title: extracted.title,
      price,
      domain: extracted.domain,
      localHour,
      repeatCount,
      meanness,
      userNote: body.userNote ?? null,
    });
  } catch {
    judged = (await import("@/lib/verdict")).stubVerdict({
      title: extracted.title,
      price,
      domain: extracted.domain,
      localHour,
      repeatCount,
      meanness,
    });
  }

  const check = verdictSchema.safeParse(judged);
  if (!check.success) {
    return NextResponse.json({ error: "engine_bad_json" }, { status: 502 });
  }

  const saved = await saveVerdict({
    url: normalized,
    title: extracted.title,
    price,
    image: extracted.image,
    domain: extracted.domain,
    verdict: judged.verdict,
    grade: judged.grade,
    roast: judged.roast,
    math: judged.math,
    swap: judged.swap,
    category: judged.category,
    meanness,
    user_or_anon_key: combined,
    shareable: true,
  });

  // TRASHED items get stuffed in a locker so the price-watch cron can nag them later.
  if (judged.verdict === "TRASHED") {
    const { supabaseService } = await import("@/lib/supabase");
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

  await logEvent("verdict_run", { url: normalized, meanness, source: "engine" });

  return NextResponse.json({ id: saved.id, verdict: saved, cached: false });
}
