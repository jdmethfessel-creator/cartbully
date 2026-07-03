import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { DETENTION_HOURS } from "@/config";
import { anonKey } from "@/lib/anonId";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { id } = (await req.json()) as { id: string };
  if (!id) return NextResponse.json({ error: "missing" }, { status: 400 });
  const sb = supabaseService();
  if (!sb) return NextResponse.json({ ok: true, note: "no-supabase" });
  const releaseAt = new Date(Date.now() + DETENTION_HOURS * 3600 * 1000).toISOString();
  const { combined } = anonKey();
  await sb.from("detentions").insert({
    verdict_id: id,
    user_or_anon_key: combined,
    release_at: releaseAt,
    created_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, release_at: releaseAt });
}
