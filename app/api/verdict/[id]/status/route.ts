import { NextResponse } from "next/server";
import { getVerdictById } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const v = await getVerdictById(params.id);
  if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ id: v.id, outcome: v.outcome });
}
