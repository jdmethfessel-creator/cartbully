import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { supabaseService } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!stripeConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 400 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });
  const sb = supabaseService();
  const stripe = getStripe()!;

  let customerId: string | null = null;
  if (sb) {
    const { data } = await sb
      .from("subscribers")
      .select("stripe_customer_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    customerId = (data?.stripe_customer_id as string) || null;
  }
  if (!customerId) {
    const found = await stripe.customers.list({ email, limit: 1 });
    customerId = found.data[0]?.id ?? null;
  }
  if (!customerId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "";
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/account`,
  });
  return NextResponse.json({ url: portal.url });
}
