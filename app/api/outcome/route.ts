import { NextRequest, NextResponse } from "next/server";
import { setOutcome, type Outcome } from "@/lib/store";
import { reactionFor } from "@/lib/reactions";

export const runtime = "nodejs";

const ALLOWED: Outcome[] = ["walked_away", "took_swap", "bought_anyway"];

export async function POST(req: NextRequest) {
  const { id, outcome } = (await req.json().catch(() => ({}))) as {
    id?: string;
    outcome?: Outcome;
  };
  if (!id || !outcome || !ALLOWED.includes(outcome)) {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }
  const updated = await setOutcome(id, outcome);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    outcome,
    reaction: reactionFor(outcome as Exclude<Outcome, "unconfirmed">),
  });
}
