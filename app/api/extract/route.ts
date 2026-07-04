import { NextRequest, NextResponse } from "next/server";
import { extractProduct, normalizeUrl } from "@/lib/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Preview scrape used by the HomeForm before running the verdict.
// Returns whatever the extractor found (title, image, price, currency, domain).
// The client only shows a manual price field when price is null.
export async function POST(req: NextRequest) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return NextResponse.json({ error: "missing_url" }, { status: 400 });
  let normalized: string;
  try {
    normalized = normalizeUrl(url);
    new URL(normalized);
  } catch {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }
  const data = await extractProduct(normalized);
  return NextResponse.json({
    url: normalized,
    title: data.title,
    price: data.price,
    currency: data.currency,
    image: data.image,
    domain: data.domain,
  });
}
