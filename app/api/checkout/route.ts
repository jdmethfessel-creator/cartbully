import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { anonKey } from "@/lib/anonId";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  const { email } = (await req.json().catch(() => ({}))) as { email?: string | null };
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    `https://${req.headers.get("host")}`;

  const { combined } = anonKey();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${origin}/account?welcome=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/paywall?canceled=1`,
    customer_email: email || undefined,
    allow_promotion_codes: true,
    metadata: {
      app: "cartbully",
      anon_combined: combined || "",
    },
    subscription_data: {
      metadata: { app: "cartbully", anon_combined: combined || "" },
    },
  });
  return NextResponse.json({ url: session.url });
}
