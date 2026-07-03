import { NextRequest, NextResponse } from "next/server";
import { getVerdictById } from "@/lib/store";
import { runVerdict, verdictSchema } from "@/lib/verdict";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { id, text } = (await req.json()) as { id: string; text: string };
  if (!id || !text) return NextResponse.json({ error: "missing" }, { status: 400 });
  const prior = await getVerdictById(id);
  if (!prior) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const judged = await runVerdict({
    title: prior.title,
    price: prior.price,
    domain: prior.domain,
    localHour: new Date().getHours(),
    repeatCount: 0,
    meanness: prior.meanness as "mild" | "medium" | "merciless",
    isRebuttal: true,
    priorVerdict: {
      verdict: prior.verdict,
      grade: prior.grade,
      roast: prior.roast,
      card_line: prior.card_line || prior.roast.slice(0, 120),
      math: prior.math,
      swap: prior.swap,
      category: prior.category ?? "misc",
    },
    rebuttalText: text.slice(0, 400),
  });
  const check = verdictSchema.safeParse(judged);
  if (!check.success) return NextResponse.json({ error: "bad_json" }, { status: 502 });
  return NextResponse.json({ verdict: check.data });
}
